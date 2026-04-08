import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../lib/api';
import { db, storage } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import { Save, ArrowLeft, Printer, CheckCircle, Wrench, Plus, Trash2, Box, Info, X, User, Car, PlusCircle, UserPlus, ClipboardList, Loader2 } from 'lucide-react';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import { CustomerSelector, StaffSelector, InventorySelector, TaskTemplateSelector } from '../../../components/EntitySelectors';

const toDateTimeLocal = (val: any) => {
    if (!val) return '';
    // If it's already a local-compatible ISO string from a previous save, return it as-is
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) return val.slice(0, 16);
    
    // Handle Firestore Timestamp or Date object or ISO string
    const date = (val && typeof val.toDate === 'function') ? val.toDate() : new Date(val);
    if (isNaN(date.getTime())) return '';
    
    // For non-formatted values (like Timestamps), adjust for local timezone to get proper YYYY-MM-DDTHH:mm
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
};

export function EstimateBuilder() {
    const { tenantId, currentUser } = useAuth();
    const { jobId } = useParams();
    const navigate = useNavigate();

    const [job, setJob] = useState<any>(null);
    const [originalJob, setOriginalJob] = useState<any>(null);
    const [customer, setCustomer] = useState<any>(null);
    const [originalCustomer, setOriginalCustomer] = useState<any>(null);
    const [vehicle, setVehicle] = useState<any>(null);
    const [originalVehicle, setOriginalVehicle] = useState<any>(null);

    const [allCustomers, setAllCustomers] = useState<any[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('new');

    const [allVehicles, setAllVehicles] = useState<any[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('new');


    const [allStaff, setAllStaff] = useState<any[]>([]);
    const [allInventory, setAllInventory] = useState<any[]>([]);
    const [allTemplates, setAllTemplates] = useState<any[]>([]);
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [businessSettings, setBusinessSettings] = useState<{ burdenMultiplier: number, standardShopRate: number }>({ burdenMultiplier: 1.3, standardShopRate: 150 });
    
    const [ccPhotos, setCcPhotos] = useState<any[]>([]);
    const [loadingCcPhotos, setLoadingCcPhotos] = useState(false);

    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const loadJob = async () => {
            if (!tenantId || !jobId) return;

            if (jobId === 'new') {
                const newJob = { title: 'New Job Intake', description: '', status: 'Estimate', tasks: [] };
                setJob(newJob);
                setOriginalJob(JSON.parse(JSON.stringify(newJob)));

                const newCustomer = { firstName: '', lastName: '', company: '', email: '', phone: '', mobile: '', addressStreet: '', addressCity: '', addressState: '', addressZip: '' };
                setCustomer(newCustomer);
                setOriginalCustomer(JSON.parse(JSON.stringify(newCustomer)));

                const newVehicle = { year: '', make: '', model: '', vin: '' };
                setVehicle(newVehicle);
                setOriginalVehicle(JSON.parse(JSON.stringify(newVehicle)));

                setLoading(false);
                return;
            }

            try {
                const jSnap = await getDoc(doc(db, 'jobs', jobId));
                if (jSnap.exists()) {
                    const data = jSnap.data();
                    const formatted = {
                        ...data,
                        id: jSnap.id,
                        tasks: data.tasks || [],
                        dropoffEta: data.dropoffEta ? toDateTimeLocal(data.dropoffEta) : '',
                        completionEta: data.completionEta ? toDateTimeLocal(data.completionEta) : ''
                    };
                    setJob(formatted);
                    setOriginalJob(JSON.parse(JSON.stringify(formatted)));

                    if (data.customerId) {
                        const cSnap = await getDoc(doc(db, 'customers', data.customerId));
                        if (cSnap.exists()) {
                            const cData = { ...cSnap.data(), id: cSnap.id };
                            setCustomer(cData);
                            setOriginalCustomer(JSON.parse(JSON.stringify(cData)));
                            setSelectedCustomerId(cSnap.id);
                        }
                    } else {
                        const empty = { firstName: '', lastName: '', company: '', email: '', phone: '', mobile: '', addressStreet: '', addressCity: '', addressState: '', addressZip: '' };
                        setCustomer(empty); setOriginalCustomer(empty);
                    }
                    if (data.vehicleId) {
                        const vSnap = await getDoc(doc(db, 'vehicles', data.vehicleId));
                        if (vSnap.exists()) {
                            const vData = { ...vSnap.data(), id: vSnap.id };
                            setVehicle(vData);
                            setOriginalVehicle(JSON.parse(JSON.stringify(vData)));
                            setSelectedVehicleId(vSnap.id);
                        }
                    } else {
                        const empty = { year: '', make: '', model: '', vin: '' };
                        setVehicle(empty); setOriginalVehicle(empty);
                    }
                }
                setLoading(false);
            } catch (err) {
                console.error("Failed to load job profile", err);
                toast.error("Failed to load data");
                setLoading(false);
            }
        };
        loadJob();
    }, [tenantId, jobId]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!tenantId) return;
            try {
                const q = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
                const snapshot = await getDocs(q);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const customersList = snapshot.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() }));
                setAllCustomers(customersList);

                const vQ = query(collection(db, 'vehicles'), where('tenantId', '==', tenantId));
                const vSnap = await getDocs(vQ);
                setAllVehicles(vSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() })));

                const invQ = query(collection(db, 'inventory_items'), where('tenantId', '==', tenantId));
                const invSnap = await getDocs(invQ);
                setAllInventory(invSnap.docs.map(docItem => ({ id: docItem.id, ...docItem.data() })));

                const tmplQ = query(collection(db, 'task_templates'), where('tenantId', '==', tenantId));
                const tmplSnap = await getDocs(tmplQ);
                setAllTemplates(tmplSnap.docs.map(docItem => ({ id: docItem.id, ...docItem.data() })));


                try {
                    const sRes = await api.get(`/businesses/${tenantId}/staff`);
                    setAllStaff(sRes.data || []);
                } catch (e) {
                    console.error("Failed to fetch staff", e);
                }

                try {
                    const bRes = await api.get(`/businesses/${tenantId}`);
                    setBusinessSettings({
                        burdenMultiplier: bRes.data.burdenMultiplier !== undefined ? Number(bRes.data.burdenMultiplier) : 1.3,
                        standardShopRate: bRes.data.standardShopRate !== undefined ? Number(bRes.data.standardShopRate) : 150
                    });
                } catch (e) {
                    console.error("Failed to fetch business settings", e);
                }
            } catch (e) {
                console.error("Failed to load side entities", e);
            }
        }
        loadInitialData();
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId || !jobId || jobId === 'new') return;
        const q = query(
            collection(db, 'businesses', tenantId, 'task_time_logs'),
            where('jobId', '==', jobId)
        );
        const unsub = onSnapshot(q, (snap: any) => {
            setTimeLogs(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [tenantId, jobId, db]);

    useEffect(() => {
        if (!job?.companyCamProjectId) return;
        const fetchPhotos = async () => {
            setLoadingCcPhotos(true);
            try {
                const res = await api.get(`/jobs/${jobId}/companycam-photos`);
                setCcPhotos(res.data || []);
            } catch (e) {
                console.error("Failed to fetch CompanyCam photos", e);
            } finally {
                setLoadingCcPhotos(false);
            }
        };
        fetchPhotos();
    }, [job?.companyCamProjectId, jobId]);

    const handleSave = async (showToast = true) => {
        if (!tenantId) return;
        try {
            setIsSaving(true);

            let finalCustId = customer?.id || job?.customerId;
            let finalVehId = vehicle?.id || job?.vehicleId;

            // Handle Customer (Upsert if new or edited)
            const customerHasChanges = JSON.stringify(customer) !== JSON.stringify(originalCustomer);
            if (customerHasChanges || (!finalCustId && (customer?.firstName || customer?.company))) {
                if (!finalCustId) {
                    const fName = customer.firstName || '';
                    const lName = customer.lastName || '';
                    const cName = customer.company || '';
                    const displayName = [fName, lName].filter(Boolean).join(' ') + (cName ? ` (${cName})` : '');

                    const custRes = await api.post('/customers', {
                        ...customer,
                        displayName,
                        tenantId,
                        syncStatus: 'pending_qb'
                    });
                    finalCustId = custRes.data.id || custRes.data.customerId;
                    setCustomer((prev: any) => ({ ...prev, id: finalCustId }));
                } else if (finalCustId && customer) {
                    await api.put(`/customers/${finalCustId}`, {
                        ...customer, tenantId
                    });
                }
            }

            // Handle Vehicle
            const vehicleHasChanges = JSON.stringify(vehicle) !== JSON.stringify(originalVehicle);
            if (vehicleHasChanges || (!finalVehId && (vehicle?.make || vehicle?.model || vehicle?.vin))) {
                if (!finalVehId) {
                    const vehRes = await api.post('/vehicles', {
                        ...vehicle,
                        customerId: finalCustId, // Attach to customer if we created one
                        tenantId
                    });
                    finalVehId = vehRes.data.id || vehRes.data.vehicleId;
                    setVehicle((prev: any) => ({ ...prev, id: finalVehId }));
                } else if (finalVehId && vehicle) {
                    await api.put(`/vehicles/${finalVehId}`, {
                        ...vehicle, tenantId
                    });
                }
            }

            let changeStrings: string[] = [];
            if (jobId !== 'new') {
                if (job.status !== originalJob.status) changeStrings.push(`Status \u2192 ${job.status}`);
                
                const oldTasks = originalJob.tasks || [];
                const newTasks = job.tasks || [];
                const oldTitles = oldTasks.map((t: any) => t.title || 'Untitled Task');
                const newTitles = newTasks.map((t: any) => t.title || 'Untitled Task');
                
                const addedTasks = newTitles.filter((t: string) => !oldTitles.includes(t));
                const removedTasks = oldTitles.filter((t: string) => !newTitles.includes(t));

                if (addedTasks.length > 0) changeStrings.push(`Added Task: ${addedTasks.join(', ')}`);
                if (removedTasks.length > 0) changeStrings.push(`Removed Task: ${removedTasks.join(', ')}`);
                
                // If tasks weren't purely added or removed, see precisely what was edited within existing tasks
                if (addedTasks.length === 0 && removedTasks.length === 0) {
                    oldTasks.forEach((oldT: any, i: number) => {
                        const newT = newTasks[i];
                        if (!newT) return;
                        const tTitle = newT.title || 'Untitled Task';
                        
                        if (oldT.bookTime !== newT.bookTime) changeStrings.push(`Updated hours on "${tTitle}" (${oldT.bookTime || 0} \u2192 ${newT.bookTime || 0})`);
                        if (oldT.laborRate !== newT.laborRate) changeStrings.push(`Updated rate on "${tTitle}"`);
                        
                        const oldTechs = (oldT.assignedUids || []).join(',');
                        const newTechs = (newT.assignedUids || []).join(',');
                        if (oldTechs !== newTechs) changeStrings.push(`Shifted technician assignment on "${tTitle}"`);

                        const oldPartsCount = (oldT.parts || []).length;
                        const newPartsCount = (newT.parts || []).length;
                        if (oldPartsCount !== newPartsCount) {
                            changeStrings.push(newPartsCount > oldPartsCount ? `Added part to "${tTitle}"` : `Removed part from "${tTitle}"`);
                        } else if (JSON.stringify(oldT.parts) !== JSON.stringify(newT.parts)) {
                            changeStrings.push(`Modified parts list on "${tTitle}"`);
                        }

                        if (oldT.notes !== newT.notes || oldT.sops !== newT.sops || oldT.directions !== newT.directions) {
                           changeStrings.push(`Updated directives/notes on "${tTitle}"`);
                        }
                    });
                }

                if (job.title !== originalJob.title) changeStrings.push(`Title changed`);
                if (job.description !== originalJob.description) changeStrings.push(`Scope notes updated`);
                if (job.dropoffEta !== originalJob.dropoffEta) changeStrings.push(`Drop-off ETA updated`);
                if (job.completionEta !== originalJob.completionEta) changeStrings.push(`Completion ETA updated`);
                if (customerHasChanges || finalCustId !== job.customerId) changeStrings.push(`Customer updated`);
                if (vehicleHasChanges || finalVehId !== job.vehicleId) changeStrings.push(`Vehicle updated`);
                
                if (changeStrings.length === 0) changeStrings.push(`Minor edits saved`);
            } else {
                changeStrings.push(`Created job profile`);
            }

            const logEntry = {
                timestamp: new Date().toISOString(),
                userName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'System User',
                uid: currentUser?.uid || 'system',
                details: changeStrings.join(' • ')
            };

            const payload = {
                tasks: job.tasks,
                status: job.status,
                title: job.title,
                description: job.description,
                dropoffEta: job.dropoffEta,
                completionEta: job.completionEta,
                customerId: finalCustId,
                vehicleId: finalVehId,
                tenantId,
                editLog: [...(job.editLog || []), logEntry]
            };

            if (jobId === 'new') {
                const res = await api.post('/jobs', payload);
                toast.success("Job profile created!");
                const nId = res.data.id || res.data.jobId;
                
                // Absolute persistence guarantee if emulator is stale
                try {
                    const { updateDoc } = await import('firebase/firestore');
                    await updateDoc(doc(db, 'jobs', nId), {
                        dropoffEta: payload.dropoffEta || null,
                        completionEta: payload.completionEta || null,
                        editLog: payload.editLog
                    });
                } catch(e) {}

                navigate(`/business/jobs/${nId}`, { replace: true });
                return;
            } else {
                await api.put(`/jobs/${jobId}`, payload);

                // Absolute persistence guarantee if emulator is stale
                try {
                    const { updateDoc } = await import('firebase/firestore');
                    await updateDoc(doc(db, 'jobs', jobId as string), {
                        dropoffEta: payload.dropoffEta || null,
                        completionEta: payload.completionEta || null,
                        editLog: payload.editLog
                    });
                } catch(e) {}

                // Keep states strictly synced so hasChanges evaluates exactly false
                const postSaveCustomer = customer ? { ...customer, id: finalCustId } : null;
                const postSaveVehicle = vehicle ? { ...vehicle, id: finalVehId } : null;

                if (postSaveCustomer) setCustomer(postSaveCustomer);
                if (postSaveVehicle) setVehicle(postSaveVehicle);

                const postSaveJob = { ...job, editLog: payload.editLog };
                setJob(postSaveJob);
                setOriginalJob(JSON.parse(JSON.stringify(postSaveJob)));
                
                setOriginalCustomer(JSON.parse(JSON.stringify(postSaveCustomer)));
                setOriginalVehicle(JSON.parse(JSON.stringify(postSaveVehicle)));

                if (showToast) toast.success("Saved successfully");
            }
        } catch (err) {
            console.error("Save error", err);
            toast.error("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    const hasChanges = JSON.stringify(job) !== JSON.stringify(originalJob) ||
        JSON.stringify(customer) !== JSON.stringify(originalCustomer) ||
        JSON.stringify(vehicle) !== JSON.stringify(originalVehicle);

    const calculatePartsTotal = () => {
        const legacyParts = job?.parts?.reduce((acc: any, part: any) => acc + (Number(part.price) * Number(part.quantity)), 0) || 0;
        const tasksParts = job?.tasks?.reduce((tAcc: any, task: any) => {
            return tAcc + (task.parts || []).reduce((pAcc: any, part: any) => pAcc + (Number(part.price) * Number(part.quantity)), 0);
        }, 0) || 0;
        return legacyParts + tasksParts;
    };

    const calculateLaborTotal = () => {
        const legacyLabor = job?.laborLines?.reduce((acc: any, line: any) => acc + (Number(line.rate) * Number(line.hours)), 0) || 0;
        const tasksLabor = job?.tasks?.reduce((tAcc: any, task: any) => {
            return tAcc + (Number(task.bookTime) * Number(task.laborRate || 0));
        }, 0) || 0;
        return legacyLabor + tasksLabor;
    };

    const handleApprove = async () => {
        if (hasChanges) await handleSave(false);
        if (jobId === 'new') return; // Wait until navigated
        try {
            await api.put(`/jobs/${jobId}`, { status: 'Approved', tenantId });
            setJob((prev: any) => ({ ...prev, status: 'Approved' }));
            setOriginalJob((prev: any) => ({ ...prev, status: 'Approved' }));
            toast.success("Quote Approved! Converted to Work Order.");
        } catch (e) {
            toast.error("Failed to convert");
        }
    };

    const [isSyncingCC, setIsSyncingCC] = useState(false);
    const handleCompanyCamSync = async () => {
        if (!tenantId || !jobId || jobId === 'new') return;
        if (!job.vehicleId) {
            toast.error("Safety Check: Please assign a Vehicle/Asset to this job before syncing.");
            return;
        }
        if (hasChanges) {
            toast.error("Please save your changes first.");
            return;
        }
        setIsSyncingCC(true);
        try {
            const res = await api.post(`/jobs/${jobId}/companycam-sync`);
            if (res.data._ccStatus === 'failed') {
                toast.error(res.data._ccReason || "Failed to sync to CompanyCam");
            } else {
                toast.success("Successfully synced to CompanyCam!");
                if (res.data.projectId) {
                    setJob((prev: any) => ({ ...prev, companyCamProjectId: res.data.projectId }));
                    setOriginalJob((prev: any) => ({ ...prev, companyCamProjectId: res.data.projectId }));
                }
            }
        } catch (e: any) {
            console.error(e);
            toast.error(e.response?.data?.error || "Failed to sync to CompanyCam");
        } finally {
            setIsSyncingCC(false);
        }
    };
    
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    
    const handleUploadMedia = async (e: any) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setIsUploadingMedia(true);
        try {
            const uploadPromises = Array.from(files).map(async (file: any) => {
                const storageRef = ref(storage, `job_media/${tenantId}/${jobId}/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const downloadUrl = await getDownloadURL(storageRef);
                return downloadUrl;
            });
            
            const urls = await Promise.all(uploadPromises);
            
            // Optimistically update UI so user doesn't have to wait for CompanyCam processing
            const optimisticPhotos = urls.map((url, i) => ({
                id: `temp_${Date.now()}_${i}`,
                uris: [{ uri: url }],
                creator_name: currentUser?.displayName || 'You (Processing)'
            }));
            setCcPhotos(prev => [...optimisticPhotos, ...prev]);

            await api.post(`/jobs/${jobId}/companycam-photos`, { urls });
            toast.success("Photos uploaded successfully!");
            
            // Poll for actual photos after a slight delay to let CompanyCam ingest
            setTimeout(async () => {
                const res = await api.get(`/jobs/${jobId}/companycam-photos`);
                setCcPhotos(res.data || []);
            }, 3000);
        } catch (err: any) {
            console.error("Upload failed", err);
            toast.error(err.response?.data?.error || "Failed to upload photos");
        } finally {
            setIsUploadingMedia(false);
            e.target.value = ''; // Reset input
        }
    };

    if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center font-bold text-zinc-500 animate-pulse">Building Profile...</div>;
    if (!job) return <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center font-bold text-red-500">Not Found<button onClick={() => navigate('/business/jobs')} className="mt-4 bg-zinc-800 text-white px-4 py-2 rounded-lg">Go Back</button></div>;

    const partsTotal = calculatePartsTotal();
    const laborTotal = calculateLaborTotal();
    const subTotal = partsTotal + laborTotal;
    const txRateDecimal = customer?.taxRate !== undefined && customer?.taxRate !== '' ? (Number(customer.taxRate) / 100) : 0.0825;
    const taxes = subTotal * txRateDecimal;
    const grandTotal = subTotal + taxes;

    const actualLaborTotal = job?.tasks?.reduce((tAcc: number, _task: any, tIdx: number) => {
        const actualTaskCost = timeLogs.filter((l: any) => l.taskIndex === tIdx).reduce((acc: number, log: any) => {
            const end = log.clockOut ? new Date(log.clockOut).getTime() : currentTime;
            const hours = ((end - new Date(log.clockIn).getTime()) / (1000 * 60 * 60));
            // Find staff hourly rate, default to standard shop rate if not found/no rate set
            const staffMember = allStaff.find(s => s.uid === log.staffId);
            const rawRate = (staffMember && Number(staffMember.hourlyRate)) > 0 
                ? Number(staffMember.hourlyRate) 
                : businessSettings.standardShopRate;
            
            // Apply burden multiplier
            const trueHourlyCost = rawRate * businessSettings.burdenMultiplier;
            return acc + (hours * trueHourlyCost);
        }, 0);
        return tAcc + actualTaskCost;
    }, 0) || 0;
    
    // Add legacy actual labor if any (though legacy had no tracking, so just use legacy string hours if needed, or 0)
    const actualSubTotal = partsTotal + actualLaborTotal;
    const actualTaxes = actualSubTotal * txRateDecimal;
    const actualGrandTotal = actualSubTotal + actualTaxes;

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col relative pb-32">
            {hasChanges && <UnsavedChangesBanner hasChanges={hasChanges} onSave={handleSave} onDiscard={() => {
                if (window.confirm("Discard changes?")) {
                    const origJ = JSON.parse(JSON.stringify(originalJob));
                    const origC = JSON.parse(JSON.stringify(originalCustomer));
                    const origV = JSON.parse(JSON.stringify(originalVehicle));
                    setJob(origJ);
                    setCustomer(origC);
                    setVehicle(origV);
                    setSelectedCustomerId(origC?.id || 'new');
                    setSelectedVehicleId(origV?.id || 'new');
                }
            }} />}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 shadow-2xl">
                <div className="max-w-7xl mx-auto w-full p-4 md:p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button
                            onClick={() => {
                                if (hasChanges && !window.confirm("You have unsaved changes. Discard?")) return;
                                navigate('/business/jobs');
                            }}
                            className="w-10 h-10 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1 w-full">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="relative inline-block">
                                    <select
                                        value={job.status}
                                        onChange={(e) => {
                                            setJob({ ...job, status: e.target.value });
                                            // Handle fast convert if they move from Estimate to anything else without hitting the specific button
                                            if (job.status === 'Estimate' && e.target.value !== 'Estimate') {
                                                toast.success(`Converted to ${e.target.value}! Please save to confirm.`);
                                            }
                                        }}
                                        className={`appearance-none text-xs font-black uppercase tracking-widest px-4 py-2 pr-8 rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-lg transition-all ${
                                            job.status === 'Estimate' ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700' :
                                            job.status === 'Approved' ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500 hover:bg-indigo-600/30' :
                                            job.status === 'In Progress' ? 'bg-blue-600/20 text-blue-300 border-blue-500 hover:bg-blue-600/30' :
                                            (job.status === 'Ready for QC' || job.status === 'Ready for Delivery') ? 'bg-amber-500/20 text-amber-300 border-amber-500 hover:bg-amber-500/30' :
                                            (job.status === 'Completed' || job.status === 'Delivered') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500 hover:bg-emerald-500/30' :
                                            job.status === 'Archived' || job.status === 'archived' ? 'bg-zinc-900 text-zinc-500 border-zinc-800' :
                                            'bg-zinc-800 text-zinc-400 border-zinc-700'
                                        }`}
                                    >
                                        {['Estimate', 'Approved', 'In Progress', 'Ready for QC', 'Ready for Delivery', 'Delivered', 'Archived'].map(s => (
                                            <option key={s} value={s} className="bg-zinc-900 text-white font-mono text-xs my-1">
                                                {s === 'Estimate' ? 'DRAFT JOB / ESTIMATE' : s.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-zinc-500">
                                        <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                    </div>
                                </div>
                                {jobId !== 'new' && <span className="text-zinc-500 font-mono text-xs">#{jobId?.substring(0, 8).toUpperCase()}</span>}
                                {jobId !== 'new' && (
                                    <div className="flex items-center gap-1.5 ml-1 border-l border-zinc-700/50 pl-3">
                                        <span className={`w-1.5 h-1.5 rounded-full ${job.qboId ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400/50'}`}></span>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                                            {job.qboId ? 'QBO Synced' : 'QBO Pending'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="relative group/title inline-block">
                                <input
                                    type="text"
                                    value={job.title}
                                    onChange={(e) => setJob({ ...job, title: e.target.value })}
                                    className="text-xl md:text-2xl font-black text-white bg-transparent border-b-2 border-dashed border-zinc-700/50 focus:border-indigo-500 p-0 focus:outline-none focus:ring-0 placeholder:text-zinc-700 min-w-[300px] hover:bg-zinc-900/50 transition-colors px-1"
                                    placeholder="Job Profile Name"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center gap-3">
                        {jobId !== 'new' && (
                            <a
                                href={`/business/${tenantId}/estimate/${jobId}/print`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all font-mono tracking-widest uppercase text-xs"
                            >
                                <Printer className="w-4 h-4" /> Preview
                            </a>
                        )}
                        {job.status === 'Estimate' && jobId !== 'new' && (
                            <button
                                onClick={handleApprove}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all font-mono tracking-widest uppercase text-xs"
                            >
                                <CheckCircle className="w-4 h-4" /> Approve & Convert
                            </button>
                        )}
                        <button
                            onClick={() => handleSave(true)}
                            disabled={!hasChanges || isSaving}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all font-mono tracking-widest uppercase text-xs"
                        >
                            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : (jobId === 'new' ? 'Create Job' : 'Save')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-8 mt-4 relative z-10">
                <div className="xl:col-span-2 space-y-8">

                    {/* COMPACT CUSTOMER CARD */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                        {isCustomerModalOpen && (
                            <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 md:p-8 relative">
                                    <button onClick={() => setIsCustomerModalOpen(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
                                    <h2 className="text-xl font-black text-white mb-6">Customer Database Profile</h2>

                                    <div className="mb-6">
                                        <CustomerSelector
                                            label="Select Database Profile"
                                            value={selectedCustomerId || 'new'}
                                            data={allCustomers}
                                            onChange={(val: string, entity: any) => {
                                                setSelectedCustomerId(val || 'new');

                                                // FORCE VEHICLE CLEAR ON ANY CUSTOMER SWAP
                                                setSelectedVehicleId('new');
                                                setVehicle({ year: '', make: '', model: '', vin: '' });

                                                if (!val || val === 'new') {
                                                    setCustomer({ firstName: '', lastName: '', company: '', email: '', phone: '', mobile: '', addressStreet: '', addressCity: '', addressState: '', addressZip: '', taxRate: '8.25' });
                                                    setJob({ ...job, customerId: null, vehicleId: null });
                                                } else if (entity) {
                                                    setCustomer({
                                                        id: entity.id,
                                                        firstName: entity.firstName || '',
                                                        lastName: entity.lastName || '',
                                                        company: entity.company || '',
                                                        email: entity.email || '',
                                                        phone: entity.phone || '',
                                                        mobile: entity.mobile || '',
                                                        addressStreet: entity.addressStreet || '',
                                                        addressCity: entity.addressCity || '',
                                                        addressState: entity.addressState || '',
                                                        addressZip: entity.addressZip || '',
                                                        taxRate: entity.taxRate !== undefined ? entity.taxRate : '8.25'
                                                    });
                                                    setJob({ ...job, customerId: entity.id, vehicleId: null });
                                                }
                                            }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">First Name (Given Name)</label>
                                            <input type="text" value={customer?.firstName || ''} onChange={e => setCustomer({ ...customer, firstName: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Last Name (Family Name)</label>
                                            <input type="text" value={customer?.lastName || ''} onChange={e => setCustomer({ ...customer, lastName: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Company Name</label>
                                            <input type="text" value={customer?.company || ''} onChange={e => setCustomer({ ...customer, company: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Email Address</label>
                                            <input type="email" value={customer?.email || ''} onChange={e => setCustomer({ ...customer, email: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Primary Phone</label>
                                            <input type="tel" value={customer?.phone || ''} onChange={e => setCustomer({ ...customer, phone: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Mobile Phone</label>
                                            <input type="tel" value={customer?.mobile || ''} onChange={e => setCustomer({ ...customer, mobile: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Billing Address (Street)</label>
                                            <input type="text" value={customer?.addressStreet || ''} onChange={e => setCustomer({ ...customer, addressStreet: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">City</label>
                                            <input type="text" value={customer?.addressCity || ''} onChange={e => setCustomer({ ...customer, addressCity: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">State</label>
                                                <input type="text" value={customer?.addressState || ''} onChange={e => setCustomer({ ...customer, addressState: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-center" placeholder="TX" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Zip</label>
                                                <input type="text" value={customer?.addressZip || ''} onChange={e => setCustomer({ ...customer, addressZip: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-center" />
                                            </div>
                                        </div>
                                        <div className="md:col-span-2 border-t border-zinc-800/80 pt-4 mt-2">
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Sales Tax Rate (%)</label>
                                            <div className="flex items-center gap-3">
                                                <input type="number" step="0.01" value={customer?.taxRate !== undefined ? customer.taxRate : '8.25'} onChange={e => setCustomer({ ...customer, taxRate: e.target.value })} className="w-full md:w-48 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium font-mono" />
                                                <span className="text-zinc-500 font-bold">%</span>
                                            </div>
                                            <p className="text-[10px] text-zinc-600 mt-1">Leave empty or 0 if tax exempt.</p>
                                        </div>
                                    </div>
                                    <div className="mt-8 flex justify-end">
                                        <button onClick={async () => {
                                            setIsCustomerModalOpen(false);
                                            await handleSave(true);
                                        }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/20">Done</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <User className="w-5 h-5 text-indigo-400" />
                                Customer Context
                            </h2>
                            <button onClick={() => setIsCustomerModalOpen(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                                {(!customer?.firstName && !customer?.company) ? '+ SET CUSTOMER' : 'EDIT / SWAP'}
                            </button>
                        </div>

                        {(customer?.firstName || customer?.company) ? (
                            <div className="mt-4 bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/80 relative">
                                <div className="font-bold text-white text-lg">{[customer.firstName, customer.lastName].filter(Boolean).join(' ')} {customer.company && <span className="text-zinc-500 text-sm ml-2">- {customer.company}</span>}</div>

                                {customer.taxRate !== undefined && (
                                    <div className="absolute top-4 right-4 bg-zinc-800/50 px-2 py-1 rounded text-xs font-mono border border-zinc-700/50 text-zinc-400">
                                        {customer.taxRate}% TAX
                                    </div>
                                )}

                                <div className="text-zinc-400 text-sm mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {customer.email && <div><span className="text-zinc-600 mr-2 text-[10px] uppercase font-bold tracking-wider">Email</span>{customer.email}</div>}
                                    {customer.phone && <div><span className="text-zinc-600 mr-2 text-[10px] uppercase font-bold tracking-wider">Phone</span>{customer.phone}</div>}
                                </div>
                                {(customer.addressStreet || customer.addressCity) && (
                                    <div className="text-zinc-400 text-sm mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between">
                                        <div>
                                            <span className="text-zinc-600 mr-2 text-[10px] uppercase font-bold tracking-wider">Address</span>
                                            {customer.addressStreet}, {customer.addressCity} {customer.addressState} {customer.addressZip}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-4 bg-zinc-950/50 rounded-xl p-6 border border-zinc-800/50 border-dashed text-center text-zinc-500 text-sm font-medium">
                                No customer profile selected. Click edit to link a customer.
                            </div>
                        )}
                    </div>

                    {/* COMPACT VEHICLE CARD */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                        {isVehicleModalOpen && (
                            <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 md:p-8 relative">
                                    <button onClick={() => setIsVehicleModalOpen(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
                                    <h2 className="text-xl font-black text-white mb-6">Vehicle Database Profile</h2>

                                    <div className="mb-6">
                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 shadow-sm">Select Database Profile</label>
                                        <select
                                            value={selectedVehicleId || 'new'}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setSelectedVehicleId(val);
                                                if (val === 'new') {
                                                    const newVeh = { year: '', make: '', model: '', vin: '' };
                                                    setVehicle(newVeh);
                                                } else {
                                                    const v = allVehicles.find(x => x.id === val);
                                                    if (v) {
                                                        const mapped = {
                                                            id: v.id,
                                                            year: v.year || '',
                                                            make: v.make || '',
                                                            model: v.model || '',
                                                            vin: v.vin || ''
                                                        };
                                                        setVehicle(mapped);
                                                    }
                                                }
                                            }}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-bold"
                                        >
                                            <option value="new">+ Create New/One-Off Vehicle</option>
                                            {allVehicles.filter(v => (customer?.id && v.customerId === customer?.id) || (v.id === selectedVehicleId && selectedVehicleId !== 'new')).map(v => (
                                                <option key={v.id} value={v.id}>
                                                    {v.year} {v.make} {v.model} {v.vin ? `(VIN: ${v.vin.substring(v.vin.length - 6)})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Year</label>
                                            <input type="text" value={vehicle?.year || ''} onChange={e => setVehicle({ ...vehicle, year: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-center md:text-left" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Make</label>
                                            <input type="text" value={vehicle?.make || ''} onChange={e => setVehicle({ ...vehicle, make: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Model</label>
                                            <input type="text" value={vehicle?.model || ''} onChange={e => setVehicle({ ...vehicle, model: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">VIN Number</label>
                                            <input type="text" value={vehicle?.vin || ''} onChange={e => setVehicle({ ...vehicle, vin: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
                                        </div>
                                    </div>
                                    <div className="mt-8 flex justify-end">
                                        <button onClick={async () => {
                                            setIsVehicleModalOpen(false);
                                            await handleSave(true);
                                        }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/20">Done</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <Car className="w-5 h-5 text-indigo-400" />
                                Vehicle / Asset Context
                            </h2>
                            <button onClick={() => setIsVehicleModalOpen(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                                {(!vehicle?.make && !vehicle?.model) ? '+ SET VEHICLE' : 'EDIT / SWAP'}
                            </button>
                        </div>

                        {(vehicle?.make || vehicle?.model || vehicle?.year) ? (
                            <div className="mt-4 bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/80">
                                <div className="font-bold text-white text-lg">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</div>
                                {(vehicle.vin) && (
                                    <div className="text-zinc-400 text-sm mt-2 grid grid-cols-1 gap-2">
                                        <div><span className="text-zinc-600 mr-2 text-[10px] uppercase font-bold tracking-wider">VIN</span><span className="font-mono">{vehicle.vin}</span></div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-4 bg-zinc-950/50 rounded-xl p-6 border border-zinc-800/50 border-dashed text-center text-zinc-500 text-sm font-medium">
                                No vehicle profile selected. Click edit to link a vehicle.
                            </div>
                        )}
                    </div>

                    {/* COMPANYCAM NATIVE GALLERY */}
                    {jobId !== 'new' && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-black text-white flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                    </svg>
                                    Job Media (CompanyCam)
                                    <div className="group relative flex items-center ml-1">
                                        <Info className="w-4 h-4 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-56 p-2.5 bg-zinc-800 text-[10px] text-zinc-300 rounded-lg shadow-xl border border-zinc-700 text-center font-normal z-50 leading-relaxed">
                                            Photos are actively <b>synced</b>! Any media uploaded here or in the CompanyCam app will automatically mirror in both places.
                                        </div>
                                    </div>
                                </h2>
                                {job?.companyCamProjectId ? (
                                    <div className="flex gap-2">
                                        <a href={`https://app.companycam.com/projects/${job.companyCamProjectId}/photos`} target="_blank" rel="noreferrer" className="bg-blue-900/50 hover:bg-blue-800 border border-blue-500 text-blue-200 text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                                            Open App
                                        </a>
                                        <label className={`bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${isUploadingMedia ? 'opacity-50 pointer-events-none' : ''}`}>
                                            {isUploadingMedia ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Plus className="w-3.5 h-3.5" />
                                            )}
                                            {isUploadingMedia ? 'UPLOADING...' : 'UPLOAD MEDIA'}
                                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleUploadMedia} disabled={isUploadingMedia} />
                                        </label>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleCompanyCamSync}
                                        disabled={isSyncingCC}
                                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg transition-all tracking-widest uppercase text-[10px]"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                                        {isSyncingCC ? 'Syncing...' : 'Start Syncing With CompanyCam'}
                                    </button>
                                )}
                            </div>

                            {!job?.companyCamProjectId ? (
                                <div className="bg-zinc-950/50 rounded-xl p-8 border border-zinc-800/50 border-dashed text-center">
                                    <h3 className="text-zinc-300 font-bold mb-2">Media Sync is Idle</h3>
                                    <p className="text-zinc-500 text-sm max-w-md mx-auto">Click the button above to securely connect this Work Order to CompanyCam and instantly enable native photo rendering.</p>
                                </div>
                            ) : loadingCcPhotos ? (
                                <div className="text-center py-8 text-zinc-500 font-mono text-sm animate-pulse">
                                    Syncing photos...
                                </div>
                            ) : ccPhotos.length === 0 ? (
                                <div className="bg-zinc-950/50 rounded-xl p-8 border border-zinc-800/50 border-dashed text-center">
                                    <p className="text-zinc-500 text-sm font-medium mb-2">No photos have been uploaded to this job yet.</p>
                                    <p className="text-zinc-600 text-xs">Technicians can upload photos via the CompanyCam app.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {ccPhotos.map((photo: any) => (
                                        <div key={photo.id || Math.random()} className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                                            {photo.uris?.[0]?.uri ? (
                                                <img
                                                    src={photo.uris[0].uri}
                                                    alt="Job media"
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                />
                                            ) : (
                                                <div className="text-[8px] text-zinc-500 overflow-hidden font-mono p-1 break-words h-full">DEBUG: {JSON.stringify(photo).substring(0, 500)}</div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                                <div className="text-[9px] text-white font-mono tracking-wider truncate">Uploaded by {photo.creator_name || photo.creator?.name || 'Staff'}</div>
                                            </div>
                                            {photo.id?.startsWith('temp_') && (
                                                <div className="absolute top-2 right-2 bg-indigo-600/90 backdrop-blur text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow drop-shadow flex items-center gap-1 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin"/> Syncing
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-400"></div> Schedule & ETAs
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Vehicle Drop-Off ETA</label>
                                <input
                                    type="datetime-local"
                                    value={job.dropoffEta || ''}
                                    onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                    onChange={e => setJob({ ...job, dropoffEta: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Target Completion ETA</label>
                                <input
                                    type="datetime-local"
                                    value={job.completionEta || ''}
                                    onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                    onChange={e => setJob({ ...job, completionEta: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>


                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-6 border-b border-zinc-800/80 pb-4">
                            <h2 className="text-xl font-black text-white flex items-center gap-2">
                                <Wrench className="w-5 h-5 text-indigo-400" />
                                Work Order Line Items
                            </h2>
                            <div className="flex items-center gap-3">
                                <TaskTemplateSelector
                                    data={allTemplates}
                                    onSelect={(template) => {
                                        const newTask = {
                                            title: template.title || template.name || 'New Task from Template',
                                            status: 'Not Started',
                                            bookTime: template.bookTime || 1,
                                            actualTime: 0,
                                            laborRate: template.laborRate || businessSettings.standardShopRate,
                                            assignedUids: [],
                                            parts: (template.parts || template.defaultParts) ? [...(template.parts || template.defaultParts)] : [],
                                            notes: template.notes || '',
                                            sops: template.sops || '',
                                            directions: template.techDirections || template.directions || '',
                                            isApproved: job.status === 'Quote / Estimate'
                                        };
                                        setJob({ ...job, tasks: [...job.tasks, newTask] });
                                    }}
                                    trigger={
                                        <button
                                            className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-xs font-mono tracking-widest uppercase border border-indigo-500/30"
                                        >
                                            <ClipboardList className="w-3.5 h-3.5" /> Template Task
                                        </button>
                                    }
                                />
                                <button
                                    onClick={() => {
                                        setJob({ ...job, tasks: [...job.tasks, { title: '', status: 'Not Started', bookTime: 1, actualTime: 0, laborRate: businessSettings.standardShopRate, assignedUids: [], parts: [], notes: '', sops: '', directions: '', isApproved: job.status === 'Quote / Estimate' }] });
                                    }}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-xs font-mono tracking-widest uppercase"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Custom Task
                                </button>
                            </div>
                        </div>

                        {job.tasks.length === 0 ? (
                            <div className="text-center p-8 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center">
                                <Box className="w-10 h-10 text-zinc-700 mb-3" />
                                <p className="text-zinc-400 font-medium font-mono text-sm">No tasks added to this job scope.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {job.tasks.map((task: any, tIdx: number) => (
                                    <div key={tIdx} className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors rounded-2xl overflow-hidden shadow-lg group">
                                        <div className="bg-zinc-900/50 p-4 border-b border-zinc-800/60 flex flex-col gap-4">
                                            <div className="w-full">
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest shadow-sm">Task Name / Procedure</label>
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            const t = [...job.tasks];
                                                            t[tIdx].isApproved = !(task.isApproved !== false);
                                                            setJob({ ...job, tasks: t });
                                                        }}
                                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors border ${
                                                            task.isApproved !== false 
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                                                                : 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                                                        }`}
                                                    >
                                                        {task.isApproved !== false ? '✓ Customer Approved' : '⏳ Pending Approval'}
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={task.title}
                                                    placeholder="e.g. Install Suspension Kit"
                                                    onChange={e => {
                                                        const t = [...job.tasks]; t[tIdx].title = e.target.value; setJob({ ...job, tasks: t });
                                                    }}
                                                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-3 text-lg text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-black placeholder:text-zinc-700 shadow-inner"
                                                />
                                            </div>
                                            
                                            <div className="flex flex-col md:flex-row justify-between gap-4 pt-1">
                                                <div className="flex items-start gap-6">
                                                    <div className="w-24">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Hrs <Info className="w-3 h-3 text-zinc-600" /></label>
                                                        <input
                                                            type="number"
                                                            min="0" step="0.5"
                                                            value={task.bookTime}
                                                            onChange={e => {
                                                                const t = [...job.tasks]; t[tIdx].bookTime = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                            }}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                                                        />
                                                    </div>
                                                    <div className="w-28 pl-6 border-l border-zinc-800/60">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Rate ($)</label>
                                                        <input
                                                            type="number"
                                                            min="0" step="10"
                                                            value={task.laborRate}
                                                            onChange={e => {
                                                                const t = [...job.tasks]; t[tIdx].laborRate = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                            }}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 md:pl-6 md:border-l border-zinc-800/60 pt-4 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                                                    {(() => {
                                                        const actualTaskHours = timeLogs.filter((l: any) => l.taskIndex === tIdx).reduce((acc: number, log: any) => {
                                                            const end = log.clockOut ? new Date(log.clockOut).getTime() : Date.now();
                                                            return acc + ((end - new Date(log.clockIn).getTime()) / (1000 * 60 * 60));
                                                        }, 0);
                                                        const actualLaborValue = actualTaskHours * Number(task.laborRate || 0);
                                                        const partsValue = (task.parts || []).reduce((acc: number, p: any) => acc + (Number(p.price || 0) * Number(p.quantity || 1)), 0);
                                                        const taskQuotedValue = (Number(task.bookTime || 0) * Number(task.laborRate || 0)) + partsValue;
                                                        const taskActualValue = actualLaborValue + partsValue;
                                                        
                                                        return (
                                                            <>
                                                                <div className="flex flex-col flex-1 md:flex-none justify-center items-end pr-6 md:pr-4 md:mr-4 border-r border-zinc-800/60">
                                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1" title="Quoted Hours x Rate + Parts">Approved Est</label>
                                                                    <span className="font-mono text-zinc-300 font-black text-xl tracking-tight">${taskQuotedValue.toFixed(2)}</span>
                                                                </div>
                                                                <div className="flex flex-col flex-1 md:flex-none justify-center items-end">
                                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1" title="Actual Tracked Hours x Rate + Parts">Actual Cost</label>
                                                                    <span className={`font-mono font-black text-xl tracking-tight ${taskActualValue > taskQuotedValue ? 'text-amber-500' : 'text-emerald-400'}`}>${taskActualValue.toFixed(2)}</span>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                    <div className="flex items-center h-full pt-4">
                                                        {timeLogs.some((l: any) => l.taskIndex === tIdx) || task.status === 'Finished' || task.status === 'In Progress' ? (
                                                            <div className="p-3 bg-zinc-950/50 text-zinc-700 border border-zinc-800/30 rounded-xl cursor-not-allowed" title="Active tasks cannot be removed">
                                                                <Trash2 className="w-5 h-5 opacity-30" />
                                                            </div>
                                                        ) : (
                                                            <button type="button" onClick={() => {
                                                                if (!window.confirm("Remove this task group?")) return;
                                                                const t = [...job.tasks]; t.splice(tIdx, 1); setJob({ ...job, tasks: t });
                                                            }} className="p-3 bg-zinc-950 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 border border-zinc-800 hover:border-red-500/30 rounded-xl transition-all group-hover:opacity-100 opacity-50" title="Remove Task">
                                                                <Trash2 className="w-5 h-5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-zinc-950 border-b border-zinc-800/50">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2">
                                                        <Box className="w-3.5 h-3.5" /> Associated Parts
                                                    </span>
                                                </div>

                                                {(!task.parts || task.parts.length === 0) ? (
                                                    <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-4 flex gap-4 items-center text-sm font-mono text-zinc-500">
                                                        No parts added.
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => {
                                                                const t = [...job.tasks];
                                                                if (!t[tIdx].parts) t[tIdx].parts = [];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, price: 0, providedBy: 'Shop' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded transition-colors text-xs font-mono tracking-widest uppercase flex items-center gap-2">
                                                                <PlusCircle className="w-3 h-3" /> Part from Inventory
                                                            </button>
                                                            <button type="button" onClick={() => {
                                                                const t = [...job.tasks];
                                                                if (!t[tIdx].parts) t[tIdx].parts = [];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, price: 0, providedBy: 'Customer' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold px-3 py-1.5 rounded transition-colors text-xs font-mono tracking-widest uppercase flex items-center gap-2 border border-amber-500/20">
                                                                <UserPlus className="w-3 h-3" /> + Customer Part
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {task.parts.map((part: any, pIdx: number) => (
                                                            <div key={pIdx} className={`flex gap-2 items-center bg-zinc-900 border ${part.providedBy === 'Customer' ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-800'} rounded-xl p-2 group/part`}>
                                                                <div className="flex-1 flex items-center border-r border-zinc-800/60 pr-2">
                                                                    {part.providedBy === 'Customer' && (
                                                                        <div className="pl-2 pr-1">
                                                                            <span className="text-[9px] font-black tracking-widest uppercase text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">CUST</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex-1 min-w-0">
                                                                        {part.providedBy === 'Customer' ? (
                                                                            <input
                                                                                type="text"
                                                                                value={part.name}
                                                                                onChange={e => {
                                                                                    const t = [...job.tasks];
                                                                                    t[tIdx].parts[pIdx].name = e.target.value;
                                                                                    setJob({ ...job, tasks: t });
                                                                                }}
                                                                                placeholder="Describe customer part..."
                                                                                className="w-full bg-transparent border-none text-sm text-white focus:outline-none h-8 px-2"
                                                                            />
                                                                        ) : (
                                                                            <InventorySelector
                                                                                data={allInventory}
                                                                                onChange={(_, invItem) => {
                                                                                    if (!invItem) return;
                                                                                    const t = [...job.tasks];
                                                                                    
                                                                                    // Check for duplicate part in same task
                                                                                    const isDuplicate = t[tIdx].parts.some((p: any, idx: number) => idx !== pIdx && p.inventoryId === invItem.id);
                                                                                    if (isDuplicate) {
                                                                                        toast.error("Part already assigned to this task. Update quantity if you want more.");
                                                                                        return;
                                                                                    }

                                                                                    t[tIdx].parts[pIdx].name = invItem.name;
                                                                                    t[tIdx].parts[pIdx].price = invItem.price || 0;
                                                                                    t[tIdx].parts[pIdx].inventoryId = invItem.id;
                                                                                    setJob({ ...job, tasks: t });
                                                                                }}
                                                                                value={part.inventoryId}
                                                                                alreadyInTaskIds={(task.parts || []).map((p: any) => p.inventoryId).filter(Boolean)}
                                                                                placeholder="Search inventory or type description..."
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="w-20 border-l border-zinc-800 pl-2">
                                                                    <div className="flex items-center">
                                                                        <span className="text-zinc-600 text-xs px-1">Qty</span>
                                                                        <input type="number" min="1" value={part.quantity} onChange={e => {
                                                                            const t = [...job.tasks]; t[tIdx].parts[pIdx].quantity = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none text-center" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-28 border-l border-zinc-800 pl-2">
                                                                    <div className="flex items-center">
                                                                        <span className="text-zinc-600 text-xs px-1">$</span>
                                                                        <input type="number" min="0" step="0.01" disabled={part.providedBy === 'Customer'} value={part.price} onChange={e => {
                                                                            const t = [...job.tasks]; t[tIdx].parts[pIdx].price = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none text-right disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="font-mono text-zinc-400 font-bold text-sm w-24 text-right pr-2">
                                                                    ${(Number(part.quantity) * Number(part.price)).toFixed(2)}
                                                                </div>
                                                                <button type="button" onClick={() => {
                                                                    const t = [...job.tasks]; t[tIdx].parts.splice(pIdx, 1); setJob({ ...job, tasks: t });
                                                                }} className="p-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover/part:opacity-100">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <div className="pt-2 flex gap-2">
                                                            <button type="button" onClick={() => {
                                                                const t = [...job.tasks];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, price: 0, providedBy: 'Shop' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="text-[10px] text-zinc-400 hover:text-white font-black font-mono tracking-widest uppercase flex items-center gap-1.5 transition-colors border border-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
                                                                <PlusCircle className="w-3 h-3" /> Part from Inventory
                                                            </button>
                                                            <button type="button" onClick={() => {
                                                                const t = [...job.tasks];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, price: 0, providedBy: 'Customer' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="text-[10px] text-amber-500/70 hover:text-amber-400 font-black font-mono tracking-widest uppercase flex items-center gap-1.5 transition-colors border border-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/5">
                                                                <UserPlus className="w-3 h-3" /> + Customer Part
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                        <div className="p-4 bg-zinc-950 border-t border-zinc-800/50">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2">
                                                    <User className="w-3.5 h-3.5" /> Assigned Techs
                                                </span>
                                                <StaffSelector
                                                    data={allStaff}
                                                    value={task.assignedUids || []}
                                                    onChange={(uid) => {
                                                        const t = [...job.tasks];
                                                        const current = t[tIdx].assignedUids || [];
                                                        if (current.includes(uid)) {
                                                            const hasTime = timeLogs.some((l: any) => l.userId === uid && l.taskIndex === tIdx);
                                                            if (hasTime) {
                                                                toast.error("Cannot unassign a tech who has already started work!");
                                                                return;
                                                            }
                                                            t[tIdx].assignedUids = current.filter((u: string) => u !== uid);
                                                        } else {
                                                            t[tIdx].assignedUids = [...current, uid];
                                                        }
                                                        setJob({ ...job, tasks: t });
                                                    }}
                                                    trigger={
                                                        <button className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold">
                                                            <PlusCircle className="w-3.5 h-3.5" /> Assign Staff
                                                        </button>
                                                    }
                                                />
                                            </div>
                                            
                                            {task.assignedUids?.length > 0 ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {task.assignedUids.map((uid: string) => {
                                                        const st = allStaff.find(s => s.uid === uid);
                                                        if (!st) return null;
                                                        
                                                        const userLogs = timeLogs.filter((l: any) => l.userId === uid && l.taskIndex === tIdx);
                                                        const totalHours = userLogs.reduce((acc, log) => {
                                                            const end = log.clockOut ? new Date(log.clockOut).getTime() : Date.now();
                                                            return acc + ((end - new Date(log.clockIn).getTime()) / (1000 * 60 * 60));
                                                        }, 0);
                                                        const isActive = userLogs.some((l: any) => l.status === 'open');

                                                        return (
                                                            <div key={uid} className="flex items-center justify-between bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 shadow-sm group">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="relative">
                                                                        <img className="h-8 w-8 rounded-full border border-zinc-700 object-cover bg-zinc-800" src={st.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(st.firstName || st.lastName || 'Tec')}&background=random`} alt={st.firstName} />
                                                                        {isActive && (
                                                                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-zinc-950 bg-emerald-500"></span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm text-zinc-200 font-bold">{st.firstName || st.email?.split('@')[0]} {st.lastName}</span>
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{isActive ? 'Clocked In' : 'Assigned'}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {isActive && (
                                                                        <span className="flex h-2.5 w-2.5 relative" title="Working Now">
                                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                                                        </span>
                                                                    )}
                                                                    <span className="text-sm font-mono font-bold text-zinc-400">{totalHours > 0 ? `${totalHours.toFixed(2)}h` : '0.00h'}</span>
                                                                    
                                                                    {userLogs.length === 0 && (
                                                                        <button type="button" onClick={() => {
                                                                            const t = [...job.tasks];
                                                                            t[tIdx].assignedUids = t[tIdx].assignedUids.filter((u: string) => u !== uid);
                                                                            setJob({ ...job, tasks: t });
                                                                        }} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-zinc-600 hover:text-red-400 rounded-full transition-all ml-1" title="Unassign">
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-zinc-600 italic py-2">No staff currently assigned to this task.</div>
                                            )}

                                            {timeLogs.filter((l: any) => l.taskIndex === tIdx).length > 0 && (
                                                <div className="mt-4 border-t border-zinc-800/60 pt-4">
                                                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2 mb-3">
                                                        <ClipboardList className="w-3 h-3" /> Time Activity Log
                                                    </span>
                                                    <div className="max-h-48 overflow-y-auto pr-2 space-y-1.5 custom-scrollbar">
                                                        {timeLogs.filter((l: any) => l.taskIndex === tIdx)
                                                            .sort((a: any, b: any) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())
                                                            .slice(0, 10)
                                                            .map((log: any, lIdx: number) => {
                                                            const st = allStaff.find(s => s.uid === log.userId);
                                                            const inTime = new Date(log.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                            const outTime = log.clockOut ? new Date(log.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active';
                                                            const dateStr = new Date(log.clockIn).toLocaleDateString([], { month: 'short', day: 'numeric' });
                                                            
                                                            return (
                                                                <div key={lIdx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-400 bg-zinc-900/40 rounded px-3 py-2 border border-zinc-800/30">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-zinc-300 font-bold">{st?.firstName || 'Unknown'}</span>
                                                                        <span className="text-zinc-600">|</span>
                                                                        <span>{dateStr}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 font-mono mt-1 sm:mt-0">
                                                                        <span className="text-emerald-400/80">{inTime}</span>
                                                                        <span className="text-zinc-600">→</span>
                                                                        <span className={log.clockOut ? 'text-zinc-500' : 'text-emerald-500 font-bold flex items-center gap-1.5'}><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>{outTime}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-4 bg-zinc-950 border-t border-zinc-800/50">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 ml-1">Scope Notes (Internal)</label>
                                                    <textarea
                                                        value={task.notes || ''}
                                                        onChange={e => {
                                                            const t = [...job.tasks]; t[tIdx].notes = e.target.value; setJob({ ...job, tasks: t });
                                                        }}
                                                        placeholder="Private details, warnings, or specific tools..."
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[60px] resize-y"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 ml-1">SOPs / Directives</label>
                                                    <textarea
                                                        value={task.sops || ''}
                                                        onChange={e => {
                                                            const t = [...job.tasks]; t[tIdx].sops = e.target.value; setJob({ ...job, tasks: t });
                                                        }}
                                                        placeholder="Standard operating procedures link..."
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[60px] resize-y"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 ml-1">Tech Directions</label>
                                                    <textarea
                                                        value={task.directions || ''}
                                                        onChange={e => {
                                                            const t = [...job.tasks]; t[tIdx].directions = e.target.value; setJob({ ...job, tasks: t });
                                                        }}
                                                        placeholder="Step-by-step instructions for the bay..."
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[60px] resize-y"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="xl:col-span-1 space-y-6">
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 shadow-xl border border-indigo-500 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[60px] pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-6 flex items-center gap-2">{job.status === 'Estimate' ? 'Quote Totals' : 'Project Financials'}</h3>

                        <div className="space-y-3 font-mono mb-8">
                            <div className="flex justify-between items-center text-sm font-bold text-indigo-100">
                                <span>Total Parts:</span>
                                <span>${partsTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold text-indigo-100">
                                <span>{job.status === 'Estimate' ? 'Total Labor:' : 'Quoted Labor:'}</span>
                                <span>${laborTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold text-indigo-100 pb-3 border-b border-indigo-400/30">
                                <span>Est. Tax ({customer?.taxRate !== undefined && customer?.taxRate !== '' ? customer.taxRate : '8.25'}%):</span>
                                <span>${taxes.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end pt-1 pb-2">
                                <span className={`text-base font-black tracking-wide ${job.status === 'Estimate' ? 'text-indigo-50' : 'text-indigo-200/80'}`}>{job.status === 'Estimate' ? 'GRAND TOTAL' : 'QUOTED TOTAL'}</span>
                                <span className={`${job.status === 'Estimate' ? 'text-4xl' : 'text-2xl text-indigo-200/80'} font-black`}>${grandTotal.toFixed(2)}</span>
                            </div>

                            {job.status !== 'Estimate' && (
                                <div className="mt-4 pt-4 border-t-2 border-indigo-500/50 space-y-3">
                                    <div className="flex justify-between items-center text-sm font-bold text-indigo-100">
                                        <span>Tracked Labor:</span>
                                        <span>${actualLaborTotal.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-end pt-2">
                                        <span className="text-base font-black tracking-wide text-indigo-50 leading-tight">ACTUAL COST<br/><span className="text-[9px] text-indigo-200 opacity-60 font-sans tracking-normal uppercase relative -top-1">Parts + Actual Tracked Labor</span></span>
                                        <span className={`text-4xl font-black ${actualGrandTotal > grandTotal ? 'text-amber-300' : 'text-white'}`}>${actualGrandTotal.toFixed(2)}</span>
                                    </div>
                                    <div className="text-[10px] text-indigo-200/80 text-right mt-1 pt-1">
                                        Margin Delta: <span className={grandTotal - actualGrandTotal >= 0 ? 'text-emerald-300' : 'text-amber-300'}>${(grandTotal - actualGrandTotal).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {job.status === 'Estimate' ? (
                            <button onClick={handleApprove} className="w-full py-4 rounded-xl bg-white text-indigo-600 font-black tracking-widest uppercase text-sm shadow-xl flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors">
                                Approve Quoted Value
                            </button>
                        ) : (
                            <div className="w-full py-4 rounded-xl bg-indigo-900/50 border border-indigo-400 text-indigo-200 font-black tracking-widest uppercase text-sm shadow-inner flex justify-center items-center gap-2">
                                <CheckCircle className="w-5 h-5" /> Approved Work Order
                            </div>
                        )}
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col max-h-[800px]">
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4">Internal Scope Note</h3>
                        <textarea
                            value={job.description || ''}
                            onChange={(e) => setJob({ ...job, description: e.target.value })}
                            placeholder="Write the preliminary scope..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 resize-y min-h-[120px] transition-colors"
                        />
                        
                        {job.editLog && job.editLog.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-zinc-800/80 flex-1 min-h-0 flex flex-col">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4 text-zinc-600" /> Edit History
                                </h4>
                                <div className="space-y-5 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 flex-1">
                                    {[...(job.editLog as any[])].reverse().map((log, idx) => (
                                        <div key={idx} className="flex flex-col border-l-2 border-indigo-500/50 pl-3.5 py-1 group bg-zinc-950/30 rounded-r-lg">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-sm font-bold text-indigo-100 flex items-center gap-2"><User className="w-3.5 h-3.5 text-indigo-400" />{log.userName}</span>
                                                <span className="text-[10px] text-zinc-500 font-mono group-hover:text-zinc-400 transition-colors">{toDateTimeLocal(log.timestamp)}</span>
                                            </div>
                                            <span className="text-xs text-zinc-400 leading-relaxed font-mono">{log.details}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile save button at bottom */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/90 backdrop-blur border-t border-zinc-800 z-50">
                <button
                    onClick={() => handleSave(true)}
                    disabled={!hasChanges || isSaving}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all font-mono tracking-widest uppercase text-sm"
                >
                    <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : (jobId === 'new' ? 'Create Job' : 'Save Changes')}
                </button>
            </div>
        </div>
    );
}
