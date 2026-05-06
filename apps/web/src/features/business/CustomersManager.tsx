import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Users, Search, Plus, 
  X, Mail, Phone, MapPin, Edit2, Trash2
} from 'lucide-react';
import { GenericDataGrid } from './GenericDataGrid';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { ConfirmModal } from '../../components/ConfirmModal';

interface CustomersManagerProps {
  tenantId: string;
}

export function CustomersManager({ tenantId }: CustomersManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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

  // Fetch Customers
  const { refetch } = useQuery({
    queryKey: ['customers-list', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/customers`),
        orderBy('name', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

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

  const customerColumns = [
    { 
      key: 'name', 
      label: 'Customer Name',
      format: (val: any, row: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-zinc-900 dark:text-white">{val || `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.company || 'Unnamed'}</span>
          <span className="text-[10px] text-zinc-500 font-mono">{row.id.substring(0, 8)}</span>
        </div>
      )
    },
    { 
      key: 'email', 
      label: 'Contact Info',
      format: (_: any, row: any) => (
        <div className="flex flex-col gap-0.5">
          {row.email && (
            <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <Mail className="w-3 h-3" />
              {row.email}
            </div>
          )}
          {row.mobilePhone && (
            <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <Phone className="w-3 h-3" />
              {row.mobilePhone}
            </div>
          )}
        </div>
      )
    },
    { 
      key: 'status', 
      label: 'Status',
      format: (val: any) => (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
          val === 'Active' || !val ? "bg-emerald-500/10 text-emerald-600" : "bg-zinc-100 text-zinc-500"
        )}>
          {val || 'Active'}
        </span>
      )
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const handleDeleteCustomer = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, `businesses/${tenantId}/customers`, id));
          toast.success('Customer deleted');
          refetch();
        } catch (err) {
          console.error(err);
          toast.error('Failed to delete customer');
        }
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-xl">
            <Users className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Customer Management</h2>
            <p className="text-xs text-zinc-500">Directory of all clients and business accounts</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search customers, emails, phones..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all w-full md:w-64"
            />
          </div>
          
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <GenericDataGrid 
        collectionPath={`businesses/${tenantId}/customers`}
        title="Customers"
        columns={customerColumns}
        localFilter={(c) => {
          const search = searchQuery.toLowerCase();
          return (
            (c.name || '').toLowerCase().includes(search) ||
            (c.firstName || '').toLowerCase().includes(search) ||
            (c.lastName || '').toLowerCase().includes(search) ||
            (c.email || '').toLowerCase().includes(search) ||
            (c.mobilePhone || '').toLowerCase().includes(search) ||
            (c.company || '').toLowerCase().includes(search)
          );
        }}
        onRowClick={(row) => setSelectedCustomer(row)}
      />

      {isAddModalOpen && (
        <CustomerModal 
          tenantId={tenantId} 
          onClose={() => setIsAddModalOpen(false)} 
          onSuccess={() => {
            setIsAddModalOpen(false);
            refetch();
          }} 
        />
      )}

      {selectedCustomer && (
        <CustomerDetailsModal 
          tenantId={tenantId}
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onEdit={() => {
            setIsEditModalOpen(true);
          }}
          onDelete={() => handleDeleteCustomer(selectedCustomer.id)}
        />
      )}

      {isEditModalOpen && selectedCustomer && (
        <CustomerModal 
          tenantId={tenantId}
          customer={selectedCustomer}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => {
            setIsEditModalOpen(false);
            setSelectedCustomer(null);
            refetch();
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

function CustomerModal({ tenantId, customer, onClose, onSuccess }: { tenantId: string, customer?: any, onClose: () => void, onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    company: customer?.company || '',
    email: customer?.email || '',
    mobilePhone: customer?.mobilePhone || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    status: customer?.status || 'Active'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const data = {
        ...formData,
        updatedAt: serverTimestamp(),
        source: customer?.source || 'Native',
        tags: customer?.tags || ['Native']
      };

      if (customer) {
        await updateDoc(doc(db, `businesses/${tenantId}/customers`, customer.id), data);
        toast.success('Customer updated');
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/customers`), {
          ...data,
          createdAt: serverTimestamp()
        });
        toast.success('Customer created');
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error('Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            {customer ? <Edit2 className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-blue-500" />}
            {customer ? 'Edit Customer' : 'Add Customer'}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Display Name</label>
            <input 
              type="text" 
              required
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
              placeholder="e.g. John Doe or Acme Corp" 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Email</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({ ...formData, email: e.target.value })} 
                placeholder="john@example.com" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Phone</label>
              <input 
                type="text" 
                value={formData.mobilePhone} 
                onChange={e => setFormData({ ...formData, mobilePhone: e.target.value })} 
                placeholder="(555) 000-0000" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Company (Optional)</label>
            <input 
              type="text" 
              value={formData.company} 
              onChange={e => setFormData({ ...formData, company: e.target.value })} 
              placeholder="e.g. Acme Corp" 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Address</label>
            <textarea 
              value={formData.address} 
              onChange={e => setFormData({ ...formData, address: e.target.value })} 
              placeholder="123 Main St, City, ST 12345" 
              rows={2}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" 
            />
          </div>

          <div className="pt-4">
            <button disabled={isSubmitting} type="submit" className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              {isSubmitting ? 'Saving...' : customer ? 'Update Customer' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerDetailsModal({ customer, onClose, onEdit, onDelete }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="relative h-32 bg-blue-600">
           <div className="absolute -bottom-12 left-8 p-1 bg-white dark:bg-zinc-900 rounded-3xl">
             <div className="w-24 h-24 bg-blue-500/10 rounded-2xl flex items-center justify-center">
               <Users className="w-10 h-10 text-blue-600" />
             </div>
           </div>
           <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all">
             <X className="w-5 h-5" />
           </button>
        </div>

        <div className="pt-16 px-8 pb-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                {customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.company}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{customer.company || 'Private Client'}</span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-xs font-mono text-blue-500">{customer.id}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onEdit}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:text-blue-500 transition-colors"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button 
                onClick={onDelete}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Contact Details</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><Mail className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.email || 'No email provided'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><Phone className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.mobilePhone || 'No phone provided'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><MapPin className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.address || 'No address provided'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">System Information</h3>
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-medium">Source</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white px-2 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-sm">{customer.source || 'Native'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-medium">Status</span>
                    <span className="text-xs font-bold text-emerald-500 uppercase">{customer.status || 'Active'}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 font-medium">Created</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              {customer.notes && (
                <div>
                  <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Internal Notes</h3>
                  <div className="p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 rounded-2xl">
                    <p className="text-sm text-amber-900/70 dark:text-amber-200/50 italic leading-relaxed">
                      "{customer.notes}"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
