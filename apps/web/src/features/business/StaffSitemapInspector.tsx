import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { resolvePermissions, type PermissionSet } from '../../lib/auth/permissions';
import { ITEMS } from './BusinessSidebar';
import { 
  Search, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  XCircle,
  Filter
} from 'lucide-react';

const HUB_NAMES: Record<string, string> = {
  dashboard: '🏠 Dashboard',
  office: '🏢 Main Office',
  upfitters: '📋 Upfitters',
  parts: '📦 Parts Dept',
  facility: '🗺️ Facility',
  settings: '⚙️ Admin & Sync',
  development: '💻 In Development'
};

interface Department {
  id: string;
  name: string;
  permissions?: PermissionSet;
}

interface StaffMember {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  displayName?: string;
  email?: string;
  departmentId?: string;
  role?: string;
  title?: string;
  isSuperAdmin?: boolean;
  individualPermissions?: PermissionSet;
  isArchived?: boolean;
}

const SUPER_ADMIN_EMAILS = ['p.losey@saegrp.com', 'loseyp@gmail.com'];

export function StaffSitemapInspector({ tenantId }: { tenantId: string }) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);

  // Fetch live departments from Firestore
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['live-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
    },
    enabled: !!tenantId
  });

  // Fetch live staff members from Firestore
  const { data: staffMembers = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ['live-staff', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as StaffMember))
        .filter(s => !s.isArchived);
    },
    enabled: !!tenantId
  });

  const deptMap = useMemo(() => {
    const map: Record<string, Department> = {};
    departments.forEach(d => { map[d.id] = d; });
    return map;
  }, [departments]);

  // Compute per-person access map
  const processedStaff = useMemo(() => {
    return staffMembers.map(staff => {
      const isSuper = staff.isSuperAdmin || (staff.email && SUPER_ADMIN_EMAILS.includes(staff.email));
      const dept = deptMap[staff.departmentId || ''] || {};
      const deptPerms = dept.permissions || {};
      const indPerms = staff.individualPermissions || {};

      const resolvedPerms = resolvePermissions(deptPerms, indPerms);

      const fullName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.name || staff.displayName || staff.email || 'Staff Member';
      const title = staff.title || staff.role || dept.name || 'Team Member';

      const accessibleByHub: Record<string, typeof ITEMS> = {};
      const restrictedItems: typeof ITEMS = [];

      ITEMS.forEach(item => {
        let canAccess = false;
        if (isSuper) {
          canAccess = true;
        } else if (!item.permission && !item.permissions) {
          canAccess = true;
        } else if (item.permission) {
          canAccess = !!resolvedPerms[item.permission];
        } else if (item.permissions) {
          canAccess = item.permissions.some(p => !!resolvedPerms[p]);
        }

        if (canAccess) {
          if (!accessibleByHub[item.hub]) accessibleByHub[item.hub] = [];
          accessibleByHub[item.hub].push(item);
        } else {
          restrictedItems.push(item);
        }
      });

      const totalAccessible = Object.values(accessibleByHub).reduce((acc, curr) => acc + curr.length, 0);

      return {
        ...staff,
        fullName,
        title,
        deptName: dept.name || 'Unassigned',
        isSuper,
        resolvedPerms,
        accessibleByHub,
        restrictedItems,
        totalAccessible
      };
    });
  }, [staffMembers, deptMap]);

  const filteredStaff = useMemo(() => {
    return processedStaff.filter(s => {
      const matchesSearch = 
        s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.deptName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSelect = selectedStaffId === 'ALL' || s.id === selectedStaffId;
      return matchesSearch && matchesSelect;
    });
  }, [processedStaff, searchQuery, selectedStaffId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-zinc-400 font-sans">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-xs font-bold uppercase tracking-wider">Analyzing Staff Permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 font-sans text-zinc-100 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2 flex items-center gap-3">
            Staff Site Map Inspector <span className="text-indigo-400 font-normal">/ Real-Time Access</span>
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm">
            Live Firestore permission audit showing exact page availability and click paths for every team member.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800/80">
          <div className="text-center px-4 border-r border-zinc-800">
            <div className="text-2xl font-black text-white">{processedStaff.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">Active Staff</div>
          </div>
          <div className="text-center px-4">
            <div className="text-2xl font-black text-indigo-400">{ITEMS.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">Total App Pages</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800 sticky top-4 z-20 backdrop-blur-xl shadow-xl">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search staff name, email, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500 ml-1" />
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Staff Members ({processedStaff.length})</option>
            {processedStaff.map(s => (
              <option key={s.id} value={s.id}>{s.fullName} ({s.deptName})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Cards List */}
      <div className="space-y-4">
        {filteredStaff.map((staff) => {
          const isExpanded = expandedStaffId === staff.id || filteredStaff.length === 1;

          return (
            <div 
              key={staff.id}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl transition-all"
            >
              {/* Header Bar */}
              <div 
                onClick={() => setExpandedStaffId(isExpanded ? null : staff.id)}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/40 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-indigo-400 font-bold text-lg shrink-0 shadow-inner">
                    {staff.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">{staff.fullName}</h3>
                      {staff.isSuper ? (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase tracking-wider">Super Admin</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[9px] font-black uppercase tracking-wider">{staff.deptName}</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 font-medium">{staff.email} • {staff.title}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0 border-zinc-800">
                  <div className="text-right">
                    <div className="text-sm font-black text-emerald-400">
                      {staff.totalAccessible} / {ITEMS.length} Pages
                    </div>
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                      {Math.round((staff.totalAccessible / ITEMS.length) * 100)}% Coverage
                    </div>
                  </div>

                  <div className="p-2 text-zinc-500 group-hover:text-white transition">
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Expanded Breakdown */}
              {isExpanded && (
                <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/60 space-y-6">
                  {/* Accessible Hubs */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Accessible Hubs & Pages
                    </h4>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(staff.accessibleByHub).map(([hubId, items]) => (
                        <div key={hubId} className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                            <span className="text-xs font-extrabold text-white">{HUB_NAMES[hubId] || hubId}</span>
                            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                              {items.length} pages
                            </span>
                          </div>
                          <ul className="space-y-1.5 font-mono text-[11px]">
                            {items.map(it => (
                              <li key={it.id} className="text-zinc-300 flex items-center justify-between gap-2">
                                <span className="truncate font-sans font-semibold text-zinc-200">
                                  {it.label} {it.groupLabel && <span className="text-[9px] text-zinc-500 font-mono">[{it.groupLabel}]</span>}
                                </span>
                                <a 
                                  href={`/business/${tenantId}/${it.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono underline shrink-0"
                                >
                                  /{it.id}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Restricted Pages */}
                  {staff.restrictedItems.length > 0 && !staff.isSuper && (
                    <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                      <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
                        <XCircle className="w-4 h-4" /> Restricted / Hidden Pages ({staff.restrictedItems.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {staff.restrictedItems.map(it => {
                          const req = it.permission || (it.permissions ? it.permissions.join(' | ') : 'N/A');
                          return (
                            <div key={it.id} className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] font-medium flex items-center gap-1.5">
                              <span>{it.label}</span>
                              <span className="text-[9px] text-rose-400/70 font-mono">({req})</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredStaff.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed border-zinc-800 rounded-3xl text-zinc-500 text-xs">
            No staff members found matching your search query.
          </div>
        )}
      </div>
    </div>
  );
}
