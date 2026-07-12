'use client'

// PharmacyOrdersTab — lets the doctor order consumable supplies (gloves, syringes,
// swabs, etc.) from the in-house pharmacy for the consultation room.
//
// APIs:
//   GET  /api/doctor/orders      → { orders: [...] } — the doctor's existing orders
//   POST /api/pharmacy/orders    → create new order
//        Body: { department: 'doctor', requested_by: string, items: [{name, quantity, notes}] }
//        Returns: { success: true, order }

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api  from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, formatDate, timeAgo, badgeClass, cap,
} from '@/utils/helpers'

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function PharmacyOrdersTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const requestedBy = user?.name || 'Doctor'
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)

  // API: GET /api/doctor/orders
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['doctor', 'orders'],
    queryFn: () => api.get('/api/doctor/orders'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // API: POST /api/pharmacy/orders
  const createMutation = useMutation({
    mutationFn: (body) => api.post('/api/pharmacy/orders', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'orders'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'orders'] })
    },
  })

  const orders = data?.orders || []

  // Stats
  const pendingCount = orders.filter((o) => o.status === 'pending').length
  const fulfilledToday = orders.filter((o) => {
    if (o.status !== 'fulfilled' || !o.fulfilled_at) return false
    const d = new Date(o.fulfilled_at)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
  }).length
  const totalOrders = orders.length

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  const handleSubmit = async (items) => {
    if (!items.length) {
      toast.error('Add at least one item to the order')
      return
    }
    try {
      await createMutation.mutateAsync({
        department: 'doctor',
        requested_by: requestedBy,
        items,
      })
      toast.success('Order sent to pharmacy')
      setShowModal(false)
    } catch (err) {
      toast.error(err.message || 'Could not submit order')
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
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="clock" color="amber" label="Pending" value={pendingCount} sublabel="awaiting fulfilment" />
        <StatCard icon="checkCircle" color="green" label="Fulfilled Today" value={fulfilledToday} sublabel="delivered by pharmacy" />
        <StatCard icon="shoppingCart" color="blue" label="Total Orders" value={totalOrders} sublabel="all-time" />
      </div>

      {/* Header + New Order button */}
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
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
        >
          <Icon name="plus" size={13} /> New Order
        </button>
      </div>

      {/* Orders list */}
      {!filtered.length ? (
        <EmptyState
          icon="shoppingCart"
          title={filter === 'all' ? 'No pharmacy orders yet' : `No ${filter} orders`}
          description={filter === 'all'
            ? 'Order consumable supplies (gloves, syringes, swabs, etc.) from the in-house pharmacy using the “New Order” button.'
            : 'Try a different filter to see other orders.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}

      {showModal && (
        <NewOrderModal
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          loading={createMutation.isPending}
          requestedBy={requestedBy}
        />
      )}
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order }) {
  const totalQty = order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              Order #{order.id}
            </span>
            <Badge className={badgeClass(order.status)}>{cap(order.status)}</Badge>
            <span className="text-[11px] text-gray-400">
              Requested {timeAgo(order.requested_at)} · {formatTime(order.requested_at)}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            By {order.requested_by} · {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {totalQty} units total
          </p>
        </div>
        {order.status === 'fulfilled' && (
          <div className="text-right shrink-0">
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Fulfilled by {order.fulfilled_by || 'Pharmacy'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {formatDate(order.fulfilled_at)} · {formatTime(order.fulfilled_at)}
            </p>
          </div>
        )}
        {order.status === 'cancelled' && (
          <div className="text-right shrink-0">
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Cancelled</p>
          </div>
        )}
      </div>
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

// ─── New Order modal ──────────────────────────────────────────────────────────

function NewOrderModal({ onClose, onSubmit, loading, requestedBy }) {
  const [items, setItems] = useState([{ name: '', quantity: 1, notes: '' }])

  const updateItem = (i, field, value) => {
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }
  const addItem = () => setItems((arr) => [...arr, { name: '', quantity: 1, notes: '' }])
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))

  const validItems = items
    .filter((it) => it.name.trim() && Number(it.quantity) > 0)
    .map((it) => ({
      name: it.name.trim(),
      quantity: Number(it.quantity) || 1,
      notes: it.notes?.trim() || '',
    }))

  const totalUnits = validItems.reduce((s, it) => s + it.quantity, 0)

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {validItems.length} item{validItems.length !== 1 ? 's' : ''} · {totalUnits} units
        </span>
      </div>
      <button
        onClick={() => onSubmit(validItems)}
        disabled={loading || validItems.length === 0}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
        Submit Order
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">New Pharmacy Order</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Order consumable supplies · requested by {requestedBy}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Item #{i + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(i)}
                      className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1"
                    >
                      <Icon name="trash" size={12} /> Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Item Name *</label>
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => updateItem(i, 'name', e.target.value)}
                      placeholder="e.g. Surgical Gloves (M)"
                      className={inputCls}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={it.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</label>
                    <input
                      type="text"
                      value={it.notes}
                      onChange={(e) => updateItem(i, 'notes', e.target.value)}
                      placeholder="e.g. box of 100"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addItem}
              className="w-full px-4 py-2 rounded-lg text-[13px] font-medium border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center justify-center gap-2"
            >
              <Icon name="plus" size={14} /> Add Another Item
            </button>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 shrink-0">{footer}</div>
      </div>
    </div>
  )
}
