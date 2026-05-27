## 2026-05-26T17:28:08Z
Implement Milestone 1: Custom Permissions & Package Setup.
Please:
1. Add `"@xyflow/react": "^12.10.2"` to the dependencies list in `apps/web/package.json`.
2. Propose and execute the npm command `npm install @xyflow/react -w web` or a workspace-compatible `npm install` command to install this dependency.
3. In `apps/web/src/lib/auth/permissions.ts`, register the two custom permissions:
   - `'whiteboards.view'`: 'View Whiteboards'
   - `'whiteboards.manage'`: 'Manage Whiteboards'
4. In `apps/web/src/features/business/BusinessSidebar.tsx`, locate the item with `id: 'canvases'` and change its `permission` property from `'facility.view'` to `'whiteboards.view'`.
5. In `apps/web/src/features/business/StaffManager.tsx`, inside `PermissionGrid`, locate the `'Communication & Facility'` array inside the `categories` definition. Add `'whiteboards.view'` and `'whiteboards.manage'` to it so they are rendered and toggleable.
6. Verify your implementation by running compilation check: `npm run build -w web` or `npx tsc -p apps/web/tsconfig.app.json` (via run_command) and document the results.
