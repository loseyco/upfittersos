import { useState } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { db } from '../../lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { 
  Users, Building2, User, Search, X, Eye, 
  ShieldCheck, Loader2, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { resolvePermissions } from '../../lib/auth/permissions';
import type { PermissionSet } from '../../lib/auth/permissions';
import { cn } from '../../lib/utils';

interface Department {
  id: string;
  name: string;
  permissions: PermissionSet;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  departmentId?: string;
  individualPermissions?: PermissionSet;
  isArchived?: boolean;
}

export function MasqueradeSelector({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { tenantId, impersonate, impersonatedStaff } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: departments, isLoading: isLoadingDepts } = useQuery<Department[]>({
    queryKey: ['masquerade-departments', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
    },
    enabled: isOpen && !!tenantId
  });

  const { data: staff, isLoading: isLoadingStaff } = useQuery<StaffMember[]>({
    queryKey: ['masquerade-staff', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffMember));
    },
    enabled: isOpen && !!tenantId
  });

  if (!isOpen) return null;

  const filteredDepts = departments?.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStaff = staff?.filter(s => 
    !s.isArchived && (
      `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleImpersonate = (type: 'staff' | 'role', item: any) => {
    let permissions: PermissionSet = {};
    let name = '';
    let id = '';

    if (type === 'role') {
      permissions = item.permissions || {};
      name = `${item.name} (Role)`;
      id = item.id;
    } else {
      const dept = departments?.find(d => d.id === item.departmentId);
      permissions = resolvePermissions(dept?.permissions, item.individualPermissions);
      name = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email || 'Unnamed Staff';
      id = item.id;
    }

    impersonate({ id, name, permissions, type });
    toast.success(`Now viewing as ${name}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Masquerade Mode</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">View the platform as a specific role or staff member</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input 
              type="text"
              placeholder="Search roles or staff..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-lg font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          {(isLoadingDepts || isLoadingStaff) && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading options...</p>
            </div>
          )}

          {!isLoadingDepts && filteredDepts && filteredDepts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Building2 className="w-4 h-4 text-zinc-400" />
                <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Roles (Departments)</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredDepts.map(dept => (
                  <button
                    key={dept.id}
                    onClick={() => handleImpersonate('role', dept)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all group active:scale-[0.98]",
                      impersonatedStaff?.id === dept.id && impersonatedStaff.type === 'role'
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        impersonatedStaff?.id === dept.id && impersonatedStaff.type === 'role'
                          ? "bg-white/20 text-white"
                          : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      )}>
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <span className="font-bold tracking-tight">{dept.name}</span>
                    </div>
                    <ChevronRight className={cn(
                      "w-4 h-4 transition-transform group-hover:translate-x-0.5",
                      impersonatedStaff?.id === dept.id && impersonatedStaff.type === 'role' ? "text-white" : "text-zinc-300"
                    )} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isLoadingStaff && filteredStaff && filteredStaff.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Staff Members</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredStaff.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleImpersonate('staff', s)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all group active:scale-[0.98]",
                      impersonatedStaff?.id === s.id && impersonatedStaff.type === 'staff'
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                        impersonatedStaff?.id === s.id && impersonatedStaff.type === 'staff'
                          ? "bg-white/20 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      )}>
                        {(s.firstName?.[0] || '').toUpperCase()}{(s.lastName?.[0] || '').toUpperCase() || <User className="w-4 h-4" />}
                      </div>
                      <div className="text-left min-w-0">
                        <p className="font-bold tracking-tight truncate">{s.firstName} {s.lastName}</p>
                        <p className={cn(
                          "text-[10px] truncate",
                          impersonatedStaff?.id === s.id && impersonatedStaff.type === 'staff' ? "text-white/80" : "text-zinc-500"
                        )}>
                          {departments?.find(d => d.id === s.departmentId)?.name || 'No Dept'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "w-4 h-4 transition-transform group-hover:translate-x-0.5",
                      impersonatedStaff?.id === s.id && impersonatedStaff.type === 'staff' ? "text-white" : "text-zinc-300"
                    )} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isLoadingStaff && filteredStaff?.length === 0 && filteredDepts?.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-zinc-400" />
              </div>
              <p className="text-zinc-500 font-medium">No results found for "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center">
            Authorized Personnel Only • Audit Logging Active
          </p>
        </div>
      </div>
    </div>
  );
}
