# Implementation Plan: Foreman Standup & Operations Hub Extension

This plan details the design, architecture, and step-by-step implementation for extending the UpfittersOS Morning Meeting Board to integrate interactive daily task sequencing and a live Operations Q&A Dashboard.

---

## 1. Architectural Design & Firestore Schema Updates

To support the interactive features without breaking existing code, we will store sequences, notes, schedule allocations, and other foreman commits in the existing collections by adding specific fields.

### Staff Daily Sequence & Commitments
In the existing staff document (`businesses/{tenantId}/staff/{staffId}`):
* `dailyTaskSequence`: `string[]` - Ordered list of `taskId`s representing the daily sequencing.
* `dailyCommitNotes`: `string` - Standup memo/notes for the technician for today.
* `hourlyAllocations`: `Record<string, { startTime: string; endTime: string; bookTimeAllocated: number }>` - Allocation of task book hours to specific time blocks (e.g., `"task1": { startTime: "08:00", endTime: "12:00", bookTimeAllocated: 4 }`).

### Shop Capacity Calculations (Real-time HUD)
* **Total Available Technician Hours Remaining Today**: Sum of remaining scheduled hours for all clocked-in/scheduled staff members. For each tech scheduled today: `shiftEndMs - max(now, shiftStartMs)` mapped to hours.
* **Total Remaining Book Hours**: Sum of all incomplete tasks' book hours assigned to active/scheduled technicians, or unassigned tasks for today's active departments.

---

## 2. Milestones & Task Breakdown

### Milestone 1: Daily Task Sequencing, Notes & Hourly Blocker UI
* Add click-to-reorder/drag-to-sequence handles on technician daily assignments.
* Build the visual Hourly Schedule Blocker timeline allocator on the staff detail page.
* Add daily commit notes editing with real-time saving to Firestore staff records.
* Ensure visually elegant dark-glassmorphic styling on all elements.

### Milestone 2: Operations & Sales Q&A Search Hub & HUD
* Add an "Operations Hub" tab in layoutMode (`'operations'`).
* Create a search interface querying by Job Number, VIN, or Customer Name.
* Build a Real-Time Job Finder displaying clocked-in tech, active task status, estimated completion time (ETA), and foreman notes.
* Display the Dynamic Shop Capacity HUD showing overall available vs remaining hours today.

### Milestone 3: Comprehensive Testing & Verification
* Write Vitest unit and integration tests inside `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` verifying:
  - Task sequencing/notes save/load to Firestore.
  - Operations Hub searching and displaying live active techs/notes.
  - Shop capacity HUD real-time calculations.
* Ensure strict TS compilation and zero production compilation issues.
* Perform Forensic Auditor checks.

---

## 3. Step-by-Step Implementation Steps

### Step 1: Detailed Codebase Analysis & Mock Emitting
* Analysis of existing snapshots, listeners, update methods in `MorningMeetingBoard.tsx`.
* Setup of mock database models and helper updates.

### Step 2: Implementation of Milestone 1
* Update `MorningMeetingBoard.tsx` with:
  - Sequencing controls: arrow up/down button controls on task list or quick drag sequencing.
  - Standup commit note textarea saving to `businesses/${tenantId}/staff/${member.id}` via `updateDoc`.
  - Hourly timeline block allocation editor that maps hours of shift and allows allocating task durations into them.
  - Integrating visuals in R3 shift schedule timeline.

### Step 3: Implementation of Milestone 2
* Update `MorningMeetingBoard.tsx` with:
  - An "Operations" tab option in the header.
  - Search logic matching Job Number, Customer Name, or VIN on active jobs list.
  - Roster/task lookup mapping searched jobs to active clocked-in techs and active tasks.
  - Capacity calculation helper sum of scheduled remaining hours vs remaining book hours.

### Step 4: Test Authoring & Execution
* Author rigorous test specs in the `__tests__` directory using screen assertions.
* Require worker to execute tests via `vitest` and report outcomes.
* Run strict typecheck `tsc` to verify no TS errors.
