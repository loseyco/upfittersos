# Codebase Analysis: Morning Meeting Board Extensions (Milestone M1)

## 1. Executive Summary
This analysis outlines the precise codebase state, fetching mechanisms, and integration points for the **Foreman Standup & Operations Hub** extensions within `MorningMeetingBoard.tsx` and its test suite `MorningMeetingBoard.test.tsx`. The proposed additions implement:
- **R1: Standup Presentation Focus Mode** (Slide-deck viewport optimized for mounted TV monitors).
- **R2: Daily Operations Briefing Feed & Summary** (Real-time scannable HUD and one-click markdown clipboard sharing).
- **R3: Task Timeline & Pace Warnings** (Visual schedule progress bars and automated pace warnings for overloaded technicians).

---

## 2. Analysis of State Fetching, Processing & Reconciliation

### 2.1 Real-Time Firestore Stream Subscriptions
State is established in `MorningMeetingBoard.tsx` (lines 124–184) using Firebase real-time listeners inside `useEffect` triggered on `tenantId` updates:
- **`businesses/${tenantId}/staff`**: Real-time roster, automatically filters out archived members (`isArchived`).
- **`businesses/${tenantId}/departments`**: Custom department models carrying default schedule details.
- **`businesses/${tenantId}/todos`**: Shop-wide operational reminders.
- **`businesses/${tenantId}/jobs`**: Operational active jobs. Restricts queries to active/working status by filtering: `where('status', 'not-in', ['Completed', 'Delivered'])`.
- **`businesses/${tenantId}/time_sessions`**: Retrieves the most recent 155 sessions. It reconciles javascript-side filtering to lock in only those clocked in today (start time >= midnight today).

### 2.2 Parallel Task Subscription
Active job task listeners are managed in a separate `useEffect` (lines 191–214):
- Generates a comma-separated key `activeJobIdsStr` from sorted active job IDs.
- Subscribes in parallel to `businesses/${tenantId}/jobs/${jobId}/tasks` for each active job.
- Accumulates task items in `jobsTasks` state (`Record<string, JobTask[]>`).

### 2.3 Core Data Reconciler & Aggregator
The data pipeline is synthesized inside `reconciledData` `useMemo` (lines 364–516):
1. **Technician Roster Resolution**: Iterates staff roster and resolves:
   - **Shift Schedule**: Combines `individualSchedule` with fallback to department `defaultSchedule` for today's day of week (`1 = Mon` to `7 = Sun`).
   - **Timeclock Session**: Determines `clockStatus` (`'active'`, `'on_break'`, `'completed'`, `'offline'`), computes net `clockedTimeToday`, identifies active job work session (`activeJobSession`), and splits clocked time into `taskTimeToday` and `unassignedTimeToday` (idle time).
   - **Assignments**: Aggregates job tasks and shop-wide todos assigned to this individual, calculating completion ratios and percentages.
2. **Department Grouping**: Groups resolved technicians into department containers and computes department triage backlogs (`unassignedTasks` inside department that are not completed).

---

## 3. Precise Implementation Strategy for Requirements (R1, R2, R3)

### 3.1 R1: Standup Presentation Focus Mode

#### State Variables
To be added inside the `MorningMeetingBoard` function:
```typescript
const [isPresentationMode, setIsPresentationMode] = useState(false);
const [presentationIndex, setPresentationIndex] = useState(0);
```

#### Roster Filter & Active Selection
Only scheduled or currently present technicians are cycled through during the standup slide deck:
```typescript
const presentationStaffList = useMemo(() => {
  return reconciledData.allReconciled.filter(
    s => s.isScheduledToday || ['active', 'on_break'].includes(s.clockStatus)
  );
}, [reconciledData.allReconciled]);

const activePresentationStaff = presentationStaffList[presentationIndex] || null;
```

