'use client'

// InventoryTab — Admin inventory management with 4 internal sub-tabs.
// Sub-tab selection is component-local useState (no URL routing) since
// the parent /admin/inventory page already owns the URL.
//
// All four sub-tabs are admin-authed (mounted under router.use(authorize('admin'))):
//   Lab Stock         → GET/POST/PUT/DELETE /api/admin/lab-stock
//                       PATCH /api/admin/lab-stock/:id/quantity { adjustment }
//   Drug Stock        → GET/POST/PUT/DELETE /api/admin/drug-stock
//                       PATCH /api/admin/drug-stock/:id/quantity { adjustment }
//   Charge Templates  → GET/POST /api/admin/charge-templates
//                       PATCH/DELETE /api/admin/charge-templates/:id
//   Restock Verify    → GET /api/admin/restocks
//                       PATCH /api/admin/restocks/:id/verify | /reject
//
// Fetch strategy: lazy per sub-tab. Only the mounted sub-tab's query fires.
// Restock verification cross-invalidates lab + drug stock so approved stock
// shows immediately if those tabs are revisited.

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonTable, SkeletonList, Spinner,
  formatMoney, formatDate, timeAgo, cap, badgeClass,
} from '@/utils/helpers'

const SUB_TABS = [
  { key: 'lab', label: 'Lab Stock', icon: 'flask' },
  { key: 'drug', label: 'Drug Stock', icon: 'pillBottle' },
  { key: 'charges', label: 'Charge Templates', icon: 'tag' },
  { key: 'restocks', label: 'Restock Verification', icon: 'checkCircle' },
]

