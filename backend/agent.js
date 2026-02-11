import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

// --- CONFIGURATION ---
const RPC_URL = process.env.RPC_URL || "https://rpc.monad.xyz";
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

// --- INITIALIZATION ---
let provider;
let wallet;

try {
    if (PRIVATE_KEY) {
        provider = new ethers.JsonRpcProvider(RPC_URL);
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`AGENT ACTIVE: Wallet ${wallet.address.substring(0, 6)}... connected.`);
    } else {
        console.log("AGENT WARNING: No Private Key found. Read-only mode.");
    }
} catch (e) {
    console.error("AGENT ERROR:", e);
}

// --- FUNCTIONS ---

// 1. Check Balance (Monad)
export const getBalance = async () => {
    if (!wallet) return "I don't have a wallet connected yet!";
    try {
        const balance = await provider.getBalance(wallet.address);
        const formatted = ethers.formatEther(balance);
        return `My current balance is ${parseFloat(formatted).toFixed(4)} MON.`;
    } catch (error) {
        console.error(error);
        return "I couldn't check the blockchain. Network might be down.";
    }
};

// 2. Simple Transfer (Send Token)
// Usage: "Send 0.1 MON to 0x..."
export const sendToken = async (toAddress, amount) => {
    if (!wallet) return "I need a private key to send money!";
    try {
        const tx = await wallet.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(amount.toString())
        });
        return `Transaction sent! Hash: ${tx.hash}`;
    } catch (error) {
        return `Failed to send transaction: ${error.message}`;
    }
};

// 3. (Placeholder) Swap Token
// This requires the Router Contract Address for the specific chain
export const swapToken = async (tokenIn, amount) => {
    // We will build this next once we confirm Balance works
    return "I am ready to swap, but I need the DEX Router address first.";
};