#### Navigation & Shortcuts Keyboard Handlers
A keydown event listener binds left/right arrows, spacebar, and escape shortcuts:
```typescript
useEffect(() => {
  if (!isPresentationMode || presentationStaffList.length === 0) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      setPresentationIndex(prev => (prev + 1) % presentationStaffList.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPresentationIndex(prev => (prev - 1 + presentationStaffList.length) % presentationStaffList.length);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsPresentationMode(false);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isPresentationMode, presentationStaffList.length]);
```

#### Viewport UI & Group Readability
- **Overlay Viewport**: If `isPresentationMode` is active, the entire `main` container is replaced with a single-technician focal slide deck.
- **Enlarged Typography**:
  - Technician Name: `text-5xl font-black text-white mb-2`
  - Title/Job Role: `text-2xl text-zinc-400 font-bold uppercase tracking-wider`
  - Checklist Items & Triage Tasks: Expanded height/padding, titles at `text-lg font-bold`, descriptions at `text-sm text-zinc-400`.
- **Expanded Progress Bar**: Horizontal height increased to `h-5` with text percentage at `text-xl font-mono font-black text-white`.
- **Navigation HUD controls**:
  - Touch-friendly buttons for `< Previous` and `Next >` spanning `px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl font-black hover:bg-zinc-800 transition-all`.
  - Progress tracker showing `Roster Step: ${presentationIndex + 1} of ${presentationStaffList.length}`.
  - Large red exit button: `onClick={() => setIsPresentationMode(false)}`.

---

### 3.2 R2: Daily Operations Briefing Feed & Summary

#### Tab State Variable
```typescript
const [activeTab, setActiveTab] = useState<'board' | 'briefing'>('board');
```
A Tab Selection HUD is rendered near the header controls:
- **"Roster Lanes" Button**: sets `activeTab` to `'board'`.
- **"Operations Briefing" Button**: sets `activeTab` to `'briefing'`.

#### Real-Time Briefing Live Insights

##### 1. Attendance Insights
Calculated dynamically from `reconciledData.allReconciled`:
```typescript
const attendanceStats = useMemo(() => {
  const present = reconciledData.allReconciled.filter(s => s.clockStatus === 'active' || s.clockStatus === 'on_break');
  const scheduled = reconciledData.allReconciled.filter(s => s.isScheduledToday);
  const absent = reconciledData.allReconciled.filter(s => s.isScheduledToday && s.clockStatus === 'offline');
  return {
    presentCount: present.length,
    scheduledCount: scheduled.length,
    absentList: absent.map(s => `${s.member.firstName} ${s.member.lastName}`)
  };
}, [reconciledData.allReconciled]);
```

##### 2. Active Blocker Alerts
Identifies blocked jobs and extracts blocker comments:
```typescript
const blockedJobs = useMemo(() => {
  return jobs.filter(j => {
    const isBlockedState = j.status === 'Blocked' || 
      !!(j as any).blocker || 
      (j as any).blockers?.some((b: any) => b.status === 'active');
    return isBlockedState;
  }).map(j => {
    const reason = (j as any).blocker || 
      (j as any).blockers?.find((b: any) => b.status === 'active')?.message || 
      'Job marked as blocked.';
    return {
      jobNumber: j.jobNumber || 'N/A',
      title: j.title,
      reason
    };
  });
}, [jobs]);
```

##### 3. Unassigned Department Backlogs
Extracts pending triage items:
```typescript
const unassignedBacklogs = useMemo(() => {
  return reconciledData.deptGroups.map(group => ({
    departmentName: group.dept.name,
    tasks: group.unassignedTasks.map(ut => ({
      title: ut.task.title,
      jobNumber: ut.job.jobNumber || 'N/A',
      jobTitle: ut.job.title
    }))
  })).filter(g => g.tasks.length > 0);
}, [reconciledData.deptGroups]);
```

