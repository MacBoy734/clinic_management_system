import { create } from 'zustand'

export const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notif) =>
    set((state) => ({
      notifications: [{ ...notif, id: Date.now(), time: new Date() }, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),

  markAllRead: () => set({ unreadCount: 0 }),
  clearAll:    () => set({ notifications: [], unreadCount: 0 }),
}))