# Morning Meeting Board Enhancements — Analysis & Implementation Plan

This document outlines the detailed architectural investigation and step-by-step implementation plan for three major Foreman Standup & Operations Hub requirements within `apps/web/src/features/business/MorningMeetingBoard.tsx`.

---

## Part 1: Detailed Investigation Findings

The `MorningMeetingBoard` is a React component built for shop floor monitor displays and foreman standup meetings. It leverages real-time Firestore subscriptions for staff, departments, todos, jobs, tasks, and timeclock sessions.

### Current Architecture & State Management
- **State variables**:
  - `staff` (`StaffMember[]`): List of active team members.
  - `departments` (`Department[]`): Departments within the business.
  - `todos` (`ShopTodo[]`): Global shop checklist items.
  - `jobs` (`Job[]`): Uncompleted client work orders.
  - `jobsTasks` (`Record<string, JobTask[]>`): Real-time map of taskId lists grouped by `jobId`.
  - `timeSessions` (`TimeSession[]`): Today's active and completed timeclock sessions.
  - `layoutMode` (`'lanes' | 'grid'`): Layout selection.
- **Computed data reconciler**: `reconciledData` combines schedules, time sessions, assigned tasks, completed percentages, and triage queues dynamically.

---

## Part 2: Addressing Core Investigation Questions

### Question 1: How to design a clean horizontal timeline visual comparing actual clocked-in time against scheduled shift bounds?
To display scheduled shift bounds and actual clocked-in details side-by-side in a proportional, dark-glassmorphic horizontal bar:
1. **Timeline Bounds**:
   - Establish the standard shift bounds as the $0\%$ to $100\%$ boundaries. For a standard shift (e.g. 8:00 AM to 5:00 PM), the duration is 9 hours ($32,400,000$ milliseconds).
   - If a technician clocks in before the scheduled start or clocks out/remains clocked in after the scheduled end, clamp the relative position percentages between $0\%$ and $100\%$ to preserve the layout structure, while adding visual styling (such as small overhang indicators) to signify overtime or early starts.
2. **Proportional Calculations**:
   - Define:
     - `shiftStartMs = shiftTimes.start.getTime()`
     - `shiftEndMs = shiftTimes.end.getTime()`
     - `shiftDurationMs = shiftEndMs - shiftStartMs`
   - Calculate relative start and end positions for the actual clock-in session:
     ```typescript
     const leftPercent = Math.max(0, Math.min(100, ((actualClockInMs - shiftStartMs) / shiftDurationMs) * 100));
     const rightPercent = Math.max(0, Math.min(100, ((actualClockOutOrNowMs - shiftStartMs) / shiftDurationMs) * 100));
     const clockedWidthPercent = Math.max(0, rightPercent - leftPercent);
     ```
3. **Visual Representation (Dark-Glassmorphic)**:
   - **Track Background**: A slim horizontal container representing the scheduled shift bounds:
     - Classes: `w-full h-3 bg-zinc-950/80 rounded-full border border-zinc-800/80 relative overflow-visible shadow-inner`
   - **Clocked Active Bar**: An absolute-positioned segment representing actual logged working time:
     - Classes: `absolute h-full rounded-full transition-all duration-500`
     - Glow & Color styling based on state:
       - **Active**: `bg-gradient-to-r from-emerald-500/80 to-teal-500/80 shadow-[0_0_10px_rgba(16,185,129,0.3)]`
       - **On Break**: `bg-gradient-to-r from-amber-500/80 to-orange-500/80 shadow-[0_0_10px_rgba(245,158,11,0.3)]`
       - **Completed**: `bg-zinc-700/80`
   - **Time Indicator ("Now")**: If the shift is active and today, render a vertical marker mapping the current system time relative to the shift window:
     - Classes: `absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-rose-500/90 shadow-[0_0_8px_rgba(239,68,68,0.8)] rounded-full z-10`
     - Left percentage: `((now - shiftStartMs) / shiftDurationMs) * 100`

---

### Question 2: How to query and parse schedule information vs time session data?

