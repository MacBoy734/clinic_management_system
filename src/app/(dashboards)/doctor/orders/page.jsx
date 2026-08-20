'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, formatDate, timeAgo, badgeClass, cap,
} from '@/utils/helpers'
import socket from '@/lib/socket'

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'cancelled', label: 'Cancelled' },
]

const CATEGORY_META = {
  medication: { label: 'Medication', icon: 'pill' },
  consumable: { label: 'Consumable', icon: 'box' },
  general: { label: 'General', icon: 'shoppingCart' },
}

function categoryIcon(c) { return CATEGORY_META[c]?.icon || 'box' }
function categoryLabel(c) { return CATEGORY_META[c]?.label || cap(c) }

function errMsg(err, fallback) {
  return err?.response?.data?.error || err?.data?.error || err?.message || fallback
}

export default function PharmacyOrdersTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const requestedBy = user?.username || 'Doctor'
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['doctor', 'orders'],
    queryFn: () => api.get('/api/doctor/orders'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  useEffect(() => {
      socket.on('order:updated', () => {
        queryClient.invalidateQueries({ queryKey: ['doctor', 'orders'] })
      })
  
      return () => {
        socket.off('order:updated')
      }
    }, [queryClient])

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/api/doctor/orders', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'orders'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'orders'] })
    },
  })

  const orders = data?.orders || []

  const pendingCount = orders.filter((o) => o.status === 'pending').length
  const fulfilledToday = orders.filter((o) => {
    if (o.status !== 'fulfilled' || !o.fulfilled_at) return false
    const d = new Date(o.fulfilled_at)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
  }).length

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  const handleSubmit = async ({ items, notes }) => {
    if (!items.length) {
      toast.error('Add at least one item to the order')
      return
    }
    try {
      await createMutation.mutateAsync({ items, notes })
      toast.success('Order sent to the pharmacy')
      setShowModal(false)
    } catch (err) {
      toast.error(errMsg(err, 'Could not submit order'))
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
        <StatCard icon="clock" color="amber" label="Pending" value={pendingCount} sublabel="awaiting the pharmacy" />
        <StatCard icon="checkCircle" color="green" label="Fulfilled Today" value={fulfilledToday} sublabel="ready for pickup" />
        <StatCard icon="shoppingCart" color="blue" label="Total Orders" value={orders.length} sublabel="all-time" />
      </div>

      {/* Filters + new order */}
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
                <div className="flex items-center gap-2">
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
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
          >
            <Icon name="plus" size={13} /> New Order
          </button>
        </div>
      </div>

      {/* Orders */}
      {!filtered.length ? (
        <EmptyState
          icon="shoppingCart"
          title={filter === 'all' ? 'No pharmacy orders yet' : `No ${filter} orders`}
          description={filter === 'all'
            ? 'Order gloves, syringes, swabs and other supplies from the in-house pharmacy with the New Order button.'
            : 'Try a different filter to see other orders.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => <OrderCard key={o.id} order={o} />)}
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
  const issuedQty = order.items.reduce((s, it) => s + (Number(it.fulfilled_qty) || 0), 0)
  const shortIssued = order.status === 'fulfilled' && issuedQty < totalQty

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
            By {order.requested_by} · {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {totalQty} units requested
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
            {shortIssued && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                {issuedQty} of {totalQty} units issued
              </p>
            )}
          </div>
        )}

        {order.status === 'cancelled' && (
          <div className="text-right shrink-0 max-w-56">
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Cancelled</p>
            {order.cancel_reason && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{order.cancel_reason}</p>
            )}
          </div>
        )}
      </div>

      {order.notes && (
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 italic">{order.notes}</p>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {order.items.map((it) => {
          const short = order.status === 'fulfilled' && it.fulfilled_qty < it.quantity
          return (
            <div key={it.id} className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon name={categoryIcon(it.category)} size={11} className="text-gray-400 shrink-0" />
                  <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{it.name}</p>
                </div>
                <span className="text-[12px] font-semibold text-[#1a6cbf] dark:text-blue-400 tabular-nums shrink-0">
                  ×{it.quantity}{it.unit ? ` ${it.unit}` : ''}
                </span>
              </div>
              {short && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                  {it.fulfilled_qty} issued
                </p>
              )}
              {!it.product_id && (
                <p className="text-[10px] text-gray-400 mt-0.5">Not in the pharmacy catalogue</p>
              )}
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

// ─── New order modal ──────────────────────────────────────────────────────────

function newLine() {
  return { product_id: null, name: '', quantity: 1, notes: '' }
}

function NewOrderModal({ onClose, onSubmit, loading, requestedBy }) {
  const [lines, setLines] = useState([newLine()])
  const [orderNotes, setOrderNotes] = useState('')

  const suppliesQuery = useQuery({
    queryKey: ['doctor', 'supplies'],
    queryFn: () => api.get('/api/doctor/supplies'),
    staleTime: 60000,
  })
  const supplies = suppliesQuery.data?.items || []

  const updateLine = (i, patch) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines((arr) => [...arr, newLine()])
  const removeLine = (i) => setLines((arr) => arr.filter((_, idx) => idx !== i))

  const validLines = lines
    .filter((l) => (l.product_id != null || l.name.trim()) && Number(l.quantity) > 0)
    .map((l) => ({
      product_id: l.product_id,
      name: l.name.trim(),
      quantity: Number(l.quantity) || 1,
      notes: l.notes?.trim() || '',
    }))

  const totalUnits = validLines.reduce((s, l) => s + l.quantity, 0)
  const freeTextCount = validLines.filter((l) => l.product_id == null).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">New Pharmacy Order</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Supplies for the consultation room · requested by {requestedBy}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {lines.map((line, i) => (
              <OrderLine
                key={i}
                index={i}
                line={line}
                supplies={supplies}
                loadingSupplies={suppliesQuery.isLoading}
                canRemove={lines.length > 1}
                onChange={(patch) => updateLine(i, patch)}
                onRemove={() => removeLine(i)}
              />
            ))}

            <button
              onClick={addLine}
              className="w-full px-4 py-2 rounded-lg text-[13px] font-medium border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center justify-center gap-2"
            >
              <Icon name="plus" size={14} /> Add Another Item
            </button>

            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Note for the pharmacy
              </label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. needed before the afternoon clinic"
                className={inputCls}
              />
            </div>

            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 px-3 py-2 flex items-start gap-2">
              <Icon name="info" size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Medications are not available here — prescribe them from the consultation instead, so they
                reach the patient's bill and record.
              </p>
            </div>

            {freeTextCount > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
                <Icon name="info" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {freeTextCount} item{freeTextCount !== 1 ? 's are' : ' is'} typed by hand rather than picked from
                  the catalogue. The pharmacy can still fulfil {freeTextCount !== 1 ? 'them' : 'it'}, but stock
                  levels will not update — ask them to add the item to the catalogue.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {validLines.length} item{validLines.length !== 1 ? 's' : ''} · {totalUnits} units
            </span>
            <button
              onClick={() => onSubmit({ items: validLines, notes: orderNotes.trim() })}
              disabled={loading || validLines.length === 0}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <Icon name="refresh" size={14} className="animate-spin" />
                : <Icon name="send" size={14} />}
              Submit Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── One order line: catalogue picker with a free-text escape hatch ───────────

function OrderLine({ index, line, supplies, loadingSupplies, canRemove, onChange, onRemove }) {
  const [query, setQuery] = useState(line.name)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function onMouseDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return supplies.slice(0, 8)
    return supplies
      .filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.sub_category || '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [supplies, query])

  const selected = line.product_id != null
    ? supplies.find((s) => s.id === line.product_id)
    : null

  function pick(product) {
    onChange({ product_id: product.id, name: product.name })
    setQuery(product.name)
    setOpen(false)
  }

  function useFreeText() {
    onChange({ product_id: null, name: query.trim() })
    setOpen(false)
  }

  function clear() {
    onChange({ product_id: null, name: '' })
    setQuery('')
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Item #{index + 1}
        </span>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1"
          >
            <Icon name="trash" size={12} /> Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        {/* Picker */}
        <div className="sm:col-span-6" ref={boxRef}>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Item
          </label>
          <div className="relative">
            <Icon
              name="search"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
                onChange({ product_id: null, name: e.target.value })
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search supplies, e.g. gloves"
              className={`${inputCls} pl-9`}
            />

            {open && (
              <div className="absolute z-30 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl max-h-56 overflow-y-auto">
                {loadingSupplies && (
                  <p className="px-3 py-3 text-center text-[12px] text-gray-400">Loading supplies…</p>
                )}

                {!loadingSupplies && matches.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/40 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name={categoryIcon(s.category)} size={12} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">
                          {s.name}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {[categoryLabel(s.category), s.sub_category && cap(s.sub_category)]
                            .filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className={[
                      'text-[10px] tabular-nums shrink-0',
                      s.current_stock === 0
                        ? 'text-red-500'
                        : s.current_stock <= s.reorder_level
                          ? 'text-amber-500'
                          : 'text-emerald-600 dark:text-emerald-400',
                    ].join(' ')}>
                      {s.current_stock === 0 ? 'out of stock' : `${s.current_stock} ${s.unit}`}
                    </span>
                  </button>
                ))}

                {!loadingSupplies && !matches.length && (
                  <p className="px-3 py-2 text-[12px] text-gray-400">Nothing in the catalogue matches.</p>
                )}

                {/* Escape hatch — order something the pharmacy doesn't stock yet */}
                {!loadingSupplies && query.trim() && (
                  <button
                    type="button"
                    onClick={useFreeText}
                    className="w-full text-left px-3 py-2 border-t border-gray-100 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center gap-2"
                  >
                    <Icon name="plus" size={12} className="text-gray-400" />
                    <span className="text-[12px] text-gray-600 dark:text-gray-300">
                      Request &ldquo;{query.trim()}&rdquo; as a one-off
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Selection state */}
          {selected && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <Icon name="check" size={10} />
              In catalogue · {selected.current_stock} {selected.unit} on hand
              <button type="button" onClick={clear} className="ml-1 text-gray-400 hover:text-gray-600">
                clear
              </button>
            </p>
          )}
          {!selected && line.name.trim() && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
              One-off request — stock will not be adjusted
            </p>
          )}
        </div>

        {/* Quantity */}
        <div className="sm:col-span-3">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Quantity
          </label>
          <input
            type="number"
            min="1"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className={inputCls}
          />
          {selected && Number(line.quantity) > selected.current_stock && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
              More than the {selected.current_stock} on hand
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="sm:col-span-3">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Notes
          </label>
          <input
            type="text"
            value={line.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="e.g. size medium"
            className={inputCls}
          />
        </div>
      </div>
    </div>
  )
}