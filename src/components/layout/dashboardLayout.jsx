'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useNotificationStore } from '@/store/notificationStore'
import api from '@/lib/api'

// ─── Nav items per role ───────────────────────────────────────────────────────
const NAV_ITEMS = {
  receptionist: [
    { href: '/reception',          icon: '⊞', label: 'Dashboard' },
    { href: '/reception/queue',    icon: '⟳', label: 'Queue'     },
    { href: '/reception/patients', icon: '♜', label: 'Patients'  },
    { href: '/reception/billing',  icon: '₿', label: 'Billing'   },
  ],
  doctor: [
    { href: '/consultation',          icon: '⊞', label: 'Dashboard' },
    { href: '/consultation/queue',    icon: '⟳', label: 'My Queue'  },
    { href: '/consultation/patients', icon: '♜', label: 'Patients'  },
    { href: '/consultation/history',  icon: '☰', label: 'History'   },
  ],
  lab_tech: [
    { href: '/lab',          icon: '⊞', label: 'Dashboard' },
    { href: '/lab/requests', icon: '⟳', label: 'Requests'  },
    { href: '/lab/results',  icon: '✓', label: 'Results'   },
  ],
  pharmacist: [
    { href: '/pharmacy',               icon: '⊞', label: 'Dashboard'     },
    { href: '/pharmacy/prescriptions', icon: '☰', label: 'Prescriptions' },
    { href: '/pharmacy/stock',         icon: '▦', label: 'Stock'         },
    { href: '/pharmacy/dispensed',     icon: '✓', label: 'Dispensed'     },
  ],
  owner: [
    { href: '/admin',          icon: '⊞', label: 'Dashboard'    },
    { href: '/admin/staff',    icon: '♟', label: 'Staff'        },
    { href: '/admin/patients', icon: '♜', label: 'All Patients' },
    { href: '/admin/billing',  icon: '₿', label: 'Revenue'      },
    { href: '/admin/reports',  icon: '☰', label: 'Reports'      },
    { href: '/reception',      icon: '⟳', label: 'Reception'    },
  ],
}

const ROLE_LABELS = {
  receptionist: 'Receptionist',
  doctor:       'Consultant',
  lab_tech:     'Lab Technician',
  pharmacist:   'Pharmacist',
  owner:        'Administrator',
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z"/>
    </svg>
  )
}

function MoonIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/>
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function AppLayout({ children, title = 'Dashboard', allowedRoles, navItems = [] }) {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { dark, toggleDark } = useThemeStore()
  const { notifications, unreadCount, markAllRead } = useNotificationStore()

  const [notifOpen,         setNotifOpen]         = useState(false)
  const [profileOpen,       setProfileOpen]       = useState(false)
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(false)
  const [clock,             setClock]             = useState('')
  const [isHydrated,        setIsHydrated]        = useState(false)

  const notifRef   = useRef(null)
  const profileRef = useRef(null)

  // ── Hydration guard ─────────────────────────────────────────────────────────
  useEffect(() => { setIsHydrated(true) }, [])

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHydrated) return
    if (!user) { router.replace('/'); return }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace('/unauthorized')
    }
  }, [isHydrated, user])

  // ── Live clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Close dropdowns on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current   && !notifRef.current.contains(e.target))   setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    logout()
    router.push('/')
  }

  const handleNotifOpen = () => {
    setNotifOpen((prev) => !prev)
    setProfileOpen(false)
    if (!notifOpen) markAllRead()
  }

  const handleProfileOpen = () => {
    setProfileOpen((prev) => !prev)
    setNotifOpen(false)
  }

  if (!user) return null

  const roleLabel = ROLE_LABELS[user.role] || user.role

  return (
    <div className="flex h-screen bg-[#f0f4f8] dark:bg-[#0f172a] overflow-hidden">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside className={`
        flex flex-col shrink-0 h-full bg-[#0c2340] text-white
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? 'w-16' : 'w-56'}
      `}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-[#1a6cbf] flex items-center justify-center text-lg font-bold">
            +
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-semibold leading-tight truncate">City Health</p>
              <p className="text-[11px] text-blue-300 leading-tight">Clinic System</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {!sidebarCollapsed && (
            <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              {roleLabel}
            </p>
          )}
          {navItems.map((item) => {
            const isActive =
              typeof window !== 'undefined' &&
              (window.location.pathname === item.href ||
               window.location.pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={`
                  flex items-center gap-3 mx-2 mb-0.5 px-3 py-2.5 rounded-lg text-sm
                  transition-all duration-150
                  ${isActive
                    ? 'bg-[#1a6cbf] text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                  }
                `}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/10 p-3">
          {!sidebarCollapsed && (
            <div className="px-2 pb-2">
              <p className="text-xs font-medium truncate">{user.name}</p>
              <p className="text-[11px] text-blue-300 truncate">{roleLabel}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Logout"
            className={`
              w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              text-white/50 hover:text-red-300 hover:bg-red-900/20 transition-all
              ${sidebarCollapsed ? 'justify-center' : ''}
            `}
          >
            <span>⎋</span>
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* ── Topbar ──────────────────────────────────────────────────────────── */}
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

          {/* Title */}
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{title}</h1>

          {/* Clock */}
          <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 font-mono">{clock}</span>

          {/* Online */}
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

          {/* Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={handleNotifOpen}
              className="relative p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Notifications</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{notifications.length} total</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No notifications</div>
                  ) : notifications.map((n) => (
                    <div key={n.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <div className="flex gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          n.type === 'info'    ? 'bg-blue-400'    :
                          n.type === 'success' ? 'bg-emerald-400' :
                          n.type === 'warning' ? 'bg-amber-400'   : 'bg-gray-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{n.message}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{timeAgo(n.time)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Avatar + profile dropdown */}
          <div className="relative pl-2 border-l border-gray-200 dark:border-gray-700" ref={profileRef}>
            <button
              onClick={handleProfileOpen}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#1a6cbf] flex items-center justify-center text-white text-xs font-bold shrink-0">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 max-w-28 truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                  {roleLabel}
                </p>
              </div>
              <span className="hidden sm:block">
                <ChevronDown open={profileOpen} />
              </span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">

                {/* Profile header */}
                <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1a6cbf] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
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
                      {dark ? (
                        <>
                          <SunIcon />
                          Dark · switch to light
                        </>
                      ) : (
                        <>
                          <MoonIcon className="w-3.5 h-3.5" />
                          Light · switch to dark
                        </>
                      )}
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
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
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