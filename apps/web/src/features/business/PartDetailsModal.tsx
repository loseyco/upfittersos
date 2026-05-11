import React, { useState, useEffect } from 'react';
import { X, Box, Loader2, UploadCloud, Image as ImageIcon, Trash2, ShieldAlert, Activity, User } from 'lucide-react';
import { db, storage } from '../../lib/firebase/config';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuthStore } from '../../lib/auth/store';
import { toast } from 'sonner';

interface PartDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  partId: string | null;
}

export function PartDetailsModal({ isOpen, onClose, partId }: PartDetailsModalProps) {
  const { tenantId } = useAuthStore();
  const [part, setPart] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!isOpen || !partId || !tenantId) return;
    
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/inventory_items`, partId), (docSnap) => {
      if (docSnap.exists()) {
        setPart({ id: docSnap.id, ...docSnap.data() });
      } else {
        toast.error("Part not found.");
        onClose();
      }
    });

    return () => unsub();
  }, [isOpen, partId, tenantId]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !tenantId || !partId) return;

    setIsUploading(true);
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const storageRef = ref(storage, `businesses/${tenantId}/parts/${partId}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => reject(error),
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Update firestore
              await updateDoc(doc(db, `businesses/${tenantId}/inventory_items`, partId), {
                images: arrayUnion(downloadURL)
              });
              await updateDoc(doc(db, `businesses/${tenantId}/qb_items`, partId), {
                images: arrayUnion(downloadURL)
              });
              
              successCount++;
              resolve();
            }
          );
        });
      } catch (err) {
        console.error("Upload error", err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} image(s)`);
    }
    setIsUploading(false);
    setUploadProgress(0);
    e.target.value = '';
  };

  const handleRemoveImage = async (url: string) => {
    if (!tenantId || !partId) return;
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/inventory_items`, partId), {
        images: arrayRemove(url)
      });
      await updateDoc(doc(db, `businesses/${tenantId}/qb_items`, partId), {
        images: arrayRemove(url)
      });
      toast.success("Image removed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove image");
    }
  };

  if (!isOpen || !partId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Glass Backdrop */}
      <div 
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl">
              <Box className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white leading-none">Part Details</h2>
              <p className="text-sm text-zinc-500 mt-1">Inventory Information & Assets</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          {part ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Details */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{part.name}</h3>
                  <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold mt-1 flex items-center gap-2">
                    SKU: <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-900 dark:text-zinc-300">{part.sku || 'N/A'}</span>
                  </p>
                </div>

                {part.description && (
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                      {part.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">On Hand</p>
                    <p className="text-3xl font-black text-zinc-900 dark:text-white">{part.quantityOnHand ?? 0}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">On Order</p>
                    <p className="text-3xl font-black text-indigo-500">{part.quantityOnOrder ?? 0}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-amber-500 mb-1">Committed (SO)</p>
                    <p className="text-3xl font-black text-amber-600 dark:text-amber-500">{part.quantityOnSalesOrder ?? 0}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Min (Reorder)</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-white">{part.minCount ?? 'N/A'}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Max Level</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-white">{part.maxCount ?? 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-zinc-500">MPN</span>
                    <span className="text-sm font-mono text-zinc-900 dark:text-white">{part.mpn || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-zinc-500">Barcode</span>
                    <span className="text-sm font-mono text-zinc-900 dark:text-white">{part.barcode || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-zinc-500">Sales Price</span>
                    <span className="text-sm font-bold text-emerald-600">${part.price?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-zinc-500">Status</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-emerald-500/10 text-emerald-600 rounded-full">{part.status}</span>
                  </div>
                  {part.preferredVendor && (
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm font-semibold text-zinc-500">Pref. Vendor</span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{part.preferredVendor}</span>
                    </div>
                  )}
                  {part.unitOfMeasure && (
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm font-semibold text-zinc-500">Unit of Measure</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg">{part.unitOfMeasure}</span>
                    </div>
                  )}
                  {part.className && (
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm font-semibold text-zinc-500">Class</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-indigo-500/10 text-indigo-600 rounded-lg">{part.className}</span>
                    </div>
                  )}
                </div>

                {(Number(part.quantityOnHand) <= Number(part.minCount)) && Number(part.minCount) > 0 && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-600">Low Stock Alert</p>
                      <p className="text-xs text-red-500/80 mt-1">This item is at or below the minimum reorder point.</p>
                    </div>
                  </div>
                )}

                {part.qbCustomFields && Object.keys(part.qbCustomFields).length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Custom Fields</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(part.qbCustomFields).map(([key, value]) => (
                        <div key={key} className="bg-zinc-50 dark:bg-zinc-800/30 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-500 mb-0.5">{key}</p>
                          <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Assets */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Part Assets
                  </h3>
                  
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors text-xs font-bold uppercase tracking-widest">
                      <UploadCloud className="w-4 h-4" />
                      Upload
                    </div>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleFiles}
                      disabled={isUploading}
                    />
                  </label>
                </div>

                {isUploading && (
                  <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 p-4 rounded-2xl flex items-center gap-4">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs font-bold text-indigo-600 mb-1">
                        <span>Uploading...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="h-1.5 bg-indigo-500/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!part.images || part.images.length === 0 ? (
                  <div className="aspect-square flex flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-800/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 text-center text-zinc-500">
                    <ImageIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
                    <div>
                      <p className="font-bold text-zinc-700 dark:text-zinc-300">No images yet</p>
                      <p className="text-xs mt-1">Upload pictures to identify this part easily.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {part.images.map((url: string, idx: number) => (
                      <div key={idx} className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                        <img 
                          src={url} 
                          alt={`${part.name} view ${idx + 1}`} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
                          <button 
                            onClick={() => handleRemoveImage(url)}
                            className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-xl backdrop-blur-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {part.activities && part.activities.length > 0 && (
              <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Activity History
                </h3>
                <div className="space-y-4">
                  {[...part.activities].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((act: any, idx: number) => (
                    <div key={idx} className="flex gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800 rounded-2xl">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          {act.type === 'created' ? 'Created' : 'System Update'}
                          <span className="text-[10px] font-normal text-zinc-500 bg-zinc-200/50 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{new Date(act.date).toLocaleString()}</span>
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{act.message}</p>
                        {act.user && <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><User className="w-3 h-3" /> {act.user}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
