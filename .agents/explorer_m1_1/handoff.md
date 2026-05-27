# Handoff Report — Milestone 1: Package & Permission Setup

This report outlines the observations, logical arguments, and recommendations for setting up the package dependency (`@xyflow/react`) and permissions structure for the canvases/whiteboards feature.

---

## 1. Observation

### A. Permission Settings
In `apps/web/src/lib/auth/permissions.ts`, permissions are recorded within an object exported as `PERMISSIONS`:
```typescript
1: export const PERMISSIONS = {
2:   'quickdesk.view': 'View QuickDesk (Classic)',
...
41:   'vendors.manage': 'Manage Vendors & Services',
42: } as const;
43: 
44: export type PermissionKey = keyof typeof PERMISSIONS;
```

### B. Business Sidebar
In `apps/web/src/features/business/BusinessSidebar.tsx`, the item of `id: 'canvases'` has the following structure:
```typescript
49:   { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'facility.view' },
```

### C. Tenant Dashboard
In `apps/web/src/features/business/TenantDashboard.tsx`, the canvases routing fallback is configured at lines 452–456:
```typescript
452:             {activeTab === 'canvases' && (
453:               <PermissionGate permission="facility.view">
454:                 <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
455:               </PermissionGate>
456:             )}
```
The file parses wildcard sub-routes inside the operational view using the splat parameter:
```typescript
54:   const splat = params['*'] || '';
55:   const pathParts = splat.split('/').filter(Boolean);
56:   const activeTab = pathParts[0] || 'overview';
```

### D. Staff & Department Permissions Configuration
In `apps/web/src/features/business/StaffManager.tsx`, the permissions grid categorizes items inside `categories` inside the `PermissionGrid` component:
```typescript
625:   const categories = {
626:     'General': ['quickdesk.view', 'mission_control.view', 'foreman.view', 'graphics.view', 'fast.view', 'fabrication.view', 'office.view', 'printed_parts.view', 'printed_parts.manage', 'performance.view'],
627:     'Inventory & Vehicles': ['vehicles.view', 'vehicles.manage', 'zones.view', 'zones.manage', 'parts.view', 'parts.manage'],
628:     'Business Operations': ['customers.view', 'customers.manage', 'jobs.view', 'jobs.manage', 'jobs.qc', 'staff.view', 'staff.manage'],
629:     'Tasks & Timeclock': ['tasks.view', 'tasks.manage', 'timeclock.view', 'timeclock.manage', 'timeclock.offsite'],
630:     'Communication & Facility': ['communication.view', 'facility.view'],
631:     'System & Data': ['settings.view', 'settings.manage', 'reports.view', 'sync.view'],
632:     'Experimental': ['experimental.new_modals']
633:   };
```
Furthermore, the file dynamically renders permission labels on cards and profiles:
```typescript
975:                     {PERMISSIONS[k as PermissionKey]}
```

### E. Workspace and Dependencies
In `package.json` (root directory), workspaces are designated:
```json
14:   "workspaces": [
15:     "apps/*"
16:   ]
```
And inside `apps/web/package.json`, build scripts are outlined as:
```json
6:   "scripts": {
7:     "dev": "vite",
8:     "build": "tsc -b && vite build",
...
```

---

## 2. Logic Chain

1. **Permission Registration**: Since `PermissionKey` uses `keyof typeof PERMISSIONS` (Obs A), adding `'whiteboards.view'` and `'whiteboards.manage'` to `PERMISSIONS` registers them statically in TypeScript.
2. **Sidebar Access**: Gating the canvases option by `'whiteboards.view'` requires editing line 49 of `BusinessSidebar.tsx` to set `permission: 'whiteboards.view'` (Obs B).
3. **Operational Board Views**: Gating and supporting the Canvas Gallery (all canvases) versus Canvas Workflow (specific canvas ID) is achieved in `TenantDashboard.tsx` (Obs C) by referencing the second index of path wildcards (`pathParts[1]`). If `pathParts[1]` exists, the client is viewing a specific canvas (`WorkflowCanvasTab`); otherwise, they are viewing the gallery (`CanvasGalleryTab`).
4. **Staff Management Integration**: Visualizing and modifying these permissions inside `StaffManager.tsx` (Obs D) requires updating the `categories` configuration block so the permission editor renders checkboxes. Other views, like the Staff Profiles and Department detail views, automatically map names from `PERMISSIONS` object key lookup, and thus don't need additional edits.
5. **Flow Dependency**: Adding `@xyflow/react` in `apps/web/package.json` enables flow visualization features (Obs E). In npm workspaces, we run `npm install @xyflow/react -w web` to safely resolve global node modules. The compile-time validation is executed via `npm run build -w web` from the root workspace.

---

## 3. Caveats

- We assumed that `CanvasGalleryTab` and `WorkflowCanvasTab` components will be added under `apps/web/src/features/business/components/` or equivalent features path, and will be imported as default/named exports.
- Build success depends on `@xyflow/react` version compatibility with React 19. `@xyflow/react` v12 natively supports React 19, which resolves perfectly.

---

## 4. Conclusion

Milestone 1 is well-defined, robust, and straight-forward. By implementing the exact modifications described in the analysis, developers can securely gate the canvas feature, configure staff/department overrides, import React Flow components, and build the updated dashboard successfully.

---

## 5. Verification Method

To verify the changes once applied:
1. **TypeScript / Lint Compile Verification**:
   Run from the repository root:
   ```bash
   npm run build -w web
   ```
   This ensures that no type mismatches occur after introducing the new `PermissionKey` elements.
2. **Path Verification**:
   Inspect that the following files are correctly modified and match the proposed replacement sections:
   - `apps/web/src/lib/auth/permissions.ts`
   - `apps/web/src/features/business/BusinessSidebar.tsx`
   - `apps/web/src/features/business/TenantDashboard.tsx`
   - `apps/web/src/features/business/StaffManager.tsx`
   - `apps/web/package.json`
