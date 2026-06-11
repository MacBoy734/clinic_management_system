'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'

// ─── Role definitions ────────────────────────────────────────────────────────
const ROLES = [
  {
    key: 'receptionist',
    label: 'Receptionist',
    desc: 'Manages patients, queue & billing',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    key: 'doctor',
    label: 'Doctor',
    desc: 'Consultations & prescriptions',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
        <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>
      </svg>
    ),
  },
  {
    key: 'lab_tech',
    label: 'Lab Tech',
    desc: 'Processes lab test requests',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11l-4 7h14l-4-7V3"/>
      </svg>
    ),
  },
  {
    key: 'pharmacist',
    label: 'Pharmacist',
    desc: 'Dispenses medications & stock',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>
      </svg>
    ),
  },
  {
    key: 'admin',
    label: 'Owner / Admin',
    desc: 'Full system access & reports',
    wide: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>
      </svg>
    ),
  },
]

const DASHBOARDS = {
  receptionist: '/reception',
  doctor: '/consultation',
  lab_tech: '/lab',
  pharmacist: '/pharmacy',
  admin: '/admin',
}

// ─── Sidebar nav items (decorative on login page) ────────────────────────────
const MODULES = [
  { label: 'Reception', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
  { label: 'Consultation', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg> },
  { label: 'Laboratory', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11l-4 7h14l-4-7V3"/></svg> },
  { label: 'Pharmacy', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg> },
  { label: 'Admin', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg> },
]

// ─── Icon components ─────────────────────────────────────────────────────────
function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function ShieldIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}

function WifiOffIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
}

