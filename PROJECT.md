# Project: Interactive Workflow Whiteboard System

## Architecture
The Interactive Workflow Whiteboard System replaces the generic data grid page at `/canvases` with an interactive multi-tier canvas.
- **State Management**: Scoped Firestore collections (`business_canvases`) mapped by `tenantId`. A combination of local React Flow state (`nodes`, `edges`) synced to Firestore on a debounced delay with drag-jitter filters.
- **UI & Controls**: Integrates with UpfittersOS glassmorphic dark themes. Styled using Tailwind CSS.
- **R1: Infinite Logic Canvas & Gallery**:
  - Two-tier layout: Canvas List/Gallery view (`CanvasGalleryTab`) and Canvas viewport (`WorkflowCanvasTab`).
  - Powered by `@xyflow/react` for panning, zooming, minimap, and double-click to drop nodes.
  - Custom `IdeaNode` renders type badges, priority indicators, custom card borders, and outcome routes reorderable via native HTML5 drag-and-drop.
  - Custom `IdeaEdge` paths colored by origin outcome pin, hovering exposes node injection (`+`) and link clipping (`x`).
- **R2: Firestore Sync**: Debounced (1.5s) `setDoc` with local dirty refs (`hasUnsavedChangesRef`) blocking snapshots during client actions to prevent stuttering.
- **R3: Permissions Gating**: Secured at sidebar (`BusinessSidebar.tsx`), routing (`TenantDashboard.tsx`), and UI levels via `whiteboards.view` and `whiteboards.manage` custom keys.

## Milestones
| # | Track | Milestone Name | Scope | Dependencies | Status |
|---|---|---|---|---|---|
| M1 | Infrastructure | Package & Permission Setup | Update `PERMISSIONS` registry. Register views in `StaffManager.tsx` UI. Secure `BusinessSidebar.tsx` and `TenantDashboard.tsx` route gates. Add `@xyflow/react` to `apps/web/package.json` and run install. | None | PLANNED |
| M2 | UI | Whiteboard Gallery | Build `CanvasGalleryTab.tsx` dark-themed collection grid with creation/rename/archive modals, search, and real-time list sync. | M1 | PLANNED |
| M3 | UI | Infinite Canvas & Custom Nodes | Build `WorkflowCanvasTab.tsx`, `IdeaNode.tsx`, and `IdeaEdge.tsx` components. Map xyflow canvas events, zoom, minimap, controls, double-click spawn. Support read-only editing locks. | M2 | PLANNED |
| M4 | Integration | Firestore Collaboration Sync | Sync canvas layouts to `business_canvases`. Apply debounced saves and local dirty refs to handle snapshot jitter. Prune functions. | M3 | PLANNED |
| M5 | Verification | E2E Testing & Hardening | Write unit and integration tests. Verify read-only vs edit clearance levels, test Firestore sync. Compile without strict TS errors. | M4 | PLANNED |

## Interface Contracts
### `CanvasMeta` Data Schema
- Document in `business_canvases` collection:
  ```typescript
  interface CanvasMeta {
      id: string;
      tenantId: string;
      name: string;
      description: string;
      nodes: any[];
      edges: any[];
      status?: 'active' | 'archived';
      updatedAt?: any;
      createdAt?: any;
      updatedBy?: string;
  }
  ```

## Code Layout
- `apps/web/src/lib/auth/permissions.ts` — Permission keys registry.
- `apps/web/src/features/business/TenantDashboard.tsx` — Routing tabs and PermissionGate wrapping.
- `apps/web/src/features/business/BusinessSidebar.tsx` — Sidebar menu option.
- `apps/web/src/features/business/StaffManager.tsx` — Staff permissions editor.
- `apps/web/src/features/business/CanvasGalleryTab.tsx` — Whiteboards Gallery.
- `apps/web/src/features/business/WorkflowCanvasTab.tsx` — Infinite Logic Canvas viewport.
- `apps/web/src/features/business/canvas/IdeaNode.tsx` — Custom drag-and-drop outcomes node.
- `apps/web/src/features/business/canvas/IdeaEdge.tsx` — Custom hover action wire.
