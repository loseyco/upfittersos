import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BrowserMultiFormatReader, Result, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { X, Camera, ImagePlus, Loader2, Package, MapPin, Search, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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

  // Form State
  const [scannedId, setScannedId] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

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

    reader.listVideoInputDevices()
      .then((videoInputDevices) => {
        if (videoInputDevices.length > 0) {
          setCameras(videoInputDevices);
          let defaultIndex = 0;
          for (let i = 0; i < videoInputDevices.length; i++) {
            const label = videoInputDevices[i].label.toLowerCase();
            if (label.includes('back') || label.includes('environment')) {
              defaultIndex = i;
              break;
            }
          }
          setCurrentCameraIndex(defaultIndex);
        }
      })
      .catch((err) => console.error("Camera check failed", err));

    return () => {
      reader.reset();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === 'scan' && isScanning && cameras.length > 0 && videoRef.current && codeReaderRef.current) {
      const deviceId = cameras[currentCameraIndex].deviceId;
      
      codeReaderRef.current.decodeFromVideoDevice(
        deviceId, 
        videoRef.current, 
        (result: Result | null | undefined) => {
          if (result) {
            const text = result.getText().trim();
            handleScanSuccess(text);
          }
        }
      ).catch((err) => console.error("Scanner start failed", err));
    }

    return () => {
      if (codeReaderRef.current) codeReaderRef.current.reset();
    };
  }, [isOpen, step, isScanning, cameras, currentCameraIndex]);

  const handleScanSuccess = (text: string) => {
    setScannedId(text);
    setIsScanning(false);
    if (codeReaderRef.current) codeReaderRef.current.reset();
    setStep('details');
    toast.success("Package scanned successfully!");
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !codeReaderRef.current) return;

    setIsProcessingImage(true);
    codeReaderRef.current.reset();

    try {
      const originalUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = originalUrl;
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
      toast.error("Could not find a barcode in that photo.");
      setIsScanning(true);
    } finally {
      setIsProcessingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    setIsSubmitting(true);
    try {
      const finalId = scannedId.trim() || `MANUAL-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}`;
      
      await addDoc(collection(db, `businesses/${tenantId}/shipments`), {
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
      });

      toast.success("Package intake complete!");
      onSuccess();
      handleClose();
    } catch (err) {
      console.error("Submit failed", err);
      toast.error("Failed to log package intake.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const detectCarrier = (tracking: string) => {
    const t = tracking.toUpperCase().replace(/\s/g, '');
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
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
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
                ) : (
                  <>
                    <video 
                      ref={videoRef} 
                      className="w-full h-full object-cover" 
                      playsInline 
                      muted 
                    />
                    {/* Viewfinder Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                      <div className="w-64 h-32 border-2 border-indigo-500/50 rounded-2xl relative shadow-[0_0_50px_rgba(99,102,241,0.2)]">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse" />
                        
                        {/* Corner Accents */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-indigo-500 rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-indigo-500 rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-indigo-500 rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-indigo-500 rounded-br-lg" />
                      </div>
                      <p className="text-white text-[10px] font-bold uppercase tracking-widest mt-6 opacity-50">Align barcode within frame</p>
                    </div>
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
                <div className="space-y-1.5">
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
                  disabled={isSubmitting || !description.trim() || !location.trim()}
                  className="flex-[2] py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
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
    z.name.toLowerCase().includes(search.toLowerCase()) || 
    z.type.toLowerCase().includes(search.toLowerCase())
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