##### 4. Dynamic ETA Calculations for Target Jobs
Integrates `parseSafeDate`, `projectWorkingHours`, and `calculateDynamicETA` adapted directly from `BayMonitor.tsx`:
```typescript
const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try { return val.toDate(); } catch (e) {}
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const projectWorkingHours = (startDate: Date, totalHours: number, schedule: any) => {
  if (totalHours <= 0) return startDate;
  const days = schedule?.days || [1, 2, 3, 4, 5];
  const startStr = schedule?.startTime || "08:00";
  const endStr = schedule?.endTime || "17:00";
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  const dailyWorkMs = ((endH * 60 + endM) - (startH * 60 + startM)) * 60000;
  if (dailyWorkMs <= 0 || days.length === 0) return startDate;
  
  let current = new Date(startDate);
  let remainingMs = totalHours * 3600000;
  
  while (remainingMs > 0) {
    const dayOfWeek = current.getDay();
    const mappedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    
    if (!days.includes(mappedDay)) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    const startOfShift = new Date(current);
    startOfShift.setHours(startH, startM, 0, 0);
    const endOfShift = new Date(current);
    endOfShift.setHours(endH, endM, 0, 0);
    
    if (current >= endOfShift) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    if (current < startOfShift) current = new Date(startOfShift);
    
    const msLeftInShift = endOfShift.getTime() - current.getTime();
    if (remainingMs <= msLeftInShift) {
      current = new Date(current.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= msLeftInShift;
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }
  }
  return current;
};

const calculateDynamicETA = (job: any, tasks: any[], departments: any[]) => {
  if (!tasks || tasks.length === 0) return null;
  const nonGeneralTasks = tasks.filter(t => t && t.title !== 'General');
  const incompleteTasks = nonGeneralTasks.filter(t => t && t.status !== 'QC Complete' && t.status !== 'QC');
  
  if (incompleteTasks.length === 0 && (job?.status === 'Ready for Customer' || job?.status === 'Completed')) {
     return null;
  }
  if (incompleteTasks.length === 0) return parseSafeDate(job?.expectedFinishTime);
  
  const deptHours: Record<string, number> = {};
  incompleteTasks.forEach(t => {
    const d = t.departmentId || 'unassigned';
    deptHours[d] = (deptHours[d] || 0) + (parseFloat(t.bookTime) || 0);
  });
  
  const nowTime = new Date();
  let maxETA = nowTime;
  
  Object.entries(deptHours).forEach(([deptId, hours]) => {
    const dept = departments.find(d => d.id === deptId);
    const schedule = dept?.defaultSchedule;
    const eta = projectWorkingHours(nowTime, hours, schedule);
    if (eta > maxETA) maxETA = eta;
  });
  
  return maxETA;
};
```

These utilities allow generating active job completion dates dynamically:
```typescript
const jobETAs = useMemo(() => {
  return jobs.map(job => {
    const tasks = jobsTasks[job.id] || [];
    const etaDate = calculateDynamicETA(job, tasks, departments);
    return {
      jobNumber: job.jobNumber || 'N/A',
      title: job.title,
      eta: etaDate
    };
  });
}, [jobs, jobsTasks, departments]);
```

