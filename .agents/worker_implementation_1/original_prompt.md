## 2026-05-26T17:25:46Z
You are the Specialist Worker for the Foreman Standup & Operations Hub implementation.
Your working directory is: c:\_Projects\upfittersos.com\.agents\worker_implementation_1
Your task is to implement all the requirements (R1, R2, and R3) for the Foreman Standup & Operations Hub inside `apps/web/src/features/business/MorningMeetingBoard.tsx` and fix the testing mocks in `apps/web/src/test/setup.ts`.

### 1. Fix the Testing Mocks in `apps/web/src/test/setup.ts`
The tests currently fail because `MorningMeetingBoard.tsx` imports `../../lib/firebase/config` which triggers the real Firebase initialization and throws `FirebaseError: No Firebase App '[DEFAULT]' has been created`.
Please update `apps/web/src/test/setup.ts` to mock the other Firebase modules used in `config.ts` so that it executes cleanly and exports mock objects.
Add these mocks to the top of `setup.ts`:
```typescript
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
    onAuthStateChanged: vi.fn(() => () => {}),
  })),
}))
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
}))
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
}))
vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  isSupported: vi.fn(() => Promise.resolve(false)),
}))
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  isSupported: vi.fn(() => Promise.resolve(false)),
}))
```
Verify that this fixes the import crash by running the test suite.

### 2. Implement R1: Standup Presentation Focus Mode
- **Layout Toggles**: In the `MorningMeetingBoard` header, add buttons to switch between `'lanes'`, `'grid'`, `'presentation'`, and `'briefing'` layout modes (under `layoutMode`).
- **Tactile Presentation View**: When `layoutMode === 'presentation'`, render a slide-deck layout focusing on one clocked-in staff member at a time:
  - Only present staff (status is `'active'` or `'on_break'`) should be cycled through.
  - Large typography: Giant staff names (e.g. `text-5xl md:text-6xl font-black`), department, and role names.
  - Large progress bar: Expanded task progress bar (`h-6` or `h-8`) with large percentage text.
  - Checklist rows: Scaled checklists (`w-7 h-7` or `w-8 h-8` checkboxes, `text-xl md:text-2xl` text).
- **Navigation Controls**: Left/Right keyboard arrow keys and touch-friendly Prev/Next buttons to step through clocked-in staff. Exiting via escape key or a close button restores `'lanes'` mode.

### 3. Implement R2: Daily Operations Briefing Feed & Summary
- **Scannable HUD**: When `layoutMode === 'briefing'`, render a dashboard panel with 4 sections:
  1. Attendance Check: Clocked-in/on-break count vs scheduled, highlighting absent/late technicians.
  2. Active Blocker Alerts: List of blocked jobs and blocker comments.
  3. Unassigned Tasks list: Active job tasks currently unassigned grouped by department.
  4. Target Job ETAs: Active work orders expected completion times (jobs with `expectedFinishTime`).
- **One-Click Share**: Add a "Copy Briefing to Clipboard" button that formats these 4 sections into a clean, markdown bulleted summary text and uses `navigator.clipboard.writeText` to copy it, followed by a toast alert.

### 4. Implement R3: Task Timeline vs Shift Schedule Overlay
- **Horizontal timeline**: Draw a clean horizontal timeline visual comparing actual clocked-in time against scheduled shift bounds on both standard staff cards and the presentation slide deck.
  - Proportionally map clocked-in sessions and current time marker within shift bounds (e.g., 0% to 100%).
- **Pace Warnings**: Trigger a warning icon and alert message if a technician has `remainingBookHours > 4` with less than 2 hours remaining in their scheduled shift today.

### 5. Verification & Testing
- Un-skip the 7 skipped TDD tests inside `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` (remove `.skip` from the describe blocks).
- Run the tests (`npx vitest run` or `npm run test:run -w web` in `apps/web`) to make sure all 12 tests pass successfully.
- Run `npm run build -w web` to ensure zero compilation or TypeScript errors.

⚠️ **MANDATORY INTEGRITY WARNING**:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please write a detailed handoff report when done and let me know.
