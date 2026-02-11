const NeuralLevels = ({ tiles }) => {
    // MAPPING FIX: 
    // Input is Score (0-100). Center is 50.
    // Score > 50 = Long (Blue). Strength derived from (Score - 50).
    // Score < 50 = Short (Orange). Strength derived from (50 - Score).

    return (
        <div className="bg-[#0D1117] border border-gray-800 rounded-xl p-3 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-1 border-b border-gray-800/50 pb-1">
                <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest">Neural Levels</h3>
                <span className="text-[9px] text-gray-500 font-mono">Real-time</span>
            </div>

            <div className="text-[9px] text-gray-500 mb-1 flex gap-3">
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Long</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-500 rounded-full"></div> Short</span>
            </div>

            <div className="grid grid-cols-4 md:grid-cols-6 gap-2 flex-1 content-start overflow-y-auto pr-1 custom-scrollbar">
                {tiles.map((tile, i) => {
                    const score = tile.score || 50; // Use 'score' from backend
                    const diff = score - 50;
                    const isLong = diff >= 0;

                    // Map diff (0 to 50) to Bars (0 to 7)
                    // Every ~7 points of score deviation = 1 Bar
                    const bars = Math.min(7, Math.ceil(Math.abs(diff) / 7));

                    return (
                        <div key={i} className="bg-[#161b22] border border-gray-800 p-1.5 rounded flex flex-col items-center gap-1 group hover:border-blue-500/30 transition-colors">
                            <span className="font-bold text-[10px] text-white">{tile.pair.split('-')[0]}</span>

                            <div className="flex gap-0.5 h-12 items-end bg-black/40 p-0.5 rounded w-full justify-center">
                                {/* LEFT: LONG (Blue) */}
                                {isLong && (
                                    <div className="flex flex-col-reverse gap-0.5 h-full w-3">
                                        {[...Array(7)].map((_, b) => (
                                            <div key={b} className={`w-full h-1.5 rounded-sm ${b < bars ? "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]" : "bg-gray-800/30"}`}></div>
                                        ))}
                                    </div>
                                )}
                                {/* RIGHT: SHORT (Orange) */}
                                {!isLong && (
                                    <div className="flex flex-col-reverse gap-0.5 h-full w-3">
                                        {[...Array(7)].map((_, b) => (
                                            <div key={b} className={`w-full h-1.5 rounded-sm ${b < bars ? "bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]" : "bg-gray-800/30"}`}></div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="text-[9px] font-mono text-gray-400 whitespace-nowrap">
                                {isLong ? `L:${bars}` : `S:${bars}`}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default NeuralLevels;
