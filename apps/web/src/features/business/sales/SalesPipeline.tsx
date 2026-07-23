import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { 
  User, Calendar, X, Tag, Filter, Search, ArrowUpDown,
  ChevronLeft, ChevronRight, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface SalesPipelineProps {
  tenantId: string;
  prospects: any[];
  staffList: any[];
  onUpdate: () => void;
  onOpenAddProspect?: () => void;
}

const STAGES = [
  { id: 'lead', label: 'Lead In', color: 'border-zinc-400 text-zinc-400 bg-zinc-400/5 hover:bg-zinc-400/10' },
  { id: 'contacted', label: 'Contacted', color: 'border-sky-500 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10' },
  { id: 'meeting', label: 'Meeting Scheduled', color: 'border-indigo-500 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10' },
  { id: 'proposal', label: 'Proposal Sent', color: 'border-yellow-500 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/10' },
  { id: 'negotiation', label: 'Negotiation', color: 'border-orange-500 text-orange-400 bg-orange-500/5 hover:bg-orange-500/10' },
  { id: 'won', label: 'Won', color: 'border-emerald-500 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10' },
  { id: 'lost', label: 'Lost', color: 'border-rose-500 text-rose-450 bg-rose-500/5 hover:bg-rose-500/10' },
  { id: 'existing', label: 'Existing Accounts', color: 'border-purple-500 text-purple-400 bg-purple-500/5 hover:bg-purple-500/10' }
] as const;

type StageId = typeof STAGES[number]['id'];

export function SalesPipeline({ tenantId, prospects, staffList = [], onUpdate }: SalesPipelineProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'value_desc' | 'value_asc' | 'newest' | 'oldest'>('name_asc');

  // Extract unique lead sources
  const uniqueSources = Array.from(new Set(prospects.map(p => p.source || 'Website'))).filter(Boolean);

  // Filter prospects by search query, source, and rep
  const filteredProspects = prospects.filter(p => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      (p.name || '').toLowerCase().includes(query) ||
      (p.contactPerson || '').toLowerCase().includes(query) ||
      (p.email || '').toLowerCase().includes(query) ||
      (p.phone || '').toLowerCase().includes(query) ||
      (p.notes || '').toLowerCase().includes(query);

    const matchesSource = sourceFilter ? (p.source || 'Website') === sourceFilter : true;
    const matchesRep = repFilter ? p.assignedTo === repFilter : true;

    return matchesSearch && matchesSource && matchesRep;
  });

  // Sort filtered prospects
  const sortedProspects = [...filteredProspects].sort((a, b) => {
    if (sortBy === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'name_desc') {
      return (b.name || '').localeCompare(a.name || '');
    }
    if (sortBy === 'value_desc') {
      return (b.value || 0) - (a.value || 0);
    }
    if (sortBy === 'value_asc') {
      return (a.value || 0) - (b.value || 0);
    }
    if (sortBy === 'newest') {
      const aTime = a.createdAt?.seconds || a.createdAt || 0;
      const bTime = b.createdAt?.seconds || b.createdAt || 0;
      return bTime - aTime;
    }
    if (sortBy === 'oldest') {
      const aTime = a.createdAt?.seconds || a.createdAt || 0;
      const bTime = b.createdAt?.seconds || b.createdAt || 0;
      return aTime - bTime;
    }
    return 0;
  });

  // Group prospects by stage
  const prospectsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = sortedProspects.filter(p => p.status === stage.id);
    return acc;
  }, {} as Record<StageId, any[]>);

  // Update prospect status in Firestore directly on master record
  const updateProspectStatus = async (prospectId: string, newStatus: StageId) => {
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
        const targetVirtual = prospects.find(p => p.id === prospectId);

        // 1. Create deal in active sales_prospects collection
        await addDoc(collection(db, `businesses/${tenantId}/sales_prospects`), {
          name: targetVirtual?.name || 'Customer Account',
          contactPerson: targetVirtual?.contactPerson || '',
          email: targetVirtual?.email || '',
          phone: targetVirtual?.phone || '',
          value: targetVirtual?.value || 0,
          status: newStatus,
          notes: targetVirtual?.notes || '',
          assignedTo: targetVirtual?.assignedTo || null,
          assignedToName: targetVirtual?.assignedToName || 'Unassigned',
          source: targetVirtual?.source || 'QuickBooks Sync',
          customerId: rawId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // 2. Also update master customer document
        try {
          const nativeRef = doc(db, `businesses/${tenantId}/customers`, rawId);
          const nativeSnap = await getDoc(nativeRef);
          if (nativeSnap.exists()) {
            await updateDoc(nativeRef, { pipelineStage: newStatus, updatedAt: serverTimestamp() });
          } else {
            const qbRef = doc(db, `businesses/${tenantId}/qb_customers`, rawId);
            const qbSnap = await getDoc(qbRef);
            if (qbSnap.exists()) {
              await updateDoc(qbRef, { pipelineStage: newStatus, updatedAt: serverTimestamp() });
            }
          }
        } catch (e) {
          console.warn('Customer doc update:', e);
        }
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId), updates);
      }

      toast.success(`Updated stage for client to ${newStatus.toUpperCase()}`);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update stage');
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, prospectId: string) => {
    e.dataTransfer.setData('text/plain', prospectId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStage: StageId) => {
    e.preventDefault();
    const prospectId = e.dataTransfer.getData('text/plain');
    if (prospectId) {
      await updateProspectStatus(prospectId, targetStage);
    }
  };

  // Calculate days in pipeline
  const getDaysInPipeline = (createdAt: any) => {
    if (!createdAt) return '0 days';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffTime = Math.abs(new Date().getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
  };

  return (
    <div className="space-y-4">
      {/* Lead Search & Filter Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        
        {/* Search Bar Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search CRM deals by name, contact, phone, email, or notes..."
            className="w-full pl-9 pr-9 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-zinc-400">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filter:</span>
          </div>

          {/* Lead Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer [&>option]:bg-white [&>option]:text-zinc-900 dark:[&>option]:bg-zinc-900 dark:[&>option]:text-white"
          >
            <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">All Lead Sources ({prospects.length})</option>
            {uniqueSources.map(source => {
              const count = prospects.filter(p => (p.source || 'Website') === source).length;
              return (
                <option key={source} value={source} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                  {source} ({count})
                </option>
              );
            })}
          </select>

          {/* Sales Rep Filter */}
          {staffList.length > 0 && (
            <select
              value={repFilter}
              onChange={e => setRepFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer [&>option]:bg-white [&>option]:text-zinc-900 dark:[&>option]:bg-zinc-900 dark:[&>option]:text-white"
            >
              <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">All Assigned Reps</option>
              {staffList.map((s: any) => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">{`${s.firstName} ${s.lastName}`}</option>
              ))}
            </select>
          )}

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer py-1 text-zinc-900 dark:text-white [&>option]:bg-white [&>option]:text-zinc-900 dark:[&>option]:bg-zinc-900 dark:[&>option]:text-white"
            >
              <option value="name_asc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Sort: Name (A - Z)</option>
              <option value="name_desc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Sort: Name (Z - A)</option>
              <option value="value_desc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Sort: Value ($ High → Low)</option>
              <option value="value_asc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Sort: Value ($ Low → High)</option>
              <option value="newest" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Sort: Newest First</option>
              <option value="oldest" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Sort: Oldest First</option>
            </select>
          </div>

          {(searchQuery || sourceFilter || repFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setSourceFilter(''); setRepFilter(''); }}
              className="px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
            >
              Reset Filters
            </button>
          )}

 
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 scrollbar-thin select-none">
        {(() => {
          const isFiltering = !!(searchQuery.trim() || sourceFilter || repFilter);
          const activeStages = STAGES.filter(stage => {
            const count = (prospectsByStage[stage.id] || []).length;
            return !isFiltering || count > 0;
          });

          if (isFiltering && activeStages.length === 0) {
            return (
              <div className="w-full py-16 text-center bg-zinc-100/50 dark:bg-zinc-900/30 rounded-3xl border border-zinc-200 dark:border-zinc-800">
                <Search className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">No matching prospects found</p>
                <p className="text-xs text-zinc-400 mt-1">Try searching a different name, email, phone, or clear your filters.</p>
                <button
                  onClick={() => { setSearchQuery(''); setSourceFilter(''); setRepFilter(''); }}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  Clear Filters
                </button>
              </div>
            );
          }

          return activeStages.map((stage) => {
            const stageProspects = prospectsByStage[stage.id] || [];
            const totalValue = stageProspects.reduce((sum, p) => sum + (p.value || 0), 0);

            return (
              <div 
                key={stage.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
                className="flex-1 min-w-[280px] max-w-[320px] flex flex-col bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shrink-0 transition-all"
              >
            {/* Stage Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 border text-[10px] font-black uppercase tracking-wider rounded-md ${stage.color}`}>
                  {stage.label}
                </span>
                <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500">
                  {stageProspects.length}
                </span>
              </div>
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-400 font-mono">
                ${totalValue.toLocaleString()}
              </span>
            </div>

            {/* Stage Cards Container */}
            <div className="flex-1 space-y-3 min-h-[50vh] overflow-y-auto no-scrollbar py-1">
              {stageProspects.length > 0 ? (
                stageProspects.map((prospect) => {
                  const daysInPipeline = getDaysInPipeline(prospect.createdAt);

                  return (
                    <div 
                      key={prospect.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, prospect.id)}
                      onClick={() => navigate(`/business/${tenantId}/prospect/${prospect.id}`)}
                      className={`
                        bg-white dark:bg-zinc-900 border rounded-2xl p-4 shadow-sm relative group cursor-pointer active:cursor-grabbing transition-all hover:scale-[1.01] hover:shadow-md hover:border-indigo-500/40
                        ${stage.id === 'won' ? 'border-emerald-500/20 hover:border-emerald-500/45 dark:bg-emerald-950/5' : ''}
                        ${stage.id === 'lost' ? 'border-rose-500/20 hover:border-rose-500/40 dark:bg-rose-950/5' : 'border-zinc-200 dark:border-zinc-800'}
                      `}
                    >
                      {/* Ribbon Indicators */}
                      {stage.id === 'won' && (
                        <div className="absolute top-3 right-3 p-1 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-md border border-emerald-500/20">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                      )}
                      {stage.id === 'lost' && (
                        <div className="absolute top-3 right-3 p-1 bg-rose-500/10 dark:bg-rose-500/20 rounded-md border border-rose-500/20">
                          <X className="w-3.5 h-3.5 text-rose-500" />
                        </div>
                      )}

                      {/* Card Content */}
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight pr-6 mb-1 truncate" title={prospect.name}>
                        {prospect.name}
                      </h4>

                      {prospect.contactPerson && (
                        <p className="text-[11px] font-medium text-zinc-450 dark:text-zinc-500 mb-3 truncate">
                          {prospect.contactPerson}
                        </p>
                      )}

                      {/* Tag list */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[9px] font-bold text-zinc-500 rounded-md uppercase">
                          <Tag className="w-2.5 h-2.5" />
                          {prospect.source}
                        </span>
                        {prospect.assignedToName && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[9px] font-bold text-zinc-500 rounded-md truncate max-w-[140px]">
                            <User className="w-2.5 h-2.5 text-indigo-400" />
                            {prospect.assignedToName.split(' ')[0]}
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
                        <span className="text-xs font-black text-zinc-700 dark:text-zinc-300 font-mono">
                          ${(prospect.value || 0).toLocaleString()}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          {/* Navigation Controls for Mobile / Non-drag support */}
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {stage.id !== 'lead' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = STAGES.findIndex(s => s.id === stage.id);
                                  if (idx > 0) updateProspectStatus(prospect.id, STAGES[idx - 1].id);
                                }}
                                className="p-1 text-zinc-450 hover:text-zinc-800 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {stage.id !== 'lost' && stage.id !== 'won' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = STAGES.findIndex(s => s.id === stage.id);
                                  if (idx < STAGES.length - 1) updateProspectStatus(prospect.id, STAGES[idx + 1].id);
                                }}
                                className="p-1 text-zinc-450 hover:text-zinc-800 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3" />
                            {daysInPipeline}
                          </span>
                        </div>
                      </div>

                    </div>
                  );
                })
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4 text-center text-zinc-400 select-none bg-zinc-50/20 dark:bg-zinc-950/5">
                  <AlertCircle className="w-5 h-5 text-zinc-350 mb-1.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Empty Stage</p>
                </div>
              )}
            </div>
          </div>
        );
      });
    })()}
    </div>
    </div>
  );
}
