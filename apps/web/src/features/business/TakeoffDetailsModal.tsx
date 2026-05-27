import { useState, type ChangeEvent } from 'react';
import { X, Camera, Loader2, Package, CheckCircle, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '../../lib/firebase/config';
import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuthStore } from '../../lib/auth/store';
import { SearchableSelect } from './SearchableSelect';

interface TakeoffDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  jobId: string;
  zones: { id: string; name: string; type: string }[];
  takeoffToEdit?: any; // For future edit support
}

export function TakeoffDetailsModal({ isOpen, onClose, onSuccess, jobId, takeoffToEdit }: TakeoffDetailsModalProps) {
  const { tenantId, user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState(takeoffToEdit?.name || '');
  const [serialNumber, setSerialNumber] = useState(takeoffToEdit?.serialNumber || '');
  const [condition, setCondition] = useState(takeoffToEdit?.condition || 'Good');
  const [location, setLocation] = useState(takeoffToEdit?.location || '');
  const [notes, setNotes] = useState(takeoffToEdit?.notes || '');
  
  // Image State
  const [images, setImages] = useState<{file: File, preview: string}[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(takeoffToEdit?.photoUrls || []);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);
    setImages(prev => [...prev, { file, preview }]);
    e.target.value = '';
  };

  const removeNewImage = (index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };
  
  const removeExistingImage = (index: number) => {
    setExistingImages(prev => {
      const newImages = [...prev];
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !jobId) return;

    setIsSubmitting(true);
    try {
      let docRef;
      
      const payload = {
        name: name.trim(),
        serialNumber: serialNumber.trim(),
        condition,
        location: location.trim(),
        notes: notes.trim(),
        photoUrls: existingImages, // Will append new ones
        updatedAt: serverTimestamp(),
      };

      if (takeoffToEdit) {
        docRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`, takeoffToEdit.id);
        await updateDoc(docRef, payload);
      } else {
        docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || 'system',
          createdByName: user?.displayName || user?.email?.split('@')[0] || null,
        });
      }

      // Upload new images
      if (images.length > 0) {
        setIsUploadingImages(true);
        const imageUrls: string[] = [...existingImages];
        
        for (const imgItem of images) {
          const storageRef = ref(storage, `businesses/${tenantId}/jobs/${jobId}/takeoffs/${docRef.id}/${Date.now()}_${imgItem.file.name}`);
          const snapshot = await uploadBytes(storageRef, imgItem.file);
          const url = await getDownloadURL(snapshot.ref);
          imageUrls.push(url);
        }

        await updateDoc(docRef, { photoUrls: imageUrls });
      }
      
      // Log Activity on Job
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), {
        type: takeoffToEdit ? 'takeoff_updated' : 'takeoff_added',
        message: takeoffToEdit ? `Updated removed part: ${payload.name}` : `Logged removed part: ${payload.name}`,
        timestamp: serverTimestamp(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
      });

      toast.success(`Removed part ${takeoffToEdit ? 'updated' : 'logged'} successfully!`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error("Submit failed:", err);
      toast.error(`Failed to save part: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSerialNumber('');
    setCondition('Good');
    setLocation('');
    setNotes('');
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setExistingImages([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div 
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-white/10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-2xl">
              <Wrench className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white leading-none">
                {takeoffToEdit ? 'Edit Removed Part' : 'Log Removed Part'}
              </h2>
              <p className="text-sm text-zinc-500 mt-1">Record items taken off the vehicle</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Part Description</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Package className="w-4 h-4 text-zinc-400" />
                  </div>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Detective Strip, Radar System..."
                    className="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Serial Number</label>
                  <input 
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
                
                <div className="space-y-1.5 z-50">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Condition</label>
                  <SearchableSelect 
                    options={['Good', 'Broken', 'Missing Parts', 'Needs Repair', 'Unknown']}
                    value={condition}
                    onChange={v => setCondition(v || 'Good')}
                    getLabel={v => v}
                    getValue={v => v}
                    theme="amber"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Location / Where is it?</label>
                <input 
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Back Seat, Shop Shelf 4..."
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Notes (Damage, missing items, etc)</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional details..."
                  rows={2}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none text-sm"
                />
              </div>

              {/* Multi-Image Capture Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Part Photos</label>
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">{existingImages.length + images.length} Photos</span>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                  {/* Add Photo Trigger */}
                  <label className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:border-amber-500/50 hover:text-amber-500 transition-all cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/50">
                    <Camera className="w-6 h-6" />
                    <span className="text-[8px] font-bold uppercase tracking-wider text-center px-2">Take Photo<br/>or Upload</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                  </label>

                  {/* Existing Previews */}
                  {existingImages.map((url, idx) => (
                    <div key={`existing-${idx}`} className="shrink-0 w-24 h-24 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative group">
                      <img src={url} className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => removeExistingImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* New Previews */}
                  {images.map((img, idx) => (
                    <div key={`new-${idx}`} className="shrink-0 w-24 h-24 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative group">
                      <img src={img.preview} className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => removeNewImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4 shrink-0">
              <button 
                type="button"
                onClick={handleClose}
                className="flex-1 py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isSubmitting || isUploadingImages || !name.trim() || !location.trim()}
                className="flex-[2] py-4 px-6 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
              >
                {isSubmitting || isUploadingImages ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs uppercase tracking-widest">{isUploadingImages ? 'Uploading Photos...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Save Removed Part
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
