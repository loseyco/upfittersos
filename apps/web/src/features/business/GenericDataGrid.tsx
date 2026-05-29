import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { X, Search, ChevronDown, ChevronUp, ArrowUpDown, Database, Columns, AlertTriangle } from 'lucide-react';

export type DataColumn = {
  key: string;
  label: string;
  format?: (value: any, row: any) => React.ReactNode;
};

export function GenericDataGrid({ 
  collectionPath, 
  title, 
  localFilter,
  columns: propColumns,
  onRowClick,
  dbOrderBy
}: { 
  collectionPath: string, 
  title?: string, 
  localFilter?: (item: any) => boolean,
  columns?: DataColumn[],
  onRowClick?: (row: any) => void,
  dbOrderBy?: { field: string, direction: 'asc' | 'desc' }
}) {
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  
  // Controls whether we fetch a limited sample or the entire collection
  const [loadMode, setLoadMode] = useState<'limited' | 'all'>('all');
  const limitAmount = 500;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['generic-grid', collectionPath, loadMode, dbOrderBy],
    queryFn: async () => {
      let q = query(collection(db, collectionPath));
      if (dbOrderBy) {
        q = query(collection(db, collectionPath), orderBy(dbOrderBy.field, dbOrderBy.direction));
      }
      if (loadMode === 'limited') {
        if (dbOrderBy) {
          q = query(collection(db, collectionPath), orderBy(dbOrderBy.field, dbOrderBy.direction), limit(limitAmount));
        } else {
          q = query(collection(db, collectionPath), limit(limitAmount));
        }
      }
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!collectionPath
  });

  let displayData = data;
  if (data && localFilter) {
    displayData = data.filter(localFilter);
  }

  // Column Discovery
  const discoveredColumns = useMemo(() => {
    if (propColumns) return propColumns;
    if (!displayData || displayData.length === 0) return [];
    
    const allKeys = new Set<string>();
    displayData.forEach(item => {
      Object.entries(item).forEach(([k, v]) => {
        if (typeof v !== 'object' && k.length < 50) {
          allKeys.add(k);
        }
      });
    });
    
    const keys = Array.from(allKeys).sort((a, b) => {
      if (a === 'id') return -1;
      if (b === 'id') return 1;
      
      const isTimeA = /time|date|created|updated|modified/i.test(a);
      const isTimeB = /time|date|created|updated|modified/i.test(b);
      
      if (isTimeA && !isTimeB) return -1;
      if (!isTimeA && isTimeB) return 1;
      
      return a.localeCompare(b);
    });
    
    return keys.map(k => ({
      key: k,
      label: k.replace('qb_', '').replace(/([A-Z])/g, ' $1').trim() || k
    })) as DataColumn[];
  }, [displayData, propColumns]);

  useEffect(() => {
    if (!propColumns && discoveredColumns.length > 0 && hiddenColumns.size === 0) {
      const initialHidden = new Set<string>();
      discoveredColumns.forEach((col, i) => {
        if (i > 15) initialHidden.add(col.key);
      });
      if (initialHidden.size > 0) {
        setHiddenColumns(initialHidden);
      }
    }
  }, [discoveredColumns, propColumns, hiddenColumns.size]);

  const filteredAndSortedData = useMemo(() => {
    if (!displayData) return [];
    
    let result = [...displayData];

    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(row => {
        return discoveredColumns.some(col => {
          const val = (row as any)[col.key];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(lowerSearch);
        });
      });
    }

    const sortByKey = (a: any, b: any, key: string, direction: 'asc' | 'desc') => {
      let aVal = a[key];
      let bVal = b[key];
      
      // Handle Firestore timestamps
      if (aVal && typeof aVal === 'object' && '_seconds' in aVal) aVal = aVal._seconds;
      if (bVal && typeof bVal === 'object' && '_seconds' in bVal) bVal = bVal._seconds;
      
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1; 
      if (bVal === null || bVal === undefined) return -1;

      // Safe date comparison if date column
      if (/time|date|created|updated|modified/i.test(key)) {
        const timeA = aVal && typeof aVal.toDate === 'function' ? aVal.toDate().getTime() : new Date(aVal).getTime();
        const timeB = bVal && typeof bVal.toDate === 'function' ? bVal.toDate().getTime() : new Date(bVal).getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) {
          return direction === 'asc' ? timeA - timeB : timeB - timeA;
        }
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      
      if (aStr < bStr) return direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return direction === 'asc' ? 1 : -1;
      return 0;
    };

    if (sortConfig) {
      result.sort((a, b) => sortByKey(a, b, sortConfig.key, sortConfig.direction));
    } else {
      // Prioritize standard modification and creation time keys
      const timeKeys = [
        'TimeModified', 'timeModified', 'updatedAt', 
        'TimeCreated', 'timeCreated', 'createdAt'
      ];
      
      let defaultSortKey = '';
      if (result.length > 0) {
        // Find first key from our priority list that is present in the first row
        const foundPriorityKey = timeKeys.find(key => key in result[0]);
        if (foundPriorityKey) {
          defaultSortKey = foundPriorityKey;
        }
      }

      if (defaultSortKey) {
        result.sort((a, b) => sortByKey(a, b, defaultSortKey, 'desc'));
      } else {
        // Fallback: search discoveredColumns using regex
        const timeColumn = discoveredColumns.find(c => /time|date|created|updated|modified/i.test(c.key));
        if (timeColumn) {
          result.sort((a, b) => sortByKey(a, b, timeColumn.key, 'desc'));
        }
      }
    }

    return result;
  }, [displayData, searchTerm, sortConfig, discoveredColumns]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else {
        setSortConfig(null);
        return;
      }
    }
    setSortConfig({ key, direction });
  };

  const toggleColumn = (key: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllColumns = () => {
    if (hiddenColumns.size > 0) {
      setHiddenColumns(new Set());
    } else {
      const allHidden = new Set(discoveredColumns.map(c => c.key));
      if (discoveredColumns.length > 0) {
        allHidden.delete(discoveredColumns[0].key);
      }
      setHiddenColumns(allHidden);
    }
  };

  if (isLoading) {
    return <div className="p-16 flex items-center justify-center text-zinc-500 animate-pulse">Gathering {title} data...</div>;
  }

  if (!displayData || displayData.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-16 shadow-sm flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
        <p className="text-zinc-500 dark:text-zinc-400">No data synced yet for {title || collectionPath}.</p>
      </div>
    );
  }

  const visibleColumns = discoveredColumns.filter(c => !hiddenColumns.has(c.key));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col min-h-[500px]">
      
      {/* Search limit warning only shown if user decides to toggle loadMode to limited */}
      {loadMode === 'limited' && displayData.length >= limitAmount && (
        <div className="bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p>
              Showing a sample of <strong>{limitAmount}</strong> records to conserve bandwidth. Searches will only apply to these loaded records.
            </p>
          </div>
          <button
            onClick={() => setLoadMode('all')}
            disabled={isFetching}
            className="shrink-0 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isFetching ? 'Loading...' : 'Load All Data For Deep Search'}
            <Database className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Deep Search Indicator */}
      {loadMode === 'all' && (
        <div className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-150 dark:border-zinc-850 px-4 py-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-emerald-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Deep Search Active Across {filteredAndSortedData.length} Records
          {displayData.length > limitAmount && (
            <button
              onClick={() => setLoadMode('limited')}
              className="text-[9px] ml-auto text-zinc-400 hover:text-indigo-500 hover:underline cursor-pointer"
            >
              Conserve Bandwidth
            </button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search loaded columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-zinc-400 font-bold outline-none"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2" ref={colMenuRef}>
          <div className="text-sm text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-xs">
            {filteredAndSortedData.length} records
          </div>
          
          <div className="relative ml-2">
            <button
              onClick={() => setShowColMenu(!showColMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm cursor-pointer"
            >
              <Columns className="w-4 h-4 text-zinc-500" />
              Columns
              <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 py-0.5 px-2.5 rounded-full text-xs font-black ml-1">
                {visibleColumns.length}/{discoveredColumns.length}
              </span>
            </button>

            {showColMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl z-20 flex flex-col max-h-96 animate-in slide-in-from-top-2 fade-in duration-200 overflow-hidden">
                <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-850/50 rounded-t-2xl">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Toggle Columns</span>
                  <button 
                    onClick={toggleAllColumns}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    {hiddenColumns.size > 0 ? 'Show All' : 'Hide All'}
                  </button>
                </div>
                <div className="overflow-y-auto p-2 custom-scrollbar">
                  {discoveredColumns.map(col => (
                    <label key={col.key} className="flex items-center gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl cursor-pointer transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.has(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="w-4 h-4 text-indigo-600 bg-zinc-100 border-zinc-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-zinc-850 focus:ring-2 dark:bg-zinc-850 dark:border-zinc-700 cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500 transition-colors"
                        />
                        {!hiddenColumns.has(col.key) && (
                          <svg className="absolute w-2.5 h-2.5 text-white pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white select-none truncate">
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Responsive View Switcher */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto no-scrollbar relative bg-white dark:bg-zinc-900 flex-1">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 select-none">
              <tr>
                {visibleColumns.map(col => (
                  <th 
                    key={col.key} 
                    onClick={() => handleSort(col.key)}
                    className="px-6 py-4 font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-xs whitespace-nowrap cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors select-none group"
                  >
                    <div className="flex items-center gap-2">
                      {col.label}
                      <div className="flex flex-col opacity-0 group-hover:opacity-50 transition-opacity">
                        {sortConfig?.key === col.key ? (
                          sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 opacity-100 text-indigo-500" /> : <ChevronDown className="w-3.5 h-3.5 opacity-100 text-indigo-500" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
              {filteredAndSortedData.map(row => (
                <tr 
                  key={row.id} 
                  onClick={() => onRowClick ? onRowClick(row) : setSelectedRow(row)}
                  className="hover:bg-indigo-50/50 dark:hover:bg-indigo-500/[0.04] transition-colors cursor-pointer"
                >
                  {visibleColumns.map(col => {
                    const val = (row as any)[col.key];
                    return (
                      <td key={col.key} className="px-6 py-4 text-zinc-800 dark:text-zinc-300 font-bold max-w-[240px] truncate" title={String(val ?? '')}>
                        {(col as any).format ? (col as any).format(val, row) : (
                          typeof val === 'object' && val !== null
                            ? JSON.stringify(val).substring(0, 30) + '...' 
                            : String(val ?? '-')
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredAndSortedData.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-6 py-16 text-center text-zinc-400 dark:text-zinc-500 font-bold italic">
                    No records match your search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW FALLBACK */}
        <div className="md:hidden overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-950/20 max-h-[70vh] custom-scrollbar flex-1">
          {filteredAndSortedData.map(row => {
            const primaryVal = (row as any)[visibleColumns[0]?.key];
            const statusCol = visibleColumns.find(c => c.key === 'status');
            const statusVal = statusCol ? (row as any)[statusCol.key] : null;

            return (
              <div 
                key={row.id} 
                onClick={() => onRowClick ? onRowClick(row) : setSelectedRow(row)}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer space-y-3 relative overflow-hidden"
              >
                {/* Visual side accent */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 pl-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-0.5">
                      {visibleColumns[0]?.label}
                    </span>
                    <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white leading-snug truncate">
                      {visibleColumns[0]?.format ? visibleColumns[0].format(primaryVal, row) : String(primaryVal ?? '-')}
                    </h4>
                  </div>
                  {statusVal && (
                    <div className="shrink-0">
                      {statusCol?.format ? statusCol.format(statusVal, row) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          {String(statusVal)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata Row */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/50 pl-1.5 text-xs">
                  {visibleColumns.slice(1).filter(c => c.key !== 'status').slice(0, 4).map(col => {
                    const val = (row as any)[col.key];
                    return (
                      <div key={col.key} className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider truncate mb-0.5">
                          {col.label}
                        </span>
                        <span className="text-zinc-700 dark:text-zinc-400 font-bold truncate">
                          {col.format ? col.format(val, row) : (
                            typeof val === 'object' && val !== null
                              ? JSON.stringify(val).substring(0, 20) + '...'
                              : String(val ?? '-')
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          
          {filteredAndSortedData.length === 0 && (
            <div className="p-12 text-center text-zinc-400 dark:text-zinc-500 font-bold italic bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl">
              No records match your search filter.
            </div>
          )}
        </div>
        
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-150 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                {title ? `${title} Details` : 'Record Details'}
                <span className="px-2 py-0.5 bg-zinc-150 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-mono rounded">
                  {selectedRow.id.substring(0, 8)}
                </span>
              </h3>
              <button 
                onClick={() => setSelectedRow(null)}
                className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/20 custom-scrollbar flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {discoveredColumns.map((col) => {
                  const value = selectedRow[col.key];
                  return (
                    <div key={col.key} className="flex flex-col bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
                      <span className="text-[10px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        {col.label}
                      </span>
                      <span className="text-zinc-850 dark:text-zinc-150 text-sm break-words font-extrabold">
                        {value === null || value === undefined 
                          ? <span className="text-zinc-400 italic font-normal">None</span>
                          : typeof value === 'object' 
                            ? <pre className="text-[10px] bg-zinc-50 dark:bg-zinc-950 p-2 rounded mt-1 overflow-x-auto max-h-32 text-indigo-650 dark:text-indigo-400 border border-zinc-100 dark:border-zinc-800">{JSON.stringify(value, null, 2)}</pre>
                            : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
