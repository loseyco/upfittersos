import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Trash2, Search, Loader2,
  Cloud, AlertCircle, Maximize2, Minimize2, Plus, QrCode, Printer, Check, Clipboard
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';

export interface WireReel {
  gauge: string;
  color: string;
  length: string;
  status: 'in_stock' | 'low' | 'empty';
}

export interface WireRod {
  id: string;
  name: string;
  reels: WireReel[];
  isPlaceholder?: boolean;
}

export function WiresSpreadsheet({ tenantId }: { tenantId: string }) {
  const [rods, setRods] = useState<WireRod[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);

  // Cell Selection / Editing State
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Floating Popover Editor State
  const [activePopover, setActivePopover] = useState<{ rowId: string; reelIndex: number } | null>(null);
  const [popoverGauge, setPopoverGauge] = useState('');
  const [popoverColor, setPopoverColor] = useState('');
  const [popoverLength, setPopoverLength] = useState('');
  const [popoverStatus, setPopoverStatus] = useState<'in_stock' | 'low' | 'empty'>('in_stock');

  // Refs
  const cellInputRef = useRef<HTMLInputElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLFormElement | null>(null);
  const popoverGaugeInputRef = useRef<HTMLInputElement | null>(null);

  // Sync with Firestore
  useEffect(() => {
    setLoading(true);
    const q = collection(db, `businesses/${tenantId}/wire_rods`);
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WireRod));
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      setRods(list);
      setLoading(false);
    }, (err) => {
      console.error("Firestore sync error:", err);
      toast.error("Failed to load wire wall");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Click outside listener for Popover editor
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActivePopover(null);
      }
    }
    if (activePopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activePopover]);

  // Focus popover gauge input on open/change
  useEffect(() => {
    if (activePopover) {
      setTimeout(() => {
        if (popoverGaugeInputRef.current) {
          popoverGaugeInputRef.current.focus();
          popoverGaugeInputRef.current.select?.();
        }
      }, 80);
    }
  }, [activePopover?.rowId, activePopover?.reelIndex]);

  // Calculated Scan URL (One large QR code for the wall)
  const scanUrl = useMemo(() => {
    const host = window.location.origin;
    return `${host}/business/${tenantId}/wire_scan`;
  }, [tenantId]);

  // Determine Max Columns count
  const maxReels = useMemo(() => {
    if (rods.length === 0) return 4;
    return Math.max(4, ...rods.map(r => r.reels?.length || 0));
  }, [rods]);

  // Dynamic Columns definitions
  const COLUMNS = useMemo(() => {
    const list = [
      { key: 'name', label: 'Rod / Bar Name', letter: 'A', width: 180 }
    ];
    for (let i = 0; i < maxReels + 1; i++) {
      const letter = String.fromCharCode(66 + i); // B, C, D...
      list.push({
        key: `reel_${i}`,
        label: `Reel Position ${i + 1}`,
        letter,
        width: 220
      });
    }
    return list;
  }, [maxReels]);

  // Filtered rods
  const filteredRods = useMemo(() => {
    const queryStr = searchQuery.toLowerCase().trim();
    if (!queryStr) return rods;

    return rods.filter(rod => {
      if (rod.name.toLowerCase().includes(queryStr)) return true;
      // Search inside reels
      if (rod.reels) {
        return rod.reels.some(reel => 
          reel.gauge.toLowerCase().includes(queryStr) ||
          reel.color.toLowerCase().includes(queryStr) ||
          reel.length.toLowerCase().includes(queryStr) ||
          reel.status.toLowerCase().includes(queryStr)
        );
      }
      return false;
    });
  }, [rods, searchQuery]);

  // Append a placeholder row at the bottom for quick entry
  const rows = useMemo(() => {
    const list = [...filteredRods];
    list.push({
      id: 'placeholder-row',
      name: '',
      reels: [],
      isPlaceholder: true
    });
    return list;
  }, [filteredRods]);

  // Active filters summary
  const activeFiltersSummary = useMemo(() => {
    if (searchQuery.trim()) {
      return `search "${searchQuery}"`;
    }
    return '';
  }, [searchQuery]);

  const handleClearFilters = () => {
    setSearchQuery('');
  };

  // Reorder alert list
  const reorderList = useMemo(() => {
    const list: Array<{ rodName: string; reel: WireReel; reelIndex: number; rodId: string }> = [];
    rods.forEach(rod => {
      if (rod.reels) {
        rod.reels.forEach((reel, index) => {
          if (reel.status === 'low' || reel.status === 'empty') {
            list.push({ rodName: rod.name, reel, reelIndex: index, rodId: rod.id });
          }
        });
      }
    });
    return list;
  }, [rods]);

  // Helper to resolve cell coordinate
  const cellCoordinateString = useMemo(() => {
    if (!selectedCell) return '';
    const rowIndex = rows.findIndex(r => r.id === selectedCell.rowId);
    if (rowIndex === -1) return '';
    const colIndex = COLUMNS.findIndex(c => c.key === selectedCell.colKey);
    if (colIndex === -1) return '';
    return `${COLUMNS[colIndex].letter}${rowIndex + 1}`;
  }, [selectedCell, rows, COLUMNS]);

  // Resolve cell string content
  const getCellValue = (row: WireRod, colKey: string): string => {
    if (colKey === 'name') return row.name;
    if (colKey.startsWith('reel_')) {
      const idx = parseInt(colKey.split('_')[1]);
      const reel = row.reels?.[idx];
      if (!reel) return '';
      return `${reel.gauge}, ${reel.color}, ${reel.length}`;
    }
    return '';
  };

  // Resolve cell formatted content for rendering
  const renderCellContent = (row: WireRod, colKey: string) => {
    if (colKey === 'name') {
      return <span className="font-bold text-zinc-300">{row.name}</span>;
    }
    if (colKey.startsWith('reel_')) {
      const idx = parseInt(colKey.split('_')[1]);
      const reel = row.reels?.[idx];
      if (!reel) {
        return <span className="text-zinc-650 italic text-[10px] font-sans font-medium">+ Add Reel</span>;
      }

      // Status indicator colors
      let statusColor = 'bg-emerald-500';
      if (reel.status === 'low') statusColor = 'bg-amber-500 animate-pulse';
      if (reel.status === 'empty') statusColor = 'bg-rose-500';

      return (
        <div className="flex items-center justify-between w-full pr-1">
          <div className="flex items-center gap-1.5 truncate">
            <span className={cn("w-2 h-2 rounded-full shrink-0", statusColor)} title={`Status: ${reel.status}`} />
            <span className="text-white font-bold tracking-tight truncate">
              {reel.gauge || '?'}{' '}
              {reel.color && <span className="text-zinc-400 font-normal font-sans">({reel.color})</span>}
            </span>
          </div>
          {reel.length && (
            <span className="text-[10px] bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded text-zinc-400 font-sans shrink-0 font-semibold ml-2">
              {/^\d+$/.test(reel.length) ? `${reel.length} ft` : reel.length}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  // Keyboard navigation handler
  const handleKeyDownGrid = (e: React.KeyboardEvent) => {
    if (!selectedCell || editingCell) return;

    const rowIndex = rows.findIndex(r => r.id === selectedCell.rowId);
    const colIndex = COLUMNS.findIndex(c => c.key === selectedCell.colKey);
    if (rowIndex === -1 || colIndex === -1) return;

    let targetRowIndex = rowIndex;
    let targetColIndex = colIndex;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        targetRowIndex = Math.max(0, rowIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        targetRowIndex = Math.min(rows.length - 1, rowIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        targetColIndex = Math.max(0, colIndex - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        targetColIndex = Math.min(COLUMNS.length - 1, colIndex + 1);
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          targetColIndex = Math.max(0, colIndex - 1);
        } else {
          targetColIndex = Math.min(COLUMNS.length - 1, colIndex + 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        const row = rows[rowIndex];
        if (selectedCell.colKey.startsWith('reel_')) {
          // Open Popover editor for reels
          const idx = parseInt(selectedCell.colKey.split('_')[1]);
          const reel = row.reels?.[idx];
          setPopoverGauge(reel?.gauge || '');
          setPopoverColor(reel?.color || '');
          setPopoverLength(reel?.length || '');
          setPopoverStatus(reel?.status || 'in_stock');
          setActivePopover({ rowId: row.id, reelIndex: idx });
        } else {
          // Edit rod name inline
          startEditing(selectedCell.rowId, selectedCell.colKey);
        }
        return;
      default:
        return;
    }

    const nextRow = rows[targetRowIndex];
    const nextCol = COLUMNS[targetColIndex];
    if (nextRow && nextCol) {
      setSelectedCell({ rowId: nextRow.id, colKey: nextCol.key });
      const rowVal = getCellValue(nextRow, nextCol.key);
      setEditValue(rowVal);
      scrollToCell(nextRow.id, nextCol.key);
    }
  };

  const scrollToCell = (rowId: string, colKey: string) => {
    setTimeout(() => {
      const container = gridContainerRef.current;
      const cell = container?.querySelector(`[data-cell-id="${rowId}-${colKey}"]`) as HTMLElement;
      if (!container || !cell) return;

      const containerRect = container.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();

      const relativeTop = cellRect.top - containerRect.top + container.scrollTop;
      const relativeBottom = relativeTop + cellRect.height;
      const relativeLeft = cellRect.left - containerRect.left + container.scrollLeft;
      const relativeRight = relativeLeft + cellRect.width;

      const headerHeight = 32; 

      if (relativeTop < headerHeight) {
        container.scrollTop += (relativeTop - headerHeight);
      } else if (relativeBottom > containerRect.height) {
        container.scrollTop += (relativeBottom - containerRect.height);
      }

      if (relativeLeft < 50) {
        container.scrollLeft += (relativeLeft - 50);
      } else if (relativeRight > containerRect.width) {
        container.scrollLeft += (relativeRight - containerRect.width);
      }
    }, 10);
  };

  const triggerCellEdit = (row: WireRod, colKey: string) => {
    if (colKey.startsWith('reel_')) {
      const idx = parseInt(colKey.split('_')[1]);
      const reel = row.reels?.[idx];
      setPopoverGauge(reel?.gauge || '');
      setPopoverColor(reel?.color || '');
      setPopoverLength(reel?.length || '');
      setPopoverStatus(reel?.status || 'in_stock');
      setActivePopover({ rowId: row.id, reelIndex: idx });
    } else {
      startEditing(row.id, colKey);
    }
  };

  const startEditing = (rowId: string, colKey: string) => {
    setSelectedCell({ rowId, colKey });
    setEditingCell({ rowId, colKey });
    const row = rows.find(r => r.id === rowId);
    if (row) {
      setEditValue(getCellValue(row, colKey));
    }
    setTimeout(() => {
      if (cellInputRef.current) {
        cellInputRef.current.focus();
        cellInputRef.current.select?.();
      }
    }, 50);
  };

  // Save values
  const saveCellValue = async (rowId: string, colKey: string, value: string) => {
    setEditingCell(null);
    setSyncStatus('saving');
    try {
      if (rowId === 'placeholder-row') {
        if (colKey === 'name' && value.trim()) {
          // Create new Rod
          await addDoc(collection(db, `businesses/${tenantId}/wire_rods`), {
            name: value.trim(),
            reels: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setSyncStatus('saved');
          toast.success("New rod added");
          setSelectedCell(null);
        } else {
          setSyncStatus('saved');
        }
        return;
      }

      const rodRef = doc(db, `businesses/${tenantId}/wire_rods`, rowId);
      const rod = rods.find(r => r.id === rowId);
      if (!rod) return;

      if (colKey === 'name') {
        if (!value.trim()) {
          toast.error("Rod name cannot be empty");
          setSyncStatus('error');
          return;
        }
        await updateDoc(rodRef, {
          name: value.trim(),
          updatedAt: serverTimestamp()
        });
      } else if (colKey.startsWith('reel_')) {
        const idx = parseInt(colKey.split('_')[1]);
        const currentReels = [...(rod.reels || [])];

        if (!value.trim()) {
          // Remove reel if empty
          if (idx < currentReels.length) {
            currentReels.splice(idx, 1);
            await updateDoc(rodRef, {
              reels: currentReels,
              updatedAt: serverTimestamp()
            });
            toast.success("Reel removed");
          }
        } else {
          // Parse string: "gauge, color, length"
          const parts = value.split(',').map(s => s.trim());
          const gauge = parts[0] || '';
          const color = parts[1] || '';
          const length = parts[2] || '';

          const updatedReel: WireReel = {
            gauge,
            color,
            length,
            status: currentReels[idx]?.status || 'in_stock'
          };

          if (idx < currentReels.length) {
            currentReels[idx] = updatedReel;
          } else {
            currentReels.push(updatedReel);
          }

          await updateDoc(rodRef, {
            reels: currentReels,
            updatedAt: serverTimestamp()
          });
        }
      }
      setSyncStatus('saved');
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      toast.error("Failed to save changes");
    }
  };

  // Popover editor submit
  const handleSavePopoverReel = async () => {
    if (!activePopover) return;
    const { rowId, reelIndex } = activePopover;
    setSyncStatus('saving');

    try {
      const rodRef = doc(db, `businesses/${tenantId}/wire_rods`, rowId);
      const rod = rods.find(r => r.id === rowId);
      if (!rod) return;

      const currentReels = [...(rod.reels || [])];
      let finalGauge = popoverGauge.trim();
      if (/^\d+$/.test(finalGauge)) {
        finalGauge = `${finalGauge} AWG`;
      }

      let finalLength = popoverLength.trim();
      finalLength = finalLength.replace(/(ft|Ft|ft\.|feet)$/i, '').trim();

      const updatedReel: WireReel = {
        gauge: finalGauge,
        color: popoverColor.trim(),
        length: finalLength,
        status: popoverStatus
      };

      if (reelIndex < currentReels.length) {
        currentReels[reelIndex] = updatedReel;
      } else {
        currentReels.push(updatedReel);
      }

      await updateDoc(rodRef, {
        reels: currentReels,
        updatedAt: serverTimestamp()
      });
      setSyncStatus('saved');
      toast.success("Reel saved");

      // Auto-advance to the next reel position in the same row
      const nextIndex = reelIndex + 1;
      const nextReel = currentReels[nextIndex];
      setPopoverGauge(nextReel?.gauge || '');
      setPopoverColor(nextReel?.color || '');
      setPopoverLength(nextReel?.length || '');
      setPopoverStatus(nextReel?.status || 'in_stock');
      setActivePopover({ rowId, reelIndex: nextIndex });
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      toast.error("Failed to save reel");
      setActivePopover(null);
    }
  };

  const handleDeletePopoverReel = async () => {
    if (!activePopover) return;
    const { rowId, reelIndex } = activePopover;
    setActivePopover(null);
    setSyncStatus('saving');

    try {
      const rodRef = doc(db, `businesses/${tenantId}/wire_rods`, rowId);
      const rod = rods.find(r => r.id === rowId);
      if (!rod) return;

      const currentReels = [...(rod.reels || [])];
      if (reelIndex < currentReels.length) {
        currentReels.splice(reelIndex, 1);
        await updateDoc(rodRef, {
          reels: currentReels,
          updatedAt: serverTimestamp()
        });
        setSyncStatus('saved');
        toast.success("Reel deleted");
      }
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      toast.error("Failed to delete reel");
    }
  };

  // Bulk Import
  const handleRunBulkImport = async () => {
    if (!importText.trim()) {
      setShowImportModal(false);
      return;
    }

    setLoading(true);
    try {
      const lines = importText.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const rodName = parts[0].trim();
        const reelsText = parts[1].trim();

        const reels: WireReel[] = [];
        const rawReels = reelsText.split(';').map(r => r.trim()).filter(Boolean);
        for (const r of rawReels) {
          const sub = r.split(',').map(s => s.trim());
          if (sub.length >= 3) {
            reels.push({ gauge: sub[0], color: sub[1], length: sub[2], status: 'in_stock' });
          } else {
            const words = r.split(/\s+/);
            if (words.length >= 3) {
              const gauge = words[0];
              const length = words[words.length - 1];
              const color = words.slice(1, words.length - 1).join(' ');
              reels.push({ gauge, color, length, status: 'in_stock' });
            } else if (words.length === 2) {
              reels.push({ gauge: words[0], color: words[1], length: '', status: 'in_stock' });
            } else if (words.length === 1 && words[0]) {
              reels.push({ gauge: words[0], color: '', length: '', status: 'in_stock' });
            }
          }
        }

        // Write to Firestore
        await addDoc(collection(db, `businesses/${tenantId}/wire_rods`), {
          name: rodName,
          reels,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      toast.success("Bulk import complete!");
      setShowImportModal(false);
      setImportText('');
    } catch (e) {
      console.error(e);
      toast.error("Bulk import failed");
    } finally {
      setLoading(false);
    }
  };

  // Delete whole Rod Row
  const handleDeleteRod = async (rod: WireRod) => {
    if (rod.isPlaceholder) return;
    if (confirm(`Delete rod "${rod.name}" and all of its reels?`)) {
      setSyncStatus('saving');
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/wire_rods`, rod.id));
        setSyncStatus('saved');
        setSelectedCell(null);
        toast.success("Rod deleted");
      } catch (e) {
        console.error(e);
        setSyncStatus('error');
        toast.error("Failed to delete rod");
      }
    }
  };

  return (
    <div className={cn(
      "bg-zinc-955 flex flex-col transition-all h-[calc(100vh-140px)]",
      isFullScreen ? "fixed inset-0 z-50 h-screen w-screen p-6 bg-zinc-950" : "rounded-3xl border border-zinc-850 p-4"
    )}>
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-white flex items-center gap-1.5 uppercase tracking-wider">
              Wires Sheet <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">v3</span>
            </h2>
            <p className="text-xs text-zinc-500 font-sans hidden sm:inline">Manage reels and physical placement on your wall.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 rounded-xl border border-zinc-800/80 text-xs">
            {syncStatus === 'saving' && (
              <>
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                <span className="text-zinc-400 font-semibold">Saving...</span>
              </>
            )}
            {syncStatus === 'saved' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-bold">Synced</span>
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
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800 hover:text-white text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
            title="Bulk Import Wires from Text List"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span>Bulk Import</span>
          </button>

          <button
            onClick={() => setShowQRModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-650 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
            title="Show flyer QR code to stick on wall"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Wall QR Flyer</span>
          </button>

          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:text-white text-zinc-405 border border-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
            title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          >
            {isFullScreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Full Screen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Screen</span>
              </>
            )}
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

      {/* Sticky Low / Out of Stock Banner */}
      {reorderList.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-2.5 mb-3 shrink-0 flex flex-wrap items-center gap-2 text-xs font-sans">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="font-bold text-amber-400">Needs Reorder:</span>
          <div className="flex flex-wrap gap-1.5">
            {reorderList.map((item) => (
              <span 
                key={`${item.rodId}-${item.reelIndex}`}
                className={cn(
                  "px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 border",
                  item.reel.status === 'empty' 
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400" 
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                )}
                title={`${item.rodName} - Position ${item.reelIndex + 1}`}
              >
                {item.reel.gauge} {item.reel.color} ({item.reel.status === 'empty' ? 'Out' : 'Low'})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Formula Bar */}
      <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-850 px-3 py-2 rounded-xl text-xs shrink-0 mb-3">
        <div className="bg-zinc-900 border border-zinc-800 text-indigo-400 px-3 py-1 font-mono rounded select-none w-14 text-center" title="Cell Coordinate">
          {cellCoordinateString || '--'}
        </div>
        <div className="text-zinc-650 font-bold font-mono px-1 select-none">fx</div>
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
          disabled={!selectedCell || selectedCell.colKey.startsWith('reel_')} 
          placeholder={selectedCell ? (selectedCell.colKey.startsWith('reel_') ? "Double click reel cell below to edit..." : "Enter rod name...") : "Select a cell to edit..."}
          className="flex-1 bg-transparent border-none text-zinc-200 outline-none placeholder-zinc-600 font-mono disabled:opacity-50"
        />
        <div className="flex items-center gap-2 text-[11px] shrink-0 font-sans pl-3 border-l border-zinc-800 text-zinc-400 select-none">
          <span>
            Showing <strong>{filteredRods.length}</strong> of <strong>{rods.length}</strong> rods
          </span>
          {activeFiltersSummary && (
            <button 
              onClick={handleClearFilters}
              className="text-indigo-400 font-medium truncate max-w-[280px] hover:text-indigo-300 hover:underline cursor-pointer flex items-center gap-1 select-none border-none bg-transparent p-0" 
              title="Click to clear search"
            >
              &bull; Filtered by {activeFiltersSummary}
            </button>
          )}
        </div>
      </div>

      {/* Spreadsheet Grid Table */}
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
              <p className="text-xs text-zinc-400 font-medium font-sans">Booting grid interface...</p>
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
            {COLUMNS.map(col => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
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
              <th className="bg-zinc-950/90 border-r border-b border-zinc-800 text-center font-bold text-[10px] h-8 align-middle text-zinc-500">
                &bull;
              </th>
              {COLUMNS.map(col => (
                <th key={col.key} className="border-r border-zinc-850 text-left px-3 text-[11px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-900/60 align-middle">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="bg-zinc-950">
            {rows.map((row, rIdx) => {
              return (
                <tr 
                  key={row.id} 
                  className={cn(
                    "border-b border-zinc-850 group/row hover:bg-zinc-900/30 transition-colors h-9",
                    row.isPlaceholder ? "opacity-60" : ""
                  )}
                >
                  <td className="sticky left-0 bg-zinc-950 text-zinc-600 font-bold border-r border-zinc-800 text-center select-none font-mono text-[10px]">
                    <span className="group-hover/row:hidden">{rIdx + 1}</span>
                    {!row.isPlaceholder && (
                      <button
                        onClick={() => handleDeleteRod(row)}
                        className="hidden group-hover/row:inline-block p-1 hover:text-rose-500 text-zinc-550 rounded cursor-pointer transition-colors"
                        title="Delete this rod row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>

                  {COLUMNS.map(col => {
                    const isSelected = selectedCell?.rowId === row.id && selectedCell?.colKey === col.key;
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key;
                    const displayVal = renderCellContent(row, col.key);

                    return (
                      <td
                        key={col.key}
                        data-cell-id={`${row.id}-${col.key}`}
                        onClick={() => {
                          const isAlreadySelected = selectedCell?.rowId === row.id && selectedCell?.colKey === col.key;
                          setSelectedCell({ rowId: row.id, colKey: col.key });
                          setEditValue(getCellValue(row, col.key));
                          if (isAlreadySelected) {
                            triggerCellEdit(row, col.key);
                          }
                        }}
                        onDoubleClick={() => {
                          triggerCellEdit(row, col.key);
                        }}
                        className={cn(
                          "border-r border-zinc-850 px-3 relative truncate font-semibold h-9 align-middle select-none transition-colors",
                          isSelected ? "ring-2 ring-indigo-500 bg-indigo-500/5" : "",
                          isSelected && isEditing ? "bg-zinc-950" : ""
                        )}
                      >
                        {isEditing ? (
                          <input
                            ref={cellInputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveCellValue(row.id, col.key, editValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                saveCellValue(row.id, col.key, editValue);
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                              }
                            }}
                            className="absolute inset-0 w-full h-full px-3 bg-zinc-900 text-white outline-none border-none font-semibold text-xs"
                          />
                        ) : (
                          <div className="flex items-center justify-between w-full h-full">
                            {displayVal}
                          </div>
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

      {/* Popover Editor Modal */}
      {activePopover && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 animate-in fade-in duration-150 p-4">
          <form 
            ref={popoverRef as any}
            onSubmit={(e) => {
              e.preventDefault();
              handleSavePopoverReel();
            }}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-850 rounded-2xl shadow-2xl p-5 text-white font-sans"
          >
            <h3 className="text-sm font-black tracking-wider uppercase text-indigo-400 mb-4 flex items-center gap-1.5">
              <Clipboard className="w-4 h-4" />
              Edit Reel Details
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Gauge / Size</label>
                <input 
                  ref={popoverGaugeInputRef}
                  type="text"
                  placeholder="e.g. 10 AWG, 4 AWG, 2/0"
                  value={popoverGauge}
                  onChange={e => setPopoverGauge(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-700 font-semibold focus:border-indigo-500 outline-none"
                />
                <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
                  {['22 AWG', '18 AWG', '16 AWG', '14 AWG', '12 AWG', '10 AWG', '4 AWG', '1/0', '2/0', '4/0'].map(g => (
                    <button
                      type="button"
                      tabIndex={-1}
                      key={g}
                      onClick={() => setPopoverGauge(g)}
                      className="px-1.5 py-0.5 bg-zinc-950 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded text-[9px] text-zinc-400 font-semibold transition-colors"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Color / Stripe</label>
                <input 
                  type="text"
                  placeholder="e.g. Red, Black, Green/Yellow"
                  value={popoverColor}
                  onChange={e => setPopoverColor(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-700 font-semibold focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Estimated Length Left (ft)</label>
                <input 
                  type="text"
                  placeholder="e.g. 150, 50, 10%"
                  value={popoverLength}
                  onChange={e => setPopoverLength(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-700 font-semibold focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Stock Status</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setPopoverStatus('in_stock')}
                    className={cn(
                      "px-3 py-2 border rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1",
                      popoverStatus === 'in_stock' 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/5" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    In Stock
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setPopoverStatus('low')}
                    className={cn(
                      "px-3 py-2 border rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1",
                      popoverStatus === 'low' 
                        ? "bg-amber-500/10 border-amber-500 text-amber-400 shadow-md shadow-amber-500/5" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Low
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setPopoverStatus('empty')}
                    className={cn(
                      "px-3 py-2 border rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1",
                      popoverStatus === 'empty' 
                        ? "bg-rose-500/10 border-rose-505 text-rose-400 shadow-md shadow-rose-500/5" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    Empty
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 gap-3 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleDeletePopoverReel}
                className="px-3 py-2 text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 rounded-xl cursor-pointer transition-all"
              >
                Delete Reel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  className="px-3 py-2 text-xs font-bold text-zinc-400 bg-zinc-950 border border-zinc-800 hover:bg-zinc-850 rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-650 rounded-xl shadow-md cursor-pointer transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 animate-in fade-in duration-150 p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-850 rounded-3xl shadow-2xl p-6 text-white font-sans">
            <h3 className="text-sm font-black tracking-wider uppercase text-indigo-400 mb-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Bulk Import Wire Wall
            </h3>
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed font-sans">
              Format: <code>Rod Name: Gauge, Color, Length; Gauge, Color, Length</code>. Put each rod on a new line.<br />
              Example:<br />
              <code className="text-zinc-400 block bg-zinc-950 p-2 rounded-lg mt-1 select-all font-mono">
                Row A: 10 AWG, Red, 100ft; 12 AWG, Black, 50ft<br />
                Row B: 4 AWG, Black, 40ft; 2/0, Red, 20ft
              </code>
            </p>

            <textarea
              rows={8}
              placeholder="Paste wire config here..."
              value={importText}
              onChange={e => setImportText(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-indigo-500 font-mono resize-none"
            />

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-850 text-xs font-bold text-zinc-400 rounded-xl border border-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRunBulkImport}
                className="px-5 py-2 bg-indigo-500 hover:bg-indigo-650 text-xs font-bold text-white rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Import Config</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Flyer Modal */}
      {showQRModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 animate-in fade-in duration-150 p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-850 rounded-3xl shadow-2xl p-6 text-white font-sans text-center">
            <h3 className="text-sm font-black tracking-wider uppercase text-indigo-400 mb-2 flex items-center justify-center gap-1.5">
              <QrCode className="w-4 h-4" />
              Wire Wall QR Code Flyer
            </h3>
            <p className="text-xs text-zinc-550 mb-6 leading-relaxed">
              Print this flyer and tape it next to your hardware bins or wire rack. Anyone can scan it to instantly request parts, wire, or hardware from their mobile phone.
            </p>

            <div id="qr-printable-area" className="bg-white p-8 rounded-2xl flex flex-col items-center justify-center text-zinc-950 border border-zinc-200 shadow-sm mx-auto w-[280px]">
              <h1 className="text-lg font-black tracking-wider uppercase text-zinc-900 text-center mb-1 leading-tight">
                UPFITTERS OS
              </h1>
              <p className="text-[10px] font-black text-indigo-600 tracking-widest uppercase mb-4">
                SHOP FLOOR ASSIST
              </p>

              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(scanUrl)}`} 
                alt="QR Code" 
                className="w-44 h-44 mb-4 border border-zinc-100 p-2 rounded-lg"
              />

              <p className="text-xs font-black text-zinc-900 tracking-tight text-center">
                SCAN TO REQUEST
              </p>
              <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                PARTS & HARDWARE
              </p>
            </div>

            <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button
                onClick={() => {
                  const printContents = document.getElementById('qr-printable-area')?.innerHTML;
                  if (printContents) {
                    const win = window.open('', '_blank');
                    if (win) {
                      win.document.write(`
                        <html>
                          <head>
                            <title>Print Wire Wall QR Code</title>
                            <style>
                              body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; }
                              #qr-printable-area { text-align: center; border: 4px solid #000; padding: 40px; border-radius: 20px; }
                              h1 { font-size: 28px; margin: 0; font-weight: 900; letter-spacing: 2px; }
                              p { margin: 5px 0; }
                            </style>
                          </head>
                          <body onload="window.print();window.close()">
                            <div id="qr-printable-area">${printContents}</div>
                          </body>
                        </html>
                      `);
                      win.document.close();
                    }
                  }
                }}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-650 text-xs font-bold text-white rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Flyer</span>
              </button>
              <button
                onClick={() => setShowQRModal(false)}
                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-850 text-xs font-bold text-zinc-400 rounded-xl border border-zinc-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
