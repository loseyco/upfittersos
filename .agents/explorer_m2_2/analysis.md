# Technical Analysis & Implementation Plan: Foreman Standup & Operations Hub

This analysis report lays out the design, architectural integration, and implementation plan for the **Foreman Standup & Operations Hub** on top of the existing `MorningMeetingBoard` React component (`apps/web/src/features/business/MorningMeetingBoard.tsx`).

---

## 1. R1: Standup Presentation Focus Mode

### Objective
Provide a dedicated widescreen presentation layout optimized for vertical TV/monitor standups. It highlights a single staff member's cards sequentially, enlarges typographic elements and progress indicators for readability at a distance, and implements left/right tactile and keyboard controls.

### Architectural Strategy
1. **Extend Layout Mode**: Update `layoutMode` to support `'presentation'` layout alongside `'lanes'` and `'grid'`.
   ```typescript
   const [layoutMode, setLayoutMode] = useState<'lanes' | 'grid' | 'briefing' | 'presentation'>('lanes');
   const [presentationIndex, setPresentationIndex] = useState(0);
   ```
2. **Eligible Staff Derivation**: Filter the reconciled staff members to include only those scheduled for today or currently clocked in to keep standups concise.
   ```typescript
   const eligibleStaff = useMemo(() => {
     return reconciledData.allReconciled.filter(s => s.isScheduledToday || s.clockStatus !== 'offline');
   }, [reconciledData.allReconciled]);
   ```
3. **Keyboard Controls**: Implement keyboard event handlers (`ArrowLeft`, `ArrowRight`, `Escape`) active only when `layoutMode === 'presentation'`.
4. **Visual Layout**: When `'presentation'` mode is active, render a full-viewport slides-deck layout utilizing Framer Motion transitions for elegant transitions between cards.

### Proposed Code Structure (R1)

