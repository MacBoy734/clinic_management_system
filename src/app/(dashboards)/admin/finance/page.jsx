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

// ─── Constants ───────────────────────────────────────────────────────────────

const SUB_TABS = [
  { key: 'billing', label: 'Billing', icon: 'receipt' },
  { key: 'expenses', label: 'Expenses', icon: 'trendDown' },
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

const DATE_RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
]

const REVENUE_BUCKETS = [
  {
    key: 'consultation',
    label: 'Consultation',
    color: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
    track: 'bg-blue-100 dark:bg-blue-900/40',
    extract: (rev) => Number(rev?.consultation ?? 0),
  },
  {
    key: 'procedures',
    label: 'Procedures',
    color: 'bg-orange-500',
    text: 'text-orange-700 dark:text-orange-400',
    track: 'bg-orange-100 dark:bg-orange-900/40',
    extract: (rev) => Number(rev?.procedures ?? 0),
  },
  {
    key: 'lab',
    label: 'Lab',
    color: 'bg-purple-500',
    text: 'text-purple-700 dark:text-purple-400',
    track: 'bg-purple-100 dark:bg-purple-900/40',
    extract: (rev) => Number(rev?.lab ?? 0),
  },
  {
    key: 'medication',
    label: 'Medication',
    color: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    track: 'bg-emerald-100 dark:bg-emerald-900/40',
    extract: (rev) => Number(rev?.medication ?? 0),
  },
]

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
  { key: 'other', label: 'Other' },
  { key: 'balance', label: 'Balance Settlement' },
]

const EXPENSE_CATEGORIES = [
  'supplies', 'salaries', 'rent', 'utilities', 'transport', 'maintenance', 'other',
]

const BILLING_PER_PAGE = 10
const OUTSTANDING_PER_PAGE = 10
const EXPENSES_PER_PAGE = 10

// ─── Date helpers (local timezone, not UTC) ─────────────────────────────────

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

// ─── Main Tab ────────────────────────────────────────────────────────────────

