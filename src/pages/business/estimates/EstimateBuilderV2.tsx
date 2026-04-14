import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../lib/api';
import { db, storage } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import { Save, ArrowLeft, ArrowRight, Printer, CheckCircle, Wrench, Plus, Trash2, Box, Info, X, User, Car, PlusCircle, UserPlus, ClipboardList, Loader2, SearchCode, BookTemplate, Image, Copy, ExternalLink, CloudOff, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, AlertTriangle, Archive } from 'lucide-react';
import { CustomerSelector, StaffSelector, InventorySelector, TaskTemplateSelector } from '../../../components/EntitySelectors';
import { PrintPreviewModal } from './PrintPreviewModal';
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

export function EstimateBuilderV2() {
    const { tenantId, currentUser } = useAuth();
    const { jobId } = useParams();
    const navigate = useNavigate();

    const [job, setJob] = useState<any>(null);
    const [originalJob, setOriginalJob] = useState<any>(null);
    const [customer, setCustomer] = useState<any>(null);
    const [originalCustomer, setOriginalCustomer] = useState<any>(null);
    const [vehicle, setVehicle] = useState<any>(null);
    const [originalVehicle, setOriginalVehicle] = useState<any>(null);

    const [historyStack, setHistoryStack] = useState<{ job: any, customer: any, vehicle: any }[]>([]);
    const [childChangeOrders, setChildChangeOrders] = useState<any[]>([]);

    const [allCustomers, setAllCustomers] = useState<any[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('new');

    const [allVehicles, setAllVehicles] = useState<any[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('new');

    const [customerJobs, setCustomerJobs] = useState<any[]>([]);
    const [vehicleJobs, setVehicleJobs] = useState<any[]>([]);

    const [allStaff, setAllStaff] = useState<any[]>([]);
    const [allInventory, setAllInventory] = useState<any[]>([]);
    const [allTemplates, setAllTemplates] = useState<any[]>([]);

    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [businessSettings, setBusinessSettings] = useState<{ 
        name?: string,
        phone?: string,
        addressStreet?: string,
        addressCity?: string,
        addressState?: string,
        addressZip?: string,
        email?: string,
        website?: string,
        burdenMultiplier: number, 
        standardShopRate: number, 
        averageStaffHourlyCost?: number, 
        defaultSopSupplies?: number, 
        defaultShipping?: number, 
        departments?: any[] 
    }>({ burdenMultiplier: 1.3, standardShopRate: 150, averageStaffHourlyCost: 25, defaultSopSupplies: 0, defaultShipping: 0, departments: [] });
    
    const [ccPhotos, setCcPhotos] = useState<any[]>([]);
    const [loadingCcPhotos, setLoadingCcPhotos] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [lightboxZoom, setLightboxZoom] = useState<number>(1);

    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [linkingPhotosTaskIdx, setLinkingPhotosTaskIdx] = useState<number | null>(null);

    const [highlightedRates, setHighlightedRates] = useState<Record<number, boolean>>({});
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const handlePromoteToSOP = async (task: any) => {
        if (!window.confirm("Promote this task and its R&D notes to a global SOP Template?")) return;
        try {
            const combinedNotes = (task.discoveryNotes || []).map((dn: any) => `${dn.authorName}: ${dn.text}`).join('\n\n');
            const newSopsTxt = task.sops ? `${task.sops}

-- R&D Learnings --
${combinedNotes}` : `-- R&D Learnings --
${combinedNotes}`;
            
            const templateParts = (task.parts || []).map((p: any) => ({
                inventoryId: p.inventoryId || '',
                name: p.name,
                price: p.price,
                quantity: p.quantity
            }));

            const mediaStr = (task.mediaUrls && task.mediaUrls.length > 0) ? `\n\n-- Reference Photos --\n${task.mediaUrls.join('\n')}` : '';

            await api.post('/task_templates', {
                title: task.title,
                description: `Created from Job ${jobId}`,
                bookTime: task.bookTime || 1,
                laborRate: task.laborRate || businessSettings.standardShopRate,
                notes: task.notes || '',
                sops: newSopsTxt + mediaStr,
                directions: task.directions || '',
                parts: templateParts,
                tenantId
            });
            toast.success("SOP Template generated! View it in the Service Catalog.");
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to generate template");
        }
    };

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const loadJob = async () => {
            if (!tenantId || !jobId) return;

            if (jobId === 'new') {
                const newJob = { title: 'New Job Intake', description: '', status: 'Estimate', tasks: [], desiredDropoffDate: '', desiredPickupDate: '', salesNotes: '', customerMeetingNotes: '', salesQuestions: [] };
                setJob(newJob);
                setOriginalJob(JSON.parse(JSON.stringify(newJob)));

                const newCustomer = { firstName: '', lastName: '', company: '', email: '', phone: '', mobile: '', addressStreet: '', addressCity: '', addressState: '', addressZip: '', website: '' };
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
                        completionEta: data.completionEta ? toDateTimeLocal(data.completionEta) : '',
                        desiredDropoffDate: data.desiredDropoffDate ? toDateTimeLocal(data.desiredDropoffDate) : '',
                        desiredPickupDate: data.desiredPickupDate ? toDateTimeLocal(data.desiredPickupDate) : '',
                        salesNotes: data.salesNotes || '',
                        customerMeetingNotes: data.customerMeetingNotes || '',
                        salesQuestions: data.salesQuestions || []
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
                        const empty = { firstName: '', lastName: '', company: '', email: '', phone: '', mobile: '', addressStreet: '', addressCity: '', addressState: '', addressZip: '', website: '' };
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
        if (!tenantId || !jobId || jobId === 'new') return;
        
        const q = query(
            collection(db, 'jobs'),
            where('tenantId', '==', tenantId),
            where('parentJobId', '==', jobId),
            where('isChangeOrder', '==', true)
        );
        
        const unsub = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                return timeA - timeB; // Sort ascending
            });
            setChildChangeOrders(fetched);
        });
        
        return () => unsub();
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
                        name: bRes.data.name || '',
                        phone: bRes.data.phone || '',
                        addressStreet: bRes.data.addressStreet || '',
                        addressCity: bRes.data.addressCity || '',
                        addressState: bRes.data.addressState || '',
                        addressZip: bRes.data.addressZip || '',
                        email: bRes.data.email || '',
                        website: bRes.data.website || '',
                        burdenMultiplier: bRes.data.burdenMultiplier !== undefined ? Number(bRes.data.burdenMultiplier) : 1.3,
                        standardShopRate: bRes.data.standardShopRate !== undefined ? Number(bRes.data.standardShopRate) : 150,
                        averageStaffHourlyCost: bRes.data.averageStaffHourlyCost !== undefined ? Number(bRes.data.averageStaffHourlyCost) : 25,
                        defaultSopSupplies: bRes.data.defaultSopSupplies !== undefined ? Number(bRes.data.defaultSopSupplies) : 0,
                        defaultShipping: bRes.data.defaultShipping !== undefined ? Number(bRes.data.defaultShipping) : 0,
                        departments: bRes.data.departments || []
                    });
                    if (window.location.pathname.endsWith('/new')) {
                        setJob((prev: any) => prev ? {
                            ...prev,
                            sopSupplies: bRes.data.defaultSopSupplies !== undefined ? Number(bRes.data.defaultSopSupplies) : 0,
                            shipping: bRes.data.defaultShipping !== undefined ? Number(bRes.data.defaultShipping) : 0
                        } : prev);
                        setOriginalJob((prev: any) => prev ? {
                            ...prev,
                            sopSupplies: bRes.data.defaultSopSupplies !== undefined ? Number(bRes.data.defaultSopSupplies) : 0,
                            shipping: bRes.data.defaultShipping !== undefined ? Number(bRes.data.defaultShipping) : 0
                        } : prev);
                    }
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
        const fetchHistory = async () => {
            if (!tenantId) return;

            if (selectedCustomerId && selectedCustomerId !== 'new') {
                const q = query(collection(db, 'jobs'), where('tenantId', '==', tenantId), where('customerId', '==', selectedCustomerId));
                const snap = await getDocs(q);
                // @ts-ignore
                const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
                    .filter((x: any) => x.id !== jobId) // exclude current job
                    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                setCustomerJobs(list);
            } else {
                setCustomerJobs([]);
            }

            if (selectedVehicleId && selectedVehicleId !== 'new') {
                const q = query(collection(db, 'jobs'), where('tenantId', '==', tenantId), where('vehicleId', '==', selectedVehicleId));
                const snap = await getDocs(q);
                // @ts-ignore
                const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
                    .filter((x: any) => x.id !== jobId) // exclude current job
                    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                setVehicleJobs(list);
            } else {
                setVehicleJobs([]);
            }
        };
        fetchHistory();
    }, [tenantId, selectedCustomerId, selectedVehicleId, jobId]);


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
        if (!jobId || jobId === 'new') return;
        const fetchPhotos = async () => {
            setLoadingCcPhotos(true);
            try {
                const res = await api.get(`/jobs/${jobId}/companycam-photos`);
                setCcPhotos(res.data || []);
                
                if (job?.companyCamProjectId) {
                    // Silently request a background backup sync; ignores UI and updates purely DB/Storage
                    api.post(`/jobs/${jobId}/sync-media`).catch(() => {});
                }
            } catch (e) {
                console.error("Failed to fetch job photos", e);
            } finally {
                setLoadingCcPhotos(false);
            }
        };
        fetchPhotos();
    }, [job?.companyCamProjectId, jobId]);

    const isLocked = !['Estimate', 'Draft'].includes(job?.status);

    // Auto-Save Effect
    useEffect(() => {
        // Skip for new jobs until manually created once
        if (jobId === 'new') return;

        // Determine if we actually have edits. We don't want to auto-save if everything is identical to original state.
        const custChanged = JSON.stringify(customer) !== JSON.stringify(originalCustomer);
        const vehChanged = JSON.stringify(vehicle) !== JSON.stringify(originalVehicle);
        const jobChanged = JSON.stringify(job) !== JSON.stringify(originalJob);
        
        const hasUnsavedEdits = custChanged || vehChanged || jobChanged;
        
        if (!hasUnsavedEdits) return;

        const timeoutId = setTimeout(() => {
            setHistoryStack(prev => {
                const newStack = [...prev, { 
                    job: JSON.parse(JSON.stringify(originalJob)), 
                    customer: JSON.parse(JSON.stringify(originalCustomer)), 
                    vehicle: JSON.parse(JSON.stringify(originalVehicle)) 
                }];
                // Keep max 10 steps of undo history to prevent memory bloat
                if (newStack.length > 10) newStack.shift(); 
                return newStack;
            });
            handleSave(false);
        }, 2500); // 2.5 second debounce

        return () => clearTimeout(timeoutId);
    }, [job, customer, vehicle, isLocked, jobId, originalJob, originalCustomer, originalVehicle]);

    const handleUndo = () => {
        if (historyStack.length === 0) return;
        const lastState = historyStack[historyStack.length - 1];
        setHistoryStack(prev => prev.slice(0, prev.length - 1));
        
        setJob(lastState.job);
        setCustomer(lastState.customer);
        setVehicle(lastState.vehicle);
        // By intentionally NOT setting the original* states, the auto-save effect will treat the 
        // reverted state as "hasChanges" relative to the current database state, effectively pushing the 
        // bad state into the undo stack ("redo") and overwriting Firestore with the good state.
        toast('Action Undone', { icon: '↩️' });
    };

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
                pickupEta: job.pickupEta,
                completionEta: job.completionEta,
                desiredDropoffDate: job.desiredDropoffDate || null,
                desiredPickupDate: job.desiredPickupDate || null,
                quickbooksInvoiceId: job.quickbooksInvoiceId || '',
                salesNotes: job.salesNotes || '',
                customerMeetingNotes: job.customerMeetingNotes || '',
                salesQuestions: job.salesQuestions || [],
                currentLocationId: job.currentLocationId || null,
                customerId: finalCustId,
                vehicleId: finalVehId,
                tenantId,
                sopSupplies: Number(job.sopSupplies) || 0,
                shipping: Number(job.shipping) || 0,
                discount: Number(job.discount) || 0,
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
                        pickupEta: payload.pickupEta || null,
                        completionEta: payload.completionEta || null,
                        desiredDropoffDate: payload.desiredDropoffDate || null,
                        desiredPickupDate: payload.desiredPickupDate || null,
                        quickbooksInvoiceId: payload.quickbooksInvoiceId || '',
                        salesNotes: payload.salesNotes || '',
                        customerMeetingNotes: payload.customerMeetingNotes || '',
                        salesQuestions: payload.salesQuestions || [],
                        currentLocationId: payload.currentLocationId || null,
                        sopSupplies: payload.sopSupplies,
                        shipping: payload.shipping,
                        discount: payload.discount,
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
                        pickupEta: payload.pickupEta || null,
                        completionEta: payload.completionEta || null,
                        desiredDropoffDate: payload.desiredDropoffDate || null,
                        desiredPickupDate: payload.desiredPickupDate || null,
                        quickbooksInvoiceId: payload.quickbooksInvoiceId || '',
                        salesNotes: payload.salesNotes || '',
                        customerMeetingNotes: payload.customerMeetingNotes || '',
                        salesQuestions: payload.salesQuestions || [],
                        currentLocationId: payload.currentLocationId || null,
                        sopSupplies: payload.sopSupplies,
                        shipping: payload.shipping,
                        discount: payload.discount,
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



    const customEquals = (a: any, b: any) => {
        const cleanA = JSON.parse(JSON.stringify(a || {}));
        const cleanB = JSON.parse(JSON.stringify(b || {}));
        
        // Strip out any dynamic frontend-only properties that might cause trivial mismatches
        if (cleanA && cleanA.tasks) {
            cleanA.tasks.forEach((t: any) => {
                if (!t.assignedUids) t.assignedUids = [];
                if (!t.parts) t.parts = [];
                if (!t.mediaUrls) t.mediaUrls = [];
                if (t.isApproved === null) delete t.isApproved;
            });
        }
        if (cleanB && cleanB.tasks) {
            cleanB.tasks.forEach((t: any) => {
                if (!t.assignedUids) t.assignedUids = [];
                if (!t.parts) t.parts = [];
                if (!t.mediaUrls) t.mediaUrls = [];
                if (t.isApproved === null) delete t.isApproved;
            });
        }

        return JSON.stringify(cleanA) === JSON.stringify(cleanB);
    };

    const hasChanges = !customEquals(job, originalJob) ||
        !customEquals(customer, originalCustomer) ||
        !customEquals(vehicle, originalVehicle);


    const calculatePartsTotal = () => {
        const legacyParts = job?.parts?.reduce((acc: any, part: any) => acc + (Number(part.price) * Number(part.quantity)), 0) || 0;
        const tasksParts = job?.tasks?.reduce((tAcc: any, task: any) => {
            if (task.isApproved === false) return tAcc;
            return tAcc + (task.parts || []).reduce((pAcc: any, part: any) => {
                const discount = Number(part.discount || 0);
                const discountedPrice = Number(part.price) * (1 - (discount / 100));
                return pAcc + (discountedPrice * Number(part.quantity));
            }, 0);
        }, 0) || 0;
        return legacyParts + tasksParts;
    };

    const calculateLaborTotal = () => {
        const legacyLabor = job?.laborLines?.reduce((acc: any, line: any) => acc + (Number(line.rate) * Number(line.hours)), 0) || 0;
        const tasksLabor = job?.tasks?.reduce((tAcc: any, task: any) => {
            if (task.isApproved === false) return tAcc;
            return tAcc + (Number(task.bookTime) * Number(task.laborRate || 0));
        }, 0) || 0;
        return legacyLabor + tasksLabor;
    };

    const handleSendForApproval = async () => {
        if (!window.confirm("Lock this estimate and mark it as Pending Customer Approval?")) return;
        if (hasChanges) await handleSave(false);
        if (jobId === 'new') return;
        try {
            const lockedTaxRate = customer?.taxRate !== undefined && customer?.taxRate !== '' ? customer.taxRate : '8.25';
            await api.put(`/jobs/${jobId}`, { status: 'Pending Approval', lockedTaxRate, tenantId });
            setJob((prev: any) => ({ ...prev, status: 'Pending Approval', lockedTaxRate }));
            setOriginalJob((prev: any) => ({ ...prev, status: 'Pending Approval', lockedTaxRate }));
            toast.success("Estimate sent for approval! Inputs are now locked.");
        } catch (e) {
            toast.error("Failed to update status");
        }
    };

    const handleReviseEstimate = async () => {
        if (!window.confirm("Unlock this estimate to make revisions? This will return it to Draft/Estimate status.")) return;
        try {
            await api.put(`/jobs/${jobId}`, { status: 'Estimate', tenantId });
            setJob((prev: any) => ({ ...prev, status: 'Estimate' }));
            setOriginalJob((prev: any) => ({ ...prev, status: 'Estimate' }));
            toast.success("Estimate unlocked for revisions.");
        } catch (e) {
            toast.error("Failed to update status");
        }
    };

    const handleApprove = async () => {
        if (!window.confirm("Approve quote? This converts the Estimate into an active Work Order.")) return;
        if (hasChanges) await handleSave(false);
        if (jobId === 'new') return;
        try {
            if (job.isChangeOrder) {
                toast.loading("Merging Change Order into Parent Project...", { id: 'merge' });
                await api.post(`/jobs/${jobId}/merge`);
                setJob((prev: any) => ({ ...prev, status: 'Merged' }));
                setOriginalJob((prev: any) => ({ ...prev, status: 'Merged' }));
                toast.success("Change Order Approved & Merged!", { id: 'merge' });
                setTimeout(() => navigate(`/business/jobs/${job.parentJobId}`), 1500);
            } else {
                await api.put(`/jobs/${jobId}`, { status: 'Approved', tenantId });
                setJob((prev: any) => ({ ...prev, status: 'Approved' }));
                setOriginalJob((prev: any) => ({ ...prev, status: 'Approved' }));
                toast.success("Quote Approved! Converted to Work Order.");
            }
        } catch (e) {
            toast.error("Failed to process approval.");
        }
    };

    const handleDenyEstimate = async () => {
        if (!window.confirm("Mark this estimate as Denied? This will move it to the Archive pipeline.")) return;
        if (hasChanges) await handleSave(false);
        if (jobId === 'new') return;
        try {
            await api.put(`/jobs/${jobId}`, { status: 'Declined', tenantId });
            setJob((prev: any) => ({ ...prev, status: 'Declined' }));
            setOriginalJob((prev: any) => ({ ...prev, status: 'Declined' }));
            toast.success("Estimate Denied & Archived.");
        } catch (e) {
            toast.error("Failed to archive estimate");
        }
    };

    const handleDuplicateRevive = async () => {
        if (!window.confirm("Clone this archived record into a brand new Draft Estimate? This will create a new Job ID for tracking.")) return;
        try {
            const payload = {
                ...job,
                status: 'Estimate',
                title: job.title ? `[Revived] ${job.title}` : 'Revived Estimate',
                editLog: [],
                tenantId
            };
            // Strip the explicit auto-identifiers so Firebase issues a fresh one
            delete payload.id;
            delete payload.createdAt;
            delete payload.updatedAt;
            
            toast.loading("Cloning estimate data...", { id: 'cloning' });
            const res = await api.post('/jobs', payload);
            const nId = res.data.id || res.data.jobId;
            
            // Post the backwards-reference connection to the old record
            await api.put(`/jobs/${jobId}`, { revivedToJobId: nId, tenantId });
            setJob((prev: any) => ({ ...prev, revivedToJobId: nId }));

            toast.success("Successfully cloned into new Estimate!", { id: 'cloning' });
            
            navigate(`/business/jobs/${nId}?revived=true`);
        } catch (err) {
            console.error("Clone error", err);
            toast.error("Failed to clone estimate.", { id: 'cloning' });
        }
    };

    const handleCreateChangeOrder = async () => {
        if (!window.confirm("Add a new Supplemental Finding? This will create an isolated Change Order estimate linked to this job.")) return;
        try {
            toast.loading("Sequencing Change Order...", { id: 'co_create' });
            const res = await api.post('/jobs', {
                tenantId,
                title: `Change Order - ${job.title || 'Supplement'}`,
                status: 'Estimate',
                isChangeOrder: true,
                parentJobId: job.id,
                parentJobRefNum: job.id.substring(job.id.length - 4),
                customerId: job.customerId,
                vehicleId: job.vehicleId,
                skipCompanyCamSync: true
            });
            toast.success("Change Order drafted successfully!", { id: 'co_create' });
            // Redirect asynchronously
            setTimeout(() => {
                navigate(`/business/jobs/${res.data.id}?co=true`);
            }, 1000);
        } catch (e) {
            toast.error("Failed to sequence Change Order", { id: 'co_create' });
        }
    };

    const handleMarkAsDeclined = async () => {
        if (!window.confirm("Switch this Archived record to the 'Declined' status? This helps accurate loss tracking.")) return;
        try {
            await api.put(`/jobs/${jobId}`, { status: 'Declined', tenantId });
            setJob((prev: any) => ({ ...prev, status: 'Declined' }));
            setOriginalJob((prev: any) => ({ ...prev, status: 'Declined' }));
            toast.success("Record marked as Declined.");
        } catch (e) {
            toast.error("Failed to update status");
        }
    };

    const handleDeleteJob = async () => {
        if (!window.confirm("WARNING: Are you absolutely sure you want to PERMANENTLY DELETE this job record? This cannot be undone.")) return;
        try {
            toast.loading("Deleting Job Record...", { id: 'delete_job' });
            await api.delete(`/jobs/${jobId}`);
            toast.success("Job Permanently Deleted.", { id: 'delete_job' });
            setTimeout(() => navigate('/business/jobs'), 500);
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to delete job record", { id: 'delete_job' });
        }
    };

    const handleDispatch = async () => {
        if (!window.confirm("Are you sure? This officially dispatches the job to the active 'In Progress' queue for technicians.")) return;
        if (hasChanges) await handleSave(false);
        if (jobId === 'new') return;
        try {
            await api.put(`/jobs/${jobId}`, { status: 'In Progress', tenantId });
            setJob((prev: any) => ({ ...prev, status: 'In Progress' }));
            setOriginalJob((prev: any) => ({ ...prev, status: 'In Progress' }));
            toast.success("Job Dispatched! Now visible as In Progress.");
        } catch (e) {
            toast.error("Failed to dispatch job");
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

    const handleDeletePhoto = async (photoId: string) => {
        if (!window.confirm("Are you sure you want to permanently delete this photo? This will destroy it locally and on CompanyCam.")) return;
        
        try {
            // Optimistic split
            setCcPhotos(prev => prev.filter(p => (p.id || '').toString() !== photoId.toString()));
            await api.delete(`/jobs/${jobId}/media/${photoId}`);
            toast.success("Photo permanently removed");
        } catch (err: any) {
            console.error("Delete failed", err);
            toast.error(err.response?.data?.error || "Failed to delete photo");
            // Pull back if failed
            const res = await api.get(`/jobs/${jobId}/companycam-photos`);
            setCcPhotos(res.data || []);
        }
    };

    if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center font-bold text-zinc-500 animate-pulse">Building Profile...</div>;
    if (!job) return <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center font-bold text-red-500">Not Found<button onClick={() => navigate('/business/jobs')} className="mt-4 bg-zinc-800 text-white px-4 py-2 rounded-lg">Go Back</button></div>;

    const partsTotal = calculatePartsTotal();
    const laborTotal = calculateLaborTotal();
    const subTotal = partsTotal + laborTotal + (Number(job.sopSupplies) || 0) + (Number(job.shipping) || 0);
    const discountAmount = subTotal * ((Number(job.discount) || 0) / 100);
    const subTotalAfterDiscount = subTotal - discountAmount;
    const txRateVal = job.lockedTaxRate ? Number(job.lockedTaxRate) : (customer?.taxRate !== undefined && customer?.taxRate !== '' ? Number(customer.taxRate) : 8.25);
    const txRateDecimal = txRateVal / 100;
    const taxes = subTotalAfterDiscount * txRateDecimal;
    const grandTotal = subTotalAfterDiscount + taxes;

    const computeLaborCost = (isDiscoveryFilter: boolean) => {
        return job?.tasks?.reduce((tAcc: number, _task: any, tIdx: number) => {
            if (_task.isApproved === false) return tAcc; // Exclude explicitly declined tasks
            
            // If the job is still unassigned/unapproved, mathematically forecast labor costs
            if (['Estimate', 'Draft', 'Pending Approval'].includes(job?.status)) {
                if (isDiscoveryFilter) return tAcc; // Cannot forecast RnD
                const hours = Number(_task.bookTime || 0);
                let multiplier = businessSettings.burdenMultiplier;
                const dept = businessSettings.departments?.find((d: any) => d.id === _task.departmentId);
                if (dept && dept.burdenMultiplier) multiplier = dept.burdenMultiplier;
                
                const avgTechWage = (dept && dept.averageStaffHourlyCost !== undefined && dept.averageStaffHourlyCost > 0) 
                    ? dept.averageStaffHourlyCost 
                    : (businessSettings.averageStaffHourlyCost !== undefined ? businessSettings.averageStaffHourlyCost : 25);
                    
                const trueHourlyCost = avgTechWage * multiplier;
                return tAcc + (hours * trueHourlyCost);
            }

            // Once approved and in-progress, rely strictly on tracked time events
            const actualTaskCost = timeLogs.filter((l: any) => l.taskIndex === tIdx && (isDiscoveryFilter ? l.isDiscovery : !l.isDiscovery)).reduce((acc: number, log: any) => {
                const end = log.clockOut ? new Date(log.clockOut).getTime() : currentTime;
                const hours = ((end - new Date(log.clockIn).getTime()) / (1000 * 60 * 60));
                const staffMember = allStaff.find(s => s.uid === (log.userId || log.staffId));
                let rawRate = businessSettings.standardShopRate;
                let multiplier = businessSettings.burdenMultiplier;
                
                const dept = businessSettings.departments?.find((d: any) => d.id === _task.departmentId);
                
                if (staffMember) {
                    // Check if the staff member has a specific wage for this task's department
                    const override = (staffMember.departmentRoles || []).find((dr: any) => dr.departmentName === dept?.name);
                    if (override && Number(override.payRate) > 0) {
                        rawRate = Number(override.payRate);
                    } else if (Number(staffMember.payRate) > 0) {
                        rawRate = Number(staffMember.payRate); // Fallback to global payRate (fixed missing property key!)
                    }
                } else if (dept && dept.standardShopRate > 0) {
                    rawRate = dept.standardShopRate;
                }
                
                if (dept && dept.burdenMultiplier) {
                    multiplier = dept.burdenMultiplier;
                }
                
                // Apply burden multiplier
                const trueHourlyCost = rawRate * multiplier;
                return acc + (hours * trueHourlyCost);
            }, 0);
            return tAcc + actualTaskCost;
        }, 0) || 0;
    };

    const actualStandardLaborTotal = computeLaborCost(false);
    const actualRnDLaborTotal = computeLaborCost(true);
    const actualLaborTotal = actualStandardLaborTotal + actualRnDLaborTotal;
    
    const actualPartsCost = (() => {
        const legacyPartsCost = job?.parts?.reduce((acc: any, part: any) => acc + (Number(part.cost || 0) * Number(part.quantity || 1)), 0) || 0;
        const tasksPartsCost = job?.tasks?.reduce((tAcc: any, task: any) => {
            if (task.isApproved === false) return tAcc; // Exclude explicitly declined tasks from projections
            return tAcc + (task.parts || []).reduce((pAcc: any, part: any) => pAcc + (Number(part.cost || 0) * Number(part.quantity || 1)), 0);
        }, 0) || 0;
        return legacyPartsCost + tasksPartsCost;
    })();

    // Add legacy actual labor if any (though legacy had no tracking, so just use legacy string hours if needed, or 0)
    const effectiveShopSupplies = Number(job?.sopSupplies) || 0;
    const effectiveShipping = Number(job?.shipping) || 0;

    const actualSubTotal = actualPartsCost + actualLaborTotal + effectiveShopSupplies + effectiveShipping;
    const actualDiscountAmount = actualSubTotal * ((Number(job.discount) || 0) / 100);
    const actualSubTotalAfterDiscount = actualSubTotal - actualDiscountAmount;
    const actualGrandTotal = actualSubTotalAfterDiscount; // Never accrue customer sales tax into internal cost margin computations


    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col relative pb-32">
            {showPrintPreview && (
                <PrintPreviewModal 
                    job={job}
                    jobId={jobId}
                    customer={customer}
                    vehicle={vehicle}
                    businessSettings={businessSettings}
                    partsTotal={partsTotal}
                    laborTotal={laborTotal}
                    discountAmount={discountAmount}
                    taxes={taxes}
                    grandTotal={grandTotal}
                    onClose={() => setShowPrintPreview(false)}
                />
            )}
            {linkingPhotosTaskIdx !== null && (
                <div className="fixed inset-0 z-[200] bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
                        <button onClick={() => setLinkingPhotosTaskIdx(null)} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
                        <h2 className="text-xl font-black text-white mb-2 flex items-center gap-2"><Image className="w-5 h-5 text-indigo-400" /> Link Job Photos to Task</h2>
                        <p className="text-zinc-500 text-sm font-medium mb-6">Select photos from the CompanyCam gallery to permanently associate with this task's SOP.</p>
                        
                        <div className="flex-1 overflow-y-auto min-h-0 bg-zinc-950 rounded-xl p-4 border border-zinc-800/50">
                            {ccPhotos.length === 0 ? (
                                <p className="text-zinc-500 text-center py-8">No job media available to link.</p>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                    {ccPhotos.map((photo: any) => {
                                        if (!photo.uris?.[0]?.uri) return null;
                                        const uri = photo.uris[0].uri;
                                        const isSelected = (job.tasks[linkingPhotosTaskIdx].mediaUrls || []).includes(uri);
                                        return (
                                            <div 
                                                key={photo.id || Math.random()} 
                                                className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'border-transparent hover:border-zinc-700'}`}
                                                onClick={() => {
                                                    const t = [...job.tasks];
                                                    const medias = t[linkingPhotosTaskIdx].mediaUrls || [];
                                                    if (isSelected) {
                                                        t[linkingPhotosTaskIdx].mediaUrls = medias.filter((u: string) => u !== uri);
                                                    } else {
                                                        t[linkingPhotosTaskIdx].mediaUrls = [...medias, uri];
                                                    }
                                                    setJob({ ...job, tasks: t });
                                                }}
                                            >
                                                <img src={uri} className="w-full h-full object-cover" />
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 bg-amber-500 text-black p-1 rounded-full"><CheckCircle className="w-4 h-4" /></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setLinkingPhotosTaskIdx(null)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/20">Done Linking</button>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 shadow-2xl">
                {job.isChangeOrder && (
                    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-500 text-xs font-black uppercase tracking-widest text-center py-2 flex items-center justify-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Change Order for Original Work Order #{job.parentJobRefNum}
                    </div>
                )}
                <div className="max-w-7xl mx-auto w-full p-4 md:p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button
                            onClick={() => {
                                if (hasChanges && !window.confirm("You have unsaved changes. Discard?")) return;
                                if (job.isChangeOrder && job.parentJobId) return navigate(`/business/jobs/${job.parentJobId}`);
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
                                        disabled={['Estimate', 'Draft', 'Pending Approval', 'Approved'].includes(job.status)}
                                        onChange={(e) => {
                                            setJob({ ...job, status: e.target.value });
                                            // Handle fast convert if they move from Estimate to anything else without hitting the specific button
                                            if (job.status === 'Estimate' && e.target.value !== 'Estimate') {
                                                toast.success(`Converted to ${e.target.value}! Please save to confirm.`);
                                            }
                                        }}
                                        className={`appearance-none text-xs font-black uppercase tracking-widest px-4 py-2 pr-8 rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${['Estimate', 'Draft', 'Pending Approval', 'Approved'].includes(job.status) ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer shadow-lg hover:brightness-110'} ${
                                            job.status === 'Estimate' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' :
                                            job.status === 'Pending Approval' ? 'bg-amber-600/20 text-amber-300 border-amber-500/50' :
                                            job.status === 'Approved' ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500' :
                                            job.status === 'In Progress' ? 'bg-blue-600/20 text-blue-300 border-blue-500' :
                                            (job.status === 'Ready for QC' || job.status === 'Ready for Invoicing' || job.status === 'Ready for Delivery') ? 'bg-amber-500/20 text-amber-300 border-amber-500' :
                                            (job.status === 'Completed' || job.status === 'Delivered') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500' :
                                            job.status === 'Archived' || job.status === 'archived' ? 'bg-zinc-900 text-zinc-500 border-zinc-800' :
                                            'bg-zinc-800 text-zinc-400 border-zinc-700'
                                        }`}
                                    >
                                        {['Estimate', 'Pending Approval', 'Approved', 'In Progress', 'Ready for QC', 'Ready for Invoicing', 'Ready for Delivery', 'Delivered', 'Archived'].map(s => (
                                            <option key={s} value={s} className="bg-zinc-900 text-white font-mono text-xs my-1">
                                                {s === 'Estimate' || s === 'Draft' ? 'DRAFT JOB / ESTIMATE' : s.toUpperCase()}
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
                            <button
                                onClick={() => setShowPrintPreview(true)}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all font-mono tracking-widest uppercase text-xs"
                            >
                                <Printer className="w-4 h-4" /> Preview
                            </button>
                        )}

                        {jobId === 'new' ? (
                            <button
                                onClick={() => handleSave(true)}
                                disabled={!hasChanges || isSaving}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all font-mono tracking-widest uppercase text-xs"
                            >
                                <Save className="w-4 h-4" /> {isSaving ? 'Creating...' : 'Create Job Profile'}
                            </button>
                        ) : (
                            <div className="flex items-center gap-4 bg-zinc-900/80 px-4 py-2 rounded-xl border border-zinc-800 backdrop-blur">
                                {historyStack.length > 0 && (
                                    <button onClick={handleUndo} className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors border-r border-zinc-700/50 pr-4 mr-2" title="Undo last change">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 010 10 5 5 0 010-10zm0 0l4-4m-4 4l4 4" /></svg>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Undo</span>
                                    </button>
                                )}
                                <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors ${isSaving ? 'text-amber-400' : hasChanges ? 'text-indigo-400' : 'emerald-400'}`}>
                                    {isSaving ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Auto-Saving...</>
                                    ) : hasChanges ? (
                                        <><CloudOff className="w-4 h-4" /> Unsaved Edits...</>
                                    ) : (
                                        <><CheckCircle className="w-4 h-4" /> Saved</>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto w-full p-4 md:p-6 grid grid-cols-1 xl:grid-cols-12 gap-8 mt-4 relative z-10 items-start">
                
                {/* --- MAIN WORK COLUMN (LEFT) --- */}
                <div className="xl:col-span-8 flex flex-col gap-8 min-w-0">

                    {jobId !== 'new' && job?.tasks?.length > 0 && !['Draft', 'Estimate'].includes(job.status) && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
                            
                            <div className="flex items-center gap-4 relative z-10 w-full sm:w-auto">
                                <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                                    <ClipboardList className="w-6 h-6 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-white font-black uppercase tracking-widest text-sm">Line-Item Scope Approvals</h3>
                                    <p className="text-xs text-zinc-400 font-mono mt-1">
                                        {(job.tasks || []).filter((t: any) => t.isApproved === true || ['Finished', 'Ready for QA'].includes(t.status)).length} of {job.tasks?.length || 0} Tasks Approved
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 w-full sm:w-auto justify-end relative z-10 shrink-0 flex-wrap">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
                                    <span className="text-emerald-500/70 text-[10px] uppercase font-bold tracking-widest">Accepted</span>
                                    <span className="text-emerald-500 text-lg font-black leading-none">{(job.tasks || []).filter((t: any) => t.isApproved === true || ['Finished', 'Ready for QA'].includes(t.status)).length}</span>
                                </div>
                                <div className={`border px-4 py-2 rounded-xl flex items-center gap-3 ${
                                    (job.tasks || []).filter((t: any) => (t.isApproved === null || t.isApproved === undefined) && !['Finished', 'Ready for QA'].includes(t.status)).length > 0 
                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                                    : 'bg-zinc-950 border-zinc-800/50 text-zinc-600'
                                }`}>
                                    <span className={`text-[10px] uppercase font-bold tracking-widest ${
                                        (job.tasks || []).filter((t: any) => (t.isApproved === null || t.isApproved === undefined) && !['Finished', 'Ready for QA'].includes(t.status)).length > 0 ? 'text-amber-500/70' : 'text-zinc-600'
                                    }`}>Pending</span>
                                    <span className="text-lg font-black leading-none">{(job.tasks || []).filter((t: any) => (t.isApproved === null || t.isApproved === undefined) && !['Finished', 'Ready for QA'].includes(t.status)).length}</span>
                                </div>
                                <div className={`border px-4 py-2 rounded-xl flex items-center gap-3 ${
                                    (job.tasks || []).filter((t: any) => t.isApproved === false).length > 0 
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                                    : 'bg-zinc-950 border-zinc-800/50 text-zinc-600'
                                }`}>
                                    <span className={`text-[10px] uppercase font-bold tracking-widest ${
                                        (job.tasks || []).filter((t: any) => t.isApproved === false).length > 0 ? 'text-rose-500/70' : 'text-zinc-600'
                                    }`}>Declined</span>
                                    <span className="text-lg font-black leading-none">{(job.tasks || []).filter((t: any) => t.isApproved === false).length}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CUSTOMER CONTEXT */}
                    {/* END MAIN WORK COLUMN (Wait, Customer + Vehicle were here. Moved to right column.) */}
<div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 shadow-xl border border-indigo-500 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[60px] pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-6 flex items-center gap-2">{job.status === 'Estimate' ? 'Quote Totals' : 'Project Financials'}</h3>

                        <div className="space-y-3 font-mono mb-8">
                            <div className="flex flex-col mb-2">
                                <div className="flex justify-between items-center text-xs font-bold text-indigo-100">
                                    <span>Total Parts:</span>
                                    <span>${partsTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-indigo-300 font-mono mt-0.5 opacity-80 border-b border-indigo-500/20 pb-1.5 mb-1.5">
                                    <span>Actual Cost: ${actualPartsCost.toFixed(2)}</span>
                                    <span className={partsTotal - actualPartsCost >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>Margin: ${(partsTotal - actualPartsCost).toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col mb-2">
                                <div className="flex justify-between items-center text-xs font-bold text-indigo-100">
                                    <span>{job.status === 'Estimate' ? 'Total Labor:' : 'Quoted Labor:'}</span>
                                    <span>${laborTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-indigo-300 font-mono mt-0.5 opacity-80 border-b border-indigo-500/20 pb-1.5 mb-1.5">
                                    <span>Actual Cost: ${actualLaborTotal.toFixed(2)}</span>
                                    <span className={laborTotal - actualLaborTotal >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>Margin: ${(laborTotal - actualLaborTotal).toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-indigo-100 group">
                                <span className="flex items-center gap-2">Shop Supplies:</span>
                                <div className="flex items-center relative">
                                    <span className="absolute left-2 text-indigo-300 opacity-50">$</span>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        disabled={isLocked}
                                        value={job.sopSupplies !== undefined ? job.sopSupplies : (businessSettings.defaultSopSupplies || 0)}
                                        onChange={(e) => setJob({...job, sopSupplies: parseFloat(e.target.value) || 0})}
                                        className="bg-indigo-900/30 border border-transparent hover:border-indigo-500/50 focus:border-indigo-400 rounded px-2 pl-5 py-0.5 w-24 text-right focus:outline-none focus:bg-indigo-900/50 transition-all font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-75"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-indigo-100 group">
                                <span className="flex items-center gap-2">Shipping/Freight:</span>
                                <div className="flex items-center relative">
                                    <span className="absolute left-2 text-indigo-300 opacity-50">$</span>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        disabled={isLocked}
                                        value={job.shipping !== undefined ? job.shipping : (businessSettings.defaultShipping || 0)}
                                        onChange={(e) => setJob({...job, shipping: parseFloat(e.target.value) || 0})}
                                        className="bg-indigo-900/30 border border-transparent hover:border-indigo-500/50 focus:border-indigo-400 rounded px-2 pl-5 py-0.5 w-24 text-right focus:outline-none focus:bg-indigo-900/50 transition-all font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-75"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-green-400 group pt-1">
                                <span className="flex items-center gap-2">Discount (%):</span>
                                <div className="flex items-center relative">
                                    <span className="absolute right-2 text-green-500/50 opacity-80">%</span>
                                    <input 
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        disabled={isLocked}
                                        value={job.discount || 0}
                                        onChange={(e) => setJob({...job, discount: parseFloat(e.target.value) || 0})}
                                        className="bg-indigo-900/30 border border-transparent hover:border-green-500/50 focus:border-green-400 rounded px-2 text-green-400 py-0.5 w-24 text-right focus:outline-none focus:bg-indigo-900/50 transition-all font-mono shadow-inner pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-75"
                                    />
                                </div>
                            </div>
                            {Number(job.discount) > 0 && (
                                <div className="flex justify-end text-[10px] text-green-400/80 font-mono italic -mt-1 pb-1">
                                    (-${discountAmount.toFixed(2)})
                                </div>
                            )}
                            <div className="flex justify-between items-center text-xs font-bold text-indigo-100 pb-3 border-b border-indigo-400/30">
                                <span>Est. Tax ({job.lockedTaxRate || (customer?.taxRate !== undefined && customer?.taxRate !== '' ? customer.taxRate : '8.25')}%):</span>
                                <span>${taxes.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end pt-4 pb-2">
                                <span className="text-sm font-black tracking-wide text-indigo-50 leading-tight opacity-80 uppercase">Quoted Total</span>
                                <span className={`text-5xl font-black tracking-tight text-white drop-shadow-md`}>${grandTotal.toFixed(2)}</span>
                            </div>

                            <div className="mt-4 pt-4 border-t-2 border-indigo-500/50 space-y-3">
                                <div className="flex justify-between items-start text-[10px] font-bold text-indigo-200/60 uppercase tracking-widest">
                                    <span>Tracked Labor Component:</span>
                                    <div className="flex flex-col items-end">
                                        <span>${actualLaborTotal.toFixed(2)}</span>
                                        {actualRnDLaborTotal > 0 && (
                                            <div className="flex items-center gap-1 mt-0.5" title="R&D Tracked Labor Component">
                                                <span className="text-[9px] text-amber-300 font-black tracking-widest uppercase bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">Includes ${actualRnDLaborTotal.toFixed(2)} R&D</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-2 gap-4">
                                    <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex flex-col pt-2 shadow-inner">
                                        <span className="text-[10px] text-rose-400 font-bold tracking-widest uppercase mb-1">Actual Cost</span>
                                        <span className="text-2xl font-black text-rose-300">${actualGrandTotal.toFixed(2)}</span>
                                        <span className="text-[8px] text-rose-400/60 font-sans tracking-wide uppercase leading-none mt-1">Parts + Labor + Overhead</span>
                                    </div>
                                    <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col pt-2 shadow-inner">
                                        <span className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mb-1">Margin Delta</span>
                                        <span className={`text-2xl font-black ${subTotalAfterDiscount - actualGrandTotal >= 0 ? 'text-emerald-300' : 'text-amber-400'}`}>
                                            ${(subTotalAfterDiscount - actualGrandTotal).toFixed(2)}
                                        </span>
                                        <span className="text-[8px] text-emerald-400/60 font-sans tracking-wide uppercase leading-none mt-1">Net Gain/Loss</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {job.status === 'Estimate' ? (
                            <button onClick={handleSendForApproval} className="w-full py-4 rounded-xl bg-white text-indigo-600 font-black tracking-widest uppercase text-sm shadow-xl flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors">
                                Send for Approval (Lock Quoted Value)
                            </button>
                        ) : job.status === 'Pending Approval' ? (
                            <div className="space-y-3">
                                <div className="w-full py-2.5 rounded-xl bg-amber-900/40 border border-amber-500/30 text-amber-300 font-black tracking-widest uppercase text-xs shadow-inner flex justify-center items-center gap-1.5 opacity-80">
                                    <AlertTriangle className="w-4 h-4" /> Pending Customer Review
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={handleReviseEstimate} className="w-full py-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-black tracking-widest uppercase text-xs shadow-xl flex justify-center items-center gap-2 transition-all">
                                        Revise Estimate (Unlock)
                                    </button>
                                    <button onClick={handleApprove} className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase text-xs shadow-xl flex justify-center items-center gap-2 transition-all">
                                        Approve & Convert to WO
                                    </button>
                                </div>
                                <button onClick={handleDenyEstimate} className="w-full py-3 rounded-xl bg-red-950/30 hover:bg-red-900/50 text-red-500 hover:text-red-400 border border-red-900/50 font-black tracking-widest uppercase text-xs flex justify-center items-center gap-2 transition-all mt-2">
                                    <X className="w-4 h-4" /> Customer Denied Estimate (Archive)
                                </button>
                            </div>
                        ) : job.status === 'Approved' ? (
                            <div className="space-y-3">
                                <div className="w-full py-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 font-black tracking-widest uppercase text-xs shadow-inner flex justify-center items-center gap-1.5 opacity-80">
                                    <CheckCircle className="w-4 h-4" /> Approved Work Order
                                </div>
                                <button onClick={handleDispatch} className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black tracking-widest uppercase text-sm shadow-xl flex justify-center items-center gap-2 transition-all">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                    Dispatch Job (Mark In Progress)
                                </button>
                            </div>
                        ) : ['Archived', 'Declined'].includes(job.status) ? (
                            <div className="space-y-3">
                                <div className={`w-full py-4 rounded-xl ${job.status === 'Declined' ? 'bg-red-950/50 border-red-900/50 text-red-500' : 'bg-zinc-900/80 border-zinc-700 text-zinc-400'} border font-black tracking-widest uppercase text-sm shadow-inner flex flex-col justify-center items-center gap-1`}>
                                    <div className="flex items-center gap-2">
                                        <Archive className="w-4 h-4" /> {job.status === 'Declined' ? 'DECLINED RECORD' : 'ARCHIVED RECORD'}
                                    </div>
                                    {job.revivedToJobId && (
                                        <button onClick={() => navigate(`/business/jobs/${job.revivedToJobId}`)} className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold tracking-widest uppercase flex items-center gap-1 transition-colors">
                                            Revived as: #{job.revivedToJobId.substring(0,6).toUpperCase()} <ArrowRight className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                <button onClick={handleDuplicateRevive} className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-800 hover:from-indigo-800 hover:to-indigo-700 text-indigo-300 font-black tracking-widest uppercase text-xs shadow-xl flex justify-center items-center gap-2 transition-all border border-indigo-700/50">
                                    <Copy className="w-4 h-4" /> Duplicate & Revive Quote
                                </button>
                                {job.status === 'Archived' && (
                                    <button onClick={handleMarkAsDeclined} className="w-full text-center text-[10px] text-zinc-500 hover:text-red-400 font-bold uppercase tracking-widest transition-colors mt-2">
                                        Mark as "Declined" instead of Archived
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="w-full py-4 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-400 font-black tracking-widest uppercase text-sm shadow-inner flex justify-center items-center gap-2">
                                {job.status} Work Order
                            </div>
                        )}

                        <button onClick={handleDeleteJob} className="w-full mt-4 py-3 rounded-xl bg-red-950/20 hover:bg-red-950/50 text-red-500 hover:text-red-400 border border-red-900/40 font-black tracking-widest uppercase text-[10px] flex justify-center items-center gap-1.5 transition-all opacity-80 hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" /> Permanent Delete Record
                        </button>
                    </div>
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
                                                    setCustomer({ firstName: '', lastName: '', company: '', email: '', phone: '', mobile: '', addressStreet: '', addressCity: '', addressState: '', addressZip: '', taxRate: '8.25', defaultDiscount: 0, website: '' });
                                                    setJob({ ...job, customerId: null, vehicleId: null });
                                                } else if (entity) {
                                                    setCustomer({
                                                        id: entity.id,
                                                        firstName: entity.firstName || '',
                                                        lastName: entity.lastName || '',
                                                        company: entity.company || '',
                                                        email: entity.email || '',
                                        website: entity.website || '',
                                                        phone: entity.phone || '',
                                                        mobile: entity.mobile || '',
                                                        addressStreet: entity.addressStreet || '',
                                                        addressCity: entity.addressCity || '',
                                                        addressState: entity.addressState || '',
                                                        addressZip: entity.addressZip || '',
                                                        taxRate: entity.taxRate !== undefined ? entity.taxRate : '8.25',
                                                        defaultDiscount: entity.defaultDiscount || 0
                                                    });
                                                    setJob({ ...job, customerId: entity.id, vehicleId: null, discount: (job.status === 'Estimate' && entity.defaultDiscount) ? entity.defaultDiscount : (job.discount || 0) });
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
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Website URL</label>
                                            <input type="url" value={customer?.website || ''} onChange={e => setCustomer({ ...customer, website: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium" />
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
                                        <div className="md:col-span-2 border-t border-zinc-800/80 pt-4 mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Sales Tax Rate (%)</label>
                                                <div className="flex items-center gap-3">
                                                    <input type="number" step="0.01" value={customer?.taxRate !== undefined ? customer.taxRate : '8.25'} onChange={e => setCustomer({ ...customer, taxRate: e.target.value })} className="w-full md:w-48 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium font-mono" />
                                                    <span className="text-zinc-500 font-bold">%</span>
                                                </div>
                                                <p className="text-[10px] text-zinc-600 mt-1">Leave empty or 0 if tax exempt.</p>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm text-green-400">Default Discount (%)</label>
                                                <div className="flex items-center gap-3">
                                                    <input type="number" min="0" max="100" step="0.1" value={customer?.defaultDiscount || 0} onChange={e => setCustomer({ ...customer, defaultDiscount: Math.max(0, Math.min(100, Number(e.target.value))) })} className="w-full md:w-48 bg-zinc-950 border border-zinc-800 focus:border-green-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500/50 transition-all font-medium font-mono" />
                                                    <span className="text-green-500/50 font-bold">%</span>
                                                </div>
                                                <p className="text-[10px] text-zinc-600 mt-1">Automatically applied to future jobs.</p>
                                            </div>
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
                            {!job.isChangeOrder && (
                                <button disabled={isLocked} onClick={() => setIsCustomerModalOpen(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {(!customer?.firstName && !customer?.company) ? '+ SET CUSTOMER' : 'EDIT / SWAP'}
                                </button>
                            )}
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

                                {customerJobs.length > 0 && (
                                    <div className="text-zinc-400 text-sm mt-4 pt-4 border-t border-zinc-800/50">
                                        <span className="text-zinc-600 mb-2 flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                                            <span>Past Jobs (Last 3)</span>
                                            <span className="text-zinc-700 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded shadow-inner">{customerJobs.length} Total</span>
                                        </span>
                                        <div className="space-y-2">
                                            {customerJobs.slice(0, 3).map((cj: any) => (
                                                <a key={cj.id} href={`/business/estimates/${cj.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-zinc-950/40 hover:bg-zinc-800 border border-zinc-800/40 hover:border-indigo-500/50 rounded-lg p-2.5 transition-all text-xs group">
                                                    <div>
                                                        <div className="font-bold text-indigo-300 group-hover:text-indigo-400 inline-flex items-center gap-1">
                                                            {cj.title || 'Untitled Job'} <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                        <div className="text-zinc-500 text-[10px] uppercase tracking-wider">{new Date(cj.createdAt || 0).toLocaleDateString()} &middot; {cj.status}</div>
                                                    </div>
                                                    <div className="font-mono text-zinc-300 font-bold">${((cj.grandTotal || 0)).toFixed(2)}</div>
                                                </a>
                                            ))}
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
                            {!job.isChangeOrder && (
                                <button disabled={isLocked} onClick={() => setIsVehicleModalOpen(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {(!vehicle?.make && !vehicle?.model) ? '+ SET VEHICLE' : 'EDIT / SWAP'}
                                </button>
                            )}
                        </div>

                        {(vehicle?.make || vehicle?.model || vehicle?.year) ? (
                            <div className="mt-4 bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/80">
                                <div className="font-bold text-white text-lg">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</div>
                                {(vehicle.vin) && (
                                    <div className="text-zinc-400 text-sm mt-2 grid grid-cols-1 gap-2 border-b border-zinc-800/50 pb-3 mb-3">
                                        <div><span className="text-zinc-600 mr-2 text-[10px] uppercase font-bold tracking-wider">VIN</span><span className="font-mono">{vehicle.vin}</span></div>
                                    </div>
                                )}
                                {!job.isChangeOrder && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Vehicle Drop-Off ETA</label>
                                            <input
                                                type="datetime-local"
                                                disabled={isLocked || ['In Progress', 'Ready for QA', 'Ready for Invoicing', 'Ready for Delivery', 'Delivered'].includes(job.status)}
                                                value={job.dropoffEta || ''}
                                                onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                                onChange={e => setJob({ ...job, dropoffEta: e.target.value })}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Target Pick-Up ETA</label>
                                            <input
                                                type="datetime-local"
                                                value={job.pickupEta || ''}
                                                onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                                onChange={e => setJob({ ...job, pickupEta: e.target.value })}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                            />
                                        </div>
                                    </div>
                                )}
                                {vehicleJobs.length > 0 && (
                                    <div className="text-zinc-400 text-sm mt-4 pt-4 border-t border-zinc-800/50">
                                        <span className="text-zinc-600 mb-2 flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                                            <span>Past Jobs (Last 3)</span>
                                            <span className="text-zinc-700 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded shadow-inner">{vehicleJobs.length} Total</span>
                                        </span>
                                        <div className="space-y-2">
                                            {vehicleJobs.slice(0, 3).map((vj: any) => (
                                                <a key={vj.id} href={`/business/estimates/${vj.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-zinc-950/40 hover:bg-zinc-800 border border-zinc-800/40 hover:border-amber-500/50 rounded-lg p-2.5 transition-all text-xs group">
                                                    <div>
                                                        <div className="font-bold text-amber-300 group-hover:text-amber-400 inline-flex items-center gap-1">
                                                            {vj.title || 'Untitled Job'} <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                        <div className="text-zinc-500 text-[10px] uppercase tracking-wider">{new Date(vj.createdAt || 0).toLocaleDateString()} &middot; {vj.status}</div>
                                                    </div>
                                                    <div className="font-mono text-zinc-300 font-bold">${((vj.grandTotal || 0)).toFixed(2)}</div>
                                                </a>
                                            ))}
                                        </div>
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
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-visible">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-black text-white flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                    </svg>
                                    Job Media
                                    <div className="group relative flex items-center ml-1">
                                        <Info className="w-4 h-4 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                                        <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-56 p-2.5 bg-zinc-800 text-[10px] text-zinc-300 rounded-lg shadow-xl border border-zinc-700 text-center font-normal z-50 leading-relaxed">
                                            {job?.companyCamProjectId ? (
                                                <>Photos are actively <b>synced</b>! Any media uploaded here or in the CompanyCam app will automatically mirror in both places.</>
                                            ) : (
                                                <>Photos are stored <b>natively</b>. Click "Start Syncing With CompanyCam" to connect this job to an external project.</>
                                            )}
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
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button
                                            onClick={handleCompanyCamSync}
                                            disabled={isSyncingCC}
                                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg transition-all tracking-widest uppercase text-[10px]"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                                            {isSyncingCC ? 'Syncing...' : 'Start Syncing With CompanyCam'}
                                        </button>
                                        <label className={`bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer uppercase tracking-widest ${isUploadingMedia ? 'opacity-50 pointer-events-none' : ''}`}>
                                            {isUploadingMedia ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Plus className="w-3.5 h-3.5" />
                                            )}
                                            {isUploadingMedia ? 'UPLOADING...' : 'UPLOAD MEDIA'}
                                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleUploadMedia} disabled={isUploadingMedia} />
                                        </label>
                                    </div>
                                )}
                            </div>

                            {(!job?.companyCamProjectId && ccPhotos.length === 0) ? (
                                <div className="bg-zinc-950/50 rounded-xl p-8 border border-zinc-800/50 border-dashed text-center">
                                    <h3 className="text-zinc-300 font-bold mb-2">Media Sync is Idle</h3>
                                    <p className="text-zinc-500 text-sm max-w-md mx-auto">Click the button above to securely connect this Work Order to CompanyCam and instantly enable native photo rendering, or simply upload photos directly to UpfitterOS.</p>
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
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                                    {ccPhotos.map((photo: any, index: number) => (
                                        <div key={photo.id || Math.random()} className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 cursor-pointer" onClick={() => { setLightboxIndex(index); setLightboxZoom(1); }}>
                                            {photo.uris?.[0]?.uri ? (
                                                <img
                                                    src={photo.uris[0].uri}
                                                    alt="Job media"
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                />
                                            ) : (
                                                <div className="text-[8px] text-zinc-500 overflow-hidden font-mono p-1 break-words h-full">DEBUG: {JSON.stringify(photo).substring(0, 500)}</div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                                <div className="flex justify-end">
                                                    {!photo.id?.toString().startsWith('temp_') && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                                                            className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded shadow backdrop-blur transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Delete Permanently"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-[9px] text-white font-mono tracking-wider truncate">Uploaded by {photo.creator_name || photo.creator?.name || 'Staff'}</div>
                                            </div>
                                            {photo.id?.toString().startsWith('native_') && (
                                                <div className="absolute top-2 left-2 bg-zinc-900/90 backdrop-blur border border-zinc-800 text-zinc-400 text-[8px] font-black uppercase px-2 py-0.5 rounded shadow drop-shadow flex items-center gap-1" title="Stored directly on Upfitter OS (not synced to CompanyCam)">
                                                    <CloudOff className="w-2.5 h-2.5 text-zinc-500" />
                                                    Native
                                                </div>
                                            )}
                                            {photo.id?.toString().startsWith('temp_') && (
                                                <div className="absolute top-2 right-2 bg-indigo-600/90 backdrop-blur text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow drop-shadow flex items-center gap-1 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin"/> {job?.companyCamProjectId ? 'Syncing' : 'Uploading'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}



                    {/* LINKED CHANGE ORDERS / SUPPLEMENTS UI */}
                    {!job.isChangeOrder && childChangeOrders.length > 0 && (
                        <div className="bg-amber-900/10 border border-amber-500/30 rounded-3xl p-6 shadow-xl mb-6">
                            <h2 className="text-lg font-black text-amber-500 flex items-center gap-2 mb-4">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                Linked Change Orders
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {childChangeOrders.map((co) => (
                                    <div key={co.id} className="bg-zinc-950 border border-amber-500/20 rounded-2xl p-4 flex flex-col hover:border-amber-500/50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className={`font-bold text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                                                co.status === 'Merged' ? 'bg-zinc-800 text-zinc-400 border-zinc-700' :
                                                co.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            }`}>
                                                {co.status === 'Estimate' ? 'DRAFT' : co.status}
                                            </div>
                                            <span className="text-zinc-500 font-mono text-xs">#{co.id.substring(co.id.length - 6, co.id.length).toUpperCase()}</span>
                                        </div>
                                        <h3 className="text-white font-bold mb-3">{co.title || 'Untitled Change Order'}</h3>
                                        <button 
                                            onClick={() => navigate(`/business/estimates/${co.id}`)}
                                            className="mt-auto self-start text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                        >
                                            View Details <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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
                                        if (isLocked) return;
                                        const liveParts = ((template.parts || template.defaultParts) || []).map((tp: any) => {
                                            const matchingInv = allInventory.find((inv: any) => inv.id === tp.inventoryId || inv.id === tp.id);
                                            if (matchingInv) {
                                                return {
                                                    ...tp,
                                                    price: matchingInv.price,
                                                    cost: matchingInv.cost || 0,
                                                    name: matchingInv.name
                                                };
                                            }
                                            return tp;
                                        });

                                        const newTask = {
                                            title: template.title || template.name || 'New Task from Template',
                                            status: 'Not Started',
                                            bookTime: template.bookTime || 1,
                                            actualTime: 0,
                                            laborRate: template.laborRate || businessSettings.standardShopRate,
                                            assignedUids: [],
                                            parts: liveParts,
                                            notes: template.notes || '',
                                            sops: template.sops || '',
                                            directions: template.techDirections || template.directions || '',
                                            isApproved: null
                                        };
                                        setJob({ ...job, tasks: [...job.tasks, newTask] });
                                    }}
                                    trigger={
                                        <button disabled={isLocked}
                                            className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-xs font-mono tracking-widest uppercase border border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ClipboardList className="w-3.5 h-3.5" /> Template Task
                                        </button>
                                    }
                                />
                                <button
                                    onClick={() => {
                                        setJob({ ...job, tasks: [...job.tasks, { title: '', status: 'Not Started', bookTime: 1, actualTime: 0, laborRate: businessSettings.standardShopRate, assignedUids: [], parts: [], notes: '', sops: '', directions: '', isApproved: null }] });
                                    }}
                                    disabled={isLocked}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-xs font-mono tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Custom Task
                                </button>
                                {isLocked && job.status !== 'Pending Approval' && !job.isChangeOrder && (
                                    <button
                                        onClick={handleCreateChangeOrder}
                                        className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-500 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-xs font-mono tracking-widest uppercase border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                    >
                                        <PlusCircle className="w-3.5 h-3.5" /> Create Change Order
                                    </button>
                                )}
                            </div>
                        </div>

                        {job.tasks.length === 0 ? (
                            <div className="text-center p-8 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center">
                                <Box className="w-10 h-10 text-zinc-700 mb-3" />
                                <p className="text-zinc-400 font-medium font-mono text-sm">No tasks added to this job scope.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {job.tasks.map((task: any, tIdx: number) => ({ task, originalIndex: tIdx }))
                                    .sort((a: any, b: any) => {
                                        // Move fully rejected tasks to the bottom of the list visually
                                        if (a.task.isApproved === false && b.task.isApproved !== false) return 1;
                                        if (a.task.isApproved !== false && b.task.isApproved === false) return -1;
                                        return a.originalIndex - b.originalIndex;
                                    })
                                    .map(({ task, originalIndex: tIdx }: { task: any, originalIndex: number }) => {
                                    // A task blocks cost/qty changes if it's explicitly locked or specifically approved
                                    const isTaskLocked = (isLocked && !task.isSupplement) || (isLocked && (task.isApproved === true || task.isApproved === false));
                                    return (
                                    <div key={tIdx} className={`border ${
                                        task.isApproved === false ? 'bg-zinc-950/50 border-rose-500/50 hover:border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)] opacity-75 grayscale-[0.2]' :
                                        task.isSupplement ? 'bg-zinc-950 border-amber-500/50 hover:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative' : 
                                        'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                                    } transition-all duration-300 rounded-2xl overflow-hidden shadow-lg group`}>
                                        {task.isSupplement && (
                                            <div className="absolute top-0 right-0 bg-amber-500/20 border-b border-l border-amber-500/50 px-3 py-1 rounded-bl-xl text-amber-500 text-[9px] font-black uppercase tracking-widest z-10 flex items-center gap-1 backdrop-blur-sm">
                                                <AlertTriangle className="w-3 h-3" /> Supplemental
                                            </div>
                                        )}
                                        <div className="bg-zinc-900/50 p-4 border-b border-zinc-800/60 flex flex-col gap-4">
                                            <div className="w-full">
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest shadow-sm">Task Name / Procedure</label>
                                                    <div className="flex items-center gap-2">
                                                        {(!task.status || task.status === 'Not Started' || task.status === 'Pending') && !isTaskLocked && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm('Are you sure you want to completely remove this task?')) {
                                                                        const t = [...job.tasks];
                                                                        t.splice(tIdx, 1);
                                                                        setJob({ ...job, tasks: t });
                                                                    }
                                                                }}
                                                                className="text-zinc-600 hover:text-red-500 transition-colors p-1"
                                                                title="Remove Task"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {job.status === 'Pending Approval' ? (
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    const t = [...job.tasks];
                                                                    if (task.isApproved === null || task.isApproved === undefined) {
                                                                        t[tIdx].isApproved = true;
                                                                    } else if (task.isApproved === true) {
                                                                        t[tIdx].isApproved = false;
                                                                    } else {
                                                                        t[tIdx].isApproved = null;
                                                                    }
                                                                    setJob({ ...job, tasks: t });
                                                                }}
                                                                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors border cursor-pointer ${
                                                                    task.isApproved === true 
                                                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                                                                        : task.isApproved === false 
                                                                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                                                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 shadow-inner'
                                                                }`}
                                                            >
                                                                {task.isApproved === true ? '✓ Customer Approved' : task.isApproved === false ? '❌ Customer Declined' : '⚪ Pending Review'}
                                                            </button>
                                                        ) : (
                                                            task.isApproved === false ? (
                                                                <div className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors border pointer-events-none bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]">
                                                                    ❌ Customer Declined
                                                                </div>
                                                            ) : (
                                                                <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors border pointer-events-none ${
                                                                    task.status === 'Finished' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]' :
                                                                    task.status === 'Ready for QA' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.1)]' :
                                                                    task.status === 'In Progress' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]' :
                                                                    task.status === 'Paused' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.1)]' :
                                                                    task.status === 'Blocked' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(225,29,72,0.1)]' :
                                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                                }`}>
                                                                    {task.status === 'Finished' ? '✓ Finished' : 
                                                                     task.status === 'Ready for QA' ? '🔍 Pending QA' : 
                                                                     task.status === 'In Progress' ? '▶ In Progress' :
                                                                     task.status === 'Paused' ? '⏸ Paused' :
                                                                     task.status === 'Blocked' ? '🛑 Blocked' :
                                                                     '⚪ Not Started'}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={task.title}
                                                    disabled={isTaskLocked}
                                                    placeholder="e.g. Install Suspension Kit"
                                                    onChange={e => {
                                                        const t = [...job.tasks]; t[tIdx].title = e.target.value; setJob({ ...job, tasks: t });
                                                    }}
                                                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-3 text-lg text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-black placeholder:text-zinc-700 shadow-inner disabled:opacity-75"
                                                />
                                                {task.isApproved === false && (
                                                    <div className="mt-3 bg-rose-500/5 rounded-xl border border-rose-500/20 p-3 flex flex-col gap-1.5 shadow-inner">
                                                        <label className="text-[10px] text-rose-500/80 font-black uppercase tracking-widest flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Decline Reason & Follow-up Notes</label>
                                                        <input
                                                            type="text"
                                                            value={task.declineReason || ''}
                                                            onChange={e => {
                                                                const t = [...job.tasks]; t[tIdx].declineReason = e.target.value; setJob({ ...job, tasks: t });
                                                            }}
                                                            placeholder="Why did the customer decline? (e.g. 'Too expensive right now', 'Will do next month')"
                                                            className="w-full bg-transparent border-b border-rose-500/30 pb-1 text-sm text-rose-100 focus:outline-none focus:border-rose-500 placeholder-rose-500/30"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-col md:flex-row justify-between gap-4 pt-1">
                                                <div className="flex items-start gap-6">
                                                    <div className="w-32 md:w-48">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Department</label>
                                                        <select
                                                            value={task.departmentId || ''}
                                                            disabled={isLocked || (job.status !== 'Draft' && job.status !== 'Estimate')}
                                                            onChange={e => {
                                                                const deptId = String(e.target.value);
                                                                const t = [...job.tasks];
                                                                const updatedTask = { ...t[tIdx] };
                                                                updatedTask.departmentId = deptId;
                                                                if (deptId && businessSettings.departments) {
                                                                    const dept = businessSettings.departments.find((d: any) => String(d.id) === deptId);
                                                                    if (dept) updatedTask.laborRate = Number(dept.standardShopRate) || 0;
                                                                } else {
                                                                    updatedTask.laborRate = Number(businessSettings.standardShopRate) || 0;
                                                                }
                                                                t[tIdx] = updatedTask;
                                                                setJob({ ...job, tasks: t });
                                                                
                                                                setHighlightedRates(prev => ({ ...prev, [tIdx]: true }));
                                                                setTimeout(() => {
                                                                    setHighlightedRates(prev => ({ ...prev, [tIdx]: false }));
                                                                }, 1000);
                                                            }}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Global / None</option>
                                                            {businessSettings.departments?.map((d: any) => (
                                                                <option key={d.id} value={d.id}>{d.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="w-24 pl-6 border-l border-zinc-800/60">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Hrs <Info className="w-3 h-3 text-zinc-600" /></label>
                                                        <input
                                                            type="number"
                                                            min="0" step="0.5"
                                                            value={task.bookTime}
                                                            disabled={isTaskLocked}
                                                            onChange={e => {
                                                                const t = [...job.tasks]; t[tIdx].bookTime = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                            }}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center disabled:opacity-75"
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
                                                            className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center transition-all duration-700 ${highlightedRates[tIdx] ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 scale-[1.02] shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-zinc-800'}`}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 md:pl-6 md:border-l border-zinc-800/60 pt-4 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                                                    {(() => {
                                                        const stdTaskHours = timeLogs.filter((l: any) => l.taskIndex === tIdx && !l.isDiscovery).reduce((acc: number, log: any) => {
                                                            const end = log.clockOut ? new Date(log.clockOut).getTime() : Date.now();
                                                            return acc + ((end - new Date(log.clockIn).getTime()) / (1000 * 60 * 60));
                                                        }, 0);
                                                        const rndTaskHours = timeLogs.filter((l: any) => l.taskIndex === tIdx && l.isDiscovery).reduce((acc: number, log: any) => {
                                                            const end = log.clockOut ? new Date(log.clockOut).getTime() : Date.now();
                                                            return acc + ((end - new Date(log.clockIn).getTime()) / (1000 * 60 * 60));
                                                        }, 0);
                                                        const actualTaskHours = stdTaskHours + rndTaskHours;
                                                        const actualLaborValue = actualTaskHours * Number(task.laborRate || 0);
                                                        const partsValue = (task.parts || []).reduce((acc: number, p: any) => {
                                                            const discountedPrice = Number(p.price || 0) * (1 - (Number(p.discount || 0) / 100));
                                                            return acc + (discountedPrice * Number(p.quantity || 1));
                                                        }, 0);
                                                        const partsActualValue = (task.parts || []).reduce((acc: number, p: any) => acc + (Number(p.cost || p.price || 0) * Number(p.quantity || 1)), 0);
                                                        const taskQuotedValue = (Number(task.bookTime || 0) * Number(task.laborRate || 0)) + partsValue;
                                                        const taskActualValue = actualLaborValue + partsActualValue;
                                                        
                                                        return (
                                                            <>
                                                                <div className="flex flex-col flex-1 md:flex-none justify-center items-end pr-6 md:pr-4 md:mr-4 border-r border-zinc-800/60">
                                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1" title="Quoted Hours x Rate + Parts">Approved Est</label>
                                                                    <span className="font-mono text-zinc-300 font-black text-xl tracking-tight">${taskQuotedValue.toFixed(2)}</span>
                                                                </div>
                                                                <div className="flex flex-col flex-1 md:flex-none justify-center items-end">
                                                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1" title="Actual Tracked Hours x Rate + Parts">Actual Cost</label>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`font-mono font-black text-xl tracking-tight ${taskActualValue > taskQuotedValue ? 'text-amber-500' : 'text-emerald-400'}`}>${taskActualValue.toFixed(2)}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 mt-0.5">
                                                                        <span className="text-[9px] text-zinc-500 font-bold uppercase">{stdTaskHours.toFixed(1)}h STD</span>
                                                                        {rndTaskHours > 0 && <span className="text-[9px] text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded font-bold uppercase">{rndTaskHours.toFixed(1)}h R&D</span>}
                                                                    </div>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
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
                                                            <button type="button" disabled={isTaskLocked} onClick={() => {
                                                                const t = [...job.tasks];
                                                                if (!t[tIdx].parts) t[tIdx].parts = [];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Shop' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded transition-colors text-xs font-mono tracking-widest uppercase flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                                                <PlusCircle className="w-3 h-3" /> Part from Inventory
                                                            </button>
                                                            <button type="button" disabled={isTaskLocked} onClick={() => {
                                                                const t = [...job.tasks];
                                                                if (!t[tIdx].parts) t[tIdx].parts = [];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Customer' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold px-3 py-1.5 rounded transition-colors text-xs font-mono tracking-widest uppercase flex items-center gap-2 border border-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
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
                                                                                disabled={isTaskLocked}
                                                                                onChange={e => {
                                                                                    const t = [...job.tasks];
                                                                                    t[tIdx].parts[pIdx].name = e.target.value;
                                                                                    setJob({ ...job, tasks: t });
                                                                                }}
                                                                                placeholder="Describe customer part..."
                                                                                className="w-full bg-transparent border-none text-sm text-white focus:outline-none h-8 px-2 disabled:opacity-75"
                                                                            />
                                                                        ) : (
                                                                            <InventorySelector
                                                                                data={allInventory}
                                                                                disabled={isTaskLocked}
                                                                                autoOpen={!part.inventoryId && !part.name && part.price === 0}
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
                                                                                    t[tIdx].parts[pIdx].cost = invItem.cost || 0;
                                                                                    t[tIdx].parts[pIdx].price = invItem.price || 0;
                                                                                    t[tIdx].parts[pIdx].discount = 0;
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
                                                                <div className="w-16 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Qty</span>
                                                                        <input type="number" min="1" value={part.quantity} disabled={isTaskLocked} onChange={e => {
                                                                            const t = [...job.tasks]; t[tIdx].parts[pIdx].quantity = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none text-left disabled:opacity-75" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-20 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Cost($)</span>
                                                                        <input type="number" min="0" step="0.01" disabled={isTaskLocked || part.providedBy === 'Customer'} value={part.cost || 0} onChange={e => {
                                                                            const t = [...job.tasks]; t[tIdx].parts[pIdx].cost = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-zinc-400 font-mono focus:outline-none text-left disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-24 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Price($)</span>
                                                                        <input type="number" min="0" step="0.01" disabled={isTaskLocked || part.providedBy === 'Customer'} value={part.price} onChange={e => {
                                                                            const t = [...job.tasks]; t[tIdx].parts[pIdx].price = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none text-left disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-16 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Disc(%)</span>
                                                                        <input type="number" min="0" max="100" disabled={isTaskLocked || part.providedBy === 'Customer'} value={part.discount || 0} onChange={e => {
                                                                            const t = [...job.tasks]; t[tIdx].parts[pIdx].discount = parseFloat(e.target.value) || 0; setJob({ ...job, tasks: t });
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-amber-400 font-mono focus:outline-none text-left disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="font-mono text-zinc-300 font-black text-sm w-24 text-right pr-2">
                                                                    ${((Number(part.price) * (1 - (Number(part.discount || 0) / 100))) * Number(part.quantity)).toFixed(2)}
                                                                </div>
                                                                {!isTaskLocked && (
                                                                    <button type="button" onClick={() => {
                                                                        const t = [...job.tasks]; t[tIdx].parts.splice(pIdx, 1); setJob({ ...job, tasks: t });
                                                                    }} className="p-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover/part:opacity-100">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <div className="pt-2 flex gap-2">
                                                            <button type="button" disabled={isTaskLocked} onClick={() => {
                                                                const t = [...job.tasks];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Shop' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="text-[10px] text-zinc-400 hover:text-white font-black font-mono tracking-widest uppercase flex items-center gap-1.5 transition-colors border border-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed">
                                                                <PlusCircle className="w-3 h-3" /> Part from Inventory
                                                            </button>
                                                            <button type="button" disabled={isTaskLocked} onClick={() => {
                                                                const t = [...job.tasks];
                                                                t[tIdx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Customer' });
                                                                setJob({ ...job, tasks: t });
                                                            }} className="text-[10px] text-amber-500/70 hover:text-amber-400 font-black font-mono tracking-widest uppercase flex items-center gap-1.5 transition-colors border border-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/5 disabled:opacity-50 disabled:cursor-not-allowed">
                                                                <UserPlus className="w-3 h-3" /> + Customer Part
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                        {!['Estimate', 'Draft', 'Pending Approval'].includes(job.status) && (
                                            <>
                                                <div className="p-4 bg-zinc-950 border-t border-zinc-800/50">
                                                    <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2">
                                                        <User className="w-3.5 h-3.5" /> Assigned Techs
                                                    </span>
                                                <StaffSelector
                                                    onOpen={async () => {
                                                        if (!tenantId) return;
                                                        try {
                                                            const sRes = await api.get(`/businesses/${tenantId}/staff`);
                                                            setAllStaff(sRes.data || []);
                                                        } catch (e) {
                                                            console.error("Failed to refresh staff", e);
                                                        }
                                                    }}
                                                    data={allStaff.filter((s: any) => {
                                                        if (!task.departmentId) return true;
                                                        const isAssigned = (task.assignedUids || []).includes(s.uid || s.id);
                                                        if (isAssigned) return true;
                                                        
                                                        const taskDept = businessSettings.departments?.find((d: any) => String(d.id) === String(task.departmentId));
                                                        const taskDeptName = taskDept?.name || '';
                                                        
                                                        if (String(s.department) === String(task.departmentId)) return true;
                                                        if (taskDeptName && String(s.department) === taskDeptName) return true;
                                                        
                                                        if (s.departmentRoles) {
                                                            if (s.departmentRoles.some((dr: any) => String(dr.departmentId) === String(task.departmentId) || String(dr.departmentName) === taskDeptName)) {
                                                                return true;
                                                            }
                                                        }
                                                        return false;
                                                    })}
                                                    emptyMessage={task.departmentId ? `No staff members found assigned to the ${businessSettings.departments?.find((d: any) => String(d.id) === String(task.departmentId))?.name || 'selected'} department.` : 'No staff found.'}
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
                                                        <button disabled={task.isApproved === false || task.status === 'Ready for QA' || task.status === 'Finished'} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold disabled:opacity-30 disabled:cursor-not-allowed">
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
                                                                    
                                                                    {userLogs.length === 0 && task.status !== 'Ready for QA' && task.status !== 'Finished' && (
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
                                                <div className="p-3 border border-amber-500/20 bg-amber-500/10 rounded-xl flex items-center justify-between text-amber-500/90 shadow-sm mt-3">
                                                    <div className="flex items-center gap-3">
                                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                        <span className="text-xs font-black uppercase tracking-widest text-amber-500">NO STAFF ASSIGNED</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Tech tracking paused</span>
                                                </div>
                                            )}

                                            {task.qaAuthorName && (
                                                <div className="mt-3 bg-sky-500/10 border border-sky-500/20 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
                                                    <div className="flex items-center gap-2">
                                                        <div className="bg-sky-500/20 p-1.5 rounded-lg shrink-0">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-black text-sky-500/70 tracking-widest leading-none">QA Passed By</span>
                                                            <span className="text-sm font-bold text-sky-100">{task.qaAuthorName}</span>
                                                        </div>
                                                    </div>
                                                    {task.qaTimestamp && (
                                                        <div className="text-[10px] font-mono text-sky-500/50 bg-sky-950/50 px-2 py-1 rounded">
                                                            {new Date(task.qaTimestamp).toLocaleDateString()} {new Date(task.qaTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {timeLogs.filter((l: any) => l.taskIndex === tIdx).length > 0 && (
                                                <div className="mt-4 border-t border-zinc-800/60 pt-4">
                                                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2 mb-3">
                                                        <ClipboardList className="w-3 h-3" /> Time Activity Log
                                                    </span>
                                                    <div className="max-h-48 overflow-y-auto pr-2 space-y-1.5 no-scrollbar">
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
                                        </>
                                        )}

                                        <div className="p-4 bg-zinc-950 border-t border-zinc-800/50 space-y-4">
                                            <div>
                                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 ml-1">Scope Notes (Internal)</label>
                                                <textarea
                                                    value={task.notes || ''}
                                                    onChange={e => {
                                                        const t = [...job.tasks]; t[tIdx].notes = e.target.value; setJob({ ...job, tasks: t });
                                                    }}
                                                    placeholder="Private details, warnings, or specific tools..."
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[80px] resize-y shadow-inner"
                                                />
                                            </div>
                                            {!['Estimate', 'Draft'].includes(job.status) && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <button disabled className="w-full bg-zinc-900/30 border border-zinc-800 border-dashed rounded-xl px-4 py-4 flex flex-col items-center justify-center gap-1.5 cursor-not-allowed group">
                                                        <span className="text-xs text-zinc-600 font-bold uppercase tracking-widest">SOPs / Directives</span>
                                                        <span className="text-[9px] text-zinc-700 font-black uppercase tracking-widest bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/50 group-hover:bg-zinc-800/50 transition-colors">Coming Soon</span>
                                                    </button>
                                                    <button disabled className="w-full bg-zinc-900/30 border border-zinc-800 border-dashed rounded-xl px-4 py-4 flex flex-col items-center justify-center gap-1.5 cursor-not-allowed group">
                                                        <span className="text-xs text-zinc-600 font-bold uppercase tracking-widest">Tech Directions</span>
                                                        <span className="text-[9px] text-zinc-700 font-black uppercase tracking-widest bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/50 group-hover:bg-zinc-800/50 transition-colors">Coming Soon</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* END OF TASKS LOOP */}
                                        {(task.discoveryNotes?.length > 0 || task.mediaUrls?.length > 0) && (
                                            <div className="p-4 bg-amber-500/5 border-t border-amber-500/20">
                                                <div className="flex items-center justify-between mb-3 border-b border-amber-500/20 pb-3">
                                                    <span className="text-xs text-amber-500 font-black uppercase tracking-widest flex items-center gap-2">
                                                        <SearchCode className="w-4 h-4" /> Discovery / R&D Resources
                                                    </span>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setLinkingPhotosTaskIdx(tIdx)}
                                                            className="text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold border border-amber-500/20"
                                                        >
                                                            <Image className="w-3.5 h-3.5" /> Link Job Photos
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handlePromoteToSOP(task)}
                                                            className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold shadow shadow-emerald-900/50"
                                                        >
                                                            <BookTemplate className="w-3.5 h-3.5" /> Promote to SOP
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                {task.discoveryNotes && task.discoveryNotes.length > 0 && (
                                                    <div className="space-y-2 mb-4">
                                                        {task.discoveryNotes.map((dn: any, i: number) => (
                                                            <div key={i} className="text-sm text-amber-200/80 bg-amber-950/20 p-3 rounded-lg border border-amber-500/10">
                                                                <span className="font-bold text-amber-500">{dn.authorName}</span>: {dn.text}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {task.mediaUrls && task.mediaUrls.length > 0 && (
                                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                                        {task.mediaUrls.map((url: string, i: number) => (
                                                            <a key={i} href={url} target="_blank" rel="noreferrer" className="block relative w-20 h-20 rounded-xl overflow-hidden border border-amber-500/30 flex-shrink-0 group shadow-lg">
                                                                <img src={url} alt={`Task linked media ${i}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            </div>
                        )}
                    </div>
                </div>
                {/* --- CONTEXT & METADATA COLUMN (RIGHT) --- */}
                <div className="xl:col-span-4 flex flex-col gap-8 min-w-0 xl:sticky xl:top-24 pb-32 xl:pb-32">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 pb-8 shadow-xl flex flex-col shrink-0">

                    {/* SALES & INTAKE INFORMATION */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden shrink-0">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-teal-400"></div> Sales & Intake Tools
                            </h2>
                        </div>
                        <div className="flex flex-col gap-8">
                            
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-teal-500 mb-2">Customer Meeting Notes</h3>
                                <p className="text-[10px] text-zinc-500 mb-3 font-medium">Customer-facing notes summarizing requirements, concerns, or requests gathered directly from the client.</p>
                                <textarea
                                    value={job.customerMeetingNotes || ''}
                                    onChange={(e) => setJob({ ...job, customerMeetingNotes: e.target.value })}
                                    placeholder="- Requested to save old parts
- Concerned about rust on chassis 
- Needs vehicle back by Friday for vacaton"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-teal-500 resize-y min-h-[120px] shadow-inner transition-colors"
                                />
                            </div>

                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-zinc-600 rounded-full"></div> Internal Sales Notes</h3>
                                <p className="text-[10px] text-zinc-600 mb-3 font-medium">Private staff notes regarding sale strategy, budget caps, pricing history, or warnings.</p>
                                <textarea
                                    value={job.salesNotes || ''}
                                    onChange={(e) => setJob({ ...job, salesNotes: e.target.value })}
                                    placeholder="- Has a strict $4,000 budget
- Previous customer, gave 5% loyalty discount
- Verify part compatibility before ordering"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-400 focus:outline-none focus:border-zinc-500 resize-y min-h-[120px] shadow-inner transition-colors"
                                />
                            </div>

                            <div className="border-t border-zinc-800/80 pt-6 mb-6">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#2ca01c] mb-2 flex items-center gap-2">
                                    <svg viewBox="0 0 100 100" className="w-4 h-4 fill-current"><path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm25.8 45H32.6v-5.6h31L46.4 25.1h7.5l20.4 17.5v-6H82v28.4H75.8zM24.2 81.3V52.9H18v6H37.6L17.2 41.4h-7.5l14.5 12.4H18v5.6h43.2v5.6H31.8l15.1 12.9h7.5L24.2 52.9v28.4z"/></svg> 
                                    QuickBooks Integration
                                </h3>
                                <p className="text-[10px] text-zinc-500 mb-3 font-medium">Link this Work Order to a QuickBooks invoice or order ID so billing can be tracked cleanly.</p>
                                <input
                                    type="text"
                                    value={job.quickbooksInvoiceId || ''}
                                    onChange={(e) => setJob({ ...job, quickbooksInvoiceId: e.target.value })}
                                    placeholder="Enter QuickBooks Order or Invoice Reference..."
                                    className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-[#2ca01c] transition-colors"
                                />
                            </div>

                            <div className="border-t border-zinc-800/80 pt-6">
                                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-2 flex items-center justify-between">
                                    <span>Internal Q&A Board</span>
                                    <button 
                                        onClick={() => {
                                            const qs = job.salesQuestions || [];
                                            setJob({ ...job, salesQuestions: [...qs, { question: '', answer: '', askedBy: currentUser?.displayName || 'Staff' }] });
                                        }}
                                        className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[9px] px-2 py-1 rounded transition-colors"
                                    >+ Ask Question</button>
                                </h3>
                                <p className="text-[10px] text-zinc-500 mb-4 font-medium">Have a question for the shop foreman or parts manager while writing this estimate? Ask it here.</p>
                                
                                {!(job.salesQuestions?.length) ? (
                                    <div className="text-xs font-mono text-zinc-600 text-center py-4 border border-zinc-800 border-dashed rounded-xl">No active questions.</div>
                                ) : (
                                    <div className="space-y-4">
                                        {job.salesQuestions.map((q: any, i: number) => (
                                            <div key={i} className="bg-zinc-950 border border-indigo-500/20 rounded-xl p-4 relative group">
                                                <button onClick={() => {
                                                    const qs = [...job.salesQuestions];
                                                    qs.splice(i, 1);
                                                    setJob({ ...job, salesQuestions: qs});
                                                }} className="absolute top-3 right-3 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3.5 h-3.5" /></button>
                                                
                                                <div className="mb-3">
                                                    <label className="text-[9px] uppercase tracking-widest text-indigo-500 font-bold">Q: {q.askedBy}</label>
                                                    <input 
                                                        type="text"
                                                        value={q.question || ''}
                                                        onChange={(e) => {
                                                            const qs = [...job.salesQuestions];
                                                            qs[i].question = e.target.value;
                                                            setJob({ ...job, salesQuestions: qs });
                                                        }}
                                                        placeholder="Type your question..."
                                                        className="w-full bg-transparent border-b border-zinc-800 pb-1 text-sm text-indigo-100 focus:outline-none focus:border-indigo-500 mt-1 placeholder-zinc-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase tracking-widest text-amber-500 font-bold">A: {q.answeredBy || 'Awaiting Answer'}</label>
                                                    <input 
                                                        type="text"
                                                        value={q.answer || ''}
                                                        onChange={(e) => {
                                                            const qs = [...job.salesQuestions];
                                                            qs[i].answer = e.target.value;
                                                            if (e.target.value.length > 0 && !q.answeredBy) qs[i].answeredBy = currentUser?.displayName || 'Staff';
                                                            if (e.target.value.length === 0) qs[i].answeredBy = null;
                                                            setJob({ ...job, salesQuestions: qs });
                                                        }}
                                                        placeholder="Type answer..."
                                                        className="w-full bg-transparent border-b border-zinc-800 pb-1 text-sm text-amber-100 focus:outline-none focus:border-amber-500 mt-1 placeholder-zinc-700"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    

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
                                <div className="space-y-5 overflow-y-auto pr-2 no-scrollbar flex-1">
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
                {jobId === 'new' ? (
                    <button
                        onClick={() => handleSave(true)}
                        disabled={!hasChanges || isSaving}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all font-mono tracking-widest uppercase text-sm"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Creating...' : 'Create Job'}
                    </button>
                ) : (
                    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700 px-4 py-3 rounded-xl">
                        {historyStack.length > 0 ? (
                            <button onClick={handleUndo} className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors" title="Undo last change">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 010 10 5 5 0 010-10zm0 0l4-4m-4 4l4 4" /></svg>
                                <span className="text-xs font-bold uppercase tracking-widest">Undo</span>
                            </button>
                        ) : (
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Auto-Save Active</div>
                        )}
                        <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-colors ${isSaving ? 'text-amber-400' : hasChanges ? 'text-indigo-400' : 'text-emerald-400'}`}>
                            {isSaving ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                            ) : hasChanges ? (
                                <><CloudOff className="w-4 h-4" /> Edit mode</>
                            ) : (
                                <><CheckCircle className="w-4 h-4" /> Saved</>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center">
                    <div className="absolute top-6 right-6 flex items-center gap-4 z-50">
                        <div className="flex items-center gap-2 bg-zinc-900/80 rounded-full p-1 border border-zinc-700 backdrop-blur">
                            <button onClick={() => setLightboxZoom(Math.max(0.5, lightboxZoom - 0.25))} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800">
                                <ZoomOut className="w-5 h-5" />
                            </button>
                            <span className="text-xs font-mono text-zinc-300 w-12 text-center">{Math.round(lightboxZoom * 100)}%</span>
                            <button onClick={() => setLightboxZoom(Math.min(3, lightboxZoom + 0.25))} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800">
                                <ZoomIn className="w-5 h-5" />
                            </button>
                        </div>
                        <button onClick={() => setLightboxIndex(null)} className="text-zinc-400 hover:text-white p-2 bg-zinc-900/80 rounded-full border border-zinc-700 backdrop-blur">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <button 
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev === null || prev === 0 ? ccPhotos.length - 1 : prev - 1)); setLightboxZoom(1); }} 
                        className="absolute left-4 md:left-8 z-50 p-4 text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 rounded-full border border-zinc-800 backdrop-blur shadow-xl"
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>

                    <div className="w-full h-full p-4 flex items-center justify-center overflow-auto cursor-pointer"
                         onClick={() => setLightboxIndex(null)}>
                        {ccPhotos[lightboxIndex as number]?.uris?.[0]?.uri ? (
                            <img 
                                src={ccPhotos[lightboxIndex as number].uris[0].uri} 
                                alt="Job Media Full" 
                                style={{ transform: `scale(${lightboxZoom})`, transition: 'transform 0.2s ease-out' }}
                                className="max-w-[90vw] max-h-[90vh] object-contain origin-center cursor-default filter drop-shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : null}
                    </div>

                    <button 
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev === null || prev === ccPhotos.length - 1 ? 0 : prev + 1)); setLightboxZoom(1); }} 
                        className="absolute right-4 md:right-8 z-50 p-4 text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 rounded-full border border-zinc-800 backdrop-blur shadow-xl"
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white font-mono text-sm bg-zinc-900/80 px-6 py-2 rounded-full border border-zinc-700 flex flex-col items-center gap-1 backdrop-blur z-50 shadow-xl">
                        <span className="font-bold">{(lightboxIndex as number) + 1} / {ccPhotos.length}</span>
                        <span className="text-[10px] text-zinc-400 tracking-wider">
                            {ccPhotos[lightboxIndex as number]?.creator_name ? `UPLOADED BY ${ccPhotos[lightboxIndex as number].creator_name}` : ''}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
