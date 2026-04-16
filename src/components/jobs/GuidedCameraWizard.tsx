import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import toast from 'react-hot-toast';

export function GuidedCameraWizard({ 
    requiredCategories, 
    onComplete, 
    onCancel 
}: { 
    requiredCategories: string[], 
    onComplete: (captures: { category: string, file: File }[]) => void, 
    onCancel: () => void 
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [captures, setCaptures] = useState<{ category: string, file: File }[]>([]);
    
    useEffect(() => {
        let activeStream: MediaStream | null = null;
        let isCancelled = false;

        const initCamera = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } }
                });
                if (isCancelled) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    return;
                }
                setStream(mediaStream);
                activeStream = mediaStream;
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (err) {
                if (isCancelled) return;
                console.error("Camera access denied or unavailable", err);
                toast.error("Camera unavailable. Please upload manually.", { id: 'camera-error' });
                onCancel();
            }
        };
        initCamera();

        return () => {
            isCancelled = true;
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [onCancel]);

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const context = canvas.getContext('2d');
        if (!context) return;
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            if (!blob) return;
            const category = requiredCategories[currentIndex];
            const file = new File([blob], `${category.replace(/\s+/g, '_')}_${Date.now()}.jpg`, { type: 'image/jpeg' });
            
            const newCaptures = [...captures, { category, file }];
            setCaptures(newCaptures);
            
            if (currentIndex + 1 < requiredCategories.length) {
                setCurrentIndex(currentIndex + 1);
            } else {
                // Done! Let's shut off tracks and return
                stream?.getTracks().forEach(t => t.stop());
                onComplete(newCaptures);
            }
        }, 'image/jpeg', 0.9);
    };

    if (requiredCategories.length === 0) {
        onComplete([]);
        return null;
    }

    const currentCategory = requiredCategories[currentIndex];

    // Minimal dynamic hint overlay logic (optional future enhancement)
    const renderWireframeHint = () => {
        // We could render an SVG car outline here depending on 'currentCategory'
        return null;
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-between animate-fade-in">
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start bg-gradient-to-b from-black/80 via-black/40 to-transparent z-10 pt-10">
                <div className="flex flex-col">
                    <span className="text-zinc-400 font-black text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div> Live View
                    </span>
                    <span className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-1">
                        Step {currentIndex + 1} of {requiredCategories.length}
                    </span>
                    <h2 className="text-3xl font-black text-white leading-none">{currentCategory}</h2>
                </div>
                <button onClick={() => {
                   stream?.getTracks().forEach(t => t.stop());
                   onCancel();
                }} className="p-3 bg-zinc-900/80 rounded-full hover:bg-zinc-800 text-white backdrop-blur-sm transition-colors border border-zinc-700/50">
                    <X className="w-5 h-5" />
                </button>
            </div>
            
            <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                 <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                />
            </div>
            
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col items-center justify-center bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10 pb-12">
                
                {renderWireframeHint()}
                
                <button 
                    onClick={capturePhoto}
                    className="w-20 h-20 rounded-full border-4 border-white/50 p-1 hover:border-white transition-all group flex-shrink-0 relative focus:outline-none"
                    aria-label={`Capture ${currentCategory}`}
                >
                    <div className="w-full h-full bg-white rounded-full flex items-center justify-center group-hover:scale-95 transition-transform group-active:scale-90">
                        <Camera className="w-8 h-8 text-black opacity-80" />
                    </div>
                </button>
                <div className="text-white mt-5 font-black tracking-widest text-[10px] uppercase opacity-70">
                    Tap to Capture {currentCategory}
                </div>
            </div>
        </div>
    );
}
