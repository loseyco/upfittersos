## 2026-05-26T17:32:19Z
You are the Lead Specialist Worker for the Parts Department Mission Control Dashboard Optimization project.
Your working directory is: `c:\_Projects\upfittersos.com\.agents\worker_parts_implementation`
Your identity is: teamwork_preview_worker

Your mission is to implement Milestones M1, M2, M3, and M4 for the Parts Department Mission Control Dashboard optimization. Adhere strictly to the R2 isolated scope constraint: only modify the parts department control panel and its immediate subcomponents (`PartsMissionControl.tsx`, `PackageIntakeModal.tsx`, `ItemDetailsModal.tsx`, or direct parts-specific UI components). Do not change other department boards, timesheets, or the global layout.

### Detailed Implementation Guidelines:

#### Step 1: Milestone 1 - Real-Time Firestore Integration (M1)
1. **Target**: `apps/web/src/features/business/PartsMissionControl.tsx`
2. **Action**: Replace TanStack Query (`useQuery`) calls for `shipments`, `qbPOs`, `inventory` with real-time `onSnapshot` listeners.
3. Define React state hooks for `shipments` (`Shipment[]`), `qbPOs` (`QuickBooksPO[]`), `inventory` (`any[]`), and a unified `loadingStates` tracker.
4. Implement `onSnapshot` subscriptions scoped by `tenantId` (e.g., `businesses/{tenantId}/shipments`, `businesses/{tenantId}/qb_purchase_orders`, `businesses/{tenantId}/inventory_items`) inside `useEffect`.
5. Ensure proper subscription cleanup in the `useEffect` return handler.
6. **Client-Side KPIs**: Dynamically compute `activeShipmentsCount` and `pendingRequestsCount` using `onSnapshot` size trackers or memoized arrays to completely eliminate query-client invalidations. Remove all references to TanStack Query invalidations (e.g. `invalidateQueries`).

#### Step 2: Milestone 2 - Dark-Glassmorphic UI & animations (M2)
1. **Glassmorphism**: Update the visual styles of components/panels inside `PartsMissionControl.tsx` using UpfittersOS dark-glassmorphic variables:
   `bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent`
2. **HSL badge themes**: Apply professional HSL colors for Urgencies, Carrier tags (UPS, FedEx, USPS, Amazon), and Status badges (Fulfilled, Transit, Pending, Exception).
3. **Animations**: Add spring-driven micro-animations using Framer Motion (`initial`, `animate`, `exit`, `layout`, `whileHover={{ scale: 1.02, y: -4 }}`) to lists, hover states, and card transitions.

#### Step 3: Milestone 3 - Modal Consolidation & Polish (M3)
1. **Target**: `apps/web/src/features/business/ItemDetailsModal.tsx`
2. **Action**: Merge `LegacyItemDetailsModal` and `BetaItemDetailsModal` into a single high-fidelity `ItemDetailsModal.tsx`. Delete the conditional branch for `experimental.new_modals` and legacy duplicates entirely.
3. **Inline Camera viewport**: Add inline `getUserMedia` video streaming and Blob capture in `ItemDetailsModal.tsx` to let parts operators snap and upload photos directly.
4. **Barcode Scanner**: Embed a miniature ZXing reader device viewport (`BrowserMultiFormatReader` from `PackageIntakeModal.tsx` or package imports) in the tracking input field area to scan tracking barcodes.
5. **Keyboard shortcuts**: Reconcile keyboard shortcuts (`E` to edit, `ESC` to cancel/close, `CTRL+ENTER` to save, `C` to start camera) and render visual keyboard badge tooltips.
6. **PackageIntakeModal.tsx**: Ensure no placeholder components are left and the camera/scanner operates seamlessly.

#### Step 4: Milestone 4 - Unit & Integration Test Suite (M4)
1. **Target**: `apps/web/src/features/business/__tests/PartsMissionControl.test.tsx` (create the file if it does not exist)
2. **Action**: Write comprehensive Vitest + React Testing Library tests verifying:
   - Real-time list updates and additions.
   - Package intake scanning flow.
   - Item details modal editing, saving, camera snap, and shortcut events.
3. Configure necessary mocks for Firestore listeners and camera devices in the test file or `setup.ts`.

#### Step 5: Verification & Build
1. Verify the `web` workspace compiles successfully without any strict compiler warnings or errors:
   `npm run build -w web`
2. Verify all tests pass cleanly:
   `npm run test:run -w web`
3. Verify linting compliance:
   `npm run lint -w web`
