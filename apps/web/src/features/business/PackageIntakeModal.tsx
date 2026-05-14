import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Result, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatReader, BrowserCodeReader } from '@zxing/browser';
import { X, Camera, ImagePlus, Loader2, Package, MapPin, Search, ChevronRight, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '../../lib/firebase/config';
import { collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuthStore } from '../../lib/auth/store';

interface PackageIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zones: { id: string; name: string; type: string }[];
}

export function PackageIntakeModal({ isOpen, onClose, onSuccess, zones }: PackageIntakeModalProps) {
  const { tenantId, user } = useAuthStore();
  const [step, setStep] = useState<'scan' | 'details'>('scan');
  const [isScanning, setIsScanning] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isManualScanning, setIsManualScanning] = useState(false);
  const isSecure = typeof window !== 'undefined' && window.isSecureContext;

  // Form State
  const [scannedId, setScannedId] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState<{file: File, preview: string}[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    
    const reader = new BrowserMultiFormatReader(hints);
    codeReaderRef.current = reader;

    BrowserCodeReader.listVideoInputDevices()
      .then((videoInputDevices) => {
        if (videoInputDevices.length > 0) {
          setCameras(videoInputDevices);
          let defaultIndex = 0;
          for (let i = 0; i < videoInputDevices.length; i++) {
            const label = (videoInputDevices[i].label || '').toLowerCase();
            if (label.includes('back') || label.includes('environment')) {
              defaultIndex = i;
              break;
            }
          }
          setCurrentCameraIndex(defaultIndex);
        }
      })
      .catch((err) => {
        console.error("Camera check failed", err);
        setCameraError("Could not access camera list. Please ensure permissions are granted.");
      });

    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === 'scan' && isScanning && cameras.length > 0 && videoRef.current && codeReaderRef.current) {
      const device = cameras[currentCameraIndex];
      if (!device) return;
      const deviceId = device.deviceId;
      
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 1080, max: 1080 },
          facingMode: 'environment'
        }
      };

      codeReaderRef.current.decodeFromConstraints(
        constraints, 
        videoRef.current, 
        (result: Result | null | undefined) => {
          if (result) {
            const text = result.getText().trim();
            handleScanSuccess(text);
          }
        }
      ).then(controls => {
        controlsRef.current = controls;
      }).catch((err) => {
        console.error("Scanner start failed", err);
        setCameraError("Failed to start high-res camera stream. Falling back to default.");
        
        // Fallback to simpler method if constraints fail
        if (codeReaderRef.current) {
          codeReaderRef.current.decodeFromVideoDevice(
            deviceId,
            videoRef.current!,
            (result: Result | null | undefined) => {
              if (result) handleScanSuccess(result.getText().trim());
            }
          ).then(controls => {
            controlsRef.current = controls;
          }).catch(e => console.error("Total camera failure", e));
        }
      });
    }

    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [isOpen, step, isScanning, cameras, currentCameraIndex]);

  const handleScanSuccess = (text: string) => {
    setScannedId(text);
    setIsScanning(false);
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    setStep('details');
    toast.success("Package scanned successfully!");
  };

  const handleManualFrameCapture = async () => {
    if (!videoRef.current || !codeReaderRef.current) return;
    
    setIsManualScanning(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 1.0);
      
      const result = await codeReaderRef.current.decodeFromImageUrl(imageData);
      handleScanSuccess(result.getText().trim());
    } catch (err) {
      console.error("Manual frame decode failed", err);
      toast.error("Could not find a barcode in this frame. Try adjusting focus or lighting.");
    } finally {
      setIsManualScanning(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Add to images gallery
    const preview = URL.createObjectURL(file);
    setImages(prev => [...prev, { file, preview }]);

    // Only attempt barcode decode if we are still in scan mode
    if (step === 'scan' && codeReaderRef.current) {
      setIsProcessingImage(true);
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }

      try {
        const img = new Image();
        img.src = preview;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        const MAX_DIMENSION = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > width && height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, width, height);

        const resizedImageUrl = canvas.toDataURL('image/jpeg', 0.9);
        const result = await codeReaderRef.current.decodeFromImageUrl(resizedImageUrl);
        handleScanSuccess(result.getText().trim());
      } catch (err) {
        console.error("Image decode failed", err);
        // We don't toast error here because they might just be taking a content photo
      } finally {
        setIsProcessingImage(false);
      }
    } else {
      // If we are already in details mode, just switch to it (though we should already be there)
      if (step === 'scan') setStep('details');
    }
    
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    setIsSubmitting(true);
    try {
      const finalId = scannedId.trim() || `MANUAL-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}`;
      
      // 1. Create the shipment document first to get an ID
      const shipmentRef = await addDoc(collection(db, `businesses/${tenantId}/shipments`), {
        trackingNumber: finalId,
        carrier: detectCarrier(finalId),
        description: description.trim(),
        location: location.trim(),
        notes: notes.trim(),
        status: 'received',
        isIntake: true,
        deliveredAt: serverTimestamp(),
        receivedBy: user?.displayName || user?.email?.split('@')[0] || 'Unknown',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email?.split('@')[0] || null,
        createdByEmail: user?.email || null,
        images: [] // Placeholder
      });

      // 2. Upload images if any
      if (images.length > 0) {
        setIsUploadingImages(true);
        const imageUrls: string[] = [];
        
        for (const imgItem of images) {
          const storageRef = ref(storage, `businesses/${tenantId}/shipments/${shipmentRef.id}/${Date.now()}_${imgItem.file.name}`);
          const snapshot = await uploadBytes(storageRef, imgItem.file);
          const url = await getDownloadURL(snapshot.ref);
          imageUrls.push(url);
        }

        // 3. Update shipment with URLs
        await updateDoc(shipmentRef, { images: imageUrls });
      }

      toast.success("Package intake complete!");
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error("Submit failed:", err);
      toast.error(`Failed to log package intake: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  };

  const detectCarrier = (tracking: string) => {
    const t = (tracking || '').toUpperCase().replace(/\s/g, '');
    if (t.startsWith('1Z')) return 'UPS';
    if (t.length === 12 || t.length === 15 || t.length === 20) return 'FedEx';
    if (t.startsWith('TBA')) return 'Amazon';
    if (t.length >= 22) return 'USPS';
    return 'Other';
  };

  const handleClose = () => {
    setStep('scan');
    setIsScanning(true);
    setScannedId('');
    setDescription('');
    setLocation('');
    setNotes('');
    // Clear image previews
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Glass Backdrop */}
      <div 
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={handleClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-white/10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl">
              <Package className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white leading-none">Package Intake</h2>
              <p className="text-sm text-zinc-500 mt-1">Receive and locate incoming packages</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          {step === 'scan' ? (
            <div className="space-y-6">
              {/* Scanner Viewport */}
              <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-black rounded-3xl overflow-hidden ring-1 ring-zinc-200 dark:ring-white/10 shadow-inner group">
                {isProcessingImage ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-indigo-500">
                    <Loader2 className="w-12 h-12 animate-spin" />
                    <p className="font-bold animate-pulse uppercase tracking-widest text-xs">Processing Photo...</p>
                  </div>
                ) : !isSecure ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center bg-zinc-900">
                    <div className="p-4 bg-amber-500/10 rounded-full">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white mb-2">Insecure Context Detected</p>
                      <p className="text-xs text-zinc-400">
                        Camera access requires <span className="text-amber-500 font-mono">HTTPS</span>. 
                        Please use a secure tunnel (like ngrok) or access via localhost.
                      </p>
                    </div>
                    <div className="pt-4 w-full">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Use fallback instead:</p>
                      <label className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold cursor-pointer hover:bg-white/10 transition-all">
                        <ImagePlus className="w-4 h-4 text-emerald-500" />
                        Take Photo (System Camera)
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>
                ) : cameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center bg-zinc-900">
                    <AlertCircle className="w-10 h-10 text-rose-500" />
                    <p className="text-xs text-zinc-400">{cameraError}</p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/20"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <>
                    <video 
                      ref={videoRef} 
                      className="w-full h-full object-cover" 
                      playsInline 
                      muted 
                    />
                    {/* Manual Scan Trigger Overlay */}
                    <button 
                      onClick={handleManualFrameCapture}
                      disabled={isManualScanning}
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-transparent group"
                    >
                      <div className="w-64 h-32 border-2 border-indigo-500/50 rounded-2xl relative shadow-[0_0_50px_rgba(99,102,241,0.2)] group-active:scale-95 transition-transform">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse" />
                        
                        {/* Corner Accents */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-indigo-500 rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-indigo-500 rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-indigo-500 rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-indigo-500 rounded-br-lg" />
                        
                        {isManualScanning && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl animate-in fade-in duration-200">
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                      <p className="text-white text-[10px] font-bold uppercase tracking-widest mt-6 opacity-70 group-hover:opacity-100 transition-opacity">
                        {isManualScanning ? 'Decoding...' : 'Tap screen to force scan'}
                      </p>
                    </button>
                  </>
                )}
              </div>

              {/* Controls */}
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 transition-all cursor-pointer">
                  <ImagePlus className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Take Photo</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                </label>
                <button 
                  onClick={() => setStep('details')}
                  className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 transition-all"
                >
                  <Search className="w-6 h-6 text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Manual Entry</span>
                </button>
              </div>

              <button 
                onClick={() => cameras.length > 1 && setCurrentCameraIndex((prev) => (prev + 1) % cameras.length)}
                className="w-full py-4 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-indigo-500 hover:border-indigo-500/50 transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-widest">Switch Camera Lens</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {/* Scanned ID Field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Package ID / Tracking</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-zinc-400" />
                    </div>
                    <input 
                      type="text"
                      value={scannedId}
                      onChange={(e) => setScannedId(e.target.value)}
                      placeholder="Enter ID or auto-generated..."
                      className="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Description Field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Description</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Package className="w-4 h-4 text-zinc-400" />
                    </div>
                    <input 
                      type="text"
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Brake Pads for Chevy Truck"
                      className="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Location Field - Custom Searchable Dropdown */}
                <div className="space-y-1.5 relative z-50">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Where is it put?</label>
                  <LocationSelector 
                    value={location}
                    onChange={setLocation}
                    zones={zones}
                  />
                </div>

                {/* Notes Field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Notes (Optional)</label>
                  <div className="relative group">
                    <textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional details..."
                      rows={2}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none text-sm"
                    />
                  </div>
                </div>

                {/* Multi-Image Capture Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Package & Content Photos</label>
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">{images.length} Captured</span>
                  </div>

                  <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                    {/* Add Photo Trigger */}
                    <label className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:border-indigo-500/50 hover:text-indigo-500 transition-all cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/50">
                      <ImagePlus className="w-6 h-6" />
                      <span className="text-[8px] font-bold uppercase tracking-wider">Add Photo</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                    </label>

                    {/* Previews */}
                    {images.map((img, idx) => (
                      <div key={idx} className="shrink-0 w-24 h-24 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative group">
                        <img src={img.preview} className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {images.length === 0 && (
                      <div className="flex-1 flex items-center gap-3 px-4 border border-zinc-100 dark:border-zinc-800 rounded-2xl bg-zinc-50/30 dark:bg-zinc-950/30">
                        <Camera className="w-5 h-5 text-zinc-300" />
                        <p className="text-[10px] text-zinc-400 italic">No photos taken yet. Document the package and its contents.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setStep('scan')}
                  className="flex-1 py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl transition-all"
                >
                  Back
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || isUploadingImages || !description.trim() || !location.trim()}
                  className="flex-[2] py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                >
                  {isSubmitting || isUploadingImages ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs uppercase tracking-widest">{isUploadingImages ? 'Uploading Photos...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Complete Intake
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function LocationSelector({ value, onChange, zones }: { value: string; onChange: (v: string) => void; zones: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = zones.filter(z => 
    (z.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (z.type || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <MapPin className="w-4 h-4 text-zinc-400" />
        </div>
        <input 
          type="text"
          required
          value={search}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Search areas or type location..."
          className="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
        />
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-zinc-400">
          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {isOpen && (filtered.length > 0 || search.trim().length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[110] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
            {filtered.map(z => (
              <button 
                key={z.id} 
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSearch(z.name);
                  onChange(z.name);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-left flex flex-col rounded-xl transition-all group"
              >
                <span className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 transition-colors">{z.name}</span>
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">{z.type}</span>
              </button>
            ))}
            {filtered.length === 0 && search.trim().length > 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">No matching area</p>
                <p className="text-xs text-zinc-500 mt-1 italic">Using custom: "{search}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
