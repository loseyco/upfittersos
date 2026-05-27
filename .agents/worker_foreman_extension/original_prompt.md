## 2026-05-26T17:44:40Z

You are the Worker subagent for the "Foreman Standup & Operations Hub Extension" subtask.
Your identity: Foreman Hub Extension Worker
Your working directory is: c:\_Projects\upfittersos.com\.agents\worker_foreman_extension

**MANDATORY INTEGRITY WARNING**:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

**Context**:
You are implementing the Foreman Standup & Operations Hub Extension features inside `apps/web/src/features/business/MorningMeetingBoard.tsx` and adding comprehensive tests inside `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` and `MorningMeetingBoardStress.test.tsx`.

Please read and utilize the following references:
- Global Scope: `c:\_Projects\upfittersos.com\.agents\orchestrator_foreman_extension\PROJECT.md`
- Implementation Plan: `c:\_Projects\upfittersos.com\.agents\orchestrator_foreman_extension\plan.md`
- Detailed Technical Design: `c:\_Projects\upfittersos.com\.agents\explorer_foreman_extension\analysis.md`
- Explorer Handoff: `c:\_Projects\upfittersos.com\.agents\explorer_foreman_extension\handoff.md`
- Component to edit: `apps/web/src/features/business/MorningMeetingBoard.tsx`
- Test files to edit: `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` and `MorningMeetingBoardStress.test.tsx`

**Tasks**:

1. **Implement R1. Task Sequencing & Notes & Hourly Blocker**:
   - In `MorningMeetingBoard.tsx`, add click-to-reorder (ChevronUp/ChevronDown) sequence handles on each technician's daily assignments list.
   - Show priority order badges (e.g. "1st priority") on sequenced tasks. Sort assignments inside `reconciledData` based on `dailyTaskSequence` string array in staff doc.
   - Add a click listener to each technician card on the lanes/grid view that opens a Slideover/Modal (e.g. `selectedStaffId` state based) styled with dark-glassmorphic aesthetic.
   - Inside the detail modal, add a Standup commitments note textarea. Auto-saves `onBlur` to `businesses/${tenantId}/staff/${memberId}` field `dailyCommitNotes`.
   - Add an 8-hour shift timeline block allocator (8 horizontal/grid slots from 8 AM to 4 PM). Foreman can allocate task book hours to slots via a dropdown of assigned/unassigned triage tasks. Clears slots with a clear button. Persists allocations inside staff document field `hourlyAllocations`.
   - Underneath the allocator, render the clocked timeline overlay for comparison using the actual clock-in, break, and clock-out timestamps (matching the look of the card schedule progress timeline).

2. **Implement R2. Operations & Sales Search Hub & Shop Capacity HUD**:
   - Add an "Operations Hub" tab selection option next to "Lanes", "Grid", "Presentation", "Briefing". Clicking it toggles active tab layout mode to `'operations'`.
   - Create the search dashboard: search input matching Job Number, Customer Name, or VIN on active jobs list.
   - Render matching job cards showing: clocked technician, active task title/status,expected ETA, and foreman standup notes/commitments (`dailyCommitNotes` for that clocked-in technician).
   - Display a Shop Capacity HUD: calculating total available scheduled technician hours remaining today vs total remaining book hours of incomplete tasks. Renders progress bar and load factor alert/badge.

3. **Implement R3. Test Suite Integration**:
   - Add Vitest test blocks inside `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` verifying all sequence changes, note updates, hourly allocations, operations search filtering, and shop capacity calculations.
   - Add stress/performance test cases inside `apps/web/src/features/business/__tests/MorningMeetingBoardStress.test.tsx` verifying rapid rendering and calculations on large datasets.

4. **Verification**:
   - Compile the web package (`npm run build -w web`) to ensure zero TypeScript or compilation errors.
   - Execute the test suite using Vitest to ensure all tests pass perfectly.
   - Ensure styling matches the premium dark-glassmorphic styling of the board.

Write your step-by-step progress to `c:\_Projects\upfittersos.com\.agents\worker_foreman_extension\progress.md` and write your final handoff report to `c:\_Projects\upfittersos.com\.agents\worker_foreman_extension\handoff.md` detailing all edits, files changed, and test/build outcomes before returning!
