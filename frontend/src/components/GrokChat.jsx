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
        { sender: 'monika', text: "I am Monika. I'm connected to the Neural Engine. Ask me to analyze the market structure." }
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
            const response = await fetch(BACKEND_URL, {
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
            responseText = `**HOW TO TRADE:**\n\n1. **Auto-Pilot:** Click "START ENGINE" and I will trade automatically based on my score.\n2. **Manual:** Click "FORCE BUY ${selectedSymbol.split('-')[0]}" to open a position immediately.`;
        }
        else if (lowerQuery.includes("knn") || lowerQuery.includes("algorithm")) {
            responseText = `**SYSTEM ARCHITECTURE:**\nI use a 3-layer stack:\n1. **KNN:** Pattern matching against 10,000 historical fractals.\n2. **RSI:** Momentum filtering.\n3. **Execution:** Direct contract calls to PancakeSwap V3 on Monad.`;
        }
        else {
            // 2. COGNITIVE LAYER
            const data = marketStats[selectedSymbol] || {};
            const symbol = selectedSymbol.split('-')[0];
            const aiData = neuralAnalysis['H1'] || { score: 50, status: 'NEUTRAL' };
            const rsi = rsiValues[selectedSymbol] || 50;

            // CONTEXT OBJECT
            const context = {
                symbol: symbol,
                price: data.price || 0,
                change: data.change || 0,
                rsi: rsi,
                aiScore: aiData.score,
                trend: aiData.status || 'NEUTRAL',
                balance: wallet.usdc || 0,
                positionCount: wallet.positions?.length || 0
            };

            const aiReply = await fetchAIResponse(userText, context);

            if (aiReply) {
                responseText = aiReply;
            } else {
                // 3. FALLBACK LAYER (If Backend is Down)
                responseText = `I am monitoring **${symbol}** ($${data.price}).\n\n- RSI: **${rsi}**\n- AI Score: **${aiData.score}**\n\n(Offline Mode).`;
            }
        }

        setIsTyping(false);
        setMessages(prev => [...prev, { sender: 'monika', text: responseText }]);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
            {/* CHAT UI SAME AS BEFORE */}
            {isOpen && (
                <div className="mb-4 w-80 h-96 bg-[#0A0E14] border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-200">
                    <div className="bg-[#161B22] p-3 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {/* GINGER AI ICON */}
                            <svg className="w-6 h-6 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" opacity="0.5" />
                                <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
                                <circle cx="9" cy="11" r="1.5" />
                                <circle cx="15" cy="11" r="1.5" />
                            </svg>
                            <span className="font-bold text-gray-200 text-sm tracking-wide">MONIKA <span className="text-gray-500 text-xs font-normal">/ GINGER AGENT</span></span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0D1117]">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg p-2 text-xs leading-relaxed whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1C2128] text-gray-300 border border-gray-700 rounded-bl-none'}`}>
                                    {formatMessage(msg.text)}
                                </div>
                            </div>
                        ))}
                        {isTyping && <div className="text-gray-500 text-xs ml-2">Analyzing...</div>}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSend} className="p-3 bg-[#161B22] border-t border-gray-800 flex gap-2">
                        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Monika..." className="flex-1 bg-[#0D1117] border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-600" />
                        <button type="submit" className="bg-white text-black p-2 rounded-md hover:bg-gray-200 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                        </button>
                    </form>
                </div>
            )}
            <button onClick={() => setIsOpen(!isOpen)} className={`group flex items-center gap-3 p-4 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-300 ${isOpen ? 'bg-gray-800 rotate-90 scale-0' : 'bg-white hover:scale-110 scale-100'}`}>
                <div className="relative w-6 h-6"><div className="absolute inset-0 bg-black rounded-md transform rotate-6 group-hover:rotate-45 hover:purple-500 transition-transform"></div><div className="absolute inset-0 flex items-center justify-center text-white font-black text-[10px]">AI</div></div>
            </button>
            {isOpen && <button onClick={() => setIsOpen(false)} className="absolute bottom-0 right-0 w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-white shadow-lg border border-gray-600 hover:bg-gray-700 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>}
        </div>
    );
};
export default GrokChat;