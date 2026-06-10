import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Upload, AlertTriangle, X, Clock, 
  Search, FileText, ChevronDown, ChevronUp, AlertCircle, 
  Calendar, User, Download, Info, Printer
} from 'lucide-react';
import { toast } from 'sonner';

interface TSheetsComparisonProps {
  tenantId: string;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  payType?: string;
  clockIn: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  clockOut?: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  breaks: Array<{
    type: 'lunch' | 'normal';
    start: any;
    end?: any;
    isPaid: boolean;
  }>;
  jobs?: Array<{
    id: string;
    name: string;
    start: any;
    end?: any;
    taskId?: string | null;
    taskName?: string | null;
    bookTime?: number;
    notes?: string;
  }>;
  status: string;
  verificationStatus?: string;
  notes?: string;
  staffNote?: string;
}

// Simple and robust CSV parser
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let entry = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        entry += '"';
        i++; // skip next char
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(entry);
      entry = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(entry);
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [];
      entry = '';
    } else {
      entry += char;
    }
  }
  
  if (entry || row.length > 0) {
    row.push(entry);
    result.push(row);
  }
  
  return result;
}

const parseCSVDateTime = (str: string): Date | null => {
  if (!str) return null;
  const cleaned = str.replace(/"/g, '').trim();
  if (!cleaned) return null;
  
  // Format check: YYYY-MM-DD HH:MM:SS
  const parts = cleaned.split(' ');
  if (parts.length < 2) return null;
  
  const [datePart, timePart] = parts;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return null;
  }
  
  return new Date(year, month - 1, day, hours, minutes, seconds || 0);
};

