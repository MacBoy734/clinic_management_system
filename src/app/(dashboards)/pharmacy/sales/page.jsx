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
import ReturnModal from '@/components/pharmacy/ReturnModal'
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

// Pharmacists can only reverse a sale on the day it happened. Admins get a
// week. Mirrored server-side — this just avoids offering a button that 403s.
const RETURN_WINDOW_DAYS = 7

function returnPermission(sale, user) {
  const sold = new Date(sale.sold_at)
  const now = new Date()
  const ageDays = Math.floor((now - sold) / 86400000)
  const sameDay =
    sold.getFullYear() === now.getFullYear() &&
    sold.getMonth() === now.getMonth() &&
    sold.getDate() === now.getDate()

  if (ageDays > RETURN_WINDOW_DAYS) {
    return { canReturn: false, reason: `Returns close after ${RETURN_WINDOW_DAYS} days` }
  }
  if (user?.role !== 'admin' && !sameDay) {
    return { canReturn: false, reason: 'Only an admin can return a sale from a previous day' }
  }
  return { canReturn: true, reason: null }
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

const SALES_PER_PAGE = 20

export default function OTCSalesTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const soldBy = user?.name || 'Pharmacist'
  const [showNewSale, setShowNewSale] = useState(false)
  const [receiptSale, setReceiptSale] = useState(null)
  const [returnSale, setReturnSale] = useState(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  // Debounced so typing a receipt number doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, from, to])

  const params = { page, limit: SALES_PER_PAGE }
  if (debouncedSearch) params.q = debouncedSearch
  if (from) params.from = from
  if (to) params.to = to

  const salesQuery = useQuery({
    queryKey: ['pharmacy', 'otc-sales', debouncedSearch, from, to, page],
    queryFn: () => api.get('/api/pharmacy/otc-sales', { params }),
    staleTime: 15000,
    placeholderData: (prev) => prev,
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

    const returnMutation = useMutation({
    mutationFn: ({ saleId, body }) => api.post(`/api/pharmacy/otc-sales/${saleId}/return`, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'otc-sales'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'products'] })
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'stock'] })
      const parts = []
            if (res.return.cash_refund_amount > 0) parts.push(`${formatMoney(res.return.cash_refund_amount)} cash`)
      if (res.return.credit_note_amount > 0) parts.push(`${formatMoney(res.return.credit_note_amount)} off their debt`)
      toast.success(`${res.return.return_number} — refund ${parts.join(' + ')}`)
      setReturnSale(null)
    },
    onError: (e) => toast.error(errMsg(e, 'Could not process return')),
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
  const pages = salesQuery.data?.pages || 1
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

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Sales</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {salesQuery.data?.total ?? 0} sale{salesQuery.data?.total === 1 ? '' : 's'}
            {debouncedSearch || from || to ? ' matching' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Receipt, customer or item…"
              className="h-9 pl-8 pr-3 w-52 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
            />
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100"
          />
          <span className="text-[12px] text-gray-400">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100"
          />
          {(search || from || to) && (
            <button
              onClick={() => { setSearch(''); setFrom(''); setTo('') }}
              className="h-9 px-2.5 rounded-lg text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40"
            >
              Clear
            </button>
          )}
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
          title={debouncedSearch || from || to ? 'No matching sales' : 'No counter sales yet'}
          description={
            debouncedSearch || from || to
              ? 'Try a different receipt number, customer name or date range.'
              : 'Start a sale to serve a walk-in customer. Receipts are generated automatically.'
          }
        />
      ) : (
        <>
          <div className="space-y-3">
                       {sales.map((sale) => {
              const perm = returnPermission(sale, user)
              return (
                <SaleCard
                  key={sale.id}
                  sale={sale}
                  onPrint={() => setReceiptSale(sale)}
                  onReturn={() => setReturnSale(sale)}
                  canReturn={perm.canReturn}
                  returnBlockedReason={perm.reason}
                />
              )
            })}
          </div>

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
        </>
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
            {returnSale && (
        <ReturnModal
          sale={returnSale}
          loading={returnMutation.isPending}
          onClose={() => setReturnSale(null)}
          onSubmit={(body) => returnMutation.mutate({ saleId: returnSale.id, body })}
        />
      )}
    </div>
  )
}

// ─── Sale card ────────────────────────────────────────────────────────────────

