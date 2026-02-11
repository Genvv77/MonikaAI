import { ethers } from 'ethers';
import { get, set } from './lib/kv.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Check if wallet already exists
        // In a real app, this would be keyed by User ID (req.user.id)
        const existingWallet = await get('AGENT_WALLET');

        if (existingWallet) {
            return res.status(200).json({
                success: true,
                address: existingWallet.address,
                message: "Existing wallet recovered."
            });
        }

        // 2. Generate New Wallet
        const wallet = ethers.Wallet.createRandom();

        // 3. Store Securely (Private Key stays on Server)
        const walletData = {
            address: wallet.address,
            privateKey: wallet.privateKey, // Encrypted in prod
            created: Date.now()
        };

        await set('AGENT_WALLET', walletData);

        // 4. Return Public Info Only
        res.status(200).json({
            success: true,
            address: wallet.address,
            message: "New secure agent identity created."
        });

    } catch (error) {
        console.error("Agent Init Error:", error);
        res.status(500).json({ error: "Failed to initialize agent." });
    }
}
