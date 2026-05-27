# Adversarial Stress-Test and Verification Report

**Overall risk assessment**: 🔴 **CRITICAL** (due to thread-freezing / browser DoS vulnerabilities)

This report details the adversarial review, edge case mining, and stress-testing conducted on the foreman dashboard component (`MorningMeetingBoard.tsx`) and its accompanying tests. All findings are backed by empirical verification and unit tests in `MorningMeetingBoardStress.test.tsx`.

---

## 1. Challenges & Vulnerabilities Identified

### 🔴 Critical Challenge 1: Thread-Hanging / Denial of Service via Invalid Schedule Days
- **Assumption Challenged**: The `days` array in `schedule` will only contain standard day integers `1` (Monday) through `7` (Sunday).
- **Attack Scenario**: If a department or individual technician schedule is saved or synchronized with out-of-bounds day integers (e.g., `[8]`, `[9]`, or `[0]` where Sunday is represented as 0 instead of 7), the `days.includes(mappedDay)` filter will evaluate to `false` for all valid days.
- **Blast Radius**: **Tab Freeze / DoS**. The event loop in `projectWorkingHours` continually increments the `current` Date instance without ever decrementing `remainingMs` or hitting a terminal state. The browser tab freezes instantly, consuming 100% CPU.
- **Mitigation**: Add a maximum iteration guard (e.g., `iterations > 1000`) to break the loop, and sanitize the schedule days input array to ensure only integers `1-7` are processed.

### 🔴 Critical Challenge 2: Thread-Hanging / Denial of Service via Infinity Book Hours
- **Assumption Challenged**: The total work hours calculated will always be finite numbers.
- **Attack Scenario**: If a task has a `bookTime` value parsed as `Infinity`, or if calculations yield `Infinity`, the loop condition `remainingMs > 0` remains true forever. Subtracting finite shift hours from `Infinity` leaves the value at `Infinity`.
- **Blast Radius**: **Tab Freeze / DoS**. The browser tab completely freezes.
- **Mitigation**: Add a safety check at the entry of `projectWorkingHours`: `if (!isFinite(totalHours)) return startDate;`.

### 🟡 Medium Challenge 3: Visual `NaN` Calculation & Rendering Leak
- **Assumption Challenged**: Sync data or timestamp payloads from Firebase Firestore are always valid dates.
- **Attack Scenario**: If a technician clock session has corrupted timestamp fields (e.g., a break start date that fails parsing), the math `bEnd - bStart` evaluates to `NaN`. This propagates up, setting `elapsed`, `clockedTimeToday`, and `unassignedTimeToday` to `NaN`.
- **Blast Radius**: **Visual Glitches**. The technician card renders `"Active: NaNh NaNm"` and `"Idle: NaNh NaNm"` on the TV monitor display.
- **Mitigation**: Sanitize durations in `formatMillisToDuration` by adding a fallback (e.g., `if (isNaN(ms)) return "0h 0m"`).

### 🟡 Medium Challenge 4: Proportional Overlay SVG Position Calculations (`NaN%`)
- **Assumption Challenged**: Time inputs to `getTodayTimeMs` are always valid `HH:MM` strings.
- **Attack Scenario**: If a schedule contains a corrupted time string (e.g. `"abc:def"`), `getTodayTimeMs` will return `NaN`. Because the conditional `shiftDuration <= 0` evaluates to `false` for `NaN <= 0`, percentages `startPercent`, `endPercent`, and `widthPercent` all evaluate to `NaN`.
- **Blast Radius**: **CSS/Rendering Bug**. Renders `left="NaN%"` and `width="NaN%"` in styling, causing console warnings and layout glitching on the shifts timeline.
- **Mitigation**: Sanitize and validate parsing inside `getTodayTimeMs` to return a safe fallback timestamp instead of `NaN`.

---

## 2. Empirical Stress Test Suite

The Vitest stress test suite in `MorningMeetingBoardStress.test.tsx` successfully asserts all stress scenarios:
- **Test 1: Empty Rosters fallback**: Component displays highly legible, styled fallback cards for Lanes, Grid, and Presentation layouts.
- **Test 2: Missing properties**: Component survives missing `status`, `customerName`, `jobTitle`, and `jobs` properties on inputs.
- **Test 3: Extremely short shift durations**: Proved that 1-minute shifts do not divide by zero and are clamped safely.
- **Test 4: Timing-insensitive idle clock formatting**: Confirmed that unassigned/idle time is successfully calculated.
- **Test 5: Mathematical loop-guard proofs**: Mathematically demonstrated that out-of-range days (`[8]`) and `Infinity` inputs loop infinitely, but negative durations return safely.
- **Test 6: Corrupted shift schedule strings**: Verified that `"abc:def"` strings are handled without crashing the React layout.
- **Test 7: Malformed break times**: Confirmed the visual `"NaNh NaNm"` rendering bug.

---

## 3. Unchallenged Areas

All requirements (R1: Slide deck, R2: Briefing Widget, R3: Timelines/Pace alert rules) were fully stress-tested. No areas within the foreman hub were left unchallenged.
