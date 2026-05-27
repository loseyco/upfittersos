import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, addDoc, updateDoc, doc, serverTimestamp, setDoc, deleteDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { toast } from 'sonner';
import { 
  Briefcase, Users, CheckSquare, Clock, Search, 
  RefreshCw, Trash2, Terminal, ArrowRight, Save, FileText, PlusCircle
} from 'lucide-react';

// ====================================================
// 1. INTERACTIVE WORKFLOW CHART APP
// ====================================================
interface WorkflowChartProps {
  customersCount: number;
  jobsCount: number;
  openWindow: (id: string) => void;
}

export const WorkflowChart = ({ customersCount, jobsCount, openWindow }: WorkflowChartProps) => (
  <div className="h-full flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900 select-none">
    <div className="text-center mb-6">
      <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Operation Workflow Center</h3>
      <p className="text-xs text-zinc-500 mt-1">Click a category card below to launch its management desktop application</p>
    </div>

    <div className="relative flex flex-col md:flex-row items-center gap-16 md:gap-12 w-full max-w-2xl bg-white dark:bg-zinc-955 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      {/* Step 1: Customers */}
      <div 
        onClick={() => openWindow('customers')}
        className="w-32 bg-indigo-50 dark:bg-indigo-950/20 border-2 border-indigo-200 dark:border-indigo-900/60 p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-indigo-500/10 group"
      >
        <div className="p-2.5 bg-indigo-500 text-white rounded-xl mb-3 shadow-md group-hover:animate-bounce">
          <Users className="w-5 h-5" />
        </div>
        <span className="text-xs font-black text-zinc-800 dark:text-zinc-200">Customers</span>
        <span className="text-[9px] font-bold text-zinc-400 mt-1 uppercase">{customersCount} Accounts</span>
      </div>

      {/* Arrow 1 */}
      <div className="hidden md:flex flex-col items-center text-zinc-300 dark:text-zinc-700">
        <ArrowRight className="w-5 h-5 animate-pulse" />
        <span className="text-[8px] font-black uppercase tracking-wider mt-1 text-zinc-400">Order</span>
      </div>

      {/* Step 2: Jobs */}
      <div 
        onClick={() => openWindow('jobs')}
        className="w-32 bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-900/60 p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-emerald-500/10 group"
      >
        <div className="p-2.5 bg-emerald-500 text-white rounded-xl mb-3 shadow-md group-hover:animate-bounce">
          <Briefcase className="w-5 h-5" />
        </div>
        <span className="text-xs font-black text-zinc-800 dark:text-zinc-200">Job Orders</span>
        <span className="text-[9px] font-bold text-zinc-400 mt-1 uppercase">{jobsCount} Active</span>
      </div>

      {/* Arrow 2 */}
      <div className="hidden md:flex flex-col items-center text-zinc-300 dark:text-zinc-700">
        <ArrowRight className="w-5 h-5 animate-pulse" />
        <span className="text-[8px] font-black uppercase tracking-wider mt-1 text-zinc-400">Track</span>
      </div>

      {/* Step 3: Ledger sheet / Timeclock */}
      <div 
        onClick={() => openWindow('ledger')}
        className="w-32 bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-900/60 p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-amber-500/10 group"
      >
        <div className="p-2.5 bg-amber-500 text-white rounded-xl mb-3 shadow-md group-hover:animate-bounce">
          <FileText className="w-5 h-5" />
        </div>
        <span className="text-xs font-black text-zinc-800 dark:text-zinc-200">Time Ledger</span>
        <span className="text-[9px] font-bold text-zinc-400 mt-1 uppercase">Quick Entry</span>
      </div>

      {/* Arrow 3 */}
      <div className="hidden md:flex flex-col items-center text-zinc-300 dark:text-zinc-700">
        <ArrowRight className="w-5 h-5 animate-pulse" />
        <span className="text-[8px] font-black uppercase tracking-wider mt-1 text-zinc-400">Export</span>
      </div>

      {/* Step 4: Sync Center */}
      <div 
        onClick={() => openWindow('sync')}
        className="w-32 bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200/50 dark:border-blue-900/60 p-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-blue-500/10 group"
      >
        <div className="p-2.5 bg-blue-500 text-white rounded-xl mb-3 shadow-md group-hover:animate-bounce">
          <RefreshCw className="w-5 h-5" />
        </div>
        <span className="text-xs font-black text-zinc-800 dark:text-zinc-200">QB Sync</span>
        <span className="text-[9px] font-bold text-zinc-400 mt-1 uppercase">Connector</span>
      </div>
    </div>

    <div className="flex gap-4 mt-8">
      <button 
        onClick={() => openWindow('console')}
        className="flex items-center gap-1.5 px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-650 dark:text-zinc-350 rounded-xl font-bold text-xs shadow-sm"
      >
        <Terminal className="w-3.5 h-3.5 text-zinc-500" />
        Developer Console
      </button>

      <button 
        onClick={() => openWindow('todos')}
        className="flex items-center gap-1.5 px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-650 dark:text-zinc-350 rounded-xl font-bold text-xs shadow-sm"
      >
        <CheckSquare className="w-3.5 h-3.5" />
        Open Shop Checklist
      </button>
    </div>
  </div>
);

// ====================================================
// 2. KEYBOARD DRIVEN LEDGER SHEET APP
// ====================================================
interface LedgerSheetProps {
  tenantId: string;
  jobs: any[];
  staff: any[];
  playSound: (type: 'click' | 'open' | 'save' | 'minimize') => void;
}

