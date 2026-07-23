import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Mail, Phone, ChevronRight, Tag, AlertCircle, User } from 'lucide-react';

interface SalesProspectsProps {
  tenantId: string;
  prospects: any[];
  staffList: any[];
  activities: any[];
  onUpdate: () => void;
  onActivityLogged: () => void;
}

const STAGES = {
  existing: { label: 'Existing Account', class: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-350' },
  lead: { label: 'Lead In', class: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300' },
  contacted: { label: 'Contacted', class: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-350' },
  meeting: { label: 'Meeting Scheduled', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-350' },
  proposal: { label: 'Proposal Sent', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-350' },
  negotiation: { label: 'Negotiation', class: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-350' },
  won: { label: 'Won', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-350' },
  lost: { label: 'Lost', class: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-350' }
};

export function SalesProspects({ 
  tenantId, prospects, staffList }: SalesProspectsProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Extract unique lead sources
  const uniqueSources = Array.from(new Set(prospects.map(p => p.source || 'Website'))).filter(Boolean);

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
    const matchesSource = sourceFilter ? (p.source || 'Website') === sourceFilter : true;

    return matchesSearch && matchesStatus && matchesRep && matchesSource;
  });

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

            {/* Source Filter */}
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            >
              <option value="">All Lead Sources</option>
              {uniqueSources.map(src => (
                <option key={src} value={src}>{src}</option>
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
                        onClick={() => navigate(`/business/${tenantId}/prospect/${p.id}`)}
                        className="hover:bg-zinc-50/40 dark:hover:bg-zinc-850/20 cursor-pointer transition-colors group"
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
    </div>
  );
}
