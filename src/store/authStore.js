import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import socket from '@/lib/socket'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      setUser: (user) => {
        set({ user, isAuthenticated: true })
        socket.connect()
      },
      logout: () => {
        socket.disconnect()
        set({ user: null, isAuthenticated: false })
      },
      setHasHydrated: (state) => set({ hasHydrated: state }),
    }),
    {
      name: 'clinic-auth',
      onRehydrateStorage: () => (state) => {
        state.setHasHydrated(true)
        // ADDED — if a user was already logged in before refresh, reconnect
        if (state.user) {
          socket.connect()
        }
      },
    }
  )
)