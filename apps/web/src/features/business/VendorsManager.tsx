import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Building2, Phone, Mail, 
  Calendar, CheckCircle, Clock, Trash2, AlertCircle, 
  ExternalLink, Check, Star, ClipboardList, Pencil,
  Share2, ArrowLeft, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Vendor {
  id: string;
  name: string;
  type: 'QuickBooks' | 'Native';
  email?: string;
  phone?: string;
  website?: string;
  notes?: string;
  createdAt?: any;
}

interface ServiceSubscription {
  id: string;
  vendorId: string;
  vendorName: string;
  name: string;
  cost: number;
  frequency: 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly' | 'annual' | 'one_time';
  status: 'Proposed' | 'Active' | 'Paused' | 'Cancelled';
  nextServiceDate?: string;
  description?: string;
  checklist?: string[];
  history?: ServiceLog[];
  googleRating?: number;
}

interface ServiceLog {
  date: string;
  cost: number;
  notes: string;
  loggedBy: string;
  createdAt: any;
}

export function VendorsManager({ 
  tenantId, 
  subView, 
  viewId 
}: { 
  tenantId: string;
  subView?: string;
  viewId?: string;
}) {
  const navigate = useNavigate();
  const { permissions, isSuperAdmin, user } = useAuthStore();
  const canManage = isSuperAdmin || permissions['vendors.manage'];

  const handleCopyLink = (type: 'service' | 'vendor', id: string, name: string) => {
    const shareUrl = `${window.location.origin}/business/${tenantId}/vendors/${type}/${id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast.success(`Copied shareable link for ${name}!`);
    }).catch((err) => {
      console.error('Could not copy text: ', err);
      toast.error('Failed to copy link to clipboard');
    });
  };

  const [activeTab, setActiveTab] = useState<'services' | 'directory'>('services');
  const [searchQuery, setSearchQuery] = useState('');
  
  // States
  const [nativeVendors, setNativeVendors] = useState<Vendor[]>([]);
  const [qbVendors, setQbVendors] = useState<Vendor[]>([]);
  const [services, setServices] = useState<ServiceSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  // Combine vendors list cleanly with useMemo
  const vendors = useMemo(() => [...nativeVendors, ...qbVendors], [nativeVendors, qbVendors]);

  // Modals
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [loggingServiceId, setLoggingServiceId] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<ServiceSubscription | null>(null);

  // Form states - Edit Service
  const [editServiceForm, setEditServiceForm] = useState({
    id: '',
    vendorId: '',
    name: '',
    cost: 0,
    frequency: 'monthly' as ServiceSubscription['frequency'],
    status: 'Proposed' as ServiceSubscription['status'],
    nextServiceDate: '',
    description: '',
    checklistText: ''
  });

  // Form states - Vendor
  const [vendorForm, setVendorForm] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
    notes: ''
  });

  // Form states - Service
  const [serviceForm, setServiceForm] = useState({
    vendorId: '',
    name: '',
    cost: 0,
    frequency: 'monthly' as ServiceSubscription['frequency'],
    description: '',
    checklistText: ''
  });

  // Form states - Log Occurrence
  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().split('T')[0],
    cost: 0,
    notes: ''
  });

  // Real-time listener for Custom Native vendors
  useEffect(() => {
    const qNative = query(collection(db, `businesses/${tenantId}/vendors`));
    return onSnapshot(qNative, (snapNative) => {
      const nativeList = snapNative.docs.map(d => ({ 
        id: d.id, 
        type: 'Native', 
        name: d.data().name || '',
        email: d.data().email || '',
        phone: d.data().phone || '',
        website: d.data().website || '',
        notes: d.data().notes || '',
        ...d.data() 
      } as Vendor));
      setNativeVendors(nativeList);
    });
  }, [tenantId]);

  // Real-time listener for QuickBooks vendors
  useEffect(() => {
    const qQb = query(collection(db, `businesses/${tenantId}/qb_vendors`));
    return onSnapshot(qQb, (snapQb) => {
      const qbList = snapQb.docs.map(d => ({ 
        id: d.id, 
        type: 'QuickBooks', 
        name: d.data().DisplayName || d.data().CompanyName || 'QB Vendor', 
        email: d.data().PrimaryEmailAddr?.Address || '', 
        phone: d.data().PrimaryPhone?.FreeFormNumber || '', 
        website: d.data().WebAddr?.URI || '',
        notes: d.data().Notes || '',
        ...d.data() 
      } as unknown as Vendor));
      setQbVendors(qbList);
    });
  }, [tenantId]);

  // Real-time listener for Services
  useEffect(() => {
    const qServices = query(collection(db, `businesses/${tenantId}/services`));
    const unsub = onSnapshot(qServices, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceSubscription));
      
      // Auto-seed North Shore Bin Cleaners if collection is completely empty
      if (list.length === 0 && !snap.metadata.hasPendingWrites) {
        setLoading(true);
        try {
          // Create the North Shore Bin Cleaners vendor first
          const vendorRef = await addDoc(collection(db, `businesses/${tenantId}/vendors`), {
            name: 'North Shore Bin Cleaners',
            email: 'info@northshorebincleaners.com',
            phone: '267-834-0336',
            website: 'https://northshorebincleaners.com',
            notes: 'High-quality sanitizing and hot wash trash bin cleaning services.',
            createdAt: serverTimestamp()
          });

          // Create the service subscription connected to the vendor
          await addDoc(collection(db, `businesses/${tenantId}/services`), {
            vendorId: vendorRef.id,
            vendorName: 'North Shore Bin Cleaners',
            name: 'Exterior Sanitizing & Hot Wash Plan',
            cost: 20.00,
            frequency: 'monthly',
            status: 'Proposed',
            nextServiceDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 15 days out
            description: 'Monthly sanitizing, deodorizing, and high-pressure hot wash of trash and recycling bins ($20.00 base, $13.00 per additional bin). Keep the shop sanitary and odor-free.',
            checklist: [
              'Sanitize inside & outside of primary bins',
              'Deodorize with eco-friendly chemical mist',
              'High-pressure hot wash blast (200°F)',
              'Examine for cracks or damage'
            ],
            googleRating: 5.0,
            history: []
          });

          toast.success('Initialized North Shore Bin Cleaners default proposed service!');
        } catch (err) {
          console.error('Failed to seed default proposed vendor service:', err);
        }
      } else {
        setServices(list);
        setLoading(false);
      }
    });

    return () => unsub();
  }, [tenantId]);

  // Filters
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => 
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.notes?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [vendors, searchQuery]);

  const filteredServices = useMemo(() => {
    return services.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [services, searchQuery]);

  // Actions
  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorForm.name.trim()) return;

    try {
      await addDoc(collection(db, `businesses/${tenantId}/vendors`), {
        ...vendorForm,
        createdAt: serverTimestamp()
      });
      toast.success('Vendor added successfully');
      setVendorForm({ name: '', email: '', phone: '', website: '', notes: '' });
      setIsAddVendorOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to add vendor');
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceForm.vendorId || !serviceForm.name.trim()) return;

    const selectedVendor = vendors.find(v => v.id === serviceForm.vendorId);
    if (!selectedVendor) return;

    const checklist = serviceForm.checklistText
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);

    try {
      await addDoc(collection(db, `businesses/${tenantId}/services`), {
        vendorId: serviceForm.vendorId,
        vendorName: selectedVendor.name,
        name: serviceForm.name,
        cost: Number(serviceForm.cost),
        frequency: serviceForm.frequency,
        status: 'Proposed',
        description: serviceForm.description,
        checklist,
        history: []
      });
      toast.success('Service added successfully');
      setServiceForm({ vendorId: '', name: '', cost: 0, frequency: 'monthly', description: '', checklistText: '' });
      setIsAddServiceOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to add service');
    }
  };

  const handleOpenEditService = (service: ServiceSubscription) => {
    try {
      setEditingService(service);
      
      let checklistText = '';
      if (Array.isArray(service.checklist)) {
        checklistText = service.checklist.join('\n');
      } else if (typeof service.checklist === 'string') {
        checklistText = service.checklist;
      }

      setEditServiceForm({
        id: service.id || '',
        vendorId: service.vendorId || '',
        name: service.name || '',
        cost: typeof service.cost === 'number' ? service.cost : Number(service.cost) || 0,
        frequency: service.frequency || 'monthly',
        status: service.status || 'Proposed',
        nextServiceDate: service.nextServiceDate || '',
        description: service.description || '',
        checklistText
      });
    } catch (err: any) {
      console.error('Error opening edit service modal:', err);
      toast.error(`Error opening edit form: ${err?.message || err}`);
    }
  };

  const handleSaveEditService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || !editServiceForm.vendorId || !editServiceForm.name.trim()) {
      toast.error('Missing required fields for service agreement');
      return;
    }

    const selectedVendor = vendors.find(v => v.id === editServiceForm.vendorId);
    if (!selectedVendor) {
      toast.error('Selected vendor not found in directory');
      return;
    }

    const checklist = editServiceForm.checklistText
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);

    try {
      const payload: Partial<ServiceSubscription> = {
        vendorId: editServiceForm.vendorId,
        vendorName: selectedVendor.name,
        name: editServiceForm.name,
        cost: Number(editServiceForm.cost) || 0,
        frequency: editServiceForm.frequency,
        status: editServiceForm.status,
        description: editServiceForm.description,
        checklist
      };

      if (editServiceForm.nextServiceDate) {
        payload.nextServiceDate = editServiceForm.nextServiceDate;
      } else {
        payload.nextServiceDate = '';
      }

      await updateDoc(doc(db, `businesses/${tenantId}/services`, editingService.id), payload);
      toast.success('Service updated successfully');
      setEditingService(null);
    } catch (err: any) {
      console.error('Error in handleSaveEditService:', err);
      toast.error(`Failed to update service: ${err?.message || err}`);
    }
  };

  const handleActivateService = async (serviceId: string) => {
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/services`, serviceId), {
        status: 'Active',
        nextServiceDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days out
      });
      toast.success('Service activated! First cleaning scheduled.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to activate service');
    }
  };

  const handleToggleStatus = async (serviceId: string, currentStatus: ServiceSubscription['status']) => {
    const nextStatusMap: Record<ServiceSubscription['status'], ServiceSubscription['status']> = {
      Active: 'Paused',
      Paused: 'Active',
      Proposed: 'Active',
      Cancelled: 'Proposed'
    };
    const newStatus = nextStatusMap[currentStatus];

    try {
      await updateDoc(doc(db, `businesses/${tenantId}/services`, serviceId), {
        status: newStatus
      });
      toast.success(`Service status set to ${newStatus}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    }
  };

  const handleLogOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggingServiceId) return;

    const service = services.find(s => s.id === loggingServiceId);
    if (!service) return;

    const newLog: ServiceLog = {
      date: logForm.date,
      cost: Number(logForm.cost),
      notes: logForm.notes,
      loggedBy: user?.displayName || user?.email || 'System User',
      createdAt: new Date().toISOString()
    };

    const updatedHistory = [newLog, ...(service.history || [])];

    // Determine next service date based on frequency
    let daysToAdd = 30;
    if (service.frequency === 'weekly') daysToAdd = 7;
    else if (service.frequency === 'bi_weekly') daysToAdd = 14;
    else if (service.frequency === 'monthly') daysToAdd = 30;
    else if (service.frequency === 'quarterly') daysToAdd = 90;
    else if (service.frequency === 'annual') daysToAdd = 365;

    const nextDate = new Date(new Date(logForm.date).getTime() + daysToAdd * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    try {
      await updateDoc(doc(db, `businesses/${tenantId}/services`, loggingServiceId), {
        history: updatedHistory,
        nextServiceDate: nextDate
      });
      toast.success('Logged service run successfully');
      setLoggingServiceId(null);
      setLogForm({ date: new Date().toISOString().split('T')[0], cost: 0, notes: '' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to log occurrence');
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!confirm('Are you sure you want to delete this subscription?')) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/services`, serviceId));
      toast.success('Subscription deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete service');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm font-bold tracking-wider">Syncing Vendors & Services...</p>
      </div>
    );
  }

  if (subView === 'service' && viewId) {
    const service = services.find(s => s.id === viewId);
    if (!service) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500 gap-6 p-8 border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900 shadow-sm animate-in fade-in duration-300">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <div className="text-center space-y-1">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white">Service Agreement Not Found</h3>
            <p className="text-sm text-zinc-500 max-w-md">The service agreement you are trying to view does not exist or may have been deleted.</p>
          </div>
          <button
            onClick={() => navigate(`/business/${tenantId}/vendors`)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Detail Header */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/business/${tenantId}/vendors`)}
              className="p-3 border border-zinc-200 dark:border-zinc-850 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-2xl text-zinc-500 dark:text-zinc-400 transition-all active:scale-95"
              title="Back to Directory"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider ${
                  service.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                  service.status === 'Proposed' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                  'bg-zinc-500/10 text-zinc-500'
                }`}>
                  {service.status}
                </span>
                <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                  {service.frequency.replace('_', ' ')}
                </span>
                {service.googleRating && (
                  <span className="flex items-center gap-0.5 text-amber-500 text-xs font-bold bg-amber-500/5 px-2 py-0.5 rounded-lg border border-amber-500/10">
                    <Star className="w-3.5 h-3.5 fill-amber-500" />
                    {service.googleRating.toFixed(1)}
                  </span>
                )}
              </div>
              <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white mt-1">{service.name}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyLink('service', service.id, service.name)}
              className="flex items-center gap-2 px-4 py-3 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 shadow-sm cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-indigo-500" />
              Copy Link
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => handleToggleStatus(service.id, service.status)}
                  className="text-xs text-zinc-650 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-bold uppercase tracking-widest px-3 py-3 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-855 rounded-2xl transition-colors"
                >
                  Toggle State
                </button>
                <button
                  onClick={() => handleOpenEditService(service)}
                  className="p-3 border border-zinc-200 dark:border-zinc-805 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-2xl text-zinc-400 hover:text-indigo-650 transition-colors"
                  title="Edit Service"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    handleDeleteService(service.id);
                    navigate(`/business/${tenantId}/vendors`);
                  }}
                  className="p-3 border border-zinc-200 dark:border-zinc-805 hover:bg-zinc-50 dark:hover:bg-rose-500/5 text-zinc-400 hover:text-rose-600 rounded-2xl transition-colors"
                  title="Delete Agreement"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content Body Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description & Scope */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-widest mb-2">Description / Scope Overview</h3>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm">
                  {service.description || "No description provided for this service agreement."}
                </p>
              </div>

              {service.checklist && service.checklist.length > 0 && (
                <div className="space-y-3 bg-zinc-50 dark:bg-zinc-950/80 p-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-850">
                  <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block">Scope & Service Checklist</span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {service.checklist.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-zinc-650 dark:text-zinc-300 font-medium">
                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <span className="leading-tight mt-0.5">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Run History Logs */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-widest">Service Activity Log</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Chronological record of service runs and billings</p>
                </div>
                {service.status === 'Active' && (
                  <button
                    onClick={() => setLoggingServiceId(service.id)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                  >
                    <Clock className="w-4 h-4" />
                    Log Run
                  </button>
                )}
              </div>

              {service.history && service.history.length > 0 ? (
                <div className="space-y-3">
                  {service.history.map((log, index) => (
                    <div key={index} className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-4 bg-zinc-55 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-850 rounded-2xl">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <span className="text-sm text-zinc-850 dark:text-zinc-100 font-bold">
                            {new Date(log.date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                          </span>
                          <p className="text-[10px] text-zinc-400 font-medium">Logged by {log.loggedBy}</p>
                          {log.notes && <p className="text-xs text-zinc-550 dark:text-zinc-400 italic mt-1.5 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-800">{log.notes}</p>}
                        </div>
                      </div>
                      <div className="sm:text-right shrink-0">
                        <span className="font-mono text-base font-black text-zinc-900 dark:text-white">${log.cost.toFixed(2)}</span>
                        <p className="text-[10px] text-zinc-400 uppercase font-semibold">Billing Amount</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 border-2 border-dashed border-zinc-150 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                  <Clock className="w-8 h-8 opacity-40 mb-2" />
                  <p className="text-xs font-semibold">No service runs logged yet.</p>
                  {service.status === 'Active' && <p className="text-[10px] text-zinc-400 max-w-xs text-center mt-1">Record the first completed service occurrence to begin tracking operational performance logs.</p>}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Info (Right 1 col) */}
          <div className="space-y-6">
            {/* Connected Vendor */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-4">
              <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block">Service Provider</span>
              <div 
                onClick={() => navigate(`/business/${tenantId}/vendors/vendor/${service.vendorId}`)}
                className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-850 hover:border-indigo-500/40 rounded-2xl cursor-pointer transition-all hover:shadow-md group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:scale-105 transition-transform">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Vendor Details</span>
                  <span className="text-sm font-black text-zinc-900 dark:text-white truncate block group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">{service.vendorName}</span>
                </div>
              </div>
            </div>

            {/* Financial & Schedule Info */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-5">
              <div>
                <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block">Cost Frequency</span>
                <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">${service.cost.toFixed(2)}</div>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase">per {service.frequency.replace('_', ' ')}</span>
              </div>

              {service.status === 'Active' && service.nextServiceDate && (
                <div className="pt-4 border-t border-zinc-150 dark:border-zinc-800 space-y-2">
                  <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block">Next Scheduled Run</span>
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-white bg-indigo-500/5 border border-indigo-500/10 px-3.5 py-3 rounded-2xl">
                    <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="text-zinc-650 dark:text-zinc-300 font-bold">{new Date(service.nextServiceDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              )}

              {service.status === 'Proposed' && (
                <button
                  onClick={() => handleActivateService(service.id)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/10 transition-all active:scale-95"
                >
                  <CheckCircle className="w-4 h-4" />
                  Activate Service
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (subView === 'vendor' && viewId) {
    const vendor = vendors.find(v => v.id === viewId);
    if (!vendor) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500 gap-6 p-8 border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900 shadow-sm animate-in fade-in duration-300">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <div className="text-center space-y-1">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white">Vendor Not Found</h3>
            <p className="text-sm text-zinc-500 max-w-md">The vendor profile you are trying to view does not exist or may have been deleted.</p>
          </div>
          <button
            onClick={() => navigate(`/business/${tenantId}/vendors`)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </button>
        </div>
      );
    }

    const associatedServices = services.filter(s => s.vendorId === viewId);

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Detail Header */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/business/${tenantId}/vendors`)}
              className="p-3 border border-zinc-200 dark:border-zinc-850 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-2xl text-zinc-500 dark:text-zinc-400 transition-all active:scale-95"
              title="Back to Directory"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                  vendor.type === 'QuickBooks'
                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400'
                }`}>
                  {vendor.type}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white mt-1">{vendor.name}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyLink('vendor', vendor.id, vendor.name)}
              className="flex items-center gap-2 px-4 py-3 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-855 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 shadow-sm cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-indigo-500" />
              Copy Link
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Notes & Internal Details */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-widest">Internal Notes</h3>
              <p className="text-zinc-650 dark:text-zinc-300 leading-relaxed text-sm bg-zinc-50 dark:bg-zinc-950 p-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-850 font-medium italic">
                {vendor.notes || "No internal notes or contract summaries recorded for this vendor."}
              </p>
            </div>

            {/* Associated Services */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-widest">Associated Agreements ({associatedServices.length})</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Recurring plans and tracked services managed under this provider</p>
              </div>

              {associatedServices.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {associatedServices.map(service => (
                    <div
                      key={service.id}
                      onClick={() => navigate(`/business/${tenantId}/vendors/service/${service.id}`)}
                      className="p-5 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-850 hover:border-indigo-500/40 rounded-2xl cursor-pointer hover:shadow-md transition-all space-y-3 group"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${
                          service.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          service.status === 'Proposed' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                          'bg-zinc-500/10 text-zinc-500'
                        }`}>
                          {service.status}
                        </span>
                        <span className="font-mono text-sm font-bold text-zinc-900 dark:text-white">${service.cost.toFixed(2)}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-zinc-850 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">{service.name}</h4>
                        <p className="text-[10px] text-zinc-400 uppercase font-semibold mt-0.5">per {service.frequency.replace('_', ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 border-2 border-dashed border-zinc-150 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                  <ClipboardList className="w-8 h-8 opacity-40 mb-2" />
                  <p className="text-xs font-semibold">No services tracked yet for this vendor.</p>
                  {canManage && (
                    <button
                      onClick={() => {
                        setServiceForm({ ...serviceForm, vendorId: vendor.id });
                        setIsAddServiceOpen(true);
                      }}
                      className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Track Service Agreement
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-4">
              <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block">Contact Directory</span>
              <div className="space-y-3">
                {vendor.phone && (
                  <a 
                    href={`tel:${vendor.phone}`}
                    className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-850 hover:border-indigo-500/40 rounded-2xl transition-all block group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Phone Call</span>
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 truncate block group-hover:text-emerald-500 transition-colors">{vendor.phone}</span>
                    </div>
                  </a>
                )}

                {vendor.email && (
                  <a 
                    href={`mailto:${vendor.email}`}
                    className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-850 hover:border-indigo-500/40 rounded-2xl transition-all block group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Email Mailbox</span>
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 truncate block group-hover:text-sky-500 transition-colors">{vendor.email}</span>
                    </div>
                  </a>
                )}

                {vendor.website && (
                  <a 
                    href={vendor.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-850 hover:border-indigo-500/40 rounded-2xl transition-all block group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">External URL</span>
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 truncate block group-hover:text-indigo-500 transition-colors">Visit Website</span>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cost metrics calculation
  const activeServices = services.filter(s => s.status === 'Active');
  const monthlySpend = activeServices.reduce((sum, s) => {
    let monthlyCost = s.cost;
    if (s.frequency === 'weekly') monthlyCost = s.cost * 4.33;
    else if (s.frequency === 'bi_weekly') monthlyCost = s.cost * 2.16;
    else if (s.frequency === 'quarterly') monthlyCost = s.cost / 3;
    else if (s.frequency === 'annual') monthlyCost = s.cost / 12;
    else if (s.frequency === 'one_time') monthlyCost = 0;
    return sum + monthlyCost;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-800 p-6 rounded-3xl text-white shadow-xl shadow-indigo-500/10 flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-100 opacity-80">Estimated Monthly Spend</span>
            <div className="text-3xl font-black mt-2">${monthlySpend.toFixed(2)}</div>
          </div>
          <span className="text-[10px] text-indigo-200 mt-4 font-semibold">Calculated from {activeServices.length} active recurring plans</span>
        </div>
        
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 dark:text-zinc-500">Active Subscriptions</span>
            <div className="text-3xl font-black mt-2 text-zinc-900 dark:text-white">{activeServices.length}</div>
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-4 font-semibold">Total of {services.length} tracked vendor agreements</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 dark:text-zinc-500">Vendor Directory</span>
            <div className="text-3xl font-black mt-2 text-zinc-900 dark:text-white">{vendors.length}</div>
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-4 font-semibold">
            {vendors.filter(v => v.type === 'QuickBooks').length} QuickBooks + {vendors.filter(v => v.type === 'Native').length} Native Custom
          </span>
        </div>
      </div>

      {/* Header and Controls */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Sub-tab Swapper */}
          <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/80 w-fit">
            <button
              onClick={() => setActiveTab('services')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 ${
                activeTab === 'services'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Services & Subscriptions
            </button>
            <button
              onClick={() => setActiveTab('directory')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 ${
                activeTab === 'directory'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Vendor Directory
            </button>
          </div>

          {/* Action buttons + search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder={activeTab === 'services' ? "Search services..." : "Search vendors..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
              />
            </div>
            {canManage && (
              <>
                <button
                  onClick={() => setIsAddVendorOpen(true)}
                  className="flex items-center gap-2 px-4 py-3 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Vendor
                </button>
                <button
                  onClick={() => {
                    if (vendors.length === 0) {
                      toast.error('Add a vendor before creating a service');
                      return;
                    }
                    setIsAddServiceOpen(true);
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Track Service
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab 1: Services Cards */}
        {activeTab === 'services' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">            <AnimatePresence mode="popLayout">
              {filteredServices.map(service => {
                return (
                  <motion.div
                    layout
                    key={service.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => navigate(`/business/${tenantId}/vendors/service/${service.id}`)}
                    className={`bg-zinc-50 dark:bg-zinc-950/40 border ${service.status === 'Active' ? 'border-indigo-500/20 dark:border-indigo-500/20 shadow-lg shadow-indigo-500/2 shadow-indigo-600/[0.01]' : 'border-zinc-200 dark:border-zinc-850'} rounded-3xl p-6 flex flex-col justify-between transition-all hover:shadow-md hover:border-indigo-500/40 cursor-pointer relative overflow-hidden`}
                  >
                    {/* Glowing highlight for Active */}
                    {service.status === 'Active' && (
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
                    )}

                    <div className="space-y-4">
                      {/* Badge / Status row */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider ${
                            service.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                            service.status === 'Proposed' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                            'bg-zinc-500/10 text-zinc-500'
                          }`}>
                            {service.status}
                          </span>
                          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                            {service.frequency.replace('_', ' ')}
                          </span>
                          {service.googleRating && (
                            <span className="flex items-center gap-0.5 text-amber-500 text-xs font-bold bg-amber-500/5 px-2 py-0.5 rounded-lg border border-amber-500/10" title="Highly Rated Service Provider">
                              <Star className="w-3.5 h-3.5 fill-amber-500" />
                              {service.googleRating.toFixed(1)}
                            </span>
                          )}
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(service.id, service.status);
                              }}
                              className="text-xs text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                            >
                              Toggle State
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyLink('service', service.id, service.name);
                              }}
                              className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                              title="Copy Share Link"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenEditService(service);
                              }}
                              className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                              title="Edit Service Details"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteService(service.id);
                              }}
                              className="text-zinc-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-500/5 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Info block */}
                      <div className="space-y-1">
                        <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">
                          {service.name}
                        </h3>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/business/${tenantId}/vendors/vendor/${service.vendorId}`);
                            }}
                            className="hover:underline flex items-center gap-1.5 cursor-pointer"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            {service.vendorName}
                          </span>
                        </p>
                      </div>

                      <p className="text-xs text-zinc-500 dark:text-zinc-450 leading-relaxed">
                        {service.description}
                      </p>

                      {/* Checklist */}
                      {service.checklist && service.checklist.length > 0 && (
                        <div className="space-y-2 bg-white dark:bg-zinc-950/80 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-850">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Scope & Service Notes</span>
                          <ul className="space-y-1.5">
                            {service.checklist.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-xs text-zinc-650 dark:text-zinc-400 font-medium">
                                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Next Scheduled */}
                      {service.status === 'Active' && service.nextServiceDate && (
                        <div className="flex items-center gap-2 text-xs text-zinc-650 dark:text-zinc-400 font-semibold bg-indigo-500/5 border border-indigo-500/10 px-4 py-3 rounded-2xl w-fit">
                          <Calendar className="w-4 h-4 text-indigo-500" />
                          <span>Next Service:</span>
                          <span className="text-indigo-650 dark:text-indigo-300 font-bold">{new Date(service.nextServiceDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions and Cost Row */}
                    <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-850 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-400">Recurring Price</span>
                        <div className="text-xl font-black text-zinc-900 dark:text-white flex items-baseline gap-1">
                          ${service.cost.toFixed(2)}
                          <span className="text-[10px] text-zinc-400 font-bold uppercase">/ {service.frequency.replace('_', '')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {service.status === 'Proposed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActivateService(service.id);
                            }}
                            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/10 transition-all active:scale-95"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Activate Service & Schedule
                          </button>
                        )}
                        {service.status === 'Active' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLoggingServiceId(service.id);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                          >
                            <Clock className="w-4 h-4" />
                            Log Run
                          </button>
                        )}
                      </div>
                    </div>

                    {/* History logs rendering */}
                    {service.history && service.history.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-850 space-y-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Past Runs ({service.history.length})</span>
                        <div className="space-y-2 max-h-24 overflow-y-auto no-scrollbar">
                          {service.history.map((log, index) => (
                            <div key={index} className="flex justify-between items-center text-xs p-2 bg-white dark:bg-zinc-900/60 border border-zinc-150 dark:border-zinc-850 rounded-xl">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-zinc-800 dark:text-zinc-250 font-bold">
                                  {new Date(log.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium">by {log.loggedBy.split('@')[0]}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-zinc-800 dark:text-zinc-100">${log.cost.toFixed(2)}</span>
                                {log.notes && <p className="text-[10px] text-zinc-450 dark:text-zinc-500 italic truncate max-w-[120px]">{log.notes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredServices.length === 0 && (
              <div className="col-span-full py-16 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl flex flex-col items-center justify-center text-zinc-550 dark:text-zinc-450 p-6 text-center">
                <AlertCircle className="w-8 h-8 text-zinc-400 mb-3" />
                <h4 className="font-bold text-base text-zinc-800 dark:text-white">No services found</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-1">Try adjusting your filters or search input to locate specific active/proposed vendor agreements.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Vendor Directory */}
        {activeTab === 'directory' && (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-xs">Vendor Name</th>
                  <th className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-xs">Origin Type</th>
                  <th className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-xs">Contact Details</th>
                  <th className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-xs">Internal Notes</th>
                  <th className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredVendors.map(vendor => (
                  <tr 
                    key={vendor.id} 
                    onClick={() => navigate(`/business/${tenantId}/vendors/vendor/${vendor.id}`)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-zinc-400" />
                      {vendor.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                        vendor.type === 'QuickBooks'
                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400'
                      }`}>
                        {vendor.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      {vendor.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                          <Phone className="w-3 h-3 text-zinc-400" />
                          {vendor.phone}
                        </div>
                      )}
                      {vendor.email && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                          <Mail className="w-3 h-3 text-zinc-400" />
                          {vendor.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-455 max-w-[200px] truncate" title={vendor.notes}>
                      {vendor.notes || '-'}
                    </td>
                    <td className="px-6 py-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {vendor.website ? (
                        <a
                          href={vendor.website}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-zinc-900 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 rounded-xl text-xs font-semibold transition-colors"
                        >
                          Website
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-400 mr-2">-</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLink('vendor', vendor.id, vendor.name);
                        }}
                        className="p-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-zinc-400 hover:text-indigo-500 transition-colors"
                        title="Copy Share Link"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredVendors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
                      No vendors listed in directory yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Log Occurrence */}
      {loggingServiceId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">Record Service Occurrence</h3>
              <button 
                onClick={() => setLoggingServiceId(null)}
                className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded-xl transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleLogOccurrence} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Date</label>
                <input
                  type="date"
                  value={logForm.date}
                  onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Logged Billing / Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={logForm.cost}
                  onChange={(e) => setLogForm({ ...logForm, cost: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Notes / Receipts</label>
                <textarea
                  placeholder="E.g., hot washed 4 recycling bins and 3 trash bins."
                  value={logForm.notes}
                  onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm uppercase tracking-wider transition-all"
              >
                Log Service & Recalculate
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: New Vendor */}
      {isAddVendorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">Register Custom Vendor</h3>
              <button 
                onClick={() => setIsAddVendorOpen(false)}
                className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded-xl transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddVendor} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Vendor Name</label>
                <input
                  type="text"
                  placeholder="Vendor legal name"
                  value={vendorForm.name}
                  onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Email Address</label>
                <input
                  type="email"
                  placeholder="contact@vendor.com"
                  value={vendorForm.email}
                  onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Phone Number</label>
                <input
                  type="tel"
                  placeholder="123-456-7890"
                  value={vendorForm.phone}
                  onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Website Address</label>
                <input
                  type="url"
                  placeholder="https://vendor.com"
                  value={vendorForm.website}
                  onChange={(e) => setVendorForm({ ...vendorForm, website: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Internal Notes</label>
                <textarea
                  placeholder="Office notes, contracts, key contacts details..."
                  value={vendorForm.notes}
                  onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm uppercase tracking-wider transition-all"
              >
                Save Native Vendor
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: New Service Track */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">Track Recurring Subscription</h3>
              <button 
                onClick={() => setIsAddServiceOpen(false)}
                className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded-xl transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddService} className="p-6 space-y-4 overflow-y-auto max-h-[75vh] no-scrollbar">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Connect to Vendor</label>
                <select
                  value={serviceForm.vendorId}
                  onChange={(e) => setServiceForm({ ...serviceForm, vendorId: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  required
                >
                  <option value="">-- Select Vendor --</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Plan Name</label>
                <input
                  type="text"
                  placeholder="E.g., Premium Sanitizing, Software License"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Base Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="25.00"
                    value={serviceForm.cost}
                    onChange={(e) => setServiceForm({ ...serviceForm, cost: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Billing Interval</label>
                  <select
                    value={serviceForm.frequency}
                    onChange={(e) => setServiceForm({ ...serviceForm, frequency: e.target.value as ServiceSubscription['frequency'] })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    required
                  >
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-time</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Description</label>
                <textarea
                  placeholder="Detail what is included in this subscription tier..."
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Scope Items (One per line)</label>
                <textarea
                  placeholder="Check exhaust filters&#10;Clean spray nozzles&#10;Deodorize bin interior"
                  value={serviceForm.checklistText}
                  onChange={(e) => setServiceForm({ ...serviceForm, checklistText: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none font-mono text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm uppercase tracking-wider transition-all"
              >
                Track Proposed Plan
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Service */}
      {editingService && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">Edit Service Agreement</h3>
              <button 
                onClick={() => setEditingService(null)}
                className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded-xl transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditService} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Vendor</label>
                  <select
                    value={editServiceForm.vendorId}
                    onChange={(e) => setEditServiceForm({ ...editServiceForm, vendorId: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    required
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Plan Name</label>
                  <input
                    type="text"
                    placeholder="E.g., Weekly Office Cleaning"
                    value={editServiceForm.name}
                    onChange={(e) => setEditServiceForm({ ...editServiceForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Cost per Cycle ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editServiceForm.cost}
                    onChange={(e) => setEditServiceForm({ ...editServiceForm, cost: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Frequency</label>
                  <select
                    value={editServiceForm.frequency}
                    onChange={(e) => setEditServiceForm({ ...editServiceForm, frequency: e.target.value as any })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-Time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Status</label>
                  <select
                    value={editServiceForm.status}
                    onChange={(e) => setEditServiceForm({ ...editServiceForm, status: e.target.value as any })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  >
                    <option value="Proposed">Proposed</option>
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Next Due Date</label>
                  <input
                    type="date"
                    value={editServiceForm.nextServiceDate}
                    onChange={(e) => setEditServiceForm({ ...editServiceForm, nextServiceDate: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Plan Description / Scope Overview</label>
                <textarea
                  placeholder="Detail billing increments, primary tasks, or setup options..."
                  value={editServiceForm.description}
                  onChange={(e) => setEditServiceForm({ ...editServiceForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Service Scope Items (One per line)</label>
                <textarea
                  placeholder="Check exhaust filters&#10;Clean spray nozzles&#10;Deodorize bin interior"
                  value={editServiceForm.checklistText}
                  onChange={(e) => setEditServiceForm({ ...editServiceForm, checklistText: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none font-mono text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm uppercase tracking-wider transition-all"
              >
                Save Agreement Changes
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
