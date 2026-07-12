'use client'

// StockTab — lab reagents & consumables inventory
// APIs:
//   GET   /api/lab/stock         → list items
//   PATCH /api/lab/stock         → restock { id, quantity }

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api  from '@/lib/api'
import {
  StatCard, SkeletonCard, SkeletonTable, ErrorState, EmptyState,
  Card, Badge, Icon,
  cap, formatMoney, formatDate,
} from '@/utils/helpers'
import { RestockModal } from '@/components/lab/RestockModal'

const CATEGORY_COLORS = {
  hematology: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  chemistry: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  urinalysis: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  supplies: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  microbiology: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const LOW_STOCK_DAYS_WARNING = 90

export default function StockTab() {
  const queryClient = useQueryClient()
  const [restocking, setRestocking] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['lab', 'stock'],
    queryFn: () => api.get('/api/lab/stock'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const restockMut = useMutation({
    mutationFn: (body) => api.patch('/api/lab/stock', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab', 'stock'] })
    },
  })

  const items = data?.items || []

  // Computed summary metrics
  const summary = useMemo(() => {
    const total = items.length
    const lowStock = items.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level).length
    const outOfStock = items.filter((i) => i.current_stock === 0).length
    const totalValue = items.reduce((s, i) => s + (i.current_stock || 0) * (i.unit_cost || 0), 0)
    return { total, lowStock, outOfStock, totalValue }
  }, [items])

  const handleRestock = async (item, quantity) => {
    try {
      await restockMut.mutateAsync({ id: item.id, quantity })
      toast.success(`${item.name} restocked +${quantity} ${item.unit}`)
      setRestocking(null)
    } catch (err) {
      toast.error(err.message || 'Could not restock')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={7} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon="box"
          color="blue"
          label="Total Items"
          value={summary.total}
          sublabel="reagents & supplies"
        />
        <StatCard
          icon="alert"
          color="amber"
          label="Low Stock"
          value={summary.lowStock}
          sublabel="at or below reorder"
        />
        <StatCard
          icon="trendDown"
          color="red"
          label="Out of Stock"
          value={summary.outOfStock}
          sublabel="requires immediate restock"
        />
        <StatCard
          icon="dollarSign"
          color="green"
          label="Total Value"
          value={formatMoney(summary.totalValue)}
          sublabel="current inventory"
        />
      </div>

      {/* Stock table */}
      {!items.length ? (
        <EmptyState
          icon="box"
          title="No stock items"
          description="Lab reagents and consumables will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Item</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Stock Level</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Unit Cost</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden xl:table-cell">Supplier</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Expiry</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {items.map((item) => (
                  <StockRow key={item.id} item={item} onRestock={() => setRestocking(item)} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Restock modal */}
      {restocking && (
        <RestockModal
          item={restocking}
          loading={restockMut.isPending}
          onClose={() => setRestocking(null)}
          onConfirm={handleRestock}
        />
      )}
    </div>
  )
}

// ─── Stock row ────────────────────────────────────────────────
function StockRow({ item, onRestock }) {
  const isOut = item.current_stock === 0
  const isLow = !isOut && item.current_stock <= item.reorder_level
  const rowBg = isOut
    ? 'bg-red-50/40 dark:bg-red-950/10'
    : isLow
      ? 'bg-amber-50/40 dark:bg-amber-950/10'
      : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'

  // Stock bar percent: cap at 200% of reorder level for display
  const pct = item.reorder_level > 0
    ? Math.min(100, Math.round((item.current_stock / (item.reorder_level * 2)) * 100))
    : item.current_stock > 0 ? 100 : 0
  const barColor = isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'

  // Expiry
  const { label, color } = expiryInfo(item.expiry_date)

  const catBadge = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'

  return (
    <tr className={rowBg}>
      <td className="px-4 py-3">
        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
        <p className="text-[10px] text-gray-400 font-mono">Batch: {item.batch_number || '—'}</p>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <Badge className={catBadge}>{cap(item.category)}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-35">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-right shrink-0">
            <p className={`text-[12px] font-semibold tabular-nums ${isOut ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {item.current_stock}
            </p>
            <p className="text-[10px] text-gray-400">/ {item.reorder_level} {item.unit}</p>
          </div>
        </div>
        {isOut && (
          <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mt-1">Out of stock</p>
        )}
        {isLow && (
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-1">Below reorder level</p>
        )}
      </td>
      <td className="px-4 py-3 text-right hidden lg:table-cell">
        <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(item.unit_cost)}</p>
        <p className="text-[10px] text-gray-400">per {item.unit.replace(/s$/, '')}</p>
      </td>
      <td className="px-4 py-3 hidden xl:table-cell">
        <span className="text-[11px] text-gray-600 dark:text-gray-400">{item.supplier || '—'}</span>
      </td>
      <td className="px-4 py-3">
        {item.expiry_date ? (
          <div>
            <p className={`text-[11px] font-medium ${color}`}>{formatDate(item.expiry_date)}</p>
            <p className={`text-[10px] ${color}`}>{label}</p>
          </div>
        ) : (
          <span className="text-[11px] text-gray-400">No expiry</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={onRestock}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white"
        >
          <Icon name="plus" size={12} />
          Restock
        </button>
      </td>
    </tr>
  )
}

// Expiry info helper
function expiryInfo(dateStr) {
  if (!dateStr) return { label: '', color: 'text-gray-400' }
  const d = new Date(dateStr)
  const days = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return { label: 'Expired', color: 'text-red-600 dark:text-red-400 font-semibold' }
  if (days <= LOW_STOCK_DAYS_WARNING) return { label: `${days}d left`, color: 'text-amber-600 dark:text-amber-400 font-semibold' }
  if (days <= 180) return { label: `${Math.round(days / 30)}mo left`, color: 'text-gray-500 dark:text-gray-400' }
  return { label: `${Math.round(days / 30)}mo left`, color: 'text-gray-400' }
}
