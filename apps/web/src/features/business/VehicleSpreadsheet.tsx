import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Trash2, Keyboard, Search, Loader2,
  Cloud, AlertCircle
} from 'lucide-react';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, serverTimestamp, getDocs
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export interface Vehicle {
  id: string;
  vin: string;
  year?: string;
  make?: string;
  model?: string;
  customerName?: string;
  bodyClass?: string;
  driveType?: string;
  gvwr?: string;
  qrStickerId?: string;
  isWithCustomer?: boolean;
  isArchived?: boolean;
  notes?: string;
  arrivedAt?: any;
  departedAt?: any;
  isPlaceholder?: boolean;
}

export function VehicleSpreadsheet({ tenantId }: { tenantId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Cell Selection / Editing State
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Refs
  const cellInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch customers for dropdown
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers', tenantId],
    queryFn: async () => {
      const [nativeSnap, qbSnap] = await Promise.all([
        getDocs(collection(db, `businesses/${tenantId}/customers`)),
        getDocs(collection(db, `businesses/${tenantId}/qb_customers`))
      ]);
      const nativeList = nativeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const qbList = qbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const mergedMap = new Map<string, any>();

      qbList.forEach(c => {
        const name = c.name || c.displayName || c.CompanyName || c.FullName || c.company || c.id;
        if (name) {
          mergedMap.set(name.toLowerCase().trim(), {
            id: c.ListID || c.id,
            name: name,
            displayName: c.displayName || name,
            CompanyName: c.CompanyName || name,
            FullName: c.FullName || name,
            company: c.company || c.CompanyName || '',
            isFromQB: true
          });
        }
      });

      nativeList.forEach(c => {
        const name = c.name || c.displayName || c.CompanyName || c.FullName || c.company || c.id;
        if (name) {
          const key = name.toLowerCase().trim();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, c);
          }
        }
      });

      const list = Array.from(mergedMap.values());
      list.sort((a, b) => {
        const nameA = a.name || a.displayName || a.CompanyName || a.FullName || '';
        const nameB = b.name || b.displayName || b.CompanyName || b.FullName || '';
        return nameA.localeCompare(nameB);
      });
      return list;
    }
  });

  // Listen to vehicles collection real-time
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/vehicles`);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];

      // Client-side sort: Year desc, then Make, then Model
      docs.sort((a, b) => {
        const yearA = String(a.year || '');
        const yearB = String(b.year || '');
        if (yearA !== yearB) {
          return yearB.localeCompare(yearA);
        }
        const makeA = (a.make || '').toLowerCase();
        const makeB = (b.make || '').toLowerCase();
        if (makeA !== makeB) {
          return makeA.localeCompare(makeB);
        }
        const modelA = (a.model || '').toLowerCase();
        const modelB = (b.model || '').toLowerCase();
        return modelA.localeCompare(modelB);
      });

      setVehicles(docs);
      setLoading(false);
    }, (err) => {
      console.error("Firestore vehicles listen error: ", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  // Define Columns
  const COLUMNS = useMemo(() => [
    { key: 'isArchived', label: 'Active', letter: 'A', type: 'checkbox' },
    { key: 'vin', label: 'VIN / ID', letter: 'B', type: 'text' },
    { key: 'year', label: 'Year', letter: 'C', type: 'text' },
    { key: 'make', label: 'Make', letter: 'D', type: 'text' },
    { key: 'model', label: 'Model', letter: 'E', type: 'text' },
    { key: 'customerName', label: 'Customer', letter: 'F', type: 'customer-select' },
    { key: 'bodyClass', label: 'Body Class', letter: 'G', type: 'text' },
    { key: 'driveType', label: 'Drive Type', letter: 'H', type: 'text' },
    { key: 'gvwr', label: 'GVWR', letter: 'I', type: 'text' },
    { key: 'qrStickerId', label: 'QR Sticker ID', letter: 'J', type: 'text' },
    { key: 'isWithCustomer', label: 'With Customer', letter: 'K', type: 'checkbox-direct' },
    { key: 'arrivedAt', label: 'Arrived At', letter: 'L', type: 'datetime-local' },
    { key: 'departedAt', label: 'Departed At', letter: 'M', type: 'datetime-local' },
    { key: 'notes', label: 'Notes', letter: 'N', type: 'text' }
  ], []);

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(member => {
      if (member.isArchived && !showArchived) return false;

      if (!searchQuery.trim()) return true;
      const queryStr = searchQuery.toLowerCase();
      const fields = [
        member.vin,
        member.year,
        member.make,
        member.model,
        member.customerName,
        member.bodyClass,
        member.driveType,
        member.qrStickerId,
        member.notes
      ].map(f => String(f || '').toLowerCase());

      return fields.some(f => f.includes(queryStr));
    });
  }, [vehicles, searchQuery, showArchived]);

  // Append a placeholder row at the bottom
  const rows = useMemo(() => {
    const list = [...filteredVehicles];
    list.push({
      id: 'placeholder-row',
      vin: '',
      year: '',
      make: '',
      model: '',
      customerName: '',
      bodyClass: '',
      driveType: '',
      gvwr: '',
      qrStickerId: '',
      isWithCustomer: false,
      arrivedAt: null,
      departedAt: null,
      isPlaceholder: true,
      isArchived: false,
      notes: ''
    });
    return list;
  }, [filteredVehicles]);

  const formatFirestoreTimestamp = (val: any): string => {
    if (!val) return '';
    let d: Date;
    if (typeof val.toDate === 'function') {
      d = val.toDate();
    } else if (val.seconds) {
      d = new Date(val.seconds * 1000);
    } else {
      d = new Date(val);
    }
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const displayFirestoreTimestamp = (val: any): string => {
    if (!val) return '';
    let d: Date;
    if (typeof val.toDate === 'function') {
      d = val.toDate();
    } else if (val.seconds) {
      d = new Date(val.seconds * 1000);
    } else {
      d = new Date(val);
    }
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString([], { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getCellValue = (row: Vehicle, colKey: string): string => {
    if (colKey === 'isArchived') {
      return row.isArchived ? 'true' : 'false';
    }
    if (colKey === 'isWithCustomer') {
      return row.isWithCustomer ? 'true' : 'false';
    }
    if (colKey === 'arrivedAt' || colKey === 'departedAt') {
      return formatFirestoreTimestamp((row as any)[colKey]);
    }
    return String((row as any)[colKey] ?? '');
  };

  // Helper: Trigger cell editing
  const startEditing = (rowId: string, colKey: string, initialChar?: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    setEditingCell({ rowId, colKey });
    if (initialChar !== undefined) {
      setEditValue(initialChar);
    } else {
      setEditValue(getCellValue(row, colKey));
    }

    // Auto-focus input in next tick
    setTimeout(() => {
      if (cellInputRef.current) {
        cellInputRef.current.focus();
        if (cellInputRef.current instanceof HTMLInputElement && initialChar === undefined) {
          cellInputRef.current.select();
        }
      }
    }, 50);
  };

  // Helper: Create a real document in Firestore from placeholder row
  const convertPlaceholderToReal = async (colKey: string, initialVal: string): Promise<string> => {
    setSyncStatus('saving');
    try {
      const data: any = {
        vin: '',
        year: '',
        make: '',
        model: '',
        customerName: '',
        bodyClass: '',
        driveType: '',
        gvwr: '',
        qrStickerId: '',
        isWithCustomer: false,
        arrivedAt: null,
        departedAt: null,
        isArchived: false,
        notes: '',
        createdAt: serverTimestamp()
      };

      if (colKey === 'isArchived') {
        data.isArchived = (initialVal === 'true');
      } else if (colKey === 'isWithCustomer') {
        data.isWithCustomer = (initialVal === 'true');
      } else if (colKey === 'arrivedAt' || colKey === 'departedAt') {
        data[colKey] = initialVal ? new Date(initialVal) : null;
      } else {
        data[colKey] = initialVal;
      }

      const docRef = await addDoc(collection(db, `businesses/${tenantId}/vehicles`), data);
      setSyncStatus('saved');
      return docRef.id;
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to register new vehicle');
      throw e;
    }
  };

  // Helper: Save cell changes to Firestore
  const saveCellValue = async (rowId: string, colKey: string, newValue: string) => {
    let finalRowId = rowId;
    
    if (rowId === 'placeholder-row') {
      if (!newValue.trim() && colKey !== 'isArchived' && colKey !== 'isWithCustomer' && colKey !== 'customerName') {
        setEditingCell(null);
        return;
      }
      try {
        finalRowId = await convertPlaceholderToReal(colKey, newValue);
        setSelectedCell({ rowId: finalRowId, colKey });
        setEditingCell(null);
        return;
      } catch (e) {
        return;
      }
    }

    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    const oldVal = getCellValue(row, colKey);
    if (oldVal === newValue) {
      setEditingCell(null);
      return;
    }

    setSyncStatus('saving');
    try {
      const updates: any = {};
      if (colKey === 'isArchived' || colKey === 'isWithCustomer') {
        updates[colKey] = (newValue === 'true');
      } else if (colKey === 'arrivedAt' || colKey === 'departedAt') {
        updates[colKey] = newValue ? new Date(newValue) : null;
      } else {
        updates[colKey] = newValue;
      }

      await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, finalRowId), updates);
      setSyncStatus('saved');
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to save change');
    }

    setEditingCell(null);
  };

  // Keyboard navigation
  const handleKeyDownGrid = (e: React.KeyboardEvent) => {
    if (!selectedCell || editingCell) return;

    const { rowId, colKey } = selectedCell;
    const colIndex = COLUMNS.findIndex(c => c.key === colKey);
    const rowIndex = rows.findIndex(r => r.id === rowId);

    if (rowIndex === -1 || colIndex === -1) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (rowIndex > 0) {
          setSelectedCell({ rowId: rows[rowIndex - 1].id, colKey });
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (rowIndex < rows.length - 1) {
          setSelectedCell({ rowId: rows[rowIndex + 1].id, colKey });
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (colIndex > 0) {
          setSelectedCell({ rowId, colKey: COLUMNS[colIndex - 1].key });
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (colIndex < COLUMNS.length - 1) {
          setSelectedCell({ rowId, colKey: COLUMNS[colIndex + 1].key });
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          if (colIndex > 0) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex - 1].key });
          } else if (rowIndex > 0) {
            setSelectedCell({ rowId: rows[rowIndex - 1].id, colKey: COLUMNS[COLUMNS.length - 1].key });
          }
        } else {
          if (colIndex < COLUMNS.length - 1) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex + 1].key });
          } else if (rowIndex < rows.length - 1) {
            setSelectedCell({ rowId: rows[rowIndex + 1].id, colKey: COLUMNS[0].key });
          }
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (colKey === 'isArchived' || colKey === 'isWithCustomer') {
          if (rowId !== 'placeholder-row') {
            const currentVal = getCellValue(rows[rowIndex], colKey);
            saveCellValue(rowId, colKey, currentVal === 'true' ? 'false' : 'true');
          }
        } else {
          startEditing(rowId, colKey);
        }
        break;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        if (rowId !== 'placeholder-row') {
          saveCellValue(rowId, colKey, '');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSelectedCell(null);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          startEditing(rowId, colKey, e.key);
        }
        break;
    }
  };

  const handleKeyDownEditor = (e: React.KeyboardEvent) => {
    if (!editingCell) return;
    const { rowId, colKey } = editingCell;

    const colIndex = COLUMNS.findIndex(c => c.key === colKey);
    const rowIndex = rows.findIndex(r => r.id === rowId);

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        saveCellValue(rowId, colKey, editValue);
        if (rowIndex < rows.length - 1) {
          setSelectedCell({ rowId: rows[rowIndex + 1].id, colKey });
        }
        break;
      case 'Tab':
        e.preventDefault();
        saveCellValue(rowId, colKey, editValue);
        if (e.shiftKey) {
          if (colIndex > 0) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex - 1].key });
          } else if (rowIndex > 0) {
            setSelectedCell({ rowId: rows[rowIndex - 1].id, colKey: COLUMNS[COLUMNS.length - 1].key });
          }
        } else {
          if (colIndex < COLUMNS.length - 1) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex + 1].key });
          } else if (rowIndex < rows.length - 1) {
            setSelectedCell({ rowId: rows[rowIndex + 1].id, colKey: COLUMNS[0].key });
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setEditingCell(null);
        break;
    }
  };

  const handleCellClick = (rowId: string, colKey: string) => {
    if (selectedCell?.rowId === rowId && selectedCell?.colKey === colKey) {
      startEditing(rowId, colKey);
    } else {
      setSelectedCell({ rowId, colKey });
      setEditingCell(null);
    }
  };

  const activeSelectedValue = useMemo(() => {
    if (!selectedCell) return '';
    const row = rows.find(r => r.id === selectedCell.rowId);
    if (!row) return '';
    return getCellValue(row, selectedCell.colKey);
  }, [selectedCell, rows]);

  useEffect(() => {
    if (selectedCell && !editingCell) {
      setEditValue(activeSelectedValue);
    }
  }, [selectedCell, editingCell, activeSelectedValue]);

  // Auto-scroll effect
  useEffect(() => {
    if (!selectedCell || !gridContainerRef.current) return;
    
    const cellEl = gridContainerRef.current.querySelector(
      `[data-row-id="${selectedCell.rowId}"][data-col-key="${selectedCell.colKey}"]`
    ) as HTMLElement | null;
    
    if (!cellEl) return;
    
    const container = gridContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    
    const relativeTop = cellRect.top - containerRect.top;
    const relativeBottom = cellRect.bottom - containerRect.top;
    const relativeLeft = cellRect.left - containerRect.left;
    const relativeRight = cellRect.right - containerRect.left;
    
    const headerHeight = 64; 
    const sidebarWidth = 50; 
    
    if (relativeTop < headerHeight) {
      container.scrollTop += (relativeTop - headerHeight);
    } else if (relativeBottom > containerRect.height) {
      container.scrollTop += (relativeBottom - containerRect.height);
    }
    
    if (relativeLeft < sidebarWidth) {
      container.scrollLeft += (relativeLeft - sidebarWidth);
    } else if (relativeRight > containerRect.width) {
      container.scrollLeft += (relativeRight - containerRect.width);
    }
  }, [selectedCell]);

  const handleDeleteRow = async (member: Vehicle) => {
    if (member.isPlaceholder) return;
    
    if (confirm(`Are you sure you want to delete vehicle ${member.vin || 'this vehicle'}?`)) {
      setSyncStatus('saving');
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/vehicles`, member.id));
        setSyncStatus('saved');
        setSelectedCell(null);
        setEditingCell(null);
        toast.success('Vehicle deleted');
      } catch (e) {
        setSyncStatus('error');
        toast.error('Failed to delete vehicle');
      }
    }
  };

  const cellCoordinateString = useMemo(() => {
    if (!selectedCell) return '';
    const col = COLUMNS.find(c => c.key === selectedCell.colKey);
    const rowIndex = rows.findIndex(r => r.id === selectedCell.rowId);
    if (!col || rowIndex === -1) return '';
    return `${col.letter}${rowIndex + 1}`;
  }, [selectedCell, rows, COLUMNS]);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] space-y-4">
      {/* Upper Sheet Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/60 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl border border-indigo-500/20">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-md font-extrabold text-white leading-tight flex items-center gap-2">
              Vehicles Sheet <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">v3</span>
            </h2>
            <p className="text-xs text-zinc-400">Excel-style grid for rapid fleet management.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Cloud Sync Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 rounded-xl border border-zinc-800/80 text-xs">
            {syncStatus === 'saving' && (
              <>
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                <span className="text-zinc-400 font-semibold">Saving to Cloud...</span>
              </>
            )}
            {syncStatus === 'saved' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-bold">Cloud Connected</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-500 font-bold">Sync Error</span>
              </>
            )}
          </div>

          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              showShortcuts 
                ? 'bg-zinc-800 text-white border-zinc-700'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            {showShortcuts ? 'Hide Controls' : 'Show Controls'}
          </button>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              showArchived 
                ? 'bg-zinc-800 text-white border-zinc-700'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
            }`}
          >
            {showArchived ? 'Hide Inactive' : 'Show Inactive'}
          </button>

          <div className="relative w-48 sm:w-64">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Search sheet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
        </div>
      </div>

      {showShortcuts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl text-xs text-zinc-400 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <p className="font-bold text-white mb-1">Navigation</p>
            <p>⌨️ <span className="text-zinc-200">Arrows</span>: Move selection</p>
            <p>⌨️ <span className="text-zinc-200">Tab</span> / <span className="text-zinc-200">Shift+Tab</span>: Move horizontal</p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Editing</p>
            <p>⌨️ <span className="text-zinc-200">Double Click</span> / <span className="text-zinc-200">Enter</span>: Edit cell</p>
            <p>⌨️ <span className="text-zinc-200">Type letters/numbers</span>: Start typing</p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Confirming Changes</p>
            <p>⌨️ <span className="text-zinc-200">Enter</span>: Commit & Move Down</p>
            <p>⌨️ <span className="text-zinc-200">Escape</span>: Cancel / Revert</p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Sheet Utilities</p>
            <p>⌨️ <span className="text-zinc-200">Backspace / Del</span>: Clear cell value</p>
            <p>⚡ <span className="text-zinc-200">Bottom row</span>: Start typing to register vehicle</p>
          </div>
        </div>
      )}

      {/* Formula Bar */}
      <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-850 px-3 py-2 rounded-xl text-xs">
        <div className="bg-zinc-900 border border-zinc-800 text-indigo-400 px-3 py-1 font-mono rounded select-none w-14 text-center" title="Cell Coordinate">
          {cellCoordinateString || '--'}
        </div>
        <div className="text-zinc-500 font-bold select-none px-1">fx</div>
        <div className="h-4 w-[1px] bg-zinc-800 self-center mx-1"></div>
        <input
          ref={formulaInputRef}
          type="text"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            if (selectedCell && !editingCell) {
              setEditingCell(selectedCell);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (selectedCell) {
                saveCellValue(selectedCell.rowId, selectedCell.colKey, editValue);
                if (formulaInputRef.current) formulaInputRef.current.blur();
              }
            } else if (e.key === 'Escape') {
              setEditingCell(null);
              if (selectedCell) {
                const row = rows.find(r => r.id === selectedCell.rowId);
                if (row) setEditValue(getCellValue(row, selectedCell.colKey));
              }
              if (formulaInputRef.current) formulaInputRef.current.blur();
            }
          }}
          disabled={!selectedCell}
          placeholder={selectedCell ? "Enter value..." : "Select a cell to edit..."}
          className="flex-1 bg-transparent border-none text-white outline-none text-xs placeholder-zinc-600 disabled:opacity-50"
        />
      </div>

      {/* Table grid */}
      <div 
        ref={gridContainerRef}
        className="flex-1 overflow-auto border border-zinc-850 bg-zinc-950 rounded-2xl relative"
        onKeyDown={handleKeyDownGrid}
        tabIndex={0}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-xs text-zinc-400 font-medium">Booting grid interface...</p>
            </div>
          </div>
        ) : null}

        <table 
          ref={tableRef}
          className="border-collapse table-fixed select-none text-xs font-mono"
          style={{ width: 'max-content', minWidth: '100%' }}
        >
          <colgroup>
            <col className="w-[50px]" />
            <col className="w-[70px]" />  {/* Active */}
            <col className="w-[180px]" /> {/* VIN */}
            <col className="w-[80px]" />  {/* Year */}
            <col className="w-[140px]" /> {/* Make */}
            <col className="w-[140px]" /> {/* Model */}
            <col className="w-[180px]" /> {/* Customer */}
            <col className="w-[140px]" /> {/* Body Class */}
            <col className="w-[120px]" /> {/* Drive Type */}
            <col className="w-[120px]" /> {/* GVWR */}
            <col className="w-[140px]" /> {/* QR Sticker */}
            <col className="w-[120px]" /> {/* With Customer */}
            <col className="w-[180px]" /> {/* Arrived At */}
            <col className="w-[180px]" /> {/* Departed At */}
            <col className="w-[250px]" /> {/* Notes */}
          </colgroup>

          <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 text-zinc-400 select-none">
            <tr>
              <th className="bg-zinc-950/90 border-r border-b border-zinc-800 h-6 text-[9px] font-black text-center text-zinc-600">
                #
              </th>
              {COLUMNS.map(col => (
                <th key={col.key} className="bg-zinc-900 border-r border-b border-zinc-800 text-[10px] font-bold text-center h-6">
                  {col.letter}
                </th>
              ))}
            </tr>
            <tr>
              <th className="bg-zinc-950/90 border-r border-zinc-800 h-10"></th>
              {COLUMNS.map(col => (
                <th key={col.key} className="border-r border-zinc-850 text-left px-3 text-[11px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-900/60">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-900">
            {rows.map((row, rIndex) => {
              const isPlaceholder = !!row.isPlaceholder;

              return (
                <tr 
                  key={row.id} 
                  className={`hover:bg-zinc-900/20 group transition-colors duration-100 ${
                    isPlaceholder ? 'bg-zinc-950 text-zinc-600' : 'bg-transparent text-zinc-200'
                  }`}
                >
                  <td className="bg-zinc-900/40 border-r border-zinc-800 h-9 relative text-center text-[10px] text-zinc-500 font-bold select-none cursor-default">
                    {!isPlaceholder ? (
                      <>
                        <span className="group-hover:hidden">{rIndex + 1}</span>
                        <button
                          onClick={() => handleDeleteRow(row)}
                          className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-rose-950/30 text-rose-500 hover:bg-rose-900 hover:text-white rounded transition-all w-full h-full"
                          title="Delete vehicle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-zinc-600 font-black">+</span>
                    )}
                  </td>

                  {COLUMNS.map(col => {
                    const isSelected = selectedCell?.rowId === row.id && selectedCell?.colKey === col.key;
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key && col.type !== 'checkbox' && col.type !== 'checkbox-direct';
                    const cellVal = getCellValue(row, col.key);

                    let displayContent: React.ReactNode = cellVal;
                    let textClass = 'text-left';

                    if (col.type === 'checkbox' || col.type === 'checkbox-direct') {
                      textClass = 'text-center';
                      const isChecked = col.key === 'isArchived'
                        ? cellVal === 'false' // Checked if active (not archived)
                        : cellVal === 'true'; // Checked if true (with customer)

                      displayContent = (
                        <div className="flex items-center justify-center w-full h-full">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isPlaceholder}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              setSelectedCell({ rowId: row.id, colKey: col.key });
                              const nextVal = col.key === 'isArchived'
                                ? (e.target.checked ? 'false' : 'true')
                                : (e.target.checked ? 'true' : 'false');
                              saveCellValue(row.id, col.key, nextVal);
                            }}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-650 focus:ring-0 outline-none cursor-pointer"
                          />
                        </div>
                      );
                    }

                    if (col.type === 'datetime-local') {
                      displayContent = displayFirestoreTimestamp((row as any)[col.key]);
                    }

                    if (isPlaceholder && !isEditing && cellVal === '') {
                      displayContent = <span className="text-zinc-700 italic">empty cell</span>;
                    }

                    return (
                      <td
                        key={col.key}
                        data-row-id={row.id}
                        data-col-key={col.key}
                        onClick={() => handleCellClick(row.id, col.key)}
                        className={`border-r border-zinc-850 px-3 py-1.5 h-9 relative outline-none cursor-cell transition-all duration-75 select-none ${textClass} ${
                          isSelected ? 'bg-indigo-600/5 ring-2 ring-indigo-500 ring-inset z-10' : ''
                        }`}
                      >
                        {isEditing ? (
                          <div className="absolute inset-0 z-20 flex items-center bg-zinc-900 ring-2 ring-indigo-500 ring-inset">
                            {col.type === 'customer-select' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              >
                                <option value="" className="bg-zinc-900 text-zinc-400">None</option>
                                {customers.map(c => {
                                  const name = c.name || c.displayName || c.CompanyName || c.FullName || c.id;
                                  return (
                                    <option key={c.id} value={name} className="bg-zinc-900 text-white">{name}</option>
                                  );
                                })}
                              </select>
                            ) : (
                              <input
                                ref={cellInputRef as any}
                                type={col.type}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="truncate w-full">{displayContent}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
