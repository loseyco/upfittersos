import { useState, useEffect } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { 
  X, Edit2, UserPlus, Search, Archive, Mail, Phone, 
  Building2, Loader2, Save, ShieldCheck, Check,
  ShieldAlert, Trophy, Eye, Settings2, Calendar,
  Trash2, Smile, Frown, ExternalLink, Users
} from 'lucide-react';
import { StaffLink } from './StaffPerformance';
import { doc, updateDoc, collection, addDoc, serverTimestamp, deleteDoc, getDocs, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { PERMISSIONS, resolvePermissions } from '../../lib/auth/permissions';
import type { PermissionKey, PermissionSet } from '../../lib/auth/permissions';
import { useAuthStore } from '../../lib/auth/store';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';


export interface WorkSchedule {
  days: number[]; // [1, 2, 3, 4, 5] where 1=Mon
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  expectedHoursPerDay: number;
}

export interface StaffMember {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId?: string;
  jobTitle?: string;
  role?: string;
  payRate?: number;
  payType?: 'hourly' | 'salary' | 'flat_rate';
  individualPermissions?: PermissionSet;
  isArchived?: boolean;
  tags?: string[];
  notes?: string;
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
  individualSchedule?: WorkSchedule;
  techNumber?: string;
  payPeriodBookTimeCredit?: number;
}

export interface Department {
  id: string;
  name: string;
  permissions: PermissionSet;
  defaultSchedule?: WorkSchedule;
  weeklyBookTimeCredit?: number;
}

export function StaffManager({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });


  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
    }
  });

  const handleFilter = (item: any) => {
    if (item.isArchived && !showArchived) return false;
    
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
    const isArchivedBadge = row.isArchived ? (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-500/20 mr-2">
        Archived
      </span>
    ) : null;

    return (
      <>
        {isArchivedBadge}
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
          isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
        }`}>
          {isQB ? 'QuickBooks' : 'Native'}
        </span>
      </>
    );
  };

  const staffColumns = [
    { 
      key: 'name', 
      label: 'Staff Member',
      format: (_: any, row: any) => {
        const name = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.displayName || row.email || 'Unnamed';
        return <StaffLink name={name} tenantId={tenantId} staffId={row.id} className="font-semibold text-zinc-900 dark:text-zinc-100" />;
      }
    },
    { key: 'email', label: 'Email' },
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
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage business staff and access control.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
              showArchived 
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-200 dark:border-zinc-700'
                : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
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
      </div>

        <GenericDataGrid 
          collectionPath={`businesses/${tenantId}/staff`} 
          title="Staff Members" 
          columns={staffColumns}
          localFilter={handleFilter}
          onRowClick={(row) => navigate(`/business/${tenantId}/staff/${row.id}`)}
        />


      {selectedStaff && !editingStaff && (
        <StaffDetailsModal 
          staff={selectedStaff}
          tenantId={tenantId}
          departments={departments || []}
          onClose={() => setSelectedStaff(null)}
          onEdit={() => {
            setEditingStaff(selectedStaff);
            setSelectedStaff(null);
          }}
          onArchive={async () => {
            setConfirmConfig({
              isOpen: true,
              title: 'Archive Staff Member',
              message: `Are you sure you want to archive ${selectedStaff.firstName}? They will no longer be able to log in or appear in active lists.`,
              onConfirm: async () => {
                try {
                  await updateDoc(doc(db, `businesses/${tenantId}/staff`, selectedStaff.id), { isArchived: true });
                  toast.success("Staff member archived");
                  queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/staff`] });
                  setSelectedStaff(null);
                } catch (e) {
                  toast.error("Failed to archive staff member");
                }
              }
            });
          }}

          onImpersonate={() => {
            const dept = departments?.find(d => d.id === selectedStaff.departmentId);
            const resolved = resolvePermissions(dept?.permissions, selectedStaff.individualPermissions);
            useAuthStore.getState().impersonate({
              id: selectedStaff.id,
              name: `${selectedStaff.firstName} ${selectedStaff.lastName}`,
              permissions: resolved,
              type: 'staff'
            });
            setSelectedStaff(null);
            toast.success(`Viewing as ${selectedStaff.firstName}`);
          }}
          onViewPerformance={() => {
            const name = `${selectedStaff.firstName} ${selectedStaff.lastName}`;
            navigate(`/business/${tenantId}/performance?staffName=${encodeURIComponent(name)}`);
            setSelectedStaff(null);
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

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>

  );
}

