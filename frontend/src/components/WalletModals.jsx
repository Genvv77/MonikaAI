import React, { useState } from 'react';

export const WalletSetupModal = ({ onCreateWallet, onClose }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        setError('');

        const result = await onCreateWallet(password);
        setLoading(false);

        if (result.success) {
            onClose();
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0D1117] border-2 border-green-500/30 rounded-xl p-8 max-w-md w-full shadow-2xl">
                <h2 className="text-2xl font-black text-white mb-2">Create Trading Wallet</h2>
                <p className="text-sm text-gray-400 mb-6">
                    This will generate a new encrypted wallet for autonomous trading.
                    <span className="text-yellow-500 font-bold"> Never share your password.</span>
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-500 uppercase mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="Min. 8 characters"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 uppercase mb-2">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="Confirm password"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-900/20 border border-red-500/30 rounded p-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={handleCreate}
                            disabled={loading}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-black font-bold py-3 rounded uppercase transition-all disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Wallet'}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-3 rounded uppercase transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const UnlockModal = ({ onUnlock, onClose }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleUnlock = async () => {
        setLoading(true);
        setError('');

        const result = await onUnlock(password);
        setLoading(false);

        if (result.success) {
            onClose();
        } else {
            setError(result.error);
            setPassword('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0D1117] border-2 border-blue-500/30 rounded-xl p-8 max-w-md w-full shadow-2xl">
                <div className="text-center mb-6">
                    <div className="flex justify-center mb-6">
                        <svg className="w-16 h-16 text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">Wallet Locked</h2>
                    <p className="text-sm text-gray-400">Enter your password to unlock</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            className="w-full bg-black/50 border border-gray-700 rounded px-3 py-3 text-white text-center focus:outline-none focus:border-blue-500"
                            placeholder="Enter password"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="bg-red-900/20 border border-red-500/30 rounded p-3 text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleUnlock}
                        disabled={loading || !password}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded uppercase transition-all disabled:opacity-50"
                    >
                        {loading ? 'Unlocking...' : 'Unlock Wallet'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const DisclaimerModal = ({ onAccept }) => {
    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-[#0D1117] border-2 border-yellow-500/30 rounded-xl p-8 max-w-2xl w-full shadow-2xl">
                <div className="text-center mb-6">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-3xl font-black text-yellow-500 mb-2">SECURITY NOTICE</h2>
                </div>

                <div className="space-y-4 text-gray-300 text-sm mb-6">
                    <p className="bg-red-900/20 border border-red-500/30 rounded p-4 text-red-400">
                        <strong>This is a HOT WALLET running in your browser.</strong> Your private key is encrypted and stored locally.
                    </p>

                    <div className="space-y-2">
                        <h3 className="text-white font-bold">You understand that:</h3>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                            <li>This is an <strong>EXPERIMENTAL</strong> trading bot</li>
                            <li>Funds are <strong>YOUR RESPONSIBILITY</strong></li>
                            <li>You must <strong>BACKUP</strong> your private key securely</li>
                            <li>Browser storage can be cleared, causing <strong>PERMANENT LOSS</strong></li>
                            <li>Never use this with large amounts of capital</li>
                        </ul>
                    </div>

                    <p className="text-center text-xs text-gray-500 italic">
                        Only proceed if you accept full responsibility for all risks.
                    </p>
                </div>

                <button
                    onClick={onAccept}
                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-4 rounded uppercase text-lg transition-all"
                >
                    I Understand & Accept
                </button>
            </div>
        </div>
    );
};
