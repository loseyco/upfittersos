# Milestone 1: Package & Permission Setup Analysis Report

This analysis details the exact steps and code modifications required to complete **Milestone 1: Package & Permission Setup** for UpfittersOS.

---

## 1. Registering 'whiteboards.view' and 'whiteboards.manage'

In `apps/web/src/lib/auth/permissions.ts`, permissions are registered as part of the `PERMISSIONS` read-only object mapping permission keys to user-friendly descriptions.

### Current Implementation
```typescript
export const PERMISSIONS = {
  'quickdesk.view': 'View QuickDesk (Classic)',
  ...
  'vendors.view': 'View Vendors & Services',
  'vendors.manage': 'Manage Vendors & Services',
} as const;
```

### Proposed Changes
To register the two new permissions, add `'whiteboards.view'` and `'whiteboards.manage'` to the `PERMISSIONS` object.

```typescript
export const PERMISSIONS = {
  'quickdesk.view': 'View QuickDesk (Classic)',
  ...
  'vendors.view': 'View Vendors & Services',
  'vendors.manage': 'Manage Vendors & Services',
  
  // Whiteboards / Canvases Permissions
  'whiteboards.view': 'View Whiteboards & Canvases',
  'whiteboards.manage': 'Manage Whiteboards & Canvases',
} as const;
```

### Type & Resolve Function Compatibility
Because `PermissionKey` is typed using `keyof typeof PERMISSIONS` (line 44) and `PermissionSet` is dynamically keyed on `PermissionKey` (lines 46-48), these types will **automatically** inherit the new permissions:
- `PermissionKey` will now include `'whiteboards.view' | 'whiteboards.manage'`.
- `PermissionSet` will automatically support `whiteboards.view?: boolean` and `whiteboards.manage?: boolean`.
- The `resolvePermissions` function (lines 50-63) will automatically merge individual and departmental overrides for these new permissions without any extra modifications.

---

## 2. BusinessSidebar Navigation Option Integration

In `apps/web/src/features/business/BusinessSidebar.tsx`, the `canvases` sidebar option is defined under `ITEMS` in the `facility` group. Currently, it is gated by the `'facility.view'` permission.

### Current Implementation (Line 49)
```typescript
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'facility.view' },
```

### Proposed Changes
Change the gated permission property for the `canvases` navigation item from `'facility.view'` to the new `'whiteboards.view'` permission.

```typescript
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'whiteboards.view' },
```

### Rationale
This updates the sidebar's rendering loop (`ITEMS.filter(...)` starting at line 98) to filter out or display the "Canvases" button based on the staff member's resolved `'whiteboards.view'` permission.

---

## 3. TenantDashboard Component Replacement

In `apps/web/src/features/business/TenantDashboard.tsx`, the canvases tab renders a placeholder `GenericDataGrid` collection reader (lines 452-456).

### Current Implementation (Lines 452-456)
```typescript
            {activeTab === 'canvases' && (
              <PermissionGate permission="facility.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
              </PermissionGate>
            )}
```

### Proposed Changes
To replace this placeholder with `CanvasGalleryTab` (for the gallery/list view) and `WorkflowCanvasTab` (for specific canvas viewing/editing), we must:
1. **Import the new components** at the top of `TenantDashboard.tsx`.
2. **Gate the tab** with `'whiteboards.view'` instead of `'facility.view'`.
3. **Handle nested routes/views** so that visiting `/business/:tenantId/canvases` renders the gallery, and visiting `/business/:tenantId/canvases/:canvasId` renders the specific workspace viewport.

#### Step 1: Imports (add near other feature imports, e.g., line 38-39)
```typescript
import { CanvasGalleryTab } from './CanvasGalleryTab';
import { WorkflowCanvasTab } from './WorkflowCanvasTab';
```

#### Step 2: Gated Replacements (replacing lines 452-456)
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

### Rationale
- `pathParts[1]` acts as the `canvasId` parameter when the URL pattern is `/business/:tenantId/canvases/:canvasId` (managed by the `splat` parameters parser at the top of the component).
- Gating under `<PermissionGate permission="whiteboards.view">` guarantees that only authorized users can view the gallery or individual canvases.

---

## 4. StaffManager UI Integration

In `apps/web/src/features/business/StaffManager.tsx`, base/individual permissions are rendered under `PermissionGrid` based on a predefined list of `categories` (lines 625-633).

