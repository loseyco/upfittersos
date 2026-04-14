import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { ScanLine, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const BarcodeScanner = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [scannedId, setScannedId] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Audio feedback for successful scan
    const playSuccessBeep = () => {
        try {
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.type = 'sine';
            oscillator.frequency.value = 880; // High pitch
            gain.gain.value = 0.1; // Soft volume
            oscillator.start();
            setTimeout(() => oscillator.stop(), 100);
        } catch (e) {
            console.log("AudioContext blocked.");
        }
    };

    const handleDecode = async (result: string) => {
        if (isResolving || scannedId) return; // Prevent double firing
        
        playSuccessBeep();
        setScannedId(result);
        setIsResolving(true);
        setError(null);

        try {
            const token = await currentUser?.getIdToken();
            const response = await fetch(`https://api-saegrp.web.app/scan/${encodeURIComponent(result)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errData = await response.json();
                
                // Front Office Workflow: The sticker is blank! Let them register it.
                if (errData.error === 'QR Code not mapped to any physical asset.') {
                    navigate(`/workspace/register-qr/${encodeURIComponent(result)}`);
                    return;
                }

                throw new Error(errData.error || 'Failed to map QR code.');
            }

            const payload = await response.json();
            
            // Contextual Routing
            if (payload.entityType === 'vehicle') {
                navigate(`/workspace/units/${payload.entityId}`);
            } else if (payload.entityType === 'inventory') {
                navigate(`/workspace/inventory/${payload.entityId}`);
            } else if (payload.entityType === 'work_order') {
                navigate(`/workspace/work-orders/${payload.entityId}`);
            } else {
                setError(`Unsupported asset type: ${payload.entityType}`);
                setIsResolving(false);
            }

        } catch (err: any) {
            setError(err.message || "Failed to resolve physical asset.");
            setIsResolving(false);
            
            // Auto reset the scanner after an error
            setTimeout(() => {
                setScannedId(null);
                setError(null);
            }, 3000);
        }
    };

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
            
            {/* Header */}
            <div className="absolute top-8 left-0 right-0 flex justify-center z-50">
                <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
                    <ScanLine className="w-5 h-5 text-accent" />
                    <h1 className="text-white font-bold tracking-tight">Universal Asset Scanner</h1>
                </div>
            </div>

            {/* Viewfinder */}
            <div className="relative w-full max-w-md aspect-square rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.05)] border-2 border-zinc-800">
                {!isResolving && !scannedId ? (
                    <Scanner
                        onScan={(detectedCodes: IDetectedBarcode[]) => {
                            if (detectedCodes.length > 0) {
                                handleDecode(detectedCodes[0].rawValue);
                            }
                        }}
                        onError={(error: unknown) => console.log(error)}
                        paused={isResolving || !!scannedId}
                    />
                ) : (
                    <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center">
                        <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
                        <h2 className="text-white text-xl font-bold">Resolving Asset...</h2>
                        <p className="text-zinc-400 font-mono text-xs mt-2">{scannedId}</p>
                    </div>
                )}
            </div>

            {/* Status Messages */}
            {error && (
                <div className="mt-8 bg-red-500/10 border border-red-500/20 px-6 py-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
                    <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Cancel Button */}
            <button 
                onClick={() => navigate('/dashboard')}
                className="absolute bottom-12 w-14 h-14 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-all text-white/50 hover:text-white"
            >
                <XCircle className="w-6 h-6" />
            </button>
        </div>
    );
};
