# UpfittersOS Testing Infrastructure (Vitest & Testing Library)

This document provides a comprehensive overview of the testing suite architecture, mocking strategy, and verification instructions for the frontend applications of UpfittersOS, with a specific focus on the `MorningMeetingBoard` component.

## 1. Architecture Overview

We use **Vitest** as our primary test runner, coupled with **Happy-DOM** for high-performance DOM simulation and **React Testing Library** (RTL) for testing user interactions.

```
+-------------------------------------------------------------+
|                        Vitest Runner                        |
|   (config: apps/web/vitest.config.ts)                       |
+------------------------------+------------------------------+
                               |
                               v
+------------------------------+------------------------------+
|                         Happy-DOM                           |
|       (Fast, lightweight in-memory browser environment)      |
+------------------------------+------------------------------+
                               |
                               v
+------------------------------+------------------------------+
|                    Global Test Setup Mocks                  |
|                 (apps/web/src/test/setup.ts)                |
|  - Mock Firebase App / Auth / Firestore Real-time Streams   |
|  - Mock framer-motion (skip animations for speed)          |
|  - Mock lucide-react (lightweight component stubs)          |
+------------------------------+------------------------------+
                               |
                               v
+------------------------------+------------------------------+
|                   MorningMeetingBoard Test                  |
|  (apps/web/src/features/business/__tests__/MorningMeetingBoard.test.tsx) |
+-------------------------------------------------------------+
```

### Key Decisions & Highlights:
- **Fast Execution**: We leverage `happy-dom` instead of full jsdom, which significantly cuts down testing overhead.
- **Component Mocking**: Libraries like `lucide-react` and `framer-motion` are mocked out using lightweight mock definitions. This prevents complex layout/animation loops and icon library overhead from polluting or breaking React 19 test render cycles.
- **State/Stream Decoupling**: Rather than testing against real or simulated remote Firebase database servers, we use deep real-time Firestore listeners (`onSnapshot`) mocks and mock store states (`useAuthStore`). Test data is emitted dynamically through custom test utilities (`__emitSnapshot` and `__setMockAuth`).

---

## 2. Test Setup and Mocking Strategy

The testing suite relies on a specialized configuration in `apps/web/src/test/setup.ts`.

### 2.1 Firestore Mocking (`onSnapshot` & `__emitSnapshot`)
The real-time operational dashboard relies extensively on parallel Firestore listeners. In order to test this genuinely without creating complex dummy/facade functions, we mock `collection`, `query`, and `onSnapshot`.
We register active listener callbacks inside a global registry (`listeners`). In our test cases, we emit snapshots on demand:

```typescript
// Test implementation pattern
globalThis.__emitSnapshot = (path: string, data: any[]) => {
  const callback = listeners[path]
  if (callback) {
    callback({
      docs: data.map(item => ({
        id: item.id,
        data: () => item
      }))
    })
  }
}
```
This strategy allows synchronous, controlled state transitions where components react immediately to mock database emissions, mimicking actual production behavior.

### 2.2 Auth Store Mocking (`useAuthStore` & `__setMockAuth`)
The board operates in **read-only** or **manager mode** depending on auth permissions. We mock `useAuthStore` to return a local mutable object, controlled in tests using:
```typescript
globalThis.__setMockAuth = (permissions: Record<string, boolean>, isSuperAdmin = false) => {
  mockStoreState.permissions = permissions
  mockStoreState.isSuperAdmin = isSuperAdmin
}
```

---

## 3. MorningMeetingBoard Test Coverage

The test suite covers five core areas:
1. **Initial Loader & Render Verification**: Asserts that `Compiling operational board data...` loader displays initially, and that after mock data emits, the loader disappears and headers, search fields, clock, and layout controls render properly.
2. **Roster Reconciliation**: Verifies that clocked-in and offline staff cards are reconciled, displaying correct details (e.g. John Doe - Lead Tech as Active, Jane Smith - Fabricator as offline Not Scheduled).
3. **Layout Toggles**: Checks that layout toggles (Lanes vs Grid) respond to user clicks and update classes correctly.
4. **Search Filters**: Tests searching for specific names or terms, verifying that the matching list is correctly trimmed down and that the "No Matching Operations Found" screen renders for non-existent users.
5. **Permissions & Read-Only Board**: Verifies that lacking edit rights (e.g., missing `tasks.manage` permission) successfully triggers the read-only board view with `READ-ONLY BOARD` badge and prevents modification alerts.

---

## 4. Verification Instructions

To execute and verify the testing environment from the project root:

### Run Tests in Web Application
```bash
npm run test:run -w web
```

### Alternatively, using direct npx:
```bash
npx vitest run -c apps/web/vitest.config.ts
```

### Continuous Test Runner (Watch Mode):
```bash
npx vitest -c apps/web/vitest.config.ts
```
