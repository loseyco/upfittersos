## 2026-05-26T17:32:29Z

You are 'teamwork_preview_worker'.
Your role is 'Senior Bug Fix Worker'.
Your coordination folder is 'c:\_Projects\upfittersos.com\.agents\worker_m5_fixes'. Please initialize your progress tracking there in 'progress.md' with a 'Last visited' timestamp.

Your task is to implement bug fixes for 4 critical/medium vulnerabilities and glitches discovered during stress testing of the Foreman Dashboard:

### Core Files to Modify:
- Source: `c:\_Projects\upfittersos.com\apps\web\src\features\business\MorningMeetingBoard.tsx`

### Discovered Issues & Patches to Implement:
1. **🔴 Critical DoS - Out-of-Bounds Schedule Days**:
   - **Vulnerability**: In `projectWorkingHours`, if the days array contains invalid integers (e.g. outside `1-7`), the loop `while (remainingMs > 0)` runs infinitely, freezing the browser tab/CPU.
   - **Fix**: Sanitize `days` inside `projectWorkingHours` to ensure it only processes valid integers between `1` and `7`. Add a maximum iteration guard (e.g., `let iterations = 0; ... iterations++; if (iterations > 1000) break;`) to guarantee the loop terminates.

2. **🔴 Critical DoS - Infinity Book Hours**:
   - **Vulnerability**: In `projectWorkingHours`, if `totalHours` is `Infinity`, `remainingMs > 0` remains true forever, causing an infinite loop that freezes the thread.
   - **Fix**: Add a safe entry check: `if (!isFinite(totalHours) || totalHours <= 0) return startDate;`.

3. **🟡 Medium - Visual NaN Worked Time**:
   - **Glitch**: If a technician clock session has corrupted timestamps (e.g. malformed break dates), elapsed clock math results in `NaN`. This propagates up to the UI, rendering `"Active: NaNh NaNm"` on the cards.
   - **Fix**: In duration formatting helper functions (such as `formatMillisToDuration` or other math calculations), ensure any `NaN` values are sanitized to fall back safely (e.g. return `"0h 0m"` or check `isNaN(ms)`).

4. **🟡 Medium - CSS NaN% Overlay Layout**:
   - **Glitch**: If schedule time strings are corrupted (e.g. `"abc:def"`), helper `getTodayTimeMs` returns `NaN`. This propagates to timeline offset percentages (`left="NaN%"`, `width="NaN%"`), triggering React/CSS warnings and rendering failures.
   - **Fix**: Validate time string format (`HH:MM`) in `getShiftBounds`, `getTodayTimeMs`, or duration calculations. If strings are invalid or fail parsing, fall back to safe default numbers (e.g. return `null` or default boundaries) to avoid NaN division.

### Verification:
- The Challenger has already created a stress test suite at `c:\_Projects\upfittersos.com\apps\web\src\features\business\__tests\MorningMeetingBoardStress.test.tsx`.
- Run `npm run test:run -w web` and verify that ALL 21/21 tests (the 12 original tests + the 9 stress tests) pass successfully!
- Run `npm run build -w web` and verify the production build compiles successfully with no TS errors.
- Once completed, write a comprehensive `handoff.md` in your coordination folder.

### MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please let me know once you have received this task and have initialized your progress tracking. Keep me updated on your progress.
