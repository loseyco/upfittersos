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
}

export function MissionControl({ tenantId, onTabChange }: MissionControlProps) {
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

  // All Vehicles Fetching (for detail mapping)
  const { data: vehicles } = useQuery({
    queryKey: ['mission-control-vehicles-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/vehicles`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  const activeShipments = shipments?.filter((s: any) => s.status !== 'delivered') || [];
  const activeShipmentsCount = activeShipments.length;
  const bays = zones?.filter((z: any) => z.type === 'bay') || [];
  const totalBays = bays.length;
  const occupiedBaysList = bays.filter((z: any) => !!z.currentVehicleVin);
  const occupiedBays = occupiedBaysList.length;
  const parkingZones = zones?.filter((z: any) => z.type === 'lot' || z.type === 'parking') || [];
  const totalParking = parkingZones.length;
  const occupiedParkingList = parkingZones.filter((z: any) => !!z.currentVehicleVin);
  const occupiedParking = occupiedParkingList.length;

  const sortByRecent = (a: any, b: any) => {
    const timeA = (a.lastAssignedAt?.seconds || a.updatedAt?.seconds || 0);
    const timeB = (b.lastAssignedAt?.seconds || b.updatedAt?.seconds || 0);
    return timeB - timeA;
  };

  const sortedBays = [...occupiedBaysList].sort(sortByRecent);
  const sortedParking = [...occupiedParkingList].sort(sortByRecent);

  const kpis = [
    { label: 'Active Customers', value: stats?.customers ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', tab: 'customers', loading: statsLoading },
    { label: 'Open Jobs', value: stats?.jobs ?? 0, icon: Briefcase, color: 'text-emerald-500', bg: 'bg-emerald-500/10', tab: 'jobs', loading: statsLoading },
    { label: 'Inventory Items', value: stats?.inventory_items ?? 0, icon: Box, color: 'text-amber-500', bg: 'bg-amber-500/10', tab: 'items', loading: statsLoading },
    { label: 'Pending Tasks', value: stats?.tasks ?? 0, icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-500/10', tab: 'tasks', loading: statsLoading },
    { label: 'Active Shipments', value: activeShipmentsCount, icon: Truck, color: 'text-orange-500', bg: 'bg-orange-500/10', tab: 'shipments', loading: shipmentsLoading },
    { label: 'Vehicles', value: stats?.vehicles ?? 0, icon: Car, color: 'text-indigo-500', bg: 'bg-indigo-500/10', tab: 'vehicles', loading: statsLoading },
  ];



  const calculateDuration = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 0) return '0m';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

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


  // 3. Inactive Jobs
  recentJobs?.forEach((job: any) => {
    if (job.status !== 'Closed' && job.status !== 'Completed' && job.updatedAt) {
      const updatedTime = new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).getTime();
      const days = (Date.now() - updatedTime) / (1000 * 60 * 60 * 24);
      if (days > 7) {
        alerts.push({
          id: `job-${job.id}`,
          title: `Inactive Job: ${job.title || 'Untitled'}`,
          description: `No updates in ${Math.floor(days)} days. Status: ${job.status || 'Unknown'}`,
          type: 'warning',
          icon: Clock,
          onClick: () => onTabChange('jobs')
        });
      }
    }
  });

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => onTabChange(kpi.tab)}
            className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm hover:border-indigo-500/50 transition-all text-left active:scale-[0.98]"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={`p-2 sm:p-3 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${kpi.color}`} />
              </div>
              <TrendingUp className="hidden sm:block w-4 h-4 text-zinc-300 dark:text-zinc-700" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <h3 className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 truncate">{kpi.label}</h3>
              <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white">
                {kpi.loading ? '...' : kpi.value}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-4 sm:space-y-6">
        {/* Main Content Area */}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button onClick={() => onTabChange('zones')} className="flex flex-col p-4 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center justify-between w-full mb-3 sm:mb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Warehouse className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
                  </div>
                  <p className="font-bold text-sm sm:text-base">Bay Utilization</p>
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-zinc-500">{occupiedBays} / {totalBays}</span>
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

              {sortedBays.length > 0 && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5 sm:space-y-2">
                  {sortedBays.map((bay: any) => {
                    const vehicle = vehicles?.find((v: any) => v.vin === bay.currentVehicleVin) as any;
                    const vehicleDisplay = vehicle 
                      ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${bay.currentVehicleVin}`
                      : `VIN: ${bay.currentVehicleVin}`;
                    const timestamp = bay.lastAssignedAt || bay.updatedAt;

                    return (
                      <div key={bay.id} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-bold text-zinc-400 dark:text-zinc-500 w-12 truncate">{bay.name}</span>
                          <span className="text-zinc-900 dark:text-white truncate font-medium">
                            {vehicleDisplay}
                          </span>
                        </div>
                        {(() => {
                          if (!timestamp) {
                            return (
                              <span className="text-zinc-400 font-mono font-bold whitespace-nowrap ml-2">
                                ---
                              </span>
                            );
                          }
                          const assignedTime = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
                          const hours = (Date.now() - assignedTime) / (1000 * 60 * 60);
                          const colorClass = hours >= 48 ? 'text-red-500' : hours >= 24 ? 'text-amber-500' : 'text-emerald-500';
                          return (
                            <span className={`${colorClass} font-mono font-bold whitespace-nowrap ml-2`}>
                              {calculateDuration(timestamp)}
                            </span>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </button>

            <button onClick={() => onTabChange('zones?type=parking&occupancy=occupied')} className="flex flex-col p-4 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center justify-between w-full mb-3 sm:mb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl">
                    <Car className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                  </div>
                  <p className="font-bold text-sm sm:text-base">Parking Lot</p>
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-zinc-500">{occupiedParking} / {totalParking}</span>
              </div>
              
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-1 overflow-hidden">
                <div 
                  className={`h-2 rounded-full ${totalParking > 0 && occupiedParking / totalParking > 0.8 ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${totalParking > 0 ? (occupiedParking / totalParking) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2 text-left">
                {totalParking > 0 && occupiedParking / totalParking > 0.8 ? 'Lot is nearly full!' : 'Parking available.'}
              </p>

              {sortedParking.length > 0 && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5 sm:space-y-2">
                  {sortedParking.map((zone: any) => {
                    const vehicle = vehicles?.find((v: any) => v.vin === zone.currentVehicleVin) as any;
                    const vehicleDisplay = vehicle 
                      ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${zone.currentVehicleVin}`
                      : `VIN: ${zone.currentVehicleVin}`;
                    const timestamp = zone.lastAssignedAt || zone.updatedAt;

                    return (
                      <div key={zone.id} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-bold text-zinc-400 dark:text-zinc-500 w-12 truncate">{zone.name}</span>
                          <span className="text-zinc-900 dark:text-white truncate font-medium">
                            {vehicleDisplay}
                          </span>
                        </div>
                        {(() => {
                          if (!timestamp) {
                            return (
                              <span className="text-zinc-400 font-mono font-bold whitespace-nowrap ml-2">
                                ---
                              </span>
                            );
                          }
                          const assignedTime = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
                          const hours = (Date.now() - assignedTime) / (1000 * 60 * 60);
                          const colorClass = hours >= 48 ? 'text-red-500' : hours >= 24 ? 'text-amber-500' : 'text-emerald-500';
                          return (
                            <span className={`${colorClass} font-mono font-bold whitespace-nowrap ml-2`}>
                              {calculateDuration(timestamp)}
                            </span>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className={`w-4 h-4 sm:w-5 sm:h-5 ${alerts.length > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
                <h2 className="font-bold text-base sm:text-lg dark:text-white">Action Required</h2>
                {alerts.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {jobsLoading || zonesLoading || shipmentsLoading ? (
                <div className="p-12 text-center text-zinc-400 animate-pulse">Scanning for action items...</div>
              ) : alerts.length > 0 ? (
                alerts.map((alert: any) => (
                  <button key={alert.id} onClick={alert.onClick} className="w-full text-left p-3 sm:p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                        alert.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        <alert.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-white truncate">{alert.title}</p>
                        <p className="text-[10px] sm:text-xs text-zinc-500 truncate">{alert.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="hidden sm:block shrink-0 w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              ) : (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckSquare className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">All Clear!</p>
                    <p className="text-zinc-500 text-sm">No action items or urgent alerts required.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

      </div>
    </div>
  );
}