export function DepartmentsPage({ tenantId }: { tenantId: string }) {
  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
    }
  });

  const [confirmConfig, setConfirmConfig] = useState<any>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">Departments</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage business departments and default permissions.</p>
        </div>
      </div>
      
      <DepartmentManager tenantId={tenantId} departments={departments || []} onConfirmAction={setConfirmConfig} />
      
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev: any) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

function DepartmentManager({ tenantId, departments, onConfirmAction }: { tenantId: string, departments: Department[], onConfirmAction: (config: any) => void }) {

  const queryClient = useQueryClient();
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [isAddingDept, setIsAddingDept] = useState(false);

  const handleArchive = async (id: string) => {
    onConfirmAction({
      isOpen: true,
      title: 'Delete Department',
      message: 'Are you sure you want to delete this department? Staff assigned to it will lose their inherited permissions.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, `businesses/${tenantId}/departments`, id));
          toast.success("Department deleted");
          queryClient.invalidateQueries({ queryKey: ['departments', tenantId] });
        } catch (e) {
          toast.error("Failed to delete department");
        }
      }
    });
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
              <div className="flex items-center gap-1 transition-opacity">
                <button 
                  onClick={() => setEditingDept(dept)}
                  className="p-2 text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors border border-zinc-200 dark:border-zinc-700"
                  title="Edit Department"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleArchive(dept.id)}
                  className="p-2 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors border border-zinc-200 dark:border-zinc-700"
                  title="Delete Department"
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
  const [defaultSchedule, setDefaultSchedule] = useState<WorkSchedule>(dept?.defaultSchedule || {
    days: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '17:00',
    expectedHoursPerDay: 8
  });
  const [weeklyBookTimeCredit, setWeeklyBookTimeCredit] = useState<number>(dept?.weeklyBookTimeCredit || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        permissions,
        defaultSchedule,
        weeklyBookTimeCredit: Number(weeklyBookTimeCredit) || 0,
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
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Default Weekly Book Time Credit (Hours)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.5"
                  value={weeklyBookTimeCredit} 
                  onChange={e => setWeeklyBookTimeCredit(Number(e.target.value))} 
                  placeholder="e.g. 2.0"
                  className="w-full px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-lg font-semibold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400 uppercase">Hours / Week</span>
              </div>
              <p className="text-xs text-zinc-400 mt-2">Every technician assigned to this department will receive this flat weekly book time credit as an automatic pay bonus, unless overridden on their individual staff profile.</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-6">
                <Calendar className="w-5 h-5 text-indigo-500" />
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Default Work Schedule</label>
              </div>
              
              <div className="space-y-6 bg-zinc-50 dark:bg-zinc-950 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Operating Days</label>
                  <div className="flex flex-wrap gap-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                      const dayNum = idx + 1;
                      const isSelected = defaultSchedule.days.includes(dayNum);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const newDays = isSelected 
                              ? defaultSchedule.days.filter(d => d !== dayNum)
                              : [...defaultSchedule.days, dayNum].sort();
                            setDefaultSchedule(prev => ({ ...prev, days: newDays }));
                          }}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                            isSelected 
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20" 
                              : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-indigo-500/50"
                          )}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Default Start</label>
                    <input 
                      type="time" 
                      value={defaultSchedule.startTime} 
                      onChange={e => setDefaultSchedule(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Default End</label>
                    <input 
                      type="time" 
                      value={defaultSchedule.endTime} 
                      onChange={e => setDefaultSchedule(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Expected Hours Per Day</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.5"
                      value={defaultSchedule.expectedHoursPerDay} 
                      onChange={e => setDefaultSchedule(prev => ({ ...prev, expectedHoursPerDay: Number(e.target.value) }))}
                      className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400 uppercase">Hours</span>
                  </div>
                </div>
              </div>
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
    'General': ['quickdesk.view', 'mission_control.view', 'foreman.view', 'graphics.view', 'fast.view', 'fabrication.view', 'harness.view', 'office.view', 'printed_parts.view', 'printed_parts.manage', 'performance.view', 'dashboard.customize'],
    'Inventory & Vehicles': ['vehicles.view', 'vehicles.manage', 'zones.view', 'zones.manage', 'parts.view', 'parts.manage', 'parts_worksheet.view'],
    'Business Operations': ['customers.view', 'customers.manage', 'jobs.view', 'jobs.manage', 'jobs.qc', 'staff.view', 'staff.manage', 'staff_worksheet.view', 'bay_worksheet.view'],
    'Tasks & Timeclock': ['tasks.view', 'tasks.manage', 'timeclock.view', 'timeclock.manage', 'timeclock.offsite'],
    'Communication & Facility': ['communication.view', 'facility.view', 'whiteboards.view', 'whiteboards.manage'],
    'System & Data': ['settings.view', 'settings.manage', 'reports.view', 'sync.view', 'sync.manage'],
    'Experimental': ['experimental.new_modals']
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
  tenantId,
  departments,
  onClose, 
  onEdit, 
  onArchive, 
  onImpersonate,
  onViewPerformance,
  getSource 
}: { 
  staff: StaffMember, 
  tenantId: string,
  departments: Department[],
  onClose: () => void, 
  onEdit: () => void, 
  onArchive?: () => void, 
  onImpersonate?: () => void,
  onViewPerformance?: () => void,
  getSource: (row: any) => React.ReactNode 
}) {
  const isQB = staff.tags?.includes('QuickBooks') || 
               staff.notes?.includes('Imported via QBWC') || 
               !!staff.ListID || !!staff.qb_ListID || 
               !!staff.quickbooksId;

  const dept = departments.find(d => d.id === staff.departmentId);
  const resolvedPerms = resolvePermissions(dept?.permissions, staff.individualPermissions);

  const { permissions, isSuperAdmin } = useAuthStore();
  const canViewLogs = isSuperAdmin || permissions['staff.manage'] === true;

  const [activeTab, setActiveTab] = useState<'profile' | 'logs'>('profile');
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedImg, setExpandedImg] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewLogs || activeTab !== 'logs' || !staff.id || !tenantId) return;

    setLoadingLogs(true);
    const q = query(
      collection(db, `businesses/${tenantId}/staff_logs`),
      where('staffId', '==', staff.id)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort in-memory to avoid composite index requirements
      data.sort((a: any, b: any) => {
        const getMs = (val: any) => {
          if (!val) return 0;
          if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0);
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          return new Date(val).getTime() || 0;
        };
        return getMs(b.createdAt) - getMs(a.createdAt);
      });
      
      setLogs(data);
      setLoadingLogs(false);
    }, (err) => {
      console.error("Failed to load staff logs:", err);
      setLoadingLogs(false);
    });

    return () => unsub();
  }, [staff.id, tenantId, activeTab, canViewLogs]);

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Are you sure you want to delete this incident log?")) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/staff_logs`, logId));
      toast.success("Incident log deleted successfully.");
    } catch (err) {
      console.error("Failed to delete incident log:", err);
      toast.error("Failed to delete log entry.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50 shrink-0">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 shrink-0">
              <span className="text-2xl font-bold">{staff.firstName[0]}{staff.lastName[0]}</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white leading-tight">
                <StaffLink name={`${staff.firstName} ${staff.lastName}`} tenantId={tenantId} />
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                  Active Member
                </span>
                {dept && (
                  <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                    {dept.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onImpersonate && (
              <button 
                onClick={onImpersonate}
                className="p-2.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 rounded-xl transition-all"
                title="View As Staff Member"
              >
                <Eye className="w-5 h-5" />
              </button>
            )}
            {!isQB && onArchive && (
              <button 
                onClick={onArchive}
                className="p-2.5 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-xl transition-all"
                title="Archive Staff Member"
              >
                <Archive className="w-5 h-5" />
              </button>
            )}
            {canViewLogs && onViewPerformance && (
              <button 
                onClick={onViewPerformance}
                className="p-2.5 text-amber-600 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 rounded-xl transition-all"
                title="View Performance Leaderboard"
              >
                <Trophy className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={onEdit}
              className="p-2.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-xl transition-all"
              title="Edit Staff Member"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button 
              onClick={onClose}
              className="p-2.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        {canViewLogs && (
          <div className="flex bg-zinc-50 dark:bg-zinc-950 p-1.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'profile'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400'
              }`}
            >
              Profile & Access
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200 dark:border-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Manager Log
            </button>

          </div>
        )}

        {/* Content Body */}
        {activeTab === 'profile' ? (
          <div className="flex-1 overflow-y-auto no-scrollbar">
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
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-3">
                    <span className="font-bold text-zinc-400 w-4 inline-block text-center">#</span>
                    Tech Number: {staff.techNumber || '--'}
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
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Book Time Credit Allowance</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-500 animate-pulse" />
                  {staff.payPeriodBookTimeCredit && staff.payPeriodBookTimeCredit > 0 ? (
                    <span>{staff.payPeriodBookTimeCredit}h / pay period <span className="text-[10px] font-bold uppercase tracking-tight text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded ml-1">Staff Override</span></span>
                  ) : dept?.weeklyBookTimeCredit && dept.weeklyBookTimeCredit > 0 ? (
                    <span>{dept.weeklyBookTimeCredit}h / week <span className="text-[10px] font-bold uppercase tracking-tight text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded ml-1">Dept Default</span></span>
                  ) : (
                    <span className="text-zinc-400 italic">None configured</span>
                  )}
                </p>
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
        ) : (
          /* Manager Incidents Log */
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                Performance Timeline
              </h4>
              <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-lg">
                {logs.length} Logged Entries
              </span>
            </div>

            {loadingLogs ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="text-sm font-medium">Scanning history...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-zinc-50 dark:bg-zinc-800/40 flex items-center justify-center text-zinc-400">
                  <Users className="w-6 h-6 text-zinc-500 dark:text-zinc-400" />
                </div>
                <div className="space-y-1">
                  <h5 className="font-bold text-zinc-900 dark:text-white">Clean Incident Record</h5>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                    No positive or negative performance incidents have been logged for this staff member yet.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => {
                  const isGood = log.type === 'good';
                  const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString() : 'Recent';
                  const timeStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  
                  return (
                    <div 
                      key={log.id} 
                      className={`p-5 rounded-2xl border flex flex-col sm:flex-row gap-4 justify-between transition-all duration-300 ${
                        isGood 
                          ? 'bg-emerald-50/[0.02] border-emerald-500/10 hover:border-emerald-500/25 shadow-sm' 
                          : 'bg-rose-50/[0.02] border-rose-500/10 hover:border-rose-500/25 shadow-sm'
                      }`}
                    >
                      <div className="flex gap-4 flex-1">
                        {/* Icon Indicator */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                          isGood 
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}>
                          {isGood ? <Smile size={20} /> : <Frown size={20} />}
                        </div>

                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg ${
                              isGood 
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15' 
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/15'
                            }`}>
                              {isGood ? 'Good Thing' : 'Bad Thing'}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">
                              {dateStr} • {timeStr}
                            </span>
                          </div>

                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                            {log.description}
                          </p>

                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800/40 px-2 py-1 rounded-lg w-max shadow-sm">
                            <span>Logged by:</span>
                            <span className="font-extrabold text-zinc-700 dark:text-zinc-300">{log.loggedByName || 'Admin'}</span>
                          </div>

                          {/* Image Preview */}
                          {log.imageUrl && (
                            <div className="mt-3 relative w-32 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 group/img cursor-pointer shadow-sm hover:shadow" onClick={() => setExpandedImg(log.imageUrl)}>
                              <img src={log.imageUrl} alt="Incident attachment" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity duration-300">
                                <ExternalLink size={14} className="text-white" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col justify-end items-end gap-2 shrink-0">
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/5 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                          title="Delete Log Entry"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Lightbox / Image Zoom */}
      <AnimatePresence>
        {expandedImg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedImg(null)}
            className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <img src={expandedImg} alt="Enlarged context" className="w-full h-auto max-h-[80vh] object-contain" />
              <button 
                onClick={() => setExpandedImg(null)}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-md transition-colors"
              >
                <X size={18} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StaffEditModal({ 
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
  const [firstName, setFirstName] = useState(String(staff?.firstName || ''));
  const [lastName, setLastName] = useState(String(staff?.lastName || ''));
  const [email, setEmail] = useState(String(staff?.email || ''));
  const [phone, setPhone] = useState(String(staff?.phone || ''));
  const [departmentId, setDepartmentId] = useState(String(staff?.departmentId || ''));
  const [hireDate, setHireDate] = useState(String(staff?.hireDate || ''));
  const [fireDate, setFireDate] = useState(String(staff?.fireDate || ''));
  const [shirtSize, setShirtSize] = useState(String(staff?.shirtSize || ''));
  const [hatSize, setHatSize] = useState(String(staff?.hatSize || ''));
  const [pantsSize, setPantsSize] = useState(String(staff?.pantsSize || ''));
  const [shoeSize, setShoeSize] = useState(String(staff?.shoeSize || ''));
  const [gloveSize, setGloveSize] = useState(String(staff?.gloveSize || ''));
  const [emergencyName, setEmergencyName] = useState(String(staff?.emergencyContact?.name || ''));
  const [emergencyPhone, setEmergencyPhone] = useState(String(staff?.emergencyContact?.phone || ''));
  const [emergencyRelation, setEmergencyRelation] = useState(String(staff?.emergencyContact?.relation || ''));
  const [jobTitle, setJobTitle] = useState(String(staff?.jobTitle || ''));
  const [role, setRole] = useState(String(staff?.role || ''));
  const [techNumber, setTechNumber] = useState(String(staff?.techNumber || ''));
  const [payRate, setPayRate] = useState(staff?.payRate || 0);
  const [payType, setPayType] = useState(staff?.payType || 'hourly');
  const [payPeriodBookTimeCredit, setPayPeriodBookTimeCredit] = useState<number>(staff?.payPeriodBookTimeCredit || 0);
  const [notes, setNotes] = useState(String(staff?.notes || ''));
  const [individualPermissions, setIndividualPermissions] = useState<PermissionSet>(staff?.individualPermissions || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'permissions' | 'schedule'>('details');
  const [individualSchedule, setIndividualSchedule] = useState<WorkSchedule | null>(staff?.individualSchedule || null);

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
    if (!String(firstName).trim() || !String(lastName).trim() || !String(email).trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const data = {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone).trim(),
        departmentId: departmentId || null,
        jobTitle: String(jobTitle).trim(),
        role: String(role).trim(),
        techNumber: String(techNumber).trim(),
        payRate: Number(payRate) || 0,
        payType,
        payPeriodBookTimeCredit: Number(payPeriodBookTimeCredit) || 0,
        notes: String(notes).trim(),
        hireDate: hireDate || null,
        fireDate: fireDate || null,
        shirtSize: shirtSize || null,
        hatSize: hatSize || null,
        pantsSize: pantsSize || null,
        shoeSize: shoeSize || null,
        gloveSize: gloveSize || null,
        emergencyContact: {
          name: String(emergencyName).trim(),
          phone: String(emergencyPhone).trim(),
          relation: String(emergencyRelation).trim()
        },
        individualPermissions,
        individualSchedule,
        updatedAt: serverTimestamp()
      };

      if (staff?.id) {
        await updateDoc(doc(db, `businesses/${tenantId}/staff`, staff.id), data);
        
        // Sync to global users collection if we have a userId or email match
        const uid = staff.userId;
        if (uid) {
          await setDoc(doc(db, 'users', uid), {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            emergencyContactName: data.emergencyContact.name,
            emergencyContactPhone: data.emergencyContact.phone,
            jobTitle: data.jobTitle,
            department: data.departmentId,
            role: data.role,
            techNumber: data.techNumber,
            payRate: data.payRate,
            payType: data.payType,
            payPeriodBookTimeCredit: data.payPeriodBookTimeCredit,
            startDate: data.hireDate,
            notes: data.notes,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

        toast.success('Staff member updated');
      } else {
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/staff`), {
          ...data,
          createdAt: serverTimestamp(),
          isArchived: false
        });

        // Try to find a user with this email to link immediately
        const userQ = query(collection(db, 'users'), where('email', '==', data.email));
        const userSnap = await getDocs(userQ);
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          await updateDoc(docRef, { userId: userDoc.id });
          
          // Also push staff data to their user record
          await setDoc(userDoc.ref, {
            jobTitle: data.jobTitle,
            department: data.departmentId,
            role: data.role,
            techNumber: data.techNumber,
            payRate: data.payRate,
            payType: data.payType,
            payPeriodBookTimeCredit: data.payPeriodBookTimeCredit,
            startDate: data.hireDate,
            notes: data.notes,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

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
              <ShieldCheck className="w-4 h-4" /> Permissions
            </button>
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'schedule' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
            >
              <Calendar className="w-4 h-4" /> Schedule
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

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Job Title</label>
                      <input 
                        type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} 
                        placeholder="e.g. Lead Technician"
                        className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Internal Role</label>
                      <input 
                        type="text" value={role} onChange={e => setRole(e.target.value)} 
                        placeholder="e.g. Administrator"
                        className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">In-House Tech Number</label>
                    <input 
                      type="text" value={techNumber} onChange={e => setTechNumber(e.target.value)} 
                      placeholder="e.g. 11 for Matt, 13, etc."
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Pay Rate</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                        <input 
                          type="number" step="0.01" value={payRate} onChange={e => setPayRate(Number(e.target.value))} 
                          className="w-full pl-8 pr-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Pay Type</label>
                      <select 
                        value={payType} onChange={e => setPayType(e.target.value as any)}
                        className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all appearance-none"
                      >
                        <option value="hourly">Hourly</option>
                        <option value="salary">Salary</option>
                        <option value="flat_rate">Flat Rate (Book Time)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Book Credit (Pay Period)</label>
                      <div className="relative">
                        <input 
                          type="number" step="0.5" value={payPeriodBookTimeCredit} onChange={e => setPayPeriodBookTimeCredit(Number(e.target.value))} 
                          placeholder="e.g. 4.0"
                          className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400 uppercase">Hours</span>
                      </div>
                      <p className="text-[9px] text-zinc-400 mt-1">Overrides department default. Set 0 to inherit.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Administrative Notes</label>
                    <textarea 
                      value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Confidential notes about this staff member..."
                      className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all h-32 resize-none"
                    />
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
            ) : activeTab === 'permissions' ? (
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
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-indigo-600/5 border border-indigo-600/20 rounded-2xl p-6 flex gap-4">
                  <div className="p-3 bg-indigo-600/10 text-indigo-600 rounded-xl h-fit">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-900 dark:text-white">Custom Work Schedule</h4>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      Override the department defaults for this specific staff member. 
                      This schedule will be used to calculate overtime and tardiness.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Work Days</label>
                    <div className="flex flex-wrap gap-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                        const dayNum = idx + 1;
                        const isSelected = individualSchedule?.days.includes(dayNum);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const currentDays = individualSchedule?.days || [];
                              const newDays = isSelected 
                                ? currentDays.filter(d => d !== dayNum)
                                : [...currentDays, dayNum].sort();
                              
                              setIndividualSchedule(prev => ({
                                days: newDays,
                                startTime: prev?.startTime || '08:00',
                                endTime: prev?.endTime || '17:00',
                                expectedHoursPerDay: prev?.expectedHoursPerDay || 8
                              }));
                            }}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                              isSelected 
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20" 
                                : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-indigo-500/50"
                            )}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Shift Start</label>
                      <input 
                        type="time" 
                        value={individualSchedule?.startTime || '08:00'} 
                        onChange={e => setIndividualSchedule(prev => ({
                          days: prev?.days || [],
                          startTime: e.target.value,
                          endTime: prev?.endTime || '17:00',
                          expectedHoursPerDay: prev?.expectedHoursPerDay || 8
                        }))}
                        className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Shift End</label>
                      <input 
                        type="time" 
                        value={individualSchedule?.endTime || '17:00'} 
                        onChange={e => setIndividualSchedule(prev => ({
                          days: prev?.days || [],
                          startTime: prev?.startTime || '08:00',
                          endTime: e.target.value,
                          expectedHoursPerDay: prev?.expectedHoursPerDay || 8
                        }))}
                        className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Expected Daily Hours</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.5"
                        value={individualSchedule?.expectedHoursPerDay || 8} 
                        onChange={e => setIndividualSchedule(prev => ({
                          days: prev?.days || [],
                          startTime: prev?.startTime || '08:00',
                          endTime: prev?.endTime || '17:00',
                          expectedHoursPerDay: Number(e.target.value)
                        }))}
                        className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-400 uppercase">Hours</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-2 italic px-1">
                      Overtime will be calculated as any time logged beyond this value per day.
                    </p>
                  </div>

                  {individualSchedule && (
                    <button 
                      type="button"
                      onClick={() => setIndividualSchedule(null)}
                      className="text-[10px] font-bold text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors"
                    >
                      Reset to Department Defaults
                    </button>
                  )}
                </div>
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
