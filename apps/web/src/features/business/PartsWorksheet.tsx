import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, orderBy, doc, getDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Search, FileSpreadsheet, Plus, Trash2, ExternalLink, ChevronDown, User, Archive
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { StaffLink } from './StaffPerformance';

interface PartsRequest {
  id: string;
  partName: string;
  partNumber?: string;
  jobId?: string;
  jobTitle?: string;
  taskId?: string;
  taskTitle?: string;
  requestedBy: string;
  requestedById?: string;
  urgency: 'normal' | 'urgent';
  status: 'pending' | 'ordered' | 'received' | 'fulfilled' | 'delivered' | 'cancelled';
  notes?: string;
  quantity?: number;
  createdAt: any;
  updatedAt?: any;
  isArchived?: boolean;
}

interface Job {
  id: string;
  title: string;
  jobNumber?: string;
  customerName?: string;
  vehicleName?: string;
  vin?: string;
  status?: string;
}

export function PartsWorksheet({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['parts.manage'];

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active, pending, ordered, received, completed, all
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Quick Add Form state
  const [newPartName, setNewPartName] = useState('');
  const [newQuantity, setNewQuantity] = useState(1);
  const [newUrgency, setNewUrgency] = useState<'normal' | 'urgent'>('normal');
  const [newJobId, setNewJobId] = useState('none');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmittingQuickAdd, setIsSubmittingQuickAdd] = useState(false);

  // Inline notes editing state
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesText, setEditingNotesText] = useState('');

  // Inline partName editing state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameText, setEditingNameText] = useState('');

  // Live Subscription Data
  const [requestsList, setRequestsList] = useState<PartsRequest[]>([]);
  const [jobsList, setJobsList] = useState<Job[]>([]);

  // Column Resizing State
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    partName: 200,
    quantity: 80,
    urgency: 90,
    job: 200,
    status: 130,
    requestedBy: 140,
    createdAt: 100,
    notes: 220,
    actions: 60
  });

  const startColResizing = (e: React.PointerEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(50, startWidth + deltaX)
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const renderResizeHandle = (colKey: string) => (
    <div
      onPointerDown={(e) => startColResizing(e, colKey)}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-30 select-none"
      style={{ touchAction: 'none' }}
    />
  );

  // Subscriptions setup
  useEffect(() => {
    if (!tenantId) return;

    // 1. Listen to jobs
    const unsubJobs = onSnapshot(query(collection(db, `businesses/${tenantId}/jobs`)), (snap) => {
      setJobsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
    });

    // 2. Listen to parts requests
    const qRequests = query(collection(db, `businesses/${tenantId}/parts_requests`), orderBy('createdAt', 'desc'));
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      setRequestsList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartsRequest)));
    });

    return () => {
      unsubJobs();
      unsubRequests();
    };
  }, [tenantId]);

  // Handle Quick Add
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim()) {
      toast.error('Part Name / Description is required');
      return;
    }

    setIsSubmittingQuickAdd(true);
    try {
      const selectedJob = jobsList.find(j => j.id === newJobId);
      const jobTitle = selectedJob ? selectedJob.title : '';

      const newDoc = {
        partName: newPartName.trim(),
        quantity: newQuantity,
        urgency: newUrgency,
        jobId: newJobId === 'none' ? null : newJobId,
        jobTitle: newJobId === 'none' ? null : jobTitle,
        notes: newNotes.trim() || null,
        status: 'pending',
        requestedBy: user?.displayName || user?.email || 'Staff',
        requestedById: user?.uid || null,
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), newDoc);

      // Log to job activity if linked
      if (newJobId !== 'none') {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${newJobId}/activity`), {
          type: 'part_requested',
          message: `Requested part: ${newPartName.trim()} (Qty: ${newQuantity})`,
          timestamp: new Date(),
          staffId: user?.uid || 'system',
          staffName: user?.displayName || user?.email || 'Staff'
        });
      }

      // Log to global activity feed
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'parts',
        title: 'New Part Requested',
        message: `${newPartName.trim()} (Qty: ${newQuantity}) requested by ${user?.displayName || 'Staff'}`,
        timestamp: serverTimestamp(),
        severity: newUrgency === 'urgent' ? 'warning' : 'info',
        author: user?.displayName || user?.email?.split('@')[0] || 'System'
      });

      toast.success('Parts request added successfully');
      setNewPartName('');
      setNewQuantity(1);
      setNewUrgency('normal');
      setNewJobId('none');
      setNewNotes('');
    } catch (err: any) {
      toast.error(`Quick add failed: ${err.message}`);
    } finally {
      setIsSubmittingQuickAdd(false);
    }
  };

  // Zero-Save Inline Status updates
  const handleStatusChange = async (requestId: string, newStatus: any) => {
    if (!canManage) return;
    setIsUpdating(requestId);
    try {
      const reqRef = doc(db, `businesses/${tenantId}/parts_requests`, requestId);
      const prevSnap = await getDoc(reqRef);
      const prevData = prevSnap.data() as PartsRequest;

      await updateDoc(reqRef, {
        status: newStatus,
        statusChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Log to job activity
      if (prevData?.jobId) {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${prevData.jobId}/activity`), {
          type: 'part_status_changed',
          message: `Part "${prevData.partName}" marked as ${newStatus.toUpperCase()}`,
          timestamp: new Date(),
          staffId: user?.uid || 'system',
          staffName: user?.displayName || user?.email || 'Staff'
        });
      }

      // Log to global activity feed
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'parts',
        title: `Part Status Changed`,
        message: `Part "${prevData?.partName}" marked as ${newStatus.toUpperCase()}`,
        timestamp: serverTimestamp(),
        severity: newStatus === 'received' || newStatus === 'fulfilled' || newStatus === 'delivered' ? 'success' : 'info',
        author: user?.displayName || user?.email?.split('@')[0] || 'System'
      });

      toast.success(`Status updated to ${newStatus}`);
    } catch (err: any) {
      toast.error(`Failed to update status: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Zero-Save Inline Urgency toggle
  const handleUrgencyToggle = async (request: PartsRequest) => {
    if (!canManage) return;
    setIsUpdating(request.id);
    try {
      const nextUrgency = request.urgency === 'urgent' ? 'normal' : 'urgent';
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, request.id), {
        urgency: nextUrgency,
        updatedAt: serverTimestamp()
      });
      toast.success(`Urgency set to ${nextUrgency}`);
    } catch (err: any) {
      toast.error(`Failed to toggle urgency: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Zero-Save Inline Quantity adjustment
  const handleQuantityChange = async (requestId: string, currentQty: number, delta: number) => {
    if (!canManage) return;
    const nextQty = Math.max(1, currentQty + delta);
    if (nextQty === currentQty) return;

    setIsUpdating(requestId);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId), {
        quantity: nextQty,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      toast.error(`Failed to update quantity: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Zero-Save Inline Job Assignment
  const handleJobChange = async (requestId: string, selectedJobId: string) => {
    if (!canManage) return;
    setIsUpdating(requestId);
    try {
      const reqRef = doc(db, `businesses/${tenantId}/parts_requests`, requestId);
      if (selectedJobId === 'none') {
        await updateDoc(reqRef, {
          jobId: null,
          jobTitle: null,
          updatedAt: serverTimestamp()
        });
        toast.success('Unlinked job from request');
      } else {
        const selectedJob = jobsList.find(j => j.id === selectedJobId);
        const jobTitle = selectedJob ? selectedJob.title : '';
        await updateDoc(reqRef, {
          jobId: selectedJobId,
          jobTitle: jobTitle,
          updatedAt: serverTimestamp()
        });
        toast.success(`Linked job: ${jobTitle}`);

        // Log to new job activity
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${selectedJobId}/activity`), {
          type: 'part_requested',
          message: `Linked parts request: "${jobsList.find(j => j.id === selectedJobId)?.title || 'Part'}"`,
          timestamp: new Date(),
          staffId: user?.uid || 'system',
          staffName: user?.displayName || user?.email || 'Staff'
        });
      }
    } catch (err: any) {
      toast.error(`Failed to link job: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Zero-Save Inline Notes blur save
  const handleNotesSave = async (requestId: string) => {
    setEditingNotesId(null);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId), {
        notes: editingNotesText.trim() || null,
        updatedAt: serverTimestamp()
      });
      toast.success('Notes updated');
    } catch (err: any) {
      toast.error(`Failed to save notes: ${err.message}`);
    }
  };

  // Zero-Save Inline Part Name blur save
  const handleNameSave = async (requestId: string) => {
    setEditingNameId(null);
    if (!editingNameText.trim()) {
      toast.error('Part Name cannot be empty');
      return;
    }
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId), {
        partName: editingNameText.trim(),
        updatedAt: serverTimestamp()
      });
      toast.success('Part name updated');
    } catch (err: any) {
      toast.error(`Failed to save part name: ${err.message}`);
    }
  };

  // Archive Selected/Completed Parts
  const handleArchiveCompleted = async () => {
    if (!canManage) return;
    const completedRequests = requestsList.filter(r => 
      !r.isArchived && (r.status === 'received' || r.status === 'fulfilled' || r.status === 'delivered' || r.status === 'cancelled')
    );

    if (completedRequests.length === 0) {
      toast.info('No completed, received, or cancelled requests to archive.');
      return;
    }

    if (!window.confirm(`Archive ${completedRequests.length} finished parts requests to keep the active sheet clean?`)) return;

    try {
      await Promise.all(completedRequests.map(req => 
        updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, req.id), {
          isArchived: true,
          updatedAt: serverTimestamp()
        })
      ));
      toast.success(`Archived ${completedRequests.length} parts requests.`);
    } catch (err: any) {
      toast.error(`Archiving failed: ${err.message}`);
    }
  };

  // Delete individual request
  const handleDeleteRequest = async (requestId: string, partName: string) => {
    if (!canManage) return;
    if (!window.confirm(`Are you sure you want to permanently delete the request for "${partName}"?`)) return;

    setIsUpdating(requestId);
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId));
      toast.success(`Deleted request for "${partName}"`);
    } catch (err: any) {
      toast.error(`Failed to delete request: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Filtered & Sorted Requests List
  const filteredRequests = useMemo(() => {
    return requestsList.filter(r => {
      // 1. Archive filter
      const isArchivedMatch = showArchived ? r.isArchived : !r.isArchived;
      if (!isArchivedMatch) return false;

      // 2. Search search
      const partName = (r.partName || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      const requestedBy = (r.requestedBy || '').toLowerCase();
      const jobTitle = (r.jobTitle || '').toLowerCase();
      const searchStr = searchTerm.toLowerCase();
      const searchMatch = partName.includes(searchStr) || 
        notes.includes(searchStr) || 
        requestedBy.includes(searchStr) || 
        jobTitle.includes(searchStr);

      if (!searchMatch) return false;

      // 3. Urgency Filter
      if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false;

      // 4. Status Filter
      if (statusFilter === 'active') {
        return r.status !== 'received' && r.status !== 'fulfilled' && r.status !== 'delivered' && r.status !== 'cancelled';
      }
      if (statusFilter === 'pending') return r.status === 'pending';
      if (statusFilter === 'ordered') return r.status === 'ordered';
      if (statusFilter === 'received') return r.status === 'received';
      if (statusFilter === 'completed') {
        return r.status === 'received' || r.status === 'fulfilled' || r.status === 'delivered' || r.status === 'cancelled';
      }

      return true;
    });
  }, [requestsList, searchTerm, statusFilter, urgencyFilter, showArchived]);

  // HSL Status theme matching
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fulfilled':
      case 'delivered':
        return 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,70%,40%)] border border-[hsl(142,76%,36%)]/20';
      case 'received':
        return 'bg-[hsl(160,84%,40%)]/10 text-[hsl(160,84%,35%)] border border-[hsl(160,84%,40%)]/20';
      case 'ordered':
        return 'bg-[hsl(217,91%,60%)]/10 text-[hsl(217,91%,55%)] border border-[hsl(217,91%,60%)]/20';
      case 'cancelled':
        return 'bg-[hsl(0,84%,60%)]/10 text-[hsl(0,84%,55%)] border border-[hsl(0,84%,60%)]/20';
      default:
        return 'bg-[hsl(35,92%,50%)]/10 text-[hsl(35,92%,45%)] border border-[hsl(35,92%,50%)]/20 animate-pulse';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    return urgency === 'urgent'
      ? 'bg-rose-500/10 text-rose-600 border border-rose-500/25 dark:bg-rose-500/20 dark:text-rose-400 animate-pulse font-black'
      : 'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 font-bold';
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 font-sans text-xs select-none">
      
      {/* ----------------------------------------------------
          TOP WORKBOARD HEADER
      ---------------------------------------------------- */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:py-5 sm:px-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
              Parts Worksheet
            </h2>
            <p className="text-sm text-zinc-500 mt-1">Excel-style live parts manager worksheet. Click fields directly to make fast, auto-synced changes.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleArchiveCompleted}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 shrink-0"
              title="Archive all finished parts requests"
            >
              <Archive className="w-4 h-4 text-zinc-500" /> Archive Finished
            </button>
            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Connected
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            QUICK ADD BAR
        ---------------------------------------------------- */}
        <form onSubmit={handleQuickAdd} className="flex flex-wrap gap-2.5 items-end bg-indigo-50/50 dark:bg-indigo-950/10 p-3.5 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Part Name / Description</label>
            <input 
              type="text"
              required
              placeholder="e.g. Brake Pads, Custom Bracket..."
              value={newPartName}
              onChange={(e) => setNewPartName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 dark:focus:border-indigo-500 outline-none rounded-xl text-xs font-bold dark:text-white"
            />
          </div>

          <div className="w-20 space-y-1">
            <label className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Qty</label>
            <input 
              type="number"
              min="1"
              required
              value={newQuantity}
              onChange={(e) => setNewQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 outline-none rounded-xl text-xs font-bold text-center dark:text-white"
            />
          </div>

          <div className="w-28 space-y-1">
            <label className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Urgency</label>
            <select
              value={newUrgency}
              onChange={(e) => setNewUrgency(e.target.value as any)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 outline-none rounded-xl text-xs font-bold dark:text-white cursor-pointer"
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="w-56 space-y-1">
            <label className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Link Job</label>
            <select
              value={newJobId}
              onChange={(e) => setNewJobId(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 outline-none rounded-xl text-xs font-bold dark:text-white cursor-pointer"
            >
              <option value="none">No Job Linked</option>
              {jobsList.map(j => (
                <option key={j.id} value={j.id}>
                  {j.jobNumber ? `#${j.jobNumber} - ${j.title}` : j.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Notes / PO Memo</label>
            <input 
              type="text"
              placeholder="e.g. Needs ASAP, PO #832..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 outline-none rounded-xl text-xs font-bold dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingQuickAdd || !newPartName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md active:scale-95 disabled:opacity-50 shrink-0 h-[34px]"
          >
            <Plus className="w-4 h-4" /> Add Part
          </button>
        </form>

        {/* Filters and Inputs Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full border-t border-zinc-100 dark:border-zinc-800 pt-3">
          
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search parts, jobs, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            />
          </div>

          {/* Status Filter */}
          <div className="relative w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            >
              <option value="active">Active Requests (Pending/Ordered)</option>
              <option value="pending">Pending Only</option>
              <option value="ordered">Ordered Only</option>
              <option value="received">Received Only</option>
              <option value="completed">Completed / Finished</option>
              <option value="all">All Statuses</option>
            </select>
          </div>

          {/* Urgency Filter */}
          <div className="relative w-full sm:w-36">
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            >
              <option value="all">All Urgency</option>
              <option value="urgent">Urgent Only</option>
              <option value="normal">Normal Only</option>
            </select>
          </div>

          {/* Archive Status Toggle */}
          <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-3">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold border transition",
                showArchived 
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/25" 
                  : "bg-zinc-150 dark:bg-zinc-800 text-zinc-500 border-transparent hover:bg-zinc-200"
              )}
            >
              {showArchived ? "Showing Archived" : "Show Archived"}
            </button>
          </div>

          {/* Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-auto select-none">
            <span>Grid Row Hints:</span>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/20" /> Pending</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/10 dark:bg-blue-950/20 border border-blue-500/20" /> Ordered</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20" /> Received / Delivered</div>
          </div>
        </div>
      </div>

      {/* Mobile Swipe Hint */}
      <div className="md:hidden flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl mb-3 font-bold text-[10px] uppercase tracking-wider animate-pulse border border-indigo-500/15">
        <span>↔ Swipe table horizontally to view all columns</span>
      </div>

      {/* ----------------------------------------------------
          SPREADSHEET GRID VIEW CONTAINER
      ---------------------------------------------------- */}
      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl shadow-sm relative no-scrollbar min-h-[500px]">
        <table className="w-full text-left border-collapse table-fixed">
          
          {/* Header Row */}
          <thead>
            <tr className="bg-zinc-150 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-extrabold uppercase select-none sticky top-0 z-40">
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.partName }}>
                Part / Description {renderResizeHandle('partName')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.quantity }}>
                Qty {renderResizeHandle('quantity')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.urgency }}>
                Urgency {renderResizeHandle('urgency')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.job }}>
                Job Assignment {renderResizeHandle('job')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.status }}>
                Request Status {renderResizeHandle('status')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.requestedBy }}>
                Requested By {renderResizeHandle('requestedBy')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.createdAt }}>
                Date Requested {renderResizeHandle('createdAt')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.notes }}>
                Notes / PO Memo {renderResizeHandle('notes')}
              </th>
              <th className="p-2.5 relative align-middle text-center" style={{ width: colWidths.actions }}>
                Actions {renderResizeHandle('actions')}
              </th>
            </tr>
          </thead>

          {/* Grid Rows */}
          <tbody>
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-16 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                  No parts requests match the selected configurations.
                </td>
              </tr>
            ) : (
              filteredRequests.map((request) => {
                let rowHighlightClass = 'bg-white dark:bg-zinc-950';

                // Status highlighting
                if (request.status === 'pending') {
                  rowHighlightClass = 'bg-amber-500/[0.03] dark:bg-amber-500/[0.015] hover:bg-amber-500/[0.07] dark:hover:bg-amber-500/[0.04]';
                } else if (request.status === 'ordered') {
                  rowHighlightClass = 'bg-blue-500/[0.03] dark:bg-blue-500/[0.015] hover:bg-blue-500/[0.07] dark:hover:bg-blue-500/[0.04]';
                } else if (request.status === 'received' || request.status === 'fulfilled' || request.status === 'delivered') {
                  rowHighlightClass = 'bg-emerald-500/[0.03] dark:bg-emerald-500/[0.015] hover:bg-emerald-500/[0.07] dark:hover:bg-emerald-500/[0.04]';
                } else {
                  rowHighlightClass = 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40';
                }

                // Row urgent highlight override
                if (request.urgency === 'urgent') {
                  rowHighlightClass = 'bg-rose-500/[0.05] dark:bg-rose-500/[0.025] hover:bg-rose-500/[0.09] dark:hover:bg-rose-500/[0.05] border-l-2 border-rose-500';
                }

                const currentJobId = request.jobId || 'none';

                return (
                  <tr 
                    key={request.id} 
                    className={cn(
                      "border-b border-zinc-200 dark:border-zinc-800/80 transition-colors font-medium text-zinc-800 dark:text-zinc-300",
                      rowHighlightClass,
                      isUpdating === request.id && "opacity-60 pointer-events-none"
                    )}
                  >
                    
                    {/* 1. Part Description / Name */}
                    <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 align-middle truncate font-bold text-zinc-950 dark:text-white">
                      {editingNameId === request.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingNameText}
                          onChange={(e) => setEditingNameText(e.target.value)}
                          onBlur={() => handleNameSave(request.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleNameSave(request.id);
                            if (e.key === 'Escape') setEditingNameId(null);
                          }}
                          className="w-full px-1.5 py-0.5 bg-white dark:bg-zinc-800 border border-indigo-500 outline-none rounded text-xs text-zinc-950 dark:text-white"
                        />
                      ) : (
                        <div 
                          onClick={() => {
                            if (canManage) {
                              setEditingNameId(request.id);
                              setEditingNameText(request.partName);
                            }
                          }}
                          className="w-full h-full truncate cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 p-1 rounded"
                          title="Click to edit name"
                        >
                          {request.partName}
                        </div>
                      )}
                    </td>

                    {/* 2. Quantity */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center font-mono">
                      <div className="flex items-center justify-center gap-1.5 select-none">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(request.id, request.quantity || 1, -1)}
                            className="w-5 h-5 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[10px] font-bold rounded-lg border border-zinc-300 dark:border-zinc-700"
                          >
                            -
                          </button>
                        )}
                        <span className="font-extrabold text-xs dark:text-white w-5">{request.quantity || 1}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(request.id, request.quantity || 1, 1)}
                            className="w-5 h-5 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[10px] font-bold rounded-lg border border-zinc-300 dark:border-zinc-700"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 3. Urgency */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => handleUrgencyToggle(request)}
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                          getUrgencyBadge(request.urgency),
                          canManage && "cursor-pointer active:scale-95"
                        )}
                      >
                        {request.urgency}
                      </button>
                    </td>

                    {/* 4. Associated Job Linkage */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <div className="flex items-center gap-1 w-full">
                        <div className="flex-1 min-w-0 h-7">
                          <ExcelSearchableSelect
                            options={[
                              { id: 'none', title: 'No Job Linked' },
                              ...jobsList.filter(j => j.status !== 'Closed')
                            ]}
                            value={currentJobId}
                            onChange={(val) => handleJobChange(request.id, val)}
                            getLabel={(j) => j.id === 'none' ? j.title : (j.jobNumber ? `#${j.jobNumber} - ${j.title}` : j.title)}
                            getValue={(j) => j.id}
                            placeholder="Link Job..."
                            disabled={!canManage}
                          />
                        </div>
                        {request.jobId && (
                          <button
                            onClick={() => navigate(`/business/${tenantId}/job/${request.jobId}`)}
                            className="p-1 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                            title="View Job Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 5. Request Status */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <select
                        value={request.status}
                        onChange={(e) => handleStatusChange(request.id, e.target.value)}
                        disabled={!canManage}
                        className={cn(
                          "w-full px-2 py-1 bg-transparent border-none outline-none font-extrabold text-[10px] tracking-wide rounded cursor-pointer truncate",
                          getStatusColor(request.status),
                          !canManage && "cursor-not-allowed opacity-80"
                        )}
                      >
                        <option value="pending" className="bg-white dark:bg-zinc-900 text-amber-600 font-bold">PENDING</option>
                        <option value="ordered" className="bg-white dark:bg-zinc-900 text-blue-600 font-bold">ORDERED</option>
                        <option value="received" className="bg-white dark:bg-zinc-900 text-emerald-600 font-bold">RECEIVED</option>
                        <option value="delivered" className="bg-white dark:bg-zinc-900 text-emerald-700 font-bold">WITH VEHICLE</option>
                        <option value="cancelled" className="bg-white dark:bg-zinc-900 text-rose-600 font-bold">CANCELLED</option>
                      </select>
                    </td>

                    {/* 6. Requested By */}
                    <td className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 align-middle truncate text-zinc-600 dark:text-zinc-400 font-bold">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <StaffLink name={request.requestedBy} tenantId={tenantId} />
                      </div>
                    </td>

                    {/* 7. Date Requested */}
                    <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 align-middle font-mono text-[10px] text-center text-zinc-550 dark:text-zinc-500">
                      {(() => {
                        const date = request.createdAt?.toDate ? request.createdAt.toDate() : request.createdAt ? new Date(request.createdAt) : null;
                        return date ? date.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' }) : '--';
                      })()}
                    </td>

                    {/* 8. Notes / PO Memo */}
                    <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 align-middle truncate text-zinc-650 dark:text-zinc-400">
                      {editingNotesId === request.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingNotesText}
                          onChange={(e) => setEditingNotesText(e.target.value)}
                          onBlur={() => handleNotesSave(request.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleNotesSave(request.id);
                            if (e.key === 'Escape') setEditingNotesId(null);
                          }}
                          className="w-full px-1.5 py-0.5 bg-white dark:bg-zinc-800 border border-indigo-500 outline-none rounded text-xs text-zinc-950 dark:text-white"
                        />
                      ) : (
                        <div 
                          onClick={() => {
                            if (canManage) {
                              setEditingNotesId(request.id);
                              setEditingNotesText(request.notes || '');
                            }
                          }}
                          className="w-full h-full truncate italic cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 p-1 rounded min-h-[1.5rem]"
                          title="Click to edit notes"
                        >
                          {request.notes || <span className="text-zinc-400 dark:text-zinc-600 not-italic">--</span>}
                        </div>
                      )}
                    </td>

                    {/* 9. Actions */}
                    <td className="p-1 align-middle text-center">
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => handleDeleteRequest(request.id, request.partName)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded transition active:scale-95 disabled:opacity-50"
                        title="Permanently delete request"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// EXCEL SEARCHABLE SELECT COMPONENT
// ----------------------------------------------------
interface ExcelSearchableSelectProps<T> {
  options: T[];
  value: string;
  onChange: (value: string) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
}

function ExcelSearchableSelect<T>({
  options,
  value,
  onChange,
  getLabel,
  getValue,
  placeholder = 'Select...',
  disabled = false
}: ExcelSearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => getValue(o) === value);
  const filteredOptions = options.filter(o => {
    const label = getLabel(o);
    if (label && label.toLowerCase().includes(search.toLowerCase())) return true;
    
    if (o && typeof o === 'object') {
      const obj = o as any;
      const searchStr = search.toLowerCase();
      
      if (obj.customerName && String(obj.customerName).toLowerCase().includes(searchStr)) return true;
      if (obj.vin && String(obj.vin).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleVin && String(obj.vehicleVin).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleName && String(obj.vehicleName).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleMake && String(obj.vehicleMake).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleModel && String(obj.vehicleModel).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleYear && String(obj.vehicleYear).toLowerCase().includes(searchStr)) return true;
      if (obj.jobNumber && String(obj.jobNumber).toLowerCase().includes(searchStr)) return true;
      if (obj.title && String(obj.title).toLowerCase().includes(searchStr)) return true;
    }
    
    return false;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        onChange(getValue(filteredOptions[0]));
      }
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full font-sans select-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearch('');
          }
        }}
        className={cn(
          "w-full h-full text-left px-2 py-1 text-xs font-bold bg-transparent border-none outline-none focus:bg-zinc-150 dark:focus:bg-zinc-800/60 rounded flex items-center justify-between cursor-pointer group",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className="truncate pr-2 dark:text-zinc-350">
          {selectedOption ? (getLabel(selectedOption) || '') : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[240px] max-w-[320px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[150] overflow-hidden">
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by Job, Cust, Veh, VIN..."
              className="w-full bg-transparent border-none outline-none text-xs dark:text-white placeholder-zinc-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const optVal = getValue(option);
                const isSelected = optVal === value;
                return (
                  <button
                    key={optVal}
                    type="button"
                    onClick={() => {
                      onChange(optVal);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-xs font-semibold rounded-lg transition-colors",
                      isSelected 
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400" 
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850"
                    )}
                  >
                    <div className="flex flex-col min-w-0 text-left w-full">
                      <span className="truncate text-xs font-bold leading-tight">{getLabel(option) || ''}</span>
                      {option && typeof option === 'object' && ('customerName' in option || 'vehicleName' in option || 'vin' in option) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 max-w-full leading-none">
                          {(option as any).customerName && (
                            <span className="truncate max-w-[130px] bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded text-[8px] font-bold">Cust: {(option as any).customerName}</span>
                          )}
                          {((option as any).vehicleName || (option as any).vehicleMake) && (
                            <span className="truncate max-w-[130px]">Veh: {((option as any).vehicleName || `${(option as any).vehicleYear || ''} ${(option as any).vehicleMake || ''} ${(option as any).vehicleModel || ''}`).trim()}</span>
                          )}
                          {(option as any).vin && (
                            <span className="shrink-0 font-mono text-[8px] uppercase">VIN: {String((option as any).vin).slice(-8)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-[10px] text-zinc-400 italic">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
