'use client'

// AdminLogsPage — THE single audit surface (the Settings audit sub-tab is removed).
// Reads the existing AuditLog model. No mocks, no SystemLog proposal.
// APIs:
//   GET /api/admin/logs?page=&limit=&category=&search=   → { logs, total }
//   GET /api/admin/logs/stats                            → { total_today, payment_today, patient_today }
// log shape: { id, category, action, description, user, role, ip, timestamp }

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ─── Categories — aligned to AuditLog.category values in the schema ──────────
const CATEGORIES = {
  patient:      { label: 'Patient',      rail: 'bg-blue-400',    badge: 'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400   border-blue-100   dark:border-blue-700/40'   },
  payment:      { label: 'Payment',      rail: 'bg-emerald-400', badge: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40' },
  lab:          { label: 'Lab',          rail: 'bg-purple-400',  badge: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-700/40' },
  prescription: { label: 'Prescription', rail: 'bg-teal-400',    badge: 'bg-teal-50   dark:bg-teal-900/20   text-teal-700   dark:text-teal-400   border-teal-100   dark:border-teal-700/40'   },
  pharmacy:     { label: 'Pharmacy',     rail: 'bg-cyan-400',    badge: 'bg-cyan-50   dark:bg-cyan-900/20   text-cyan-700   dark:text-cyan-400   border-cyan-100   dark:border-cyan-700/40'   },
  inventory:    { label: 'Inventory',    rail: 'bg-orange-400',  badge: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-700/40' },
  expense:      { label: 'Expense',      rail: 'bg-rose-400',    badge: 'bg-rose-50   dark:bg-rose-900/20   text-rose-700   dark:text-rose-400   border-rose-100   dark:border-rose-700/40'   },
  restock:      { label: 'Restock',      rail: 'bg-amber-400',   badge: 'bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-400  border-amber-100  dark:border-amber-700/40'  },
  staff:        { label: 'Staff',        rail: 'bg-slate-400',   badge: 'bg-gray-50   dark:bg-gray-800/60   text-gray-600   dark:text-gray-400   border-gray-100   dark:border-gray-700/40'   },
}
const FALLBACK_CAT = { label: 'Other', rail: 'bg-gray-300', badge: 'bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 border-gray-100 dark:border-gray-700/40' }

const ROLE_COLORS = {
  receptionist: 'text-blue-600   dark:text-blue-400',
  doctor:       'text-emerald-600 dark:text-emerald-400',
  lab_tech:     'text-purple-600  dark:text-purple-400',
  pharmacist:   'text-teal-600    dark:text-teal-400',
  admin:        'text-amber-600   dark:text-amber-400',
}
const ROLE_LABELS = {
  receptionist: 'Receptionist',
  doctor:       'Doctor',
  lab_tech:     'Lab Tech',
  pharmacist:   'Pharmacist',
  admin:        'Admin',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-KE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}
function groupByDate(logs) {
  return logs.reduce((groups, log) => {
    const date = new Date(log.timestamp).toDateString()
    if (!groups[date]) groups[date] = []
    groups[date].push(log)
    return groups
  }, {})
}

// Highlights sensitive entries
function isAlert(log) {
  return (
    log.action === 'Session Terminated' ||
    log.action === 'Settings Updated' ||
    /failed/i.test(log.action)
  )
}

// ─── Single log row ───────────────────────────────────────────────────────────
function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false)
  const cat = CATEGORIES[log.category] || FALLBACK_CAT
  const alert = isAlert(log)

  return (
    <div
      className={`relative flex gap-0 group transition-colors ${
        alert
          ? 'bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50/60 dark:hover:bg-red-900/15'
          : 'hover:bg-gray-50/60 dark:hover:bg-blue-900/10'
      }`}
    >
      <div className={`w-0.5 shrink-0 ${cat.rail} opacity-70`} />

      <div className="flex-1 flex items-start gap-4 px-5 py-3">
        {/* Timestamp */}
        <div className="w-20 shrink-0 pt-0.5">
          <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 tabular-nums">
            {formatTime(log.timestamp)}
          </p>
        </div>

        {/* Category badge */}
        <div className="w-24 shrink-0 pt-0.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${cat.badge}`}>
            {cat.label}
          </span>
        </div>

        {/* Action + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-[13px] font-semibold ${
              alert ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
            }`}>
              {log.action}
            </p>
            {alert && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                ⚠ Alert
              </span>
            )}
          </div>
          {log.description && (
            <p
              className={`text-[11px] font-mono mt-0.5 transition-all ${
                expanded ? '' : 'truncate'
              } text-gray-400 dark:text-gray-500`}
            >
              {log.description}
            </p>
          )}
          {log.description && log.description.length > 80 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-[#1a6cbf] dark:text-blue-400 hover:underline mt-0.5"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          {log.ip && (
            <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5 font-mono">IP: {log.ip}</p>
          )}
        </div>

        {/* Actor */}
        <div className="w-36 shrink-0 text-right pt-0.5">
          <p className={`text-[12px] font-semibold ${
            log.role ? ROLE_COLORS[log.role] : 'text-gray-400 dark:text-gray-500'
          }`}>
            {log.user}
          </p>
          {log.role && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {ROLE_LABELS[log.role] || log.role}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const ALL_CATEGORIES = ['all', ...Object.keys(CATEGORIES)]
const LIMIT = 50

export default function AdminLogsPage() {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [page, setPage] = useState(1)

  const { data: logsData, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'logs', { page, category, search }],
    queryFn: () => api.get(
      `/api/admin/logs?page=${page}&limit=${LIMIT}&category=${category}&search=${encodeURIComponent(search)}`
    ),
    keepPreviousData: true,
    staleTime: 15000,
  })

  const { data: stats } = useQuery({
    queryKey: ['admin', 'logs-stats'],
    queryFn: () => api.get('/api/admin/logs/stats'),
    staleTime: 30000,
    refetchInterval: 60000,
  })

  const logs = logsData?.logs ?? []
  const total = logsData?.total ?? 0

  // alerts-only is a client-side view over the current page
  const filtered = alertsOnly ? logs.filter(isAlert) : logs

  const grouped = groupByDate(filtered)
  const dateKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a))
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const alertCount = logs.filter(isAlert).length

  const handleExportCsv = () => {
    if (!filtered.length) return
    const rows = [['Timestamp', 'Category', 'Action', 'Description', 'User', 'Role', 'IP']]
    filtered.forEach((l) => rows.push([
      l.timestamp, l.category, l.action, l.description || '', l.user || '', l.role || '', l.ip || '',
    ]))
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-page${page}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">System Logs</h2>
          <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
            Full audit trail — every action across all roles
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!filtered.length}
          className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-[13px] font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Export page
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Actions today',  value: stats?.total_today ?? 0,   accent: 'border-gray-200   dark:border-gray-700/60'   },
          { label: 'Payment events', value: stats?.payment_today ?? 0, accent: 'border-emerald-200 dark:border-emerald-700/40' },
          { label: 'Patient events', value: stats?.patient_today ?? 0, accent: 'border-blue-200   dark:border-blue-700/40'   },
        ].map((s) => (
          <div key={s.label} className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 transition-colors ${s.accent}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold leading-none mt-1 text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Main panel */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden transition-colors">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 shrink-0">
            {total.toLocaleString()} entries
          </p>

          <button
            onClick={() => setAlertsOnly((a) => !a)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              alertsOnly
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-400'
                : 'bg-white dark:bg-[#1e293b] border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>⚠</span>
            Alerts only
            {alertCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                alertsOnly ? 'bg-red-200 dark:bg-red-800/50 text-red-700 dark:text-red-300' : 'bg-red-500 text-white'
              }`}>
                {alertCount}
              </span>
            )}
          </button>

          <div className="flex-1" />

          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1) }}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors capitalize"
          >
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c === 'all' ? 'All categories' : CATEGORIES[c]?.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
            </svg>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search action, description, staff…"
              className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-52 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/50">
          <div className="w-0.5 shrink-0" />
          <p className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Time</p>
          <p className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Category</p>
          <p className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Action · Details</p>
          <p className="w-36 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Staff</p>
        </div>

        {/* Log entries grouped by date */}
        {isLoading ? (
          <div className="p-5 space-y-2">
            {[1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-20 text-center">
            <p className="text-[15px] font-semibold text-red-500">Could not load logs</p>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">{error?.message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[15px] font-semibold text-gray-500 dark:text-gray-400">No log entries found</p>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">Try adjusting the filters or search term</p>
          </div>
        ) : (
          <div>
            {dateKeys.map((dateKey) => (
              <div key={dateKey}>
                <div className="flex items-center gap-3 px-5 py-2 bg-gray-50/50 dark:bg-gray-800/30 border-y border-gray-100 dark:border-gray-700/40 sticky top-0 z-10">
                  <div className="w-0.5 shrink-0 h-3 bg-transparent" />
                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    {formatDate(grouped[dateKey][0].timestamp)}
                  </p>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700/60" />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {grouped[dateKey].length} events
                  </p>
                </div>
                {grouped[dateKey].map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Page {page} of {totalPages} · {total.toLocaleString()} total entries
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ‹
              </button>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}