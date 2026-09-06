'use client'

import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonTable, SkeletonList, Spinner,
  formatMoney, formatDate, timeAgo, cap, badgeClass,
} from '@/utils/helpers'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const SUB_TABS = [
  { key: 'product', label: 'pharmacy Stock', icon: 'box' },
  { key: 'lab', label: 'Lab Stock', icon: 'flask' },
  { key: 'restocks', label: 'Restock Verification', icon: 'checkCircle' },
]

const CATEGORY_BADGES = {
  medication: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  consumable: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  general: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  consultation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  procedure: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  family_planning: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  antibiotic: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  analgesic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  antihypertensive: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  antidiabetic: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  antihistamine: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  antacid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  vitamin: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  supplement: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  thyroid: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  hematology: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  chemistry: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  urinalysis: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  microbiology: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  supplies: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

const PRODUCT_CATEGORIES = [
  { key: 'all', label: 'All Categories' },
  { key: 'medication', label: 'Medication' },
  { key: 'consumable', label: 'Consumable' },
  { key: 'general', label: 'General' },
]

const EXPIRY_FILTERS = [
  { key: 'all', label: 'All Expiry' },
  { key: '1month', label: '< 1 Month' },
  { key: '3months', label: '< 3 Months' },
]

const MEDICATION_FORMS = ['tablet', 'capsule', 'injection', 'syrup', 'cream', 'drops']
const LAB_CATEGORIES = ['supplies', 'hematology', 'chemistry', 'urinalysis', 'microbiology']

// ─── Reorder planner constants ──────────────────────────────────
const REORDER_FILTERS = [
  { key: 'all', label: 'All Products' },
  { key: 'out_of_stock', label: 'Out of Stock' },
  { key: 'below_reorder', label: 'Below Reorder' },
  { key: 'fast_moving', label: 'Fast Moving' },
]

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All Types' },
  { key: 'medication', label: 'Medication' },
  { key: 'consumable', label: 'Consumables' },
  { key: 'general', label: 'General' },
]

const MEDICATION_CATEGORY_KEYS = new Set([
  'medication', 'antibiotic', 'analgesic', 'antihypertensive',
  'antidiabetic', 'antihistamine', 'antacid', 'vitamin', 'supplement', 'thyroid',
])

const CONSUMABLE_CATEGORY_KEYS = new Set(['consumable', 'supplies'])

const COMMON_UNITS = [
  'pieces', 'boxes', 'vials', 'bottles', 'tablets', 'capsules',
  'sachets', 'packs', 'litres', 'ml', 'grams', 'kg', 'tubes', 'rolls',
]

const FAST_MOVING_THRESHOLD = 50

function productType(item) {
  const c = (item?.category || '').toString().toLowerCase().trim()
  if (MEDICATION_CATEGORY_KEYS.has(c)) return 'medication'
  if (CONSUMABLE_CATEGORY_KEYS.has(c)) return 'consumable'
  return 'general'
}

