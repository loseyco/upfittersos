import { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface QuickBooksTaskImporterProps {
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickBooksTaskImporter({ tenantId, onClose, onSuccess }: QuickBooksTaskImporterProps) {
  const [qbItems, setQbItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const fetchQbItems = async () => {
      try {
        const snap = await getDocs(collection(db, `businesses/${tenantId}/qb_items`));
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Filter for services or non-inventory items that could be tasks
        const serviceItems = items.filter((item: any) => 
          item.Type === 'Service' || 
          item.ItemType === 'Service' ||
          !item.Type // Fallback
        );
        setQbItems(serviceItems);
      } catch (err) {
        console.error('Error fetching QB items:', err);
        toast.error('Failed to load QuickBooks items');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQbItems();
  }, [tenantId]);

  const filteredItems = qbItems.filter(item => {
    const q = searchQuery.toLowerCase();
    return (item.Name || item.FullName || '').toLowerCase().includes(q) ||
           (item.Description || '').toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setIsImporting(true);
    let successCount = 0;
    try {
      const itemsToImport = qbItems.filter(item => selectedIds.has(item.id));
      
      for (const item of itemsToImport) {
        const templateData = {
          name: item.Name || item.FullName || 'Unnamed Task',
          description: item.Description || item.SalesDesc || '',
          partsNeeded: '',
          instructions: '',
          defaultBookTime: 0, // Book time isn't typically in QB items
          quickbooksId: item.ListID || item.id,
          source: 'QuickBooks',
          tags: ['QuickBooks'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        
        await addDoc(collection(db, `businesses/${tenantId}/tasks`), templateData);
        successCount++;
      }
      
      toast.success(`Successfully imported ${successCount} tasks`);
      onSuccess();
    } catch (err) {
      console.error('Error importing tasks:', err);
      toast.error('Failed to import some tasks');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-xl">
              <RefreshCw className={cn("w-5 h-5 text-blue-500", isLoading && "animate-spin")} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Import from QuickBooks</h2>
              <p className="text-xs text-zinc-500">Convert QuickBooks Service items into Task Templates</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="p-4 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text"
              placeholder="Search QuickBooks items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-zinc-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
              <p className="text-sm font-medium">Fetching items from QuickBooks sync...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-zinc-500 gap-3 text-center">
              <AlertCircle className="w-8 h-8 opacity-20" />
              <p className="text-sm font-medium">No QuickBooks Service items found.<br/><span className="text-xs font-normal">Ensure your QuickBooks sync is active.</span></p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map(item => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div 
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={cn(
                      "p-4 border rounded-2xl cursor-pointer transition-all flex items-start gap-3 group",
                      isSelected ? "border-blue-500 bg-blue-50 dark:bg-blue-500/5" : "border-zinc-200 dark:border-zinc-800 hover:border-blue-300"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                      isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-300 dark:border-zinc-700 group-hover:border-blue-300"
                    )}>
                      {isSelected && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-zinc-900 dark:text-white truncate">{item.Name || item.FullName}</p>
                      <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">{item.Description || item.SalesDesc || 'No description'}</p>
                      {item.SalesPrice && (
                        <p className="text-[10px] font-mono font-bold text-blue-600 mt-2">${Number(item.SalesPrice).toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-center justify-between shrink-0">
          <p className="text-xs font-medium text-zinc-500">
            {selectedIds.size} items selected for import
          </p>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleImport}
              disabled={isImporting || selectedIds.size === 0}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Import Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
