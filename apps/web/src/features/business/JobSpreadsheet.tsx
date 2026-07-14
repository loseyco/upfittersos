import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Trash2, Keyboard, Search, Loader2,
  Cloud, AlertCircle, ChevronDown,
  Printer, ExternalLink, Maximize2, Minimize2, Plus
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, serverTimestamp, getDocs, getDoc, query, where
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { LogoQRCode } from '../../components/LogoQRCode';
import { useAuthStore } from '../../lib/auth/store';

export interface Job {
  id: string;
  jobNumber?: string;
  title?: string;
  status?: string;
  priority?: string;
  customerId?: string;
  customerName?: string;
  vehicleId?: string;
  companyCamId?: string;
  scheduledStartDate?: any;
  scheduledEndDate?: any;
  scheduledArrivalTime?: any;
  expectedFinishTime?: any;
  readyForCustomerAt?: any;
  completedAt?: any;
  notes?: string;
  isArchived?: boolean;
  isPlaceholder?: boolean;
  travelerPrintedAt?: any;
  bayId?: string;
}

export function JobSpreadsheet({ tenantId }: { tenantId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadAllHistory, setLoadAllHistory] = useState(false);
  const showArchived = false;
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [printingJob, setPrintingJob] = useState<Job | null>(null);
  const [businessLogo, setBusinessLogo] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [activeHeaderFilterDropdown, setActiveHeaderFilterDropdown] = useState<string | null>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });
    return unsub;
  }, [tenantId]);

  const visibleJobIds = useMemo(() => {
    return jobs.map(j => j.id);
  }, [jobs]);

  useEffect(() => {
    if (!tenantId || visibleJobIds.length === 0) {
      setTasksMap({});
      return;
    }
    const unsubs = visibleJobIds.map(jobId => {
      const q = query(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
      return onSnapshot(q, (snap) => {
        const jobTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setTasksMap(prev => ({
          ...prev,
          [jobId]: jobTasks
        }));
      }, (err) => {
        console.warn(`Could not subscribe to tasks for job ${jobId}:`, err);
      });
    });
    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [tenantId, visibleJobIds]);
  useEffect(() => {
    if (!tenantId) return;
    const docRef = doc(db, 'businesses', tenantId);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const logo = data?.rawData?.logoUrl || data?.logoUrl || '';
        setBusinessLogo(logo);
        setBusinessName(data?.name || '');
      }
    });
  }, [tenantId]);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({
    status: [],
    priority: [],
    customerName: [],
    vehicleId: [],
    isArchived: [],
    cardPrinted: []
  });

  // Cell Selection / Editing State
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Refs
  const cellInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch customers
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

  // Fetch vehicles
  const { data: vehicles = [] } = useQuery<any[]>({
    queryKey: ['vehicles', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/vehicles`));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      list.sort((a, b) => (a.vin || '').localeCompare(b.vin || ''));
      return list;
    }
  });

  // Listen to jobs collection real-time
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);

    let q;
    if (loadAllHistory) {
      q = query(collection(db, `businesses/${tenantId}/jobs`));
    } else {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      q = query(
        collection(db, `businesses/${tenantId}/jobs`),
        where('createdAt', '>=', oneYearAgo)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Job[];

      // Client-side sort: newest Job Number
      docs.sort((a, b) => {
        const numA = parseInt(a.jobNumber || '0') || 0;
        const numB = parseInt(b.jobNumber || '0') || 0;
        return numB - numA;
      });

      setJobs(docs);
      setLoading(false);
    }, (err) => {
      console.error("Firestore jobs listen error: ", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, loadAllHistory]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.status) set.add(j.status);
    });
    return Array.from(set).sort();
  }, [jobs]);

  const uniquePriorities = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.priority) set.add(j.priority);
    });
    return Array.from(set).sort();
  }, [jobs]);

  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.customerName) set.add(j.customerName);
    });
    return Array.from(set).sort();
  }, [jobs]);

  const uniqueVehicles = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.vehicleId) set.add(j.vehicleId);
    });
    return Array.from(set).sort();
  }, [jobs]);

  // Define Columns
  const COLUMNS = useMemo(() => [
    { key: 'isArchived', label: 'Active', letter: 'A', type: 'checkbox' },
    { key: 'details', label: 'Details & Card', letter: 'B', type: 'custom' },
    { key: 'priority', label: 'Priority', letter: 'C', type: 'priority-select' },
    { key: 'status', label: 'Status', letter: 'D', type: 'status-select' },
    { key: 'jobNumber', label: 'Job #', letter: 'E', type: 'text' },
    { key: 'title', label: 'Job Title', letter: 'F', type: 'text' },
    { key: 'customerName', label: 'Customer', letter: 'G', type: 'customer-select' },
    { key: 'vehicleId', label: 'Vehicle VIN', letter: 'H', type: 'vehicle-select' },
    { key: 'location', label: 'Bay / Parking', letter: 'I', type: 'custom' },
    { key: 'progress', label: 'Task Progress', letter: 'J', type: 'custom' },
    { key: 'scheduledStartDate', label: 'Start Date', letter: 'K', type: 'datetime-local' },
    { key: 'scheduledEndDate', label: 'End Date', letter: 'L', type: 'datetime-local' },
    { key: 'scheduledArrivalTime', label: 'Arrival Time', letter: 'M', type: 'datetime-local' },
    { key: 'expectedFinishTime', label: 'Expected Finish', letter: 'N', type: 'datetime-local' },
    { key: 'readyForCustomerAt', label: 'Ready for Cust At', letter: 'O', type: 'datetime-local' },
    { key: 'completedAt', label: 'Completed At', letter: 'P', type: 'datetime-local' },
    { key: 'companyCamId', label: 'Company Cam ID', letter: 'Q', type: 'text' },
    { key: 'notes', label: 'Notes', letter: 'R', type: 'text' }
  ], []);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(member => {
      if (member.isArchived && !showArchived) return false;

      // Search Query filter
      if (searchQuery.trim()) {
        const queryStr = searchQuery.toLowerCase();
        const fields = [
          member.jobNumber,
          member.title,
          member.status,
          member.priority,
          member.customerName,
          member.vehicleId,
          member.notes
        ].map(f => String(f || '').toLowerCase());
        if (!fields.some(f => f.includes(queryStr))) return false;
      }

      // Column Filters
      if (colFilters.status && colFilters.status.length > 0) {
        const matches = colFilters.status.some(val => {
          if (val === 'empty') return !member.status || !member.status.trim();
          return member.status === val;
        });
        if (!matches) return false;
      }
      if (colFilters.priority && colFilters.priority.length > 0) {
        const matches = colFilters.priority.some(val => {
          if (val === 'empty') return !member.priority || !member.priority.trim();
          return member.priority === val;
        });
        if (!matches) return false;
      }
      if (colFilters.customerName && colFilters.customerName.length > 0) {
        const matches = colFilters.customerName.some(val => {
          if (val === 'empty') return !member.customerName || !member.customerName.trim();
          return member.customerName === val;
        });
        if (!matches) return false;
      }
      if (colFilters.vehicleId && colFilters.vehicleId.length > 0) {
        const matches = colFilters.vehicleId.some(val => {
          if (val === 'empty') return !member.vehicleId || !member.vehicleId.trim();
          return member.vehicleId === val;
        });
        if (!matches) return false;
      }
      if (colFilters.isArchived && colFilters.isArchived.length > 0) {
        const isActive = !member.isArchived;
        const matches = colFilters.isArchived.some(val => {
          if (val === 'active') return isActive;
          if (val === 'inactive') return !isActive;
          return true;
        });
        if (!matches) return false;
      }
      if (colFilters.cardPrinted && colFilters.cardPrinted.length > 0) {
        const hasJobCard = !!member.travelerPrintedAt;
        const matches = colFilters.cardPrinted.some(val => {
          if (val === 'printed') return hasJobCard;
          if (val === 'not_printed') return !hasJobCard;
          return true;
        });
        if (!matches) return false;
      }

      return true;
    });
  }, [jobs, searchQuery, showArchived, colFilters]);

  const activeFiltersSummary = useMemo(() => {
    const list: string[] = [];
    if (searchQuery.trim()) {
      list.push(`search "${searchQuery}"`);
    }
    if (colFilters.status && colFilters.status.length > 0) {
      list.push(`status (${colFilters.status.map(v => v === 'empty' ? 'Choose Empty' : v).join(', ')})`);
    }
    if (colFilters.priority && colFilters.priority.length > 0) {
      list.push(`priority (${colFilters.priority.map(v => v === 'empty' ? 'Choose Empty' : v).join(', ')})`);
    }
    if (colFilters.customerName && colFilters.customerName.length > 0) {
      list.push(`customer (${colFilters.customerName.map(v => v === 'empty' ? 'Choose Empty' : v).join(', ')})`);
    }
    if (colFilters.vehicleId && colFilters.vehicleId.length > 0) {
      list.push(`vehicle (${colFilters.vehicleId.map(v => v === 'empty' ? 'Choose Empty' : v).join(', ')})`);
    }
    if (colFilters.isArchived && colFilters.isArchived.length > 0) {
      list.push(`active (${colFilters.isArchived.join(', ')})`);
    }
    if (colFilters.cardPrinted && colFilters.cardPrinted.length > 0) {
      list.push(`card (${colFilters.cardPrinted.map(v => v === 'printed' ? 'Printed' : 'No Card').join(', ')})`);
    }
    return list.join('; ');
  }, [searchQuery, colFilters]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setColFilters({
      status: [],
      priority: [],
      customerName: [],
      vehicleId: [],
      isArchived: [],
      cardPrinted: []
    });
  };

  // Append a placeholder row at the bottom
  const rows = useMemo(() => {
    const list = [...filteredJobs];
    list.push({
      id: 'placeholder-row',
      jobNumber: '',
      title: '',
      status: 'Open',
      priority: '3 - Medium',
      customerId: '',
      customerName: '',
      vehicleId: '',
      companyCamId: '',
      scheduledStartDate: null,
      scheduledEndDate: null,
      scheduledArrivalTime: null,
      expectedFinishTime: null,
      readyForCustomerAt: null,
      completedAt: null,
      notes: '',
      isPlaceholder: true,
      isArchived: false
    });
    return list;
  }, [filteredJobs]);

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

  const getCellValue = (row: Job, colKey: string): string => {
    if (colKey === 'location') {
      const activeZone = zones.find(z => z.currentJobId === row.id);
      return activeZone ? activeZone.id : 'none';
    }
    if (colKey === 'isArchived') {
      return row.isArchived ? 'true' : 'false';
    }
    const isTimestampField = [
      'scheduledStartDate', 'scheduledEndDate', 'scheduledArrivalTime', 
      'expectedFinishTime', 'readyForCustomerAt', 'completedAt'
    ].includes(colKey);

    if (isTimestampField) {
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
      const user = useAuthStore.getState().user;
      const data: any = {
        jobNumber: '',
        title: 'Untitled Job',
        status: 'Open',
        priority: '3 - Medium',
        customerId: '',
        customerName: '',
        vehicleId: '',
        companyCamId: '',
        scheduledStartDate: null,
        scheduledEndDate: null,
        scheduledArrivalTime: null,
        expectedFinishTime: null,
        readyForCustomerAt: null,
        completedAt: null,
        notes: '',
        isArchived: false,
        source: 'Native',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email?.split('@')[0] || null,
        createdByEmail: user?.email || null,
        tags: ['Native']
      };

      const isTimestampField = [
        'scheduledStartDate', 'scheduledEndDate', 'scheduledArrivalTime', 
        'expectedFinishTime', 'readyForCustomerAt', 'completedAt'
      ].includes(colKey);

      if (colKey === 'isArchived') {
        data.isArchived = (initialVal === 'true');
      } else if (isTimestampField) {
        data[colKey] = initialVal ? new Date(initialVal) : null;
      } else {
        data[colKey] = initialVal;
      }

      if (colKey === 'title' && initialVal.trim()) {
        data.title = initialVal.trim();
      } else if (colKey === 'jobNumber' && initialVal.trim()) {
        data.jobNumber = initialVal.trim();
        data.title = `Job #${initialVal.trim()}`;
      }

      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs`), data);
      setSyncStatus('saved');
      return docRef.id;
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to create new job');
      throw e;
    }
  };

  // Helper: Save cell changes to Firestore
  const saveCellValue = async (rowId: string, colKey: string, newValue: string) => {
    let finalRowId = rowId;
    
    if (rowId === 'placeholder-row') {
      if (!newValue.trim() && colKey !== 'isArchived' && colKey !== 'status' && colKey !== 'priority' && colKey !== 'customerName' && colKey !== 'vehicleId') {
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
      const isTimestampField = [
        'scheduledStartDate', 'scheduledEndDate', 'scheduledArrivalTime', 
        'expectedFinishTime', 'readyForCustomerAt', 'completedAt'
      ].includes(colKey);

      if (colKey === 'isArchived') {
        updates[colKey] = (newValue === 'true');
      } else if (isTimestampField) {
        updates[colKey] = newValue ? new Date(newValue) : null;
      } else {
        updates[colKey] = newValue;
      }

      // If customerName is updated, resolve the customerId
      if (colKey === 'customerName') {
        const found = customers.find(c => {
          const name = c.name || c.displayName || c.CompanyName || c.FullName || c.id;
          return name === newValue;
        });
        updates.customerId = found ? found.id : '';
      }

      // Handle specific status time tracking dates
      if (colKey === 'status') {
        if (newValue === 'Ready for Customer') {
          updates.readyForCustomerAt = new Date().toISOString();
        } else if (['Completed', 'Closed'].includes(newValue)) {
          updates.completedAt = new Date().toISOString();
        } else if (['Active', 'Open', 'Ready for QC'].includes(newValue)) {
          updates.readyForCustomerAt = null;
          updates.completedAt = null;
        }
      }

      updates.updatedAt = serverTimestamp();

      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, finalRowId), updates);
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
            setSelectedCell({ rowId: rows[0].id, colKey: COLUMNS[0].key });
          }
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (colKey === 'isArchived') {
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

  // Auto-scroll selected cell into view if it goes out of bounds
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

  const handleTriggerPrint = async (job: Job) => {
    setPrintingJob(job);
    setTimeout(() => {
      window.print();
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, job.id);
      updateDoc(jobRef, {
        travelerPrintedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      }).catch(err => console.warn("Failed to update travelerPrintedAt:", err));
    }, 500);
  };

  const saveLocationValue = async (jobId: string, vehicleVin: string, newZoneId: string) => {
    setSyncStatus('saving');
    try {
      // 1. Clear old linked zone for this job
      const oldZone = zones.find(z => z.currentJobId === jobId);
      if (oldZone) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, oldZone.id), {
          currentJobId: '',
          currentVehicleVin: '',
          assignedAt: null
        });
      }
      // 2. Assign new linked zone
      if (newZoneId && newZoneId !== 'none') {
        const targetZone = zones.find(z => z.id === newZoneId);
        if (targetZone) {
          await updateDoc(doc(db, `businesses/${tenantId}/zones`, targetZone.id), {
            currentJobId: jobId,
            currentVehicleVin: vehicleVin || '',
            assignedAt: new Date().toISOString()
          });
        }
      }
      setSyncStatus('saved');
      toast.success('Location updated');
    } catch (err) {
      console.error("Failed to update location:", err);
      setSyncStatus('error');
      toast.error("Failed to update location");
    }
  };

  const handleAddJob = () => {
    window.location.href = `/business/${tenantId}/job/create`;
  };

  const handleDeleteRow = async (member: Job) => {
    if (member.isPlaceholder) return;
    
    if (confirm(`Are you sure you want to delete job ${member.jobNumber || member.title || 'this job'}?`)) {
      setSyncStatus('saving');
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/jobs`, member.id));
        setSyncStatus('saved');
        setSelectedCell(null);
        setEditingCell(null);
        toast.success('Job deleted');
      } catch (e) {
        setSyncStatus('error');
        toast.error('Failed to delete job');
      }
    }
  };

  const renderHeaderFilter = (colKey: string, options: Array<{ value: string; label: string }>) => {
    const selectedVals = colFilters[colKey] || [];
    const isActive = selectedVals.length > 0;

    const handleToggle = (val: string) => {
      if (val === 'all') {
        setColFilters(prev => ({ ...prev, [colKey]: [] }));
        return;
      }
      setColFilters(prev => {
        const current = prev[colKey] || [];
        const next = current.includes(val)
          ? current.filter(v => v !== val)
          : [...current, val];
        return { ...prev, [colKey]: next };
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
            "p-0.5 hover:bg-zinc-800 rounded-md transition-colors cursor-pointer inline-flex items-center align-middle",
            isActive ? "text-indigo-400 font-bold" : "text-zinc-500 hover:text-zinc-400"
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
    const rowIndex = rows.findIndex(r => r.id === selectedCell.rowId);
    if (!col || rowIndex === -1) return '';
    return `${col.letter}${rowIndex + 1}`;
  }, [selectedCell, rows, COLUMNS]);

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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/60 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl border border-indigo-500/20">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-md font-extrabold text-white leading-tight flex items-center gap-2">
              Jobs Sheet <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">v3</span>
            </h2>
            <p className="text-xs text-zinc-400">Excel-style grid for rapid jobs scheduling and tracking.</p>
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
            onClick={handleAddJob}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-750 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
            title="Create a new job record"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Job</span>
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

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
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
              <button
                onClick={() => setLoadAllHistory(!loadAllHistory)}
                className={cn(
                  "px-3 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0",
                  loadAllHistory 
                    ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
                )}
                title={loadAllHistory ? "Showing all historical jobs" : "Showing jobs from the last 365 days only"}
              >
                {loadAllHistory ? "All History" : "Last 365 Days"}
              </button>
            </div>
            {searchQuery.trim() && !loadAllHistory && (
              <div className="text-[10px] text-zinc-500 animate-pulse mt-1 px-1">
                Searching recent jobs only. Click "Last 365 Days" to search all history.
              </div>
            )}
          </div>
        </div>
      </div>



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
        <div className="flex items-center gap-2 text-[11px] shrink-0 font-sans pl-3 border-l border-zinc-800 text-zinc-400 select-none">
          <span>
            Showing <strong>{filteredJobs.length}</strong> of <strong>{jobs.length}</strong> rows
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
            <col className="w-[160px]" /> {/* Details & Card */}
            <col className="w-[140px]" /> {/* Priority */}
            <col className="w-[140px]" /> {/* Status */}
            <col className="w-[100px]" /> {/* Job # */}
            <col className="w-[220px]" /> {/* Job Title */}
            <col className="w-[180px]" /> {/* Customer */}
            <col className="w-[180px]" /> {/* Vehicle VIN */}
            <col className="w-[150px]" /> {/* Bay / Parking */}
            <col className="w-[140px]" /> {/* Task Progress */}
            <col className="w-[180px]" /> {/* Start Date */}
            <col className="w-[180px]" /> {/* End Date */}
            <col className="w-[180px]" /> {/* Arrival Time */}
            <col className="w-[180px]" /> {/* Expected Finish */}
            <col className="w-[180px]" /> {/* Ready for Cust At */}
            <col className="w-[180px]" /> {/* Completed At */}
            <col className="w-[140px]" /> {/* Company Cam ID */}
            <col className="w-[280px]" /> {/* Notes */}
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
              {COLUMNS.map(col => {
                let filterElement: React.ReactNode = null;
                if (col.key === 'isArchived') {
                  filterElement = renderHeaderFilter('isArchived', [
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active Only' },
                    { value: 'inactive', label: 'Archived Only' }
                  ]);
                } else if (col.key === 'status') {
                  filterElement = renderHeaderFilter('status', [
                    { value: 'all', label: 'All Statuses' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...uniqueStatuses.map(s => ({ value: s, label: s }))
                  ]);
                } else if (col.key === 'priority') {
                  filterElement = renderHeaderFilter('priority', [
                    { value: 'all', label: 'All Priorities' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...uniquePriorities.map(p => ({ value: p, label: p }))
                  ]);
                } else if (col.key === 'customerName') {
                  filterElement = renderHeaderFilter('customerName', [
                    { value: 'all', label: 'All Customers' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...uniqueCustomers.map(c => ({ value: c, label: c }))
                  ]);
                } else if (col.key === 'vehicleId') {
                  filterElement = renderHeaderFilter('vehicleId', [
                    { value: 'all', label: 'All Vehicles' },
                    { value: 'empty', label: '(Choose Empty)' },
                    ...uniqueVehicles.map(v => ({ value: v, label: v }))
                  ]);
                } else if (col.key === 'details') {
                  filterElement = renderHeaderFilter('cardPrinted', [
                    { value: 'all', label: 'All Card Statuses' },
                    { value: 'printed', label: 'Printed Only' },
                    { value: 'not_printed', label: 'Not Printed Only' }
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
                          title="Delete job"
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
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key && col.type !== 'checkbox' && col.key !== 'progress';
                    const cellVal = getCellValue(row, col.key);

                    let displayContent: React.ReactNode = cellVal;
                    let textClass = 'text-left';

                    if (col.type === 'checkbox') {
                      textClass = 'text-center';
                      const isChecked = cellVal === 'false'; // Checked if active (not archived)

                      displayContent = (
                        <div className="flex items-center justify-center w-full h-full">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isPlaceholder}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              setSelectedCell({ rowId: row.id, colKey: col.key });
                              saveCellValue(row.id, col.key, e.target.checked ? 'false' : 'true');
                            }}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-650 focus:ring-0 outline-none cursor-pointer"
                          />
                        </div>
                      );
                    }

                    if (col.key === 'details') {
                      if (isPlaceholder) {
                        return (
                          <td 
                            key={col.key} 
                            data-row-id={row.id}
                            data-col-key={col.key}
                            className="border-r border-zinc-850 px-3 py-1.5 h-9 relative outline-none text-center text-zinc-700 italic select-none"
                          >
                            --
                          </td>
                        );
                      }
                      const hasJobCard = !!row.travelerPrintedAt;
                      return (
                        <td
                          key={col.key}
                          data-row-id={row.id}
                          data-col-key={col.key}
                          className="border-r border-zinc-850 px-3 py-1 text-center align-middle font-sans font-bold"
                        >
                          <div className="flex items-center justify-center gap-2.5 w-full h-full select-none">
                            {/* Link to Job Details */}
                            <a
                              href={`/business/${tenantId}/job/${row.id}`}
                              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 text-[10px]"
                              title="Go to Job Details"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>

                            {/* Job Card status button */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrintingJob(row);
                              }}
                              className={cn(
                                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border leading-none font-black uppercase tracking-wider shrink-0 cursor-pointer transition-all hover:scale-105 active:scale-95",
                                hasJobCard 
                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25"
                                  : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25"
                              )}
                              title={hasJobCard ? `Job Card printed at: ${row.travelerPrintedAt.toDate ? row.travelerPrintedAt.toDate().toLocaleString() : new Date(row.travelerPrintedAt).toLocaleString()}. Click to reprint.` : "Job Card not printed yet. Click to print card."}
                            >
                              <Printer className="w-2.5 h-2.5" />
                              <span>{hasJobCard ? "Printed" : "No Card"}</span>
                            </button>
                          </div>
                        </td>
                      );
                    }

                    if (col.key === 'location') {
                      if (isPlaceholder) {
                        displayContent = <span className="text-zinc-700 italic">--</span>;
                      } else {
                        const activeZone = zones.find(z => z.currentJobId === row.id);
                        displayContent = activeZone ? activeZone.name : (row.bayId || <span className="text-zinc-550 italic">None</span>);
                      }
                    }

                    if (col.key === 'progress') {
                      if (isPlaceholder) {
                        displayContent = <span className="text-zinc-700 italic">--</span>;
                      } else {
                        const jobTasks = tasksMap[row.id] || [];
                        const total = jobTasks.length;
                        const completed = jobTasks.filter(t => t.status === 'completed').length;
                        if (total === 0) {
                          displayContent = <span className="text-zinc-550 italic">No Tasks</span>;
                        } else {
                          const pct = Math.round((completed / total) * 100);
                          const allDone = completed === total;
                          displayContent = (
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold border font-sans",
                                allDone 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                  : "bg-zinc-800 text-zinc-300 border-zinc-700"
                              )}>
                                {completed}/{total} ({pct}%)
                              </span>
                            </div>
                          );
                        }
                      }
                    }

                    if (col.type === 'datetime-local') {
                      displayContent = displayFirestoreTimestamp((row as any)[col.key]);
                    }

                    if (isPlaceholder && !isEditing && cellVal === '' && col.key !== 'status' && col.key !== 'priority') {
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
                            {col.key === 'location' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => {
                                  saveLocationValue(row.id, row.vehicleId || '', editValue);
                                  setEditingCell(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    saveLocationValue(row.id, row.vehicleId || '', editValue);
                                    setEditingCell(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                  }
                                }}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              >
                                <option value="none" className="bg-zinc-900 text-zinc-400">None</option>
                                {zones.filter(z => !z.isArchived).map(z => (
                                  <option key={z.id} value={z.id} className="bg-zinc-900 text-white">
                                    {z.name}
                                  </option>
                                ))}
                              </select>
                            ) : col.type === 'customer-select' ? (
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
                            ) : col.type === 'vehicle-select' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              >
                                <option value="" className="bg-zinc-900 text-zinc-400">None</option>
                                {vehicles.map(v => (
                                  <option key={v.id} value={v.vin || v.id} className="bg-zinc-900 text-white">
                                    {v.vin ? `${v.vin} (${v.year || ''} ${v.make || ''} ${v.model || ''})` : v.id}
                                  </option>
                                ))}
                              </select>
                            ) : col.type === 'status-select' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              >
                                {['Open', 'In Progress', 'Ready for QC', 'Ready for Customer', 'Completed', 'Closed'].map(st => (
                                  <option key={st} value={st} className="bg-zinc-900 text-white">{st}</option>
                                ))}
                              </select>
                            ) : col.type === 'priority-select' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none"
                              >
                                {['1 - Critical', '2 - High', '3 - Medium', '4 - Low'].map(pr => (
                                  <option key={pr} value={pr} className="bg-zinc-900 text-white">{pr}</option>
                                ))}
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

      {/* Injectable Media Print Stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 0.4in;
          }
          body > *:not(.traveler-print-wrapper) {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .traveler-print-wrapper {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      ` }} />

      {/* Preparing Job Card Preview Modal */}
      {printingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 font-sans">
                <Printer className="w-4 h-4 text-indigo-500" />
                Preparing Job Card
              </h3>
              <button 
                onClick={() => setPrintingJob(null)}
                className="text-xs font-bold text-zinc-500 hover:text-zinc-405 font-sans cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>
            
            <p className="text-xs text-zinc-400 font-sans">
              Sending Job Card to printer. If the print dialog does not open automatically, click the print button below.
            </p>

            {/* Preview container (visible on screen) */}
            <div className="border border-zinc-805 rounded-2xl p-6 bg-zinc-950 max-h-[55vh] overflow-y-auto flex flex-col items-center custom-scrollbar w-full">
              <div 
                id="single-job-card-preview"
                className="bg-white text-zinc-900 p-8 font-sans w-full max-w-[480px] min-h-[620px] flex flex-col justify-between rounded-xl shadow-md my-2"
              >
                {/* Job Card Content */}
                <div className="border-b-2 border-indigo-900 pb-3 flex justify-between items-start text-left">
                  <div>
                    <span className="text-[8px] font-black tracking-widest text-indigo-650 uppercase bg-indigo-50 px-2 py-0.5 rounded">Job Card</span>
                    <h1 className="text-xl font-black text-indigo-950 mt-1 tracking-tight">JOB #{printingJob.jobNumber || 'N/A'}</h1>
                    {printingJob.title && printingJob.title !== printingJob.jobNumber && (
                      <p className="text-xs font-bold text-zinc-700 mt-0.5">{printingJob.title}</p>
                    )}
                    <p className="text-xs font-extrabold text-indigo-900 mt-1.5 uppercase tracking-wide">Customer: {printingJob.customerName || 'No Customer Assigned'}</p>
                    <p className="text-xs font-extrabold text-zinc-800 mt-1 uppercase tracking-wide">Vehicle: {(() => {
                      const vehicle = printingJob.vehicleId ? vehicles.find(v => v.vin === printingJob.vehicleId || v.id === printingJob.vehicleId) : null;
                      return vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'No Vehicle Assigned';
                    })()}</p>
                    {printingJob.vehicleId && (
                      <p className="text-[11px] font-mono text-zinc-550 mt-0.5 font-bold">VIN: {printingJob.vehicleId}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center my-4 w-full">
                  <div className="p-2 bg-white border border-zinc-200 rounded-xl shadow-sm scale-90">
                    <LogoQRCode 
                      value={`${window.location.origin}/business/${tenantId}/job/${printingJob.id}`}
                      size={150}
                      logoUrl={businessLogo}
                      businessName={businessName}
                      type="general"
                    />
                  </div>
                  <p className="text-[8px] font-black text-zinc-405 uppercase tracking-widest mt-2">Scan QR to open job details</p>
                </div>

                {/* Bottom Section: CompanyCam Photos (Small Scan Card) */}
                {(printingJob.companyCamId || (printingJob as any).companyCamProjectId) && (
                  <div className="border-t border-zinc-200 pt-3 flex items-center gap-3">
                    <div className="p-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm">
                      <LogoQRCode 
                        value={`https://app.companycam.com/projects/${printingJob.companyCamId || (printingJob as any).companyCamProjectId}`}
                        size={55}
                        logoUrl="/companycam-icon.png"
                        businessName="CompanyCam"
                        type="general"
                      />
                    </div>
                    <div className="text-left">
                      <span className="text-[8px] font-black tracking-widest text-indigo-650 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">CompanyCam Photos</span>
                      <p className="text-[9px] font-bold text-zinc-800 mt-1">Scan QR to view photos</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-2 font-sans">
              <button 
                onClick={() => setPrintingJob(null)}
                className="px-4 py-2 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleTriggerPrint(printingJob)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal to document.body for clean, root-level @media print visibility */}
      {printingJob && createPortal(
        <div className="traveler-print-wrapper" style={{ display: 'none' }}>
          <div 
            className="bg-white text-zinc-900 p-12 font-sans mx-auto max-w-[800px] h-[10.2in] flex flex-col justify-between"
          >
            {/* Top border decor */}
            <div className="border-b-4 border-indigo-900 pb-6 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black tracking-widest text-indigo-650 uppercase bg-indigo-50 px-2.5 py-1 rounded-md">Job Card</span>
                <h1 className="text-3xl sm:text-4xl font-black text-indigo-950 mt-3 tracking-tight">JOB #{printingJob.jobNumber || 'N/A'}</h1>
                {printingJob.title && printingJob.title !== printingJob.jobNumber && (
                  <p className="text-base sm:text-lg font-bold text-zinc-700 mt-1">{printingJob.title}</p>
                )}
                <p className="text-sm sm:text-base font-extrabold text-indigo-900 mt-2 uppercase tracking-wide">Customer: {printingJob.customerName || 'No Customer Assigned'}</p>
                <p className="text-sm sm:text-base font-extrabold text-zinc-800 mt-1 uppercase tracking-wide">Vehicle: {(() => {
                  const vehicle = printingJob.vehicleId ? vehicles.find(v => v.vin === printingJob.vehicleId || v.id === printingJob.vehicleId) : null;
                  return vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'No Vehicle Assigned';
                })()}</p>
                {printingJob.vehicleId && (
                  <p className="text-sm text-zinc-550 font-mono mt-0.5 font-bold">VIN: {printingJob.vehicleId}</p>
                )}
              </div>
            </div>

            {/* Middle Section: Big QR Code */}
            <div className="flex flex-col items-center justify-center my-auto py-8">
              <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                <LogoQRCode 
                  value={`${window.location.origin}/business/${tenantId}/job/${printingJob.id}`}
                  size={220}
                  logoUrl={businessLogo}
                  businessName={businessName}
                  type="general"
                />
              </div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-4">Scan QR to open job details instantly</p>
            </div>

            {/* Bottom Section: CompanyCam Photos (Small Scan Card) */}
            {(printingJob.companyCamId || (printingJob as any).companyCamProjectId) ? (
              <div className="border border-zinc-200 rounded-2xl p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white border border-zinc-200 rounded-xl shadow-sm">
                    <LogoQRCode 
                      value={`https://app.companycam.com/projects/${printingJob.companyCamId || (printingJob as any).companyCamProjectId}`}
                      size={80}
                      logoUrl="/companycam-icon.png"
                      businessName="CompanyCam"
                      type="general"
                    />
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-black tracking-widest text-indigo-650 uppercase bg-indigo-50 px-2.5 py-1 rounded-md">CompanyCam Photos</span>
                    <p className="text-xs font-bold text-zinc-800 mt-2">Scan QR code to view project photos instantly on CompanyCam.</p>
                  </div>
                </div>
              </div>
            ) : <div />}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
