import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => {set({ user }); set({isAuthenticated: true})},
      logout:  ()     => {set({ user: null }); set({isAuthenticated: false})}
    }),
    { name: 'clinic-auth' }
  )
)