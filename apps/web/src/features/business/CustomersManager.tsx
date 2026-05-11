import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Users, Search, Plus, 
  Mail, Phone
} from 'lucide-react';
import { GenericDataGrid } from './GenericDataGrid';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { ConfirmModal } from '../../components/ConfirmModal';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerDetailsModal } from './CustomerDetailsModal';

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

  // Fetch Customers (only used for triggering refetch on mutations since GenericDataGrid handles its own fetch)
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

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/vehicles`));
      return snap.docs.map(doc => doc.data());
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
    { 
      key: 'vehicles', 
      label: 'Vehicles',
      format: (_: any, row: any) => {
        const customerName = row.name || row.firstName || row.lastName || row.company || row.displayName || row.CompanyName || row.FullName || row.id;
        const count = vehicles?.filter(v => v.customerName && v.customerName.toLowerCase() === customerName.toLowerCase()).length || 0;
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{count}</span>
            <span className="text-xs text-zinc-500">units</span>
          </div>
        );
      }
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
        <CustomerFormModal 
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
        <CustomerFormModal 
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

