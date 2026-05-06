import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Calendar, Users, Clock, ShieldCheck, AlertCircle 
} from 'lucide-react';

interface WorkSchedule {
  days: number[];
  startTime: string;
  endTime: string;
  expectedHoursPerDay: number;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  departmentId?: string;
  individualSchedule?: WorkSchedule;
  jobTitle?: string;
}

interface Department {
  id: string;
  name: string;
  defaultSchedule?: WorkSchedule;
}

const DAYS = [
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
  { id: 7, name: 'Sunday', short: 'Sun' }
];

export function StaffRoster({ tenantId }: { tenantId: string }) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['staff-roster-data', tenantId],
    queryFn: async () => {
      const staffSnap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`)));
      const deptSnap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
      
      return {
        staff: staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)).filter(s => !(s as any).isArchived),
        departments: deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department))
      };
    }
  });

  const roster = useMemo(() => {
    if (!data) return [];
    
    return data.staff
      .filter(s => selectedDeptId === 'all' || s.departmentId === selectedDeptId)
      .map(staff => {
        const dept = data.departments.find(d => d.id === staff.departmentId);
        const schedule = staff.individualSchedule || dept?.defaultSchedule;
        const isOverride = !!staff.individualSchedule;

        return {
          staff,
          dept,
          schedule,
          isOverride
        };
      })
      .sort((a, b) => (a.dept?.name || '').localeCompare(b.dept?.name || ''));
  }, [data, selectedDeptId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters & Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-900 dark:text-white">Staff Roster</h2>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Weekly Operating Schedule</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" />
            <select 
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Departments</option>
              {data?.departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Roster Grid */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                <th className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Staff Member</span>
                </th>
                {DAYS.map(day => (
                  <th key={day.id} className="p-6 border-b border-zinc-200 dark:border-zinc-800 text-center min-w-[140px]">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{day.name}</span>
                  </th>
                ))}
                <th className="p-6 border-b border-zinc-200 dark:border-zinc-800 text-right">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Total</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {roster.map(({ staff, dept, schedule, isOverride }) => {
                const weeklyHours = schedule ? ((schedule.days?.length || 0) * (schedule.expectedHoursPerDay || 0)) : 0;
                
                return (
                  <tr key={staff.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-600/20">
                          {staff.firstName?.[0] || '?'}{staff.lastName?.[0] || ''}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-white leading-none mb-1">
                            {staff.firstName} {staff.lastName}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{dept?.name || 'No Dept'}</span>
                            {isOverride && (
                              <span className="text-[8px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest ring-1 ring-amber-500/20">
                                Override
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const isScheduled = schedule?.days?.includes(day.id);
                      return (
                        <td key={day.id} className="p-6 text-center">
                          {isScheduled ? (
                            <div className="inline-flex flex-col items-center">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white">
                                <Clock className="w-3 h-3 text-indigo-500" />
                                {formatTime(schedule?.startTime)} - {formatTime(schedule?.endTime)}
                              </div>
                              <span className="text-[10px] font-bold text-zinc-400 uppercase mt-1">
                                {schedule?.expectedHoursPerDay}h Shift
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-zinc-300 dark:text-zinc-800 tracking-widest uppercase">OFF</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-6 text-right">
                      <div className="inline-block text-right">
                        <p className={`text-sm font-black ${weeklyHours > 40 ? 'text-amber-500' : 'text-zinc-900 dark:text-white'}`}>
                          {weeklyHours} Hours
                        </p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Per Week</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {roster.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-20 text-center">
                    <div className="max-w-xs mx-auto space-y-4 opacity-50">
                      <Users className="w-12 h-12 text-zinc-300 mx-auto" />
                      <p className="text-sm text-zinc-500 font-medium">No staff members found in this department with an active schedule.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Legend */}
      <div className="flex items-center gap-6 px-6 py-4 bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Scheduled Shift</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Overtime Week ({'>'}40h)</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Department Baseline</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Individual Override</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(timeStr?: string) {
  if (!timeStr) return '--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const [hour, minute] = parts.map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}
