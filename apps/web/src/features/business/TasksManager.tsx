import { useState } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { Search, CheckSquare, Plus } from 'lucide-react';
import { TaskTemplateModal } from './TaskTemplateModal';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../lib/auth/store';
import { QuickBooksTaskImporter } from './QuickBooksTaskImporter';
import { RefreshCw } from 'lucide-react';

export function TasksManager({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['tasks.manage'];
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleFilter = (item: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const searchableFields = [
      item.name,
      item.description,
      item.partsNeeded,
      item.instructions
    ].map(f => String(f || '').toLowerCase());
    
    return searchableFields.some(field => field.includes(query));
  };

  const itemColumns = [
    { key: 'name', label: 'Template Name', format: (val: any) => <span className="font-bold text-zinc-900 dark:text-white">{val}</span> },
    { key: 'description', label: 'Description', format: (val: any) => <span className="text-zinc-500 truncate max-w-[200px] block">{val}</span> },
    { 
      key: 'defaultBookTime', 
      label: 'Book Time',
      format: (val: any) => <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{val ? `${val}h` : '-'}</span>
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Task Templates</h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage standard operating procedures and default task times.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsSyncModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-bold transition-all active:scale-95 shrink-0"
                title="Sync from QuickBooks"
              >
                <RefreshCw className="w-4 h-4" />
                Sync QB
              </button>
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" />
                New Template
              </button>
            </div>
          )}
        </div>
      </div>

      <GenericDataGrid 
        collectionPath={`businesses/${tenantId}/tasks`} 
        title="Templates Database" 
        columns={itemColumns}
        localFilter={handleFilter}
        onRowClick={(row) => canManage && setSelectedTemplateId(row.id)}
      />

      {(isAddModalOpen || selectedTemplateId) && (
        <TaskTemplateModal 
          tenantId={tenantId}
          templateId={selectedTemplateId}
          onClose={() => {
            setIsAddModalOpen(false);
            setSelectedTemplateId(null);
          }}
          onSuccess={() => {
            setIsAddModalOpen(false);
            setSelectedTemplateId(null);
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/tasks`] });
          }}
        />
      )}

      {isSyncModalOpen && (
        <QuickBooksTaskImporter 
          tenantId={tenantId}
          onClose={() => setIsSyncModalOpen(false)}
          onSuccess={() => {
            setIsSyncModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/tasks`] });
          }}
        />
      )}
    </div>
  );
}
