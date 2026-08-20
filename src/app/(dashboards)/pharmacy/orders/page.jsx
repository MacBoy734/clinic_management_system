'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, formatDate, formatDateTime, timeAgo, badgeClass, cap,
} from '@/utils/helpers'
import socket from '@/lib/socket'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'cancelled', label: 'Cancelled' },
]

const DEPT_BADGES = {
  doctor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  reception: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  admin: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

const DEPT_LABELS = { doctor: 'Doctor', lab: 'Lab', reception: 'Reception', admin: 'Admin' }
const DEPT_ICONS = { doctor: 'stethoscope', lab: 'flask', reception: 'user', admin: 'user' }

const CATEGORY_ICONS = { medication: 'pill', consumable: 'box', general: 'shoppingCart' }
const CATEGORY_LABELS = { medication: 'Medication', consumable: 'Consumable', general: 'General' }

function deptBadgeClass(d) {
  return DEPT_BADGES[d] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'
}
function deptLabel(d) { return DEPT_LABELS[d] || cap(d) }
function deptIcon(d) { return DEPT_ICONS[d] || 'user' }
function categoryIcon(c) { return CATEGORY_ICONS[c] || 'box' }
function categoryLabel(c) { return CATEGORY_LABELS[c] || cap(c) }

function errMsg(err, fallback) {
  return err?.response?.data?.error || err?.data?.error || err?.message || fallback
}

export default function InternalOrdersTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const pharmacistName = user?.name || 'Pharmacist'
  const [filter, setFilter] = useState('all')
  const [fulfilling, setFulfilling] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['pharmacy', 'orders'],
    queryFn: () => api.get('/api/pharmacy/orders'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pharmacy', 'orders'] })
    // Stock moved — the inventory table and the counter search are stale.
    queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stock'] })
    queryClient.invalidateQueries({ queryKey: ['pharmacy', 'products'] })
  }

  useEffect(() => {
    socket.on('order:new', () => invalidate())
    socket.on('prescription:returned', () => invalidate())

    return () => {
      socket.off('prescription:new')
      socket.off('prescription:returned')
    }
  }, [queryClient])

  const fulfillMutation = useMutation({
    mutationFn: ({ id, lines }) => api.patch(`/api/pharmacy/orders/${id}/fulfill`, { lines }),
    onSuccess: invalidate,
  })


  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => api.patch(`/api/pharmacy/orders/${id}/cancel`, { reason }),
    onSuccess: invalidate,
  })

  const orders = data?.orders || []
  const stats = data?.stats || { pending: 0, fulfilled: 0, cancelled: 0, total: 0 }
  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  const handleFulfill = async (order, lines) => {
    try {
      await fulfillMutation.mutateAsync({ id: order.id, lines })
      const issued = lines.reduce((s, l) => s + l.quantity, 0)
      toast.success(`Order #${order.id} fulfilled — ${issued} units issued to ${deptLabel(order.department)}`)
      setFulfilling(null)
    } catch (err) {
      // 409 carries the exact shortfall. Say which line and by how much.
      const shortfalls = err?.response?.data?.shortfalls || err?.data?.shortfalls
      if (Array.isArray(shortfalls) && shortfalls.length) {
        toast.error(
          shortfalls
            .map((s) => `${s.name}: issuing ${s.requested}, only ${s.available} on hand`)
            .join(' · ')
        )
        return
      }
      toast.error(errMsg(err, 'Could not fulfil order'))
    }
  }

  const handleCancel = async (order, reason) => {
    try {
      await cancelMutation.mutateAsync({ id: order.id, reason })
      toast.success(`Order #${order.id} cancelled`)
      setCancelling(null)
    } catch (err) {
      toast.error(errMsg(err, 'Could not cancel order'))
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
  if (error) return <ErrorState message={errMsg(error, 'Could not load orders')} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="clock" color="amber" label="Pending" value={stats.pending} sublabel="awaiting fulfilment" />
        <StatCard icon="checkCircle" color="green" label="Fulfilled" value={stats.fulfilled} sublabel="issued to staff" />
        <StatCard icon="shoppingCart" color="blue" label="Total Orders" value={stats.total} sublabel="all-time" />
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => {
            const count = s.key === 'all' ? orders.length : orders.filter((o) => o.status === s.key).length
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
          disabled={isFetching}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
        >
          <Icon
            name="refresh"
            size={13}
            className={isFetching ? 'animate-spin' : ''}
          />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Orders */}
      {!filtered.length ? (
        <EmptyState
          icon="shoppingCart"
          title={filter === 'all' ? 'No internal orders yet' : `No ${filter} orders`}
          description={filter === 'all'
            ? 'When the doctor, lab or reception request supplies, those orders appear here for fulfilment.'
            : 'Try a different filter to see other orders.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onFulfill={() => setFulfilling(o)}
              onCancel={() => setCancelling(o)}
            />
          ))}
        </div>
      )}

      {fulfilling && (
        <FulfillModal
          order={fulfilling}
          pharmacistName={pharmacistName}
          loading={fulfillMutation.isPending}
          onClose={() => setFulfilling(null)}
          onConfirm={(lines) => handleFulfill(fulfilling, lines)}
        />
      )}

      {cancelling && (
        <CancelModal
          order={cancelling}
          loading={cancelMutation.isPending}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => handleCancel(cancelling, reason)}
        />
      )}
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onFulfill, onCancel }) {
  const totalQty = order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  const issuedQty = order.items.reduce((s, it) => s + (Number(it.fulfilled_qty) || 0), 0)

  // Flag the problem on the card, before the pharmacist opens the modal.
  const shortLines = order.status === 'pending'
    ? order.items.filter((it) => it.is_tracked && (it.available_stock ?? 0) < it.quantity)
    : []

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={[
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            order.department === 'doctor'
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : order.department === 'lab'
                ? 'bg-purple-100 dark:bg-purple-900/30'
                : 'bg-gray-100 dark:bg-gray-700/40',
          ].join(' ')}>
            <Icon
              name={deptIcon(order.department)}
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
              <Badge className={deptBadgeClass(order.department)}>{deptLabel(order.department)}</Badge>
              <Badge className={badgeClass(order.status)}>{cap(order.status)}</Badge>
              <span className="text-[11px] text-gray-400">
                Order #{order.id} · {timeAgo(order.requested_at)} · {formatTime(order.requested_at)}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {totalQty} units requested
              {order.status === 'fulfilled' && issuedQty !== totalQty ? ` · ${issuedQty} issued` : ''}
            </p>
            {order.notes && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 italic">{order.notes}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {order.status === 'pending' && (
            <>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400"
              >
                Cancel
              </button>
              <button
                onClick={onFulfill}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
              >
                <Icon name="check" size={13} /> Fulfil
              </button>
            </>
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
            <div className="text-right max-w-56">
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Cancelled</p>
              {order.cancel_reason && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{order.cancel_reason}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {shortLines.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
          <Icon name="alert" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Not enough stock for {shortLines.map((l) => l.name).join(', ')}. Issue a smaller quantity or restock first.
          </p>
        </div>
      )}

      {/* Lines */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {order.items.map((it) => {
          const short = it.is_tracked && (it.available_stock ?? 0) < it.quantity
          return (
            <div key={it.id} className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon name={categoryIcon(it.category)} size={11} className="text-gray-400 shrink-0" />
                  <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{it.name}</p>
                </div>
                <span className="text-[12px] font-semibold text-[#1a6cbf] dark:text-blue-400 tabular-nums shrink-0">
                  ×{it.quantity}
                </span>
              </div>
              <p className={[
                'text-[10px] mt-0.5',
                !it.is_tracked
                  ? 'text-gray-400'
                  : short
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400',
              ].join(' ')}>
                {!it.is_tracked
                  ? 'Not in catalogue — no stock movement'
                  : `${it.available_stock} ${it.unit || ''} on hand`}
              </p>
              {it.notes && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{it.notes}</p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Fulfil modal ─────────────────────────────────────────────────────────────

function FulfillModal({ order, pharmacistName, loading, onClose, onConfirm }) {
  // Pre-fill each line with what was asked for, capped at what is on hand.
  // A short shelf becomes an editable number rather than a rejection.
  const [quantities, setQuantities] = useState(() => {
    const init = {}
    order.items.forEach((it) => {
      init[it.id] = it.is_tracked
        ? Math.min(it.quantity, it.available_stock ?? 0)
        : it.quantity
    })
    return init
  })

  useEffect(() => {
    setQuantities((prev) => {
      const next = { ...prev }
      order.items.forEach((it) => {
        if (next[it.id] == null) {
          next[it.id] = it.is_tracked ? Math.min(it.quantity, it.available_stock ?? 0) : it.quantity
        }
      })
      return next
    })
  }, [order])

  const setQty = (itemId, value, max) => {
    const n = Math.max(0, Math.min(max, Number(value) || 0))
    setQuantities((q) => ({ ...q, [itemId]: n }))
  }

  const totalRequested = order.items.reduce((s, it) => s + it.quantity, 0)
  const totalIssuing = order.items.reduce((s, it) => s + (quantities[it.id] || 0), 0)
  const isPartial = totalIssuing < totalRequested
  const nothingToIssue = totalIssuing === 0
  const movesStock = order.items.some((it) => it.is_tracked && (quantities[it.id] || 0) > 0)

  const lines = order.items.map((it) => ({ item_id: it.id, quantity: quantities[it.id] || 0 }))

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
                Set what you are actually handing over
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
          {/* Requester */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 bg-gray-50/50 dark:bg-gray-700/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {order.requested_by}
              </span>
              <Badge className={deptBadgeClass(order.department)}>{deptLabel(order.department)}</Badge>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Requested {timeAgo(order.requested_at)} · {formatDateTime(order.requested_at)}
            </p>
            {order.notes && (
              <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 italic">{order.notes}</p>
            )}
          </div>

          {/* Lines */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Items ({order.items.length}) · issuing {totalIssuing} of {totalRequested} units
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
              {order.items.map((it) => {
                const onHand = it.available_stock ?? 0
                const max = it.is_tracked ? onHand : it.quantity
                const value = quantities[it.id] ?? 0
                const short = it.is_tracked && onHand < it.quantity

                return (
                  <div key={it.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <Icon
                          name={categoryIcon(it.category)}
                          size={14}
                          className="text-blue-600 dark:text-blue-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
                            {it.name}
                          </p>
                          {it.category && (
                            <span className="text-[10px] text-gray-400">
                              {categoryLabel(it.category)}
                              {it.sub_category ? ` · ${cap(it.sub_category)}` : ''}
                            </span>
                          )}
                        </div>
                        <p className={[
                          'text-[11px] mt-0.5',
                          !it.is_tracked
                            ? 'text-gray-400'
                            : short
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-gray-500 dark:text-gray-400',
                        ].join(' ')}>
                          Asked {it.quantity}
                          {it.is_tracked
                            ? ` · ${onHand} ${it.unit || ''} on hand`
                            : ' · not in catalogue, no stock movement'}
                        </p>
                      </div>
                      <div className="shrink-0 w-20">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={value}
                          disabled={loading}
                          onChange={(e) => setQty(it.id, e.target.value, max)}
                          className="w-full h-8 px-2 text-[13px] text-right tabular-nums rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 disabled:opacity-50"
                        />
                      </div>
                    </div>
                    {it.notes && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-10">{it.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* What confirming does */}
          {nothingToIssue ? (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-2.5 flex items-start gap-2">
              <Icon name="alert" size={14} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-700 dark:text-red-300">
                Every line is set to zero. Raise at least one quantity, or cancel the order instead.
              </p>
            </div>
          ) : (
            <div className={[
              'rounded-lg border px-3 py-2.5 flex items-start gap-2',
              isPartial
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50',
            ].join(' ')}>
              <Icon
                name="info"
                size={14}
                className={`mt-0.5 shrink-0 ${isPartial ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}
              />
              <p className={`text-[11px] ${isPartial ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'}`}>
                {isPartial
                  ? `Issuing ${totalIssuing} of ${totalRequested} units. The order closes as fulfilled and the shortfall is recorded against each line.`
                  : 'Issuing everything that was asked for.'}
                {movesStock && ' Stock is deducted and written to the ledger when you confirm.'}
                {` Recorded as fulfilled by ${pharmacistName}.`}
              </p>
            </div>
          )}
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
            onClick={() => onConfirm(lines)}
            disabled={loading || nothingToIssue}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <Icon name="refresh" size={14} className="animate-spin" />
              : <Icon name="check" size={14} />}
            Confirm Fulfilment
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel modal ─────────────────────────────────────────────────────────────

function CancelModal({ order, loading, onClose, onConfirm }) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
            Cancel Order #{order.id}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {order.requested_by} ({deptLabel(order.department)}) will be told why.
          </p>
        </div>

        <div className="p-5">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Reason
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. out of stock until Thursday's delivery"
            className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Nothing was handed over, so no stock moves.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50"
          >
            Keep Order
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || !reason.trim()}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <Icon name="refresh" size={14} className="animate-spin" />
              : <Icon name="x" size={14} />}
            Cancel Order
          </button>
        </div>
      </div>
    </div>
  )
}