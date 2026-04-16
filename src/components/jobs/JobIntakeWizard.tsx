import { useState, useEffect } from 'react';
import { User, Truck, Briefcase, ArrowRight, X, Loader2, CheckCircle2, Search, Calculator } from 'lucide-react';
import { EstimateWizard } from './EstimateWizard';
import { api } from '../../lib/api';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface JobIntakeWizardProps {
    tenantId: string;
    onClose: () => void;
    onComplete: (jobId: string) => void;
    isEmbedded?: boolean;
    initialSearchName?: string;
}

export function JobIntakeWizard({ tenantId, onClose, onComplete, isEmbedded, initialSearchName }: JobIntakeWizardProps) {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customersList, setCustomersList] = useState<any[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

    const [vehicleCreationMode, setVehicleCreationMode] = useState<'new' | 'existing'>('existing');
    const [vehiclesList, setVehiclesList] = useState<any[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
    
    // Step 4: Internal Tracking
    const [createdJobId, setCreatedJobId] = useState('');
    const [createdContext, setCreatedContext] = useState<any>(null);

    // Pre-fill names based on search term if provided
    const defaultFirstName = initialSearchName ? initialSearchName.split(' ')[0] : '';
    const defaultLastName = initialSearchName && initialSearchName.split(' ').length > 1 
        ? initialSearchName.split(' ').slice(1).join(' ') 
        : '';
        
    const [creationMode, setCreationMode] = useState<'new' | 'existing'>(initialSearchName ? 'new' : 'existing');

    // Step 1: Customer
    const [customer, setCustomer] = useState({
        firstName: defaultFirstName,
        lastName: defaultLastName,
        email: '',
        phone: '',
        needsQuickBooksSync: true // The manual sync flag
    });

    // Step 2: Vehicle
    const [vehicle, setVehicle] = useState({
        vin: '',
        year: '',
        make: '',
        model: ''
    });

    // Step 3: Scope
    const [job, setJob] = useState({
        title: '',
        description: ''
    });

    // Load initial customers
    useEffect(() => {
        const fetchCustomers = async () => {
            if (!tenantId) return;
            setIsLoadingCustomers(true);
            try {
                const q = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
                const snap = await getDocs(q);
                const results = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
                // Sort alphabetically by last name
                results.sort((a: any, b: any) => (a.lastName || '').localeCompare(b.lastName || ''));
                setCustomersList(results);
            } catch (err) {
                console.error("Failed to load customers:", err);
            }
            setIsLoadingCustomers(false);
        };
        fetchCustomers();
    }, [tenantId]);

    // Load vehicles for existing customer
    useEffect(() => {
        const fetchVehicles = async () => {
            if (creationMode !== 'existing' || !selectedCustomerId || !tenantId) {
                setVehiclesList([]);
                return;
            }
            setIsLoadingVehicles(true);
            try {
                const q = query(collection(db, 'vehicles'), where('tenantId', '==', tenantId), where('customerId', '==', selectedCustomerId));
                const snap = await getDocs(q);
                const results = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
                setVehiclesList(results);
                // Auto-select if there is exactly 1
                if (results.length === 1 && !selectedVehicleId) {
                    setSelectedVehicleId(results[0].id);
                } else if (results.length === 0) {
                    setVehicleCreationMode('new'); // auto-switch if they have no vehicles
                }
            } catch (err) {
                console.error("Failed to load vehicles:", err);
            }
            setIsLoadingVehicles(false);
        };
        fetchVehicles();
    }, [tenantId, selectedCustomerId, creationMode]);

    const handleNext = () => {
        if (step === 1) {
            if (creationMode === 'new' && (!customer.firstName || !customer.lastName)) {
                return toast.error("Please provide at least a first and last name.");
            }
            if (creationMode === 'existing' && !selectedCustomerId) {
                return toast.error("Please select an existing customer to proceed.");
            }
        }
        if (step === 2) {
            if (creationMode === 'existing' && vehicleCreationMode === 'existing' && !selectedVehicleId) {
                return toast.error("Please select an existing vehicle to proceed.");
            }
            if ((creationMode === 'new' || vehicleCreationMode === 'new') && (!vehicle.make || !vehicle.model)) {
                return toast.error("Please provide at least the vehicle make and model.");
            }
        }
        setStep(prev => prev + 1);
    };

    const handleBack = () => {
        setStep(prev => prev - 1);
    };

    const handleSubmit = async () => {
        if (!job.title || !job.description) {
            return toast.error("Please provide a job title and scope of work.");
        }

        try {
            setIsSubmitting(true);

            let finalCustomerId = selectedCustomerId;

            // Phase 1: Create Customer (Mocking QB sync via manual flag) or use existing
            if (creationMode === 'new') {
                const custRes = await api.post('/customers', {
                    ...customer,
                    tenantId,
                    syncStatus: customer.needsQuickBooksSync ? 'pending_qb' : 'synced',
                    tags: customer.needsQuickBooksSync ? ['Awaiting QB Sync'] : []
                });
                finalCustomerId = custRes.data?.id || custRes.data?.customerId;
            }

            // Phase 2: Create Vehicle linked to Customer
            let vehicleId = selectedVehicleId;
            if (creationMode === 'new' || vehicleCreationMode === 'new') {
                const vehRes = await api.post('/vehicles', {
                    ...vehicle,
                    customerId: finalCustomerId,
                    tenantId
                });
                vehicleId = vehRes.data?.id || vehRes.data?.vehicleId;
            }

            // Resolve Context for Job Header
            let resolvedCustomerName = '';
            if (creationMode === 'new') {
                resolvedCustomerName = `${customer.firstName} ${customer.lastName}`.trim();
            } else {
                const c = customersList.find(c => c.id === finalCustomerId);
                if (c) resolvedCustomerName = `${c.firstName} ${c.lastName}`.trim();
            }

            let resolvedVehicleDetails: any = null;
            if (creationMode === 'new' || vehicleCreationMode === 'new') {
                resolvedVehicleDetails = { ...vehicle };
            } else {
                const v = vehiclesList.find(v => v.id === vehicleId);
                if (v) resolvedVehicleDetails = { ...v };
            }

            // Phase 3: Create Draft Job
            const jobRes = await api.post('/jobs', {
                title: job.title,
                description: job.description,
                customerId: finalCustomerId,
                customerName: resolvedCustomerName,
                vehicleId,
                vehicleDetails: resolvedVehicleDetails,
                tenantId,
                status: 'Estimate',
                priority: 'Medium',
                tags: ['New Intake'],
                parts: [],
                laborLines: []
            });
            const jobId = jobRes.data?.id || jobRes.data?.jobId;

            setCreatedContext({
                customerName: resolvedCustomerName,
                vehicleDetails: resolvedVehicleDetails
            });

            toast.success("Details saved. Moving to Line Items...");
            setCreatedJobId(jobId);
            setStep(4);
            setIsSubmitting(false);

        } catch (err) {
            console.error("Failed to process intake:", err);
            toast.error("Failed to generate workload pipeline. Please try again.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className={isEmbedded ? "w-full h-full flex flex-col" : "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"}>
            <div className={isEmbedded ? "flex-1 flex flex-col" : "bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-full"}>
                
                {/* Header */}
                {!isEmbedded && (
                    <div className="bg-zinc-900 border-b border-zinc-800 p-6 flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-xl font-black text-white flex items-center gap-2">
                                Pipeline Intake Wizard
                            </h2>
                            <p className="text-zinc-500 text-xs mt-1">Guided onboarding configures CRM, Asset, and Job simultaneously.</p>
                        </div>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 bg-zinc-800 rounded-full transition-colors">
                            <X className="w-5 h-5"/>
                        </button>
                    </div>
                )}

                {/* Progress Bar */}
                <div className="flex px-6 pt-6 pb-2 shrink-0">
                    <div className="flex-1 flex flex-col gap-2 relative">
                         <div className="flex items-center absolute w-full top-3 -translate-y-1/2 z-0 px-8">
                             <div className={`h-1 flex-1 transition-colors duration-500 ${step >= 2 ? 'bg-accent' : 'bg-zinc-800'}`}></div>
                             <div className={`h-1 flex-1 transition-colors duration-500 ${step >= 3 ? 'bg-accent' : 'bg-zinc-800'}`}></div>
                             <div className={`h-1 flex-1 transition-colors duration-500 ${step >= 4 ? 'bg-accent' : 'bg-zinc-800'}`}></div>
                         </div>
                         <div className="flex justify-between w-full relative z-10">
                            {[ 
                                { i: 1, label: 'Customer', icon: User }, 
                                { i: 2, label: 'Asset', icon: Truck }, 
                                { i: 3, label: 'Scope', icon: Briefcase },
                                { i: 4, label: 'Estimate', icon: Calculator }
                            ].map((s) => {
                                const active = step >= s.i;
                                const current = step === s.i;
                                return (
                                    <div key={s.i} className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${active ? 'bg-accent border-accent text-white shadow-[0_0_15px_rgba(var(--color-accent),0.5)]' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}>
                                            {active && !current ? <CheckCircle2 className="w-3.5 h-3.5" /> : <s.icon className="w-3 h-3" />}
                                        </div>
                                        <span className={`text-[10px] font-black uppercase tracking-widest mt-2 ${(active || current) ? 'text-zinc-300' : 'text-zinc-600'}`}>{s.label}</span>
                                    </div>
                                )
                            })}
                         </div>
                    </div>
                </div>

                {/* Form Content */}
                {step < 4 ? (
                    <div className="p-8 pb-12 flex-1 overflow-y-auto">
                        {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                                    <User className="w-5 h-5 text-accent"/> Primary Contact
                                </h3>
                                <p className="text-zinc-500 text-xs mb-4">Who is commissioning this work?</p>
                                
                                <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6">
                                    <button 
                                        type="button"
                                        onClick={() => setCreationMode('existing')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${creationMode === 'existing' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        Existing Customer
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setCreationMode('new')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${creationMode === 'new' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        Create New Profile
                                    </button>
                                </div>

                                {creationMode === 'new' ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">First Name *</label>
                                                <input required type="text" placeholder="John" value={customer.firstName} onChange={e => setCustomer({...customer, firstName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Last Name *</label>
                                                <input required type="text" placeholder="Doe" value={customer.lastName} onChange={e => setCustomer({...customer, lastName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Email</label>
                                                <input type="email" placeholder="john@example.com" value={customer.email} onChange={e => setCustomer({...customer, email: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Phone</label>
                                                <input type="tel" placeholder="(555) 555-5555" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mt-6">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <div className="mt-0.5">
                                                    <input type="checkbox" checked={customer.needsQuickBooksSync} onChange={e => setCustomer({...customer, needsQuickBooksSync: e.target.checked})} className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-accent focus:ring-accent focus:ring-offset-zinc-950"/>
                                                </div>
                                                <div>
                                                    <span className="block text-sm font-bold text-white">Require Manual QuickBooks Verification</span>
                                                    <span className="block text-xs text-zinc-500 mt-1">If enabled, this customer will be flagged so accounting can manually sync or merge them into QuickBooks later.</span>
                                                </div>
                                            </label>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Select Customer Profile *</label>
                                            {isLoadingCustomers ? (
                                                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-500 flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2"/> Loading Directory...
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <select 
                                                        value={selectedCustomerId} 
                                                        onChange={(e) => setSelectedCustomerId(e.target.value)} 
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white appearance-none pr-10"
                                                    >
                                                        <option value="">-- Choose Existing Contact --</option>
                                                        {customersList.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.lastName}, {c.firstName} {c.company ? `(${c.company})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <Search className="w-4 h-4 text-zinc-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"/>
                                                </div>
                                            )}
                                        </div>
                                        {selectedCustomerId && (
                                            <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                                <p className="text-sm font-medium text-white flex items-center justify-between">
                                                    <span>Selected Contact ID</span>
                                                    <span className="font-mono text-zinc-500 text-xs">{selectedCustomerId}</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                             <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                                    <Truck className="w-5 h-5 text-accent"/> Target Asset / Vehicle
                                </h3>
                                <p className="text-zinc-500 text-xs mb-6">What product or vehicle is being worked on?</p>
                                
                                {creationMode === 'existing' && (
                                    <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6">
                                        <button 
                                            type="button"
                                            onClick={() => setVehicleCreationMode('existing')}
                                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${vehicleCreationMode === 'existing' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            Existing Asset
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setVehicleCreationMode('new')}
                                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${vehicleCreationMode === 'new' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            Create New Asset
                                        </button>
                                    </div>
                                )}

                                {creationMode === 'new' || vehicleCreationMode === 'new' ? (
                                    <>
                                        <div className="mb-4">
                                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">VIN (Optional)</label>
                                            <input type="text" placeholder="17-Digit VIN Number" value={vehicle.vin} onChange={e => setVehicle({...vehicle, vin: e.target.value.toUpperCase()})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:border-accent focus:outline-none text-white"/>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Year</label>
                                                <input type="text" placeholder="2024" value={vehicle.year} onChange={e => setVehicle({...vehicle, year: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Make *</label>
                                                <input required type="text" placeholder="Ford" value={vehicle.make} onChange={e => setVehicle({...vehicle, make: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Model *</label>
                                                <input required type="text" placeholder="F-150" value={vehicle.model} onChange={e => setVehicle({...vehicle, model: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Select Known Vehicle *</label>
                                            {isLoadingVehicles ? (
                                                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-500 flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2"/> Fetching Garage...
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <select 
                                                        value={selectedVehicleId} 
                                                        onChange={(e) => setSelectedVehicleId(e.target.value)} 
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white appearance-none pr-10"
                                                    >
                                                        <option value="">-- Choose Existing Asset --</option>
                                                        {vehiclesList.map(v => (
                                                            <option key={v.id} value={v.id}>
                                                                {v.year} {v.make} {v.model} {v.vin ? `(${v.vin.substring(v.vin.length - 4)})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <Truck className="w-4 h-4 text-zinc-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"/>
                                                </div>
                                            )}
                                        </div>
                                        {selectedVehicleId && (
                                            <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl mt-4">
                                                <p className="text-sm font-medium text-white flex items-center justify-between">
                                                    <span>Selected Asset ID</span>
                                                    <span className="font-mono text-zinc-500 text-xs">{selectedVehicleId}</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                             <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                                    <Briefcase className="w-5 h-5 text-accent"/> Initial Scope of Work
                                </h3>
                                <p className="text-zinc-500 text-xs mb-6">Define the project payload to generate the draft.</p>
                                
                                <div className="mb-4">
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Primary Job Title *</label>
                                    <input required type="text" placeholder="e.g. Full Leveling Kit Upfit" value={job.title} onChange={e => setJob({...job, title: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white"/>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Requested Work *</label>
                                    <textarea required rows={5} placeholder="Describe the customer's request and preliminary scope..." value={job.description} onChange={e => setJob({...job, description: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-accent focus:outline-none text-white resize-none"/>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
                        <EstimateWizard 
                            jobId={createdJobId} 
                            onClose={onClose} 
                            onComplete={() => onComplete(createdJobId)}
                            isEmbedded={true}
                            initialContext={createdContext}
                        />
                    </div>
                )}

                {/* Footer Controls */}
                {step < 4 && (
                <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex justify-between shrink-0">
                    {step > 1 ? (
                        <button type="button" onClick={handleBack} disabled={isSubmitting} className="px-6 py-2.5 rounded-lg font-bold text-sm text-zinc-400 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">
                            Back
                        </button>
                    ) : <div></div>}
                    
                    {step < 3 ? (
                        <button type="button" onClick={handleNext} className="px-6 py-2.5 rounded-lg font-bold text-sm text-white bg-accent hover:bg-accent-hover transition-colors flex items-center gap-2 shadow-lg shadow-accent/20">
                            Next Step <ArrowRight className="w-4 h-4"/>
                        </button>
                    ) : (
                        <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-8 py-2.5 rounded-lg font-bold text-sm text-white bg-accent hover:bg-accent-hover transition-colors flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50">
                            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin"/> Generating Pipeline...</> : 'Complete Intake'}
                        </button>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}
