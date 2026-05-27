# Explorer Analysis — Foreman Hub Extension

This document provides a comprehensive blueprint and precise technical design for implementing the Foreman Standup & Operations Hub features inside the front-end dashboard of `apps/web/src/features/business/MorningMeetingBoard.tsx`.

---

## 1. Exact React State Variables to Add/Modify

The frontend uses Firestore `onSnapshot` listeners to capture reactive data. We can leverage the existing `businesses/${tenantId}/staff` snapshot listener, as any custom properties saved to individual staff member documents (e.g. `dailyTaskSequence`, `dailyCommitNotes`, `hourlyAllocations`) will be automatically synced to the `staff` state and resolved in `reconciledData` in real-time.

Add the following state variables inside `MorningMeetingBoard`:

```typescript
// apps/web/src/features/business/MorningMeetingBoard.tsx

// 1. Tab view state to select between the standard lane board and the new operations hub
const [activeTab, setActiveTab] = useState<'board' | 'operations'>('board');

// 2. Select a staff member to open the Side-Over / Detail Modal for Notes and Hourly Block Allocations
const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

// 3. Local standup commitments note to prevent textarea keystroke lag
const [localNotes, setLocalNotes] = useState<string>('');

// 4. Operations and Sales search query input
const [opsSearchQuery, setOpsSearchQuery] = useState<string>('');
```

### Type Declarations Extensions
Extend the existing interfaces in `MorningMeetingBoard.tsx` (lines 14–82) as follows:

```typescript
interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoURL?: string;
  departmentId?: string;
  individualSchedule?: WorkSchedule;
  jobTitle?: string;
  isArchived?: boolean;
  
  // NEW CUSTOM FIELDS PERSISTED IN FIRESTORE
  dailyTaskSequence?: string[]; // Array of task IDs in sequence
  dailyCommitNotes?: string;    // Text memo of today's standup commitments
  hourlyAllocations?: Record<number, HourlyAllocation>; // Key: Block index (0-7), Value: Allocation details
}

interface HourlyAllocation {
  taskId: string;
  taskTitle: string;
  jobId: string;
  jobNumber?: string;
}
```

---

## 2. Interactive Daily Task Sequencing & Notes

### 2.1 Visual Task Reordering & Ordinal Priorities
In `reconciledData` (lines 293–445), sort the technician's assigned tasks (`assignedJobTasks`) using their `dailyTaskSequence` array before returning:

```typescript
// Inside resolvedStaff mapping loop in reconciledData:
const sequence = member.dailyTaskSequence || [];
const sortedJobTasks = [...assignedJobTasks].sort((a, b) => {
  const indexA = sequence.indexOf(a.task.id);
  const indexB = sequence.indexOf(b.task.id);
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return 0; // Maintain default order for unsequenced tasks
});
```

#### UI Additions on Technician Card Tasks list:
For each task row inside the assignments list, render sequencing buttons (Up/Down arrows) when hovering the task card:

```tsx
{/* Task sequencing buttons inside MorningMeetingBoard.tsx card */}
<div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
  <button 
    onClick={(e) => {
      e.stopPropagation();
      handleMoveTask(rs.member.id, task.id, 'up');
    }}
    disabled={sequenceIndex <= 0}
    className="p-0.5 hover:bg-zinc-800 text-zinc-500 hover:text-white disabled:opacity-30 rounded transition-colors"
    title="Move Task Up"
  >
    <ChevronUp className="w-3.5 h-3.5" />
  </button>
  <button 
    onClick={(e) => {
      e.stopPropagation();
      handleMoveTask(rs.member.id, task.id, 'down');
    }}
    disabled={sequenceIndex === -1 || sequenceIndex === rs.tasks.jobTasks.length - 1}
    className="p-0.5 hover:bg-zinc-800 text-zinc-500 hover:text-white disabled:opacity-30 rounded transition-colors"
    title="Move Task Down"
  >
    <ChevronDown className="w-3.5 h-3.5" />
  </button>
</div>
```

