# UpfittersOS V2: Changelog

All notable changes to this project will be documented in this file.

## [v0.0.16] - 2026-08-21
- **Yellow Sheets Payroll Supercharge & Landscape Cover Summary Page**:
  - Added dedicated **Executive Cover Summary Page** for landscape 1-page printing with full shop technician roster, department summaries, earned book hours, total shift hours on clock, actual wrench hours, dual efficiency metrics (Shift Efficiency % vs. Task Efficiency %), and total shop payout reconciliation.
  - Added dedicated **Time Clock Shift Ledger** to technician reports showing chronological daily shift clock-in/out timestamps, unpaid break deductions, shift notes, and edit badges.
  - Added **Time Clock Shift Management & Audit Trail**: Full shift editing modal with mandatory edit reasons, manual shift entry creation, and shift deletion with automated audit logs in `businesses/{tenantId}/audit_logs`.
  - Added **Triage Filter Chips** (`All`, `🔴 Bottlenecks (<60%)`, `⚠️ Review (>200% / <2m)`, `👥 Multi-Tech Splits`).
  - Added dark-mode glassmorphic **Pace Variance Highlighting** (`🟢 95% On Target`, `🟡 75% Variance`, `🔴 42% Bottleneck`, `⚠️ Under-Clocked`).
  - Enhanced **↳ 💬 Full-Width Indented Staff Notes** with inline delimiter formatting and quick-edit modal.
- **Jobs Overview Sheet Customer Pickup Recovery Hub**:
  - Added graceful "Customer Picked Up" workflow jumping delivered vehicles to a dedicated "Jobs With Customer (Last 7 Days)" section.
  - Added 1-click "↩️ Undo" pickup action to instantly restore accidentally delivered vehicles back to `Ready for Customer` on the shop floor.
- **Time Clock Invariants & Safety**:
  - Added guard in `useJobClock.ts` preventing technicians from clocking into jobs/tasks while on break/lunch.
  - Resolved active worker segment filtering on Jobs Overview to strictly evaluate active sessions.

## [v0.0.15] - 2026-08-18
- **Unified Native Date & Time Picker for Shift Adjustments**:
  - Upgraded Shift Clock In, Shift Clock Out, and labor segment adjustments in `TimeDetailsV3.tsx` with native Date/Time Pickers (`<input type="datetime-local">`).
  - Allows staff to adjust both target date (e.g. yesterday) and exact clock-out timestamp with full calendar/clock pickers and validation against future timestamps.
- **Tuesday Weekly Operations Meeting Report ("The Good, The Bad, The Needs")**:
  - Added dedicated Tuesday Meeting Report component (`TuesdayMeetingReport.tsx`) accessible directly under the Upfitters department menu.
  - Strict Monday–Sunday date range calculation evaluating the previous calendar week's completed vehicles, earned book hours, first-time QC pass rate, and technician throughput leaderboard.
  - Interactive triage for QC kickback inspection logs, blocked vehicles/bottlenecks, critical parts awaiting arrival, and facility/tooling needs.
  - Live Firestore sync under `businesses/{tenantId}/tuesday_reports/week_YYYY_MM_DD` and print-ready layout for shop meetings.
- **Standalone Popup Window UX Optimization**:
  - Standalone popups and job window popups now automatically initialize with the sidebar submenu minimized/collapsed for maximum workspace readability.

## [v0.0.14] - 2026-08-17
- **Super Admin Time Editing on Daily Operations Log**:
  - Added interactive timestamp editing on the Daily Operations Log for Super Admins and managers with `daily_log.manage` permission.
  - Added Super Admin Time Adjustment Modal with minute-level precision, quick presets (`-15m`, `-5m`, `+5m`, `+15m`, `Now`), direct Firestore updates to underlying records, and `EDITED` audit badges with `↺ Restore Original`.
- **Confirmation Modal for "Mark Closed / With Customer"**:
  - Added explicit confirmation modal to the "Ready for Customer" widget in Progress Digest to prevent accidental clicks when completing jobs and freeing parking zones.
