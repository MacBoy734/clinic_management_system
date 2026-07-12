'use client'

// OTCSalesTab — pharmacy's over-the-counter (walk-in) sales register.
// SEPARATE from prescription dispensing — these sales don't affect visit status.
//
// APIs:
//   GET  /api/pharmacy/drugs      → { items: [...] }  (drug stock with all 3 price tiers)
//   GET  /api/pharmacy/otc-sales  → { sales: [...], stats: { total_sales, total_revenue, today_count, today_revenue } }
//   POST /api/pharmacy/otc-sales  → create sale
//        Body: { customer_name, payment_method, sold_by, items: [{drug_id, name, quantity, unit_price, price_tier}] }

import { useState, useRef, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api  from '@/lib/api'
import {
  SkeletonList, SkeletonCard, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatMoney, formatTime, formatDateTime, timeAgo, StatCard, PAYMENT_METHODS, Spinner
} from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'

// Price tier metadata — matches the helpers.STATUS_BADGES price-tier colours
const PRICE_TIERS = [
  { key: 'normal', label: 'Normal', priceField: 'pharmacy_normal_price' },
  { key: 'promotional', label: 'Promo', priceField: 'promotional_price' },
  { key: 'wholesale', label: 'Wholesale', priceField: 'wholesale_price' },
]

function tierBadgeClass(tier) {
  if (tier === 'normal') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (tier === 'promotional') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  if (tier === 'wholesale') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'
}

function tierLabel(tier) {
  if (tier === 'normal') return 'Normal'
  if (tier === 'promotional') return 'Promotional'
  if (tier === 'wholesale') return 'Wholesale'
  return cap(tier)
}

function paymentBadgeClass(method) {
  if (method === 'cash') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  if (method === 'mpesa') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (method === 'insurance') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'
}

export default function OTCSalesTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const soldBy = user?.name || 'Pharmacist'
  const [showNewSale, setShowNewSale] = useState(false)
  const [receiptSale, setReceiptSale] = useState(null) // sale object for the receipt modal

  const salesQuery = useQuery({
    queryKey: ['pharmacy', 'otc-sales'],
    queryFn: () => api.get('/api/pharmacy/otc-sales'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const createSaleMutation = useMutation({
    mutationFn: (payload) => api.post('/api/pharmacy/otc-sales', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'otc-sales'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'drugs'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stock'] })
    },
  })

  const isLoading = salesQuery.isLoading
  const error = salesQuery.error
  const refetch = () => salesQuery.refetch()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const sales = salesQuery.data?.sales || []
  const stats = salesQuery.data?.stats || { total_sales: 0, total_revenue: 0, today_count: 0, today_revenue: 0 }

  const handleCompleteSale = async (payload) => {
    try {
      const res = await createSaleMutation.mutateAsync({ ...payload, sold_by: soldBy })
      toast.success(`Sale ${res.sale.receipt_number} completed`)
      setShowNewSale(false)
      // Auto-open the receipt for the sale that was just created
      setReceiptSale(res.sale)
    } catch (err) {
      toast.error(err.message || 'Could not complete sale')
    }
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="dollarSign"
          color="green"
          label="Today's Revenue"
          value={formatMoney(stats.today_revenue)}
          sublabel="OTC sales today"
        />
        <StatCard
          icon="receipt"
          color="blue"
          label="Today's Sales"
          value={stats.today_count}
          sublabel="transactions"
        />
        <StatCard
          icon="trendUp"
          color="purple"
          label="Total Revenue"
          value={formatMoney(stats.total_revenue)}
          sublabel="all-time"
        />
        <StatCard
          icon="shoppingCart"
          color="amber"
          label="Total Sales"
          value={stats.total_sales}
          sublabel="transactions"
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Recent Sales</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Walk-in customer medication sales
          </p>
        </div>
        <button
          onClick={() => setShowNewSale(true)}
          className="px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
        >
          <Icon name="plus" size={14} /> New Sale
        </button>
      </div>

      {/* Sales list */}
      {!sales.length ? (
        <EmptyState
          icon="receipt"
          title="No OTC sales yet"
          description="Click 'New Sale' to record your first walk-in medication sale. Receipts are generated automatically."
        />
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} onPrint={() => setReceiptSale(sale)} />
          ))}
        </div>
      )}

      {/* New sale modal */}
      {showNewSale && (
        <NewSaleModal
          loading={createSaleMutation.isPending}
          soldBy={soldBy}
          onClose={() => setShowNewSale(false)}
          onComplete={handleCompleteSale}
        />
      )}

      {/* Receipt print modal */}
      {receiptSale && (
        <ReceiptModal sale={receiptSale} soldBy={soldBy} onClose={() => setReceiptSale(null)} />
      )}
    </div>
  )
}