If a sequence order exists, render an ordinal badge indicating priority:
```tsx
{sequenceIndex !== -1 && (
  <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[8px] font-black uppercase px-1.5 py-0.5 rounded leading-none shrink-0">
    {sequenceIndex + 1}{getOrdinalSuffix(sequenceIndex + 1)} priority
  </span>
)}
```
*Helper function `getOrdinalSuffix(i: number)`:*
```typescript
function getOrdinalSuffix(i: number) {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}
```

---

### 2.2 Standing Notes / Commitments Text Area
When a foreman clicks a technician's card, a `StaffDetailModal` slides over or pops up.
Render a standup commitments memo editor:

```tsx
{/* Standing Notes Editor inside StaffDetailModal */}
<div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-md">
  <div className="flex items-center justify-between">
    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
      Morning Commitments & Standup Notes
    </label>
    <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-bold">Auto-saves on blur</span>
  </div>
  <textarea
    value={localNotes}
    onChange={(e) => setLocalNotes(e.target.value)}
    onBlur={() => handleSaveNotes(localNotes)}
    placeholder="What are they committing to finish today? e.g. Finish the fabrication workorder on Job #1042..."
    className="w-full min-h-[100px] p-4 bg-zinc-950 border border-zinc-850 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 rounded-xl text-xs text-white placeholder-zinc-650 outline-none resize-none transition-all leading-relaxed"
  />
</div>
```

---

### 2.3 Visual Hourly Schedule Blocker / Allocator
Display the 8 horizontal or grid blocks in the `StaffDetailModal` representing shift hour slots. Allow the foreman to select from the technician's assigned tasks or department triage tasks to allocate to a block.

```tsx
const HOUR_BLOCKS = [
  { index: 0, label: '08:00 AM - 09:00 AM' },
  { index: 1, label: '09:00 AM - 10:00 AM' },
  { index: 2, label: '10:00 AM - 11:00 AM' },
  { index: 3, label: '11:00 AM - 12:00 PM' },
  { index: 4, label: '12:00 PM - 01:00 PM' },
  { index: 5, label: '01:00 PM - 02:00 PM' },
  { index: 6, label: '02:00 PM - 03:00 PM' },
  { index: 7, label: '03:00 PM - 04:00 PM' }
];
```

#### UI Allocation Layout:
```tsx
<div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-md">
  <div>
    <h4 className="text-xs font-black uppercase text-white tracking-wider">Hourly Shift Schedule Blocker</h4>
    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Plan book hours across today's shift</p>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
    {HOUR_BLOCKS.map(block => {
      const allocation = rs.member.hourlyAllocations?.[block.index];
      
      return (
        <div key={block.index} className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl flex flex-col justify-between gap-3 relative">
          <div>
            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">{block.label}</span>
            {allocation ? (
              <div className="mt-2 space-y-1">
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider block w-fit">
                  {allocation.jobNumber ? `#${allocation.jobNumber}` : 'No Job #'}
                </span>
                <p className="text-[11px] font-bold text-white leading-snug line-clamp-2">{allocation.taskTitle}</p>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-650 italic mt-2">Unallocated block</p>
            )}
          </div>

          <div className="flex gap-2 items-center mt-2 border-t border-zinc-900 pt-2 shrink-0">
            {allocation ? (
              <button
                onClick={() => handleAllocateTask(rs.member.id, block.index, null)}
                className="w-full text-center py-1 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 hover:text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all"
              >
                Clear Slot
              </button>
            ) : (
              <select
                onChange={(e) => {
                  if (e.target.value === '') return;
                  const [taskId, jobId, jobNo, taskTitle] = e.target.value.split('::');
                  handleAllocateTask(rs.member.id, block.index, { taskId, jobId, taskTitle, jobNumber: jobNo });
                  e.target.value = ''; 
                }}
                className="w-full py-1 px-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[9px] font-black uppercase tracking-wider rounded-lg outline-none cursor-pointer"
              >
                <option value="">Allocate...</option>
                <optgroup label="Assigned Tasks">
                  {rs.tasks.jobTasks.map(({ task, job }) => (
                    <option key={task.id} value={`${task.id}::${job.id}::${job.jobNumber || ''}::${task.title}`}>
                      {job.jobNumber ? `#${job.jobNumber}` : ''} - {task.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Unassigned Triage">
                  {reconciledData.deptGroups
                    .find(dg => dg.dept.id === rs.member.departmentId)
                    ?.unassignedTasks.map(({ task, job }) => (
                      <option key={task.id} value={`${task.id}::${job.id}::${job.jobNumber || ''}::${task.title}`}>
                        {job.jobNumber ? `#${job.jobNumber}` : ''} - {task.title} (Triaged)
                      </option>
                    ))
                  }
                </optgroup>
              </select>
            )}
          </div>
        </div>
      );
    })}
  </div>
  
  {/* Actual Clocked Timeline Overlay for Comparison */}
  <div className="border-t border-zinc-850 pt-4 space-y-2">
    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Actual Clocked Timeline (Today)</span>
    {/* Replicating the Timeclock Timeline from LiveTimeclockBoard */}
    {/* Uses chronological bar matching hours worked, lunch/breaks, and job sessions */}
  </div>