- **Bi-Directional CompanyCam $\leftrightarrow$ UpfittersOS Photo Sync**:
  - Integrated live bidirectional sync in Job Detail V3 (Tab 6: Photos), allowing seamless photo pushing to CompanyCam and photo importing into UpfittersOS native media with filter sub-tabs (`All Photos`, `⚡ UpfittersOS`, `📷 CompanyCam`, `🔄 Unsynced`).
- **Customer Type-to-Search Autocomplete**:
  - Added live typeahead search dropdowns across Daily Operations Log column headers, Operations Log filter toolbars, and the Edit Job modal.
- **Simplified Parking Spot Selector & "With Customer" Status**:
  - Replaced bulky spot grids with a compact Assigned Location Summary banner, resolved raw document ID displays, and added dedicated "With Customer" location handling.
- **Super Admin Daily Log Deletion with Confirmation**:
  - Added tombstone tracking (`deleted_daily_logs`), confirmation modal before deletion, and 1-click restore functionality.
- **UI & Route Hygiene**:
  - Removed redundant V3 button from classic Job Detail and cleaned up unused imports.

## [v0.0.13] - 2026-08-06
- **Yellow Sheets Staff Payroll Reports & Header Metrics Update**:
  - Expanded worker session ID & name cross-matching across Auth UID, Staff Document ID, and normalized staff names.
  - Removed premature date-range filtering from task-level session aggregation so all labor clocked on completed tasks is retained regardless of shift start date.
  - Added 3-tier fallback resolution for task sessions and minute-level duration formatting (e.g. `1m`, `17m`, `0.3h`).
  - Redesigned Staff Report header into 3 distinct metrics: **Completed Book Time**, **Time Spent on Book Time** (with Task Efficiency %), and **Time on Clock** (with Shift Efficiency %: Completed Book Time vs. Timecard Hours).

## [v0.0.12] - 2026-08-05
- **Jobs Worksheet (Jobs Sheet V3)**:
  - Added **Created Date** (`createdAt`) column with Excel-style header popover sorting menu (Newest to Oldest, Oldest to Newest, Clear Sort) and top toolbar sort selector.
  - Updated **Open** shortcut link under Details & Card column to open job details in a new tab (`target="_blank" rel="noopener noreferrer"`).
- **Progress Digest & Daily Operations Log 1:1 Parity**:
  - Upgraded Progress Digest (`ProgressDigest.tsx`) operations feed to 100% match `DailyLogV3.tsx` across all event categories: Task Lifecycle (`TASK DONE`, `READY FOR QC`, `TASK BLOCKED`, `ON HOLD`, `TASK NOTE`, `TASK PHOTO`), Shifts & Breaks (`CLOCK IN`, `CLOCK OUT`, `LUNCH START`/`END`, `BREAK START`/`END`, `TASK START`/`END`), Parts Requests (`PARTS REQUESTED`, `PARTS ORDERED`, `PARTS RECEIVED`, `PARTS WITH VEHICLE`), and Job Milestones (`READY FOR CUSTOMER`, `JOB COMPLETED`).
  - Added Date Selector input to Progress Digest header to navigate between today and past dates.
  - Aligned all summary card counts and metrics (Ready for Customer, Blocked & On Hold, Waiting on Parts, Ready for QC, QC Reworks, Clocked Labor, Department Efficiency) to dynamically evaluate against the selected target log date.
  - Updated all job card shortcut clicks to open in a new tab (`window.open(..., '_blank')`).

## [v0.0.11] - 2026-08-04
- **Daily Progress Live Report 4K Zero-Scroll Layout**:
  - Re-architected `DailyProgressMonitor.tsx` into a 100% zero-scroll 4K TV layout (`h-[100vh] overflow-hidden`) with a 5-column metric header and split feed panels.
  - Renamed metric label to **Completed Book Hours**.
  - Added real-time tracking metrics and dedicated feed panels for **Jobs Ready for QC**, **Jobs Ready for Customer**, and **Parts Waiting On**.
  - Added snapshot error callbacks, loading timeout safety fallbacks, and default display mode fallbacks to `UnifiedMonitor.tsx` and `UnifiedMonitorAuthWrapper.tsx` so TV monitor URLs (`?m=MONITOR_ID`) never get stuck spinning on loading screens.

