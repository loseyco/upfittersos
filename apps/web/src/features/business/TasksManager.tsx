import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../lib/auth/store';
import { GenericDataGrid } from './GenericDataGrid';
import { TaskTemplateModal } from './TaskTemplateModal';
import { QuickBooksTaskImporter } from './QuickBooksTaskImporter';
import { 
  Search, CheckSquare, Plus, RefreshCw, Filter, SlidersHorizontal, 
  Clock, Trash2, Building2, User, Users, ChevronDown, Check, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoURL?: string;
  departmentId?: string;
  name?: string;
  displayName?: string;
  isArchived?: boolean;
  fireDate?: any;
}

interface Department {
  id: string;
  name: string;
}

interface TodoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface ShopTodo {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'in_review' | 'completed';
  assignedStaffIds: string[];
  assignedDepartmentIds: string[];
  assignedToAllStaff?: boolean;
  dueDate?: string;
  checklist: TodoChecklistItem[];
  createdAt: any;
  updatedAt?: any;
}

const PRIORITY_GLOWS = {
  low: 'border-zinc-200 dark:border-zinc-800 focus-within:ring-zinc-500/20',
  medium: 'border-zinc-200 dark:border-zinc-800 focus-within:ring-blue-500/20 hover:border-blue-500/20',
  high: 'border-amber-500/20 dark:border-amber-500/10 shadow-lg shadow-amber-500/[0.02] hover:border-amber-500/40',
  urgent: 'border-rose-500/40 dark:border-rose-500/20 shadow-xl shadow-rose-500/[0.04] hover:border-rose-500/60 animate-pulse-slow'
};

const PRIORITY_BADGES = {
  low: 'bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400',
  medium: 'bg-blue-50/10 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  high: 'bg-amber-50/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  urgent: 'bg-rose-50/10 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 font-black'
};

