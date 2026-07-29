import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  BarChart3, Eye, Clock, Users, Flame, Search, ChevronDown, ChevronUp,
  User, RefreshCw, Code, Table
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface TelemetryRecord {
  id: string;
  pageId: string;
  userUid: string;
  userName?: string;
  userEmail?: string;
  durationSeconds: number;
  timestamp: any;
  entryTime?: any;
  exitTime?: any;
  hostname?: string;
}

interface PageAnalyticsDashboardProps {
  tenantId: string;
}

// Friendly Route Labels Lookup Map
const PAGE_NAME_MAP: Record<string, { title: string; category: string }> = {
  daily_log: { title: 'Daily Operations Log', category: 'Main Office' },
  overview: { title: 'Overview Dashboard (v3)', category: 'Main Office' },
  jobs: { title: 'Jobs Worksheet', category: 'Facility' },
  tasks: { title: 'Tasks Manager', category: 'Facility' },
  time_details: { title: 'Time Clock & Attendance', category: 'Main Office' },
  parts_worksheet: { title: 'Parts Worksheet', category: 'Parts' },
  parts_mission: { title: 'Parts Mission Control', category: 'Parts' },
  upfitters_kanban: { title: 'Upfitters Kanban Board', category: 'Development' },
  jobs_sheet: { title: 'Jobs Sheet (v3)', category: 'Development' },
  tasks_sheet: { title: 'Tasks Sheet (v3)', category: 'Development' },
  wires_sheet: { title: 'Wires Sheet (v3)', category: 'Development' },
  vehicles_sheet: { title: 'Vehicles Sheet (v3)', category: 'Development' },
  staff_sheet: { title: 'Staff Sheet (v3)', category: 'Development' },
  time_sheet: { title: 'Time Logs Sheet (v3)', category: 'Development' },
  progress_digest_v3: { title: 'Progress Digest (v3)', category: 'Development' },
  qb_sync_status: { title: 'QB Live Sync Monitor', category: 'Admin & Sync' },
  qb_health_audit: { title: 'QB Data Health Audit', category: 'Admin & Sync' },
  settings: { title: 'System Settings', category: 'Admin & Sync' },
  departments: { title: 'Departments Config', category: 'Admin & Sync' },
  org_chart: { title: 'Business Org Chart', category: 'Facility' },
  morning_meeting: { title: 'Morning Meeting Board', category: 'Facility' },
  bay_monitor: { title: 'Bay Monitor (TV)', category: 'Facility' },
  timeclock_monitor: { title: 'Timeclock Station (TV)', category: 'Facility' },
  parking_monitor: { title: 'Parking Key Monitor', category: 'Facility' },
  conference_monitor: { title: 'Conference Room (TV)', category: 'Facility' },
  page_analytics: { title: 'Page Views & Analytics', category: 'Development' },
};