</div>
```

---

## 3. Operations & Sales Q&A Search Hub & HUD

### 3.1 Operations HUD & Search Hub Panel Layout
Render the HUD and finder panel within the Operations Tab view:

```tsx
{/* Operations Hub Navigation Option */}
<div className="flex border-b border-zinc-850 gap-4 shrink-0 px-1 mt-2">
  <button
    onClick={() => setActiveTab('board')}
    className={cn(
      "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all",
      activeTab === 'board' ? "border-indigo-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
    )}
  >
    Meeting Board Lanes
  </button>
  <button
    onClick={() => setActiveTab('operations')}
    className={cn(
      "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all",
      activeTab === 'operations' ? "border-indigo-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
    )}
  >
    Operations & Sales Search Hub
  </button>
</div>
```

---

### 3.2 Dynamic Shop Capacity HUD
Compute and display available technician hours today vs total remaining book hours in real-time. 

```typescript
const capacityHUD = useMemo(() => {
  // Sum expectedHoursPerDay for all staff members scheduled today
  const totalAvailableHours = reconciledData.allReconciled.reduce((acc, rs) => {
    if (rs.isScheduledToday && rs.schedule?.expectedHoursPerDay) {
      return acc + Number(rs.schedule.expectedHoursPerDay);
    }
    return acc;
  }, 0);

  // Sum bookTime for all incomplete tasks (Todo/In Progress) under active jobs
  const totalRemainingBookHours = Object.values(jobsTasks).reduce((acc, tasksList) => {
    const remainingTasks = tasksList.filter(t => !['QC Complete', 'QC', 'Completed'].includes(t.status));
    const bookTimeSum = remainingTasks.reduce((sum, t) => {
      const timeVal = parseFloat(t.bookTime || '0');
      return sum + (isNaN(timeVal) ? 0 : timeVal);
    }, 0);
    return acc + bookTimeSum;
  }, 0);

  const ratio = totalAvailableHours > 0 ? (totalRemainingBookHours / totalAvailableHours) * 100 : 0;
  
  let ratioColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  let ratioProgress = 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]';
  if (ratio > 100) {
    ratioColor = 'text-rose-400 bg-rose-500/10 border-rose-500/25';
    ratioProgress = 'bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]';
  } else if (ratio >= 80) {
    ratioColor = 'text-amber-400 bg-amber-500/10 border-amber-500/25';
    ratioProgress = 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]';
  }

  return { totalAvailableHours, totalRemainingBookHours, ratio, ratioColor, ratioProgress };
}, [reconciledData, jobsTasks]);
```

Render HUD at the top of the Operations Panel:
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-lg">
  <div className="space-y-1">
    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Available Capacity Today</span>
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-black text-white">{capacityHUD.totalAvailableHours.toFixed(1)}</span>
      <span className="text-xs font-bold text-zinc-400 uppercase">Hours Scheduled</span>
    </div>
    <p className="text-[10px] text-zinc-500">Sum of shift durations for all scheduled technicians</p>
  </div>
  
  <div className="space-y-1">
    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Shop Workload Remaining</span>
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-black text-white">{capacityHUD.totalRemainingBookHours.toFixed(1)}</span>
      <span className="text-xs font-bold text-zinc-400 uppercase">Book Hours</span>
    </div>
    <p className="text-[10px] text-zinc-500">Sum of book times for all uncompleted active tasks</p>
  </div>
  
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Shop Capacity Load Factor</span>
      <span className={cn("text-[10px] font-black px-2 py-0.5 border rounded uppercase tracking-wider font-mono", capacityHUD.ratioColor)}>
        {capacityHUD.ratio.toFixed(0)}% Load
      </span>
    </div>
    <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-850/50">
      <div className={cn("h-full transition-all duration-500", capacityHUD.ratioProgress)} style={{ width: `${Math.min(capacityHUD.ratio, 100)}%` }} />
    </div>
    <p className="text-[10px] text-zinc-500 uppercase tracking-wide leading-none">
      {capacityHUD.ratio > 100 
        ? '⚠️ Overloaded: remaining tasks exceed scheduled shift hours' 
        : capacityHUD.ratio >= 80 
          ? '🔥 Optimal Load: healthy queue size' 
          : '✅ Underloaded: capacity available to take on more jobs'}
    </p>
  </div>
</div>
```

