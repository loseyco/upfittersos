import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  Users, Plus, Trash2, CheckCircle2, Circle, 
  RefreshCw, Search, Layout, Printer
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast, Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface GenericTag {
  id: string;
  text: string;
  completed: boolean;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoURL?: string;
  departmentId?: string;
  jobTitle?: string;
  dailyTags?: GenericTag[];
}

interface Department {
  id: string;
  name: string;
}

export function MorningMeetingBoard({ tenantId }: { tenantId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auth & Permissions
  const { permissions, isSuperAdmin } = useAuthStore();
  const canEdit = isSuperAdmin || !!permissions['tasks.manage'];

  // View States
  const [layoutMode, setLayoutMode] = useState<'lanes' | 'grid'>('lanes');
  const [searchQuery, setSearchQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  
  // Local Tag Inputs (keyed by staffId)
  const [newTagTexts, setNewTagTexts] = useState<Record<string, string>>({});

  // Firestore local state
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Real-Time Listeners (Staff & Departments)
  useEffect(() => {
    if (!tenantId) return;

    // Staff
    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffMember)).filter(s => !(s as any).isArchived));
      setLastUpdated(new Date());
      setLoading(false);
    }, (err) => {
      console.error("Error fetching staff:", err);
      setLoading(false);
    });

    // Departments
    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (err) => console.error("Error fetching departments:", err));

    return () => {
      unsubStaff();
      unsubDepts();
    };
  }, [tenantId]);

  // Firestore Array handlers
  const handleAddTag = async (staffId: string) => {
    if (!canEdit) {
      toast.error("Permission Denied", { description: "You do not have permission to add tasks on this board." });
      return;
    }

    const text = newTagTexts[staffId]?.trim();
    if (!text) return;

    const member = staff.find(s => s.id === staffId);
    if (!member) return;

    const currentTags = member.dailyTags || [];
    const newTag: GenericTag = {
      id: Math.random().toString(36).substring(2, 9),
      text,
      completed: false
    };

    try {
      const docRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(docRef, {
        dailyTags: [...currentTags, newTag]
      });
      // Clear specific staff member's tag input
      setNewTagTexts(prev => ({ ...prev, [staffId]: '' }));
      toast.success("Task added to daily list");
    } catch (err: any) {
      console.error("Error adding tag:", err);
      toast.error(`Failed to add task: ${err.message}`);
    }
  };

  const handleToggleTag = async (staffId: string, tagId: string) => {
    if (!canEdit) {
      toast.error("Permission Denied", { description: "You do not have permission to edit tasks on this board." });
      return;
    }

    const member = staff.find(s => s.id === staffId);
    if (!member) return;

    const currentTags = member.dailyTags || [];
    const updatedTags = currentTags.map(tag => 
      tag.id === tagId ? { ...tag, completed: !tag.completed } : tag
    );

    try {
      const docRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(docRef, {
        dailyTags: updatedTags
      });
    } catch (err: any) {
      console.error("Error toggling tag:", err);
      toast.error(`Failed to update task: ${err.message}`);
    }
  };

  const handleDeleteTag = async (staffId: string, tagId: string) => {
    if (!canEdit) {
      toast.error("Permission Denied", { description: "You do not have permission to delete tasks on this board." });
      return;
    }

    const member = staff.find(s => s.id === staffId);
    if (!member) return;

    const currentTags = member.dailyTags || [];
    const updatedTags = currentTags.filter(tag => tag.id !== tagId);

    try {
      const docRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(docRef, {
        dailyTags: updatedTags
      });
      toast.success("Task deleted successfully");
    } catch (err: any) {
      console.error("Error deleting tag:", err);
      toast.error(`Failed to delete task: ${err.message}`);
    }
  };

  // Reconciled & Grouped Data
  const reconciledData = useMemo(() => {
    const queryStr = searchQuery.toLowerCase().trim();

    return departments.map(dept => {
      // Find staff in this department
      const deptStaff = staff
        .filter(member => member.departmentId === dept.id)
        .filter(member => {
          // Search query filter
          if (!queryStr) return true;
          const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
          const job = (member.jobTitle || '').toLowerCase();
          const matchName = fullName.includes(queryStr) || job.includes(queryStr);
          const matchTags = member.dailyTags?.some(t => t.text.toLowerCase().includes(queryStr));
          return matchName || matchTags;
        });

      return {
        dept,
        staff: deptStaff
      };
    }).filter(group => group.staff.length > 0);
  }, [staff, departments, searchQuery]);

  // Department Gradient Header Helper
  const getDeptBannerStyle = (deptName: string) => {
    const name = deptName.toLowerCase();
    if (name.includes('fabrication') || name.includes('fab')) {
      return 'bg-gradient-to-r from-violet-600/90 to-fuchsia-600/90 text-white shadow-[0_0_20px_rgba(217,70,239,0.25)] border-fuchsia-500/30';
    }
    if (name.includes('fast') || name.includes('f.a.s.t')) {
      return 'bg-gradient-to-r from-blue-600/90 to-cyan-500/90 text-white shadow-[0_0_20px_rgba(59,130,246,0.25)] border-blue-500/30';
    }
    if (name.includes('graphics') || name.includes('vinyl') || name.includes('print')) {
      return 'bg-gradient-to-r from-emerald-600/90 to-teal-500/90 text-white shadow-[0_0_20px_rgba(16,185,129,0.25)] border-emerald-500/30';
    }
    if (name.includes('parts') || name.includes('warehouse')) {
      return 'bg-gradient-to-r from-amber-600/90 to-orange-500/90 text-white shadow-[0_0_20px_rgba(245,158,11,0.25)] border-amber-500/30';
    }
    return 'bg-gradient-to-r from-indigo-600/90 to-violet-500/90 text-white shadow-[0_0_20px_rgba(99,102,241,0.25)] border-indigo-500/30';
  };

  const getDeptBannerPrintClass = (deptName: string) => {
    const name = deptName.toLowerCase();
    if (name.includes('fabrication') || name.includes('fab')) return 'dept-banner-fab';
    if (name.includes('fast') || name.includes('f.a.s.t')) return 'dept-banner-fast';
    if (name.includes('graphics') || name.includes('vinyl') || name.includes('print')) return 'dept-banner-graphics';
    if (name.includes('parts') || name.includes('warehouse')) return 'dept-banner-parts';
    return 'dept-banner-default';
  };

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden rounded-3xl border border-zinc-800 shadow-2xl p-6 transition-all duration-500 morning-meeting-print-area"
    >
      <Toaster position="top-right" richColors theme="dark" closeButton />

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 0.3in;
          }
          
          /* Hide the sidebar */
          aside {
            display: none !important;
          }
          
          /* Hide all top navs, mobile headers, and clocks in TenantDashboard */
          div.flex-1 > div,
          div.flex-1 > nav {
            display: none !important;
          }
          
          /* Hide the main dashboard header & impersonation alert */
          div.mb-8.bg-emerald-600,
          div.flex.items-center.justify-between.mb-4,
          .impersonation-banner {
            display: none !important;
          }

          /* Reset parent document containers to flow naturally without flex/scroll constraints */
          html, body, #root, .flex.min-h-screen, div.flex-1, main {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            font-size: 9pt !important;
          }
          
          /* Print Area Container */
          .morning-meeting-print-area {
            position: relative !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            overflow: visible !important;
          }
          
          main {
            margin-top: 0 !important;
            padding: 0 !important;
          }
          
          /* Multi-Column flow layout for print */
          .morning-meeting-print-grid {
            display: block !important;
            column-count: 3 !important;
            column-gap: 0.25in !important;
            width: 100% !important;
            overflow: visible !important;
          }
          
          .no-print {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .morning-meeting-print-area h1 {
            color: black !important;
            font-size: 14pt !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            margin: 0 !important;
            line-height: 1.2 !important;
          }
          .morning-meeting-print-area p {
            color: #4b5563 !important;
            font-size: 8pt !important;
            margin: 2px 0 10px 0 !important;
            font-weight: 600 !important;
          }
          section {
            display: inline-block !important;
            width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin-bottom: 0.25in !important;
          }
          .dept-banner {
            background: transparent !important;
            border: none !important;
            border-bottom: 1.5px solid black !important;
            border-radius: 0 !important;
            padding: 0 0 2px 0 !important;
            margin-bottom: 6px !important;
            color: black !important;
            box-shadow: none !important;
          }
          .dept-banner h2 {
            font-size: 10pt !important;
            font-weight: 800 !important;
            color: black !important;
            text-transform: uppercase !important;
          }
          .dept-banner span, 
          .dept-banner svg,
          .dept-banner div > div {
            display: none !important;
          }
          .dept-banner div {
            display: block !important;
          }
          .staff-card {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin-bottom: 8px !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .staff-initials {
            display: none !important;
          }
          .staff-name {
            color: black !important;
            font-size: 9pt !important;
            font-weight: 700 !important;
            margin-bottom: 2px !important;
          }
          .staff-title {
            color: #6b7280 !important;
            font-size: 7pt !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
          }
          .task-item {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin-bottom: 1px !important;
            display: flex !important;
            align-items: center !important;
            color: #111827 !important;
          }
          .task-item-completed {
            color: #9ca3af !important;
            text-decoration: line-through !important;
            opacity: 0.6 !important;
          }
          .task-icon {
            color: #4b5563 !important;
            width: 10px !important;
            height: 10px !important;
            margin-right: 4px !important;
          }
          .task-icon-completed {
            color: #10b981 !important;
            width: 10px !important;
            height: 10px !important;
            margin-right: 4px !important;
          }
          .empty-tasks {
            display: none !important;
          }
        }
      ` }} />

      {/* Control Header */}
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-zinc-850 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 relative overflow-hidden group no-print">
            <Layout className="w-6 h-6 animate-pulse" />
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent -translate-x-full"
              animate={{ x: ['100%', '-100%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-none">
                Morning Meeting Board
              </h1>
              <div className="flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/25 no-print">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[8px] font-black text-emerald-400 tracking-wider uppercase">LIVE</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
              Shop Standup Daily Goals • Today is {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} • Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Search & Actions HUD */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end px-4 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono leading-none no-print">
            <span className="text-lg font-black text-white tracking-tighter">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-[7px] font-black text-zinc-550 uppercase tracking-widest mt-1">STANDUP CLOCK</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Search */}
            <div className="relative no-print">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input 
                type="text"
                placeholder="Search staff, tasks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-36 sm:w-48 pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-white outline-none"
              />
            </div>

            {/* Layout switchers */}
            <div className="bg-zinc-900 p-0.5 rounded-xl border border-zinc-800 flex no-print">
              <button
                onClick={() => setLayoutMode('lanes')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                  layoutMode === 'lanes' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Lanes
              </button>
              <button
                onClick={() => setLayoutMode('grid')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                  layoutMode === 'grid' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Grid
              </button>
            </div>

            {/* Print Button */}
            <button
              onClick={() => window.print()}
              className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all flex items-center gap-1.5 active:scale-95 text-[9px] font-black uppercase tracking-wider no-print"
              title="Print daily list"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main lanes list */}
      <main 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar pt-6 min-h-0"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-500">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-xs font-black uppercase tracking-widest">Loading daily meeting board...</p>
          </div>
        ) : reconciledData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 gap-4 text-center">
            <Users className="w-16 h-16 text-zinc-800" />
            <div>
              <h3 className="text-lg font-bold text-white">No Staff Found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1 mx-auto">
                No staff members matched your current filters or search query.
              </p>
            </div>
          </div>
        ) : (
          <div 
            className={cn(
              "transition-all duration-500 morning-meeting-print-grid",
              layoutMode === 'lanes' 
                ? "flex flex-col gap-8 w-full max-w-4xl mx-auto" 
                : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start"
            )}
          >
            <AnimatePresence mode="popLayout">
              {reconciledData.map(group => (
                <motion.section 
                  layout
                  key={group.dept.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "flex flex-col rounded-[24px] border bg-zinc-900/10 overflow-hidden",
                    layoutMode === 'lanes' 
                      ? "border-zinc-800/80 p-5 gap-4" 
                      : "border-zinc-800 p-4 gap-4 self-start min-h-[300px]"
                  )}
                >
                  {/* Department Title card */}
                  <div className={cn(
                    "p-4 rounded-2xl border flex items-center justify-between shadow-lg relative overflow-hidden dept-banner", 
                    getDeptBannerStyle(group.dept.name),
                    getDeptBannerPrintClass(group.dept.name)
                  )}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-black/25 rounded-xl border border-white/10 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-black uppercase tracking-tight leading-none text-white">{group.dept.name}</h2>
                        <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest mt-1 block">DEPARTMENT</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-black text-white bg-black/20 border border-white/10 px-2.5 py-1 rounded-xl">
                      {group.staff.length} Staff
                    </span>
                  </div>

                  {/* Staff card lists */}
                  <div className="flex flex-col gap-4">
                    {group.staff.map(member => {
                      const initials = `${member.firstName?.[0] || '?'}${member.lastName?.[0] || ''}`;
                      const tagsList = member.dailyTags || [];

                      return (
                        <div 
                          key={member.id}
                          className="rounded-2xl border bg-zinc-900/60 border-zinc-800/80 p-4 transition-all duration-300 flex flex-col gap-3.5 hover:border-zinc-700/80 shadow-md staff-card"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-400 font-bold border border-indigo-500/20 text-xs flex items-center justify-center shrink-0 staff-initials">
                              {initials}
                            </div>
                            <div>
                              <h3 className="font-bold text-white text-sm tracking-tight leading-snug staff-name">
                                {member.firstName} {member.lastName}
                              </h3>
                              <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider staff-title">
                                {member.jobTitle || "Technician"}
                              </p>
                            </div>
                          </div>

                          {/* Daily tags checklist */}
                          <div className="flex flex-col gap-2 border-t border-zinc-800/60 pt-3">
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                              {tagsList.map(tag => (
                                <div 
                                  key={tag.id}
                                  onClick={() => handleToggleTag(member.id, tag.id)}
                                  className={cn(
                                    "flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all select-none task-item",
                                    canEdit ? "cursor-pointer active:scale-[0.99]" : "",
                                    tag.completed 
                                      ? "bg-zinc-950/20 border-zinc-900/40 opacity-40 task-item-completed" 
                                      : "bg-zinc-950/40 border-zinc-850/60 hover:bg-zinc-950/80 hover:border-zinc-750"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {tag.completed ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 task-icon-completed" />
                                    ) : (
                                      <Circle className="w-4 h-4 text-indigo-500/50 shrink-0 task-icon" />
                                    )}
                                    <span className={cn(
                                      "text-xs font-bold leading-snug text-zinc-200 truncate",
                                      tag.completed && "line-through text-zinc-500 font-medium"
                                    )}>
                                      {tag.text}
                                    </span>
                                  </div>
                                  
                                  {canEdit && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTag(member.id, tag.id);
                                      }}
                                      className="p-1 hover:bg-zinc-900 rounded text-zinc-500 hover:text-rose-400 transition-colors shrink-0 no-print"
                                      title="Delete task"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}

                              {tagsList.length === 0 && (
                                <div className="p-4 bg-zinc-950/10 rounded-xl border border-dashed border-zinc-850 text-center text-[10px] text-zinc-550 font-bold uppercase tracking-wider italic empty-tasks">
                                  No tasks added for today
                                </div>
                              )}
                            </div>

                            {/* Inline tag adder */}
                            {canEdit && (
                              <div className="flex items-center gap-2 mt-1 no-print">
                                <input
                                  type="text"
                                  placeholder="Add task for today..."
                                  value={newTagTexts[member.id] || ''}
                                  onChange={e => setNewTagTexts(prev => ({ ...prev, [member.id]: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      handleAddTag(member.id);
                                    }
                                  }}
                                  className="flex-1 bg-zinc-950 border border-zinc-850/80 rounded-xl px-3 py-1.5 text-[10px] font-semibold text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-zinc-650"
                                />
                                <button
                                  onClick={() => handleAddTag(member.id)}
                                  className="p-1.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-zinc-950 rounded-xl border border-indigo-500/20 hover:border-indigo-550 transition-all active:scale-95 shrink-0"
                                  title="Add tag"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
