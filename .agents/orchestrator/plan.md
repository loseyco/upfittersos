# Technical Plan: Interactive Workflow Whiteboard System

## Mission
Build a highly aesthetic, interactive workflow whiteboard system in the UpfittersOS platform under `/canvases`, replacing the placeholder generic grid. The whiteboard features customization blueprint nodes, multi-outcome drag-and-drop pins, debounced real-time Firestore sync, and strict custom permissions gating.

## Milestones

| # | Milestone Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| **M1** | **Custom Permissions Gating** | Register `whiteboards.view` and `whiteboards.manage` in `permissions.ts`, update Sidebar, and expose permissions in `StaffManager.tsx` UI. | None | DONE |
| **M2** | **Whiteboard Gallery** | Adapt gallery view in `CanvasGalleryTab.tsx` with modal board creation, renaming, archiving, and live text search/filter. Mount under `/business/:tenantId/canvases` in `TenantDashboard.tsx`. | M1 | DONE |
| **M3** | **Infinite Logic Canvas** | Build infinite canvas `WorkflowCanvasTab.tsx` with `@xyflow/react`, incorporating custom `IdeaNode` outcomes drag-and-drop, color picking, and `IdeaEdge` wire actions (insert node `+` / cut connection `x`). | M2 | DONE |
| **M4** | **Firestore Real-time Sync** | Implement 1.5s debounced Firestore auto-saving under `business_canvases` collection, dirty state tracking (`hasUnsavedChangesRef` flag to prevent local active drag jitter), and callback function sanitization. | M3 | DONE |
| **M5** | **Verification & Testing** | Verify typescript type safety, build compilation, and perform verification tests to ensure that all requirements are met and clean. | M4 | DONE |

## Target Files
1. **Permissions & UI Access**:
   - `apps/web/src/lib/auth/permissions.ts`
   - `apps/web/src/features/business/BusinessSidebar.tsx`
   - `apps/web/src/features/business/StaffManager.tsx`
   - `apps/web/src/features/business/TenantDashboard.tsx`
2. **Interactive Whiteboard System**:
   - `apps/web/src/features/business/CanvasGalleryTab.tsx`
   - `apps/web/src/features/business/WorkflowCanvasTab.tsx`
   - `apps/web/src/features/business/canvas/IdeaNode.tsx`
   - `apps/web/src/features/business/canvas/IdeaEdge.tsx`

## Verification Criteria
1. **Permissions**: Admin can view/edit; view-only users are restricted from editing actions, dragging nodes, adding outcomes, drawing wires, or invoking modals. Unprivileged staff are blocked from accessing the tab.
2. **Interactivity**: Zoom/pan controls work, double-clicking canvas spawns new node modal, custom IdeaNode renders outcomes with dynamic drag reordering and color pickers.
3. **Collaboration**: Saving works seamlessly after 1.5s debounce; local drag operations do not suffer from snapshot listening jitter.
4. **Build & Test**: Project builds with no errors, all tests pass.