## [v0.0.10] - 2026-08-04
- **TV Monitor Reset Fixes & Persistent Pairing**:
  - Saved paired `tenantId` into `localStorage` in `TvSetupScreen.tsx` so scheduled 6-hour auto-reloads and brief Wi-Fi drops automatically restore `<BayMonitor>` / `<ConferenceRoomMonitor>` without resetting to the pairing PIN screen.
  - Added support for reading `m` or `monitorId` from search parameters (`?m=MONITOR_ID`) and persisting `bound_monitor_id` across `UnifiedMonitor.tsx`, `UnifiedMonitorAuthWrapper.tsx`, and `ConferenceRoomMonitorAuthWrapper.tsx`.
- **Daily Progress Live Report TV Display Mode**:
  - Created `DailyProgressMonitor.tsx` and `DailyProgressMonitorAuthWrapper.tsx` (`/daily-progress-tv?t=TENANT`), providing a real-time, TV-optimized display showing **Jobs Completed Today**, **Active Bays Count**, **Earned Book Hours Logged Today vs Target**, and **Active Blockers**.
  - Enforced 100% strict real data schemas: eliminated all fake fallback strings ("Shop Crew", "Upfit Vehicle", "Standard Client"). Technician names, vehicle descriptions, customer details, and task progress counts now derive strictly from verified Firestore task assignments, active shift sessions, and job records, rendering `"Unassigned"` or `"N/A"` when data is missing.
  - Subscribed to `collectionGroup(db, 'tasks')` with `isGeneralTask` filtering to compute accurate non-general task completion percentages and total earned shop book hours.
  - Added **Daily Progress Live Report** (`daily_progress`) as a selectable TV Mode in `ConferenceControlPanel.tsx` and `UnifiedMonitor.tsx`.
- **TV Monitor Control Hub in Facility Main Menu**:
  - Added **TV Monitor Control Hub** (`conference_control`) directly under **Facility & Comm** in `BusinessSidebar.tsx` and updated permission gates in `TenantDashboard.tsx` (`facility.view` / `development.view`).
  - Added **"Copy Permanent TV Link"** buttons to `ConferenceControlPanel.tsx` for easy Smart TV browser bookmarking.

## [v0.0.9] - 2026-08-04
- **Payroll & Timeclock Audit Worksheet**:
  - Created `PayrollAuditWorksheet.tsx` in the In Development / Dev Tools hub (`payroll_audit_worksheet`), providing 1:1 cross-referencing across Timeclock Punches, Job Yellow Sheets, Staff Payout Reports, and Operations Log feeds.
  - Added KPI summary metrics for Total Audited Tasks, 100% Verified, Discrepancies, Earned Book Hours, and Clocked Task Hours.
  - Added dedicated **Source Collection & Document ID** column rendering exact Firestore paths (`businesses/{tenantId}/jobs/{jobId}/tasks/{taskId}`) with zero fluff or fallbacks.
  - Built an interactive **Source Document Inspection Drawer** allowing raw JSON inspection of Firestore task documents.

## [v0.0.8] - 2026-08-04
- **Staff Labor & Payout Report Printing**:
  - Filtered `groupedStaffData` in `YellowSheets.tsx` to strictly include only tasks completed in the selected timeline/pay period (`completedInPayPeriod === true`), excluding uncompleted or out-of-period tasks from printed staff payout sheets.

## [v0.0.7] - 2026-08-04
- **Daily Operations Log Attribution & Break Labels**:
  - Enhanced `resolveEventActor` in `DailyLogV3.tsx` to map Patrick Losey's emails (`p.losey@saegrp.com`, `loseyp@gmail.com`) to `"Patrick Losey"` and removed hardcoded fallbacks ("Matt Dziewior") across parts request event feeds.
  - Added complete staff attribution (`statusChangedBy`, `statusChangedByName`, `updatedBy`, `updatedByName`, `deliveredBy`, `deliveredByName`, `stagedBy`, `stagedByName`) across parts request handlers in `JobDetailPage`, `PartsWorksheet`, `ItemDetailsModal`, `PartsMissionControl`, and `PartsRequestModal`.
  - Updated break event labels from `"Rest Break"` to `"Break"` ("Went on Break" / "Returned from Break") and added orange badge styling for `ON BREAK` and `ON LUNCH`.
