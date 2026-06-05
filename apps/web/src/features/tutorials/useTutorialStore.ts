import { create } from 'zustand';

interface TutorialState {
  isOpen: boolean;
  activeTabId: string | null;
  openTutorial: (tabId: string) => void;
  closeTutorial: () => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  isOpen: false,
  activeTabId: null,
  openTutorial: (tabId) => set({ isOpen: true, activeTabId: tabId }),
  closeTutorial: () => set({ isOpen: false, activeTabId: null }),
}));