### Current Implementation (Lines 625-633)
```typescript
  const categories = {
    'General': ['quickdesk.view', 'mission_control.view', 'foreman.view', 'graphics.view', 'fast.view', 'fabrication.view', 'office.view', 'printed_parts.view', 'printed_parts.manage', 'performance.view'],
    'Inventory & Vehicles': ['vehicles.view', 'vehicles.manage', 'zones.view', 'zones.manage', 'parts.view', 'parts.manage'],
    'Business Operations': ['customers.view', 'customers.manage', 'jobs.view', 'jobs.manage', 'jobs.qc', 'staff.view', 'staff.manage'],
    'Tasks & Timeclock': ['tasks.view', 'tasks.manage', 'timeclock.view', 'timeclock.manage', 'timeclock.offsite'],
    'Communication & Facility': ['communication.view', 'facility.view'],
    'System & Data': ['settings.view', 'settings.manage', 'reports.view', 'sync.view'],
    'Experimental': ['experimental.new_modals']
  };
```

### Proposed Changes
To expose `'whiteboards.view'` and `'whiteboards.manage'` in the administration UI, add them to an appropriate permission category. Because canvases are historically aligned with the "Facility" department in the sidebar, they can be added to **"Communication & Facility"** or **"General"**. Adding them to **"General"** or creating a new **"Whiteboards & Canvases"** category is recommended. Let's add them to **"General"** or **"Communication & Facility"**:

```typescript
  const categories = {
    'General': ['quickdesk.view', 'mission_control.view', 'foreman.view', 'graphics.view', 'fast.view', 'fabrication.view', 'office.view', 'printed_parts.view', 'printed_parts.manage', 'performance.view'],
    'Inventory & Vehicles': ['vehicles.view', 'vehicles.manage', 'zones.view', 'zones.manage', 'parts.view', 'parts.manage'],
    'Business Operations': ['customers.view', 'customers.manage', 'jobs.view', 'jobs.manage', 'jobs.qc', 'staff.view', 'staff.manage'],
    'Tasks & Timeclock': ['tasks.view', 'tasks.manage', 'timeclock.view', 'timeclock.manage', 'timeclock.offsite'],
    'Communication & Facility': ['communication.view', 'facility.view', 'whiteboards.view', 'whiteboards.manage'],
    'System & Data': ['settings.view', 'settings.manage', 'reports.view', 'sync.view'],
    'Experimental': ['experimental.new_modals']
  };
```

### UI Presentation Flow
Once these keys are added:
1. `PermissionGrid` maps over `categories` and retrieves each category's configured keys.
2. For each key `k`, `PERMISSIONS[k]` is evaluated to fetch the human-readable text (e.g. `'View Whiteboards & Canvases'`).
3. An toggle switch is automatically generated.
4. Managers can now assign these base permissions to whole Departments (via the `DepartmentEditModal` which renders `PermissionGrid`) or toggle personal custom overrides for individual staff members (via the `StaffEditModal` which also wraps `PermissionGrid`).
5. Staff members' custom overrides and department defaults will resolve perfectly using the `resolvePermissions` logic.

---

## 5. package.json Integration & Build/Dependency Flow

To support advanced interactive flowcharts and whiteboard tools, the package `@xyflow/react` must be integrated into `apps/web/package.json`.

### package.json Dependency Setup
Add `"@xyflow/react": "^12.4.2"` or the corresponding stable version (supporting React 19) to `dependencies` in `apps/web/package.json`.

```json
  "dependencies": {
    "@tailwindcss/vite": "^4.2.4",
    "@tanstack/react-query": "^5.100.5",
    "@xyflow/react": "^12.4.2",
    "@zxing/browser": "^0.2.0",
    ...
  }
```

### Installation Method
Because this is an npm-based monorepo workspace structure, the dependencies should be installed in a workspace-aware manner:
1. **Via Workspace Flag (from root):**
   ```bash
   npm install @xyflow/react -w web
   ```
2. **Alternative Direct Modification:**
   Directly edit `apps/web/package.json` to insert `"@xyflow/react": "^12.4.2"`, then run the install command at the root workspace:
   ```bash
   npm install
   ```

### Verification & Build Scripts
After dependencies are added, the workspace needs to be built and checked for compatibility:
1. **Run TypeScript Compilation & Web Bundle Build:**
   From the root folder:
   ```bash
   npm run build -w web
   ```
   Or within the `apps/web` folder directly:
   ```bash
   npm run build
   ```
   This invokes `tsc -b && vite build` as defined in `apps/web/package.json`.
2. **Run Linter:**
   To verify imports and rules:
   ```bash
   npm run lint -w web
   ```
3. **Run Tests:**
   Ensure no regression breaks existing features:
   ```bash
   npm run test -w web
   ```
