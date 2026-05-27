# Handoff Report — Explorer 2

## 1. Observation
I directly examined and observed the following files and structural configurations within the codebase:

1. **`apps/web/src/lib/auth/permissions.ts`**:
   - The permissions are defined as an object literal cast `as const` under `PERMISSIONS`:
     ```typescript
     1: export const PERMISSIONS = {
     2:   'quickdesk.view': 'View QuickDesk (Classic)',
     ...
     40:   'vendors.view': 'View Vendors & Services',
     41:   'vendors.manage': 'Manage Vendors & Services',
     42: } as const;
     ```
   - Derived types are defined on lines 44-48:
     ```typescript
     44: export type PermissionKey = keyof typeof PERMISSIONS;
     45: 
     46: export type PermissionSet = {
     47:   [K in PermissionKey]?: boolean;
     48: };
     ```

2. **`apps/web/src/features/business/BusinessSidebar.tsx`**:
   - Currently, the navigation options list (`ITEMS` array, line 49) gates the 'canvases' item under `'facility.view'`:
     ```typescript
     49:   { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'facility.view' },
     ```

3. **`apps/web/src/features/business/TenantDashboard.tsx`**:
   - Under `TenantDashboard` render method (lines 452-456), the canvases tab has a placeholder data grid:
     ```typescript
     452:             {activeTab === 'canvases' && (
     453:               <PermissionGate permission="facility.view">
     454:                 <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
     455:               </PermissionGate>
     456:             )}
     ```
   - Path parameters parsing:
     ```typescript
     54:   const splat = params['*'] || '';
     55:   const pathParts = splat.split('/').filter(Boolean);
     ```

4. **`apps/web/src/features/business/StaffManager.tsx`**:
   - Permission categories inside `PermissionGrid` (lines 625-633):
     ```typescript
     625:   const categories = {
     626:     'General': ['quickdesk.view', ...],
     ...
     630:     'Communication & Facility': ['communication.view', 'facility.view'],
     ...
     633:   };
     ```

5. **`apps/web/package.json`**:
   - Current React version is `"react": "^19.2.5"`.
   - Build script at line 8:
     ```json
     "build": "tsc -b && vite build"
     ```

6. **Root `package.json`**:
   - Monorepo workspace configuration at line 14:
     ```json
     "workspaces": [
       "apps/*"
     ]
     ```

---

## 2. Logic Chain
1. **Permission Registration**: By appending `'whiteboards.view'` and `'whiteboards.manage'` to the `PERMISSIONS` object in `permissions.ts`, the TypeScript compiler automatically expands the `PermissionKey` union type and the `PermissionSet` interface due to the dynamic `keyof typeof PERMISSIONS` design.
2. **Sidebar Integration**: The `BusinessSidebar` relies on the `permission` attribute of items inside the `ITEMS` array. Changing the permission of the 'canvases' option from `'facility.view'` to `'whiteboards.view'` automatically filters it out or displays it for the authenticated user based on their specific whiteboard viewing capability.
3. **TenantDashboard Replacement**: By utilizing `pathParts[1]` parsed from the path splat (representing the `:canvasId` segment), the component can dynamically switch between rendering `CanvasGalleryTab` (when no sub-segment exists) and `WorkflowCanvasTab` (when a canvas ID is present) under a unified `'whiteboards.view'` `PermissionGate`.
4. **StaffManager Presentation**: Adding the keys `'whiteboards.view'` and `'whiteboards.manage'` into `categories['Communication & Facility']` makes them automatically render inside the administration toggles. When saved, Firestore updates the individual or departmental permission set, which then evaluates correctly in the runtime application.
5. **package.json & workspace compilation**: Adding `@xyflow/react` to `apps/web/package.json` and running `npm install` inside the root workspace ensures local node modules are generated correctly. Compilation using `npm run build` will verify syntax and type alignment.

---

## 3. Caveats
- **Component Availability**: `CanvasGalleryTab` and `WorkflowCanvasTab` components are planned for creation in subsequent milestones and do not exist in `apps/web/src/features/business/` yet.
- **Firebase/Firestore Schema**: We assume that whiteboard list data uses the Firestore collection path format `businesses/${tenantId}/canvases` as seen in the original `GenericDataGrid` placeholder.
- **React 19 Compatibility**: `@xyflow/react` must be installed with React 19 compatibility. Version `^12.4` and above supports React 19 natively.

---

## 4. Conclusion
Milestone 1 is cleanly architected. The configuration points are highly modular and ready to support registering whiteboards permissions, gating the sidebar/dashboard tabs, rendering standard staff management control switches, and installing `@xyflow/react` using NPM workspace commands.

---

## 5. Verification Method
1. **Compilation Check**: After executing the proposed file modifications and running `npm install @xyflow/react -w web`, execute:
   ```bash
   npm run build -w web
   ```
   This will verify that the project builds without TypeScript errors or Vite bundler failures.
2. **Visual Inspection**:
   - Check `apps/web/src/lib/auth/permissions.ts` to confirm `'whiteboards.view'` and `'whiteboards.manage'` are keys under `PERMISSIONS`.
   - Check `apps/web/src/features/business/BusinessSidebar.tsx` to confirm the item with `id: 'canvases'` has `permission: 'whiteboards.view'`.
   - Check `apps/web/src/features/business/TenantDashboard.tsx` to ensure `CanvasGalleryTab` and `WorkflowCanvasTab` are imported and gated under `'whiteboards.view'`.
   - Check `apps/web/src/features/business/StaffManager.tsx` to verify the categories map has `'whiteboards.view'` and `'whiteboards.manage'`.
