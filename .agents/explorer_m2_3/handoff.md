# Handoff Report — explorer_m2_3

## 1. Observation
- File investigated: `apps/web/src/features/business/MorningMeetingBoard.tsx` (1266 lines total).
- State and types definitions are located at lines 15-83:
  - `WorkSchedule` (line 15) contains: `days: number[]; startTime: string; endTime: string; expectedHoursPerDay: number;`
  - `StaffMember` (line 22) contains: `individualSchedule?: WorkSchedule;`
  - `TimeSession` (line 73) contains: `clockIn: { timestamp: any; location?: string; }; clockOut?: { timestamp: any; }; status: string;`
- Data reconciliation logic is in the `reconciledData` useMemo block starting at line 364:
  - Staff individual schedule or department fallback schedule is parsed at line 369.
  - Active timeClock status and clocked working durations are computed at lines 373-413.
- Target layout styling is in dark-glassmorphic aesthetic as seen in line 587 (`rounded-3xl border border-zinc-800 shadow-2xl p-6` inside `bg-zinc-950`) and details card styling at lines 815-822.
- No unit tests currently exist for this component under `apps/web/src/features/business/__tests__/MorningMeetingBoard.test.tsx` (confirmed by a failed view attempt).

---

## 2. Logic Chain
- **R1: Standup Presentation Focus Mode**:
  - We can filter `reconciledData.allReconciled` to identify clocked-in techs (`s.clockStatus === 'active' || s.clockStatus === 'on_break'`).
  - By maintaining a simple state variable `focusedStaffIndex`, we can display a single large slide-deck card.
  - A simple window keyboard listener inside a `useEffect` mapping `ArrowLeft` and `ArrowRight` handles cycling between techs.
- **R2: Daily Operations Briefing**:
  - Aggregating attendance metrics: CountScheduled (`s.isScheduledToday`) vs CountPresent (`s.clockStatus === 'active' || s.clockStatus === 'on_break'`), collecting late/absent technicians names.
  - Blockers: Extracting all active blockers from `jobs` matching `(j.blockers || []).some(b => b.status === 'active') || j.blocker`.
  - Unassigned tasks: Sourcing `unassignedTasks` grouped by department name directly from `reconciledData.deptGroups`.
  - Copying to Clipboard: Formatting these metrics into a Markdown template and using `navigator.clipboard.writeText` enables copying.
- **R3: Timeline & Pace Warnings**:
  - Parse shift times (`startTime` and `endTime` in `"HH:MM"` format) to Date instances relative to today.
  - Actual session durations calculated by tracking the difference between `clockIn` and `clockOut` (or current system time `now` if active).
  - Pace warning condition: Sum of remaining `bookTime` of unfinished tasks $> 4$ hours, combined with shift time remaining $< 2$ hours.
  - Proportional timeline visual: Track background `div` with absolute-positioned overlay progress bar matching the parsed clock-in duration relative to shift bounds.

---

## 3. Caveats
- No test files existed for this component at the start of analysis; Vitest setup and unit verification will be implemented in Milestone M1.
- Time session timestamps may vary in format (Firebase `Timestamp` vs raw Date string/number). Date calculations wrapper needs helper functions (such as `parseToMs` and `getTodayShiftBounds`) to handle this robustly.

---

## 4. Conclusion
- The target component `MorningMeetingBoard.tsx` contains a robust real-time dataset ready to be utilized for R1, R2, and R3.
- Implementing these changes will require expanding `layoutMode` to support `'focus'` and `'briefing'` alongside `'lanes'` and `'grid'`.
- All planned components conform fully to the project's dark-glassmorphic style guide.

---

## 5. Verification Method
- **Files to Inspect**:
  - `c:\_Projects\upfittersos.com\.agents\explorer_m2_3\analysis.md` for the comprehensive implementation designs and proposed patches.
  - `apps/web/src/features/business/MorningMeetingBoard.tsx` to verify standard state triggers.
- **Testing Integration**:
  - Run the test suite once created in the test file via `npm test` or `vitest run apps/web/src/features/business/__tests__/MorningMeetingBoard.test.tsx`.
