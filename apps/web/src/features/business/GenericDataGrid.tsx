import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { X } from 'lucide-react';

export type DataColumn = {
  key: string;
  label: string;
  format?: (value: any, row: any) => React.ReactNode;
};

export function GenericDataGrid({ 
  collectionPath, 
  title, 
  localFilter,
  columns: propColumns
}: { 
  collectionPath: string, 
  title?: string, 
  localFilter?: (item: any) => boolean,
  columns?: DataColumn[]
}) {
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['generic-grid', collectionPath],
    queryFn: async () => {
      const q = query(collection(db, collectionPath), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!collectionPath
  });

  if (isLoading) {
    return <div className="p-16 flex items-center justify-center text-zinc-500 animate-pulse">Gathering {title} data...</div>;
  }

  let displayData = data;
  if (data && localFilter) {
    displayData = data.filter(localFilter);
  }

  if (!displayData || displayData.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-16 shadow-sm flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
        <p className="text-zinc-500 dark:text-zinc-400">No data synced yet for {title || collectionPath}.</p>
      </div>
    );
  }

  // Automatic column discovery if not provided
  let columns: DataColumn[] = [];
  if (propColumns) {
    columns = propColumns;
  } else {
    const allKeys = new Set<string>();
    displayData.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
    const keys = Array.from(allKeys).filter(k => typeof (displayData[0] as any)[k] !== 'object' && k.length < 50).slice(0, 10);
    columns = keys.map(k => ({
      key: k,
      label: k.replace('qb_', '').replace(/([A-Z])/g, ' $1').trim()
    }));
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-xs">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {displayData.map(row => (
              <tr 
                key={row.id} 
                onClick={() => setSelectedRow(row)}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
              >
                {columns.map(col => (
                  <td key={col.key} className="px-6 py-4 text-zinc-600 dark:text-zinc-400 max-w-xs truncate" title={String((row as any)[col.key] ?? '')}>
                    {col.format ? col.format((row as any)[col.key], row) : (
                      typeof (row as any)[col.key] === 'object' 
                        ? JSON.stringify((row as any)[col.key]).substring(0, 30) + '...' 
                        : String((row as any)[col.key] ?? '-')
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                {title ? `${title} Details` : 'Record Details'}
              </h3>
              <button 
                onClick={() => setSelectedRow(null)}
                className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {Object.entries(selectedRow).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      {key.replace('qb_', '').replace(/([A-Z])/g, ' $1').trim() || key}
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-100 text-sm break-words">
                      {value === null || value === undefined 
                        ? <span className="text-zinc-400 italic">None</span>
                        : typeof value === 'object' 
                          ? JSON.stringify(value) 
                          : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
