'use client'

/**
 * NotificationsTab.jsx
 *
 * Full notifications page — used by every role at their own route:
 *   /reception/notifications
 *   /doctor/notifications
 *   /lab/notifications
 *   /pharmacy/notifications
 *   /admin/notifications
 *
 * Features over the dropdown preview:
 *   - Full pagination (all pages, not just 5)
 *   - Time window filter (24hrs / 7 days / 30 days / all time)
 *   - Type filter (all types or a specific one)
 *   - Larger, more readable card layout
 *   - Total count + empty state per filter combination
 *   - Real-time updates via socket (same as layout)
 *
 * Props:
 *   title   String   Optional heading override (default "Notifications")
 */

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import socket from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'

// ─── Shared config (mirrors dashboardLayout) ──────────────────────────────────

const NOTIF_TYPE_CONFIG = {
  'patient:new':      { dot: 'bg-blue-400',    label: 'New patient',       bg: 'bg-blue-50   dark:bg-blue-900/10'   },
  'visit:forwarded':  { dot: 'bg-indigo-400',  label: 'Visit forwarded',   bg: 'bg-indigo-50 dark:bg-indigo-900/10' },
  'visit:completed':  { dot: 'bg-emerald-400', label: 'Visit completed',   bg: 'bg-emerald-50 dark:bg-emerald-900/10' },
  'lab:results_ready':{ dot: 'bg-purple-400',  label: 'Lab ready',         bg: 'bg-purple-50 dark:bg-purple-900/10' },
  'lab:request_new':  { dot: 'bg-violet-400',  label: 'Lab requested',     bg: 'bg-violet-50 dark:bg-violet-900/10' },
  'rx:new':           { dot: 'bg-teal-400',    label: 'New prescription',  bg: 'bg-teal-50   dark:bg-teal-900/10'   },
  'rx:dispensed':     { dot: 'bg-cyan-400',    label: 'Rx dispensed',      bg: 'bg-cyan-50   dark:bg-cyan-900/10'   },
  'rx:returned':      { dot: 'bg-orange-400',  label: 'Rx returned',       bg: 'bg-orange-50 dark:bg-orange-900/10' },
  'rx:cancelled':     { dot: 'bg-red-400',     label: 'Rx cancelled',      bg: 'bg-red-50    dark:bg-red-900/10'    },
  'payment:received': { dot: 'bg-emerald-400', label: 'Payment received',  bg: 'bg-emerald-50 dark:bg-emerald-900/10' },
  'stock:low':        { dot: 'bg-amber-400',   label: 'Low stock',         bg: 'bg-amber-50  dark:bg-amber-900/10'  },
  'stock:out':        { dot: 'bg-red-500',     label: 'Out of stock',      bg: 'bg-red-50    dark:bg-red-900/10'    },
}
const DEFAULT_CONFIG = { dot: 'bg-gray-300', label: 'Notification', bg: 'bg-gray-50 dark:bg-gray-800/40' }

// ─── Time window options ──────────────────────────────────────────────────────

