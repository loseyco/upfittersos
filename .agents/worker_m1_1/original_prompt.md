## 2026-05-26T17:30:54Z
You are tasked with implementing Milestone 1: Real-time Firestore Sync Hooks of the Parts Department Mission Control optimization project.

Goal:
Refactor the state management in the Parts Department dashboard and hook tracking from static, cached TanStack queries to fully real-time `onSnapshot` firestore streams. This ensures that updates across different browser sessions are synchronized immediately.

Specific Tasks:
1. In `apps/web/src/features/business/hooks/useJobPartsStatus.ts`:
   - Replace the TanStack `useQuery` hook with a standard React hook using `useState` and `useEffect`.
   - Setup two parallel, reactive `onSnapshot` queries:
     - Collection `businesses/${tenantId}/parts_requests` where `jobId == jobId`
     - Collection `businesses/${tenantId}/shipments` where `jobId == jobId`
   - Combine the snapshot results and compute the `JobPartsInfo` state in-memory on every snapshot change, applying the exact same logical rules as the original hook:
     - Status is 'Ready' if received/fulfilled parts == total parts.
     - Status is 'Blocked' if there are pending parts and at least one has no shipment or shipment has no ETA.
     - Status is 'Pending with ETA' if there are pending parts, but all have shipments, and at least one shipment has an ETA.
     - Status is 'No Parts Needed' if there are no parts requests linked to the job.
   - Return `{ data: partsInfo, isLoading }` to maintain strict compatibility with `ScheduleBoard.tsx` (which calls `const { data: partsInfo } = useJobPartsStatus(tenantId, job.id);`).

2. In `apps/web/src/features/business/PartsMissionControl.tsx`:
   - Convert the `shipments` TanStack `useQuery` query to a real-time `onSnapshot` subscription co-located in the main dashboard `useEffect` hook.
   - Calculate dashboard statistics KPI counts (Stats) reactively in memory from the real-time `requests` and `shipments` lists rather than using `getCountFromServer` in a static `useQuery`. For `inventoryItems`, you can count from the `inventory` query or load it separately to keep that KPI functional.
   - Remove any manual cache invalidations `queryClient.invalidateQueries` that were previously required for shipments or requests since they are now fully real-time streams!

Verification:
- Run the build command and frontend test suite to ensure all tests compile and pass:
  ```bash
  npm run test:run -w web
  ```
- Document the commands, compilation outcomes, and test results inside your `changes.md` and `handoff.md` inside your working directory.

Working directory:
c:\_Projects\upfittersos.com\.agents\worker_m1_1\

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
