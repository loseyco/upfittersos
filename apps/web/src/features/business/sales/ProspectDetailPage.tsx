import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { useAuthStore } from '../../../lib/auth/store';
import { usePageTitle } from '../../../lib/hooks/usePageTitle';
import { 
  ArrowLeft, Share2, Edit2, Trash2, Check, Phone, Mail, User, 
  DollarSign, Tag, MessageSquare, Plus, Save, Clock, X, Wrench
} from 'lucide-react';
import { toast } from 'sonner';

const STAGES = [
  { id: 'lead', label: 'Lead In', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  { id: 'contacted', label: 'Contacted', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  { id: 'meeting', label: 'Meeting Scheduled', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  { id: 'proposal', label: 'Proposal Sent', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { id: 'negotiation', label: 'Negotiation', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { id: 'won', label: 'Won', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { id: 'lost', label: 'Lost', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  { id: 'existing', label: 'Existing Account', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' }
] as const;

type StageId = typeof STAGES[number]['id'];

interface ProspectDetailPageProps {
  tenantId: string;
  prospectId?: string;
  setDynamicTitle?: (title: string | null) => void;
}

export function ProspectDetailPage({ tenantId: propTenantId, prospectId: propProspectId, setDynamicTitle }: ProspectDetailPageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const urlTenantId = params.tenantId;
  const tenantId = propTenantId || urlTenantId;
  
  // Extract prospectId from params if not passed directly
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  
  let prospectId = propProspectId;
  if (!prospectId) {
    if (pathParts[0] === 'prospect' && pathParts[1]) {
      prospectId = pathParts[1];
    } else if (pathParts[0] === 'sales' && pathParts[1] === 'lead' && pathParts[2]) {
      prospectId = pathParts[2];
    } else if (pathParts[0] === 'sales' && pathParts[1]) {
      prospectId = pathParts[1];
    }
  }

  const [isEditing, setIsEditing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch Prospect details
  const { data: prospect, isLoading, refetch } = useQuery({
    queryKey: ['sales-prospect-detail', tenantId, prospectId],
    queryFn: async () => {
      if (!tenantId || !prospectId) return null;
      if (prospectId.startsWith('cust_')) {
        const rawCustId = prospectId.replace('cust_', '');
        const [nativeSnap, qbSnap] = await Promise.all([
          getDoc(doc(db, `businesses/${tenantId}/customers`, rawCustId)),
          getDoc(doc(db, `businesses/${tenantId}/qb_customers`, rawCustId))
        ]);

        const cData = nativeSnap.exists() ? nativeSnap.data() : (qbSnap.exists() ? qbSnap.data() : null);
        if (cData) {
          const cName = (
            cData.name || 
            cData.displayName || 
            cData.DisplayName || 
            cData.FullyQualifiedName || 
            cData.companyName || 
            cData.CompanyName || 
            (cData.GivenName && cData.FamilyName ? `${cData.GivenName} ${cData.FamilyName}` : '') || 
            cData.GivenName || 
            cData.FamilyName ||
            `Customer Account`
          ).trim();

          return {
            id: prospectId,
            customerId: rawCustId,
            name: cName,
            contactPerson: cData.contactPerson || cData.givenName || cData.GivenName || '',
            email: cData.email || cData.primaryEmailAddr || cData.PrimaryEmailAddr?.Address || '',
            phone: cData.phone || cData.primaryPhone || cData.PrimaryPhone?.FreeFormNumber || '',
            value: Number(cData.value) || 0,
            status: cData.pipelineStage || 'existing',
            notes: cData.notes || cData.Notes || 'Master Customer Account',
            source: cData.quickbooksId ? 'QuickBooks Sync' : 'Direct Account',
            isVirtualCustomer: true
          };
        }
      }

      const snap = await getDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as any;
    },
    enabled: !!tenantId && !!prospectId
  });

  // Fetch Past Jobs & Customer Record if this prospect matches an existing customer
  const { data: customerHistory } = useQuery({
    queryKey: ['customer-history-crm', tenantId, prospect?.name, prospect?.email, prospect?.customerId],
    queryFn: async () => {
      if (!tenantId || !prospect) return null;
      
      const searchName = (prospect.name || '').toLowerCase().trim();
      const searchEmail = (prospect.email || '').toLowerCase().trim();
      
      // 1. Check if customer exists in customers or qb_customers
      const [custSnap, qbSnap, jobsSnap] = await Promise.all([
        getDocs(collection(db, `businesses/${tenantId}/customers`)),
        getDocs(collection(db, `businesses/${tenantId}/qb_customers`)),
        getDocs(collection(db, `businesses/${tenantId}/jobs`))
      ]);

      const allCustomers = [
        ...custSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        ...qbSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      ];

      const matchedCustomer = allCustomers.find((c: any) => {
        const cName = (c.name || c.displayName || c.DisplayName || c.companyName || '').toLowerCase().trim();
        const cEmail = (c.email || c.primaryEmailAddr || c.PrimaryEmailAddr?.Address || '').toLowerCase().trim();
        return (prospect.customerId && c.id === prospect.customerId) ||
               (searchName && cName && searchName === cName) ||
               (searchEmail && cEmail && searchEmail === cEmail);
      });

      // 2. Find all jobs associated with this customer
      const customerJobs = jobsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(j => {
          const jCust = (j.customerName || j.customer?.name || '').toLowerCase().trim();
          const jEmail = (j.customerEmail || j.customer?.email || '').toLowerCase().trim();
          return (matchedCustomer && (j.customerId === matchedCustomer.id)) ||
                 (searchName && jCust && jCust.includes(searchName)) ||
                 (searchEmail && jEmail && searchEmail === jEmail);
        });

      const totalSpent = customerJobs.reduce((sum, j) => sum + (j.total || j.grandTotal || j.amount || 0), 0);

      return {
        matchedCustomer,
        pastJobs: customerJobs,
        totalJobsCount: customerJobs.length,
        totalSpent
      };
    },
    enabled: !!tenantId && !!prospect
  });

  // Set page title
  usePageTitle(prospect?.name ? `Lead: ${prospect.name}` : 'Lead Details');

  React.useEffect(() => {
    if (prospect?.name && setDynamicTitle) {
      setDynamicTitle(`Lead: ${prospect.name}`);
    }
    return () => {
      if (setDynamicTitle) setDynamicTitle(null);
    };
  }, [prospect?.name, setDynamicTitle]);

  // Fetch Staff List
  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(s => !s.isArchived && !s.isDeviceAccount);
    },
    enabled: !!tenantId
  });

  // Fetch Activities for this Prospect
  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['sales-activities-prospect', tenantId, prospectId],
    queryFn: async () => {
      if (!tenantId || !prospectId) return [];
      try {
        const q = query(
          collection(db, `businesses/${tenantId}/sales_activities`),
          where('prospectId', '==', prospectId),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      } catch (e) {
        // Fallback without index if needed
        const snap = await getDocs(collection(db, `businesses/${tenantId}/sales_activities`));
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(a => a.prospectId === prospectId)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      }
    },
    enabled: !!tenantId && !!prospectId
  });

  // Form edit state
  const [editForm, setEditForm] = useState<any>({});
  
  React.useEffect(() => {
    if (prospect) {
      setEditForm({
        name: prospect.name || '',
        contactPerson: prospect.contactPerson || '',
        email: prospect.email || '',
        phone: prospect.phone || '',
        value: prospect.value || 0,
        status: prospect.status || 'lead',
        notes: prospect.notes || '',
        assignedTo: prospect.assignedTo || '',
        source: prospect.source || 'Website'
      });
    }
  }, [prospect]);

  // Log activity form state
  const [newActivity, setNewActivity] = useState({
    type: 'call',
    title: '',
    description: '',
    outcome: ''
  });
  const [isLogging, setIsLogging] = useState(false);

  const handleCopyLink = () => {
    const fullUrl = window.location.href;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    toast.success('Lead link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSaveEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectId) return;

    try {
      const selectedRep = staffList.find(s => s.id === editForm.assignedTo);
      const repName = selectedRep ? `${selectedRep.firstName} ${selectedRep.lastName}` : 'Unassigned';

      const updates: any = {
        name: editForm.name.trim(),
        contactPerson: editForm.contactPerson.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        value: Number(editForm.value) || 0,
        status: editForm.status,
        notes: editForm.notes.trim(),
        assignedTo: editForm.assignedTo || null,
        assignedToName: repName,
        source: editForm.source,
        updatedAt: serverTimestamp()
      };

      if (editForm.status === 'won' && prospect?.status !== 'won') {
        updates.wonAt = serverTimestamp();
      } else if (editForm.status === 'lost' && prospect?.status !== 'lost') {
        updates.lostAt = serverTimestamp();
      }

      await updateDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId), updates);
      toast.success('Lead details updated');
      setIsEditing(false);
      refetch();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update lead');
    }
  };

  const handleQuickStatusChange = async (newStatus: StageId) => {
    if (!prospectId || !prospect) return;
    try {
      const updates: any = {
        pipelineStage: newStatus,
        status: newStatus,
        updatedAt: serverTimestamp()
      };
      if (newStatus === 'won') updates.wonAt = serverTimestamp();
      if (newStatus === 'lost') updates.lostAt = serverTimestamp();

      if (prospectId.startsWith('cust_')) {
        const rawId = prospectId.replace('cust_', '');
        const nativeRef = doc(db, `businesses/${tenantId}/customers`, rawId);
        const nativeSnap = await getDoc(nativeRef);
        if (nativeSnap.exists()) {
          await updateDoc(nativeRef, updates);
        } else {
          const qbRef = doc(db, `businesses/${tenantId}/qb_customers`, rawId);
          const qbSnap = await getDoc(qbRef);
          if (qbSnap.exists()) {
            await updateDoc(qbRef, updates);
          }
        }
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId), updates);
      }

      toast.success(`Stage changed to ${newStatus.toUpperCase()}`);
      await refetch();
    } catch (err) {
      toast.error('Failed to update stage');
    }
  };

  const handleDelete = async () => {
    if (!prospectId || !confirm(`Delete lead "${prospect?.name}"? This cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId));
      toast.success('Lead deleted successfully');
      navigate(`/business/${tenantId}/sales`);
    } catch (err) {
      toast.error('Failed to delete lead');
    }
  };

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivity.title.trim() || !prospectId) return;

    setIsLogging(true);
    try {
      const repName = user?.displayName || user?.email || 'Staff Member';

      await addDoc(collection(db, `businesses/${tenantId}/sales_activities`), {
        prospectId,
        prospectName: prospect?.name || 'Prospect',
        type: newActivity.type,
        title: newActivity.title.trim(),
        description: newActivity.description.trim(),
        outcome: newActivity.outcome.trim(),
        date: new Date().toISOString(),
        createdBy: user?.uid || null,
        createdByName: repName,
        createdAt: serverTimestamp()
      });

      toast.success('Activity logged');
      setNewActivity({ type: 'call', title: '', description: '', outcome: '' });
      refetchActivities();
    } catch (err) {
      toast.error('Failed to log activity');
    } finally {
      setIsLogging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold uppercase tracking-wider">Loading Lead Details...</p>
        </div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl inline-block border border-rose-500/20">
          <X className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Lead Not Found</h2>
        <p className="text-xs text-zinc-500">The requested lead does not exist or may have been deleted.</p>
        <button
          onClick={() => navigate(`/business/${tenantId}/sales`)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
        >
          Return to Sales Dashboard
        </button>
      </div>
    );
  }

  const currentStage = STAGES.find(s => s.id === prospect.status) || STAGES[0];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate(`/business/${tenantId}/sales`)}
            className="p-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-2xl transition-all shrink-0 active:scale-95"
            title="Back to Sales & CRM"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight truncate">
                {prospect.name}
              </h1>
              <span className={`px-3 py-1 border text-xs font-black uppercase tracking-wider rounded-xl ${currentStage.color}`}>
                {currentStage.label}
              </span>
            </div>
            {prospect.contactPerson && (
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                Contact: {prospect.contactPerson}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Share Direct Link Button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all active:scale-95"
            title="Copy direct link to share via email or message"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedLink ? 'Link Copied!' : 'Share Lead Link'}</span>
          </button>

          {/* Edit Button */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            <Edit2 className="w-4 h-4" />
            <span>{isEditing ? 'Cancel Edit' : 'Edit Lead'}</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="p-2.5 text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl transition-all active:scale-95"
            title="Delete Lead"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stage Tracker Header */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-[650px]">
          {STAGES.map((s, idx) => {
            const isActive = s.id === prospect.status;
            return (
              <button
                key={s.id}
                onClick={() => handleQuickStatusChange(s.id)}
                className={`flex-1 py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-md shadow-indigo-500/20'
                    : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800/80 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs font-semibold'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider opacity-80 mb-0.5">Stage {idx + 1}</div>
                <div className="text-xs truncate">{s.label}</div>
              </button>
            );
          })}
        </div>
      </div>

 

      {/* Main Grid: Details Left, Activity Log Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (Details & Scope) */}
        <div className="lg:col-span-5 space-y-6">
          
          {isEditing ? (
            /* EDIT FORM */
            <form onSubmit={handleSaveEdits} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-500" /> Edit Lead Information
              </h3>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Company / Lead Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editForm.contactPerson}
                    onChange={e => setEditForm({ ...editForm, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Estimated Deal ($)</label>
                  <input
                    type="number"
                    value={editForm.value}
                    onChange={e => setEditForm({ ...editForm, value: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Assigned Sales Rep</label>
                  <select
                    value={editForm.assignedTo}
                    onChange={e => setEditForm({ ...editForm, assignedTo: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Lead Source</label>
                  <select
                    value={editForm.source}
                    onChange={e => setEditForm({ ...editForm, source: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Website">Website</option>
                    <option value="Text Message">Text Message (SMS)</option>
                    <option value="Phone Call">Phone Call / Inbound</option>
                    <option value="Referral">Referral</option>
                    <option value="Cold Outreach">Cold Outreach</option>
                    <option value="Trade Show">Trade Show</option>
                    <option value="QuickBooks Sync">QuickBooks Sync</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Deal Details & Scope Notes</label>
                <textarea
                  rows={4}
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save Lead Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            /* LEAD SUMMARY VIEW */
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
              
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Estimated Deal Value</span>
                  <span className="text-3xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                    ${(prospect.value || 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-2xl">
                  <DollarSign className="w-7 h-7 text-emerald-500" />
                </div>
              </div>

              {/* Info Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80">
                  <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider block mb-1">Lead Source</span>
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-400" /> {prospect.source || 'Website'}
                  </span>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80">
                  <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider block mb-1">Assigned Rep</span>
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-indigo-400" /> {prospect.assignedToName || 'Unassigned'}
                  </span>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Contact Directory</h4>
                
                {prospect.email ? (
                  <a 
                    href={`mailto:${prospect.email}`}
                    className="flex items-center gap-3 p-3 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950/60 dark:hover:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 transition-colors group"
                  >
                    <Mail className="w-4 h-4 text-indigo-500" />
                    <div className="min-w-0">
                      <span className="text-[9px] text-zinc-400 block uppercase font-bold">Email Address</span>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-500 truncate block">
                        {prospect.email}
                      </span>
                    </div>
                  </a>
                ) : (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 font-medium italic">
                    No email listed
                  </div>
                )}

                {prospect.phone ? (
                  <a 
                    href={`tel:${prospect.phone}`}
                    className="flex items-center gap-3 p-3 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950/60 dark:hover:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 transition-colors group"
                  >
                    <Phone className="w-4 h-4 text-emerald-500" />
                    <div className="min-w-0">
                      <span className="text-[9px] text-zinc-400 block uppercase font-bold">Phone Number</span>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-emerald-500 truncate block">
                        {prospect.phone}
                      </span>
                    </div>
                  </a>
                ) : (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 font-medium italic">
                    No phone number listed
                  </div>
                )}
              </div>

              {/* Deal Scope Notes */}
              <div className="space-y-2 pt-2">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Scope & Requirements Notes</h4>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {prospect.notes || 'No scope notes added yet.'}
                </div>
              </div>

              {/* Customer Past Work & History Card */}
              {customerHistory && customerHistory.totalJobsCount > 0 && (
                <div className="bg-amber-500/5 dark:bg-amber-950/20 p-5 rounded-3xl border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" /> Past Work History ({customerHistory.totalJobsCount} Jobs)
                    </h4>
                    <span className="text-xs font-mono font-black text-emerald-500">
                      ${customerHistory.totalSpent.toLocaleString()} Spent
                    </span>
                  </div>

                  <div className="space-y-2">
                    {customerHistory.pastJobs.slice(0, 5).map((job: any) => (
                      <div key={job.id} className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate">
                            {job.title || job.jobName || job.vehicleInfo || `Job #${job.jobNumber || job.id.slice(0, 6)}`}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-2">
                            <span>{job.createdAt?.seconds ? new Date(job.createdAt.seconds * 1000).toLocaleDateString() : 'Completed'}</span>
                            {job.vin && <span>• VIN: ...{job.vin.slice(-6)}</span>}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                          ${(job.total || job.grandTotal || job.amount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Right Column (Log Interaction & Timeline) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Log New Activity Card */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" /> Log Client Interaction
            </h3>

            <form onSubmit={handleLogActivity} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Interaction Type</label>
                  <select
                    value={newActivity.type}
                    onChange={e => setNewActivity({ ...newActivity, type: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="call">📞 Phone Call</option>
                    <option value="sms">💬 SMS / Text Message</option>
                    <option value="meeting">🤝 Meeting</option>
                    <option value="email">📧 Email Sent / Received</option>
                    <option value="demo">💻 Product Demo / Review</option>
                    <option value="proposal">📄 Proposal / Quote Issued</option>
                    <option value="other">ℹ️ Other Interaction</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Activity Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Followed up regarding quote options"
                    value={newActivity.title}
                    onChange={e => setNewActivity({ ...newActivity, title: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Summary & Details</label>
                <textarea
                  rows={2}
                  placeholder="Details of what was discussed, key requirements, or client feedback..."
                  value={newActivity.description}
                  onChange={e => setNewActivity({ ...newActivity, description: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isLogging || !newActivity.title.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>{isLogging ? 'Saving Log...' : 'Log Activity'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Activity Timeline Feed */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" /> Activity Timeline ({activities.length})
            </h3>

            {activities.length > 0 ? (
              <div className="space-y-4 pt-2">
                {activities.map((act) => (
                  <div 
                    key={act.id}
                    className="p-4 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-[9px] font-black uppercase rounded-md">
                          {act.type}
                        </span>
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                          {act.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        {act.createdAt?.seconds ? new Date(act.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}
                      </span>
                    </div>

                    {act.description && (
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                        {act.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                      <span>Logged by <strong className="text-zinc-700 dark:text-zinc-300">{act.createdByName || 'Staff'}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/60 rounded-2xl text-zinc-400 text-xs font-medium italic">
                No activity logs recorded for this lead yet.
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
