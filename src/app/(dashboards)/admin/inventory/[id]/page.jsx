'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, InlineLoader, Icon,
  formatMoney, formatDate, timeAgo, cap,
} from '@/utils/helpers'
import { use } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const labelCls =
  'block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5'

const ACTION_META = {
  sale:            { label: 'Sale',       badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  dispense:        { label: 'Dispense',   badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  issue:           { label: 'Issue',      badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  restock:         { label: 'Restock',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  return_to_stock: { label: 'Return',     badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  adjustment:      { label: 'Adjustment', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  writeoff:        { label: 'Write-off',  badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function expiryBadge(dateStr) {
  const d = daysUntil(dateStr)
  if (d === null) return { label: 'No expiry', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400' }
  if (d < 0) return { label: 'Expired', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (d <= 30) return { label: `${d}d left`, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (d <= 90) return { label: `${d}d left`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  return { label: `${d}d left`, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
}

function stockStatus(stock, reorder) {
  const s = Number(stock) || 0
  const r = Number(reorder) || 0
  if (s === 0) return { key: 'out_of_stock', label: 'Out of Stock', color: 'red' }
  if (s <= r) return { key: 'low_stock', label: 'Low Stock', color: 'amber' }
  return { key: 'in_stock', label: 'In Stock', color: 'green' }
}

function actionMeta(reason) {
  return ACTION_META[reason] || {
    label: cap(reason || 'event'),
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  }
}

function refLabel(refType, refId) {
  if (!refType || !refId) return null
  const map = {
    prescription_item: 'Rx Item',
    otc_sale: 'OTC Sale',
    restock_request: 'Restock',
    pharmacy_order: 'Order',
    prescription: 'Prescription',
  }
  return `${map[refType] || cap(refType)} #${refId}`
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminProductPage({ params }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { id } = use(params)  // ← unwrap here
  const productId = Number(id)

  // Modals
  const [showRestock, setShowRestock] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Movement filters
  const [reasonFilter, setReasonFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  // Data
  const detailQuery = useQuery({
    queryKey: ['admin', 'product', productId],
    queryFn: () => api.get(`/api/admin/products/${productId}`),
    enabled: !!productId,
  })

  const movementsQuery = useQuery({
    queryKey: ['admin', 'product', productId, 'movements', { reasonFilter, batchFilter, dateFrom, dateTo, page }],
    queryFn: () => api.get(`/api/admin/products/${productId}/movements`, {
      params: {
        reason: reasonFilter || undefined,
        batch_id: batchFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page,
        limit,
      },
    }),
    enabled: !!productId,
  })

  const product = detailQuery.data?.product
  const batches = detailQuery.data?.batches || []
  const summary = detailQuery.data?.summary || {}
  const movements = movementsQuery.data?.movements || []
  const totalMovements = movementsQuery.data?.total || 0
  const totalPages = Math.ceil(totalMovements / limit)

  const delMut = useMutation({
    mutationFn: () => api.delete(`/api/admin/drug-stock/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.success('Product deactivated')
      router.push('/admin/inventory')
    },
    onError: (err) => {
      toast.error(err.message || 'Could not deactivate product')
      setConfirmDelete(false)
    },
  })

  if (detailQuery.isLoading) {
    return (
      <div className="p-6 space-y-5">
        <InlineLoader label="Loading product…" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="p-6">
        <EmptyState icon="package" title="Product not found" description="This product may have been removed." />
      </div>
    )
  }

  const stock = Number(product.current_stock) || 0
  const reorder = Number(product.reorder_level) || 0
  const status = stockStatus(stock, reorder)
  const activeBatches = batches.filter((b) => !b.is_exhausted)

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => router.push('/admin/inventory')}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 hover:border-[#1a6cbf] hover:text-[#1a6cbf] transition-colors"
          >
            <Icon name="arrowLeft" size={14} />
            Back
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[18px] font-bold text-gray-900 dark:text-gray-100 truncate">
                {product.name}
              </h1>
              <Badge className={status.key === 'in_stock' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : status.key === 'low_stock' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}>
                {status.label}
              </Badge>
              <Badge className={product.is_active ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                {product.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              {product.generic_name ? `${product.generic_name} · ` : ''}
              {cap(product.category)}
              {product.form ? ` · ${cap(product.form)}` : ''}
              {product.strength ? ` · ${product.strength}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { detailQuery.refetch(); movementsQuery.refetch() }}
            disabled={detailQuery.isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 hover:border-[#1a6cbf] hover:text-[#1a6cbf] disabled:opacity-50 transition-colors"
          >
            <Icon name="refresh" size={14} className={detailQuery.isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowRestock(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg bg-[#1a6cbf] hover:bg-[#155a9f] text-white transition-colors"
          >
            <Icon name="plus" size={14} />
            Restock
          </button>
        </div>
      </div>

      {/* ─── 4 Stat Tiles ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon="box" label="Current Stock" value={stock.toLocaleString()} sublabel={product.unit} color={status.color} />
        <StatTile icon="alert" label="Reorder Level" value={reorder.toLocaleString()} sublabel={product.unit} color="amber" />
        <StatTile icon="dollarSign" label="Retail Price" value={formatMoney(product.normal_price)} sublabel="per unit" color="green" />
        <StatTile icon="barChart" label="Total Movements" value={(summary.total_movements ?? totalMovements).toLocaleString()} sublabel="all time" color="blue" />
      </div>

      {/* ─── 3-Column Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Product Details */}
          <Card>
            <CardHeader title="Product Details" subtitle="Identity, pricing & batches" />
            <div className="p-4 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <DetailRow label="Item Name">{product.name}</DetailRow>
                <DetailRow label="Generic Name">{product.generic_name || '—'}</DetailRow>
                <DetailRow label="SKU">{product.sku || '—'}</DetailRow>
                <DetailRow label="Category"><Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">{cap(product.category)}</Badge></DetailRow>
                <DetailRow label="Sub-category"><Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">{cap(product.sub_category || product.category)}</Badge></DetailRow>
                <DetailRow label="Form">{product.form ? cap(product.form) : '—'}</DetailRow>
                <DetailRow label="Strength">{product.strength || '—'}</DetailRow>
                <DetailRow label="Unit">{product.unit || '—'}</DetailRow>
                <DetailRow label="Supplier">{product.supplier || '—'}</DetailRow>
                <DetailRow label="Created">{formatDate(product.created_at)}</DetailRow>
              </div>

              {/* Price Tiers */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Price Tiers</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <PriceTier label="Normal" value={formatMoney(product.normal_price)} badge="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" />
                  <PriceTier label="Promotional" value={formatMoney(product.promotional_price)} badge="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" />
                  <PriceTier label="Wholesale" value={formatMoney(product.wholesale_price)} badge="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" />
                  <PriceTier label="Unit Cost" value={formatMoney(product.unit_cost || 0)} badge="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400" />
                </div>
              </div>

              {/* Batches — card list, NOT table */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  Batches · {activeBatches.length} active
                </p>
                {batches.length === 0 ? (
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 italic py-2">No batches recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {batches.map((b) => {
                      const eb = expiryBadge(b.expiry_date)
                      const exhausted = b.is_exhausted || Number(b.quantity || 0) === 0
                      return (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a]/40 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Batch #{b.batch_number}</span>
                              <Badge className={eb.cls}>{eb.label}</Badge>
                              {exhausted && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">Exhausted</Badge>}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Received {formatDate(b.received_at)} {b.received_by ? `· ${b.received_by}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-[14px] font-bold tabular-nums ${exhausted ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                              {Number(b.quantity) || 0}
                            </p>
                            <p className="text-[10px] text-gray-400">{product.unit}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Stock History — card list, NOT table */}
          <Card>
            <CardHeader
              title="Stock Movement History"
              subtitle={`${totalMovements} records`}
              action={
                <button
                  onClick={() => { setReasonFilter(''); setBatchFilter(''); setDateFrom(''); setDateTo(''); setPage(1) }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] transition-colors"
                >
                  Reset
                </button>
              }
            />

            {/* Filters */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/40 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Reason</label>
                <select value={reasonFilter} onChange={(e) => { setReasonFilter(e.target.value); setPage(1) }} className={inputCls}>
                  <option value="">All reasons</option>
                  {Object.entries(ACTION_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Batch</label>
                <select value={batchFilter} onChange={(e) => { setBatchFilter(e.target.value); setPage(1) }} className={inputCls}>
                  <option value="">All batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>Batch #{b.batch_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>From</label>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>To</label>
                <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className={inputCls} />
              </div>
            </div>

            {/* Movement cards */}
            <div className="p-4 space-y-2">
              {movementsQuery.isLoading ? (
                <InlineLoader label="Loading movements…" />
              ) : movements.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="No movements match"
                  description="Try changing the filters or restock this product to see history."
                />
              ) : (
                <>
                  {movements.map((m) => {
                    const meta = actionMeta(m.reason)
                    const positive = m.delta > 0
                    const negative = m.delta < 0
                    return (
                      <div
                        key={m.id}
                        className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a]/40 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center shrink-0">
                          <span className={`text-[13px] font-bold tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500'}`}>
                            {positive ? '+' : ''}{m.delta}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={meta.badge}>{meta.label}</Badge>
                            {m.batch && (
                              <span className="text-[10px] text-gray-400 font-mono">Batch #{m.batch.batch_number}</span>
                            )}
                            <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(m.created_at)}</span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {refLabel(m.ref_type, m.ref_id) ? (
                              <span className="text-[11px] font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/40 px-1.5 py-0.5 rounded">
                                {refLabel(m.ref_type, m.ref_id)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic">No reference</span>
                            )}
                            <span className="text-[11px] text-gray-400">· {m.staff?.username || 'System'}</span>
                          </div>

                          {m.note && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 italic">{m.note}</p>
                          )}
                        </div>

                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</p>
                          <p className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{m.balance_after}</p>
                        </div>
                      </div>
                    )
                  })}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-5">
          {/* Actions */}
          <Card>
            <CardHeader title="Actions" subtitle="Manage this product" />
            <div className="p-4 space-y-2">
              <ActionButton icon="plus" label="Restock" subtitle="Add quantity + new batch" onClick={() => setShowRestock(true)} primary />
              <ActionButton icon="edit" label="Edit Prices & Reorder" subtitle="Name, prices, supplier" onClick={() => setShowEdit(true)} />
              <ActionButton icon="arrowLeft" label="Back to Inventory" subtitle="Return to inventory list" onClick={() => router.push('/admin/inventory')} />
              <ActionButton
                icon="trash"
                label={confirmDelete ? 'Click again to confirm' : 'Deactivate Product'}
                subtitle="Hide from sales, orders and prescriptions"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    setTimeout(() => setConfirmDelete(false), 4000)
                    return
                  }
                  delMut.mutate()
                }}
                danger
                loading={delMut.isPending}
              />
            </div>
          </Card>

          {/* Movement Summary */}
          <Card>
            <CardHeader title="Movement Summary" subtitle="Stock in vs out" />
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <SummaryTile label="Total In" value={`+${summary.total_in ?? 0}`} color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/30" />
                <SummaryTile label="Total Out" value={`−${summary.total_out ?? 0}`} color="text-rose-700 dark:text-rose-400" bg="bg-rose-50 dark:bg-rose-950/30" />
                <SummaryTile label="Net" value={`${(summary.net_movement ?? 0) >= 0 ? '+' : ''}${summary.net_movement ?? 0}`} color={(summary.net_movement ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'} bg="bg-blue-50 dark:bg-blue-950/30" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <CountTile label="Restocks" value={summary.restock_count ?? 0} />
                <CountTile label="Sales" value={summary.sale_count ?? 0} />
                <CountTile label="Dispensed" value={summary.dispense_count ?? 0} />
                <CountTile label="Returns" value={summary.return_count ?? 0} />
                <CountTile label="Adjustments" value={summary.adjustment_count ?? 0} />
                <CountTile label="Write-offs" value={summary.writeoff_count ?? 0} />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ─── Modals ─── */}
      {showRestock && <RestockModal product={product} onClose={() => setShowRestock(false)} />}
      {showEdit && <EditModal product={product} onClose={() => setShowEdit(false)} />}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatTile({ icon, label, value, sublabel, color = 'blue' }) {
  const map = {
    blue:   { card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50',   value: 'text-blue-700 dark:text-blue-400',   icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
    green:  { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', value: 'text-emerald-700 dark:text-emerald-400', icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
    amber:  { card: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50', value: 'text-amber-700 dark:text-amber-400', icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
    red:    { card: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50',       value: 'text-red-700 dark:text-red-400',     icon: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
    purple: { card: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50', value: 'text-purple-700 dark:text-purple-400', icon: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' },
  }
  const c = map[color] || map.blue
  return (
    <div className={`rounded-xl border p-4 ${c.card}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-400">{label}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.icon}`}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${c.value}`}>{value}</p>
      {sublabel && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{sublabel}</p>}
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700/40 last:border-0 last:pb-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 pt-0.5 shrink-0">{label}</dt>
      <dd className="text-[13px] text-gray-900 dark:text-gray-100 text-right font-medium wrap-break-word min-w-0">{children}</dd>
    </div>
  )
}

function PriceTier({ label, value, badge }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 px-3 py-2.5 bg-white dark:bg-[#0f172a]/40">
      <Badge className={badge}>{label}</Badge>
      <p className="text-[14px] font-bold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums">{value}</p>
    </div>
  )
}

function ActionButton({ icon, label, subtitle, onClick, primary = false, danger = false, loading = false }) {
  let cls = 'border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 hover:border-[#1a6cbf] hover:text-[#1a6cbf]'
  if (primary) cls = 'bg-[#1a6cbf] hover:bg-[#155a9f] text-white border-transparent'
  if (danger) cls = 'border-red-200 dark:border-red-900/50 bg-white dark:bg-[#1e293b] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
  return (
    <button onClick={onClick} disabled={loading} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>
      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${primary ? 'bg-white/20' : danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700/40'}`}>
        {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name={icon} size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold truncate">{label}</p>
        {subtitle && <p className={`text-[11px] truncate ${primary ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{subtitle}</p>}
      </div>
    </button>
  )
}

function SummaryTile({ label, value, color, bg }) {
  return (
    <div className={`rounded-lg ${bg} px-2 py-2.5 text-center`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-[16px] font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}

function CountTile({ label, value }) {
  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-800/40 px-2 py-1.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{value}</p>
    </div>
  )
}

function ModalShell({ title, subtitle, onClose, children, maxWidth = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className={`relative w-full ${maxWidth} rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 shrink-0">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Restock Modal ───────────────────────────────────────────────────────────

function RestockModal({ product, onClose }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const reorder = Number(product.reorder_level) || 0
  const [qty, setQty] = useState(50)
  const [expiry, setExpiry] = useState('')

  const presets = [
    { label: '+10', value: 10 },
    { label: '+50', value: 50 },
    { label: '+100', value: 100 },
    { label: '+200', value: 200 },
    { label: `1.5× reorder (${Math.round(reorder * 1.5)})`, value: Math.round(reorder * 1.5) },
  ]

  const mut = useMutation({
    mutationFn: (body) => api.put(`/api/admin/drug-stock/${product.id}/quantity`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product', product.id] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
    },
  })

  const current = Number(product.current_stock) || 0
  const adj = Number(qty) || 0
  const newStock = current + adj

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!adj || adj <= 0) { toast.error('Enter a quantity > 0'); return }
    if (!expiry) { toast.error('Expiry date is required'); return }
    try {
      const res = await mut.mutateAsync({
        adjustment: adj,
        adjusted_by: user?.username || 'Admin',
        expiry_date: expiry,
      })
      toast.success(`Restocked ${adj} ${product.unit || 'units'}. Stock now ${res.new_stock}.`)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Could not restock')
    }
  }

  return (
    <ModalShell title="Restock Product" subtitle={product.name} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800/40 px-3 py-2.5">
          <span className="text-[12px] text-gray-500 dark:text-gray-400">Current stock</span>
          <span className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{current} {product.unit}</span>
        </div>

        <div>
          <label className={labelCls}>Quantity to add</label>
          <input type="number" value={qty} min={1} onChange={(e) => setQty(e.target.value)} className={inputCls} autoFocus />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => setQty(p.value)} className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:text-[#1a6cbf] dark:hover:bg-blue-900/30 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>New batch expiry date</label>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} required />
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">A new batch is created with this expiry.</p>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5">
          <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">New stock level</span>
          <span className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{newStock} {product.unit}</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40">Cancel</button>
          <button type="submit" disabled={mut.isPending || !adj || !expiry} className="flex-1 px-4 py-2 text-[13px] font-semibold rounded-lg bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            {mut.isPending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="plus" size={14} />}
            Confirm Restock
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

function EditModal({ product, onClose }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState({
    name: product.name || '',
    reorder_level: String(product.reorder_level ?? ''),
    normal_price: String(product.normal_price ?? ''),
    promotional_price: String(product.promotional_price ?? ''),
    wholesale_price: String(product.wholesale_price ?? ''),
    supplier: product.supplier || '',
  })
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const mut = useMutation({
    mutationFn: (body) => api.put(`/api/admin/drug-stock/${product.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product', product.id] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
    },
  })

  const handleSubmit = async (e) => {
    e?.preventDefault()
    try {
      await mut.mutateAsync({
        name: form.name.trim(),
        reorder_level: Number(form.reorder_level) || 0,
        normal_price: Number(form.normal_price) || 0,
        promotional_price: Number(form.promotional_price) || 0,
        wholesale_price: Number(form.wholesale_price) || 0,
        supplier: form.supplier.trim(),
        updated_by: user?.username || 'Admin',
      })
      toast.success('Product updated')
      onClose()
    } catch (err) {
      toast.error(err.message || 'Could not save')
    }
  }

  return (
    <ModalShell title="Edit Prices & Reorder" subtitle={product.name} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className={labelCls}>Item Name</label>
          <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputCls} required autoFocus />
        </div>
        <div>
          <label className={labelCls}>Reorder Level</label>
          <input type="number" value={form.reorder_level} min={0} onChange={(e) => setField('reorder_level', e.target.value)} className={inputCls} required />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={labelCls}>Normal</label><input type="number" value={form.normal_price} min={0} onChange={(e) => setField('normal_price', e.target.value)} className={inputCls} required /></div>
          <div><label className={labelCls}>Promo</label><input type="number" value={form.promotional_price} min={0} onChange={(e) => setField('promotional_price', e.target.value)} className={inputCls} required /></div>
          <div><label className={labelCls}>Wholesale</label><input type="number" value={form.wholesale_price} min={0} onChange={(e) => setField('wholesale_price', e.target.value)} className={inputCls} required /></div>
        </div>
        <div>
          <label className={labelCls}>Supplier</label>
          <input type="text" value={form.supplier} onChange={(e) => setField('supplier', e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 px-3 py-2.5">
          <Icon name="info" size={14} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 dark:text-blue-300">Stock quantity is changed via Restock, not here.</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40">Cancel</button>
          <button type="submit" disabled={mut.isPending} className="flex-1 px-4 py-2 text-[13px] font-semibold rounded-lg bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            {mut.isPending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="save" size={14} />}
            Save Changes
          </button>
        </div>
      </form>
    </ModalShell>
  )
}