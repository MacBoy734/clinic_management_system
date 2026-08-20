'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonList, SkeletonCard, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatMoney, formatTime, formatDateTime, timeAgo, StatCard,
  PAYMENT_METHODS, Spinner,
} from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'
import { createOtcSaleSchema } from '@/lib/validation'

const PRICE_TIERS = [
  { key: 'normal', label: 'Normal', priceField: 'normal_price' },
  { key: 'promotional', label: 'Promo', priceField: 'promotional_price' },
  { key: 'wholesale', label: 'Wholesale', priceField: 'wholesale_price' },
]

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
const ALLOWED_PAYMENT_METHODS = ['cash', 'mpesa', 'credit']

function categoryLabel(c) { return CATEGORY_META[c]?.label || cap(c) }
function categoryIcon(c) { return CATEGORY_META[c]?.icon || 'box' }
function categoryBadgeClass(c) { return CATEGORY_META[c]?.badge || NEUTRAL_BADGE }

function tierBadgeClass(tier) {
  if (tier === 'normal') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (tier === 'promotional') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  if (tier === 'wholesale') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
  return NEUTRAL_BADGE
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
  if (method === 'credit') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return NEUTRAL_BADGE
}

function errMsg(err, fallback) {
  return err?.response?.data?.error || err?.data?.error || err?.message || fallback
}

function productSubtitle(p) {
  if (!p) return ''
  if (p.category === 'medication') {
    return [p.generic_name, p.strength, cap(p.form)].filter(Boolean).join(' · ')
  }
  return [cap(p.sub_category), p.unit].filter(Boolean).join(' · ')
}

export default function OTCSalesTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const soldBy = user?.name || 'Pharmacist'
  const [showNewSale, setShowNewSale] = useState(false)
  const [receiptSale, setReceiptSale] = useState(null)

  const salesQuery = useQuery({
    queryKey: ['pharmacy', 'otc-sales'],
    queryFn: () => api.get('/api/pharmacy/otc-sales'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

    const isRefetching = salesQuery.isFetching

  const createSaleMutation = useMutation({
    mutationFn: (payload) => api.post('/api/pharmacy/otc-sales', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'otc-sales'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'products'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stock'] })
    },
  })

  if (salesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }

  if (salesQuery.error) {
    return (
      <ErrorState
        message={errMsg(salesQuery.error, 'Could not load sales')}
        onRetry={salesQuery.refetch}
      />
    )
  }

  const sales = salesQuery.data?.sales || []
  const stats = salesQuery.data?.stats
    || { total_sales: 0, total_revenue: 0, today_count: 0, today_revenue: 0 }

  const handleCompleteSale = async (payload) => {
    try {
      const res = await createSaleMutation.mutateAsync(payload)
      toast.success(`Sale ${res.sale.receipt_number} completed`)
      setShowNewSale(false)
      setReceiptSale(res.sale)
    } catch (err) {
      const shortfalls = err?.response?.data?.shortfalls || err?.data?.shortfalls
      if (Array.isArray(shortfalls) && shortfalls.length) {
        toast.error(
          shortfalls
            .map((s) => `${s.name}: asked ${s.requested}, only ${s.available} left`)
            .join(' · ')
        )
        return
      }
      toast.error(errMsg(err, 'Could not complete sale'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="dollarSign" color="green" label="Today's Revenue"
          value={formatMoney(stats.today_revenue)} sublabel="counter sales today" />
        <StatCard icon="receipt" color="blue" label="Today's Sales"
          value={stats.today_count} sublabel="transactions" />
        <StatCard icon="trendUp" color="purple" label="Total Revenue"
          value={formatMoney(stats.total_revenue)} sublabel="all-time" />
        <StatCard icon="shoppingCart" color="amber" label="Total Sales"
          value={stats.total_sales} sublabel="transactions" />
      </div>

            <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Recent Sales</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Walk-in sales — medications, consumables and general goods
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => salesQuery.refetch()}
            disabled={isRefetching}
            className="px-3 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon 
              name="refresh" 
              size={13} 
              className={isRefetching ? 'animate-spin' : ''} 
            />
            {isRefetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowNewSale(true)}
            className="px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
          >
            <Icon name="plus" size={14} /> New Sale
          </button>
        </div>
      </div>

      {!sales.length ? (
        <EmptyState
          icon="receipt"
          title="No counter sales yet"
          description="Start a sale to serve a walk-in customer. Receipts are generated automatically."
        />
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} onPrint={() => setReceiptSale(sale)} />
          ))}
        </div>
      )}

      {showNewSale && (
        <NewSaleModal
          loading={createSaleMutation.isPending}
          soldBy={soldBy}
          onClose={() => setShowNewSale(false)}
          onComplete={handleCompleteSale}
        />
      )}

      {receiptSale && (
        <ReceiptModal sale={receiptSale} soldBy={soldBy} onClose={() => setReceiptSale(null)} />
      )}
    </div>
  )
}

