import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase/config';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { PERMISSIONS } from '../../lib/auth/permissions';
import { 
  ShieldCheck, Search, X, 
  Users, Zap, RefreshCw, KeyRound, Link, Star, Minus, Filter, Building2, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface PermissionMatrixPortalProps {
  tenantId: string;
}

export type StateFilterType = 'all' | 'inherited' | 'explicit_grant' | 'explicit_revoke' | 'not_granted';

const CATEGORY_MAP: Record<string, string[]> = {
  'Main Menu & Hub Access': [
    'office.view',
    'foreman.view',
    'parts.view',
    'facility.view',
    'settings.view',
    'sales.view',
    'safety.view',
    'development.view'
  ],
  'Tasks & Timeclock': [
    'timeclock.no_review_required',
    'timeclock.approve',
    'timeclock.manage',
    'timeclock.offsite',
    'timeclock.view',
    'tasks.clock_others',
    'tasks.manage',
    'tasks.view'
  ],
  'Business Operations': [
    'jobs.manage',
    'jobs.qc',
    'jobs.move_vehicle',
    'jobs.view',
    'staff.manage',
    'staff.view',
    'customers.manage',
    'customers.view',
    'staff_worksheet.view',
    'bay_worksheet.view'
  ],
  'Inventory & Vehicles': [
    'vehicles.manage',
    'vehicles.view',
    'parts.manage',
    'parts.view',
    'zones.manage',
    'zones.view',
    'parts_worksheet.view'
  ],
  'General & Boards': [
    'mission_control.view',
    'quickdesk.view',
    'foreman.view',
    'graphics.view',
    'fast.view',
    'fabrication.view',
    'harness.view',
    'office.view',
    'printed_parts.view',
    'printed_parts.manage',
    'performance.view'
  ],
  'System & Data': [
    'permission_matrix.view',
    'permission_matrix.manage',
    'settings.manage',
    'settings.view',
    'reports.view',
    'sync.manage',
    'sync.view'
  ]
};

export function PermissionMatrixPortal({ tenantId }: PermissionMatrixPortalProps) {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [departmentsMap, setDepartmentsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // View Mode: 'department' (Department Defaults) or 'staff' (Individual Overrides)
  const [viewMode, setViewMode] = useState<'staff' | 'department'>('department');

  const [searchStaff, setSearchStaff] = useState('');
  const [searchPerm, setSearchPerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStateFilter, setSelectedStateFilter] = useState<StateFilterType>('all');
  const [filterAutoApproveOnly, setFilterAutoApproveOnly] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // Real-time listener for departments
  useEffect(() => {
    if (!tenantId) return;

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      const deptsMap: Record<string, any> = {};
      const list = snap.docs.map(d => {
        const data = { id: d.id, ...d.data() };
        deptsMap[d.id] = data;
        return data;
      });
      list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setDepartmentsList(list);
      setDepartmentsMap(deptsMap);
    }, (err) => {
      console.error("Departments snapshot error:", err);
    });

    return unsubDepts;
  }, [tenantId]);

  // Real-time listener for staff members
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => {
        const nameA = (a.name || `${a.firstName || ''} ${a.lastName || ''}`).toLowerCase();
        const nameB = (b.name || `${b.firstName || ''} ${b.lastName || ''}`).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setStaffList(docs);
      setLoading(false);
    }, (err) => {
      console.error("Staff snapshot error:", err);
      setLoading(false);
    });

    return unsubStaff;
  }, [tenantId]);

  // Helper to get 3-state resolution for (staff, permKey)
  const getPermissionState = (staffMember: any, permKey: string) => {
    const isSuperAdminUser = staffMember.role === 'admin' || staffMember.role === 'owner';
    const dept = departmentsMap[staffMember.departmentId];
    const deptName = dept?.name || 'No Dept';
    const deptValue = dept?.permissions?.[permKey] === true;

    const explicitVal = staffMember.individualPermissions?.[permKey] ?? staffMember.permissions?.[permKey];

    if (isSuperAdminUser && explicitVal === undefined) {
      return {
        isGranted: true,
        isOverride: false,
        overrideType: 'none',
        stateCategory: 'inherited' as const,
        inheritedFrom: 'Admin Role',
        stateLabel: 'Superadmin Access'
      };
    }

    if (explicitVal === true) {
      return {
        isGranted: true,
        isOverride: true,
        overrideType: 'grant',
        stateCategory: 'explicit_grant' as const,
        inheritedFrom: null,
        stateLabel: 'Explicit Override: Granted'
      };
    }

    if (explicitVal === false) {
      return {
        isGranted: false,
        isOverride: true,
        overrideType: 'revoke',
        stateCategory: 'explicit_revoke' as const,
        inheritedFrom: null,
        stateLabel: 'Explicit Override: Revoked'
      };
    }

    if (deptValue) {
      return {
        isGranted: true,
        isOverride: false,
        overrideType: 'none',
        stateCategory: 'inherited' as const,
        inheritedFrom: deptName,
        stateLabel: `Inherited from ${deptName}`
      };
    }

    return {
      isGranted: false,
      isOverride: false,
      overrideType: 'none',
      stateCategory: 'not_granted' as const,
      inheritedFrom: deptName,
      stateLabel: `Not granted in ${deptName}`
    };
  };

  // Filter staff members based on search and filters
  const filteredStaff = useMemo(() => {
    return staffList.filter(s => {
      if (s.isArchived) return false;
      const name = (s.name || `${s.firstName || ''} ${s.lastName || ''}`).toLowerCase();
      const email = (s.email || '').toLowerCase();
      const role = (s.role || '').toLowerCase();
      const q = searchStaff.toLowerCase();
      
      const dept = departmentsMap[s.departmentId];
      const deptName = (dept?.name || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || email.includes(q) || role.includes(q) || deptName.includes(q);

      const explicitAutoApprove = s.permissions?.['timeclock.no_review_required'];
      const deptAutoApprove = dept?.permissions?.['timeclock.no_review_required'] === true;
      const effectiveAutoApprove = explicitAutoApprove !== undefined ? explicitAutoApprove === true : deptAutoApprove;
      const isSuper = s.role === 'admin' || s.role === 'owner';

      const matchesAutoApprove = !filterAutoApproveOnly || effectiveAutoApprove || isSuper;

      return matchesSearch && matchesAutoApprove;
    });
  }, [staffList, searchStaff, filterAutoApproveOnly, departmentsMap]);

  // Group permission entries
  const permissionCategories = useMemo(() => {
    const categories: Record<string, Array<{ key: string; label: string }>> = {};

    Object.entries(CATEGORY_MAP).forEach(([catName, keys]) => {
      if (selectedCategory !== 'All' && selectedCategory !== catName) return;

      const items = keys.map(key => ({
        key,
        label: (PERMISSIONS as any)[key] || key
      })).filter(item => {
        if (searchPerm.trim()) {
          const q = searchPerm.toLowerCase();
          const matchesSearch = item.key.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
          if (!matchesSearch) return false;
        }

        if (viewMode === 'staff' && selectedStateFilter !== 'all') {
          const hasMatchingCell = filteredStaff.some(staff => {
            const st = getPermissionState(staff, item.key);
            return st.stateCategory === selectedStateFilter;
          });
          if (!hasMatchingCell) return false;
        }

        return true;
      });

      if (items.length > 0) {
        categories[catName] = items;
      }
    });

    return categories;
  }, [selectedCategory, searchPerm, selectedStateFilter, filteredStaff, departmentsMap, viewMode]);

  // State Counts for Legend Pills
  const stateCounts = useMemo(() => {
    let inherited = 0;
    let explicitGrant = 0;
    let explicitRevoke = 0;
    let notGranted = 0;

    Object.values(CATEGORY_MAP).flat().forEach(permKey => {
      filteredStaff.forEach(staff => {
        const st = getPermissionState(staff, permKey);
        if (st.stateCategory === 'inherited') inherited++;
        else if (st.stateCategory === 'explicit_grant') explicitGrant++;
        else if (st.stateCategory === 'explicit_revoke') explicitRevoke++;
        else if (st.stateCategory === 'not_granted') notGranted++;
      });
    });

    return { inherited, explicitGrant, explicitRevoke, notGranted };
  }, [filteredStaff, departmentsMap]);

  // Cycle 3 states on cell click (Staff Mode)
  const handleCyclePermissionState = async (staffMember: any, permKey: string) => {
    if (!tenantId || !staffMember?.id) return;
    const toggleId = `${staffMember.id}_${permKey}`;
    setTogglingKey(toggleId);

    try {
      const currentInd = { ...(staffMember.individualPermissions || {}) };
      const currentPerms = { ...(staffMember.permissions || {}) };
      const currentExplicit = currentInd[permKey] ?? currentPerms[permKey];
      const dept = departmentsMap[staffMember.departmentId];
      const deptName = dept?.name || 'Department';
      const staffName = staffMember.name || staffMember.firstName || 'Staff member';
      const permLabel = (PERMISSIONS as any)[permKey] || permKey;

      let toastMsg = '';

      if (currentExplicit === undefined) {
        currentInd[permKey] = true;
        currentPerms[permKey] = true;
        toastMsg = `⭐ EXPLICIT GRANT: "${permLabel}" for ${staffName}`;
      } else if (currentExplicit === true) {
        currentInd[permKey] = false;
        currentPerms[permKey] = false;
        toastMsg = `❌ EXPLICIT REVOKE: "${permLabel}" for ${staffName}`;
      } else {
        delete currentInd[permKey];
        delete currentPerms[permKey];
        toastMsg = `🔗 RESET TO INHERITED (${deptName}) for ${staffName}`;
      }

      const staffRef = doc(db, `businesses/${tenantId}/staff`, staffMember.id);
      await updateDoc(staffRef, {
        individualPermissions: currentInd,
        permissions: currentPerms,
        updatedAt: serverTimestamp()
      });

      toast.success(toastMsg);
    } catch (err: any) {
      console.error("Error cycling permission state:", err);
      toast.error(`Failed to update permission state: ${err?.message || 'Permission Error'}`);
    } finally {
      setTogglingKey(null);
    }
  };

  // Toggle Department level permission (Department Mode)
  const handleToggleDepartmentPermission = async (department: any, permKey: string) => {
    if (!tenantId || !department?.id) return;
    const toggleId = `dept_${department.id}_${permKey}`;
    setTogglingKey(toggleId);

    try {
      const currentPermissions = { ...(department.permissions || {}) };
      const currentVal = currentPermissions[permKey] === true;
      const permLabel = (PERMISSIONS as any)[permKey] || permKey;

      if (currentVal) {
        delete currentPermissions[permKey];
      } else {
        currentPermissions[permKey] = true;
      }

      const deptRef = doc(db, `businesses/${tenantId}/departments`, department.id);
      await updateDoc(deptRef, {
        permissions: currentPermissions,
        updatedAt: serverTimestamp()
      });

      toast.success(`${!currentVal ? 'GRANTED' : 'REVOKED'}: "${permLabel}" for Department "${department.name}"`);
    } catch (err: any) {
      console.error("Error toggling department permission:", err);
      toast.error(`Failed to update department permission: ${err?.message || 'Permission Error'}`);
    } finally {
      setTogglingKey(null);
    }
  };

  // Quick action: Grant Auto-Approve to all Admins & Managers
  const handleGrantAutoApproveToManagers = async () => {
    if (!tenantId) return;
    let count = 0;
    try {
      for (const s of staffList) {
        const isManagerOrAdmin = s.role === 'admin' || s.role === 'manager' || s.role === 'owner' || s.role === 'foreman';
        if (isManagerOrAdmin && s.permissions?.['timeclock.no_review_required'] !== true) {
          const staffRef = doc(db, `businesses/${tenantId}/staff`, s.id);
          await updateDoc(staffRef, {
            [`permissions.timeclock.no_review_required`]: true,
            updatedAt: serverTimestamp()
          });
          count++;
        }
      }
      toast.success(`Granted Auto-Approve permission override to ${count} managers/admins.`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to batch update permissions.");
    }
  };

  // Metrics
  const autoApproveCount = useMemo(() => {
    return staffList.filter(s => {
      const state = getPermissionState(s, 'timeclock.no_review_required');
      return state.isGranted;
    }).length;
  }, [staffList, departmentsMap]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-[1650px] mx-auto animate-in fade-in duration-200">
      
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
            <ShieldCheck className="w-6 h-6 text-indigo-650 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Permission Matrix & Inheritance Portal</h1>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
                Superadmin Tool
              </span>
            </div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
              Edit Department default permissions or individual staff overrides in real time.
            </p>
          </div>
        </div>

        {/* View Mode Switcher & Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 flex items-center gap-1">
            <button
              onClick={() => setViewMode('staff')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer",
                viewMode === 'staff'
                  ? "bg-white dark:bg-zinc-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Overrides ({filteredStaff.length})</span>
            </button>
            <button
              onClick={() => setViewMode('department')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer",
                viewMode === 'department'
                  ? "bg-white dark:bg-zinc-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Department Defaults ({departmentsList.length})</span>
            </button>
          </div>

          <button
            onClick={handleGrantAutoApproveToManagers}
            className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current text-amber-300" />
            <span>Auto-Approve All Managers</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9px] font-black uppercase tracking-widest">ACTIVE STAFF</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="text-2xl font-mono font-black text-zinc-900 dark:text-white mt-2">
            {staffList.filter(s => !s.isArchived).length}
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm flex flex-col bg-amber-500/[0.02] border-amber-500/10">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-[9px] font-black uppercase tracking-widest">TIMECLOCK AUTO-APPROVE</span>
            <Zap className="w-4 h-4" />
          </div>
          <span className="text-2xl font-mono font-black text-amber-650 dark:text-amber-400 mt-2">
            {autoApproveCount}
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9px] font-black uppercase tracking-widest">DEPARTMENTS</span>
            <Building2 className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-2xl font-mono font-black text-zinc-900 dark:text-white mt-2">
            {departmentsList.length}
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9px] font-black uppercase tracking-widest">REGISTERED PERMISSIONS</span>
            <KeyRound className="w-4 h-4 text-violet-500" />
          </div>
          <span className="text-2xl font-mono font-black text-zinc-900 dark:text-white mt-2">
            {Object.keys(PERMISSIONS).length}
          </span>
        </div>
      </div>

      {/* Interactive Legend Bar (Staff Mode Only) */}
      {viewMode === 'staff' && (
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400 uppercase text-[9px] font-black tracking-widest shrink-0">
            <Filter className="w-4 h-4 text-indigo-500" /> FILTER BY PERMISSION STATE:
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setSelectedStateFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                selectedStateFilter === 'all'
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-transparent shadow-sm"
                  : "bg-zinc-50 dark:bg-zinc-955 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <span>All States</span>
            </button>

            <button
              onClick={() => setSelectedStateFilter(selectedStateFilter === 'inherited' ? 'all' : 'inherited')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                selectedStateFilter === 'inherited'
                  ? "bg-indigo-650 text-white border-indigo-500 ring-2 ring-indigo-500/30 shadow-sm"
                  : "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20"
              )}
            >
              <Link className="w-3.5 h-3.5" />
              <span>Inherited (Department On)</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                {stateCounts.inherited}
              </span>
            </button>

            <button
              onClick={() => setSelectedStateFilter(selectedStateFilter === 'explicit_grant' ? 'all' : 'explicit_grant')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                selectedStateFilter === 'explicit_grant'
                  ? "bg-emerald-600 text-white border-emerald-500 ring-2 ring-emerald-500/30 shadow-sm"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
              )}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Explicit Grant (Override)</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                {stateCounts.explicitGrant}
              </span>
            </button>

            <button
              onClick={() => setSelectedStateFilter(selectedStateFilter === 'explicit_revoke' ? 'all' : 'explicit_revoke')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                selectedStateFilter === 'explicit_revoke'
                  ? "bg-rose-600 text-white border-rose-500 ring-2 ring-rose-500/30 shadow-sm"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
              )}
            >
              <X className="w-3.5 h-3.5" />
              <span>Explicit Revoke (Override)</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-500/20 text-rose-700 dark:text-rose-300">
                {stateCounts.explicitRevoke}
              </span>
            </button>

            <button
              onClick={() => setSelectedStateFilter(selectedStateFilter === 'not_granted' ? 'all' : 'not_granted')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                selectedStateFilter === 'not_granted'
                  ? "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 border-zinc-600 shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <Minus className="w-3.5 h-3.5" />
              <span>Not Granted</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {stateCounts.notGranted}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Search & Category Filter Control Bar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search Inputs */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto flex-1">
          {viewMode === 'staff' && (
            <div className="relative min-w-[220px] flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchStaff}
                onChange={(e) => setSearchStaff(e.target.value)}
                placeholder="Search staff by name, role, or department..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="relative min-w-[220px] flex-1">
            <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchPerm}
              onChange={(e) => setSearchPerm(e.target.value)}
              placeholder="Search permission key/name..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Category Selector & Quick Toggles */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-bold focus:outline-none"
          >
            <option value="All">All Categories</option>
            {Object.keys(CATEGORY_MAP).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {viewMode === 'staff' && (
            <button
              onClick={() => setFilterAutoApproveOnly(!filterAutoApproveOnly)}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer",
                filterAutoApproveOnly
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
                  : "bg-zinc-50 dark:bg-zinc-955 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Auto-Approve Only</span>
            </button>
          )}
        </div>
      </div>

      {/* Permission Matrix Grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-xs font-bold">Loading Permission Matrix & Department Inheritances...</span>
          </div>
        ) : viewMode === 'staff' ? (
          /* STAFF OVERRIDES VIEW */
          filteredStaff.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 text-xs font-semibold italic">
              No staff members found matching search criteria.
            </div>
          ) : Object.keys(permissionCategories).length === 0 ? (
            <div className="py-16 text-center text-zinc-400 text-xs font-semibold italic">
              No permissions found matching active state filter ("{selectedStateFilter}").
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[950px]">
                {/* Table Header: Staff Columns */}
                <thead>
                  <tr className="bg-zinc-50/80 dark:bg-zinc-955/80 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20 backdrop-blur-md">
                    <th className="py-4 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider w-[280px] sticky left-0 z-30 bg-zinc-50 dark:bg-zinc-955 border-r border-zinc-200 dark:border-zinc-800">
                      PERMISSION KEY / NAME
                    </th>
                    {filteredStaff.map(staff => {
                      const staffName = staff.name || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Technician';
                      const dept = departmentsMap[staff.departmentId];
                      const deptName = dept?.name || 'No Dept';
                      const autoState = getPermissionState(staff, 'timeclock.no_review_required');

                      return (
                        <th key={staff.id} className="py-3 px-3 text-center min-w-[130px] border-r border-zinc-200/60 dark:border-zinc-800/60">
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center font-black text-xs border border-indigo-500/20">
                                {staffName.charAt(0).toUpperCase()}
                              </div>
                              {autoState.isGranted && (
                                <span className="absolute -top-1 -right-1 p-0.5 rounded-full bg-amber-500 text-white" title="Auto-Approve Active">
                                  <Zap className="w-2.5 h-2.5 fill-current" />
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[120px] leading-tight block">
                              {staffName}
                            </span>
                            <span className="text-[9px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider truncate max-w-[120px] block">
                              {deptName}
                            </span>
                            <span className="text-[8px] font-bold uppercase text-zinc-400 tracking-widest block">
                              {staff.role || 'Staff'}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Table Body: Grouped Permissions */}
                <tbody className="divide-y divide-zinc-200/60 dark:border-zinc-800/60 text-xs">
                  {Object.entries(permissionCategories).map(([catName, permItems]) => (
                    <React.Fragment key={catName}>
                      {/* Category Header Row */}
                      <tr className="bg-zinc-100/60 dark:bg-zinc-950/60 font-black">
                        <td 
                          colSpan={filteredStaff.length + 1} 
                          className="py-2.5 px-4 text-[10px] font-black uppercase tracking-widest text-indigo-650 dark:text-indigo-400 border-y border-zinc-200/80 dark:border-zinc-800/80"
                        >
                          {catName} ({permItems.length})
                        </td>
                      </tr>

                      {/* Permission Items */}
                      {permItems.map(perm => {
                        const isAutoApproveKey = perm.key === 'timeclock.no_review_required';

                        return (
                          <tr 
                            key={perm.key} 
                            className={cn(
                              "hover:bg-zinc-50/50 dark:hover:bg-zinc-955/50 transition-colors",
                              isAutoApproveKey && "bg-amber-500/[0.03] dark:bg-amber-500/[0.05]"
                            )}
                          >
                            {/* Permission Title & Key Sticky Column */}
                            <td className="py-3 px-4 sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    "font-bold text-zinc-900 dark:text-white leading-snug",
                                    isAutoApproveKey && "text-amber-600 dark:text-amber-400 font-black"
                                  )}>
                                    {perm.label}
                                  </span>
                                  {isAutoApproveKey && (
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                                      KEY PERM
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
                                  {perm.key}
                                </span>
                              </div>
                            </td>

                            {/* Staff Permission Toggle Cells */}
                            {filteredStaff.map(staff => {
                              const state = getPermissionState(staff, perm.key);
                              const toggleId = `${staff.id}_${perm.key}`;
                              const isToggling = togglingKey === toggleId;
                              const isDimmed = selectedStateFilter !== 'all' && state.stateCategory !== selectedStateFilter;

                              return (
                                <td 
                                  key={staff.id} 
                                  className="py-2.5 px-3 text-center align-middle border-r border-zinc-200/50 dark:border-zinc-800/50"
                                >
                                  <button
                                    onClick={() => handleCyclePermissionState(staff, perm.key)}
                                    disabled={isToggling}
                                    className={cn(
                                      "w-8 h-8 rounded-xl flex items-center justify-center mx-auto transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 relative group",
                                      isDimmed && "opacity-25 grayscale-[0.5]",
                                      state.overrideType === 'grant' 
                                        ? "bg-emerald-500 text-white shadow-emerald-500/20 ring-2 ring-emerald-500/40" 
                                        : state.overrideType === 'revoke'
                                        ? "bg-rose-500 text-white shadow-rose-500/20 ring-2 ring-rose-500/40"
                                        : state.isGranted
                                        ? "bg-indigo-500/15 text-indigo-650 dark:text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25"
                                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-350 dark:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                    )}
                                    title={`${state.stateLabel} - Click to cycle state`}
                                  >
                                    {isToggling ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : state.overrideType === 'grant' ? (
                                      <Star className="w-3.5 h-3.5 fill-current text-white" />
                                    ) : state.overrideType === 'revoke' ? (
                                      <X className="w-3.5 h-3.5 stroke-[3]" />
                                    ) : state.isGranted ? (
                                      <Link className="w-3.5 h-3.5 text-indigo-500" />
                                    ) : (
                                      <Minus className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* DEPARTMENT DEFAULTS VIEW */
          departmentsList.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 text-xs font-semibold italic">
              No departments found in business configuration.
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[950px]">
                {/* Table Header: Department Columns */}
                <thead>
                  <tr className="bg-zinc-50/80 dark:bg-zinc-955/80 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20 backdrop-blur-md">
                    <th className="py-4 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider w-[280px] sticky left-0 z-30 bg-zinc-50 dark:bg-zinc-955 border-r border-zinc-200 dark:border-zinc-800">
                      PERMISSION KEY / NAME
                    </th>
                    {departmentsList.map(dept => (
                      <th key={dept.id} className="py-3 px-3 text-center min-w-[140px] border-r border-zinc-200/60 dark:border-zinc-800/60">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs border border-emerald-500/20">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[130px] leading-tight block">
                            {dept.name}
                          </span>
                          <span className="text-[8px] font-extrabold uppercase text-zinc-400 tracking-wider">
                            Department
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Table Body: Grouped Permissions for Departments */}
                <tbody className="divide-y divide-zinc-200/60 dark:border-zinc-800/60 text-xs">
                  {Object.entries(permissionCategories).map(([catName, permItems]) => (
                    <React.Fragment key={catName}>
                      {/* Category Header Row */}
                      <tr className="bg-zinc-100/60 dark:bg-zinc-950/60 font-black">
                        <td 
                          colSpan={departmentsList.length + 1} 
                          className="py-2.5 px-4 text-[10px] font-black uppercase tracking-widest text-indigo-650 dark:text-indigo-400 border-y border-zinc-200/80 dark:border-zinc-800/80"
                        >
                          {catName} ({permItems.length})
                        </td>
                      </tr>

                      {/* Permission Items */}
                      {permItems.map(perm => {
                        const isAutoApproveKey = perm.key === 'timeclock.no_review_required';

                        return (
                          <tr 
                            key={perm.key} 
                            className={cn(
                              "hover:bg-zinc-50/50 dark:hover:bg-zinc-955/50 transition-colors",
                              isAutoApproveKey && "bg-amber-500/[0.03] dark:bg-amber-500/[0.05]"
                            )}
                          >
                            {/* Permission Title & Key Sticky Column */}
                            <td className="py-3 px-4 sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    "font-bold text-zinc-900 dark:text-white leading-snug",
                                    isAutoApproveKey && "text-amber-600 dark:text-amber-400 font-black"
                                  )}>
                                    {perm.label}
                                  </span>
                                  {isAutoApproveKey && (
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                                      KEY PERM
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
                                  {perm.key}
                                </span>
                              </div>
                            </td>

                            {/* Department Permission Toggle Cells */}
                            {departmentsList.map(dept => {
                              const isDeptGranted = dept.permissions?.[perm.key] === true;
                              const toggleId = `dept_${dept.id}_${perm.key}`;
                              const isToggling = togglingKey === toggleId;

                              return (
                                <td 
                                  key={dept.id} 
                                  className="py-2.5 px-3 text-center align-middle border-r border-zinc-200/50 dark:border-zinc-800/50"
                                >
                                  <button
                                    onClick={() => handleToggleDepartmentPermission(dept, perm.key)}
                                    disabled={isToggling}
                                    className={cn(
                                      "w-8 h-8 rounded-xl flex items-center justify-center mx-auto transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50",
                                      isDeptGranted
                                        ? "bg-emerald-500/20 text-emerald-650 dark:text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30"
                                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-350 dark:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                    )}
                                    title={`${isDeptGranted ? 'Granted for ' + dept.name : 'Not Granted for ' + dept.name} - Click to toggle department permission`}
                                  >
                                    {isToggling ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : isDeptGranted ? (
                                      <Check className="w-4 h-4 stroke-[3]" />
                                    ) : (
                                      <Minus className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

    </div>
  );
}