// ─── Live clock ───────────────────────────────────────────────────────────────
function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const date = d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })
      setTime(`${hh}:${mm}  ·  ${date}`)
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])
  return time
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const clock = useClock()
  const setUser        = useAuthStore((s) => s.setUser)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user           = useAuthStore((s) => s.user)

  const [selected, setSelected] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedRole = ROLES.find((r) => r.key === selected)

  useEffect(() => {
    if (!isAuthenticated || !user?.role) return
    const dest = DASHBOARDS[user.role] ?? '/'
    router.push(dest)
  }, [isAuthenticated, user?.role, router])

  const handleSelectRole = (key) => {
    setSelected(key)
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selected) {
       setError('Please select your role first.')
       toast.error('Please select your role first.')
       return
    }
    if (!username) {
      setError('Please enter your username.')
      toast.error('Please enter your username.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      toast.error('Please enter your password.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('Signing you in…')

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: selected, username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSuccess('')
        setError(data.error || 'Incorrect credentials. Try again.')
        toast.error(data.error || 'Incorrect credentials. Try again.')
        return
      }

      setUser(data.user)
      toast.success(`Welcome, ${data.user.username}`)

      router.push(DASHBOARDS[data.user.role])
    } catch {
      setSuccess('')
      setError('Could not reach the server. Check your connection.')
      toast.error('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-215 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">

        {/* ── Top status bar ── */}
        <div className="flex items-center justify-between bg-slate-900 dark:bg-slate-950 px-5 py-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-xs text-slate-400 font-medium tracking-wide">
              System online — local network active
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{clock}</span>
        </div>

        <div className="flex">

          {/* ── Left sidebar (decorative on login) ── */}
          <aside className="hidden md:flex w-55 shrink-0 flex-col justify-between bg-[#0d3d6b] dark:bg-[#071f38] px-4 py-6">
            {/* Logo */}
            <div>
              <div className="flex items-center gap-2.5 mb-7">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7db8e8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-tight">City Health</p>
                  <p className="text-blue-300/70 text-xs">Clinic</p>
                </div>
              </div>

              {/* Modules */}
              <p className="text-[10px] text-blue-400/60 uppercase tracking-widest font-semibold mb-2 px-2">
                Modules
              </p>
              <nav className="space-y-0.5 mb-5">
                {MODULES.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-blue-200/70 text-xs hover:bg-white/5 transition-colors cursor-default"
                  >
                    <span className="text-blue-300/50 shrink-0">{m.icon}</span>
                    {m.label}
                  </div>
                ))}
              </nav>

              {/* Security */}
              <p className="text-[10px] text-blue-400/60 uppercase tracking-widest font-semibold mb-2 px-2">
                Security
              </p>
              <div className="space-y-0.5">
                {[
                  'Login required',
                  'Encrypted session',
                  '8 hr auto logout',
                ].map((s) => (
                  <div
                    key={s}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-blue-200/50 text-xs cursor-default"
                  >
                    <span className="text-blue-400/40 shrink-0">
                      <ShieldIcon />
                    </span>
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="text-[11px] text-blue-300/50 leading-relaxed">
              <div className="flex items-center gap-1.5 mb-2 text-blue-300/70">
                <WifiOffIcon />
                <span className="font-medium">Offline ready</span>
              </div>
              <p>All data stored locally on the clinic server.</p>
              <p className="mt-0.5">Cloud sync when available.</p>
            </div>
          </aside>

          {/* ── Right — login form ── */}
          <main className="flex-1 bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-8">
            <div className="w-full max-w-85">

              {/* Header */}
              <div className="mb-6">
                <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Welcome back
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Select your role and enter your credentials
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>

                {/* Role selector */}
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Select your role
                </label>

                <div className="grid grid-cols-2 gap-1.5 mb-4">
                  {ROLES.filter((r) => !r.wide).map((role) => (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => handleSelectRole(role.key)}
                      className={[
                        'flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        selected === role.key
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:border-blue-500'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-slate-750',
                      ].join(' ')}
                    >
                      <span
                        className={
                          selected === role.key
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }
                      >
                        {role.icon}
                      </span>
                      <span
                        className={[
                          'text-[11px] font-semibold leading-tight',
                          selected === role.key
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-600 dark:text-slate-400',
                        ].join(' ')}
                      >
                        {role.label}
                      </span>
                    </button>
                  ))}

                  {/* Owner — full width */}
                  {ROLES.filter((r) => r.wide).map((role) => (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => handleSelectRole(role.key)}
                      className={[
                        'col-span-2 flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        selected === role.key
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:border-blue-500'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700',
                      ].join(' ')}
                    >
                      <span
                        className={
                          selected === role.key
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }
                      >
                        {role.icon}
                      </span>
                      <div className="text-left">
                        <span
                          className={[
                            'text-[11px] font-semibold block',
                            selected === role.key
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-600 dark:text-slate-400',
                          ].join(' ')}
                        >
                          {role.label}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {role.desc}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected role confirmation bar */}
                {selectedRole && (
                  <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 mb-4">
                    <span className="text-blue-500 dark:text-blue-400 shrink-0">
                      {selectedRole.icon}
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        Signing in as {selectedRole.label}
                      </p>
                      <p className="text-[10px] text-blue-500/70 dark:text-blue-400/60">
                        {selectedRole.desc}
                      </p>
                    </div>
                  </div>
                )}

                {/* Username field */}
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Username
                </label>
                <div className="mb-4">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setError('')
                    }}
                    disabled={!selected}
                    placeholder={selected ? 'Enter your username' : 'Select a role first'}
                    autoComplete="username"
                    className={[
                      'w-full h-9 pl-3 pr-3 text-sm rounded-lg border outline-none transition-all',
                      'text-slate-800 dark:text-slate-100',
                      'placeholder:text-slate-400 dark:placeholder:text-slate-600',
                      selected
                        ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                        : 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 cursor-not-allowed',
                    ].join(' ')}
                  />
                </div>

                {/* Password field */}
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative mb-4">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    disabled={!selected}
                    placeholder={selected ? 'Enter your password' : 'Select a role first'}
                    autoComplete="current-password"
                    className={[
                      'w-full h-9 pl-3 pr-10 text-sm rounded-lg border outline-none transition-all',
                      'text-slate-800 dark:text-slate-100',
                      'placeholder:text-slate-400 dark:placeholder:text-slate-600',
                      selected
                        ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                        : 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 cursor-not-allowed',
                    ].join(' ')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    <EyeIcon open={showPw} />
                  </button>
                </div>

                {/* Error / success messages */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                {success && !error && (
                  <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">{success}</p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !selected || !username || !password}
                  className={[
                    'w-full h-9 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150',
                    loading || !selected || !username || !password
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white active:scale-[0.98]',
                  ].join(' ')}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>

                {/* Divider + footer */}
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 text-center">
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                    No account? Contact the clinic owner.
                    <br />
                    Credentials are set by the administrator.
                  </p>
                </div>

              </form>
            </div>
          </main>

        </div>
      </div>
    </div>
  )
}