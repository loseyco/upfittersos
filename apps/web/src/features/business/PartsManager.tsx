import { useState } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { Search, PackageOpen, Plus } from 'lucide-react';
import { PartDetailsModal } from './PartDetailsModal';
import { PartFormModal } from './PartFormModal';
import { useAuthStore } from '../../lib/auth/store';
import { useQueryClient } from '@tanstack/react-query';

export function PartsManager({ tenantId }: { tenantId: string }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleFilter = (item: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const searchableFields = [
      item.name,
      item.sku,
      item.mpn,
      item.barcode,
      item.description,
      item.preferredVendor
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

  const itemColumns = [
    { key: 'name', label: 'Item Name' },
    { key: 'sku', label: 'SKU' },
    { 
      key: 'price', 
      label: 'Price',
      format: (val: any) => {
        const num = Number(val || 0);
        return <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>;
      }
    },
    { 
      key: 'quantityOnHand', 
      label: 'Stock',
      format: (val: any) => <span className={`font-bold ${Number(val) <= 0 ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-400'}`}>{val ?? 0}</span>
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <PackageOpen className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Parts Library</h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Search and manage all inventory parts.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search parts, SKUs, MPN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Part
          </button>
        </div>
      </div>

      <GenericDataGrid 
        collectionPath={`businesses/${tenantId}/inventory_items`} 
        title="Inventory Database" 
        columns={itemColumns}
        localFilter={handleFilter}
        onRowClick={(row) => setSelectedPartId(row.id)}
      />

      <PartDetailsModal 
        isOpen={!!selectedPartId}
        onClose={() => setSelectedPartId(null)}
        partId={selectedPartId}
      />

      {isAddModalOpen && (
        <PartFormModal 
          tenantId={tenantId}
          user={user}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => {
            setIsAddModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/inventory_items`] });
          }}
        />
      )}
    </div>
  );
}
