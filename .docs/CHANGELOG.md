# UpfittersOS V2: Changelog

All notable changes to this project will be documented in this file.

## [v0.0.2] - 2026-05-21
### Added
- Integrated live clocked-in staff tracking on the **Bay Monitor** screen:
  - Real-time Firestore subscription to active `time_sessions` (where status is `active` or `on_break`).
  - Implemented standard Bay card rendering to display an `"Active Crew"` sub-section showing staff names and their exact current tasks using glassmorphism.
  - Implemented dynamic, high-performance visual status cues including pulsating neon green live indicators.
  - Added tiny responsive technician badges inside the compact parking lot/parking zone cards to maximize data density without visual overflow.

### Fixed
- Resolved Firestore security rules preventing tenant-level administrative users (`admin`, `manager`, `business_owner`) from deleting bug and feedback reports (`/feedback_reports` and `/feedback` collections).
- Added explicit Firestore security rules permission for `p.losey@saegrp.com` to write to the `/users/{userId}` collection, allowing the successful saving and synchronization of staff profile updates.

## [v0.0.1] - 2026-04-27
### Added
- Initialized Phase 1 strictly following the Greenfield Architecture Constraints.
- Initialized NPM Workspaces (`apps/web`).
- Scaffolded Vite + React + TypeScript in `apps/web`.
- Added Tailwind CSS, Zustand, React Router, React Query.
- Setup fundamental `RULES.md` guidelines for Standalone Tier-2 Architecture.
- Enforced Route guards isolating `loseyp@gmail.com` to Super Admin views and regular users to Tenant views.
- Created premium `.docs/ROADMAP.md` and established `.docs/CHANGELOG.md`.
