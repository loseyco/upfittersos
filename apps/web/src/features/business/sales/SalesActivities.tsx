import { useState } from 'react';
import { 
  MessageSquare, Search, Calendar, User, Tag, 
  Phone, Users, Mail, ClipboardList, Info
} from 'lucide-react';

interface SalesActivitiesProps {
  tenantId: string;
  prospects: any[];
  activities: any[];
  onUpdate: () => void;
}

const TYPE_CONFIG = {
  call: { label: 'Call', icon: Phone, class: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
  meeting: { label: 'Meeting', icon: Users, iconColor: 'text-indigo-500', class: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
  email: { label: 'Email', icon: Mail, class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  demo: { label: 'Demo', icon: ClipboardList, class: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  proposal: { label: 'Proposal', icon: Tag, class: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  other: { label: 'Other', icon: Info, class: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' }
};

export function SalesActivities({ activities, prospects }: SalesActivitiesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [prospectFilter, setProspectFilter] = useState('');

  // Filter activities
  const filteredActivities = activities.filter(act => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = 
      (act.title || '').toLowerCase().includes(search) ||
      (act.description || '').toLowerCase().includes(search) ||
      (act.createdByName || '').toLowerCase().includes(search) ||
      (act.prospectName || '').toLowerCase().includes(search);

    const matchesType = typeFilter ? act.type === typeFilter : true;
    const matchesProspect = prospectFilter ? act.prospectId === prospectFilter : true;

    return matchesSearch && matchesType && matchesProspect;
  });

  return (
    <div className="space-y-6">
      
      {/* Search & Filter Header */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search activities & logs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Interaction Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
          >
            <option value="">All Interaction Types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Prospect Filter */}
          <select
            value={prospectFilter}
            onChange={e => setProspectFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
          >
            <option value="">All Prospects</option>
            {prospects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Global Timeline Feed */}
      <div className="max-w-2xl mx-auto space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-200 dark:before:bg-zinc-800/80">
        
        {filteredActivities.length > 0 ? (
          filteredActivities.map((act) => {
            const config = TYPE_CONFIG[act.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.other;
            const IconComponent = config.icon;

            return (
              <div key={act.id} className="relative pl-8 group select-none">
                {/* Timeline node icon */}
                <div className={`
                  absolute left-1.5 top-2.5 w-6.5 h-6.5 rounded-full border-2 border-white dark:border-zinc-950 shadow-sm flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 z-10
                  ${config.class}
                `}>
                  <IconComponent className="w-3.5 h-3.5" />
                </div>

                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-sm transition-all hover:border-zinc-350 dark:hover:border-zinc-700/80 hover:shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3 mb-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">
                        {act.prospectName}
                      </span>
                      <span className="text-xs font-black text-zinc-400 font-mono mt-0.5">
                        ID: {act.prospectId.substring(0, 8)}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500 flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      {new Date(act.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight mb-2">
                    {act.title}
                  </h4>

                  <p className="text-xs text-zinc-650 dark:text-zinc-400 leading-relaxed font-medium mb-3">
                    {act.description}
                  </p>

                  {act.outcome && (
                    <div className="text-[11px] text-indigo-650 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-2 rounded-xl border border-indigo-500/10 mb-4">
                      Outcome / Next Step: <span className="font-medium text-zinc-750 dark:text-zinc-300">{act.outcome}</span>
                    </div>
                  )}

                  {/* Foot Log details */}
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-450 dark:text-zinc-550 border-t border-zinc-50 dark:border-zinc-800/50 pt-3">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    Logged by {act.createdByName}
                  </div>
                </div>

              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-12 text-center text-zinc-400 select-none bg-zinc-50/10 dark:bg-zinc-950/5 ml-8">
            <MessageSquare className="w-8 h-8 text-zinc-300 mb-2.5" />
            <p className="text-sm font-bold uppercase tracking-wider">No Activities Found</p>
            <p className="text-xs text-zinc-450 mt-1">Activities logged in your prospects detail views will aggregate here.</p>
          </div>
        )}

      </div>

    </div>
  );
}
