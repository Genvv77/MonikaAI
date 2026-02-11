import React from 'react';

const DetailedPositionsTable = ({ positions, marketStats = {}, botActive = false, onClosePosition, onRowClick }) => {

    // HELPER: Anti-NaN Formatter
    const formatNum = (val, decimals = 2) => {
        const num = parseFloat(val);
        if (isNaN(num)) return "0.00";
        return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

    // EMPTY STATE LOGIC
    if (!positions || positions.length === 0) {
        if (!botActive) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                    <div className="w-12 h-12 border-2 border-dashed border-yellow-500/20 rounded-full flex items-center justify-center animate-[spin_10s_linear_infinite]">
                        <div className="w-1.5 h-1.5 bg-yellow-500/50 rounded-full"></div>
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-yellow-500/40">Engine Standby</p>
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 relative overflow-hidden">
                <div className="w-12 h-12 border border-green-500/20 rounded-full flex items-center justify-center relative">
                    <div className="w-full h-0.5 bg-green-500/40 absolute animate-[spin_3s_linear_infinite]"></div>
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-green-500/60 animate-pulse">Scanning...</p>
            </div>
        );
    }

    // MODERN CLEAN TABLE UI
    return (
        <div className="w-full h-full overflow-hidden flex flex-col bg-[#0b0f19]">
            {/* Header Row */}
            <div className="grid grid-cols-8 gap-2 px-4 py-2 border-b border-gray-800 text-[9px] font-bold text-gray-500 uppercase tracking-wider bg-[#0A0E14]">
                <div className="col-span-1 text-center">Symbol</div>
                <div className="col-span-1 text-right">Value (Margin)</div>
                <div className="col-span-1 text-right">Entry</div>
                <div className="col-span-1 text-right">Mark</div>
                <div className="col-span-1 text-right">PnL</div>
                <div className="col-span-1 text-right text-blue-400">Next DCA</div>
                <div className="col-span-1 text-center">Targets</div>
                <div className="col-span-1 text-center">Action</div>
            </div>

            {/* Rows Container */}
            <div className="flex-1 overflow-y-auto">
                {positions.map((pos, idx) => {
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

                    // Strategy Levels
                    const tpPrice = entry * 1.05;
                    const slPrice = entry * 0.85;
                    const dcaPrice = entry * 0.95;

                    return (
                        <div
                            key={idx}
                            onClick={() => onRowClick && onRowClick(pos.symbol)}
                            className="grid grid-cols-8 gap-2 px-4 py-3 border-b border-gray-800/50 hover:bg-white/5 items-center text-xs font-mono transition-colors group cursor-pointer"
                        >

                            {/* Symbol */}
                            <div className="col-span-1 flex items-center justify-center gap-2">
                                <span className="font-bold text-gray-200">{pos.symbol.split('-')[0]}</span>
                            </div>

                            {/* Value ($) */}
                            <div className="col-span-1 text-right text-gray-300 font-medium">
                                ${formatNum(costBasis, 2)}
                                <span className="block text-[8px] text-gray-600 dark:text-gray-500 font-normal">{formatNum(size, 4)} {pos.symbol.split('-')[0]}</span>
                            </div>

                            {/* Entry */}
                            <div className="col-span-1 text-right text-gray-500">
                                ${formatNum(entry, 4)}
                            </div>

                            {/* Mark Price */}
                            <div className="col-span-1 text-right text-gray-300 font-bold">
                                ${formatNum(currentPrice, 4)}
                            </div>

                            {/* PnL */}
                            <div className={`col-span-1 text-right font-bold ${pnlColor}`}>
                                {isWin ? '+' : ''}{formatNum(pnlRaw, 3)}%
                            </div>

                            {/* Next DCA (Blue) */}
                            <div className="col-span-1 text-right text-blue-400/80 font-medium">
                                ${formatNum(dcaPrice, 4)}
                            </div>

                            {/* Targets */}
                            <div className="col-span-1 flex flex-col items-center gap-0.5 text-[9px] leading-tight opacity-80">
                                <span className="text-green-500">TP: ${formatNum(tpPrice, 4)}</span>
                                <span className="text-red-500">SL: ${formatNum(slPrice, 4)}</span>
                            </div>

                            {/* Action Button */}
                            <div className="col-span-1 text-center">
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
                })}
            </div>
        </div>
    );
};

export default DetailedPositionsTable;
