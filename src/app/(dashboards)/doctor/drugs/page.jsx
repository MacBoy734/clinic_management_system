'use client'

// ExpiringMedsTab — Drug Stock Overview for the doctor
// Shows all pharmacy drugs with sortable columns including nearest-expiry-first.
// The doctor can sort by: Expiry (default, nearest first), Name, Stock, Category, Price.
// Near-expiry drugs (≤45 days) are highlighted so the doctor can prioritize prescribing them (FEFO).

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Card, Badge, EmptyState, ErrorState, SkeletonCard, SkeletonList,
  Icon, formatMoney, formatDate, cap,
} from '@/utils/helpers'

const EXPIRY_THRESHOLD = 45

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const SORT_OPTIONS = [
  { key: 'expiry_asc', label: 'Expiry (Nearest First)', icon: 'clock' },
  { key: 'expiry_desc', label: 'Expiry (Farthest First)', icon: 'calendar' },
  { key: 'name_asc', label: 'Name (A→Z)', icon: 'list' },
  { key: 'name_desc', label: 'Name (Z→A)', icon: 'list' },
  { key: 'stock_asc', label: 'Stock (Lowest First)', icon: 'box' },
  { key: 'stock_desc', label: 'Stock (Highest First)', icon: 'box' },
  { key: 'price_asc', label: 'Price (Lowest First)', icon: 'dollarSign' },
  { key: 'price_desc', label: 'Price (Highest First)', icon: 'dollarSign' },
  { key: 'category', label: 'Category', icon: 'tag' },
]

