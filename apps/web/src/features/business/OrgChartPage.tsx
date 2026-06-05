import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Search, Mail, Phone, MessageSquare, 
  ChevronDown, ChevronUp, Building2, ExternalLink, Network, Sparkles, HelpCircle 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { StaffLink } from './StaffPerformance';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId?: string;
  jobTitle?: string;
  role?: string;
  isArchived?: boolean;
  reportsToId?: string;
  purchasingAuthority?: string;
  backupStaffId?: string;
  fireDate?: string;
}

interface Department {
  id: string;
  name: string;
  defaultReportsToId?: string;
  defaultBackupStaffId?: string;
  defaultPurchasingAuthority?: string;
}

export function OrgChartPage({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tree' | 'departments' | 'escalation'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Fetch staff and departments
  const { data, isLoading } = useQuery({
    queryKey: ['org-chart-data', tenantId],
    queryFn: async () => {
      const staffSnap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`)));
      const deptSnap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
      
      return {
        staff: staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)).filter(s => !s.isArchived && !s.fireDate),
        departments: deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department))
      };
    }
  });

  const departments = data?.departments || [];

  const staffList = useMemo(() => {
    if (!data?.staff) return [];
    return data.staff.map(member => {
      const dept = departments.find(d => d.id === member.departmentId);
      return {
        ...member,
        reportsToId: member.reportsToId || dept?.defaultReportsToId || undefined,
        backupStaffId: member.backupStaffId || dept?.defaultBackupStaffId || undefined,
        purchasingAuthority: member.purchasingAuthority || dept?.defaultPurchasingAuthority || undefined
      };
    });
  }, [data?.staff, departments]);

  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Build the reporting tree structures
  const { roots, childrenMap } = useMemo(() => {
    const activeIds = new Set(staffList.map(s => s.id));
    
    // Create a copy of staff list to break cycles in-memory for tree rendering
    const cleanStaffList = staffList.map(s => ({ ...s }));
    const cleanStaffMap = new Map(cleanStaffList.map(s => [s.id, s]));
    
    cleanStaffList.forEach(s => {
      const visited = new Set<string>();
      let current: StaffMember | undefined = s;
      while (current) {
        if (visited.has(current.id)) {
          // Cycle detected! Break the cycle at the current node by clearing reportsToId
          const nodeToBreak = cleanStaffMap.get(current.id);
          if (nodeToBreak) {
            nodeToBreak.reportsToId = undefined;
          }
          break;
        }
        visited.add(current.id);
        current = current.reportsToId ? cleanStaffMap.get(current.reportsToId) : undefined;
      }
    });

    const map = new Map<string, StaffMember[]>();
    
    // Group children by reportsToId
    cleanStaffList.forEach(s => {
      if (s.reportsToId && activeIds.has(s.reportsToId)) {
        const list = map.get(s.reportsToId) || [];
        list.push(s);
        map.set(s.reportsToId, list);
      }
    });

    // Root nodes are staff who have no manager, or whose manager is not active/archived
    const roots = cleanStaffList.filter(s => {
      return !s.reportsToId || !activeIds.has(s.reportsToId);
    });

    // Sort roots & children alphabetically by name
    const sortByName = (a: StaffMember, b: StaffMember) => 
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    
    roots.sort(sortByName);
    map.forEach(list => list.sort(sortByName));

    return { roots, childrenMap: map };
  }, [staffList]);

  const getEffectiveBackupId = (member: StaffMember) => {
    const hasReports = childrenMap.has(member.id);
    if (hasReports && member.reportsToId) {
      return member.reportsToId;
    }
    const rawMember = data?.staff?.find(s => s.id === member.id);
    if (rawMember?.backupStaffId) {
      return rawMember.backupStaffId;
    }
    if (member.reportsToId) {
      return member.reportsToId;
    }
    return member.backupStaffId;
  };

  // Setup default expanded state for all nodes with reports by default
  React.useEffect(() => {
    if (roots.length > 0 && Object.keys(expandedNodes).length === 0) {
      const initial: Record<string, boolean> = {};
      staffList.forEach(s => {
        if (childrenMap.has(s.id)) {
          initial[s.id] = true;
        }
      });
      roots.forEach(r => {
        initial[r.id] = true;
      });
      setExpandedNodes(initial);
    }
  }, [roots, staffList, childrenMap]);



  // 2. Department grouping logic
  const departmentGroups = useMemo(() => {
    const groups: Record<string, { dept: Department; leads: StaffMember[]; members: StaffMember[] }> = {};
    
    departments.forEach(dept => {
      groups[dept.id] = { dept, leads: [], members: [] };
    });
    
    // Catch-all for staff without department
    const noDeptId = 'no-department';
    groups[noDeptId] = { 
      dept: { id: noDeptId, name: 'Unassigned Department' }, 
      leads: [], 
      members: [] 
    };

    staffList.forEach(s => {
      const deptId = s.departmentId || noDeptId;
      if (!groups[deptId]) {
        groups[deptId] = { 
          dept: { id: deptId, name: 'Unknown' }, 
          leads: [], 
          members: [] 
        };
      }
      
      // Determine if they are a leader (has direct reports, or Job Title matches manager/lead keywords)
      const hasReports = childrenMap.has(s.id);
      const titleLower = (s.jobTitle || '').toLowerCase();
      const isLead = hasReports || 
                     titleLower.includes('manager') || 
                     titleLower.includes('foreman') || 
                     titleLower.includes('lead') || 
                     titleLower.includes('head') ||
                     titleLower.includes('supervisor') ||
                     titleLower.includes('chief');
      
      if (isLead) {
        groups[deptId].leads.push(s);
      } else {
        groups[deptId].members.push(s);
      }
    });

    // Remove empty groups except unassigned if it has members
    return Object.values(groups).filter(g => 
      g.leads.length > 0 || g.members.length > 0
    );
  }, [departments, staffList, childrenMap]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        <span className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Loading Org Data...</span>
      </div>
    );
  }

  // Recursive Tree Node Renderer
  const renderTreeNode = (member: StaffMember, level: number = 0) => {
    const children = childrenMap.get(member.id) || [];
    const isExpanded = !!expandedNodes[member.id];
    const deptName = departments.find(d => d.id === member.departmentId)?.name || 'General';
    const initials = `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase();

    return (
      <div key={member.id} className="relative flex flex-col mt-4">
        {/* Horizontal & vertical layout line helpers */}
        {level > 0 && (
          <div 
            className="absolute left-[-20px] top-[-16px] w-[20px] h-[36px] border-l-2 border-b-2 border-zinc-200 dark:border-zinc-800 pointer-events-none rounded-bl-xl"
            style={{ left: `calc(${level * 32}px - 20px)` }}
          />
        )}
        
        <div 
          className="flex items-start gap-4"
          style={{ paddingLeft: `${level * 32}px` }}
        >
          {/* Node Card Container */}
          <div className="flex-1 max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-indigo-500/35 transition-all flex flex-col sm:flex-row justify-between items-center sm:items-start gap-4 group relative overflow-hidden">
            {/* Glowing background hint */}
            {level === 0 && (
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
            )}
            
            <div className="flex items-center gap-4 text-center sm:text-left flex-col sm:flex-row">
              {/* Avatar */}
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black shadow-md shrink-0 bg-gradient-to-tr",
                level === 0 
                  ? "from-amber-500 to-orange-500 shadow-orange-500/10" 
                  : level === 1 
                  ? "from-indigo-600 to-indigo-400 shadow-indigo-600/10"
                  : "from-zinc-600 to-zinc-400 dark:from-zinc-700 dark:to-zinc-650"
              )}>
                {initials}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                  <h4 className="font-extrabold text-base text-zinc-900 dark:text-white leading-tight">
                    <StaffLink 
                      name={`${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Technician'} 
                      tenantId={tenantId} 
                      staffId={member.id} 
                      className="hover:text-indigo-650 hover:underline" 
                    />
                  </h4>
                  {level === 0 && (
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase tracking-wider rounded-md">
                      Top Executive
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[9px] font-bold uppercase tracking-wider rounded-md">
                    {deptName}
                  </span>
                  {member.purchasingAuthority && (
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider rounded-md" title={member.purchasingAuthority}>
                      Decision Maker
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-zinc-550 dark:text-zinc-400 mt-1">
                  {member.jobTitle || 'Technician'}
                </p>
                {member.purchasingAuthority && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 font-semibold flex items-center gap-1 justify-center sm:justify-start">
                    <Sparkles className="w-3 h-3 text-emerald-550 shrink-0" />
                    Authority: {member.purchasingAuthority}
                  </p>
                )}
                {(() => {
                  const effectiveBackupId = getEffectiveBackupId(member);
                  if (!effectiveBackupId) return null;
                  const backup = staffList.find(b => b.id === effectiveBackupId);
                  return backup ? (
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 font-semibold flex items-center gap-1 justify-center sm:justify-start">
                      If absent, ask: <button onClick={(e) => { e.stopPropagation(); navigate(`/business/${tenantId}/staff/${backup.id}`); }} className="text-indigo-650 dark:text-indigo-400 hover:underline font-bold">{backup.firstName} {backup.lastName}</button>
                    </p>
                  ) : null;
                })()}

              </div>
            </div>

            {/* Quick Action controls */}
            <div className="flex items-center gap-1.5 sm:self-center shrink-0">
              <button
                onClick={() => navigate(`/business/${tenantId}/staff/${member.id}`)}
                className="p-2.5 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 rounded-xl transition-all border border-zinc-200/50 dark:border-zinc-800"
                title="View Profile Details"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              {member.phone && (
                <a
                  href={`tel:${member.phone}`}
                  className="p-2.5 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 rounded-xl transition-all border border-zinc-200/50 dark:border-zinc-800"
                  title="Call Staff"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
              <a
                href={`mailto:${member.email}`}
                className="p-2.5 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 rounded-xl transition-all border border-zinc-200/50 dark:border-zinc-800"
                title="Email Staff"
              >
                <Mail className="w-4 h-4" />
              </a>
              <button
                onClick={() => navigate(`/business/${tenantId}/staff/${member.id}?tab=messages`)}
                className="p-2.5 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 rounded-xl transition-all border border-zinc-200/50 dark:border-zinc-800"
                title="Message Staff"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Direct report toggle button */}
          {children.length > 0 && (
            <button
              onClick={() => toggleNode(member.id)}
              className={cn(
                "p-3 rounded-2xl border transition-all flex items-center justify-center gap-1.5 hover:bg-zinc-55 hover:border-indigo-500 shrink-0 shadow-sm mt-3.5",
                isExpanded 
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/10" 
                  : "bg-white dark:bg-zinc-900 border-zinc-250 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
              )}
              title={isExpanded ? "Collapse Reports" : "Expand Reports"}
            >
              <span className="text-[10px] font-black uppercase tracking-wider pl-1">
                {children.length} {children.length === 1 ? 'Report' : 'Reports'}
              </span>
              {isExpanded ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
            </button>
          )}
        </div>

        {/* Children Sub-branch rendering */}
        {children.length > 0 && isExpanded && (
          <div className="relative flex flex-col pl-6 border-l-2 border-dashed border-zinc-200 dark:border-zinc-800/80 ml-6 mt-2 pb-2">
            {children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-indigo-500/10 text-indigo-500 rounded-2xl shadow-inner border border-indigo-500/10 shrink-0">
            <Network className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              Org Structure
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
              Explore reporting hierarchy, department setups, and equipment ownership.
            </p>
          </div>
        </div>

        {/* Search Input Bar (Visible on all tabs, context varies slightly) */}
        <div className="relative w-full md:w-80 shrink-0">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search staff, titles..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Tabs Selector Bar */}
      <div className="flex gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-950 rounded-2xl border border-zinc-200/60 dark:border-zinc-850 w-fit">
        {[
          { id: 'tree', label: 'Hierarchy Tree', icon: Network },
          { id: 'departments', label: 'Department Roster', icon: Building2 },
          { id: 'escalation', label: 'Escalation & Decisions', icon: Users },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSearchQuery('');
            }}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap active:scale-95",
              activeTab === tab.id
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-sm"
                : "text-zinc-550 dark:text-zinc-450 hover:text-zinc-900 dark:hover:text-white"
            )}
          >
            <tab.icon className="w-4 h-4 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Tab Content */}
      <div className="animate-in fade-in duration-300">
        
        {/* TAB 1: ORG CHART TREE */}
        {activeTab === 'tree' && (
          <div className="space-y-6">
            {roots.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
                <Users className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-1">No Hierarchy Configured</h3>
                <p className="text-zinc-500 max-w-sm mx-auto text-sm">
                  Get started by selecting direct supervisors/managers on staff profiles in the Staff Directory.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm overflow-x-auto no-scrollbar">
                <div className="min-w-fit pr-10">
                  {roots.map(root => renderTreeNode(root, 0))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DEPARTMENT ROSTER */}
        {activeTab === 'departments' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {departmentGroups.map(({ dept, leads, members }) => (
              <div 
                key={dept.id} 
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6"
              >
                {/* Department Header */}
                <div className="flex items-center gap-3.5 border-b border-zinc-100 dark:border-zinc-805 pb-4">
                  <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl">
                    <Building2 className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-zinc-950 dark:text-white leading-tight">
                      {dept.name}
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                      {leads.length + members.length} active staff
                    </p>
                  </div>
                </div>

                {/* Leads & Managers Section */}
                {leads.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">
                      Department Leaders & Managers
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {leads.map(s => {
                        const initials = `${s.firstName?.[0] || ''}${s.lastName?.[0] || ''}`.toUpperCase();
                        return (
                          <div 
                            key={s.id} 
                            className="p-4 rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.01] flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center shadow-md shadow-indigo-600/10">
                                {initials}
                              </div>
                              <div>
                                <h5 className="font-extrabold text-sm text-zinc-950 dark:text-white">
                                  {s.firstName} {s.lastName}
                                </h5>
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wide">
                                  {s.jobTitle || 'Department Lead'}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => navigate(`/business/${tenantId}/staff/${s.id}`)}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md"
                            >
                              Details
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* General Team Members Section */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">
                    Team Members
                  </h4>
                  {members.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic px-1">No additional team members assigned.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {members.map(s => {
                        const initials = `${s.firstName?.[0] || ''}${s.lastName?.[0] || ''}`.toUpperCase();
                        return (
                          <div 
                            key={s.id} 
                            onClick={() => navigate(`/business/${tenantId}/staff/${s.id}`)}
                            className="p-4 bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-850 rounded-2xl text-center space-y-3 hover:border-indigo-500/35 hover:bg-white dark:hover:bg-zinc-900 transition-all cursor-pointer group"
                          >
                            <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-black flex items-center justify-center mx-auto text-xs group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
                              {initials}
                            </div>
                            <div>
                              <h5 className="font-bold text-xs text-zinc-950 dark:text-white truncate">
                                {s.firstName} {s.lastName}
                              </h5>
                              <p className="text-[9px] text-zinc-400 font-bold truncate mt-0.5">
                                {s.jobTitle || 'Technician'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: ESCALATION & ROLE DECISIONS */}
        {activeTab === 'escalation' && (() => {
          const decisionMakers = staffList.filter(s => s.purchasingAuthority);
          const backupsList = staffList.filter(s => {
            const effectiveBackupId = getEffectiveBackupId(s);
            if (!effectiveBackupId) return false;
            const hasReports = childrenMap.has(s.id);
            const titleLower = (s.jobTitle || '').toLowerCase();
            return hasReports || 
                   titleLower.includes('manager') || 
                   titleLower.includes('foreman') || 
                   titleLower.includes('lead') || 
                   titleLower.includes('head') ||
                   titleLower.includes('supervisor') ||
                   titleLower.includes('chief') ||
                   titleLower.includes('ceo') ||
                   titleLower.includes('president') ||
                   titleLower.includes('owner') ||
                   titleLower.includes('director');
          });

          return (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-3xl p-6 flex gap-4 text-emerald-800 dark:text-emerald-300">
                  <Sparkles className="w-6 h-6 shrink-0 mt-0.5 text-emerald-500" />
                  <div className="text-sm font-semibold leading-relaxed">
                    <p className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Purchasing & Tool Approvals</p>
                    <p className="text-xs text-emerald-700/95 dark:text-emerald-400/95 mt-1 font-medium">
                      Need to acquire new workshop tools, consumables, or software? Below is the list of authorized personnel who can approve purchases.
                    </p>
                  </div>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/15 rounded-3xl p-6 flex gap-4 text-amber-800 dark:text-amber-300">
                  <HelpCircle className="w-6 h-6 shrink-0 mt-0.5 text-amber-500" />
                  <div className="text-sm font-semibold leading-relaxed">
                    <p className="font-bold text-xs uppercase tracking-wider">Alternate Backup Contacts</p>
                    <p className="text-xs text-amber-700/95 dark:text-amber-400/95 mt-1 font-medium">
                      If the Parts Manager, Foreman, or other leads are out of the office, look up their alternate backup contact below to keep operations moving.
                    </p>
                  </div>
                </div>
              </div>

              {/* Purchasing & Budget Authority Index */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-3.5 border-b border-zinc-150 dark:border-zinc-800 pb-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                    <Users className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-zinc-950 dark:text-white leading-tight">
                      Purchasing & Budget Decision Makers
                    </h3>
                    <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                      Authorized buyers and expense approvers
                    </p>
                  </div>
                </div>

                {decisionMakers.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No staff members have custom purchasing authority limits configured yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {decisionMakers.map(s => {
                      const dept = departments.find(d => d.id === s.departmentId)?.name || 'General';
                      const initials = `${s.firstName?.[0] || ''}${s.lastName?.[0] || ''}`.toUpperCase();
                      return (
                        <div key={s.id} className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4 bg-zinc-50/50 dark:bg-zinc-950/20 animate-in fade-in">
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shadow-md shadow-emerald-600/10 text-sm">
                              {initials}
                            </div>
                            <div>
                              <h4 className="font-extrabold text-sm text-zinc-950 dark:text-white">
                                <StaffLink 
                                  name={`${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Technician'} 
                                  tenantId={tenantId} 
                                  staffId={s.id} 
                                  className="hover:text-indigo-650 hover:underline" 
                                />
                              </h4>
                              <p className="text-[10px] text-zinc-450 font-bold uppercase">
                                {s.jobTitle || 'Lead'} • {dept}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-black uppercase rounded-lg">
                              {s.purchasingAuthority}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Backups & Alternate Contacts Index */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-3.5 border-b border-zinc-150 dark:border-zinc-800 pb-4">
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">
                    <HelpCircle className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-zinc-950 dark:text-white leading-tight">
                      Key Personnel & Alternates Directory
                    </h3>
                    <p className="text-[10px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                      "Who to ask" escalation and absence coverage paths
                    </p>
                  </div>
                </div>

                {backupsList.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No alternate backup paths configured yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-950/60">
                          <th className="p-4 border-b border-zinc-200 dark:border-zinc-850">
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Role Owner</span>
                          </th>
                          <th className="p-4 border-b border-zinc-200 dark:border-zinc-850">
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Department / Title</span>
                          </th>
                          <th className="p-4 border-b border-zinc-200 dark:border-zinc-850">
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Alternate Backup Contact</span>
                          </th>
                          <th className="p-4 border-b border-zinc-200 dark:border-zinc-850 text-right">
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                        {backupsList.map(s => {
                          const effectiveBackupId = getEffectiveBackupId(s);
                          const backup = staffList.find(b => b.id === effectiveBackupId);
                          const dept = departments.find(d => d.id === s.departmentId)?.name || 'General';
                          if (!backup) return null;
                          return (
                            <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/20 transition-colors animate-in fade-in">
                              <td className="p-4 font-bold text-sm text-zinc-900 dark:text-white">
                                <StaffLink 
                                  name={`${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Technician'} 
                                  tenantId={tenantId} 
                                  staffId={s.id} 
                                  className="hover:text-indigo-650 hover:underline text-zinc-900 dark:text-white" 
                                />
                              </td>
                              <td className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-450 uppercase">
                                {dept} • {s.jobTitle || 'Lead'}
                              </td>
                              <td className="p-4">
                                <button
                                  onClick={() => navigate(`/business/${tenantId}/staff/${backup.id}`)}
                                  className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                                >
                                  {backup.firstName} {backup.lastName}
                                  <span className="text-[10px] text-zinc-400 font-medium font-mono">({backup.jobTitle || 'Technician'})</span>
                                </button>
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => navigate(`/business/${tenantId}/staff/${backup.id}?tab=messages`)}
                                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200/50 dark:border-indigo-800 text-indigo-650 dark:text-indigo-450 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                                >
                                  Message Backup
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
            </div>
          );
        })()}
      </div>
    </div>
  );
}
