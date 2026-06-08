import { useMemo } from 'react';
import { 
  BarChart3, DollarSign, Target, TrendingUp, CheckCircle, 
  Award as Trophy, Users, PieChart
} from 'lucide-react';

interface SalesAnalyticsProps {
  prospects: any[];
  activities: any[];
  staffList: any[];
}

export function SalesAnalytics({ prospects }: SalesAnalyticsProps) {
  
  // Calculate key metrics
  const stats = useMemo(() => {
    const active = prospects.filter(p => p.status !== 'won' && p.status !== 'lost');
    const won = prospects.filter(p => p.status === 'won');
    const lost = prospects.filter(p => p.status === 'lost');

    const totalActiveValue = active.reduce((sum, p) => sum + (p.value || 0), 0);
    const totalWonValue = won.reduce((sum, p) => sum + (p.value || 0), 0);
    const totalLostValue = lost.reduce((sum, p) => sum + (p.value || 0), 0);
    
    const decidedCount = won.length + lost.length;
    const winRate = decidedCount > 0 ? Math.round((won.length / decidedCount) * 100) : 0;
    
    const avgDealValue = prospects.length > 0 ? Math.round(prospects.reduce((sum, p) => sum + (p.value || 0), 0) / prospects.length) : 0;

    return {
      activeCount: active.length,
      activeValue: totalActiveValue,
      wonCount: won.length,
      wonValue: totalWonValue,
      lostCount: lost.length,
      lostValue: totalLostValue,
      winRate,
      avgDealValue,
      totalCount: prospects.length
    };
  }, [prospects]);

  // Stage Distribution
  const stageStats = useMemo(() => {
    const STAGE_LABELS = {
      lead: 'Lead In',
      contacted: 'Contacted',
      meeting: 'Meeting Scheduled',
      proposal: 'Proposal Sent',
      negotiation: 'Negotiation',
      won: 'Won (Closed)',
      lost: 'Lost (Closed)'
    };

    const counts = prospects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const values = prospects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + (p.value || 0);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(STAGE_LABELS).map(([key, label]) => ({
      key,
      label,
      count: counts[key] || 0,
      value: values[key] || 0
    }));
  }, [prospects]);

  // Representative Leaderboard
  const repStats = useMemo(() => {
    const repsMap = prospects.reduce((acc, p) => {
      const repName = p.assignedToName || 'Unassigned';
      if (!acc[repName]) {
        acc[repName] = { name: repName, total: 0, won: 0, lost: 0, totalValue: 0, wonValue: 0 };
      }
      
      const rep = acc[repName];
      rep.total += 1;
      rep.totalValue += (p.value || 0);
      
      if (p.status === 'won') {
        rep.won += 1;
        rep.wonValue += (p.value || 0);
      } else if (p.status === 'lost') {
        rep.lost += 1;
      }
      
      return acc;
    }, {} as Record<string, any>);

    return (Object.values(repsMap) as any[])
      .sort((a: any, b: any) => b.wonValue - a.wonValue);
  }, [prospects]);

  // Lead Sources Stats
  const sourceStats = useMemo(() => {
    const sourcesMap = prospects.reduce((acc, p) => {
      const src = p.source || 'Other';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(sourcesMap).map(([name, count]: any) => ({
      name,
      count,
      percentage: prospects.length > 0 ? Math.round((count / prospects.length) * 100) : 0
    })).sort((a: any, b: any) => b.count - a.count);
  }, [prospects]);

  return (
    <div className="space-y-6">
      
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 select-none">
        
        {/* Card 1: Pipeline Value */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <DollarSign className="w-16 h-16 text-indigo-500" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Active Pipeline</span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white leading-tight font-mono">${stats.activeValue.toLocaleString()}</span>
          </div>
          <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase mt-3">Across {stats.activeCount} open proposals</p>
        </div>

        {/* Card 2: Total Won */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <CheckCircle className="w-16 h-16 text-emerald-500" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Total Won Deals</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-500 leading-tight font-mono">${stats.wonValue.toLocaleString()}</span>
          </div>
          <p className="text-[10px] text-emerald-500/80 font-bold uppercase mt-3">From {stats.wonCount} won accounts</p>
        </div>

        {/* Card 3: Win Rate */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Target className="w-16 h-16 text-indigo-500" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Closing Win Rate</span>
            <span className="text-2xl font-black text-indigo-650 dark:text-indigo-400 leading-tight">{stats.winRate}%</span>
          </div>
          {/* Custom micro CSS progress bar */}
          <div className="mt-3">
            <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${stats.winRate}%` }} />
            </div>
          </div>
        </div>

        {/* Card 4: Average Deal Value */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <TrendingUp className="w-16 h-16 text-sky-500" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Average Deal Size</span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white leading-tight font-mono">${stats.avgDealValue.toLocaleString()}</span>
          </div>
          <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase mt-3">Across {stats.totalCount} leads tracked</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Charts */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Stage Value Distribution (Horizontal Bar Chart) */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-xs text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Pipeline Stage Value Distribution
            </h3>

            <div className="space-y-4">
              {stageStats.map((stage) => {
                const maxVal = Math.max(...stageStats.map(s => s.value)) || 1;
                const percent = Math.round((stage.value / maxVal) * 100);

                return (
                  <div key={stage.key} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-zinc-750 dark:text-zinc-350">{stage.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 font-medium">({stage.count} {stage.count === 1 ? 'deal' : 'deals'})</span>
                        <span className="font-bold text-zinc-900 dark:text-white font-mono">${stage.value.toLocaleString()}</span>
                      </div>
                    </div>
                    {/* SVG/CSS Progress Bar */}
                    <div className="w-full h-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800/85 rounded-lg overflow-hidden relative group">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          stage.key === 'won' ? 'bg-emerald-500' : stage.key === 'lost' ? 'bg-rose-500' : 'bg-indigo-500'
                        }`} 
                        style={{ width: `${percent}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lead Source Distribution */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-xs text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-500" />
              Lead Generation Sources
            </h3>

            {sourceStats.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {sourceStats.map((source) => (
                    <div key={source.name} className="flex items-center justify-between text-xs p-2.5 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-150 dark:border-zinc-850 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                        <span className="font-bold text-zinc-750 dark:text-zinc-300">{source.name}</span>
                      </div>
                      <span className="font-black text-zinc-900 dark:text-white">{source.count} <span className="text-zinc-400 font-medium font-mono">({source.percentage}%)</span></span>
                    </div>
                  ))}
                </div>

                {/* Custom SVG Donut Chart representation */}
                <div className="flex items-center justify-center p-4">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-95" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e4e4e7" strokeWidth="3.5" className="dark:stroke-zinc-800" />
                      {(() => {
                        let accumulatedOffset = 0;
                        return sourceStats.map((source, idx) => {
                          const strokeDashArray = `${source.percentage} ${100 - source.percentage}`;
                          const strokeDashOffset = 100 - accumulatedOffset;
                          accumulatedOffset += source.percentage;

                          // Colors based on index
                          const colors = ['#6366f1', '#38bdf8', '#f59e0b', '#10b981', '#ef4444', '#a1a1aa'];
                          const color = colors[idx % colors.length];

                          return (
                            <circle 
                              key={source.name}
                              cx="18" 
                              cy="18" 
                              r="15.915" 
                              fill="none" 
                              stroke={color} 
                              strokeWidth="3.5" 
                              strokeDasharray={strokeDashArray} 
                              strokeDashoffset={strokeDashOffset} 
                            />
                          );
                        });
                      })()}
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">Total</span>
                      <span className="text-sm font-black text-zinc-900 dark:text-white font-mono">{stats.totalCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 text-center py-6">No source breakdown available.</p>
            )}

          </div>

        </div>

        {/* Right Column: Leaderboard */}
        <div className="space-y-6">
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm h-full flex flex-col">
            <h3 className="font-bold text-xs text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2 shrink-0">
              <Trophy className="w-4 h-4 text-indigo-500" />
              Sales Representative Leaderboard
            </h3>

            <div className="flex-1 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto no-scrollbar">
              {repStats.length > 0 ? (
                repStats.map((rep: any, idx) => {
                  
                  // Medals for top 3
                  const badge = idx === 0 
                    ? '🥇 First' 
                    : idx === 1 
                      ? '🥈 Second' 
                      : idx === 2 
                        ? '🥉 Third' 
                        : null;

                  return (
                    <div key={rep.name} className="py-3.5 flex items-center justify-between gap-3 group first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-black shrink-0 ${
                          idx === 0 
                            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600' 
                            : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-zinc-900 dark:text-white block group-hover:text-indigo-500 transition-colors truncate">
                            {rep.name}
                          </span>
                          <span className="text-[9px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mt-0.5 block">
                            {rep.won} Wins / {rep.total} Total
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end">
                        <span className="font-black text-sm text-zinc-900 dark:text-white font-mono leading-none">
                          ${rep.wonValue.toLocaleString()}
                        </span>
                        {badge && (
                          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                            {badge}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                  <Users className="w-6 h-6 text-zinc-300 mb-1.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">No Representative Data</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
