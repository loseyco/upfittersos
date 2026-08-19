import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_lunch' | 'on_break';

interface TimeclockState {
  status: ClockStatus;
  startTime: number | null;
  activeSessionId: string | null;
  lastSyncedAt: number;
  setStatus: (status: ClockStatus, startTime: number | null, activeSessionId?: string | null, skipBroadcast?: boolean) => void;
  reset: (skipBroadcast?: boolean) => void;
}

// BroadcastChannel for sub-millisecond cross-tab / cross-window synchronization
const SYNC_CHANNEL_NAME = 'upfitters_timeclock_sync_channel';
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch (e) {
    console.warn('BroadcastChannel not supported or restricted in this environment:', e);
  }
}

export const useTimeclockStore = create<TimeclockState>()(
  persist(
    (set, get) => ({
      status: 'clocked_out',
      startTime: null,
      activeSessionId: null,
      lastSyncedAt: Date.now(),
      setStatus: (status, startTime, activeSessionId = null, skipBroadcast = false) => {
        const nextActiveSessionId = activeSessionId !== undefined ? activeSessionId : null;
        const current = get();
        
        // Skip duplicate redundant state changes
        if (
          current.status === status &&
          current.startTime === startTime &&
          current.activeSessionId === nextActiveSessionId
        ) {
          return;
        }

        const now = Date.now();
        set({ 
          status, 
          startTime, 
          activeSessionId: nextActiveSessionId,
          lastSyncedAt: now
        });

        // Broadcast to all other open tabs / windows in real-time
        if (!skipBroadcast && broadcastChannel) {
          try {
            broadcastChannel.postMessage({
              type: 'TIMECLOCK_STATE_CHANGE',
              status,
              startTime,
              activeSessionId: nextActiveSessionId,
              timestamp: now
            });
          } catch (e) {
            console.warn('Failed to broadcast timeclock state to other tabs:', e);
          }
        }
      },
      reset: (skipBroadcast = false) => {
        const current = get();
        if (current.status === 'clocked_out' && current.startTime === null && current.activeSessionId === null) {
          return;
        }
        const now = Date.now();
        set({ 
          status: 'clocked_out', 
          startTime: null, 
          activeSessionId: null, 
          lastSyncedAt: now 
        });

        if (!skipBroadcast && broadcastChannel) {
          try {
            broadcastChannel.postMessage({
              type: 'TIMECLOCK_STATE_CHANGE',
              status: 'clocked_out',
              startTime: null,
              activeSessionId: null,
              timestamp: now
            });
          } catch (e) {
            console.warn('Failed to broadcast timeclock reset to other tabs:', e);
          }
        }
      },
    }),
    {
      name: 'upfitters-timeclock-storage',
    }
  )
);

// Cross-tab message listener
if (typeof window !== 'undefined') {
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'TIMECLOCK_STATE_CHANGE') {
        const { status, startTime, activeSessionId } = event.data;
        useTimeclockStore.getState().setStatus(status, startTime, activeSessionId, true);
      }
    };
  }

  // Cross-tab localStorage storage event listener fallback
  window.addEventListener('storage', (event) => {
    if (event.key === 'upfitters-timeclock-storage' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed && parsed.state) {
          const { status, startTime, activeSessionId } = parsed.state;
          useTimeclockStore.getState().setStatus(status, startTime, activeSessionId, true);
        }
      } catch {
        // ignore parse error
      }
    }
  });
}
