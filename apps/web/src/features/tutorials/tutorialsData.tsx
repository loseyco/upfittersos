import React from 'react';
import { 
  Clock, LogIn, Pizza, Coffee, MessageSquare, 
  AlertTriangle, MapPin, QrCode,
  ClipboardList, CheckSquare, Users, Activity, FileSpreadsheet,
  RefreshCw, AlertCircle, Download,
  Calendar, Warehouse, Monitor, UserCog, Building2, Settings, BellRing,
  HelpCircle, ShieldCheck, GraduationCap
} from 'lucide-react';

export interface TutorialSection {
  title: string;
  icon?: React.ComponentType<any>;
  content: React.ReactNode;
}

export interface QuickStep {
  title: string;
  description: string;
  icon?: React.ComponentType<any>;
}

export interface Tutorial {
  title: string;
  description: string;
  category: string;
  sections: TutorialSection[];
  quickSteps?: QuickStep[];
  summary?: string;
}

export const getTutorialsData = (business: any, staffMember: any, permissions: any): Record<string, Tutorial> => {
  const isQREnforced = !!business?.timeclockRequireQR;
  const isOffsiteAllowed = !business?.siteLat || !business?.siteLng || !!business?.allowOffsiteClockIn || !!permissions?.['timeclock.offsite'];
  const isLunchPaid = !!business?.lunchPaid;
  const isBreakPaid = !!business?.breakPaid;
  
  // Resolve pay type display
  let payTypeLabel = 'Hourly';
  let payTypeDesc = "You will see the 'Completed Book-Time Tasks' table in your history feed to track your daily work efficiency.";
  
  if (staffMember) {
    const pt = staffMember.payType === 'inherit' ? (business?.defaultPayType || 'hourly') : (staffMember.payType || 'hourly');
    if (pt === 'flat_rate') {
      payTypeLabel = 'Flat Rate (Book Time)';
      payTypeDesc = "You will see the 'Completed Flat-Rate Tasks' table in your history feed showing your paid task shares and splits.";
    } else if (pt === 'salary') {
      payTypeLabel = 'Salary';
      payTypeDesc = "Your shift sessions are tracked for attendance, and task logs are used for operational oversight.";
    }
  }

  return {
    time_details: {
      title: "Attendance & Time Clock Guide",
      description: "Learn how to log your attendance, manage breaks, scan shop QR codes, resolve location geofencing, view flat-rate tasks, and submit corrections.",
      category: "Technician Portal",
      quickSteps: [
        {
          title: "Clocking In & Out",
          description: "Click the 'Clock In' button in the top bar to start your shift. Use 'Clock Out' when finished.",
          icon: LogIn
        },
        {
          title: "Log Rest & Lunch Breaks",
          description: "Click lunch or break buttons. If on a task, your job timer is automatically suspended.",
          icon: Pizza
        },
        {
          title: "Verify Security & Geolocation",
          description: "Scan the rotating shop QR code if required and stay within the geofenced radius.",
          icon: MapPin
        }
      ],
      sections: [
        {
          title: "1. Clocking In and Out",
          icon: LogIn,
          content: (
            <div className="space-y-3">
              <p>
                Your shift attendance is recorded using the <strong>Time Clock Bar</strong> persistently displayed at the top of the dashboard.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-sm">
                    Clock In
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                  Click this to start your shift. Your status will update to <strong className="text-emerald-500">Clocked In</strong> and a live work timer will start running.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1.5 bg-rose-650 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-sm">
                    Clock Out
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                  At the end of your shift, click the red clock out button. This stops your work timer and logs your session for review.
                </p>
              </div>
            </div>
          )
        },
        {
          title: "2. Lunch & Rest Breaks",
          icon: Pizza,
          content: (
            <div className="space-y-3">
              <p>
                Log your breaks accurately to ensure compliant record-keeping and payroll calculations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-405 font-bold text-sm">
                    <Pizza className="w-4 h-4" /> Lunch Break
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed mb-2">
                    Stops your active work session. If you are currently clocked into a job task, that job timer will be <strong>suspended</strong>.
                  </p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                    isLunchPaid 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border-emerald-500/20" 
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-405 border-rose-500/20"
                  }`}>
                    {isLunchPaid ? "Paid Lunch Break" : "Unpaid Lunch Break"}
                  </span>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-450 font-bold text-sm">
                    <Coffee className="w-4 h-4" /> Rest Break
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed mb-2">
                    Used for short rest intervals. Suspends job timers.
                  </p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                    isBreakPaid 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-455 border-emerald-500/20" 
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-455 border-rose-500/20"
                  }`}>
                    {isBreakPaid ? "Paid Rest Break" : "Unpaid Rest Break"}
                  </span>
                </div>
              </div>
              <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/40 text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2.5">
                <span className="w-6 h-6 bg-indigo-500/10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm">
                  i
                </span>
                <span>
                  Clicking <strong>Resume Work</strong> will restore your active shift timer and automatically clock you back into the suspended job task.
                </span>
              </div>
            </div>
          )
        },
        {
          title: "3. Rotating QR Code Verification",
          icon: QrCode,
          content: (
            <div className="space-y-3">
              <p>
                If your shop has security enforcement turned on, you must scan the <strong>live rotating QR code</strong> displayed on the shop monitor tablet/screen.
              </p>
              
              {/* Dynamic Status Notice Card */}
              <div className="p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-zinc-450 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-505" /> Shop QR Scan Status
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border ${
                    isQREnforced 
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-405 border-amber-500/20" 
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  }`}>
                    {isQREnforced ? "Enforced" : "Not Required"}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold leading-relaxed">
                  {isQREnforced 
                    ? `For your shop (${business?.name || 'this shop'}), scanning the rotating QR code on the shop display tablet is REQUIRED when clocking in/out via mobile.` 
                    : `For your shop (${business?.name || 'this shop'}), QR scanning is NOT required. You can clock in/out directly from your dashboard.`}
                </p>
              </div>

              <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" /> Security Token Requirements
                </div>
                <ul className="list-disc list-inside text-xs text-zinc-650 dark:text-zinc-400 font-semibold space-y-1">
                  <li>Scan the QR code with your mobile device before clocking in/out.</li>
                  <li>The scanned token is secure and expires after <strong>60 seconds</strong>.</li>
                  <li>Sharing or bookmarking the URL with the QR token will fail, as tokens rotate constantly.</li>
                </ul>
              </div>
            </div>
          )
        },
        {
          title: "4. Geofencing & Location Rules",
          icon: MapPin,
          content: (
            <div className="space-y-3">
              <p>
                The system utilizes your device's GPS to verify that attendance logs occur on-site at the facility.
              </p>

              {/* Dynamic Geofence Status Notice Card */}
              <div className="p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-zinc-450 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-indigo-505" /> Geofence Rule Settings
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border ${
                    isOffsiteAllowed
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" 
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-405 border-rose-500/20"
                  }`}>
                    {(!business?.siteLat || !business?.siteLng) 
                      ? "Disabled" 
                      : (business?.allowOffsiteClockIn || permissions?.['timeclock.offsite']) 
                        ? "Offsite Allowed" 
                        : "Restricted to On-site"}
                  </span>
                </div>
                <p className="text-xs text-zinc-605 dark:text-zinc-400 font-semibold leading-relaxed">
                  {(!business?.siteLat || !business?.siteLng) ? (
                    "Your shop's coordinates are not set in settings, so geofence location check-ins are not gated. You can check in from anywhere."
                  ) : business?.allowOffsiteClockIn ? (
                    "Remote / offsite clock-in is globally enabled by management, so you can check in from any location."
                  ) : permissions?.['timeclock.offsite'] ? (
                    "Your shop restricts clock-ins to the on-site geofence, but your specific staff user account has permission to clock in offsite (e.g. for mobile service)."
                  ) : (
                    `You must be physically present within ${business?.siteRadius || 500} meters of the shop. Geofence location gating is actively enforced.`
                  )}
                </p>
              </div>

              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-105 dark:border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm">
                  <MapPin className="w-4 h-4 text-indigo-505" /> Geofence Enforcement
                </div>
                <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
                  If you attempt to clock in/out off-site, the request will be blocked unless you have <strong>Offsite Clock-in Permission</strong> or the shop's default rules allow it. Enable location permissions on your browser/phone when prompted.
                </p>
              </div>
            </div>
          )
        },
        {
          title: "5. Bouncy Q&A System",
          icon: MessageSquare,
          content: (
            <div className="space-y-3">
              <p>
                To keep job allocations accurate, managers might send questions regarding your timeclock activity.
              </p>
              <div className="flex items-start gap-3 p-4 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                <div className="p-2 bg-rose-500 text-white rounded-xl animate-bounce shrink-0">
                  <MessageSquare className="w-4.5 h-4.5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-450 uppercase tracking-wider">
                    Pending Action Required
                  </p>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
                    A bouncy red chat icon will appear on your Time Clock Bar. Click it to view the manager's question, type your response, and click <strong>Mark OK & Close</strong> to clear it.
                  </p>
                </div>
              </div>
            </div>
          )
        },
        {
          title: "6. Time Logs & Pay Period Metrics",
          icon: Clock,
          content: (
            <div className="space-y-3">
              <p>
                The <strong>Time Clock</strong> sub-menu displays your detailed logs for audit and payroll transparency.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Worked Hours (Net)</span>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold mt-1">
                    Your gross clocked shift time minus lunch and unpaid breaks. This represents your official payroll hours.
                  </p>
                </div>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] text-amber-555 font-bold uppercase tracking-wider block">Book Time Completed</span>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold mt-1">
                    The flat-rate book time values of completed job tasks assigned to you. Shows how efficient your workflow is.
                  </p>
                </div>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-105 dark:border-zinc-800">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">History Feed</span>
                <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold mt-1">
                  A scrollable feed at the bottom displays every clock-in/out, break duration, and which jobs you worked on during that session.
                </p>
              </div>
            </div>
          )
        },
        {
          title: "7. Pay Type Tracking & Corrections",
          icon: ClipboardList,
          content: (
            <div className="space-y-3">
              <p>
                Your pay type determines how completed task lists are managed and how clock corrections are submitted.
              </p>
              
              {/* Dynamic Pay Type notice card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-505" /> Your Profile Pay Type
                </div>
                <p className="text-xs text-zinc-650 dark:text-zinc-400 font-semibold leading-relaxed">
                  You are configured as: <strong className="text-indigo-650 dark:text-indigo-400 uppercase font-black">{payTypeLabel}</strong>.
                  <span className="block mt-1 text-[11px] text-zinc-500 dark:text-zinc-405">{payTypeDesc}</span>
                </p>
              </div>

              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-500" /> Requesting Clock Corrections
                </div>
                <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
                  If you forgot to clock out or logged a break incorrectly, navigate to the <strong>Corrections & Needs Review</strong> tab in your history. Click <strong>Request Correction</strong> on the affected session, provide the details, and submit it for supervisor review.
                </p>
              </div>
            </div>
          )
        }
      ]
    },
    my_jobs_todos: {
      title: "My Jobs & Todos Dashboard",
      description: "Learn how to access your active job tasks, update vehicle status, check off checklist items, and submit feedback.",
      category: "Technician Portal",
      quickSteps: [
        {
          title: "Review Assigned Jobs",
          description: "Select active jobs from your dashboard to view tasks, vehicles, and parts status.",
          icon: ClipboardList
        },
        {
          title: "Complete Tasks & Checklists",
          description: "Check off checklist items and submit completed flat-rate or book-time tasks.",
          icon: CheckSquare
        }
      ],
      sections: [
        {
          title: "Jobs & Task Cards",
          icon: ClipboardList,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              Your home dashboard lists all active jobs assigned to you. Click on any job card to view the vehicle details, checklist tasks, parts requested, and upload photos.
            </p>
          )
        },
        {
          title: "Todos & Checklist Items",
          icon: CheckSquare,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              The "My Todos" card displays high-priority check-off items assigned directly to you. Expand them to see checklist criteria, mark them complete, and keep supervisors updated in real-time.
            </p>
          )
        }
      ]
    },
    live_timeclock: {
      title: "Live Timeclock Monitor Guide",
      description: "Learn how to view the active shop floor roster, current task allocations, and live clock statuses.",
      category: "Management & Office",
      quickSteps: [
        {
          title: "Check Live Roster Status",
          description: "Instantly see who is clocked in, on lunch, on break, or clocked out.",
          icon: Users
        },
        {
          title: "Monitor Active Job Tasks",
          description: "See the exact job numbers and tasks currently allocated to each technician.",
          icon: Activity
        }
      ],
      sections: [
        {
          title: "Roster Board",
          icon: Users,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              This dashboard displays all registered technicians and staff. It updates instantly to show who is currently Clocked In, on Lunch, on Break, or Clocked Out, with color-coded status rings.
            </p>
          )
        },
        {
          title: "Active Task Allocation",
          icon: Activity,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              See exactly which job number and task description each technician is active on right now. Helps managers monitor bottlenecks and balance shop floor workloads.
            </p>
          )
        }
      ]
    },
    timeclock: {
      title: "Timecard & Payroll Management",
      description: "A guide for administrators to audit staff logs, adjust timestamps, verify geolocation maps, compare QuickBooks records, and export CSV reports.",
      summary: "Audit staff hours with precision: reconcile clocked timesheets against QuickBooks imports, track detailed flat-rate vs. hourly task logs with built-in efficiency metrics, resolve anomaly flags (like missing clock-outs or offsite sessions), and export final CSV payloads for payroll integration.",
      category: "Management & Office",
      quickSteps: [
        {
          title: "Audit & Reconcile Hours",
          description: "Verify clocked shifts, review anomaly flags (like extreme hours), and approve staff correction requests.",
          icon: FileSpreadsheet
        },
        {
          title: "Audit Task Payouts",
          description: "Review completed book-time vs. hourly tasks to ensure flat-rate techs are paid accurately without double-pay.",
          icon: ShieldCheck
        },
        {
          title: "Print & Sign-Off Sheets",
          description: "Generate printed timesheets with signature lines for technician and supervisor verification.",
          icon: ClipboardList
        },
        {
          title: "Compare & Export Data",
          description: "Compare variance against imported QuickBooks records and export payroll CSV summaries.",
          icon: Download
        }
      ],
      sections: [
        {
          title: "Weekly Timeclock Reconciliation",
          icon: FileSpreadsheet,
          content: (
            <div className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              <p>
                The <strong>Weekly Reconciliation</strong> dashboard allows administrators to audit timesheets before finalizing payroll. The header displays key summary statistics:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Clocked Hours:</strong> Total physical hours logged on the clock by the technician.</li>
                <li><strong>Pay Hours:</strong> The calculated hours to be paid (accounting for hourly shift rates, completed book-time tasks, and credits).</li>
                <li><strong>Book Hours:</strong> The total flat-rate hours from completed production tasks.</li>
              </ul>
            </div>
          )
        },
        {
          title: "Hourly vs. Flat-Rate Payout Logic",
          icon: ShieldCheck,
          content: (
            <div className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              <p>
                To support blended pay structures, the system distinguishes between pay types:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Hourly Staff:</strong> Paid strictly for their physical clocked time. Completed tasks are displayed for oversight and references but do not add to pay.</li>
                <li><strong>Flat-Rate Staff:</strong> Paid for physical hours clocked on <em>hourly-designated</em> tasks (e.g. training, shop maintenance) plus the allocated book hours for completed production tasks.</li>
                <li><strong>Prevention of Double-Pay:</strong> Completed tasks designated as hourly are automatically excluded from flat-rate payouts to prevent paying for them twice (once on the clock and once as a completed task).</li>
              </ul>
            </div>
          )
        },
        {
          title: "Fair Overall Efficiency Metric",
          icon: Activity,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              Technician efficiency is calculated strictly on completed flat-rate tasks: <code className="bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono">Overall Efficiency = (Completed Book Hours / Actual Clocked Hours on those tasks) × 100</code>. By excluding hourly training/shop work and active/uncompleted tasks, top technicians are not penalized for working on non-flat-rate jobs or training apprentices.
            </p>
          )
        },
        {
          title: "Anomaly Flags & Verification Links",
          icon: AlertTriangle,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              Potential anomalies—such as overnight clock-ins, extreme shift lengths (like a 27-hour day), or offsite punches—are highlighted in red or amber. Next to task names, administrators can click the <strong>shortcut external link icon</strong> to open specific task details in a new tab without losing their place on the reconciliation sheet.
            </p>
          )
        },
        {
          title: "Print Sheets & Physical Sign-Off",
          icon: ClipboardList,
          content: (
            <div className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              <p>
                Click <strong>Print Timesheets</strong> to generate physical documents for your shop. When clicked:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>The system automatically switches the dashboard view to the optimized print template.</li>
                <li>The page title is temporarily formatted (e.g. <code className="bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded text-indigo-650 dark:text-indigo-400 font-mono">Weekly_Timeclock_Reconciliation_Report_...</code>) so if you save as a PDF, the filename is generated correctly.</li>
                <li>Your browser's native print/PDF dialog opens instantly. You can print physically or save the timesheets directly as a PDF document.</li>
              </ul>
              <p className="mt-1">
                The printed timesheet includes individual employee cards with their detailed completed tasks, hourly/book classification, notes, and supervisor/technician sign-off signature slots.
              </p>
            </div>
          )
        },
        {
          title: "QuickBooks Comparison & Exports",
          icon: RefreshCw,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              Compare local UpfittersOS clocked hours side-by-side with imported QuickBooks records to calculate variances. Use <strong>Export Summary</strong> to download employee totals, or <strong>Export Detailed Logs</strong> to download raw clock-in/out segments for easy upload into payroll software.
            </p>
          )
        }
      ]
    },
    org_chart: {
      title: "Business Org Chart Guide",
      description: "Learn how the visual team hierarchy is organized and how department structures are defined.",
      category: "Management & Staff",
      quickSteps: [
        {
          title: "Interactive Hierarchy Map",
          description: "Browse the tree view of the business structure from leadership to departments.",
          icon: Users
        },
        {
          title: "View Staff Profile Details",
          description: "Click any profile card to navigate directly to their detailed staff profile page.",
          icon: UserCog
        }
      ],
      sections: [
        {
          title: "Interactive Hierarchy Map",
          icon: Users,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              The Org Chart displays a tree view of the business structure, starting from the executive leadership down to individual departments and staff members. Clicking on any profile card links directly to their detailed staff profile page.
            </p>
          )
        },
        {
          title: "Departmental Grouping",
          icon: ClipboardList,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              Staff members are grouped under their primary departments (e.g. Upfitters, Parts, Office). Inactive staff synchronized from QuickBooks are filtered out automatically, ensuring only active staff members are visible in the hierarchy.
            </p>
          )
        }
      ]
    },
    audit: {
      title: "Operational Auditing & Diagnostics",
      description: "Learn how to monitor shop floor activities, review job blockers, and inspect missing parts.",
      category: "Management & Office",
      quickSteps: [
        {
          title: "Track Shop Efficiency",
          description: "Review net clocked shift hours vs completed task book hours and overall efficiency.",
          icon: Activity
        },
        {
          title: "Resolve Active Blockers",
          description: "Inspect blocked jobs and pending parts to clear bottlenecks on the floor.",
          icon: AlertTriangle
        }
      ],
      sections: [
        {
          title: "Operational Overview Dashboard",
          icon: Activity,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              The Weekly Audit page provides a consolidated view of shop metrics: clocked shift hours, completed task book hours, vehicle movements, received shipments, and active task counts. It calculates overall shop efficiency metrics dynamically.
            </p>
          )
        },
        {
          title: "Active Blockers & Missing Parts",
          icon: AlertTriangle,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              A dedicated blocker panel lists all active jobs currently marked as blocked, along with missing parts requests that are still pending or ordered. This enables managers to quickly resolve bottlenecks.
            </p>
          )
        },
        {
          title: "Printable Reports",
          icon: FileSpreadsheet,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              Click "Print Preview" to generate clean, paper-friendly summaries of the current week's audit data or morning meeting boards, ready for Monday morning planning sessions.
            </p>
          )
        }
      ]
    },
    qb_sync_status: {
      title: "QuickBooks Sync Monitor Guide",
      description: "Learn how to monitor background sync events, trigger manual synchronizations, and validate data integrity.",
      category: "System Settings",
      quickSteps: [
        {
          title: "Monitor Sync Statuses",
          description: "Track background synchronizations for jobs, customers, items, and invoices.",
          icon: RefreshCw
        },
        {
          title: "Run Health Diagnostics",
          description: "Validate data health and identify anomalies or negative inventory counts.",
          icon: AlertCircle
        }
      ],
      sections: [
        {
          title: "Real-time Synchronization Monitoring",
          icon: RefreshCw,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-405 font-semibold leading-relaxed">
              Track background synchronizations for jobs, customers, items, invoices, and purchase orders. The page displays success rates, document modification limits, and active sync indicators.
            </p>
          )
        },
        {
          title: "Data Validation & Health Reports",
          icon: AlertCircle,
          content: (
            <p className="text-xs text-zinc-500 dark:text-zinc-405 font-semibold leading-relaxed">
              Access health checks that highlight anomalies like negative inventory levels, inactive staff profiles, or missing cross-references, helping maintain sync accuracy between QuickBooks and UpfittersOS.
            </p>
          )
        }
      ]
    },
    jobs_worksheet: {
      title: "Jobs Worksheet Guide",
      description: "Learn how to manage job tickets, update statuses, track active tasks, and assign technicians.",
      category: "Upfitters & Operations",
      quickSteps: [
        {
          title: "Filter & Manage Jobs",
          description: "Search jobs by number, customer, or VIN, and filter by shop floor status.",
          icon: FileSpreadsheet
        },
        {
          title: "Allocate Labor Tasks",
          description: "Expand job rows to schedule tasks, set book hours, and assign technicians.",
          icon: ClipboardList
        }
      ],
      sections: [
        {
          title: "Job Tracking Grid",
          icon: FileSpreadsheet,
          content: (
            <p className="text-xs text-zinc-505 dark:text-zinc-400 font-semibold leading-relaxed">
              The Jobs Worksheet displays a comprehensive list of all vehicle jobs. Filter by status (e.g. Inbound, Active, QA, Completed), search by job number, customer name, or VIN, and inspect job metrics.
            </p>
          )
        },
        {
          title: "Task & Labor Scheduling",
          icon: ClipboardList,
          content: (
            <p className="text-xs text-zinc-505 dark:text-zinc-400 font-semibold leading-relaxed">
              Expand any job row to view individual tasks, book hours, and assigned technicians. You can clock technicians in/out of tasks directly, adjust hours, or edit task specifications.
            </p>
          )
        }
      ]
    },
    job_schedule: {
      title: "Schedule Board Guide",
      description: "Learn how to plan jobs on the calendar timeline, assign dates, and monitor deadlines.",
      category: "Upfitters & Operations",
      quickSteps: [
        {
          title: "Visual Capacity Planning",
          description: "Use the drag-and-drop Gantt timeline to schedule jobs on specific calendar dates.",
          icon: Calendar
        }
      ],
      sections: [
        {
          title: "Calendar Planning View",
          icon: Calendar,
          content: (
            <p className="text-xs text-zinc-505 dark:text-zinc-400 font-semibold leading-relaxed">
              The Schedule Board provides a drag-and-drop calendar/Gantt timeline. Schedule jobs by dragging cards onto specific calendar dates, adjust durations, and visually manage shop capacity.
            </p>
          )
        }
      ]
    },
    staff_worksheet: {
      title: "Staff Worksheet Guide",
      description: "Review daily technician allocations, clocked shifts, and productivity ratios.",
      category: "Upfitters & Operations",
      quickSteps: [
        {
          title: "Technician Calendars",
          description: "Inspect each technician's daily allocations side-by-side with clocked shift hours.",
          icon: Users
        }
      ],
      sections: [
        {
          title: "Roster Productivity Board",
          icon: Users,
          content: (
            <p className="text-xs text-zinc-505 dark:text-zinc-400 font-semibold leading-relaxed">
              The Staff Worksheet displays each technician's daily calendar side-by-side with their clocked shift times, active jobs, and computed book-time efficiency ratios.
            </p>
          )
        }
      ]
    },
    bay_worksheet: {
      title: "Bay Worksheet Guide",
      description: "Manage physical bay assignments, vehicle slots, and active crew allocations.",
      category: "Upfitters & Operations",
      quickSteps: [
        {
          title: "Physical Bay Allocation",
          description: "Map vehicle slots and crew assignments to physical shop bays.",
          icon: Warehouse
        }
      ],
      sections: [
        {
          title: "Bay Roster & Crew Mapping",
          icon: Warehouse,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              The Bay Worksheet maps out your physical shop bays. Assign vehicles to bays, allocate crew members to bays, and monitor live bay occupancy states.
            </p>
          )
        }
      ]
    },
    morning_meeting: {
      title: "Morning Meeting Board Guide",
      description: "Run productive daily huddles with a consolidated review dashboard.",
      category: "Upfitters & Operations",
      quickSteps: [
        {
          title: "Review Shop Capacity",
          description: "Use the TV huddle board to check blockers, parts, schedules, and active bay slots.",
          icon: Monitor
        }
      ],
      sections: [
        {
          title: "Daily Huddle Screen",
          icon: Monitor,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              The Morning Meeting board consolidates daily metrics: active blockers, missing parts requests, jobs scheduled for the day, and bay occupancy. Designed for display on a shop TV monitor.
            </p>
          )
        }
      ]
    },
    staff: {
      title: "Staff Directory Guide",
      description: "Manage employee files, department allocations, scheduling, and pay settings.",
      category: "System Settings",
      quickSteps: [
        {
          title: "Manage Employee Files",
          description: "Invite new staff, link Auth accounts, and configure permissions.",
          icon: UserCog
        },
        {
          title: "Configure Pay Settings",
          description: "Assign custom hourly/flat-rate/salary pay bases and schedules.",
          icon: Clock
        }
      ],
      sections: [
        {
          title: "Directory Management",
          icon: UserCog,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              Add new staff members, link their Firebase Auth accounts, set department associations, and manage in-house tech numbers.
            </p>
          )
        },
        {
          title: "Custom Pay Rates & Schedules",
          icon: Clock,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              Configure custom pay types (Hourly, Flat-Rate, Salary), assign pay rates, manage managers, backup contacts, spending authority, and set custom shift schedules.
            </p>
          )
        }
      ]
    },
    departments: {
      title: "Departments Config Guide",
      description: "Create and configure business departments, default permissions, and roles.",
      category: "System Settings",
      quickSteps: [
        {
          title: "Manage Roles & Defaults",
          description: "Define default hourly rates, pay basis, permissions, and budgets by department.",
          icon: Building2
        }
      ],
      sections: [
        {
          title: "Department Profiles & Defaults",
          icon: Building2,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              Define default settings for each department: default hourly rates, default pay basis (hourly vs flat-rate), default manager, backup contacts, and default purchasing budgets.
            </p>
          )
        }
      ]
    },
    settings: {
      title: "System Settings Guide",
      description: "Configure business identities, logo upload, geofencing boundary, notifications, and integrations.",
      category: "System Settings",
      quickSteps: [
        {
          title: "Company Identity & Radiuses",
          description: "Set business name, address, upload branding logo, and configure geofence radius.",
          icon: Settings
        },
        {
          title: "Notifications & Integrations",
          description: "Enable global event alerts and connect third-party APIs.",
          icon: BellRing
        }
      ],
      sections: [
        {
          title: "Identity & Physical Gating",
          icon: Settings,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              Set company name, address, upload a logo, configure geofencing GPS coordinates, and set location gating requirements for clock-ins.
            </p>
          )
        },
        {
          title: "Automated Notifications & APIs",
          icon: BellRing,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed">
              Configure global alerts (stale bays, blockers, parts requests, QA ready) and add API keys for integrations like CompanyCam and EasyPost.
            </p>
          )
        }
      ]
    },
    qr_hub: {
      title: "QR Label Hub Guide",
      description: "Generate and print tracking barcode stickers for vehicles, bays, and staff.",
      category: "Management & Office",
      quickSteps: [
        {
          title: "Generate Barcode Stickers",
          description: "Print physical QR tags for shop vehicles, bays, and technician profiles.",
          icon: QrCode
        },
        {
          title: "Track Scan Telemetry",
          description: "Audit scan activity locations and times to evaluate shop workflow coverage.",
          icon: Activity
        }
      ],
      sections: [
        {
          title: "Sticker Printing & Scanning",
          icon: QrCode,
          content: (
            <p className="text-xs text-zinc-550 dark:text-zinc-405 font-semibold leading-relaxed">
              Generate printable QR code stickers for vehicles, bays, and staff. Scans by mobile devices immediately pull up the corresponding job card, checklist, or profile page, and log scan telemetry.
            </p>
          )
        }
      ]
    },
    help_system: {
      title: "Help Center Guide",
      description: "Learn how the help system ensures data accuracy, and how to utilize our documentation to understand and troubleshoot workflows.",
      category: "System Documentation",
      quickSteps: [
        {
          title: "Access Contextual Help",
          description: "Click any menu 'i' icon to open a quick guide for the active page.",
          icon: HelpCircle
        },
        {
          title: "Read Detailed Manuals",
          description: "Navigate to the Help Center to browse structured slide-decks and configs.",
          icon: GraduationCap
        }
      ],
      sections: [
        {
          title: "1. The Value of the Help Button",
          icon: HelpCircle,
          content: (
            <div className="space-y-3">
              <p>
                The <strong>Help Button ("i" icon)</strong> located next to menu items throughout UpfittersOS is designed to prevent operational confusion by providing immediate, context-sensitive documentation.
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-zinc-650 dark:text-zinc-400 font-semibold leading-relaxed">
                <li><strong>No Page Context Swapping:</strong> Get quick breakdowns of current page features in a popup modal without losing your place.</li>
                <li><strong>One-Click Deep Dive:</strong> Click <em>Read Full Tutorial</em> in the modal to load full-blown interactive documentation on the Help page.</li>
                <li><strong>Single Source of Truth:</strong> Centralizing documentation here guarantees all team members reference the exact same standards.</li>
              </ul>
            </div>
          )
        },
        {
          title: "2. Real-Time Settings Accuracy",
          icon: ShieldCheck,
          content: (
            <div className="space-y-3">
              <p>
                Unlike static employee handbooks, the help system evaluates the database in real-time to show instructions tailored to the shop's active configurations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] text-zinc-450 font-bold uppercase tracking-wider block">Physical Policies</span>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold mt-1">
                    Shows whether Rest/Lunch breaks are paid, and maps exact geofencing radiuses and street addresses.
                  </p>
                </div>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] text-zinc-450 font-bold uppercase tracking-wider block">Access Controls</span>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold mt-1">
                    Gathers settings like QR verification requirements and displays personalized pay tracking cards.
                  </p>
                </div>
              </div>
            </div>
          )
        }
      ]
    }
  };
};

export const TUTORIALS_DATA = getTutorialsData(null, null, {});