const formatTime = (date: Date | null): string => {
  if (!date) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDate = (dateStr: string): string => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export function TSheetsComparison({ tenantId }: TSheetsComparisonProps) {
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'discrepancy' | 'unmapped'>('all');
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  // Fetch active staff list
  const { data: staffList } = useQuery({
    queryKey: ['admin-staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && !s.fireDate);
    }
  });

  // Parse headers and detect date range
  const { headerMapping, dateRange, uniqueCsvEmployees } = useMemo(() => {
    if (csvRows.length < 2) {
      return { headerMapping: null, dateRange: null, uniqueCsvEmployees: [] };
    }
    
    const headers = csvRows[0].map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const mapping = {
      username: headers.indexOf('username'),
      payrollId: headers.indexOf('payroll_id'),
      fname: headers.indexOf('fname'),
      lname: headers.indexOf('lname'),
      localDate: headers.indexOf('local_date'),
      localStartTime: headers.indexOf('local_start_time'),
      localEndTime: headers.indexOf('local_end_time'),
      hours: headers.indexOf('hours'),
      jobcode1: headers.indexOf('jobcode_1'),
      jobcode2: headers.indexOf('jobcode_2'),
      serviceItem: headers.indexOf('service item'),
      notes: headers.indexOf('notes'),
      approvedStatus: headers.indexOf('approved_status'),
      hasFlags: headers.indexOf('has_flags'),
      flagTypes: headers.indexOf('flag_types'),
    };

    // Find min and max dates
    let minDateStr = '';
    let maxDateStr = '';
    const employeesSet = new Set<string>();

    for (let i = 1; i < csvRows.length; i++) {
      const row = csvRows[i];
      if (row.length < Math.max(mapping.fname, mapping.lname, mapping.localDate)) continue;
      
      const dateVal = row[mapping.localDate]?.replace(/"/g, '').trim();
      const fname = row[mapping.fname]?.replace(/"/g, '').trim();
      const lname = row[mapping.lname]?.replace(/"/g, '').trim();
      
      if (fname && lname) {
        employeesSet.add(`${fname} ${lname}`);
      }

      if (dateVal) {
        if (!minDateStr || dateVal < minDateStr) minDateStr = dateVal;
        if (!maxDateStr || dateVal > maxDateStr) maxDateStr = dateVal;
      }
    }

    let start: Date | null = null;
    let end: Date | null = null;

    if (minDateStr) {
      const [y, m, d] = minDateStr.split('-').map(Number);
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    if (maxDateStr) {
      const [y, m, d] = maxDateStr.split('-').map(Number);
      end = new Date(y, m - 1, d, 23, 59, 59, 999);
    }

    return {
      headerMapping: mapping,
      dateRange: start && end ? { start, end, minDateStr, maxDateStr } : null,
      uniqueCsvEmployees: Array.from(employeesSet).sort()
    };
  }, [csvRows]);

  // Fetch Upfitters OS sessions for the date range
  const { data: dbSessions, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['tsheets-compare-sessions', tenantId, dateRange?.start.getTime(), dateRange?.end.getTime()],
    queryFn: async () => {
      if (!dateRange) return [];
      
      // Request with 1-day timezone buffer on either side
      const queryStart = new Date(dateRange.start.getTime() - 24 * 60 * 60 * 1000);
      const queryEnd = new Date(dateRange.end.getTime() + 24 * 60 * 60 * 1000);

      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('clockIn.timestamp', '>=', queryStart),
        where('clockIn.timestamp', '<=', queryEnd)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
    },
    enabled: !!dateRange
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        await processFile(file);
      } else {
        toast.error("Please upload a valid CSV file");
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        try {
          const parsed = parseCSV(text);
          if (parsed.length < 2) {
            toast.error("The CSV file seems to be empty or formatted incorrectly.");
            return;
          }
          setCsvRows(parsed);
          setCsvFile(file);
          toast.success("CSV file uploaded and parsed successfully!");
        } catch (err) {
          console.error(err);
          toast.error("Failed to parse CSV file");
        }
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    setCsvFile(null);
    setCsvRows([]);
    setManualMappings({});
    setExpandedEmployeeId(null);
    setExpandedDates({});
  };

  // Compile comparison data
  const comparisonData = useMemo(() => {
    if (!dateRange || !headerMapping || csvRows.length < 2) return [];

    const map: Record<string, {
      csvName: string;
      staffId: string | null;
      staffName: string;
      totalTSheetsHours: number;
      totalNativeHours: number;
      dailyData: Record<string, {
        dateStr: string;
        tsheets: {
          hours: number;
          lunchHours: number;
          startTime: Date | null;
          endTime: Date | null;
          segments: any[];
        };
        native: {
          hours: number;
          lunchHours: number;
          startTime: Date | null;
          endTime: Date | null;
          segments: any[];
        };
      }>;
    }> = {};

    // Helper: Map CSV Name to Staff ID
    const getResolvedStaff = (csvName: string) => {
      if (manualMappings[csvName]) {
        const staff = staffList?.find(s => s.id === manualMappings[csvName]);
        return {
          id: manualMappings[csvName],
          name: staff ? `${staff.firstName} ${staff.lastName}`.trim() : csvName
        };
      }

      const match = staffList?.find(s => {
        const sysName = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
        return sysName === csvName.toLowerCase();
      });

      return {
        id: match?.id || null,
        name: match ? `${match.firstName} ${match.lastName}`.trim() : csvName
      };
    };

    // 1. Process TSheets CSV Rows
    for (let i = 1; i < csvRows.length; i++) {
      const row = csvRows[i];
      if (row.length < Math.max(headerMapping.fname, headerMapping.lname, headerMapping.localDate)) continue;

      const fname = row[headerMapping.fname]?.replace(/"/g, '').trim();
      const lname = row[headerMapping.lname]?.replace(/"/g, '').trim();
      const csvName = `${fname} ${lname}`;
      const dateStr = row[headerMapping.localDate]?.replace(/"/g, '').trim();
      
      if (!fname || !lname || !dateStr) continue;

      const { id: resolvedId, name: resolvedName } = getResolvedStaff(csvName);
      const key = csvName; // Group by CSV name to keep employees separate

      if (!map[key]) {
        map[key] = {
          csvName,
          staffId: resolvedId,
          staffName: resolvedName,
          totalTSheetsHours: 0,
          totalNativeHours: 0,
          dailyData: {}
        };
      }

      if (!map[key].dailyData[dateStr]) {
        map[key].dailyData[dateStr] = {
          dateStr,
          tsheets: { hours: 0, lunchHours: 0, startTime: null, endTime: null, segments: [] },
          native: { hours: 0, lunchHours: 0, startTime: null, endTime: null, segments: [] }
        };
      }

      const daily = map[key].dailyData[dateStr].tsheets;
      const jobcode1 = row[headerMapping.jobcode1]?.replace(/"/g, '').trim() || '';
      const jobcode2 = row[headerMapping.jobcode2]?.replace(/"/g, '').trim() || '';
      const serviceItem = row[headerMapping.serviceItem]?.replace(/"/g, '').trim() || '';
      const hours = parseFloat(row[headerMapping.hours]?.replace(/"/g, '')) || 0;
      const startTime = parseCSVDateTime(row[headerMapping.localStartTime]);
      const endTime = parseCSVDateTime(row[headerMapping.localEndTime]);
      const notes = row[headerMapping.notes]?.replace(/"/g, '').trim() || '';
      const approved = row[headerMapping.approvedStatus]?.replace(/"/g, '').trim() || '';
      const flagTypes = row[headerMapping.flagTypes]?.replace(/"/g, '').trim() || '';

      if (jobcode1 === 'Lunch Break') {
        daily.lunchHours += hours;
      } else {
        daily.hours += hours;
        map[key].totalTSheetsHours += hours;
      }

      if (startTime && (!daily.startTime || startTime < daily.startTime)) {
        daily.startTime = startTime;
      }
      if (endTime && (!daily.endTime || endTime > daily.endTime)) {
        daily.endTime = endTime;
      }

      daily.segments.push({
        jobcode1,
        jobcode2,
        serviceItem,
        hours,
        startTime,
        endTime,
        notes,
        approved,
        flagTypes
      });
    }

    // 2. Process Native Upfitters OS sessions for the mapped employees
    if (dbSessions && dbSessions.length > 0) {
      dbSessions.forEach((sess: TimeSession) => {
        const userId = sess.userId;
        if (!userId) return;

        // Find the staff member from the staffList by checking both s.id and s.userId
        const staff = staffList?.find(s => s.id === userId || s.userId === userId);
        if (!staff) return; // If we don't have this staff member, we can't map them

        // Find the map key (csvName) that maps to this staff member
        // 1. Check if there is an exact auto-match with the CSV employee name
        const sysName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim().toLowerCase();
        let mapKey = uniqueCsvEmployees.find(name => name.toLowerCase() === sysName);

        // 2. If no auto-match, check if there is a manual mapping to this staff.id
        if (!mapKey) {
          mapKey = Object.keys(manualMappings).find(k => manualMappings[k] === staff.id);
        }

        // 3. If still not found, it means this staff member has native sessions but is not in the CSV.
        // We initialize a new entry in map using their system name as the key.
        if (!mapKey) {
          const formattedSysName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim();
          mapKey = formattedSysName;
          
          if (!map[mapKey]) {
            map[mapKey] = {
              csvName: formattedSysName,
              staffId: staff.id,
              staffName: formattedSysName,
              totalTSheetsHours: 0,
              totalNativeHours: 0,
              dailyData: {}
            };
          }
        }

        const clockInDate = sess.clockIn.timestamp?.toDate ? sess.clockIn.timestamp.toDate() : new Date(sess.clockIn.timestamp);
        // Date format: YYYY-MM-DD
        const y = clockInDate.getFullYear();
        const m = String(clockInDate.getMonth() + 1).padStart(2, '0');
        const d = String(clockInDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        // Ensure dateStr falls within CSV range
        if (dateStr < dateRange.minDateStr || dateStr > dateRange.maxDateStr) return;

        if (!map[mapKey].dailyData[dateStr]) {
          map[mapKey].dailyData[dateStr] = {
            dateStr,
            tsheets: { hours: 0, lunchHours: 0, startTime: null, endTime: null, segments: [] },
            native: { hours: 0, lunchHours: 0, startTime: null, endTime: null, segments: [] }
          };
        }

        const daily = map[mapKey].dailyData[dateStr].native;
        const clockOutDate = sess.clockOut?.timestamp 
          ? (sess.clockOut.timestamp.toDate ? sess.clockOut.timestamp.toDate() : new Date(sess.clockOut.timestamp))
          : null;

        const totalMs = clockOutDate ? clockOutDate.getTime() - clockInDate.getTime() : 0;
        const breakMs = (sess.breaks || []).reduce((acc: number, b: any) => {
          const start = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
          const end = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : Date.now();
          return acc + (end - start);
        }, 0);
        
        const workMs = Math.max(0, totalMs - breakMs);
        const hours = workMs / 3600000;
        const breakHrs = breakMs / 3600000;

        daily.hours += hours;
        daily.lunchHours += breakHrs;
        map[mapKey].totalNativeHours += hours;

        if (clockInDate && (!daily.startTime || clockInDate < daily.startTime)) {
          daily.startTime = clockInDate;
        }
        if (clockOutDate && (!daily.endTime || clockOutDate > daily.endTime)) {
          daily.endTime = clockOutDate;
        }

        // Add segment details
        // Include overall session
        daily.segments.push({
          type: 'session_root',
          name: 'Time Clock Shift',
          startTime: clockInDate,
          endTime: clockOutDate,
          hours,
          notes: sess.notes || ''
        });

        // Add break segments
        (sess.breaks || []).forEach(b => {
          const start = b.start?.toDate ? b.start.toDate() : new Date(b.start);
          const end = b.end ? (b.end.toDate ? b.end.toDate() : new Date(b.end)) : null;
          const duration = end ? (end.getTime() - start.getTime()) / 3600000 : 0;
          daily.segments.push({
            type: 'break',
            name: `${b.type === 'lunch' ? 'Lunch' : 'Rest'} Break`,
            startTime: start,
            endTime: end,
            hours: duration,
            notes: ''
          });
        });

        // Add job segments
        (sess.jobs || []).forEach(j => {
          const start = j.start?.toDate ? j.start.toDate() : new Date(j.start);
          const end = j.end ? (j.end.toDate ? j.end.toDate() : new Date(j.end)) : null;
          const duration = end ? (end.getTime() - start.getTime()) / 3600000 : 0;
          daily.segments.push({
            type: 'job',
            name: j.name,
            taskName: j.taskName || 'Labor',
            startTime: start,
            endTime: end,
            hours: duration,
            notes: j.notes || ''
          });
        });
      });
    }

    // Convert Record to Array and sort
    return Object.values(map)
      .map(emp => {
        // Daily list sorted chronologically
        const dailyList = Object.values(emp.dailyData).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
        
        let employeeDiscrepancies = 0;
        dailyList.forEach(day => {
          const hoursDiff = Math.abs(day.tsheets.hours - day.native.hours);
          const lunchDiff = Math.abs(day.tsheets.lunchHours - day.native.lunchHours);
          const inDiff = day.tsheets.startTime && day.native.startTime
            ? Math.abs(day.tsheets.startTime.getTime() - day.native.startTime.getTime()) / 60000
            : 0;
          const outDiff = day.tsheets.endTime && day.native.endTime
            ? Math.abs(day.tsheets.endTime.getTime() - day.native.endTime.getTime()) / 60000
            : 0;

          const hasIssue = hoursDiff > 0.05 || lunchDiff > 0.05 || inDiff > 5 || outDiff > 5 || 
            (day.tsheets.hours > 0 && day.native.hours === 0) ||
            (day.native.hours > 0 && day.tsheets.hours === 0);

          if (hasIssue) {
            employeeDiscrepancies++;
          }
        });

        const totalHoursDiff = Math.abs(emp.totalTSheetsHours - emp.totalNativeHours);
        const hasOverallDiscrepancy = employeeDiscrepancies > 0 || totalHoursDiff > 0.05 || !emp.staffId;

        return {
          ...emp,
          dailyList,
          discrepancyCount: employeeDiscrepancies,
          hasDiscrepancy: hasOverallDiscrepancy
        };
      })
      .sort((a, b) => {
        // Unmapped employees at the top
        if (!a.staffId && b.staffId) return -1;
        if (a.staffId && !b.staffId) return 1;
        return a.staffName.localeCompare(b.staffName);
      });
  }, [csvRows, headerMapping, dateRange, dbSessions, staffList, manualMappings, uniqueCsvEmployees]);

  // Overall Totals
  const summaryTotals = useMemo(() => {
    let tsheetsSum = 0;
    let nativeSum = 0;
    let totalDiscrepancies = 0;
    let unmappedCount = 0;

    comparisonData.forEach(emp => {
      tsheetsSum += emp.totalTSheetsHours;
      nativeSum += emp.totalNativeHours;
      totalDiscrepancies += emp.discrepancyCount;
      if (!emp.staffId) unmappedCount++;
    });

    return {
      tsheetsHours: tsheetsSum,
      nativeHours: nativeSum,
      variance: nativeSum - tsheetsSum,
      discrepancyDays: totalDiscrepancies,
      unmappedStaff: unmappedCount
    };
  }, [comparisonData]);

  // Handle Export Comparison results to CSV
  const handleExportComparisonReport = () => {
    try {
      const headers = [
        'Staff Member',
        'Date',
        'TSheets Work Hours',
        'Upfitters OS Work Hours',
        'Variance (Hours)',
        'TSheets Clock In',
        'Upfitters OS Clock In',
        'TSheets Clock Out',
        'Upfitters OS Clock Out',
        'TSheets Lunch Hours',
        'Upfitters OS Lunch Hours'
      ];

      const rows: string[][] = [];

      comparisonData.forEach(emp => {
        emp.dailyList.forEach(day => {
          const varHrs = day.native.hours - day.tsheets.hours;
          rows.push([
            `"${emp.staffName}"`,
            day.dateStr,
            day.tsheets.hours.toFixed(2),
            day.native.hours.toFixed(2),
            varHrs.toFixed(2),
            day.tsheets.startTime ? formatTime(day.tsheets.startTime) : '—',
            day.native.startTime ? formatTime(day.native.startTime) : '—',
            day.tsheets.endTime ? formatTime(day.tsheets.endTime) : '—',
            day.native.endTime ? formatTime(day.native.endTime) : '—',
            day.tsheets.lunchHours.toFixed(2),
            day.native.lunchHours.toFixed(2)
          ]);
        });
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `tsheets_vs_upfitters_comparison_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Comparison report exported');
    } catch (e) {
      toast.error('Failed to export comparison report');
      console.error(e);
    }
  };

  const handleManualMapChange = (csvName: string, staffId: string) => {
    setManualMappings(prev => {
      const next = { ...prev };
      if (!staffId) {
        delete next[csvName];
      } else {
        next[csvName] = staffId;
      }
      return next;
    });
    toast.success(staffId ? `Mapped "${csvName}" manually` : `Cleared mapping for "${csvName}"`);
  };

  const toggleDateExpanded = (empId: string, dateStr: string) => {
    const key = `${empId}-${dateStr}`;
    setExpandedDates(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Filter comparison data
  const filteredData = comparisonData.filter(emp => {
    const matchesSearch = emp.staffName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.csvName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterType === 'discrepancy') {
      return emp.hasDiscrepancy;
    } else if (filterType === 'unmapped') {
      return !emp.staffId;
    }
    return true;
  });

  if (!csvFile) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            TSheets Timesheet Upload
          </h3>
          <p className="text-sm text-zinc-555 mb-6">
            Upload a weekly or daily CSV export from TSheets to compare clock-in times and total hours.
          </p>

          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
              dragActive 
                ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-500/5' 
                : 'border-zinc-300 dark:border-zinc-800 hover:border-indigo-500 bg-zinc-50/50 dark:bg-zinc-900/50'
            }`}
            onClick={() => document.getElementById('file-upload-input')?.click()}
          >
            <input 
              id="file-upload-input"
              type="file" 
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-950/40 rounded-full flex items-center justify-center mb-4 text-indigo-500">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-zinc-850 dark:text-white">
              Drag and drop your TSheets CSV file here, or click to browse
            </p>
            <p className="text-xs text-zinc-500 mt-1.5">
              Only CSV files containing standard TSheets export columns are supported
            </p>
          </div>
        </div>
      </div>
    );
  }

  const printStyleBlock = (
    <style dangerouslySetInnerHTML={{__html: `
      @media print {
        @page {
          size: portrait;
          margin: 0.3in;
        }
        /* Hide all default screen containers and sidebars */
        #root > div > div:first-child,
        #root > div > div > header,
        .no-print,
        .print-hidden,
        button,
        input,
        select {
          display: none !important;
        }
        body, html, #root, #root > div, main {
          background: white !important;
          color: #000000 !important;
          height: auto !important;
          overflow: visible !important;
          max-height: none !important;
        }
        * {
          color: #000000 !important;
          border-color: #a1a1aa !important;
        }
        .print-page-break {
          page-break-before: always !important;
          break-before: page !important;
        }
      }
    `}} />
  );

  return (
    <>
      {printStyleBlock}
      <div className="space-y-6 animate-in fade-in duration-350 print:hidden">
      {/* Upload Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-zinc-900 dark:text-white truncate max-w-[200px] md:max-w-xs">{csvFile.name}</span>
              <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-extrabold px-2 py-0.5 rounded uppercase">
                TSheets CSV
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Date Range Detected: <span className="font-bold font-mono">{dateRange ? `${dateRange.minDateStr} to ${dateRange.maxDateStr}` : 'Unknown'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold transition-all cursor-pointer no-print shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
          <button
            onClick={handleExportComparisonReport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/10 no-print"
          >
            <Download className="w-3.5 h-3.5" /> Export Comparison
          </button>
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer no-print"
          >
            <X className="w-3.5 h-3.5" /> Upload Another
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">TSheets Total Hours</span>
          <p className="text-xl font-mono font-black text-zinc-850 dark:text-white">
            {summaryTotals.tsheetsHours.toFixed(2)}h
          </p>
          <p className="text-[10px] text-zinc-450 mt-0.5">Sum of all work hours in CSV</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Upfitters OS Hours</span>
          <p className="text-xl font-mono font-black text-zinc-850 dark:text-white">
            {isLoadingSessions ? 'Loading...' : `${summaryTotals.nativeHours.toFixed(2)}h`}
          </p>
          <p className="text-[10px] text-zinc-450 mt-0.5">Sum of system work hours</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Total Hours Variance</span>
          <p className={`text-xl font-mono font-black ${
            Math.abs(summaryTotals.variance) <= 0.05 
              ? 'text-emerald-500' 
              : 'text-rose-500'
          }`}>
            {summaryTotals.variance >= 0 ? '+' : ''}{summaryTotals.variance.toFixed(2)}h
          </p>
          <p className="text-[10px] text-zinc-450 mt-0.5">Clocked OS vs TSheets</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block font-sans">Flagged Discrepancy Days</span>
          <p className={`text-xl font-black ${
            summaryTotals.discrepancyDays > 0 ? 'text-amber-500 animate-pulse' : 'text-emerald-500'
          }`}>
            {summaryTotals.discrepancyDays}
          </p>
          <p className="text-[10px] text-zinc-450 mt-0.5">Days with clock-in/out differences</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block font-sans">Unmapped Staff</span>
          <p className={`text-xl font-black ${
            summaryTotals.unmappedStaff > 0 ? 'text-rose-500 animate-bounce' : 'text-emerald-500'
          }`}>
            {summaryTotals.unmappedStaff}
          </p>
          <p className="text-[10px] text-zinc-450 mt-0.5">CSV staff not found in OS roster</p>
        </div>
      </div>

      {/* Filter and search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search staff name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm"
          />
        </div>
        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          {(['all', 'discrepancy', 'unmapped'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterType === type 
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-350'
              }`}
            >
              {type === 'all' && 'All Staff'}
              {type === 'discrepancy' && 'Discrepancies Only'}
              {type === 'unmapped' && 'Unmapped Staff'}
            </button>
          ))}
        </div>
      </div>

      {/* Roster & Matching mapping assistant */}
      {summaryTotals.unmappedStaff > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">Unmapped Employees Detected</h4>
              <p className="text-xs text-zinc-500 mt-0.5">
                Some employees in the TSheets CSV cannot be automatically matched with the Upfitters OS roster. Map them below to load their comparison metrics.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {comparisonData
              .filter(emp => !emp.staffId)
              .map(emp => (
                <div key={emp.csvName} className="flex items-center justify-between gap-4 bg-white dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-400" /> {emp.csvName}
                  </span>
                  <select
                    className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-750 p-1.5 rounded-lg text-zinc-700 dark:text-zinc-300 outline-none max-w-[150px] md:max-w-[200px]"
                    onChange={(e) => handleManualMapChange(emp.csvName, e.target.value)}
                    value=""
                  >
                    <option value="" disabled>Select active staff...</option>
                    {staffList?.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Comparison listing */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoadingSessions ? (
          <div className="p-12 text-center text-zinc-500">
            <Clock className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-4" />
            Loading and reconciling system sessions...
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 italic">No matching records found.</div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredData.map((emp) => {
              const isExpanded = expandedEmployeeId === emp.csvName;
              const hasNoMap = !emp.staffId;

              return (
                <div key={emp.csvName} className="flex flex-col">
                  {/* Employee Summary Row */}
                  <div 
                    onClick={() => setExpandedEmployeeId(isExpanded ? null : emp.csvName)}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 cursor-pointer transition-colors select-none group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm shrink-0">
                        {emp.staffName[0] || 'U'}
                      </div>
                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                          {emp.staffName}
                        </h4>
                        <p className="text-[10px] text-zinc-450 font-mono mt-0.5">
                          {hasNoMap ? '⚠️ UNMAPPED TSHEETS USER' : `System ID: ${emp.staffId?.slice(0, 8)}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 justify-between md:justify-end">
                      <div className="grid grid-cols-3 gap-6 text-right">
                        <div>
                          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">TSheets</span>
                          <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-350">{emp.totalTSheetsHours.toFixed(2)}h</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Upfitters OS</span>
                          <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-350">{emp.totalNativeHours.toFixed(2)}h</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Variance</span>
                          <span className={`text-xs font-mono font-black ${
                            Math.abs(emp.totalTSheetsHours - emp.totalNativeHours) <= 0.05 
                              ? 'text-emerald-500' 
                              : 'text-rose-500'
                          }`}>
                            {(emp.totalNativeHours - emp.totalTSheetsHours) >= 0 ? '+' : ''}
                            {(emp.totalNativeHours - emp.totalTSheetsHours).toFixed(2)}h
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {emp.hasDiscrepancy && (
                          <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 rounded border border-amber-500/20 uppercase">
                            Discrepancy
                          </span>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Employee Detail Breakdown */}
                  {isExpanded && (
                    <div className="bg-zinc-50/50 dark:bg-zinc-900/40 p-6 border-t border-zinc-200 dark:border-zinc-800 space-y-6">
                      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h5 className="font-bold text-sm text-zinc-850 dark:text-zinc-200 flex items-center gap-1.5">
                          <Info className="w-4 h-4 text-indigo-500" /> Reconciled Log for {emp.csvName}
                        </h5>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">Mapped to:</span>
                          <select
                            className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1.5 rounded-lg text-zinc-700 dark:text-zinc-300 outline-none min-w-[150px]"
                            onChange={(e) => handleManualMapChange(emp.csvName, e.target.value)}
                            value={emp.staffId || ""}
                          >
                            <option value="">Unmapped / System Name</option>
                            {staffList?.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.firstName} {s.lastName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {emp.dailyList.map((day) => {
                        const dayKey = `${emp.csvName}-${day.dateStr}`;
                        const isDayExpanded = !!expandedDates[dayKey];
                        const hoursDiff = day.native.hours - day.tsheets.hours;
                        const hasDayDiscrepancy = Math.abs(hoursDiff) > 0.05 || 
                          (day.tsheets.hours > 0 && day.native.hours === 0) ||
                          (day.native.hours > 0 && day.tsheets.hours === 0);

                        return (
                          <div key={day.dateStr} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                            {/* Day Header Summary */}
                            <div 
                              onClick={() => toggleDateExpanded(emp.csvName, day.dateStr)}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors select-none"
                            >
                              <div className="flex items-center gap-3">
                                <Calendar className="w-4 h-4 text-zinc-400" />
                                <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{formatDate(day.dateStr)}</span>
                                {hasDayDiscrepancy && (
                                  <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                    Discrepancy
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-4 justify-between sm:justify-end">
                                <div className="flex items-center gap-4 text-xs font-mono">
                                  <span className="text-zinc-500">TSheets: <strong className="text-zinc-700 dark:text-zinc-350">{day.tsheets.hours.toFixed(2)}h</strong></span>
                                  <span className="text-zinc-500">OS: <strong className="text-zinc-700 dark:text-zinc-350">{day.native.hours.toFixed(2)}h</strong></span>
                                  <span className={`font-black ${Math.abs(hoursDiff) <= 0.05 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    Diff: {hoursDiff >= 0 ? '+' : ''}{hoursDiff.toFixed(2)}h
                                  </span>
                                </div>
                                {isDayExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                              </div>
                            </div>

                            {/* Detailed Timeline Comparison */}
                            {isDayExpanded && (
                              <div className="p-4 border-t border-zinc-250 dark:border-zinc-800/50 bg-zinc-50/20 dark:bg-zinc-950/20 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* TSheets Chronological segments */}
                                <div className="space-y-3">
                                  <h6 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-1.5 flex items-center justify-between">
                                    <span>TSheets Segments (CSV)</span>
                                    {day.tsheets.startTime && (
                                      <span className="font-mono text-[9px] lowercase font-bold text-zinc-500">
                                        clock: {formatTime(day.tsheets.startTime)} → {formatTime(day.tsheets.endTime)}
                                      </span>
                                    )}
                                  </h6>

                                  {day.tsheets.segments.length === 0 ? (
                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg text-center text-xs italic text-zinc-450">
                                      No time recorded in TSheets on this day.
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {day.tsheets.segments.map((seg, idx) => (
                                        <div 
                                          key={idx} 
                                          className={`p-3 rounded-xl border text-xs space-y-1 bg-white dark:bg-zinc-900 shadow-sm ${
                                            seg.jobcode1 === 'Lunch Break' 
                                              ? 'border-zinc-200 dark:border-zinc-800 opacity-60' 
                                              : 'border-zinc-250 dark:border-zinc-800/80 hover:border-indigo-500/40 transition-colors'
                                          }`}
                                        >
                                          <div className="flex justify-between items-start gap-2">
                                            <div className="font-bold text-zinc-800 dark:text-zinc-200">
                                              {seg.jobcode1} 
                                              {seg.jobcode2 && <span className="text-[10px] text-zinc-500 font-mono ml-1">({seg.jobcode2})</span>}
                                            </div>
                                            <span className="font-mono font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
                                              {seg.hours.toFixed(2)}h
                                            </span>
                                          </div>
                                          
                                          <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                                            <Clock className="w-3 h-3 text-zinc-400" />
                                            <span>{formatTime(seg.startTime)} → {formatTime(seg.endTime)}</span>
                                            {seg.approved === 'approved' && (
                                              <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.2 rounded font-black uppercase ml-1.5 leading-none">
                                                Approved
                                              </span>
                                            )}
                                          </div>

                                          {seg.serviceItem && (
                                            <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider mt-1 leading-none">
                                              {seg.serviceItem}
                                            </p>
                                          )}

                                          {seg.notes && (
                                            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 italic bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-100 dark:border-zinc-800 mt-2 font-medium leading-relaxed">
                                              "{seg.notes}"
                                            </p>
                                          )}

                                          {seg.flagTypes && (
                                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-rose-500 uppercase mt-1">
                                              <AlertCircle className="w-3 h-3" /> Flag: {seg.flagTypes}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Upfitters OS Chronological segments */}
                                <div className="space-y-3">
                                  <h6 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-1.5 flex items-center justify-between">
                                    <span>Upfitters OS segments</span>
                                    {day.native.startTime && (
                                      <span className="font-mono text-[9px] lowercase font-bold text-zinc-500">
                                        clock: {formatTime(day.native.startTime)} → {formatTime(day.native.endTime)}
                                      </span>
                                    )}
                                  </h6>

                                  {day.native.segments.length === 0 ? (
                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg text-center text-xs italic text-zinc-450">
                                      No time recorded in Upfitters OS on this day.
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {day.native.segments
                                        .sort((a, b) => {
                                          const aTime = a.startTime?.getTime() || 0;
                                          const bTime = b.startTime?.getTime() || 0;
                                          // Sort root session at top, then others chronologically
                                          if (a.type === 'session_root' && b.type !== 'session_root') return -1;
                                          if (b.type === 'session_root' && a.type !== 'session_root') return 1;
                                          return aTime - bTime;
                                        })
                                        .map((seg, idx) => (
                                          <div 
                                            key={idx} 
                                            className={`p-3 rounded-xl border text-xs space-y-1 shadow-sm ${
                                              seg.type === 'session_root' 
                                                ? 'border-indigo-500/25 bg-indigo-50/10 dark:bg-indigo-950/5'
                                                : seg.type === 'break'
                                                ? 'border-zinc-200 dark:border-zinc-800 opacity-60 bg-white dark:bg-zinc-900'
                                                : 'border-zinc-250 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 hover:border-indigo-500/40 transition-colors'
                                            }`}
                                          >
                                            <div className="flex justify-between items-start gap-2">
                                              <div>
                                                <span className="font-bold text-zinc-850 dark:text-zinc-200">{seg.name}</span>
                                                {seg.taskName && (
                                                  <span className="text-[10px] text-zinc-450 font-bold ml-1.5 uppercase tracking-wide">
                                                    - {seg.taskName}
                                                  </span>
                                                )}
                                              </div>
                                              <span className="font-mono font-bold bg-zinc-100 dark:bg-zinc-850 px-1.5 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
                                                {seg.hours.toFixed(2)}h
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                                              <Clock className="w-3 h-3 text-zinc-400" />
                                              <span>{formatTime(seg.startTime)} → {formatTime(seg.endTime)}</span>
                                              {seg.type === 'session_root' && (
                                                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-black uppercase ml-1.5 leading-none">
                                                  Shift Root
                                                </span>
                                              )}
                                              {seg.type === 'break' && (
                                                <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.2 rounded font-black uppercase ml-1.5 leading-none">
                                                  Break
                                                </span>
                                              )}
                                            </div>

                                            {seg.notes && (
                                              <p className="text-[11px] text-zinc-650 dark:text-zinc-450 italic bg-zinc-50/50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-100 dark:border-zinc-800 mt-2 font-medium leading-relaxed">
                                                "{seg.notes}"
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

      {/* Printable-only landscape reconciliation report */}
      <div className="hidden print:block space-y-8 text-black bg-white w-full">
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-tight">
              TSheets vs Upfitters OS Timesheet Reconciliation
            </h1>
            <p className="text-xs font-medium text-zinc-650 uppercase tracking-widest mt-1">
              Source CSV: {csvFile.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono font-bold">Report Period</p>
            <p className="text-sm font-black font-mono mt-0.5">
              {dateRange ? `${dateRange.minDateStr} — ${dateRange.maxDateStr}` : 'Unknown'}
            </p>
          </div>
        </div>

        {/* Reconcile Totals Summary */}
        <div className="grid grid-cols-5 gap-4 border border-zinc-350 p-4 rounded-xl font-bold text-xs mb-6">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase block">TSheets Total</span>
            <p className="text-sm">{summaryTotals.tsheetsHours.toFixed(2)}h</p>
          </div>
          <div>
            <span className="text-[9px] text-zinc-500 uppercase block">Upfitters OS Total</span>
            <p className="text-sm">{summaryTotals.nativeHours.toFixed(2)}h</p>
          </div>
          <div>
            <span className="text-[9px] text-zinc-500 uppercase block">Variance</span>
            <p className="text-sm">{summaryTotals.variance >= 0 ? '+' : ''}{summaryTotals.variance.toFixed(2)}h</p>
          </div>
          <div>
            <span className="text-[9px] text-zinc-500 uppercase block">Discrepancy Days</span>
            <p className="text-sm">{summaryTotals.discrepancyDays}</p>
          </div>
          <div>
            <span className="text-[9px] text-zinc-500 uppercase block">Unmapped Staff</span>
            <p className="text-sm">{summaryTotals.unmappedStaff}</p>
          </div>
        </div>

        {/* Detailed Logs per Employee */}
        <div className="space-y-8">
          {comparisonData.map((emp) => {
            const hasNoMap = !emp.staffId;
            return (
              <div key={emp.csvName} className="border-t border-zinc-300 pt-6 page-break-inside-avoid print-page-break">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-base font-bold uppercase tracking-tight">{emp.staffName}</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {hasNoMap ? '⚠️ UNMAPPED USER' : `System ID: ${emp.staffId?.slice(0, 8)}`}
                    </p>
                  </div>
                  <div className="flex gap-6 text-xs text-right font-mono font-bold">
                    <div>
                      <span className="text-[9px] text-zinc-400 block uppercase font-sans">TSheets</span>
                      <span>{emp.totalTSheetsHours.toFixed(2)}h</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 block uppercase font-sans">Upfitters OS</span>
                      <span>{emp.totalNativeHours.toFixed(2)}h</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 block uppercase font-sans">Variance</span>
                      <span>{(emp.totalNativeHours - emp.totalTSheetsHours) >= 0 ? '+' : ''}{(emp.totalNativeHours - emp.totalTSheetsHours).toFixed(2)}h</span>
                    </div>
                  </div>
                </div>

                {/* Days Table */}
                <div className="space-y-4">
                  {emp.dailyList.map((day) => {
                    const hoursDiff = day.native.hours - day.tsheets.hours;
                    const hasDayDiscrepancy = Math.abs(hoursDiff) > 0.05 || 
                      (day.tsheets.hours > 0 && day.native.hours === 0) ||
                      (day.native.hours > 0 && day.tsheets.hours === 0);

                    return (
                      <div key={day.dateStr} className="border border-zinc-300 rounded-lg p-3 bg-white space-y-3">
                        <div className="flex justify-between items-center border-b border-zinc-200 pb-1.5 font-bold">
                          <span className="text-xs">{formatDate(day.dateStr)}</span>
                          <span className="text-xs font-mono">
                            TSheets: {day.tsheets.hours.toFixed(2)}h | OS: {day.native.hours.toFixed(2)}h | Diff: {hoursDiff >= 0 ? '+' : ''}{hoursDiff.toFixed(2)}h
                            {hasDayDiscrepancy && (
                              <span className="ml-2 px-1 text-[9px] font-sans font-black bg-zinc-100 border border-black rounded uppercase text-red-650">Discrepancy</span>
                            )}
                          </span>
                        </div>

                        {/* Side-by-side Segments Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* TSheets segments */}
                          <div className="space-y-2">
                            <h6 className="text-[9px] font-black uppercase tracking-wider text-zinc-400 border-b pb-0.5">
                              TSheets Segments (CSV)
                            </h6>
                            {day.tsheets.segments.length === 0 ? (
                              <p className="text-[10px] italic text-zinc-450">No time recorded.</p>
                            ) : (
                              day.tsheets.segments.map((seg, sIdx) => (
                                <div key={sIdx} className="text-[11px] p-2 border border-zinc-250 rounded">
                                  <div className="flex justify-between">
                                    <span className="font-bold">{seg.jobcode1} {seg.jobcode2 && `(${seg.jobcode2})`}</span>
                                    <span className="font-mono">{seg.hours.toFixed(2)}h</span>
                                  </div>
                                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                                    {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                                  </div>
                                  {seg.notes && <p className="text-[10px] italic text-zinc-650 mt-1">"{seg.notes}"</p>}
                                </div>
                              ))
                            )}
                          </div>

                          {/* Upfitters OS segments */}
                          <div className="space-y-2">
                            <h6 className="text-[9px] font-black uppercase tracking-wider text-zinc-400 border-b pb-0.5">
                              Upfitters OS Segments
                            </h6>
                            {day.native.segments.length === 0 ? (
                              <p className="text-[10px] italic text-zinc-450">No time recorded.</p>
                            ) : (
                              day.native.segments
                                .sort((a, b) => {
                                  if (a.type === 'session_root') return -1;
                                  if (b.type === 'session_root') return 1;
                                  return (a.startTime?.getTime() || 0) - (b.startTime?.getTime() || 0);
                                })
                                .map((seg, sIdx) => (
                                  <div key={sIdx} className={`text-[11px] p-2 border border-zinc-250 rounded ${seg.type === 'session_root' ? 'bg-zinc-50' : ''}`}>
                                    <div className="flex justify-between">
                                      <span className="font-bold">{seg.name} {seg.taskName && `- ${seg.taskName}`}</span>
                                      <span className="font-mono">{seg.hours.toFixed(2)}h</span>
                                    </div>
                                    <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                                      {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                                    </div>
                                    {seg.notes && <p className="text-[10px] italic text-zinc-650 mt-1">"{seg.notes}"</p>}
                                  </div>
                                ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
