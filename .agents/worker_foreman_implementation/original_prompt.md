## 2026-05-26T17:27:38Z
You are 'teamwork_preview_worker'.
Your role is 'Foreman Standup & Operations Hub Implementer'.
Your coordination folder is 'c:\_Projects\upfittersos.com\.agents\worker_foreman_implementation'. Please initialize your progress tracking there in 'progress.md' with a 'Last visited' timestamp.

Your task is to implement the "Foreman Standup & Operations Hub" extensions to the UpfittersOS Morning Meeting Board (Milestones M2, M3, M4, and M5).

### Core Objectives:
1. **R1: Standup Presentation Focus Mode**:
   - Implement a fullscreen slide-deck overlay in `c:\_Projects\upfittersos.com\apps\web\src\features\business\MorningMeetingBoard.tsx` that cycles through clocked-in or scheduled staff members today.
   - Scale typography and UI elements for high readability from 10+ feet.
   - Add keyboard shortcut listeners (`ArrowLeft`, `ArrowRight`, `Spacebar`, `Escape`) and large touch-friendly Next/Prev controls.
   - Restore standard layout on exit.

2. **R2: Daily Operations Briefing Feed & Summary**:
   - Add an "Operations Briefing" tab alongside "Lanes" and "Grid" view toggles.
   - Aggregate attendance insights (present vs absent counts, absent names), active blocker alerts from active jobs, unassigned department backlogs, and target job completion ETAs using the shared `calculateDynamicETA` adapted from `BayMonitor.tsx`.
   - Implement a "Copy Briefing to Clipboard" feature that formats this summary into a clean Markdown document and displays a toast notification using `toast.success`.

3. **R3: Shift Timeline Overlay & Pace Warnings**:
   - On each technician's card, display a horizontal visual timeline showing scheduled shift boundaries (start time to end time) mapped proportionally alongside actual clocked time (including visual break bars) and a blinking red current-time marker.
   - Generate glowing amber/rose badges ("PACE ALERT") when a technician's remaining book hours exceeds 4 hours and their remaining shift time today is less than 2 hours.

4. **Test Suite Implementation**:
   - Open `c:\_Projects\upfittersos.com\apps\web\src\features\business\__tests\MorningMeetingBoard.test.tsx` and remove the `.skip` modifier from:
     - `describe('MorningMeetingBoard - R1: Standup Presentation Focus Mode', ...)`
     - `describe('MorningMeetingBoard - R2: Daily Operations Briefing Feed', ...)`
     - `describe('MorningMeetingBoard - R3: Timeline & Pace Warnings', ...)`
   - Implement TDD unit test assertions for all R1, R2, and R3 test stubs.
   - Fully cover focus navigation, cycling, escaping, live briefing feed aggregation, clipboard sharing, shift timeline overlay percentages, and pace alert thresholds.
   - Leverage `__emitSnapshot` and `__setMockAuth` as needed.

### Design Aesthetics & Constraints:
- Adhere strictly to the existing **dark-glassmorphic style** (semi-transparent backgrounds, custom borders, neon/glow accents, and smooth transitions).
- Ensure zero regression on existing board features.
- Build and verify: run `npm run build -w web` and `npm run test:run -w web` and make sure they pass cleanly with 100% success.
- Once complete, write a detailed `handoff.md` in your coordination folder.

### MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please let me know once you have received this task and have initialized your progress tracking. Keep me updated on your progress via messages.