---

### 3.3 Operations Search Logic
Search input matches Job Number, Customer Name, and VIN against the `jobs` collection:

```tsx
const matchingJobs = useMemo(() => {
  const queryStr = opsSearchQuery.toLowerCase().trim();
  if (!queryStr) return [];

  return jobs.filter(job => {
    const jobNo = job.jobNumber?.toLowerCase() || '';
    const custName = job.customerName?.toLowerCase() || '';
    const vin = job.vehicleVin?.toLowerCase() || '';
    const title = job.title.toLowerCase();

    return jobNo.includes(queryStr) || 
           custName.includes(queryStr) || 
           vin.includes(queryStr) ||
           title.includes(queryStr);
  });
}, [jobs, opsSearchQuery]);
```

Render each matching job card containing details on:
1. **Clocked-in Technician**: Find their name, status, and commitments.
2. **Active Task**: Currently in progress or first todo task.
3. **Estimated Completion Time (ETA)**: Pulled from `job.expectedFinishTime`.

---

## 4. Exact Firebase/Firestore Query and Write Paths

Write paths modify individual staff member documents under `businesses/${tenantId}/staff/${memberId}`. These modifications are reactive and sync immediately down to all clients.

### 4.1 Save / Reorder Sequence:
* **Path**: `businesses/${tenantId}/staff/${memberId}`
* **Query Type**: Document update
* **Firestore Code**:
  ```typescript
  import { doc, updateDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase/config';

  const docRef = doc(db, `businesses/${tenantId}/staff/${memberId}`);
  await updateDoc(docRef, {
    dailyTaskSequence: updatedSequence // Array of task ID strings
  });
  ```

### 4.2 Save Commitments / Standup Notes:
* **Path**: `businesses/${tenantId}/staff/${memberId}`
* **Query Type**: Document update
* **Firestore Code**:
  ```typescript
  import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
  import { db } from '../../lib/firebase/config';

  const docRef = doc(db, `businesses/${tenantId}/staff/${memberId}`);
  await updateDoc(docRef, {
    dailyCommitNotes: notesVal,
    dailyCommitNotesUpdatedAt: serverTimestamp()
  });
  ```

### 4.3 Save Shift Hour allocations:
* **Path**: `businesses/${tenantId}/staff/${memberId}`
* **Query Type**: Document update
* **Firestore Code**:
  ```typescript
  import { doc, updateDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase/config';

  const docRef = doc(db, `businesses/${tenantId}/staff/${memberId}`);
  await updateDoc(docRef, {
    hourlyAllocations: updatedAllocations // Record<number, HourlyAllocation | null>
  });
  ```

---

## 5. Exact Test Strategy and Test Blocks

Create testing suite files `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` and `MorningMeetingBoardStress.test.tsx` to verify sequencing, notes editing, hourly allocations, and Operations Q&A finder.

