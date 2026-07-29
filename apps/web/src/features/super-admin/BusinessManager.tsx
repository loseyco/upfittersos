import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { submitAuditLog } from '../../lib/logging/audit';
import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { Plus, Building2, ExternalLink, AlertCircle, Activity, ChevronDown, ChevronUp, Eye, MapPin, Map, Loader2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '../../lib/hooks/usePageTitle';
import { toast } from 'sonner';
import { resolvePermissions } from '../../lib/auth/permissions';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Custom Leaflet staff marker icon
const staffMarkerIcon = L.divIcon({
  className: 'custom-staff-marker-icon',
  html: `<div style="background-color: #4f46e5; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden;"><span style="color: white; font-size: 14px; font-weight: bold; line-height: 1;">👤</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

interface Business {
  id: string;
  name: string;
  createdAt: any;
}

interface FeedbackStats {
  openBugs: number;
  openFeatures: number;
  totalOpen: number;
}

function BusinessAnalyticsRow({ business, onImpersonate }: { business: Business; onImpersonate: (user: any) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch active staff
  const { data: staff, isLoading: isStaffLoading } = useQuery({
    queryKey: ['staff-analytics', business.id],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${business.id}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived);
    },
    enabled: isOpen
  });

  // Fetch recent audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ['audit-logs-analytics', business.id],
    queryFn: async () => {
      const snap = await getDocs(query(
        collection(db, `businesses/${business.id}/audit_logs`),
        orderBy('timestamp', 'desc'),
        limit(150)
      ));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    },
    enabled: isOpen
  });

  // Fetch recent time sessions
  const { data: timeSessions } = useQuery({
    queryKey: ['time-sessions-analytics', business.id],
    queryFn: async () => {
      const snap = await getDocs(query(
        collection(db, `businesses/${business.id}/time_sessions`),
        orderBy('clockIn.timestamp', 'desc'),
        limit(50)
      ));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    },
    enabled: isOpen
  });

  // Compute metrics per active user
  const userStats = staff?.map(member => {
    const memberLogs = auditLogs?.filter(log => 
      (member.userId && log.userId === member.userId) || 
      (log.userId === member.email) ||
      (log.details?.email === member.email)
    ) || [];

    const memberSessions = timeSessions?.filter(s => 
      (member.userId && s.userId === member.userId) || 
      (s.userName?.toLowerCase() === `${member.firstName} ${member.lastName}`.toLowerCase())
    ) || [];

    let lastActiveTime: Date | null = null;
    let lastAction = 'No recorded activity';
    let userAgent = '';

    if (memberLogs.length > 0) {
      const latestLog = memberLogs[0];
      const ts = latestLog.timestamp?.toMillis ? latestLog.timestamp.toMillis() : new Date(latestLog.timestamp).getTime();
      lastActiveTime = new Date(ts);
      lastAction = `${latestLog.actionType}${latestLog.details?.action ? `: ${latestLog.details.action}` : ''}`;
      userAgent = latestLog.userAgent || '';
    }

    const isClockedIn = memberSessions.some(s => s.status === 'active');
    if (isClockedIn && memberSessions.length > 0) {
      const activeSession = memberSessions.find(s => s.status === 'active');
      const clockInTs = activeSession.clockIn?.timestamp?.toMillis ? activeSession.clockIn.timestamp.toMillis() : new Date(activeSession.clockIn?.timestamp).getTime();
      const clockInDate = new Date(clockInTs);
      if (!lastActiveTime || clockInDate > lastActiveTime) {
        lastActiveTime = clockInDate;
        lastAction = 'Clocked In';
      }
    }

    let status: 'now' | 'today' | 'idle' | 'inactive' = 'inactive';
    if (lastActiveTime) {
      const diffMin = (Date.now() - lastActiveTime.getTime()) / 60000;
      if (diffMin <= 15) {
        status = 'now';
      } else if (diffMin <= 1440) {
        status = 'today';
      } else if (diffMin <= 10080) {
        status = 'idle';
      }
    }

    return {
      ...member,
      isClockedIn,
      lastActiveTime,
      lastAction,
      userAgent,
      actionCount: memberLogs.length,
      status
    };
  }) || [];

  const activeNowCount = userStats.filter(u => u.status === 'now').length;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden mb-4 transition-all">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-6 flex items-center justify-between cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center shadow-sm">
            <Building2 className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">{business.name}</h4>
            <p className="text-xs text-zinc-400 mt-1">Tenant ID: {business.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <div className="text-right">
              <span className="block text-zinc-500 dark:text-zinc-400 text-xs">Total Staff</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff?.length !== undefined ? staff.length : '--'}</span>
            </div>
            <div className="text-right">
              <span className="block text-emerald-500 text-xs">Active Now</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{isOpen ? activeNowCount : '--'}</span>
            </div>
          </div>

          <div className="text-zinc-400">
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 p-6 space-y-6">
          {isStaffLoading ? (
            <div className="text-center py-8 text-zinc-500 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Loading analytics details...
            </div>
          ) : userStats.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 italic">No registered staff found for this business.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-4">User</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Timeclock</th>
                    <th className="p-4">Last Activity / Event</th>
                    <th className="p-4">Client Agent</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {userStats.map((user) => {
                    const statusKey = (user.status || 'inactive') as 'now' | 'today' | 'idle' | 'inactive';
                    const statusConfig = {
                      now: { label: 'Active Now', bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20', dot: 'bg-emerald-500 animate-pulse' },
                      today: { label: 'Active Today', bg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20', dot: 'bg-teal-500' },
                      idle: { label: 'Idle (This Week)', bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20', dot: 'bg-amber-500' },
                      inactive: { label: 'Inactive', bg: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20', dot: 'bg-zinc-400' }
                    }[statusKey];

                    const clientBrowser = user.userAgent 
                      ? user.userAgent.includes('Chrome') ? 'Chrome' 
                        : user.userAgent.includes('Safari') ? 'Safari' 
                        : user.userAgent.includes('Firefox') ? 'Firefox' 
                        : 'Mobile/App' 
                      : 'Unknown';

                    const clientOS = user.userAgent 
                      ? user.userAgent.includes('Windows') ? 'Windows' 
                        : user.userAgent.includes('Macintosh') ? 'MacOS' 
                        : user.userAgent.includes('Android') ? 'Android' 
                        : user.userAgent.includes('iPhone') ? 'iOS' 
                        : 'Linux'
                      : 'Unknown';

                    return (
                      <tr key={user.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-zinc-900 dark:text-white">{user.firstName} {user.lastName}</div>
                          <div className="text-xs text-zinc-400 font-mono mt-0.5">{user.email}</div>
                          <div className="text-[10px] text-indigo-500 uppercase font-black mt-1 tracking-tight">
                            {user.role || 'Staff'} {user.techNumber ? `• Tech #${user.techNumber}` : ''}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusConfig.bg}`}>
                            <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="p-4">
                          {user.isClockedIn ? (
                            <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-600 uppercase">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                              Clocked In
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400 italic font-medium">Clocked Out</span>
                          )}
                        </td>
                        <td className="p-4 max-w-xs">
                          <div className="text-xs text-zinc-700 dark:text-zinc-300 font-medium truncate">{user.lastAction}</div>
                          <div className="text-[10px] text-zinc-400 font-mono mt-1">
                            {user.lastActiveTime ? user.lastActiveTime.toLocaleString() : 'Never'}
                          </div>
                        </td>
                        <td className="p-4">
                          {user.userAgent ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-zinc-700 dark:text-zinc-300 font-semibold">{clientBrowser}</span>
                              <span className="text-[10px] text-zinc-400 font-medium">{clientOS}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">--</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => onImpersonate(user)}
                            className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors border border-emerald-500/10 flex items-center gap-1 ml-auto"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Impersonate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BusinessManager() {
  usePageTitle('Platform Administration');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newBusinessName, setNewBusinessName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'tenants' | 'analytics' | 'locations'>('tenants');
  const [selectedLocationBusinessId, setSelectedLocationBusinessId] = useState<string>('');
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(13);

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'businesses'));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business));
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['feedback_stats'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'feedback_reports'));
      const reports = snap.docs.map(doc => doc.data());
      const openReports = reports.filter(r => r.status === 'open');
      
      return {
        openBugs: openReports.filter(r => r.type === 'bug').length,
        openFeatures: openReports.filter(r => r.type === 'feature').length,
        totalOpen: openReports.length
      } as FeedbackStats;
    }
  });

  const { data: staffLocations, isLoading: isStaffLocationsLoading } = useQuery({
    queryKey: ['staff-locations', selectedLocationBusinessId],
    queryFn: async () => {
      if (!selectedLocationBusinessId) return [];
      const snap = await getDocs(collection(db, `businesses/${selectedLocationBusinessId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && s.lastLocation && s.lastLocation.lat !== null && s.lastLocation.lng !== null);
    },
    enabled: activeTab === 'locations' && !!selectedLocationBusinessId
  });

  useEffect(() => {
    if (activeTab === 'locations' && !selectedLocationBusinessId && businesses && businesses.length > 0) {
      setSelectedLocationBusinessId(businesses[0].id);
    }
  }, [activeTab, businesses, selectedLocationBusinessId]);

  useEffect(() => {
    if (staffLocations && staffLocations.length > 0) {
      const firstLoc = staffLocations[0].lastLocation;
      setMapCenter([firstLoc.lat, firstLoc.lng]);
    } else {
      setMapCenter(null);
    }
  }, [staffLocations]);

  const handleAddBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusinessName.trim() || !user) return;
    setIsAdding(true);
    try {
      const docRef = await addDoc(collection(db, 'businesses'), {
        name: newBusinessName,
        createdAt: serverTimestamp(),
      });
      
      await submitAuditLog('GLOBAL', {
        userId: user.uid,
        actionType: 'DATA_MUTATION',
        targetEntityId: docRef.id,
        details: { action: 'CREATED_BUSINESS', businessName: newBusinessName }
      });
      
      setNewBusinessName('');
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      toast.success('Business provisioned successfully.');
    } catch (err) {
      console.error('Failed to create business:', err);
      toast.error('Failed to provision business.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleImpersonate = async (businessId: string, staffMember: any) => {
    try {
      let departmentPermissions = {};
      if (staffMember.departmentId) {
        const deptSnap = await getDoc(doc(db, `businesses/${businessId}/departments`, staffMember.departmentId));
        if (deptSnap.exists()) {
          departmentPermissions = deptSnap.data().permissions || {};
        }
      }
      
      const resolved = resolvePermissions(departmentPermissions, staffMember.individualPermissions);
      useAuthStore.getState().impersonate({
        id: staffMember.id,
        name: `${staffMember.firstName} ${staffMember.lastName}`,
        permissions: resolved,
        type: 'staff'
      });
      toast.success(`Viewing platform as ${staffMember.firstName}`);
      navigate(`/business/${businessId}`);
    } catch (err) {
      console.error('Failed to impersonate:', err);
      toast.error('Failed to impersonate user.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col transition-colors">
      <TopNav />
      <div className="p-8 flex-1 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Platform Hub</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage global tenant instances and monitor activity.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (businesses && businesses.length > 0) {
                  navigate(`/business/${businesses[0].id}/permission_matrix`);
                } else {
                  navigate('/super-admin/permissions');
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Permission Matrix</span>
            </button>
            <button
              onClick={() => navigate('/super-admin/feedback')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold transition-colors border border-indigo-600/20 cursor-pointer"
            >
              View Feedback Reports
            </button>
          </div>
        </div>

        {/* Platform Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div 
            onClick={() => {
              if (businesses && businesses.length > 0) {
                navigate(`/business/${businesses[0].id}/permission_matrix`);
              } else {
                navigate('/super-admin/permissions');
              }
            }}
            className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-indigo-500/50 transition-colors"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Permission Matrix</p>
              <p className="text-lg font-black text-indigo-650 dark:text-indigo-400 mt-1">Audit & Toggle</p>
            </div>
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
              <ShieldCheck size={24} />
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Tenants</p>
              <p className="text-2xl font-bold dark:text-white mt-1">{businesses?.length || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
              <Building2 size={24} />
            </div>
          </div>
          
          <div 
            onClick={() => navigate('/super-admin/feedback')}
            className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-indigo-500/50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Open Feedback</p>
              <p className="text-2xl font-bold dark:text-white mt-1">{stats?.totalOpen || 0}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
              <ExternalLink size={24} />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Active Bugs</p>
              <p className="text-2xl font-bold text-rose-500 mt-1">{stats?.openBugs || 0}</p>
            </div>
            <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500">
              <AlertCircle size={24} />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-8 gap-6">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 flex items-center gap-2 ${
              activeTab === 'tenants' 
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Tenants
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 flex items-center gap-2 ${
              activeTab === 'analytics' 
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            User Analytics
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 flex items-center gap-2 ${
              activeTab === 'locations' 
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
            User Locations
          </button>
        </div>

        {activeTab === 'tenants' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Create Business Form */}
            <div className="lg:col-span-1 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 bg-white dark:bg-zinc-900 h-fit shadow-sm">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-500" />
                New Tenant
              </h2>
              <form onSubmit={handleAddBusiness} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Business Name</label>
                  <input
                    type="text"
                    value={newBusinessName}
                    onChange={(e) => setNewBusinessName(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all dark:text-white"
                    placeholder="e.g. SAE Customs"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isAdding ? 'Provisioning...' : 'Provision Business'}
                </button>
              </form>
            </div>

            {/* Business List */}
            <div className="lg:col-span-3">
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                {isLoading ? (
                  <div className="p-8 text-center text-zinc-500">Loading tenants...</div>
                ) : businesses?.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                      <Building2 className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-medium text-zinc-900 dark:text-white">No active tenants</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">Provision your first business entity to begin.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {businesses?.map((b) => (
                      <div key={b.id} className="p-6 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center shadow-sm">
                            <Building2 className="w-6 h-6 text-indigo-500" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">{b.name}</h4>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/business/${b.id}`)}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
                          >
                            Access OS
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500 animate-pulse" />
                Global User Presence & Activity
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Monitor real-time adoption, user presence states, timeclock sessions, and platform event logs across all business instances.
              </p>
            </div>

            <div className="space-y-4">
              {businesses?.map((b) => (
                <BusinessAnalyticsRow 
                  key={b.id} 
                  business={b} 
                  onImpersonate={(staffMember) => handleImpersonate(b.id, staffMember)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in fade-in duration-300">
            {/* Sidebar for staff list */}
            <div className="lg:col-span-1 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 bg-white dark:bg-zinc-900 shadow-sm flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Select Tenant</label>
                <select
                  value={selectedLocationBusinessId}
                  onChange={(e) => {
                    setSelectedLocationBusinessId(e.target.value);
                    setMapCenter(null);
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-white"
                >
                  <option value="">-- Choose Business --</option>
                  {businesses?.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-850 pt-4 flex-1">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Staff Locations</h3>
                {isStaffLocationsLoading ? (
                  <div className="flex items-center justify-center py-8 text-zinc-500 text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    Loading staff locations...
                  </div>
                ) : !staffLocations || staffLocations.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 italic py-4">No staff members have location updates yet.</p>
                ) : (
                  <div className="space-y-2">
                    {staffLocations.map((staff: any) => (
                      <div
                        key={staff.id}
                        onClick={() => {
                          if (staff.lastLocation) {
                            setMapCenter([staff.lastLocation.lat, staff.lastLocation.lng]);
                            setMapZoom(16);
                          }
                        }}
                        className="p-3 border border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-750 bg-zinc-50/50 dark:bg-zinc-950/20 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 rounded-xl cursor-pointer transition-all"
                      >
                        <div className="font-semibold text-zinc-900 dark:text-white text-sm">
                          {staff.firstName} {staff.lastName}
                        </div>
                        <div className="text-[10px] text-indigo-500 uppercase font-black mt-0.5">
                          {staff.role || 'Staff'} {staff.techNumber ? `• Tech #${staff.techNumber}` : ''}
                        </div>
                        {staff.lastLocation && (
                          <div className="mt-2 text-xs border-t border-zinc-100 dark:border-zinc-850 pt-2 text-zinc-500 dark:text-zinc-400">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Action:</span> {staff.lastLocation.action}
                            <span className="block text-[9px] text-zinc-400 font-mono mt-1">
                              {staff.lastLocation.updatedAt?.toDate 
                                ? staff.lastLocation.updatedAt.toDate().toLocaleString() 
                                : new Date(staff.lastLocation.updatedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Map Container */}
            <div className="lg:col-span-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden h-[70vh] relative z-0">
              {mapCenter ? (
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  className="w-full h-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {staffLocations?.map((staff: any) => (
                    <Marker
                      key={staff.id}
                      position={[staff.lastLocation.lat, staff.lastLocation.lng]}
                      icon={staffMarkerIcon}
                    >
                      <Popup>
                        <div className="text-zinc-900 p-1">
                          <h4 className="font-bold text-sm">{staff.firstName} {staff.lastName}</h4>
                          <p className="text-[10px] text-indigo-600 font-black uppercase mt-0.5">{staff.role || 'Staff'} {staff.techNumber ? `• Tech #${staff.techNumber}` : ''}</p>
                          <div className="mt-2 text-xs border-t border-zinc-100 pt-1.5 space-y-1">
                             <p><strong>Last Action:</strong> {staff.lastLocation.action}</p>
                             <p><strong>Source:</strong> {staff.lastLocation.type === 'ip' ? 'IP Address (Approximate)' : 'GPS Device (High Accuracy)'}</p>
                             <p><strong>Time:</strong> {staff.lastLocation.updatedAt?.toDate ? staff.lastLocation.updatedAt.toDate().toLocaleString() : new Date(staff.lastLocation.updatedAt).toLocaleString()}</p>
                             {staff.lastLocation.accuracy && (
                               <p className="text-[10px] text-zinc-400"><strong>Accuracy:</strong> ±{Math.round(staff.lastLocation.accuracy)}m</p>
                             )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  <MapController center={mapCenter} zoom={mapZoom} />
                </MapContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center text-zinc-400 bg-zinc-50 dark:bg-zinc-950/20">
                  <Map className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
                  <p className="text-sm">No locations available to display on the map.</p>
                  <p className="text-xs text-zinc-500 mt-1">Select a tenant or wait for staff to clock in/out or start a task.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