export const LedgerSheet = ({ tenantId, jobs, staff, playSound }: LedgerSheetProps) => {
  const { user } = useAuthStore();
  const [rows, setRows] = useState<Array<{
    date: string;
    jobId: string;
    staffId: string;
    description: string;
    hours: string;
    category: string;
  }>>([
    { date: new Date().toISOString().split('T')[0], jobId: '', staffId: '', description: '', hours: '', category: 'General' }
  ]);
  const [committing, setCommitting] = useState(false);

  const addRow = () => {
    setRows(prev => [...prev, {
      date: new Date().toISOString().split('T')[0],
      jobId: '',
      staffId: '',
      description: '',
      hours: '',
      category: 'General'
    }]);
    playSound('click');
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
    playSound('click');
  };

  const updateField = (idx: number, field: string, val: string) => {
    setRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: val } : row));
  };

  const handleCommit = async () => {
    const validRows = rows.filter(r => r.jobId && r.description && r.hours);
    if (validRows.length === 0) {
      toast.error('No complete rows to record! Ensure Job, Description, and Hours are filled.');
      return;
    }

    setCommitting(true);
    try {
      await Promise.all(validRows.map(async (row) => {
        const selectedJob = jobs.find(j => j.id === row.jobId);
        const selectedStaff = staff.find(s => s.id === row.staffId);
        const authorName = selectedStaff ? `${selectedStaff.firstName} ${selectedStaff.lastName}` : (user?.displayName || 'Staff');
        
        const activityData = {
          type: 'time_logged',
          message: `[Ledger Quick Entry] Logged ${row.hours}h on ${row.category}: ${row.description}`,
          timestamp: new Date(row.date),
          staffId: selectedStaff?.id || user?.uid || 'ledger',
          staffName: authorName,
          metadata: {
            hours: parseFloat(row.hours) || 0,
            category: row.category,
            ledgerEntry: true
          }
        };

        const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${row.jobId}/activity`), activityData);

        const jobPrefix = selectedJob ? (selectedJob.jobNumber ? `Job #${selectedJob.jobNumber}` : `Job ${selectedJob.title}`) : 'Job';
        await setDoc(doc(db, `businesses/${tenantId}/activity_feed`, `job_act_${row.jobId}_${docRef.id}`), {
          type: 'job',
          title: 'Time/Work Logged',
          message: `${jobPrefix}: ${activityData.message}`,
          timestamp: activityData.timestamp,
          severity: 'success',
          author: activityData.staffName,
          metadata: {
            jobId: row.jobId,
            jobTitle: selectedJob?.title || '',
            jobNumber: selectedJob?.jobNumber || '',
            hours: activityData.metadata.hours
          }
        });
      }));

      playSound('save');
      toast.success(`Successfully logged ${validRows.length} transactions to QuickBooks workflow!`);
      setRows([{ date: new Date().toISOString().split('T')[0], jobId: '', staffId: '', description: '', hours: '', category: 'General' }]);
    } catch (err) {
      console.error(err);
      toast.error('Reconciliation error during entry commit.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 font-sans text-xs select-none">
      <div className="flex items-center justify-between p-3 border-b border-zinc-200 dark:border-zinc-855 bg-white dark:bg-zinc-955/50 shrink-0">
        <h4 className="font-black text-sm text-zinc-850 dark:text-zinc-200">Quick Entry Work Ledger</h4>
        <div className="flex gap-2">
          <button 
            onClick={addRow}
            className="flex items-center gap-1 px-3 py-1 bg-zinc-150 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-805 text-zinc-700 dark:text-zinc-350 rounded-lg font-bold transition active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Row
          </button>
          <button 
            onClick={handleCommit}
            disabled={committing}
            className="flex items-center gap-1 px-4 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black transition active:scale-95 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {committing ? 'Reconciling...' : 'Commit Ledger'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-855 bg-white dark:bg-zinc-950 rounded-xl m-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-black">
              <th className="p-2 w-28 border-r border-zinc-200 dark:border-zinc-800">Date</th>
              <th className="p-2 w-52 border-r border-zinc-200 dark:border-zinc-800">Job (Work Order)</th>
              <th className="p-2 w-44 border-r border-zinc-200 dark:border-zinc-800">Technician</th>
              <th className="p-2 border-r border-zinc-200 dark:border-zinc-800">Memo / Description</th>
              <th className="p-2 w-20 border-r border-zinc-200 dark:border-zinc-800 text-center">Hours</th>
              <th className="p-2 w-28 border-r border-zinc-200 dark:border-zinc-800">Category</th>
              <th className="p-2 w-12 text-center">X</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-850 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                  <input 
                    type="date"
                    value={row.date}
                    onChange={e => updateField(idx, 'date', e.target.value)}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-zinc-850 dark:text-zinc-350 p-1 text-xs"
                  />
                </td>
                <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                  <select
                    value={row.jobId}
                    onChange={e => updateField(idx, 'jobId', e.target.value)}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-zinc-850 dark:text-zinc-350 p-1 text-xs font-bold"
                  >
                    <option value="" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Select Job...</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id} className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">
                        #{j.jobNumber || 'N/A'} - {j.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                  <select
                    value={row.staffId}
                    onChange={e => updateField(idx, 'staffId', e.target.value)}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-zinc-850 dark:text-zinc-350 p-1 text-xs"
                  >
                    <option value="" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Inherited (Active User)</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id} className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                  <input 
                    type="text"
                    placeholder="Enter what you did..."
                    value={row.description}
                    onChange={e => updateField(idx, 'description', e.target.value)}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-zinc-855 dark:text-zinc-350 p-1 text-xs"
                  />
                </td>
                <td className="p-1 border-r border-zinc-200 dark:border-zinc-855 text-center font-mono pr-2">
                  <input 
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="0.0"
                    value={row.hours}
                    onChange={e => updateField(idx, 'hours', e.target.value)}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-center text-zinc-855 dark:text-zinc-350 p-1 text-xs"
                  />
                </td>
                <td className="p-1 border-r border-zinc-200 dark:border-zinc-855">
                  <select
                    value={row.category}
                    onChange={e => updateField(idx, 'category', e.target.value)}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-zinc-855 dark:text-zinc-350 p-1 text-xs"
                  >
                    <option value="General" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">General</option>
                    <option value="Shop Work" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Shop Work</option>
                    <option value="Fabrication" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Fabrication</option>
                    <option value="Electrical" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Electrical</option>
                    <option value="Parts Pick" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Parts Pick</option>
                    <option value="Admin" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Admin</option>
                  </select>
                </td>
                <td className="p-1 text-center">
                  <button 
                    onClick={() => removeRow(idx)}
                    disabled={rows.length <= 1}
                    className="p-1 text-zinc-350 hover:text-rose-600 rounded transition active:scale-95 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ====================================================
// 3. COMMAND CONSOLE TERMINAL APP
// ====================================================
interface CommandConsoleProps {
  tenantId: string;
  jobs: any[];
  customers: any[];
  staff: any[];
  todos: any[];
  activeSessions: any[];
  playSound: (type: 'click' | 'open' | 'save' | 'minimize') => void;
  openWindow: (id: string) => void;
}

export const CommandConsole = ({ tenantId, jobs, customers, staff, activeSessions, playSound }: CommandConsoleProps) => {
  const { user } = useAuthStore();
  const [history, setHistory] = useState<string[]>([
    'UpfittersOS Classic Console [Version 1.0.0]',
    '(c) 2026 DeepMind Antigravity Corporation. All rights reserved.',
    'Type "/help" for a list of available command operations.',
    ''
  ]);
  const [cmdInput, setCmdInput] = useState('');
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const runCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim()) return;

    const fullCmd = cmdInput.trim();
    const parts = fullCmd.split(' ');
    const action = parts[0].toLowerCase();
    const newHistory = [...history, `> ${fullCmd}`];

    setCmdInput('');
    playSound('click');

    if (action === '/help') {
      setHistory([...newHistory,
        'Available Command List:',
        '  /help                             Displays this manual.',
        '  /clear                            Clears screen buffer.',
        '  /search [query]                   Quick audits jobs/customers.',
        '  /job add "[title]" "[job#]"       Creates a native job card.',
        '  /todo add "[title]" "[priority]"  Allocates a new todo check.',
        '  /timeclock [in|out] "[staff]"     Clocks staff in/out of shift.',
        ''
      ]);
      return;
    }

    if (action === '/clear') {
      setHistory([]);
      return;
    }

    if (action === '/search') {
      const queryVal = parts.slice(1).join(' ').replace(/['"]/g, '').toLowerCase();
      if (!queryVal) {
        setHistory([...newHistory, 'Error: Search query is empty. Usage: /search Raptor', '']);
        return;
      }

      const matchedJobs = jobs.filter(j => 
        j.title?.toLowerCase().includes(queryVal) || 
        j.customerName?.toLowerCase().includes(queryVal) ||
        j.jobNumber?.toLowerCase().includes(queryVal)
      );

      const matchedCust = customers.filter(c => 
        c.name?.toLowerCase().includes(queryVal) || 
        c.company?.toLowerCase().includes(queryVal) ||
        c.email?.toLowerCase().includes(queryVal)
      );

      const output = [
        `Search Results for "${queryVal}":`,
        `  Matched Jobs (${matchedJobs.length}):`,
        ...matchedJobs.map(j => `    - Job #${j.jobNumber || 'N/A'}: ${j.title} (${j.status})`),
        `  Matched Customers (${matchedCust.length}):`,
        ...matchedCust.map(c => `    - Customer ${c.name || 'N/A'}: ${c.company || 'Private'} (${c.email || 'No Email'})`),
        ''
      ];

      setHistory([...newHistory, ...output]);
      return;
    }

    if (action === '/job') {
      const sub = parts[1]?.toLowerCase();
      if (sub === 'add') {
        const matches = fullCmd.match(/"([^"]+)"/g);
        if (!matches || matches.length < 1) {
          setHistory([...newHistory, 'Error: Incorrect syntax. Usage: /job add "Job Name" "Job#"', '']);
          return;
        }
        const jobName = matches[0].replace(/"/g, '');
        const jobNum = matches[1]?.replace(/"/g, '') || '';

        try {
          await addDoc(collection(db, `businesses/${tenantId}/jobs`), {
            title: jobName,
            jobNumber: jobNum,
            status: 'Open',
            source: 'Native',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user?.uid || 'system',
            createdByName: user?.displayName || user?.email?.split('@')[0] || null,
            createdByEmail: user?.email || null,
            tags: ['Native', 'Console']
          });
          playSound('save');
          setHistory([...newHistory, `Success: Native job "${jobName}" (#${jobNum}) was initialized in Firestore.`, '']);
        } catch (e) {
          setHistory([...newHistory, `Database Exception: Failed to create job record.`, '']);
        }
        return;
      }
    }

    if (action === '/todo') {
      const sub = parts[1]?.toLowerCase();
      if (sub === 'add') {
        const matches = fullCmd.match(/"([^"]+)"/g);
        if (!matches || matches.length < 1) {
          setHistory([...newHistory, 'Error: Incorrect syntax. Usage: /todo add "Todo text" "high|medium|low"', '']);
          return;
        }
        const text = matches[0].replace(/"/g, '');
        const priorityVal = (matches[1]?.replace(/"/g, '') || 'medium').toLowerCase() as any;

        try {
          await addDoc(collection(db, `businesses/${tenantId}/todos`), {
            title: text,
            description: 'Created via Command Console',
            priority: ['low', 'medium', 'high', 'urgent'].includes(priorityVal) ? priorityVal : 'medium',
            status: 'todo',
            assignedStaffIds: [],
            assignedDepartmentIds: [],
            checklist: [],
            createdAt: serverTimestamp()
          });
          playSound('save');
          setHistory([...newHistory, `Success: Task checklist item "${text}" added to the shop board.`, '']);
        } catch (e) {
          setHistory([...newHistory, `Database Exception: Failed to write todo document.`, '']);
        }
        return;
      }
    }

    if (action === '/timeclock') {
      const sub = parts[1]?.toLowerCase();
      const staffName = parts.slice(2).join(' ').replace(/['"]/g, '');
      if ((sub === 'in' || sub === 'out') && staffName) {
        const matched = staff.find(s => 
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(staffName.toLowerCase())
        );
        if (!matched) {
          setHistory([...newHistory, `Error: Staff record matching "${staffName}" was not found.`, '']);
          return;
        }

        try {
          if (sub === 'in') {
            const existing = activeSessions.find(s => s.staffId === matched.id);
            if (existing) {
              setHistory([...newHistory, `Info: ${matched.firstName} is ALREADY clocked in.`, '']);
              return;
            }
            await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
              staffId: matched.id,
              staffName: `${matched.firstName} ${matched.lastName}`,
              status: 'active',
              clockIn: {
                timestamp: new Date().toISOString(),
                note: 'Clocked in via QuickDesk Console'
              },
              jobs: [],
              tenantId
            });
            playSound('save');
            setHistory([...newHistory, `Success: ${matched.firstName} ${matched.lastName} is now CLOCKED IN.`, '']);
          } else {
            const active = activeSessions.find(s => s.staffId === matched.id);
            if (!active) {
              setHistory([...newHistory, `Info: ${matched.firstName} has no active timeclock sessions.`, '']);
              return;
            }
            await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, active.id), {
              status: 'completed',
              clockOut: {
                timestamp: new Date().toISOString(),
                note: 'Clocked out via QuickDesk Console'
              },
              updatedAt: serverTimestamp()
            });
            playSound('save');
            setHistory([...newHistory, `Success: ${matched.firstName} ${matched.lastName} is now CLOCKED OUT.`, '']);
          }
        } catch (e) {
          setHistory([...newHistory, `Database Exception: Failed to clock staff.`, '']);
        }
        return;
      }
    }

    setHistory([...newHistory, `Command unrecognized: "${action}". Verify spelling or check /help.`, '']);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-emerald-400 font-mono text-[11px] p-3 select-text overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-1 mb-2 no-scrollbar">
        {history.map((line, idx) => (
          <div key={idx} className="whitespace-pre-wrap leading-relaxed">{line}</div>
        ))}
        <div ref={historyEndRef} />
      </div>
      <form onSubmit={runCommand} className="flex items-center gap-1 border-t border-zinc-800 pt-2 shrink-0">
        <span className="text-indigo-400 font-bold shrink-0">&gt;_</span>
        <input 
          type="text" 
          value={cmdInput}
          onChange={e => setCmdInput(e.target.value)}
          placeholder="Type /help for system commands..."
          className="flex-1 bg-transparent border-none outline-none text-emerald-300 placeholder-emerald-800 text-[11px] font-mono focus:ring-0 focus:border-0 p-0"
          autoFocus
        />
      </form>
    </div>
  );
};

// ====================================================
// 4. EXCEL-STYLE JOBS LEDGER SPREADSHEET APP
// ====================================================
interface JobsLedgerAppProps {
  tenantId: string;
  jobs: any[];
  customers: any[];
  playSound: (type: 'click' | 'open' | 'save' | 'minimize') => void;
}

export const JobsLedgerApp = ({ tenantId, jobs, customers, playSound }: JobsLedgerAppProps) => {
  const [localJobs, setLocalJobs] = useState<any[]>([]);
  const [dirtyRowIds, setDirtyRowIds] = useState<Record<string, boolean>>({});
  const [addedRowIds, setAddedRowIds] = useState<Record<string, boolean>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    status: 65,
    jobNumber: 90,
    title: 220,
    customer: 160,
    vehicle: 140,
    statusBadge: 100,
    source: 80,
    action: 70
  });

  const startColResizing = (e: React.PointerEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(40, startWidth + deltaX)
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const renderResizeHandle = (colKey: string) => (
    <div
      onPointerDown={(e) => startColResizing(e, colKey)}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-30 select-none"
      style={{ touchAction: 'none' }}
    />
  );

  useEffect(() => {
    const hasUnsavedChanges = Object.keys(dirtyRowIds).length > 0 || Object.keys(addedRowIds).length > 0 || pendingDeletes.size > 0;
    if (!hasUnsavedChanges) {
      setLocalJobs(jobs);
    }
  }, [jobs, dirtyRowIds, addedRowIds, pendingDeletes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleAddRow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localJobs, addedRowIds]);

  useEffect(() => {
    const handleSaveShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const hasUnsavedChanges = Object.keys(dirtyRowIds).length > 0 || Object.keys(addedRowIds).length > 0 || pendingDeletes.size > 0;
        if (hasUnsavedChanges && !isSaving) {
          handleCommitChanges();
        }
      }
    };
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [localJobs, dirtyRowIds, addedRowIds, pendingDeletes, isSaving]);

  const handleAddRow = () => {
    const tempId = `temp_${Date.now()}`;
    let nextNum = 1001;
    const nums = localJobs
      .map(j => parseInt(String(j.jobNumber || '').replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    if (nums.length > 0) {
      nextNum = Math.max(...nums) + 1;
    }
    
    const newJob = {
      id: tempId,
      jobNumber: `JOB-${nextNum}`,
      title: '',
      customerId: '',
      customerName: '',
      vehicleId: '',
      status: 'Open',
      source: 'Native'
    };
    
    setLocalJobs(prev => [newJob, ...prev]);
    setAddedRowIds(prev => ({ ...prev, [tempId]: true }));
    toast.success('Appended blank job. Double click / edit cells inline.');
    playSound('click');
  };

  const toggleDeleteRow = (id: string) => {
    playSound('click');
    if (addedRowIds[id]) {
      setLocalJobs(prev => prev.filter(j => j.id !== id));
      setAddedRowIds(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setPendingDeletes(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          toast.info('Restored job from pending deletion.');
        } else {
          next.add(id);
          toast.warning('Marked job for deletion. Save changes to commit.');
        }
        return next;
      });
    }
  };

  const updateCell = (id: string, field: string, value: any) => {
    setLocalJobs(prev => prev.map(j => {
      if (j.id === id) {
        return { ...j, [field]: value };
      }
      return j;
    }));
    
    if (!addedRowIds[id]) {
      setDirtyRowIds(prev => ({ ...prev, [id]: true }));
    }
  };

  const discardLocalChanges = () => {
    playSound('minimize');
    setDirtyRowIds({});
    setAddedRowIds({});
    setPendingDeletes(new Set());
    setLocalJobs(jobs);
    toast.info('Discarded all unsaved edits.');
  };

  const handleCommitChanges = async () => {
    if (isSaving) return;
    setIsSaving(true);
    playSound('click');
    try {
      let addedCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;

      for (const id of pendingDeletes) {
        await deleteDoc(doc(db, `businesses/${tenantId}/jobs`, id));
        deletedCount++;
      }

      for (const job of localJobs) {
        if (pendingDeletes.has(job.id)) continue;

        if (addedRowIds[job.id]) {
          if (!job.title?.trim()) {
            toast.error(`Please provide a title for Job ${job.jobNumber}`);
            setIsSaving(false);
            return;
          }
          
          const jobData = {
            jobNumber: job.jobNumber || '',
            title: job.title || '',
            customerId: job.customerId || '',
            customerName: job.customerName || 'Walk-in',
            vehicleId: job.vehicleId || '',
            status: job.status || 'Open',
            source: job.source || 'Native',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          await addDoc(collection(db, `businesses/${tenantId}/jobs`), jobData);
          addedCount++;
        } else if (dirtyRowIds[job.id]) {
          const jobRef = doc(db, `businesses/${tenantId}/jobs`, job.id);
          await updateDoc(jobRef, {
            jobNumber: job.jobNumber || '',
            title: job.title || '',
            customerId: job.customerId || '',
            customerName: job.customerName || 'Walk-in',
            vehicleId: job.vehicleId || '',
            status: job.status || 'Open',
            source: job.source || 'Native',
            updatedAt: serverTimestamp()
          });
          updatedCount++;
        }
      }

      setDirtyRowIds({});
      setAddedRowIds({});
      setPendingDeletes(new Set());
      
      playSound('save');
      toast.success(`Excel changes committed! Added: ${addedCount}, Edited: ${updatedCount}, Deleted: ${deletedCount}`);
    } catch (err: any) {
      toast.error(`Error saving changes: ${err.message}`);
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = Object.keys(dirtyRowIds).length > 0 || Object.keys(addedRowIds).length > 0 || pendingDeletes.size > 0;

  const filteredJobs = localJobs.filter(j => 
    (j.title || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
    (j.customerName || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
    (j.jobNumber || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
    (j.vehicleId || '').toLowerCase().includes(filterQuery.toLowerCase())
  );

  const renderStatusSelect = (job: any) => {
    const colors: Record<string, string> = {
      Active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      Open: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      Blocked: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      Completed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      Closed: 'bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border-zinc-500/20'
    };
    const currentColorClass = colors[job.status] || 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';

    return (
      <select
        value={job.status || 'Open'}
        onChange={e => updateCell(job.id, 'status', e.target.value)}
        className={`w-full text-center border rounded px-1 py-0.5 text-[10px] font-black tracking-wider uppercase cursor-pointer outline-none ${currentColorClass}`}
        disabled={pendingDeletes.has(job.id)}
      >
        <option value="Open" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Open</option>
        <option value="Active" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Active</option>
        <option value="Blocked" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Blocked</option>
        <option value="Completed" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Completed</option>
        <option value="Closed" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Closed</option>
      </select>
    );
  };

  const renderSourceSelect = (job: any) => {
    const isQB = job.tags?.includes('QuickBooks') || !!job.quickbooksId;
    return (
      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
        isQB ? 'bg-blue-500/15 text-blue-500' : 'bg-emerald-500/15 text-emerald-500'
      }`}>
        {isQB ? 'QuickBooks' : 'Native'}
      </span>
    );
  };

  const renderCustomerSelect = (job: any) => {
    return (
      <select
        value={job.customerId || ''}
        onChange={e => {
          const selectedId = e.target.value;
          const selectedName = customers.find(c => c.id === selectedId)?.name || 'Walk-in';
          updateCell(job.id, 'customerId', selectedId);
          updateCell(job.id, 'customerName', selectedName);
        }}
        className="w-full bg-transparent border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 rounded p-1 text-xs outline-none text-zinc-700 dark:text-zinc-300 cursor-pointer font-bold"
        disabled={pendingDeletes.has(job.id)}
      >
        <option value="" className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">Walk-in / None</option>
        {customers.map(c => (
          <option key={c.id} value={c.id} className="bg-white dark:bg-zinc-955 text-zinc-855 dark:text-zinc-350">
            {c.name}
          </option>
        ))}
      </select>
    );
  };

  const cellInputClass = "w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-100 dark:focus:bg-zinc-900 rounded p-1 text-xs text-zinc-800 dark:text-zinc-200 transition font-medium placeholder-zinc-400 disabled:opacity-50";
  const cellInputMonoClass = "w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-100 dark:focus:bg-zinc-900 rounded p-1 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 transition disabled:opacity-50";

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 font-sans text-xs select-none">
      
      {/* Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-zinc-200 dark:border-zinc-850 bg-white dark:bg-zinc-955/50 shrink-0">
        <div className="flex items-center gap-2">
          <h4 className="font-black text-sm text-zinc-850 dark:text-zinc-150">Active Work Order Index</h4>
          {hasChanges && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold text-[9px] animate-pulse">
              ⚠️ Unsaved Changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search spreadsheet..." 
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs outline-none w-full"
            />
          </div>
          
          <button
            onClick={handleAddRow}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-650 hover:bg-indigo-750 text-white rounded-lg font-black transition text-xs shadow-sm active:scale-95 disabled:opacity-50"
            title="Add a new blank job row (Alt + N)"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Job</span>
          </button>

          {hasChanges && (
            <>
              <button
                onClick={discardLocalChanges}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-1 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-650 dark:text-zinc-350 rounded-lg font-bold transition text-xs active:scale-95"
              >
                Discard
              </button>

              <button
                onClick={handleCommitChanges}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black transition text-xs shadow-sm active:scale-95 disabled:opacity-50"
                title="Commit all additions, edits, and deletions (Ctrl + S)"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Commit Changes'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 rounded-xl m-3 relative no-scrollbar">
        <table className="table-fixed text-left border-collapse select-text">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-black h-8">
              <th style={{ width: colWidths.status }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 text-center">
                <span>Row</span>
              </th>
              <th style={{ width: colWidths.jobNumber }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 relative">
                <span>Job #</span>
                {renderResizeHandle('jobNumber')}
              </th>
              <th style={{ width: colWidths.title }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 relative">
                <span>Description / Title</span>
                {renderResizeHandle('title')}
              </th>
              <th style={{ width: colWidths.customer }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 relative">
                <span>Customer Link</span>
                {renderResizeHandle('customer')}
              </th>
              <th style={{ width: colWidths.vehicle }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 relative">
                <span>Vehicle (ID/VIN)</span>
                {renderResizeHandle('vehicle')}
              </th>
              <th style={{ width: colWidths.statusBadge }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 relative text-center">
                <span>Status</span>
                {renderResizeHandle('statusBadge')}
              </th>
              <th style={{ width: colWidths.source }} className="p-2 border-r border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 relative text-center">
                <span>Origin</span>
                {renderResizeHandle('source')}
              </th>
              <th style={{ width: colWidths.action }} className="p-2 sticky top-0 bg-zinc-100 dark:bg-zinc-900 z-40 text-center">
                <span>Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  No matching active work orders
                </td>
              </tr>
            ) : (
              filteredJobs.map((j, index) => {
                const isNew = !!addedRowIds[j.id];
                const isDirty = !!dirtyRowIds[j.id];
                const isDeleted = pendingDeletes.has(j.id);
                
                let rowBgClass = "hover:bg-zinc-50 dark:hover:bg-zinc-900/50";
                if (isDeleted) rowBgClass = "bg-rose-500/5 dark:bg-rose-955/10 hover:bg-rose-500/10 text-rose-500 opacity-60";
                else if (isNew) rowBgClass = "bg-emerald-500/5 dark:bg-emerald-955/10 hover:bg-emerald-500/10";
                else if (isDirty) rowBgClass = "bg-amber-500/5 dark:bg-amber-955/10 hover:bg-amber-500/10";

                return (
                  <tr key={j.id} className={`border-b border-zinc-100 dark:border-zinc-850 h-8 transition-colors ${rowBgClass}`}>
                    
                    {/* Row Index */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850 text-center font-mono text-[10px] text-zinc-400 select-none">
                      {index + 1}
                    </td>

                    {/* Job Number */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                      <input
                        type="text"
                        value={j.jobNumber || ''}
                        onChange={e => updateCell(j.id, 'jobNumber', e.target.value)}
                        className={cellInputMonoClass}
                        disabled={isDeleted}
                        placeholder="WO-100X..."
                      />
                    </td>

                    {/* Description/Title */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                      <input
                        type="text"
                        value={j.title || ''}
                        onChange={e => updateCell(j.id, 'title', e.target.value)}
                        className={cellInputClass}
                        disabled={isDeleted}
                        placeholder="Client vehicle customization details..."
                      />
                    </td>

                    {/* Customer Linked */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                      {renderCustomerSelect(j)}
                    </td>

                    {/* Vehicle Linked */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                      <input
                        type="text"
                        value={j.vehicleId || ''}
                        onChange={e => updateCell(j.id, 'vehicleId', e.target.value)}
                        className={cellInputClass}
                        disabled={isDeleted}
                        placeholder="ID or VIN link"
                      />
                    </td>

                    {/* Status badge */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850">
                      {renderStatusSelect(j)}
                    </td>

                    {/* Source Origin */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-850 text-center">
                      {renderSourceSelect(j)}
                    </td>

                    {/* Discard / Delete Action */}
                    <td className="p-1 text-center">
                      <button
                        onClick={() => toggleDeleteRow(j.id)}
                        className={`p-1 rounded transition-all hover:scale-105 active:scale-95 ${
                          isDeleted 
                            ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
                        }`}
                        title={isDeleted ? 'Restore Job' : isNew ? 'Discard new row' : 'Delete Job from Database'}
                      >
                        {isDeleted ? (
                          <span className="font-bold text-[10px] px-1">Undo</span>
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Bar Metrics */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-850 bg-zinc-100 dark:bg-zinc-950 font-mono text-[10px] text-zinc-500 shrink-0">
        <div className="flex items-center gap-3">
          <span>Total Rows: <strong>{localJobs.length}</strong></span>
          <span>Filtered: <strong>{filteredJobs.length}</strong></span>
        </div>

        <div className="flex items-center gap-3">
          <span>Shortcuts: <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded font-black text-zinc-600 dark:text-zinc-300">Alt+N</kbd> Add Row | <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded font-black text-zinc-600 dark:text-zinc-300">Ctrl+S</kbd> Save</span>
          {hasChanges && (
            <span className="flex items-center gap-1">
              Pending: 
              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1 rounded font-bold">+{Object.keys(addedRowIds).length}</span>
              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 rounded font-bold">~{Object.keys(dirtyRowIds).length}</span>
              <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1 rounded font-bold font-mono">-{pendingDeletes.size}</span>
            </span>
          )}
        </div>
      </div>

    </div>
  );
};

// ====================================================
// 5. CUSTOMER DIRECTORY CRM APP
// ====================================================
interface CustomerCRMAppProps {
  tenantId: string;
  customers: any[];
  playSound: (type: 'click' | 'open' | 'save' | 'minimize') => void;
}

export const CustomerCRMApp = ({ customers }: CustomerCRMAppProps) => {
  const [searchVal, setSearchVal] = useState('');
  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 p-4 font-sans text-xs">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-200 dark:border-zinc-850 pb-2 shrink-0">
        <h4 className="font-black text-sm text-zinc-800 dark:text-zinc-200">Customer Accounts Center</h4>
        <div className="relative group w-44">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search CRM..." 
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            className="pl-8 pr-3 py-1 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs outline-none w-full font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-850 bg-white dark:bg-zinc-955 rounded-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-black">
              <th className="p-2 border-r border-zinc-200 dark:border-zinc-800">Account Name</th>
              <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-36">Company</th>
              <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-44">Contact Info</th>
              <th className="p-2 text-center w-28">Source</th>
            </tr>
          </thead>
          <tbody>
            {customers.filter(c => 
              (c.name || '').toLowerCase().includes(searchVal.toLowerCase()) ||
              (c.company || '').toLowerCase().includes(searchVal.toLowerCase()) ||
              (c.email || '').toLowerCase().includes(searchVal.toLowerCase())
            ).map(c => (
              <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-855 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="p-2 border-r border-zinc-200 dark:border-zinc-855 font-black text-zinc-800 dark:text-zinc-200">{c.name || `${c.firstName || ''} ${c.lastName || ''}`}</td>
                <td className="p-2 border-r border-zinc-200 dark:border-zinc-855 font-bold text-zinc-650">{c.company || 'N/A'}</td>
                <td className="p-2 border-r border-zinc-200 dark:border-zinc-855">
                  <div className="flex flex-col gap-0.5 font-mono text-[10px]">
                    {c.email && <span>Email: {c.email}</span>}
                    {c.mobilePhone && <span>Mob: {c.mobilePhone}</span>}
                  </div>
                </td>
                <td className="p-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    c.tags?.includes('QuickBooks') || !!c.quickbooksId ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                  }`}>
                    {c.tags?.includes('QuickBooks') || !!c.quickbooksId ? 'QuickBooks' : 'Native'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ====================================================
// 6. TODO MANAGER APP
// ====================================================
interface TodoManagerAppProps {
  tenantId: string;
  todos: any[];
  staff: any[];
  playSound: (type: 'click' | 'open' | 'save' | 'minimize') => void;
}

export const TodoManagerApp = ({ tenantId, todos, playSound }: TodoManagerAppProps) => {
  const handleToggleTodo = async (id: string, done: boolean) => {
    try {
      const item = todos.find(t => t.id === id);
      if (!item) return;
      await updateDoc(doc(db, `businesses/${tenantId}/todos`, id), {
        status: done ? 'completed' : 'todo',
        updatedAt: serverTimestamp()
      });
      playSound('click');
      toast.success(done ? 'Task marked COMPLETED!' : 'Task reopened');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 p-4 font-sans text-xs">
      <h4 className="font-black text-sm text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-850 pb-2 mb-3 shrink-0">Shop checklist (Live feed)</h4>
      <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
        {todos.map(t => (
          <div 
            key={t.id} 
            className={`p-3 bg-white dark:bg-zinc-950 border rounded-xl flex items-start justify-between shadow-sm hover:border-indigo-500/20 transition-all ${
              t.status === 'completed' ? 'opacity-60 border-zinc-200/50' : 'border-zinc-200 dark:border-zinc-850'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <input 
                type="checkbox"
                checked={t.status === 'completed'}
                onChange={e => handleToggleTodo(t.id, e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-0 focus:ring-offset-0 mt-0.5 cursor-pointer"
              />
              <div>
                <h5 className={`font-black text-zinc-800 dark:text-zinc-200 leading-snug ${t.status === 'completed' ? 'line-through text-zinc-400 dark:text-zinc-600' : ''}`}>
                  {t.title}
                </h5>
                {t.description && <p className="text-[10px] text-zinc-500 mt-0.5">{t.description}</p>}
              </div>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
              t.priority === 'high' || t.priority === 'urgent' ? 'bg-rose-500/10 text-rose-600' : 'bg-zinc-150 text-zinc-500'
            }`}>
              {t.priority || 'medium'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ====================================================
// 7. TIMECLOCK MONITOR APP
// ====================================================
interface TimeclockAppProps {
  tenantId: string;
  activeSessions: any[];
  staff: any[];
  playSound: (type: 'click' | 'open' | 'save' | 'minimize') => void;
}

export const TimeclockApp = ({ activeSessions }: TimeclockAppProps) => (
  <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 p-4 font-sans text-xs">
    <h4 className="font-black text-sm text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-850 pb-2 mb-3 shrink-0">Live Roster Shift Board</h4>
    <div className="flex-1 overflow-y-auto space-y-2.5 no-scrollbar">
      {activeSessions.map(s => (
        <div key={s.id} className="p-3 bg-white dark:bg-zinc-955 border border-emerald-500/20 dark:border-emerald-955/20 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 animate-pulse" />
          <div className="flex items-center gap-3 pl-1.5">
            <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center font-black text-emerald-600 text-sm">
              {s.staffName ? s.staffName.charAt(0) : 'T'}
            </div>
            <div>
              <h5 className="font-black text-zinc-800 dark:text-zinc-200 leading-tight">{s.staffName || 'Technician'}</h5>
              <span className="text-[9px] font-bold text-zinc-400 font-mono tracking-wide uppercase">Active since: {new Date(s.clockIn?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              Working Shift
            </span>
          </div>
        </div>
      ))}
      {activeSessions.length === 0 && (
        <div className="h-40 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-400 text-[10px] font-bold uppercase tracking-widest gap-2">
          <Clock className="w-6 h-6 text-zinc-300 dark:text-zinc-700" />
          No active technicians clocked-in
        </div>
      )}
    </div>
  </div>
);

// ====================================================
// 8. QUICKBOOKS SYNC MONITOR APP
// ====================================================
interface SyncMonitorAppProps {
  syncQueue: any[];
}

export const SyncMonitorApp = ({ syncQueue }: SyncMonitorAppProps) => (
  <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 p-4 font-sans text-xs">
    <h4 className="font-black text-sm text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-850 pb-2 mb-3 shrink-0">QuickBooks Sync Center (Live Queue)</h4>
    <div className="flex-1 overflow-y-auto space-y-2.5 no-scrollbar">
      {syncQueue.map(q => (
        <div key={q.id} className="p-3 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-850 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${
              q.status === 'processing' ? 'bg-blue-500/10 text-blue-600' :
              q.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
              'bg-zinc-100 text-zinc-500'
            }`}>
              <RefreshCw className={`w-4 h-4 ${q.status === 'processing' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h5 className="font-black text-zinc-800 dark:text-zinc-200 leading-tight uppercase text-[10px] tracking-wide">
                {q.action || 'Query sync'}
              </h5>
              <span className="text-[9px] font-bold text-zinc-400 font-mono uppercase mt-0.5 block">Job ID: {q.jobId || 'Global'}</span>
            </div>
          </div>

          <div className="text-right">
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
              q.status === 'processing' ? 'bg-blue-600 text-white animate-pulse' :
              q.status === 'completed' ? 'bg-emerald-600 text-white' :
              'bg-zinc-900 text-white'
            }`}>
              {q.status}
            </span>
            <span className="text-[9px] font-bold text-zinc-400 font-mono mt-1 block">
              {q.createdAt?.toDate ? q.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
            </span>
          </div>
        </div>
      ))}
      {syncQueue.length === 0 && (
        <div className="h-40 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-400 text-[10px] font-bold uppercase tracking-widest gap-2">
          <RefreshCw className="w-6 h-6 text-zinc-300 dark:text-zinc-700" />
          No sync queues recorded in queue
        </div>
      )}
    </div>
  </div>
);