```tsx
// 1. Keyboard Navigation Hook inside MorningMeetingBoard component
useEffect(() => {
  if (layoutMode !== 'presentation' || eligibleStaff.length === 0) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      setPresentationIndex(prev => (prev + 1) % eligibleStaff.length);
    } else if (e.key === 'ArrowLeft') {
      setPresentationIndex(prev => (prev - 1 + eligibleStaff.length) % eligibleStaff.length);
    } else if (e.key === 'Escape') {
      setLayoutMode('lanes');
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [layoutMode, eligibleStaff.length]);

// 2. Focused Viewport Rendering Block
{layoutMode === 'presentation' && eligibleStaff.length > 0 && (
  <div className="flex-1 flex flex-col items-center justify-between p-6 bg-zinc-950/40 backdrop-blur-md border border-zinc-800 rounded-3xl relative h-full">
    {/* Exit & Progress Header */}
    <div className="w-full flex justify-between items-center pb-4 border-b border-zinc-850">
      <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">
        Standup Deck • Card {presentationIndex + 1} of {eligibleStaff.length}
      </span>
      <button 
        onClick={() => setLayoutMode('lanes')}
        className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold transition-all active:scale-95"
      >
        Exit Focus Mode (Esc)
      </button>
    </div>

    {/* Center Slides Card */}
    <div className="flex-1 w-full max-w-4xl flex flex-col justify-center items-center py-8">
      {(() => {
        const rs = eligibleStaff[presentationIndex];
        const initials = `${rs.member.firstName?.[0] || '?'}${rs.member.lastName?.[0] || ''}`;
        const isClockedIn = rs.clockStatus === 'active';
        const isOnBreak = rs.clockStatus === 'on_break';
        
        return (
          <motion.div 
            key={rs.member.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full bg-zinc-900/80 border-2 border-indigo-500/20 p-10 rounded-[32px] shadow-2xl flex flex-col gap-6"
          >
            {/* Slide Header: Giant Profile Info */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center font-black text-white text-3xl uppercase border border-white/10 shadow-lg",
                  isClockedIn ? "bg-indigo-600 shadow-[0_0_25px_rgba(99,102,241,0.45)]" : isOnBreak ? "bg-amber-600 shadow-[0_0_25px_rgba(217,119,6,0.45)]" : "bg-zinc-800"
                )}>
                  {initials}
                </div>
                <div>
                  <h2 className="text-4xl font-black tracking-tight text-white">
                    {rs.member.firstName} {rs.member.lastName}
                  </h2>
                  <p className="text-sm font-black text-indigo-400 uppercase tracking-widest mt-1">
                    {rs.member.jobTitle || 'Technician'} • {rs.dept?.name || 'No Department'}
                  </p>
                </div>
              </div>

              {/* Huge Status Badge */}
              <div>
                {isClockedIn ? (
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest">
                    Clocked In: {formatMillisToDuration(rs.clockedTimeToday)}
                  </span>
                ) : isOnBreak ? (
                  <span className="bg-amber-500/10 text-amber-500 border border-amber-500/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest animate-pulse">
                    On Break
                  </span>
                ) : (
                  <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest">
                    Offline
                  </span>
                )}
              </div>
            </div>

            {/* Giant Progress Bar */}
            {rs.tasks.total > 0 && (
              <div className="space-y-2 mt-4">
                <div className="flex justify-between items-center text-sm font-black uppercase tracking-wider text-zinc-400">
                  <span>Task Completion progress</span>
                  <span className="text-white text-lg font-mono">{Math.round(rs.tasks.percentage)}%</span>
                </div>
                <div className="w-full bg-zinc-950 h-5 rounded-full overflow-hidden border border-zinc-800">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                    style={{ width: `${rs.tasks.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Large Active Workorder Alert */}
            {isClockedIn && rs.activeJobSession && (
              <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl flex items-center justify-between text-sm animate-pulse">
                <span className="font-black text-indigo-400 uppercase tracking-widest">⚡ Current Task Workorder</span>
                <span className="font-black text-white">{rs.activeJobSession.name}</span>
              </div>
            )}

            {/* Shift Timeline Bar Placeholder */}
            {rs.isScheduledToday && rs.schedule && (
              <div className="w-full border-t border-zinc-850 pt-4">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Shift Pace & Timeline Overlay</span>
                {/* Visual timeline component (R3) goes here */}
              </div>
            )}

            {/* Large Checklist items */}
            <div className="space-y-3 mt-4">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Today's Active Tasks</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                {rs.tasks.jobTasks.map(({ task, job }) => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-zinc-950/60 border border-zinc-850/60 rounded-2xl">
                    <span className="text-base font-bold text-white">{task.title}</span>
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{job.title}</span>
                  </div>
                ))}
                {rs.tasks.total === 0 && (
                  <p className="text-center text-sm font-bold text-zinc-500 italic py-6">No assignments assigned today</p>
                )}
              </div>
            </div>
          </motion.div>
        );
      })()}
    </div>

    {/* Big Tactile Carousel Navigation Footer */}
    <div className="w-full flex justify-between items-center mt-6">
      <button 
        onClick={() => setPresentationIndex(prev => (prev - 1 + eligibleStaff.length) % eligibleStaff.length)}
        className="px-8 py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-black uppercase tracking-wider rounded-2xl transition-all active:scale-95"
      >
        ◀ Previous
      </button>
      <div className="flex gap-2">
        {eligibleStaff.map((_, idx) => (
          <span 
            key={idx} 
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all duration-300",
              idx === presentationIndex ? "bg-indigo-500 scale-125" : "bg-zinc-800"
            )}
          />
        ))}
      </div>
      <button 
        onClick={() => setPresentationIndex(prev => (prev + 1) % eligibleStaff.length)}
        className="px-8 py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-black uppercase tracking-wider rounded-2xl transition-all active:scale-95"
      >
        Next ▶
      </button>
    </div>
  </div>
)}
```

---

## 2. R2: Daily Operations Briefing Feed & Summary

### Objective
Aggregates today's operational data into a single scannable HUD briefing feed, containing:
1. **Attendance Check**: Present vs scheduled count, highlighting late or absent technicians.
2. **Active Blocker Alerts**: Active work orders containing tasks marked `Blocked` or active blocker comments.
3. **Unassigned Tasks List**: Department-grouped task triage queue.
4. **Target Job ETAs**: Expected completion schedules.
5. **Copy Briefing to Clipboard**: Instantly format this compiled list to structured markdown text.

### Implementation Details
- **Toggle/Tab View**: Standard layout selectors include `'briefing'`.
- **Active Blockers Data Reconciler**: Check job records for jobs with `status === 'Blocked'` or tasks with `status === 'Blocked'`.

### Proposed Clipboard Formatting (R2)

```typescript
const generateBriefingMarkdown = () => {
  let md = `# 📊 Shop Floor Daily Operations Briefing - ${new Date().toLocaleDateString()}\n\n`;

  // 1. Attendance Check
  const scheduledCount = reconciledData.allReconciled.filter(s => s.isScheduledToday).length;
  const presentCount = reconciledData.allReconciled.filter(s => s.clockStatus === 'active' || s.clockStatus === 'on_break').length;
  const absents = reconciledData.allReconciled.filter(s => s.isScheduledToday && s.clockStatus === 'offline');
  
  md += `## 👥 Attendance Check\n`;
  md += `- **Status**: ${presentCount} / ${scheduledCount} Present today\n`;
  if (absents.length > 0) {
    md += `- **Absent/Late Technicians**:\n`;
    absents.forEach(a => {
      md += `  - ❌ ${a.member.firstName} ${a.member.lastName} (${a.dept?.name || 'No Department'})\n`;
    });
  } else {
    md += `- ✅ All scheduled technicians are clocked in and present.\n`;
  }
  md += `\n`;

  // 2. Active Blocker Alerts
  const blockedJobs = jobs.filter(j => 
    j.status === 'Blocked' || 
    (j as any).blockers?.some((b: any) => b.status === 'active')
  );
  md += `## ⚠️ Active Blocker Alerts\n`;
  if (blockedJobs.length > 0) {
    blockedJobs.forEach(j => {
      const reason = (j as any).blocker || (j as any).blockers?.find((b: any) => b.status === 'active')?.message || 'No blocker reasons provided.';
      md += `- **${j.jobNumber ? '#' + j.jobNumber + ' ' : ''}${j.title}**: ${reason}\n`;
    });
  } else {
    md += `- ✅ No active blockers on the shop floor today.\n`;
  }
  md += `\n`;

  // 3. Unassigned Tasks List
  md += `## 📋 Unassigned Tasks (Meeting Triage)\n`;
  let hasUnassigned = false;
  reconciledData.deptGroups.forEach(group => {
    if (group.unassignedTasks.length > 0) {
      hasUnassigned = true;
      md += `- **${group.dept.name} Department**:\n`;
      group.unassignedTasks.forEach(({ task, job }) => {
        md += `  - ${task.title} (${job.jobNumber ? '#' + job.jobNumber + ' ' : ''}${job.title})\n`;
      });
    }
  });
  if (!hasUnassigned) {
    md += `- ✅ All department tasks have been assigned.\n`;
  }
  md += `\n`;

  // 4. Target Job ETAs
  const activeJobsWithETAs = jobs.filter(j => (j as any).expectedFinishTime);
  md += `## ⏱️ Target Job ETAs\n`;
  if (activeJobsWithETAs.length > 0) {
    activeJobsWithETAs.forEach(j => {
      const date = new Date((j as any).expectedFinishTime);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      md += `- **${j.jobNumber ? '#' + j.jobNumber + ' ' : ''}${j.title}**: Target ETA at ${formattedDate}\n`;
    });
  } else {
    md += `- ⏱️ No job ETAs are specified for current work orders.\n`;
  }

  return md;
};

