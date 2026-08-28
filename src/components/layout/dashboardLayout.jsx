'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useNotificationStore } from '@/store/notificationStore'
import socket from '@/lib/socket'
import { Icon } from '@/utils/helpers'
import api from '@/lib/api'

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV_BY_ROLE = {
  receptionist: [
    { href: '/reception/', label: 'Queue', icon: 'list' },
    { href: '/reception/overview', label: 'Overview', icon: 'layout' },
    { href: '/reception/billing', label: 'Billing Desk', icon: 'receipt' },
    { href: '/reception/expenses', label: 'Expenses', icon: 'trendDown' },
    { href: '/reception/notifications', label: 'Notifications', icon: 'bell' },
  ],
  doctor: [
    { href: '/doctor', label: 'Patient Queue', icon: 'list' },
    { href: '/doctor/consultation', label: 'Consultation Room', icon: 'stethoscope' },
    { href: '/doctor/patients', label: 'Patient Database', icon: 'users' },
    { href: '/doctor/pharmacy_stock', label: 'pharmacy stock', icon: 'pillBottle' },
    { href: '/doctor/orders', label: 'Pharmacy Orders', icon: 'shoppingCart' },
    { href: '/doctor/notifications', label: 'Notifications', icon: 'bell' },
  ],
  lab_tech: [
    { href: '/lab', label: 'Lab Queue', icon: 'list' },
    { href: '/lab/requests', label: 'Lab Requests', icon: 'flask' },
    { href: '/lab/stock', label: 'Lab Stock', icon: 'box' },
    { href: '/lab/orders', label: 'Pharmacy Orders', icon: 'shoppingCart' },
    { href: '/lab/notifications', label: 'Notifications', icon: 'bell' },
  ],
  pharmacist: [
    { href: '/pharmacy', label: 'Prescription Queue', icon: 'list' },
    { href: '/pharmacy/stock', label: 'Stock', icon: 'pillBottle' },
    { href: '/pharmacy/sales', label: 'OTC Sales', icon: 'store' },
    { href: '/pharmacy/orders', label: 'Internal Orders', icon: 'shoppingCart' },
    { href: '/pharmacy/expenses', label: 'Expenses', icon: 'trendDown' },
    { href: '/pharmacy/notifications', label: 'Notifications', icon: 'bell' },
  ],
  admin: [
    { href: '/admin', label: 'Dashboard', icon: 'layout' },
    { href: '/admin/patients', label: 'Patients', icon: 'archive' },
    { href: '/admin/staff', label: 'Staff', icon: 'users' },
    { href: '/admin/inventory', label: 'Inventory', icon: 'box' },
    { href: '/admin/finance', label: 'Finance', icon: 'box' },
    { href: '/admin/referrals', label: 'Referrals & Commission', icon: 'dollarSign' },
    { href: '/admin/reports', label: 'Reports', icon: 'barChart' },
    { href: '/admin/logs', label: 'Logs', icon: 'clipboard' },
    { href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
    { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  ],
}

const ROLE_LABELS = {
  receptionist: 'Receptionist',
  doctor: 'Consultant',
  lab_tech: 'Lab Technician',
  pharmacist: 'Pharmacist',
  admin: 'Administrator',
}

// Maps notification.type → display config for dot color + type label
const NOTIF_TYPE_CONFIG = {
  'visit:new': { dot: 'bg-blue-400', label: 'New patient' },
  'visit:forwarded': { dot: 'bg-indigo-400', label: 'Visit forwarded' },
  'visit:completed': { dot: 'bg-emerald-400', label: 'Visit completed' },
  'lab:results_ready': { dot: 'bg-purple-400', label: 'Lab ready' },
  'lab:request_new': { dot: 'bg-violet-400', label: 'Lab requested' },
  'rx:new': { dot: 'bg-teal-400', label: 'New prescription' },
  'rx:dispensed': { dot: 'bg-cyan-400', label: 'Rx dispensed' },
  'rx:returned': { dot: 'bg-orange-400', label: 'Rx returned' },
  'rx:cancelled': { dot: 'bg-red-400', label: 'Rx cancelled' },
  'payment:received': { dot: 'bg-emerald-400', label: 'Payment' },
  'stock:low': { dot: 'bg-amber-400', label: 'Low stock' },
  'stock:out': { dot: 'bg-red-500', label: 'Out of stock' },
}
const DEFAULT_NOTIF_CONFIG = { dot: 'bg-gray-300', label: 'Notification' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function isActiveLink(pathname, href) {
  if (pathname === href) return true
  if (href.split('/').filter(Boolean).length >= 2) return pathname.startsWith(href + '/')
  return false
}

// ─── Small SVG icons (not in helpers.js) ─────────────────────────────────────
function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
    </svg>
  )
}

function MoonIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
    </svg>
  )
}