export function TasksManager({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { permissions, isSuperAdmin, user } = useAuthStore();
  const canManage = isSuperAdmin || permissions['tasks.manage'];

  const [activeSubTab, setActiveSubTab] = useState<'todos' | 'templates'>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Dual structures data
  const [todos, setTodos] = useState<ShopTodo[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(true);

  // Todo filter states
  const [filterAssignedToMe, setFilterAssignedToMe] = useState(false);
  const [filterMyDepartments, setFilterMyDepartments] = useState(false);
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Expanded card IDs for checklists
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Template Tab States (original code preserved)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // New Todo Form Modal
  const [isNewTodoOpen, setIsNewTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<ShopTodo | null>(null);
  const [todoForm, setTodoForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as ShopTodo['priority'],
    dueDate: '',
    assignedStaffIds: [] as string[],
    assignedDepartmentIds: [] as string[],
    assignedToAllStaff: false,
    checklistItemsText: '' // newline separated
  });

  // Searchable Multi-Select States
  const [deptSearch, setDeptSearch] = useState('');
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  const deptDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(e.target as Node)) {
        setIsStaffDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listeners for HR context
  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)).filter(s => !s.isArchived && !s.fireDate && s.departmentId));
    });
    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    });
    return () => {
      unsubStaff();
      unsubDepts();
    };
  }, [tenantId]);

  // Real-time listener for Shop Todos
  useEffect(() => {
    const qTodos = query(collection(db, `businesses/${tenantId}/todos`));
    const unsub = onSnapshot(qTodos, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopTodo));

      if (list.length === 0 && !snap.metadata.hasPendingWrites) {
        setLoadingTodos(true);
        try {
          // Fetch existing departments to map default tasks properly
          const deptsSnap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
          const currentDepts = deptsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));

          // Find specific departments or create placeholders
          let facilityDeptId = currentDepts.find(d => d.name.toLowerCase().includes('facility'))?.id || '';
          let partsDeptId = currentDepts.find(d => d.name.toLowerCase().includes('parts'))?.id || '';
          let officeDeptId = currentDepts.find(d => d.name.toLowerCase().includes('office'))?.id || '';

          // If no departments exist, we will seed a default "Facility Management" department to support feedback
          if (!facilityDeptId) {
            const facRef = await addDoc(collection(db, `businesses/${tenantId}/departments`), {
              name: 'Facility Management',
              createdAt: serverTimestamp()
            });
            facilityDeptId = facRef.id;
          }
          if (!partsDeptId) {
            const partsRef = await addDoc(collection(db, `businesses/${tenantId}/departments`), {
              name: 'Parts',
              createdAt: serverTimestamp()
            });
            partsDeptId = partsRef.id;
          }
          if (!officeDeptId) {
            const officeRef = await addDoc(collection(db, `businesses/${tenantId}/departments`), {
              name: 'Office',
              createdAt: serverTimestamp()
            });
            officeDeptId = officeRef.id;
          }

          // Seed default todos
          await addDoc(collection(db, `businesses/${tenantId}/todos`), {
            title: 'Address shop floor feedback & bug reports',
            description: 'Regularly process recent submissions to the Feedback & Bugs log to keep facility tools fully optimal.',
            priority: 'high',
            status: 'todo',
            assignedStaffIds: [],
            assignedDepartmentIds: [facilityDeptId],
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days out
            checklist: [
              { id: '1', text: 'Scan the main Feedback & Bugs dashboard', done: false },
              { id: '2', text: 'Triage open bugs by severity/priority', done: false },
              { id: '3', text: 'Assign outstanding features to specific teams', done: false }
            ],
            createdAt: serverTimestamp()
          });

          await addDoc(collection(db, `businesses/${tenantId}/todos`), {
            title: 'Perform morning print farm maintenance check',
            description: 'Ensure 3D printers are fully calibrated and clear of completed jobs before technician runs start.',
            priority: 'medium',
            status: 'in_progress',
            assignedStaffIds: [],
            assignedDepartmentIds: [partsDeptId],
            dueDate: new Date().toISOString().split('T')[0], // today
            checklist: [
              { id: '1', text: 'Clear build plates from completed prints', done: true },
              { id: '2', text: 'Verify extruder temperatures & alignments', done: false },
              { id: '3', text: 'Restock filament reels for scheduled jobs', done: false }
            ],
            createdAt: serverTimestamp()
          });

          await addDoc(collection(db, `businesses/${tenantId}/todos`), {
            title: 'Weekly QuickBooks reconciliation and sync checks',
            description: 'Audit syncing pipelines and match vendor/inventory invoices in preparation for end-of-week reporting.',
            priority: 'low',
            status: 'todo',
            assignedStaffIds: [],
            assignedDepartmentIds: [officeDeptId],
            checklist: [
              { id: '1', text: 'Check raw QuickBooks sync monitor for alerts', done: false },
              { id: '2', text: 'Confirm native services logs match QuickBooks outputs', done: false }
            ],
            createdAt: serverTimestamp()
          });

          toast.success('Initialized Shop Todos defaults with Facility Management tasks!');
        } catch (err) {
          console.error('Failed to seed default todos:', err);
        }
      } else {
        setTodos(list);
        setLoadingTodos(false);
      }
    });

    return () => unsub();
  }, [tenantId]);

  // Current staff member's context
  const currentStaffMember = useMemo(() => {
    const userEmail = user?.email;
    if (!userEmail) return null;
    return staff.find(s => s.email?.toLowerCase() === userEmail.toLowerCase()) || null;
  }, [staff, user]);

  // Filters calculation
  const filteredTodos = useMemo(() => {
    return todos.filter(t => {
      // 1. Search Query
      const queryText = searchQuery.toLowerCase();
      const matchesSearch = 
        t.title.toLowerCase().includes(queryText) ||
        t.description?.toLowerCase().includes(queryText);

      if (!matchesSearch) return false;

      // 2. Assigned to Me Filter
      if (filterAssignedToMe && currentStaffMember) {
        if (!t.assignedStaffIds.includes(currentStaffMember.id) && !t.assignedToAllStaff) return false;
      }

      // 3. My Department Filter
      if (filterMyDepartments && currentStaffMember?.departmentId) {
        if (!t.assignedDepartmentIds.includes(currentStaffMember.departmentId)) return false;
      }

      // 4. Priority Filter
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;

      return true;
    });
  }, [todos, searchQuery, filterAssignedToMe, filterMyDepartments, filterPriority, currentStaffMember]);

  // Toggle checklist expand state
  const toggleCardExpand = (todoId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  };

  // Check off a subtask live
  const handleCheckSubtask = async (todoId: string, subtaskId: string, done: boolean) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const updatedChecklist = todo.checklist.map(item => 
      item.id === subtaskId ? { ...item, done } : item
    );

    try {
      await updateDoc(doc(db, `businesses/${tenantId}/todos`, todoId), {
        checklist: updatedChecklist,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update checklist item');
    }
  };

  // Change status of a Todo
  const handleCycleStatus = async (todoId: string, currentStatus: ShopTodo['status']) => {
    const sequence: ShopTodo['status'][] = ['todo', 'in_progress', 'in_review', 'completed'];
    const nextIdx = (sequence.indexOf(currentStatus) + 1) % sequence.length;
    const nextStatus = sequence[nextIdx];

    try {
      await updateDoc(doc(db, `businesses/${tenantId}/todos`, todoId), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      toast.success(`Todo moved to ${nextStatus.replace('_', ' ')}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to transition status');
    }
  };

  const handleOpenEditTodo = (todo: ShopTodo) => {
    setEditingTodo(todo);
    setTodoForm({
      title: todo.title,
      description: todo.description || '',
      priority: todo.priority,
      dueDate: todo.dueDate || '',
      assignedStaffIds: todo.assignedStaffIds,
      assignedDepartmentIds: todo.assignedDepartmentIds,
      assignedToAllStaff: todo.assignedToAllStaff || false,
      checklistItemsText: todo.checklist.map(i => i.text).join('\n')
    });
    setIsNewTodoOpen(true);
  };

  const handleDeleteTodo = async (todoId: string) => {
    if (!confirm('Are you sure you want to delete this todo?')) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/todos`, todoId));
      toast.success('Todo deleted successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete todo');
    }
  };

  // Save/Create Todo
  const handleSaveTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoForm.title.trim()) return;

    // Parse checklist lines
    let checklist: TodoChecklistItem[] = [];
    if (editingTodo) {
      // Re-map items keeping the completed ones if the text hasn't changed
      const lines = todoForm.checklistItemsText.split('\n').map(l => l.trim()).filter(Boolean);
      checklist = lines.map((line, idx) => {
        const existing = editingTodo.checklist.find(item => item.text === line);
        return {
          id: existing?.id || String(idx + 1),
          text: line,
          done: existing?.done || false
        };
      });
    } else {
      checklist = todoForm.checklistItemsText
        .split('\n')
        .map((line, idx) => ({
          id: String(idx + 1),
          text: line.trim(),
          done: false
        }))
        .filter(item => item.text.length > 0);
    }

    const payload = {
      title: todoForm.title,
      description: todoForm.description,
      priority: todoForm.priority,
      dueDate: todoForm.dueDate,
      assignedStaffIds: todoForm.assignedStaffIds,
      assignedDepartmentIds: todoForm.assignedDepartmentIds,
      assignedToAllStaff: todoForm.assignedToAllStaff,
      checklist,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingTodo) {
        await updateDoc(doc(db, `businesses/${tenantId}/todos`, editingTodo.id), payload);
        toast.success('Todo updated successfully');
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/todos`), {
          ...payload,
          status: 'todo',
          createdAt: serverTimestamp()
        });
        toast.success('New todo created successfully');
      }
      setIsNewTodoOpen(false);
      setEditingTodo(null);
      setTodoForm({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        assignedStaffIds: [],
        assignedDepartmentIds: [],
        assignedToAllStaff: false,
        checklistItemsText: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save todo');
    }
  };

  // Kanban Columns Mapping
  const columns: { id: ShopTodo['status']; name: string; color: string }[] = [
    { id: 'todo', name: 'To Do', color: 'bg-zinc-100 dark:bg-zinc-900 border-t-zinc-300 dark:border-t-zinc-700' },
    { id: 'in_progress', name: 'In Progress', color: 'bg-blue-50/20 dark:bg-blue-950/10 border-t-blue-500' },
    { id: 'in_review', name: 'In Review', color: 'bg-amber-50/20 dark:bg-amber-950/10 border-t-amber-500' },
    { id: 'completed', name: 'Completed', color: 'bg-emerald-50/10 dark:bg-emerald-950/5 border-t-emerald-500' }
  ];

  // Preserved logic for Templates Tab Filter (original code)
  const handleFilterTemplates = (item: any) => {
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

  const templateColumns = [
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
      {/* Sliding Tab Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="space-y-1">
          <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/80 w-fit">
            <button
              onClick={() => setActiveSubTab('todos')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 ${
                activeSubTab === 'todos'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Shop Todo Board
            </button>
            <button
              onClick={() => setActiveSubTab('templates')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 ${
                activeSubTab === 'templates'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              SOP Templates
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 pl-1.5">
            {activeSubTab === 'todos' 
              ? 'Real-time interactive operational checklists and department allocations.' 
              : 'Standardized operating procedures importable to live vehicle work orders.'}
          </p>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder={activeSubTab === 'todos' ? "Search todo items..." : "Search templates..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
          
          {canManage && activeSubTab === 'todos' && (
            <button
              onClick={() => {
                setEditingTodo(null);
                setTodoForm({
                  title: '',
                  description: '',
                  priority: 'medium',
                  dueDate: '',
                  assignedStaffIds: currentStaffMember ? [currentStaffMember.id] : [],
                  assignedDepartmentIds: [],
                  assignedToAllStaff: false,
                  checklistItemsText: ''
                });
                setIsNewTodoOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Todo
            </button>
          )}

          {/* SOP Actions (preserved) */}
          {canManage && activeSubTab === 'templates' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsSyncModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl text-sm font-bold transition-all active:scale-95 shrink-0 animate-in fade-in"
                title="Sync from QuickBooks"
              >
                <RefreshCw className="w-4 h-4" />
                Sync QB
              </button>
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 shrink-0 animate-in fade-in"
              >
                <Plus className="w-4 h-4" />
                New Template
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab 1: Shop Todo Board */}
      {activeSubTab === 'todos' && (
        <div className="space-y-6">
          {/* Todo Filters Bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-3xl shadow-sm flex flex-wrap items-center gap-4">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 pl-2">
              <Filter className="w-3.5 h-3.5" /> Filter Context
            </span>
            
            <div className="flex flex-wrap items-center gap-2">
              {currentStaffMember && (
                <>
                  <button
                    onClick={() => setFilterAssignedToMe(!filterAssignedToMe)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      filterAssignedToMe 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                        : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-950 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    Assigned to Me
                  </button>
                  {currentStaffMember.departmentId && (
                    <button
                      onClick={() => setFilterMyDepartments(!filterMyDepartments)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        filterMyDepartments 
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                          : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-950 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      My Department
                    </button>
                  )}
                </>
              )}

              {/* Priority Filter select */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 outline-none"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent Only</option>
              </select>
            </div>
          </div>

          {/* Kanban Columns Grid */}
          {loadingTodos ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-sm font-bold tracking-wider">Syncing Shop Board...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
              {columns.map(col => {
                const columnTodos = filteredTodos.filter(t => t.status === col.id);
                return (
                  <div key={col.id} className="bg-zinc-50/60 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-850 rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-[550px]">
                    {/* Column Header */}
                    <div className={`p-4 border-t-4 ${col.color} border-b border-zinc-200/50 dark:border-zinc-850 bg-white dark:bg-zinc-900 flex justify-between items-center`}>
                      <span className="text-sm font-black text-zinc-900 dark:text-white tracking-tight">{col.name}</span>
                      <span className="bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 py-0.5 px-2.5 rounded-xl text-xs font-black">
                        {columnTodos.length}
                      </span>
                    </div>

                    {/* Column body */}
                    <div className="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar max-h-[70vh]">
                      <AnimatePresence mode="popLayout">
                        {columnTodos.map(todo => {
                          const isExpanded = expandedCards.has(todo.id);
                          const totalChecklist = todo.checklist?.length || 0;
                          const completedChecklist = todo.checklist?.filter(i => i.done).length || 0;
                          const progressPercentage = totalChecklist > 0 ? (completedChecklist / totalChecklist) * 100 : 0;
                          const isOverdue = todo.dueDate && new Date(todo.dueDate) < new Date() && todo.status !== 'completed';

                          return (
                            <motion.div
                              layout
                              key={todo.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className={`bg-white dark:bg-zinc-900 border ${PRIORITY_GLOWS[todo.priority]} rounded-2xl p-4 space-y-3 shadow-sm hover:shadow-md transition-all relative group/card`}
                            >
                              {/* Glowing Red border for Urgent */}
                              {todo.priority === 'urgent' && (
                                <div className="absolute inset-0 border border-rose-500/20 rounded-2xl pointer-events-none" />
                              )}

                              {/* Title / Action dots */}
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">
                                  {todo.title}
                                </h4>

                                <button
                                  onClick={() => handleCycleStatus(todo.id, todo.status)}
                                  className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                                  title="Cycle Status"
                                >
                                  Move →
                                </button>
                              </div>

                              {todo.description && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                                  {todo.description}
                                </p>
                              )}

                              {/* Assignees (Department pills & Avatars) */}
                              {(todo.assignedToAllStaff || todo.assignedDepartmentIds.length > 0 || todo.assignedStaffIds.length > 0) && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  {todo.assignedToAllStaff && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-500/10 rounded-lg text-[9px] font-bold text-rose-600 dark:text-rose-400">
                                      <Users className="w-2.5 h-2.5" />
                                      All Staff
                                    </span>
                                  )}
                                  {todo.assignedDepartmentIds.map(deptId => (
                                    <span key={deptId} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-500/10 rounded-lg text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                                      <Building2 className="w-2.5 h-2.5" />
                                      {departments.find(d => d.id === deptId)?.name || 'Dept'}
                                    </span>
                                  ))}
                                  {todo.assignedStaffIds.map(staffId => {
                                    const member = staff.find(s => s.id === staffId);
                                    if (!member) return null;
                                    const memberName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.name || member.displayName || 'Staff';
                                    const displayFirstName = member.firstName || member.name?.split(' ')[0] || 'Staff';
                                    return (
                                      <div key={staffId} className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-[9px] font-bold text-zinc-600 dark:text-zinc-300" title={memberName}>
                                        <User className="w-2.5 h-2.5 text-zinc-400" />
                                        <span>{displayFirstName}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Checklist Mini bar */}
                              {totalChecklist > 0 && (
                                <div className="space-y-1 pt-1">
                                  <button
                                    onClick={() => toggleCardExpand(todo.id)}
                                    className="flex items-center justify-between w-full text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider hover:text-zinc-650"
                                  >
                                    <span>Checklist ({completedChecklist}/{totalChecklist})</span>
                                    <span>{isExpanded ? 'Hide ▲' : 'Show ▼'}</span>
                                  </button>
                                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-indigo-500 h-full transition-all duration-300"
                                      style={{ width: `${progressPercentage}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Expanded Checklist Subtask Rows */}
                              <AnimatePresence>
                                {isExpanded && totalChecklist > 0 && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 overflow-hidden"
                                  >
                                    {todo.checklist.map(item => (
                                      <label key={item.id} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer select-none group/item">
                                        <input
                                          type="checkbox"
                                          checked={item.done}
                                          onChange={(e) => handleCheckSubtask(todo.id, item.id, e.target.checked)}
                                          className="w-3.5 h-3.5 text-indigo-600 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500 flex items-center justify-center after:content-['✓'] after:text-[10px] after:text-white after:hidden checked:after:block transition-all"
                                        />
                                        <span className={`transition-all ${item.done ? 'line-through text-zinc-400 dark:text-zinc-600 font-normal' : 'font-medium'}`}>
                                          {item.text}
                                        </span>
                                      </label>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Footer details (Due Date, Priority Pill, and Actions) */}
                              <div className="flex items-center justify-between gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-850 mt-1">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${PRIORITY_BADGES[todo.priority]}`}>
                                    {todo.priority}
                                  </span>
                                  {todo.dueDate && (
                                    <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${
                                      isOverdue ? 'text-rose-500' : 'text-zinc-400 dark:text-zinc-500'
                                    }`}>
                                      <Clock className="w-2.5 h-2.5 shrink-0" />
                                      {new Date(todo.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>

                                {canManage && (
                                  <div className="flex items-center gap-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleOpenEditTodo(todo)}
                                      className="text-[10px] font-bold text-zinc-450 hover:text-indigo-600 dark:hover:text-indigo-400 uppercase tracking-widest transition-colors"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTodo(todo.id)}
                                      className="text-zinc-400 hover:text-rose-600 p-1 rounded transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>

                      {columnTodos.length === 0 && (
                        <div className="h-32 border border-dashed border-zinc-200 dark:border-zinc-850 rounded-2xl flex flex-col items-center justify-center text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                          Column Empty
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: SOP Templates Database (Fully preserved original functionality) */}
      {activeSubTab === 'templates' && (
        <div className="animate-in fade-in duration-300">
          <GenericDataGrid 
            collectionPath={`businesses/${tenantId}/tasks`} 
            title="Templates Database" 
            columns={templateColumns}
            localFilter={handleFilterTemplates}
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
      )}

      {/* MODAL: Create/Edit Todo */}
      {isNewTodoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                {editingTodo ? 'Edit Todo' : 'Create Todo'}
              </h3>
              <button 
                onClick={() => setIsNewTodoOpen(false)}
                className="text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-805 p-1.5 rounded-xl transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveTodo} className="p-6 space-y-4 overflow-y-auto max-h-[75vh] no-scrollbar">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Todo Title</label>
                <input
                  type="text"
                  placeholder="Todo title"
                  value={todoForm.title}
                  onChange={(e) => setTodoForm({ ...todoForm, title: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Description</label>
                <textarea
                  placeholder="Brief context or instructions..."
                  value={todoForm.description}
                  onChange={(e) => setTodoForm({ ...todoForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Priority</label>
                  <select
                    value={todoForm.priority}
                    onChange={(e) => setTodoForm({ ...todoForm, priority: e.target.value as ShopTodo['priority'] })}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    required
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Due Date</label>
                  <input
                    type="date"
                    value={todoForm.dueDate}
                    onChange={(e) => setTodoForm({ ...todoForm, dueDate: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  />
                </div>
              </div>
                          {/* Department Select (Searchable Dropdown) */}
              <div className="space-y-1.5 relative" ref={deptDropdownRef}>
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Assigned Departments</label>
                <button
                  type="button"
                  onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-left shadow-sm text-zinc-900 dark:text-white cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/80"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-zinc-400" />
                    <span>
                      {todoForm.assignedDepartmentIds.length > 0
                        ? `${todoForm.assignedDepartmentIds.length} Departments Selected`
                        : "Select Departments..."}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isDeptDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDeptDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in duration-200">
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search departments..."
                        value={deptSearch}
                        onChange={(e) => setDeptSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-white"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto p-1 custom-scrollbar">
                      {departments
                        .filter(dept => dept.name.toLowerCase().includes(deptSearch.toLowerCase()))
                        .map(dept => {
                          const isSelected = todoForm.assignedDepartmentIds.includes(dept.id);
                          return (
                            <button
                              type="button"
                              key={dept.id}
                              onClick={() => {
                                setTodoForm(prev => {
                                  const newDepts = isSelected
                                    ? prev.assignedDepartmentIds.filter(id => id !== dept.id)
                                    : [...prev.assignedDepartmentIds, dept.id];
                                  return { ...prev, assignedDepartmentIds: newDepts };
                                });
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between rounded-xl transition-all ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              <span className="text-xs">{dept.name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                            </button>
                          );
                        })}
                      {departments.filter(dept => dept.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                        <p className="p-4 text-center text-xs text-zinc-400 italic">No departments found.</p>
                      )}
                    </div>
                    {todoForm.assignedDepartmentIds.length > 0 && (
                      <div className="p-1.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/20">
                        <button
                          type="button"
                          onClick={() => setTodoForm(prev => ({ ...prev, assignedDepartmentIds: [] }))}
                          className="w-full py-1.5 text-center text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                        >
                          Clear Selected Departments
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Closeable Pills underneath */}
                {todoForm.assignedDepartmentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {todoForm.assignedDepartmentIds.map(id => {
                      const dept = departments.find(d => d.id === id);
                      if (!dept) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-xl text-xs font-bold border border-indigo-100 dark:border-indigo-900/30 shadow-sm animate-in zoom-in-95 duration-100">
                          {dept.name}
                          <button
                            type="button"
                            onClick={() => {
                              setTodoForm(prev => ({
                                ...prev,
                                assignedDepartmentIds: prev.assignedDepartmentIds.filter(dId => dId !== id)
                              }));
                            }}
                            className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-full text-indigo-500 hover:text-indigo-650 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* User Select (Searchable Dropdown) */}
              <div className="space-y-1.5 relative" ref={staffDropdownRef}>
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Assigned Staff Members</label>
                <button
                  type="button"
                  onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-left shadow-sm text-zinc-900 dark:text-white cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/80"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>
                      {todoForm.assignedToAllStaff
                        ? "All Staff Assigned"
                        : todoForm.assignedStaffIds.length > 0
                        ? `${todoForm.assignedStaffIds.length} Staff Selected`
                        : "Select Staff Members..."}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isStaffDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isStaffDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in duration-200">
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search staff members..."
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-white"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto p-1 custom-scrollbar">
                      {/* All Staff Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setTodoForm(prev => ({
                            ...prev,
                            assignedToAllStaff: !prev.assignedToAllStaff
                          }));
                        }}
                        className={`w-full px-3 py-2.5 text-left flex items-center justify-between rounded-xl transition-all font-bold ${
                          todoForm.assignedToAllStaff
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                            : 'hover:bg-rose-50/30 dark:hover:bg-rose-950/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span className="text-xs">All Staff (Everyone)</span>
                        </div>
                        {todoForm.assignedToAllStaff && <Check className="w-3.5 h-3.5 text-rose-500" />}
                      </button>

                      {/* Individual Staff Members */}
                      {staff
                        .filter(member => {
                          const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim().toLowerCase() || member.name?.toLowerCase() || member.displayName?.toLowerCase() || '';
                          return fullName.includes(staffSearch.toLowerCase());
                        })
                        .map(member => {
                          const isSelected = todoForm.assignedStaffIds.includes(member.id);
                          const isDimmed = todoForm.assignedToAllStaff;
                          const firstInitial = (member.firstName?.[0] || member.name?.[0] || member.displayName?.[0] || '?').toUpperCase();
                          const lastInitial = (member.lastName?.[0] || '').toUpperCase();
                          const displayName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.name || member.displayName || 'Unnamed Staff';
                          return (
                            <button
                              type="button"
                              key={member.id}
                              disabled={isDimmed}
                              onClick={() => {
                                setTodoForm(prev => {
                                  const newStaff = isSelected
                                    ? prev.assignedStaffIds.filter(id => id !== member.id)
                                    : [...prev.assignedStaffIds, member.id];
                                  return { ...prev, assignedStaffIds: newStaff };
                                });
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between rounded-xl transition-all ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300'
                              } ${isDimmed ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">
                                  {firstInitial}{lastInitial}
                                </div>
                                <span className="text-xs">{displayName}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                            </button>
                          );
                        })}
                      {staff.filter(member => {
                        const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim().toLowerCase() || member.name?.toLowerCase() || member.displayName?.toLowerCase() || '';
                        return fullName.includes(staffSearch.toLowerCase());
                      }).length === 0 && (
                        <p className="p-4 text-center text-xs text-zinc-400 italic">No staff found.</p>
                      )}
                    </div>
                    {(todoForm.assignedStaffIds.length > 0 || todoForm.assignedToAllStaff) && (
                      <div className="p-1.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/20">
                        <button
                          type="button"
                          onClick={() => setTodoForm(prev => ({ ...prev, assignedStaffIds: [], assignedToAllStaff: false }))}
                          className="w-full py-1.5 text-center text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                        >
                          Clear Selected Staff
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Closeable Pills underneath */}
                {(todoForm.assignedToAllStaff || todoForm.assignedStaffIds.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {todoForm.assignedToAllStaff && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black border border-rose-100 dark:border-rose-900/30 shadow-sm animate-in zoom-in-95 duration-100">
                        <Users className="w-3.5 h-3.5 text-rose-500" />
                        All Staff
                        <button
                          type="button"
                          onClick={() => {
                            setTodoForm(prev => ({
                              ...prev,
                              assignedToAllStaff: false
                            }));
                          }}
                          className="p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-full text-rose-500 hover:text-rose-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    )}
                    {!todoForm.assignedToAllStaff && todoForm.assignedStaffIds.map(id => {
                      const member = staff.find(s => s.id === id);
                      if (!member) return null;
                      const firstInitial = (member.firstName?.[0] || member.name?.[0] || member.displayName?.[0] || '?').toUpperCase();
                      const lastInitial = (member.lastName?.[0] || '').toUpperCase();
                      const displayName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.name || member.displayName || 'Unnamed Staff';
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-700 shadow-sm animate-in zoom-in-95 duration-100">
                          <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] uppercase font-bold text-zinc-600 dark:text-zinc-400">
                            {firstInitial}{lastInitial}
                          </div>
                          {displayName}
                          <button
                            type="button"
                            onClick={() => {
                              setTodoForm(prev => ({
                                ...prev,
                                  assignedStaffIds: prev.assignedStaffIds.filter(sId => sId !== id)
                              }));
                            }}
                            className="p-0.5 hover:bg-zinc-250 dark:hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Checklist inputs */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Checklist Items (One per line)</label>
                <textarea
                  placeholder="Todo sub-item A&#10;Todo sub-item B&#10;Todo sub-item C"
                  value={todoForm.checklistItemsText}
                  onChange={(e) => setTodoForm({ ...todoForm, checklistItemsText: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none font-mono text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20"
              >
                {editingTodo ? 'Update Todo' : 'Launch Todo'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
