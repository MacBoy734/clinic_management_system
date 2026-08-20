'use client'

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonTable, SkeletonCard, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatMoney, formatDate, StatCard,
} from '@/utils/helpers'
import { RestockModal } from '@/components/pharmacy/RestockModal'

// ─── Category presentation ────────────────────────────────────────────────────
// Order matters: this is the chip order. Adding a category to the
// ProductCategory enum and to this map is all the UI needs.

const CATEGORY_META = {
  medication: {
    label: 'Medications',
    icon: 'pill',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  consumable: {
    label: 'Consumables',
    icon: 'box',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  general: {
    label: 'General',
    icon: 'shoppingCart',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
}

const NEUTRAL_BADGE = 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'

function categoryLabel(c) { return CATEGORY_META[c]?.label || cap(c) }
function categoryIcon(c) { return CATEGORY_META[c]?.icon || 'box' }
function categoryBadgeClass(c) { return CATEGORY_META[c]?.badge || NEUTRAL_BADGE }

// Sub-categories are free text and grow over time, so their colour is
// derived from the name rather than kept in a map that would need editing
// every time the clinic stocks something new.
const SUB_PALETTE = [
  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
]

function subBadgeClass(name) {
  if (!name) return NEUTRAL_BADGE
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return SUB_PALETTE[hash % SUB_PALETTE.length]
}

const EXPIRY_WARNING_DAYS = 90

// Pull the server's { error } body out of the thrown error — axios-style
// clients bury it under err.response.data, so err.message alone shows
// "Request failed with status code 409" instead of the real reason.
function errMsg(err, fallback) {
  return err?.response?.data?.error || err?.data?.error || err?.message || fallback
}

// Days until expiry (negative if expired; null if no date).
function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export default function StockTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [subCategory, setSubCategory] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [restocking, setRestocking] = useState(null)

  // No category parameter — the pharmacy's own screen loads everything and
  // filters in the browser, so switching chips is instant.
  const stockQuery = useQuery({
    queryKey: ['pharmacy', 'stock'],
    queryFn: () => api.get('/api/pharmacy/stock'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // Open requests drive the per-row "Requested" state so the pharmacist
  // can't fire duplicates the admin then has to reconcile.
  const requestsQuery = useQuery({
    queryKey: ['pharmacy', 'restock-requests', 'pending'],
    queryFn: () => api.get('/api/pharmacy/restock-requests?status=pending'),
    refetchInterval: 30000,
    staleTime: 15000,
  })
  const isRefetching = stockQuery.isFetching || requestsQuery.isFetching
  const refetchAll = () => {
    stockQuery.refetch()
    requestsQuery.refetch()
  }
  const restockMutation = useMutation({
    mutationFn: ({ id, quantity, batchNumber, expiryDate, notes }) =>
      api.post('/api/pharmacy/restock-requests', {
        product_id: id,
        quantity,
        batch_number: batchNumber || null,
        expiry_date: expiryDate || null,
        notes,
      }),
    onSuccess: () => {
      // Stock is unchanged until the admin approves — only the request list
      // needs refreshing.
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'restock-requests'] })
    },
  })

  const items = stockQuery.data?.items || []
  const pendingRequests = requestsQuery.data?.requests || []
  const requestsUnavailable = !!requestsQuery.error

  // product_id → pending request
  const pendingByProduct = useMemo(() => new Map(
    pendingRequests
      .filter((r) => (r.product_id ?? r.drug_stock_id) != null)
      .map((r) => [r.product_id ?? r.drug_stock_id, r])
  ), [pendingRequests])

  // Category chips, built from what is actually stocked so an unused
  // category never shows an empty filter.
  const categoriesPresent = useMemo(
    () => [...new Set(items.map((i) => i.category))]
      .sort((a, b) => Object.keys(CATEGORY_META).indexOf(a) - Object.keys(CATEGORY_META).indexOf(b)),
    [items]
  )

  // Sub-categories are scoped to the selected category — picking
  // "Consumables" should not leave "antibiotic" sitting in the second row.
  const subCategories = useMemo(() => {
    const scoped = category === 'all' ? items : items.filter((i) => i.category === category)
    return [...new Set(scoped.map((i) => i.sub_category).filter(Boolean))].sort()
  }, [items, category])

  const scoped = useMemo(
    () => (category === 'all' ? items : items.filter((i) => i.category === category)),
    [items, category]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter((i) => {
      const matchSub = subCategory === 'all' || i.sub_category === subCategory
      const matchSearch =
        !q ||
        (i.name || '').toLowerCase().includes(q) ||
        (i.generic_name || '').toLowerCase().includes(q) ||
        (i.sub_category || '').toLowerCase().includes(q) ||
        (i.sku || '').toLowerCase().includes(q)
      return matchSub && matchSearch
    })
  }, [scoped, subCategory, search])

  // Medication-only columns collapse when nothing on screen is a medication.
  const showDrugColumns = useMemo(
    () => filtered.some((i) => i.category === 'medication'),
    [filtered]
  )
  const showCategoryColumn = category === 'all'

  // Stats follow the category chip so the numbers match what is on screen.
  const lowStock = scoped.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level)
  const outOfStock = scoped.filter((i) => i.current_stock === 0)
  const expiringSoon = scoped.filter((i) => {
    const d = daysUntil(i.expiry_date)
    return d !== null && d >= 0 && d <= EXPIRY_WARNING_DAYS
  })
  // Inventory is valued at what it COST, never at what it sells for. The
  // previous revision multiplied by the retail price and called the result
  // "Stock Value", overstating it by the entire margin.
  const stockValue = scoped.reduce((s, i) => s + (i.current_stock || 0) * (i.unit_cost || 0), 0)

  if (stockQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={7} />
      </div>
    )
  }

  // Only the stock query blocks the page. A failed requests query degrades to
  // "no pending badges" rather than hiding the whole inventory.
  if (stockQuery.error) {
    return (
      <ErrorState
        message={errMsg(stockQuery.error, 'Could not load stock')}
        onRetry={stockQuery.refetch}
      />
    )
  }

  const handleRestock = async (item, { quantity, batchNumber, expiryDate, notes }) => {
    try {
      await restockMutation.mutateAsync({ id: item.id, quantity, batchNumber, expiryDate, notes })
      toast.success(`Restock requested for ${item.name} — awaiting admin approval`)
      setRestocking(null)
    } catch (err) {
      toast.error(errMsg(err, 'Could not submit restock request'))
    }
  }

  const colCount = 4 + (showCategoryColumn ? 1 : 0) + (showDrugColumns ? 1 : 0) + 2

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={category === 'all' ? 'box' : categoryIcon(category)}
          color="blue"
          label={category === 'all' ? 'Total Items' : categoryLabel(category)}
          value={scoped.length}
          sublabel="SKUs"
        />
        <StatCard icon="alert" color="amber" label="Low Stock" value={lowStock.length} sublabel="need reorder" />
        <StatCard icon="x" color="red" label="Out of Stock" value={outOfStock.length} sublabel="items" />
        <StatCard
          icon="clock"
          color="purple"
          label={`Expiring ≤${EXPIRY_WARNING_DAYS}d`}
          value={expiringSoon.length}
          sublabel="items"
        />
        <StatCard
          icon="dollarSign"
          color="green"
          label="Stock Value"
          value={formatMoney(stockValue)}
          sublabel="at cost"
        />
      </div>

      {/* Refresh bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => refetchAll()}
          disabled={isRefetching}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
        >
          <Icon
            name="refresh"
            size={13}
            className={isRefetching ? 'animate-spin' : ''}
          />
          {isRefetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Awaiting approval */}
      {pendingRequests.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
          <Icon name="clock" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            <span className="font-semibold">
              {pendingRequests.length} restock request{pendingRequests.length > 1 ? 's' : ''} awaiting admin approval.
            </span>{' '}
            Stock levels update once an admin confirms how many units arrived.
          </p>
        </div>
      )}

      {requestsUnavailable && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 px-3 py-2 flex items-start gap-2">
          <Icon name="info" size={13} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Pending restock requests could not be loaded. Requesting still works, but an item that already has an
            open request will be rejected by the server rather than flagged here.
          </p>
        </div>
      )}

      {/* Category chips — the primary filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Category
        </span>
        {['all', ...categoriesPresent].map((c) => {
          const count = c === 'all' ? items.length : items.filter((i) => i.category === c).length
          const active = category === c
          return (
            <button
              key={c}
              onClick={() => { setCategory(c); setSubCategory('all') }}
              className={[
                'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1.5',
                active
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
              ].join(' ')}
            >
              {c !== 'all' && <Icon name={categoryIcon(c)} size={12} />}
              {c === 'all' ? 'All' : categoryLabel(c)}
              <span className={[
                'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold',
                active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400',
              ].join(' ')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + sub-category chips */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, generic name, sub-category or SKU…"
            className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
          />
        </div>
      </div>

      {/* Stock table */}
      {!filtered.length ? (
        <EmptyState
          icon={category === 'all' ? 'box' : categoryIcon(category)}
          title="No items found"
          description={
            search
              ? 'Try a different search term.'
              : category === 'all'
                ? 'Nothing in the catalogue yet. Add medications, consumables and general goods so the pharmacy can sell and issue them.'
                : `No ${categoryLabel(category).toLowerCase()} match this filter.`
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Item</Th>
                  {showCategoryColumn && <Th>Category</Th>}
                  <Th>Sub-category</Th>
                  {showDrugColumns && <Th>Form / Strength</Th>}
                  <Th>Stock Level</Th>
                  <Th align="right">Price</Th>
                  <Th>Expiry</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filtered.map((item) => (
                  <StockRow
                    key={item.id}
                    item={item}
                    showCategoryColumn={showCategoryColumn}
                    showDrugColumns={showDrugColumns}
                    colCount={colCount}
                    pending={pendingByProduct.get(item.id) || null}
                    isOpen={expanded === item.id}
                    onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                    onRestock={() => setRestocking(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Restock request modal */}
      {restocking && (
        <RestockModal
          item={restocking}
          pending={pendingByProduct.get(restocking.id) || null}
          loading={restockMutation.isPending}
          // Batch and expiry are collected by the admin at receipt, not here.
          // If your RestockModal still marks them required, this prop is
          // where to relax it.
          batchRequired={false}
          expiryRequired={false}
          onClose={() => setRestocking(null)}
          onConfirm={handleRestock}
        />
      )}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th
      className={[
        'px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function StockRow({
  item, showCategoryColumn, showDrugColumns, colCount, pending, isOpen, onToggle, onRestock,
}) {
  const isMedication = item.category === 'medication'
  const isOut = item.current_stock === 0
  const isLow = item.current_stock > 0 && item.current_stock <= item.reorder_level
  const maxScale = Math.max(item.reorder_level * 2, 1)
  const stockPct = Math.min(100, Math.round((item.current_stock / maxScale) * 100))
  const stockBarColor = isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
  const rowBg = isOut
    ? 'bg-red-50/30 dark:bg-red-950/10'
    : isLow
      ? 'bg-amber-50/30 dark:bg-amber-950/10'
      : ''
  const stockTextColor = isOut
    ? 'text-red-600 dark:text-red-400'
    : isLow
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-700 dark:text-gray-300'

  const days = daysUntil(item.expiry_date)
  const expiryColor =
    days === null
      ? 'text-gray-400'
      : days < 30
        ? 'text-red-600 dark:text-red-400 font-semibold'
        : days < EXPIRY_WARNING_DAYS
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-gray-600 dark:text-gray-300'

  const restockBtnCls = pending
    ? 'bg-white dark:bg-[#1e293b] border border-amber-300 dark:border-amber-900/60 text-amber-600 dark:text-amber-400 cursor-default'
    : isOut
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : isLow
        ? 'bg-amber-500 hover:bg-amber-600 text-white'
        : 'bg-[#1a6cbf] hover:bg-[#155a9f] text-white'

  // A non-medication has no generic name or strength — show the SKU instead
  // of a bare separator.
  const subtitle = isMedication
    ? [item.generic_name, item.strength].filter(Boolean).join(' · ')
    : [item.sku, item.unit].filter(Boolean).join(' · ')

  return (
    <>
      <tr
        className={`${rowBg} hover:bg-gray-50/50 dark:hover:bg-gray-700/20 cursor-pointer transition-colors`}
        onClick={onToggle}
      >
        {/* Name */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon
              name={isOpen ? 'chevronDown' : 'chevronRight'}
              size={14}
              className="text-gray-400 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                {pending && (
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <Icon name="clock" size={10} /> +{pending.requested_qty} pending
                  </Badge>
                )}
              </div>
              {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
            </div>
          </div>
        </td>

        {/* Category — hidden when a single category is already selected */}
        {showCategoryColumn && (
          <td className="px-4 py-3">
            <Badge className={categoryBadgeClass(item.category)}>
              {categoryLabel(item.category)}
            </Badge>
          </td>
        )}

        {/* Sub-category */}
        <td className="px-4 py-3">
          {item.sub_category
            ? <Badge className={subBadgeClass(item.sub_category)}>{cap(item.sub_category)}</Badge>
            : <span className="text-[12px] text-gray-400">—</span>}
        </td>

        {/* Form / Strength — medications only */}
        {showDrugColumns && (
          <td className="px-4 py-3">
            <span className="text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
              {isMedication
                ? [cap(item.form), item.strength].filter(Boolean).join(' · ') || '—'
                : '—'}
            </span>
          </td>
        )}

        {/* Stock level */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 min-w-30">
            <div className="flex-1 max-w-25 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
              <div className={`h-full ${stockBarColor} transition-all`} style={{ width: `${stockPct}%` }} />
            </div>
            <span className={`text-[12px] font-semibold tabular-nums ${stockTextColor}`}>
              {item.current_stock}
            </span>
            <span className="text-[10px] text-gray-400">/ {item.reorder_level}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{item.unit}</p>
        </td>

        {/* Price — retail on top, cost below, so margin is visible */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300 tabular-nums">
            {formatMoney(item.normal_price)}
          </p>
          <p className="text-[10px] text-gray-400 tabular-nums">cost {formatMoney(item.unit_cost)}</p>
        </td>

        {/* Expiry */}
        <td className="px-4 py-3">
          {item.expiry_date ? (
            <>
              <p className={`text-[12px] ${expiryColor} whitespace-nowrap`}>
                {formatDate(item.expiry_date)}
              </p>
              {days !== null && days < 0 && <p className="text-[10px] text-red-500">expired</p>}
              {days !== null && days >= 0 && days < EXPIRY_WARNING_DAYS && (
                <p className={`text-[10px] ${days < 30 ? 'text-red-500' : 'text-amber-500'}`}>
                  {days}d left
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-gray-400">—</p>
          )}
        </td>

        {/* Action */}
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); onRestock() }}
            title={pending
              ? `Requested by ${pending.requested_by} — awaiting admin approval`
              : 'Request a restock'}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap ${restockBtnCls}`}
          >
            {pending ? 'Requested' : 'Request Restock'}
          </button>
        </td>
      </tr>

      {isOpen && (
        <tr className="bg-gray-50/50 dark:bg-[#1e293b]/30">
          <td colSpan={colCount} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoTile label="Category" value={categoryLabel(item.category)} />
              <InfoTile label="Sub-category" value={item.sub_category ? cap(item.sub_category) : null} />
              {isMedication
                ? <InfoTile label="Generic Name" value={item.generic_name} />
                : <InfoTile label="SKU" value={item.sku} />}
              <InfoTile label="Supplier" value={item.supplier} />
              <InfoTile label="Batch Number" value={item.batch_number} />
              <InfoTile
                label="Expiry Date"
                value={item.expiry_date ? formatDate(item.expiry_date) : 'No expiry'}
              />
              <InfoTile label="Current Stock" value={`${item.current_stock} ${item.unit}`} />
              <InfoTile label="Reorder Level" value={`${item.reorder_level} ${item.unit}`} />
              <InfoTile label="Unit Cost" value={formatMoney(item.unit_cost)} />
              <InfoTile
                label="Stock Value"
                value={`${formatMoney(item.current_stock * item.unit_cost)} at cost`}
              />
              <InfoTile label="Normal Price" value={formatMoney(item.normal_price)} />
              <InfoTile label="Promotional" value={formatMoney(item.promotional_price)} />
              <InfoTile label="Wholesale" value={formatMoney(item.wholesale_price)} />
            </div>

            {pending && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  Awaiting approval
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  {pending.requested_qty} {item.unit}
                  {pending.batch_number ? ` · batch ${pending.batch_number}` : ''}
                  {pending.expiry_date ? ` · expires ${formatDate(pending.expiry_date)}` : ''}
                  {' · requested by '}{pending.requested_by} on {formatDate(pending.requested_at)}
                </p>
                {pending.notes && (
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1 italic">
                    &ldquo;{pending.notes}&rdquo;
                  </p>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-[12px] text-gray-900 dark:text-gray-100 mt-0.5 truncate">{value || '—'}</p>
    </div>
  )
}