function ChevronDown({ open }) {
  return (
    <svg
      className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

// ─── NotificationDropdown ─────────────────────────────────────────────────────
// Fetches from /api/notifications (last 24hrs, paginated).
// Rendered inside the bell button's dropdown — NOT a separate page component.

const NOTIF_PAGE_SIZE = 20

function NotificationDropdown({ page, setPage }) {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => api.get(`/api/notifications?page=${page}`),
    refetchInterval: 30000,
    staleTime: 20000,
    keepPreviousData: true,
  })

  const notifications = data?.notifications || []
  const pagination = data?.pagination || {}

  if (isLoading) {
    return (
      <div className="py-8 text-center text-[12px] text-gray-400 dark:text-gray-500">
        Loading…
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="py-10 text-center px-4">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center mx-auto mb-2">
          <BellIcon />
        </div>
        <p className="text-[12px] text-gray-400 dark:text-gray-500">
          No notifications in the last 24 hours
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Items */}
      <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
        {notifications.map((n) => {
          const cfg = NOTIF_TYPE_CONFIG[n.type] || DEFAULT_NOTIF_CONFIG
          return (
            <div
              key={n.id}
              className={[
                'px-4 py-3 border-l-2 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors',
                n.is_read
                  ? 'border-l-transparent opacity-60'
                  : 'border-l-[#1a6cbf] dark:border-l-blue-500 bg-blue-50/30 dark:bg-blue-900/10',
              ].join(' ')}
            >
              <div className="flex items-start gap-2.5">
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${n.is_read ? 'bg-gray-300 dark:bg-gray-600' : cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
                      {timeAgo(n.timestamp)}
                    </span>
                  </div>
                  {n.title && (
                    <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 leading-snug">
                      {n.title}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                    {n.message}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-[#1a6cbf] dark:hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Newer
          </button>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
            {page} / {pagination.total_pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
            disabled={!pagination.has_more}
            className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-[#1a6cbf] dark:hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Older →
          </button>
        </div>
      )}

      {/* Total count */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 shrink-0">
        <p className="text-[10px] text-center text-gray-400 dark:text-gray-500">
          {pagination.total ?? 0} notification{pagination.total !== 1 ? 's' : ''} in the last 24 hours
        </p>
      </div>
    </>
  )
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function AppLayout({ children, title = 'Dashboard', allowedRoles }) {
  const router = useRouter()
  const pathname = usePathname()
  const qc = useQueryClient()

  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const logout = useAuthStore((s) => s.logout)

  const { dark, toggleDark } = useThemeStore()

  // addNotification still used by the socket handler to push live events
  // into the local store (for immediate bell count bump without waiting for a refetch)
  const { addNotification } = useNotificationStore()

  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
  const [clock, setClock] = useState('')

  const notifRef = useRef(null)
  const profileRef = useRef(null)

  // Fetch unread count separately so the bell badge is always fresh
  const { data: notifMeta } = useQuery({
    queryKey: ['notifications', 'meta'],
    queryFn: () => api.get('/api/notifications?page=1'),
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 20000,
  })
  const unreadCount = notifMeta?.unread_count ?? 0
  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/api/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'meta'] })
    },
  })

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasHydrated) return
    if (!user) { router.replace('/'); return }
    if (allowedRoles && !allowedRoles.includes(user.role)) router.replace('/unauthorized')
  }, [hasHydrated, user])

  // ── Websockets ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasHydrated || !user?.role) return

    const doJoin = () => socket.emit('join', user.role)

    // Always register — fires on first connect AND every reconnect
    socket.on('connect', doJoin)
    if (socket.connected) doJoin()

    const handleNotification = (data) => {
      // Push to local store for immediate badge bump
      addNotification(data)
      // Also invalidate the API query so the dropdown shows the new item
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }

    socket.on('notification:new', handleNotification)

    return () => {
      socket.off('connect', doJoin)
      socket.off('notification:new', handleNotification)
    }
  }, [hasHydrated, user?.role])

  // ── Live clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Close dropdowns on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout') } catch { }
    logout()
    router.push('/')
  }

  const handleNotifOpen = () => {
    const opening = !notifOpen
    setNotifOpen(opening)
    setProfileOpen(false)
    setNotifPage(1) // reset to page 1 each time dropdown opens
    if (opening) {
      qc.refetchQueries({ queryKey: ['notifications', 1] })
        .finally(() => markAllReadMutation.mutate())
    }
  }

  const handleProfileOpen = () => {
    setProfileOpen((p) => !p)
    setNotifOpen(false)
  }

  if (!user) return null

  const roleLabel = ROLE_LABELS[user.role] || user.role
  const navItems = NAV_BY_ROLE[user.role] || []

  return (
    <div className="flex h-screen bg-[#f0f4f8] dark:bg-[#0f172a] overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={`
        flex flex-col shrink-0 h-full bg-[#0d3d6b] dark:bg-[#071f38] text-white
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? 'w-16' : 'w-56'}
      `}>

        {/* Logo */}
        <div className={`flex items-center gap-2.5 border-b border-white/10 ${sidebarCollapsed ? 'px-4 py-5 justify-center' : 'px-4 pt-5 pb-4'}`}>
          <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="#7db8e8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <p className="text-white text-sm font-semibold leading-tight truncate">City Health</p>
              <p className="text-blue-300/70 text-[11px] leading-tight">Clinic System</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {!sidebarCollapsed && (
            <p className="text-[10px] text-blue-400/60 uppercase tracking-widest font-semibold mb-2 px-2 mt-2">
              Menu
            </p>
          )}
          {navItems.map((item) => {
            const active = isActiveLink(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                  active
                    ? 'bg-[#1a6cbf] text-white shadow-sm'
                    : 'text-blue-200/70 hover:bg-white/5 hover:text-blue-100',
                ].join(' ')}
              >
                <Icon
                  name={item.icon}
                  size={17}
                  className={active ? 'text-white shrink-0' : 'text-blue-300/50 shrink-0'}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User + logout */}
        <div className="px-3 py-4 border-t border-white/10">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center shrink-0">
                <Icon name="user" size={16} className="text-blue-200" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-[13px] font-semibold truncate">{user.full_name ?? user.username}</p>
                <p className="text-blue-300/60 text-[10px]">{roleLabel}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Sign out' : undefined}
            className={[
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium',
              'text-blue-200/70 hover:bg-white/5 hover:text-red-300 transition-colors',
              sidebarCollapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <Icon name="logout" size={17} className="text-blue-300/50 shrink-0" />
            {!sidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="shrink-0 h-14 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-3 shadow-sm">

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarCollapsed((p) => !p)}
            className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Page title */}
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{title}</h1>

          {/* Clock */}
          <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 font-mono">{clock}</span>

          {/* Online indicator */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span className="hidden sm:inline">Online</span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleDark}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* ── Bell ──────────────────────────────────────────────────────────── */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={handleNotifOpen}
              className="relative p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              aria-label="Notifications"
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden flex flex-col max-h-120">

                {/* Dropdown header */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">Last 24 hrs</span>
                </div>

                {/* Scrollable list + pagination */}
                <div className="flex-1 overflow-y-auto">
                  <NotificationDropdown page={notifPage} setPage={setNotifPage} />
                </div>

              </div>
            )}
          </div>

          {/* ── Avatar + profile dropdown ──────────────────────────────────── */}
          <div className="relative pl-2 border-l border-gray-200 dark:border-gray-700" ref={profileRef}>
            <button
              onClick={handleProfileOpen}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#1a6cbf] flex items-center justify-center text-white text-xs font-bold shrink-0">
                {(user.full_name ?? user.username)?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 max-w-28 truncate leading-tight">
                  {user.full_name ?? user.username}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{roleLabel}</p>
              </div>
              <span className="hidden sm:block"><ChevronDown open={profileOpen} /></span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">

                {/* Profile header */}
                <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1a6cbf] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(user.full_name ?? user.username)?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {user.full_name ?? user.username}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{roleLabel}</p>
                  </div>
                </div>

                {/* Info rows */}
                <div className="px-4 py-3 space-y-2.5 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">Username</span>
                    <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300">{user.username}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">Status</span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">Theme</span>
                    <button
                      onClick={toggleDark}
                      className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 hover:text-[#1a6cbf] dark:hover:text-blue-400 transition-colors font-medium"
                    >
                      {dark ? <><SunIcon />Dark · switch to light</> : <><MoonIcon className="w-3.5 h-3.5" />Light · switch to dark</>}
                    </button>
                  </div>
                </div>

                {/* Sign out */}
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  )
}