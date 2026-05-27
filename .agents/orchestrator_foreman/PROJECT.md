# Project: Foreman Standup & Operations Hub

## Architecture
The extension is integrated as new views and components within the existing `MorningMeetingBoard.tsx` in `apps/web/src/features/business/`. It uses the existing real-time Firestore sync and dark-glassmorphic UI aesthetics.

- **Presentation Focus Mode (R1)**: A fullscreen slide deck overlay that isolates a single staff member at a time. It uses keyboard listeners (`ArrowLeft`, `ArrowRight`, `Spacebar`) and large interactive controls.
- **Operations Briefing (R2)**: A new tab alongside Lanes and Grid, aggregating attendance metrics, active blocker alerts from active jobs, unassigned department backlogs, and target job completion ETAs using a shared dynamic ETA calculation. Clipboard copying formats the summary as clean Markdown.
- **Shift Timeline (R3)**: Maps scheduled shift bounds (startTime to endTime) alongside actual time clock sessions (including visual break bars) and prints a blinking red current-time marker. Generates glowing amber/rose badges when remaining book time (>4h) exceeds remaining shift time (<2h).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Exploration & Test Setup | Analyze MorningMeetingBoard.tsx and activate unit test suite (remove describe.skip in MorningMeetingBoard.test.tsx) | None | DONE |
| 2 | M2: Standup Presentation Focus Mode (R1) | Widescreen fullscreen TV deck, expanded readability layout, Next/Prev + Keyboard bindings, layout restoration | M1 | DONE |
| 3 | M3: Daily Operations Briefing Tab & Copy (R2) | Unified briefing feed tab, attendance insights, active blockers list, unassigned backlog list, target job ETAs (w/ calculateDynamicETA), Copy Briefing markdown action | M2 | DONE |
| 4 | M4: Technician Shift Timeline & Pace Alerts (R3) | Shift timeline visual bar (clock-in, break, clock-out bounds), blinking current-time marker, pace warning threshold evaluation | M3 | DONE |
| 5 | M5: Verification, Review & Audit | Build compiles, all Vitest test suites (100% test coverage for new components) pass cleanly, Forensic Auditor verification | M4 | DONE |

## Interface Contracts
### MorningMeetingBoard ↔ R1 Focus Mode
- `presentationIndex`: number - currently focused staff member index
- `isPresentationMode`: boolean - focus mode visibility status
- keyboard listener binds `ArrowLeft` -> previous, `ArrowRight`/`Spacebar` -> next

### MorningMeetingBoard ↔ R2 Operations Briefing
- `activeTab`: 'lanes' | 'grid' | 'briefing' - view state toggle
- `calculateDynamicETA(job, tasks, departments)`: computes realistic completion times based on department work hours and backlog bookTime

### MorningMeetingBoard ↔ R3 Timeline Overlay
- `getShiftPercentage(timestamp, shiftStart, shiftEnd)`: returns progress fraction
- Pace Warning evaluates: `remainingBookTime > 4 && remainingShiftTime < 2`