1. **Schedule Data**:
   - Pulled from `StaffMember.individualSchedule` or fallback `Department.defaultSchedule`.
   - Formatted as:
     ```typescript
     interface WorkSchedule {
       days: number[]; // e.g. [1, 2, 3, 4, 5] (Monday-Friday)
       startTime: string; // "HH:MM" e.g., "08:00"
       endTime: string;   // "HH:MM" e.g., "17:00"
       expectedHoursPerDay: number;
     }
     ```
   - Parsing implementation:
     ```typescript
     const getTodayShiftBounds = (schedule: WorkSchedule | undefined) => {
       if (!schedule) return null;
       const [startH, startM] = schedule.startTime.split(':').map(Number);
       const [endH, endM] = schedule.endTime.split(':').map(Number);
       
       const start = new Date();
       start.setHours(startH, startM, 0, 0);
       
       const end = new Date();
       end.setHours(endH, endM, 0, 0);
       
       return { start, end, durationMs: end.getTime() - start.getTime() };
     };
     ```

2. **Time Session Data**:
   - Pulled from today's real-time `timeSessions` matching the user:
     ```typescript
     const session = timeSessions.find(s => s.userId === staffId);
     ```
   - Timestamps inside `session.clockIn` and `session.clockOut` can be either Firebase Firestore `Timestamp` objects (which require calling `.toDate()`) or raw string/number timestamps. A robust date parsing wrapper is needed:
     ```typescript
     const parseToMs = (val: any) => {
       if (!val) return Date.now();
       if (typeof val.toDate === 'function') return val.toDate().getTime();
       return new Date(val).getTime();
     };
     ```

---

### Question 3: How to check for pace warnings?
We need to monitor if a technician is behind pace on their uncompleted tasks.

1. **Calculate Remaining Book Hours**:
   - Iterate through the technician's assigned job tasks that are not yet marked as completed, finished, or QC'd. Sum up their `bookTime` values (converting string/number values safely):
     ```typescript
     const remainingBookHours = rs.tasks.jobTasks
       .filter(t => !['QC Complete', 'QC', 'Completed'].includes(t.task.status))
       .reduce((sum, t) => {
         const bookVal = parseFloat(t.task.bookTime || '0');
         return sum + (isNaN(bookVal) ? 0 : bookVal);
       }, 0);
     ```

2. **Calculate Shift Time Remaining**:
   - Compute the difference between the scheduled shift end time and the current time:
     ```typescript
     const shiftBounds = getTodayShiftBounds(rs.schedule);
     const shiftTimeRemainingHours = shiftBounds 
       ? Math.max(0, (shiftBounds.end.getTime() - now) / (1000 * 60 * 60)) 
       : 0;
     ```

3. **Check Pace Warning Condition**:
   - Trigger a warning if `remainingBookHours > 4` AND `shiftTimeRemainingHours < 2` (and the shift has not ended yet).
   - Render a high-visibility glassmorphic alert inside the card:
     ```tsx
     {isPaceWarning && (
       <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 shadow-[0_0_12px_rgba(239,68,68,0.15)] mt-2">
         <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce shrink-0" />
         <div className="text-[10px] leading-tight font-bold">
           <span className="uppercase block text-rose-300">Pace Warning</span>
           {remainingBookHours}h remaining book time • only {shiftTimeRemainingHours.toFixed(1)}h shift hours left!
         </div>
       </div>
     )}
     ```

---

### Question 4: Compliance with the Dark-Glassmorphic Aesthetic
All custom layouts and overlay panels must integrate seamlessly with the existing dark-glassmorphic theme.

- **Backgrounds**: Transparent overlays with blur filters: `bg-zinc-950/40 backdrop-blur-md` or `bg-zinc-900/60 backdrop-blur-lg`.
- **Borders**: Thin, semi-transparent bounds to establish structure without heavy lines: `border border-zinc-800/80` or `border border-white/5`.
- **Text & Accent colors**: Highly scannable hierarchical elements, combined with modern font weights (e.g. `font-black`, `uppercase`, `tracking-widest`).
- **Luminescent glows**: Subtle shadows around state indicators (e.g. `shadow-[0_0_12px_rgba(99,102,241,0.2)]` for active elements).

---

## Part 3: Detailed Implementation Plans

### R1: Standup Presentation Focus Mode

Enables a high-visibility, keyboard-navigable slide deck focused on a single clocked-in technician.

