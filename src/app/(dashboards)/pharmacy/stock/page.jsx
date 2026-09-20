'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonTable, SkeletonCard, SkeletonList, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatMoney, formatDate, formatDateTime, timeAgo, StatCard, Spinner, badgeClass,
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

// ─── Shell ────────────────────────────────────────────────────────────────────

const SUB_TABS = [
  { key: 'inventory', label: 'Stock', icon: 'box' },
  { key: 'count', label: 'Count Stock', icon: 'clipboard' },
]

export default function StockTab() {
  const [view, setView] = useState('inventory')

  const sessionsQuery = useQuery({
    queryKey: ['pharmacy', 'stocktake'],
    queryFn: () => api.get('/api/pharmacy/stocktake'),
    staleTime: 60000,
  })

  const openSession = (sessionsQuery.data?.sessions || [])
    .find((s) => s.status === 'in_progress' || s.status === 'submitted')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-0.5">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={[
                'px-3 py-1.5 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap',
                view === t.key
                  ? 'bg-[#1a6cbf] text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
              ].join(' ')}
            >
              <Icon name={t.icon} size={12} />
              {t.label}
              {t.key === 'count' && openSession && view !== 'count' && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>

        {openSession && view === 'inventory' && (
          <button
            onClick={() => setView('count')}
            className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1.5 min-w-0"
          >
            <Icon name="clock" size={12} className="shrink-0" />
            <span className="truncate">
              {openSession.status === 'in_progress'
                ? `"${openSession.label}" is still being counted`
                : `"${openSession.label}" is awaiting approval`}
            </span>
          </button>
        )}
      </div>

      {view === 'inventory' ? <StockInventory /> : <CountStock />}
    </div>
  )
}

// ─── Stock ────────────────────────────────────────────────────────────────────

