import { useState } from 'react';
import { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { useAuthStore } from '../../../lib/auth/store';
import { 
  Users, Search, Mail, Phone, ChevronRight, X, Edit2, Trash2, 
  Calendar, User, Info, Tag, MessageSquare, AlertCircle, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface SalesProspectsProps {
  tenantId: string;
  prospects: any[];
  staffList: any[];
  activities: any[];
  onUpdate: () => void;
  onActivityLogged: () => void;
}

const STAGES = {
  lead: { label: 'Lead In', class: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300' },
  contacted: { label: 'Contacted', class: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-350' },
  meeting: { label: 'Meeting Scheduled', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-350' },
  proposal: { label: 'Proposal Sent', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-350' },
  negotiation: { label: 'Negotiation', class: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-350' },
  won: { label: 'Won', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-350' },
  lost: { label: 'Lost', class: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-350' }
};

export function SalesProspects({ 
  tenantId, prospects, staffList, activities, onUpdate, onActivityLogged 
}: SalesProspectsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [repFilter, setRepFilter] = useState('');
  
  // Selected prospect drawer state
  const [selectedProspect, setSelectedProspect] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  // New Activity Log Form State inside drawer
  const [newActivity, setNewActivity] = useState({
    type: 'call',
    title: '',
    description: '',
    outcome: ''
  });
  const [loggingActivity, setLoggingActivity] = useState(false);

  const { user } = useAuthStore();

  // Filter prospects
  const filteredProspects = prospects.filter(p => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = 
      (p.name || '').toLowerCase().includes(search) ||
      (p.contactPerson || '').toLowerCase().includes(search) ||
      (p.email || '').toLowerCase().includes(search) ||
      (p.phone || '').toLowerCase().includes(search) ||
      (p.notes || '').toLowerCase().includes(search);
    
    const matchesStatus = statusFilter ? p.status === statusFilter : true;
    const matchesRep = repFilter ? p.assignedTo === repFilter : true;

    return matchesSearch && matchesStatus && matchesRep;
  });

  // Open prospect details drawer
  const handleOpenDrawer = (prospect: any) => {
    setSelectedProspect(prospect);
    setEditForm({ ...prospect });
    setIsEditing(false);
    setNewActivity({ type: 'call', title: '', description: '', outcome: '' });
  };

  // Save edits to prospect
  const handleSaveProspectEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedRep = staffList.find(s => s.id === editForm.assignedTo);
      const repName = selectedRep ? `${selectedRep.firstName} ${selectedRep.lastName}` : 'Unassigned';

      const updates = {
        name: editForm.name,
        contactPerson: editForm.contactPerson || '',
        email: editForm.email || '',
        phone: editForm.phone || '',
        value: Number(editForm.value) || 0,
        status: editForm.status,
        notes: editForm.notes || '',
        assignedTo: editForm.assignedTo || null,
        assignedToName: repName,
        source: editForm.source,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, `businesses/${tenantId}/sales_prospects`, editForm.id), updates);
      toast.success('Prospect details updated!');
      
      // Update local state
      setSelectedProspect({ ...selectedProspect, ...updates });
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save changes');
    }
  };

  // Delete prospect
  const handleDeleteProspect = async (prospectId: string) => {
    if (!confirm('Are you sure you want to delete this prospect? This cannot be undone.')) return;

    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId));
      toast.success('Prospect deleted');
      setSelectedProspect(null);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete prospect');
    }
  };

  // Log activity inside drawer
  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivity.title.trim()) return;

    setLoggingActivity(true);
    try {
      const repName = user?.displayName || user?.email || 'System';

      await addDoc(collection(db, `businesses/${tenantId}/sales_activities`), {
        prospectId: selectedProspect.id,
        prospectName: selectedProspect.name,
        type: newActivity.type,
        title: newActivity.title.trim(),
        description: newActivity.description.trim(),
        outcome: newActivity.outcome.trim(),
        date: new Date().toISOString(),
        createdBy: user?.uid || null,
        createdByName: repName,
        createdAt: serverTimestamp()
      });

      toast.success('Activity logged successfully');
      setNewActivity({ type: 'call', title: '', description: '', outcome: '' });
      onActivityLogged();
    } catch (err) {
      console.error(err);
      toast.error('Failed to log activity');
    } finally {
      setLoggingActivity(false);
    }
  };

  // Filter activities for selected prospect
  const prospectActivities = activities.filter(act => act.prospectId === selectedProspect?.id);

  return (
    <div className="flex h-[calc(100vh-270px)] relative overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/20 rounded-3xl border border-zinc-200 dark:border-zinc-800">
      
      {/* Directory Side (List & Filters) */}
      <div className="flex-1 flex flex-col min-w-0 h-full p-4 overflow-y-auto no-scrollbar">
        {/* Filter controls */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm mb-4 shrink-0 w-full">
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search prospects directory..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            >
              <option value="">All Stages</option>
              {Object.entries(STAGES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            {/* Rep Filter */}
            <select
              value={repFilter}
              onChange={e => setRepFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            >
              <option value="">All Representatives</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{`${s.firstName} ${s.lastName}`}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Directory Listing Grid */}
        <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/20">
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Prospect Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Contact Info</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Stage</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Est. Value</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Assigned Rep</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Source</th>
                  <th className="px-4 py-4 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/85">
                {filteredProspects.length > 0 ? (
                  filteredProspects.map((p) => {
                    const stageConfig = STAGES[p.status as keyof typeof STAGES] || { label: p.status, class: 'bg-zinc-150 text-zinc-700' };

                    return (
                      <tr 
                        key={p.id}
                        onClick={() => handleOpenDrawer(p)}
                        className={`hover:bg-zinc-50/40 dark:hover:bg-zinc-850/20 cursor-pointer transition-colors group ${
                          selectedProspect?.id === p.id ? 'bg-indigo-500/[0.03] dark:bg-indigo-500/[0.02]' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                              {p.name}
                            </span>
                            {p.contactPerson && (
                              <span className="text-xs text-zinc-450 dark:text-zinc-500">
                                {p.contactPerson}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                            {p.email && (
                              <span className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-zinc-450" />
                                {p.email}
                              </span>
                            )}
                            {p.phone && (
                              <span className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-zinc-450" />
                                {p.phone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${stageConfig.class}`}>
                            {stageConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-sm text-zinc-900 dark:text-white font-mono">
                            ${(p.value || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {p.assignedToName ? (
                            <span className="text-xs text-zinc-750 dark:text-zinc-350 font-semibold flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-indigo-400" />
                              {p.assignedToName}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 rounded-md uppercase">
                            <Tag className="w-3 h-3 text-zinc-400" />
                            {p.source}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-450 dark:text-zinc-500 bg-zinc-50/10 dark:bg-zinc-950/5">
                      <AlertCircle className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                      <p className="text-sm font-bold uppercase tracking-wider">No Prospects Found</p>
                      <p className="text-xs text-zinc-400">Try adjusting your filters or search keywords.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Right Drawer (Prospect Details & Logger) */}
      <AnimatePresence>
        {selectedProspect && (
          <>
            {/* Backdrop overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProspect(null)}
              className="absolute inset-0 bg-black z-10 lg:hidden"
            />
            
            {/* Drawer Panel */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full lg:w-[480px] h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col z-20 shrink-0 absolute right-0 top-0 bottom-0 overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-950/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Users className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Prospect Details</h3>
                    <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-mono">{selectedProspect.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-2 rounded-xl border transition-all ${
                      isEditing 
                        ? 'bg-indigo-600 text-white border-indigo-650' 
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-white'
                    }`}
                    title="Edit Prospect"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteProspect(selectedProspect.id)}
                    className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/10 rounded-xl transition-all"
                    title="Delete Prospect"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setSelectedProspect(null)}
                    className="p-2 text-zinc-450 hover:text-zinc-750 dark:hover:text-white hover:bg-zinc-150 dark:hover:bg-zinc-850 rounded-xl transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
                
                {/* Mode Switch: Edit vs View */}
                {isEditing ? (
                  <form onSubmit={handleSaveProspectEdits} className="space-y-4 bg-zinc-50 dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-850 rounded-2xl">
                    <h4 className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-indigo-500" /> Edit Basic Information</h4>
                    
                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Company/Deal Name</label>
                      <input 
                        type="text" 
                        required
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Contact Person</label>
                        <input 
                          type="text" 
                          value={editForm.contactPerson}
                          onChange={e => setEditForm({ ...editForm, contactPerson: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Estimated Value ($)</label>
                        <input 
                          type="number" 
                          value={editForm.value}
                          onChange={e => setEditForm({ ...editForm, value: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Email</label>
                        <input 
                          type="email" 
                          value={editForm.email}
                          onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Phone</label>
                        <input 
                          type="text" 
                          value={editForm.phone}
                          onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-455 dark:text-zinc-500 uppercase tracking-wider mb-1">Stage</label>
                        <select 
                          value={editForm.status}
                          onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        >
                          <option value="lead">Lead In</option>
                          <option value="contacted">Contacted</option>
                          <option value="meeting">Meeting Scheduled</option>
                          <option value="proposal">Proposal Sent</option>
                          <option value="negotiation">Negotiation</option>
                          <option value="won">Won (Closed)</option>
                          <option value="lost">Lost (Closed)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-455 dark:text-zinc-500 uppercase tracking-wider mb-1">Lead Source</label>
                        <select 
                          value={editForm.source}
                          onChange={e => setEditForm({ ...editForm, source: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        >
                          <option value="Website">Website</option>
                          <option value="Referral">Referral</option>
                          <option value="Cold Call">Cold Call</option>
                          <option value="QuickBooks">QuickBooks Sync</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-455 dark:text-zinc-500 uppercase tracking-wider mb-1">Assigned Representative</label>
                      <select 
                        value={editForm.assignedTo || ''}
                        onChange={e => setEditForm({ ...editForm, assignedTo: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                      >
                        <option value="">Unassigned</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>{`${s.firstName} ${s.lastName}`}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-455 dark:text-zinc-500 uppercase tracking-wider mb-1">Notes</label>
                      <textarea 
                        rows={2}
                        value={editForm.notes || ''}
                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-855 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button 
                        type="button" 
                        onClick={() => setIsEditing(false)}
                        className="flex-1 py-2 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-[10px] font-extrabold uppercase tracking-wider hover:bg-zinc-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-colors shadow-md shadow-indigo-500/10"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-850/80">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-extrabold text-lg text-zinc-900 dark:text-white leading-tight">{selectedProspect.name}</h4>
                        {selectedProspect.contactPerson && (
                          <p className="text-xs font-semibold text-zinc-500 mt-1">{selectedProspect.contactPerson}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        STAGES[selectedProspect.status as keyof typeof STAGES]?.class || 'bg-zinc-100'
                      }`}>
                        {STAGES[selectedProspect.status as keyof typeof STAGES]?.label || selectedProspect.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-zinc-200/50 dark:border-zinc-800/50 pt-4">
                      <div>
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-0.5">Est. Deal Value</span>
                        <span className="text-base font-black text-indigo-650 dark:text-indigo-400 font-mono">${(selectedProspect.value || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-0.5">Lead Source</span>
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-350">{selectedProspect.source}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-zinc-200/50 dark:border-zinc-800/50 pt-4">
                      <div>
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-0.5">Assigned To</span>
                        <span className="text-xs font-bold text-zinc-750 dark:text-zinc-300 flex items-center gap-1.5 mt-0.5">
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                          {selectedProspect.assignedToName || 'Unassigned'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-0.5">Pipeline Age</span>
                        <span className="text-xs font-bold text-zinc-750 dark:text-zinc-300 flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                          {new Date(selectedProspect.createdAt?.seconds ? selectedProspect.createdAt.seconds * 1000 : selectedProspect.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {selectedProspect.email || selectedProspect.phone ? (
                      <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-4 text-xs space-y-1.5">
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Contact Directory</span>
                        {selectedProspect.email && (
                          <div className="flex items-center gap-2 text-zinc-650 dark:text-zinc-350 font-semibold">
                            <Mail className="w-4 h-4 text-zinc-400" />
                            {selectedProspect.email}
                          </div>
                        )}
                        {selectedProspect.phone && (
                          <div className="flex items-center gap-2 text-zinc-650 dark:text-zinc-350 font-semibold">
                            <Phone className="w-4 h-4 text-zinc-400" />
                            {selectedProspect.phone}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedProspect.notes && (
                      <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-4">
                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Deal Details & Scope</span>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 rounded-xl p-3 font-semibold">{selectedProspect.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Log Activity Form */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6 space-y-4">
                  <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-500" />
                    Log Client Interaction
                  </h4>
                  
                  <form onSubmit={handleLogActivity} className="space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 p-4 border border-zinc-150 dark:border-zinc-850 rounded-2xl">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Interaction Type</label>
                        <select 
                          value={newActivity.type}
                          onChange={e => setNewActivity({ ...newActivity, type: e.target.value })}
                          className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                        >
                          <option value="call">Phone Call</option>
                          <option value="meeting">Meeting</option>
                          <option value="email">Email Sent</option>
                          <option value="demo">Product Demo</option>
                          <option value="proposal">Proposal Sent</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Subject</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Discussed proposal details"
                          value={newActivity.title}
                          onChange={e => setNewActivity({ ...newActivity, title: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Summary & Notes</label>
                      <textarea 
                        rows={2}
                        required
                        placeholder="Log detail comments, feedback, client responses..."
                        value={newActivity.description}
                        onChange={e => setNewActivity({ ...newActivity, description: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Outcome / Next Action</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Schedule demo next Tuesday"
                        value={newActivity.outcome}
                        onChange={e => setNewActivity({ ...newActivity, outcome: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={loggingActivity}
                      className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-colors shadow-md disabled:opacity-50"
                    >
                      {loggingActivity ? 'Saving...' : 'Log Interaction'}
                    </button>
                  </form>
                </div>

                {/* Timeline Section */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6 space-y-4">
                  <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-500" />
                    Interaction History ({prospectActivities.length})
                  </h4>

                  <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-200 dark:before:bg-zinc-800">
                    {prospectActivities.length > 0 ? (
                      prospectActivities.map((act) => (
                        <div key={act.id} className="relative pl-7 group">
                          {/* Dot indicator */}
                          <div className="absolute left-1.5 top-1.5 w-3 h-3 bg-indigo-500 rounded-full border-2 border-white dark:border-zinc-900 shadow-sm transition-transform group-hover:scale-125 shrink-0" />

                          <div className="bg-zinc-50 dark:bg-zinc-950 p-3 border border-zinc-150 dark:border-zinc-850 rounded-xl relative">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="px-2 py-0.5 bg-zinc-200/50 dark:bg-zinc-800 text-[8px] font-black uppercase tracking-wider rounded text-zinc-650 dark:text-zinc-450 shrink-0">
                                {act.type}
                              </span>
                              <span className="text-[9px] text-zinc-400 font-mono">
                                {new Date(act.date).toLocaleDateString()}
                              </span>
                            </div>

                            <p className="font-bold text-xs text-zinc-900 dark:text-white mb-1">
                              {act.title}
                            </p>

                            <p className="text-xs text-zinc-650 dark:text-zinc-400 leading-normal mb-2 font-medium">
                              {act.description}
                            </p>

                            {act.outcome && (
                              <p className="text-[10px] text-indigo-650 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/20 px-2 py-1 rounded border border-indigo-500/10">
                                Outcome: <span className="font-medium text-zinc-700 dark:text-zinc-350">{act.outcome}</span>
                              </p>
                            )}

                            <div className="mt-2 text-[9px] text-zinc-400 font-bold flex items-center gap-1">
                              <User className="w-3 h-3 text-zinc-400" />
                              Logged by {act.createdByName}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-zinc-400 select-none border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/20 dark:bg-zinc-950/5 ml-7">
                        <MessageSquare className="w-5 h-5 text-zinc-300 mx-auto mb-1.5" />
                        <p className="text-[10px] font-bold uppercase tracking-wider">No interactions logged</p>
                        <p className="text-[9px] text-zinc-450 mt-0.5">Log a call, email, or meeting above to begin deal history.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
