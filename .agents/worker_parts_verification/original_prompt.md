## 2026-05-26T17:37:06Z
You are the Final Verification & Mock Fixer for the Parts Department Mission Control Dashboard and Interactive Workflow Whiteboard projects.
Your working directory is: `c:\_Projects\upfittersos.com\.agents\worker_parts_verification`

### Background:
The entire production implementation for BOTH the Parts Department Mission Control Dashboard (real-time snapshot listeners, glassmorphic UI polish, consolidated ItemDetailsModal with userMedia camera stream and package intake barcode scan layout) AND the Workflow Whiteboard system is complete and has been forensic audited with a CLEAN verdict.
However, during Vitest test suite execution, the integration test `apps/web/src/features/business/__tests/PartsMissionControl.test.tsx` fails because the mock for `@zxing/browser` is missing the `BrowserCodeReader` export, which `PackageIntakeModal.tsx` now imports.

### Your Objectives:
1. **Fix the Test Mock**:
   - Inspect `apps/web/src/test/setup.ts` and `apps/web/src/features/business/__tests/PartsMissionControl.test.tsx`.
   - Update `apps/web/src/test/setup.ts` to add a robust, global mock for `@zxing/browser` (and `@zxing/library` if helpful) so that all tests transitively importing `PackageIntakeModal.tsx` or `ItemDetailsModal.tsx` have it fully defined.
   - Specifically, ensure that `BrowserCodeReader` is exported as a class or constructor that has the static method `listVideoInputDevices()` returning a mock array of cameras:
     ```typescript
     class MockBrowserCodeReader {
       static listVideoInputDevices() {
         return Promise.resolve([{ deviceId: 'camera-1', label: 'Back Camera' }]);
       }
     }
     ```
   - Make sure `BrowserMultiFormatReader` is also exported as a mock class or mock function returning standard readers (e.g. `decodeFromConstraints`, `decodeFromVideoDevice`, `decodeFromImageUrl`).
   - Clean up the `@zxing/browser` mock inside `apps/web/src/features/business/__tests/PartsMissionControl.test.tsx` to match or rely on the global setup.ts mock if appropriate.

2. **Execute Full Verification**:
   - Open a command shell inside `c:\_Projects\upfittersos.com`.
   - Run Vitest tests: `npm run test:run -w web`. Confirm that 100% of the tests pass.
   - Run the production build command: `npm run build -w web` (runs `tsc -b` and `vite build`). Ensure zero TypeScript and build compilation errors.
   - Run the ESLint verification: `npm run lint -w web`. Confirm it is completely clean.

3. **Report**:
   - Write a detailed verification report to `.agents/worker_parts_verification/handoff.md` with execution commands and outputs.
   - Notify the orchestrator (conversation ID: ef4c2348-467b-411b-9409-9a191e3638a0) of the final build and test status.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. Do not hardcode test results, create dummy/facade implementations, or circumvent the intended task.
