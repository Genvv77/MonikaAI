import React, { useState, useRef, useEffect } from 'react';

// SECURE & DYNAMIC BACKEND URL
const BASE_URL = import.meta.env.DEV
    ? "http://localhost:3000"
    : "https://monikaai-production.up.railway.app";

const GrokChat = ({ marketStats, selectedSymbol, wallet, neuralAnalysis, rsiValues }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([
        { sender: 'monika', text: "Hi! I'm Monika. Ask me anything." }
    ]);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
    useEffect(() => { scrollToBottom(); }, [messages, isOpen]);

    const formatMessage = (text) => {
        if (!text) return "";
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="text-white font-bold">{part.slice(2, -2)}</strong>;
            return <span key={index}>{part}</span>;
        });
    };

    // --- SECURE BACKEND CALL ---
    const fetchAIResponse = async (query, contextData) => {
        try {
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, context: contextData })
            });

            if (!response.ok) throw new Error("Backend Error");
            const data = await response.json();
            return data.reply;
        } catch (error) {
            console.error("Secure Agent Error:", error);
            return null; // Triggers fallback logic
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userText = input;
        setMessages(prev => [...prev, { sender: 'user', text: userText }]);
        setInput("");
        setIsTyping(true);

        const lowerQuery = userText.toLowerCase();
        let responseText = "";

        // 1. REFLEX LAYER (Instant UI Help - No API Cost)
        if (lowerQuery.includes("how to buy") || lowerQuery.includes("how to trade")) {
            responseText = `**HOW TO TRADE:**\n\n1. **Auto-Pilot:** Click "START ENGINE" and I will trade automatically based on my Dual-Brain analysis.\n2. **Manual:** Click "FORCE BUY ${selectedSymbol.split('-')[0]}" to open a position immediately.\n\nThe engine enters when my Neural Score > 52 or when the Left Brain detects a PUMP signal at 60%+ confidence.`;
        }
        else if (lowerQuery.includes("knn") || lowerQuery.includes("algorithm") || lowerQuery.includes("architecture") || lowerQuery.includes("how do you work")) {
            responseText = `**DUAL-BRAIN ARCHITECTURE:**\n1. **Left Brain (monika.onnx):** Neural pattern recognition trained on historical price data. Outputs PUMP/DUMP/FLAT prediction with confidence.\n2. **Right Brain (MicroGPT):** LLM situational awareness — reads Fear & Greed Index + live crypto news to generate contextual reasoning.\n3. **Market Structure:** Composite scores (SMA position + RSI + momentum) per timeframe.\n4. **Execution:** Direct contract calls to PancakeSwap V3 on Monad.`;
        }
        else {
            // 2. COGNITIVE LAYER — Full Dual Brain context
            const activeData = marketStats[selectedSymbol] || {};
            const symbol = selectedSymbol.split('-')[0];

            // Build cross-market overview (all symbols)
            const allSymbols = Object.entries(marketStats).map(([sym, d]) => ({
                symbol: sym.replace('-USD', ''),
                price: d.price || 0,
                score: d.score || 50,
                signal: d.signal || 'HOLD',
                aiOpinion: d.aiOpinion || 'NEUTRAL',
                aiConfidence: d.aiConfidence || 0,
                aiReasoning: d.aiReasoning || '',
                structure: d.details || {},
            }));

            // FULL CONTEXT OBJECT
            const context = {
                activeSymbol: symbol,
                price: activeData.price || 0,
                score: activeData.score || 50,
                signal: activeData.signal || 'HOLD',
                aiOpinion: activeData.aiOpinion || 'NEUTRAL',
                aiConfidence: activeData.aiConfidence || 0,
                aiReasoning: activeData.aiReasoning || '',
                rsi: activeData.details?.rsi || rsiValues[selectedSymbol] || 50,
                trend: activeData.details?.trend || 'neutral',
                macro: activeData.details?.macro || 'NEUTRAL',
                structH1: activeData.details?.h1 || 50,
                structH4: activeData.details?.h4 || 50,
                structD1: activeData.details?.d1 || 50,
                balance: wallet.usdc || 0,
                positionCount: wallet.positions?.length || 0,
                positions: (wallet.positions || []).map(p => ({ symbol: p.symbol, size: p.size, entry: p.entryPrice })),
                crossMarket: allSymbols,
            };

            const aiReply = await fetchAIResponse(userText, context);

            if (aiReply) {
                responseText = aiReply;
            } else {
                // 3. FALLBACK LAYER (If Backend is Down)
                responseText = `I am monitoring **${symbol}** ($${activeData.price}).\n\n- Score: **${activeData.score?.toFixed(1)}** | Signal: **${activeData.signal}**\n- Left Brain: **${activeData.aiOpinion}** (${activeData.aiConfidence}%)\n- Right Brain: ${activeData.aiReasoning || 'Offline'}\n- RSI: **${context.rsi?.toFixed?.(0) || context.rsi}** | Macro: **${context.macro}**\n\n(Offline Mode).`;
            }
        }

        setIsTyping(false);
        setMessages(prev => [...prev, { sender: 'monika', text: responseText }]);
    };

    return (
        <>
            {/* Spectacular Full-Screen Blur Backdrop */}
            <div
                className={`fixed inset-0 z-[60] bg-[#00000099] backdrop-blur-[12px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
                onClick={() => setIsOpen(false)}
            />

            {/* Chat Panel */}
            <div className={`fixed bottom-24 right-6 z-[70] w-80 h-[450px] bg-[#0A0E14]/90 backdrop-blur-2xl border border-gray-700/50 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden origin-bottom-right transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100 translate-y-0 translate-x-0' : 'opacity-0 scale-50 translate-y-10 translate-x-10 pointer-events-none'}`}>
                <div className="bg-[#161B22]/80 backdrop-blur-md p-3 border-b border-gray-800/50 flex justify-between items-center z-10">
                    <div className="flex items-center gap-2">
                        {/* GINGER AI ICON */}
                        <img src="/icon.png" alt="Monika Profile" className="w-6 h-6 rounded-full object-cover border border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.3)]" />
                        <span className="font-bold text-gray-200 text-sm tracking-wide">MONIKA <span className="text-gray-500 text-[10px] font-normal tracking-wider"></span></span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-[#0D1117]/80 to-[#05070a]/90 relative z-0">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`max-w-[85%] rounded-xl p-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-md ${msg.sender === 'user' ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-sm' : 'bg-[#1C2128]/90 backdrop-blur border border-gray-700/50 text-gray-200 rounded-bl-sm'}`}>
                                {formatMessage(msg.text)}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                            <div className="bg-[#1C2128]/90 text-gray-400 text-[10px] rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-1 border border-gray-700/50">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSend} className="p-3 bg-[#161B22]/90 backdrop-blur-md border-t border-gray-800/50 flex gap-2 z-10">
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Monika..." className="flex-1 bg-[#05070A] border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600 shadow-inner" />
                    <button type="submit" className="bg-white text-black p-2 rounded-lg hover:bg-blue-400 hover:text-white hover:shadow-[0_0_15px_rgba(96,165,250,0.5)] transition-all duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                    </button>
                </form>
            </div>

            {/* AI Floating Action Button */}
            <div className={`fixed bottom-6 right-6 z-[70] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-0 scale-50 rotate-90 pointer-events-none' : 'opacity-100 scale-100 rotate-0'}`}>
                <button onClick={() => setIsOpen(true)} className={`group flex items-center gap-3 p-4 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-110 transition-all duration-300`}>
                    <div className="relative w-6 h-6">
                        <div className="absolute inset-0 bg-black rounded-md transform rotate-6 group-hover:rotate-45 group-hover:bg-purple-800 transition-transform duration-300"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-white font-black text-[10px]">M</div>
                    </div>
                </button>
            </div>

            {/* Glowing Close Button (Appears when chat is open) */}
            <div className={`fixed bottom-6 right-6 z-[70] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90 pointer-events-none'}`}>
                <button onClick={() => setIsOpen(false)} className="w-14 h-14 bg-[#161B22] rounded-full flex items-center justify-center text-gray-400 shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-gray-700 hover:bg-gray-800 hover:text-white hover:border-red-500/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:scale-110 transition-all duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>
        </>
    );
};
export default GrokChat;