function SaleCard({ sale, onPrint, onReturn, canReturn, returnBlockedReason }) {
  const items = sale.items || []
  const itemCount = items.reduce((s, i) => s + (i.quantity || 0), 0)
  const anyReturnable = items.some((i) => (i.returnable_qty ?? i.quantity) > 0)
  const returns = sale.returns || []

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
          {anyReturnable && (
            <button
              onClick={onReturn}
              disabled={!canReturn}
              title={canReturn ? 'Process a return against this sale' : returnBlockedReason}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-amber-400 hover:text-amber-600 dark:hover:border-amber-800 dark:hover:text-amber-400 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
            >
              <Icon name="arrowLeft" size={13} /> Return
            </button>
          )}
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

      {returns.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700/60 space-y-1">
          {returns.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-[11px]">
              <span className="text-amber-700 dark:text-amber-400">
                {r.return_number} · {r.reason}
              </span>
              <span className="text-amber-700 dark:text-amber-400 tabular-nums font-medium">
                −{formatMoney(r.refund_amount)}
              </span>
            </div>
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
  const [quantity, setQuantity] = useState('1')
  const [cart, setCart] = useState([])

  const [discountAmount, setDiscountAmount] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  const [paymentLines, setPaymentLines] = useState([
    { uid: 1, method: 'cash', amount: '', reference: '', touched: false },
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
    queryKey: ['pharmacy', 'customers', customerSearchQuery.trim()],
    queryFn: () => api.get('/api/pharmacy/customers', { params: { q: customerSearchQuery.trim() } }),
    enabled: showCustomerDropdown,
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

  const lineSubtotal = (selectedPrice || 0) * (quantity === '' ? 0 : parseInt(quantity, 10) || 0)

  const cartSubtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const disc = discountAmount === '' ? 0 : Math.max(0, parseInt(discountAmount) || 0)
  const cartTotal = Math.max(0, cartSubtotal - disc)

  useEffect(() => {
    setPaymentLines((prev) => {
      if (prev.length !== 1 || prev[0].touched) return prev
      const next = cartTotal > 0 ? String(cartTotal) : ''
      if (prev[0].amount === next) return prev
      return [{ ...prev[0], amount: next }]
    })
  }, [cartTotal])
  function hasCreditLine(lines) {
    return lines.some((p) => p.method === 'credit')
  }
  const totalPaid = paymentLines.reduce((s, p) => s + (parseInt(p.amount) || 0), 0)
  const remaining = cartTotal - totalPaid
    const shortfall = Math.max(0, remaining)
  const overpaid = Math.max(0, totalPaid - cartTotal)
  const cashOnly = paymentLines.length === 1 && paymentLines[0].method === 'cash'
  const change = cashOnly ? overpaid : 0
  const invalidOverpay = overpaid > 0 && !cashOnly
  const hasCredit = hasCreditLine(paymentLines)
  const isBalanced = shortfall === 0
  const hasEmptyMethod = paymentLines.some((p) => !p.method)

  const creditPortion = paymentLines
    .filter((p) => p.method === 'credit')
    .reduce((s, p) => s + (parseInt(p.amount) || 0), 0)


  const custBalance = Number(selectedCustomer?.balance ?? 0)
  const custLimit = Number(selectedCustomer?.credit_limit ?? 0)
  const custHeadroom = Number(selectedCustomer?.headroom ?? 0)
  const overLimit = hasCredit && selectedCustomer && creditPortion > custHeadroom
  const noLimitSet = hasCredit && selectedCustomer && custLimit <= 0

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
    setQuantity('1')
    setShowDropdown(false)
    setSearchQuery(product.name)
  }

  function clearSelection() {
    setSelectedProduct(null)
        setSelectedTier(null)
    setQuantity('1')
    setSearchQuery('')
  }

  function handleAddToCart() {
       const qtyNum = parseInt(quantity, 10) || 0
    if (!selectedProduct || !selectedTier || qtyNum < 1) {
      toast.error('Pick an item, a price tier and a quantity first')
      return
    }
    const alreadyInCart = inCartFor(selectedProduct.id)
    if (alreadyInCart + qtyNum > selectedProduct.current_stock) {
      const left = selectedProduct.current_stock - alreadyInCart
      toast.error(
        left > 0
          ? `Only ${left} ${selectedProduct.unit || 'units'} of ${selectedProduct.name} left`
          : `${selectedProduct.name} is already fully in the cart`
      )
      return
    }
        const qty = qtyNum

    setCart((prev) => {
      // Same product at the same tier is the same line — adding again bumps the
      // quantity rather than creating a duplicate the cashier has to reconcile.
      const idx = prev.findIndex(
        (c) => c.product_id === selectedProduct.id && c.price_tier === selectedTier
      )
      if (idx === -1) {
        return [...prev, {
          product_id: selectedProduct.id,
          name: selectedProduct.name,
          category: selectedProduct.category,
          unit: selectedProduct.unit,
          quantity: qty,
          unit_price: selectedPrice,
          price_tier: selectedTier,
        }]
      }
      const next = [...prev]
      next[idx] = { ...next[idx], quantity: next[idx].quantity + qty }
      return next
    })
    clearSelection()
  }

  function removeCartItem(index) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function updateCartQty(index, nextQty) {
    const item = cart[index]
    if (nextQty < 1) return removeCartItem(index)

    // Stock check excludes this line's own quantity, or editing would compare
    // against a total that already includes what we're replacing.
    const product = products.find((p) => p.id === item.product_id)
    if (product) {
      const otherLines = cart.reduce(
        (s, c, i) => (i !== index && c.product_id === item.product_id ? s + c.quantity : s),
        0
      )
      if (otherLines + nextQty > product.current_stock) {
        toast.error(`Only ${product.current_stock - otherLines} ${product.unit || 'units'} of ${item.name} left`)
        return
      }
    }

    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, quantity: nextQty } : c)))
  }

  function addPaymentLine() {
    if (availableMethods.length === 0) {
      toast.error('All payment methods are already added')
      return
    }
    const outstanding = Math.max(0, cartTotal - totalPaid)
    setPaymentLines((prev) => [
      ...prev,
      {
        uid: nextUid,
        method: availableMethods[0],
        amount: outstanding > 0 ? String(outstanding) : '',
        reference: '',
        touched: false,
      },
    ])
    setNextUid((n) => n + 1)
  }

  function removePaymentLine(uid) {
    setPaymentLines((prev) => prev.filter((p) => p.uid !== uid))
  }

  function updatePaymentLine(uid, updates) {
    // Any manual amount edit pins the line — the auto-fill effect leaves it alone.
    const patch = 'amount' in updates ? { ...updates, touched: true } : updates
    setPaymentLines((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)))
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
    if (shortfall > 0) {
      toast.error(`Payments must cover the full total. Remaining: ${formatMoney(shortfall)}`)
      return
    }
    if (invalidOverpay) {
      toast.error('M-Pesa and credit amounts must be exact — only cash can be over-tendered')
      return
    }
    if (hasCredit && (!customerPhone.trim() || customerName === 'Walk-in Customer')) {
      toast.error('Credit sales require a customer name and phone')
      return
    }
    if (noLimitSet) {
      toast.error(`${selectedCustomer.name} has no credit limit — an admin must approve one first`)
      return
    }
    if (overLimit) {
      toast.error(`Credit limit exceeded — only ${formatMoney(custHeadroom)} available`)
      return
    }

    // ── Build a schema-safe payload ─────────────────────────────────────
    const payload = {
      customer_name: customerName.trim() || undefined,  // let Zod apply 'Walk-in Customer' default
      customer_phone: hasCredit ? customerPhone.trim() : null,
      discount_amount: disc,
      discount_reason: disc > 0 ? discountReason.trim() : null,
      payments: (() => {
        const lines = paymentLines.map((p) => ({
          method: p.method,
          amount: Math.max(0, Math.round(Number(p.amount) || 0)),
          reference: p.reference?.trim() || null,
        }))
        if (change > 0) lines[0].amount -= change
        return lines
      })(),
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

                            {showCustomerDropdown && (
                <div className="absolute z-30 mt-1 w-full bg-white dark:bg-[#1e293b] rounded-lg border border-gray-200 dark:border-gray-700/60 shadow-xl max-h-60 overflow-y-auto">
                  {!customerSearchQuery.trim() && customers.length > 0 && (
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 dark:border-gray-700/40">
                      Recent customers
                    </p>
                  )}
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
                      {customerSearchQuery.trim()
                        ? 'No match. Keep typing to create a new customer.'
                        : 'No customers yet. Type a name to create one.'}
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
                      <div className="text-right shrink-0">
                        {c.balance > 0 ? (
                          <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 tabular-nums">
                            owes {formatMoney(c.balance)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">no debt</p>
                        )}
                        <p className="text-[10px] text-gray-400 tabular-nums">
                          {formatMoney(c.headroom)} available
                        </p>
                      </div>
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

              {selectedCustomer && custBalance > 0 && (
                <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <Icon name="alert" size={12} />
                      Outstanding debt
                    </span>
                    <span className="text-[13px] font-bold text-red-700 dark:text-red-400 tabular-nums">
                      {formatMoney(custBalance)}
                    </span>
                  </div>
                  <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 tabular-nums">
                    Limit {formatMoney(custLimit)} · {formatMoney(custHeadroom)} still available
                  </p>
                </div>
              )}

              {selectedCustomer && custBalance === 0 && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  No outstanding debt · {formatMoney(custHeadroom)} credit available
                </p>
              )}
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
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          setQuantity('')
                        } else {
                          const num = parseInt(val, 10)
                          if (!isNaN(num)) {
                            setQuantity(String(num))
                          }
                        }
                      }}
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
                      disabled={!selectedTier || (parseInt(quantity, 10) || 0) < 1}
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
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                          {formatMoney(item.unit_price)} ×
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(i, item.quantity - 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40"
                        >
                          −
                        </button>
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(i, item.quantity + 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40"
                        >
                          +
                        </button>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{item.unit || ''}</span>
                      </div>
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
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setDiscountAmount('')
                      } else {
                        setDiscountAmount(String(Math.max(0, Math.min(cartSubtotal, Number(val) || 0))))
                      }
                    }} placeholder="0"
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
                    invalidOverpay
                      ? 'text-red-600 dark:text-red-400'
                      : change > 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : isBalanced
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400',
                  ].join(' ')}
                >
                  {invalidOverpay
                    ? `Over by ${formatMoney(overpaid)} — split payments must add up exactly`
                    : change > 0
                      ? `Change due: ${formatMoney(change)}`
                      : isBalanced
                        ? 'Fully paid'
                        : `Remaining: ${formatMoney(shortfall)}`}
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
                      type="text"
                      inputMode="numeric"
                      value={line.amount}
                      onChange={(e) =>
                        updatePaymentLine(line.uid, { amount: e.target.value.replace(/[^\d]/g, '') })
                      }
                      placeholder="Amount"
                      className="flex-1 h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 tabular-nums"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        updatePaymentLine(line.uid, {
                          amount: String(Math.max(0, (parseInt(line.amount) || 0) + remaining)),
                        })
                      }
                      disabled={remaining === 0}
                      title="Put the outstanding balance on this line"
                      className="px-2 h-9 shrink-0 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Rest
                    </button>

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

            {hasCredit && (overLimit || noLimitSet) && (
              <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30">
                <p className="text-[11px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                  <Icon name="alert" size={12} />
                  {noLimitSet
                    ? `${selectedCustomer.name} has no credit limit — an admin must approve one first`
                    : `Credit limit exceeded — only ${formatMoney(custHeadroom)} available, ${formatMoney(creditPortion)} requested`}
                </p>
              </div>
            )}

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
              disabled={loading || !cart.length || !isBalanced || hasEmptyMethod || invalidOverpay || overLimit || noLimitSet} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
  @media print {
    @page { size: 80mm auto; margin: 0; }

    body * { visibility: hidden !important; }
    #receipt-print, #receipt-print * { visibility: visible !important; }

    #receipt-wrapper {
      position: static !important;
      width: 80mm !important;
      max-width: 80mm !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      background: white !important;
    }

    #receipt-print {
      position: absolute !important;
      left: 4mm !important;           /* centers 72 mm inside 80 mm page */
      top: 0 !important;
      width: 72mm !important;         /* fits inside 72.1 mm printable area */
      max-width: 72mm !important;
      padding: 1mm 2mm !important;    /* internal breathing room */
      box-sizing: border-box !important;
      transform: none !important;
      margin: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      background: white !important;
      color: black !important;
    }

    .no-print { display: none !important; }
  }
`}} />

      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          id="receipt-wrapper"
          className="relative bg-white text-black w-80 max-h-[90vh] overflow-y-auto rounded-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div id="receipt-print" className="p-6">
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
    </>
  )
}