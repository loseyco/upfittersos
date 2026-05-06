import { useState } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { 
  X, Edit2, UserPlus, Search, Archive, Mail, Phone, Briefcase, 
  Building2, Loader2, Save, ShieldCheck, ChevronRight, Check,
  ShieldAlert, Settings2
} from 'lucide-react';
import { doc, updateDoc, collection, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { getDocs } from 'firebase/firestore';
import { PERMISSIONS, PermissionKey, PermissionSet, resolvePermissions } from '../../lib/auth/permissions';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  departmentId?: string;
  individualPermissions?: PermissionSet;
  isArchived?: boolean;
  tags?: string[];
  notes?: string[];
  hireDate?: string;
  fireDate?: string;
  shirtSize?: string;
  hatSize?: string;
  pantsSize?: string;
  shoeSize?: string;
  gloveSize?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
  ListID?: string;
  qb_ListID?: string;
  quickbooksId?: string;
}

interface Department {
  id: string;
  name: string;
  permissions: PermissionSet;
}

export function StaffManager({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'staff' | 'departments'>('staff');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
    }
  });

  const handleFilter = (item: any) => {
    if (item.isArchived) return false;
    
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const deptName = departments?.find(d => d.id === item.departmentId)?.name || '';
    
    const searchableFields = [
      item.firstName,
      item.lastName,
      item.email,
      item.phone,
      item.role,
      deptName,
      `${item.firstName} ${item.lastName}`
    ].map(f => String(f || '').toLowerCase());
    
    return searchableFields.some(field => field.includes(query));
  };

  const getSource = (row: any) => {
    const isQB = row.tags?.includes('QuickBooks') || 
                 row.notes?.includes('Imported via QBWC') || 
                 !!row.ListID || !!row.qb_ListID || 
                 !!row.quickbooksId;
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
        isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
      }`}>
        {isQB ? 'QuickBooks' : 'Native'}
      </span>
    );
  };

  const staffColumns = [
    { 
      key: 'name', 
      label: 'Staff Member',
      format: (_: any, row: any) => {
        const name = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.displayName || row.email || 'Unnamed';
        return <span className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</span>;
      }
    },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', format: (val: any) => <span className="capitalize">{val?.replace('_', ' ') || 'Staff'}</span> },
    { 
      key: 'departmentId', 
      label: 'Department', 
      format: (val: any) => {
        const dept = departments?.find(d => d.id === val);
        return dept ? <span className="font-medium text-indigo-600 dark:text-indigo-400">{dept.name}</span> : <span className="text-zinc-400 italic">None</span>;
      }
    },
    { key: 'hireDate', label: 'Hire Date', format: (val: any) => val ? new Date(val).toLocaleDateString() : <span className="text-zinc-400 italic">--</span> },
    { key: 'fireDate', label: 'Term. Date', format: (val: any) => val ? new Date(val).toLocaleDateString() : <span className="text-zinc-400 italic">--</span> },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">Staff & Permissions</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage business departments, staff, and access control.</p>
          </div>
          
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
            <button 
              onClick={() => setView('staff')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'staff' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Staff List
            </button>
            <button 
              onClick={() => setView('departments')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'departments' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Departments
            </button>
          </div>
        </div>

        {view === 'staff' && (
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
              />
            </div>
            <button 
              onClick={() => setIsAddingStaff(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Add Staff
            </button>
          </div>
        )}
      </div>

      {view === 'staff' ? (
        <GenericDataGrid 
          collectionPath={`businesses/${tenantId}/staff`} 
          title="Staff Members" 
          columns={staffColumns}
          localFilter={handleFilter}
          onRowClick={(row) => setSelectedStaff(row as StaffMember)}
        />
      ) : (
        <DepartmentManager tenantId={tenantId} departments={departments || []} />
      )}

      {selectedStaff && !editingStaff && (
        <StaffDetailsModal 
          staff={selectedStaff}
          departments={departments || []}
          onClose={() => setSelectedStaff(null)}
          onEdit={() => {
            setEditingStaff(selectedStaff);
            setSelectedStaff(null);
          }}
          onArchive={async () => {
            if (window.confirm("Are you sure you want to archive this staff member?")) {
              try {
                await updateDoc(doc(db, `businesses/${tenantId}/staff`, selectedStaff.id), { isArchived: true });
                toast.success("Staff member archived");
                queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/staff`] });
                setSelectedStaff(null);
              } catch (e) {
                toast.error("Failed to archive staff member");
              }
            }
          }}
          getSource={getSource}
        />
      )}

      {(isAddingStaff || editingStaff) && (
        <StaffEditModal
          tenantId={tenantId}
          staff={editingStaff || undefined}
          departments={departments || []}
          onClose={() => {
            setEditingStaff(null);
            setIsAddingStaff(false);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/staff`] });
            setEditingStaff(null);
            setIsAddingStaff(false);
          }}
        />
      )}
    </div>
  );
}

function DepartmentManager({ tenantId, departments }: { tenantId: string, departments: Department[] }) {
  const queryClient = useQueryClient();
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [isAddingDept, setIsAddingDept] = useState(false);

  const handleArchive = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this department? Staff assigned to it will lose their inherited permissions.")) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/departments`, id));
      toast.success("Department deleted");
      queryClient.invalidateQueries({ queryKey: ['departments', tenantId] });
    } catch (e) {
      toast.error("Failed to delete department");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {departments.map(dept => (
        <div key={dept.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between group hover:border-indigo-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => setEditingDept(dept)}
                  className="p-1.5 text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleArchive(dept.id)}
                  className="p-1.5 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <Archive className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">{dept.name}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              {Object.values(dept.permissions || {}).filter(Boolean).length} Active Permissions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(dept.permissions || {})
                .filter(([_, v]) => v)
                .slice(0, 3)
                .map(([k]) => (
                  <span key={k} className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 rounded-md border border-zinc-200 dark:border-zinc-700">
                    {PERMISSIONS[k as PermissionKey]}
                  </span>
                ))}
              {Object.values(dept.permissions || {}).filter(Boolean).length > 3 && (
                <span className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 text-[10px] font-medium text-zinc-400 rounded-md border border-zinc-200 dark:border-zinc-700">
                  +{Object.values(dept.permissions || {}).filter(Boolean).length - 3} more
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
      
      <button 
        onClick={() => setIsAddingDept(true)}
        className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-zinc-400 hover:text-indigo-500 hover:border-indigo-500/50 hover:bg-indigo-500/[0.02] transition-all group"
      >
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-full group-hover:bg-indigo-500/10 transition-colors">
          <Building2 className="w-6 h-6" />
        </div>
        <span className="text-sm font-bold">Add New Department</span>
      </button>

      {(isAddingDept || editingDept) && (
        <DepartmentEditModal 
          tenantId={tenantId}
          dept={editingDept || undefined}
          onClose={() => {
            setEditingDept(null);
            setIsAddingDept(false);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['departments', tenantId] });
            setEditingDept(null);
            setIsAddingDept(false);
          }}
        />
      )}
    </div>
  );
}

function DepartmentEditModal({ tenantId, dept, onClose, onSaved }: { tenantId: string, dept?: Department, onClose: () => void, onSaved: () => void }) {
  const [name, setName] = useState(dept?.name || '');
  const [permissions, setPermissions] = useState<PermissionSet>(dept?.permissions || {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        permissions,
        updatedAt: serverTimestamp()
      };
      if (dept?.id) {
        await updateDoc(doc(db, `businesses/${tenantId}/departments`, dept.id), data);
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/departments`), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      toast.success(dept ? "Department updated" : "Department created");
      onSaved();
    } catch (e) {
      toast.error("Failed to save department");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-xl text-zinc-900 dark:text-white">{dept ? 'Edit Department' : 'New Department'}</h3>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-6 h-6"/></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col h-[70vh]">
          <div className="p-8 space-y-8 flex-1 overflow-y-auto no-scrollbar">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Department Name</label>
              <input 
                type="text" 
                required
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. Sales, Service, Admin..."
                className="w-full px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-lg font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck className="w-5 h-5 text-indigo-500" />
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Base Permissions</label>
              </div>
              <PermissionGrid 
                permissions={permissions} 
                onChange={setPermissions} 
              />
            </div>
          </div>
          <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 px-8 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
              Cancel
            </button>
            <button disabled={isSubmitting} type="submit" className="flex-[2] px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSubmitting ? 'Saving...' : 'Save Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionGrid({ 
  permissions, 
  onChange, 
  inheritedPermissions = {},
  isOverriding = false,
  onOverrideChange
}: { 
  permissions: PermissionSet, 
  onChange: (p: PermissionSet) => void,
  inheritedPermissions?: PermissionSet,
  isOverriding?: boolean,
  onOverrideChange?: (key: PermissionKey, value: boolean | undefined) => void
}) {
  const categories = {
    'General': ['mission_control.view'],
    'Inventory & Vehicles': ['vehicles.view', 'vehicles.manage', 'zones.view', 'zones.manage', 'parts.view', 'parts.manage'],
    'Business Operations': ['customers.view', 'customers.manage', 'jobs.view', 'jobs.manage', 'staff.view', 'staff.manage'],
    'System': ['settings.view', 'settings.manage']
  };

  return (
    <div className="space-y-8">
      {Object.entries(categories).map(([category, keys]) => (
        <div key={category}>
          <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-4 px-1">{category}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {keys.map(key => {
              const k = key as PermissionKey;
              const isExplicitlySet = permissions[k] !== undefined;
              const value = isExplicitlySet ? permissions[k] : inheritedPermissions[k];
              const isInherited = !isExplicitlySet && inheritedPermissions[k] !== undefined;

              return (
                <div 
                  key={k}
                  className={`
                    flex items-center justify-between p-4 rounded-2xl border transition-all
                    ${value 
                      ? 'bg-indigo-500/5 border-indigo-500/20' 
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800'}
                  `}
                >
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${value ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                      {PERMISSIONS[k]}
                    </span>
                    {isInherited && (
                      <span className="text-[9px] font-medium text-zinc-400 uppercase tracking-tighter flex items-center gap-1 mt-0.5">
                        <Check className="w-2.5 h-2.5" /> Inherited from Department
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isOverriding && isExplicitlySet && (
                      <button 
                        type="button"
                        onClick={() => onOverrideChange?.(k, undefined)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        title="Clear Override"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isOverriding) {
                          onOverrideChange?.(k, !value);
                        } else {
                          onChange({ ...permissions, [k]: !permissions[k] });
                        }
                      }}
                      className={`
                        relative w-12 h-6 rounded-full transition-colors duration-200
                        ${value ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}
                      `}
                    >
                      <div className={`
                        absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm
                        ${value ? 'translate-x-6' : 'translate-x-0'}
                      `} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffDetailsModal({ 
  staff, 
  departments,
  onClose, 
  onEdit, 
  onArchive, 
  getSource 
}: { 
  staff: StaffMember, 
  departments: Department[],
  onClose: () => void, 
  onEdit: () => void, 
  onArchive?: () => void, 
  getSource: (row: any) => React.ReactNode 
}) {
  const isQB = staff.tags?.includes('QuickBooks') || 
               staff.notes?.includes('Imported via QBWC') || 
               !!staff.ListID || !!staff.qb_ListID || 
               !!staff.quickbooksId;

  const dept = departments.find(d => d.id === staff.departmentId);
  const resolvedPerms = resolvePermissions(dept?.permissions, staff.individualPermissions);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <span className="text-2xl font-bold">{staff.firstName[0]}{staff.lastName[0]}</span>
            </div>
            <div>
              <h3 className="font-black text-2xl text-zinc-900 dark:text-white leading-tight">
                {staff.firstName} {staff.lastName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                  {staff.role || 'Staff'}
                </span>
                {dept && (
                  <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                    {dept.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isQB && onArchive && (
              <button 
                onClick={onArchive}
                className="p-3 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-xl transition-all"
                title="Archive Staff Member"
              >
                <Archive className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={onEdit}
              className="p-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-xl transition-all"
              title="Edit Staff Member"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button 
              onClick={onClose}
              className="p-3 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
          <div className="p-8 grid grid-cols-2 gap-8 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/30">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Sizes</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <p className="text-[10px] font-semibold text-zinc-500 flex justify-between"><span>Shirt:</span> <span className="text-zinc-900 dark:text-white">{staff.shirtSize || '--'}</span></p>
                <p className="text-[10px] font-semibold text-zinc-500 flex justify-between"><span>Hat:</span> <span className="text-zinc-900 dark:text-white">{staff.hatSize || '--'}</span></p>
                <p className="text-[10px] font-semibold text-zinc-500 flex justify-between"><span>Pants:</span> <span className="text-zinc-900 dark:text-white">{staff.pantsSize || '--'}</span></p>
                <p className="text-[10px] font-semibold text-zinc-500 flex justify-between"><span>Shoe:</span> <span className="text-zinc-900 dark:text-white">{staff.shoeSize || '--'}</span></p>
                <p className="text-[10px] font-semibold text-zinc-500 flex justify-between"><span>Glove:</span> <span className="text-zinc-900 dark:text-white">{staff.gloveSize || '--'}</span></p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Emergency Contact</p>
              {staff.emergencyContact?.name ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">{staff.emergencyContact.name}</p>
                  <p className="text-[10px] text-zinc-500">{staff.emergencyContact.relation} • {staff.emergencyContact.phone}</p>
                </div>
              ) : (
                <p className="text-[10px] text-zinc-400 italic">No contact info</p>
              )}
            </div>
          </div>

        <div className="p-8 grid grid-cols-2 gap-8 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Contact Information</p>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-3">
                <Mail className="w-4 h-4 text-zinc-400" />
                {staff.email}
              </p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-3">
                <Phone className="w-4 h-4 text-zinc-400" />
                {staff.phone || '--'}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Dates</p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                <span>Hired:</span>
                <span className="text-zinc-900 dark:text-white">{staff.hireDate ? new Date(staff.hireDate).toLocaleDateString() : 'N/A'}</span>
              </p>
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                <span>Terminated:</span>
                <span className="text-zinc-900 dark:text-white">{staff.fireDate ? new Date(staff.fireDate).toLocaleDateString() : 'N/A'}</span>
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Record Source</p>
            <div className="flex items-center gap-3">
              {getSource(staff)}
              {isQB && <span className="text-[10px] text-zinc-500 italic">Sync-locked</span>}
            </div>
          </div>
        </div>

        <div className="p-8 bg-zinc-50/50 dark:bg-zinc-950/30 overflow-y-auto no-scrollbar max-h-[300px]">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-widest">Active Permissions</h4>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-600 uppercase">Resolved Access</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(resolvedPerms).filter(([_, v]) => v).map(([k]) => (
              <span key={k} className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 rounded-lg shadow-sm">
                {PERMISSIONS[k as PermissionKey]}
              </span>
            ))}
            {Object.values(resolvedPerms).every(v => !v) && (
              <div className="w-full p-8 text-center bg-zinc-100/50 dark:bg-zinc-800/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
                <ShieldAlert className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No active permissions for this staff member.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffEditModal({ 
  tenantId, 
  staff, 
  departments,
  onClose, 
  onSaved 
}: { 
  tenantId: string, 
  staff?: StaffMember, 
  departments: Department[],
  onClose: () => void, 
  onSaved: () => void 
}) {
  const [firstName, setFirstName] = useState(staff?.firstName || '');
  const [lastName, setLastName] = useState(staff?.lastName || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [role, setRole] = useState(staff?.role || 'staff');
  const [departmentId, setDepartmentId] = useState(staff?.departmentId || '');
  const [hireDate, setHireDate] = useState(staff?.hireDate || '');
  const [fireDate, setFireDate] = useState(staff?.fireDate || '');
  const [shirtSize, setShirtSize] = useState(staff?.shirtSize || '');
  const [hatSize, setHatSize] = useState(staff?.hatSize || '');
  const [pantsSize, setPantsSize] = useState(staff?.pantsSize || '');
  const [shoeSize, setShoeSize] = useState(staff?.shoeSize || '');
  const [gloveSize, setGloveSize] = useState(staff?.gloveSize || '');
  const [emergencyName, setEmergencyName] = useState(staff?.emergencyContact?.name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(staff?.emergencyContact?.phone || '');
  const [emergencyRelation, setEmergencyRelation] = useState(staff?.emergencyContact?.relation || '');
  const [individualPermissions, setIndividualPermissions] = useState<PermissionSet>(staff?.individualPermissions || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'permissions'>('details');

  const selectedDept = departments.find(d => d.id === departmentId);

  const handleOverrideChange = (key: PermissionKey, value: boolean | undefined) => {
    const newPerms = { ...individualPermissions };
    if (value === undefined) {
      delete newPerms[key];
    } else {
      newPerms[key] = value;
    }
    setIndividualPermissions(newPerms);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const data = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role: role.toLowerCase(),
        departmentId: departmentId || null,
        hireDate: hireDate || null,
        fireDate: fireDate || null,
        shirtSize: shirtSize || null,
        hatSize: hatSize || null,
        pantsSize: pantsSize || null,
        shoeSize: shoeSize || null,
        gloveSize: gloveSize || null,
        emergencyContact: {
          name: emergencyName.trim(),
          phone: emergencyPhone.trim(),
          relation: emergencyRelation.trim()
        },
        individualPermissions,
        updatedAt: serverTimestamp()
      };

      if (staff?.id) {
        await updateDoc(doc(db, `businesses/${tenantId}/staff`, staff.id), data);
        toast.success('Staff member updated');
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/staff`), {
          ...data,
          createdAt: serverTimestamp(),
          isArchived: false
        });
        toast.success('Staff member added');
      }
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save staff member');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-xl text-zinc-900 dark:text-white flex items-center gap-3">
              {staff ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <UserPlus className="w-5 h-5 text-indigo-500" />}
              {staff ? 'Edit Staff Member' : 'New Staff Onboarding'}
            </h3>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-6 h-6"/></button>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('details')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'details' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
            >
              <UserPlus className="w-4 h-4" /> Personal Info
            </button>
            <button 
              onClick={() => setActiveTab('permissions')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'permissions' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
            >
              <ShieldCheck className="w-4 h-4" /> Permissions & Access
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-[65vh]">
          <div className="p-8 flex-1 overflow-y-auto no-scrollbar">
            {activeTab === 'details' ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">First Name *</label>
                    <input 
                      type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} 
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Last Name *</label>
                    <input 
                      type="text" required value={lastName} onChange={e => setLastName(e.target.value)} 
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Email Address *</label>
                  <input 
                    type="email" required value={email} onChange={e => setEmail(e.target.value)} 
                    className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Phone Number</label>
                  <input 
                    type="tel" value={phone} onChange={e => setPhone(e.target.value)} 
                    className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Assigned Role</label>
                    <select 
                      value={role} onChange={e => setRole(e.target.value)}
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all appearance-none"
                    >
                      <option value="staff">Standard Staff</option>
                      <option value="technician">Technician</option>
                      <option value="manager">Dept Manager</option>
                      <option value="admin">System Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Business Department</label>
                    <select 
                      value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all appearance-none"
                    >
                      <option value="">No Department Assigned</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Hire Date</label>
                    <input 
                      type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} 
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Termination Date</label>
                    <input 
                      type="date" value={fireDate} onChange={e => setFireDate(e.target.value)} 
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div className="pt-4 space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-zinc-400" />
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Uniform Sizes</h4>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      { label: 'Shirt', value: shirtSize, setter: setShirtSize },
                      { label: 'Hat', value: hatSize, setter: setHatSize },
                      { label: 'Pants', value: pantsSize, setter: setPantsSize },
                      { label: 'Shoe', value: shoeSize, setter: setShoeSize },
                      { label: 'Glove', value: gloveSize, setter: setGloveSize }
                    ].map(item => (
                      <div key={item.label}>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">{item.label}</label>
                        <input 
                          type="text" 
                          placeholder="Size..."
                          value={item.value} 
                          onChange={e => item.setter(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-zinc-400" />
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Emergency Contact</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Contact Name</label>
                      <input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Phone Number</label>
                      <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Relationship</label>
                      <input type="text" value={emergencyRelation} onChange={e => setEmergencyRelation(e.target.value)} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl h-fit">
                    <Settings2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-600 dark:text-amber-400">Advanced Access Control</h4>
                    <p className="text-sm text-amber-600/70 dark:text-amber-400/60 leading-relaxed">
                      Staff inherit permissions from their assigned department. You can toggle specific overrides below to grant or revoke unique access for this individual.
                    </p>
                  </div>
                </div>

                <PermissionGrid 
                  permissions={individualPermissions} 
                  inheritedPermissions={selectedDept?.permissions}
                  isOverriding={true}
                  onOverrideChange={handleOverrideChange}
                  onChange={() => {}}
                />
              </div>
            )}
          </div>
          
          <div className="p-8 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 px-8 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
              Cancel
            </button>
            <button disabled={isSubmitting} type="submit" className="flex-[2] px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSubmitting ? 'Saving Changes...' : staff ? 'Update Staff Member' : 'Onboard Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
