import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Activity, RefreshCw, Clock, 
  TrendingUp,
  Warehouse
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { StaffLink } from './StaffPerformance';

interface ActivityItem {
  id: string;
  type: 'qbwc_sync' | 'zone_assignment' | 'time_session' | 'system' | 'job' | 'parts' | 'shipment' | 'zone_move';
  title: string;
  message: string;
  timestamp: any;
  severity: 'info' | 'success' | 'warning' | 'error';
  metadata?: any;
  author?: string;
}

export function ShopFloorActivity({ tenantId }: { tenantId: string }) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    // Listen to multiple activity sources
    const configs = [
      {
        path: `businesses/${tenantId}/activity_feed`,
        transform: (doc: any) => ({
          id: doc.id,
          ...doc.data(),
        })
      },
      {
        path: `businesses/${tenantId}/zone_assignments`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.assignedByName || data.assignedByEmail?.split('@')[0] || (data.assignedBy === 'system' ? 'System' : null);
          const vehicleLabel = data.vin ? `vehicle (${data.vin.slice(-6)})` : 'bay';
          
          let message = `Assigned ${vehicleLabel} to ${data.zoneName}`;
          let severity: 'info' | 'success' | 'warning' = 'info';
          let title = 'Shop Floor Move';

          if (data.action === 'cleared') {
            message = `Cleared ${data.zoneName}`;
          } else if (data.action === 'verified') {
            message = `Verified occupancy in ${data.zoneName}`;
            severity = 'success';
            title = 'Occupancy Check';
          }

          return {
            id: doc.id,
            type: 'zone_move' as const,
            title,
            message,
            timestamp: data.assignedAt || data.updatedAt,
            severity,
            author: staffName,
            metadata: { vin: data.vin }
          };
        }
      },
      {
        path: `businesses/${tenantId}/time_sessions`,
        transform: (doc: any) => {
          const data = doc.data();
          let title = 'Timeclock Event';
          let message = `Clocked in`;
          let severity: 'info' | 'success' | 'warning' = 'info';
          let timestamp = data.clockIn?.timestamp;

          if (data.status === 'completed') {
            message = `Clocked out`;
            timestamp = data.clockOut?.timestamp;
            severity = 'success';
          } else if (data.status === 'on_break') {
            const lastBreak = data.breaks?.[data.breaks.length - 1];
            const type = lastBreak?.type === 'lunch' ? 'lunch' : 'a break';
            message = `Started ${type}`;
            timestamp = lastBreak?.start;
            severity = 'warning';
          } else if (data.status === 'active' && data.breaks?.length > 0) {
            const lastBreak = data.breaks[data.breaks.length - 1];
            if (lastBreak.end) {
              message = `Returned from ${lastBreak.type === 'lunch' ? 'lunch' : 'break'}`;
              timestamp = lastBreak.end;
              severity = 'success';
            }
          }

          return {
            id: doc.id,
            type: 'time_session' as const,
            title,
            message,
            timestamp,
            severity,
            author: data.userName,
          };
        }
      },
      {
        path: `businesses/${tenantId}/jobs`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.createdByName || data.createdByEmail?.split('@')[0] || null;
          return {
            id: doc.id,
            type: 'job' as const,
            title: 'New Job Created',
            message: `${data.title || 'Untitled Job'} for ${data.customerName || 'Walk-in'}`,
            timestamp: data.createdAt,
            severity: 'info' as const,
            author: staffName
          };
        }
      },
      {
        path: `businesses/${tenantId}/parts_requests`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.createdByName || data.requestedBy || data.createdByEmail?.split('@')[0] || null;
          return {
            id: doc.id,
            type: 'parts' as const,
            title: 'Parts Request',
            message: `Requested: ${data.partName}`,
            timestamp: data.createdAt,
            severity: data.urgency === 'urgent' ? 'warning' as const : 'info' as const,
            author: staffName === 'Unknown' ? null : staffName
          };
        }
      },
      {
        path: `businesses/${tenantId}/shipments`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.createdByName || data.createdByEmail?.split('@')[0] || null;
          return {
            id: doc.id,
            type: 'shipment' as const,
            title: 'Shipment Entry',
            message: `${data.carrier} tracking #${data.trackingNumber}`,
            timestamp: data.createdAt,
            severity: 'info' as const,
            author: staffName
          };
        }
      }
    ];

    const unsubscribers = configs.map(config => {
      const q = query(
        collection(db, config.path),
        orderBy(config.path.includes('activity_feed') ? 'timestamp' : 'createdAt', 'desc'),
        limit(15)
      );

      return onSnapshot(q, (snap) => {
        setActivities(prev => {
          const others = prev.filter(a => !snap.docs.map(d => d.id).includes(a.id));
          const updated = snap.docs.map(doc => config.transform(doc));
          const merged = [...others, ...updated]
            .filter(a => a.timestamp)
            .sort((a, b) => {
              const tsA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
              const tsB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
              return tsB - tsA;
            })
            .slice(0, 30);
          return merged as any[];
        });
        setIsLoading(false);
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [tenantId]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'qbwc_sync': return <RefreshCw className="w-4 h-4" />;
      case 'zone_move': return <Warehouse className="w-4 h-4" />;
      case 'time_session': return <Clock className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'success': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'warning': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'error': return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      default: return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-white">Live Activity Feed</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Real-time throughput</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex gap-4">
                <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded w-1/4" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <Activity className="w-12 h-12 text-zinc-200 dark:text-zinc-800 mb-4" />
            <p className="text-zinc-500 font-medium">No recent activity detected.</p>
            <p className="text-xs text-zinc-400 mt-1">Activity from shop movements and syncs will appear here.</p>
          </div>
        ) : (
          <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent dark:before:via-zinc-800">
            {activities.map((activity, i) => (
              <div key={activity.id} className="relative flex items-start gap-6 group animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${i * 50}ms` }}>
                <div className={cn(
                  "relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-zinc-900 shrink-0 transition-transform group-hover:scale-110 shadow-sm",
                  getSeverityStyles(activity.severity)
                )}>
                  {getIcon(activity.type)}
                </div>
                
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">{activity.title}</p>
                      {activity.author && (
                        <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter whitespace-nowrap flex-shrink-0">
                          By <StaffLink name={activity.author} tenantId={tenantId} />
                        </span>
                      )}
                    </div>
                    <time className="text-[10px] font-mono font-bold text-zinc-400">
                      {activity.timestamp ? (
                        new Date(activity.timestamp?.toMillis ? activity.timestamp.toMillis() : activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      ) : '--:--'}
                    </time>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {activity.message}
                  </p>
                  {activity.metadata?.vin && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                        VIN: {activity.metadata.vin}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
