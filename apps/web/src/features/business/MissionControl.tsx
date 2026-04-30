import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, orderBy, getCountFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Users, Briefcase, Box, CheckSquare, TrendingUp, 
  Clock, AlertCircle, ArrowRight, PlusCircle, Calendar
} from 'lucide-react';

interface MissionControlProps {
  tenantId: string;
  onTabChange: (tabId: string) => void;
  business?: any;
}

export function MissionControl({ tenantId, onTabChange, business }: MissionControlProps) {
  // Stats fetching
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['mission-control-stats', tenantId],
    queryFn: async () => {
      const collections = ['customers', 'jobs', 'inventory_items', 'tasks'];
      const results = await Promise.all(
        collections.map(async (col) => {
          const coll = collection(db, `businesses/${tenantId}/${col}`);
          const snapshot = await getCountFromServer(coll);
          return { name: col, count: snapshot.data().count };
        })
      );
      return results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.count }), {} as Record<string, number>);
    }
  });

  // Recent activity fetching
  const { data: recentJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['mission-control-recent-jobs', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/jobs`), 
        orderBy('updatedAt', 'desc'), 
        limit(5)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  const kpis = [
    { label: 'Active Customers', value: stats?.customers ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', tab: 'customers' },
    { label: 'Open Jobs', value: stats?.jobs ?? 0, icon: Briefcase, color: 'text-emerald-500', bg: 'bg-emerald-500/10', tab: 'jobs' },
    { label: 'Inventory Items', value: stats?.inventory_items ?? 0, icon: Box, color: 'text-amber-500', bg: 'bg-amber-500/10', tab: 'items' },
    { label: 'Pending Tasks', value: stats?.tasks ?? 0, icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-500/10', tab: 'tasks' },
  ];

  // Derive real status values
  const lastSyncTime = business?.rawData?.lastQbSyncTime;
  const isQbHealthy = !!lastSyncTime;
  const timeSinceSync = lastSyncTime 
    ? Math.floor((Date.now() - new Date(lastSyncTime.seconds ? lastSyncTime.seconds * 1000 : lastSyncTime).getTime()) / 60000)
    : null;
    
  let syncText = 'Never synced';
  if (timeSinceSync !== null) {
     if (timeSinceSync < 60) syncText = `${timeSinceSync} minutes ago`;
     else if (timeSinceSync < 1440) syncText = `${Math.floor(timeSinceSync/60)} hours ago`;
     else syncText = `${Math.floor(timeSinceSync/1440)} days ago`;
  }

  const fcmStatus = typeof Notification !== 'undefined' ? Notification.permission : 'unknown';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => onTabChange(kpi.tab)}
            className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm hover:border-indigo-500/50 transition-all text-left active:scale-[0.98]"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
              </div>
              <TrendingUp className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{kpi.label}</h3>
              <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                {statsLoading ? '...' : kpi.value}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                <h2 className="font-bold text-lg dark:text-white">Recent Activity</h2>
              </div>
              <button 
                onClick={() => onTabChange('jobs')}
                className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 uppercase tracking-wider"
              >
                View All <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {jobsLoading ? (
                <div className="p-12 text-center text-zinc-400 animate-pulse">Loading recent jobs...</div>
              ) : recentJobs && recentJobs.length > 0 ? (
                recentJobs.map((job: any) => (
                  <div key={job.id} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                        <Briefcase className="w-5 h-5 text-zinc-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-white">{job.title || 'Untitled Job'}</p>
                        <p className="text-xs text-zinc-500">Status: {job.status || 'Active'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono text-zinc-400">{job.updatedAt ? new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).toLocaleDateString() : 'Just now'}</p>
                      <button onClick={() => onTabChange('jobs')} className="text-[10px] font-bold text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">DETAILS</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center">
                  <p className="text-zinc-500 text-sm">No recent jobs found.</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={() => onTabChange('jobs')} className="flex items-center justify-between p-6 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-colors group">
              <div className="flex items-center gap-4">
                <PlusCircle className="w-6 h-6" />
                <div className="text-left">
                  <p className="font-bold">New Job</p>
                  <p className="text-xs text-indigo-100/70">Create a new service request</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button onClick={() => onTabChange('messages')} className="flex items-center justify-between p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center gap-4">
                <Calendar className="w-6 h-6 text-indigo-500" />
                <div className="text-left">
                  <p className="font-bold text-zinc-900 dark:text-white">Schedule Event</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Plan a company outing</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Sidebar Status Area */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Operational Health
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">QuickBooks Sync</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isQbHealthy ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                  {isQbHealthy ? 'Healthy' : 'Unknown'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Database Connection</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">FCM Notifications</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  fcmStatus === 'granted' ? 'bg-emerald-500/10 text-emerald-600' : 
                  fcmStatus === 'denied' ? 'bg-red-500/10 text-red-600' : 
                  'bg-zinc-500/10 text-zinc-600'
                }`}>
                  {fcmStatus}
                </span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
               <p className="text-xs text-zinc-400 leading-relaxed">
                 {isQbHealthy ? `All systems are performing optimally. Last sync completed ${syncText}.` : 'Waiting for initial QuickBooks sync.'}
               </p>
            </div>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-6">
            <h3 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2">Pro Tip</h3>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-400/70 leading-relaxed">
              Use the 'Events' module to track staff locations in real-time during field operations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
