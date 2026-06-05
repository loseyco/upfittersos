import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  collection, doc, getDoc, getDocs, query, where, 
  addDoc, deleteDoc, updateDoc, serverTimestamp, onSnapshot, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  ArrowLeft, User, Calendar, Mail, ShieldCheck, ShieldAlert, Trophy, 
  Edit2, Archive, Eye, Trash2, Smile, Frown, Users, 
  Send, Loader2, MessageSquare, Clock, MapPin, DollarSign, Activity, FileText,
  Warehouse, Package, Truck, Briefcase, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { StaffEditModal } from './StaffManager';
import type { StaffMember, Department } from './StaffManager';
import { TimeSessionEditorModal } from '../timeclock/TimeSessionEditorModal';

interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  message: string;
  createdAt: any;
  isRead: boolean;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  clockIn: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  clockOut?: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  isRemote?: boolean;
  breaks: Array<{
    type: 'lunch' | 'normal';
    start: any;
    end?: any;
    isPaid: boolean;
  }>;
  jobs?: Array<{
    id: string;
    name: string;
    start: any;
    end?: any;
    taskId?: string | null;
    taskName?: string | null;
    bookTime?: number;
  }>;
  status: string;
  verificationStatus?: string;
}

export function StaffProfilePage({ tenantId, staffId }: { tenantId: string; staffId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // States
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'timeclock' | 'messages'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);

  // Incident log form state
  const [incidentType, setIncidentType] = useState<'good' | 'bad'>('good');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [loggingIncident, setLoggingIncident] = useState(false);

  // Direct Message state
  const [dmText, setDmText] = useState('');
  const [sendingDm, setSendingDm] = useState(false);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);

  // Set active tab from query parameter on mount if present (e.g., ?tab=messages)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'messages' || tabParam === 'overview' || tabParam === 'timeline' || tabParam === 'timeclock') {
      setActiveTab(tabParam as any);
    }
  }, []);

  // Fetch the viewed staff member
  const { data: staff, isLoading: loadingStaff } = useQuery<StaffMember | null>({
    queryKey: ['staff-profile', tenantId, staffId],
    queryFn: async () => {
      const docSnap = await getDoc(doc(db, `businesses/${tenantId}/staff`, staffId));
      return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as StaffMember) : null;
    }
  });

  // Fetch all staff members (for direct message threads or naming lookup)
  const { data: staffList } = useQuery<StaffMember[]>({
    queryKey: ['staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
    }
  });

  // Find the logged-in user's own staff document
  const { data: myStaffRecord } = useQuery<StaffMember | null>({
    queryKey: ['my-staff-record', tenantId, user?.uid],
    queryFn: async () => {
      if (!user?.uid || !tenantId) return null;
      let q = query(collection(db, `businesses/${tenantId}/staff`), where('userId', '==', user.uid));
      let snap = await getDocs(q);
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as StaffMember;
      
      if (user.email) {
        q = query(collection(db, `businesses/${tenantId}/staff`), where('email', '==', user.email.toLowerCase()));
        snap = await getDocs(q);
        if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as StaffMember;
      }
      return null;
    },
    enabled: !!user?.uid && !!tenantId
  });

  // Fetch department
  const { data: department } = useQuery<Department | null>({
    queryKey: ['department-profile', tenantId, staff?.departmentId],
    queryFn: async () => {
      if (!staff?.departmentId) return null;
      const snap = await getDoc(doc(db, `businesses/${tenantId}/departments`, staff.departmentId));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Department) : null;
    },
    enabled: !!staff?.departmentId
  });

  // Fetch all departments (for edit modal context)
  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
    }
  });

  // Permissions settings for this page
  const isSelf = myStaffRecord?.id === staffId;
  const isAdmin = isSuperAdmin || permissions['staff.manage'] === true;
  const canViewSensitiveInfo = isAdmin || isSelf;

  // Q&A System removed as direct messaging is used

  // Real-time manager incident logs subscription
  const [incidentLogs, setIncidentLogs] = useState<any[]>([]);
  const [loadingIncidentLogs, setLoadingIncidentLogs] = useState(false);
  useEffect(() => {
    if (!tenantId || !staffId || !isAdmin) return;
    setLoadingIncidentLogs(true);
    const q = query(
      collection(db, `businesses/${tenantId}/staff_logs`),
      where('staffId', '==', staffId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a: any, b: any) => {
        const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setIncidentLogs(list);
      setLoadingIncidentLogs(false);
    }, (err) => {
      console.error(err);
      setLoadingIncidentLogs(false);
    });
    return () => unsub();
  }, [tenantId, staffId, isAdmin]);

  // Direct Messages subscription
  useEffect(() => {
    if (!tenantId || !myStaffRecord?.id) return;

    let q;
    if (isSelf) {
      // Load all direct messages where current user is sender or recipient
      q = query(
        collection(db, `businesses/${tenantId}/staff_direct_messages`),
        orderBy('createdAt', 'asc')
      );
    } else {
      // Load conversation thread between me and the viewed staff member
      const conversationId = [myStaffRecord.id, staffId].sort().join('_');
      q = query(
        collection(db, `businesses/${tenantId}/staff_direct_messages`),
        where('conversationId', '==', conversationId),
        orderBy('createdAt', 'asc')
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DirectMessage));
      
      if (isSelf) {
        // Group by conversation and sort messages by createdAt asc in-memory
        setDirectMessages(list);
      } else {
        setDirectMessages(list);
      }
    }, (err) => {
      console.error("Direct messages listener error:", err);
    });

    return () => unsub();
  }, [tenantId, myStaffRecord?.id, staffId, isSelf]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [directMessages, activeChatUserId, activeTab]);

  // Fetch operational timeline audit logs
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  useEffect(() => {
    if (!tenantId || !staff) return;
    setLoadingTimeline(true);

    const staffName = `${staff.firstName} ${staff.lastName}`;
    const sources = [
      { path: `businesses/${tenantId}/zone_assignments`, type: 'zone_move' },
      { path: `businesses/${tenantId}/jobs`, type: 'job' },
      { path: `businesses/${tenantId}/parts_requests`, type: 'parts' },
      { path: `businesses/${tenantId}/shipments`, type: 'shipment' },
      { path: `businesses/${tenantId}/time_sessions`, type: 'time_session' }
    ];

    const fetchAll = async () => {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const q = query(
              collection(db, source.path),
              limit(150)
            );
            const snap = await getDocs(q);
            return snap.docs.map(doc => {
              const data = doc.data();
              const isMatch = 
                data.createdBy === staffId || 
                data.assignedBy === staffId || 
                data.userId === staffId ||
                data.createdByName === staffName || 
                data.assignedByName === staffName ||
                data.requestedBy === staffName ||
                data.userName === staffName;

              if (!isMatch) return null;

              return {
                id: doc.id,
                type: source.type,
                timestamp: data.createdAt || data.assignedAt || data.clockIn?.timestamp || data.updatedAt,
                title: source.type.replace('_', ' ').toUpperCase(),
                message: data.message || data.notes || data.title || data.partName || data.trackingNumber || 'Performed operational action',
                author: staffName
              };
            }).filter(Boolean);
          } catch (e) {
            return [];
          }
        })
      );

      const merged = results.flat()
        .sort((a: any, b: any) => {
          const tsA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
          const tsB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
          return tsB - tsA;
        })
        .slice(0, 50);

      setActivities(merged);
      setLoadingTimeline(false);
    };

    fetchAll();
  }, [tenantId, staff, staffId]);

  // Fetch Timeclock sessions
  const { data: timeSessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery<TimeSession[]>({
    queryKey: ['timeclock-sessions', tenantId, staff?.userId, staff?.firstName],
    queryFn: async () => {
      const queryList = [];
      
      // Query by userId if linked
      if (staff?.userId) {
        const q = query(
          collection(db, `businesses/${tenantId}/time_sessions`),
          where('userId', '==', staff.userId),
          orderBy('clockIn.timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        queryList.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeSession)));
      }

      // Query by staffName as fallback
      const staffName = `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim();
      if (staffName && queryList.length === 0) {
        const q = query(
          collection(db, `businesses/${tenantId}/time_sessions`),
          where('userName', '==', staffName),
          orderBy('clockIn.timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        queryList.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeSession)));
      }

      // De-duplicate just in case
      const seen = new Set();
      return queryList.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    },
    enabled: !!staff
  });

  // Impersonate Action
  const handleImpersonate = () => {
    if (!staff) return;
    const resolvedPerms = resolvedPermissions;
    useAuthStore.getState().impersonate({
      id: staff.id,
      name: `${staff.firstName} ${staff.lastName}`,
      permissions: resolvedPerms,
      type: 'staff'
    });
    toast.success(`Viewing as ${staff.firstName}`);
    navigate(`/business/${tenantId}/overview`);
  };

  // Archive Action
  const handleArchive = async () => {
    if (!staff) return;
    if (!window.confirm(`Are you sure you want to archive ${staff.firstName}? They will no longer be able to log in or appear in active lists.`)) return;

    try {
      await updateDoc(doc(db, `businesses/${tenantId}/staff`, staff.id), { isArchived: true });
      toast.success("Staff member archived");
      queryClient.invalidateQueries({ queryKey: ['staff-profile', tenantId, staffId] });
      navigate(-1);
    } catch (e) {
      toast.error("Failed to archive staff member");
    }
  };

  // Resolve Permissions
  const resolvedPermissions = useMemo(() => {
    const deptPerms = department?.permissions || {};
    const indPerms = staff?.individualPermissions || {};
    const resolved: Record<string, boolean> = { ...deptPerms };
    Object.entries(indPerms).forEach(([k, v]) => {
      if (v !== undefined) {
        resolved[k] = !!v;
      }
    });
    return resolved;
  }, [department, staff]);

  // Incidents Action Log writing
  const handleAddIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentDesc.trim() || !staff) return;

    setLoggingIncident(true);
    try {
      const staffName = `${staff.firstName} ${staff.lastName}`.trim();
      await addDoc(collection(db, `businesses/${tenantId}/staff_logs`), {
        staffId,
        staffName,
        type: incidentType,
        description: incidentDesc.trim(),
        imageUrl: null,
        loggedByUid: user?.uid || null,
        loggedByName: user?.displayName || user?.email || 'Admin',
        createdAt: serverTimestamp(),
      });

      toast.success(`Incident logged for ${staffName}!`);
      setIncidentDesc('');
    } catch (err) {
      console.error(err);
      toast.error("Failed to log incident");
    } finally {
      setLoggingIncident(false);
    }
  };

  const handleDeleteIncident = async (logId: string) => {
    if (!window.confirm("Are you sure you want to delete this incident log?")) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/staff_logs`, logId));
      toast.success("Incident log deleted successfully.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete log entry.");
    }
  };



  // Direct Message writing
  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dmText.trim() || !myStaffRecord || !staff) return;

    const targetRecipientId = isSelf ? activeChatUserId : staffId;
    if (!targetRecipientId) return;

    const targetRecipient = staffList?.find(s => s.id === targetRecipientId);
    if (!targetRecipient) return;

    setSendingDm(true);
    try {
      const conversationId = [myStaffRecord.id, targetRecipientId].sort().join('_');
      await addDoc(collection(db, `businesses/${tenantId}/staff_direct_messages`), {
        conversationId,
        senderId: myStaffRecord.id,
        senderName: `${myStaffRecord.firstName} ${myStaffRecord.lastName}`,
        recipientId: targetRecipientId,
        recipientName: `${targetRecipient.firstName} ${targetRecipient.lastName}`,
        message: dmText.trim(),
        createdAt: serverTimestamp(),
        isRead: false
      });
      setDmText('');
    } catch (err) {
      console.error(err);
      toast.error("Failed to send message");
    } finally {
      setSendingDm(false);
    }
  };

  // In-memory conversation grouping (for self inbox)
  const conversationInbox = useMemo(() => {
    if (!isSelf || !myStaffRecord?.id || !directMessages.length) return [];
    
    // Group messages by conversation ID
    const groups: Record<string, { partnerId: string; partnerName: string; lastMessage: DirectMessage }> = {};
    
    directMessages.forEach(msg => {
      const partnerId = msg.senderId === myStaffRecord.id ? msg.recipientId : msg.senderId;
      const partnerName = msg.senderId === myStaffRecord.id ? msg.recipientName : msg.senderName;
      
      if (!groups[msg.conversationId] || (msg.createdAt && (!groups[msg.conversationId].lastMessage.createdAt || new Date(msg.createdAt.toDate ? msg.createdAt.toDate() : msg.createdAt).getTime() > new Date(groups[msg.conversationId].lastMessage.createdAt.toDate ? groups[msg.conversationId].lastMessage.createdAt.toDate() : groups[msg.conversationId].lastMessage.createdAt).getTime()))) {
        groups[msg.conversationId] = {
          partnerId,
          partnerName,
          lastMessage: msg
        };
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      const aTime = a.lastMessage.createdAt?.toDate ? a.lastMessage.createdAt.toDate().getTime() : new Date(a.lastMessage.createdAt || 0).getTime();
      const bTime = b.lastMessage.createdAt?.toDate ? b.lastMessage.createdAt.toDate().getTime() : new Date(b.lastMessage.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [directMessages, isSelf, myStaffRecord?.id]);

  // Messages display for active chat
  const chatMessagesToShow = useMemo(() => {
    if (!myStaffRecord?.id) return [];
    
    if (!isSelf) {
      return directMessages;
    }
    
    if (!activeChatUserId) return [];
    const conversationId = [myStaffRecord.id, activeChatUserId].sort().join('_');
    return directMessages.filter(msg => msg.conversationId === conversationId);
  }, [directMessages, isSelf, activeChatUserId, myStaffRecord?.id]);

  if (loadingStaff) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 animate-pulse">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">Loading Staff Profile...</span>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Profile Not Found</h3>
        <p className="text-zinc-500 mt-2">The staff member document does not exist or has been removed.</p>
        <button onClick={() => navigate(-1)} className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 mx-auto">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  const staffFullName = `${staff.firstName} ${staff.lastName}`;
  const isQB = staff.tags?.includes('QuickBooks') || 
               staff.notes?.includes('Imported via QBWC') || 
               !!staff.ListID || !!staff.qb_ListID || 
               !!staff.quickbooksId;

  return (
    <div className="space-y-6">
      {/* Back button & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors w-fit group"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm">Back to directory</span>
        </button>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {isAdmin && !isSelf && (
            <button 
              onClick={handleImpersonate}
              className="p-2.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 rounded-xl transition-all"
              title="View As Staff Member"
            >
              <Eye className="w-4.5 h-4.5" />
            </button>
          )}
          {isAdmin && !isQB && (
            <button 
              onClick={handleArchive}
              className="p-2.5 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-xl transition-all"
              title="Archive Staff Member"
            >
              <Archive className="w-4.5 h-4.5" />
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => navigate(`/business/${tenantId}/performance?staffName=${encodeURIComponent(staffFullName)}`)}
              className="p-2.5 text-amber-600 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 rounded-xl transition-all"
              title="View Performance"
            >
              <Trophy className="w-4.5 h-4.5" />
            </button>
          )}
          {canViewSensitiveInfo && (
            <button 
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md active:scale-95"
            >
              <Edit2 className="w-4 h-4" /> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Profile Overview Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Initials Avatar */}
        <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-indigo-600/20 shrink-0">
          <span>{staff.firstName[0]}{staff.lastName[0]}</span>
        </div>

        {/* Title and metadata */}
        <div className="text-center md:text-left space-y-2 flex-1">
          <div className="flex flex-col md:flex-row md:items-center gap-2.5">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">{staffFullName}</h2>
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-md">
                Active Member
              </span>
              {department && (
                <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase tracking-wider rounded-md">
                  {department.name}
                </span>
              )}
            </div>
          </div>
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            {staff.jobTitle || 'Technician'} {staff.role ? `• ${staff.role}` : ''}
          </p>
          {staff.techNumber && (
            <p className="text-xs text-zinc-400 font-bold">
              Tech Number: <span className="text-indigo-500">#{staff.techNumber}</span>
            </p>
          )}
        </div>
      </div>

      {/* Disclaimer Banner */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 text-amber-800 dark:text-amber-300">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm font-semibold">
          <p className="font-bold text-xs uppercase tracking-wider">Page Under Construction</p>
          <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5 font-medium">
            This staff profile page is still being built and the details may not be fully accurate. Official/direct conversations with Admins always override the details shown here.
          </p>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Tab Buttons Column */}
        <div className="flex flex-row lg:flex-col bg-white dark:bg-zinc-900 p-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-x-auto no-scrollbar lg:space-y-1">
          {[
            { id: 'overview', label: 'Overview & Settings', icon: User },
            (isSelf || isAdmin) && { id: 'timeline', label: 'Timeline & Logs', icon: Activity },
            (isSelf || isAdmin) && { id: 'timeclock', label: 'Timeclock History', icon: Clock },
            { id: 'messages', label: isSelf ? 'Direct Messages (Inbox)' : 'Message Staff', icon: MessageSquare },
          ]
            .filter((tab): tab is { id: 'overview' | 'timeline' | 'timeclock' | 'messages'; label: string; icon: any } => !!tab)
            .map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                )}
              >
                <tab.icon className="w-4.5 h-4.5 shrink-0" />
                <span className="hidden sm:inline lg:inline">{tab.label}</span>
              </button>
            ))}
        </div>

        {/* Tab Content Column */}
        <div className="lg:col-span-3 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <Mail className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold text-zinc-900 dark:text-white">Contact Information</h3>
                  </div>
                  <div className="space-y-3.5">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Email Address</span>
                      <a href={`mailto:${staff.email}`} className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 break-all">{staff.email}</a>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Phone Number</span>
                      <a href={`tel:${staff.phone}`} className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:text-indigo-600">{staff.phone || '--'}</a>
                    </div>
                  </div>
                </div>

                {/* Reporting & Tools Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <Users className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold text-zinc-900 dark:text-white">Reporting & Tools</h3>
                  </div>
                  <div className="space-y-3.5">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Manager / Reports To</span>
                      {(() => {
                        const managerId = staff?.reportsToId || department?.defaultReportsToId;
                        const manager = staffList?.find(s => s.id === managerId);
                        return manager ? (
                          <button 
                            onClick={() => navigate(`/business/${tenantId}/staff/${manager.id}`)}
                            className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline text-left"
                          >
                            {manager.firstName} {manager.lastName}
                          </button>
                        ) : (
                          <span className="text-sm text-zinc-400 italic">No direct manager assigned</span>
                        );
                      })()}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Backup / Alternate Contact</span>
                      {(() => {
                        const backupId = staff?.backupStaffId || department?.defaultBackupStaffId;
                        const backup = staffList?.find(s => s.id === backupId);
                        return backup ? (
                          <button 
                            onClick={() => navigate(`/business/${tenantId}/staff/${backup.id}`)}
                            className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline text-left"
                          >
                            {backup.firstName} {backup.lastName}
                          </button>
                        ) : (
                          <span className="text-sm text-zinc-400 italic">No backup contact assigned</span>
                        );
                      })()}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Decision & Purchase Authority</span>
                      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {staff?.purchasingAuthority || department?.defaultPurchasingAuthority || 'Standard operational authority only'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Uniform Sizes (Restricted) */}
                {canViewSensitiveInfo && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-zinc-900 dark:text-white">Uniform Sizes</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-sm">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Shirt Size</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.shirtSize || '--'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Hat Size</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.hatSize || '--'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Pants Size</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.pantsSize || '--'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Shoe Size</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.shoeSize || '--'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Glove Size</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.gloveSize || '--'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Emergency Contact (Restricted) */}
                {canViewSensitiveInfo && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <ShieldAlert className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-zinc-900 dark:text-white">Emergency Contact</h3>
                    </div>
                    {staff.emergencyContact?.name ? (
                      <div className="space-y-3.5">
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Contact Name</span>
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{staff.emergencyContact.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Relationship</span>
                            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{staff.emergencyContact.relation || '--'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Phone Number</span>
                            <a href={`tel:${staff.emergencyContact.phone}`} className="text-sm font-semibold text-indigo-500 hover:underline">{staff.emergencyContact.phone || '--'}</a>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic py-4">No emergency contact information on file.</p>
                    )}
                  </div>
                )}

                {/* Dates & Source Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold text-zinc-900 dark:text-white">Dates & Source</h3>
                  </div>
                  <div className="space-y-3.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Hire Date</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.hireDate ? new Date(staff.hireDate).toLocaleDateString() : '--'}</span>
                    </div>
                    {canViewSensitiveInfo && staff.fireDate && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Termination Date</span>
                        <span className="font-semibold text-rose-500">{new Date(staff.fireDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Source</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight ${
                        isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {isQB ? 'QuickBooks' : 'Native'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pay Details Card (Restricted to Manager/Admin only) */}
                {isAdmin && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <DollarSign className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-zinc-900 dark:text-white">Compensation Details</h3>
                    </div>
                    <div className="space-y-3.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pay Rate</span>
                        <span className="font-extrabold text-zinc-900 dark:text-white font-mono">
                          {(!staff.payRate || staff.payRate === 0) && department?.defaultPayRate ? (
                            <span>
                              ${Number(department.defaultPayRate).toFixed(2)}{' '}
                              <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded ml-1">Inherited</span>
                            </span>
                          ) : (
                            `$${Number(staff.payRate || 0).toFixed(2)}`
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pay Type</span>
                        <span className="font-bold text-zinc-850 dark:text-zinc-300 capitalize">
                          {(!staff.payType || staff.payType === 'inherit') && department?.defaultPayType ? (
                            <span>
                              {department.defaultPayType === 'flat_rate' ? 'Flat Rate (Book Time)' : department.defaultPayType === 'salary' ? 'Salary' : 'Hourly'}{' '}
                              <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded ml-1">Inherited</span>
                            </span>
                          ) : (
                            staff.payType === 'flat_rate' ? 'Flat Rate (Book Time)' : staff.payType === 'salary' ? 'Salary' : (staff.payType || 'Hourly')
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Book Time Allowance</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {staff.payPeriodBookTimeCredit ? `${staff.payPeriodBookTimeCredit}h / period (Override)` : department?.weeklyBookTimeCredit ? `${department.weeklyBookTimeCredit}h / week` : '--'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Work Schedule Card */}
                {canViewSensitiveInfo && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 md:col-span-2">
                    <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <Clock className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-zinc-900 dark:text-white">Custom Work Schedule</h3>
                    </div>
                    {staff.individualSchedule ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Shift Hours</span>
                          <span className="font-mono font-extrabold text-zinc-900 dark:text-white">{staff.individualSchedule.startTime} - {staff.individualSchedule.endTime}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Expected Daily Hours</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.individualSchedule.expectedHoursPerDay} Hours</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Scheduled Days</span>
                          <div className="flex gap-1.5 flex-wrap">
                            {['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'].map((d, idx) => {
                              const scheduled = staff.individualSchedule?.days?.includes(idx + 1);
                              return (
                                <span key={d} className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border",
                                  scheduled 
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                                    : "bg-zinc-50 dark:bg-zinc-850 text-zinc-350 dark:text-zinc-600 border-zinc-200 dark:border-zinc-800"
                                )}>
                                  {d}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-zinc-500">
                        <p className="text-sm font-semibold">Inheriting Department Default Schedule</p>
                        {department?.defaultSchedule ? (
                          <p className="text-xs text-zinc-400 mt-1">
                            Shift: {department.defaultSchedule.startTime} - {department.defaultSchedule.endTime} ({department.defaultSchedule.expectedHoursPerDay} hrs)
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-400 mt-1">Mon - Fri • 08:00 AM - 05:00 PM (8.0 Hours/Day)</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Administrative Confidential Notes (Restricted to Manager/Admin only) */}
              {isAdmin && staff.notes && (
                <div className="bg-amber-500/[0.02] border border-amber-500/20 rounded-3xl p-6 shadow-sm space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
                    <ShieldCheck className="w-5 h-5" />
                    <h4 className="font-extrabold text-sm uppercase tracking-wider">Administrative Confidential Notes</h4>
                  </div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                    {staff.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TIMELINE & INCIDENT LOG */}
          {activeTab === 'timeline' && (isSelf || isAdmin) && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Manager Incidents Log (Restricted) */}
              {isAdmin && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white">Performance Incidents Log</h3>
                        <p className="text-xs text-zinc-450 dark:text-zinc-500 mt-0.5">Administrative logs for MVP/Coaching moments</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-150 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-lg">
                      {incidentLogs.length} entries
                    </span>
                  </div>

                  {/* Add Incident Form */}
                  <form onSubmit={handleAddIncident} className="space-y-4 bg-zinc-50 dark:bg-zinc-950 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-850">
                    <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-555 uppercase tracking-widest">Log Performance incident</h4>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setIncidentType('good')}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2",
                          incidentType === 'good'
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800"
                        )}
                      >
                        <Smile className="w-4.5 h-4.5" /> Good Thing
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncidentType('bad')}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2",
                          incidentType === 'bad'
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800"
                        )}
                      >
                        <Frown className="w-4.5 h-4.5" /> Bad Thing
                      </button>
                    </div>

                    <textarea
                      required
                      value={incidentDesc}
                      onChange={(e) => setIncidentDesc(e.target.value)}
                      placeholder="Explain the coaching incident or MVP performance in detail..."
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-450 h-28 resize-none transition-all"
                    />

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={loggingIncident || !incidentDesc.trim()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {loggingIncident && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save Log Entry
                      </button>
                    </div>
                  </form>

                  {/* Incidents timeline log list */}
                  <div className="space-y-4">
                    {loadingIncidentLogs ? (
                      <div className="flex justify-center py-6 text-zinc-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : incidentLogs.length === 0 ? (
                      <div className="text-center py-8 text-zinc-450 italic text-sm">No positive or negative incident records logged yet.</div>
                    ) : (
                      incidentLogs.map(log => {
                        const isGood = log.type === 'good';
                        const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString() : 'Recent';
                        const timeStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        
                        return (
                          <div 
                            key={log.id} 
                            className={cn(
                              "p-5 rounded-2xl border flex flex-col sm:flex-row gap-4 justify-between transition-all",
                              isGood 
                                ? "bg-emerald-50/[0.01] border-emerald-500/10 hover:border-emerald-500/25" 
                                : "bg-rose-50/[0.01] border-rose-500/10 hover:border-rose-500/25"
                            )}
                          >
                            <div className="flex gap-3.5 flex-1">
                              <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm border",
                                isGood 
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                  : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                              )}>
                                {isGood ? <Smile size={18} /> : <Frown size={18} />}
                              </div>
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={cn(
                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border",
                                    isGood 
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15" 
                                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/15"
                                  )}>
                                    {isGood ? 'Good Thing' : 'Bad Thing'}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">
                                    {dateStr} • {timeStr}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                  {log.description}
                                </p>
                                <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wide">
                                  Logged by: <span className="text-zinc-600 dark:text-zinc-300">{log.loggedByName || 'Admin'}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteIncident(log.id)}
                              className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all h-fit self-end sm:self-start"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Operational Audit timeline */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-500">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-white">Operational Activity History</h3>
                      <p className="text-xs text-zinc-450 dark:text-zinc-500 mt-0.5">Audit log of system actions performed</p>
                    </div>
                  </div>
                </div>

                {loadingTimeline ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                ) : activities.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500 italic text-sm">No recorded operational actions found for this staff member.</div>
                ) : (
                  <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 dark:before:via-zinc-800 before:to-transparent">
                    {activities.map((activity, i) => {
                      const getIcon = (type: string) => {
                        switch (type) {
                          case 'zone_move': return <Warehouse className="w-4 h-4" />;
                          case 'time_session': return <Clock className="w-4 h-4" />;
                          case 'job': return <Briefcase className="w-4 h-4" />;
                          case 'parts': return <Package className="w-4 h-4" />;
                          case 'shipment': return <Truck className="w-4 h-4" />;
                          default: return <Activity className="w-4 h-4" />;
                        }
                      };

                      return (
                        <div key={activity.id} className="relative flex items-start gap-6 group animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${i * 30}ms` }}>
                          <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-zinc-900 bg-indigo-50 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shrink-0 shadow-sm">
                            {getIcon(activity.type)}
                          </div>
                          
                          <div className="flex-1 pt-1">
                            <div className="flex items-center justify-between gap-4 mb-0.5">
                              <span className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-tight">{activity.title}</span>
                              <time className="text-[10px] font-mono font-bold text-zinc-400">
                                {activity.timestamp ? (
                                  new Date(activity.timestamp?.toMillis ? activity.timestamp.toMillis() : activity.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                ) : '--:--'}
                              </time>
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                              {activity.message}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TIMECLOCK HISTORY */}
          {activeTab === 'timeclock' && (isSelf || isAdmin) && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-500">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-white">Timeclock Sessions</h3>
                    <p className="text-xs text-zinc-450 dark:text-zinc-500 mt-0.5">Logged hours, breaks, and book-time credits</p>
                  </div>
                </div>
              </div>

              {loadingSessions ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
              ) : !timeSessions || timeSessions.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 italic text-sm">No time sessions found for this staff member.</div>
              ) : (
                <div className="space-y-4">
                  {timeSessions.map(session => {
                    const calculateDuration = (start: any, end: any) => {
                      if (!start) return 0;
                      const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
                      const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : Date.now();
                      return Math.max(0, e - s);
                    };

                    const formatDuration = (ms: number) => {
                      const hours = Math.floor(ms / 3600000);
                      const minutes = Math.floor((ms % 3600000) / 60000);
                      return `${hours}h ${minutes}m`;
                    };

                    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                    const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
                    const workMs = totalMs - breakMs;

                    return (
                      <div 
                        key={session.id}
                        onClick={() => canViewSensitiveInfo && setEditingSession(session)}
                        className={cn(
                          "border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all bg-white dark:bg-zinc-900",
                          canViewSensitiveInfo ? "hover:border-indigo-500/30 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/40 cursor-pointer group" : ""
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                              {session.clockIn.timestamp ? (
                                new Date(session.clockIn.timestamp.toDate ? session.clockIn.timestamp.toDate() : session.clockIn.timestamp).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
                              ) : '--'}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
                                session.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15" : "bg-amber-500/10 text-amber-600 border-amber-500/15"
                              )}>
                                {session.status}
                              </span>
                              {session.verificationStatus === 'verified' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                                  Verified
                                </span>
                              )}
                              {session.isRemote && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-sm">
                                  <MapPin className="w-2.5 h-2.5" /> Remote
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider mb-0.5">Hours Worked</span>
                            <span className="font-mono font-black text-sm text-zinc-900 dark:text-white">{formatDuration(workMs)}</span>
                          </div>
                          {canViewSensitiveInfo && (
                            <button 
                              className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all md:opacity-0 group-hover:opacity-100"
                              title="Edit Entry"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DIRECT MESSAGING */}
          {activeTab === 'messages' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden flex flex-col md:flex-row h-[550px] animate-in fade-in duration-300">
              
              {/* Inbox lists: ONLY visible on own profile */}
              {isSelf && (
                <div className="w-full md:w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0">
                  <div className="p-4 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
                    <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-555 uppercase tracking-widest">Active Conversations</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 custom-scrollbar">
                    {conversationInbox.length === 0 ? (
                      <div className="p-8 text-center text-zinc-400 text-xs italic">Your inbox is empty. Message someone to get started!</div>
                    ) : (
                      conversationInbox.map(conv => {
                        const isActive = activeChatUserId === conv.partnerId;
                        const dateStr = conv.lastMessage.createdAt?.toDate ? conv.lastMessage.createdAt.toDate().toLocaleDateString() : '';
                        
                        return (
                          <button
                            key={conv.partnerId}
                            onClick={() => setActiveChatUserId(conv.partnerId)}
                            className={cn(
                              "w-full p-4 flex flex-col items-start gap-1 text-left transition-colors",
                              isActive 
                                ? "bg-indigo-500/5 dark:bg-indigo-500/10 border-l-4 border-l-indigo-600" 
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                            )}
                          >
                            <div className="flex justify-between items-center w-full">
                              <span className="font-extrabold text-sm text-zinc-900 dark:text-white">{conv.partnerName}</span>
                              <span className="text-[9px] text-zinc-400 font-bold">{dateStr}</span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate w-full font-medium italic">
                              {conv.lastMessage.message}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Chat Thread panel */}
              <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950/20 relative">
                {isSelf && !activeChatUserId ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 p-8 text-center select-none">
                    <MessageSquare className="w-12 h-12 text-zinc-200 dark:text-zinc-800 mb-4" />
                    <p className="text-sm font-bold uppercase tracking-wider">Select a conversation thread<br/>to start messaging</p>
                  </div>
                ) : (
                  <>
                    {/* Chat Box Header */}
                    <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-extrabold text-sm">
                          {isSelf 
                            ? staffList?.find(s => s.id === activeChatUserId)?.firstName[0] 
                            : staff.firstName[0]}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white leading-snug">
                            {isSelf 
                              ? staffList?.find(s => s.id === activeChatUserId)?.firstName + ' ' + staffList?.find(s => s.id === activeChatUserId)?.lastName
                              : staffFullName}
                          </h4>
                          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">DM Thread</span>
                        </div>
                      </div>
                    </div>

                    {/* Message Bubble Timeline */}
                    <div 
                      ref={chatScrollRef}
                      className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
                    >
                      {chatMessagesToShow.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic p-6 text-center select-none">
                          <p>No messages yet. Send a message to start the conversation!</p>
                        </div>
                      ) : (
                        chatMessagesToShow.map((msg, index) => {
                          const isMe = msg.senderId === myStaffRecord?.id;
                          const showHeader = index === 0 || chatMessagesToShow[index - 1].senderId !== msg.senderId;
                          const formatTime = (ts: any) => {
                            if (!ts) return '';
                            const d = ts.toDate ? ts.toDate() : new Date(ts);
                            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          };

                          return (
                            <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                              {showHeader && (
                                <div className={cn(
                                  "flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-400",
                                  isMe ? "mr-1 flex-row-reverse text-indigo-500/70" : "ml-1"
                                )}>
                                  <User className="w-2.5 h-2.5" />
                                  <span>{msg.senderName}</span>
                                </div>
                              )}
                              <div className={cn(
                                "max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm",
                                isMe 
                                  ? "bg-indigo-650 text-white rounded-br-none" 
                                  : "bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-bl-none"
                              )}>
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed font-semibold">{msg.message}</p>
                              </div>
                              <span className={cn(
                                "text-[9px] text-zinc-450 mt-1 font-bold",
                                isMe ? "mr-1" : "ml-1"
                              )}>
                                {formatTime(msg.createdAt)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Chat input box */}
                    <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                      <form onSubmit={handleSendDm} className="flex items-end gap-3">
                        <textarea
                          value={dmText}
                          onChange={(e) => setDmText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendDm(e);
                            }
                          }}
                          placeholder={`Message ${isSelf ? 'staff member' : staff.firstName}...`}
                          className="flex-1 max-h-24 min-h-[42px] bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl px-4 py-2.5 text-sm resize-none custom-scrollbar outline-none focus:bg-white dark:focus:bg-zinc-900 focus:border-indigo-500 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 font-semibold"
                          rows={1}
                        />
                        <button
                          type="submit"
                          disabled={sendingDm || !dmText.trim()}
                          className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shrink-0 mb-0.5"
                        >
                          <Send className="w-4.5 h-4.5" />
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Staff Editor Modal Backdrop */}
      {isEditing && (
        <StaffEditModal
          tenantId={tenantId}
          staff={staff}
          departments={departments || []}
          onClose={() => setIsEditing(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['staff-profile', tenantId, staffId] });
            setIsEditing(false);
          }}
        />
      )}

      {/* Timeclock Session Editor Backdrop */}
      {editingSession && (
        <TimeSessionEditorModal 
          tenantId={tenantId}
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={() => {
            refetchSessions();
            setEditingSession(null);
          }}
        />
      )}
    </div>
  );
}