const handleCopyBriefing = () => {
  const mdText = generateBriefingMarkdown();
  navigator.clipboard.writeText(mdText)
    .then(() => toast.success("Operations Briefing copied to clipboard!"))
    .catch(err => {
      console.error("Clipboard copy failed:", err);
      toast.error("Failed to copy operations briefing.");
    });
};
```

### Proposed Briefing UI Structure
We will render a tab matching the current glassmorphic UI.

```tsx
{layoutMode === 'briefing' && (
  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-zinc-950/20 rounded-3xl p-6 border border-zinc-800">
    {/* Left Column: Metrics & Actions */}
    <div className="flex flex-col gap-6">
      {/* HUD Header Banner */}
      <div className="p-5 bg-gradient-to-r from-indigo-950/40 to-violet-950/30 border border-indigo-500/20 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase text-white tracking-tight">Ops Briefing Feed</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Shop floor summary & metrics</p>
        </div>
        <button 
          onClick={handleCopyBriefing}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-2"
        >
          📋 Copy Briefing
        </button>
      </div>

      {/* Attendance Widget */}
      <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col gap-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">👥 Attendance Check</h3>
        {/* Attendance stats and absent lists... */}
      </div>

      {/* Active Blockers Widget */}
      <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col gap-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-rose-400">⚠️ Active Blockers</h3>
        {/* Blocked jobs & reasons... */}
      </div>
    </div>

    {/* Right Column: Triage & Scheduling */}
    <div className="flex flex-col gap-6">
      {/* Unassigned Triage Widget */}
      <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col gap-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-amber-500">📋 Unassigned Tasks (Triage Queue)</h3>
        {/* Department unassigned list... */}
      </div>

      {/* Target Job ETAs Widget */}
      <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col gap-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400">⏱️ Active Job ETAs</h3>
        {/* List of jobs & ETA target times... */}
      </div>
    </div>
  </div>
)}
```

---

## 3. R3: Task Timeline vs Shift Schedule Overlay

### Objective
Compares scheduled shifts against timeclock sessions visually as a proportional bar overlay inside both the regular staff cards and the Standup Focus Card. Automatically triggers visual alerts/warnings when:
- `remainingBookHours > 4` AND `shiftTimeRemaining < 2h`.

### Computational Logic
1. **Shift Time Parsers**:
   ```typescript
   const getShiftDetails = (schedule: WorkSchedule, now: number) => {
     if (!schedule) return null;
     const [sH, sM] = schedule.startTime.split(':').map(Number);
     const [eH, eM] = schedule.endTime.split(':').map(Number);
     
     const shiftStart = new Date();
     shiftStart.setHours(sH, sM, 0, 0);
     
     const shiftEnd = new Date();
     shiftEnd.setHours(eH, eM, 0, 0);

     const shiftDuration = shiftEnd.getTime() - shiftStart.getTime();
     const shiftTimeRemaining = Math.max(0, (shiftEnd.getTime() - now) / 3600000); // hours

     return {
       shiftStart: shiftStart.getTime(),
       shiftEnd: shiftEnd.getTime(),
       shiftDuration,
       shiftTimeRemaining
     };
   };
   ```

2. **Proportional Mapping**:
   Calculate percentages within the shift window:
   - **Timeclock Start Offset**: Position where the technician clocked in relative to the shift window start time.
   - **Timeclock Elapsed Span**: Active hours clocked relative to the shift window.
   - **Current Time Marker**: Position of the current time relative to the shift window.

3. **Pace Alarm Thresholds**:
   - `remainingBookHours`: Sum of uncompleted task book times for the staff member.
     ```typescript
     const remainingBookHours = rs.tasks.jobTasks
       .filter(t => !['QC Complete', 'QC', 'Completed'].includes(t.task.status))
       .reduce((acc, t) => acc + (Number(t.task.bookTime) || 0), 0);
     ```
   - Trigger Pace Alert when: `remainingBookHours > 4` and `shiftTimeRemaining < 2` (hours).

### Timeline UI Visual Overlay Component

```tsx
export function ProportionalShiftTimeline({ 
  schedule, clockedTimeToday, activeJobSession, timeSession, now, remainingBookHours 
}: { 
  schedule: WorkSchedule; 
  clockedTimeToday: number; 
  activeJobSession: any; 
  timeSession: TimeSession | undefined; 
  now: number;
  remainingBookHours: number;
}) {
  const shift = useMemo(() => {
    if (!schedule) return null;
    const [sH, sM] = schedule.startTime.split(':').map(Number);
    const [eH, eM] = schedule.endTime.split(':').map(Number);
    const start = new Date(now);
    start.setHours(sH, sM, 0, 0);
    const end = new Date(now);
    end.setHours(eH, eM, 0, 0);
    const duration = end.getTime() - start.getTime();
    const remaining = Math.max(0, (end.getTime() - now) / 3600000); // in hours
    return { start: start.getTime(), end: end.getTime(), duration, remaining };
  }, [schedule, now]);

  if (!shift) return null;

  // Calculate clock-in visual offset
  let clockInOffset = 0;
  let clockedWidth = 0;

  if (timeSession?.clockIn?.timestamp) {
    const clockInTime = timeSession.clockIn.timestamp.toDate ? timeSession.clockIn.timestamp.toDate().getTime() : new Date(timeSession.clockIn.timestamp).getTime();
    clockInOffset = Math.max(0, Math.min(100, ((clockInTime - shift.start) / shift.duration) * 100));
    const clockOutTime = timeSession.clockOut?.timestamp 
      ? (timeSession.clockOut.timestamp.toDate ? timeSession.clockOut.timestamp.toDate().getTime() : new Date(timeSession.clockOut.timestamp).getTime())
      : now;
    clockedWidth = Math.max(0, Math.min(100 - clockInOffset, ((clockOutTime - clockInTime) / shift.duration) * 100));
  }

  // Calculate visual marker for current time
  const currentMarkerOffset = Math.max(0, Math.min(100, ((now - shift.start) / shift.duration) * 100));
  const isCurrentlyInShift = now >= shift.start && now <= shift.end;

  // Pace alert indicator check
  const isPaceAlert = remainingBookHours > 4 && shift.remaining < 2 && shift.remaining > 0;

  return (
    <div className="w-full flex flex-col gap-2 p-3 bg-zinc-950/60 border border-zinc-850 rounded-2xl relative overflow-hidden">
      {/* Alert Overlay Banner */}
      {isPaceAlert && (
        <div className="bg-red-500/10 border border-red-500/35 p-2 rounded-xl flex items-center justify-between text-[10px] animate-pulse">
          <span className="font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
            ⚠️ PACE WARNING ALERT
          </span>
          <span className="font-bold text-red-200">
            {remainingBookHours}h remaining task hours vs {shift.remaining.toFixed(1)}h shift remaining!
          </span>
        </div>
      )}

      {/* Timeline Proportional Bar */}
      <div className="relative w-full h-4 bg-zinc-900 border border-zinc-800 rounded-full mt-1.5 overflow-hidden">
        {/* 1. Clocked-In Present overlay */}
        {clockedWidth > 0 && (
          <div 
            className={cn(
              "absolute h-full transition-all duration-500",
              activeJobSession 
                ? "bg-gradient-to-r from-indigo-500/80 to-indigo-600/90 shadow-[0_0_10px_rgba(99,102,241,0.3)]" 
                : "bg-emerald-500/60"
            )}
            style={{ left: `${clockInOffset}%`, width: `${clockedWidth}%` }}
          />
        )}

        {/* 2. Current Time Marker Indicator Pin */}
        {isCurrentlyInShift && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]"
            style={{ left: `${currentMarkerOffset}%` }}
          />
        )}
      </div>

      {/* Timeline Clock Labels */}
      <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-1 px-1">
        <span>Start: {schedule.startTime}</span>
        {isCurrentlyInShift && (
          <span className="text-rose-400 font-black animate-pulse">
            Current Time
          </span>
        )}
        <span>End: {schedule.endTime}</span>
      </div>
    </div>
  );
}
```

---

## 4. Dark-Glassmorphic Style Guidelines

The component maintains the cohesive high-tech glassmorphic UX aesthetic using the following CSS styling elements:
1. **Background**: Low opacity dark panels (`bg-zinc-900/40`, `bg-zinc-950/20`) blended with intensive backdrop blurs (`backdrop-blur-md`).
2. **Neon Accents**: High contrast glowing accents leveraging drop-shadow glow matrices:
   - Emerald alerts: `shadow-[0_0_15px_rgba(16,185,129,0.35)] border-emerald-500/30 text-emerald-400 bg-emerald-950/20`
   - Amber alarms: `shadow-[0_0_15px_rgba(217,119,6,0.35)] border-amber-500/30 text-amber-500 bg-amber-950/20`
   - Rose alerts: `shadow-[0_0_15px_rgba(239,68,68,0.35)] border-rose-500/30 text-rose-400 bg-rose-950/20`
3. **Interactive Feedbacks**: Leverage springy click scales (`active:scale-[0.98]`) combined with Framer Motion slide-in animations.
