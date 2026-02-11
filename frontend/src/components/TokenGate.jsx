import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// CONFIGURATION
const MONIKA_TOKEN_ADDRESS = "0x5BEa301626702C4A253D92Be06D36E86bB6b58b5";
const MIN_REQUIRED_TOKENS = 2000000; // How much $MONIKA they need to enter

// Minimal ABI to check balance (Standard ERC-20)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const TokenGate = ({ children }) => {
  const [hasAccess, setHasAccess] = useState(false);
  const [userBalance, setUserBalance] = useState(null); // Dedicated state for display
  const [loading, setLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    console.log("TokenGate Component Mounted");
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setErrorMsg("Please install MetaMask to access the terminal.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg("");

      // 1. Force Network Switch (Monad Mainnet)
      const MONAD_CHAIN_ID = '143'; // 143
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_CHAIN_ID }],
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: MONAD_CHAIN_ID,
                chainName: 'Monad Mainnet',
                nativeCurrency: {
                  name: 'Monad',
                  symbol: 'MON',
                  decimals: 18
                },
                rpcUrls: ['https://rpc.monad.xyz'],
                blockExplorerUrls: ['https://explorer.monad.xyz']
              }],
            });
          } catch (addError) {
            throw new Error("Failed to add Monad Mainnet.");
          }
        } else {
          // Some other error
          console.warn("Network switch error:", switchError);
        }
      }

      // 2. Connect Wallet
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);

      // 3. Check Balance
      const contract = new ethers.Contract(MONIKA_TOKEN_ADDRESS, ERC20_ABI, provider);

      // Get balance and decimals
      const rawBalance = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      const balance = parseFloat(ethers.formatUnits(rawBalance, decimals));

      setUserBalance(balance); // Update state for UI

      console.log(`Wallet: ${address} | Balance: ${balance} MONIKA`);

      if (balance >= MIN_REQUIRED_TOKENS) {
        setHasAccess(true);
      } else {
        setErrorMsg(`ACCESS DENIED. Requirement: ${MIN_REQUIRED_TOKENS.toLocaleString()}`);
      }

    } catch (err) {
      console.error(err);
      setErrorMsg("Connection Failed. Ensure MetaMask is on Monad Mainnet.");
    } finally {
      setLoading(false);
    }
  };

  // 5. Success State -> Render Children with Props
  if (hasAccess) {
    return React.cloneElement(children, {
      userAddress: walletAddress,
      handleConnect: connectWallet,
      handleDisconnect: () => {
        setHasAccess(false);
        setWalletAddress("");
      }
    });
  }

  // 6. Gate UI
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center h-screen bg-black text-white font-mono gap-6 overflow-hidden z-[100]">

      <div className="z-10 bg-[#0D1117] border border-gray-800 p-8 rounded-2xl flex flex-col items-center gap-4 shadow-2xl max-w-md w-full">
        <h1 className="text-2xl font-black text-green-500 tracking-tighter uppercase italic">TERMINAL ACCESS</h1>
        <p className="text-sm text-gray-500 text-center">
          Restricted Enviroment. $MONIKA Ownership Verification Required.
        </p>

        <div className="bg-black/40 p-4 rounded w-full border border-gray-800 text-xs">
          <div className="flex justify-between mb-1">
            <span className="text-gray-500">Requirement</span>
            <span className="text-green-400 font-bold">{MIN_REQUIRED_TOKENS.toLocaleString()} $MONIKA</span>
          </div>
          {userBalance !== null && (
            <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
              <span className="text-gray-500">Your Balance</span>
              <span className={`font-bold ${userBalance >= MIN_REQUIRED_TOKENS ? "text-green-400" : "text-red-400"}`}>
                {userBalance.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="text-red-400 text-xs bg-red-900/10 border border-red-900/30 p-2 rounded w-full text-center">
            {errorMsg}
          </div>
        )}

        <button
          onClick={connectWallet}
          disabled={loading}
          className="w-full py-3 bg-green-600 hover:bg-green-500 text-black font-bold rounded uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Verifying On-Chain..." : "Connect & Verify"}
        </button>
      </div>

      {/* Background FX */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
    </div>
  );
};

export default TokenGate;