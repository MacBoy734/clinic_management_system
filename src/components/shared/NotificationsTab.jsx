'use client'

// NotificationsTab — full-page notifications view for ANY role
// API: GET /api/notifications?role=<role> -> { notifications, unread_count }
//
// This is the dedicated Notifications TAB (not the bell dropdown).
// Every role gets this tab in their sidebar for instant updates.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api  from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  StatCard, Card, CardHeader, Badge, EmptyState, ErrorState,
  SkeletonList, SkeletonCard, Icon,
  timeAgo, formatDateTime,
} from '@/utils/helpers'

const TYPE_ICON = {
  lab_ready: 'checkCircle',
  rx_dispensed: 'pill',
  rx_created: 'pill',
  rx_verified: 'checkCircle',
  rx_pending: 'clipboard',
  rx_returned: 'xCircle',
  rx_needs_verification: 'alert',
  patient_waiting: 'clock',
  patient_registered: 'user',
  ready_for_billing: 'receipt',
  internal_order: 'shoppingCart',
  order_pending: 'shoppingCart',
  lab_pending: 'testTube',
  restock_pending: 'package',
  default: 'info',
}

const SEVERITY_STYLE = {
  success: { bg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  warning: { bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  info: { bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'warning', label: 'Urgent' },
  { key: 'success', label: 'Success' },
  { key: 'info', label: 'Info' },
]

export function NotificationsTab() {
  const user = useAuthStore((s) => s.user)
  const role = user?.role || 'doctor'
  const [filter, setFilter] = useState('all')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', role, 'full'],
    queryFn: () => api.get(`/api/notifications?role=${role}`),
    refetchInterval: 15000,
    staleTime: 10000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={6} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const notifications = data?.notifications || []
  const unread = data?.unread_count || 0

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.severity === filter)

  const counts = {
    total: notifications.length,
    urgent: notifications.filter((n) => n.severity === 'warning' || n.severity === 'error').length,
    success: notifications.filter((n) => n.severity === 'success').length,
    info: notifications.filter((n) => n.severity === 'info').length,
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon="bell" color="blue" label="Total" value={counts.total} sublabel="notifications" />
        <StatCard icon="alert" color="amber" label="Urgent" value={counts.urgent} sublabel="need attention" />
        <StatCard icon="checkCircle" color="green" label="Success" value={counts.success} sublabel="completed" />
        <StatCard icon="info" color="purple" label="Info" value={counts.info} sublabel="updates" />
      </div>

      {/* Info banner */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 px-4 py-3 flex items-start gap-2">
        <Icon name="info" size={14} className="text-[#1a6cbf] dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#1a6cbf] dark:text-blue-400">
          Auto-refreshes every 15 seconds. You are viewing notifications for the <span className="font-semibold">{role}</span> role.
          {unread > 0 && ` ${unread} urgent item${unread > 1 ? 's' : ''} need attention.`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
              filter === f.key
                ? 'bg-[#1a6cbf] text-white'
                : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700',
            ].join(' ')}
          >
            {f.label} ({f.key === 'all' ? counts.total : counts[f.key === 'urgent' ? 'urgent' : f.key]})
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <Card className="overflow-hidden">
        <CardHeader title="Notifications" subtitle={`${filtered.length} shown · newest first`} />
        {!filtered.length ? (
          <EmptyState
            icon="bell"
            title="No notifications"
            description="You're all caught up. New events will appear here automatically."
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/40 max-h-[65vh] overflow-y-auto">
            {filtered.map((n) => {
              const iconName = TYPE_ICON[n.type] || TYPE_ICON.default
              const style = SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.info
              return (
                <div key={n.id} className="px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/10 flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                    <Icon name={iconName} size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{n.title}</p>
                      <Badge className={style.badge}>{n.severity}</Badge>
                    </div>
                    <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                      <Icon name="clock" size={11} />
                      <span>{timeAgo(n.timestamp)}</span>
                      <span>·</span>
                      <span>{formatDateTime(n.timestamp)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
