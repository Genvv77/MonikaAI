import React, { useState } from 'react';

export const SettingsModal = ({ onClose, onExportKey }) => {
    const [password, setPassword] = useState('');
    const [exportedKey, setExportedKey] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleExport = async () => {
        setLoading(true);
        setError('');

        const result = await onExportKey(password);
        setLoading(false);

        if (result.success) {
            setExportedKey(result.privateKey);
        } else {
            setError(result.error);
            setPassword('');
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(exportedKey);
        alert('Private key copied to clipboard!');
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0D1117] border-2 border-gray-700 rounded-xl p-8 max-w-lg w-full shadow-2xl">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-black text-white">Settings</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white text-2xl"
                    >
                        ×
                    </button>
                </div>

                {!exportedKey ? (
                    <>
                        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">⚠️</span>
                                <div className="text-sm text-yellow-400">
                                    <strong>WARNING:</strong> Never share your private key with anyone.
                                    Store it in a secure password manager. Anyone with this key has full access to your funds.
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 uppercase mb-2">
                                    Enter Password to Export Private Key
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleExport()}
                                    className="w-full bg-black/50 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                    placeholder="Enter your password"
                                />
                            </div>

                            {error && (
                                <div className="bg-red-900/20 border border-red-500/30 rounded p-3 text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleExport}
                                disabled={loading || !password}
                                className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 rounded uppercase transition-all disabled:opacity-50"
                            >
                                {loading ? 'Exporting...' : 'Export Private Key'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-green-900/20 border border-green-500/30 rounded p-4 mb-4">
                            <div className="text-xs text-gray-500 uppercase mb-2">Your Private Key</div>
                            <div className="bg-black/50 rounded p-3 break-all font-mono text-sm text-green-400">
                                {exportedKey}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={copyToClipboard}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded uppercase transition-all"
                            >
                                Copy to Clipboard
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-3 rounded uppercase transition-all"
                            >
                                Close
                            </button>
                        </div>

                        <p className="text-xs text-gray-500 text-center mt-4">
                            Make sure to store this securely before closing.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};
