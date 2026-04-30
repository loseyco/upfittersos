import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, orderBy, getCountFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Users, Briefcase, Box, CheckSquare, TrendingUp,
  Clock, AlertCircle, ArrowRight, Car, Warehouse, Truck
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
      const collections = ['customers', 'jobs', 'inventory_items', 'tasks', 'vehicles'];
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

  // Zones Fetching
  const { data: zones, isLoading: zonesLoading } = useQuery({
    queryKey: ['mission-control-zones', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/zones`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  // Shipments Fetching
  const { data: shipments, isLoading: shipmentsLoading } = useQuery({
    queryKey: ['mission-control-shipments', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/shipments`),
        orderBy('createdAt', 'desc'),
        limit(50)
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
    else if (timeSinceSync < 1440) syncText = `${Math.floor(timeSinceSync / 60)} hours ago`;
    else syncText = `${Math.floor(timeSinceSync / 1440)} days ago`;
  }

  const fcmStatus = typeof Notification !== 'undefined' ? Notification.permission : 'unknown';

  const activeShipments = shipments?.filter((s: any) => s.status !== 'delivered') || [];
  const activeShipmentsCount = activeShipments.length;
  const bays = zones?.filter((z: any) => z.type === 'bay') || [];
  const totalBays = bays.length;
  const occupiedBays = bays.filter((z: any) => !!z.currentVehicleVin).length;

  // Generate Actionable Alerts
  const alerts: any[] = [];
  
  // 1. Shipment Exceptions
  shipments?.forEach((s: any) => {
    if (s.status === 'exception') {
      alerts.push({
        id: `ship-${s.id}`,
        title: `Shipment Issue: ${s.carrier} ${s.trackingNumber}`,
        description: s.description || 'Action required to resolve shipment.',
        type: 'danger',
        icon: AlertCircle,
        onClick: () => onTabChange('shipments')
      });
    }
  });

  // 2. Bay Hogs
  zones?.forEach((z: any) => {
    if (z.type === 'bay' && z.currentVehicleVin && z.lastAssignedAt) {
      const assignedTime = new Date(z.lastAssignedAt.seconds ? z.lastAssignedAt.seconds * 1000 : z.lastAssignedAt).getTime();
      const hours = (Date.now() - assignedTime) / (1000 * 60 * 60);
      if (hours > 48) {
        alerts.push({
          id: `zone-${z.id}`,
          title: `Bay Hog: ${z.name}`,
          description: `Vehicle ${z.currentVehicleVin} has been in this bay for ${Math.floor(hours / 24)} days.`,
          type: 'warning',
          icon: Car,
          onClick: () => onTabChange('zones')
        });
      }
    }
  });

  // 3. Stale Jobs
  recentJobs?.forEach((job: any) => {
    if (job.status !== 'Closed' && job.status !== 'Completed' && job.updatedAt) {
      const updatedTime = new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).getTime();
      const days = (Date.now() - updatedTime) / (1000 * 60 * 60 * 24);
      if (days > 7) {
        alerts.push({
          id: `job-${job.id}`,
          title: `Stale Job: ${job.title || 'Untitled'}`,
          description: `No updates in ${Math.floor(days)} days. Status: ${job.status || 'Unknown'}`,
          type: 'warning',
          icon: Clock,
          onClick: () => onTabChange('jobs')
        });
      }
    }
  });

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
                <AlertCircle className={`w-5 h-5 ${alerts.length > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
                <h2 className="font-bold text-lg dark:text-white">Action Required</h2>
                {alerts.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {jobsLoading || zonesLoading || shipmentsLoading ? (
                <div className="p-12 text-center text-zinc-400 animate-pulse">Scanning for bottlenecks...</div>
              ) : alerts.length > 0 ? (
                alerts.map((alert: any) => (
                  <button key={alert.id} onClick={alert.onClick} className="w-full text-left p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        alert.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        <alert.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-white">{alert.title}</p>
                        <p className="text-xs text-zinc-500">{alert.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              ) : (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckSquare className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">All Clear!</p>
                    <p className="text-zinc-500 text-sm">No bottlenecks or urgent actions required.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={() => onTabChange('zones')} className="flex flex-col p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center justify-between w-full mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Warehouse className="w-5 h-5 text-indigo-500" />
                  </div>
                  <p className="font-bold">Bay Utilization</p>
                </div>
                <span className="text-xs font-bold text-zinc-500">{occupiedBays} / {totalBays}</span>
              </div>
              
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-1 overflow-hidden">
                <div 
                  className={`h-2 rounded-full ${totalBays > 0 && occupiedBays / totalBays > 0.8 ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${totalBays > 0 ? (occupiedBays / totalBays) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2 text-left">
                {totalBays > 0 && occupiedBays / totalBays > 0.8 ? 'Approaching max capacity!' : 'Healthy capacity.'}
              </p>
            </button>
            <button onClick={() => onTabChange('shipments')} className="flex items-center justify-between p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-xl">
                  <Truck className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-zinc-900 dark:text-white">Active Shipments</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {shipmentsLoading ? 'Loading...' : `${activeShipmentsCount} Expected Packages`}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:translate-x-1 group-hover:text-emerald-500 transition-transform" />
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
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Firebase Notifications</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${fcmStatus === 'granted' ? 'bg-emerald-500/10 text-emerald-600' :
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
          <button 
            onClick={() => onTabChange('vehicles')}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex items-center justify-between hover:border-indigo-500/50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-indigo-500/10">
                <Car className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-zinc-900 dark:text-white">Vehicles</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {statsLoading ? '...' : `${stats?.vehicles ?? 0} Total Vehicles`}
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:translate-x-1 group-hover:text-indigo-500 transition-all" />
          </button>

        </div>
      </div>
    </div>
  );
}