### 5.1 Unit and Integration Test Blocks (`MorningMeetingBoard.test.tsx`)
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MorningMeetingBoard } from '../MorningMeetingBoard';
import { updateDoc, doc } from 'firebase/firestore';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock Firebase Firestore APIs
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn((query, callback) => {
    // Invoke initial mocks immediately for testing
    callback({
      docs: [
        {
          id: 'tech-1',
          data: () => ({
            firstName: 'John',
            lastName: 'Doe',
            departmentId: 'dept-1',
            jobTitle: 'Lead Fabricator',
            individualSchedule: { days: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '16:00', expectedHoursPerDay: 8 },
            dailyTaskSequence: ['task-2', 'task-1'],
            dailyCommitNotes: 'Will finish fast lane wiring.',
            hourlyAllocations: {
              0: { taskId: 'task-2', jobId: 'job-1', taskTitle: 'Weld bumper bracket', jobNumber: '1001' }
            }
          })
        }
      ]
    });
    return () => {}; // Unsubscribe mock
  }),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP')
}));

describe('MorningMeetingBoard - Foreman Hub Features', () => {
  const tenantId = 'test-tenant';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly sort and display technician assignments based on dailyTaskSequence', async () => {
    render(<MorningMeetingBoard tenantId={tenantId} />);
    
    // Check that priority orders are rendered next to tasks
    await waitFor(() => {
      expect(screen.getByText(/1st Priority/i)).toBeInTheDocument();
      expect(screen.getByText(/Weld bumper bracket/i)).toBeInTheDocument();
    });
  });

  it('should trigger Firestore update when technician task is sequenced up/down', async () => {
    render(<MorningMeetingBoard tenantId={tenantId} />);
    
    await waitFor(() => {
      const downButton = screen.getAllByTitle(/Move Task Down/i)[0];
      fireEvent.click(downButton);
    });

    expect(updateDoc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        dailyTaskSequence: ['task-1', 'task-2']
      })
    );
  });

  it('should render standup commitment note and trigger Firestore save onBlur', async () => {
    render(<MorningMeetingBoard tenantId={tenantId} />);
    
    // Open staff card details
    fireEvent.click(screen.getByText(/John Doe/i));
    
    const textarea = screen.getByPlaceholderText(/What are they committing to finish today/i);
    expect(textarea.value).toBe('Will finish fast lane wiring.');
    
    // Change value and trigger save
    fireEvent.change(textarea, { target: { value: 'Committed to complete engine mount install.' } });
    fireEvent.blur(textarea);
    
    expect(updateDoc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        dailyCommitNotes: 'Committed to complete engine mount install.'
      })
    );
  });

  it('should allocate assigned task to shift hourly blocks and save to Firestore', async () => {
    render(<MorningMeetingBoard tenantId={tenantId} />);
    
    // Click John Doe to open detail slideover
    fireEvent.click(screen.getByText(/John Doe/i));
    
    // Select allocation dropdown for Slot 2 (09:00 AM - 10:00 AM)
    const select = screen.getAllByRole('combobox')[1]; 
    fireEvent.change(select, { target: { value: 'task-1::job-1::1001::Wiring Harness Installation' } });
    
    expect(updateDoc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        hourlyAllocations: expect.objectContaining({
          1: { taskId: 'task-1', jobId: 'job-1', taskTitle: 'Wiring Harness Installation', jobNumber: '1001' }
        })
      })
    );
  });
});
```

---

### 5.2 Stress & Load Test Blocks (`MorningMeetingBoardStress.test.tsx`)
Verify performance when rendering massive datasets (50 technicians, 100 active jobs, 500 tasks):

```typescript
import { render, screen } from '@testing-library/react';
import { MorningMeetingBoard } from '../MorningMeetingBoard';
import { vi, describe, it, expect } from 'vitest';

describe('MorningMeetingBoard Stress Tests', () => {
  it('should render 50 technicians and 100 jobs efficiently without frame lag', () => {
    const startTime = performance.now();
    
    render(<MorningMeetingBoard tenantId="stress-tenant" />);
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Verify initial layout completes under 200ms
    expect(renderTime).toBeLessThan(200);
    expect(screen.getByText(/Operations & Sales Search Hub/i)).toBeInTheDocument();
  });
});
```
