import { useState } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { X, Edit2, UserPlus, Search, Archive, Mail, Phone, Briefcase, Building2, Loader2, Save } from 'lucide-react';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  isArchived?: boolean;
  tags?: string[];
  notes?: string[];
  ListID?: string;
  qb_ListID?: string;
  quickbooksId?: string;
}

export function StaffManager({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleFilter = (item: any) => {
    if (item.isArchived) return false;
    
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const searchableFields = [
      item.firstName,
      item.lastName,
      item.email,
      item.phone,
      item.role,
      item.department,
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
    { key: 'department', label: 'Department' },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Staff Management</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage business staff, roles, and departments.</p>
        </div>
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
      </div>

      <GenericDataGrid 
        collectionPath={`businesses/${tenantId}/staff`} 
        title="Staff Members" 
        columns={staffColumns}
        localFilter={handleFilter}
        onRowClick={(row) => setSelectedStaff(row as StaffMember)}
      />

      {selectedStaff && !editingStaff && (
        <StaffDetailsModal 
          staff={selectedStaff}
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

function StaffDetailsModal({ 
  staff, 
  onClose, 
  onEdit, 
  onArchive, 
  getSource 
}: { 
  staff: StaffMember, 
  onClose: () => void, 
  onEdit: () => void, 
  onArchive?: () => void, 
  getSource: (row: any) => React.ReactNode 
}) {
  const isQB = staff.tags?.includes('QuickBooks') || 
               staff.notes?.includes('Imported via QBWC') || 
               !!staff.ListID || !!staff.qb_ListID || 
               !!staff.quickbooksId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white text-lg leading-tight">
                {staff.firstName} {staff.lastName}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 capitalize">{staff.role?.replace('_', ' ') || 'Staff'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isQB && onArchive && (
              <button 
                onClick={onArchive}
                className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-lg transition-colors shadow-sm"
                title="Archive Staff Member"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={onEdit}
              className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors shadow-sm"
              title="Edit Staff Member"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-4">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Email Address</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-zinc-400" />
              {staff.email}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Phone Number</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-zinc-400" />
              {staff.phone || '--'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Department</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-zinc-400" />
              {staff.department || 'General'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Source</p>
            <div>{getSource(staff)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffEditModal({ 
  tenantId, 
  staff, 
  onClose, 
  onSaved 
}: { 
  tenantId: string, 
  staff?: StaffMember, 
  onClose: () => void, 
  onSaved: () => void 
}) {
  const [firstName, setFirstName] = useState(staff?.firstName || '');
  const [lastName, setLastName] = useState(staff?.lastName || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [role, setRole] = useState(staff?.role || 'staff');
  const [department, setDepartment] = useState(staff?.department || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        department: department.trim(),
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            {staff ? 'Edit Staff Member' : 'Add New Staff'}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">First Name *</label>
              <input 
                type="text" 
                required
                value={firstName} 
                onChange={e => setFirstName(e.target.value)} 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Last Name *</label>
              <input 
                type="text" 
                required
                value={lastName} 
                onChange={e => setLastName(e.target.value)} 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Email Address *</label>
            <input 
              type="email" 
              required
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Phone Number</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Role</label>
              <select 
                value={role} 
                onChange={e => setRole(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
              >
                <option value="staff">Staff</option>
                <option value="technician">Technician</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Department</label>
              <input 
                type="text" 
                value={department} 
                onChange={e => setDepartment(e.target.value)} 
                placeholder="e.g. Sales"
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-all shadow-sm">
              Cancel
            </button>
            <button disabled={isSubmitting} type="submit" className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSubmitting ? 'Saving...' : 'Save Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
