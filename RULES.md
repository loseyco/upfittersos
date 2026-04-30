# UpFittersOS: Architecture & Agent Constraints

This document serves as the absolute source of truth for the codebase architecture of UpfittersOS. Any internal developers or AI Agents engineering this codebase must strictly adhere to these foundational rules.

## 1. Database Architecture: "Strict Sub-Collections"
The biggest technical debt in V1 was utilizing global Root Collections (e.g., `/jobs`, `/vehicles`) filtered by `.where('tenantId')`. 
**Rule:** The architecture utilizes a strict two-tier hierarchy:
- **Tier 1 (System-Wide Data):** Dedicated root-tables for global platform analytics or super-admin management (e.g., `/users`, `/platform_logs`).
- **Tier 2 (Tenant Isolated Data):** All operational shop data MUST be physically nested inside: `/businesses/{tenantId}/[collection_name]`. This ensures a single shop's entire data footprint can be exported, locked down, or deleted natively.

## 2. Security & Authentication (RBAC)
- **Super Admin Identity:** `loseyp@gmail.com` is hardcoded as the root platform operator. 
- Only Super Admins can instantiate new `/businesses` or perform platform-wide schema sweeps.
- **Rule:** Never allow Tenant-level Admins to interact with Tier 1 tables.

## 3. UI / UX & Modularity (The Component Blueprint)
- **Ultra-Modular Design:** Every feature must be built decoupled from its route. A feature (e.g., `TimeClockTracker` or `JobCard`) must function perfectly whether rendered on a Full Page, inside a popup Modal, or in a sliding Sheet. Never hardcode full-page layout constraints (like viewport heights) inside the feature component. 
- **Progressive UI Scaling:** Design Mobile-First, but aggressively scale feature richness. When a user is on a Desktop (1080p, 4K, 8K), do not simply "stretch" the layout. Reveal denser data modules, supplementary analytics, and deeper table metrics natively as the screen expands. Design for the extreme high-resolution future.

## 4. Integration Philosophy: "Standalone First"
UpfittersOS is an apex platform designed to run a shop natively.
- **Rule:** The platform must never natively *require* a third-party subscription to function.
- If a shop utilizes an external CRM/Accounting suite, we bridge the data down. Otherwise, Upfitters operates natively.

## 5. Third-Party Constraints (QuickBooks & CompanyCam)
- **QuickBooks:** The integration is strictly **Read-Only**. UpfittersOS consumes downstream Jobs, Customers, and Items from QuickBooks and saves clones in the Sub-Collections. We will NEVER push data backwards into QuickBooks. No upstream liability.
- **CompanyCam:** We will support their API as a legacy bridge for shops heavily invested in it. However, the system roadmap forces UpfittersOS Media to naturally cannibalize CompanyCam by acting as the unified standalone Image Uploader via Native Firebase Storage.

## 6. Strict Structural Decoupling (Frontend vs Backend)
- **Rule:** The codebase must physically isolate Frontend presentation code from Backend logic (`firestore.rules`, `functions/`). 
- **Agent Constraint:** When an agent is tasked to build a Frontend feature (e.g., a React component in `src/`), it MUST NEVER touch backend architectures, cloud functions, or schema rules. 
- The project will deploy an isolated workspace/monorepo structure so that a UI developer never crosses boundaries with a backend engineer.

## 7. Root Cleanliness & Documentation Hygiene
- **Strict Cleanliness:** The root directory must remain spotless. Only essential system configurations (`package.json`, `.firebaserc`, `.env`) are permitted. 
- **Doc Confinement:** All documentation, roadmaps, and mapping outlines must be strictly confined to the `.docs/` directory.
- **Active Logging & Roadmaps:** You (the developer/AI) must actively maintain a `.docs/CHANGELOG.md` detailing every major architectural shift, feature addition, or critical bug fix. You must additionally maintain a `.docs/ROADMAP.md` tracking upcoming sprints.

## 8. Continuous Visual & Functional Verification
- **Strict Verification Rule:** The developer (and any AI Agent) is absolutely required to test all UI components and features directly via the browser before considering a sprint complete.
- **Agent Constraint - Self-Auditing:** We do not push "theoretical" code. The Agent must boot the local dev server and utilize browser automation (`browser_subagent`) to physically navigate the application, audit for visual layout breaks on the viewport, take screenshots/recordings, and formally verify correctness.

## 9. Absolute Prohibition of Placeholders
- **Rule:** Under no circumstances should the codebase contain "placeholders", "fake data", or "lorem ipsum" strings. 
- **Agent Constraint:** If a feature requires data to render, the agent must build the real data integration (e.g., Firestore queries) or use the exact real-world shape of the data. Mocks are explicitly banned unless structurally necessary for automated unit test files.

