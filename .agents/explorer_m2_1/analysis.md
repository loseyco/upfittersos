# Operational Analysis & Implementation Plan: Foreman Standup & Operations Hub

This analysis report provides a read-only architectural investigation and concrete implementation blueprints for adding R1 (Standup Presentation Focus Mode), R2 (Daily Operations Briefing Feed & Summary), and R3 (Task Timeline vs Shift Schedule Overlay) to the `MorningMeetingBoard` React component.

---

## 1. R1: Standup Presentation Focus Mode

### 1.1 UI & Dark-Glassmorphic Aesthetic
Focus Mode will render a full-screen/container overlay that highlights a single staff member's active standing card at a time. It uses standard Lucide icons (`ChevronLeft`, `ChevronRight`, `X`) and matches the existing theme using dark zinc colors, low opacity borders, high-blur glass, and soft glows.

*   **Overlay Container**: Absolute-positioned covering the entire `MorningMeetingBoard` viewport with high z-index.
    *   `className="absolute inset-0 z-40 bg-zinc-950/95 backdrop-blur-md flex flex-col p-8 md:p-12 text-zinc-100 overflow-hidden"`
*   **Slide Card Layout**: Centered card with fixed aspects and vertical/horizontal flexibility.
    *   `className="w-full max-w-5xl mx-auto my-auto bg-zinc-900/40 border border-zinc-800 rounded-[32px] p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col justify-between backdrop-blur-xl relative overflow-hidden"`
*   **Aesthetic Pattern Overlay**: A subtle glowing SVG mesh or radial gradient behind the active staff details.
    *   `className="absolute right-0 top-0 bottom-0 w-96 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500 via-transparent to-transparent pointer-events-none"`

### 1.2 "10-Foot Readability" Visual Scaling
Mounted display screens in busy shop floors demand dramatic scale-ups of typography, bars, and lists to be legible from 10+ feet:
*   **Typography**:
    *   Staff Name: `text-5xl md:text-6xl font-black text-white tracking-tight`
    *   Job Title & Department: `text-xl md:text-2xl font-bold text-zinc-400 uppercase tracking-widest`
    *   Work Hours/Unassigned status: `text-lg font-mono text-emerald-400 font-bold bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20`
*   **Progress Indicator**:
    *   Bar: Raised height to `h-6` or `h-8` with an embedded progress percentage.
    *   Progress Text: `text-3xl font-black font-mono text-white` showing completed vs total assignments (e.g. `4 / 5`).
*   **Checklist Rows**:
    *   Icon size: Scale lucide checkboxes (`CheckCircle2`, `Circle`) to `w-7 h-7` or `w-8 h-8`.
    *   Task text: Scale to `text-xl md:text-2xl font-bold leading-snug`.
    *   Subtitle (Job reference): `text-sm font-bold text-zinc-500 uppercase tracking-wider block mt-1`.
    *   Vertical spacing: Generous padding (`p-4`) and gap (`gap-4`) in the list grid to prevent clutter.

### 1.3 Key Event Handlers & Touch Controls
*   **Active Present Staff Filter**: Collect present technicians currently clocked in or on break:
    ```typescript
    const presentStaff = useMemo(() => {
      return reconciledData.allReconciled.filter(
        s => s.clockStatus === 'active' || s.clockStatus === 'on_break'
      );
    }, [reconciledData.allReconciled]);
    ```
*   **Focus Index State**:
    ```typescript
    const [focusedStaffId, setFocusedStaffId] = useState<string | null>(null);
    const currentFocusIndex = useMemo(() => {
      return presentStaff.findIndex(s => s.member.id === focusedStaffId);
    }, [presentStaff, focusedStaffId]);
    ```
*   **Keyboard Navigation Hooks**: Listen globally when Focus Mode is active:
    ```typescript
    useEffect(() => {
      if (!focusedStaffId) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') {
          const nextIndex = (currentFocusIndex + 1) % presentStaff.length;
          setFocusedStaffId(presentStaff[nextIndex]?.member.id || null);
        } else if (e.key === 'ArrowLeft') {
          const prevIndex = (currentFocusIndex - 1 + presentStaff.length) % presentStaff.length;
          setFocusedStaffId(presentStaff[prevIndex]?.member.id || null);
        } else if (e.key === 'Escape') {
          setFocusedStaffId(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedStaffId, currentFocusIndex, presentStaff]);
    ```
