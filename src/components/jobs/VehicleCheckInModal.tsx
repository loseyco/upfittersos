import { useState, useEffect, useRef } from 'react';
import { X, CarFront, Gauge, MapPin, CheckCircle, ShieldCheck, AlertCircle, Camera, Loader2, QrCode, Plus, Camera as CameraIcon, ArrowLeft, ScanLine } from 'lucide-react';
import { SearchableCustomerSelect } from '../SearchableCustomerSelect';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import { db, storage } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { GuidedCameraWizard } from './GuidedCameraWizard';
import { VinScannerModal } from './VinScannerModal';

const CORE_CATEGORIES = [
    'Front',
    'Driver Side',
    'Rear',
    'Passenger Side',
    'Roof',
    'Interior Front',
    'Interior Rear',
    'Cargo Area'
];

export function VehicleCheckInModal({ 
    job, 
    onClose, 
    tenantId, 
    customer, 
    vehicle,
    standaloneAsPage = false,
    zones
}: { 
    job: any, 
    onClose: () => void, 
    tenantId: string, 
    customer?: any, 
    vehicle?: any,
    standaloneAsPage?: boolean,
    zones?: any[]
}) {
    const [loading, setLoading] = useState(false);
    const [mileageIn, setMileageIn] = useState<string>(vehicle?.mileage || '');
    const [parkedLocation, setParkedLocation] = useState<string>(job?.parkedLocation || '');
    const [vinVerified, setVinVerified] = useState<boolean>(job?.vinVerified || false);
    const [damageNotes, setDamageNotes] = useState<string>(job?.checkInNotes || '');
    const [companyCamProjectId, setCompanyCamProjectId] = useState<string>(job?.companyCamProjectId || '');
    const [localZones, setLocalZones] = useState<any[]>(zones || []);
    const [showVinScanner, setShowVinScanner] = useState(false);
    const [showTagScanner, setShowTagScanner] = useState(false);
    
    // Customers list
    const [allCustomers, setAllCustomers] = useState<any[]>([]);

    // Photos state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeCategory, setActiveCategory] = useState<string>('');
    const [wizardActive, setWizardActive] = useState(false);
    const [photos, setPhotos] = useState<{ id: string, category: string, file?: File, url?: string, progress: number, error?: boolean }[]>([]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        // If zones weren't passed down, fetch them
        let unsubZ = () => {};
        if (!zones || zones.length === 0) {
            unsubZ = onSnapshot(
                query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)),
                (snap) => setLocalZones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            );
        } else {
            setLocalZones(zones);
        }

        const unsubC = onSnapshot(
            query(collection(db, 'customers'), where('tenantId', '==', tenantId)),
            (snap) => setAllCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
        return () => {
            unsubZ();
            unsubC();
        };
    }, [tenantId, zones]);

    const handleCameraClick = (category: string) => {
        setActiveCategory(category);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const processNewFiles = (incoming: { category: string, file: File }[]) => {
        const newPhotos = incoming.map(inc => ({
            id: Math.random().toString(36).substring(7),
            category: inc.category,
            file: inc.file,
            progress: 0
        }));
        
        setPhotos(prev => [...prev, ...newPhotos]);
        
        newPhotos.forEach(photo => {
            const fileName = `${Date.now()}_${photo.id}_${photo.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
            const storageRef = ref(storage, `job_media/${tenantId}/${job.id}/${fileName}`);
            const uploadTask = uploadBytesResumable(storageRef, photo.file);
            
            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, progress } : p));
                }, 
                (err) => {
                    console.error("Upload error:", err);
                    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, error: true } : p));
                    toast.error(`Failed to upload ${photo.category} photo`);
                }, 
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, progress: 100, url: downloadURL } : p));
                }
            );
        });
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !activeCategory) return;
        const newFiles = Array.from(e.target.files);
        processNewFiles(newFiles.map(file => ({ category: activeCategory, file })));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleWizardComplete = (captures: { category: string, file: File }[]) => {
        setWizardActive(false);
        if (captures.length > 0) {
            processNewFiles(captures);
        }
    };

    const handleDeletePhoto = (id: string) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
    };

    const handleCheckIn = async () => {
        if (!vinVerified && vehicle?.vin) {
            toast.error("Please verify the VIN number against the physical vehicle.");
            return;
        }

        // Wait for uncompleted uploads
        if (photos.some(p => p.progress < 100 && !p.error)) {
            toast.error("Please wait for all photos to finish uploading.");
            return;
        }

        setLoading(true);
        try {
            if (mileageIn && vehicle?.id) {
                api.put(`/vehicles/${vehicle.id}`, { mileage: mileageIn, tenantId }).catch(console.error);
            }
            const updates: any = {
                status: 'In Progress',
                parkedLocation,
                vehicleDetails: {
                    ...job.vehicleDetails,
                    mileage: mileageIn
                },
                checkInNotes: damageNotes,
                companyCamProjectId,
                vinVerified,
                intakePhotos: photos.filter(p => p.url && !p.error).map(p => ({
                    url: p.url,
                    category: p.category,
                    id: p.id
                }))
            };

            // Non-blocking CompanyCam Sync if ID is known
            const uploadedUrls = photos.map(p => p.url).filter(Boolean);
            if (uploadedUrls.length > 0 && companyCamProjectId) {
                toast.promise(
                    api.post(`/jobs/${job.id}/companycam-photos`, { urls: uploadedUrls }),
                    {
                        loading: 'Syncing photos directly to CompanyCam...',
                        success: 'Vehicle walkaround secured in CompanyCam!',
                        error: 'Failed to sync to CompanyCam (Check settings)'
                    }
                ).catch(console.error);
            }

            await api.put(`/jobs/${job.id}`, { ...updates, tenantId });
            toast.success("Vehicle checked in!");
            onClose();
        } catch (err) {
            console.error(err);
            toast.error("Failed to check in vehicle.");
            setLoading(false);
        }
    };

    const renderPhotoSquare = (photo: any) => (
        <div key={photo.id} className="relative w-full aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-700 shadow-sm group">
            {photo.file && (
                <img src={URL.createObjectURL(photo.file)} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            )}
            {photo.progress < 100 && !photo.error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80 backdrop-blur-sm">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin mb-1" />
                    <span className="text-[10px] font-bold text-white">{Math.round(photo.progress)}%</span>
                </div>
            )}
            {photo.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/90 backdrop-blur-sm">
                    <AlertCircle className="w-6 h-6 text-white" />
                    <span className="absolute bottom-2 text-[8px] font-bold text-white uppercase text-center w-full">Failed</span>
                </div>
            )}
            {photo.progress === 100 && !photo.error && (
                <div className="absolute top-1.5 left-1.5 bg-green-500 rounded-full p-0.5 shadow-md">
                    <CheckCircle className="w-3 h-3 text-white" />
                </div>
            )}
            <button 
                onClick={() => handleDeletePhoto(photo.id)}
                className="absolute top-1.5 right-1.5 bg-red-500/90 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
            >
                <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-1.5 px-2 pointer-events-none">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/90 drop-shadow-md truncate block">{photo.category}</span>
            </div>
        </div>
    );

    const vinPhotos = photos.filter(p => p.category === 'VIN');
    const walkaroundPhotos = photos.filter(p => p.category !== 'VIN');

    const wrapperClass = standaloneAsPage 
        ? "h-full w-full overflow-y-auto bg-zinc-950"
        : "fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4 sm:p-6 overflow-y-auto";

    const innerClass = standaloneAsPage
        ? "bg-zinc-950 w-full max-w-7xl mx-auto flex flex-col min-h-screen animate-fade-in"
        : "bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in relative flex flex-col max-h-full";

    const headerClass = standaloneAsPage
        ? "p-4 sm:p-6 pb-4 border-b border-zinc-800 flex flex-col bg-zinc-900/40 relative shrink-0 pt-safe"
        : "p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 relative overflow-hidden shrink-0";

    return (
        <div className={wrapperClass}>
            {wizardActive && (
                <GuidedCameraWizard 
                    requiredCategories={CORE_CATEGORIES.filter(c => !walkaroundPhotos.some(p => p.category === c))}
                    onComplete={handleWizardComplete}
                    onCancel={() => setWizardActive(false)}
                />
            )}
            <div className={innerClass}>
                
                <div className={headerClass}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full pointer-events-none"></div>
                    
                    {standaloneAsPage && (
                        <div className="flex items-center gap-2 mb-6 relative z-10">
                            <button onClick={onClose} className="p-2 -ml-2 bg-zinc-800/50 hover:bg-zinc-700/80 rounded-full text-zinc-400 hover:text-white transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Back to Queue</span>
                        </div>
                    )}

                    <div className={`relative z-10 ${!standaloneAsPage && 'flex justify-between w-full items-start'}`}>
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-full mb-3 border border-blue-500/50">
                                <CarFront className="w-3 h-3" /> Vehicle Arrival
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none mb-1">Check-in Vehicle</h2>
                            <p className="text-sm font-bold text-zinc-500">{job?.title || 'Untitled Job'}</p>
                        </div>
                        
                        {!standaloneAsPage && (
                            <button onClick={onClose} className="p-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-full text-zinc-400 hover:text-white transition-colors relative z-10">
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 sm:p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 relative">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-1 ml-1">Customer Profile</div>
                            <SearchableCustomerSelect 
                                customers={allCustomers}
                                value={customer?.id || null}
                                onChange={async (cId) => {
                                    toast.loading("Reassigning customer...", { id: 'cust_upd' });
                                    try {
                                        const updates = !cId ? { customerId: null, tenantId } : { customerId: cId, tenantId };
                                        await api.put(`/jobs/${job.id}`, updates);
                                        toast.success("Customer reassigned", { id: 'cust_upd' });
                                    } catch (err) {
                                        toast.error("Failed to reassign customer", { id: 'cust_upd' });
                                    }
                                }}
                            />
                        </div>
                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-1">Vehicle</div>
                            <div className="text-sm text-white font-bold truncate">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown'}</div>
                        </div>
                    </div>

                    <div className="space-y-4 bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" /> Security & Verification
                            </h3>
                            {vinVerified && vinPhotos.length > 0 && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md shrink-0">
                                    Fully Verified
                                </span>
                            )}
                        </div>

                        {/* Primary Unified Scanner Action */}
                        <div 
                            className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl cursor-pointer hover:bg-blue-500/20 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group shadow-lg shadow-blue-500/5" 
                            onClick={() => setShowVinScanner(true)}
                        >
                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-inner">
                                    <ScanLine className="w-6 h-6" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black text-white tracking-wide uppercase">Scan Vehicle Barcode</span>
                                    <span className="text-[10px] text-blue-200/70 font-bold uppercase tracking-widest mt-0.5">Auto-extracts VIN & Captures Photo</span>
                                </div>
                            </div>
                            <div className="flex flex-col text-left sm:text-right w-full sm:w-auto bg-zinc-950/50 sm:bg-transparent p-3 sm:p-0 rounded-lg">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black mb-1">Current Expected VIN</span>
                                <span className="text-lg font-mono text-zinc-300 font-bold tracking-wider">{vehicle?.vin || "UNASSIGNED"}</span>
                            </div>
                        </div>

                        {/* Fallback / Manual Verification Panel */}
                        <div className="pt-4 border-t border-zinc-800/50 mt-2">
                            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-3 flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" /> Manual Override Options (If Unscannable)
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className={`p-3 rounded-xl border cursor-pointer hover:border-emerald-500/50 transition-colors flex items-center gap-3 ${vinVerified ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-950 border-zinc-800'}`} onClick={() => setVinVerified(!vinVerified)}>
                                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${vinVerified ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-zinc-900 border border-zinc-700'}`}>
                                        {vinVerified && <CheckCircle className="w-3.5 h-3.5" />}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-black uppercase tracking-widest leading-none ${vinVerified ? 'text-emerald-400' : 'text-zinc-400'}`}>Physical Match</span>
                                        <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Manual Verification</span>
                                    </div>
                                </div>

                                <div className="h-full">
                                    {vinPhotos.length === 0 ? (
                                        <button 
                                            onClick={() => handleCameraClick('VIN')}
                                            className="w-full h-full min-h-[50px] p-2 bg-zinc-950 border border-zinc-800 border-dashed rounded-xl flex items-center justify-center gap-2 hover:border-blue-500/50 transition-colors group"
                                        >
                                            <Camera className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest group-hover:text-blue-400">Manual Photo</span>
                                        </button>
                                    ) : (
                                        <div className="h-16 sm:h-full grid grid-cols-2 gap-2">
                                            {vinPhotos.map(renderPhotoSquare)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 mt-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500" /> State & Logistics
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 flex items-center gap-1.5">
                                    <QrCode className="w-3.5 h-3.5 text-indigo-400" /> Assigned Tracking Tags
                                </label>
                                {vehicle?.id ? (
                                    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col">
                                        {(vehicle.trackingTags && vehicle.trackingTags.length > 0) ? (
                                            <div className="flex flex-col">
                                                {vehicle.trackingTags.map((tag: string, i: number) => (
                                                    <div key={tag} className={`flex items-center justify-between group py-2 ${i > 0 ? 'border-t border-zinc-800/50' : ''}`}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded bg-indigo-500/10 flex items-center justify-center shrink-0">
                                                                <QrCode className="w-4 h-4 text-indigo-400" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[12px] font-black text-white uppercase tracking-widest truncate max-w-[120px]">{tag}</span>
                                                                <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mt-0.5 leading-none">Linked Hardware Tag</span>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={async () => {
                                                                toast.loading('Unlinking tag...', { id: 'tag_remove' });
                                                                try {
                                                                    await api.put(`/vehicles/${vehicle.id}`, { 
                                                                        trackingTags: vehicle.trackingTags.filter((t: string) => t !== tag) 
                                                                    });
                                                                    toast.success('Tag removed', { id: 'tag_remove' });
                                                                } catch (err) {
                                                                    toast.error('Failed to unlink', { id: 'tag_remove' });
                                                                }
                                                            }}
                                                            className="p-2 bg-zinc-900 border border-zinc-800 hover:bg-rose-500/10 hover:border-rose-500/20 text-zinc-500 hover:text-rose-400 rounded-xl transition-all"
                                                            title="Unlink Tag"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-4 text-center border border-dashed border-zinc-800 rounded-xl mb-3">
                                                <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">No tags assigned yet</span>
                                            </div>
                                        )}

                                        <button 
                                            onClick={() => setShowTagScanner(true)}
                                            className="w-full py-2.5 mt-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold uppercase tracking-widest text-[10px] rounded-lg transition-colors border border-indigo-500/20 flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Assign Pre-Printed Tag
                                        </button>
                                    </div>
                                ) : (
                                    <button className="w-full bg-zinc-900 border border-zinc-800 border-dashed rounded-xl px-4 py-3 text-zinc-600 font-bold focus:outline-none transition-all flex items-center justify-between cursor-not-allowed">
                                        <span>Save to Unlock Tags</span>
                                        <span className="text-[9px] uppercase tracking-widest bg-zinc-800/50 px-2 py-0.5 rounded text-zinc-500">Pending</span>
                                    </button>
                                )}
                            </div>

                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 flex items-center gap-1.5">
                                    <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Odometer (Miles)
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number"
                                        value={mileageIn}
                                        onChange={(e) => setMileageIn(e.target.value)}
                                        placeholder={vehicle?.mileage || "0"}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-white font-black text-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-500 uppercase tracking-widest">MI</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 flex items-center gap-1.5">
                                    <CameraIcon className="w-3.5 h-3.5 text-blue-400" /> CompanyCam Project ID
                                </label>
                                <input 
                                    type="text"
                                    value={companyCamProjectId}
                                    onChange={(e) => setCompanyCamProjectId(e.target.value.replace(/\D/g, ''))}
                                    placeholder="e.g. 103654588"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-black text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-sky-400" /> Initial Parking Location
                            </label>
                            <select 
                                value={parkedLocation}
                                onChange={(e) => setParkedLocation(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Unknown / Pending</option>
                                {localZones.filter(z => {
                                    const allowedTypes = ['Bay', 'Parking Spot', 'Parking', 'Door - Garage'];
                                    return allowedTypes.includes(z.type);
                                }).map(z => (
                                    <option key={z.id} value={z.label || z.name}>{z.label || z.name} {z.type ? `(${z.type})` : ''}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4 bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50">
                        <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            capture="environment" 
                            ref={fileInputRef} 
                            onChange={handleFileSelect} 
                            className="hidden" 
                        />
                        
                        <div className="mb-2">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-blue-400" /> Walkaround Walkthrough
                                </h3>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => setWizardActive(true)}
                                        className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 border border-blue-500/50 rounded-lg text-blue-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5"
                                    >
                                        <Camera className="w-3.5 h-3.5" /> Start Auto-Wizard
                                    </button>
                                    <div className="text-[10px] uppercase font-black tracking-widest bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 flex items-center gap-2">
                                        <span className="text-blue-400">{walkaroundPhotos.filter(p => !p.error && p.progress === 100).length}</span> 
                                        <span className="text-zinc-500">Captured</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                {CORE_CATEGORIES.map(category => {
                                    const photo = walkaroundPhotos.find(p => p.category === category);
                                    
                                    return (
                                        <div key={category} className="flex flex-col">
                                            {!photo ? (
                                                <button 
                                                    onClick={() => handleCameraClick(category)}
                                                    className="w-full aspect-square bg-zinc-900 border border-zinc-800 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 hover:bg-zinc-800/80 transition-colors group"
                                                >
                                                    <CameraIcon className="w-5 h-5 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 text-center px-1 group-hover:text-zinc-400">{category}</span>
                                                </button>
                                            ) : renderPhotoSquare(photo)}
                                        </div>
                                    );
                                })}

                                {walkaroundPhotos.filter(p => !CORE_CATEGORIES.includes(p.category)).map(photo => (
                                    <div key={photo.id} className="flex flex-col">
                                        {renderPhotoSquare(photo)}
                                    </div>
                                ))}

                                <div className="flex flex-col">
                                    <button 
                                        onClick={() => handleCameraClick('Misc')}
                                        className="w-full aspect-square bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 hover:bg-zinc-800/80 transition-colors group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
                                            <Plus className="w-4 h-4 text-zinc-400 group-hover:text-blue-400 transition-colors" />
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300">Add More</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-6 border-t border-zinc-800/50">
                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-3 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Existing Damage & Intake Notes
                            </label>
                            <textarea 
                                value={damageNotes}
                                onChange={(e) => setDamageNotes(e.target.value)}
                                placeholder="Describe any existing damage, unusual sounds, hidden items, or general observations..."
                                rows={3}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all placeholder:text-zinc-600 resize-none"
                            />
                        </div>
                    </div>
                </div>

                <div className={`p-6 border-t border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row justify-end gap-3 shrink-0 pb-safe ${!standaloneAsPage && 'rounded-b-3xl'}`}>
                    <button 
                        onClick={onClose}
                        disabled={loading}
                        className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCheckIn}
                        disabled={loading || photos.some(p => p.progress < 100 && !p.error)}
                        className="px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : <><CheckCircle className="w-4 h-4" /> Finalize Check-in</>}
                    </button>
                </div>

            </div>

            {showVinScanner && (
                <VinScannerModal 
                    onClose={() => setShowVinScanner(false)}
                    onScan={async (scannedVin, imageBlob) => {
                        toast.loading("Saving scanned VIN...", { id: 'vin_save' });
                        try {
                            await api.put(`/vehicles/${vehicle.id}`, { vin: scannedVin });
                            setVinVerified(true);
                            toast.success("VIN updated successfully", { id: 'vin_save' });
                            
                            if (imageBlob) {
                                const file = new File([imageBlob], `vin-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
                                processNewFiles([{ category: 'VIN', file }]);
                                toast.success("VIN photo captured automatically");
                            }
                        } catch (err) {
                            toast.error("Failed to update VIN", { id: 'vin_save' });
                        }
                    }}
                />
            )}
            {showTagScanner && (
                <VinScannerModal 
                    title="Scan Pre-Printed Tag"
                    description="Scan any external QR tracker to assign it to this vehicle."
                    isQrMode={true}
                    onClose={() => setShowTagScanner(false)}
                    onScan={async (scannedUrl) => {
                        try {
                            toast.loading('Binding tag to vehicle...', { id: 'tag_bind' });
                            const urlParts = scannedUrl.split('/');
                            const tagId = urlParts[urlParts.length - 1]; // extracts the payload ID
                            
                            const currentTags = vehicle?.trackingTags || [];
                            if (!currentTags.includes(tagId)) {
                                await api.put(`/vehicles/${vehicle.id}`, { 
                                    trackingTags: [...currentTags, tagId] 
                                });
                                toast.success('Tag successfully bound', { id: 'tag_bind' });
                            } else {
                                toast.error('Tag already assigned to this unit', { id: 'tag_bind' });
                            }
                        } catch (err) {
                            toast.error('Failed to bind tag', { id: 'tag_bind' });
                        }
                    }}
                />
            )}
        </div>
    );
}
