# Handoff Report: Morning Meeting Board Exploration (Milestone M1)

## 1. Observation
- **MorningMeetingBoard Component**: Located at `c:\_Projects\upfittersos.com\apps\web\src\features\business\MorningMeetingBoard.tsx`. It contains 1,275 lines of code. It fetches `staff`, `departments`, `todos`, `jobs`, and `timeSessions` inside a real-time listener `useEffect` (lines 124–184) and active job tasks in a parallel listener `useEffect` (lines 191–214). It synthesizes all state within the `reconciledData` `useMemo` (lines 364–516).
- **MorningMeetingBoard Test Suite**: Located at `c:\_Projects\upfittersos.com\apps\web\src\features\business\__tests\MorningMeetingBoard.test.tsx`. It contains 186 lines of code, with 5 active baseline test cases and 7 skipped test cases (`describe.skip` stubs on lines 153–185).
- **Dynamic ETA Mechanics**: Discovered in `c:\_Projects\upfittersos.com\apps\web\src\features\business\BayMonitor.tsx` (lines 80–185), consisting of:
  - `parseSafeDate` (lines 80–95)
  - `projectWorkingHours` (lines 97–152)
  - `calculateDynamicETA` (lines 154–185)
- **Active Blockers Representation**: Discovered in `BayMonitor.tsx` (line 510) and `ForemanDashboard.tsx` (lines 182-187), checking `j.status === 'Blocked' || j.blocker || (j.blockers || []).some((b: any) => b.status === 'active')`.

---

## 2. Logic Chain
- **Requirement R1 (Standup Presentation Focus Mode)**:
  - By adding two state variables (`isPresentationMode`, `presentationIndex`), we can conditionally replace the entire board viewport with a focused single-person slide card.
  - Adding a `useEffect` to capture window keydown events (`ArrowLeft`, `ArrowRight`, `Space`, `Escape`) lets the foreman cycle cards easily.
  - The list of presentation candidates is memoized as `reconciledData.allReconciled.filter(s => s.isScheduledToday || ['active', 'on_break'].includes(s.clockStatus))`.
- **Requirement R2 (Operations Briefing Tab)**:
  - Adding `activeTab` state switches between `'board'` and `'briefing'` layouts.
  - In the briefing panel, attendance insights are extracted from `allReconciled`. Blockers are filtered using the job's `status === 'Blocked'` or active `blockers` array. Backlogs are fetched from `unassignedTasks`. Dynamic ETAs are generated using `calculateDynamicETA` adapted from `BayMonitor.tsx`.
  - One-click copy formats this data in Markdown and executes `navigator.clipboard.writeText(markdownString)` coupled with a success toast.
- **Requirement R3 (Shift Timeline Overlay & Pace Warnings)**:
  - Shift bounds are resolved by merging the current date with start/end strings. A percentage mapper `pct = ((t - start) / (end - start)) * 100` clamps and maps clock-ins, breaks, and current time.
  - Remaining book hours are calculated as `rs.tasks.jobTasks.filter(incomplete).reduce(sum(bookTime))`.
  - Pace warning condition: `rs.isScheduledToday && remainingBookHours > 4 && shiftRemainingHours < 2`. Displays a pulsating rose alert tag if met.

---

## 3. Caveats
- **Blocker Data Formats**: We assumed the Firebase database carries blockers under the job document as an array `blockers` or a single string `blocker`, matching `BayMonitor.tsx` and `ForemanDashboard.tsx`.
- **Time Syncing**: The `now` clock uses a 1-second interval (`Date.now()`), ensuring dynamic visual markers, timelines, and shift hours update instantly in real time.

---

## 4. Conclusion
- A comprehensive implementation plan has been fully drafted in `analysis.md` inside this coordinator folder. It outlines exact code blocks, equations, variables, and CSS utilities.
- An exact activation and specification strategy has been defined to turn on the 7 TDD test stubs in `MorningMeetingBoard.test.tsx` and completely verify R1, R2, and R3.

---

## 5. Verification Method
1. **Activating the Test Blocks**: Open `c:\_Projects\upfittersos.com\apps\web\src\features\business\__tests\MorningMeetingBoard.test.tsx` and remove `.skip` from the three describe blocks:
   - Line 153: `describe.skip('MorningMeetingBoard - R1: Standup Presentation Focus Mode', ...)`
   - Line 167: `describe.skip('MorningMeetingBoard - R2: Daily Operations Briefing Feed', ...)`
   - Line 177: `describe.skip('MorningMeetingBoard - R3: Timeline & Pace Warnings', ...)`
2. **Implement code changes**: Integrate the designed states, handlers, layouts, and helpers inside `MorningMeetingBoard.tsx`.
3. **Run Verification Command**: Run the test runner from the workspace root:
   ```bash
   npm run test:run -w web
   ```
   All 12 tests should execute and pass cleanly.
