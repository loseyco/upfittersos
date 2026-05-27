import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Activity, RefreshCw, Clock, 
  TrendingUp,
  Warehouse,
  UserPlus,
  Car,
  Package,
  MessageSquare,
  Truck
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
  // Silent, idempotent background backfill of historical job activities
  useEffect(() => {
    if (!tenantId) return;

    const runBackfill = async () => {
      const lockKey = `upfitters_activity_backfill_${tenantId}`;
      if (localStorage.getItem(lockKey)) return;

      try {
        // 1. Fetch all jobs
        const jobsSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs`));
        const jobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        const typeToTitle: Record<string, string> = {
          blocker_added: 'Blocker Added',
          blocker_resolved: 'Blocker Resolved',
          part_status_changed: 'Part Status Changed',
          location_changed: 'Vehicle Moved',
          patrol_check: 'Patrol Check',
          status_changed: 'Status Changed',
          task_added: 'Task Added',
          task_duplicated: 'Task Duplicated',
          task_deleted: 'Task Removed',
          task_updated: 'Task Updated',
          task_assigned: 'Task Assigned',
        };

        const getSeverity = (t: string, msg: string) => {
          if (t === 'blocker_added') return 'warning';
          if (t === 'blocker_resolved') return 'success';
          if (t === 'status_changed') {
            if (msg.toLowerCase().includes('blocked')) return 'error';
            if (msg.toLowerCase().includes('restored') || msg.toLowerCase().includes('active')) return 'success';
          }
          return 'info';
        };

        // 2. Query each job's activity subcollection and write to global feed
        for (const job of jobs) {
          const activitiesSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${job.id}/activity`));
          
          for (const actDoc of activitiesSnap.docs) {
            const actData = actDoc.data();
            const jobPrefix = job.jobNumber ? `Job #${job.jobNumber}` : `Job ${job.title || '?'}`;
            
            await setDoc(doc(db, `businesses/${tenantId}/activity_feed`, `job_act_${job.id}_${actDoc.id}`), {
              type: 'job',
              title: typeToTitle[actData.type] || 'Job Update',
              message: `${jobPrefix}: ${actData.message}`,
              timestamp: actData.timestamp || new Date(),
              severity: getSeverity(actData.type || '', actData.message || ''),
              author: actData.staffName || 'Staff',
              metadata: {
                jobId: job.id,
                jobTitle: job.title || '',
                jobNumber: job.jobNumber || '',
                ...actData.metadata
              }
            });
          }
        }

        localStorage.setItem(lockKey, 'true');
        console.log(`[Backfill] Successfully backfilled historical job activities for tenant ${tenantId}.`);
      } catch (err) {
        console.error("[Backfill] Error backfilling activities:", err);
      }
    };

    runBackfill();
  }, [tenantId]);

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
          const items: any[] = [];

          // 1. Add the main daily timeclock event
          let mainTimestamp = data.clockIn?.timestamp;
          let mainMessage = 'Clocked in';
          let mainSeverity: 'info' | 'success' | 'warning' = 'info';

          if (data.status === 'completed') {
            mainMessage = 'Clocked out';
            mainTimestamp = data.clockOut?.timestamp;
            mainSeverity = 'success';
          } else if (data.status === 'on_break') {
            const lastBreak = data.breaks?.[data.breaks.length - 1];
            const type = lastBreak?.type === 'lunch' ? 'lunch' : 'a break';
            mainMessage = `Started ${type}`;
            mainTimestamp = lastBreak?.start;
            mainSeverity = 'warning';
          } else if (data.status === 'active' && data.breaks?.length > 0) {
            const lastBreak = data.breaks[data.breaks.length - 1];
            if (lastBreak.end) {
              mainMessage = `Returned from ${lastBreak.type === 'lunch' ? 'lunch' : 'break'}`;
              mainTimestamp = lastBreak.end;
              mainSeverity = 'success';
            }
          }

          if (mainTimestamp) {
            items.push({
              id: `${doc.id}_main`,
              type: 'time_session' as const,
              title: 'Timeclock Event',
              message: mainMessage,
              timestamp: mainTimestamp,
              severity: mainSeverity,
              author: data.userName,
            });
          }

          // 2. Add individual task work sessions
          if (data.jobs && Array.isArray(data.jobs)) {
            data.jobs.forEach((seg: any, index: number) => {
              const startDate = seg.start?.toMillis ? new Date(seg.start.toMillis()) : new Date(seg.start);
              const endDate = seg.end ? (seg.end.toMillis ? new Date(seg.end.toMillis()) : new Date(seg.end)) : null;
              
              const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const dateText = `${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()}`;
              const timeRangeText = endDate 
                ? `${formatTime(startDate)} - ${formatTime(endDate)}`
                : `${formatTime(startDate)} - Active Now`;
              
              let durationMs = endDate ? endDate.getTime() - startDate.getTime() : new Date().getTime() - startDate.getTime();
              const hours = Math.floor(durationMs / 3600000);
              const minutes = Math.floor((durationMs % 3600000) / 60000);
              const durationText = endDate ? `${hours}h ${minutes}m` : 'In Progress';

              items.push({
                id: `${doc.id}_seg_${index}`,
                type: 'time_session' as const,
                title: 'Task Work Session',
                message: `worked on ${seg.taskName || seg.name || 'General Labor'}`,
                timestamp: seg.start,
                severity: endDate ? 'success' : 'info',
                author: data.userName,
                metadata: {
                  start: seg.start,
                  end: seg.end,
                  timeRangeText,
                  dateText,
                  durationText,
                  isActive: !endDate,
                  jobId: seg.id,
                  taskId: seg.taskId
                }
              });
            });
          }

          return items;
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
      },
      {
        path: `businesses/${tenantId}/time_edit_requests`,
        transform: (doc: any) => {
          const data = doc.data();
          return {
            id: doc.id,
            type: 'time_session' as const,
            title: 'Clock Correction',
            message: `Requested: ${data.note?.slice(0, 50)}${data.note?.length > 50 ? '...' : ''}`,
            timestamp: data.createdAt,
            severity: 'warning' as const,
            author: data.userName
          };
        }
      },
      {
        path: `businesses/${tenantId}/customers`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.createdByName || data.createdByEmail?.split('@')[0] || null;
          return {
            id: doc.id,
            type: 'system' as const,
            title: 'New Customer',
            message: `${data.firstName} ${data.lastName}${data.company ? ` (${data.company})` : ''}`,
            timestamp: data.createdAt,
            severity: 'success' as const,
            author: staffName
          };
        }
      },
      {
        path: `businesses/${tenantId}/vehicles`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.createdByName || data.createdByEmail?.split('@')[0] || null;
          return {
            id: doc.id,
            type: 'system' as const,
            title: 'Vehicle Intake',
            message: `${data.year || ''} ${data.make || ''} ${data.model || ''} (${data.vin?.slice(-6)})`,
            timestamp: data.createdAt,
            severity: 'info' as const,
            author: staffName
          };
        }
      },
      {
        path: `businesses/${tenantId}/package_intake`,
        transform: (doc: any) => {
          const data = doc.data();
          const staffName = data.receivedByName || data.receivedBy || null;
          return {
            id: doc.id,
            type: 'parts' as const,
            title: 'Package Inbound',
            message: `${data.carrier} delivery for ${data.recipient || 'Shop'}`,
            timestamp: data.createdAt,
            severity: 'success' as const,
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
          const snapIds = snap.docs.map(d => d.id);
          // Filter out existing entries that start with any of the snapshot doc IDs (handles both document IDs and segment IDs)
          const others = prev.filter(a => !snapIds.some(sid => a.id.startsWith(sid)));
          const updated = snap.docs.flatMap(doc => {
            const res = config.transform(doc);
            return Array.isArray(res) ? res : [res];
          });
          const merged = [...others, ...updated]
            .filter(a => a.timestamp)
            .sort((a, b) => {
              const tsA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
              const tsB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
              return tsB - tsA;
            })
            .slice(0, 50); // Increased slice to 50 to accommodate more task session items gracefully
          return merged as any[];
        });
        setIsLoading(false);
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [tenantId]);

  const getIcon = (type: string, title?: string) => {
    if (title === 'New Customer') return <UserPlus className="w-4 h-4" />;
    if (title === 'Vehicle Intake') return <Car className="w-4 h-4" />;
    if (title === 'Package Inbound') return <Package className="w-4 h-4" />;
    if (title === 'Clock Correction') return <MessageSquare className="w-4 h-4" />;
    if (title === 'Task Work Session') return <Clock className="w-4 h-4 animate-pulse" />;
    
    switch (type) {
      case 'qbwc_sync': return <RefreshCw className="w-4 h-4" />;
      case 'zone_move': return <Warehouse className="w-4 h-4" />;
      case 'time_session': return <Clock className="w-4 h-4" />;
      case 'parts': return <Package className="w-4 h-4" />;
      case 'shipment': return <Truck className="w-4 h-4" />;
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
                  {getIcon(activity.type, activity.title)}
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
                  {activity.type === 'time_session' && activity.metadata?.start && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono font-bold">
                      <span className="bg-zinc-55 bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-200/50 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                        {activity.metadata.timeRangeText}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-200/50 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                        {activity.metadata.dateText}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded font-bold uppercase text-[9px] border",
                        activity.metadata.isActive 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 animate-pulse" 
                          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                      )}>
                        {activity.metadata.durationText}
                      </span>
                    </div>
                  )}
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
