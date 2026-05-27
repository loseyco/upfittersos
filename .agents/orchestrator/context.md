# Context: Interactive Whiteboard System

## Code Locations & Target Files
- **Permissions Registry**: `apps/web/src/lib/auth/permissions.ts`
- **Dashboard Hub**: `apps/web/src/features/business/TenantDashboard.tsx`
- **Sidebar Menu**: `apps/web/src/features/business/BusinessSidebar.tsx`
- **Staff Control**: `apps/web/src/features/business/StaffManager.tsx`
- **New Feature Components**:
  - `apps/web/src/features/business/CanvasGalleryTab.tsx`
  - `apps/web/src/features/business/WorkflowCanvasTab.tsx`
  - `apps/web/src/features/business/canvas/IdeaNode.tsx`
  - `apps/web/src/features/business/canvas/IdeaEdge.tsx`

## Dependencies
- `@xyflow/react`: Must be installed in `apps/web` to support interactive canvas features. Let's make sure it is added to `apps/web/package.json` and `npm install` is executed in `apps/web`.
- Tailwind CSS & glassmorphic aesthetics already exist in UpfittersOS. The new components must inherit the beautiful dark-themed card styling, borders, and colors seen in the SAEGroup reference components.

## Reference Patterns
- studied `C:\Projects\SAEGroup\src\pages\business\admin\WorkflowCanvasTab.tsx` for React Flow configuration, dirty flags handling snapshot jitter, and dynamic pin operations.
- studied `C:\Projects\SAEGroup\src\pages\business\admin\CanvasGalleryTab.tsx` for gallery management and firestore queries.
- studied `C:\Projects\SAEGroup\src\pages\business\admin\canvas\IdeaNode.tsx` for custom pins HTML5 native drag and drop, and border color palettes.
- studied `C:\Projects\SAEGroup\src\pages\business\admin\canvas\IdeaEdge.tsx` for insert/cut action triggers.

## Key Firestore collection
- Collection: `business_canvases`
  - Document fields:
    - `tenantId`: string
    - `name`: string
    - `description`: string
    - `nodes`: Array of xyflow Node objects (with callback functions pruned)
    - `edges`: Array of xyflow Edge objects
    - `status`: optional string (e.g. `'archived'`)
    - `updatedBy`: string (author username/email)
    - `updatedAt`: serverTimestamp / Timestamp
    - `createdAt`: serverTimestamp / Timestamp
