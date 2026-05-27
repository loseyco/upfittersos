import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Package, ShoppingCart, Truck, Clock, MapPin, 
  CheckCircle, ExternalLink, History, 
  FileText, Loader2, Edit3, Save, Trash2, ImagePlus, ImageIcon, Maximize2, Camera
} from 'lucide-react';
import { db, storage } from '../../lib/firebase/config';
import { doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuthStore } from '../../lib/auth/store';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Result, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface ItemDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string | null;
  type: 'shipment' | 'part';
  zones?: { id: string; name: string; type: string }[];
  onOpenIntake?: () => void;
}

interface ItemData {
  id: string;
  status: string;
  partName?: string;
  description?: string;
  notes?: string;
  quantity?: number;
  trackingNumber?: string;
  carrier?: string;
  location?: string;
  jobId?: string;
  images?: string[];
  receivedBy?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statusChangedAt?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  putAwayAt?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt?: any;
}

interface JobData {
  id: string;
  title: string;
  jobNumber?: string;
}

interface EditData {
  title: string;
  location: string;
  notes: string;
  quantity: string;
  trackingNumber: string;
  carrier: string;
}

function detectCarrier(tracking: string) {
  const t = (tracking || '').toUpperCase().replace(/\s/g, '');
  if (t.startsWith('1Z')) return 'UPS';
  if (t.length === 12 || t.length === 15 || t.length === 20) return 'FedEx';
  if (t.startsWith('TBA')) return 'Amazon';
  if (t.length >= 22) return 'USPS';
  return 'Other';
}

