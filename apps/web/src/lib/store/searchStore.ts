import { create } from 'zustand';

interface SearchState {
  isOpen: boolean;
  searchQuery: string;
  open: (initialQuery?: string) => void;
  close: () => void;
  toggle: () => void;
  setSearchQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  searchQuery: '',
  open: (initialQuery = '') => set({ isOpen: true, searchQuery: initialQuery }),
  close: () => set({ isOpen: false, searchQuery: '' }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
