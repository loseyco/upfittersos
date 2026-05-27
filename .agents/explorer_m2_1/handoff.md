# Handoff Report: Standup Presentation & Operations HUD Exploration

## 1. Observation
Direct observations of source files and schemas:
*   **File Path**: `c:\_Projects\upfittersos.com\apps\web\src\features\business\MorningMeetingBoard.tsx`
    *   **Line 13**: Imports `motion, AnimatePresence` from `'framer-motion'`.
    *   **Lines 93-94**: View states are managed via standard React hooks:
        ```typescript
        const [isFullscreen, setIsFullscreen] = useState(false);
        const [layoutMode, setLayoutMode] = useState<'lanes' | 'grid'>('lanes');
        ```
    *   **Lines 364-470**: `reconciledData` combines staff data, schedule arrays, active clock status, and unassigned/assigned checklist tasks into a unified dataset:
        ```typescript
        const schedule = member.individualSchedule || dept?.defaultSchedule;
        const isScheduledToday = schedule?.days?.includes(todayDayId);
        const session = timeSessions.find(s => s.userId === member.id);
        ```
    *   **Lines 918-930**: Expected shift details are rendered in a small card block:
        ```typescript
        <div className="flex items-center gap-2 bg-zinc-950/40 p-2 rounded-xl border border-zinc-850/50 text-[10px] text-zinc-400 font-semibold">
          <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>
            {rs.isScheduledToday && rs.schedule ? (
              <>
                Shift today: <span className="text-white font-bold">{formatTime(rs.schedule.startTime)} - {formatTime(rs.schedule.endTime)}</span> ({rs.schedule.expectedHoursPerDay}h scheduled)
              </>
            ) : ...
        ```
    *   **Lines 966-1022**: Renders assigned job tasks with book times:
        ```typescript
        {rs.tasks.jobTasks.map(({ task, job }) => {
          const isTaskDone = ['QC Complete', 'QC', 'Completed'].includes(task.status);
          ...
          {task.bookTime && (
            <span className="bg-zinc-900 text-zinc-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-zinc-800 font-mono">
              {task.bookTime}h
            </span>
          )}
        ```
*   **File Path**: `c:\_Projects\upfittersos.com\apps\web\src\features\business\ETAModal.tsx`
    *   **Lines 37-40**: Confirms that job ETA is written to the Firestore `jobs` collection under the attribute name `expectedFinishTime`:
        ```typescript
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          expectedFinishTime: new Date(eta).toISOString(),
          updatedAt: new Date()
        });
        ```
*   **File Path**: `c:\_Projects\upfittersos.com\PROJECT.md`
    *   **Lines 7-15**: High-level functionality specifications:
        *   R1 Focus mode for clocked-in staff, legibility extensions (text/bars/lists), keyboard/button navigation.
        *   R2 Daily Operations Briefing aggregates scheduled vs present attendance, active blockers, unassigned tasks by department, tabulates ETAs, and includes a copy button for foreman.
        *   R3 Proportional timeline compares shift times against clocked details, and raises alerts when `remainingBookHours > 4` and `shiftTimeRemaining < 2h`.

---

## 2. Logic Chain
The findings and proposed strategies follow a step-by-step logic chain from the observations:
1.  **Focus Mode Placement**: Focus mode must cover the entire viewport while integrating cleanly into `MorningMeetingBoard.tsx`. Since `framer-motion`'s `AnimatePresence` and `motion` are already imported at line 13, slide transitions between focus items can be handled cleanly via state `focusedStaffId`.
2.  **Remote Readability (10-Foot Rule)**: Standard display resolutions at 10+ feet demand that checklist elements and statuses expand visually. We achieve this by scaling up fonts (e.g., `text-6xl` for names, `text-2xl` for titles), progress bars (from `h-1.5` to `h-6`), and Lucide icons (from `w-4 h-4` to `w-8 h-8`).
3.  **Active Staff Filtering**: Focus mode needs to cycle through present staff. Observation in `reconciledData` shows `clockStatus` resolves whether a tech is active/on_break/completed/offline. Thus, filtering to present technicians (`active` or `on_break`) yields the correct active rotation array. Left/Right Arrow key listeners mapping to prev/next index indices completes this.
4.  **Ops Briefing Mode Layout**: Incorporating R2 as a dedicated `layoutMode` value (e.g. `'briefing'`) alongside `'lanes'` and `'grid'` allows the foreman to toggle the scannable HUD deck seamlessly using existing UI patterns.
5.  **Job ETAs**: The analysis of `ETAModal.tsx` proves that promised completion dates are stored as ISOStrings in `expectedFinishTime` on the `jobs` documents. Sorting this field chronologically guarantees the foreman sees upcoming deliverables first in the dashboard.
6.  **Timeline Visual Math**: Shift duration can be calculated by converting `rs.schedule.startTime` and `rs.schedule.endTime` into daily millisecond timestamps. Comparing this with timeclock sessions allows precise absolute mapping of the clocked-in start and end bounds into a `[0%, 100%]` width scale.
7.  **Pace Alert Formula**:
    *   `remainingBookHours` is computed by aggregating the numerical value of `parseFloat(task.bookTime) || 0` across incomplete tasks.
    *   `shiftTimeRemaining` is calculated by subtracting `now` from the shift end timestamp in decimal hours.
    *   A threshold condition `remainingBookHours > 4 && shiftTimeRemaining < 2` triggers the visual pace alert accurately.

---

## 3. Caveats
*   **Timezone Shift Boundaries**: The shift schedule string parsing (e.g., `"08:00"`) assumes standard local timezone parsing. When constructing Date objects, formatting it like ``new Date(`${new Date().toDateString()} ${rs.schedule.startTime}`)`` ensures local timezone compatibility, but edge cases surrounding overnight shifts (e.g. crossing midnight) are not handled by these simple daily formulas.
*   **Archived Staff or Jobs**: The component queries already filter out archived staff and completed/delivered jobs. The metrics calculated in the briefing dashboard will naturally align with these filtered collections, which is the desired behavior for a daily standup.

---

## 4. Conclusion
The implementation plan is thoroughly mapped out and ready for the implementer subagent. No code files have been modified. 

The blueprints detailed in `analysis.md` address every user requirement:
1.  **R1 (Presentation Focus Mode Overlay)**: Absolute-positioned dark glassmorphic panel with 10-foot legibility text/bars, arrow key handler hooks, and large touch-friendly chevrons.
2.  **R2 (Daily Operations Briefing Mode)**: A third layout mode view displaying metrics (attendance, blockers, unassigned tasks, chronologically sorted job ETAs) and a high-fidelity clipboard exporter.
3.  **R3 (Task Timeline vs Shift Schedule Overlay)**: A responsive timeline bar that clamps clock-in/out bounds into a proportional shift grid, overlaid with a pulsing vertical red line for the current time, alongside a dynamic pace alert.

---

## 5. Verification Method
To independently verify:
1.  **Inspect Analysis Plan**: Review `c:\_Projects\upfittersos.com\.agents\explorer_m2_1\analysis.md` to confirm alignment with R1, R2, and R3.
2.  **Verify Code References**: Inspect `MorningMeetingBoard.tsx` to verify that the proposed variables and selectors map perfectly to existing elements.
3.  **Type Compliance Check**: Run `npm run build -w web` or `tsc` inside `apps/web` to confirm that all custom interfaces and parameters comply with TypeScript compilation.