function StockInventory() {
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

  const colCount = 5 + (showCategoryColumn ? 1 : 0) + (showDrugColumns ? 1 : 0) + 2

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
                  <Th>Shelf</Th>
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

        {/* Shelf */}
        <td className="px-4 py-3">
          <ShelfBadge location={item.shelf_location} />
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
              <ShelfLocationTile item={item} />
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

// ShelfBadge — compact coloured pill for the table cell.
// Blue for shelf items, cyan + thermometer icon for fridge items.
function ShelfBadge({ location }) {
  if (!location) {
    return <span className="text-[11px] italic text-gray-400 dark:text-gray-500">not set</span>
  }
  const isFridge = String(location).toLowerCase().startsWith('fridge')
  const cls = isFridge
    ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${cls}`}
      title={isFridge ? 'Stored in fridge' : 'Stored on shelf'}
    >
      {isFridge && <Icon name="thermometer" size={11} />}
      {!isFridge && <Icon name="box" size={11} />}
      {location}
    </span>
  )
}

// ShelfLocationTile — inline-editable tile in the expanded details.
// Click Edit → input + Save/Cancel. PUT /api/admin/drug-stock/:id
// Invalidates the pharmacy stock list so the table cell badge refreshes.
function ShelfLocationTile({ item }) {
  const queryClient = useQueryClient()
  const location = item.shelf_location || ''
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(location)

  useEffect(() => {
    setValue(item.shelf_location || '')
  }, [item.shelf_location])

  const saveMut = useMutation({
    mutationFn: (next) =>
      api.patch(`/api/pharmacy/stock/${item.id}`, { shelf_location: String(next).trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
      toast.success('Shelf location updated')
      setEditing(false)
    },
    onError: (err) => toast.error(err?.message || 'Could not update shelf location'),
  })

  const cancel = () => {
    setEditing(false)
    setValue(location)
  }
  const save = () => {
    const next = String(value || '').trim()
    if (!next) {
      toast.error('Shelf location cannot be empty')
      return
    }
    if (next === location) {
      setEditing(false)
      return
    }
    saveMut.mutate(next)
  }

  return (
    <div className="rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Shelf Location
        </p>
        {!editing && (
          <button
            onClick={() => {
              setValue(location)
              setEditing(true)
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          >
            <Icon name="edit" size={10} />
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            placeholder="e.g. Shelf B3 or Fridge A2"
            className="flex-1 min-w-35 px-2 py-1 text-[12px] font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
          />
          <button
            onClick={save}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50"
          >
            {saveMut.isPending ? '…' : <Icon name="check" size={11} />}
            Save
          </button>
          <button
            onClick={cancel}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 disabled:opacity-50"
          >
            <Icon name="x" size={11} />
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-0.5 flex items-center gap-2">
          {location ? (
            <ShelfBadge location={location} />
          ) : (
            <span className="text-[12px] italic text-gray-400 dark:text-gray-500">
              No location set
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Count Stock ──────────────────────────────────────────────────────────────

const COUNT_STATUS = {
  in_progress: { label: 'Counting', badge: badgeClass('in_progress') },
  submitted: { label: 'Awaiting approval', badge: badgeClass('pending') },
  approved: { label: 'Approved', badge: badgeClass('done') },
}

const COUNT_REASONS = [
  { value: '', label: 'Select a reason…' },
  { value: 'expired', label: 'Expired' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'broken', label: 'Broken / spilt' },
  { value: 'stolen', label: 'Suspected theft' },
  { value: 'miscounted', label: 'Previous miscount' },
  { value: 'misplaced', label: 'Misplaced — not on shelf' },
  { value: 'found_unrecorded', label: 'Delivery never recorded' },
  { value: 'other', label: 'Other' },
]

const COUNT_SIZES = [30, 60, 100]

function CountStock() {
  const [openId, setOpenId] = useState(null)

  if (openId) return <CountSheet sessionId={openId} onBack={() => setOpenId(null)} />
  return <CountSessions onOpen={setOpenId} />
}

function CountSessions({ onOpen }) {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)

  const sessionsQuery = useQuery({
    queryKey: ['pharmacy', 'stocktake'],
    queryFn: () => api.get('/api/pharmacy/stocktake'),
    staleTime: 15000,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/pharmacy/stocktake', payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stocktake'] })
      setStarting(false)
      toast.success(`Counting ${data.session.stats.total_items} products`)
      onOpen(data.session.id)
    },
    onError: (err) => toast.error(errMsg(err, 'Could not start the count')),
  })

  if (sessionsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={3} />
      </div>
    )
  }

  if (sessionsQuery.error) {
    return (
      <ErrorState
        message={errMsg(sessionsQuery.error, 'Could not load stocktakes')}
        onRetry={sessionsQuery.refetch}
      />
    )
  }

  const sessions = sessionsQuery.data?.sessions || []
  const open = sessions.find((s) => s.status === 'in_progress' || s.status === 'submitted')
  const approved = sessions.filter((s) => s.status === 'approved')
  const lastApproved = approved[0]

  const totalMissing = approved.reduce((s, x) => s + Math.abs(x.stats.total_missing || 0), 0)
  const totalFound = approved.reduce((s, x) => s + (x.stats.total_found || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon="clipboard" color="blue" label="Counts Done" value={approved.length} sublabel="approved" />
        <StatCard icon="trendDown" color="red" label="Units Missing" value={totalMissing} sublabel="all counts" />
        <StatCard icon="trendUp" color="amber" label="Units Found" value={totalFound} sublabel="all counts" />
        <StatCard
          icon="clock"
          color="slate"
          label="Last Count"
          value={lastApproved ? timeAgo(lastApproved.reviewed_at) : '—'}
          sublabel={lastApproved ? lastApproved.label : 'none yet'}
        />
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-lg">
          Count what is physically on the shelf. The system figure stays hidden until you
          submit, so the number you type is the number you actually counted.
        </p>
        <button
          onClick={() => setStarting(true)}
          disabled={!!open || createMutation.isPending}
          title={open ? 'Finish the open count first' : undefined}
          className="px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Icon name="plus" size={14} />
          Start a count
        </button>
      </div>

      {open && (
        <button
          onClick={() => onOpen(open.id)}
          className="w-full text-left rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 px-3 py-2.5 hover:border-blue-400 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon name="clipboard" size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-400 flex-1 min-w-0 truncate">
              <span className="font-semibold">{open.label}</span>
              {' — '}
              {open.stats.counted_items} of {open.stats.total_items} counted
            </p>
            <Icon name="chevronRight" size={14} className="text-blue-400 shrink-0" />
          </div>
        </button>
      )}

      {!sessions.length ? (
        <EmptyState
          icon="clipboard"
          title="No counts yet"
          description="A count compares what is physically on the shelf against what the system believes. Any difference goes to an admin for approval."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onOpen={() => onOpen(s.id)} />
          ))}
        </div>
      )}

      {starting && (
        <StartCountModal
          loading={createMutation.isPending}
          onClose={() => setStarting(false)}
          onConfirm={(payload) => createMutation.mutate(payload)}
        />
      )}
    </div>
  )
}

function SessionCard({ session, onOpen }) {
  const st = session.stats
  const meta = COUNT_STATUS[session.status]
  const revealed = session.status !== 'in_progress'
  const pct = st.total_items ? Math.round((st.counted_items / st.total_items) * 100) : 0

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
              {session.label}
            </p>
            <Badge className={meta.badge}>{meta.label}</Badge>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {timeAgo(session.started_at)} · {session.started_by}
          </p>
        </div>
        <button
          onClick={onOpen}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-blue-700 shrink-0"
        >
          {session.status === 'in_progress' ? 'Resume' : 'View'}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
          <div
            className={`h-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1a6cbf]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
          {st.counted_items}/{st.total_items}
        </span>
      </div>

      {revealed && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <MiniStat label="Differences" value={st.discrepancy_count ?? 0} tone={st.discrepancy_count ? 'amber' : 'slate'} />
          <MiniStat label="Missing" value={Math.abs(st.total_missing ?? 0)} tone={st.total_missing < 0 ? 'red' : 'slate'} />
          <MiniStat label="Found" value={st.total_found ?? 0} tone={st.total_found > 0 ? 'amber' : 'slate'} />
        </div>
      )}

      {session.review_notes && session.status === 'in_progress' && (
        <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
            Returned by admin
          </p>
          <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">{session.review_notes}</p>
        </div>
      )}
    </Card>
  )
}

