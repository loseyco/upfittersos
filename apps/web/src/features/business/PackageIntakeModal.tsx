import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { Result, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatReader, BrowserCodeReader } from '@zxing/browser';
import { X, Camera, ImagePlus, Loader2, Package, MapPin, Search, ChevronRight, CheckCircle, AlertCircle, Trash2, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '../../lib/firebase/config';
import { collection, addDoc, serverTimestamp, updateDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';

interface PackageIntakeModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  zones?: { id: string; name: string; type: string }[];
  isPage?: boolean;
}

function getUniqueTimestamp() {
  return Date.now();
}

function detectIntakeCarrier(tracking: string) {
  const t = (tracking || '').toUpperCase().replace(/\s/g, '');
  if (t.startsWith('1Z')) return 'UPS';
  if (t.length === 12 || t.length === 15 || t.length === 20) return 'FedEx';
  if (t.startsWith('TBA')) return 'Amazon';
  if (t.length >= 22) return 'USPS';
  return 'Other';
}

export function PackageIntakeModal({ isOpen, onClose, onSuccess, zones, isPage = false }: PackageIntakeModalProps) {
  const { tenantId, user } = useAuthStore();
  const navigate = useNavigate();
  const [localZones, setLocalZones] = useState<{ id: string; name: string; type: string }[]>(zones || []);

  // Fetch zones if not provided
  useEffect(() => {
    if (zones && zones.length > 0) {
      setLocalZones(zones);
      return;
    }
    if (!tenantId) return;

    const q = query(collection(db, `businesses/${tenantId}/zones`), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setLocalZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (err) => console.error("Error loading local zones for package page", err));

    return () => unsub();
  }, [zones, tenantId]);

  const [step, setStep] = useState<'details' | 'scan' | 'camera'>('details');
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isManualScanning, setIsManualScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
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
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const handleScanSuccess = useCallback((text: string) => {
    setScannedId(text);
    setIsScanning(false);
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    setStep('details');
    toast.success("Package scanned successfully!");
  }, []);

  useEffect(() => {
    if (!isOpen && !isPage) return;
    
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
    if ((isOpen || isPage) && step === 'scan' && isScanning && cameras.length > 0 && videoRef.current && codeReaderRef.current) {
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
  }, [isOpen, step, isScanning, cameras, currentCameraIndex, handleScanSuccess]);

  // Camera stream for step === 'camera' (photo capture mode)
  useEffect(() => {
    if ((!isOpen && !isPage) || step !== 'camera' || cameras.length === 0 || !videoRef.current) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      return;
    }

    const device = cameras[currentCameraIndex];
    if (!device) return;
    const deviceId = device.deviceId;

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        facingMode: 'environment'
      }
    };

    let activeStream: MediaStream | null = null;

    navigator.mediaDevices.getUserMedia(constraints)
      .then((stream) => {
        activeStream = stream;
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => console.error("Video play failed", err));
        }
      })
      .catch((err) => {
        console.error("Camera stream start failed, retrying with simple constraints", err);
        navigator.mediaDevices.getUserMedia({ video: { deviceId } })
          .then((stream) => {
            activeStream = stream;
            setCameraStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(err => console.error("Video play fallback failed", err));
            }
          })
          .catch(e => {
            console.error("Total camera failure for photo capture", e);
            setCameraError("Could not access camera for photo capture.");
          });
      });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, step, cameras, currentCameraIndex]);

  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    
    // Set flash animation
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 150);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error("Failed to capture image frame.");
          return;
        }
        
        const file = new File([blob], `captured_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const preview = URL.createObjectURL(blob);
        
        setImages(prev => [...prev, { file, preview }]);
        toast.success("Photo captured!");
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.error("Failed to capture photo from video stream", err);
      toast.error("Failed to capture photo.");
    }
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages: { file: File; preview: string }[] = [];

    // Only attempt barcode decode if we are in scan mode
    if (step === 'scan' && codeReaderRef.current && files.length > 0) {
      const file = files[0];
      const preview = URL.createObjectURL(file);
      newImages.push({ file, preview });

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
      } finally {
        setIsProcessingImage(false);
      }
    } else {
      // In details mode, add all selected files
      for (const file of files) {
        const preview = URL.createObjectURL(file);
        newImages.push({ file, preview });
      }
    }
    
    setImages(prev => [...prev, ...newImages]);
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
        carrier: detectIntakeCarrier(finalId),
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
          const storageRef = ref(storage, `businesses/${tenantId}/shipments/${shipmentRef.id}/${getUniqueTimestamp()}_${imgItem.file.name}`);
          const snapshot = await uploadBytes(storageRef, imgItem.file);
          const url = await getDownloadURL(snapshot.ref);
          imageUrls.push(url);
        }

        // 3. Update shipment with URLs
        await updateDoc(shipmentRef, { images: imageUrls });
      }

      let partNotes = `Intake Location: ${location.trim()}`;
      if (notes.trim()) {
        partNotes += `. Notes: ${notes.trim()}`;
      }
      partNotes += `. Tracking: ${finalId}`;

      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        partName: description.trim(),
        quantity: 1,
        urgency: 'normal',
        jobId: null,
        jobTitle: null,
        notes: partNotes,
        status: 'received',
        requestedBy: user?.displayName || user?.email?.split('@')[0] || 'Package Intake',
        requestedById: user?.uid || null,
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        statusChangedAt: serverTimestamp()
      });

      // Log to global activity feed
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'parts',
        title: 'Part Received (Intake)',
        message: `Part "${description.trim()}" received at ${location.trim()} via Package Intake`,
        timestamp: serverTimestamp(),
        severity: 'success',
        author: user?.displayName || user?.email?.split('@')[0] || 'System'
      });

      toast.success("Package intake complete!");
      onSuccess?.();
      handleClose();
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error("Submit failed:", err);
      toast.error(`Failed to log package intake: ${errMessage}`);
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  };

  const handleClose = () => {
    setStep('details');
    setIsScanning(false);
    setScannedId('');
    setDescription('');
    setLocation('');
    setNotes('');
    // Clear image previews
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (onClose) {
      onClose();
    } else if (isPage) {
      navigate(-1);
    }
  };

  if (!isOpen && !isPage) return null;

  const content = (
    <div className={`relative w-full ${isPage ? 'max-w-4xl border border-zinc-200 dark:border-zinc-800 shadow-md' : 'max-w-xl border border-white/10 shadow-2xl'} bg-white dark:bg-zinc-900 rounded-[2.5rem] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500`}>
      
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
          type="button"
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="p-8">
        {step === 'scan' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
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
                    type="button"
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Upload Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
              <button 
                type="button"
                onClick={() => {
                  setIsScanning(false);
                  if (controlsRef.current) {
                    controlsRef.current.stop();
                    controlsRef.current = null;
                  }
                  setStep('details');
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 transition-all"
              >
                <X className="w-6 h-6 text-rose-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Cancel Scan</span>
              </button>
            </div>
          </div>
        ) : step === 'camera' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Camera Viewport */}
            <div className={`relative aspect-[4/3] bg-zinc-100 dark:bg-black rounded-3xl overflow-hidden ring-1 ring-zinc-200 dark:ring-white/10 shadow-inner ${isFlashing ? 'bg-white' : ''}`}>
              {cameras.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center bg-zinc-900">
                  <AlertCircle className="w-10 h-10 text-rose-500 animate-bounce" />
                  <p className="text-sm font-bold text-white">No Camera Found</p>
                  <p className="text-xs text-zinc-500">Please connect a camera or verify system site permissions.</p>
                </div>
              ) : (
                <>
                  <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover" 
                    playsInline 
                    muted 
                  />
                  
                  {/* Camera Selection Switch Overlay */}
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCurrentCameraIndex(prev => (prev + 1) % cameras.length)}
                      className="absolute top-4 right-4 bg-zinc-950/80 hover:bg-zinc-950 border border-white/15 px-3 py-1.5 rounded-full text-white text-[10px] font-bold uppercase tracking-widest backdrop-blur-md active:scale-95 transition-all"
                    >
                      Switch Camera ({currentCameraIndex + 1}/{cameras.length})
                    </button>
                  )}
                  
                  {/* Take Photo Overlay Button */}
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-90 transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center"
                    >
                      <div className="w-10 h-10 bg-white rounded-full" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Back to details */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="w-full py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold rounded-2xl transition-all text-xs uppercase tracking-widest"
              >
                Back to Details
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Tracking ID & Scanner trigger */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tracking Number / ID</label>
                  {isSecure && cameras.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => {
                        setStep('scan');
                        setIsScanning(true);
                      }}
                      className="text-[10px] font-black text-indigo-500 hover:text-indigo-600 transition-colors uppercase tracking-widest flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scan Barcode
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-zinc-400" />
                  </div>
                  <input 
                    type="text"
                    value={scannedId}
                    onChange={(e) => setScannedId(e.target.value)}
                    placeholder="Enter or scan carrier tracking number..."
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
                  zones={localZones}
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
                  {/* Take Photo Trigger */}
                  <button
                    type="button"
                    onClick={() => setStep('camera')}
                    className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:border-indigo-500/50 hover:text-indigo-500 transition-all bg-zinc-50/50 dark:bg-zinc-900/50"
                  >
                    <Camera className="w-6 h-6 text-indigo-500" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Take Photo</span>
                  </button>

                  {/* Upload Files Trigger (supports multiple files) */}
                  <label className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:border-indigo-500/50 hover:text-indigo-500 transition-all cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/50">
                    <ImagePlus className="w-6 h-6 text-emerald-500" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Upload Files</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      className="hidden" 
                      onChange={handleFileUpload} 
                    />
                  </label>

                  {/* Previews */}
                  {images.map((img, idx) => (
                    <div key={idx} className="shrink-0 w-24 h-24 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative group animate-in zoom-in-95 duration-200">
                      <img src={img.preview} className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {images.length === 0 && (
                    <div className="flex-1 flex items-center gap-3 px-4 border border-zinc-100 dark:border-zinc-800 rounded-2xl bg-zinc-50/30 dark:bg-zinc-950/30">
                      <Camera className="w-5 h-5 text-zinc-300" />
                      <p className="text-[10px] text-zinc-400 italic">No photos taken yet. Use the camera or upload files.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                type="submit"
                disabled={isSubmitting || isUploadingImages || !description.trim() || !location.trim()}
                className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
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
  );

  if (isPage) {
    return (
      <div className="w-full max-w-4xl mx-auto py-6 px-4">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Glass Backdrop */}
      <div 
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={handleClose}
      />
      {content}
    </div>
  );
}

function LocationSelector({ value, onChange, zones }: { value: string; onChange: (v: string) => void; zones: { id: string; name: string; type: string }[] }) {
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
