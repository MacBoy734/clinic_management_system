'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonTable, Spinner,
  formatMoney, formatDate, formatDateTime, cap, badgeClass,
} from '@/utils/helpers'
import ReturnModal from '@/components/pharmacy/ReturnModal'

// ─── Constants ───────────────────────────────────────────────────────────────

const DATE_RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
]

const VISIT_TYPE_BADGES = {
  consultation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  injection: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  family_planning: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  direct_lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const VISIT_TYPE_LABELS = {
  consultation: 'Consultation',
  injection: 'Procedure',
  family_planning: 'Family Planning',
  direct_lab: 'Direct Lab',
}

const BILLED_BUCKETS = [
  { key: 'consultation', label: 'Consultation', color: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', track: 'bg-blue-100 dark:bg-blue-900/40', extract: (b) => Number(b?.consultation ?? 0) },
  { key: 'procedures', label: 'Procedures', color: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400', track: 'bg-orange-100 dark:bg-orange-900/40', extract: (b) => Number(b?.procedures ?? 0) },
  { key: 'lab', label: 'Lab', color: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-400', track: 'bg-purple-100 dark:bg-purple-900/40', extract: (b) => Number(b?.lab ?? 0) },
  { key: 'medication', label: 'Medication', color: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', track: 'bg-emerald-100 dark:bg-emerald-900/40', extract: (b) => Number(b?.medication ?? 0) },
]

const PHARMACY_REVENUE_BUCKETS = [
  { key: 'till', label: 'Till (at sale)', color: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', track: 'bg-emerald-100 dark:bg-emerald-900/40', extract: (rev) => Number(rev?.till ?? 0) },
  { key: 'debt_collected', label: 'Debt Collected', color: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', track: 'bg-blue-100 dark:bg-blue-900/40', extract: (rev) => Number(rev?.debt_collected ?? 0) },
]

const PAYMENT_METHOD_BUCKETS = [
  { key: 'cash', label: 'Cash', color: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', track: 'bg-emerald-100 dark:bg-emerald-900/40' },
  { key: 'mpesa', label: 'M-Pesa', color: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', track: 'bg-blue-100 dark:bg-blue-900/40' },
  { key: 'insurance', label: 'Insurance', color: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-400', track: 'bg-purple-100 dark:bg-purple-900/40' },
  { key: 'other', label: 'Other', color: 'bg-gray-500', text: 'text-gray-700 dark:text-gray-300', track: 'bg-gray-100 dark:bg-gray-700/40' },
]

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'mpesa', label: 'M-Pesa' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'credit', label: 'Credit' },
  { key: 'other', label: 'Other' },
]

// ─── Add this with the other constants near the top of the file ─────────────

const EXPENSE_BUCKETS = [
  {
    key: 'reception',
    label: 'Clinic / Reception',
    color: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
    track: 'bg-blue-100 dark:bg-blue-900/40',
  },
  {
    key: 'pharmacy',
    label: 'Pharmacy',
    color: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    track: 'bg-emerald-100 dark:bg-emerald-900/40',
  },
  {
    key: 'referrals',
    label: 'Referrals commissions',
    color: 'bg-purple-500',
    text: 'text-purple-700 dark:text-purple-400',
    track: 'bg-purple-100 dark:bg-purple-900/40',
  },
]

// ─── Shared UI helpers (continued) ───────────────────────────────────────────

function StatTile({ label, value, icon, color = 'blue', sublabel }) {
  const colors = {
    blue: { card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50', val: 'text-blue-700 dark:text-blue-400', ic: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
    green: { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', val: 'text-emerald-700 dark:text-emerald-400', ic: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
    emerald: { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', val: 'text-emerald-700 dark:text-emerald-400', ic: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
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

function ActionButton({ icon, label, title, onClick, variant = 'default' }) {
  const variants = {
    default: 'border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40',
    success: 'border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
    warn: 'border-fuchsia-200 dark:border-fuchsia-900/50 text-fuchsia-700 dark:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/30',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`px-2 py-1.5 rounded-md text-[11px] font-medium border inline-flex items-center gap-1 ${variants[variant] || variants.default}`}
    >
      <Icon name={icon} size={12} /> {label}
    </button>
  )
}

function Pagination({ page, pages, onPage }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700/60">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{pages}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &lsaquo; Prev
        </button>
        <button
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page === pages}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next &rsaquo;
        </button>
      </div>
    </div>
  )
}

const EXPENSE_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'Week' },
  { key: 'this_month', label: 'Month' },
  { key: 'last_30_days', label: '30d' },
  { key: 'this_year', label: 'Year' },
]

const BILLING_PER_PAGE = 10
const OUTSTANDING_PER_PAGE = 10
const EXPENSES_PER_PAGE = 10
const SALES_PER_PAGE = 10

// ─── Date helpers ───────────────────────────────────────────────────────────

function formatLocalDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function presetToRange(key, custom = { from: '', to: '' }) {
  if (key === 'custom') return { from: custom.from || '', to: custom.to || '' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const toStr = formatLocalDate(today)
  if (key === 'today') return { from: toStr, to: toStr }
  if (key === '7d' || key === '30d') {
    const d = new Date(today)
    d.setDate(d.getDate() - (key === '7d' ? 6 : 29))
    return { from: formatLocalDate(d), to: toStr }
  }
  if (key === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: formatLocalDate(d), to: toStr }
  }
  return { from: toStr, to: toStr }
}

function buildQuery(params) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  })
  const str = qs.toString()
  return str ? `?${str}` : ''
}

// ─── Shared Refresh Button ───────────────────────────────────────────────────

function RefreshButton({ isFetching, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={isFetching}
      className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60 transition-colors"
    >
      <Icon name="refresh" size={13} className={isFetching ? 'animate-spin' : ''} />
      {isFetching ? 'Refreshing…' : 'Refresh'}
    </button>
  )
}

// ─── Date Range Filter UI ───────────────────────────────────────────────────

function DateRangeFilter({ value, onChange }) {
  const setPreset = (key) => {
    if (key === 'custom') {
      const current = presetToRange(value.range, { from: value.from, to: value.to })
      onChange({ range: 'custom', from: current.from, to: current.to })
    } else {
      const r = presetToRange(key)
      onChange({ range: key, from: r.from, to: r.to })
    }
  }

  return (
    <div className="inline-flex items-center gap-2 shrink-0 flex-wrap">
      <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
        {DATE_RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={[
              'px-2.5 py-1 text-[11px] font-medium transition-colors',
              value.range === p.key
                ? 'bg-[#1a6cbf] text-white'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.range === 'custom' && (
        <div className="inline-flex items-center gap-1.5">
          <input
            type="date"
            value={value.from || ''}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200"
          />
          <span className="text-[11px] text-gray-400">&rarr;</span>
          <input
            type="date"
            value={value.to || ''}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200"
          />
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN TAB
// ═════════════════════════════════════════════════════════════════════════════

export default function FinanceTab() {
  const [sub, setSub] = useState('overview')

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'pieChart' },
    { key: 'clinic', label: 'Clinic', icon: 'building' },
    { key: 'pharmacy', label: 'Pharmacy', icon: 'pillBottle' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
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

      {sub === 'overview' && <OverviewTab />}
      {sub === 'clinic' && <ClinicTab />}
      {sub === 'pharmacy' && <PharmacyTab />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab() {
  const [range, setRange] = useState(() => {
    const r = presetToRange('today')
    return { range: 'today', from: r.from, to: r.to }
  })

  const qs = buildQuery({ from: range.from, to: range.to })

  const enabled = Boolean(range.from && range.to)

  const clinicQ = useQuery({
    queryKey: ['admin', 'overview', 'finance-overview', range.from, range.to],
    queryFn: () => api.get(`/api/admin/finance-overview${qs}`),
    staleTime: 30000,
    enabled,
  })

  const pharmacyQ = useQuery({
    queryKey: ['admin', 'overview', 'pharmacy-finance-overview', range.from, range.to],
    queryFn: () => api.get(`/api/admin/pharmacy/finance-overview${qs}`),
    staleTime: 30000,
    enabled,
  })

  const isLoading = clinicQ.isLoading || pharmacyQ.isLoading
  const isError = clinicQ.isError || pharmacyQ.isError
  const error = clinicQ.error || pharmacyQ.error

  const clinicRev = Number(clinicQ.data?.revenue?.total ?? 0)
  const clinicExp = Number(clinicQ.data?.expenses?.total ?? 0)
  const pharmacyRev = Number(pharmacyQ.data?.revenue?.total ?? 0)
  const pharmacyExp = Number(pharmacyQ.data?.expenses?.total ?? 0)
  const totalRevenue = clinicRev + pharmacyRev
  const totalExpenses = clinicExp + pharmacyExp
  const net = totalRevenue - totalExpenses


  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="Business Overview"
          subtitle="Combined clinic & pharmacy performance"
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangeFilter value={range} onChange={setRange} />
              <RefreshButton isFetching={clinicQ.isFetching || pharmacyQ.isFetching} onClick={() => { clinicQ.refetch(); pharmacyQ.refetch() }} />
            </div>
          }
        />
        {isLoading ? (
          <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : isError ? (
          <ErrorState message={error?.message || 'Could not load overview'} onRetry={() => { clinicQ.refetch(); pharmacyQ.refetch() }} />
        ) : (<div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Cash Collected" value={formatMoney(totalRevenue)} icon="dollarSign" color="emerald" sublabel="Clinic + pharmacy" />
            <StatTile label="Clinic" value={formatMoney(clinicRev)} icon="building" color="blue" sublabel="Consultations, lab, procedures" />
            <StatTile label="Pharmacy" value={formatMoney(pharmacyRev)} icon="pillBottle" color="purple" sublabel="Till + debt repayments" />
            <StatTile
              label="Net"
              value={formatMoney(net)}
              icon="trendUp"
              color={net >= 0 ? 'emerald' : 'red'}
              sublabel={`After ${formatMoney(totalExpenses)} operating expenses — excludes cost of goods`}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Collections Split</p>
              <div className="space-y-2">
                <OverviewSplitBar label="Clinic" amount={clinicRev} total={totalRevenue} color="bg-blue-500" text="text-blue-700 dark:text-blue-400" />
                <OverviewSplitBar label="Pharmacy" amount={pharmacyRev} total={totalRevenue} color="bg-purple-500" text="text-purple-700 dark:text-purple-400" />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Expense Split</p>
              <div className="space-y-2">
                <OverviewSplitBar label="Clinic" amount={clinicExp} total={totalExpenses} color="bg-blue-500" text="text-blue-700 dark:text-blue-400" />
                <OverviewSplitBar label="Pharmacy" amount={pharmacyExp} total={totalExpenses} color="bg-emerald-500" text="text-emerald-700 dark:text-emerald-400" />
              </div>
            </div>
          </div>
        </div>
        )}
      </Card>
    </div>
  )
}

function OverviewSplitBar({ label, amount, total, color, text }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-gray-600 dark:text-gray-300">{label}</span>
        <span className={`tabular-nums font-medium ${text}`}>{formatMoney(amount)} &middot; {pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700/40">
        <div className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CLINIC TAB
// ═════════════════════════════════════════════════════════════════════════════

function ClinicTab() {
  const [sub, setSub] = useState('billing')

  return (
    <div className="space-y-4">
      <ClinicFinanceOverviewCard />
      <ClinicOutstandingCard />

      <div className="pt-2 flex items-center gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Detailed Records</p>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700/60" />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { key: 'billing', label: 'Billing', icon: 'receipt' },
          { key: 'expenses', label: 'Expenses', icon: 'trendDown' },
        ].map((t) => (
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

      {sub === 'billing' && <BillingSubTab />}
      {sub === 'expenses' && <ClinicExpensesSubTab />}
    </div>
  )
}

function ClinicFinanceOverviewCard() {
  const [range, setRange] = useState(() => {
    const r = presetToRange('today')
    return { range: 'today', from: r.from, to: r.to }
  })

  const qs = buildQuery({ from: range.from, to: range.to })

  const q = useQuery({
    queryKey: ['admin', 'finance-overview', range.from, range.to],
    queryFn: () => api.get(`/api/admin/finance-overview${qs}`),
    staleTime: 30000,
    enabled: Boolean(range.from && range.to),
  })

  const billed = q.data?.billed || {}
  const totalBilled = Number(billed.total ?? 0)
  const totalDiscount = Number(billed.discounts ?? 0)
  const totalCollected = Number(q.data?.revenue?.total ?? 0)
  const outstanding = Number(q.data?.outstanding?.total ?? 0)
  const asOf = q.data?.outstanding?.as_of ?? null
  const days = Number(q.data?.days_in_range ?? 0) || 1
  const byPaymentMethod = q.data?.by_payment_method || {}
  const exp = q.data?.expenses || {}
  const byDept = exp.by_department || {}
  const totalExpenses = Number(exp.total ?? 0)
  const net = Number(q.data?.net ?? 0)

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Clinic Finance"
        subtitle="Revenue, expenses & collections"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <RefreshButton isFetching={q.isFetching} onClick={() => q.refetch()} />
          </div>
        }
      />
      {q.isLoading ? (
        <FinanceOverviewSkeleton />
      ) : q.isError ? (
        <ErrorState message={q.error?.message || 'Could not load overview'} onRetry={q.refetch} />
      ) : (
        <FinanceOverviewBody
          range={range}
          days={days}
          billed={billed}
          totalBilled={totalBilled}
          totalDiscount={totalDiscount}
          totalCollected={totalCollected}
          outstanding={outstanding}
          asOf={asOf}
          totalExpenses={totalExpenses}
          byDepartment={byDept}
          byPaymentMethod={byPaymentMethod}
          net={net}
        />
      )}
    </Card>
  )
}

function ClinicOutstandingCard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [range, setRange] = useState(() => {
    const r = presetToRange('today')
    return { range: 'today', from: r.from, to: r.to }
  })
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to])

  const qs = buildQuery({ from: range.from, to: range.to, page, limit: OUTSTANDING_PER_PAGE, source: 'clinic' })
  const queryKey = ['admin', 'outstanding-balances', 'clinic', range.from, range.to, page]

  const q = useQuery({
    queryKey,
    queryFn: () => api.get(`/api/admin/outstanding-balances${qs}`),
    staleTime: 30000,
  })

  const mut = useMutation({
    mutationFn: ({ entityId, source, body }) =>
      api.patch(`/api/admin/outstanding-balances/${entityId}`, { ...body, source }),
    onMutate: async ({ entityId, source, body }) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old) => {
        if (!old || !Array.isArray(old.outstanding)) return old
        const updated = old.outstanding.map((r) => {
          if (r.entity_id !== entityId || r.source !== source) return r
          if (body.action === 'settle') {
            const amt = Number(body.amount) || 0
            const newPaid = (r.paid_amount || 0) + amt
            const newBalance = Math.max(0, (r.total_bill || 0) - newPaid - (r.waived_amount || 0))
            return { ...r, paid_amount: newPaid, balance: newBalance }
          }
          if (body.action === 'waive') {
            const remaining = Math.max(0, (r.total_bill || 0) - (r.paid_amount || 0) - (r.waived_amount || 0))
            const amt = body.amount ? Math.min(Number(body.amount), remaining) : remaining
            const newWaived = (r.waived_amount || 0) + amt
            return { ...r, waived_amount: newWaived, balance: Math.max(0, (r.total_bill || 0) - (r.paid_amount || 0) - newWaived) }
          }
          return r
        })
        const prior = old.outstanding.find((r) => r.entity_id === entityId && r.source === source)
        const next = updated.find((r) => r.entity_id === entityId && r.source === source)
        const delta = (prior?.balance || 0) - (next?.balance || 0)
        const filtered = updated.filter((r) => r.balance > 0)
        const removed = updated.length - filtered.length

        return {
          ...old,
          outstanding: filtered,
          count: Math.max(0, (old.count || 0) - removed),
          total_outstanding: Math.max(0, (old.total_outstanding || 0) - delta),
        }
      })
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
      toast.error(err.message || 'Could not update outstanding balance')
    },
    onSuccess: (_data, vars) => {
      const labels = { settle: 'Payment collected', waive: 'Balance waived' }
      toast.success(labels[vars.body.action] || 'Updated')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'outstanding-balances'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'finance-overview'] })
    },
  })

  const pages = q.data?.pages || 1
  const curPage = q.data?.page || page

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Outstanding Balances"
        subtitle="Clinic bills with pending payment"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <RefreshButton isFetching={q.isFetching} onClick={() => q.refetch()} />
          </div>
        }
      />
      {q.isLoading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : q.isError ? (
        <ErrorState message={q.error?.message || 'Could not load outstanding balances'} onRetry={q.refetch} />
      ) : (
        <OutstandingBody
          data={q.data}
          page={curPage}
          pages={pages}
          onPage={setPage}
          onAction={(row, action) => setModal({ row, action })}
        />
      )}
      {modal && (
        <FollowUpModal
          row={modal.row}
          action={modal.action}
          loading={mut.isPending}
          onClose={() => setModal(null)}
          onSubmit={async (body) => {
            try {
              await mut.mutateAsync({
                entityId: modal.row.entity_id,
                source: modal.row.source,
                body,
              })
              setModal(null)
            } catch {
              /* toast handled by mutation */
            }
          }}
        />
      )}
    </Card>
  )
}

function ClinicExpensesSubTab() {
  return (
    <div className="space-y-4">
      <DepartmentExpensesCard domain="clinic" title="Clinic Expenses" color="blue" />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// PHARMACY TAB
// ═════════════════════════════════════════════════════════════════════════════

function PharmacyTab() {
  const [sub, setSub] = useState('sales')

  return (
    <div className="space-y-4">
      <PharmacyFinanceOverviewCard />
      <PharmacyDebtBookCard />

      <div className="pt-2 flex items-center gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Detailed Records</p>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700/60" />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { key: 'sales', label: 'Sales', icon: 'receipt' },
          { key: 'expenses', label: 'Expenses', icon: 'trendDown' },
        ].map((t) => (
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

      {sub === 'sales' && <PharmacySalesSubTab />}
      {sub === 'expenses' && <PharmacyExpensesSubTab />}
    </div>
  )
}

function PharmacyFinanceOverviewCard() {
  const [range, setRange] = useState(() => {
    const r = presetToRange('today')
    return { range: 'today', from: r.from, to: r.to }
  })

  const qs = buildQuery({ from: range.from, to: range.to })

  const q = useQuery({
    queryKey: ['admin', 'pharmacy-finance-overview', range.from, range.to],
    queryFn: () => api.get(`/api/admin/pharmacy/finance-overview${qs}`),
    staleTime: 30000,
    enabled: Boolean(range.from && range.to)
  })

  const rev = q.data?.revenue || {}
  const totalRevenue = Number(rev.total ?? 0)
  const sales = q.data?.sales || {}
  const totalSales = Number(sales.total ?? 0)
  const creditExtended = Number(sales.credit_extended ?? 0)
  const salesDiscounts = Number(sales.discounts ?? 0)
  const refunded = Number(rev.refunded ?? 0)
  const netSales = Number(sales.net_sales ?? totalSales)
  const days = Number(q.data?.days_in_range ?? 0) || 1
  const byPaymentMethod = q.data?.by_payment_method || {}
  const exp = q.data?.expenses || {}
  const byCategory = exp.by_category || {}
  const totalExpenses = Number(exp.total ?? 0)
  const net = Number(q.data?.net ?? 0)
  const outstanding = q.data?.outstanding || {}

  const revBuckets = PHARMACY_REVENUE_BUCKETS.map((b) => ({ ...b, amount: b.extract(rev) }))
  const pmBuckets = PAYMENT_METHOD_BUCKETS.map((b) => ({ ...b, amount: Number(byPaymentMethod[b.key] ?? 0) }))
  const totalByMethod = pmBuckets.reduce((s, b) => s + b.amount, 0)

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Pharmacy Finance"
        subtitle="OTC sales, credit & pharmacy expenses"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <RefreshButton isFetching={q.isFetching} onClick={() => q.refetch()} />
          </div>
        }
      />
      {q.isLoading ? (
        <FinanceOverviewSkeleton />
      ) : q.isError ? (
        <ErrorState message={q.error?.message || 'Could not load pharmacy overview'} onRetry={q.refetch} />
      ) : (
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] uppercase tracking-widest text-gray-400">
              Period &middot; {range.from || '—'} &rarr; {range.to || '—'} &middot; {days} day{days === 1 ? '' : 's'}
            </p>
            <p className="text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
              Net: <span className={net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{formatMoney(net)}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Revenue */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Cash Collected</p>
                <p className="text-[10px] text-gray-400">avg {formatMoney(days > 0 ? totalRevenue / days : 0)}/day</p>
              </div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-[24px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoney(totalRevenue)}
                </p>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
                  {formatMoney(totalSales)} sold
                  {netSales !== totalSales && ` · ${formatMoney(netSales)} net of returns`}
                </p>
              </div>
              {totalRevenue === 0 ? (
                <p className="text-[11px] text-gray-400">No cash collected in this period.</p>
              ) : (
                <div className="space-y-2.5">
                  {revBuckets.map((b) => {
                    const pct = totalRevenue > 0 ? (b.amount / totalRevenue) * 100 : 0
                    return (
                      <div key={b.key}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                            <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                            {b.label}
                          </span>
                          <span className={`tabular-nums font-medium ${b.text}`}>
                            {formatMoney(b.amount)} &middot; {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${b.track}`}>
                          <div className={`${b.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="pt-1 space-y-1">
                {creditExtended > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatMoney(creditExtended)} sold on credit this period — not yet collected
                  </p>
                )}
                {salesDiscounts > 0 && (
                  <p className="text-[11px] text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">
                    −{formatMoney(salesDiscounts)} in discounts
                  </p>
                )}
                {refunded > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                    −{formatMoney(refunded)} refunded to customers this period
                  </p>
                )}
              </div>

              {/* Receivable position — a running balance, not a period figure */}
              <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-amber-800 dark:text-amber-300 font-medium">Total Debt Owed</span>
                  <span className="tabular-nums font-bold text-amber-700 dark:text-amber-400">{formatMoney(outstanding.balance ?? 0)}</span>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  {formatMoney(outstanding.total_credit ?? 0)} extended all-time · {formatMoney(outstanding.total_collected ?? 0)} repaid
                </p>
              </div>
            </div>

            {/* Expenses */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Expenses</p>
                <p className="text-[10px] text-gray-400">{Object.keys(byCategory).length} categor{Object.keys(byCategory).length === 1 ? 'y' : 'ies'}</p>
              </div>
              <p className="text-[24px] font-extrabold tabular-nums text-red-600 dark:text-red-400">
                &minus;{formatMoney(totalExpenses)}
              </p>
              {totalExpenses === 0 ? (
                <p className="text-[11px] text-gray-400">No pharmacy expenses recorded.</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(byCategory).map(([cat, amt]) => {
                    const pct = totalExpenses > 0 ? (Number(amt) / totalExpenses) * 100 : 0
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                            <span className="w-2 h-2 rounded-sm bg-gray-400" />
                            {cap(cat)}
                          </span>
                          <span className="tabular-nums font-medium text-gray-600 dark:text-gray-300">
                            &minus;{formatMoney(amt)} &middot; {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700/40">
                          <div className="bg-gray-400 h-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700/60">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Revenue by Payment Method</p>
              <p className="text-[10px] text-gray-400">{formatMoney(totalByMethod)} at the till</p>
            </div>
            {totalByMethod === 0 ? (
              <p className="text-[11px] text-gray-400">No payments collected in this period.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {pmBuckets.map((b) => {
                  const pct = totalByMethod > 0 ? (b.amount / totalByMethod) * 100 : 0
                  return (
                    <div key={b.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                          <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                          {b.label}
                        </span>
                        <span className={`tabular-nums font-medium ${b.text}`}>{pct.toFixed(0)}%</span>
                      </div>
                      <p className={`text-[15px] font-bold tabular-nums ${b.text}`}>{formatMoney(b.amount)}</p>
                      <div className={`h-1.5 rounded-full overflow-hidden ${b.track}`}>
                        <div className={`${b.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function PharmacyDebtBookCard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [modal, setModal] = useState(null)

  const q = useQuery({
    queryKey: ['admin', 'pharmacy-debt-book'],
    queryFn: () => api.get('/api/admin/pharmacy/debt-book'),
    staleTime: 30000,
  })

  const mut = useMutation({
    mutationFn: (body) => api.post('/api/admin/pharmacy/customer-payments', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-debt-book'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-finance-overview'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-sales'] })
      toast.success('Payment recorded')
    },
    onError: (e) => toast.error(e.message || 'Could not record payment'),
  })

  const debtors = Array.isArray(q.data?.debtors) ? q.data.debtors : []
  const stats = q.data?.stats || { count: 0, total_outstanding: 0 }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Debt Book"
        subtitle="Pharmacy customers with outstanding credit"
        action={<RefreshButton isFetching={q.isFetching} onClick={() => q.refetch()} />}
      />
      {q.isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : q.isError ? (
        <ErrorState message={q.error?.message || 'Could not load debt book'} onRetry={q.refetch} />
      ) : debtors.length === 0 ? (
        <EmptyState icon="checkCircle" title="All debts settled" description="No pharmacy customers currently owe money." />
      ) : (
        <div>
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-amber-50/60 dark:bg-amber-950/10 flex items-center gap-2">
            <Icon name="alert" size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
            <p className="text-[12px] text-amber-800 dark:text-amber-300">
              <span className="font-semibold tabular-nums">{formatMoney(stats.total_outstanding ?? 0)}</span> outstanding &middot;{' '}
              <span className="font-semibold">{stats.count}</span> customer{stats.count === 1 ? '' : 's'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Customer</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Phone</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total Credit</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Paid</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {debtors.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{d.name}</p>
                      <p className="text-[10px] text-gray-400">#{d.id}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[12px] text-gray-600 dark:text-gray-300">{d.phone || '—'}</td>
                    <td className="px-4 py-3 text-right text-[12px] text-gray-700 dark:text-gray-200 tabular-nums">{formatMoney(d.total_credit)}</td>
                    <td className="px-4 py-3 text-right text-[12px] text-emerald-700 dark:text-emerald-400 tabular-nums hidden md:table-cell">{formatMoney(d.total_paid)}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-bold text-red-600 dark:text-red-400 tabular-nums">{formatMoney(d.balance)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton icon="dollarSign" label="Settle" title="Collect payment" onClick={() => setModal(d)} variant="success" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <PharmacyDebtModal
          customer={modal}
          loading={mut.isPending}
          onClose={() => setModal(null)}
          onSubmit={async (body) => {
            try {
              await mut.mutateAsync(body)
              setModal(null)
            } catch {
              /* toast handled by mutation */
            }
          }}
        />
      )}
    </Card>
  )
}

function PharmacySalesSubTab() {
  const [range, setRange] = useState(() => {
    const r = presetToRange('today')
    return { range: 'today', from: r.from, to: r.to }
  })
  const [page, setPage] = useState(1)
  const [method, setMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [returnSale, setReturnSale] = useState(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to, method, search])

  const qs = buildQuery({
    from: range.from,
    to: range.to,
    page,
    limit: SALES_PER_PAGE,
    payment_method: method !== 'all' ? method : undefined,
    search: search.trim() || undefined,
  })

  const q = useQuery({
    queryKey: ['admin', 'pharmacy-sales', range.from, range.to, page, method, search],
    queryFn: () => api.get(`/api/admin/pharmacy/sales${qs}`),
    staleTime: 15000,
  })



  const sales = Array.isArray(q.data?.sales) ? q.data.sales : []
  const pages = q.data?.pages || 1
  const curPage = q.data?.page || page

  const returnMutation = useMutation({
    mutationFn: ({ saleId, body }) => api.post(`/api/pharmacy/otc-sales/${saleId}/return`, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-sales'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-finance-overview'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-debt-book'] })
      const parts = []
      if (res.return.cash_refund_amount > 0) parts.push(`${formatMoney(res.return.cash_refund_amount)} cash`)
      if (res.return.credit_note_amount > 0) parts.push(`${formatMoney(res.return.credit_note_amount)} off their debt`)
      toast.success(`${res.return.return_number} — refund ${parts.join(' + ')}`)
      setReturnSale(null)
    },
    onError: (e) => toast.error(e.message || 'Could not process return'),
  })
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="OTC Sales"
          subtitle={`${q.data?.total || sales.length} sale${q.data?.total === 1 ? '' : 's'}`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangeFilter value={range} onChange={setRange} />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200"
              >
                <option value="all">All Methods</option>
                {PAYMENT_METHODS.filter((m) => m.key !== 'balance').map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search receipt or customer..."
                className="px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 w-40"
              />
              <RefreshButton isFetching={q.isFetching} onClick={() => q.refetch()} />
            </div>
          }
        />
        {q.isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message || 'Could not load sales'} onRetry={q.refetch} />
        ) : sales.length === 0 ? (
          <EmptyState icon="receipt" title="No sales" description="OTC sales will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Receipt</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Customer</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Method</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Date</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{s.receipt_number}</p>
                        {s.returns?.length > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Returned
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400">{s.items?.length || 0} item{s.items?.length === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-gray-900 dark:text-gray-100">{s.customer_name}</p>
                      <p className="text-[10px] text-gray-400">by {s.sold_by || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(s.total)}</p>
                      {s.discount_amount > 0 && (
                        <p className="text-[10px] text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">−{formatMoney(s.discount_amount)} disc</p>
                      )}
                      {s.returns?.length > 0 && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
                          −{formatMoney(s.returns.reduce((t, r) => t + r.refund_amount, 0))} refunded
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                        {(s.methods?.length ? s.methods : [s.payment_method]).map((m) => (
                          <Badge key={m} className={badgeClass(m)}>{cap(m)}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-[12px] text-gray-500 dark:text-gray-400">{formatDateTime(s.sold_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDetail(s)}
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 inline-flex items-center gap-1"
                      >
                        <Icon name="eye" size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={curPage} pages={pages} onPage={setPage} />
      </Card>

      {detail && (
        <PharmacySaleDetailModal
          sale={detail}
          onClose={() => setDetail(null)}
          onReturn={() => { setReturnSale(detail); setDetail(null) }}
        />
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

function PharmacySaleDetailModal({ sale, onClose, onReturn }) {
  const anyReturnable = (sale.items || []).some((i) => (i.returnable_qty ?? i.quantity) > 0)
  // Admins get 7 days; the server enforces the same window.
  const ageDays = Math.floor((Date.now() - new Date(sale.sold_at)) / 86400000)
  const withinWindow = ageDays <= 7

  return (
    <ModalShell
      title={`Receipt ${sale.receipt_number}`}
      subtitle={`${sale.customer_name} · ${formatDateTime(sale.sold_at)}`}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          {anyReturnable && (
            <button
              type="button"
              onClick={onReturn}
              disabled={!withinWindow}
              title={withinWindow ? 'Reverse part or all of this sale' : `This sale is ${ageDays} days old — returns close after 7 days`}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed mr-auto"
            >
              <Icon name="arrowLeft" size={13} /> Process Return
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white">
            Close
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {(sale.methods?.length ? sale.methods : [sale.payment_method]).map((m) => (
            <Badge key={m} className={badgeClass(m)}>{cap(m)}</Badge>
          ))}
          {sale.is_split && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">Split payment</Badge>}
          {sale.discount_amount > 0 && <Badge className="bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">Discounted</Badge>}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Items</p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
            <div className="p-3 space-y-1.5 bg-gray-50 dark:bg-gray-800/30">
              {sale.items?.length === 0 ? (
                <p className="text-[12px] text-gray-400">No items.</p>
              ) : (
                sale.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-600 dark:text-gray-300">{it.name} &times; {it.quantity}</span>
                    <span className="text-gray-700 dark:text-gray-200 tabular-nums">{formatMoney(it.unit_price * it.quantity)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-700/60 space-y-1.5 bg-white dark:bg-[#1e293b]">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-600 dark:text-gray-300">Subtotal</span>
                <span className="tabular-nums">{formatMoney(sale.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-600 dark:text-gray-300">Tax</span>
                <span className="tabular-nums">{formatMoney(sale.tax_total)}</span>
              </div>
              {sale.discount_amount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-fuchsia-600 dark:text-fuchsia-400">Discount</span>
                  <span className="text-fuchsia-700 dark:text-fuchsia-400 tabular-nums">&minus;{formatMoney(sale.discount_amount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[12px] font-semibold">
                <span className="text-gray-700 dark:text-gray-200">Total</span>
                <span className="text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(sale.total)}</span>
              </div>
            </div>
          </div>
          {sale.discount_reason && (
            <p className="text-[10px] text-fuchsia-500 dark:text-fuchsia-400 mt-1">Reason: {sale.discount_reason}</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Payments</p>
          {sale.payments?.length > 0 ? (
            <div className="space-y-2">
              {sale.payments.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-emerald-800 dark:text-emerald-300">{formatMoney(p.amount)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{cap(p.method)}{p.reference ? ` &middot; ${p.reference}` : ''}</p>
                  </div>
                  <span className="text-[11px] text-gray-400">{formatDateTime(p.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-gray-400">No payment records.</p>
          )}
        </div>
        {sale.returns?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Returns</p>
            <div className="space-y-2">
              {sale.returns.map((r) => (
                <div key={r.id} className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">{r.return_number}</p>
                    <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 tabular-nums">−{formatMoney(r.refund_amount)}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {r.reason} · {r.returned_by || 'unknown'} · {formatDateTime(r.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function PharmacyExpensesSubTab() {
  return (
    <div className="space-y-4">
      <DepartmentExpensesCard domain="pharmacy" title="Pharmacy Expenses" color="emerald" />
    </div>
  )
}

function PharmacyDebtModal({ customer, loading, onClose, onSubmit }) {
  const { user } = useAuthStore()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.id) {
      toast.error('You must be logged in')
      return
    }
    const amt = Number(amount)
    if (!Number.isInteger(amt) || amt <= 0) {
      toast.error('Amount must be a positive whole number')
      return
    }
    if (amt > customer.balance) {
      toast.error(`Amount exceeds balance of ${formatMoney(customer.balance)}`)
      return
    }
    await onSubmit({
      customer_id: customer.id,
      amount: amt,
      method,
      reference: reference.trim() || null,
    })
  }

  return (
    <ModalShell
      title="Collect Payment"
      subtitle={`${customer.name} &middot; ${formatMoney(customer.balance)} outstanding`}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="pharmacy-debt-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="check" size={14} />}
            {loading ? 'Saving...' : 'Collect'}
          </button>
        </>
      }
    >
      <form id="pharmacy-debt-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Amount (KSh) *">
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max ${formatMoney(customer.balance)}`}
            className={`${inputCls} tabular-nums`}
            autoFocus
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Outstanding: <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">{formatMoney(customer.balance)}</span>
          </p>
        </Field>
        <Field label="Method *">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {PAYMENT_METHODS.filter((m) => m.key !== 'balance' && m.key !== 'credit').map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Reference" hint="Optional — M-Pesa code, receipt no., etc.">
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. SFJ8LQ3K"
            className={inputCls}
          />
        </Field>
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Icon name="user" size={12} />
          Acting as <span className="font-medium text-gray-600 dark:text-gray-300">{user?.name || 'Admin'}</span>
        </div>
      </form>
    </ModalShell>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ORIGINAL REUSED COMPONENTS (preserved from your file)
// ═════════════════════════════════════════════════════════════════════════════

function FinanceOverviewSkeleton() {
  return (
    <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-40 rounded bg-gray-100 dark:bg-gray-700/40 animate-pulse" />
          <div className="h-8 w-32 rounded bg-gray-100 dark:bg-gray-700/40 animate-pulse" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="space-y-1.5">
              <div className="h-3 w-28 rounded bg-gray-100 dark:bg-gray-700/40 animate-pulse" />
              <div className="h-2 w-full rounded bg-gray-100 dark:bg-gray-700/40 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function FinanceOverviewBody({ range, days, billed, totalBilled, totalDiscount, totalCollected, outstanding, asOf, totalExpenses, byDepartment, byPaymentMethod, net }) {
  const revBuckets = BILLED_BUCKETS.map((b) => ({ ...b, amount: b.extract(billed) }))
  const knownDeptKeys = new Set(EXPENSE_BUCKETS.map((b) => b.key))
  const expBuckets = EXPENSE_BUCKETS.map((b) => ({
    ...b,
    amount: Number(byDepartment[b.key] ?? 0),
  })).filter((b) => b.amount > 0)
  const otherDepts = Object.entries(byDepartment)
    .filter(([k, v]) => !knownDeptKeys.has(k) && Number(v) > 0)
    .map(([k, v]) => ({ key: k, label: cap(k), amount: Number(v) }))

  const avgPerDay = days > 0 ? totalCollected / days : 0

  const pmBuckets = PAYMENT_METHOD_BUCKETS.map((b) => ({
    ...b,
    amount: Number(byPaymentMethod[b.key] ?? 0),
  }))
  const totalByMethod = pmBuckets.reduce((s, b) => s + b.amount, 0)

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest text-gray-400">
          Period &middot; {range.from || '—'} &rarr; {range.to || '—'} &middot; {days} day{days === 1 ? '' : 's'}
        </p>
        <p className="text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
          Net: <span className={net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{formatMoney(net)}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Revenue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Billed &amp; Collected</p>
            <p className="text-[10px] text-gray-400">avg {formatMoney(avgPerDay)}/day collected</p>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-[24px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(totalCollected)}
            </p>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
              collected of {formatMoney(totalBilled)} billed
            </p>
          </div>
          {totalBilled === 0 ? (
            <p className="text-[11px] text-gray-400">Nothing billed in this period.</p>
          ) : (
            <div className="space-y-2.5">
              {revBuckets.map((b) => {
                const pct = totalBilled > 0 ? (b.amount / totalBilled) * 100 : 0
                return (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                        {b.label}
                      </span>
                      <span className={`tabular-nums font-medium ${b.text}`}>
                        {formatMoney(b.amount)} &middot; {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${b.track}`}>
                      <div className={`${b.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {totalDiscount > 0 && (
                <p className="text-[11px] text-fuchsia-600 dark:text-fuchsia-400 tabular-nums pt-1">
                  &minus;{formatMoney(totalDiscount)} in discounts (excluded from billed)
                </p>
              )}
            </div>
          )}

          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-amber-800 dark:text-amber-300 font-medium">Outstanding</span>
              <span className="tabular-nums font-bold text-amber-700 dark:text-amber-400">{formatMoney(outstanding)}</span>
            </div>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
              All unsettled bills as of {asOf ? formatDate(asOf) : '—'}, not just this period
            </p>
          </div>
        </div>

        {/* Expenses */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Expenses</p>
            <p className="text-[10px] text-gray-400">{expBuckets.length + otherDepts.length} dept{expBuckets.length + otherDepts.length === 1 ? '' : 's'}</p>
          </div>
          <p className="text-[24px] font-extrabold tabular-nums text-red-600 dark:text-red-400">
            &minus;{formatMoney(totalExpenses)}
          </p>
          {totalExpenses === 0 ? (
            <p className="text-[11px] text-gray-400">No expenses recorded.</p>
          ) : (
            <div className="space-y-2.5">
              {expBuckets.map((b) => {
                const pct = totalExpenses > 0 ? (b.amount / totalExpenses) * 100 : 0
                return (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                        {b.label}
                      </span>
                      <span className={`tabular-nums font-medium ${b.text}`}>
                        &minus;{formatMoney(b.amount)} &middot; {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${b.track}`}>
                      <div className={`${b.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {otherDepts.map((b) => {
                const pct = totalExpenses > 0 ? (b.amount / totalExpenses) * 100 : 0
                return (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <span className="w-2 h-2 rounded-sm bg-gray-400" />
                        {b.label}
                      </span>
                      <span className="tabular-nums font-medium text-gray-600 dark:text-gray-300">
                        &minus;{formatMoney(b.amount)} &middot; {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700/40">
                      <div className="bg-gray-400 h-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revenue by Payment Method */}
      <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700/60">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Revenue by Payment Method
          </p>
          <p className="text-[10px] text-gray-400">{formatMoney(totalByMethod)} recorded</p>
        </div>
        {totalByMethod === 0 ? (
          <p className="text-[11px] text-gray-400">No payments collected in this period.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pmBuckets.map((b) => {
              const pct = totalByMethod > 0 ? (b.amount / totalByMethod) * 100 : 0
              return (
                <div key={b.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                      <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                      {b.label}
                    </span>
                    <span className={`tabular-nums font-medium ${b.text}`}>{pct.toFixed(0)}%</span>
                  </div>
                  <p className={`text-[15px] font-bold tabular-nums ${b.text}`}>{formatMoney(b.amount)}</p>
                  <div className={`h-1.5 rounded-full overflow-hidden ${b.track}`}>
                    <div className={`${b.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function OutstandingBody({ data, page, pages, onPage, onAction }) {
  const rows = Array.isArray(data?.outstanding) ? data.outstanding : []
  const totalOutstanding = Number(data?.total_outstanding ?? 0)
  const count = Number(data?.count ?? rows.length)

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="checkCircle"
        title="All bills settled"
        description="No clinic bills with an outstanding balance."
      />
    )
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-amber-50/60 dark:bg-amber-950/10 flex items-center gap-2">
        <Icon name="alert" size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
        <p className="text-[12px] text-amber-800 dark:text-amber-300">
          <span className="font-semibold tabular-nums">{formatMoney(totalOutstanding)}</span> outstanding &middot;{' '}
          <span className="font-semibold">{count}</span> record{count === 1 ? '' : 's'}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patient</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Phone</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Bill</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Paid</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Outstanding</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
            {rows.map((r) => {
              const bal = Number(r.balance ?? 0)
              return (
                <tr key={`${r.source}-${r.entity_id}`} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{r.patient_name}</p>
                    <p className="text-[10px] text-gray-400">
                      #{r.patient_id} · Visit #{r.entity_id}
                    </p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-[12px] text-gray-600 dark:text-gray-300">
                    {r.patient_phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] text-gray-700 dark:text-gray-200 tabular-nums">{formatMoney(r.total_bill)}</td>
                  <td className="px-4 py-3 text-right text-[12px] text-emerald-700 dark:text-emerald-400 tabular-nums hidden md:table-cell">
                    {formatMoney(r.paid_amount)}
                    {r.waived_amount > 0 && (
                      <span className="block text-[10px] text-fuchsia-600 dark:text-fuchsia-400">&minus;{formatMoney(r.waived_amount)} waived</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-bold text-red-600 dark:text-red-400 tabular-nums">{formatMoney(bal)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionButton icon="dollarSign" label="Settle" title="Collect payment" onClick={() => onAction(r, 'settle')} variant="success" />
                      <ActionButton icon="archive" label="Waive" title="Waive the balance" onClick={() => onAction(r, 'waive')} variant="warn" />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} onPage={onPage} />
    </div>
  )
}

function FollowUpModal({ row, action, loading, onClose, onSubmit }) {
  const { user } = useAuthStore()
  const actingUser = user?.name || 'Admin'
  const balance = Number(row.balance ?? 0)

  const [amount, setAmount] = useState(String(balance || ''))
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.id) {
      toast.error('You must be logged in to perform this action')
      return
    }
    if (action === 'settle') {
      const amt = Number(amount)
      if (!Number.isInteger(amt) || amt <= 0) {
        toast.error('Amount must be a positive whole number')
        return
      }
      if (amt > balance) {
        toast.error(`Amount exceeds outstanding balance of ${formatMoney(balance)}`)
        return
      }
      await onSubmit({
        action: 'settle',
        amount: amt,
        method,
        reference: reference.trim() || null,
      })
    } else if (action === 'waive') {
      if (!reason.trim()) {
        toast.error('A reason is required to waive the balance')
        return
      }
      const amtInput = Number(amount)
      let waiveAmt
      if (!amount || amount === '' || !Number.isInteger(amtInput) || amtInput <= 0) {
        waiveAmt = balance
      } else if (amtInput > balance) {
        toast.error(`Amount cannot exceed outstanding balance of ${formatMoney(balance)}`)
        return
      } else {
        waiveAmt = amtInput
      }
      await onSubmit({
        action: 'waive',
        amount: waiveAmt,
        reason: reason.trim(),
      })
    }
  }

  const titles = { settle: 'Collect Payment', waive: 'Waive Balance' }

  return (
    <ModalShell
      title={titles[action]}
      subtitle={`${row.patient_name} · ${formatMoney(balance)} outstanding`}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="followup-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="check" size={14} />}
            {loading ? 'Saving...' : (action === 'settle' ? 'Collect' : 'Waive')}
          </button>
        </>
      }
    >
      <form id="followup-form" onSubmit={handleSubmit} className="space-y-4">
        {action === 'settle' && (
          <>
            <Field label="Amount collected (KSh) *">
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} tabular-nums`}
                autoFocus
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Outstanding balance: <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">{formatMoney(balance)}</span>
              </p>
            </Field>
            <Field label="Method *">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                {PAYMENT_METHODS.filter((m) => m.key !== 'balance').map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Reference" hint="Optional — M-Pesa code, receipt no., etc.">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. SFJ8LQ3K"
                className={inputCls}
              />
            </Field>
          </>
        )}

        {action === 'waive' && (
          <>
            <div className="rounded-lg border border-fuchsia-200 dark:border-fuchsia-900/40 bg-fuchsia-50 dark:bg-fuchsia-950/20 p-3 flex items-start gap-2">
              <Icon name="alert" size={14} className="text-fuchsia-500 dark:text-fuchsia-400 mt-0.5 shrink-0" />
              <p className="text-[12px] text-fuchsia-800 dark:text-fuchsia-300">
                Waiving forgives the balance without collecting payment. This is recorded as a discount and the patient&apos;s bill is closed.
              </p>
            </div>
            <Field label="Amount to waive (KSh)" hint={`Leave blank to waive the full ${formatMoney(balance)}`}>
              <input
                type="number"
                min="1"
                max={balance}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(balance || '')}
                className={`${inputCls} tabular-nums`}
              />
            </Field>
            <Field label="Reason *" hint="Why is this balance being waived?">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Patient deceased; financial hardship; clinic write-off"
                rows={3}
                className={`${inputCls} resize-none`}
                autoFocus
              />
            </Field>
          </>
        )}

        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Icon name="user" size={12} />
          Acting as <span className="font-medium text-gray-600 dark:text-gray-300">{actingUser}</span>
        </div>
      </form>
    </ModalShell>
  )
}

function BillingSubTab() {
  const [selectedBill, setSelectedBill] = useState(null)
  const [range, setRange] = useState(() => {
    const r = presetToRange('today')
    return { range: 'today', from: r.from, to: r.to }
  })
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to])

  const qs = buildQuery({ from: range.from, to: range.to, page, limit: BILLING_PER_PAGE })

  const q = useQuery({
    queryKey: ['admin', 'bills', range.from, range.to, page],
    queryFn: () => api.get(`/api/admin/bills${qs}`),
    staleTime: 30000,
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
    return <ErrorState message={q.error?.message || 'Could not load bills'} onRetry={q.refetch} />
  }

  const bills = Array.isArray(q.data?.bills) ? q.data.bills : []
  const s = q.data?.summary || {}
  const pages = q.data?.pages || 1
  const curPage = q.data?.page || page

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Billed" value={formatMoney(s.total_billed ?? 0)} icon="receipt" color="blue" />
        <StatTile label="Total Collected" value={formatMoney(s.total_collected ?? 0)} icon="dollarSign" color="green" />
        <StatTile
          label="Outstanding"
          value={formatMoney(s.total_outstanding ?? 0)}
          icon="clock"
          color="amber"
          sublabel={`${s.pending_count ?? 0} open bill${s.pending_count === 1 ? '' : 's'}`}
        />
        <StatTile
          label="Waived"
          value={formatMoney(s.total_waived ?? 0)}
          icon="archive"
          color="slate"
          sublabel={`${s.waived_count ?? 0} bill${s.waived_count === 1 ? '' : 's'}`}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="All Bills"
          subtitle={`${q.data?.total || bills.length} bill${q.data?.total === 1 ? '' : 's'}`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangeFilter value={range} onChange={setRange} />
              <RefreshButton isFetching={q.isFetching} onClick={() => q.refetch()} />
            </div>
          }
        />
        {bills.length === 0 ? (
          <EmptyState icon="receipt" title="No bills" description="Billable visits will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patient</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Visit Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Fee Breakdown</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {bills.map((b) => {
                  const bal = Number(b.outstanding_amount ?? 0)
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{b.patient_name}</p>
                        <p className="text-[10px] text-gray-400">#{b.visit_id} &middot; {formatDate(b.created_at)}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={VISIT_TYPE_BADGES[b.visit_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                          {VISIT_TYPE_LABELS[b.visit_type] || cap(b.visit_type) || '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(b.items || []).map((it, idx) => (
                            <span key={`${it.name}-${idx}`} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/40 text-[10px] text-gray-600 dark:text-gray-300 tabular-nums">
                              {it.name} {formatMoney(it.amount)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.total_amount)}</p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums">paid {formatMoney(b.paid_amount)}</p>
                        {bal > 0 && <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold tabular-nums">balance {formatMoney(bal)}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={badgeClass(b.status)}>{cap(b.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedBill(b)}
                          className="px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 inline-flex items-center gap-1"
                        >
                          <Icon name="eye" size={12} /> View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={curPage} pages={pages} onPage={setPage} />
      </Card>

      {selectedBill && (
        <BillDetailModal bill={selectedBill} onClose={() => setSelectedBill(null)} />
      )}
    </div>
  )
}

function BillDetailModal({ bill, onClose }) {
  const bal = Number(bill.outstanding_amount ?? 0)
  return (
    <ModalShell
      title={`Bill ${bill.id}`}
      subtitle={`${bill.patient_name} &middot; Visit #${bill.visit_id}`}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white">
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={VISIT_TYPE_BADGES[bill.visit_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
            {VISIT_TYPE_LABELS[bill.visit_type] || cap(bill.visit_type) || '—'}
          </Badge>
          <Badge className={badgeClass(bill.visit_status)}>{cap(bill.visit_status).replace('_', ' ')}</Badge>
          <Badge className={badgeClass(bill.status)}>{cap(bill.status)}</Badge>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Fee Breakdown</p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
            <div className="p-3 space-y-1.5 bg-gray-50 dark:bg-gray-800/30">
              {(bill.items || []).length === 0 ? (
                <p className="text-[12px] text-gray-400">No billable items.</p>
              ) : (
                bill.items.map((it, idx) => (
                  <div key={`${it.name}-${idx}`} className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-600 dark:text-gray-300">{it.name}</span>
                    <span className="text-gray-700 dark:text-gray-200 tabular-nums">{formatMoney(it.amount)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-700/60 space-y-1.5 bg-white dark:bg-[#1e293b]">
              <div className="flex items-center justify-between text-[12px] font-semibold">
                <span className="text-gray-700 dark:text-gray-200">Total</span>
                <span className="text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(bill.total_amount)}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-emerald-600 dark:text-emerald-400">Paid</span>
                <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatMoney(bill.paid_amount)}</span>
              </div>
              {bill.discount_amount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-fuchsia-600 dark:text-fuchsia-400">Discount / Waived</span>
                  <span className="text-fuchsia-700 dark:text-fuchsia-400 tabular-nums">&minus;{formatMoney(bill.discount_amount)}</span>
                </div>
              )}
              {bal > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-amber-600 dark:text-amber-400">Balance</span>
                  <span className="text-amber-700 dark:text-amber-400 tabular-nums">{formatMoney(bal)}</span>
                </div>
              )}
            </div>
          </div>
          {bill.discount_reason && (
            <p className="text-[10px] text-fuchsia-500 dark:text-fuchsia-400 mt-1">Reason: {bill.discount_reason}</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Payment History</p>
          {bill.payments && bill.payments.length > 0 ? (
            <div className="space-y-2">
              {bill.payments.map((payment, idx) => (
                <div key={idx} className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-emerald-800 dark:text-emerald-300">{formatMoney(payment.amount)} collected</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {payment.method ? cap(payment.method) : 'Method —'}
                      {payment.reference ? ` &middot; Ref ${payment.reference}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400">{formatDateTime(payment.paid_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-gray-400">No payments collected for this bill yet.</p>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function DepartmentExpensesCard({ domain, title, color }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [period, setPeriod] = useState('this_month')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { setPage(1) }, [period, search])

  const listKey = ['expenses', domain, period, search, page]
  const statsKey = ['expenses', domain, 'stats', period]

  const listQs = buildQuery({ domain, period, search: search.trim() || undefined, page, limit: EXPENSES_PER_PAGE })
  const statsQs = buildQuery({ domain, period })

  const q = useQuery({
    queryKey: listKey,
    queryFn: () => api.get(`/api/expenses${listQs}`),
    staleTime: 15000,
  })

  const statsQ = useQuery({
    queryKey: statsKey,
    queryFn: () => api.get(`/api/expenses/stats${statsQs}`),
    staleTime: 15000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', domain] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'finance-overview'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacy-finance-overview'] })
  }

  const addMut = useMutation({
    mutationFn: (body) => api.post(`/api/expenses?domain=${domain}`, { ...body, domain }),
    onSuccess: () => { refresh(); toast.success('Expense recorded') },
    onError: (e) => toast.error(e.message || 'Could not record expense'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/api/expenses/${id}?domain=${domain}`, { ...body, domain }),
    onSuccess: () => { refresh(); toast.success('Expense updated') },
    onError: (e) => toast.error(e.message || 'Could not update expense'),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/expenses/${id}?domain=${domain}`),
    onSuccess: () => { refresh(); toast.success('Expense deleted') },
    onError: (e) => toast.error(e.message || 'Could not delete expense'),
  })

  const expenses = Array.isArray(q.data?.expenses) ? q.data.expenses : []
  const total = Number(q.data?.total ?? 0)
  const pages = Math.max(1, Math.ceil(total / EXPENSES_PER_PAGE))

  const totalAmount = Number(statsQ.data?.total_amount ?? 0)
  const entryCount = Number(statsQ.data?.entry_count ?? 0)
  const avgAmount = Number(statsQ.data?.avg_amount ?? 0)

  const colorMap = {
    blue: { stat: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-900/50' },
    emerald: { stat: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900/50' },
  }
  const c = colorMap[color] || colorMap.blue

  return (
    <Card className={`overflow-hidden border-t-2 ${c.border}`}>
      <CardHeader
        title={title}
        subtitle={`${total} record${total === 1 ? '' : 's'} · ${formatMoney(totalAmount)} total`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
              {EXPENSE_PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={[
                    'px-2.5 py-1 text-[11px] font-medium transition-colors',
                    period === p.key
                      ? 'bg-[#1a6cbf] text-white'
                      : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description..."
              className="px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 w-40"
            />
            <RefreshButton isFetching={q.isFetching} onClick={() => { q.refetch(); statsQ.refetch() }} />
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-1.5 shrink-0"
            >
              <Icon name="plus" size={13} /> Record Expense
            </button>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Total</p>
            <p className={`text-lg font-bold tabular-nums ${c.stat}`}>{formatMoney(totalAmount)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Entries</p>
            <p className="text-lg font-bold tabular-nums text-gray-700 dark:text-gray-300">{entryCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Average</p>
            <p className="text-lg font-bold tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(avgAmount)}</p>
          </div>
        </div>

        {q.isLoading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message || 'Could not load expenses'} onRetry={q.refetch} />
        ) : expenses.length === 0 ? (
          <EmptyState icon="trendDown" title={`No ${title.toLowerCase()} recorded`} description="Record an expense to see it here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Description</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Amount</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Recorded By</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Date</th>
                    {isAdmin && <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {expenses.map((e) => (
                    <tr key={`${e.domain}-${e.id}`} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-2.5">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{e.description}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatMoney(e.amount)}</td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-[12px] text-gray-500 dark:text-gray-400">{e.recorder?.username || '—'}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-[12px] text-gray-500 dark:text-gray-400">{formatDate(e.incurred_at)}</td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <ActionButton icon="edit" label="Edit" title="Edit expense" onClick={() => setModal({ mode: 'edit', expense: e })} />
                            <ActionButton icon="trash" label="Delete" title="Delete expense" onClick={() => setConfirmDelete(e)} variant="warn" />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && <Pagination page={page} pages={pages} onPage={setPage} />}
          </>
        )}
      </div>

      {modal && (
        <ExpenseModal
          domain={domain}
          expense={modal.mode === 'edit' ? modal.expense : null}
          loading={addMut.isPending || editMut.isPending}
          onClose={() => setModal(null)}
          onSubmit={async (body) => {
            if (modal.mode === 'edit') {
              await editMut.mutateAsync({ id: modal.expense.id, ...body })
            } else {
              await addMut.mutateAsync(body)
            }
            setModal(null)
          }}
        />
      )}

      {confirmDelete && (
        <ModalShell
          title="Delete Expense"
          subtitle={`${confirmDelete.description} · ${formatMoney(confirmDelete.amount)}`}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={delMut.isPending}
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={delMut.isPending}
                onClick={async () => {
                  try {
                    await delMut.mutateAsync(confirmDelete.id)
                    setConfirmDelete(null)
                  } catch { /* toast handled by mutation */ }
                }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50">
                {delMut.isPending ? <Spinner size={14} /> : <Icon name="trash" size={14} />}
                {delMut.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </>
          }
        >
          <p className="text-[13px] text-gray-600 dark:text-gray-300">
            This permanently removes the expense. The action is recorded in the audit log.
          </p>
        </ModalShell>
      )}
    </Card>
  )
}

function ExpenseModal({ domain, expense, loading, onClose, onSubmit }) {
  const { user } = useAuthStore()
  const isEdit = Boolean(expense)

  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [date, setDate] = useState(() =>
    expense?.incurred_at
      ? formatLocalDate(new Date(expense.incurred_at))
      : formatLocalDate(new Date())
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user?.id) {
      toast.error('You must be logged in to record expenses')
      return
    }
    if (!description.trim()) {
      toast.error('Description is required')
      return
    }
    const amt = Number(amount)
    if (!Number.isInteger(amt) || amt <= 0) {
      toast.error('Amount must be a positive whole number')
      return
    }
    await onSubmit({
      description: description.trim(),
      amount: amt,
      incurred_at: date,
    })
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Expense' : 'Record Expense'}
      subtitle={`${cap(domain)} expenses`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="expense-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="save" size={14} />}
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Record'}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Description *">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Printing paper & envelopes"
            className={inputCls}
            autoFocus
          />
        </Field>
        <Field label="Amount (KSh) *">
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`${inputCls} tabular-nums`}
          />
        </Field>
        <Field label="Date incurred">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={formatLocalDate(new Date())}
            className={inputCls}
          />
        </Field>
        {isEdit && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
            Changes are recorded in the audit log with the previous values.
          </p>
        )}
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Icon name="info" size={12} />
          {isEdit ? 'Originally recorded by' : 'Recorded by'}{' '}
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {isEdit ? expense.recorder?.username || 'Unknown' : user?.username || 'Unknown'}
          </span>
        </div>
      </form>
    </ModalShell>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const inputCls = 'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

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
