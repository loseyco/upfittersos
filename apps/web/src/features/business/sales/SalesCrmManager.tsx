import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { 
  TrendingUp, Users, MessageSquare, BarChart3, Plus, 
  Briefcase, X
} from 'lucide-react';
import { toast } from 'sonner';
import { SalesPipeline } from './SalesPipeline';
import { SalesProspects } from './SalesProspects';
import { SalesActivities } from './SalesActivities';
import { SalesAnalytics } from './SalesAnalytics';

interface SalesCrmManagerProps {
  tenantId: string;
}

export function SalesCrmManager({ tenantId }: SalesCrmManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'prospects' | 'activities' | 'analytics'>('pipeline');
  const [isAddProspectOpen, setIsAddProspectOpen] = useState(false);
  


  // Fetch Prospects
  const { data: prospects = [], refetch: refetchProspects } = useQuery({
    queryKey: ['sales-prospects', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/sales_prospects`),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    }
  });

  // Fetch Activities
  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['sales-activities', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/sales_activities`),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    }
  });

  // Fetch Staff Directory for Assignment
  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && !s.isDeviceAccount);
    }
  });

  // Form State for Quick Lead Add
  const [newProspect, setNewProspect] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    value: '',
    status: 'lead',
    notes: '',
    assignedTo: '',
    source: 'Website'
  });

  const handleAddProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProspect.name.trim()) return;

    try {
      const selectedRep = staffList.find(s => s.id === newProspect.assignedTo);
      const repName = selectedRep ? `${selectedRep.firstName} ${selectedRep.lastName}` : 'Unassigned';

      await addDoc(collection(db, `businesses/${tenantId}/sales_prospects`), {
        name: newProspect.name.trim(),
        contactPerson: newProspect.contactPerson.trim(),
        email: newProspect.email.trim(),
        phone: newProspect.phone.trim(),
        value: Number(newProspect.value) || 0,
        status: newProspect.status,
        notes: newProspect.notes.trim(),
        assignedTo: newProspect.assignedTo || null,
        assignedToName: repName,
        source: newProspect.source,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      toast.success('Prospect added successfully!');
      setIsAddProspectOpen(false);
      
      // Reset form
      setNewProspect({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        value: '',
        status: 'lead',
        notes: '',
        assignedTo: '',
        source: 'Website'
      });

      refetchProspects();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add prospect');
    }
  };

  // Metrics Calculations
  const activeProspects = prospects.filter(p => p.status !== 'won' && p.status !== 'lost');
  const wonProspects = prospects.filter(p => p.status === 'won');
  const lostProspects = prospects.filter(p => p.status === 'lost');

  const totalPipelineValue = activeProspects.reduce((sum, p) => sum + (p.value || 0), 0);
  const totalWonValue = wonProspects.reduce((sum, p) => sum + (p.value || 0), 0);
  
  const totalDecided = wonProspects.length + lostProspects.length;
  const winRate = totalDecided > 0 ? Math.round((wonProspects.length / totalDecided) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Sales Overview Banner */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent opacity-100 transition-opacity duration-300" />
        
        <div className="flex items-center gap-4 relative">
          <div className="p-3 bg-indigo-500/10 rounded-2xl">
            <TrendingUp className="w-8 h-8 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Sales & CRM Department</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Track prospects, log client interactions, and manage your deals lifecycle.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 relative">
          {/* Quick Metrics */}
          <div className="flex items-center gap-6 px-6 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <div className="text-center">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Active Pipeline</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white">${totalPipelineValue.toLocaleString()}</span>
            </div>
            <div className="w-[1px] h-8 bg-zinc-200 dark:bg-zinc-800" />
            <div className="text-center">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Win Rate</span>
              <span className="text-base font-bold text-emerald-500">{winRate}%</span>
            </div>
            <div className="w-[1px] h-8 bg-zinc-200 dark:bg-zinc-800" />
            <div className="text-center">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Won Deals</span>
              <span className="text-base font-bold text-indigo-500">${totalWonValue.toLocaleString()}</span>
            </div>
          </div>

          <button 
            onClick={() => setIsAddProspectOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Prospect
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSubTab('pipeline')}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-extrabold uppercase tracking-wider transition-all whitespace-nowrap ${
            activeSubTab === 'pipeline' 
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.02]' 
              : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Pipeline Board
        </button>
        <button
          onClick={() => setActiveSubTab('prospects')}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-extrabold uppercase tracking-wider transition-all whitespace-nowrap ${
            activeSubTab === 'prospects' 
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.02]' 
              : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Prospects Directory
        </button>
        <button
          onClick={() => setActiveSubTab('activities')}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-extrabold uppercase tracking-wider transition-all whitespace-nowrap ${
            activeSubTab === 'activities' 
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.02]' 
              : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Meetings & Logs
        </button>
        <button
          onClick={() => setActiveSubTab('analytics')}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-extrabold uppercase tracking-wider transition-all whitespace-nowrap ${
            activeSubTab === 'analytics' 
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.02]' 
              : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Sales Performance
        </button>
      </div>

      {/* Sub-tab Rendering */}
      <div className="mt-4">
        {activeSubTab === 'pipeline' && (
          <SalesPipeline 
            tenantId={tenantId} 
            prospects={prospects} 
            staffList={staffList}
            onUpdate={refetchProspects} 
          />
        )}
        {activeSubTab === 'prospects' && (
          <SalesProspects 
            tenantId={tenantId} 
            prospects={prospects} 
            staffList={staffList} 
            activities={activities}
            onUpdate={refetchProspects} 
            onActivityLogged={refetchActivities}
          />
        )}
        {activeSubTab === 'activities' && (
          <SalesActivities 
            tenantId={tenantId} 
            prospects={prospects} 
            activities={activities} 
            onUpdate={refetchActivities} 
          />
        )}
        {activeSubTab === 'analytics' && (
          <SalesAnalytics 
            prospects={prospects} 
            activities={activities} 
            staffList={staffList}
          />
        )}
      </div>

      {/* Add Lead / Prospect Modal */}
      {isAddProspectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setIsAddProspectOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-500" />
                Add New Prospect
              </h3>
              <button onClick={() => setIsAddProspectOpen(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddProspect} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto no-scrollbar">
              
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Prospect Name / Company Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. City Fleet Contract, ACME Corp"
                  value={newProspect.name}
                  onChange={e => setNewProspect(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Contact Person</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe"
                    value={newProspect.contactPerson}
                    onChange={e => setNewProspect(prev => ({ ...prev, contactPerson: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Estimated Value ($)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-bold">$</span>
                    <input 
                      type="number" 
                      placeholder="5000"
                      value={newProspect.value}
                      onChange={e => setNewProspect(prev => ({ ...prev, value: e.target.value }))}
                      className="w-full pl-8 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Email</label>
                  <input 
                    type="email" 
                    placeholder="john@example.com"
                    value={newProspect.email}
                    onChange={e => setNewProspect(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Phone</label>
                  <input 
                    type="text" 
                    placeholder="555-0199"
                    value={newProspect.phone}
                    onChange={e => setNewProspect(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Pipeline Stage</label>
                  <select 
                    value={newProspect.status}
                    onChange={e => setNewProspect(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  >
                    <option value="lead">1. Lead In</option>
                    <option value="contacted">2. Contacted</option>
                    <option value="meeting">3. Meeting Scheduled</option>
                    <option value="proposal">4. Proposal Sent</option>
                    <option value="negotiation">5. Negotiation</option>
                    <option value="won">6. Won (Closed)</option>
                    <option value="lost">7. Lost (Closed)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Lead Source</label>
                  <select 
                    value={newProspect.source}
                    onChange={e => setNewProspect(prev => ({ ...prev, source: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  >
                    <option value="Website">Website</option>
                    <option value="Referral">Referral</option>
                    <option value="Cold Call">Cold Call</option>
                    <option value="QuickBooks">QuickBooks Sync</option>
                    <option value="Advertisement">Advertisement</option>
                    <option value="Trade Show">Trade Show</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Assigned Representative</label>
                <select 
                  value={newProspect.assignedTo}
                  onChange={e => setNewProspect(prev => ({ ...prev, assignedTo: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                >
                  <option value="">Unassigned</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{`${s.firstName} ${s.lastName}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Initial Notes / Details</label>
                <textarea 
                  rows={3}
                  placeholder="Provide scope details, fleet count, product requests, etc..."
                  value={newProspect.notes}
                  onChange={e => setNewProspect(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddProspectOpen(false)}
                  className="flex-1 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-indigo-500/10"
                >
                  Create Prospect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
