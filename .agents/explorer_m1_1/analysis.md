# Milestone 1 Analysis: Package & Permission Setup

This report presents a read-only investigation and comprehensive implementation guide for **Milestone 1: Package & Permission Setup** in `upfittersos.com`.

---

## 1. Registering Whiteboard Permissions

### Location: `apps/web/src/lib/auth/permissions.ts`

The permission structure is defined using a statically mapped object `PERMISSIONS` which automatically generates the TypeScript union type `PermissionKey` and the utility type `PermissionSet`. 

#### Proposed Modifications:
To register `'whiteboards.view'` and `'whiteboards.manage'`, add them as key-value pairs in the `PERMISSIONS` constant. 

```typescript
// Proposed addition to apps/web/src/lib/auth/permissions.ts
export const PERMISSIONS = {
  ...
  'communication.view': 'View Communication Tools',
  'sync.view': 'View Raw Sync Data',
  'sync.manage': 'Manage Sync Integrations',
  'experimental.new_modals': 'Beta: Use New Modals',
  'vendors.view': 'View Vendors & Services',
  'vendors.manage': 'Manage Vendors & Services',
  
  // New Whiteboard Permissions
  'whiteboards.view': 'View Whiteboards',
  'whiteboards.manage': 'Manage Whiteboards',
} as const;
```

#### Why this is complete:
- `PermissionKey` is defined as `keyof typeof PERMISSIONS`.
- `PermissionSet` is defined as `{[K in PermissionKey]?: boolean}`.
- Thus, simply adding these strings as keys inside `PERMISSIONS` fully registers them in the TypeScript compiler across the entire frontend workspace. No secondary types or array registries need updating.

---

## 2. Gating and Integrating the 'Canvases' Sidebar Option

### Location: `apps/web/src/features/business/BusinessSidebar.tsx`

The `BusinessSidebar` utilizes a hardcoded configuration array named `ITEMS: NavItem[]` to determine available navigation routes. Each item defines an optional `permission` property corresponding to a `PermissionKey`.

#### Proposed Modifications:
Currently, the `canvases` navigation item is routed under the `facility.view` permission:
```typescript
{ id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'facility.view' },
```

Modify this line to map to the new `'whiteboards.view'` permission:
```typescript
{ id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'whiteboards.view' },
```

#### Verification of Gating Logic:
Inside the sidebar's component body, the items are filtered dynamically:
```typescript
const visibleItems = ITEMS.filter(i => {
  if (i.group !== groupId) return false;
  if (isSuperAdmin) return true;
  if (!i.permission) return true;
  return permissions[i.permission];
});
```
Changing the `permission` attribute to `'whiteboards.view'` ensures that:
1. Users lacking `'whiteboards.view'` will not see the "Canvases" tab.
2. Super Admins will bypass the check and always see it.
3. Users inheriting or explicitly granted `'whiteboards.view'` will see it immediately.

---

## 3. Integrating Gallery & Canvas Tabs into the Operational Dashboard

### Location: `apps/web/src/features/business/TenantDashboard.tsx`

Currently, `TenantDashboard.tsx` uses a fallback generic table component to render a mock list of canvases at lines 452–456:
```typescript
            {activeTab === 'canvases' && (
              <PermissionGate permission="facility.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
              </PermissionGate>
            )}
```

#### Proposed Modifications:
1. **Importing future components**:
   When `CanvasGalleryTab.tsx` and `WorkflowCanvasTab.tsx` are created, they will be imported in `TenantDashboard.tsx`:
   ```typescript
   import { CanvasGalleryTab } from './components/CanvasGalleryTab';
   import { WorkflowCanvasTab } from './components/WorkflowCanvasTab';
   ```

2. **Parsing the Canvas ID from Path**:
   `TenantDashboard` extracts wildcards from the React Router `*` splat parameter:
   ```typescript
   const params = useParams();
   const splat = params['*'] || '';
   const pathParts = splat.split('/').filter(Boolean);
   const activeTab = pathParts[0] || 'overview';
   ```
   If a user navigates to `/business/:tenantId/canvases`, `pathParts[1]` is `undefined` (Gallery view).
   If a user navigates to `/business/:tenantId/canvases/:canvasId`, `pathParts[1]` contains the `:canvasId` string (Canvas Editor/Workflow view).

3. **Replacing the Placeholder Block**:
   Update the canvas block under the new `'whiteboards.view'` gate:
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

---

## 4. UI Representation of New Permissions in Staff/Department Management

### Location: `apps/web/src/features/business/StaffManager.tsx`

`StaffManager.tsx` provides administrators with:
1. The **Department Editor** to set default base permissions inherited by all members of a department.
2. The **Staff Profile Manager** to customize/override individual permissions.
3. The **Staff Detail modal** to view resolved permissions.

#### Integrating with the Permission Editor Grid (`PermissionGrid` component):
The editor groups permissions into strict visual categories using a hardcoded `categories` dictionary in the helper function:
```typescript
  const categories = {
    'General': [...],
    'Inventory & Vehicles': [...],
    'Business Operations': [...],
    'Tasks & Timeclock': [...],
    'Communication & Facility': ['communication.view', 'facility.view'],
    'System & Data': [...],
    'Experimental': [...]
  };
```

To display the new permissions in the UI for assignment and overrides, add `'whiteboards.view'` and `'whiteboards.manage'` to the `'Communication & Facility'` array:

```typescript
    'Communication & Facility': [
      'communication.view', 
      'facility.view', 
      'whiteboards.view', 
      'whiteboards.manage'
    ],
```

#### Automatic Updates across other UIs:
Because other elements (like the department detail list and the resolved permissions tag cloud) map keys dynamically using the imported `PERMISSIONS` object, adding them to `permissions.ts` instantly enables:
- Accurate labels (`View Whiteboards` and `Manage Whiteboards`) on Department Summary cards.
- Rendered permission badges inside the Staff Profile `Active Permissions` list.
- Safe, type-checked UI toggle controls without further manual coding.

---

## 5. Adding Flow Diagram Dependencies & Build Automation

### Location: `apps/web/package.json`

The React whiteboard system relies on **XYFlow (React Flow)**. We must declare `@xyflow/react` as an application dependency.

#### Dependency Declaration:
Add `@xyflow/react` under `"dependencies"` in `apps/web/package.json`:
```json
  "dependencies": {
    ...
    "react-router-dom": "^7.14.2",
    "react-sketch-canvas": "^6.2.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "@xyflow/react": "^12.3.4",
    "zustand": "^5.0.12"
  }
```

#### Monorepo / Workspaces Build Setup:
The root workspace uses npm Workspaces mapping:
```json
// root package.json
"workspaces": [
  "apps/*"
]
```

1. **Package Installation**:
   To install the dependency and resolve the packages with safety against lock conflicts, execute from the repository root:
   ```bash
   npm install @xyflow/react -w web
   ```
   This updates `apps/web/package.json` and writes/updates packages via `package-lock.json` at the root.

2. **Web Build Command**:
   To verify and run compilation, use:
   ```bash
   npm run build -w web
   ```
   This executes the workspace-level compiler:
   ```bash
   tsc -b && vite build
   ```
