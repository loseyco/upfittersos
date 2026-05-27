# Milestone 1 Readiness (Test Setup & Core Features Verification)

This checklist attests that **Milestone 1** (Setup testing, create mocks, write test file, verify suite) is ready and fully structured for the TDD (Test-Driven Development) track.

## M1 Readiness Checklist

- [x] **Dependencies Configured**: Vitest (`^2.1.8`), Happy-DOM (`^15.11.7`), and React Testing Library (`@testing-library/react ^16.1.0`, `@testing-library/jest-dom ^6.6.3`, `@testing-library/user-event ^14.5.2`) successfully integrated in `apps/web/package.json`.
- [x] **Scripts Integrated**: `test` and `test:run` scripts added to `apps/web/package.json`.
- [x] **Vitest Configuration Defined**: High-speed testing configuration in `apps/web/vitest.config.ts` using the lightweight `happy-dom` engine, with path aliases (`@`) and setup file paths resolved.
- [x] **Setup & Mock Architecture Established**: Custom mocking suite defined in `apps/web/src/test/setup.ts` which enables:
  - Real-time FireStore listener mocking with custom snapshot emissions (`__emitSnapshot`).
  - Mutable role and permission mocks (`__setMockAuth`).
  - Animating and icon libraries (`framer-motion`, `lucide-react`) lightweight stubs.
  - Basic requestAnimationFrame mocks to avoid UI scheduling errors.
- [x] **Core Features Test File Created**: Full test coverage of existing features written in `apps/web/src/features/business/__tests__/MorningMeetingBoard.test.tsx`.
- [x] **TDD Track Mapped**: Requirements R1, R2, R3 specified as skipped suites (`describe.skip`), ready to drive the next milestone's development.
- [x] **Infrastructure Published**: `TEST_INFRA.md` and `TEST_READY.md` files successfully created at the repository root.

---

## Current Test Suite Status

### Passed Test Cases (5 Total)
1. **`renders standard header, live clock, search, and layout controls`**
   - Asserts initial loader behavior.
   - Triggers Firestore snapshots and asserts elements matching main headers, quick search, toggle buttons (Lanes, Grid, Auto Scroll).
2. **`reconciles and displays clocked-in and offline staff cards correctly`**
   - Validates correct rendering of active (John Doe) vs offline (Jane Smith) personnel cards.
3. **`toggles layout mode from lanes to grid`**
   - Simulates clicking the layout grid toggle button and asserts component-level visual state classes react accordingly.
4. **`filters roster by search query`**
   - Simulates user search input and verifies correct roster filtering, as well as fallback to no matches.
5. **`enforces permissions: read-only board prevents task updates`**
   - Mocks a standard employee account with empty permission sets, verifying that the visual `READ-ONLY BOARD` banner is successfully rendered.

### Stubbed TDD Test Cases (Skipped - 7 Total)
* **R1: Standup Presentation Focus Mode**
  - *`focuses on the first clocked-in staff card when Presentation Mode is clicked`*
  - *`cycles through active staff cards using Previous/Next buttons and keyboard arrow keys`*
  - *`restores normal layout when exiting presentation mode`*
* **R2: Daily Operations Briefing Feed**
  - *`aggregates operational metrics (attendance, blockers, unassigned tasks, and ETAs)`*
  - *`copies the operational summary formatted in markdown to the clipboard when Copy is clicked`*
* **R3: Timeline & Pace Warnings**
  - *`renders a proportional shift vs clocked-in progress bar overlay on the staff card`*
  - *`displays a warning alert if tech has >4h book hours with <2h remaining in their shift today`*