export default function ExpiringMedsTab() {
  const [sortBy, setSortBy] = useState('expiry_asc')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pharmacy', 'drugs', 'doctor-overview'],
    queryFn: () => api.get('/api/pharmacy/drugs'),
    refetchInterval: 60000,
    staleTime: 30000,
  })

  const allDrugs = useMemo(() => {
    const items = data?.items || []
    return items.map((d) => ({ ...d, days_left: daysUntil(d.expiry_date) }))
  }, [data])

  // Get unique categories for filter
  const categories = useMemo(() => {
    const set = new Set(allDrugs.map((d) => d.category).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [allDrugs])

  // Filter + sort
  const filtered = useMemo(() => {
    let result = allDrugs
    if (categoryFilter !== 'all') {
      result = result.filter((d) => d.category === categoryFilter)
    }

    const sorted = [...result]
    switch (sortBy) {
      case 'expiry_asc':
        sorted.sort((a, b) => {
          if (a.days_left === null) return 1
          if (b.days_left === null) return -1
          return a.days_left - b.days_left
        })
        break
      case 'expiry_desc':
        sorted.sort((a, b) => {
          if (a.days_left === null) return 1
          if (b.days_left === null) return -1
          return b.days_left - a.days_left
        })
        break
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'stock_asc':
        sorted.sort((a, b) => (a.current_stock || 0) - (b.current_stock || 0))
        break
      case 'stock_desc':
        sorted.sort((a, b) => (b.current_stock || 0) - (a.current_stock || 0))
        break
      case 'price_asc':
        sorted.sort((a, b) => (a.unit_price || 0) - (b.unit_price || 0))
        break
      case 'price_desc':
        sorted.sort((a, b) => (b.unit_price || 0) - (a.unit_price || 0))
        break
      case 'category':
        sorted.sort((a, b) => (a.category || '').localeCompare(b.category || ''))
        break
    }
    return sorted
  }, [allDrugs, sortBy, categoryFilter])

  // Stats
  const expiredCount = allDrugs.filter((d) => d.days_left !== null && d.days_left <= 0).length
  const expiringCount = allDrugs.filter((d) => d.days_left !== null && d.days_left > 0 && d.days_left <= EXPIRY_THRESHOLD).length
  const lowStockCount = allDrugs.filter((d) => d.current_stock > 0 && d.current_stock <= (d.reorder_level || 0)).length
  const outOfStockCount = allDrugs.filter((d) => d.current_stock === 0).length

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={6} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* FEFO info banner */}
      {expiringCount > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Icon name="alert" size={16} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
              {expiringCount} drug(s) expiring within {EXPIRY_THRESHOLD} days — prioritize prescribing these (FEFO)
            </p>
            <p className="text-[12px] text-amber-700 dark:text-amber-300 mt-1">
              Sort by "Expiry (Nearest First)" to see the most urgent drugs at the top.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total Drugs" value={allDrugs.length} icon="pillBottle" color="blue" sublabel="in inventory" />
        <StatTile label="Expiring ≤45d" value={expiringCount} icon="alert" color="amber" sublabel="prioritize these" />
        <StatTile label="Low Stock" value={lowStockCount} icon="box" color="amber" sublabel="at/below reorder" />
        <StatTile label="Expired" value={expiredCount} icon="xCircle" color="red" sublabel="do not prescribe" />
      </div>

      {/* Sort + filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Category filter */}
        {categories.length > 2 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category:</span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={[
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                  categoryFilter === cat
                    ? 'bg-[#1a6cbf] text-white'
                    : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300',
                ].join(' ')}
              >
                {cat === 'all' ? 'All' : cap(cat)}
              </button>
            ))}
          </div>
        )}

        <span className="text-[11px] text-gray-400 ml-auto">{filtered.length} drug(s)</span>
      </div>

      {/* Drug table */}
      {!filtered.length ? (
        <EmptyState icon="pillBottle" title="No drugs found" description="No drugs match your current filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Drug</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expiry</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
                {filtered.map((drug) => {
                  const days = drug.days_left
                  const isExpired = days !== null && days <= 0
                  const isExpiring = days !== null && days > 0 && days <= EXPIRY_THRESHOLD
                  const isLowStock = drug.current_stock > 0 && drug.current_stock <= (drug.reorder_level || 0)
                  const isOutOfStock = drug.current_stock === 0

                  const expiryBadge = isExpired
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : days <= 15
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : days <= 30
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : days <= EXPIRY_THRESHOLD
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'

                  const expiryLabel = days === null
                    ? 'No expiry'
                    : isExpired
                      ? `Expired ${Math.abs(days)}d ago`
                      : `${days}d left`

                  return (
                    <tr
                      key={drug.id}
                      className={[
                        'hover:bg-gray-50/50 dark:hover:bg-gray-700/10 transition-colors',
                        isExpired ? 'bg-red-50/30 dark:bg-red-950/10' : '',
                        isExpiring && !isExpired ? 'bg-amber-50/20 dark:bg-amber-950/5' : '',
                      ].join(' ')}
                    >
                      {/* Drug name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={[
                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                            isExpired
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              : isExpiring
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
                          ].join(' ')}>
                            <Icon name="pill" size={13} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{drug.name}</p>
                            <p className="text-[10px] text-gray-400">{drug.generic_name} · {drug.strength} · {drug.form}</p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">{cap(drug.category)}</Badge>
                      </td>

                      {/* Stock */}
                      <td className="px-4 py-3 text-right">
                        <span className={[
                          'text-[13px] font-semibold tabular-nums',
                          isOutOfStock ? 'text-red-600 dark:text-red-400' : isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100',
                        ].join(' ')}>
                          {drug.current_stock}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-1">{drug.unit}</span>
                        {isOutOfStock && <p className="text-[9px] text-red-500 font-medium">OUT</p>}
                        {isLowStock && !isOutOfStock && <p className="text-[9px] text-amber-500 font-medium">LOW</p>}
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(drug.unit_price)}</span>
                        <p className="text-[9px] text-gray-400">Pharm: {formatMoney(drug.pharmacy_normal_price || 0)}</p>
                      </td>

                      {/* Expiry */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={[
                            'text-[12px] font-medium',
                            isExpired ? 'text-red-600 dark:text-red-400' : isExpiring ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300',
                          ].join(' ')}>
                            {formatDate(drug.expiry_date)}
                          </span>
                          <Badge className={expiryBadge}>{expiryLabel}</Badge>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {isExpired ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Expired</Badge>
                        ) : isExpiring ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Expiring</Badge>
                        ) : isOutOfStock ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">No stock</Badge>
                        ) : isLowStock ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Low stock</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">OK</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function StatTile({ label, value, icon, color, sublabel }) {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    green: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  }
  const textMap = {
    blue: 'text-blue-700 dark:text-blue-400',
    amber: 'text-amber-700 dark:text-amber-400',
    red: 'text-red-700 dark:text-red-400',
    green: 'text-emerald-700 dark:text-emerald-400',
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color]}`}>
          <Icon name={icon} size={16} />
        </div>
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
          <p className={`text-[18px] font-bold tabular-nums ${textMap[color]}`}>{value}</p>
          <p className="text-[10px] text-gray-400">{sublabel}</p>
        </div>
      </div>
    </Card>
  )
}
