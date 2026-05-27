import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase/config';
import { 
  Activity, Clock, Target, TrendingUp, Zap, ArrowUpRight, ArrowDownRight, Award, RefreshCw
} from 'lucide-react';

type Timeframe = 'day' | 'week' | 'month' | 'year';

interface EfficiencyReportsProps {
  tenantId: string;
  timeframe: Timeframe;
}

export function EfficiencyReports({ tenantId, timeframe }: EfficiencyReportsProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['efficiency-reports', tenantId, timeframe],
    queryFn: async () => {
      const docRef = doc(db, `businesses/${tenantId}/system_registry/efficiency_reports`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return data[timeframe] || null;
      }
      return null;
    }
  });

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      const forceAggregate = httpsCallable(functions, 'forceAggregateEfficiencyStats');
      await forceAggregate({ tenantId });
      await queryClient.invalidateQueries({ queryKey: ['efficiency-reports', tenantId] });
    } catch (err) {
      console.error('Failed to force refresh efficiency stats', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 animate-pulse">
        <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
          <Activity className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
        <p className="text-zinc-500 font-medium">Crunching efficiency numbers...</p>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top Level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-200" />
                <h3 className="text-sm font-bold text-indigo-200 uppercase tracking-widest">Shop Efficiency Score</h3>
              </div>
              <button 
                onClick={handleForceRefresh}
                disabled={isRefreshing}
                className="p-2 bg-indigo-500/20 hover:bg-indigo-500/40 rounded-full transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                title="Force Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 text-indigo-200 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-5xl font-black mt-2">{metrics.overallEfficiency}%</p>
            <p className="text-indigo-200 text-sm mt-4 leading-relaxed">
              Based on {metrics.totalBookHours} Book Hours vs {metrics.efficiencyLoggedHours} Actual Hours on booked jobs.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Target className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Total Book Time</h3>
          </div>
          <p className="text-4xl font-black text-zinc-900 dark:text-white">{metrics.totalBookHours} <span className="text-xl text-zinc-400">hrs</span></p>
          <p className="text-xs text-zinc-500 mt-2">Estimated time sold to customers</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Total Actual Time</h3>
          </div>
          <p className="text-4xl font-black text-zinc-900 dark:text-white">{metrics.totalLoggedHours} <span className="text-xl text-zinc-400">hrs</span></p>
          <p className="text-xs text-zinc-500 mt-2">Real time logged by technicians</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Technician Leaderboard */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Technician Leaderboard
            </h3>
          </div>
          <div className="p-0">
            {metrics.leaderboard.length === 0 ? (
              <p className="p-8 text-center text-zinc-500 text-sm">No time logged in this period.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Technician</th>
                    <th className="px-6 py-4">Actual Hours</th>
                    <th className="px-6 py-4">Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {metrics.leaderboard.map((user: any, i: number) => (
                    <tr key={user.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                      <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">#{i + 1}</span>
                        {user.name}
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-600 dark:text-zinc-400">{(user.loggedMs / 3600000).toFixed(1)}h</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase flex items-center w-fit gap-1 ${
                          user.efficiencyRatio >= 100 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                        }`}>
                          {user.efficiencyRatio >= 100 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {user.efficiencyRatio.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Most Time-Consuming Jobs */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Highest Actual Time Jobs
            </h3>
          </div>
          <div className="p-0">
             {metrics.jobStats.length === 0 ? (
              <p className="p-8 text-center text-zinc-500 text-sm">No jobs worked in this period.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Job / Task</th>
                    <th className="px-6 py-4">Book Time</th>
                    <th className="px-6 py-4">Actual Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {metrics.jobStats.map((job: any) => {
                    const actualHrs = job.loggedMs / 3600000;
                    const isOver = actualHrs > job.estimatedHours && job.estimatedHours > 0;
                    return (
                      <tr key={job.title} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white max-w-[200px] truncate" title={job.title}>
                          {job.title}
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-600 dark:text-zinc-400">
                          {job.estimatedHours > 0 ? `${job.estimatedHours.toFixed(1)}h` : '--'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-mono font-bold ${isOver ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {actualHrs.toFixed(1)}h
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
