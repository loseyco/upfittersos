import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { BrowserMultiFormatReader, Result } from '@zxing/library';
import { X, Camera, ImagePlus, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface VinScannerProps {
  onScan: (vin: string) => void;
  onClose: () => void;
}

export function VinScanner({ onScan, onClose }: VinScannerProps) {
  const [isScanning, setIsScanning] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Initialize ZXing and list cameras
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    codeReaderRef.current = reader;

    reader.listVideoInputDevices()
      .then((videoInputDevices) => {
        if (videoInputDevices.length > 0) {
          setCameras(videoInputDevices);
          // Try to default to the main back camera
          let defaultIndex = 0;
          for (let i = 0; i < videoInputDevices.length; i++) {
            const label = videoInputDevices[i].label.toLowerCase();
            if (label.includes('back') || label.includes('environment')) {
              defaultIndex = i;
              break;
            }
          }
          setCurrentCameraIndex(defaultIndex);
        } else {
          toast.error("No cameras found on this device.");
        }
      })
      .catch((err) => {
        console.error("Camera check failed", err);
      });

    return () => {
      reader.reset();
    };
  }, []);

  // Start the live video feed
  useEffect(() => {
    if (isScanning && cameras.length > 0 && videoRef.current && codeReaderRef.current) {
      const deviceId = cameras[currentCameraIndex].deviceId;
      
      codeReaderRef.current.decodeFromVideoDevice(
        deviceId, 
        videoRef.current, 
        (result: Result | null | undefined, _err: any) => {
          if (result) {
            const cleanedVin = result.getText().trim().toUpperCase();
            if (cleanedVin.length >= 3) {
              onScan(cleanedVin);
              stopScanner();
              onClose();
            }
          }
          // Ignore frequent NotFoundExceptions from ZXing during continuous scanning
        }
      ).catch((err) => {
        console.error("Error starting decodeFromVideoDevice", err);
        toast.error("Could not access camera feed.");
      });
    }

    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, [isScanning, cameras, currentCameraIndex]);

  const cycleCamera = () => {
    if (cameras.length <= 1) {
      toast.info("Only one camera detected on this device.");
      return;
    }
    toast.info("Switching camera lens...");
    setCurrentCameraIndex((prev) => (prev + 1) % cameras.length);
  };

  const stopScanner = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
    setIsScanning(false);
  };

  // Handle the Native iOS Camera Fallback
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !codeReaderRef.current) return;

    setIsProcessingImage(true);
    // Pause live scanner while processing photo
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }

    try {
      const imageUrl = URL.createObjectURL(file);
      const result = await codeReaderRef.current.decodeFromImageUrl(imageUrl);
      const cleanedVin = result.getText().trim().toUpperCase();
      
      if (cleanedVin.length >= 3) {
        toast.success("Barcode found in photo!");
        onScan(cleanedVin);
        onClose();
      } else {
        toast.error("Decoded text was too short to be a valid barcode.");
        setIsScanning(true); // Resume live scanning
      }
    } catch (err) {
      console.error("Failed to decode image:", err);
      toast.error("Could not find a valid barcode in that photo. Please try again.");
      setIsScanning(true); // Resume live scanning
    } finally {
      setIsProcessingImage(false);
      // Reset input value so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Header / Close */}
      <div className="absolute top-6 right-6 z-10">
        <button 
          onClick={() => { stopScanner(); onClose(); }}
          className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full max-w-md px-6 text-center space-y-6 flex flex-col items-center h-full justify-center pb-24">
        
        {/* Viewfinder Section */}
        <div className="space-y-4 w-full">
          <div className="relative aspect-square w-full bg-zinc-900 rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-2xl flex items-center justify-center">
            {isProcessingImage ? (
              <div className="flex flex-col items-center gap-4 text-emerald-400">
                <Loader2 className="w-12 h-12 animate-spin" />
                <p className="font-bold animate-pulse">Analyzing Photo...</p>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover" 
                  playsInline 
                  muted 
                />
                {/* Red Laser Line */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[80%] h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse"></div>
                </div>
              </>
            )}
          </div>
          
          <div className="flex flex-col gap-1">
            <p className="text-white font-bold animate-pulse">Live Scanner Active</p>
            <p className="text-zinc-500 text-xs">Lens: {cameras[currentCameraIndex]?.label || `Camera ${currentCameraIndex + 1}`}</p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex justify-center gap-6 pt-4 w-full">
          <button 
            onClick={cycleCamera}
            disabled={isProcessingImage}
            className="flex flex-col items-center gap-2 group p-4 rounded-2xl bg-white/5 text-zinc-400 hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <div className="p-3 rounded-full bg-white/10 group-hover:bg-white/20 transition-all">
              <Camera className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest">Switch Lens</span>
          </button>
        </div>

        {/* Native Camera Fallback Section */}
        <div className="w-full mt-8 p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-white font-bold flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Need Flashlight?
            </p>
            <p className="text-zinc-400 text-xs px-4">Use your phone's native camera to take a clear, brightly lit photo of the barcode instead.</p>
          </div>
          
          <label className={`
            relative flex items-center justify-center gap-3 w-full py-4 rounded-xl font-bold cursor-pointer transition-all
            ${isProcessingImage ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'}
          `}>
            {isProcessingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
            {isProcessingImage ? 'Processing...' : 'Take Photo to Scan'}
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" // Forces the native camera app to open on mobile
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              onChange={handleFileUpload}
              disabled={isProcessingImage}
            />
          </label>
        </div>

      </div>
    </div>
  );
}