#### One-Click Clipboard Share (Clipboard Helper)
Clicking the "Copy Briefing to Clipboard" formats the real-time aggregated metrics into bulleted Markdown and pushes to clipboard:
```typescript
const handleCopyBriefing = () => {
  const dateStr = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  
  let md = `# 📋 Daily Operations Briefing — ${dateStr}\n\n`;
  
  md += `## 👥 Attendance Insights\n`;
  md += `- **Present**: ${attendanceStats.presentCount} / ${attendanceStats.scheduledCount} present today\n`;
  if (attendanceStats.absentList.length > 0) {
    md += `- **Absent**: ${attendanceStats.absentList.join(', ')}\n`;
  } else {
    md += `- **Absent**: None\n`;
  }
  md += `\n`;
  
  md += `## 🛑 Active Blocker Alerts\n`;
  if (blockedJobs.length > 0) {
    blockedJobs.forEach(bj => {
      md += `- **Job #${bj.jobNumber} (${bj.title})**: ${bj.reason}\n`;
    });
  } else {
    md += `- *No active blockers today!*\n`;
  }
  md += `\n`;
  
  md += `## 📥 Unassigned Department Backlogs\n`;
  if (unassignedBacklogs.length > 0) {
    unassignedBacklogs.forEach(g => {
      md += `### ${g.departmentName}\n`;
      g.tasks.forEach(t => {
        md += `- ${t.title} (Job #${t.jobNumber}: ${t.jobTitle})\n`;
      });
    });
  } else {
    md += `- *No unassigned department backlogs!*\n`;
  }
  md += `\n`;
  
  md += `## ⏳ Expected Job ETAs\n`;
  if (jobETAs.length > 0) {
    jobETAs.forEach(job => {
      const etaStr = job.eta ? job.eta.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD';
      md += `- **Job #${job.jobNumber} (${job.title})**: Expected completion: ${etaStr}\n`;
    });
  } else {
    md += `- *No active jobs!*\n`;
  }
  
  navigator.clipboard.writeText(md)
    .then(() => toast.success("Briefing copied to clipboard!"))
    .catch(() => toast.error("Failed to copy briefing"));
};
```

---

### 3.3 R3: Technician Shift vs Clock Timeline Overlay

#### Proportional Shift Bounds Calculation
For each technician card, the scheduled boundaries bounds mapped to `now` (midnight today relative start/end offset):
```typescript
const getShiftBounds = (schedule: any) => {
  if (!schedule) return null;
  const today = new Date();
  const [startH, startM] = (schedule.startTime || "08:00").split(':').map(Number);
  const [endH, endM] = (schedule.endTime || "17:00").split(':').map(Number);
  
  const start = new Date(today);
  start.setHours(startH, startM, 0, 0);
  
  const end = new Date(today);
  end.setHours(endH, endM, 0, 0);
  
  return { startMs: start.getTime(), endMs: end.getTime() };
};
```

#### Timeline Progress Bar Rendering Formulas
Within the technician card:
```typescript
const bounds = getShiftBounds(rs.schedule);
let clockInPct = 0;
let endPct = 0;
let nowPct = 0;
let showNowMarker = false;

if (bounds) {
  const duration = bounds.endMs - bounds.startMs;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - bounds.startMs) / duration) * 100));

  const session = timeSessions.find(s => s.userId === rs.member.id);
  if (session) {
    const clockInMs = session.clockIn.timestamp?.toDate 
      ? session.clockIn.timestamp.toDate().getTime() 
      : new Date(session.clockIn.timestamp).getTime();
      
    const clockOutMs = session.clockOut?.timestamp
      ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
      : null;
      
    clockInPct = pct(clockInMs);
    endPct = clockOutMs ? pct(clockOutMs) : pct(now);
  }
  nowPct = pct(now);
  showNowMarker = now >= bounds.startMs && now <= bounds.endMs;
}
```

#### Timeline Overlay UI
Renders on the card below the profile details:
- **Base Track**: `w-full h-3 bg-zinc-950 rounded-full relative border border-zinc-850/50 overflow-hidden`
- **Actual Work block**: `<div className="absolute h-full bg-emerald-500/80" style={{ left: `${clockInPct}%`, width: `${Math.max(0, endPct - clockInPct)}%` }} />`
- **Break blocks**: Iterate `session.breaks` array and project starting/ending times to absolute percentages. Render `<div className="absolute h-full bg-amber-500/70" style={{ left: `${bStartPct}%`, width: `${bEndPct - bStartPct}%` }} />`.
- **Current Time Indicator**: Blinking vertical red marker:
```typescript
{showNowMarker && (
  <div 
    className="absolute top-0 bottom-0 w-0.5 bg-rose-500 animate-pulse z-10 flex items-center justify-center"
    style={{ left: `${nowPct}%` }}
  >
    <span className="w-1.5 h-1.5 bg-rose-400 rounded-full border border-rose-600 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
  </div>
)}
```

#### Pace Warnings Calculations
Technicians loaded with remaining book tasks approaching shift bounds:
```typescript
const remainingBookHours = rs.tasks.jobTasks
  .filter(({ task }) => !['QC Complete', 'QC', 'Completed'].includes(task.status))
  .reduce((sum, { task }) => sum + (parseFloat(task.bookTime || '0') || 0), 0);

