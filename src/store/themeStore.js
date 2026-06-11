import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(
  persist(
    (set) => ({
      dark: false,
      toggleDark: () => set((s) => ({ dark: !s.dark })),
    }),
    { name: 'clinic-theme' }
  )
)