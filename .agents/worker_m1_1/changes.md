# Implementation Plan & Changes

## Milestone 1: Real-time Firestore Sync Hooks

### 1. Refactor `useJobPartsStatus.ts`
- **Goal**: Replace TanStack `useQuery` with custom React hook using parallel `onSnapshot` subscriptions.
- **Path**: `apps/web/src/features/business/hooks/useJobPartsStatus.ts`
- **Details**:
  - Use `useState` and `useEffect`.
  - Listen to `parts_requests` and `shipments` parallel streams where `jobId == jobId`.
  - Calculate `JobPartsInfo` state reactively in-memory once both initial snapshots have resolved.
  - Return `{ data: partsInfo, isLoading }`.

### 2. Refactor `PartsMissionControl.tsx`
- **Goal**: Convert `shipments` query to real-time stream co-located in the main dashboard `useEffect`, and compute KPI counts reactively in-memory.
- **Path**: `apps/web/src/features/business/PartsMissionControl.tsx`
- **Details**:
  - Add `shipments` state variable and sub-listener in the existing `useEffect` block.
  - Remove TanStack `useQuery` for shipments (`parts-shipments`) and stats (`parts-stats`).
  - Calculate statistics `stats` object reactively via `useMemo` in-memory from `requests` and `shipments` streams.
  - Retain `inventoryCount` load separately (via a minor `useQuery` or from `inventory` list if needed).
  - Remove all manual cache invalidations `queryClient.invalidateQueries` targeting shipments/stats queries.

### 3. Verification & Testing
- Propose and run `npm run test:run -w web` to ensure all tests pass.
- Write/update tests to cover the real-time streams and in-memory aggregation if appropriate.
