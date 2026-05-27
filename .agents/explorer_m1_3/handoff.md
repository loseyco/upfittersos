# Handoff Report — Explorer 3 (Milestone 1)

This report details the package and permission setup required for the whiteboard implementation under Milestone 1.

## 1. Observation

Direct observations made on the filesystem:

### A. Permissions Setup (`apps/web/src/lib/auth/permissions.ts`)
* Checked permissions structure:
  * Line 1: `export const PERMISSIONS = {`
  * Line 44: `export type PermissionKey = keyof typeof PERMISSIONS;`
  * Line 46: `export type PermissionSet = { [K in PermissionKey]?: boolean; };`
  * Lines 50-63: `resolvePermissions` function merges department and individual permissions:
    ```typescript
    export function resolvePermissions(
      deptPermissions: PermissionSet = {},
      individualPermissions: PermissionSet = {}
    ): PermissionSet {
      const resolved: PermissionSet = { ...deptPermissions };
      ...
    }
    ```

### B. Business Sidebar (`apps/web/src/features/business/BusinessSidebar.tsx`)
* Identified the canvases item inside the navigation configuration:
  * Line 49: `{ id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'facility.view' },`
  * Found that items are filtered by category based on permission presence:
    * Lines 98-103:
      ```typescript
      const visibleItems = ITEMS.filter(i => {
        if (i.group !== groupId) return false;
        if (isSuperAdmin) return true;
        if (!i.permission) return true;
        return permissions[i.permission];
      });
      ```

### C. Tenant Dashboard Routing (`apps/web/src/features/business/TenantDashboard.tsx`)
* Located the tab parser and splat parameters:
  * Lines 54-57:
    ```typescript
    const splat = params['*'] || '';
    const pathParts = splat.split('/').filter(Boolean);
    const activeTab = pathParts[0] || 'overview';
    ```
* Located the existing canvases placeholder:
  * Lines 452-456:
    ```typescript
    {activeTab === 'canvases' && (
      <PermissionGate permission="facility.view">
        <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
      </PermissionGate>
    )}
    ```

### D. Staff Manager Access Control (`apps/web/src/features/business/StaffManager.tsx`)
* Located the custom overrides grid category definition:
  * Lines 625-633:
    ```typescript
    const categories = {
      'General': ['quickdesk.view', 'mission_control.view', 'foreman.view', ...],
      ...
      'Communication & Facility': ['communication.view', 'facility.view'],
      ...
    };
    ```
* Located active resolved permissions visualization in details modal:
  * Lines 972-977:
    ```typescript
    {Object.entries(resolvedPerms).filter(([_, v]) => v).map(([k]) => (
      <span key={k} className="px-3 py-1.5 bg-white ...">
        {PERMISSIONS[k as PermissionKey]}
      </span>
    ))}
    ```

### E. Frontend Package Configurations (`apps/web/package.json` & `package.json`)
* Checked root workspaces setting:
  * `package.json` line 14: `"workspaces": [ "apps/*" ]`
* Reviewed dependencies inside `apps/web/package.json`:
  * Lines 14-34 contain dependencies like `"react"`, `"react-dom"`, `"firebase"`, `"zustand"`, `"framer-motion"`.
  * Checked build scripts:
    * Lines 7-8:
      ```json
      "dev": "vite",
      "build": "tsc -b && vite build",
      ```

---

## 2. Logic Chain

1. **Permission Registration**:
   * Adding `'whiteboards.view'` and `'whiteboards.manage'` keys to `PERMISSIONS` makes them automatic members of the TS union `PermissionKey` and `PermissionSet` mapped keys.
   * This guarantees that when a user department or staff override contains the values, standard TypeScript type checkers will accept them.

2. **Sidebar Protection**:
   * The sidebar lists items based on whether `permissions[i.permission]` is true.
   * Modifying `ITEMS`' `canvases` entry's `permission` from `'facility.view'` to `'whiteboards.view'` gates the sidebar visibility immediately behind the new permission.

3. **Routing Replacement**:
   * `TenantDashboard` parses routes via `pathParts` splats.
   * If a user is at `/business/:tenantId/canvases`, `pathParts[1]` is `undefined` (resolves to `CanvasGalleryTab`).
   * If a user is at `/business/:tenantId/canvases/:canvasId`, `pathParts[1]` exists (resolves to `WorkflowCanvasTab`).
   * Enclosing these in a `<PermissionGate permission="whiteboards.view">` provides role-based access control.

4. **Staff Management Integration**:
   * Inserting the permission keys inside the `'Communication & Facility'` array in `PermissionGrid` automatically renders toggles in both the department manager's edit modal and individual staff member's permissions editor.
   * Inherited and explicit overrides automatically flow through `resolvePermissions` and render on the `StaffDetailsModal` active permissions array.

5. **Package Management**:
   * Adding `@xyflow/react` to `apps/web/package.json` allows developers to build node-based visual layouts.
   * In an `npm workspaces` monorepo, dependencies are installed using `--workspace=web` or running a global `npm install` to download dependencies and link node modules in the workspace root.
   * Running `npm run build -w web` validates TypeScript types and build bundling via Vite.

---

## 3. Caveats

* **Component Files Exists/Not Exists**:
  * Note that `CanvasGalleryTab` and `WorkflowCanvasTab` are not yet created under Milestone 1, but we have laid down the exact importing and integration design.
* **Database Setup**:
  * The actual permissions fields in the Firestore database collections (`businesses/:id/departments` and `businesses/:id/staff`) must be updated when saving department defaults or staff overrides.

---

## 4. Conclusion

Milestone 1's package and permission setups are fully analyzed, cleanly scoped, and type-safe. The proposed modifications integrate perfectly into the existing role-based access control (RBAC) architecture without breaking other controls.

---

## 5. Verification Method

To verify these changes once implemented:
1. **Dependency Installation**:
   * Run `npm install @xyflow/react -w web` from root. Verify that `@xyflow/react` is in `apps/web/package.json` and node modules are populated.
2. **Type and Build Check**:
   * Run `npm run build -w web` and confirm it exits with code `0` (no compiler/Vite errors).
3. **Lint Verification**:
   * Run `npm run lint -w web` to ensure no lint rules are violated.
4. **Access Control Check**:
   * Login as a user lacking `'whiteboards.view'`. Confirm the "Canvases" tab is hidden in the sidebar and direct URL entry `/business/:tenantId/canvases` displays "Access Restricted".
   * Login as a user possessing `'whiteboards.view'`. Confirm sidebar rendering and component display.