- **Yellow Sheets & Staff Payout Reports**:
  - Updated task category display to strictly render the assigned task category (`taskGroup`/`category`) assigned to the task in the job.
  - Fixed `groupedStaffData` calculation so **Earned Book Time** (`totalBookHours`) in the Staff Labor & Payout Report header strictly sums tasks completed in the selected pay period.
  - Increased **Time Completed** timestamp font size to `10px` font-medium.
  - Removed the red filter warning banner from Staff Labor & Payout Report headers.
  - Simplified the **TECH** column display to render technician names only (e.g. `Silverio Benitez`), removing the split details string.
  - Added a **Time Spent** column directly after **Book** in the Job Yellow Sheet printable table.
  - Completely removed all name fallback string matching across `calculateTaskActualDuration`, `getTaskSegments`, and `groupedStaffData`, enforcing 100% exact task ID matching (`t.id` / `seg.taskId` / `timeSessions` / `actualTime`) for timeclock audit compliance.

## [v0.0.6] - 2026-08-04
- **Yellow Sheets Layout & Payout Reports**:
  - Replaced the task **Status** column in the Yellow Sheets print table layout with **Time Completed**.
  - Corrected task data mapping to explicitly assign `completedAt` to the technician's completion timestamp (`t.completedAt || t.completedDate`), avoiding the fallback to `t.qcCompletedAt` (manager QC passed time).
  - Cleaned up the print table's **Tech** column to remove the duplicate timestamp underneath the technician's name.
  - Implemented **Print Staff Sheets** payout/labor reports that group tasks by staff member, displaying split book hours, individual actual hours, and efficiency metrics on clean, page-separated sheets.
  - Added dynamic header banners displaying active search/dropdown/pay basis filters, warning `⚠️ FILTERED VIEW (Not a full sheet)` on partial Job sheets specifically when not displaying "Show All" status records.
  - Excluded staff/department/date filter parameters from the Staff report warning headers (since they are inherently grouped/page-separated by staff member and the period is already printed in the card header).
  - Added a solid 10px yellow brand strip across the top of all printed job and staff sheets.
  - Overhauled printed styles to be clean black-and-white (white backgrounds, gray headers, and white tables) instead of yellow backgrounds.

## [v0.0.5] - 2026-08-04
### Fixed
- **Task Completion to QC Workflow**:
  - Re-architected task completion flow in Overview V3 so marking tasks complete sets status to `QC` (Ready for QC) instead of writing `completed`.
  - Synchronized status handling across `JobDetailPage`, `TaskDetailPage`, and `OverviewV3` to recognize `QC`, `QC Complete`, `completed`, and `Completed`.
  - Updated `JobDetailPage` task completion display to show the exact technician who completed the task (`completedByStaffName`) rather than generic assigned crew names.
  - Upgraded `DailyLogV3` task & QC queue staff resolution to inspect task `assignedStaff` and active shift time sessions, eliminating hardcoded fallback names ("Shop Foreman" / "Technician").
  - Migrated desynchronized tasks in Firestore to status `QC`.
- **Ready for Customer & Blocker Operations Log Events**:
  - Added live feed items in `DailyLogV3` when jobs move to `Ready for Customer` (`badgeLabel: 'READY FOR CUSTOMER'`), recording `readyForCustomerAt` and `readyForCustomerBy`.
  - Added live feed events in `DailyLogV3` for **BLOCKED** and **RESOLVED** task/job blocker events with rose and teal badges detailing the blocker message and user.
  - Added top KPI filter cards for **`READY FOR CUSTOMER`** and **`BLOCKED`** to the Operations Log toolbar.
  - Enhanced staff actor resolution for `READY FOR CUSTOMER` events to inspect task completers (`completedByStaffName`) and assigned technicians, resolving actual names (e.g. Patrick Losey) instead of defaulting to "Shop Manager".
- **Sidebar Active Hub Navigation**:
  - Updated `BusinessSidebar` and `MobileBottomNav` so navigating to a Job or Task details page keeps the **Upfitters Hub** selected, allowing quick 1-click navigation back to **Jobs Worksheet**.
