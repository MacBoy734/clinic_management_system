'use client'

// StockTab — drug inventory management
// APIs:
//   GET   /api/pharmacy/stock   → { items: [...] }
//   PATCH /api/pharmacy/stock   → restock, body { id, quantity, batch_number }

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api  from '@/lib/api'
import {
  SkeletonTable, SkeletonCard, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatMoney, formatDate, StatCard,
} from '@/utils/helpers'
import { RestockModal } from '@/components/pharmacy/RestockModal'

const CATEGORIES = ['all', 'antibiotic', 'analgesic', 'antihypertensive', 'antidiabetic', 'other']

const CATEGORY_BADGES = {
  antibiotic: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  analgesic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  antihypertensive: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  antidiabetic: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  antihistamine: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  antacid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  vitamin: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  family_planning: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

// Days until expiry (negative if expired; null if no date)
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
  const [expanded, setExpanded] = useState(null) // item id
  const [restocking, setRestocking] = useState(null) // item

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pharmacy', 'stock'],
    queryFn: () => api.get('/api/pharmacy/stock'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const restockMutation = useMutation({
    mutationFn: ({ id, quantity, batch_number }) =>
      api.patch('/api/pharmacy/stock', { id, quantity, batch_number }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable rows={6} cols={7} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const items = data?.items || []

  // Derive summary stats
  const lowStock = items.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level)
  const outOfStock = items.filter((i) => i.current_stock === 0)
  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expiry_date)
    return d !== null && d >= 0 && d <= 90
  })
  const totalValue = items.reduce((s, i) => s + (i.current_stock || 0) * (i.unit_price || 0), 0)

  // Apply filters
  const q = search.trim().toLowerCase()
  const filtered = items.filter((i) => {
    const matchCat = category === 'all' || i.category === category
    const matchSearch = !q || i.name.toLowerCase().includes(q) || i.generic_name.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const handleRestock = async (item, quantity, batchNumber) => {
    try {
      await restockMutation.mutateAsync({ id: item.id, quantity, batch_number: batchNumber })
      toast.success(`${item.name} restocked (+${quantity})`)
      setRestocking(null)
    } catch (err) {
      toast.error(err.message || 'Could not restock item')
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon="pillBottle" color="blue" label="Total Drugs" value={items.length} sublabel="SKUs" />
        <StatCard icon="alert" color="amber" label="Low Stock" value={lowStock.length} sublabel="need reorder" />
        <StatCard icon="x" color="red" label="Out of Stock" value={outOfStock.length} sublabel="items" />
        <StatCard icon="clock" color="purple" label="Expiring ≤90d" value={expiringSoon.length} sublabel="items" />
        <StatCard icon="dollarSign" color="green" label="Stock Value" value={formatMoney(totalValue)} sublabel="inventory" />
      </div>

      {/* Search + category filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by drug or generic name…"
            className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map((c) => {
            const count = c === 'all' ? items.length : items.filter((i) => i.category === c).length
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={[
                  'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1.5',
                  category === c
                    ? 'bg-[#1a6cbf] text-white'
                    : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
                ].join(' ')}
              >
                {c === 'all' ? 'All' : cap(c)}
                <span
                  className={[
                    'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold',
                    category === c ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Stock table */}
      {!filtered.length ? (
        <EmptyState
          icon="pillBottle"
          title="No drugs found"
          description={search ? 'Try a different search term.' : 'No items match this filter.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th align="left">Drug</Th>
                  <Th align="left">Category</Th>
                  <Th align="left">Form / Strength</Th>
                  <Th align="left">Stock Level</Th>
                  <Th align="right">Unit Price</Th>
                  <Th align="left">Expiry</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filtered.map((item) => {
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
                  const days = daysUntil(item.expiry_date)
                  const expiryColor =
                    days === null
                      ? 'text-gray-400'
                      : days < 0
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : days < 30
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : days < 90
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-600 dark:text-gray-300'
                  const isOpen = expanded === item.id
                  const stockTextColor = isOut
                    ? 'text-red-600 dark:text-red-400'
                    : isLow
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-700 dark:text-gray-300'

                  return (
                    <StockRow
                      key={item.id}
                      item={item}
                      isOpen={isOpen}
                      rowBg={rowBg}
                      stockPct={stockPct}
                      stockBarColor={stockBarColor}
                      stockTextColor={stockTextColor}
                      expiryColor={expiryColor}
                      days={days}
                      onToggle={() => setExpanded(isOpen ? null : item.id)}
                      onRestock={() => setRestocking(item)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Restock modal */}
      {restocking && (
        <RestockModal
          item={restocking}
          loading={restockMutation.isPending}
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

function StockRow({ item, isOpen, rowBg, stockPct, stockBarColor, stockTextColor, expiryColor, days, onToggle, onRestock }) {
  const isOut = item.current_stock === 0
  const isLow = item.current_stock > 0 && item.current_stock <= item.reorder_level
  const restockBtnCls = isOut
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : isLow
      ? 'bg-amber-500 hover:bg-amber-600 text-white'
      : 'bg-[#1a6cbf] hover:bg-[#155a9f] text-white'

  return (
    <>
      <tr
        className={`${rowBg} hover:bg-gray-50/50 dark:hover:bg-gray-700/20 cursor-pointer transition-colors`}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon
              name={isOpen ? 'chevronDown' : 'chevronRight'}
              size={14}
              className="text-gray-400 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
              <p className="text-[11px] text-gray-400">{item.generic_name}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge className={CATEGORY_BADGES[item.category] || CATEGORY_BADGES.other}>
            {cap(item.category)}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <span className="text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {cap(item.form)} · {item.strength}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 min-w-30">
            <div className="flex-1 max-w-25 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
              <div
                className={`h-full ${stockBarColor} transition-all`}
                style={{ width: `${stockPct}%` }}
              />
            </div>
            <span className={`text-[12px] font-semibold tabular-nums ${stockTextColor}`}>
              {item.current_stock}
            </span>
            <span className="text-[10px] text-gray-400">/ {item.reorder_level}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{item.unit}</p>
        </td>
        <td className="px-4 py-3 text-right text-[12px] font-medium text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap">
          {formatMoney(item.unit_price)}
        </td>
        <td className="px-4 py-3">
          <p className={`text-[12px] ${expiryColor} whitespace-nowrap`}>{formatDate(item.expiry_date)}</p>
          {days !== null && days < 0 && <p className="text-[10px] text-red-500">expired</p>}
          {days !== null && days >= 0 && days < 90 && (
            <p className={`text-[10px] ${days < 30 ? 'text-red-500' : 'text-amber-500'}`}>{days}d left</p>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestock()
            }}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${restockBtnCls}`}
          >
            Restock
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-50/50 dark:bg-[#1e293b]/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoTile label="Generic Name" value={item.generic_name} />
              <InfoTile label="Supplier" value={item.supplier} />
              <InfoTile label="Batch Number" value={item.batch_number} />
              <InfoTile label="Expiry Date" value={formatDate(item.expiry_date)} />
              <InfoTile label="Current Stock" value={`${item.current_stock} ${item.unit}`} />
              <InfoTile label="Reorder Level" value={`${item.reorder_level} ${item.unit}`} />
              <InfoTile label="Unit Price" value={formatMoney(item.unit_price)} />
              <InfoTile label="Stock Value" value={formatMoney(item.current_stock * item.unit_price)} />
            </div>
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