*   **Touch Navigation Controls**: Docked side buttons extending outer slide regions:
    *   Prev Control: `className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 bg-zinc-900/60 hover:bg-zinc-800/80 active:scale-95 border border-zinc-800 rounded-full flex items-center justify-center transition-all cursor-pointer z-50 hover:border-indigo-500/40 text-zinc-400 hover:text-white"`
    *   Next Control: `className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 bg-zinc-900/60 hover:bg-zinc-800/80 active:scale-95 border border-zinc-800 rounded-full flex items-center justify-center transition-all cursor-pointer z-50 hover:border-indigo-500/40 text-zinc-400 hover:text-white"`

---

## 2. R2: Daily Operations Briefing Feed & Summary

To provide the foreman with a single operational scannable cockpit view, the component will introduce a third layout mode: `'briefing'`. This will be structured as a fully scannable glassmorphic layout.

### 2.1 Tab Layout & Toggle Integration
The header will add a `'briefing'` layout button:
```typescript
// Header layout block update:
<div className="bg-zinc-900 p-0.5 rounded-xl border border-zinc-800 flex">
  <button
    onClick={() => setLayoutMode('lanes')}
    className={cn(
      "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
      layoutMode === 'lanes' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
    )}
  >
    Lanes
  </button>
  <button
    onClick={() => setLayoutMode('grid')}
    className={cn(
      "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
      layoutMode === 'grid' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
    )}
  >
    Grid
  </button>
  <button
    onClick={() => setLayoutMode('briefing')}
    className={cn(
      "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
      layoutMode === 'briefing' ? "bg-indigo-600 text-white shadow-[0_0_8px_rgba(99,102,241,0.35)]" : "text-zinc-500 hover:text-zinc-300"
    )}
  >
    Briefing
  </button>
</div>
```

### 2.2 Metrics & HUD Panels
In `'briefing'` mode, render a grid layout split into 4 sections:
1.  **Attendance (Scheduled vs Present)**:
    *   Present count: `reconciledData.allReconciled.filter(s => s.clockStatus === 'active' || s.clockStatus === 'on_break').length`
    *   Scheduled count: `reconciledData.allReconciled.filter(s => s.isScheduledToday).length`
    *   Absent/Late Technicians list: Scheduled today, but offline. Render with dynamic glowing outline `border-rose-500/20 bg-rose-500/[0.02]`.
2.  **Active Blockers**:
    *   Compute using the `jobs` collection and filter jobs with active blocker attributes:
        ```typescript
        const blockedJobs = useMemo(() => {
          return jobs.filter(j => 
            j.status === 'Blocked' || 
            j.blocker || 
            (j.blockers || []).some((b: any) => b.status === 'active')
          );
        }, [jobs]);
        ```
    *   Renders each blocked job's vehicle/customer context alongside the active blocker message string.
3.  **Unassigned Dept Tasks (Triage Queue)**:
    *   Lists unassigned tasks aggregated by department to resolve in the meeting. Ready to assign in place.
4.  **Promised ETAs (Expected Completion Times)**:
    *   Tabulates jobs containing `expectedFinishTime` (which maps from `ETAModal.tsx`). Sorted chronologically so that upcoming completions appear at the top.