- **Time Clock KPI Summary Pills**:
  - Streamlined `TimeDetailsV3` summary pills to 4 focused cards: **CLOCKED IN TIME**, **BOOK TIME COMPLETED**, **TIME ON TASK**, and **UNALLOCATED TIME**.
  - Updated **TIME ON TASK** (`totalHourlyHours` / `dayHourlyMs`) to sum ALL active task clock-in durations (including diagnose/repair and book time tasks), ensuring task clock-ins render accurately (e.g. 1.33h on Job #0946264) without requiring task completion or specific pay basis flags.
  - Standardized daily shift card subheader metrics to: **`TIME ON TASK`**, **`BOOK TIME COMPLETED`**, and **`UNALLOCATED`**.
- **Task Completion Attribution & Book Time Credit Fix**:
  - Updated task completion handlers (`JobDetailPage`, `TaskDetailPage`, `OverviewV3`) so completing a task credits the **assigned technician** (`completedByStaffId` / `completedByStaffName`) rather than overwriting with the acting manager/admin.
  - Fixed `TimeDetailsV3` book time credit calculation so completed tasks (status `QC`, `QC Complete`, `completed`) are credited directly to task completers (`completedByStaffId` / `completedByStaffName`) and assigned technicians without requiring a live task timer, resolving missing book time for Adrian Benitez (3.0h yesterday, 6.0h today).
  - Repaired live Firestore task document `YaQmpr7Qe0wIKjf2YAcn` (Job #9043528, 16.00h `Labor:Radio`) to credit **Silverio Benitez** (`pDe0DDb6HJPd2ZJUXAJjt0V4HNa2`), removing it from Patrick Losey's time clock.
- **Site-Wide QC Status Consistency Audit**:
  - Audit across `JobsWorksheet`, `JobDetailPage`, `OverviewV3`, `JobQCPage`, `DailyLogV3`, `DepartmentDashboard`, `ControlBoard`, `ForemanTodoList`, `HarnessMissionControl`, and `ProgressDigestV3`.
  - Enforced `['QC', 'QC Complete', 'completed', 'Completed']` as valid completion states across all progress bars, completion counters, and labor credit calculations.

## [v0.0.4] - 2026-08-03
### Added
- **Instant Zero-Delay Clock Out**:
  - Re-architected timeclock clock-out flow so shift completion (`status: 'completed'`) and timestamp are written and confirmed in Firestore immediately without blocking on geolocation APIs.
  - Background geolocation capture fetches GPS/IP coordinates asynchronously without hanging or locking the user out.
  - Added overnight stale shift auto-resolver in `syncStatus` to automatically close un-ended shifts older than 16 hours.
- **Yellow Sheets Improvements**:
  - Replaced custom date range pickers with interactive **Pay Period Stepper** navigation widget.
  - Added `SearchableSelect` for quick staff filtering.
- **Timeclock Spreadsheet Enhancements**:
  - Filtered active staff strictly to exclude archived, fired, or inactive employees.
  - Styled custom user notes with high-contrast bright white bold badges.
  - Standardized `Gap` labor category label to `Unallocated`.

## [v0.0.3] - 2026-06-05
### Added
- Created a comprehensive **Feature Tutorials & Slide presentation Help System**:
  - Implemented an `Info` icon button next to all sidebar submenu items for immediate help popup.
  - Implemented a **Help Center** hub in the main navigation with direct routing (`/business/:tenantId/help_*`).
  - Added PowerPoint-style slide deck presentations in the Help Center featuring step progress indicators, Next/Prev buttons, slide counts, slide tips, and styled HTML preview mockups.
  - Authored detailed slide tutorials for **Clocking In & Out** and **Breaks & Lunches** detailing security scans (rotating QR code), geolocation restrictions, task suspensions, shift timer calculations, and supervisor queries.
  - Integrated "Read Full Tutorial" links in the inline help popup to route users to corresponding slide decks.
  - Defined strict guidelines in `RULES.md` (Rule 20) ensuring future feature edits are accompanied by help system updates.

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