function isOutOfStock(i) {
  return (Number(i.current_stock) || 0) === 0
}
function isBelowReorder(i) {
  const s = Number(i.current_stock) || 0
  const r = Number(i.reorder_level) || 0
  return s > 0 && s <= r
}
function isFastMoving(i) {
  return (Number(i.monthly_usage) || 0) >= FAST_MOVING_THRESHOLD
}
function suggestOrderQty(item) {
  const stock = Number(item.current_stock) || 0
  const reorder = Number(item.reorder_level) || 0
  const usage = Number(item.monthly_usage) || 0
  return Math.max(reorder * 2 - stock, usage * 2 - stock, reorder, 0)
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function statusFor(item) {
  const stock = Number(item.current_stock) || 0
  const reorder = Number(item.reorder_level) || 0
  if (stock === 0) return { key: 'out_of_stock', label: 'Out of Stock', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (stock <= reorder) return { key: 'low_stock', label: 'Low Stock', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  return { key: 'in_stock', label: 'In Stock', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
}

function expiryBadge(dateStr) {
  const d = daysUntil(dateStr)
  if (d === null) return { label: 'No expiry', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400' }
  if (d < 0) return { label: 'Expired', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (d <= 30) return { label: `${d}d left`, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (d <= 90) return { label: `${d}d left`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  return { label: `${d}d left`, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
}

function getNearestBatch(item) {
  if (!item.batches?.length) return null
  const active = item.batches.filter((b) => !b.is_exhausted && b.expiry_date)
  if (!active.length) return null
  return active.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0]
}

export default function InventoryTab() {
  const [sub, setSub] = useState('product')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={[
              'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors',
              sub === t.key
                ? 'bg-[#1a6cbf] text-white'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
            ].join(' ')}
          >
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {sub === 'lab' && <LabStockSubTab />}
      {sub === 'product' && <ProductStockSubTab />}
      {sub === 'restocks' && <RestockVerificationSubTab />}
    </div>
  )
}

// ─── Shared UI helpers ────────────────────────────────────────────
const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full ${maxWidth} rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function StatTile({ label, value, icon, color = 'blue', sublabel }) {
  const colors = {
    blue: { card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50', val: 'text-blue-700 dark:text-blue-400', ic: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
    green: { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', val: 'text-emerald-700 dark:text-emerald-400', ic: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
    amber: { card: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50', val: 'text-amber-700 dark:text-amber-400', ic: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
    red: { card: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50', val: 'text-red-700 dark:text-red-400', ic: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
    purple: { card: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50', val: 'text-purple-700 dark:text-purple-400', ic: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' },
    slate: { card: 'bg-white border-gray-200 dark:bg-[#1e293b] dark:border-gray-700/60', val: 'text-gray-700 dark:text-gray-300', ic: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`rounded-xl border p-4 ${c.card}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.ic}`}>
            <Icon name={icon} size={18} />
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${c.val} truncate`}>{value}</p>
      {sublabel && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{sublabel}</p>}
    </div>
  )
}

function StockBar({ item }) {
  const stock = Number(item.current_stock) || 0
  const reorder = Number(item.reorder_level) || 0
  const isOut = stock === 0
  const isLow = stock > 0 && stock <= reorder
  const maxScale = Math.max(reorder * 2, 1)
  const pct = Math.min(100, Math.round((stock / maxScale) * 100))
  const color = isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
  const textColor = isOut ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'
  return (
    <div className="flex items-center gap-2 min-w-35">
      <div className="flex-1 max-w-30 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[12px] font-semibold tabular-nums ${textColor} whitespace-nowrap`}>
        {stock}
        <span className="text-gray-400 font-normal"> / {reorder}</span>
      </span>
    </div>
  )
}

function Th({ children, align = 'left', className = '' }) {
  return (
    <th
      className={[
        'px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function RowAction({ icon, label, onClick, color = 'gray', disabled }) {
  const colors = {
    gray: 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 hover:text-gray-700 dark:hover:text-gray-200',
    blue: 'text-[#1a6cbf] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30',
    amber: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30',
    red: 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${colors[color]}`}
    >
      <Icon name={icon} size={13} />
    </button>
  )
}

const optionsFrom = (arr) =>
  arr.map((v) => <option key={v} value={v}>{cap(v)}</option>)

// ─── Sub-tab 1: Lab Stock ────────────────────────────────────────
function LabStockSubTab() {
  const queryClient = useQueryClient()
  const [restockItem, setRestockItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [showAddLab, setShowAddLab] = useState(false)

  const q = useQuery({
    queryKey: ['admin', 'lab-stock'],
    queryFn: () => api.get('/api/admin/lab-stock'),
    staleTime: 30000,
  })

  const restockMut = useMutation({
    mutationFn: ({ id, quantity }) => api.patch(`/api/admin/lab-stock/${id}/quantity`, { adjustment: quantity }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'lab-stock'] }),
  })

  const editMut = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/api/admin/lab-stock/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'lab-stock'] }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/lab-stock/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'lab-stock'] }),
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={6} />
      </div>
    )
  }
  if (q.isError) {
    return <ErrorState message={q.error?.message || 'Could not load lab stock'} onRetry={q.refetch} />
  }

  const items = Array.isArray(q.data?.stock) ? q.data.stock : []
  const lowStock = items.filter((i) => (Number(i.current_stock) || 0) > 0 && (Number(i.current_stock) || 0) <= (Number(i.reorder_level) || 0))
  const outOfStock = items.filter((i) => (Number(i.current_stock) || 0) === 0)
  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expiry_date)
    return d !== null && d >= 0 && d <= 90
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Lab Stock</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon
              name="refresh"
              size={13}
              className={q.isFetching ? 'animate-spin' : ''}
            />
            {q.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Items" value={items.length} icon="flask" color="blue" sublabel="lab reagents & supplies" />
        <StatTile label="Low Stock" value={lowStock.length} icon="alert" color="amber" sublabel="at/below reorder level" />
        <StatTile label="Out of Stock" value={outOfStock.length} icon="xCircle" color="red" sublabel="items" />
        <StatTile label="Expiring Soon" value={expiringSoon.length} icon="clock" color="purple" sublabel="within 90 days" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Lab Reagents & Supplies" subtitle={`${items.length} item${items.length === 1 ? '' : 's'}`}
          action={
            <button onClick={() => setShowAddLab(true)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5">
              <Icon name="plus" size={14} /> Add Item
            </button>
          }
        />
        {items.length === 0 ? (
          <EmptyState icon="flask" title="No lab stock" description="Lab reagents and supplies will appear here once stocked." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Item</Th>
                  <Th>Quantity</Th>
                  <Th align="right">Reorder</Th>
                  <Th>Expiry</Th>
                  <Th align="center">Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {items.map((item) => {
                  const st = statusFor(item)
                  const ex = expiryBadge(item.expiry_date)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100"><Link href={`/admin/inventory/${item.id}`}>{item.name}</Link></p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge className={CATEGORY_BADGES[item.category] || CATEGORY_BADGES.other}>{cap(item.category)}</Badge>
                          <span className="text-[10px] text-gray-400">{item.supplier || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StockBar item={item} /></td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap">
                        {item.reorder_level} {item.unit}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[12px] text-gray-700 dark:text-gray-300">{formatDate(item.expiry_date)}</p>
                        <Badge className={`mt-0.5 ${ex.cls}`}>{ex.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={st.cls}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <RowAction icon="plus" label="Restock" color="blue" onClick={() => setRestockItem(item)} />
                          <RowAction icon="edit" label="Edit" color="amber" onClick={() => setEditItem(item)} />
                          <RowAction icon="trash" label="Delete" color="red" onClick={async () => {
                            if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
                            try { await delMut.mutateAsync(item.id); toast.success('Item deleted') }
                            catch (err) { toast.error(err.message || 'Could not delete item') }
                          }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {restockItem && (
        <RestockModal
          title="Restock Lab Item"
          subtitle={restockItem.name}
          item={restockItem}
          loading={restockMut.isPending}
          onClose={() => setRestockItem(null)}
          onConfirm={async (qty) => {
            try {
              await restockMut.mutateAsync({ id: restockItem.id, quantity: qty })
              toast.success(`${restockItem.name} restocked (+${qty})`)
              setRestockItem(null)
            } catch (err) {
              toast.error(err.message || 'Could not restock item')
            }
          }}
        />
      )}

      {editItem && (
        <EditLabItemModal
          item={editItem}
          loading={editMut.isPending}
          onClose={() => setEditItem(null)}
          onSubmit={async (body) => {
            try {
              await editMut.mutateAsync({ id: editItem.id, ...body })
              toast.success('Lab item updated')
              setEditItem(null)
            } catch (err) {
              toast.error(err.message || 'Could not update item')
            }
          }}
        />
      )}

      {showAddLab && (
        <AddLabItemModal loading={false} onClose={() => setShowAddLab(false)}
          onSubmit={async (body) => {
            try {
              await api.post('/api/admin/lab-stock', {
                name: body.name,
                category: body.category,
                current_stock: Number(body.quantity),
                reorder_level: Number(body.reorder_level) || 0,
                unit: body.unit,
                supplier: body.supplier || null,
                expiry_date: body.expiry_date || null,
              })
              toast.success(`${body.name} added to lab inventory`)
              queryClient.invalidateQueries({ queryKey: ['admin', 'lab-stock'] })
              setShowAddLab(false)
            } catch (err) { toast.error(err.message || 'Could not add item') }
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-tab 2: Product Stock ────────────────────────────────────
function ProductStockSubTab() {
  const queryClient = useQueryClient()
  const [restockItem, setRestockItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showReorder, setShowReorder] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [expiryFilter, setExpiryFilter] = useState('all')

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['admin', 'drug-stock', search.trim(), categoryFilter, expiryFilter],
    queryFn: async ({ pageParam = 1 }) => {
      // Build query string manually — works with ANY api.get() wrapper
      const query = new URLSearchParams()
      const s = search.trim()
      if (s) query.set('search', s)
      if (categoryFilter !== 'all') query.set('category', categoryFilter)
      if (expiryFilter !== 'all') query.set('expiry_filter', expiryFilter)
      query.set('page', String(pageParam))
      query.set('limit', '20')

      const qs = query.toString()
      const url = `/api/admin/drug-stock${qs ? '?' + qs : ''}`

      const data = await api.get(url)
      return data
    },
    getNextPageParam: (lastPage) => lastPage?.nextPage,
    staleTime: 30000,
  })

  const items = data?.pages.flatMap((p) => p.items) || []
  const totalItems = data?.pages[0]?.total || 0

  const restockMut = useMutation({
    mutationFn: ({ id, quantity, expiry_date }) =>
      api.put(`/api/admin/drug-stock/${id}/quantity`, { adjustment: quantity, expiry_date }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'drug-stock'] }),
  })

  const editMut = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/api/admin/drug-stock/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'drug-stock'] }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/drug-stock/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'drug-stock'] }),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={8} />
      </div>
    )
  }
  if (isError) {
    return <ErrorState message={error?.message || 'Could not load product stock'} onRetry={refetch} />
  }

  const lowStock = items.filter((i) => (Number(i.current_stock) || 0) > 0 && (Number(i.current_stock) || 0) <= (Number(i.reorder_level) || 0))
  const outOfStock = items.filter((i) => (Number(i.current_stock) || 0) === 0)
  const totalValue = items.reduce((s, i) => s + (Number(i.current_stock) || 0) * (Number(i.normal_price) || 0), 0)
  const expiringSoon = items.filter((i) => {
    const b = getNearestBatch(i)
    if (!b?.expiry_date) return false
    const d = daysUntil(b.expiry_date)
    return d !== null && d >= 0 && d <= 90
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Product Stock</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
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
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Items" value={totalItems} icon="box" color="blue" sublabel="all SKUs" />
        <StatTile label="Low Stock" value={lowStock.length} icon="alert" color="amber" sublabel="need reorder" />
        <StatTile label="Out of Stock" value={outOfStock.length} icon="xCircle" color="red" sublabel="items" />
        <StatTile label="Inventory Value" value={formatMoney(totalValue)} icon="dollarSign" color="green" sublabel="qty × unit cost" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or generic name…"
            className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PRODUCT_CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategoryFilter(c.key)}
              className={[
                'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                categoryFilter === c.key
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400',
              ].join(' ')}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {EXPIRY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setExpiryFilter(f.key)}
              className={[
                'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                expiryFilter === f.key
                  ? 'bg-amber-600 text-white'
                  : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Product Stock"
          subtitle={`${items.length} of ${totalItems} item${totalItems === 1 ? '' : 's'} loaded`}
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReorder(true)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5"
              >
                <Icon name="shoppingCart" size={14} /> Generate Reorder List
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
              >
                <Icon name="plus" size={14} /> Add Item
              </button>
            </div>
          }
        />
        {items.length === 0 ? (
          <EmptyState
            icon="box"
            title="No items found"
            description={search || categoryFilter !== 'all' || expiryFilter !== 'all' ? 'Try adjusting your filters.' : 'Product stock will appear here once items are added.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Item</Th>
                  <Th align="left" className="hidden md:table-cell">Category</Th>
                  <Th>Stock</Th>
                  <Th align="right" className="hidden lg:table-cell">Reorder</Th>
                  <Th align="right" className="hidden sm:table-cell">Unit Cost</Th>
                  <Th align="right" className="hidden sm:table-cell">Retail</Th>
                  <Th align="left" className="hidden lg:table-cell">Nearest Batch</Th>
                  <Th align="center">Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {items.map((item) => {
                  const st = statusFor(item)
                  const nearest = getNearestBatch(item)
                  const ex = nearest ? expiryBadge(nearest.expiry_date) : expiryBadge(null)
                  const retail = Number(item.normal_price) || 0
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100"><Link href={`/admin/inventory/${item.id}`}>{item.name}</Link></p>
                        {item.category === 'medication' && (
                          <p className="text-[11px] text-gray-400">
                            {item.generic_name || '—'}{item.strength ? ` · ${item.strength}` : ''}
                          </p>
                        )}
                        {item.sub_category && (
                          <Badge className="mt-0.5 bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                            {cap(item.sub_category)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={CATEGORY_BADGES[item.category] || CATEGORY_BADGES.other}>
                          {cap(item.category)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3"><StockBar item={item} /></td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap hidden lg:table-cell">
                        {item.reorder_level} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-emerald-700 dark:text-emerald-400 tabular-nums font-semibold whitespace-nowrap hidden sm:table-cell">
                        {formatMoney(retail)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {nearest ? (
                          <>
                            <p className="text-[12px] text-gray-700 dark:text-gray-300">
                              Batch {nearest.batch_number} · {formatDate(nearest.expiry_date)}
                            </p>
                            <Badge className={`mt-0.5 ${ex.cls}`}>{ex.label}</Badge>
                          </>
                        ) : (
                          <span className="text-[12px] text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={st.cls}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <RowAction icon="plus" label="Restock" color="blue" onClick={() => setRestockItem(item)} />
                          <RowAction icon="edit" label="Edit" color="amber" onClick={() => setEditItem(item)} />
                          <RowAction
                            icon="trash"
                            label="Delete"
                            color="red"
                            onClick={async () => {
                              if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
                              try { await delMut.mutateAsync(item.id); toast.success('Item deleted') }
                              catch (err) { toast.error(err.message || 'Could not delete item') }
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasNextPage && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700/60 flex justify-center">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50 flex items-center gap-2"
            >
              {isFetchingNextPage ? <Spinner size={14} /> : <Icon name="chevronDown" size={14} />}
              {isFetchingNextPage ? 'Loading…' : 'Load More'}
            </button>
          </div>
        )}
      </Card>

      {restockItem && (
        <RestockModal
          title="Restock Item"
          subtitle={restockItem.name}
          item={restockItem}
          loading={restockMut.isPending}
          onClose={() => setRestockItem(null)}
          onConfirm={async (qty, expiryDate) => {
            try {
              await restockMut.mutateAsync({
                id: restockItem.id,
                quantity: qty,
                expiry_date: expiryDate || undefined,
              })
              toast.success(`${restockItem.name} restocked (+${qty})`)
              setRestockItem(null)
            } catch (err) {
              toast.error(err.message || 'Could not restock item')
            }
          }}
        />
      )}

      {editItem && (
        <EditProductItemModal
          item={editItem}
          loading={editMut.isPending}
          onClose={() => setEditItem(null)}
          onSubmit={async (body) => {
            try {
              await editMut.mutateAsync({ id: editItem.id, ...body })
              toast.success('Item updated')
              setEditItem(null)
            } catch (err) {
              toast.error(err.message || 'Could not update item')
            }
          }}
        />
      )}

      {showReorder && (
        <ReorderModal
          onClose={() => setShowReorder(false)}
        />
      )}

      {showAdd && (
        <AddProductModal
          loading={false}
          onClose={() => setShowAdd(false)}
          onSubmit={async (body) => {
            try {
              await api.post('/api/admin/drug-stock', {
                name: body.name,
                generic_name: body.generic_name || null,
                category: body.category,
                sub_category: body.sub_category || null,
                form: body.form || null,
                strength: body.strength || null,
                current_stock: Number(body.quantity),
                unit: body.unit,
                reorder_level: Number(body.reorder_level) || 0,
                normal_price: Number(body.normal_price) || 0,
                promotional_price: Number(body.promotional_price) || 0,
                wholesale_price: Number(body.wholesale_price) || 0,
                supplier: body.supplier || null,
                expiry_date: body.expiry_date || null,
              })
              toast.success(`${body.name} added to inventory`)
              queryClient.invalidateQueries({ queryKey: ['admin', 'drug-stock'] })
              setShowAdd(false)
            } catch (err) {
              toast.error(err.message || 'Could not add item')
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Restock modal (product + lab) ──────────────────────────────────
function RestockModal({ title, subtitle, item, loading, onClose, onConfirm }) {
  const [quantity, setQuantity] = useState(Math.max(1, Math.ceil((Number(item.reorder_level) || 10) * 1.5)))
  const [expiryDate, setExpiryDate] = useState('')

  const qty = Number(quantity) || 0
  const newStock = (Number(item.current_stock) || 0) + qty
  const valid = qty > 0

  return (
    <ModalShell
      title={title}
      subtitle={subtitle}
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="restock-form"
            disabled={!valid || loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Spinner size={14} /> : <Icon name="plus" size={14} />}
            {loading ? 'Restocking…' : 'Restock'}
          </button>
        </>
      }
    >
      <form
        id="restock-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !loading) onConfirm(qty, expiryDate)
        }}
        className="space-y-4"
      >
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">Current stock</span>
            <span className="text-[12px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {item.current_stock} {item.unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">Reorder level</span>
            <span className="text-[12px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {item.reorder_level} {item.unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">Unit cost</span>
            <span className="text-[12px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {formatMoney(item.normal_price)}
            </span>
          </div>
          {item.supplier && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Supplier</span>
              <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{item.supplier}</span>
            </div>
          )}
        </div>

        <Field label="Quantity to add *">
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${inputCls} tabular-nums`}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {[10, 50, 100, 200].map((qv) => (
              <button
                key={qv}
                type="button"
                onClick={() => setQuantity(qv)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                +{qv}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, Math.ceil((Number(item.reorder_level) || 10) * 1.5)))}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
            >
              1.5× reorder
            </button>
          </div>
        </Field>

        <Field label="Expiry Date">
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className={inputCls}
          />
          <p className="text-[10px] text-gray-400 mt-1">
            A new batch will be created automatically. Leave blank if no expiry.
          </p>
        </Field>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">New stock level</span>
            <span className="text-[12px] font-semibold tabular-nums text-[#1a6cbf] dark:text-blue-400">
              {newStock} {item.unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">New stock value (at cost)</span>
            <span className="text-[12px] font-semibold tabular-nums text-[#1a6cbf] dark:text-blue-400">
              {formatMoney(newStock * (Number(item.normal_price) || 0))}
            </span>
          </div>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Edit product item modal ────────────────────────────────────
function EditProductItemModal({ item, loading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: item.name || '',
    reorder_level: String(item.reorder_level ?? 0),
    normal_price: String(item.normal_price ?? 0),
    promotional_price: String(item.promotional_price ?? 0),
    wholesale_price: String(item.wholesale_price ?? 0),
    supplier: item.supplier || '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Item name is required'); return }
    const rl = Number(form.reorder_level)
    if (!Number.isFinite(rl) || rl < 0) { toast.error('Reorder level must be a non-negative number'); return }
    await onSubmit({
      name: form.name.trim(),
      reorder_level: rl,
      normal_price: Number(form.normal_price) || 0,
      promotional_price: Number(form.promotional_price) || 0,
      wholesale_price: Number(form.wholesale_price) || 0,
      supplier: form.supplier.trim() || null,
    })
  }

  return (
    <ModalShell
      title="Edit Item"
      subtitle={item.name}
      onClose={loading ? undefined : onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-product-form"
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Spinner size={14} /> : <Icon name="save" size={14} />}
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form id="edit-product-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Item Name *">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reorder Level *">
            <input type="number" min="0" value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Normal Price (KSh)">
            <input type="number" min="0" step="any" value={form.normal_price} onChange={(e) => set('normal_price', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Promotional (KSh)">
            <input type="number" min="0" step="any" value={form.promotional_price} onChange={(e) => set('promotional_price', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Wholesale (KSh)">
            <input type="number" min="0" step="any" value={form.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>

        <Field label="Supplier">
          <input type="text" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} className={inputCls} />
        </Field>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 flex items-start gap-2">
          <Icon name="info" size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Stock quantity is changed via the Restock action, not here. Batches are created automatically on restock.
          </p>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Add Product Modal ──────────────────────────────────────────
function AddProductModal({ loading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    category: 'general',
    sub_category: '',
    generic_name: '',
    form: 'tablet',
    strength: '',
    quantity: '',
    unit: 'pieces',
    reorder_level: '50',
    normal_price: '',
    promotional_price: '',
    wholesale_price: '',
    supplier: '',
    expiry_date: '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const valid = form.name.trim() && form.quantity !== ''

  return (
    <ModalShell
      title="Add Item to Inventory"
      subtitle="Create a new product, consumable, or medication"
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={loading || !valid}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="plus" size={14} />} Add Item
          </button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(form) }} className="space-y-3">
        <Field label="Item Name *">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Surgical Gloves" className={inputCls} autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category *">
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              <option value="medication">Medication</option>
              <option value="consumable">Consumable</option>
              <option value="general">General</option>
            </select>
          </Field>
          <Field label="Sub-category" hint="Optional">
            <input type="text" value={form.sub_category} onChange={(e) => set('sub_category', e.target.value)} placeholder="e.g. ppe, antibiotic" className={inputCls} />
          </Field>
        </div>

        {form.category === 'medication' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Generic Name">
              <input type="text" value={form.generic_name} onChange={(e) => set('generic_name', e.target.value)} placeholder="e.g. Amoxicillin" className={inputCls} />
            </Field>
            <Field label="Form">
              <select value={form.form} onChange={(e) => set('form', e.target.value)} className={inputCls}>
                {optionsFrom(MEDICATION_FORMS)}
              </select>
            </Field>
            <Field label="Strength">
              <input type="text" value={form.strength} onChange={(e) => set('strength', e.target.value)} placeholder="e.g. 500mg" className={inputCls} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity *">
            <input type="number" min="0" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Reorder Level">
            <input type="number" min="0" value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit">
            <input type="text" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="pieces, vials, boxes" className={inputCls} />
          </Field>
          <Field label="Expiry Date">
            <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Normal Price (KSh)" hint="OTC price">
            <input type="number" min="0" step="any" value={form.normal_price} onChange={(e) => set('normal_price', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Promotional (KSh)">
            <input type="number" min="0" step="any" value={form.promotional_price} onChange={(e) => set('promotional_price', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Wholesale (KSh)">
            <input type="number" min="0" step="any" value={form.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
        </div>

        <Field label="Supplier">
          <input type="text" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="e.g. Phillips Pharma" className={inputCls} />
        </Field>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-start gap-2">
          <Icon name="info" size={14} className="text-[#1a6cbf] dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 dark:text-gray-300">
            The first batch (Batch 1) will be created automatically with the quantity and expiry you enter here. Future restocks auto-increment the batch number.
          </p>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Add Lab Item Modal ─────────────────────────────────────────
function AddLabItemModal({ loading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '', category: 'supplies', quantity: '', unit: 'vials',
    reorder_level: '10', supplier: '', expiry_date: '', batch_number: '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const valid = form.name.trim() && form.quantity !== ''
  return (
    <ModalShell title="Add Lab Stock Item" subtitle="Create a new lab reagent or supply" onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">Cancel</button>
          <button onClick={() => onSubmit(form)} disabled={loading || !valid} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50 flex items-center gap-2">
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="plus" size={14} />} Add Item
          </button>
        </div>
      }>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(form) }} className="space-y-3">
        <Field label="Item Name *">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Hemoglobin Reagent" className={inputCls} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {optionsFrom(LAB_CATEGORIES)}
            </select>
          </Field>
          <Field label="Unit">
            <input type="text" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="vials, boxes, packs" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity *">
            <input type="number" min="0" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Reorder Level">
            <input type="number" min="0" value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expiry Date">
            <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Supplier">
          <input type="text" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="e.g. LabSource Ltd" className={inputCls} />
        </Field>
      </form>
    </ModalShell>
  )
}

// ─── Edit lab item modal ────────────────────────────────────────
function EditLabItemModal({ item, loading, onClose, onSubmit }) {
  const [name, setName] = useState(item.name || '')
  const [reorderLevel, setReorderLevel] = useState(String(item.reorder_level || 0))
  const [expiryDate, setExpiryDate] = useState(
    item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : ''
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    const rl = Number(reorderLevel)
    if (!Number.isFinite(rl) || rl < 0) { toast.error('Reorder level must be a non-negative number'); return }
    await onSubmit({
      name: name.trim(),
      reorder_level: rl,
      expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
    })
  }

  return (
    <ModalShell
      title="Edit Lab Item"
      subtitle={item.name}
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="edit-lab-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="save" size={14} />}
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form id="edit-lab-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Item Name *">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reorder Level *">
            <input type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Expiry Date">
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 flex items-start gap-2">
          <Icon name="info" size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Quantity adjustments are made via the Restock action. Use the Edit form for name, reorder threshold, and expiry only.
          </p>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Sub-tab 3: Restock Verification ────────────────────────────
function RestockVerificationSubTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [verifying, setVerifying] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  useEffect(() => { setPage(1) }, [filter])

  // Status filters server-side — filtering a single page is not filtering the set.
  const qs = new URLSearchParams({ page: String(page), limit: '20' })
  if (filter !== 'all') qs.set('status', filter)

  const q = useQuery({
    queryKey: ['admin', 'restocks', filter, page],
    queryFn: () => api.get(`/api/admin/restocks?${qs.toString()}`),
    refetchInterval: 30000,
    staleTime: 15000,
    placeholderData: (prev) => prev,
  })

  const verifyMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/admin/restocks/${id}/verify`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'restocks'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'lab-stock'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'drug-stock'] })
    },
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/admin/restocks/${id}/reject`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'restocks'] }),
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        <SkeletonList items={3} />
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message} onRetry={q.refetch} />

  const filtered = q.data?.restocks || []
  const stats = q.data?.stats || {}
  const total = q.data?.total || 0
  const pages = q.data?.pages || 1

  const handleVerify = async (r, notes, qty, expiryDate) => {
    try {
      const body = { verification_notes: notes }
      if (qty != null && Number(qty) !== r.received_qty) body.adjusted_qty = Number(qty)
      if (expiryDate) body.expiry_date = expiryDate
      await verifyMut.mutateAsync({ id: r.id, body })
      toast.success(`${r.item_name} verified — stock added`)
      setVerifying(null)
    } catch (err) { toast.error(err.message || 'Could not verify') }
  }

  const handleReject = async (r, reason) => {
    try {
      await rejectMut.mutateAsync({ id: r.id, body: { verification_notes: reason } })
      toast.success(`${r.item_name} rejected — no stock added`)
      setRejecting(null)
    } catch (err) { toast.error(err.message || 'Could not reject') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Restock Verification</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {total} request{total !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon
              name="refresh"
              size={13}
              className={q.isFetching ? 'animate-spin' : ''}
            />
            {q.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Pending" value={stats.pending ?? 0} icon="alert" color="amber" sublabel={formatMoney(stats.pending_value ?? 0)} />
        <StatTile label="Approved" value={stats.approved ?? 0} icon="checkCircle" color="green" sublabel="added to stock" />
        <StatTile label="Rejected" value={stats.rejected ?? 0} icon="xCircle" color="red" sublabel="no stock added" />
        <StatTile label="Total" value={(stats.pending ?? 0) + (stats.approved ?? 0) + (stats.rejected ?? 0)} icon="box" color="blue" sublabel="all requests" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected'].map((f) => {
          const count = f === 'all'
            ? (stats.pending ?? 0) + (stats.approved ?? 0) + (stats.rejected ?? 0)
            : (stats[f] ?? 0)
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                filter === f ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400'].join(' ')}>
              {cap(f)} ({count})
            </button>
          )
        })}
      </div>

      {!filtered.length ? (
        <EmptyState icon="box" title="No restock requests" description="Restock requests from lab and pharmacy will appear here for verification." />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const isPending = r.status === 'pending'
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={['w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      r.department === 'pharmacy' ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'].join(' ')}>
                      <Icon name={r.department === 'pharmacy' ? 'pillBottle' : 'flask'} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{r.item_name || '—'}</p>
                        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">{cap(r.department)}</Badge>
                        <Badge className={badgeClass(r.status)}>{cap(r.status)}</Badge>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Requested by {r.requested_by} · {timeAgo(r.requested_at)}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                        <div><span className="text-gray-400">Current:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{r.current_stock ?? '—'} {r.unit || ''}</span></div>
                        <div><span className="text-gray-400">Requested:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{r.quantity}</span></div>
                        <div><span className="text-gray-400">Supplier:</span> <span className="text-gray-700 dark:text-gray-300">{r.supplier || '—'}</span></div>
                        <div><span className="text-gray-400">Expiry:</span> <span className="text-gray-700 dark:text-gray-300">{formatDate(r.expiry_date)}</span></div>
                      </div>
                      {r.notes && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 italic">"{r.notes}"</p>}
                      {!isPending && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          {r.status} by {r.verified_by} · {timeAgo(r.verified_at)}
                          {r.verification_notes && ` — ${r.verification_notes}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setRejecting(r)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-100 flex items-center gap-1">
                        <Icon name="x" size={12} /> Reject
                      </button>
                      <button onClick={() => setVerifying(r)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1">
                        <Icon name="check" size={12} /> Verify
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{pages}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next ›
            </button>
          </div>
        </div>
      )}

      {verifying && (
        <RestockVerifyModal restock={verifying} loading={verifyMut.isPending} onClose={() => setVerifying(null)} onConfirm={handleVerify} />
      )}
      {rejecting && (
        <RestockRejectModal restock={rejecting} loading={rejectMut.isPending} onClose={() => setRejecting(null)} onConfirm={handleReject} />
      )}
    </div>
  )
}

function RestockVerifyModal({ restock, loading, onClose, onConfirm }) {
  const [notes, setNotes] = useState('')
    const [qty, setQty] = useState(String(restock.quantity || 0))
  const [expiryDate, setExpiryDate] = useState(
    restock.expiry_date ? new Date(restock.expiry_date).toISOString().slice(0, 10) : ''
  )

  return (
    <ModalShell title="Verify Restock" subtitle={`${restock.product?.name} · ${cap(restock.department)}`} onClose={loading ? undefined : onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">Cancel</button>
          <button onClick={() => onConfirm(restock, notes, qty, expiryDate)} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />} Approve & Add to Stock
          </button>
        </div>
      }>
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 p-3 space-y-1.5 text-[12px]">
                    <div className="flex justify-between"><span className="text-gray-400">Current stock:</span><span className="font-medium">{restock.current_stock ?? '—'} {restock.unit || ''}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Requested qty:</span><span className="font-medium">{restock.quantity}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Supplier:</span><span className="font-medium">{restock.supplier || '—'}</span></div>
        </div>

        <Field label="Quantity to add (adjust if different)">
          <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} />
        </Field>

        <Field label="Expiry Date">
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
          <p className="text-[10px] text-gray-400 mt-1">Batch number will be auto-generated.</p>
        </Field>

        <Field label="Verification notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Verified against PO #1234" className={`${inputCls} resize-none`} />
        </Field>
      </div>
    </ModalShell>
  )
}

function RestockRejectModal({ restock, loading, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <ModalShell title="Reject Restock" subtitle={`${restock.item_name} · no stock will be added`} onClose={loading ? undefined : onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">Cancel</button>
          <button onClick={() => onConfirm(restock, reason)} disabled={loading || !reason.trim()} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="x" size={14} />} Confirm Rejection
          </button>
        </div>
      }>
      <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 text-[12px] text-red-700 dark:text-red-400 mb-3">
        No stock will be added. The requesting department will need to follow up with the supplier.
      </div>
      <Field label="Reason for rejection *">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Wrong quantity received, damaged packaging..." className={`${inputCls} resize-none`} />
      </Field>
    </ModalShell>
  )
}

// ─── Reorder Modal ──────────────────────────────────────────────
function ReorderModal({ onClose }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selected, setSelected] = useState({})
  const [showOrderModal, setShowOrderModal] = useState(false)

  const q = useQuery({
    queryKey: ['admin', 'drug-stock', 'reorder-list'],
    queryFn: () => api.get('/api/admin/drug-stock?limit=1000'),
    staleTime: 30000,
  })

  const items = Array.isArray(q.data?.items) ? q.data.items : []

  const filtered = useMemo(() => {
    let result = items
    if (filter === 'out_of_stock') result = result.filter(isOutOfStock)
    else if (filter === 'below_reorder') result = result.filter(isBelowReorder)
    else if (filter === 'fast_moving') result = result.filter(isFastMoving)

    if (categoryFilter !== 'all') {
      result = result.filter((i) => productType(i) === categoryFilter)
    }

    const s = search.trim().toLowerCase()
    if (s) {
      result = result.filter((i) =>
        (i.name || '').toLowerCase().includes(s) ||
        (i.generic_name || '').toLowerCase().includes(s)
      )
    }
    return result
  }, [items, filter, categoryFilter, search])

  const outOfStockCount = items.filter(isOutOfStock).length
  const belowReorderCount = items.filter(isBelowReorder).length
  const fastMovingCount = items.filter(isFastMoving).length

  const selectedIds = Object.keys(selected).filter((id) => {
    const v = selected[id]
    return v && Number(v.qty) > 0
  })

  function toggleSelect(item) {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[item.id]) {
        delete next[item.id]
      } else {
        next[item.id] = { qty: String(suggestOrderQty(item)), unit: item.unit || 'pieces' }
      }
      return next
    })
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = { ...prev }
      filtered.forEach((item) => {
        if (!next[item.id]) {
          next[item.id] = { qty: String(suggestOrderQty(item)), unit: item.unit || 'pieces' }
        }
      })
      return next
    })
  }

  function clearSelection() {
    setSelected({})
  }

  function setQty(id, qty) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], qty } }))
  }

  function setUnit(id, unit) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], unit } }))
  }

  const orderItems = selectedIds
    .map((id) => {
      const item = items.find((i) => String(i.id) === String(id))
      if (!item) return null
      const sel = selected[id]
      return {
        id: item.id,
        name: item.name,
        generic_name: item.generic_name || '',
        category: item.category,
        current_stock: Number(item.current_stock) || 0,
        reorder_level: Number(item.reorder_level) || 0,
        monthly_usage: Number(item.monthly_usage) || 0,
        orderQty: Number(sel.qty) || 0,
        orderUnit: sel.unit || item.unit || 'pieces',
      }
    })
    .filter(Boolean)

  if (q.isLoading) {
    return (
      <ModalShell title="Generate Reorder List" subtitle="Loading products…" onClose={onClose}>
        <div className="space-y-4">
          <SkeletonTable rows={6} cols={8} />
        </div>
      </ModalShell>
    )
  }
  if (q.isError) {
    return (
      <ModalShell title="Generate Reorder List" subtitle="Error" onClose={onClose}>
        <ErrorState message={q.error?.message || 'Could not load products'} onRetry={q.refetch} />
      </ModalShell>
    )
  }

  return (
    <>
      <ModalShell
        title="Generate Reorder List"
        subtitle={`${items.length} products loaded`}
        onClose={onClose}
        maxWidth="max-w-5xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
            >
              Close
            </button>
            <button
              onClick={() => setShowOrderModal(true)}
              disabled={selectedIds.length === 0}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
            >
              <Icon name="download" size={14} /> Download Order ({selectedIds.length})
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Total Products" value={items.length} icon="box" color="blue" sublabel="all SKUs" />
            <StatTile label="Out of Stock" value={outOfStockCount} icon="xCircle" color="red" sublabel="need urgent reorder" />
            <StatTile label="Below Reorder" value={belowReorderCount} icon="alert" color="amber" sublabel="at/below threshold" />
            <StatTile label="Selected" value={selectedIds.length} icon="shoppingCart" color="purple" sublabel="in this order" />
          </div>

          {/* Search + primary filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or generic name…"
                className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {REORDER_FILTERS.map((f) => {
                const count =
                  f.key === 'all' ? items.length
                    : f.key === 'out_of_stock' ? outOfStockCount
                      : f.key === 'below_reorder' ? belowReorderCount
                        : fastMovingCount
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={[
                      'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap',
                      filter === f.key
                        ? 'bg-[#1a6cbf] text-white'
                        : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400',
                    ].join(' ')}
                  >
                    {f.label} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Type:</span>
            {CATEGORY_FILTERS.map((c) => {
              const count =
                c.key === 'all'
                  ? items.length
                  : items.filter((i) => productType(i) === c.key).length
              return (
                <button
                  key={c.key}
                  onClick={() => setCategoryFilter(c.key)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap',
                    categoryFilter === c.key
                      ? 'bg-[#1a6cbf] text-white'
                      : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400',
                  ].join(' ')}
                >
                  {c.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllVisible}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center gap-1.5"
              >
                <Icon name="check" size={13} /> Select All
              </button>
              <button
                onClick={clearSelection}
                disabled={selectedIds.length === 0}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center gap-1.5 disabled:opacity-40"
              >
                <Icon name="x" size={13} /> Clear Selection
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/80">
                  <Th align="center">✓</Th>
                  <Th>Item</Th>
                  <Th align="right" className="hidden sm:table-cell">Stock</Th>
                  <Th align="right" className="hidden md:table-cell">Reorder</Th>
                  <Th align="right" className="hidden lg:table-cell">Monthly Usage</Th>
                  <Th align="center">Status</Th>
                  <Th align="right">Order Qty</Th>
                  <Th>Unit</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filtered.map((item) => {
                  const isSelected = !!selected[item.id]
                  const st = statusFor(item)
                  const fast = isFastMoving(item)
                  const suggestion = suggestOrderQty(item)
                  return (
                    <tr key={item.id} className={isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item)}
                          className="w-4 h-4 rounded border-gray-300 text-[#1a6cbf] focus:ring-[#1a6cbf]/40 cursor-pointer"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge className={CATEGORY_BADGES[item.category] || CATEGORY_BADGES.other}>{cap(item.category)}</Badge>
                          {item.generic_name && (
                            <span className="text-[10px] text-gray-400">{item.generic_name}</span>
                          )}
                          {fast && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Fast</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap hidden sm:table-cell">
                        {item.current_stock}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap hidden md:table-cell">
                        {item.reorder_level}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap hidden lg:table-cell">
                        {item.monthly_usage ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={st.cls}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={selected[item.id]?.qty ?? ''}
                          onChange={(e) => {
                            if (!isSelected) toggleSelect(item)
                            setQty(item.id, e.target.value)
                          }}
                          placeholder={String(suggestion)}
                          className="w-20 px-2 py-1 text-right text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={selected[item.id]?.unit ?? item.unit ?? 'pieces'}
                          onChange={(e) => {
                            if (!isSelected) toggleSelect(item)
                            setUnit(item.id, e.target.value)
                          }}
                          className="px-2 py-1 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
                        >
                          <option value={selected[item.id]?.unit ?? item.unit ?? 'pieces'}>
                            {selected[item.id]?.unit ?? item.unit ?? 'pieces'}
                          </option>
                          {COMMON_UNITS.filter((u) => u !== (selected[item.id]?.unit ?? item.unit ?? 'pieces')).map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <EmptyState
              icon="box"
              title="No products match"
              description={search || filter !== 'all' || categoryFilter !== 'all' ? 'Try adjusting your filters.' : 'Products will appear here once added.'}
            />
          )}

          <p className="text-[11px] text-gray-400">
            Suggested order quantity = max(reorder×2 − stock, monthly usage×2 − stock, reorder level).
            Different units can't be summed, so no total quantity is shown.
          </p>
        </div>
      </ModalShell>

      {showOrderModal && orderItems.length > 0 && (
        <CreateOrderModal
          items={orderItems}
          onClose={() => setShowOrderModal(false)}
          onDone={() => {
            setShowOrderModal(false)
            clearSelection()
          }}
        />
      )}
    </>
  )
}

// ─── CreateOrderModal (PDF export) ──────────────────────────────
function CreateOrderModal({ items, onClose, onDone }) {
  function buildDoc() {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'normal')

    const pageWidth = doc.internal.pageSize.getWidth()
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Purchase Order', 14, 18)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26)
    doc.text(`Total items: ${items.length}`, 14, 32)
    doc.text(`Clinic: City Health Clinic`, pageWidth - 14, 26, { align: 'right' })
    doc.text(`Status: For Review`, pageWidth - 14, 32, { align: 'right' })

    const body = items.map((it, i) => [
      String(i + 1),
      it.name + (it.generic_name ? `\n${it.generic_name}` : ''),
      cap(it.category || 'general'),
      String(it.current_stock),
      String(it.orderQty),
      it.orderUnit,
    ])

    autoTable(doc, {
      startY: 40,
      head: [['#', 'Item', 'Category', 'Current Stock', 'Order Qty', 'Unit']],
      body,
      showHead: 'firstPage',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [26, 108, 191], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'right' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28 },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 24 },
      },
      margin: { left: 14, right: 14, bottom: 18 },
    })

    const pageCount = doc.internal.getNumberOfPages()
    const pageHeight = doc.internal.pageSize.getHeight()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      )
      doc.text('City Health Clinic · Purchase Order', 14, pageHeight - 8)
    }

    return doc
  }

  function handleDownload() {
    try {
      const doc = buildDoc()
      const filename = `purchase-order-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-6)}.pdf`
      doc.save(filename)
      toast.success(`Purchase order downloaded (${items.length} items)`)
      onDone?.()
    } catch (err) {
      toast.error(err?.message || 'Could not generate PDF')
    }
  }

  function handlePrintPreview() {
    try {
      const doc = buildDoc()
      const url = doc.output('bloburl')
      const w = window.open(url, '_blank')
      if (!w) {
        toast.error('Popup blocked — please allow popups to preview the PDF.')
        return
      }
      toast.success('PDF opened in a new tab — use Ctrl/Cmd+P to print.')
    } catch (err) {
      toast.error(err?.message || 'Could not preview PDF')
    }
  }

  return (
    <ModalShell
      title="Create Purchase Order"
      subtitle={`${items.length} item${items.length === 1 ? '' : 's'} selected`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
          >
            Close
          </button>
          <button
            onClick={handlePrintPreview}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center gap-2"
          >
            <Icon name="printer" size={14} /> Print Preview
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2"
          >
            <Icon name="download" size={14} /> Download PDF
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-start gap-2">
          <Icon name="info" size={14} className="text-[#1a6cbf] dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 dark:text-gray-300">
            The PDF will be downloaded automatically (no print dialog). Use <strong>Print Preview</strong> to inspect first.
            Different units can't be summed, so no total quantity row is included.
          </p>
        </div>

        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/80">
                <Th>#</Th>
                <Th>Item</Th>
                <Th align="left" className="hidden sm:table-cell">Category</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Qty</Th>
                <Th>Unit</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td className="px-4 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                    <p className="font-medium">{it.name}</p>
                    {it.generic_name && (
                      <p className="text-[10px] text-gray-400">{it.generic_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 hidden sm:table-cell">
                    <Badge className={CATEGORY_BADGES[it.category] || CATEGORY_BADGES.other}>{cap(it.category)}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{it.current_stock}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#1a6cbf] dark:text-blue-400">{it.orderQty}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{it.orderUnit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-400">
          {items.length} item{items.length === 1 ? '' : 's'} will be included in the purchase order PDF.
        </p>
      </div>
    </ModalShell>
  )
}
