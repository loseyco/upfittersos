import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_lunch' | 'on_break';

interface TimeclockState {
  status: ClockStatus;
  startTime: number | null;
  activeSessionId: string | null;
  setStatus: (status: ClockStatus, startTime: number | null, activeSessionId?: string | null) => void;
  reset: () => void;
}

export const useTimeclockStore = create<TimeclockState>()(
  persist(
    (set) => ({
      status: 'clocked_out',
      startTime: null,
      activeSessionId: null,
      setStatus: (status, startTime, activeSessionId = null) => set({ 
        status, 
        startTime, 
        activeSessionId: activeSessionId !== undefined ? activeSessionId : null 
      }),
      reset: () => set({ status: 'clocked_out', startTime: null, activeSessionId: null }),
    }),
    {
      name: 'upfitters-timeclock-storage',
    }
  )
);
