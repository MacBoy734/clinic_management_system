'use client'

/**
 * FinanceTab — Admin finance dashboard with 4 sub-tabs.
 *
 * Sub-tabs:
 *   Revenue       → GET /api/admin/finance/revenue?period=
 *   Billing       → GET /api/admin/bills?period=&status=&visit_type=&search=
 *   Payments      → GET /api/admin/payments?period=&method=&stage=
 *   Expenses      → GET /api/expenses?domain=clinic|pharmacy&period=
 *                   POST /api/expenses
 *                   DELETE /api/expenses/:id?domain=
 *                   GET /api/expenses/stats?domain=&period=
 */

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonTable, Spinner,
  formatMoney, formatDate, formatTime, formatDateTime, timeAgo, cap, badgeClass,
} from '@/utils/helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUB_TABS = [
  { key: 'revenue',            label: 'Revenue',           icon: 'trendUp'     },
  { key: 'billing',            label: 'Billing',           icon: 'receipt'     },
  { key: 'payments',           label: 'Payments',          icon: 'dollarSign'  },
  { key: 'clinic_expenses',    label: 'Clinic Expenses',   icon: 'trendDown'   },
  { key: 'pharmacy_expenses',  label: 'Pharmacy Expenses', icon: 'pillBottle'  },
]

const PERIODS = [
  { key: 'today',        label: 'Today'       },
  { key: 'this_week',    label: 'This Week'   },
  { key: 'this_month',   label: 'This Month'  },
  { key: 'last_30_days', label: 'Last 30 Days'},
  { key: 'this_year',    label: 'This Year'   },
]

const METHOD_BADGES = {
  cash:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  mpesa:     'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  insurance: 'bg-purple-100  text-purple-700  dark:bg-purple-900/30  dark:text-purple-400',
  other:     'bg-gray-100    text-gray-700    dark:bg-gray-700/40    dark:text-gray-300',
}

const VISIT_TYPE_BADGES = {
  consultation:   'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400',
  injection:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  family_planning:'bg-pink-100   text-pink-700   dark:bg-pink-900/30   dark:text-pink-400',
  direct_lab:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  otc_sale:       'bg-cyan-100   text-cyan-700   dark:bg-cyan-900/30   dark:text-cyan-400',
}

