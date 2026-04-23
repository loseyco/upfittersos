import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';

interface VinScannerModalProps {
    onClose: () => void;
    onScan: (vin: string, imageBlob?: Blob) => void;
    title?: string;
    description?: string;
    isQrMode?: boolean;
}

export function VinScannerModal({ onClose, onScan, title, description, isQrMode }: VinScannerModalProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const hasInitialized = useRef(false);
    const hasHandledScan = useRef(false);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const startScanner = async () => {
            try {
                scannerRef.current = new Html5Qrcode("reader", {
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.QR_CODE,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.UPC_A
                    ],
                    verbose: false
                });
                const config = { 
                    fps: 30,
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true
                    }
                };

                const handleScanSuccess = (decodedText: string) => {
                    // Software-layer payload rejection
                    if (!isQrMode) {
                        const isProprietaryTag = decodedText.includes('/qr/');
                        if (!isProprietaryTag && (decodedText.toLowerCase().includes('http') || decodedText.length > 25)) {
                            toast.error(`Ignored unsupported QR code payload.`, { id: 'unsupported-format' });
                            return;
                        }
                    }

                    if (decodedText.length >= 5 && !hasHandledScan.current) {
                        hasHandledScan.current = true;
                        
                        const cleanupAndClose = async () => {
                            if (scannerRef.current) {
                                try {
                                    if (scannerRef.current.isScanning) {
                                        await scannerRef.current.stop();
                                    }
                                    scannerRef.current.clear();
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                            onClose();
                        };

                        const videoElement = document.querySelector('#reader video') as HTMLVideoElement;
                        if (videoElement) {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = videoElement.videoWidth || 640;
                                canvas.height = videoElement.videoHeight || 480;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                                    canvas.toBlob((blob) => {
                                        if (blob) {
                                            onScan(decodedText, blob);
                                        } else {
                                            onScan(decodedText);
                                        }
                                        cleanupAndClose();
                                    }, 'image/jpeg', 0.85);
                                    return; // Short-circuit, cleanupAndClose handled async
                                }
                            } catch (e) {
                                console.error("Failed to capture video frame", e);
                            }
                        }

                        // Fallback if video element capture failed
                        onScan(decodedText);
                        cleanupAndClose();
                    }
                };

                // Attempt explicit camera traversal first (Crucial for fallback laptop routing)
                try {
                    const devices = await Html5Qrcode.getCameras();
                    if (devices && devices.length > 0) {
                        // Attempt to locate a rear lens
                        let targetCam = devices.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment'));
                        if (!targetCam) targetCam = devices[devices.length - 1]; // Often the last enumerated device on phones is back
                        if (devices.length === 1) targetCam = devices[0]; // PC Webcam

                        await scannerRef.current.start(targetCam.id, config, handleScanSuccess, (_e: any) => {});
                        return;
                    }
                } catch (err) {
                    console.warn("Explicit camera iteration failed, dropping to pure constraints", err);
                }

                // Fallback 1: Force Environment
                try {
                    await scannerRef.current.start({ facingMode: "environment" }, config, handleScanSuccess, (_e: any) => {});
                } catch (envError) {
                    // Fallback 2: Bound to Laptop User Camera explicitly
                    await scannerRef.current.start({ facingMode: "user" }, config, handleScanSuccess, (_e: any) => {});
                }

            } catch (err) {
                console.error("Camera access irrevocably failed", err);
                toast.error("Could not mount any camera. Please test permissions.");
            }
        };

        startScanner();

        return () => {
            if (scannerRef.current) {
                if (scannerRef.current.isScanning) {
                    scannerRef.current.stop().then(() => {
                        if (scannerRef.current) scannerRef.current.clear();
                    }).catch((e: any) => console.error("Cleanup error:", e));
                } else {
                    scannerRef.current.clear();
                }
            }
        };
    }, [onClose, onScan, isQrMode]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-md">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md relative shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 relative z-10 shrink-0">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <ScanLine className="w-5 h-5 text-blue-500" />
                        {title || "Scan Vehicle Barcode"}
                    </h3>
                    <button 
                        onClick={onClose}
                        className="p-2 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <style>{`
                        #reader__scan_region { background: transparent !important; min-height: 300px; display: flex; align-items: center; justify-content: center; position: relative; }
                        #reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; position: absolute; top: 0; left: 0; }
                        #reader { border: none !important; position: relative; width: 100%; height: 100%; }
                        #reader__dashboard_section_swaplink { display: none !important; }
                    `}</style>
                    <div className="relative w-full aspect-square md:aspect-video bg-black rounded-xl overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,1)] flex items-center justify-center">
                        <div id="reader" className="w-full h-full absolute inset-0 z-0"></div>
                        
                        {/* Synthetic Scanner Overlay Reticle */}
                        <div className="absolute inset-0 pointer-events-none z-[10] border-[40px] md:border-[60px] border-black/50 flex items-center justify-center">
                            <div className={`relative w-full border border-accent/20 ${isQrMode ? 'aspect-square max-w-[250px]' : 'h-32 md:h-40 max-w-[400px]'}`}>
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-accent -mt-1 -ml-1 rounded-tl"></div>
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-accent -mt-1 -mr-1 rounded-tr"></div>
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-accent -mb-1 -ml-1 rounded-bl"></div>
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-accent -mb-1 -mr-1 rounded-br"></div>
                                {/* Scanning Laser Animation */}
                                <div className="absolute left-0 w-full h-0.5 bg-accent shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-[scan_2s_linear_infinite]"></div>
                            </div>
                        </div>
                    </div>

                {/* Laser animation keyframes */}
                <style>{`
                    @keyframes scan {
                        0% { top: 0; opacity: 0; }
                        10% { opacity: 1; }
                        90% { opacity: 1; }
                        100% { top: 100%; opacity: 0; }
                    }
                `}</style>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mt-6 text-center">
                        {description || "Align the door jamb rating plate barcode in the viewfinder. Works with Code39/128 formats."}
                    </p>
                </div>
            </div>
        </div>
    );
}