function MiniStat({ label, value, tone }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    red: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
    slate: 'bg-gray-50 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  }
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center ${tones[tone] || tones.slate}`}>
      <p className="text-[13px] font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-widest opacity-70 truncate">{label}</p>
    </div>
  )
}

function StartCountModal({ onConfirm, onClose, loading }) {
  const [label, setLabel] = useState('')
  const [size, setSize] = useState(60)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full sm:max-w-md rounded-t-xl sm:rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/60">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Start a count</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40"
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Products that have gone longest without being counted are picked first.
          </p>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Count — ${formatDate(new Date().toISOString())}`}
              className="w-full h-10 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
              How many products
            </label>
            <div className="flex gap-2">
              {COUNT_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => setSize(n)}
                  className={[
                    'flex-1 h-10 rounded-lg text-[13px] font-medium border transition-colors',
                    size === n
                      ? 'bg-[#1a6cbf] text-white border-[#1a6cbf]'
                      : 'bg-white dark:bg-[#0f172a] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Keep it to what you can finish in one go. A count left open across trading
              days is unreliable.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700/60">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ label: label.trim() || undefined, size })}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Spinner size={13} /> : <Icon name="clipboard" size={13} />}
            Start
          </button>
        </div>
      </div>
    </div>
  )
}

function CountSheet({ sessionId, onBack }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [hideDone, setHideDone] = useState(false)

  const queryKey = ['pharmacy', 'stocktake', sessionId]

  const sessionQuery = useQuery({
    queryKey,
    queryFn: () => api.get(`/api/pharmacy/stocktake/${sessionId}`),
  })

  const applyItem = (item) => {
    queryClient.setQueryData(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        session: {
          ...old.session,
          items: old.session.items.map((i) => (i.id === item.id ? item : i)),
        },
      }
    })
    queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stocktake'] })
  }

  const submitMutation = useMutation({
    mutationFn: (payload) => api.post(`/api/pharmacy/stocktake/${sessionId}/submit`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stocktake'] })
      toast.success('Submitted — add a reason for each difference')
    },
  })

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonList items={6} />
      </div>
    )
  }

  if (sessionQuery.error) {
    return (
      <ErrorState
        message={errMsg(sessionQuery.error, 'Could not load the count')}
        onRetry={sessionQuery.refetch}
      />
    )
  }

  const session = sessionQuery.data?.session
  if (!session) return null

  const counting = session.status === 'in_progress'
  const annotating = session.status === 'submitted'
  const st = session.stats
  const meta = COUNT_STATUS[session.status]
  const pct = st.total_items ? Math.round((st.counted_items / st.total_items) * 100) : 0

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync({})
    } catch (err) {
      const body = err?.response?.data ?? err?.data
      if (body?.requires_confirmation) {
        const ok = window.confirm(
          `${body.uncounted_count} product(s) were never counted.\n\n` +
          'They will be left alone — not written off. Submit anyway?'
        )
        if (!ok) return
        try {
          await submitMutation.mutateAsync({ confirm_partial: true })
        } catch (retry) {
          toast.error(errMsg(retry, 'Could not submit'))
        }
        return
      }
      toast.error(errMsg(err, 'Could not submit'))
    }
  }

  const visible = session.items
    .filter((i) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (i.product_name || '').toLowerCase().includes(q)
        || (i.shelf_location || '').toLowerCase().includes(q)
    })
    .filter((i) => (counting && hideDone ? i.counted_at == null : true))
        .filter((i) => (counting ? true : i.variance != null && i.variance !== 0))

  const groups = []
  for (const item of visible) {
    const shelf = item.shelf_location || 'No shelf recorded'
    const last = groups[groups.length - 1]
    if (last && last.shelf === shelf) last.items.push(item)
    else groups.push({ shelf, items: [item] })
  }

  const nextIdByItem = new Map(
    visible.map((item, i) => [item.id, visible[i + 1]?.id])
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/40 shrink-0"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                {session.label}
              </h3>
              <Badge className={meta.badge}>{meta.label}</Badge>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {formatDateTime(session.started_at)} · {session.started_by}
            </p>
          </div>
        </div>

        {counting && (
          <button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || st.counted_items === 0}
            className="px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {submitMutation.isPending ? <Spinner size={13} /> : <Icon name="send" size={13} />}
            Submit count
          </button>
        )}
      </div>

      {session.review_notes && counting && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-2 flex items-start gap-2">
          <Icon name="alert" size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-700 dark:text-red-400">
            <span className="font-semibold">Returned by admin:</span> {session.review_notes}
          </p>
        </div>
      )}

      {counting && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Progress
              </p>
              <p className="text-[13px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {st.counted_items}
                <span className="text-gray-400 font-normal"> / {st.total_items}</span>
              </p>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
              <div
                className={`h-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1a6cbf]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              Type what is physically in the bin. Differences are revealed once you submit.
            </p>
          </Card>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product or shelf…"
                className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
              />
            </div>
            <button
              onClick={() => setHideDone((v) => !v)}
              className={[
                'h-10 px-3 rounded-lg text-[12px] font-medium border flex items-center justify-center gap-1.5 transition-colors',
                hideDone
                  ? 'bg-[#1a6cbf] text-white border-[#1a6cbf]'
                  : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
              ].join(' ')}
            >
              <Icon name="eye" size={13} />
              Hide counted
            </button>
          </div>
        </>
      )}

      {annotating && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
          <Icon name="alert" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            <span className="font-semibold">
              {st.discrepancy_count} difference{st.discrepancy_count === 1 ? '' : 's'} found.
            </span>{' '}
            Add a reason for each, then an admin will review. Counts are locked now.
          </p>
        </div>
      )}

      {session.status === 'approved' && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 px-3 py-2 flex items-start gap-2">
          <Icon name="checkCircle" size={13} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            <span className="font-semibold">Approved by {session.reviewed_by}</span>
            {' '}on {formatDateTime(session.reviewed_at)}.{' '}
            {Math.abs(st.total_missing)} unit(s) written off, {st.total_found} added back
            {st.uncounted_items > 0 && `, ${st.uncounted_items} left unadjusted`}.
            {session.review_notes && ` ${session.review_notes}`}
          </p>
        </div>
      )}

      {!visible.length ? (
        <EmptyState
          icon={counting ? 'checkCircle' : 'check'}
          title={counting ? 'Nothing left here' : 'No differences'}
          description={
            counting
              ? 'Every product in view has been counted.'
              : 'The shelf matched the system on every line.'
          }
        />
      ) : (
        <Card className="overflow-hidden divide-y divide-gray-50 dark:divide-gray-700/40">
          {groups.map((g) => (
            <div key={g.shelf}>
              <div className="px-4 py-2 bg-gray-50 dark:bg-[#1e293b]/50 border-b border-gray-100 dark:border-gray-700/40">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {g.shelf}
                </p>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {g.items.map((item) => (
                  counting
                    ? <CountRow
                      key={item.id}
                      item={item}
                      sessionId={sessionId}
                      onSaved={applyItem}
                      nextId={nextIdByItem.get(item.id)}
                    />
                    : <ReviewRow key={item.id} item={item} sessionId={sessionId} onSaved={applyItem} editable={annotating} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

// One input, no system figure, no variance. Each row owns its own state so a
// slow save can never discard what is being typed in another row.
function CountRow({ item, sessionId, onSaved, nextId }) {
  const [value, setValue] = useState(item.counted_qty ?? '')
  const [saving, setSaving] = useState(false)
  const committed = useRef(item.counted_qty ?? '')

  useEffect(() => {
    if (saving) return
    committed.current = item.counted_qty ?? ''
    setValue(item.counted_qty ?? '')
  }, [item.counted_qty, saving])

  const commit = async () => {
    if (String(value) === String(committed.current)) return
    setSaving(true)
    try {
      const res = await api.patch(
        `/api/pharmacy/stocktake/${sessionId}/items/${item.id}`,
        { counted_qty: value === '' ? null : Number(value) }
      )
      committed.current = res.item.counted_qty ?? ''
      onSaved(res.item)
    } catch (err) {
      setValue(committed.current)
      toast.error(errMsg(err, 'Could not save that count'))
    } finally {
      setSaving(false)
    }
  }

  const done = item.counted_at != null

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
          {item.product_name}
        </p>
        <p className="text-[11px] text-gray-400">
          {[cap(item.category), `per ${item.unit || 'pc'}`].filter(Boolean).join(' · ')}
        </p>
      </div>

            <input
        type="number"
        inputMode="numeric"
        min="0"
        data-count-input={item.id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.currentTarget.blur()
          if (!nextId) return
          const next = document.querySelector(`[data-count-input="${nextId}"]`)
          if (next) { next.focus(); next.select() }
        }}
        placeholder="—"
        className="w-20 sm:w-24 h-11 px-3 text-right text-[15px] font-medium tabular-nums rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf] shrink-0"
      />

      <span className="w-4 flex items-center justify-center shrink-0">
        {saving && <Spinner size={13} className="text-gray-400" />}
        {!saving && done && <Icon name="check" size={14} className="text-emerald-500" />}
      </span>
    </div>
  )
}

function ReviewRow({ item, sessionId, onSaved, editable }) {
  const [note, setNote] = useState(item.note ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setNote(item.note ?? '') }, [item.note])

  const save = async (patch) => {
    setSaving(true)
    try {
      const res = await api.patch(`/api/pharmacy/stocktake/${sessionId}/items/${item.id}`, patch)
      onSaved(res.item)
    } catch (err) {
      toast.error(errMsg(err, 'Could not save'))
    } finally {
      setSaving(false)
    }
  }

  const short = item.variance < 0
  const varianceColor = short
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400'

  return (
    <div className="px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
            {item.product_name}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            System {item.system_qty} · counted {item.counted_qty} · per {item.unit || 'pc'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[15px] font-bold tabular-nums ${varianceColor}`}>
            {item.variance > 0 ? `+${item.variance}` : item.variance}
          </p>
          {item.retail_value > 0 && (
            <p className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
              {formatMoney(item.retail_value)} retail
            </p>
          )}
        </div>
      </div>

      {!short && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-start gap-1.5">
          <Icon name="info" size={11} className="mt-0.5 shrink-0" />
          More on the shelf than expected — usually a delivery that was never entered,
          or a sale recorded twice.
        </p>
      )}

      {editable ? (
        <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
          <select
            value={item.reason ?? ''}
            onChange={(e) => save({ reason: e.target.value })}
            disabled={saving}
            className="sm:w-56 h-10 px-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf] disabled:opacity-50"
          >
            {COUNT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { if (note !== (item.note ?? '')) save({ note }) }}
            placeholder="Note for the admin (optional)"
            className="flex-1 h-10 px-3 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
          />
        </div>
      ) : (
        (item.reason || item.note) && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
            {item.reason && <span className="font-medium">{cap(item.reason)}</span>}
            {item.reason && item.note && ' — '}
            {item.note}
          </p>
        )
      )}
    </div>
  )
}