export default function FinanceTab() {
  const [sub, setSub] = useState('billing')

  return (
    <div className="space-y-4">
      <FinanceOverviewCard />
      <OutstandingBalancesCard />

      <div className="pt-2 flex items-center gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Detailed Records</p>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700/60" />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SUB_TABS.map((t) => (
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
      {sub === 'expenses' && <AllExpensesSubTab />}
    </div>
  )
}

// ─── Finance Overview (single endpoint) ──────────────────────────────────────

function FinanceOverviewCard() {
  const [range, setRange] = useState(() => {
    const r = presetToRange('30d')
    return { range: '30d', from: r.from, to: r.to }
  })

  const qs = buildQuery({ from: range.from, to: range.to })

  const q = useQuery({
    queryKey: ['admin', 'finance-overview', range.from, range.to],
    queryFn: () => api.get(`/api/admin/finance-overview${qs}`),
    staleTime: 30000,
  })

  const rev = q.data?.revenue || {}
  const totalRevenue = Number(rev.total ?? 0)
  const days = Number(q.data?.days_in_range ?? 0) || 1
  const byPaymentMethod = q.data?.by_payment_method || {}
  const exp = q.data?.expenses || {}
  const byDept = exp.by_department || {}
  const totalExpenses = Number(exp.total ?? 0)
  const net = Number(q.data?.net ?? 0)

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Finance Overview"
        subtitle="Real money in vs real money out"
                action={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <button
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Icon 
                name="refresh" 
                size={13} 
                className={q.isFetching ? 'animate-spin' : ''} 
              />
              {q.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
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
          totalRevenue={totalRevenue}
          revenue={rev}
          totalExpenses={totalExpenses}
          byDepartment={byDept}
          byPaymentMethod={byPaymentMethod}
          net={net}
        />
      )}
    </Card>
  )
}

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

function FinanceOverviewBody({ range, days, totalRevenue, revenue, totalExpenses, byDepartment, byPaymentMethod, net }) {
  const revBuckets = REVENUE_BUCKETS.map((b) => ({ ...b, amount: b.extract(revenue) }))
  const knownDeptKeys = new Set(EXPENSE_BUCKETS.map((b) => b.key))
  const expBuckets = EXPENSE_BUCKETS.map((b) => ({
    ...b,
    amount: Number(byDepartment[b.key] ?? 0),
  })).filter((b) => b.amount > 0)
  const otherDepts = Object.entries(byDepartment)
    .filter(([k, v]) => !knownDeptKeys.has(k) && Number(v) > 0)
    .map(([k, v]) => ({ key: k, label: cap(k), amount: Number(v) }))

  const avgPerDay = days > 0 ? totalRevenue / days : 0

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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Revenue</p>
            <p className="text-[10px] text-gray-400">avg {formatMoney(avgPerDay)}/day</p>
          </div>
          <p className="text-[24px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(totalRevenue)}
          </p>
          {totalRevenue === 0 ? (
            <p className="text-[11px] text-gray-400">No revenue collected in this period.</p>
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
          <p className="text-[10px] text-gray-400">{formatMoney(totalByMethod)} collected</p>
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

// ─── Outstanding Balances ────────────────────────────────────────────────────

function OutstandingBalancesCard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [range, setRange] = useState(() => {
    const r = presetToRange('30d')
    return { range: '30d', from: r.from, to: r.to }
  })
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to])

  const qs = buildQuery({ from: range.from, to: range.to, page, limit: OUTSTANDING_PER_PAGE })
  const queryKey = ['admin', 'outstanding-balances', range.from, range.to, page]

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
            return {
              ...r,
              waived_amount: newWaived,
              balance: Math.max(0, (r.total_bill || 0) - (r.paid_amount || 0) - newWaived),
            }
          }
          return r
        })
        const filtered = updated.filter((r) => r.balance > 0)
        const totalOutstanding = filtered.reduce((s, r) => s + r.balance, 0)
        return { ...old, outstanding: filtered, count: filtered.length, total_outstanding: totalOutstanding }
      })
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
      toast.error(err.message || 'Could not update outstanding balance')
    },
    onSuccess: (data, vars) => {
      const serverRow = data?.row
      if (serverRow) {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old || !Array.isArray(old.outstanding)) return old
          let outstanding
          if (serverRow.balance <= 0) {
            outstanding = old.outstanding.filter(
              (r) => !(r.entity_id === serverRow.entity_id && r.source === serverRow.source)
            )
          } else {
            const exists = old.outstanding.some(
              (r) => r.entity_id === serverRow.entity_id && r.source === serverRow.source
            )
            outstanding = exists
              ? old.outstanding.map((r) =>
                  r.entity_id === serverRow.entity_id && r.source === serverRow.source ? serverRow : r
                )
              : [serverRow, ...old.outstanding]
          }
          const totalOutstanding = outstanding.reduce((s, r) => s + r.balance, 0)
          return { ...old, outstanding, count: outstanding.length, total_outstanding: totalOutstanding }
        })
      }
      const labels = { settle: 'Payment collected', waive: 'Balance waived' }
      toast.success(labels[vars.body.action] || 'Updated')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const pages = q.data?.pages || 1
  const curPage = q.data?.page || page

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Outstanding Balances"
        subtitle="Clinic bills & pharmacy credit — collect or waive"
                action={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <button
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Icon 
                name="refresh" 
                size={13} 
                className={q.isFetching ? 'animate-spin' : ''} 
              />
              {q.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
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

function OutstandingBody({ data, page, pages, onPage, onAction }) {
  const rows = Array.isArray(data?.outstanding) ? data.outstanding : []
  const totalOutstanding = Number(data?.total_outstanding ?? 0)
  const count = Number(data?.count ?? rows.length)

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="checkCircle"
        title="All credits settled"
        description="No outstanding clinic bills or pharmacy credit."
      />
    )
  }

  const sourceBadge = (source) => {
    if (source === 'pharmacy')
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
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
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Source / Patient</th>
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
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge className={sourceBadge(r.source)}>
                        {r.source === 'pharmacy' ? 'Pharmacy' : 'Clinic'}
                      </Badge>
                    </div>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{r.patient_name}</p>
                    <p className="text-[10px] text-gray-400">
                      #{r.patient_id}
                      {r.source === 'clinic' && ` · Visit #${r.entity_id}`}
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
      if (!Number.isFinite(amt) || amt <= 0) {
        toast.error('Amount must be a positive number')
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
      if (!amount || amount === '' || !Number.isFinite(amtInput) || amtInput <= 0) {
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
      subtitle={`${row.patient_name} &middot; ${formatMoney(balance)} outstanding`}
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
                min="0"
                step="any"
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
                {PAYMENT_METHODS.map((m) => (
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
                min="0"
                max={balance}
                step="any"
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

// ─── Billing Sub-tab ─────────────────────────────────────────────────────────

function BillingSubTab() {
  const [selectedBill, setSelectedBill] = useState(null)
  const [range, setRange] = useState(() => {
    const r = presetToRange('30d')
    return { range: '30d', from: r.from, to: r.to }
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
  const totals = q.data?.totals || { billed: 0, collected: 0, pending: 0, pendingCount: 0, waived: 0, waivedCount: 0 }
  const pages = q.data?.pages || 1
  const curPage = q.data?.page || page

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Billed" value={formatMoney(totals.billed)} icon="receipt" color="blue" />
        <StatTile label="Total Collected" value={formatMoney(totals.collected)} icon="dollarSign" color="green" />
        <StatTile label="Total Pending" value={formatMoney(totals.pending)} icon="clock" color="amber" sublabel={`${totals.pendingCount} bill${totals.pendingCount === 1 ? '' : 's'}`} />
        <StatTile label="Total Waived" value={formatMoney(totals.waived)} icon="archive" color="slate" sublabel={`${totals.waivedCount} bill${totals.waivedCount === 1 ? '' : 's'}`} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="All Bills"
          subtitle={`${q.data?.total || bills.length} bill${q.data?.total === 1 ? '' : 's'}`}
                    action={
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangeFilter value={range} onChange={setRange} />
              <button
                onClick={() => q.refetch()}
                disabled={q.isFetching}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
              >
                <Icon 
                  name="refresh" 
                  size={13} 
                  className={q.isFetching ? 'animate-spin' : ''} 
                />
                {q.isFetching ? 'Refreshing…' : 'Refresh'}
              </button>
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
                  const bal = Math.max(0, Number(b.outstanding_amount ?? (Number(b.total_amount) - Number(b.paid_amount))))
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
  const bal = Math.max(0, Number(bill.total_amount) - Number(bill.paid_amount))
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
          <Badge className={badgeClass(bill.status)}>{bill.status === 'pending_pay' ? 'Pending' : cap(bill.status)}</Badge>
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

// ─── Expenses Sub-tab ────────────────────────────────────────────────────────

function AllExpensesSubTab() {
  return (
    <div className="space-y-4">
      <DepartmentExpensesCard department="reception" title="Clinic Expenses" icon="building" color="blue" />
      <DepartmentExpensesCard department="pharmacy" title="Pharmacy Expenses" icon="pillBottle" color="emerald" />
    </div>
  )
}

function DepartmentExpensesCard({ department, title, icon, color }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [range, setRange] = useState(() => {
    const r = presetToRange('30d')
    return { range: '30d', from: r.from, to: r.to }
  })
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to])

  const qs = buildQuery({ from: range.from, to: range.to, page, limit: EXPENSES_PER_PAGE, department })
  const queryKey = ['admin', 'expenses', department, range.from, range.to, page]

  const q = useQuery({
    queryKey,
    queryFn: () => api.get(`/api/expenses${qs}`),
    staleTime: 15000,
  })

  const addMut = useMutation({
    mutationFn: (body) => api.post('/api/expenses', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ['admin', 'finance-overview'] })
      toast.success('Expense recorded')
    },
    onError: (e) => toast.error(e.message || 'Could not record expense'),
  })

  if (q.isLoading) return <Card className="p-4"><SkeletonTable rows={4} cols={4} /></Card>
  if (q.isError) return <Card className="p-4"><ErrorState message={q.error?.message || 'Could not load expenses'} onRetry={q.refetch} /></Card>

  const expenses = Array.isArray(q.data?.expenses) ? q.data.expenses : []
  const stats = q.data?.stats || {}
  const total = Number(stats.total ?? 0)
  const todayTotal = Number(stats.today_total ?? 0)
  const todayCount = Number(stats.today_count ?? 0)
  const byCategory = stats.by_category || {}
  const pages = q.data?.pages || 1
  const curPage = q.data?.page || page

  const colorMap = {
    blue: { stat: 'text-blue-700 dark:text-blue-400', icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-900/50' },
    emerald: { stat: 'text-emerald-700 dark:text-emerald-400', icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900/50' },
  }
  const c = colorMap[color] || colorMap.blue

  return (
    <Card className={`overflow-hidden border-t-2 ${c.border}`}>
      <CardHeader
        title={title}
        subtitle={`${q.data?.total || expenses.length} record${q.data?.total === 1 ? '' : 's'} &middot; ${formatMoney(total)} total`}
          action={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <button
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Icon 
                name="refresh" 
                size={13} 
                className={q.isFetching ? 'animate-spin' : ''} 
              />
              {q.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-1.5 shrink-0"
            >
              <Icon name="plus" size={13} /> Record Expense
            </button>
          </div>
        }
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Total</p>
            <p className={`text-lg font-bold tabular-nums ${c.stat}`}>{formatMoney(total)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Today</p>
            <p className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatMoney(todayTotal)}</p>
            <p className="text-[9px] text-gray-400">{todayCount} record{todayCount === 1 ? '' : 's'}</p>
          </div>
          {Object.entries(byCategory).map(([cat, amt]) => (
            <div key={cat} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{cap(cat)}</p>
              <p className="text-lg font-bold tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(amt)}</p>
            </div>
          ))}
        </div>

        {expenses.length === 0 ? (
          <EmptyState icon="trendDown" title={`No ${title.toLowerCase()} recorded`} description="Record an expense to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Description</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Category</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Amount</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Recorded By</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{e.description}</p>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">{cap(e.category)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatMoney(e.amount)}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-[12px] text-gray-500 dark:text-gray-400">{e.recorded_by}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-[12px] text-gray-500 dark:text-gray-400">{formatDate(e.recorded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={curPage} pages={pages} onPage={setPage} />
      </div>

      {showModal && (
        <ExpenseModal
          department={department}
          loading={addMut.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={async (body) => { await addMut.mutateAsync(body); setShowModal(false) }}
        />
      )}
    </Card>
  )
}

function ExpenseModal({ department, loading, onClose, onSubmit }) {
  const { user } = useAuthStore()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(() => formatLocalDate(new Date()))

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
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be a positive number')
      return
    }
    await onSubmit({
      department,
      description: description.trim(),
      amount: amt,
      category: category || 'other',
      recorded_by_id: user.id,
      date,
    })
  }

  return (
    <ModalShell
      title="Record Expense"
      subtitle={`${cap(department)} department`}
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
            {loading ? 'Saving...' : 'Record'}
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
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`${inputCls} tabular-nums`}
          />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">Select category</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{cap(c)}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Icon name="info" size={12} />
          Recorded by <span className="font-medium text-gray-600 dark:text-gray-300">{user?.name || 'Unknown'}</span>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Shared UI helpers ───────────────────────────────────────────────────────

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