export function ItemDetailsModal({ isOpen, onClose, itemId, type, zones = [], onOpenIntake }: ItemDetailsModalProps) {
  const { tenantId } = useAuthStore();
  const [item, setItem] = useState<ItemData | null>(null);
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Barcode Scanner State
  const [isScanningTracking, setIsScanningTracking] = useState(false);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);

  // Edit State
  const [editData, setEditData] = useState<EditData>({
    title: '',
    location: '',
    notes: '',
    quantity: '',
    trackingNumber: '',
    carrier: 'UPS'
  });

  const collectionName = type === 'part' ? 'parts_requests' : 'shipments';

  useEffect(() => {
    if (!isOpen || !itemId || !tenantId) return;
    
    Promise.resolve().then(() => {
      setLoading(true);
    });
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/${collectionName}`, itemId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as ItemData;
        setItem(data);
        
        // Initialize edit data
        setEditData({
          title: data.partName || data.description || '',
          location: data.location || '',
          notes: data.notes || '',
          quantity: data.quantity?.toString() || '1',
          trackingNumber: data.trackingNumber || '',
          carrier: data.carrier || 'UPS'
        });

        // Fetch job if applicable
        if (data.jobId) {
          onSnapshot(doc(db, `businesses/${tenantId}/jobs`, data.jobId), (jobSnap) => {
            if (jobSnap.exists()) {
              setJob({ id: jobSnap.id, ...jobSnap.data() } as JobData);
            }
          });
        }
      } else {
        toast.error("Item record not found.");
        onClose();
      }
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, itemId, tenantId, collectionName, onClose]);

  const handleUpdateStatus = useCallback(async (newStatus: string) => {
    if (!tenantId || !itemId) return;
    try {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        statusChangedAt: serverTimestamp()
      };
      
      if (newStatus === 'delivered') {
        updateData.putAwayAt = serverTimestamp();
      }

      await updateDoc(doc(db, `businesses/${tenantId}/${collectionName}`, itemId), updateData);
      toast.success(`Status updated to ${newStatus}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  }, [tenantId, itemId, collectionName]);

  // Camera Actions
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setCameraStream(stream);
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error("Failed to access camera");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  }, [cameraStream]);

  useEffect(() => {
    if (isCameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(err => console.error("Video play failed:", err));
    }
  }, [isCameraActive, cameraStream]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !tenantId || !itemId) return;
    setIsUploading(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get 2D context");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Failed to capture image blob");
          setIsUploading(false);
          return;
        }
        try {
          const folder = type === 'part' ? 'parts' : 'shipments';
          const file = new File([blob], `snap_${Date.now()}.jpg`, { type: 'image/jpeg' });
          const storageRef = ref(storage, `businesses/${tenantId}/${folder}/${itemId}/${Date.now()}_snap.jpg`);
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          
          await updateDoc(doc(db, `businesses/${tenantId}/${collectionName}`, itemId), {
            images: arrayUnion(url),
            updatedAt: serverTimestamp()
          });
          toast.success("Photo captured and uploaded successfully!");
          stopCamera();
        } catch (uploadErr) {
          const errMessage = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          console.error(uploadErr);
          toast.error(`Upload failed: ${errMessage}`);
        } finally {
          setIsUploading(false);
        }
      }, 'image/jpeg', 0.95);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(err);
      toast.error(`Capture failed: ${errMessage}`);
      setIsUploading(false);
    }
  }, [tenantId, itemId, type, collectionName, stopCamera]);

  // Barcode Scanner Actions
  const startTrackingScanner = useCallback(() => {
    setIsScanningTracking(true);
  }, []);

  const stopTrackingScanner = useCallback(() => {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setIsScanningTracking(false);
  }, []);

  const toggleTrackingScanner = useCallback(() => {
    if (isScanningTracking) {
      stopTrackingScanner();
    } else {
      startTrackingScanner();
    }
  }, [isScanningTracking, stopTrackingScanner, startTrackingScanner]);

  useEffect(() => {
    if (isScanningTracking && scannerVideoRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      
      reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        scannerVideoRef.current,
        (result: Result | null | undefined) => {
          if (result) {
            const text = result.getText().trim();
            setEditData((prev) => ({
              ...prev,
              trackingNumber: text,
              carrier: detectCarrier(text)
            }));
            toast.success(`Barcode Scanned: ${text}`);
            stopTrackingScanner();
          }
        }
      ).then(controls => {
        scannerControlsRef.current = controls;
      }).catch(err => {
        console.error("Mini scanner start failed, trying fallback:", err);
        reader.decodeFromVideoDevice(
          undefined,
          scannerVideoRef.current!,
          (result) => {
            if (result) {
              const text = result.getText().trim();
              setEditData((prev) => ({
                ...prev,
                trackingNumber: text,
                carrier: detectCarrier(text)
              }));
              toast.success(`Barcode Scanned: ${text}`);
              stopTrackingScanner();
            }
          }
        ).then(controls => {
          scannerControlsRef.current = controls;
        }).catch(e => {
          console.error("Total scanner failure:", e);
          toast.error("Failed to start barcode scanner");
          setIsScanningTracking(false);
        });
      });
    }

    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
      }
    };
  }, [isScanningTracking, stopTrackingScanner]);

  const handleSave = useCallback(async () => {
    if (!tenantId || !itemId) return;
    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        notes: editData.notes,
        updatedAt: serverTimestamp()
      };

      if (type === 'part') {
        updateData.partName = editData.title;
        updateData.quantity = parseInt(editData.quantity) || 1;
        updateData.location = editData.location;
      } else {
        updateData.description = editData.title;
        updateData.location = editData.location;
      }

      // Shared tracking info
      updateData.trackingNumber = editData.trackingNumber;
      updateData.carrier = editData.carrier;

      await updateDoc(doc(db, `businesses/${tenantId}/${collectionName}`, itemId), updateData);
      setIsEditing(false);
      toast.success("Details updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update item");
    } finally {
      setIsSaving(false);
    }
  }, [tenantId, itemId, type, collectionName, editData]);

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';
      
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isCameraActive) {
          stopCamera();
        } else if (isScanningTracking) {
          stopTrackingScanner();
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      } else if (e.key === 'e' && !isEditing && !isInput) {
        e.preventDefault();
        setIsEditing(true);
      } else if (e.key === 'Enter' && e.ctrlKey && isEditing) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'c' && isEditing && !isInput) {
        e.preventDefault();
        if (isCameraActive) {
          stopCamera();
        } else {
          startCamera();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditing, isCameraActive, isScanningTracking, startCamera, stopCamera, stopTrackingScanner, handleSave]);

  const handleAddPhotos = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !tenantId || !itemId) return;

    setIsUploading(true);
    try {
      const urls: string[] = [];
      const folder = type === 'part' ? 'parts' : 'shipments';
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(storage, `businesses/${tenantId}/${folder}/${itemId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        urls.push(url);
      }
      
      await updateDoc(doc(db, `businesses/${tenantId}/${collectionName}`, itemId), {
        images: arrayUnion(...urls),
        updatedAt: serverTimestamp()
      });
      toast.success(`${urls.length} photo(s) added`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload photos");
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  }, [tenantId, itemId, type, collectionName]);

  const handleRemoveImage = useCallback(async (url: string) => {
    if (!tenantId || !itemId || !confirm("Remove this photo?")) return;
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/${collectionName}`, itemId), {
        images: arrayRemove(url),
        updatedAt: serverTimestamp()
      });
      toast.success("Photo removed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove photo");
    }
  }, [tenantId, itemId, collectionName]);

  const getTrackingUrl = useCallback((carrier: string | undefined, tracking: string | undefined) => {
    if (!tracking) return null;
    const t = tracking.trim();
    switch (carrier?.toUpperCase()) {
      case 'UPS': return `https://www.ups.com/track?tracknum=${t}`;
      case 'FEDEX': return `https://www.fedex.com/fedextrack/?tracknumbers=${t}`;
      case 'USPS': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
      case 'AMAZON': return `https://www.amazon.com/progress-tracker/package/ref=pt_redirect_ml?trackingId=${t}`;
      default: return null;
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div 
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between shrink-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-2xl",
              type === 'part' ? "bg-indigo-500/10" : "bg-emerald-500/10"
            )}>
              {type === 'part' ? (
                <ShoppingCart className="w-6 h-6 text-indigo-500" />
              ) : (
                <Package className="w-6 h-6 text-emerald-500" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white leading-none">
                {type === 'part' ? 'Internal Part Request' : 'Package Details'}
              </h2>
              <p className="text-sm text-zinc-500 mt-1.5 font-medium">
                {type === 'part' ? 'Inventory fulfillment tracking' : 'External shipment logs'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm"
              >
                <Edit3 className="w-4 h-4" />
                Edit
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded border border-zinc-300 dark:border-zinc-700 shadow-sm ml-1.5">E</kbd>
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          {loading || !item ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
              <p className="text-sm text-zinc-500 font-medium">Synchronizing record...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              
              {/* Left Column: Core Data & Status */}
              <div className="space-y-8">
                
                {/* Status Selector */}
                <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        item.status === 'ordered' ? "bg-amber-500/10 text-amber-500" :
                        item.status === 'received' ? "bg-emerald-500/10 text-emerald-500" :
                        "bg-indigo-500/10 text-indigo-500"
                      )}>
                        {item.status === 'ordered' ? <Truck className="w-5 h-5" /> :
                         item.status === 'received' ? <MapPin className="w-5 h-5" /> :
                         <CheckCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 leading-none mb-1">Current Status</p>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white capitalize">{item.status}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['ordered', 'received', 'delivered'].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleUpdateStatus(s)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border cursor-pointer",
                          item.status === s 
                            ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
                            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-indigo-500/50"
                        )}
                      >
                        {s === 'delivered' ? 'Processed' : s}
                      </button>
                    ))}
                  </div>

                  {item.status === 'ordered' && onOpenIntake && (
                    <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                      <button 
                        onClick={onOpenIntake}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                      >
                        <Package className="w-5 h-5" />
                        Receive Package with Scanner
                      </button>
                    </div>
                  )}
                </div>

                {/* Main Fields */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">
                      {type === 'part' ? 'Part Name' : 'Package Description'}
                    </label>
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editData.title}
                        onChange={(e) => setEditData((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                        placeholder={type === 'part' ? 'e.g. Brake Pads' : 'e.g. Office Supplies'}
                      />
                    ) : (
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white text-lg">
                        {type === 'part' ? item.partName : item.description}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">
                        {type === 'part' ? 'Quantity' : 'Tracking Number'}
                      </label>
                      {isEditing && type === 'part' ? (
                        <input 
                          type="number"
                          value={editData.quantity}
                          onChange={(e) => setEditData((prev) => ({ ...prev, quantity: e.target.value }))}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                        />
                      ) : (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white truncate">
                          {type === 'part' ? `${item.quantity || 1} Units` : (item.trackingNumber || 'Manual Entry')}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Destination / Location</label>
                      {isEditing ? (
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <select 
                            value={editData.location}
                            onChange={(e) => setEditData((prev) => ({ ...prev, location: e.target.value }))}
                            className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none font-bold cursor-pointer"
                          >
                            <option value="">Select Location...</option>
                            {zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-500" />
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {item.location || 'Staging Area'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {type === 'part' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Assigned Job</label>
                      <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" />
                        <p className="text-xs font-bold text-zinc-900 dark:text-white">
                          {job ? `#${job.jobNumber} - ${job.title}` : 'General Inventory'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Tracking Number</label>
                      {isEditing ? (
                        <div className="relative">
                          <input 
                            type="text"
                            value={editData.trackingNumber}
                            onChange={(e) => setEditData((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                            className="w-full pl-4 pr-12 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
                            placeholder="Tracking #"
                          />
                          <button 
                            type="button"
                            onClick={toggleTrackingScanner}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl shadow-sm transition-all"
                            title="Scan Tracking Barcode"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white truncate">
                          {item.trackingNumber || 'No tracking provided'}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Carrier</label>
                      {isEditing ? (
                        <select 
                          value={editData.carrier}
                          onChange={(e) => setEditData((prev) => ({ ...prev, carrier: e.target.value }))}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none font-bold"
                        >
                          {['UPS', 'FEDEX', 'USPS', 'AMAZON', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white">
                          {item.carrier || 'N/A'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Miniature scanner view inside tracking field area */}
                  {isEditing && isScanningTracking && (
                    <div className="space-y-2 border border-dashed border-indigo-500/50 p-4 rounded-2xl bg-indigo-500/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Miniature ZXing Barcode Reader</span>
                        <button type="button" onClick={stopTrackingScanner} className="text-xs font-bold text-zinc-500 hover:text-red-500 uppercase">Cancel</button>
                      </div>
                      <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden shadow-inner">
                        <video ref={scannerVideoRef} className="w-full h-full object-cover" playsInline muted />
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Notes & Handling</label>
                    {isEditing ? (
                      <textarea 
                        value={editData.notes}
                        onChange={(e) => setEditData((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={3}
                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm"
                        placeholder="Add handling instructions or internal notes..."
                      />
                    ) : (
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 min-h-[100px]">
                        <p className={cn(
                          "text-sm leading-relaxed",
                          item.notes ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 italic"
                        )}>
                          {item.notes || 'No specific notes provided for this item.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      SAVE CHANGES
                      <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold bg-white/20 text-white rounded shadow-sm ml-1.5">Ctrl + Enter</kbd>
                    </button>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold rounded-2xl transition-all text-sm cursor-pointer"
                    >
                      CANCEL
                      <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-400 rounded border border-zinc-300 dark:border-zinc-600 shadow-sm ml-1.5">Esc</kbd>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Photos & History */}
              <div className="space-y-8">
                
                {/* Image Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Documentation Photos
                    </h3>
                    <div className="flex items-center gap-2">
                      {isEditing && (
                        <button 
                          onClick={isCameraActive ? stopCamera : startCamera}
                          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl cursor-pointer hover:bg-indigo-500/20 transition-all text-xs font-bold text-indigo-600 dark:text-indigo-400"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          {isCameraActive ? 'Close Camera' : 'Snap Photo'}
                          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded border border-zinc-300 dark:border-zinc-700 shadow-sm ml-1.5">C</kbd>
                        </button>
                      )}
                      <label className={cn(
                        "flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl cursor-pointer hover:bg-indigo-500/20 transition-all group",
                        (isUploading || isCameraActive) && "opacity-50 pointer-events-none"
                      )}>
                        {isUploading ? (
                          <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                        ) : (
                          <ImagePlus className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
                        )}
                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          {isUploading ? 'Uploading...' : 'Add Photos'}
                        </span>
                        <input type="file" multiple accept="image/*" capture="environment" className="hidden" onChange={handleAddPhotos} disabled={isCameraActive} />
                      </label>
                    </div>
                  </div>

                  {/* Inline Camera Viewport */}
                  {isEditing && isCameraActive && (
                    <div className="space-y-3 p-4 border border-indigo-500/30 bg-indigo-500/5 rounded-3xl animate-in zoom-in-95 duration-300">
                      <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden shadow-inner">
                        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                        {isUploading && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-2">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-xs font-bold uppercase tracking-widest">Saving...</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          type="button" 
                          onClick={capturePhoto} 
                          disabled={isUploading}
                          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Snap Photo
                        </button>
                        <button 
                          type="button" 
                          onClick={stopCamera} 
                          className="px-4 py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {item.images?.map((url: string, idx: number) => (
                      <div key={idx} className="relative aspect-square rounded-3xl overflow-hidden border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 group">
                        <img 
                          src={url} 
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500" 
                          onClick={() => setSelectedImage(url)}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button 
                            onClick={() => setSelectedImage(url)}
                            className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-all transform translate-y-2 group-hover:translate-y-0 cursor-pointer"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleRemoveImage(url)}
                            className="p-2 bg-rose-500/80 hover:bg-rose-500 backdrop-blur-md rounded-full text-white transition-all transform translate-y-2 group-hover:translate-y-0 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!item.images || item.images.length === 0) && (
                      <div className="col-span-full py-12 flex flex-col items-center justify-center gap-3 bg-zinc-50/50 dark:bg-zinc-950/30 rounded-[2rem] border border-dashed border-zinc-200 dark:border-zinc-800">
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded-full">
                          <ImageIcon className="w-8 h-8 text-zinc-300" />
                        </div>
                        <p className="text-xs text-zinc-400 italic font-medium">No visual documentation captured.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Logistics / Timeline Section */}
                <div className="space-y-6">
                   <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-1">
                    <History className="w-4 h-4" />
                    Lifecycle Timeline
                  </h3>
                  
                  <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
                    
                    {/* Final Status */}
                    {item.putAwayAt && (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-1 p-1 bg-emerald-500 rounded-full ring-4 ring-white dark:ring-zinc-900 shadow-sm">
                          <CheckCircle className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">Processed & Fulfilled</span>
                          <span className="text-[10px] text-zinc-500 font-medium">
                            {item.putAwayAt.toDate?.().toLocaleString() || 'Recently'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Arrival Status */}
                    {item.status !== 'ordered' ? (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-1 p-1 bg-indigo-500 rounded-full ring-4 ring-white dark:ring-zinc-900 shadow-sm">
                          <Clock className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">Item Checked In</span>
                          <span className="text-xs text-zinc-500 mt-0.5 font-medium">Verified by {item.receivedBy || 'Internal Staff'}</span>
                          <span className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wider">
                            {item.statusChangedAt?.toDate?.().toLocaleString() || item.createdAt?.toDate?.().toLocaleString() || 'Timestamp Syncing...'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute -left-[19px] top-1 p-1 bg-amber-500/20 rounded-full ring-4 ring-white dark:ring-zinc-900 shadow-sm">
                          <Truck className="w-3 h-3 text-amber-600" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-tight">Awaiting Arrival</span>
                          <span className="text-[10px] text-zinc-400 italic">Expected via {item.carrier || 'Standard Freight'}</span>
                        </div>
                      </div>
                    )}

                    {/* Creation Status */}
                    <div className="relative opacity-60">
                      <div className="absolute -left-[19px] top-1 p-1 bg-zinc-400 rounded-full ring-4 ring-white dark:ring-zinc-900 shadow-sm">
                        <FileText className="w-3 h-3 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-tight">Record Initialized</span>
                        <span className="text-[10px] text-zinc-400 font-medium">
                          {item.createdAt?.toDate?.().toLocaleString() || 'Initial Entry'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* External Links */}
                  {type === 'shipment' && item.trackingNumber && (
                    <div className="pt-4">
                      {getTrackingUrl(item.carrier, item.trackingNumber) ? (
                        <a 
                          href={getTrackingUrl(item.carrier, item.trackingNumber)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 group hover:border-indigo-500/50 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <ExternalLink className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-bold text-zinc-900 dark:text-white">Track on {item.carrier}</span>
                          </div>
                          <BarcodeFormatIcon className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500" />
                        </a>
                      ) : (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                           <span className="text-xs text-zinc-500">Tracking: {item.trackingNumber}</span>
                           <span className="text-[10px] font-black text-indigo-500 uppercase">{item.carrier}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Image Preview Overlay */}
      {selectedImage && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 sm:p-10" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-8 right-8 p-3 bg-white/10 rounded-full text-white cursor-pointer"><X className="w-8 h-8" /></button>
          <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-2xl animate-in zoom-in-95" />
        </div>
      )}
    </div>
  );
}

function BarcodeFormatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" />
    </svg>
  );
}