const shiftRemainingHours = bounds ? Math.max(0, bounds.endMs - now) / 3600000 : 0;
const hasPaceWarning = rs.isScheduledToday && remainingBookHours > 4 && shiftRemainingHours > 0 && shiftRemainingHours < 2;
```
If `hasPaceWarning === true`, render a pulsing rose indicator badge:
```typescript
{hasPaceWarning && (
  <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/25 px-2 py-1 rounded-xl shadow-[0_0_12px_rgba(239,68,68,0.2)] animate-pulse">
    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest leading-none">
      PACE ALERT
    </span>
  </div>
)}
```

---

## 4. Test Activation Plan & Specifications

### 4.1 Activation Steps
1. Navigate to `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx`.
2. Remove `.skip` from the target describe blocks:
   - `describe.skip('MorningMeetingBoard - R1: Standup Presentation Focus Mode', ...)` -> `describe('MorningMeetingBoard - R1: Standup Presentation Focus Mode', ...)`
   - `describe.skip('MorningMeetingBoard - R2: Daily Operations Briefing Feed', ...)` -> `describe('MorningMeetingBoard - R2: Daily Operations Briefing Feed', ...)`
   - `describe.skip('MorningMeetingBoard - R3: Timeline & Pace Warnings', ...)` -> `describe('MorningMeetingBoard - R3: Timeline & Pace Warnings', ...)`

### 4.2 Test Suite Verification Specifications

#### 4.2.1 R1: Presentation Focus Mode Tests
- **Focuses first clocked-in card**:
  - Render `MorningMeetingBoard` with 1 active tech and 1 offline tech.
  - Query standard header, click button `/presentation mode/i`.
  - Assert active card displays correct name and offline cards are absent/hidden.
- **Cycles active cards**:
  - Emit two active technicians (John Doe, Jane Smith).
  - Click Presentation Mode. Assert John is active.
  - Query `/next/i` button and click. Assert Jane is active.
  - Dispatch keyboard `ArrowLeft` on `window`. Assert John is active.
  - Dispatch keyboard `ArrowRight` on `window`. Assert Jane is active.
- **Exiting presentation mode**:
  - In Presentation Mode, dispatch keyboard `Escape`.
  - Assert standard Lanes header "FAST Team" and "Fabrication" headers are again visible.

#### 4.2.2 R2: Daily Operations Briefing Feed Tests
- **Operational Summary aggregation**:
  - Emit 1 active, 1 offline scheduled (Jane Smith - Absent).
  - Emit a job carrying an active blocker: `[{ message: 'Waiting on custom harnesses', status: 'active' }]`.
  - Emit an unassigned task "Mount Subfloor" in `dept-fast`.
  - Click tab button `/operations briefing/i`.
  - Assert text `/Jane Smith/i` exists (absent list).
  - Assert text `/Waiting on custom harnesses/i` exists (blockers).
  - Assert text `/Mount Subfloor/i` exists (unassigned backlog).
- **Clipboard Markdown Share**:
  - Spy on `navigator.clipboard.writeText` before render.
  - Click copy button `/copy briefing/i`.
  - Assert spy was triggered.
  - Assert the copied payload includes standard markdown tags: `# 📋 Daily Operations Briefing`, `👥 Attendance Insights`, `🛑 Active Blocker Alerts`, etc.

#### 4.2.3 R3: Timeline Overlay & Warnings Tests
- **Shift progress bar rendering**:
  - Emit schedule starting at `08:00` and ending at `17:00`. Emit session clock-in at `09:00`.
  - Assert that progress overlay container element renders.
- **Pace warnings validation**:
  - Control mock clock / fake timers to `3:30 PM` (1.5 hours remaining in scheduled shift ending `5:00 PM`).
  - Emit incomplete tasks for active member with total `bookTime` of 5 hours.
  - Assert that `PACE ALERT` badge is rendered on technician card.
  - Move mock clock to `1:00 PM` (4 hours remaining). Assert that `PACE ALERT` badge is NOT rendered.