const TIME_OPTIONS = [
  { label: 'Last 24 hrs', value: 24    },
  { label: 'Last 7 days', value: 168   },
  { label: 'Last 30 days',value: 720   },
  { label: 'All time',    value: 0     },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days === 1)   return 'Yesterday'
  if (days < 7)     return `${days} days ago`
  return new Date(date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Single notification card ─────────────────────────────────────────────────

function NotifCard({ n }) {
  const cfg = NOTIF_TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG

  return (
    <div className={`rounded-xl border border-gray-100 dark:border-gray-700/60 overflow-hidden transition-colors ${cfg.bg}`}>
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Dot */}
        <div className="shrink-0 mt-1">
          <span className={`w-2.5 h-2.5 rounded-full block ${cfg.dot}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {cfg.label}
              </span>
              {n.visit_id && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-1.5 py-0.5 rounded font-mono">
                  Visit #{n.visit_id}
                </span>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 tabular-nums">
                {timeAgo(n.timestamp)}
              </p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">
                {formatDateTime(n.timestamp)}
              </p>
            </div>
          </div>

          {n.title && (
            <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 leading-snug">
              {n.title}
            </p>
          )}
          <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
            {n.message}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function NotifSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-700/60 px-5 py-4 animate-pulse">
          <div className="flex items-start gap-4">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
              </div>
              <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotificationsTab({ title = 'Notifications' }) {
  const qc   = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const [page,       setPage]       = useState(1)
  const [hours,      setHours]      = useState(24)
  const [typeFilter, setTypeFilter] = useState('all')

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [hours, typeFilter])

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['notifications', 'full', page, hours, typeFilter],
    queryFn:  () => {
      const params = new URLSearchParams({
        page:     String(page),
        per_page: '20',
        hours:    String(hours),
      })
      return api.get(`/api/notifications?${params}`)
    },
    keepPreviousData: true,
    staleTime: 20000,
    refetchInterval: 60000,
  })

  // ── Socket — live updates ──────────────────────────────────────────────────
  useEffect(() => {
    const handleNew = () => {
      // Always invalidate so the list picks up new items immediately
      qc.invalidateQueries({ queryKey: ['notifications', 'full'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'preview'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'meta'] })
    }
    socket.on('notification:new', handleNew)
    return () => socket.off('notification:new', handleNew)
  }, [qc])

  // ── Data ───────────────────────────────────────────────────────────────────
  const allNotifications = data?.notifications    ?? []
  const pagination       = data?.pagination       ?? {}
  const unreadCount      = data?.unread_count     ?? 0

  // Client-side type filter (API filters by visibility/time, type filtering
  // done on the returned set — avoids adding another query param to the backend)
  const notifications = typeFilter === 'all'
    ? allNotifications
    : allNotifications.filter(n => n.type === typeFilter)

  // Unique types present in the current result set (for the filter pills)
  const typesInResult = [...new Set(allNotifications.map(n => n.type))]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5 py-2">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[17px] font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} new in the last 24 hrs`
              : 'No new notifications in the last 24 hrs'}
            {isFetching && !isLoading && (
              <span className="ml-2 text-[#1a6cbf] dark:text-blue-400">· Refreshing…</span>
            )}
          </p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · updates automatically
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">

        {/* Time window */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/40 rounded-lg p-1">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setHours(opt.value)}
              className={[
                'px-3 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap',
                hours === opt.value
                  ? 'bg-white dark:bg-[#1e293b] text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Type filter pills — only show types that exist in the result */}
        {typesInResult.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTypeFilter('all')}
              className={[
                'px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all',
                typeFilter === 'all'
                  ? 'bg-[#0d3d6b] dark:bg-blue-600 text-white border-transparent'
                  : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500',
              ].join(' ')}
            >
              All types
            </button>
            {typesInResult.map(type => {
              const cfg = NOTIF_TYPE_CONFIG[type] ?? DEFAULT_CONFIG
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all',
                    typeFilter === type
                      ? 'bg-[#0d3d6b] dark:bg-blue-600 text-white border-transparent'
                      : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500',
                  ].join(' ')}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <NotifSkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 px-5 py-8 text-center">
          <p className="text-[13px] font-semibold text-red-700 dark:text-red-400 mb-1">
            Failed to load notifications
          </p>
          <p className="text-[12px] text-red-500 dark:text-red-500 mb-4">{error?.message}</p>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['notifications', 'full'] })}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-[12px] font-medium hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700/60 px-5 py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
            No notifications found
          </p>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            {typeFilter !== 'all'
              ? 'Try clearing the type filter or expanding the time window'
              : hours === 24
              ? 'Try expanding the time window to see older notifications'
              : 'Nothing here yet'}
          </p>
          {typeFilter !== 'all' && (
            <button
              onClick={() => setTypeFilter('all')}
              className="mt-3 text-[12px] text-[#1a6cbf] dark:text-blue-400 hover:underline font-medium"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Notification cards */}
          <div className="space-y-2.5">
            {notifications.map(n => <NotifCard key={n.id} n={n} />)}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-white dark:bg-[#1e293b]"
              >
                ← Newer
              </button>

              <div className="text-center">
                <p className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
                  Page {page} of {pagination.total_pages}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {pagination.total ?? 0} total notification{pagination.total !== 1 ? 's' : ''}
                </p>
              </div>

              <button
                onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                disabled={!pagination.has_more}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-white dark:bg-[#1e293b]"
              >
                Older →
              </button>
            </div>
          )}

          {/* Result count when no pagination */}
          {pagination.total_pages <= 1 && notifications.length > 0 && (
            <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 pt-1">
              Showing all {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            </p>
          )}
        </>
      )}
    </div>
  )
}