const VISIT_TYPE_LABELS = {
  consultation:   'Consultation',
  injection:      'Procedure',
  family_planning:'Family Planning',
  direct_lab:     'Direct Lab',
  otc_sale:       'OTC Sale',
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 ' +
  'bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function StatCard({ label, value, sublabel, icon, color = 'blue', trend }) {
  const colors = {
    blue:   { wrap: 'border-blue-200   dark:border-blue-900/50   bg-blue-50   dark:bg-blue-950/30',   val: 'text-blue-700   dark:text-blue-400',   ic: 'bg-blue-100   text-blue-600   dark:bg-blue-900/40   dark:text-blue-400'   },
    green:  { wrap: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30', val: 'text-emerald-700 dark:text-emerald-400', ic: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
    amber:  { wrap: 'border-amber-200   dark:border-amber-900/50   bg-amber-50   dark:bg-amber-950/30',   val: 'text-amber-700   dark:text-amber-400',   ic: 'bg-amber-100   text-amber-600   dark:bg-amber-900/40   dark:text-amber-400'   },
    red:    { wrap: 'border-red-200     dark:border-red-900/50     bg-red-50     dark:bg-red-950/30',     val: 'text-red-700     dark:text-red-400',     ic: 'bg-red-100     text-red-600     dark:bg-red-900/40     dark:text-red-400'     },
    purple: { wrap: 'border-purple-200  dark:border-purple-900/50  bg-purple-50  dark:bg-purple-950/30',  val: 'text-purple-700  dark:text-purple-400',  ic: 'bg-purple-100  text-purple-600  dark:bg-purple-900/40  dark:text-purple-400'  },
    cyan:   { wrap: 'border-cyan-200    dark:border-cyan-900/50    bg-cyan-50    dark:bg-cyan-950/30',    val: 'text-cyan-700    dark:text-cyan-400',    ic: 'bg-cyan-100    text-cyan-600    dark:bg-cyan-900/40    dark:text-cyan-400'    },
    slate:  { wrap: 'border-gray-200    dark:border-gray-700/60    bg-white      dark:bg-[#1e293b]',      val: 'text-gray-700    dark:text-gray-300',    ic: 'bg-gray-100    text-gray-600    dark:bg-gray-800       dark:text-gray-400'    },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`rounded-xl border p-4 ${c.wrap}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.ic}`}>
            <Icon name={icon} size={18} />
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold tabular-nums truncate ${c.val}`}>{value}</p>
      {sublabel && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{sublabel}</p>}
      {trend != null && (
        <p className={`text-[11px] mt-1 font-medium ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs prev period
        </p>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap text-${align}`}>
      {children}
    </th>
  )
}

function PeriodSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={[
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
            value === p.key
              ? 'bg-[#1a6cbf] text-white'
              : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
          ].join(' ')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─── Simple bar chart using inline divs ───────────────────────────────────────
function MiniBarChart({ data, height = 120 }) {
  if (!data?.length) return null
  const maxVal = Math.max(...data.map(d => d.total_revenue || 0), 1)

  return (
    <div className="flex items-end gap-px overflow-hidden" style={{ height }}>
      {data.map((d, i) => {
        const pct = Math.max(2, ((d.total_revenue || 0) / maxVal) * 100)
        const expPct = Math.max(0, ((d.expenses || 0) / maxVal) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-px group relative" style={{ height }}>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                <p className="font-semibold">{d.day}</p>
                <p>Revenue: {formatMoney(d.total_revenue)}</p>
                <p>Expenses: {formatMoney(d.expenses)}</p>
                <p>Net: {formatMoney(d.net)}</p>
              </div>
            </div>
            {/* Expense bar (red, behind) */}
            {expPct > 0 && (
              <div
                className="w-full bg-red-400/60 dark:bg-red-600/40 rounded-t-sm"
                style={{ height: `${expPct}%` }}
              />
            )}
            {/* Revenue bar (blue) */}
            <div
              className="w-full bg-[#1a6cbf] dark:bg-blue-500 rounded-t-sm"
              style={{ height: `${pct}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

// Stacked horizontal bar for method breakdown
function MethodBar({ byMethod, total }) {
  if (!total) return null
  const METHODS = [
    { key: 'cash',      label: 'Cash',      color: 'bg-emerald-500' },
    { key: 'mpesa',     label: 'M-Pesa',    color: 'bg-green-500'   },
    { key: 'insurance', label: 'Insurance', color: 'bg-purple-500'  },
    { key: 'other',     label: 'Other',     color: 'bg-gray-400'    },
  ]
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700/40 mb-2">
        {METHODS.map(m => {
          const val = byMethod[m.key] || 0
          const pct = total > 0 ? (val / total) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={m.key}
              className={`${m.color}`}
              style={{ width: `${pct}%` }}
              title={`${m.label}: ${formatMoney(val)} (${pct.toFixed(1)}%)`}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {METHODS.map(m => {
          const val = byMethod[m.key] || 0
          const pct = total > 0 ? (val / total) * 100 : 0
          return (
            <div key={m.key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${m.color}`} />
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">{m.label}</span>
              <span className="text-[11px] text-gray-400 tabular-nums">{formatMoney(val)} · {pct.toFixed(0)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TAB SHELL
// ═══════════════════════════════════════════════════════════════════════════════

export default function FinanceTab() {
  const [sub, setSub] = useState('revenue')

  return (
    <div className="space-y-4">
      {/* Secondary pill nav */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SUB_TABS.map(t => (
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

      {sub === 'revenue'           && <RevenueSubTab />}
      {sub === 'billing'           && <BillingSubTab />}
      {sub === 'payments'          && <PaymentsSubTab />}
      {sub === 'clinic_expenses'   && <ExpensesSubTab domain="clinic"   title="Clinic Expenses"   />}
      {sub === 'pharmacy_expenses' && <ExpensesSubTab domain="pharmacy" title="Pharmacy Expenses" />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 1: REVENUE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function RevenueSubTab() {
  const [period, setPeriod] = useState('this_month')

  const q = useQuery({
    queryKey: ['admin', 'finance', 'revenue', period],
    queryFn:  () => api.get(`/api/admin/finance/revenue?period=${period}`),
    staleTime: 30000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message} onRetry={q.refetch} />

  const s  = q.data?.summary       || {}
  const bm = q.data?.by_method     || {}
  const bv = q.data?.by_visit_type || {}
  const ec = q.data?.expense_by_category || {}
  const chartData = q.data?.chart_data   || []

  const totalRevenue  = s.total_revenue   || 0
  const totalExpenses = s.total_expenses  || 0
  const netIncome     = s.net_income      || 0
  const netIsPositive = netIncome >= 0

  // Margin %
  const margin = totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <PeriodSelector value={period} onChange={setPeriod} />

      {/* ── Primary KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={formatMoney(totalRevenue)}
          icon="trendUp"
          color="blue"
          sublabel={`${s.payment_count || 0} clinic + ${s.otc_sale_count || 0} OTC transactions`}
        />
        <StatCard
          label="Total Expenses"
          value={formatMoney(totalExpenses)}
          icon="trendDown"
          color="red"
          sublabel={`${s.expense_count || 0} expense entries`}
        />
        <StatCard
          label="Net Income"
          value={formatMoney(netIncome)}
          icon={netIsPositive ? 'checkCircle' : 'alert'}
          color={netIsPositive ? 'green' : 'red'}
          sublabel={`${margin}% margin`}
        />
        <StatCard
          label="Profit Margin"
          value={`${margin}%`}
          icon="barChart"
          color={netIsPositive ? 'cyan' : 'amber'}
          sublabel={netIsPositive ? 'Profitable' : 'In deficit'}
        />
      </div>

      {/* ── Revenue sources row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Clinic Revenue"
          value={formatMoney(s.clinic_revenue || 0)}
          icon="stethoscope"
          color="blue"
          sublabel="bills & consultations"
        />
        <StatCard
          label="Pharmacy Revenue"
          value={formatMoney(s.pharmacy_revenue || 0)}
          icon="pillBottle"
          color="cyan"
          sublabel="OTC walk-in sales"
        />
        <StatCard
          label="Clinic Expenses"
          value={formatMoney(s.clinic_expenses || 0)}
          icon="building"
          color="amber"
          sublabel="operations & overheads"
        />
        <StatCard
          label="Pharmacy Expenses"
          value={formatMoney(s.pharmacy_expenses || 0)}
          icon="pillBottle"
          color="purple"
          sublabel="pharmacy operations"
        />
      </div>

      {/* ── Stage breakdown ── */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Stage 1 Collected"
          value={formatMoney(s.stage1_collected || 0)}
          icon="receipt"
          color="slate"
          sublabel="consultation fees at reception"
        />
        <StatCard
          label="Stage 2 Collected"
          value={formatMoney(s.stage2_collected || 0)}
          icon="dollarSign"
          color="green"
          sublabel="lab, medication & procedure fees"
        />
      </div>

      {/* ── Chart + method breakdown ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
            Daily Revenue vs Expenses — Last 30 days
          </h3>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#1a6cbf] dark:bg-blue-500 inline-block" /> Revenue</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-400/60 dark:bg-red-600/40 inline-block" /> Expenses</span>
          </div>
        </div>
        <MiniBarChart data={chartData} height={140} />
        {/* X-axis labels — show every 5th day */}
        <div className="flex justify-between mt-1">
          {chartData.filter((_, i) => i % 5 === 0 || i === chartData.length - 1).map((d, i) => (
            <span key={i} className="text-[9px] text-gray-400">{d.day}</span>
          ))}
        </div>
      </Card>

      {/* ── Payment method breakdown ── */}
      <Card className="p-5">
        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Revenue by Payment Method
        </h3>
        <MethodBar byMethod={bm} total={totalRevenue} />
      </Card>

      {/* ── Revenue by visit type + expense by category ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By visit type */}
        <Card className="p-5">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Revenue by Visit Type</h3>
          {Object.keys(bv).length === 0 ? (
            <p className="text-[12px] text-gray-400">No data for this period.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(bv)
                .sort((a, b) => b[1] - a[1])
                .map(([type, amount]) => {
                  const pct = totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <Badge className={VISIT_TYPE_BADGES[type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                            {VISIT_TYPE_LABELS[type] || cap(type)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                            {formatMoney(amount)}
                          </span>
                          <span className="text-[10px] text-gray-400 w-8 text-right tabular-nums">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
                        <div className="h-full rounded-full bg-[#1a6cbf] dark:bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </Card>

        {/* By expense category */}
        <Card className="p-5">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Expenses by Category</h3>
          {Object.keys(ec).length === 0 ? (
            <p className="text-[12px] text-gray-400">No expenses recorded for this period.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(ec)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => {
                  const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] text-gray-600 dark:text-gray-300 capitalize">{cat}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-red-600 dark:text-red-400 tabular-nums">
                            {formatMoney(amount)}
                          </span>
                          <span className="text-[10px] text-gray-400 w-8 text-right tabular-nums">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
                        <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 2: BILLING
// ═══════════════════════════════════════════════════════════════════════════════

function BillingSubTab() {
  const [period, setPeriod]       = useState('this_month')
  const [status, setStatus]       = useState('all')
  const [visitType, setVisitType] = useState('all')
  const [search, setSearch]       = useState('')
  const [selectedBill, setSelectedBill] = useState(null)

  const q = useQuery({
    queryKey: ['admin', 'bills', period, status, visitType, search],
    queryFn: () => {
      const params = new URLSearchParams({ period, status, visit_type: visitType })
      if (search) params.set('search', search)
      return api.get(`/api/admin/bills?${params}`)
    },
    staleTime: 30000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={8} cols={6} />
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message} onRetry={q.refetch} />

  const bills = q.data?.bills   || []
  const sm    = q.data?.summary || {}

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Billed"     value={formatMoney(sm.total_billed     || 0)} icon="receipt"     color="blue"  sublabel={`${q.data?.total || 0} bills`} />
        <StatCard label="Total Collected"  value={formatMoney(sm.total_collected  || 0)} icon="dollarSign"  color="green" sublabel={`${sm.paid_count    || 0} fully paid`} />
        <StatCard label="Outstanding"      value={formatMoney(sm.total_pending    || 0)} icon="clock"       color="amber" sublabel={`${sm.pending_count || 0} pending`} />
        <StatCard label="Waived / Written Off" value={formatMoney(sm.total_waived || 0)} icon="archive"     color="slate" sublabel={`${sm.waived_count  || 0} waived`} />
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          {['all', 'paid', 'pending', 'waived'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={['px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                status === s ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60'].join(' ')}>
              {cap(s)}
            </button>
          ))}
          <span className="text-gray-300 dark:text-gray-600">|</span>
          {/* Visit type filter */}
          {['all', 'consultation', 'injection', 'family_planning', 'direct_lab'].map(vt => (
            <button key={vt} onClick={() => setVisitType(vt)}
              className={['px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                visitType === vt ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60'].join(' ')}>
              {vt === 'all' ? 'All Types' : VISIT_TYPE_LABELS[vt] || cap(vt)}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient name…"
            className="w-full h-9 pl-9 pr-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
          />
        </div>
      </Card>

      {/* Bills table */}
      <Card className="overflow-hidden">
        <CardHeader title="Bills" subtitle={`${bills.length} of ${q.data?.total || 0} records`} />
        {bills.length === 0 ? (
          <EmptyState icon="receipt" title="No bills" description="Billable visits will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Patient</Th>
                  <Th>Visit Type</Th>
                  <Th>Doctor</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Balance</Th>
                  <Th align="center">Status</Th>
                  <Th align="right">Date</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {bills.map(b => {
                  const balance = b.balance || 0
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{b.patient_name}</p>
                        <p className="text-[10px] text-gray-400">#{b.visit_id} · {b.patient_phone || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={VISIT_TYPE_BADGES[b.visit_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                          {VISIT_TYPE_LABELS[b.visit_type] || cap(b.visit_type) || '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-gray-300">{b.doctor || '—'}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[12px] text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMoney(b.paid_amount)}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums">
                        {balance > 0
                          ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatMoney(balance)}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={badgeClass(b.fee_status)}>{cap(b.fee_status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] text-gray-400">{formatDate(b.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedBill(b)}
                          className="px-2 py-1 rounded text-[11px] font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 inline-flex items-center gap-1"
                        >
                          <Icon name="eye" size={11} /> View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedBill && <BillDetailModal bill={selectedBill} onClose={() => setSelectedBill(null)} />}
    </div>
  )
}

function BillDetailModal({ bill, onClose }) {
  const balance = bill.balance || 0
  return (
    <ModalShell
      title={`Bill #${bill.id}`}
      subtitle={`${bill.patient_name} · Visit #${bill.visit_id}`}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] text-white hover:bg-[#155a9f]">
          Close
        </button>
      }
    >
      <div className="space-y-4">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={VISIT_TYPE_BADGES[bill.visit_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
            {VISIT_TYPE_LABELS[bill.visit_type] || cap(bill.visit_type) || '—'}
          </Badge>
          <Badge className={badgeClass(bill.visit_status)}>{cap(bill.visit_status || '').replace(/_/g, ' ')}</Badge>
          <Badge className={badgeClass(bill.fee_status)}>{cap(bill.fee_status)}</Badge>
          {bill.doctor && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Dr. {bill.doctor}</Badge>}
        </div>

        {/* Arrived */}
        {bill.arrived_at && (
          <p className="text-[11px] text-gray-400">
            Arrived: {formatDateTime(bill.arrived_at)} · {timeAgo(bill.arrived_at)}
          </p>
        )}

        {/* Fee breakdown */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Fee Breakdown</p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {(bill.items || []).map(it => (
                <div key={it.name} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-[13px] text-gray-700 dark:text-gray-200">{it.name}</span>
                    <Badge className={`ml-2 ${badgeClass(it.status)}`}>{cap(it.status)}</Badge>
                  </div>
                  <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(it.amount)}</span>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/30 border-t border-gray-200 dark:border-gray-700/60 px-3 py-2.5 space-y-1">
              <div className="flex justify-between text-[13px] font-bold">
                <span className="text-gray-900 dark:text-gray-100">Total</span>
                <span className="tabular-nums">{formatMoney(bill.total_amount)}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-emerald-600 dark:text-emerald-400">Paid</span>
                <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatMoney(bill.paid_amount)}</span>
              </div>
              {balance > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-amber-600 dark:text-amber-400">Balance</span>
                  <span className="text-amber-700 dark:text-amber-400 tabular-nums">{formatMoney(balance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment history */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
            Payment History ({(bill.payments || []).length} payment{(bill.payments || []).length !== 1 ? 's' : ''})
          </p>
          {(bill.payments || []).length === 0 ? (
            <p className="text-[12px] text-gray-400">No payments collected yet.</p>
          ) : (
            <div className="space-y-2">
              {bill.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/20 px-3 py-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatMoney(p.amount)}
                      </span>
                      <Badge className={METHOD_BADGES[p.method] || METHOD_BADGES.other}>{cap(p.method)}</Badge>
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                        Stage {p.stage}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {p.cashier ? `By ${p.cashier}` : ''}
                      {p.reference ? ` · Ref: ${p.reference}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400">{formatDateTime(p.paid_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-TAB 3: PAYMENTS LEDGER
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentsSubTab() {
  const [period, setPeriod] = useState('this_month')
  const [method, setMethod] = useState('all')
  const [stage,  setStage]  = useState('all')
  const [showOtc, setShowOtc] = useState(false)

  const q = useQuery({
    queryKey: ['admin', 'payments', period, method, stage],
    queryFn: () => {
      const params = new URLSearchParams({ period, method, stage })
      return api.get(`/api/admin/payments?${params}`)
    },
    staleTime: 30000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message} onRetry={q.refetch} />

  const payments  = q.data?.payments  || []
  const otcSales  = q.data?.otc_sales || []
  const sm        = q.data?.summary   || {}
  const bm        = sm.by_method      || {}

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Collected"  value={formatMoney(sm.total_collected  || 0)} icon="dollarSign" color="green" />
        <StatCard label="Cash"             value={formatMoney(bm.cash             || 0)} icon="dollarSign" color="green" />
        <StatCard label="M-Pesa"           value={formatMoney(bm.mpesa            || 0)} icon="phone"      color="blue"  />
        <StatCard label="Insurance"        value={formatMoney(bm.insurance        || 0)} icon="shield"     color="purple"/>
        <StatCard label="OTC Pharmacy"     value={formatMoney(sm.total_otc        || 0)} icon="pillBottle" color="cyan"  />
      </div>

      {/* Stage breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Stage 1 Payments" value={formatMoney(sm.stage1 || 0)} icon="receipt"    color="slate" sublabel="consultation fees" />
        <StatCard label="Stage 2 Payments" value={formatMoney(sm.stage2 || 0)} icon="dollarSign" color="slate" sublabel="lab & medication fees" />
      </div>

      {/* Method bar */}
      <Card className="p-4">
        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Payment Method Breakdown</h3>
        <MethodBar byMethod={bm} total={sm.total_collected || 0} />
      </Card>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'cash', 'mpesa', 'insurance', 'other'].map(m => (
            <button key={m} onClick={() => setMethod(m)}
              className={['px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                method === m ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60'].join(' ')}>
              {m === 'all' ? 'All Methods' : cap(m)}
            </button>
          ))}
          <span className="text-gray-300 dark:text-gray-600">|</span>
          {['all', '1', '2'].map(s => (
            <button key={s} onClick={() => setStage(s)}
              className={['px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                stage === s ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60'].join(' ')}>
              {s === 'all' ? 'All Stages' : `Stage ${s}`}
            </button>
          ))}
        </div>
      </Card>

      {/* Clinic payments table */}
      <Card className="overflow-hidden">
        <CardHeader title="Clinic Payment Records" subtitle={`${payments.length} payments`} />
        {payments.length === 0 ? (
          <EmptyState icon="dollarSign" title="No clinic payments" description="Collected payments will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Patient</Th>
                  <Th>Visit Type</Th>
                  <Th align="right">Amount</Th>
                  <Th align="center">Method</Th>
                  <Th align="center">Stage</Th>
                  <Th>Reference</Th>
                  <Th>Cashier</Th>
                  <Th>Time</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{p.patient_name}</p>
                      <p className="text-[10px] text-gray-400">#{p.visit_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      {p.visit_type && (
                        <Badge className={VISIT_TYPE_BADGES[p.visit_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                          {VISIT_TYPE_LABELS[p.visit_type] || cap(p.visit_type)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={METHOD_BADGES[p.method] || METHOD_BADGES.other}>{cap(p.method)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={p.stage === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}>
                        Stage {p.stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-500 dark:text-gray-400">{p.reference || '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-gray-300">{p.cashier || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] text-gray-600 dark:text-gray-300">{formatTime(p.paid_at)}</p>
                      <p className="text-[10px] text-gray-400">{formatDate(p.paid_at)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* OTC sales table */}
      {otcSales.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            title="OTC Pharmacy Sales"
            subtitle={`${otcSales.length} sales · ${formatMoney(sm.total_otc || 0)} total`}
            action={
              <button onClick={() => setShowOtc(v => !v)} className="text-[12px] text-[#1a6cbf] dark:text-blue-400">
                {showOtc ? 'Hide' : 'Show'}
              </button>
            }
          />
          {showOtc && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <Th>Receipt</Th>
                    <Th>Customer</Th>
                    <Th align="right">Total</Th>
                    <Th align="center">Method</Th>
                    <Th>Sold By</Th>
                    <Th>Time</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {otcSales.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3 text-[12px] font-mono text-gray-600 dark:text-gray-300">{s.receipt}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-900 dark:text-gray-100">{s.patient_name}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatMoney(s.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={METHOD_BADGES[s.method] || METHOD_BADGES.other}>{cap(s.method)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-gray-300">{s.cashier || '—'}</td>
                      <td className="px-4 py-3 text-[12px] text-gray-400">{formatDateTime(s.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-TABS 4 & 5: EXPENSES (Clinic / Pharmacy)
// ═══════════════════════════════════════════════════════════════════════════════

function ExpensesSubTab({ domain, title }) {
  const queryClient = useQueryClient()
  const { user }    = useAuthStore()
  const [period, setPeriod]       = useState('this_month')
  const [category, setCategory]   = useState('all')
  const [showModal, setShowModal] = useState(false)

  const QK      = ['admin', 'expenses', domain, period, category]
  const QK_STATS = ['admin', 'expenses-stats', domain, period]

  const q = useQuery({
    queryKey: QK,
    queryFn:  () => api.get(`/api/expenses?domain=${domain}&period=${period}${category !== 'all' ? `&category=${category}` : ''}`),
    staleTime: 15000,
  })
  const statsQ = useQuery({
    queryKey: QK_STATS,
    queryFn:  () => api.get(`/api/expenses/stats?domain=${domain}&period=${period}`),
    staleTime: 15000,
  })

  const addMut = useMutation({
    mutationFn: (body) => api.post('/api/expenses', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'expenses', domain] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'expenses-stats', domain] })
      toast.success('Expense recorded')
    },
    onError: (e) => toast.error(e.message || 'Could not record expense'),
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/expenses/${id}?domain=${domain}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'expenses', domain] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'expenses-stats', domain] })
      toast.success('Expense deleted')
    },
    onError: (e) => toast.error(e.message || 'Could not delete expense'),
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message} onRetry={q.refetch} />

  const expenses   = q.data?.expenses || []
  const stats      = statsQ.data      || {}
  const byCategory = stats.by_category || {}

  // Build category list for filter pills
  const categories = ['all', ...Object.keys(byCategory)]

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={`${cap(period === 'this_month' ? 'This Month' : period)} Expenses`}
          value={formatMoney(stats.total_amount_period || 0)}
          icon="trendDown" color="red"
          sublabel={`${stats.entry_count_period || 0} entries`}
        />
        <StatCard label="Today"
          value={formatMoney(stats.today_amount || 0)}
          icon="clock" color="amber"
          sublabel={`${stats.today_count || 0} entries today`}
        />
        <StatCard label="All-Time Total"
          value={formatMoney(stats.total_amount || 0)}
          icon="archive" color="slate"
          sublabel={`${stats.entry_count || 0} total entries`}
        />
        <StatCard label="Domain"
          value={cap(domain)}
          icon={domain === 'pharmacy' ? 'pillBottle' : 'building'}
          color="purple"
          sublabel={domain === 'clinic' ? 'clinic-wide operations' : 'pharmacy operations'}
        />
      </div>

      {/* Category breakdown bars */}
      {Object.keys(byCategory).length > 0 && (
        <Card className="p-5">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Expenses by Category</h3>
          <div className="space-y-2">
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
              const pct = stats.total_amount_period > 0 ? (amount / stats.total_amount_period) * 100 : 0
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[12px] text-gray-600 dark:text-gray-300 capitalize">{cat}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatMoney(amount)}</span>
                      <span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        {categories.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={['px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors capitalize',
                  category === cat ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60'].join(' ')}>
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Expenses table */}
      <Card className="overflow-hidden">
        <CardHeader
          title={title}
          subtitle={`${expenses.length} record${expenses.length === 1 ? '' : 's'}`}
          action={
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-1.5"
            >
              <Icon name="plus" size={13} /> Record Expense
            </button>
          }
        />
        {expenses.length === 0 ? (
          <EmptyState icon="trendDown" title={`No ${title.toLowerCase()} recorded`} description="Record an expense to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th align="right">Amount</Th>
                  <Th>Recorded By</Th>
                  <Th>Date</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{e.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      {e.category
                        ? <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300 capitalize">{e.category}</Badge>
                        : <span className="text-[11px] text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">
                      −{formatMoney(e.amount)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-gray-300">{e.recorder?.username || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] text-gray-600 dark:text-gray-300">{formatDate(e.incurred_at)}</p>
                      <p className="text-[10px] text-gray-400">{timeAgo(e.incurred_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${e.description}" (${formatMoney(e.amount)})?`)) {
                            delMut.mutate(e.id)
                          }
                        }}
                        disabled={delMut.isPending}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 disabled:opacity-40"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <ExpenseModal
          domain={domain}
          recordedBy={user?.name || user?.username || 'Admin'}
          loading={addMut.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={async (body) => {
            await addMut.mutateAsync(body)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

function ExpenseModal({ domain, recordedBy, loading, onClose, onSubmit }) {
  const [description, setDescription] = useState('')
  const [amount,      setAmount]       = useState('')
  const [category,    setCategory]     = useState('')
  const [date,        setDate]         = useState(() => new Date().toISOString().slice(0, 10))

  const EXPENSE_CATEGORIES = {
    clinic:   ['salaries', 'utilities', 'supplies', 'rent', 'maintenance', 'transport', 'other'],
    pharmacy: ['purchase', 'utilities', 'supplies', 'maintenance', 'transport', 'other'],
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!description.trim()) { toast.error('Description is required.'); return }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Amount must be a positive number.'); return }
    await onSubmit({ domain, description: description.trim(), amount: amt, category: category || null, incurred_at: date })
  }

  return (
    <ModalShell
      title="Record Expense"
      subtitle={`${cap(domain)} domain`}
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
            {loading ? 'Saving…' : 'Record'}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Description *">
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Electricity bill – June" className={inputCls} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (KSh) *">
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {(EXPENSE_CATEGORIES[domain] || []).map(c => (
                <option key={c} value={c}>{cap(c)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Icon name="info" size={12} />
          Recorded by <span className="font-medium text-gray-600 dark:text-gray-300">{recordedBy}</span>
        </p>
      </form>
    </ModalShell>
  )
}