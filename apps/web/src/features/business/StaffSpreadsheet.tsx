import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Trash2, Keyboard, Search, Loader2,
  Cloud, AlertCircle
} from 'lucide-react';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId?: string;
  jobTitle?: string;
  role?: string;
  payRate?: number;
  payType?: 'hourly' | 'salary' | 'flat_rate' | 'inherit';
  isArchived?: boolean;
  techNumber?: string;
  isPlaceholder?: boolean;
  reportsToId?: string;
  backupStaffId?: string;
  purchasingAuthority?: string;
  payPeriodBookTimeCredit?: number;
  hireDate?: string;
  fireDate?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  dob?: string;
  shirtSize?: string;
  hatSize?: string;
  pantsSize?: string;
  shoeSize?: string;
  gloveSize?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
  notes?: string;
  keycard?: string;
  companyCam?: string;
  cobraKey?: string;
  radioNumber?: string;
  wexCard?: string;
  saePex?: string;
  warpGuysPex?: string;
  fastPex?: string;
  amerExp?: string;
  citiSilver?: string;
  citiBlack?: string;
  blueAmEx?: string;
  citiAaMc?: string;
  amazonAmex?: string;
}

export interface Department {
  id: string;
  name: string;
}

export function StaffSpreadsheet({ tenantId }: { tenantId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Cell Selection / Editing State
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Refs for focusing inputs
  const cellInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch departments for dropdown
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments', tenantId],
    queryFn: async () => {
      const snap = await onSnapshotQueryDepartments(tenantId);
      return snap;
    }
  });

  // Listen to staff collection real-time
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/staff`);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StaffMember[];

      // Client-side sort: Alphabetically by last name, then first name
      docs.sort((a, b) => {
        const lastNameA = (a.lastName || '').toLowerCase();
        const lastNameB = (b.lastName || '').toLowerCase();
        if (lastNameA !== lastNameB) {
          return lastNameA.localeCompare(lastNameB);
        }
        const firstNameA = (a.firstName || '').toLowerCase();
        const firstNameB = (b.firstName || '').toLowerCase();
        return firstNameA.localeCompare(firstNameB);
      });

      setStaff(docs);
      setLoading(false);
    }, (err) => {
      console.error("Firestore listen error: ", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  // Define Columns
  const COLUMNS = useMemo(() => [
    { key: 'isArchived', label: 'Active', letter: 'A', type: 'checkbox' },
    { key: 'firstName', label: 'First Name', letter: 'B', type: 'text' },
    { key: 'lastName', label: 'Last Name', letter: 'C', type: 'text' },
    { key: 'techNumber', label: 'Tech #', letter: 'D', type: 'text' },
    { key: 'jobTitle', label: 'Job Title', letter: 'E', type: 'text' },
    { key: 'role', label: 'Internal Role', letter: 'F', type: 'text' },
    { key: 'email', label: 'Email', letter: 'G', type: 'text' },
    { key: 'phone', label: 'Phone', letter: 'H', type: 'text' },
    { key: 'departmentId', label: 'Department', letter: 'I', type: 'select' },
    { key: 'payType', label: 'Pay Type', letter: 'J', type: 'select' },
    { key: 'payRate', label: 'Pay Rate', letter: 'K', type: 'number' },
    { key: 'reportsToId', label: 'Reports To', letter: 'L', type: 'staff-select' },
    { key: 'backupStaffId', label: 'Backup Contact', letter: 'M', type: 'staff-select' },
    { key: 'purchasingAuthority', label: 'Purchasing Auth', letter: 'N', type: 'text' },
    { key: 'payPeriodBookTimeCredit', label: 'Book Credit', letter: 'O', type: 'number' },
    { key: 'hireDate', label: 'Hire Date', letter: 'P', type: 'text' },
    { key: 'fireDate', label: 'Term Date', letter: 'Q', type: 'text' },
    { key: 'addressStreet', label: 'Street Address', letter: 'R', type: 'text' },
    { key: 'addressCity', label: 'City', letter: 'S', type: 'text' },
    { key: 'addressState', label: 'State', letter: 'T', type: 'text' },
    { key: 'addressZip', label: 'Zip Code', letter: 'U', type: 'text' },
    { key: 'dob', label: 'DOB', letter: 'V', type: 'text' },
    { key: 'shirtSize', label: 'Shirt Size', letter: 'W', type: 'text' },
    { key: 'hatSize', label: 'Hat Size', letter: 'X', type: 'text' },
    { key: 'pantsSize', label: 'Pants Size', letter: 'Y', type: 'text' },
    { key: 'shoeSize', label: 'Shoe Size', letter: 'Z', type: 'text' },
    { key: 'gloveSize', label: 'Glove Size', letter: 'AA', type: 'text' },
    { key: 'emergencyName', label: 'Emerg. Contact', letter: 'AB', type: 'text' },
    { key: 'emergencyPhone', label: 'Emerg. Phone', letter: 'AC', type: 'text' },
    { key: 'emergencyRelation', label: 'Emerg. Relation', letter: 'AD', type: 'text' },
    { key: 'keycard', label: 'Keycard', letter: 'AE', type: 'text' },
    { key: 'companyCam', label: 'Company Cam', letter: 'AF', type: 'text' },
    { key: 'cobraKey', label: 'Cobra Key', letter: 'AG', type: 'text' },
    { key: 'radioNumber', label: 'Radio #', letter: 'AH', type: 'text' },
    { key: 'wexCard', label: 'Wex Card', letter: 'AI', type: 'text' },
    { key: 'saePex', label: 'SAE Pex', letter: 'AJ', type: 'text' },
    { key: 'warpGuysPex', label: 'Warp Guys Pex', letter: 'AK', type: 'text' },
    { key: 'fastPex', label: 'Fast Pex', letter: 'AL', type: 'text' },
    { key: 'amerExp', label: 'Amer Exp', letter: 'AM', type: 'text' },
    { key: 'citiSilver', label: 'Citi Silver', letter: 'AN', type: 'text' },
    { key: 'citiBlack', label: 'Citi Black', letter: 'AO', type: 'text' },
    { key: 'blueAmEx', label: 'Blue AmEx', letter: 'AP', type: 'text' },
    { key: 'citiAaMc', label: 'Citi AA MC', letter: 'AQ', type: 'text' },
    { key: 'amazonAmex', label: 'Amazon Amex', letter: 'AR', type: 'text' },
    { key: 'notes', label: 'Notes', letter: 'AS', type: 'text' }
  ], []);

  // Filter staff based on search and archive status
  const filteredStaff = useMemo(() => {
    return staff.filter(member => {
      // Hide archived if showArchived is false
      if (member.isArchived && !showArchived) return false;

      if (!searchQuery.trim()) return true;
      const queryStr = searchQuery.toLowerCase();
      const deptName = departments.find(d => d.id === member.departmentId)?.name || '';
      const fields = [
        member.firstName,
        member.lastName,
        member.email,
        member.phone,
        member.jobTitle,
        member.role,
        member.techNumber,
        deptName
      ].map(f => String(f || '').toLowerCase());

      return fields.some(f => f.includes(queryStr));
    });
  }, [staff, searchQuery, showArchived, departments]);

  // Append a placeholder row at the bottom for quick entry
  const rows = useMemo(() => {
    const list = [...filteredStaff];
    list.push({
      id: 'placeholder-row',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      techNumber: '',
      jobTitle: '',
      role: '',
      departmentId: '',
      payType: 'hourly',
      payRate: 0,
      reportsToId: '',
      backupStaffId: '',
      purchasingAuthority: '',
      payPeriodBookTimeCredit: 0,
      notes: '',
      hireDate: '',
      fireDate: '',
      addressStreet: '',
      addressCity: '',
      addressState: '',
      addressZip: '',
      dob: '',
      shirtSize: '',
      hatSize: '',
      pantsSize: '',
      shoeSize: '',
      gloveSize: '',
      keycard: '',
      companyCam: '',
      cobraKey: '',
      radioNumber: '',
      wexCard: '',
      saePex: '',
      warpGuysPex: '',
      fastPex: '',
      amerExp: '',
      citiSilver: '',
      citiBlack: '',
      blueAmEx: '',
      citiAaMc: '',
      amazonAmex: '',
      isPlaceholder: true,
      isArchived: false
    });
    return list;
  }, [filteredStaff]);

  const getCellValue = (row: StaffMember, colKey: string): string => {
    if (colKey === 'isArchived') {
      return row.isArchived ? 'true' : 'false';
    }
    if (colKey === 'emergencyName') {
      return row.emergencyContact?.name ?? '';
    }
    if (colKey === 'emergencyPhone') {
      return row.emergencyContact?.phone ?? '';
    }
    if (colKey === 'emergencyRelation') {
      return row.emergencyContact?.relation ?? '';
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
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        techNumber: '',
        jobTitle: '',
        role: '',
        departmentId: '',
        payType: 'hourly',
        payRate: 0,
        reportsToId: '',
        backupStaffId: '',
        purchasingAuthority: '',
        payPeriodBookTimeCredit: 0,
        notes: '',
        hireDate: '',
        fireDate: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        dob: '',
        shirtSize: '',
        hatSize: '',
        pantsSize: '',
        shoeSize: '',
        gloveSize: '',
        emergencyContact: { name: '', phone: '', relation: '' },
        keycard: '',
        companyCam: '',
        cobraKey: '',
        radioNumber: '',
        wexCard: '',
        saePex: '',
        warpGuysPex: '',
        fastPex: '',
        amerExp: '',
        citiSilver: '',
        citiBlack: '',
        blueAmEx: '',
        citiAaMc: '',
        amazonAmex: '',
        isArchived: false,
        createdAt: serverTimestamp()
      };

      if (colKey === 'isArchived') {
        data.isArchived = (initialVal === 'true');
      } else if (colKey === 'payRate' || colKey === 'payPeriodBookTimeCredit') {
        data[colKey] = Number(initialVal) || 0;
      } else if (colKey === 'emergencyName') {
        data.emergencyContact.name = initialVal;
      } else if (colKey === 'emergencyPhone') {
        data.emergencyContact.phone = initialVal;
      } else if (colKey === 'emergencyRelation') {
        data.emergencyContact.relation = initialVal;
      } else {
        data[colKey] = initialVal;
      }

      const docRef = await addDoc(collection(db, `businesses/${tenantId}/staff`), data);
      setSyncStatus('saved');
      return docRef.id;
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to create new staff member');
      throw e;
    }
  };

  // Helper: Save cell changes to Firestore
  const saveCellValue = async (rowId: string, colKey: string, newValue: string) => {
    let finalRowId = rowId;
    
    // If we're editing the placeholder row, create the document first
    if (rowId === 'placeholder-row') {
      if (!newValue.trim() && colKey !== 'departmentId' && colKey !== 'payType' && colKey !== 'isArchived' && colKey !== 'reportsToId' && colKey !== 'backupStaffId') {
        // Don't create row if it's just blank text entered
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

    // Check if value actually changed
    const oldVal = getCellValue(row, colKey);
    if (oldVal === newValue) {
      setEditingCell(null);
      return;
    }

    setSyncStatus('saving');
    try {
      const updates: any = {};
      if (colKey === 'payRate' || colKey === 'payPeriodBookTimeCredit') {
        updates[colKey] = Number(newValue) || 0;
      } else if (colKey === 'isArchived') {
        updates[colKey] = (newValue === 'true');
      } else if (colKey === 'emergencyName' || colKey === 'emergencyPhone' || colKey === 'emergencyRelation') {
        const field = colKey.replace('emergency', '').toLowerCase(); // 'name', 'phone', 'relation'
        updates.emergencyContact = {
          name: row.emergencyContact?.name ?? '',
          phone: row.emergencyContact?.phone ?? '',
          relation: row.emergencyContact?.relation ?? '',
          [field]: newValue
        };
      } else {
        updates[colKey] = newValue;
      }

      await updateDoc(doc(db, `businesses/${tenantId}/staff`, finalRowId), updates);
      setSyncStatus('saved');
    } catch (e) {
      setSyncStatus('error');
      toast.error('Failed to save change');
    }

    setEditingCell(null);
  };

  // Handle keys while navigating (not editing)
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
          // Move Left
          if (colIndex > 0) {
            setSelectedCell({ rowId, colKey: COLUMNS[colIndex - 1].key });
          } else if (rowIndex > 0) {
            setSelectedCell({ rowId: rows[rowIndex - 1].id, colKey: COLUMNS[COLUMNS.length - 1].key });
          }
        } else {
          // Move Right
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
        if (colKey === 'isArchived') {
          if (rowId !== 'placeholder-row') {
            const currentVal = getCellValue(rows[rowIndex], 'isArchived');
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
          saveCellValue(rowId, colKey, colKey === 'payRate' || colKey === 'payPeriodBookTimeCredit' ? '0' : '');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSelectedCell(null);
        break;
      default:
        // If user presses any standard single character, start editing with it prefilled
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          startEditing(rowId, colKey, e.key);
        }
        break;
    }
  };

  // Handle keys while editing
  const handleKeyDownEditor = (e: React.KeyboardEvent) => {
    if (!editingCell) return;
    const { rowId, colKey } = editingCell;

    const colIndex = COLUMNS.findIndex(c => c.key === colKey);
    const rowIndex = rows.findIndex(r => r.id === rowId);

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        saveCellValue(rowId, colKey, editValue);
        // Move focus down
        if (rowIndex < rows.length - 1) {
          setSelectedCell({ rowId: rows[rowIndex + 1].id, colKey });
        }
        break;
      case 'Tab':
        e.preventDefault();
        saveCellValue(rowId, colKey, editValue);
        // Move focus right
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

  // Handle click on cell
  const handleCellClick = (rowId: string, colKey: string) => {
    if (selectedCell?.rowId === rowId && selectedCell?.colKey === colKey) {
      // Double click mimics
      startEditing(rowId, colKey);
    } else {
      setSelectedCell({ rowId, colKey });
      setEditingCell(null);
    }
  };

  // Formula Bar selection change syncing
  const activeSelectedValue = useMemo(() => {
    if (!selectedCell) return '';
    const row = rows.find(r => r.id === selectedCell.rowId);
    if (!row) return '';
    return getCellValue(row, selectedCell.colKey);
  }, [selectedCell, rows]);

  // Sync formula bar value when selection changes
  useEffect(() => {
    if (selectedCell && !editingCell) {
      setEditValue(activeSelectedValue);
    }
  }, [selectedCell, editingCell, activeSelectedValue]);

  // Auto-scroll selected cell into view if it goes out of bounds
  useEffect(() => {
    if (!selectedCell || !gridContainerRef.current) return;
    
    // Find the cell element in DOM
    const cellEl = gridContainerRef.current.querySelector(
      `[data-row-id="${selectedCell.rowId}"][data-col-key="${selectedCell.colKey}"]`
    ) as HTMLElement | null;
    
    if (!cellEl) return;
    
    const container = gridContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    
    // Calculate offsets relative to container
    const relativeTop = cellRect.top - containerRect.top;
    const relativeBottom = cellRect.bottom - containerRect.top;
    const relativeLeft = cellRect.left - containerRect.left;
    const relativeRight = cellRect.right - containerRect.left;
    
    // Padding to keep cell fully visible plus some margins (e.g. height of headers/index sidebar)
    const headerHeight = 64; 
    const sidebarWidth = 50; 
    
    // Scroll vertically if needed
    if (relativeTop < headerHeight) {
      container.scrollTop += (relativeTop - headerHeight);
    } else if (relativeBottom > containerRect.height) {
      container.scrollTop += (relativeBottom - containerRect.height);
    }
    
    // Scroll horizontally if needed
    if (relativeLeft < sidebarWidth) {
      container.scrollLeft += (relativeLeft - sidebarWidth);
    } else if (relativeRight > containerRect.width) {
      container.scrollLeft += (relativeRight - containerRect.width);
    }
  }, [selectedCell]);

  // Handle delete staff row
  const handleDeleteRow = async (member: StaffMember) => {
    if (member.isPlaceholder) return;
    
    if (confirm(`Are you sure you want to delete ${member.firstName || 'this staff member'}?`)) {
      setSyncStatus('saving');
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/staff`, member.id));
        setSyncStatus('saved');
        setSelectedCell(null);
        setEditingCell(null);
        toast.success('Staff member deleted');
      } catch (e) {
        setSyncStatus('error');
        toast.error('Failed to delete staff member');
      }
    }
  };

  // Convert selected coordinates into cell name (e.g. B3, C10)
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
              Staff Sheet <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">v3</span>
            </h2>
            <p className="text-xs text-zinc-400">Excel-style grid for rapid office management.</p>
          </div>
        </div>

        {/* Action Controls & Indicators */}
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

          {/* Shortcut Legend Toggle */}
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

          {/* Show Archived Toggle */}
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

          {/* Search Box */}
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

      {/* Keyboard Shortcuts Help Panel */}
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
            <p>⚡ <span className="text-zinc-200">Bottom row</span>: Start typing to add new staff</p>
          </div>
        </div>
      )}

      {/* Excel Formula Bar */}
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
              // Direct formula editing - starts editing inline too
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

      {/* Spreadsheet Grid Container */}
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
          {/* Colgroup to enforce widths */}
          <colgroup>
            <col className="w-[50px]" />
            <col className="w-[70px]" />  {/* Active Checkbox */}
            <col className="w-[140px]" /> {/* First Name */}
            <col className="w-[140px]" /> {/* Last Name */}
            <col className="w-[80px]" />  {/* Tech # */}
            <col className="w-[160px]" /> {/* Job Title */}
            <col className="w-[150px]" /> {/* Internal Role */}
            <col className="w-[200px]" /> {/* Email */}
            <col className="w-[130px]" /> {/* Phone */}
            <col className="w-[150px]" /> {/* Department */}
            <col className="w-[120px]" /> {/* Pay Type */}
            <col className="w-[100px]" /> {/* Pay Rate */}
            <col className="w-[160px]" /> {/* Reports To */}
            <col className="w-[160px]" /> {/* Backup Contact */}
            <col className="w-[200px]" /> {/* Purchasing Authority */}
            <col className="w-[100px]" /> {/* Book Credit */}
            <col className="w-[110px]" /> {/* Hire Date */}
            <col className="w-[110px]" /> {/* Term Date */}
            <col className="w-[180px]" /> {/* Street Address */}
            <col className="w-[120px]" /> {/* City */}
            <col className="w-[80px]" />  {/* State */}
            <col className="w-[80px]" />  {/* Zip */}
            <col className="w-[110px]" /> {/* DOB */}
            <col className="w-[80px]" />  {/* Shirt Size */}
            <col className="w-[80px]" />  {/* Hat Size */}
            <col className="w-[80px]" />  {/* Pants Size */}
            <col className="w-[80px]" />  {/* Shoe Size */}
            <col className="w-[80px]" />  {/* Glove Size */}
            <col className="w-[150px]" /> {/* Emerg Contact */}
            <col className="w-[120px]" /> {/* Emerg Phone */}
            <col className="w-[120px]" /> {/* Emerg Relation */}
            <col className="w-[120px]" /> {/* Keycard */}
            <col className="w-[120px]" /> {/* Company Cam */}
            <col className="w-[120px]" /> {/* Cobra Key */}
            <col className="w-[120px]" /> {/* Radio # */}
            <col className="w-[120px]" /> {/* Wex Card */}
            <col className="w-[120px]" /> {/* SAE Pex */}
            <col className="w-[120px]" /> {/* Warp Guys Pex */}
            <col className="w-[120px]" /> {/* Fast Pex */}
            <col className="w-[120px]" /> {/* Amer Exp */}
            <col className="w-[120px]" /> {/* Citi Silver */}
            <col className="w-[120px]" /> {/* Citi Black */}
            <col className="w-[120px]" /> {/* Blue AmEx */}
            <col className="w-[120px]" /> {/* Citi AA MC */}
            <col className="w-[120px]" /> {/* Amazon Amex */}
            <col className="w-[250px]" /> {/* Notes */}
          </colgroup>

          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 text-zinc-400 select-none">
            {/* Spreadsheet Header Row (A, B, C...) */}
            <tr>
              <th className="bg-zinc-950/90 border-r border-b border-zinc-800 h-6 text-[9px] font-black text-center text-zinc-600">
                #
              </th>
              {COLUMNS.map(col => (
                <th 
                  key={col.key} 
                  className="bg-zinc-900 border-r border-b border-zinc-800 text-[10px] font-bold text-center h-6"
                >
                  {col.letter}
                </th>
              ))}
            </tr>

            {/* Field Labels Row */}
            <tr>
              <th className="bg-zinc-950/90 border-r border-zinc-800 h-10"></th>
              {COLUMNS.map(col => (
                <th 
                  key={col.key} 
                  className="border-r border-zinc-850 text-left px-3 text-[11px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-900/60"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Grid Body */}
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
                  {/* Row index sidebar / Delete trigger */}
                  <td className="bg-zinc-900/40 border-r border-zinc-800 h-9 relative text-center text-[10px] text-zinc-500 font-bold select-none cursor-default">
                    {/* Trash icon on hover, row number otherwise */}
                    {!isPlaceholder ? (
                      <>
                        <span className="group-hover:hidden">{rIndex + 1}</span>
                        <button
                          onClick={() => handleDeleteRow(row)}
                          className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-rose-950/30 text-rose-500 hover:bg-rose-900 hover:text-white rounded transition-all w-full h-full"
                          title="Delete staff member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-zinc-600 font-black">+</span>
                    )}
                  </td>

                  {/* Render Cells */}
                  {COLUMNS.map(col => {
                    const isSelected = selectedCell?.rowId === row.id && selectedCell?.colKey === col.key;
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key && col.type !== 'checkbox';
                    const cellVal = getCellValue(row, col.key);

                    // Custom styling variables
                    let displayContent: React.ReactNode = cellVal;
                    let textClass = 'text-left';

                    if (col.key === 'departmentId') {
                      const dept = departments.find(d => d.id === cellVal);
                      displayContent = dept ? dept.name : (cellVal ? cellVal : <span className="text-zinc-600 italic">None</span>);
                    } else if (col.key === 'payRate' || col.key === 'payPeriodBookTimeCredit') {
                      textClass = 'text-right font-semibold text-emerald-500/80';
                      displayContent = col.key === 'payRate' ? `$${Number(cellVal).toFixed(2)}` : Number(cellVal).toString();
                    } else if (col.key === 'payType') {
                      displayContent = cellVal ? cellVal.replace('_', ' ') : 'hourly';
                      textClass = 'capitalize';
                    } else if (col.type === 'staff-select') {
                      const manager = staff.find(s => s.id === cellVal);
                      displayContent = manager ? `${manager.firstName} ${manager.lastName}` : (cellVal ? cellVal : <span className="text-zinc-600 italic">None</span>);
                    } else if (col.type === 'checkbox') {
                      textClass = 'text-center';
                      displayContent = (
                        <div className="flex items-center justify-center w-full h-full">
                          <input
                            type="checkbox"
                            checked={cellVal === 'false'}
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
                            {col.type === 'select' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none capitalize"
                              >
                                {col.key === 'departmentId' ? (
                                  <>
                                    <option value="" className="bg-zinc-900 text-zinc-400">None</option>
                                    {departments.map(d => (
                                      <option key={d.id} value={d.id} className="bg-zinc-900 text-white">{d.name}</option>
                                    ))}
                                  </>
                                ) : (
                                  <>
                                    <option value="hourly" className="bg-zinc-900 text-white">Hourly</option>
                                    <option value="salary" className="bg-zinc-900 text-white">Salary</option>
                                    <option value="flat_rate" className="bg-zinc-900 text-white">Flat Rate</option>
                                    <option value="inherit" className="bg-zinc-900 text-white">Inherit</option>
                                  </>
                                )}
                              </select>
                            ) : col.type === 'staff-select' ? (
                              <select
                                ref={cellInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCellValue(row.id, col.key, editValue)}
                                onKeyDown={handleKeyDownEditor}
                                className="w-full h-full bg-transparent px-2 text-xs text-white font-mono outline-none border-none capitalize"
                              >
                                <option value="" className="bg-zinc-900 text-zinc-400">None</option>
                                {staff.filter(s => s.id !== row.id && !s.isPlaceholder).map(s => (
                                  <option key={s.id} value={s.id} className="bg-zinc-900 text-white">{`${s.firstName} ${s.lastName}`}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                ref={cellInputRef as any}
                                type={col.type === 'number' ? 'number' : 'text'}
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

// Inline fallback departments fetch helper
async function onSnapshotQueryDepartments(tenantId: string): Promise<Department[]> {
  return new Promise((resolve) => {
    const q = collection(db, `businesses/${tenantId}/departments`);
    onSnapshot(q, (snap) => {
      resolve(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    }, () => {
      resolve([]);
    });
  });
}
