## 2026-05-26T17:31:14Z

You are the Codebase Explorer for the Parts Department Mission Control Dashboard Optimization project.
Your working directory is: c:\_Projects\upfittersos.com\.agents\teamwork_preview_explorer_parts_1
Your identity is: teamwork_preview_explorer

### Objective:
Conduct a detailed code investigation of the Parts Department Mission Control Dashboard components:
1. `apps/web/src/features/business/PartsMissionControl.tsx`
2. `apps/web/src/features/business/PackageIntakeModal.tsx`
3. `apps/web/src/features/business/ItemDetailsModal.tsx`

Formulate a step-by-step technical analysis and implementation strategy for the following:
- **Requirement 1 (M1): Real-time Firestore Synchronization**: Explain how to replace the static `@tanstack/react-query` `useQuery` fetches for `shipments`, `qb_purchase_orders`, `inventory_items`, and `stats` with real-time `onSnapshot` listeners. Detail how the local states should be reconciled, how loading states are handled, and how KPI stats can be dynamically computed from the active collections to eliminate query-client invalidations.
- **Requirement 2 (M2): Modern Dark-Glassmorphic UI & Animations**: Recommend visual enhancements to bring the dashboard into a highly polished UpfittersOS aesthetic: sleek glass reflections, subtle borders, responsive layout, custom HSL status/carrier/urgency colors, and responsive micro-animations using Framer Motion (already in package.json!).
- **Requirement 3 (M3): Modal Consolidation**: Analyze `ItemDetailsModal.tsx` and design a clear strategy to merge `LegacyItemDetailsModal` and `BetaItemDetailsModal` into a single, clean, performant, and high-fidelity modal with camera/photo integrations, scan handling, and keyboard binding controls. Ensure no placeholder elements are left.

### Output:
Perform a read-only analysis and write your findings to `c:\_Projects\upfittersos.com\.agents\teamwork_preview_explorer_parts_1\analysis.md`. Include specific line numbers, existing state/component mappings, and a clear step-by-step technical strategy for the implementation worker.

When done, send a message to the orchestrator (conversation ID: ef4c2348-467b-411b-9409-9a191e3638a0) with your handoff.