// ─── Sale card in the recent sales list ──────────────────────────────
function SaleCard({ sale, onPrint }) {
  const items = sale.items || []
  const itemCount = items.reduce((s, i) => s + (i.quantity || 0), 0)
  return (
    <Card className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
            <Icon name="receipt" size={16} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {sale.receipt_number}
              </span>
              <Badge className={paymentBadgeClass(sale.payment_method)}>
                {cap(sale.payment_method)}
              </Badge>
            </div>
            <p className="text-[12px] text-gray-700 dark:text-gray-300 mt-0.5">
              {sale.customer_name} · {itemCount} item{itemCount !== 1 ? 's' : ''}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {timeAgo(sale.sold_at)} · {formatTime(sale.sold_at)} · Served by {sale.sold_by}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[15px] font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">
              {formatMoney(sale.total)}
            </p>
          </div>
          <button
            onClick={onPrint}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-blue-800 dark:hover:text-blue-400 flex items-center gap-1.5"
          >
            <Icon name="printer" size={13} /> Print
          </button>
        </div>
      </div>

      {/* Item chips */}
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/40 text-[11px] text-gray-600 dark:text-gray-300"
            >
              {item.name} ×{item.quantity}
              <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold ${tierBadgeClass(item.price_tier)}`}>
                {tierLabel(item.price_tier)}
              </span>
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── New sale modal — drug search + cart + complete ───────────────────
function NewSaleModal({ loading, soldBy, onClose, onComplete }) {
  const [customerName, setCustomerName] = useState('Walk-in Customer')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedDrug, setSelectedDrug] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null) // 'normal' | 'promotional' | 'wholesale'
  const [quantity, setQuantity] = useState(1)
  const [cart, setCart] = useState([])

  const drugsQuery = useQuery({
    queryKey: ['pharmacy', 'drugs'],
    queryFn: () => api.get('/api/pharmacy/drugs'),
    staleTime: 30000,
  })

  const drugs = drugsQuery.data?.items || []
  const searchRef = useRef(null)

  // Click-outside to close the search dropdown
  useEffect(() => {
    function onMouseDown(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Filtered drug list for the search dropdown
  const filteredDrugs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return drugs.slice(0, 8)
    return drugs
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.generic_name.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [drugs, searchQuery])

  const selectedPrice =
    selectedDrug && selectedTier
      ? selectedDrug[PRICE_TIERS.find((t) => t.key === selectedTier).priceField]
      : 0

  const lineSubtotal = (selectedPrice || 0) * (quantity || 0)
  const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  function selectDrug(drug) {
    setSelectedDrug(drug)
    setSelectedTier('normal') // default to Normal tier
    setQuantity(1)
    setShowDropdown(false)
    setSearchQuery(drug.name)
  }

  function handleAddToCart() {
    if (!selectedDrug || !selectedTier || !quantity || quantity < 1) {
      toast.error('Pick a drug, price tier, and quantity first')
      return
    }
    if (quantity > selectedDrug.current_stock) {
      toast.error(`Only ${selectedDrug.current_stock} ${selectedDrug.unit || 'units'} of ${selectedDrug.name} in stock`)
      return
    }
    setCart((prev) => [
      ...prev,
      {
        drug_id: selectedDrug.id,
        name: selectedDrug.name,
        quantity: Number(quantity),
        unit_price: selectedPrice,
        price_tier: selectedTier,
      },
    ])
    // Reset selection state (keep customer/payment)
    setSelectedDrug(null)
    setSelectedTier(null)
    setQuantity(1)
    setSearchQuery('')
  }

  function removeCartItem(index) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!cart.length) {
      toast.error('Add at least one item to the sale')
      return
    }
    onComplete({
      customer_name: customerName.trim() || 'Walk-in Customer',
      payment_method: paymentMethod,
      items: cart.map((i) => ({
        drug_id: i.drug_id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        price_tier: i.price_tier,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1a6cbf] flex items-center justify-center shrink-0">
              <Icon name="shoppingCart" size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">New OTC Sale</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Walk-in customer · served by {soldBy}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {/* Customer + payment */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Customer"
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={[
                      'px-2 py-2 rounded-lg text-[11px] font-semibold capitalize transition-colors',
                      paymentMethod === m
                        ? 'bg-[#1a6cbf] text-white'
                        : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400',
                    ].join(' ')}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Drug search + add to cart */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Add Medication
            </p>

            <div ref={searchRef} className="relative">
              <Icon
                name="search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowDropdown(true)
                  setSelectedDrug(null)
                  setSelectedTier(null)
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search drug by name or generic name…"
                className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
              />

              {/* Dropdown */}
              {showDropdown && filteredDrugs.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl max-h-60 overflow-y-auto">
                  {filteredDrugs.map((drug) => {
                    const out = drug.current_stock === 0
                    const low = drug.current_stock > 0 && drug.current_stock <= drug.reorder_level
                    return (
                      <button
                        key={drug.id}
                        type="button"
                        onClick={() => selectDrug(drug)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/40 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
                            {drug.name}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {drug.generic_name} · {cap(drug.category || 'other')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                            {formatMoney(drug.pharmacy_normal_price)}
                          </p>
                          <p
                            className={[
                              'text-[10px] tabular-nums',
                              out
                                ? 'text-red-600 dark:text-red-400'
                                : low
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400',
                            ].join(' ')}
                          >
                            {out ? 'out of stock' : `stock: ${drug.current_stock} ${drug.unit || ''}`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {showDropdown && !filteredDrugs.length && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl px-3 py-3 text-center text-[12px] text-gray-500 dark:text-gray-400">
                  {drugsQuery.isLoading ? 'Loading drugs…' : 'No matching drugs'}
                </div>
              )}
            </div>

            {/* Selected drug — price tier picker + qty + add button */}
            {selectedDrug && (
              <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                      {selectedDrug.name}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {selectedDrug.generic_name} ·{' '}
                      <span
                        className={
                          selectedDrug.current_stock === 0
                            ? 'text-red-600 dark:text-red-400'
                            : selectedDrug.current_stock <= selectedDrug.reorder_level
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        Stock: {selectedDrug.current_stock} {selectedDrug.unit || ''}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDrug(null)
                      setSelectedTier(null)
                      setQuantity(1)
                      setSearchQuery('')
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Clear selection"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>

                {/* Price tier buttons */}
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                    Select Price Tier
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRICE_TIERS.map((tier) => {
                      const price = selectedDrug[tier.priceField]
                      const active = selectedTier === tier.key
                      return (
                        <button
                          key={tier.key}
                          type="button"
                          onClick={() => setSelectedTier(tier.key)}
                          className={[
                            'px-2 py-2 rounded-lg text-[11px] font-semibold transition-colors border text-center',
                            active
                              ? tier.key === 'normal'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : tier.key === 'promotional'
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-cyan-600 text-white border-cyan-600'
                              : 'bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-800',
                          ].join(' ')}
                        >
                          <span className="block">{tier.label}</span>
                          <span className="block text-[10px] opacity-90 tabular-nums mt-0.5">
                            {formatMoney(price)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Quantity + subtotal + add */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={selectedDrug.current_stock}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                      Subtotal
                    </label>
                    <div className="h-9 px-3 rounded-lg bg-gray-100 dark:bg-gray-700/40 flex items-center text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatMoney(lineSubtotal)}
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      disabled={!selectedTier || quantity < 1}
                      className="w-full h-9 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon name="plus" size={14} /> Add to Sale
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Cart ({cart.length})
              </p>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  Clear all
                </button>
              )}
            </div>

            {!cart.length ? (
              <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700/60 px-4 py-6 text-center text-[12px] text-gray-400">
                No items in the cart yet. Search and add drugs above.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                      <Icon name="pill" size={14} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
                          {item.name}
                        </p>
                        <span
                          className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold ${tierBadgeClass(item.price_tier)}`}
                        >
                          {tierLabel(item.price_tier)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                        {formatMoney(item.unit_price)} × {item.quantity}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                      {formatMoney(item.unit_price * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCartItem(i)}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      aria-label="Remove from cart"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Total */}
            <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#1a6cbf] dark:text-blue-400">
                Total ({cart.length} item{cart.length !== 1 ? 's' : ''})
              </span>
              <span className="text-lg font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">
                {formatMoney(cartTotal)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 bg-gray-50/50 dark:bg-[#1e293b]/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !cart.length}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Spinner size={14} /> Processing…
                </>
              ) : (
                <>
                  <Icon name="check" size={14} /> Complete Sale
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Receipt print modal ─────────────────────────────────────────────
function ReceiptModal({ sale, soldBy, onClose }) {
  const items = sale.items || []
  const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:bg-white print:p-0 print:block"
      onClick={onClose}
    >
      {/* Print-only CSS: hide everything except the .print-area when printing */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: absolute !important;
            top: 0; left: 0;
            width: 100%;
            max-height: none !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        className="relative bg-white text-black w-80 max-h-[90vh] overflow-y-auto rounded-lg print:w-full print:max-h-none print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 print-area">
          {/* Clinic header */}
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            <h2 className="text-[15px] font-bold tracking-tight">City Health Clinic</h2>
            <p className="text-[10px] text-gray-600 mt-0.5">123 Moi Avenue, Nairobi</p>
            <p className="text-[10px] text-gray-600">Tel: +254 700 000 000</p>
            <p className="text-[10px] text-gray-600">help@cityhealthclinic.co.ke</p>
          </div>

          {/* Receipt meta */}
          <div className="text-center mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              OTC Sales Receipt
            </p>
            <p className="text-[14px] font-bold text-black mt-0.5">{sale.receipt_number}</p>
          </div>

          <div className="text-[11px] text-gray-700 space-y-0.5 mb-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Date:</span>
              <span className="font-medium">{formatDateTime(sale.sold_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Customer:</span>
              <span className="font-medium">{sale.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment:</span>
              <span className="font-medium uppercase">{sale.payment_method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Served by:</span>
              <span className="font-medium">{sale.sold_by || soldBy}</span>
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-dashed border-gray-300 pt-2">
            <div className="grid grid-cols-12 text-[10px] font-semibold uppercase tracking-widest text-gray-500 pb-1.5 border-b border-gray-200">
              <span className="col-span-6">Item</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-2 text-right">Total</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 py-1.5 border-b border-gray-100 text-[11px] text-black">
                <div className="col-span-6">
                  <p className="font-medium leading-tight">{item.name}</p>
                  <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">
                    {tierLabel(item.price_tier)} tier
                  </p>
                </div>
                <span className="col-span-2 text-right tabular-nums self-center">{item.quantity}</span>
                <span className="col-span-2 text-right tabular-nums self-center">{formatMoney(item.unit_price)}</span>
                <span className="col-span-2 text-right tabular-nums font-medium self-center">
                  {formatMoney(item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-3 pt-2 border-t-2 border-black">
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-bold uppercase tracking-widest">Total</span>
              <span className="text-[16px] font-bold tabular-nums">{formatMoney(total)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-4 pt-3 border-t border-dashed border-gray-300">
            <p className="text-[10px] text-gray-600">Thank you for shopping with us!</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Keep this receipt for returns/exchanges.</p>
            <p className="text-[9px] text-gray-400 mt-1.5">This is a computer-generated receipt.</p>
          </div>
        </div>

        {/* Actions (hidden when printing) */}
        <div className="p-4 border-t border-gray-200 flex gap-2 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 h-9 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center justify-center gap-1.5"
          >
            <Icon name="printer" size={14} /> Print Receipt
          </button>
          <button
            onClick={onClose}
            className="px-4 h-9 rounded-lg text-[13px] font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5"
          >
            <Icon name="x" size={14} /> Close
          </button>
        </div>
      </div>
    </div>
  )
}