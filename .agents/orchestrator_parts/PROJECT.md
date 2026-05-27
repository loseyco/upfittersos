# Project: Parts Department Mission Control Optimization

## Architecture
This project optimizes the Parts Department Mission Control board inside UpfittersOS.
- **Isolated Scope (R2)**: Only modifies the parts department control panel and its immediate subcomponents:
  - `apps/web/src/features/business/PartsMissionControl.tsx`
  - `apps/web/src/features/business/hooks/useJobPartsStatus.ts`
  - `apps/web/src/features/business/ItemDetailsModal.tsx`
  - `apps/web/src/features/business/PackageIntakeModal.tsx`
- **Data Flow**: Full integration with real-time Firestore collections `parts_requests` and `shipments` scoped under `businesses/${tenantId}`. Static React Query `useQuery` calls are replaced with reactive `onSnapshot` listeners to eliminate sync lags.
- **Visual Design**: High-fidelity dark glassmorphic components leveraging CSS blurs (`backdrop-blur-xl`), hairline refractive borders (`border-[rgba(255,255,255,0.08)]`), glowing shadows, micro-animations, and high-contrast HSL status tag colors.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Real-time Firestore Sync Hooks | Refactor `useJobPartsStatus.ts` hook and `PartsMissionControl.tsx` state to use real-time `onSnapshot` subscriptions for `shipments`. Calculate KPIs (stats) reactively in-memory to eliminate React Query static caching. | None | DONE |
| M2 | Modal Consolidation | Refactor `ItemDetailsModal.tsx` to merge duplicate `BetaItemDetailsModal` and `LegacyItemDetailsModal` components into a single high-performance component. Secure reactive propagation of tracking, carrier, and notes updates. | M1 | DONE |
| M3 | Dark Glassmorphic UI Polish | Apply high-end dark glassmorphic styles, responsive micro-animations, animated barcode scanner sweeps, and HSL-tailored status colors on the dashboard, modal elements, and tags. | M2 | DONE |

## Interface Contracts
### `useJobPartsStatusStream` Hook Signature
- File: `apps/web/src/features/business/hooks/useJobPartsStatus.ts` (or dynamic refactor/stream replacement)
- Return value:
  ```typescript
  interface JobPartsInfo {
    status: 'no_parts' | 'ready' | 'pending' | 'pending_with_eta' | 'blocked';
    partsCount: number;
    receivedCount: number;
    parts: PartsRequest[];
    shipments: Shipment[];
  }
  ```

### Firestore Schema
- **Parts Request**: `businesses/${tenantId}/parts_requests/${requestId}`
- **Shipment**: `businesses/${tenantId}/shipments/${shipmentId}`

## Code Layout
- `apps/web/src/features/business/PartsMissionControl.tsx` — Main control panel dashboard
- `apps/web/src/features/business/hooks/useJobPartsStatus.ts` — React hook for job-specific parts status
- `apps/web/src/features/business/ItemDetailsModal.tsx` — Modal displaying detailed item info and updates
- `apps/web/src/features/business/PackageIntakeModal.tsx` — Barcode scanning and intake modal