## 10. Multi-Breakpoint Responsive Testing
- **Rule:** Every tool and component must perfectly fluidly scale from Mobile screens up to Ultra-Wide Desktop (4K/8K) bounds.
- **Agent Constraint:** When utilizing browser verification, the agent MUST explicitly instruct its browser-subagent to resize the viewport and capture screenshots across at least 3 distinct bounds (Mobile ~400px, Tablet ~768px, Desktop 1920px) to prove structural integrity.

## 11. PWA & Installability
- **Rule:** The web application must be a fully compliant Progressive Web App (PWA). It must be installable on iOS, Android, and Desktop operating systems.
- **Implementation:** Maintain a valid `manifest.webmanifest`, service workers, and appropriate launcher icons. Offline caching capabilities should be leveraged where appropriate.

## 12. URL Sovereignty & Sharing
- **Rule:** Every meaningful interaction state, user dashboard, or application configuration MUST have a distinct, shareable URL. 
- **Implementation:** Do not hide shareable state exclusively behind React state (e.g., avoid showing a major modal or sub-page without mapping it to a route like `/jobs/123/details`). When shared, the URL must resolve perfectly with rich Open Graph (`og:`) and Twitter card meta tags to generate premium previews in iMessage, Slack, and social feeds.

## 13. Sitemap Maintenance
- **Rule:** The project must continuously maintain an up-to-date `.docs/sitemap.md` for human-readable architecture, and the production web app must dynamically generate or statically host an accurate `sitemap.xml` for search engine crawlers.
- **Constraint:** Whenever a new public-facing route or core module is added, the sitemap must be updated.

## 14. Comprehensive Telemetry & Audit Logging
- **Rule:** Every meaningful action taken on the platform MUST be logged to the database. This acts as both a security audit trail and a granular analytics engine.
- **Implementation:** 
  - Traceable Events: Logins, logouts, clock-ins, data creation (quotes, jobs, clients), data deletions, data mutations, and page views (including origin/referrer).
  - Contextual Metadata: Every log entry MUST capture: `userId`, `timestamp`, `actionType`, `targetEntityId`, `ipAddress`, `geoLocation` (derived from IP if possible), and `userAgent` (device/browser details).
  - Structure: 
    - Tenant-scoped events (e.g., technician clocks in) go to `/businesses/{tenantId}/audit_logs` so shop admins can track staff actions in real-time.
    - Platform-wide events (e.g., auth lifecycle, super admin actions) go to `/platform_logs` for Super Admin oversight.
- **Constraint:** Treat logs as immutable. The logging mechanism should be robust, heavily utilized, and designed to provide "Google Analytics-level" insight into shop operations directly within the dashboard.

## 15. Strict Mobile-First UX Constraints
UpfittersOS is built for shop floors. We must design for harsh lightning, gloved hands, and touch interfaces.
- **Rule - No Hidden Hover States:** Never hide core actions (like "Edit" or "Delete" buttons) exclusively behind a mouse hover state. "If we can do it, we can see it right away." All actions must be persistently visible or accessible via a swipe/explicit tap on touch devices.
- **Rule - Oversized Touch Targets:** Any primary interactive element (buttons, toggles, form fields) must be generously sized (minimum 48x48px / `h-12 w-12` in Tailwind) so technicians wearing gloves can navigate without precision issues.
- **Rule - Native Hardware Utilization:** Always utilize native HTML5 APIs for hardware integration (e.g., Geo-Location tracking for remote clock-ins, native Camera APIs for media uploads) rather than building complex software wrappers.
- **Rule - Haptic & Visual Feedback:** Provide aggressive micro-animations (e.g., `active:scale-[0.95]`) on touchable surfaces so technicians instantly know their action registered without squinting.

## 16. Human-Readable Identification
- **Rule:** We NEVER expose raw database UUIDs or unique ID numbers in the UI. 
- **Implementation:** Always resolve relational data to show information that is useful to the human user (e.g., displaying the "Business Name" instead of "tenantId", or "Customer Name" instead of "customerId"). Users should never need to look at a 24-character string to know what they are interacting with.
## 17. Safe Deployment & Version Control
- **Rule:** Never update "live" production environments or perform `git push` operations without explicit user discussion and approval.
- **Implementation:** Favor local development tools (dev servers, emulators, manual test scripts) for verification. Only initiate deployment commands (`firebase deploy`, `npm run build:prod`) or version control pushes after the user has confirmed they are ready for the change to go public or be merged.
