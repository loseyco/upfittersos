# Milestone 1: Package & Permission Setup — Technical Analysis Report

This analysis report covers the Package and Permission Setup (Milestone 1) for the whiteboard implementation.

---

## 1. Registering Whiteboard Permissions

### Location to Modify
* **File Path**: `apps/web/src/lib/auth/permissions.ts`
* **Target Construct**: The `PERMISSIONS` constant (lines 1–42)

### Registration Detail
Add `'whiteboards.view'` and `'whiteboards.manage'` as key-value pairs inside the `PERMISSIONS` object literal:

```typescript
export const PERMISSIONS = {
  // ... existing permissions
  'whiteboards.view': 'View Canvases/Whiteboards',
  'whiteboards.manage': 'Manage Canvases/Whiteboards',
} as const;
```

### Type Propagation & Resolution Mechanics
1. **Type Resolution (`PermissionKey`)**: 
   Since `PermissionKey` is typed as `keyof typeof PERMISSIONS` (line 44):
   ```typescript
   export type PermissionKey = keyof typeof PERMISSIONS;
   ```
   Adding these two keys automatically extends the union type of valid permission keys to include `'whiteboards.view'` and `'whiteboards.manage'` with compile-time safety.
2. **Permission Sets (`PermissionSet`)**:
   Since `PermissionSet` is defined mapped over `PermissionKey` (line 46):
   ```typescript
   export type PermissionSet = {
     [K in PermissionKey]?: boolean;
   };
   ```
   Any department permission configurations or user-level overrides will automatically allow the inclusion of these keys as boolean toggles.
3. **Resolution Function (`resolvePermissions`)**:
   The existing `resolvePermissions` utility (lines 50–63) will automatically process these overrides without modifications since it uses standard key assignment:
   ```typescript
   export function resolvePermissions(
     deptPermissions: PermissionSet = {},
     individualPermissions: PermissionSet = {}
   ): PermissionSet {
     const resolved: PermissionSet = { ...deptPermissions };
     Object.entries(individualPermissions).forEach(([key, value]) => {
       if (value !== undefined) {
         resolved[key as PermissionKey] = value;
       }
     });
     return resolved;
   }
   ```

---

## 2. Business Sidebar Integration

### Location to Modify
* **File Path**: `apps/web/src/features/business/BusinessSidebar.tsx`
* **Target Construct**: The `ITEMS` configuration array (lines 20–63)

### Sidebar Integration Detail
Locate the existing entry for `id: 'canvases'` (currently line 49) under the `'facility'` group:

#### Before
```typescript
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'facility.view' },
```

#### After
```typescript
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'whiteboards.view' },
```

### Access Control Logic
In `BusinessSidebar.tsx`, items are filtered before rendering inside the `NavContent` helper (lines 98–103):
```typescript
        const visibleItems = ITEMS.filter(i => {
          if (i.group !== groupId) return false;
          if (isSuperAdmin) return true;
          if (!i.permission) return true;
          return permissions[i.permission];
        });
```
By changing the item's permission to `'whiteboards.view'`, the "Canvases" tab will only show in the sidebar for users who have this explicit permission enabled (either inherited from their department or individually overridden), or are designated `isSuperAdmin`.

---

## 3. TenantDashboard Tab Replacement

### Location to Modify
* **File Path**: `apps/web/src/features/business/TenantDashboard.tsx`
* **Target Construct**: Canvases Tab Rendering Section (lines 452–456)

### Dashboard Integration Detail
1. **Imports**:
   Import `CanvasGalleryTab` and `WorkflowCanvasTab` at the top of the file:
   ```typescript
   import { CanvasGalleryTab } from './CanvasGalleryTab';
   import { WorkflowCanvasTab } from './WorkflowCanvasTab';
   ```
2. **Tab Replacement**:
   Replace the placeholder canvases data grid (lines 452–456) with sub-route aware loading:

#### Before
```typescript
            {activeTab === 'canvases' && (
              <PermissionGate permission="facility.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
              </PermissionGate>
            )}
```

#### After
```typescript
            {activeTab === 'canvases' && (
              <PermissionGate permission="whiteboards.view">
                {pathParts[1] ? (
                  <WorkflowCanvasTab tenantId={tenantId!} canvasId={pathParts[1]} />
                ) : (
                  <CanvasGalleryTab tenantId={tenantId!} />
                )}
              </PermissionGate>
            )}
```

