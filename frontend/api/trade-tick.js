import { get, set } from './lib/kv.js';
import { getPrice, calculateRSI } from './lib/market.js';

export default async function handler(req, res) {
    const timestamp = new Date().toLocaleTimeString();
    const logs = [];
    const updates = [];

    // 1. Fetch Persistent State (Portfolio & Wallet)
    let positions = await get('PORTFOLIO') || [];
    const dbWallet = await get('AGENT_WALLET');

    // 2. Define Market Universe
    const markets = ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD"];

    // 3. The Execution Loop
    for (const pair of markets) {
        // A. Fetch Real Data
        const price = await getPrice(pair);
        const rsi = await calculateRSI(pair);

        if (!price) continue; // Skip if data fetch failed

        let action = "IDLE";
        let neuralScore = 0; // Visual score based on RSI (-10 to +10)

        // Map RSI to Neural Score for UI
        // RSI 30 -> Score 8 (Strong Buy)
        // RSI 70 -> Score -8 (Strong Sell)
        neuralScore = Math.round((50 - rsi) / 2.5);

        // B. Analyze Strategy
        const existingPosIndex = positions.findIndex(p => p.symbol === pair);
        const existingPos = existingPosIndex > -1 ? positions[existingPosIndex] : null;

        // --- STRATEGY: RSI Mean Reversion + DCA ---

        // CASE 1: BUY SIGNAL (Oversold)
        if (rsi < 35 && !existingPos) {
            action = "BUY";
            logs.push(`[${timestamp}] SIGNAL: ${pair} Oversold (RSI ${rsi}). Opening Long @ $${price}`);
            positions.push({
                symbol: pair,
                type: "LONG",
                entryPrice: price,
                size: "0.1", // Standard lot
                amount: price * 0.1,
                timestamp: Date.now()
            });
        }

        // CASE 2: SELL SIGNAL (Overbought / Take Profit)
        else if (existingPos && (rsi > 65 || (price > existingPos.entryPrice * 1.05))) {
            // Sell if RSI is hot OR we have >5% profit
            action = "SELL";
            const profit = ((price - existingPos.entryPrice) * parseFloat(existingPos.size)).toFixed(2);
            logs.push(`[${timestamp}] SIGNAL: ${pair} Take Profit (RSI ${rsi}). PnL: +$${profit}`);

            // Remove position
            positions.splice(existingPosIndex, 1);
        }

        // CASE 3: DCA (Dollar Cost Averaging)
        // Buy more if price drops 5% below entry to lower average cost
        else if (existingPos && price < existingPos.entryPrice * 0.95) {
            action = "DCA";
            logs.push(`[${timestamp}] DEFENSE: ${pair} dipped 5%. Triggering DCA Buy @ $${price}`);

            // Update Position: Double Size, Weighted Average Entry
            const oldSize = parseFloat(existingPos.size);
            const addedSize = 0.1;
            const newSize = oldSize + addedSize;

            // New Avg Price = ((OldPrice * OldSize) + (NewPrice * NewSize)) / TotalSize
            const weightedAvg = ((existingPos.entryPrice * oldSize) + (price * addedSize)) / newSize;

            positions[existingPosIndex] = {
                ...existingPos,
                entryPrice: parseFloat(weightedAvg.toFixed(2)),
                size: newSize.toFixed(2),
                amount: newSize * weightedAvg
            };
        }
        // UPDATE UI STATE
        updates.push({
            symbol: pair,
            price: price ? price.toFixed(2) : "0.00",
            neuralScore: neuralScore,
            action: action,
            rsi: rsi // Pass RSI to UI if needed
        });
    }

    // 4. Calculate PnL for Active Positions
    let totalPnL = 0;
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const currentPrice = updates.find(u => u.symbol === p.symbol)?.price || p.entryPrice;

        const pnl = (currentPrice - p.entryPrice) * parseFloat(p.size);
        positions[i].pnl = pnl.toFixed(2);
        positions[i].pnlPercent = ((pnl / (p.entryPrice * parseFloat(p.size))) * 100).toFixed(2);
        positions[i].currentPrice = currentPrice;

        totalPnL += pnl;
    }

    // 5. Persist State
    await set('PORTFOLIO', positions);

    // 6. Response
    const dbWalletState = await get('AGENT_WALLET');
    const agentWallet = {
        address: dbWalletState ? dbWalletState.address : null,
        balance: {
            eth: "9.85", // Simulated gas usage
            usdt: dbWalletState ? (100 + totalPnL).toFixed(2) : "0.00" // Update USDT with PnL
        },
        status: dbWalletState ? "ACTIVE" : "NOT_INITIALIZED"
    };

    res.status(200).json({
        success: true,
        logs,
        trades: updates,
        portfolio: positions,
        stats: {
            totalPnL: totalPnL.toFixed(2),
            activeThreads: positions.length,
        },
        agentWallet: agentWallet
    });
}
