import React from 'react';

const DetailedPositionsTable = ({ positions, marketStats = {}, botActive = false, onClosePosition, onRowClick }) => {

    // HELPER: Anti-NaN Formatter
    // HELPER: Adaptive Number Formatting
    const formatNum = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return "0.00";
        if (num === 0) return "0.00";
        const abs = Math.abs(num);
        if (abs >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        if (abs >= 1) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    };

    // MODERN CLEAN TABLE UI
    return (
        <div className="w-full h-full overflow-hidden flex flex-col ">
            {/* Header Row */}
            <div className="grid grid-cols-[0.8fr_1.2fr_1fr_1fr_0.8fr_1fr_1.2fr_0.6fr] gap-2 px-4 py-2 border-b border-gray-800 text-[9px] font-bold text-gray-500 uppercase tracking-wider bg-[#0A0E14]">
                <div className="col-span-1 text-center">Symbol</div>
                <div className="col-span-1 text-right">Value (Margin)</div>
                <div className="col-span-1 text-right">Entry</div>
                <div className="col-span-1 text-right">Mark</div>
                <div className="col-span-1 text-right">PnL</div>
                <div className="col-span-1 text-center text-blue-400">Next DCA</div>
                <div className="col-span-1 text-center">Targets</div>
                <div className="col-span-1 text-center">Action</div>
            </div>

            {/* Rows Container */}
            <div className="flex-1 overflow-y-auto">
                {(!positions || positions.length === 0) ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 relative overflow-hidden">
                        {!botActive ? (
                            <>
                                <div className="w-12 h-12 border-2 border-dashed border-yellow-500/20 rounded-full flex items-center justify-center animate-[spin_10s_linear_infinite]">
                                    <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                                </div>
                                <p className="text-[10px] font-mono uppercase tracking-widest text-yellow-500/40">Engine Standby</p>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 border border-green-500/20 rounded-full flex items-center justify-center relative">
                                    <div className="w-full h-0.5 bg-green-500/40 absolute animate-[spin_3s_linear_infinite]"></div>
                                </div>
                                <p className="text-[10px] font-mono uppercase tracking-widest text-green-500/60 animate-pulse">Scanning...</p>
                            </>
                        )}
                    </div>
                ) : (
                    positions.map((pos, idx) => {
                        // Safe Data Extraction
                        const entry = parseFloat(pos.entry) || 0;
                        const size = parseFloat(pos.size) || 0;

                        // Cost Basis (How much $ was used)
                        const costBasis = size * entry;

                        // PnL Logic: Prioritize Market Price
                        let currentPrice = parseFloat(marketStats[pos.symbol]?.price);
                        // Use Entry if live price missing
                        if (!currentPrice || isNaN(currentPrice)) currentPrice = entry;

                        // PnL Calc
                        const pnlRaw = entry > 0 ? ((currentPrice - entry) / entry) * 100 : 0;
                        const isWin = pnlRaw >= 0;
                        const pnlColor = isWin ? 'text-green-400' : 'text-red-400';

                        // Strategy Levels from Fibonacci Plan
                        const fib = pos.fibPlan;
                        const tpPrice = fib?.tp || entry * 1.05;
                        const slPrice = fib?.sl || entry * 0.85;
                        const dcaPrice = fib?.dca1 || entry * 0.95;
                        const dca2Price = fib?.dca2 || entry * 0.90;

                        return (
                            <div
                                key={idx}
                                onClick={() => onRowClick && onRowClick(pos.symbol)}
                                className="grid grid-cols-[0.8fr_1.2fr_1fr_1fr_0.8fr_1fr_1.2fr_0.6fr] gap-2 px-4 py-3 border-b border-gray-800/50 hover:bg-white/5 items-center text-xs font-mono transition-colors group cursor-pointer"
                            >

                                {/* Symbol */}
                                <div className="col-span-1 flex items-center justify-center gap-2">
                                    <span className="font-bold text-gray-200">{pos.symbol.split('-')[0]}</span>
                                </div>

                                {/* Value ($) */}
                                <div className="col-span-1 text-right text-gray-300 font-medium truncate">
                                    ${formatNum(costBasis)}
                                    <span className="block text-[8px] text-gray-600 dark:text-gray-500 font-normal truncate">{formatNum(size)} {pos.symbol.split('-')[0]}</span>
                                </div>

                                {/* Entry */}
                                <div className="col-span-1 text-right text-gray-500">
                                    ${formatNum(entry)}
                                </div>

                                {/* Mark Price */}
                                <div className="col-span-1 text-right text-gray-300 font-bold truncate">
                                    ${formatNum(currentPrice)}
                                </div>

                                {/* PnL */}
                                <div className={`col-span-1 text-right font-bold ${pnlColor}`}>
                                    {isWin ? '+' : ''}{pnlRaw.toFixed(2)}%
                                </div>

                                {/* Next DCA (Blue) */}
                                <div className="col-span-1 text-center text-blue-400/80 font-medium">
                                    ${formatNum(dcaPrice)}
                                </div>

                                {/* Targets */}
                                <div className="col-span-1 flex flex-col items-center justify-center gap-0.5 text-[9px] leading-tight opacity-80">
                                    <span className="text-green-500">TP: ${formatNum(tpPrice)}</span>
                                    <span className="text-red-500">SL: ${formatNum(slPrice)}</span>
                                    <span className="text-blue-400/80">DCA1: ${formatNum(dcaPrice)}</span>
                                    <span className="text-blue-400/60">DCA2: ${formatNum(dca2Price)}</span>
                                </div>

                                {/* Action Button */}
                                <div className="col-span-1 flex items-center justify-center">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevents row click
                                            onClosePosition && onClosePosition(pos.symbol);
                                        }}
                                        className="px-2 py-1 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-500/30 rounded text-[9px] uppercase tracking-wide transition-all"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        );
                    }))}
            </div>
        </div>
    );
};

export default DetailedPositionsTable;