### Routing and Sub-view Rationale
* The routing setup in `TenantDashboard` parses the URL splat using `pathParts = splat.split('/')` (line 55).
* When a user browses to `/business/:tenantId/canvases`, `activeTab` (which is `pathParts[0]`) equals `'canvases'`, and `pathParts[1]` is `undefined`. This triggers the rendering of `CanvasGalleryTab`, which acts as the gallery or workspace hub.
* When a user selects a whiteboard from the gallery, they are routed to `/business/:tenantId/canvases/:canvasId`. Here, `activeTab` remains `'canvases'` and `pathParts[1]` holds the specific `canvasId`. This triggers the rendering of `WorkflowCanvasTab`, displaying the interactive node-based flowchart editor.
* Both components are properly guarded under the new `'whiteboards.view'` permission.

---

## 4. StaffManager Permissions UI Integration

### Location to Modify
* **File Path**: `apps/web/src/features/business/StaffManager.tsx`
* **Target Construct**: The `categories` object literal inside the `PermissionGrid` component (lines 625–633)

### UI Integration Detail
Add `'whiteboards.view'` and `'whiteboards.manage'` to a relevant UI category inside the `categories` registry of the `PermissionGrid` component. The `'Communication & Facility'` section is the most logical home:

#### Before
```typescript
  const categories = {
    // ...
    'Communication & Facility': ['communication.view', 'facility.view'],
    // ...
  };
```

#### After
```typescript
  const categories = {
    // ...
    'Communication & Facility': ['communication.view', 'facility.view', 'whiteboards.view', 'whiteboards.manage'],
    // ...
  };
```

### UI Visibility & Flow Analysis
By registering these keys in `categories`, the permissions show up automatically across the application in the following interfaces:

1. **Department Base Permissions Manager (`DepartmentEditModal`)**:
   * Renders the `PermissionGrid` component (line 591).
   * Administrators can toggle `'whiteboards.view'` and `'whiteboards.manage'` as default permissions for an entire department (e.g. Sales, Fabrication, Techs).
2. **Staff Custom Access Overrides (`StaffEditModal`)**:
   * In the `Permissions` tab of the onboarding/edit modal, `PermissionGrid` is rendered (line 1518) passing department-inherited permissions.
   * Managers can set custom overrides to explicitly grant or revoke whiteboard access for individual employees.
3. **Staff Profile View Resolved Permissions (`StaffDetailsModal`)**:
   * Renders a list of the employee's active resolved permissions at the bottom (lines 972–977):
     ```typescript
     <div className="flex flex-wrap gap-2">
       {Object.entries(resolvedPerms).filter(([_, v]) => v).map(([k]) => (
         <span key={k} className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 rounded-lg shadow-sm">
           {PERMISSIONS[k as PermissionKey]}
         </span>
       ))}
     </div>
     ```
   * Since our new permissions are registered in `PERMISSIONS`, they automatically display in the staff details card under "Active Permissions" if resolved to `true`.

---

## 5. Dependency Setup & Build Verification

### Location to Modify
* **File Path**: `apps/web/package.json`
* **Target Construct**: `dependencies` list (lines 14–34)

### Dependency Integration Detail
Add the `@xyflow/react` package to the dependencies object:

```json
  "dependencies": {
    // ... existing dependencies
    "@xyflow/react": "^12.4.2"
  }
```

### Monorepo Installation Commands
Because the project uses standard `npm workspaces` (with workspaces defined as `"apps/*"` in the root `package.json`), you can execute installation in either of the following ways:

#### Option A (Command Line - Safe and Recommended)
Execute from the workspace root directory:
```bash
npm install @xyflow/react --workspace=web
```
*This command automatically updates the `apps/web/package.json` file, downloads the package, manages peer dependencies, and writes locks to the root `package-lock.json`.*

#### Option B (Manual Edit + Link)
1. Add `"@xyflow/react": "^12.4.2"` directly to `apps/web/package.json`.
2. Run the following command from the workspace root:
   ```bash
   npm install
   ```

### Verification & Build Scripts
To compile, bundle, and verify that the package integrations do not violate existing builds or lint rules, run:

1. **Verify TypeScript & Production Build (from Root)**:
   ```bash
   npm run build -w web
   ```
   *This resolves all imports and runs `tsc -b && vite build` within the web workspace.*
2. **Verify Frontend Tests (from Root)**:
   ```bash
   npm test -w web -- --run
   ```
   *This ensures any dependency or permission setup does not break the existing test suites.*
3. **Verify Lint Rules (from Root)**:
   ```bash
   npm run lint -w web
   ```
