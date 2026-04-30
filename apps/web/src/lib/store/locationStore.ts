import { create } from 'zustand';

interface LocationState {
  isSharing: boolean;
  targetEventId: string | null;
  startSharing: (eventId: string) => void;
  stopSharing: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  isSharing: false,
  targetEventId: null,
  startSharing: (eventId) => set({ isSharing: true, targetEventId: eventId }),
  stopSharing: () => set({ isSharing: false, targetEventId: null }),
}));
