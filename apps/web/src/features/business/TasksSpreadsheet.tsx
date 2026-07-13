import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Trash2, Search, Loader2,
  Cloud, AlertCircle, ChevronDown,
  Maximize2, Minimize2, Plus, ClipboardList
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, serverTimestamp, query
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';

export interface Task {
  id: string;
  name: string;
  bookHours?: number;
  status?: string;
  assignedCrew?: string[];
  notes?: string;
  completedAt?: any;
  completedBy?: string;
}

export interface Job {
  id: string;
  jobNumber?: string;
  title?: string;
  status?: string;
  priority?: string;
  customerName?: string;
  vehicleId?: string;
  isArchived?: boolean;
}

export function TasksSpreadsheet({ tenantId }: { tenantId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedJobIdForNewTask, setSelectedJobIdForNewTask] = useState('');
  
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({
    jobId: [],
    status: [],
    assignedCrew: []
  });

  const [activeHeaderFilterDropdown, setActiveHeaderFilterDropdown] = useState<string | null>(null);

  // Cell Selection / Editing State
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Refs
  const cellInputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLDivElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Load active jobs
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/jobs`));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job))
                       .filter(j => !j.isArchived);
      setJobs(list);
    });
    return unsub;
  }, [tenantId]);

  // Load staff
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/staff`));
    const unsub = onSnapshot(q, (snap) => {
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });
    return unsub;
  }, [tenantId]);

  // Subscribe to tasks of active jobs
  const activeJobIds = useMemo(() => {
    return jobs.map(j => j.id);
  }, [jobs]);

  useEffect(() => {
    if (!tenantId || activeJobIds.length === 0) {
      setTasksMap({});
      setLoading(false);
      return;
    }

    let loadedCount = 0;
    const unsubs = activeJobIds.map(jobId => {
      const q = query(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
      return onSnapshot(q, (snap) => {
        const jobTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        setTasksMap(prev => ({
          ...prev,
          [jobId]: jobTasks
        }));
        loadedCount++;
        if (loadedCount >= activeJobIds.length) {
          setLoading(false);
        }
      }, (err) => {
        console.warn(`Could not load tasks for job ${jobId}:`, err);
      });
    });

    // Fallback if load is immediate or empty
    const timer = setTimeout(() => setLoading(false), 2000);

    return () => {
      unsubs.forEach(unsub => unsub());
      clearTimeout(timer);
    };
  }, [tenantId, activeJobIds]);

  // Flatten rows: Job tasks
  const rows = useMemo(() => {
    const list: Array<{
      id: string; // `${jobId}_${taskId}`
      jobId: string;
      taskId: string;
      jobNumber: string;
      jobTitle: string;
      name: string;
      bookHours: string;
      status: string;
      assignedCrew: string[];
      notes: string;
      completedAt: any;
      completedBy: string;
    }> = [];

    jobs.forEach(job => {
      const jobTasks = tasksMap[job.id] || [];
      jobTasks.forEach(task => {
        list.push({
          id: `${job.id}_${task.id}`,
          jobId: job.id,
          taskId: task.id,
          jobNumber: job.jobNumber || '',
          jobTitle: job.title || '',
          name: task.name || '',
          bookHours: String(task.bookHours ?? ''),
          status: task.status || 'pending',
          assignedCrew: task.assignedCrew || [],
          notes: task.notes || '',
          completedAt: task.completedAt || null,
          completedBy: task.completedBy || ''
        });
      });
    });

    return list;
  }, [jobs, tasksMap]);

  // Filter values

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => {
      if (r.status) set.add(r.status);
    });
    return Array.from(set).sort();
  }, [rows]);

  const uniqueCrew = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => {
      r.assignedCrew.forEach(c => set.add(c));
    });
    return Array.from(set).sort();
  }, [rows]);

  // Define Columns
  const COLUMNS = useMemo(() => [
    { key: 'jobNumber', label: 'Job #', letter: 'A', type: 'text' },
    { key: 'jobTitle', label: 'Job Title', letter: 'B', type: 'text' },
    { key: 'name', label: 'Task Name', letter: 'C', type: 'text' },
    { key: 'status', label: 'Status', letter: 'D', type: 'status-select' },
    { key: 'bookHours', label: 'Book Hours', letter: 'E', type: 'number' },
    { key: 'assignedCrew', label: 'Assigned Crew', letter: 'F', type: 'crew-select' },
    { key: 'notes', label: 'Task Notes', letter: 'G', type: 'text' },
    { key: 'completedAt', label: 'Completed At', letter: 'H', type: 'datetime' },
    { key: 'completedBy', label: 'Completed By', letter: 'I', type: 'text' }
  ], []);

  // Filter rows
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (searchQuery.trim()) {
        const queryStr = searchQuery.toLowerCase();
        const fields = [
          row.jobNumber,
          row.jobTitle,
          row.name,
          row.status,
          row.notes,
          row.completedBy
        ].map(f => String(f || '').toLowerCase());
        if (!fields.some(f => f.includes(queryStr))) return false;
      }

      // Dropdown filters
      if (colFilters.jobId && colFilters.jobId.length > 0) {
        const matches = colFilters.jobId.some(val => {
          if (val === 'empty') return !row.jobTitle || !row.jobTitle.trim();
          const selectedJob = jobs.find(j => j.id === val);
          return selectedJob && row.jobTitle === selectedJob.title;
        });
        if (!matches) return false;
      }
      if (colFilters.status && colFilters.status.length > 0) {
        const matches = colFilters.status.some(val => {
          if (val === 'empty') return !row.status || !row.status.trim();
          return row.status === val;
        });
        if (!matches) return false;
      }
      if (colFilters.assignedCrew && colFilters.assignedCrew.length > 0) {
        const matches = colFilters.assignedCrew.some(val => {
          if (val === 'empty') return !row.assignedCrew || row.assignedCrew.length === 0;
          return row.assignedCrew.includes(val);
        });
        if (!matches) return false;
      }

      return true;
    });
  }, [rows, searchQuery, colFilters, jobs]);

  const activeFiltersSummary = useMemo(() => {
    const list: string[] = [];
    if (searchQuery.trim()) {
      list.push(`search "${searchQuery}"`);
    }
    if (colFilters.jobId && colFilters.jobId.length > 0) {
      const names = colFilters.jobId.map(val => {
        if (val === 'empty') return 'Choose Empty';
        const selectedJob = jobs.find(j => j.id === val);
        return selectedJob ? selectedJob.title : val;
      });
      list.push(`job (${names.join(', ')})`);
    }
    if (colFilters.status && colFilters.status.length > 0) {
      list.push(`status (${colFilters.status.map(v => v === 'empty' ? 'Choose Empty' : v).join(', ')})`);
    }
    if (colFilters.assignedCrew && colFilters.assignedCrew.length > 0) {
      list.push(`crew (${colFilters.assignedCrew.map(v => v === 'empty' ? 'Choose Empty' : v).join(', ')})`);
    }
    return list.join('; ');
  }, [searchQuery, colFilters, jobs]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setColFilters({
      jobId: [],
      status: [],
      assignedCrew: []
    });
  };

  // Helpers
  const getCellValue = (row: any, colKey: string): string => {
    if (colKey === 'assignedCrew') {
      return (row.assignedCrew || []).join(', ');
    }
    if (colKey === 'completedAt') {
      if (!row.completedAt) return '';
      const d = row.completedAt.toDate ? row.completedAt.toDate() : new Date(row.completedAt);
      return isNaN(d.getTime()) ? '' : d.toLocaleString();
    }
    return String(row[colKey] ?? '');
  };

  const startEditing = (rowId: string, colKey: string, initialChar?: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    // Job fields are read-only
    if (['jobNumber', 'jobTitle', 'completedAt'].includes(colKey)) return;

    setEditingCell({ rowId, colKey });
    if (initialChar !== undefined) {
      setEditValue(initialChar);
    } else {
      setEditValue(getCellValue(row, colKey));
    }

    // Auto-focus input
    setTimeout(() => {
      if (cellInputRef.current) {
        cellInputRef.current.focus();
        if (cellInputRef.current instanceof HTMLInputElement && initialChar === undefined) {
          cellInputRef.current.select();
        }
      }
    }, 50);
  };

  const saveCellValue = async (rowId: string, colKey: string, newValue: string) => {
    if (!editingCell) return;
    const [jobId, taskId] = rowId.split('_');
    const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);

    setSyncStatus('saving');
    try {
      let parsedVal: any = newValue;
      if (colKey === 'bookHours') {
        parsedVal = newValue === '' ? 0 : parseFloat(newValue) || 0;
      } else if (colKey === 'assignedCrew') {
        parsedVal = newValue.split(',').map(s => s.trim()).filter(Boolean);
      }

      const updates: any = {
        [colKey]: parsedVal,
        updatedAt: serverTimestamp()
      };

      if (colKey === 'status') {
        if (newValue === 'completed') {
          updates.completedAt = new Date().toISOString();
        } else {
          updates.completedAt = null;
        }
      }

      await updateDoc(taskRef, updates);
      setSyncStatus('saved');
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to save task change');
    }
    setEditingCell(null);
  };

  const handleCellClick = (rowId: string, colKey: string) => {
    if (selectedCell?.rowId === rowId && selectedCell?.colKey === colKey) {
      startEditing(rowId, colKey);
    } else {
      setSelectedCell({ rowId, colKey });
      setEditingCell(null);
    }
  };

  const handleAddTask = async () => {
    if (!selectedJobIdForNewTask) {
      toast.error("Please select a job first");
      return;
    }
    setSyncStatus('saving');
    setShowAddModal(false);
    try {
      const data = {
        name: 'New Task',
        status: 'pending',
        bookHours: 0,
        assignedCrew: [],
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${selectedJobIdForNewTask}/tasks`), data);
      setSyncStatus('saved');
      toast.success('Task created successfully');

      // Highlight new task
      const rowId = `${selectedJobIdForNewTask}_${docRef.id}`;
      setSelectedCell({ rowId, colKey: 'name' });
      setTimeout(() => {
        setEditingCell({ rowId, colKey: 'name' });
        setEditValue('New Task');
      }, 500);
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to create task');
    }
  };

  const handleDeleteTask = async (row: any) => {
    if (confirm(`Are you sure you want to delete task "${row.name}" from job ${row.jobNumber || row.jobTitle}?`)) {
      setSyncStatus('saving');
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${row.jobId}/tasks`, row.taskId));
        setSyncStatus('saved');
        setSelectedCell(null);
        setEditingCell(null);
        toast.success('Task deleted');
      } catch (e) {
        setSyncStatus('error');
        toast.error('Failed to delete task');
      }
    }
  };

  // Keyboard navigation
  const handleKeyDownGrid = (e: React.KeyboardEvent) => {
    if (!selectedCell || editingCell) return;

    const { rowId, colKey } = selectedCell;
    const colIndex = COLUMNS.findIndex(c => c.key === colKey);
    const rowIndex = filteredRows.findIndex(r => r.id === rowId);

    if (rowIndex === -1 || colIndex === -1) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (rowIndex > 0) {
          setSelectedCell({ rowId: filteredRows[rowIndex - 1].id, colKey });
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (rowIndex < filteredRows.length - 1) {
          setSelectedCell({ rowId: filteredRows[rowIndex + 1].id, colKey });
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
            setSelectedCell({ rowId: filteredRows[rowIndex - 1].id, colKey: COLUMNS[COLUMNS.length - 1].key });
          }
        } else {
          if (colIndex < COLUMNS.length - 1) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex + 1].key });
          } else if (rowIndex < filteredRows.length - 1) {
            setSelectedCell({ rowId: filteredRows[rowIndex + 1].id, colKey: COLUMNS[0].key });
          }
        }
        break;
      case 'Enter':
        e.preventDefault();
        startEditing(rowId, colKey);
        break;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        saveCellValue(rowId, colKey, '');
        break;
    }
  };

  const handleKeyDownEditor = (e: React.KeyboardEvent) => {
    if (!editingCell) return;
    const { rowId, colKey } = editingCell;

    const colIndex = COLUMNS.findIndex(c => c.key === colKey);
    const rowIndex = filteredRows.findIndex(r => r.id === rowId);

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        saveCellValue(rowId, colKey, editValue);
        if (rowIndex < filteredRows.length - 1) {
          setSelectedCell({ rowId: filteredRows[rowIndex + 1].id, colKey });
        }
        break;
      case 'Tab':
        e.preventDefault();
        saveCellValue(rowId, colKey, editValue);
        if (e.shiftKey) {
          if (colIndex > 0) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex - 1].key });
          } else if (rowIndex > 0) {
            setSelectedCell({ rowId: filteredRows[rowIndex - 1].id, colKey: COLUMNS[COLUMNS.length - 1].key });
          }
        } else {
          if (colIndex < COLUMNS.length - 1) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex + 1].key });
          } else if (rowIndex < filteredRows.length - 1) {
            setSelectedCell({ rowId: filteredRows[rowIndex + 1].id, colKey: COLUMNS[0].key });
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setEditingCell(null);
        break;
    }
  };

  const renderHeaderFilter = (colKey: string, options: Array<{ value: string; label: string }>) => {
    const filterKey = colKey === 'jobTitle' ? 'jobId' : colKey;
    const selectedVals = colFilters[filterKey] || [];
    const isActive = selectedVals.length > 0;

    const handleToggle = (val: string) => {
      if (val === 'all') {
        setColFilters(prev => ({ ...prev, [filterKey]: [] }));
        return;
      }
      setColFilters(prev => {
        const current = prev[filterKey] || [];
        const next = current.includes(val)
          ? current.filter(v => v !== val)
          : [...current, val];
        return { ...prev, [filterKey]: next };
      });
    };

    const isChecked = (val: string) => {
      if (val === 'all') return selectedVals.length === 0;
      return selectedVals.includes(val);
    };

    return (
      <div className="inline-block ml-1 relative group no-print">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveHeaderFilterDropdown(activeHeaderFilterDropdown === colKey ? null : colKey);
          }}
          className={cn(
            "p-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer",
            isActive ? "text-indigo-400 bg-indigo-500/10" : "text-zinc-650"
          )}
          title={`Filter by ${colKey}`}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
        {activeHeaderFilterDropdown === colKey && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setActiveHeaderFilterDropdown(null)} 
            />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-zinc-900 border border-zinc-850 rounded-xl shadow-2xl p-1.5 z-50 min-w-[160px] max-h-60 overflow-y-auto no-scrollbar animate-in fade-in duration-150 text-left font-sans normal-case text-xs font-semibold text-zinc-300">
              <button
                onClick={() => handleToggle('all')}
                className="w-full px-2 py-1.5 text-left rounded-lg hover:bg-zinc-850 transition-colors flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={isChecked('all')}
                  readOnly
                  className="rounded border-zinc-700 bg-zinc-950 text-indigo-505 w-3.5 h-3.5"
                />
                <span>(Select All)</span>
              </button>

              <div className="h-[1px] bg-zinc-800 my-1" />

              {options.filter(o => o.value !== 'all').map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleToggle(opt.value)}
                  className="w-full px-2 py-1.5 text-left rounded-lg hover:bg-zinc-850 transition-colors flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={isChecked(opt.value)}
                    readOnly
                    className="rounded border-zinc-700 bg-zinc-950 text-indigo-505 w-3.5 h-3.5"
                  />
                  <span className="truncate max-w-[160px]">{opt.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const cellCoordinateString = useMemo(() => {
    if (!selectedCell) return '';
    const col = COLUMNS.find(c => c.key === selectedCell.colKey);
    const rowIndex = filteredRows.findIndex(r => r.id === selectedCell.rowId);
    if (!col || rowIndex === -1) return '';
    return `${col.letter}${rowIndex + 1}`;
  }, [selectedCell, filteredRows, COLUMNS]);

  const activeSelectedValue = useMemo(() => {
    if (!selectedCell) return '';
    const row = filteredRows.find(r => r.id === selectedCell.rowId);
    if (!row) return '';
    return getCellValue(row, selectedCell.colKey);
  }, [selectedCell, filteredRows]);

  return (
    <div 
      className={cn(
        "flex flex-col space-y-4 transition-all duration-200",
        isFullScreen 
          ? "fixed inset-0 z-50 bg-zinc-950 p-6 h-screen w-screen" 
          : "h-[calc(100vh-12rem)]"
      )}
    >
      {/* Upper Sheet Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/60 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 shadow-xl no-print">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl border border-indigo-500/20">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-md font-extrabold text-white leading-tight flex items-center gap-2">
              Tasks Sheet <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">v3</span>
            </h2>
            <p className="text-xs text-zinc-400">Excel-style grid to manage all tasks across active jobs.</p>
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
                <span className="text-emerald-500 font-bold">Cloud Synced</span>
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
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-750 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
            title="Add a new task to a job"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Task</span>
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

      {/* Formula Bar */}
      <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-850 px-3 py-2 rounded-xl text-xs no-print">
        <div className="bg-zinc-900 border border-zinc-800 text-indigo-400 px-3 py-1 font-mono rounded select-none w-14 text-center" title="Cell Coordinate">
          {cellCoordinateString || '--'}
        </div>
        <div className="text-zinc-600 font-bold font-mono px-1 select-none">fx</div>
        <input
          ref={formulaInputRef}
          type="text"
          value={activeSelectedValue}
          readOnly
          placeholder="Select a cell to view or edit value"
          className="flex-1 bg-transparent border-none text-zinc-200 outline-none placeholder-zinc-600 font-mono"
        />
        <div className="flex items-center gap-2 text-[11px] shrink-0 font-sans pl-3 border-l border-zinc-800 text-zinc-400 select-none">
          <span>
            Showing <strong>{filteredRows.length}</strong> of <strong>{rows.length}</strong> rows
          </span>
          {activeFiltersSummary && (
            <button 
              onClick={handleClearFilters}
              className="text-indigo-400 font-medium truncate max-w-[280px] hover:text-indigo-300 hover:underline cursor-pointer flex items-center gap-1 select-none border-none bg-transparent p-0" 
              title="Click to clear all filters and search"
            >
              &bull; Filtered by {activeFiltersSummary}
            </button>
          )}
        </div>
      </div>

      {/* Grid Container */}
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
            <col className="w-[100px]" /> {/* Job # */}
            <col className="w-[200px]" /> {/* Job Title */}
            <col className="w-[220px]" /> {/* Task Name */}
            <col className="w-[140px]" /> {/* Status */}
            <col className="w-[100px]" /> {/* Book Hours */}
            <col className="w-[240px]" /> {/* Assigned Crew */}
            <col className="w-[300px]" /> {/* Task Notes */}
            <col className="w-[180px]" /> {/* Completed At */}
            <col className="w-[160px]" /> {/* Completed By */}
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
              {COLUMNS.map(col => {
                let filterElement: React.ReactNode = null;
                if (col.key === 'jobTitle') {
                  filterElement = renderHeaderFilter('jobTitle', [
                    { value: 'all', label: 'All Jobs' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...jobs.map(j => ({ value: j.id, label: j.title || j.id }))
                  ]);
                } else if (col.key === 'status') {
                  filterElement = renderHeaderFilter('status', [
                    { value: 'all', label: 'All Statuses' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...uniqueStatuses.map(s => ({ value: s, label: s }))
                  ]);
                } else if (col.key === 'assignedCrew') {
                  filterElement = renderHeaderFilter('assignedCrew', [
                    { value: 'all', label: 'All Crew' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...uniqueCrew.map(c => ({ value: c, label: c }))
                  ]);
                }

                return (
                  <th key={col.key} className="border-r border-zinc-850 text-left px-3 text-[11px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-900/60 align-middle relative">
                    <div className="flex items-center justify-between gap-1">
                      <span>{col.label}</span>
                      {filterElement}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-900">
            {filteredRows.map((row, rIndex) => {
              return (
                <tr 
                  key={row.id} 
                  className="hover:bg-zinc-900/20 group bg-transparent text-zinc-200 transition-colors duration-100"
                >
                  <td className="bg-zinc-900/40 border-r border-zinc-800 h-9 relative text-center text-[10px] text-zinc-500 font-bold select-none cursor-default">
                    <span className="group-hover:hidden">{rIndex + 1}</span>
                    <button
                      onClick={() => handleDeleteTask(row)}
                      className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-rose-950/30 text-rose-500 hover:bg-rose-900 hover:text-white rounded transition-all w-full h-full"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>

                  {COLUMNS.map(col => {
                    const isSelected = selectedCell?.rowId === row.id && selectedCell?.colKey === col.key;
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key;
                    const cellVal = getCellValue(row, col.key);

                    let displayContent: React.ReactNode = cellVal;
                    let textClass = 'text-left';

                    if (col.key === 'status') {
                      textClass = 'text-center';
                      displayContent = (
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider",
                          row.status === 'completed' 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : row.status === 'in_progress' || row.status === 'in-progress' || row.status === 'In Progress'
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        )}>
                          {row.status}
                        </span>
                      );
                    }

                    if (col.key === 'assignedCrew') {
                      displayContent = row.assignedCrew.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.assignedCrew.map(c => (
                            <span key={c} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-zinc-600 italic">Unassigned</span>;
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
                            {col.key === 'status' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              >
                                {['pending', 'in_progress', 'completed', 'blocked'].map(st => (
                                  <option key={st} value={st} className="bg-zinc-900 text-white">{st}</option>
                                ))}
                              </select>
                            ) : col.key === 'assignedCrew' ? (
                              <div 
                                ref={cellInputRef as any}
                                tabIndex={0}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                className="w-full h-full bg-zinc-900 overflow-y-auto outline-none border-none custom-scrollbar p-1 z-30 font-sans"
                              >
                                <div className="p-1 flex flex-col gap-1">
                                  {staff.map(s => {
                                    const name = `${s.firstName} ${s.lastName}`;
                                    const checked = editValue.split(',').map(x => x.trim()).includes(name);
                                    return (
                                      <label key={s.id} className="flex items-center gap-2 text-zinc-300 text-[10px] font-sans cursor-pointer hover:bg-zinc-800 px-1 py-0.5 rounded">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            const prev = editValue ? editValue.split(',').map(x => x.trim()).filter(Boolean) : [];
                                            const next = prev.includes(name) 
                                              ? prev.filter(t => t !== name)
                                              : [...prev, name];
                                            setEditValue(next.join(', '));
                                          }}
                                          className="rounded border-zinc-700 bg-zinc-955 text-indigo-500 w-3 h-3"
                                        />
                                        <span>{name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
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

      {/* Add Task Modal Popup */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 text-left font-sans">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-500" />
                Add New Task
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Select the job to attach the new task to:</p>
            </div>

            <select
              value={selectedJobIdForNewTask}
              onChange={(e) => setSelectedJobIdForNewTask(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            >
              <option value="" className="bg-zinc-950 text-zinc-550">Choose a Job...</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id} className="bg-zinc-950 text-white">
                  Job {j.jobNumber ? `#${j.jobNumber}` : ''} &bull; {j.title}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-3 mt-2">
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedJobIdForNewTask('');
                }}
                className="px-4 py-2 border border-zinc-800 hover:bg-zinc-850 text-zinc-405 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddTask}
                disabled={!selectedJobIdForNewTask}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
