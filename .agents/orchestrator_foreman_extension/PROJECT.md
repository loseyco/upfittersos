# Scope: Foreman Standup & Operations Hub Extension

## Architecture
The Foreman Standup & Operations Hub Extension is an interactive workspace upgrade to the UpfittersOS Morning Meeting Board (`apps/web/src/features/business/MorningMeetingBoard.tsx`).
- **Reactive Data Model**: Extends Firestore `businesses/${tenantId}/staff/${memberId}` documents with properties `dailyTaskSequence`, `dailyCommitNotes`, and `hourlyAllocations` representing sequences, standup memos, and horizontal hourly blocker allocations. State changes are auto-propagated reactively via active socket listeners.
- **Task Sequencing**: Swaps IDs in the daily task sequence array and re-orders `assignedJobTasks` in real-time. Ordinal badges render visually on the board.
- **Timeline Blocker**: Renders an 8-hour horizontal planner overlaying with actual clocked shift bounds, allowing manual selection from assigned and department-triaged tasks.
- **Operations Finder & HUD**: Search interface matching Job Number, Customer Name, and VIN. Computes dynamic overall available technician capacity vs remaining shop workload book hours in real-time.

## Milestones
| # | Milestone Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | R1: Task Sequencing & Schedule Blocker | Implement task re-ordering, daily commitments text memo, and 8-hour shift timeline blocker/allocator with dark-glassmorphic layouts. | None | DONE |
| M2 | R2: Operations Hub & HUD | Implement dedicated operations hub tab, real-time job finder, clocked tech details, active tasks, expected ETA completion, and Shop Capacity Load factor calculations. | M1 | DONE |
| M3 | R3: Verification & Test Integration | Add unit and stress test cases inside standard test files. Build and compile without typecheck warnings. Verify all specs pass. | M2 | DONE |

## Interface Contracts
### Custom Staff Properties (`StaffMember`)
```typescript
interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoURL?: string;
  departmentId?: string;
  individualSchedule?: WorkSchedule;
  jobTitle?: string;
  isArchived?: boolean;
  
  // Custom updates
  dailyTaskSequence?: string[];
  dailyCommitNotes?: string;
  hourlyAllocations?: Record<number, HourlyAllocation>;
}

interface HourlyAllocation {
  taskId: string;
  taskTitle: string;
  jobId: string;
  jobNumber?: string;
}
```

## Code Layout
- `apps/web/src/features/business/MorningMeetingBoard.tsx` — All client dashboard features, tabs, lists, and modal interfaces.
- `apps/web/src/features/business/__tests/MorningMeetingBoard.test.tsx` — Unit and integration tests.
- `apps/web/src/features/business/__tests/MorningMeetingBoardStress.test.tsx` — Stress and load tests.