### 2.3 Clipboard Markdown Summary Generator
An action button `Copy Summary to Clipboard` will format these HUD sections into a formatted markdown text structure:
```typescript
const handleCopyToClipboard = () => {
  const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  let docText = `# Morning Operations Briefing — ${todayStr}\n\n`;
  
  // 1. Attendance Metrics
  const scheduled = reconciledData.allReconciled.filter(s => s.isScheduledToday);
  const present = reconciledData.allReconciled.filter(s => s.clockStatus === 'active' || s.clockStatus === 'on_break');
  const absent = reconciledData.allReconciled.filter(s => s.isScheduledToday && s.clockStatus === 'offline');
  
  docText += `## Attendance\n`;
  docText += `- **Present**: ${present.length} / ${scheduled.length} scheduled\n`;
  if (absent.length > 0) {
    docText += `- **Absent / Late**: ${absent.map(t => `${t.member.firstName} ${t.member.lastName}`).join(', ')}\n`;
  } else {
    docText += `- **Absent / Late**: None\n`;
  }
  docText += `\n`;
  
  // 2. Active Job Blockers
  docText += `## Active Blockers\n`;
  if (blockedJobs.length > 0) {
    blockedJobs.forEach(j => {
      const msg = j.blocker || (j.blockers || []).find((b: any) => b.status === 'active')?.message || 'Job blocked';
      docText += `- **Job #${j.jobNumber || 'N/A'} ${j.title}**: ${msg}\n`;
    });
  } else {
    docText += `- No active blockers today.\n`;
  }
  docText += `\n`;
  
  // 3. Unassigned Triage
  docText += `## Unassigned Department Tasks\n`;
  let hasUnassigned = false;
  reconciledData.deptGroups.forEach(group => {
    if (group.unassignedTasks.length > 0) {
      hasUnassigned = true;
      docText += `### ${group.dept.name}\n`;
      group.unassignedTasks.forEach(({ task, job }) => {
        docText += `- **#${job.jobNumber || 'N/A'} ${job.title}**: ${task.title} (${task.bookTime || '0'}h)\n`;
      });
    }
  });
  if (!hasUnassigned) {
    docText += `- No unassigned tasks.\n`;
  }
  docText += `\n`;
  
  // 4. Promised ETAs
  docText += `## Job Completion ETAs\n`;
  const etaJobs = jobs.filter(j => j.expectedFinishTime);
  if (etaJobs.length > 0) {
    etaJobs.forEach(j => {
      const etaStr = new Date(j.expectedFinishTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const etaDate = new Date(j.expectedFinishTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      docText += `- **#${j.jobNumber || 'N/A'} ${j.title}**: expected finished by ${etaStr} on ${etaDate}\n`;
    });
  } else {
    docText += `- No promised job completion dates scheduled.\n`;
  }
  
  navigator.clipboard.writeText(docText);
  toast.success('Morning Ops Briefing Summary copied to clipboard!');
};
```

---

## 3. R3: Task Timeline vs Shift Schedule Overlay

To prevent production gaps, each technician card will render a visual shift overlay that correlates shift duration with timeclock events, alongside a workload pace alert indicator.

### 3.1 Proportional Math & Layout Engine
We will map shift hours to a `[0%, 100%]` grid representing the scheduled shift duration:
```typescript
const getShiftTimelineProps = (rs: any) => {
  if (!rs.isScheduledToday || !rs.schedule) return null;
  
  const todayDateStr = new Date().toDateString();
  const shiftStart = new Date(`${todayDateStr} ${rs.schedule.startTime}`).getTime();
  const shiftEnd = new Date(`${todayDateStr} ${rs.schedule.endTime}`).getTime();
  const shiftTotal = shiftEnd - shiftStart;
  
  if (shiftTotal <= 0) return null;

  const session = timeSessions.find(s => s.userId === rs.member.id);
  if (!session) {
    return { shiftStart, shiftEnd, shiftTotal, hasSession: false };
  }

  const clockInTime = session.clockIn.timestamp?.toDate 
    ? session.clockIn.timestamp.toDate().getTime() 
    : new Date(session.clockIn.timestamp).getTime();
  
  const clockOutTime = session.clockOut?.timestamp 
    ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
    : now;

  const getPct = (timeMs: number) => {
    const pct = ((timeMs - shiftStart) / shiftTotal) * 100;
    return Math.max(0, Math.min(100, pct)); // Clamped relative to shift boundary
  };

  const startPct = getPct(clockInTime);
  const endPct = getPct(clockOutTime);
  const widthPct = Math.max(2, endPct - startPct);
  const nowPct = getPct(now);
  const isNowWithinShift = now >= shiftStart && now <= shiftEnd;

  return {
    shiftStart,
    shiftEnd,
    shiftTotal,
    hasSession: true,
    startPct,
    endPct,
    widthPct,
    nowPct,
    isNowWithinShift
  };
};
```

### 3.2 Visual Render Elements
Render a proportional dual-state visual bar above the daily assignments section in the technician's card:
```typescript
{(() => {
  const props = getShiftTimelineProps(rs);
  if (!props) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-2 bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-850/50">
      {/* Shift header line */}
      <div className="flex items-center justify-between text-[8px] font-black text-zinc-500 uppercase tracking-widest">
        <span>Timeline ({rs.schedule.startTime} - {rs.schedule.endTime})</span>
        {props.hasSession && (
          <span className="text-zinc-400">
            Clocked: {formatMillisToDuration(rs.clockedTimeToday)}
          </span>
        )}
      </div>

      {/* Visual Timeline Bar */}
      <div className="relative w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
        {/* Clocked session segment overlay */}
        {props.hasSession && (
          <div 
            className={cn(
              "absolute top-0 bottom-0 rounded-full transition-all duration-500",
              rs.clockStatus === 'active' 
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" 
                : rs.clockStatus === 'on_break'
                  ? "bg-amber-500"
                  : "bg-zinc-600"
            )}
            style={{ left: `${props.startPct}%`, width: `${props.widthPct}%` }}
          />
        )}

        {/* Pulsing red Current Time (now) indicator */}
        {props.isNowWithinShift && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 animate-pulse z-10"
            style={{ left: `${props.nowPct}%` }}
          />
        )}
      </div>
    </div>
  );
})()}
```

### 3.3 Workload Pace Warning Trigger
*   **Formula Calculation**:
    *   `remainingBookHours` = Sum of unfinished `parseFloat(task.bookTime) || 0` for this staff member today.
    *   `shiftTimeRemaining` = `(shiftEnd - now) / (1000 * 60 * 60)` in decimal hours.
*   **Trigger Code & Alert Styling**:
    ```typescript
    const remainingBookHours = useMemo(() => {
      return rs.tasks.jobTasks
        .filter(item => !['QC Complete', 'QC', 'Completed'].includes(item.task.status))
        .reduce((acc, item) => acc + (parseFloat(item.task.bookTime || '0') || 0), 0);
    }, [rs.tasks.jobTasks]);

    const shiftEnd = rs.schedule ? new Date(`${new Date().toDateString()} ${rs.schedule.endTime}`).getTime() : 0;
    const shiftTimeRemaining = rs.schedule ? (shiftEnd - now) / 3600000 : 0;

    const showPaceWarning = remainingBookHours > 4 && shiftTimeRemaining < 2 && rs.clockStatus === 'active';

    // In the render return:
    {showPaceWarning && (
      <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-2.5 rounded-xl flex items-start gap-2 text-[10px] font-black uppercase tracking-wider animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.15)] mt-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
        <div>
          <p className="font-bold text-rose-300">⚡ Shift Pace Alert</p>
          <p className="text-[8px] text-rose-400/80 mt-0.5 lowercase leading-tight font-medium">
            Tech has {remainingBookHours.toFixed(1)}h of book time remaining but only {shiftTimeRemaining.toFixed(1)}h left in shift!
          </p>
        </div>
      </div>
    )}
    ```

---

## 4. Implementation Strategy & Dependencies

1.  **Dependencies (Milestone 1)**: Introduce Vitest and Testing Library package configuration as pre-requisites for safe component modifications.
2.  **Presentation Focus Mode UI (Milestone 2)**: Add overlay structures, event listeners, touch controls, and typography scale-ups for remote readability.
3.  **Operations Briefing mode (Milestone 3)**: Develop dashboard panel sections, filter active job blockers, tabulate ETAs, and link the Copy button to markdown exports.
4.  **Shift Timeline & Pace Alerts (Milestone 4)**: Implement timeline math formulas, proportional visual indicator grids, and alert states for remaining work hours.
