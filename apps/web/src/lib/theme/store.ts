import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark', // Dark mode is default
      toggleTheme: () =>
        set((state) => {
          const newTheme = state.theme === 'dark' ? 'light' : 'dark';
          document.documentElement.classList.toggle('dark', newTheme === 'dark');
          return { theme: newTheme };
        }),
      setTheme: (theme) =>
        set(() => {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          return { theme };
        }),
    }),
    {
      name: 'upfittersos-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Immediately apply the theme on load
          document.documentElement.classList.toggle('dark', state.theme === 'dark');
        }
      },
    }
  )
);