const CATEGORY_BADGES = {
  consultation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  procedure: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  medication: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
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
  general: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  hematology: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  chemistry: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  urinalysis: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  microbiology: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  supplies: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

// Free-text category option lists (no DB enum on stock categories)
const DRUG_CATEGORIES = ['antibiotic', 'analgesic', 'antihypertensive', 'antidiabetic', 'antacid', 'antihistamine', 'supplement', 'family_planning', 'thyroid', 'general']
const DRUG_FORMS = ['tablet', 'capsule', 'injection', 'syrup', 'cream', 'drops']
const LAB_CATEGORIES = ['supplies', 'hematology', 'chemistry', 'urinalysis', 'microbiology']

// ChargeCategory enum — must match schema exactly
const TEMPLATE_CATEGORIES = [
  { key: 'consultation', label: 'Consultation' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'lab', label: 'Lab Test' },
  { key: 'medication', label: 'Medication' },
]

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

export default function InventoryTab() {
  const [sub, setSub] = useState('lab')

  return (
    <div className="space-y-4">
      {/* Secondary pill nav */}
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
      {sub === 'drug' && <DrugStockSubTab />}
      {sub === 'charges' && <ChargeTemplatesSubTab />}
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

// Stock level visual bar — 0-100% width based on qty vs 2× reorder level
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

// Reusable category/form <option> renderers
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
    // ADD via adjustment — NOT an absolute set
    mutationFn: ({ id, quantity }) => api.patch(`/api/admin/lab-stock/${id}/quantity`, { adjustment: quantity }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'lab-stock'] }),
  })

  const editMut = useMutation({
    // PUT preserves current_stock (endpoint only touches supplied metadata fields)
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

  // Endpoint returns { stock }
  const items = Array.isArray(q.data?.stock) ? q.data.stock : []
  const lowStock = items.filter((i) => (Number(i.current_stock) || 0) > 0 && (Number(i.current_stock) || 0) <= (Number(i.reorder_level) || 0))
  const outOfStock = items.filter((i) => (Number(i.current_stock) || 0) === 0)
  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expiry_date)
    return d !== null && d >= 0 && d <= 90
  })

  return (
    <div className="space-y-4">
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
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
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
                unit_cost: Number(body.unit_cost) || 0,
                supplier: body.supplier || null,
                batch_number: body.batch_number || null,
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

// ─── Sub-tab 2: Drug Stock ───────────────────────────────────────
function DrugStockSubTab() {
  const queryClient = useQueryClient()
  const [restockItem, setRestockItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [search, setSearch] = useState('')
  const [showAddDrug, setShowAddDrug] = useState(false)

  const q = useQuery({
    queryKey: ['admin', 'drug-stock'],
    queryFn: () => api.get('/api/admin/drug-stock'),
    staleTime: 30000,
  })

  const restockMut = useMutation({
    mutationFn: ({ id, quantity }) => api.patch(`/api/admin/drug-stock/${id}/quantity`, { adjustment: quantity }),
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

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={8} />
      </div>
    )
  }
  if (q.isError) {
    return <ErrorState message={q.error?.message || 'Could not load drug stock'} onRetry={q.refetch} />
  }

  const items = Array.isArray(q.data?.items) ? q.data.items : []
  const lowStock = items.filter((i) => (Number(i.current_stock) || 0) > 0 && (Number(i.current_stock) || 0) <= (Number(i.reorder_level) || 0))
  const outOfStock = items.filter((i) => (Number(i.current_stock) || 0) === 0)
  // Inventory value at cost
  const totalValue = items.reduce((s, i) => s + (Number(i.current_stock) || 0) * (Number(i.unit_cost) || 0), 0)

  const sq = search.trim().toLowerCase()
  const filtered = items.filter((i) => {
    if (!sq) return true
    return (i.name || '').toLowerCase().includes(sq) || (i.generic_name || '').toLowerCase().includes(sq)
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Drugs" value={items.length} icon="pillBottle" color="blue" sublabel="SKUs" />
        <StatTile label="Low Stock" value={lowStock.length} icon="alert" color="amber" sublabel="need reorder" />
        <StatTile label="Out of Stock" value={outOfStock.length} icon="xCircle" color="red" sublabel="items" />
        <StatTile label="Inventory Value" value={formatMoney(totalValue)} icon="dollarSign" color="green" sublabel="qty × unit cost" />
      </div>

      <div className="relative">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by drug or generic name…"
          className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Drug Stock" subtitle={`${filtered.length} of ${items.length} item${items.length === 1 ? '' : 's'}`}
          action={
            <button onClick={() => setShowAddDrug(true)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5">
              <Icon name="plus" size={14} /> Add Drug
            </button>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState icon="pillBottle" title="No drugs found" description={search ? 'Try a different search term.' : 'Drug stock will appear here.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Drug</Th>
                  <Th align="left" className="hidden md:table-cell">Category</Th>
                  <Th>Stock</Th>
                  <Th align="right" className="hidden lg:table-cell">Reorder</Th>
                  <Th align="right" className="hidden sm:table-cell">Unit Cost</Th>
                  <Th align="right" className="hidden sm:table-cell">Retail</Th>
                  <Th align="left" className="hidden lg:table-cell">Expiry</Th>
                  <Th align="center">Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filtered.map((item) => {
                  const st = statusFor(item)
                  const ex = expiryBadge(item.expiry_date)
                  const retail = Number(item.normal_price) || 0  // OTC normal-tier sell price
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                        <p className="text-[11px] text-gray-400">{item.generic_name || '—'}{item.strength ? ` · ${item.strength}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={CATEGORY_BADGES[item.category] || CATEGORY_BADGES.other}>{cap(item.category)}</Badge>
                      </td>
                      <td className="px-4 py-3"><StockBar item={item} /></td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap hidden lg:table-cell">
                        {item.reorder_level} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap hidden sm:table-cell">
                        {formatMoney(item.unit_cost)}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-emerald-700 dark:text-emerald-400 tabular-nums font-semibold whitespace-nowrap hidden sm:table-cell">
                        {formatMoney(retail)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
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
                            try { await delMut.mutateAsync(item.id); toast.success('Drug deleted') }
                            catch (err) { toast.error(err.message || 'Could not delete drug') }
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
          title="Restock Drug"
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
              toast.error(err.message || 'Could not restock drug')
            }
          }}
        />
      )}

      {editItem && (
        <EditDrugItemModal
          item={editItem}
          loading={editMut.isPending}
          onClose={() => setEditItem(null)}
          onSubmit={async (body) => {
            try {
              await editMut.mutateAsync({ id: editItem.id, ...body })
              toast.success('Drug updated')
              setEditItem(null)
            } catch (err) {
              toast.error(err.message || 'Could not update drug')
            }
          }}
        />
      )}

      {showAddDrug && (
        <AddDrugModal loading={false} onClose={() => setShowAddDrug(false)}
          onSubmit={async (body) => {
            try {
              await api.post('/api/admin/drug-stock', {
                name: body.name,
                generic_name: body.generic_name,
                category: body.category,
                form: body.form,
                strength: body.strength,
                current_stock: Number(body.quantity),
                unit: body.unit,
                reorder_level: Number(body.reorder_level) || 0,
                unit_cost: Number(body.unit_cost) || 0,
                normal_price: Number(body.normal_price) || 0,
                promotional_price: Number(body.promotional_price) || 0,
                wholesale_price: Number(body.wholesale_price) || 0,
                supplier: body.supplier || null,
                expiry_date: body.expiry_date || null,
                batch_number: body.batch_number || null,
              })
              toast.success(`${body.name} added to drug inventory`)
              queryClient.invalidateQueries({ queryKey: ['admin', 'drug-stock'] })
              setShowAddDrug(false)
            } catch (err) { toast.error(err.message || 'Could not add drug') }
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-tab 3: Charge Templates ─────────────────────────────────
function ChargeTemplatesSubTab() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const q = useQuery({
    queryKey: ['admin', 'charge-templates'],
    queryFn: () => api.get('/api/admin/charge-templates'),
    staleTime: 60000,
  })

  const addMut = useMutation({
    mutationFn: (body) => api.post('/api/admin/charge-templates', {
      name: body.name, category: body.category, amount: Number(body.price), is_active: body.is_active,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] }),
  })
  const editMut = useMutation({
    mutationFn: ({ id, body }) => {
      const patch = {}
      if (body.price != null) patch.amount = Number(body.price)
      if (body.is_active != null) patch.is_active = body.is_active
      if (body.name != null) patch.name = body.name
      if (body.category != null) patch.category = body.category
      return api.patch(`/api/admin/charge-templates/${id}`, patch)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] }),
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/charge-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] }),
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={5} />
      </div>
    )
  }
  if (q.isError) {
    return <ErrorState message={q.error?.message || 'Could not load charge templates'} onRetry={q.refetch} />
  }

  // Single ChargeTemplate table. Alias amount -> price for the existing UI.
  const templates = Array.isArray(q.data?.templates) ? q.data.templates : []
  const all = templates.map((t) => ({ ...t, price: t.amount }))

  // Group by category
  const groups = {}
  for (const t of all) {
    const key = t.category || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }
  const groupOrder = ['consultation', 'procedure', 'lab', 'medication']
  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a[0])
    const bi = groupOrder.indexOf(b[0])
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const activeCount = all.filter((t) => t.is_active).length
  const avg = all.length ? all.reduce((s, t) => s + (Number(t.price) || 0), 0) / all.length : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Templates" value={all.length} icon="tag" color="blue" sublabel="chargeable services" />
        <StatTile label="Active" value={activeCount} icon="checkCircle" color="green" sublabel="available for billing" />
        <StatTile label="Inactive" value={all.length - activeCount} icon="archive" color="slate" sublabel="hidden from billing" />
        <StatTile label="Avg Charge" value={formatMoney(avg)} icon="dollarSign" color="amber" sublabel="across all templates" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          {sortedGroups.length} categor{sortedGroups.length === 1 ? 'y' : 'ies'} · inline-edit amount, toggle active, or delete
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-1.5"
        >
          <Icon name="plus" size={14} /> Add Template
        </button>
      </div>

      {sortedGroups.length === 0 ? (
        <EmptyState icon="tag" title="No charge templates" description="Add your first chargeable service to get started." />
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([cat, items]) => (
            <Card key={cat} className="overflow-hidden">
              <CardHeader
                title={cap(cat)}
                subtitle={`${items.length} template${items.length === 1 ? '' : 's'}`}
                action={<Badge className={CATEGORY_BADGES[cat] || CATEGORY_BADGES.other}>{cap(cat)}</Badge>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                      <Th>Name</Th>
                      <Th align="left" className="hidden sm:table-cell">Category</Th>
                      <Th align="right">Amount</Th>
                      <Th align="center">Active</Th>
                      <Th align="right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                    {items.map((t) => (
                      <ChargeTemplateRow
                        key={t.id}
                        template={t}
                        isEditing={editingId === t.id}
                        loading={editMut.isPending || delMut.isPending}
                        onEdit={() => setEditingId(editingId === t.id ? null : t.id)}
                        onToggle={async () => {
                          try {
                            await editMut.mutateAsync({ id: t.id, body: { is_active: !t.is_active } })
                            toast.success(`${t.name} ${t.is_active ? 'deactivated' : 'activated'}`)
                          } catch (err) {
                            toast.error(err.message || 'Could not update template')
                          }
                        }}
                        onSave={async (price) => {
                          try {
                            await editMut.mutateAsync({ id: t.id, body: { price: Number(price) } })
                            toast.success(`${t.name} amount updated`)
                            setEditingId(null)
                          } catch (err) {
                            toast.error(err.message || 'Could not update amount')
                          }
                        }}
                        onDelete={async () => {
                          if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return
                          try {
                            await delMut.mutateAsync(t.id)
                            toast.success('Template deleted')
                          } catch (err) {
                            toast.error(err.message || 'Could not delete template')
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <AddTemplateModal
          loading={addMut.isPending}
          onClose={() => setShowAdd(false)}
          onSubmit={async (body) => {
            try {
              await addMut.mutateAsync(body)
              toast.success('Template added')
              setShowAdd(false)
            } catch (err) {
              toast.error(err.message || 'Could not add template')
            }
          }}
        />
      )}
    </div>
  )
}

function ChargeTemplateRow({ template, isEditing, loading, onEdit, onToggle, onSave, onDelete }) {
  const [price, setPrice] = useState(String(template.price || 0))

  // Re-sync the local price input when the parent template price changes
  // (e.g. after a successful save round-trip or external mutation).
  useEffect(() => {
    if (!isEditing) setPrice(String(template.price || 0))
  }, [template.price, isEditing])

  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
      <td className="px-4 py-3">
        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{template.name}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider sm:hidden">{cap(template.category)}</p>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <Badge className={CATEGORY_BADGES[template.category] || CATEGORY_BADGES.other}>{cap(template.category)}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[11px] text-gray-400">KSh</span>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-24 px-2 py-1 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave(price)
                if (e.key === 'Escape') onEdit()
              }}
            />
          </div>
        ) : (
          <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(template.price)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={onToggle}
          disabled={loading}
          title={template.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
          className={[
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50',
            template.is_active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
              template.is_active ? 'translate-x-5' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {isEditing ? (
            <>
              <RowAction icon="check" label="Save" color="blue" onClick={() => onSave(price)} disabled={loading} />
              <RowAction icon="x" label="Cancel" onClick={onEdit} disabled={loading} />
            </>
          ) : (
            <>
              <RowAction icon="edit" label="Edit amount" color="amber" onClick={onEdit} disabled={loading} />
              <RowAction icon="trash" label="Delete" color="red" onClick={onDelete} disabled={loading} />
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function AddTemplateModal({ loading, onClose, onSubmit }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('procedure')
  const [price, setPrice] = useState('')
  const [isActive, setIsActive] = useState(true)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const numPrice = Number(price)
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      toast.error('Amount must be a non-negative number')
      return
    }
    await onSubmit({ name: name.trim(), category, price: numPrice, is_active: isActive })
  }

  return (
    <ModalShell
      title="Add Charge Template"
      subtitle="Create a new chargeable service line"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="add-template-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="save" size={14} />}
            {loading ? 'Saving…' : 'Add Template'}
          </button>
        </>
      }
    >
      <form id="add-template-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ECG, Ultrasound, Depo-Provera Injection"
            className={inputCls}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category *">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (KSh) *">
            <input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className={`${inputCls} tabular-nums`}
            />
          </Field>
        </div>
        <Field label="Status">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#1a6cbf] focus:ring-[#1a6cbf]/40"
            />
            <span className="text-[13px] text-gray-700 dark:text-gray-300">Active (available for billing)</span>
          </label>
        </Field>
      </form>
    </ModalShell>
  )
}

// ─── Restock modal (lab + drug) ──────────────────────────────────
function RestockModal({ title, subtitle, item, loading, onClose, onConfirm }) {
  const [quantity, setQuantity] = useState(Math.max(1, Math.ceil((Number(item.reorder_level) || 10) * 1.5)))

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
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="restock-form" disabled={!valid || loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="plus" size={14} />}
            {loading ? 'Restocking…' : 'Restock'}
          </button>
        </>
      }
    >
      <form id="restock-form" onSubmit={(e) => { e.preventDefault(); if (valid && !loading) onConfirm(qty) }} className="space-y-4">
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
              {formatMoney(item.unit_cost)}
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
              {formatMoney(newStock * (Number(item.unit_cost) || 0))}
            </span>
          </div>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Edit lab item modal (name/reorder/expiry) ──────────────────
function EditLabItemModal({ item, loading, onClose, onSubmit }) {
  const [name, setName] = useState(item.name || '')
  const [reorderLevel, setReorderLevel] = useState(String(item.reorder_level || 0))
  const [expiryDate, setExpiryDate] = useState(
    item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : ''
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const rl = Number(reorderLevel)
    if (!Number.isFinite(rl) || rl < 0) {
      toast.error('Reorder level must be a non-negative number')
      return
    }
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
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reorder Level *">
            <input
              type="number"
              min="0"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className={`${inputCls} tabular-nums`}
            />
          </Field>
          <Field label="Expiry Date">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={inputCls}
            />
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

// ─── Edit drug item modal (metadata + price tiers, NOT stock) ────
function EditDrugItemModal({ item, loading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: item.name || '',
    generic_name: item.generic_name || '',
    category: item.category || 'general',
    form: item.form || 'tablet',
    strength: item.strength || '',
    unit: item.unit || 'tablets',
    reorder_level: String(item.reorder_level ?? 0),
    unit_cost: String(item.unit_cost ?? 0),
    normal_price: String(item.normal_price ?? 0),
    promotional_price: String(item.promotional_price ?? 0),
    wholesale_price: String(item.wholesale_price ?? 0),
    supplier: item.supplier || '',
    batch_number: item.batch_number || '',
    expiry_date: item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Drug name is required'); return }
    const rl = Number(form.reorder_level)
    if (!Number.isFinite(rl) || rl < 0) { toast.error('Reorder level must be a non-negative number'); return }
    await onSubmit({
      name: form.name.trim(),
      generic_name: form.generic_name.trim(),
      category: form.category,
      form: form.form,
      strength: form.strength,
      unit: form.unit,
      reorder_level: rl,
      unit_cost: Number(form.unit_cost) || 0,
      normal_price: Number(form.normal_price) || 0,
      promotional_price: Number(form.promotional_price) || 0,
      wholesale_price: Number(form.wholesale_price) || 0,
      supplier: form.supplier,
      batch_number: form.batch_number,
      expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null,
    })
  }

  return (
    <ModalShell
      title="Edit Drug"
      subtitle={item.name}
      onClose={loading ? undefined : onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="edit-drug-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="save" size={14} />}
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form id="edit-drug-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Drug Name *">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Generic Name">
            <input type="text" value={form.generic_name} onChange={(e) => set('generic_name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {optionsFrom(DRUG_CATEGORIES)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Form">
            <select value={form.form} onChange={(e) => set('form', e.target.value)} className={inputCls}>
              {optionsFrom(DRUG_FORMS)}
            </select>
          </Field>
          <Field label="Strength">
            <input type="text" value={form.strength} onChange={(e) => set('strength', e.target.value)} placeholder="e.g. 500mg" className={inputCls} />
          </Field>
          <Field label="Unit">
            <input type="text" value={form.unit} onChange={(e) => set('unit', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reorder Level *">
            <input type="number" min="0" value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Unit Cost (KSh)" hint="Buying / cost price">
            <input type="number" min="0" step="any" value={form.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Normal (KSh)">
            <input type="number" min="0" step="any" value={form.normal_price} onChange={(e) => set('normal_price', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Promotional">
            <input type="number" min="0" step="any" value={form.promotional_price} onChange={(e) => set('promotional_price', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Wholesale">
            <input type="number" min="0" step="any" value={form.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <input type="text" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Batch Number">
            <input type="text" value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Expiry Date">
          <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={inputCls} />
        </Field>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 flex items-start gap-2">
          <Icon name="info" size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Stock quantity is changed via the Restock action, not here. The clinic prescription price is computed at billing from the Normal price × (1 + markup %).
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
    reorder_level: '10', unit_cost: '', supplier: '', expiry_date: '', batch_number: '',
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Batch Number">
            <input type="text" value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} placeholder="e.g. HB-25-03" className={inputCls} />
          </Field>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Add Drug Modal ──────────────────────────────────────────────
function AddDrugModal({ loading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '', generic_name: '', category: 'antibiotic', form: 'tablet', strength: '',
    quantity: '', unit: 'tablets', reorder_level: '50',
    unit_cost: '', normal_price: '', promotional_price: '', wholesale_price: '',
    supplier: '', expiry_date: '', batch_number: '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const valid = form.name.trim() && form.quantity !== ''
  return (
    <ModalShell title="Add Drug to Inventory" subtitle="Create a new drug stock item" onClose={onClose} maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">Cancel</button>
          <button onClick={() => onSubmit(form)} disabled={loading || !valid} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50 flex items-center gap-2">
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="plus" size={14} />} Add Drug
          </button>
        </div>
      }>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(form) }} className="space-y-3">
        <Field label="Drug Name *">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Amoxicillin 500mg" className={inputCls} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Generic Name">
            <input type="text" value={form.generic_name} onChange={(e) => set('generic_name', e.target.value)} placeholder="e.g. Amoxicillin" className={inputCls} />
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {optionsFrom(DRUG_CATEGORIES)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Form">
            <select value={form.form} onChange={(e) => set('form', e.target.value)} className={inputCls}>
              {optionsFrom(DRUG_FORMS)}
            </select>
          </Field>
          <Field label="Strength">
            <input type="text" value={form.strength} onChange={(e) => set('strength', e.target.value)} placeholder="e.g. 500mg" className={inputCls} />
          </Field>
          <Field label="Unit">
            <input type="text" value={form.unit} onChange={(e) => set('unit', e.target.value)} className={inputCls} />
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
          <Field label="Unit Cost (KSh)" hint="Buying / cost price">
            <input type="number" min="0" step="any" value={form.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Expiry Date">
            <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Normal (KSh)" hint="OTC price">
            <input type="number" min="0" step="any" value={form.normal_price} onChange={(e) => set('normal_price', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Promotional">
            <input type="number" min="0" step="any" value={form.promotional_price} onChange={(e) => set('promotional_price', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Wholesale">
            <input type="number" min="0" step="any" value={form.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <input type="text" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="e.g. Phillips Pharma" className={inputCls} />
          </Field>
          <Field label="Batch Number">
            <input type="text" value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} placeholder="e.g. AMX2025-04" className={inputCls} />
          </Field>
        </div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-start gap-2">
          <Icon name="info" size={14} className="text-[#1a6cbf] dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 dark:text-gray-300">
            Normal / Promotional / Wholesale are the three OTC sale tiers. The clinic prescription price is computed at billing from Normal × (1 + markup %) — it is not stored here.
          </p>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Sub-tab 4: Restock Verification ─────────────────────────────
function RestockVerificationSubTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState('all')
  const [verifying, setVerifying] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  const q = useQuery({
    queryKey: ['admin', 'restocks'],
    queryFn: () => api.get('/api/admin/restocks'),
    refetchInterval: 30000,
    staleTime: 15000,
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

  const all = q.data?.restocks || []
  const stats = q.data?.stats || {}
  const filtered = filter === 'all' ? all : all.filter((r) => r.status === filter)

  const handleVerify = async (r, notes, qty) => {
    try {
      const body = { verification_notes: notes }
      if (qty != null && Number(qty) !== r.received_qty) body.adjusted_qty = Number(qty)
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Pending" value={stats.pending ?? 0} icon="alert" color="amber" sublabel={formatMoney(stats.pending_value ?? 0)} />
        <StatTile label="Approved" value={stats.approved ?? 0} icon="checkCircle" color="green" sublabel="added to stock" />
        <StatTile label="Rejected" value={stats.rejected ?? 0} icon="xCircle" color="red" sublabel="no stock added" />
        <StatTile label="Total" value={all.length} icon="box" color="blue" sublabel="all requests" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected'].map((f) => {
          const count = f === 'all' ? all.length : all.filter((r) => r.status === f).length
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
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{r.item_name}</p>
                        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">{cap(r.department)}</Badge>
                        <Badge className={badgeClass(r.status)}>{cap(r.status)}</Badge>
                        {r.direct_restock && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Direct</Badge>}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Requested by {r.requested_by} · {timeAgo(r.requested_at)}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                        <div><span className="text-gray-400">Current:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{r.current_stock}</span></div>
                        <div><span className="text-gray-400">Received:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{r.received_qty}</span></div>
                        <div><span className="text-gray-400">Unit cost:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{formatMoney(r.unit_cost)}</span></div>
                        <div><span className="text-gray-400">Total:</span> <span className="font-semibold text-gray-900 dark:text-gray-100">{formatMoney(r.unit_cost * r.received_qty)}</span></div>
                        <div><span className="text-gray-400">Supplier:</span> <span className="text-gray-700 dark:text-gray-300">{r.supplier || '—'}</span></div>
                        <div><span className="text-gray-400">Batch:</span> <span className="text-gray-700 dark:text-gray-300">{r.batch_number || '—'}</span></div>
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
  const [qty, setQty] = useState(String(restock.received_qty))
  return (
    <ModalShell title="Verify Restock" subtitle={`${restock.item_name} · ${cap(restock.department)}`} onClose={loading ? undefined : onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">Cancel</button>
          <button onClick={() => onConfirm(restock, notes, qty)} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />} Approve & Add to Stock
          </button>
        </div>
      }>
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 p-3 space-y-1.5 text-[12px]">
          <div className="flex justify-between"><span className="text-gray-400">Current stock:</span><span className="font-medium">{restock.current_stock}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Requested:</span><span className="font-medium">{restock.requested_qty}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Supplier:</span><span className="font-medium">{restock.supplier || '—'}</span></div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Quantity to add (adjust if different)</label>
          <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Verification notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Verified against PO #1234" className={`${inputCls} resize-none`} />
        </div>
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
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Reason for rejection *</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Wrong quantity received, damaged packaging..." className={`${inputCls} resize-none`} />
    </ModalShell>
  )
}