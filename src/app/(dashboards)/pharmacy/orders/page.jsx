'use client'

// InternalOrdersTab — lets the pharmacist fulfil supply orders placed by the
// doctor (consultation room) and the lab tech. Each order carries the
// requester's name, department, requested items, and a status
// (pending / fulfilled / cancelled).
//
// APIs:
//   GET   /api/pharmacy/orders               → { orders: [...], stats: { pending, fulfilled, cancelled, total } }
//   PATCH /api/pharmacy/orders/:id/fulfill   → Body: { fulfilled_by: string }
//                                                Returns { success, order }
//
// Each order: { id, requested_by, department, status, requested_at,
//               fulfilled_at, fulfilled_by, items: [{name, quantity, notes}] }

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, formatDate, formatDateTime, timeAgo, badgeClass, cap,
} from '@/utils/helpers'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Department badge colours: Doctor=blue, Lab=purple (per task spec)
const DEPT_BADGES = {
  doctor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const DEPT_LABELS = {
  doctor: 'Doctor',
  lab: 'Lab',
}

function deptBadgeClass(dept) {
  return DEPT_BADGES[dept] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'
}

function deptLabel(dept) {
  return DEPT_LABELS[dept] || cap(dept)
}

export default function InternalOrdersTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const pharmacistName = user?.name || 'Pharmacist'
  const [filter, setFilter] = useState('all')
  const [fulfilling, setFulfilling] = useState(null)

  // API: GET /api/pharmacy/orders — returns all internal orders + stats
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pharmacy', 'orders'],
    queryFn: () => api.get('/api/pharmacy/orders'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // API: PATCH /api/pharmacy/orders/:id/fulfill — mark as fulfilled
  const fulfillMutation = useMutation({
    mutationFn: ({ id, fulfilled_by }) =>
      api.patch(`/api/pharmacy/orders/${id}/fulfill`, { fulfilled_by }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'orders'] })
    },
  })

  const orders = data?.orders || []
  const stats = data?.stats || { pending: 0, fulfilled: 0, cancelled: 0, total: 0 }

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  const handleFulfill = async (order) => {
    try {
      await fulfillMutation.mutateAsync({ id: order.id, fulfilled_by: pharmacistName })
      toast.success(`Order #${order.id} fulfilled for ${deptLabel(order.department)}`)
      setFulfilling(null)
    } catch (err) {
      toast.error(err.message || 'Could not fulfil order')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={3} />
      </div>
    )
  }
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Stat cards: Pending / Fulfilled / Total */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="clock" color="amber" label="Pending" value={stats.pending} sublabel="awaiting fulfilment" />
        <StatCard icon="checkCircle" color="green" label="Fulfilled" value={stats.fulfilled} sublabel="delivered to staff" />
        <StatCard icon="shoppingCart" color="blue" label="Total Orders" value={stats.total} sublabel="all-time" />
      </div>

      {/* Filter pills */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => {
            const count = s.key === 'all'
              ? orders.length
              : orders.filter((o) => o.status === s.key).length
            return (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={[
                  'px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5',
                  filter === s.key
                    ? 'bg-[#1a6cbf] text-white'
                    : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700',
                ].join(' ')}
              >
                {s.label}
                <span className={[
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  filter === s.key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400',
                ].join(' ')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5"
        >
          <Icon name="refresh" size={13} /> Refresh
        </button>
      </div>

      {/* Orders list */}
      {!filtered.length ? (
        <EmptyState
          icon="shoppingCart"
          title={filter === 'all' ? 'No internal orders yet' : `No ${filter} orders`}
          description={filter === 'all'
            ? 'When the doctor or lab tech request supplies, those orders will appear here for fulfilment.'
            : 'Try a different filter to see other orders.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onFulfill={() => setFulfilling(o)}
            />
          ))}
        </div>
      )}

      {/* Fulfil confirmation modal */}
      {fulfilling && (
        <FulfillModal
          order={fulfilling}
          pharmacistName={pharmacistName}
          loading={fulfillMutation.isPending}
          onClose={() => setFulfilling(null)}
          onConfirm={() => handleFulfill(fulfilling)}
        />
      )}
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onFulfill }) {
  const totalQty = order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)

  return (
    <Card className="p-4">
      {/* Top row: requester + status + action */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Department icon avatar */}
          <div className={[
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            order.department === 'doctor'
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : order.department === 'lab'
                ? 'bg-purple-100 dark:bg-purple-900/30'
                : 'bg-gray-100 dark:bg-gray-700/40',
          ].join(' ')}>
            <Icon
              name={order.department === 'doctor' ? 'stethoscope' : order.department === 'lab' ? 'flask' : 'user'}
              size={18}
              className={
                order.department === 'doctor'
                  ? 'text-blue-600 dark:text-blue-400'
                  : order.department === 'lab'
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-gray-500 dark:text-gray-400'
              }
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {order.requested_by}
              </span>
              <Badge className={deptBadgeClass(order.department)}>
                {deptLabel(order.department)}
              </Badge>
              <Badge className={badgeClass(order.status)}>{cap(order.status)}</Badge>
              <span className="text-[11px] text-gray-400">
                Order #{order.id} · {timeAgo(order.requested_at)} · {formatTime(order.requested_at)}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {totalQty} units total
            </p>
          </div>
        </div>

        {/* Status-specific side panel + action */}
        <div className="shrink-0 flex items-center gap-2">
          {order.status === 'pending' && (
            <button
              onClick={onFulfill}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
            >
              <Icon name="check" size={13} /> Fulfil
            </button>
          )}
          {order.status === 'fulfilled' && (
            <div className="text-right">
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Fulfilled by {order.fulfilled_by || 'Pharmacy'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {formatDate(order.fulfilled_at)} · {formatTime(order.fulfilled_at)}
              </p>
            </div>
          )}
          {order.status === 'cancelled' && (
            <div className="text-right">
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Cancelled</p>
            </div>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {order.items.map((it, i) => (
          <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{it.name}</p>
              <span className="text-[12px] font-semibold text-[#1a6cbf] dark:text-blue-400 tabular-nums shrink-0">×{it.quantity}</span>
            </div>
            {it.notes && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{it.notes}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Fulfil modal ─────────────────────────────────────────────────────────────

function FulfillModal({ order, pharmacistName, loading, onClose, onConfirm }) {
  const totalQty = order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#1a6cbf] flex items-center justify-center shrink-0">
              <Icon name="checkCircle" size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                Fulfil Order #{order.id}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Mark this order as fulfilled once supplies are handed over
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Requester summary */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 bg-gray-50/50 dark:bg-gray-700/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {order.requested_by}
              </span>
              <Badge className={deptBadgeClass(order.department)}>
                {deptLabel(order.department)}
              </Badge>
              <Badge className={badgeClass(order.status)}>{cap(order.status)}</Badge>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Requested {timeAgo(order.requested_at)} · {formatDateTime(order.requested_at)}
            </p>
          </div>

          {/* Items to hand over */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Items to hand over ({order.items.length} · {totalQty} units)
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
              {order.items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Icon name="box" size={14} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{it.name}</p>
                    {it.notes && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{it.notes}</p>
                    )}
                  </div>
                  <span className="text-[12px] font-semibold text-[#1a6cbf] dark:text-blue-400 tabular-nums shrink-0">
                    ×{it.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Fulfilment info banner */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 px-3 py-2.5 flex items-start gap-2">
            <Icon name="info" size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300">
              Once confirmed, this order will be marked as <span className="font-semibold">fulfilled by {pharmacistName}</span>.
              The requester will be notified that the supplies are ready for pickup.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
            Confirm Fulfilment
          </button>
        </div>
      </div>
    </div>
  )
}