1. **State Modifications**:
   - Add `layoutMode` support for `'focus'`: `'lanes' | 'grid' | 'focus'`.
   - Add `focusedStaffIndex` state:
     ```typescript
     const [focusedStaffIndex, setFocusedStaffIndex] = useState(0);
     ```
2. **Keyboard Navigation & Event Handlers**:
   - Bind Arrow keys to move between clocked-in techs when in focus mode:
     ```typescript
     const clockedInStaff = useMemo(() => {
       return reconciledData.allReconciled.filter(s => s.clockStatus === 'active' || s.clockStatus === 'on_break');
     }, [reconciledData.allReconciled]);

     useEffect(() => {
       if (layoutMode !== 'focus' || clockedInStaff.length === 0) return;
       
       const handleKeyDown = (e: KeyboardEvent) => {
         if (e.key === 'ArrowRight') {
           setFocusedStaffIndex(prev => (prev + 1) % clockedInStaff.length);
         } else if (e.key === 'ArrowLeft') {
           setFocusedStaffIndex(prev => (prev - 1 + clockedInStaff.length) % clockedInStaff.length);
         }
       };
       window.addEventListener('keydown', handleKeyDown);
       return () => window.removeEventListener('keydown', handleKeyDown);
     }, [layoutMode, clockedInStaff.length]);
     ```
3. **UI Layout (Glassmorphic Slide View)**:
   - When `layoutMode === 'focus'`, render a single large layout container in place of the department grids.
   - Design enlarged typographic sizes, thick visual progress tracks, big task checklists with glowing tick states, and giant next/prev tactile arrow overlays.

---

### R2: Daily Operations Briefing Feed & Summary

Aggregates operational state markers into a clean scannable HUD dashboard, with copy-to-clipboard functionality.

1. **State Modifications**:
   - Add `layoutMode` support for `'briefing'`: `'lanes' | 'grid' | 'focus' | 'briefing'`.
2. **Operations Metrics Aggregations**:
   - **Attendance**: Scheduled vs present staff count with a scrollable card stack highlighting absent techs.
   - **Blockers**: Tabulates all jobs with active blockers or blocker reasons.
   - **Unassigned**: Groups all unassigned job tasks by department name for foreman assignment.
   - **ETAs**: Standard list of target completion timelines for all running work orders.
3. **Clipboard Export**:
   - Compiles these metrics dynamically into a readable Markdown list:
     ```typescript
     const handleCopyBriefing = () => {
       const text = `...`; // Generated Markdown content
       navigator.clipboard.writeText(text);
       toast.success("Briefing copied to clipboard!");
     };
     ```

---

### R3: Task Timeline vs Shift Schedule Overlay

Visual tracking indicator embedded directly into each technician's detail card.

1. **Calculations**:
   - Render the horizontal bounds representing shift boundaries.
   - Compute relative active times and breaks.
2. **Pace Alert Engine**:
   - Run the double condition checking if `remainingBookHours > 4` and `shiftTimeRemaining < 2`.
   - Render an alert banner with a tooltip details trigger.

---

## Part 4: Proposed Implementation Diff Patch Sketch

Below is a precise sketch of the proposed state bindings and subcomponents to be integrated directly inside `MorningMeetingBoard.tsx`.

```typescript
// Add new Layout Mode tab triggers under `layoutMode === 'grid'` in the Header
<button
  onClick={() => setLayoutMode('focus')}
  className={cn(
    "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
    layoutMode === 'focus' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
  )}
>
  Focus Mode
</button>
<button
  onClick={() => setLayoutMode('briefing')}
  className={cn(
    "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
    layoutMode === 'briefing' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
  )}
>
  Briefing
</button>

// Render layouts inside main viewport:
{layoutMode === 'focus' && (
  <FocusSlideView 
    clockedInStaff={clockedInStaff} 
    currentIndex={focusedStaffIndex} 
    setCurrentIndex={setFocusedStaffIndex}
    canEdit={canEdit}
    tenantId={tenantId}
    now={now}
  />
)}

{layoutMode === 'briefing' && (
  <DailyBriefingView 
    reconciledData={reconciledData}
    jobs={jobs}
    departments={departments}
    now={now}
  />
)}
```

This plan provides a clean, modular structure for completing all the requested standup enhancements with zero disruption to the existing UI framework.
