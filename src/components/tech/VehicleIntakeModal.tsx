import React, { useState } from 'react';
import { X, Camera, Car, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';

interface VehicleIntakeModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobId: string;
    existingIntake?: any;
    vehicleName: string;
}

export function VehicleIntakeModal({ isOpen, onClose, jobId, existingIntake, vehicleName }: VehicleIntakeModalProps) {
    const { tenantId, currentUser } = useAuth();
    const [mileage, setMileage] = useState(existingIntake?.mileage || '');
    const [fuelLevel, setFuelLevel] = useState(existingIntake?.fuelLevel || '1/2');
    const [notes, setNotes] = useState(existingIntake?.notes || '');
    const [photos, setPhotos] = useState<any[]>(existingIntake?.photos || []);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !tenantId || !jobId) return;
        setUploading(true);
        try {
            const storage = getStorage();
            const newPhotos = [...photos];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                const storageRef = ref(storage, `job_media/${tenantId}/${jobId}/intake_${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file, { contentType: file.type });
                const url = await getDownloadURL(storageRef);
                newPhotos.push({
                    url,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: currentUser?.displayName || 'Tech'
                });
            }
            setPhotos(newPhotos);
            toast.success("Intake photos uploaded locally, remember to save process.");
        } catch (err) {
            console.error(err);
            toast.error("Failed to upload photos");
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!tenantId || !jobId) return;
        setSaving(true);
        try {
            const jobRef = doc(db, 'jobs', jobId);
            const intakeData = {
                mileage,
                fuelLevel,
                notes,
                photos,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser?.displayName || 'Tech'
            };
            await updateDoc(jobRef, { vehicleIntake: intakeData });
            toast.success("Vehicle Intake Saved!");
            onClose();
        } catch (e) {
            console.error(e);
            toast.error("Failed to save intake");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Car className="w-5 h-5 text-indigo-400" /> Vehicle Intake Form
                        </h2>
                        <p className="text-sm text-zinc-400 font-mono mt-1">{vehicleName}</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 hover:bg-zinc-800 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Current Mileage</label>
                            <input 
                                type="number" 
                                value={mileage}
                                onChange={(e) => setMileage(e.target.value)}
                                placeholder="e.g. 45000"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Fuel Level</label>
                            <select 
                                value={fuelLevel}
                                onChange={(e) => setFuelLevel(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white"
                            >
                                <option value="Empty">Empty</option>
                                <option value="1/4">1/4 Tank</option>
                                <option value="1/2">1/2 Tank</option>
                                <option value="3/4">3/4 Tank</option>
                                <option value="Full">Full Tank</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Existing Damage / Notes</label>
                        <textarea 
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Note any existing scratches, dents, or interior damage prior to work..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white h-24 resize-none"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Intake Photos (4 Corners & Dash)</label>
                            <div>
                                <input type="file" id="intakePhotoUpload" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                                <label htmlFor="intakePhotoUpload" className={`text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded transition-colors font-bold flex items-center gap-1 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {uploading ? <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-r-transparent rounded-full animate-spin" /> : <Camera className="w-3.5 h-3.5"/>}
                                    Add Photos
                                </label>
                            </div>
                        </div>
                        {photos.length === 0 ? (
                            <div className="text-zinc-600 bg-zinc-950/50 rounded-xl p-6 border border-zinc-800/50 border-dashed text-center text-sm font-medium">
                                No intake photos added.
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {photos.map((photo, i) => (
                                    <div key={i} className="aspect-square bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative group">
                                        <img src={photo.url} alt={`Intake ${i}`} className="w-full h-full object-cover" />
                                        <button 
                                            onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                                            className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-zinc-800/80 shrink-0 flex justify-end gap-3 bg-zinc-900/50 rounded-b-2xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-indigo-500 text-white hover:bg-indigo-600 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Intake Form
                    </button>
                </div>
            </div>
        </div>
    );
}