// ─── Sale card ────────────────────────────────────────────────────────────────

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
            {sale.tax_total > 0 && (
              <p className="text-[10px] text-gray-400 tabular-nums">
                incl. {formatMoney(sale.tax_total)} tax
              </p>
            )}
          </div>
          <button
            onClick={onPrint}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-blue-800 dark:hover:text-blue-400 flex items-center gap-1.5"
          >
            <Icon name="printer" size={13} /> Print
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/40 text-[11px] text-gray-600 dark:text-gray-300"
            >
              <Icon name={categoryIcon(item.category)} size={11} className="text-gray-400" />
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

// ─── New sale modal ───────────────────────────────────────────────────────────

function NewSaleModal({ loading, soldBy, onClose, onComplete }) {
  // ── ALL HOOKS AT THE TOP ─────────────────────────────────────────
  const [customerName, setCustomerName] = useState('Walk-in Customer')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [cart, setCart] = useState([])

  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountReason, setDiscountReason] = useState('')

  const [paymentLines, setPaymentLines] = useState([
    { uid: 1, method: 'cash', amount: '', reference: '' },
  ])
  const [nextUid, setNextUid] = useState(2)

  const searchRef = useRef(null)
  const customerSearchRef = useRef(null)

  const productsQuery = useQuery({
    queryKey: ['pharmacy', 'products', 'all'],
    queryFn: () => api.get('/api/pharmacy/products'),
    staleTime: 30000,
  })

  const customersQuery = useQuery({
    queryKey: ['pharmacy', 'customers', customerSearchQuery],
    queryFn: () => api.get('/api/pharmacy/customers', { params: { q: customerSearchQuery } }),
    enabled: customerSearchQuery.trim().length > 1 && showCustomerDropdown,
    staleTime: 30000,
  })

  // ── EFFECTS ──────────────────────────────────────────────────────
  useEffect(() => {
    function onMouseDown(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // ── DERIVED STATE ────────────────────────────────────────────────
  const products = productsQuery.data?.items || []
  const customers = customersQuery.data?.customers || []

  const categoriesPresent = useMemo(
    () => [...new Set(products.map((p) => p.category))]
      .sort((a, b) => Object.keys(CATEGORY_META).indexOf(a) - Object.keys(CATEGORY_META).indexOf(b)),
    [products]
  )

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return products
      .filter((p) => categoryFilter === 'all' || p.category === categoryFilter)
      .filter((p) => {
        if (!q) return true
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.generic_name || '').toLowerCase().includes(q) ||
          (p.sub_category || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
        )
      })
      .slice(0, 10)
  }, [products, searchQuery, categoryFilter])

  const selectedPrice =
    selectedProduct && selectedTier
      ? selectedProduct[PRICE_TIERS.find((t) => t.key === selectedTier).priceField] || 0
      : 0

  const lineSubtotal = (selectedPrice || 0) * (quantity || 0)

  const cartSubtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const disc = Math.max(0, parseInt(discountAmount) || 0)
  const cartTotal = Math.max(0, cartSubtotal - disc)

  const totalPaid = paymentLines.reduce((s, p) => s + (parseInt(p.amount) || 0), 0)
  const remaining = cartTotal - totalPaid
  const hasCredit = paymentLines.some((p) => p.method === 'credit')
  const isBalanced = remaining === 0
  const hasEmptyMethod = paymentLines.some((p) => !p.method)

  const usedMethods = useMemo(
    () => new Set(paymentLines.map((p) => p.method).filter(Boolean)),
    [paymentLines]
  )

  const availableMethods = ALLOWED_PAYMENT_METHODS.filter((m) => !usedMethods.has(m))

  const inCartFor = (productId) =>
    cart.filter((c) => c.product_id === productId).reduce((s, c) => s + c.quantity, 0)

  // ── HANDLERS ─────────────────────────────────────────────────────
  function selectCustomer(customer) {
    setCustomerName(customer.name)
    setCustomerPhone(customer.phone || '')
    setSelectedCustomer(customer)
    setShowCustomerDropdown(false)
    setCustomerSearchQuery('')
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setCustomerName('Walk-in Customer')
    setCustomerPhone('')
    setCustomerSearchQuery('')
  }

  function selectProduct(product) {
    setSelectedProduct(product)
    setSelectedTier('normal')
    setQuantity(1)
    setShowDropdown(false)
    setSearchQuery(product.name)
  }

  function clearSelection() {
    setSelectedProduct(null)
    setSelectedTier(null)
    setQuantity(1)
    setSearchQuery('')
  }

  function handleAddToCart() {
    if (!selectedProduct || !selectedTier || !quantity || quantity < 1) {
      toast.error('Pick an item, a price tier and a quantity first')
      return
    }
    const alreadyInCart = inCartFor(selectedProduct.id)
    if (alreadyInCart + Number(quantity) > selectedProduct.current_stock) {
      const left = selectedProduct.current_stock - alreadyInCart
      toast.error(
        left > 0
          ? `Only ${left} ${selectedProduct.unit || 'units'} of ${selectedProduct.name} left`
          : `${selectedProduct.name} is already fully in the cart`
      )
      return
    }
    setCart((prev) => [
      ...prev,
      {
        product_id: selectedProduct.id,
        name: selectedProduct.name,
        category: selectedProduct.category,
        unit: selectedProduct.unit,
        quantity: Number(quantity),
        unit_price: selectedPrice,
        price_tier: selectedTier,
      },
    ])
    clearSelection()
  }

  function removeCartItem(index) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function addPaymentLine() {
    if (availableMethods.length === 0) {
      toast.error('All payment methods are already added')
      return
    }
    setPaymentLines((prev) => [
      ...prev,
      { uid: nextUid, method: availableMethods[0], amount: '', reference: '' },
    ])
    setNextUid((n) => n + 1)
  }

  function removePaymentLine(uid) {
    setPaymentLines((prev) => prev.filter((p) => p.uid !== uid))
  }

  function updatePaymentLine(uid, updates) {
    setPaymentLines((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...updates } : p)))
  }

  function handleSubmit(e) {
  e.preventDefault()

  // ── Keep your existing manual UX guards ─────────────────────────────
  if (!cart.length) {
    toast.error('Add at least one item to the sale')
    return
  }
  if (disc > 0 && !discountReason.trim()) {
    toast.error('A reason is required for every discount')
    return
  }
  if (remaining !== 0) {
    toast.error(`Payments must cover the full total. Remaining: ${formatMoney(remaining)}`)
    return
  }
  if (hasCredit && (!customerPhone.trim() || customerName === 'Walk-in Customer')) {
    toast.error('Credit sales require a customer name and phone')
    return
  }

  // ── Build a schema-safe payload ─────────────────────────────────────
  const payload = {
    customer_name: customerName.trim() || undefined,  // let Zod apply 'Walk-in Customer' default
    customer_phone: hasCredit ? customerPhone.trim() : null,
    discount_amount: disc,
    discount_reason: disc > 0 ? discountReason.trim() : null,
    payments: paymentLines.map((p) => ({
      method: p.method,
      amount: Math.max(0, Math.round(Number(p.amount) || 0)),  // Money = int ≥ 0
      reference: p.reference?.trim() || null,
    })),
    items: cart.map((i) => ({
      product_id: i.product_id,
      name: i.name,
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),  // PositiveQuantity
      unit_price: Math.max(0, Math.round(Number(i.unit_price) || 0)),  // Money
      price_tier: i.price_tier,
    })),
  }

  // ── Validate before the API ever sees it ────────────────────────────
  const parsed = createOtcSaleSchema.safeParse(payload)
  if (!parsed.success) {
    toast.error(parsed.error.errors[0].message)
    return
  }

  onComplete(parsed.data)
}

  // ── RENDER ───────────────────────────────────────────────────────
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
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">New Counter Sale</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Walk-in customer · served by {soldBy}
              </p>
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
          {/* ── Customer search ──────────────────────────────────────────── */}
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Customer
            </label>
            <div ref={customerSearchRef} className="relative space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value)
                    setCustomerSearchQuery(e.target.value)
                    setShowCustomerDropdown(true)
                    if (selectedCustomer) setSelectedCustomer(null)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Walk-in Customer"
                  className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={clearCustomer}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>

              {showCustomerDropdown && customerSearchQuery.trim().length > 1 && (
                <div className="absolute z-30 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl max-h-60 overflow-y-auto">
                  {customersQuery.isLoading && (
                    <div className="px-3 py-3 text-center text-[12px] text-gray-500 dark:text-gray-400">
                      Searching customers…
                    </div>
                  )}
                  {customersQuery.error && (
                    <div className="px-3 py-3 text-center">
                      <p className="text-[12px] text-red-600 dark:text-red-400 mb-2">
                        Could not load customers
                      </p>
                      <button
                        type="button"
                        onClick={() => customersQuery.refetch()}
                        className="px-3 py-1 rounded-lg text-[11px] font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!customersQuery.isLoading && !customersQuery.error && customers.length === 0 && (
                    <div className="px-3 py-3 text-center text-[12px] text-gray-500 dark:text-gray-400">
                      No customers found. Type to create a new one.
                    </div>
                  )}
                  {!customersQuery.isLoading && !customersQuery.error && customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/40 last:border-b-0"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{c.name}</p>
                        {c.phone && <p className="text-[11px] text-gray-500 dark:text-gray-400">{c.phone}</p>}
                      </div>
                      <span className="text-[11px] text-gray-400">Select</span>
                    </button>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone number (required for credit)"
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
              />
            </div>
          </div>

          {/* ── Product search + add to cart ─────────────────────────────── */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Add Item
            </p>

            {categoriesPresent.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {['all', ...categoriesPresent].map((c) => {
                  const active = categoryFilter === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setCategoryFilter(c); setShowDropdown(true) }}
                      className={[
                        'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1',
                        active
                          ? 'bg-[#1a6cbf] text-white'
                          : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300',
                      ].join(' ')}
                    >
                      {c !== 'all' && <Icon name={categoryIcon(c)} size={11} />}
                      {c === 'all' ? 'All' : categoryLabel(c)}
                    </button>
                  )
                })}
              </div>
            )}

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
                  setSelectedProduct(null)
                  setSelectedTier(null)
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name, sub-category or SKU…"
                className="w-full h-10 pl-10 pr-4 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
              />

              {showDropdown && productsQuery.isError && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-red-200 dark:border-red-900/60 shadow-xl px-3 py-3 text-center">
                  <p className="text-[12px] text-red-600 dark:text-red-400 mb-2">
                    {errMsg(productsQuery.error, 'Could not load products')}
                  </p>
                  <button
                    type="button"
                    onClick={() => productsQuery.refetch()}
                    className="px-3 py-1 rounded-lg text-[11px] font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100"
                  >
                    Retry
                  </button>
                </div>
              )}

              {showDropdown && !productsQuery.isError && filteredProducts.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl max-h-60 overflow-y-auto">
                  {filteredProducts.map((product) => {
                    const remaining = product.current_stock - inCartFor(product.id)
                    const out = remaining <= 0
                    const low = remaining > 0 && remaining <= product.reorder_level
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => selectProduct(product)}
                        disabled={out}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/40 last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center shrink-0">
                            <Icon
                              name={categoryIcon(product.category)}
                              size={12}
                              className="text-gray-500 dark:text-gray-400"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
                              {product.name}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {productSubtitle(product) || categoryLabel(product.category)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                            {formatMoney(product.normal_price)}
                          </p>
                          <p className={[
                            'text-[10px] tabular-nums',
                            out ? 'text-red-600 dark:text-red-400'
                              : low ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400',
                          ].join(' ')}>
                            {out ? 'out of stock' : `stock: ${remaining} ${product.unit || ''}`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {showDropdown && !productsQuery.isError && !filteredProducts.length && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl px-3 py-3 text-center text-[12px] text-gray-500 dark:text-gray-400">
                  {productsQuery.isLoading ? 'Loading items…' : 'No matching items'}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {selectedProduct.name}
                      </p>
                      <Badge className={categoryBadgeClass(selectedProduct.category)}>
                        {categoryLabel(selectedProduct.category)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {productSubtitle(selectedProduct)}
                      {productSubtitle(selectedProduct) ? ' · ' : ''}
                      <span className={
                        selectedProduct.current_stock === 0
                          ? 'text-red-600 dark:text-red-400'
                          : selectedProduct.current_stock <= selectedProduct.reorder_level
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }>
                        Stock: {selectedProduct.current_stock} {selectedProduct.unit || ''}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>

                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                    Price
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-3 py-2 rounded-lg text-[12px] font-semibold bg-blue-600 text-white border border-blue-600">
                      Normal — {formatMoney(selectedProduct.normal_price)}
                    </div>
                    <span className="text-[11px] text-gray-400">
                      Promo & wholesale tiers disabled
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, selectedProduct.current_stock - inCartFor(selectedProduct.id))}
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

          {/* ── Cart ─────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
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
                Nothing in the cart yet. Search and add items above.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center shrink-0">
                      <Icon
                        name={categoryIcon(item.category)}
                        size={14}
                        className="text-gray-500 dark:text-gray-400"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
                          {item.name}
                        </p>
                        <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold ${tierBadgeClass(item.price_tier)}`}>
                          {tierLabel(item.price_tier)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                        {formatMoney(item.unit_price)} × {item.quantity} {item.unit || ''}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                      {formatMoney(item.unit_price * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCartItem(i)}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Discount */}
            {cart.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                    Discount Amount
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={cartSubtotal}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, Math.min(cartSubtotal, Number(e.target.value) || 0)))}
                    placeholder="0"
                    className="w-full h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                    Reason {disc > 0 && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="e.g. staff discount"
                    className="w-full h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                  />
                </div>
              </div>
            )}

            <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 space-y-1">
              {disc > 0 && (
                <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(cartSubtotal)}</span>
                </div>
              )}
              {disc > 0 && (
                <div className="flex items-center justify-between text-[11px] text-red-600 dark:text-red-400">
                  <span>Discount</span>
                  <span className="tabular-nums">-{formatMoney(disc)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[#1a6cbf] dark:text-blue-400">
                  Total ({cart.length} line{cart.length !== 1 ? 's' : ''})
                </span>
                <span className="text-lg font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">
                  {formatMoney(cartTotal)}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Final prices and tax are confirmed by the server when the sale is recorded.
            </p>
          </div>

          {/* ── Payments ─────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Payments
                </label>
                <span
                  className={[
                    'text-[11px] font-medium tabular-nums',
                    isBalanced
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400',
                  ].join(' ')}
                >
                  {isBalanced ? 'Fully paid' : `Remaining: ${formatMoney(remaining)}`}
                </span>
              </div>

              <div className="space-y-2">
                {paymentLines.map((line) => (
                  <div key={line.uid} className="flex items-center gap-2">
                    <select
                      value={line.method}
                      onChange={(e) => updatePaymentLine(line.uid, { method: e.target.value })}
                      className="h-9 px-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                    >
                      <option value="" disabled>Select method</option>
                      {ALLOWED_PAYMENT_METHODS
                        .filter((m) => m === line.method || !usedMethods.has(m))
                        .map((m) => (
                          <option key={m} value={m}>{cap(m)}</option>
                        ))}
                    </select>

                    <input
                      type="number"
                      min={0}
                      value={line.amount}
                      onChange={(e) => updatePaymentLine(line.uid, { amount: e.target.value })}
                      placeholder="Amount"
                      className="flex-1 h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                    />

                    {line.method === 'mpesa' && (
                      <input
                        type="text"
                        value={line.reference}
                        onChange={(e) => updatePaymentLine(line.uid, { reference: e.target.value })}
                        placeholder="Ref"
                        className="w-24 h-9 px-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                      />
                    )}

                    {paymentLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentLine(line.uid)}
                        className="w-8 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addPaymentLine()}
                disabled={availableMethods.length === 0}
                className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="plus" size={12} /> Add Payment
              </button>
            </div>

            {hasCredit && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-2">
                  Credit Sale — Customer Details Required
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    required
                    className="h-9 px-3 text-[13px] rounded-lg border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
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
              disabled={loading || !cart.length || !isBalanced || hasEmptyMethod}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Spinner size={14} /> Processing…</>
                : <><Icon name="check" size={14} /> Complete Sale</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

function ReceiptModal({ sale, soldBy, onClose }) {
  const items = sale.items || []
  const total = sale.total ?? items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const taxTotal = sale.tax_total ?? items.reduce((s, i) => s + (i.tax_amount || 0), 0)
  const subtotal = sale.subtotal ?? items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const discount = sale.discount_amount || 0

  const profileQuery = useQuery({
    queryKey: ['pharmacy', 'clinic-profile'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 5 * 60 * 1000,
  })
  const clinic = profileQuery.data?.settings || {}

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:bg-white print:p-0 print:block"
      onClick={onClose}
    >
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
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            <h2 className="text-[15px] font-bold tracking-tight">{clinic.name || 'Clinic'}</h2>
            {clinic.tagline && <p className="text-[10px] text-gray-600 mt-0.5">{clinic.tagline}</p>}
            {clinic.address && <p className="text-[10px] text-gray-600 mt-0.5">{clinic.address}</p>}
            {clinic.phone && <p className="text-[10px] text-gray-600">Tel: {clinic.phone}</p>}
            {clinic.email && <p className="text-[10px] text-gray-600">{clinic.email}</p>}
          </div>

          <div className="text-center mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Sales Receipt
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
          <div className="border-t border-dashed border-gray-300 pt-3 mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Items
            </p>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span className="flex-1 pr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatMoney(item.unit_price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t-2 border-black pt-3 space-y-1">
            <div className="flex justify-between text-[11px] text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-[11px] text-red-600">
                <span>Discount</span>
                <span className="tabular-nums">-{formatMoney(discount)}</span>
              </div>
            )}
            {taxTotal > 0 && (
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>Tax</span>
                <span className="tabular-nums">{formatMoney(taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-gray-300">
              <span className="text-[12px] font-bold uppercase tracking-widest">Total</span>
              <span className="text-[16px] font-bold tabular-nums">{formatMoney(total)}</span>
            </div>
          </div>

          <div className="text-center mt-4 pt-3 border-t border-dashed border-gray-300">
            <p className="text-[10px] text-gray-600">Thank you for shopping with us.</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Keep this receipt for returns and exchanges.</p>
            <p className="text-[9px] text-gray-400 mt-1.5">Computer-generated receipt.</p>
          </div>
        </div>

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