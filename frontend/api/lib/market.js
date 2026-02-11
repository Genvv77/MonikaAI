// api/lib/market.js
const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price";

// Map our pairs to CoinGecko IDs
const ASSET_MAP = {
    "BTC-USD": "bitcoin",
    "ETH-USD": "ethereum",
    "SOL-USD": "solana",
    "DOGE-USD": "dogecoin",
    "XRP-USD": "ripple",
    "BNB-USD": "binancecoin",
    "ADA-USD": "cardano",
    "MON-USD": "monad"
};

/**
 * Fetch current price using CoinGecko (Server Side - No CORS)
 */
export const getPrice = async (symbol) => {
    try {
        const id = ASSET_MAP[symbol];
        if (!id) return null;

        const res = await fetch(`${COINGECKO_API}?ids=${id}&vs_currencies=usd`);
        if (!res.ok) throw new Error("CoinGecko Error");

        const data = await res.json();
        const price = data[id]?.usd;

        if (!price) return null;

        return parseFloat(price);
    } catch (e) {
        console.warn(`[Market-Server] Error ${symbol}:`, e.message);
        return null;
    }
};

export const calculateRSI = async (symbol) => {
    // Return dummy RSI for now or implement complex logic
    // Keeping it simple to avoid rate limits on historical data
    return 50;
};
