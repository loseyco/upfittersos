## 2026-05-26T17:33:01Z
You are the Milestone 2-4 Worker. Your working directory is c:\_Projects\upfittersos.com\. Your coordinating metadata directory is c:\_Projects\upfittersos.com\.agents\worker_m2_4 (please write your coordination files like progress.md and handoff.md there).

Your task is to implement Milestone 2 (Whiteboard Gallery), Milestone 3 (Infinite Logic Canvas & Custom Nodes), and Milestone 4 (Firestore Sync & Read-Only Gating).

Please study the following reference files in c:\_Projects\SAEGroup\:
1. c:\_Projects\SAEGroup\src\pages\business\admin\CanvasGalleryTab.tsx
2. c:\_Projects\SAEGroup\src\pages\business\admin\WorkflowCanvasTab.tsx
3. c:\_Projects\SAEGroup\src\pages\business\admin\canvas\IdeaNode.tsx
4. c:\_Projects\SAEGroup\src\pages\business\admin\canvas\IdeaEdge.tsx

And implement the following files inside UpfittersOS:

1. `apps/web/src/features/business/CanvasGalleryTab.tsx`
- Adapt from CanvasGalleryTab.tsx reference.
- Use `useAuthStore` from `../../lib/auth/store` instead of `useAuth`. Use `user` instead of `currentUser`.
- Use `db` from `../../lib/firebase/config` instead of the legacy firebase import.
- Support collection querying on `business_canvases` where `tenantId === tenantId`.
- Add a text search input field to dynamically filter canvases by name!
- Enforce custom permissions:
  - Gated by 'whiteboards.view' permission for viewing.
  - If the user does not have 'whiteboards.manage' permission (and is not super admin), hide or disable all editing buttons (New Whiteboard, Rename Canvas, Archive Canvas).

2. `apps/web/src/features/business/canvas/IdeaNode.tsx`
- Adapt from IdeaNode.tsx reference.
- Add read-only gating:
  - Read `data.readOnly` property from props.
  - If `readOnly` is true:
    - Set NodeResizer `isVisible={selected && !readOnly}`.
    - Set outcomes draggable state: `draggable={!readOnly && !editingOutputId}`.
    - Hide the node edit/delete/color actions panel.
    - Hide or disable outcomes custom color palette, reorder chevrons, drag handle grip, delete outcome route, edit outcome route, and add outcome route buttons.

3. `apps/web/src/features/business/canvas/IdeaEdge.tsx`
- Adapt from IdeaEdge.tsx reference.
- Add read-only gating:
  - Read `data?.readOnly` property from props.
  - If `readOnly` is true, completely skip rendering the hover action overlay (insert '+' and cut 'x' menu panel) and only render the `BaseEdge` component.

4. `apps/web/src/features/business/WorkflowCanvasTab.tsx`
- Adapt from WorkflowCanvasTab.tsx reference.
- Use `useAuthStore` from `../../lib/auth/store` instead of `useAuth`. Use `user` instead of `currentUser`.
- Use `db` from `../../lib/firebase/config`.
- Integrate permissions gating:
  - Compute `readOnly` as `!(isSuperAdmin || permissions['whiteboards.manage'])`.
  - Pass `readOnly` down to each node's `data` and each edge's `data` object properties.
  - Pass `nodesDraggable={!readOnly}` and `nodesConnectable={!readOnly}` to the ReactFlow component.
  - If `readOnly` is true:
    - Disable or ignore canvas double-clicks (`handleDoubleClick` should return early).
    - Hide the "Add Node" button and "Auto-saving..." panels or display a read-only badge.
- Implement Firestore auto-saving with 1.5s debounce.
- Prevent snapshot jitter using `hasUnsavedChangesRef` dirty state tracking to shield active client-side drags/updates.
- Sanitize node/edge objects before writing to Firestore by removing callback function properties (`onDelete`, `onEdit`, `onAddOutput`, `onEditOutput`, `onDeleteOutput`, `onReorderOutputs`, `onOutputColorChange`, `onNodeColorChange`, `onInsertNode`, `onLabelDrag`).

5. `apps/web/src/features/business/TenantDashboard.tsx`
- Replace the canvases tab placeholder (lines 452-456) with:
  ```tsx
  {activeTab === 'canvases' && (
    <PermissionGate permission="whiteboards.view">
      {pathParts[1] ? (
        <WorkflowCanvasTab 
          tenantId={tenantId!} 
          canvasId={pathParts[1]} 
          onBack={() => navigate(`/business/${tenantId}/canvases`)} 
        />
      ) : (
        <CanvasGalleryTab 
          tenantId={tenantId!} 
          onOpenCanvas={(canvasId) => navigate(`/business/${tenantId}/canvases/${canvasId}`)} 
        />
      )}
    </PermissionGate>
  )}
  ```
- Make sure to import `CanvasGalleryTab` and `WorkflowCanvasTab` at the top of the file!

Verify that your changes compile successfully by proposing and running compilation checks such as `npm run build -w web` or `npx tsc -p apps/web/tsconfig.app.json` (via run_command) and document the results.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please document all files created/modified, command executions, and build verification outputs in c:\_Projects\upfittersos.com\.agents\worker_m2_4\handoff.md. Report back with a summary when complete.