export function PageAnalyticsDashboard({ tenantId }: PageAnalyticsDashboardProps) {
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeframe, setTimeframe] = useState<'today' | '7days' | '30days' | 'all'>('7days');
  const [activeViewTab, setActiveViewTab] = useState<'pages' | 'users'>('pages');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  // Subscribe to real-time page_analytics collection
  useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;

    setLoading(true);
    const q = query(
      collection(db, `businesses/${tenantId}/page_analytics`),
      orderBy('timestamp', 'desc'),
      limit(2000)
    );

    const unsub = onSnapshot(q, (snap) => {
      const records = snap.docs.map(doc => {
        const data = doc.data();
        let tsDate: Date | null = null;
        if (data.timestamp?.toDate) tsDate = data.timestamp.toDate();
        else if (data.timestamp?.seconds) tsDate = new Date(data.timestamp.seconds * 1000);
        else if (data.entryTime?.toDate) tsDate = data.entryTime.toDate();
        else if (data.entryTime) tsDate = new Date(data.entryTime);

        return {
          id: doc.id,
          ...data,
          timestamp: tsDate || new Date()
        } as TelemetryRecord;
      });

      setTelemetryLogs(records);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching page telemetry:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId]);

  // Filter logs by timeframe (and exclude any localhost/dev telemetry logs)
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return telemetryLogs.filter(log => {
      // Exclude localhost/dev entries
      if (log.hostname === 'localhost' || log.hostname === '127.0.0.1' || log.hostname?.includes('localhost')) {
        return false;
      }

      const logDate = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
      if (timeframe === 'today') {
        return logDate >= todayStart;
      } else if (timeframe === '7days') {
        const limit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return logDate >= limit;
      } else if (timeframe === '30days') {
        const limit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return logDate >= limit;
      }
      return true;
    });
  }, [telemetryLogs, timeframe]);

  // Format seconds to human-readable string (e.g. 1h 24m 10s or 45m 12s)
  const formatSec = (sec: number) => {
    if (!sec || sec <= 0) return '0s';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;

    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Top Level Metrics
  const topMetrics = useMemo(() => {
    const totalViews = filteredLogs.length;
    const totalDurationSec = filteredLogs.reduce((acc, r) => acc + (r.durationSeconds || 0), 0);
    const uniqueUsers = new Set(filteredLogs.map(r => r.userName || r.userUid)).size;

    // Find top page
    const pageCounts: Record<string, number> = {};
    filteredLogs.forEach(r => {
      pageCounts[r.pageId] = (pageCounts[r.pageId] || 0) + 1;
    });

    let topPageId = '--';
    let maxCount = 0;
    Object.entries(pageCounts).forEach(([pid, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        topPageId = pid;
      }
    });

    const topPageTitle = PAGE_NAME_MAP[topPageId]?.title || topPageId;

    return {
      totalViews,
      totalDurationSec,
      uniqueUsers,
      topPageTitle,
      topPageViews: maxCount
    };
  }, [filteredLogs]);

  // Page Views Breakdown Aggregation
  const pageStats = useMemo(() => {
    const stats: Record<string, { pageId: string; title: string; category: string; views: number; totalSec: number }> = {};

    filteredLogs.forEach(r => {
      const pid = r.pageId || 'unknown';
      if (!stats[pid]) {
        const info = PAGE_NAME_MAP[pid] || { title: pid, category: 'General' };
        stats[pid] = {
          pageId: pid,
          title: info.title,
          category: info.category,
          views: 0,
          totalSec: 0
        };
      }
      stats[pid].views += 1;
      stats[pid].totalSec += r.durationSeconds || 0;
    });

    let result = Object.values(stats);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p => p.title.toLowerCase().includes(q) || p.pageId.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }

    return result.sort((a, b) => b.totalSec - a.totalSec);
  }, [filteredLogs, searchQuery]);

  // User Breakdown Aggregation ("Who & How Long per Person")
  const userStats = useMemo(() => {
    const usersMap: Record<string, {
      userUid: string;
      userName: string;
      userEmail: string;
      totalViews: number;
      totalSec: number;
      lastActive: Date;
      pages: Record<string, { pageId: string; title: string; views: number; totalSec: number }>;
    }> = {};

    filteredLogs.forEach(r => {
      const uid = r.userName || r.userUid || 'Anonymous';
      if (!usersMap[uid]) {
        usersMap[uid] = {
          userUid: r.userUid || uid,
          userName: r.userName || 'Staff Member',
          userEmail: r.userEmail || '',
          totalViews: 0,
          totalSec: 0,
          lastActive: r.timestamp,
          pages: {}
        };
      }

      const u = usersMap[uid];
      u.totalViews += 1;
      u.totalSec += r.durationSeconds || 0;
      if (r.timestamp > u.lastActive) u.lastActive = r.timestamp;

      const pid = r.pageId || 'unknown';
      if (!u.pages[pid]) {
        const info = PAGE_NAME_MAP[pid] || { title: pid, category: 'General' };
        u.pages[pid] = {
          pageId: pid,
          title: info.title,
          views: 0,
          totalSec: 0
        };
      }
      u.pages[pid].views += 1;
      u.pages[pid].totalSec += r.durationSeconds || 0;
    });

    let result = Object.values(usersMap).map(u => ({
      ...u,
      pagesList: Object.values(u.pages).sort((a, b) => b.totalSec - a.totalSec)
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u => u.userName.toLowerCase().includes(q) || u.userEmail.toLowerCase().includes(q));
    }

    return result.sort((a, b) => b.totalSec - a.totalSec);
  }, [filteredLogs, searchQuery]);

  const toggleExpandUser = (uid: string) => {
    setExpandedUsers(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-950 font-sans text-xs select-none gap-6 overflow-auto min-h-screen text-zinc-100">
      
      {/* Header Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                Page Views & User Analytics
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                  DEV TOOL
                </span>
              </h1>
              <p className="text-xs text-zinc-400 font-medium">
                Track real-time page views, duration per route, and detailed user activity ("who visited what and for how long")
              </p>
            </div>
          </div>

          {/* Timeframe Filter Buttons */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 p-1 rounded-xl gap-1">
            <button
              onClick={() => setTimeframe('today')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                timeframe === 'today' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('7days')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                timeframe === '7days' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimeframe('30days')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                timeframe === '30days' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setTimeframe('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                timeframe === 'all' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              All Time
            </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-zinc-400 font-bold text-[11px]">
              <span>TOTAL PAGE VIEWS</span>
              <Eye className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">{topMetrics.totalViews.toLocaleString()}</div>
            <p className="text-[10px] text-zinc-500">Page entries recorded in timeframe</p>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-zinc-400 font-bold text-[11px]">
              <span>TOTAL TIME SPENT</span>
              <Clock className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">{formatSec(topMetrics.totalDurationSec)}</div>
            <p className="text-[10px] text-zinc-500">Combined duration across all users</p>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-zinc-400 font-bold text-[11px]">
              <span>ACTIVE USERS TRACKED</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">{topMetrics.uniqueUsers}</div>
            <p className="text-[10px] text-zinc-500">Unique staff members logged</p>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-zinc-400 font-bold text-[11px]">
              <span>TOP VISITED FEATURE</span>
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-sm font-black text-amber-300 truncate">{topMetrics.topPageTitle}</div>
            <p className="text-[10px] text-zinc-500">{topMetrics.topPageViews} page visits</p>
          </div>
        </div>

        {/* Tab Selection & Search Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 bg-zinc-950 p-1 border border-zinc-800 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveViewTab('pages')}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer",
                activeViewTab === 'pages' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              <Table className="w-4 h-4" />
              <span>Page Views & Duration</span>
            </button>

            <button
              onClick={() => setActiveViewTab('users')}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer",
                activeViewTab === 'users' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              )}
            >
              <Users className="w-4 h-4" />
              <span>User Activity ("Who & How Long")</span>
            </button>
          </div>

          {/* Search Filter Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={activeViewTab === 'pages' ? "Search page routes..." : "Search staff name or email..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20 text-zinc-500 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
            <span className="font-bold">Loading real-time telemetry logs...</span>
          </div>
        ) : activeViewTab === 'pages' ? (
          /* TAB 1: PAGE VIEWS & DURATION BREAKDOWN TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase font-black tracking-wider text-zinc-400 bg-zinc-950/60">
                  <th className="py-3 px-4">Page / Feature Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Total Views</th>
                  <th className="py-3 px-4 text-right">Total Time Spent</th>
                  <th className="py-3 px-4 text-right">Avg Time / View</th>
                  <th className="py-3 px-4 text-right">% App Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                {pageStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-zinc-500">
                      No telemetry logs found for the selected filter timeframe.
                    </td>
                  </tr>
                ) : (
                  pageStats.map(p => {
                    const avgSec = p.views > 0 ? Math.round(p.totalSec / p.views) : 0;
                    const pctOfTotal = topMetrics.totalDurationSec > 0 ? Math.round((p.totalSec / topMetrics.totalDurationSec) * 100) : 0;

                    return (
                      <tr key={p.pageId} className="hover:bg-zinc-800/30 transition">
                        <td className="py-3 px-4 font-sans font-bold text-white flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <div>
                            <div>{p.title}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">/{p.pageId}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-teal-400">
                          {p.views.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          {formatSec(p.totalSec)}
                        </td>
                        <td className="py-3 px-4 text-right text-zinc-300">
                          {formatSec(avgSec)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-zinc-800 h-2 rounded-full overflow-hidden">
                              <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(100, pctOfTotal)}%` }} />
                            </div>
                            <span className="font-bold text-zinc-300 text-[11px] w-8">{pctOfTotal}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* TAB 2: USER ACTIVITY BREAKDOWN ("WHO & HOW LONG PER PERSON") */
          <div className="space-y-3">
            {userStats.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 font-medium">
                No user telemetry activity recorded for the selected timeframe.
              </div>
            ) : (
              userStats.map(u => {
                const isExpanded = Boolean(expandedUsers[u.userUid]);
                return (
                  <div key={u.userUid} className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow">
                    {/* User Summary Header Bar */}
                    <div 
                      onClick={() => toggleExpandUser(u.userUid)}
                      className="p-4 flex items-center justify-between hover:bg-zinc-800/40 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-sans font-bold text-sm text-white flex items-center gap-2">
                            {u.userName}
                            {u.userEmail && <span className="text-xs font-normal text-zinc-400 font-mono">({u.userEmail})</span>}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            Last Active: {u.lastActive ? new Date(u.lastActive).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Pages Visited</div>
                          <div className="text-sm font-black text-teal-400 font-mono">{u.totalViews} views</div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Total Time Spent</div>
                          <div className="text-sm font-black text-emerald-400 font-mono">{formatSec(u.totalSec)}</div>
                        </div>

                        <div className="p-1 text-zinc-400 hover:text-white">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Per-Page Breakdown Table */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800/80 bg-zinc-900/50 p-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 mb-2.5 flex items-center gap-1.5">
                          <Table className="w-3.5 h-3.5" />
                          <span>Detailed Page Breakdown for {u.userName}</span>
                        </div>

                        <table className="w-full text-left font-sans text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 text-[9px] uppercase font-bold text-zinc-500">
                              <th className="py-2 px-3">Page Visited</th>
                              <th className="py-2 px-3 text-right">View Count</th>
                              <th className="py-2 px-3 text-right">Time Spent</th>
                              <th className="py-2 px-3 text-right">% of User's Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/40 font-mono">
                            {u.pagesList.map(p => {
                              const pctUserTime = u.totalSec > 0 ? Math.round((p.totalSec / u.totalSec) * 100) : 0;
                              return (
                                <tr key={p.pageId} className="hover:bg-zinc-800/20">
                                  <td className="py-2 px-3 font-sans font-medium text-zinc-200">
                                    {p.title} <span className="text-zinc-500 font-mono text-[10px]">({p.pageId})</span>
                                  </td>
                                  <td className="py-2 px-3 text-right text-teal-400 font-bold">
                                    {p.views}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                                    {formatSec(p.totalSec)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-zinc-400">
                                    {pctUserTime}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

    </div>
  );
}
