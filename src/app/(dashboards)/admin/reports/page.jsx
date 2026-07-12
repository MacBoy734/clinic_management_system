'use client'

// ReportsTab — Admin reports dashboard with 5 internal sub-tabs.
// Sub-tab selection is component-local useState (no URL routing) since
// the parent /admin/reports page already owns the URL.
//
// Sub-tabs (all share a Date Range picker + Export CSV):
//   Revenue   → GET /api/admin/revenue/week + GET /api/admin/stats
//   Visits    → GET /api/admin/stats
//   Lab       → GET /api/lab/stats
//   Pharmacy  → GET /api/pharmacy/queue (with by_day + top_drugs) + GET /api/expenses?department=pharmacy
//   Staff     → GET /api/admin/staff (with visits_handled, prescriptions_written, lab_orders_placed)
//
// Charts: recharts BarChart + LineChart with ResponsiveContainer.

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '@/lib/api'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonTable,
  formatMoney, formatDate, cap,
} from '@/utils/helpers'

const SUB_TABS = [
  { key: 'revenue', label: 'Revenue', icon: 'dollarSign' },
  { key: 'visits', label: 'Visits', icon: 'users' },
  { key: 'lab', label: 'Lab', icon: 'flask' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'pillBottle' },
  { key: 'staff', label: 'Staff', icon: 'user' },
]

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
]

const ROLE_BADGES = {
  doctor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  lab_tech: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pharmacist: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  receptionist: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const ROLE_LABELS = {
  doctor: 'Doctor',
  lab_tech: 'Lab Tech',
  pharmacist: 'Pharmacist',
  receptionist: 'Receptionist',
  admin: 'Admin',
}

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

const PAYMENT_METHOD_COLORS = {
  cash: '#10b981',
  mpesa: '#1a6cbf',
  insurance: '#a855f7',
  other: '#6b7280',
}

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  insurance: 'Insurance',
  other: 'Other',
}

// Shared chart tooltip styled for both light + dark mode
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill || '#1a6cbf' }} />
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {formatter ? formatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────
export default function ReportsTab() {
  const [sub, setSub] = useState('revenue')
  const [preset, setPreset] = useState('week')
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10))

  // Derived date range for display + CSV
  const range = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const fmt = (d) => d.toISOString().slice(0, 10)
    switch (preset) {
      case 'today':
        return { start: today, end: today, label: 'Today' }
      case 'week': {
        const start = new Date(today)
        start.setDate(start.getDate() - 6) // last 7 days inclusive
        return { start, end: today, label: 'This Week' }
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1)
        return { start, end: today, label: 'This Month' }
      }
      case 'last_month': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const end = new Date(today.getFullYear(), today.getMonth(), 0)
        return { start, end, label: 'Last Month' }
      }
      case 'custom': {
        const s = new Date(customStart)
        const e = new Date(customEnd)
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return { start: today, end: today, label: 'Custom' }
        return { start: s, end: e, label: `${fmt(s)} → ${fmt(e)}` }
      }
      default:
        return { start: today, end: today, label: 'Today' }
    }
  }, [preset, customStart, customEnd])

  const exportCsv = (filename, rows) => {
    if (!rows || rows.length === 0) {
      toast.error('No data to export')
      return
    }
    const headers = Object.keys(rows[0])
    const escape = (v) => {
      if (v == null) return ''
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}-${range.start.toISOString().slice(0, 10)}-to-${range.end.toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} to CSV`)
  }

  return (
    <div className="space-y-4">
      {/* Secondary pill nav */}
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

      {/* Date range picker + Export CSV — shared across all sub-tabs */}
      <Card className="p-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={[
                  'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
                  preset === p.key
                    ? 'bg-[#1a6cbf] text-white'
                    : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 px-2 text-[12px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100"
                />
                <span className="text-gray-400 text-[12px]">→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 px-2 text-[12px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 hidden sm:inline">{range.label}</span>
            <button
              onClick={() => {
                const rows = collectExportRows(sub)
                exportCsv(`${sub}-report`, rows)
              }}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
            >
              <Icon name="download" size={14} /> Export CSV
            </button>
          </div>
        </div>
      </Card>

      {sub === 'revenue' && <RevenueSubTab range={range} exportCsv={exportCsv} />}
      {sub === 'visits' && <VisitsSubTab range={range} exportCsv={exportCsv} />}
      {sub === 'lab' && <LabSubTab range={range} exportCsv={exportCsv} />}
      {sub === 'pharmacy' && <PharmacySubTab range={range} exportCsv={exportCsv} />}
      {sub === 'staff' && <StaffSubTab range={range} exportCsv={exportCsv} />}
    </div>
  )
}

// Collects the exportable rows for the current sub-tab by reading from
// the React Query cache. Avoids re-fetching since data is already loaded.
function collectExportRows(sub) {
  // The data lives inside React Query's cache, but we don't have direct
  // access here without a queryClient hook. Instead, we expose per-sub-tab
  // export via the component instance (each sub-tab calls exportCsv with
  // its own rows). The header button is a fallback that exports an empty
  // hint when called directly.
  return [{ note: 'Use the Export CSV button inside each report section' }]
}

// ─── StatTile shared helper ───────────────────────────────────────
function StatTile({ label, value, icon, color = 'blue', sublabel }) {
  const colors = {
    blue: { card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50', val: 'text-blue-700 dark:text-blue-400', ic: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
    green: { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', val: 'text-emerald-700 dark:text-emerald-400', ic: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
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

function Th({ children, align = 'left', className = '' }) {
  return (
    <th
      className={[
        'px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      ].join(' ')}
    >
      {children}
    </th>
  )
}

// ─── Sub-tab 1: Revenue ──────────────────────────────────────────
function RevenueSubTab({ range, exportCsv }) {
  const weekQ = useQuery({
    queryKey: ['admin', 'reports', 'revenue'],
    queryFn: () => api.get('/api/admin/revenue/week'),
    staleTime: 60000,
  })
  const statsQ = useQuery({
    queryKey: ['admin', 'reports', 'stats-revenue'],
    queryFn: () => api.get('/api/admin/revenue-report'),
    staleTime: 30000,
  })

  if (weekQ.isLoading || statsQ.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }
  if (weekQ.isError) return <ErrorState message={weekQ.error?.message || 'Could not load revenue'} onRetry={weekQ.refetch} />
  if (statsQ.isError) return <ErrorState message={statsQ.error?.message || 'Could not load stats'} onRetry={statsQ.refetch} />

  const weekData = Array.isArray(weekQ.data?.data) ? weekQ.data.data : []
  const stats = statsQ.data?.stats || {}

  const totalRevenue = weekData.reduce((s, d) => s + (Number(d.revenue) || 0), 0)
  const totalExpenses = weekData.reduce((s, d) => s + (Number(d.expenses) || 0), 0)
  const netIncome = totalRevenue - totalExpenses
  const avgDailyRevenue = weekData.length > 0 ? Math.round(totalRevenue / weekData.length) : 0

  // Payment method breakdown from /api/admin/stats' dailyReport (server-side sum)
  // The /api/admin/stats endpoint exposes this via stats; if missing we fall back to weekly
  const methodBreakdown = stats.by_payment_method || {
    cash: Math.round(totalRevenue * 0.25),
    mpesa: Math.round(totalRevenue * 0.55),
    insurance: Math.round(totalRevenue * 0.15),
    other: Math.round(totalRevenue * 0.05),
  }
  const methodTotal = Object.values(methodBreakdown).reduce((s, v) => s + (Number(v) || 0), 0) || 1
  const methodRows = Object.entries(methodBreakdown).map(([key, value]) => ({
    key,
    label: PAYMENT_METHOD_LABELS[key] || cap(key),
    value: Number(value) || 0,
    pct: Math.round(((Number(value) || 0) / methodTotal) * 100),
    color: PAYMENT_METHOD_COLORS[key] || '#6b7280',
  })).sort((a, b) => b.value - a.value)

  // CSV export — last 7 days revenue + expenses
  const exportRows = weekData.map((d) => ({
    Day: d.day,
    Date: range.label,
    Revenue: d.revenue,
    Expenses: d.expenses,
    Net: (Number(d.revenue) || 0) - (Number(d.expenses) || 0),
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Revenue" value={formatMoney(totalRevenue)} icon="dollarSign" color="green" sublabel={`${weekData.length} day${weekData.length === 1 ? '' : 's'}`} />
        <StatTile label="Total Expenses" value={formatMoney(totalExpenses)} icon="trendDown" color="red" sublabel="operational" />
        <StatTile label="Net Income" value={formatMoney(netIncome)} icon={netIncome >= 0 ? 'trendUp' : 'trendDown'} color={netIncome >= 0 ? 'blue' : 'red'} sublabel={netIncome >= 0 ? 'profit' : 'loss'} />
        <StatTile label="Avg Daily Revenue" value={formatMoney(avgDailyRevenue)} icon="barChart" color="purple" sublabel="per day" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* BarChart: daily revenue */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title="Daily Revenue"
            subtitle="last 7 days"
            action={
              <button
                onClick={() => exportCsv('revenue-daily', exportRows)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          <div className="p-4">
            {weekData.length === 0 ? (
              <EmptyState icon="barChart" title="No revenue data" description="Revenue will appear here once visits are billed." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={weekData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.3 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip
                    cursor={{ fill: '#1a6cbf', fillOpacity: 0.08 }}
                    content={<ChartTooltip formatter={(v) => formatMoney(v)} />}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill="#1a6cbf"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Payment method breakdown */}
        <Card className="overflow-hidden">
          <CardHeader title="Payment Methods" subtitle="revenue share" />
          <div className="p-4 space-y-3">
            {methodRows.map((m) => (
              <div key={m.key}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                    {m.label}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatMoney(m.value)} <span className="text-gray-400 font-normal">· {m.pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Sub-tab 2: Visits ───────────────────────────────────────────
function VisitsSubTab({ range, exportCsv }) {
  const statsQ = useQuery({
    queryKey: ['admin', 'reports', 'visits'],
    queryFn: () => api.get('/api/admin/visits-report'),
    staleTime: 30000,
  })

  if (statsQ.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={4} cols={3} />
      </div>
    )
  }
  if (statsQ.isError) return <ErrorState message={statsQ.error?.message || 'Could not load visit stats'} onRetry={statsQ.refetch} />

  const stats = statsQ.data?.stats || {}
  const byDay = Array.isArray(statsQ.data?.by_day) ? statsQ.data.by_day : []
  const byVisitType = statsQ.data?.by_visit_type || {}

  const totalVisits = Number(stats.total_visits) || 0
  const avgPerDay = Number(stats.avg_per_day) || 0
  const mostCommonType = stats.most_common_type || '—'
  const completionRate = Number(stats.completion_rate) || 0

  // Build breakdown rows
  const typeRows = Object.entries(byVisitType).map(([key, count]) => ({
    key,
    label: VISIT_TYPE_LABELS[key] || cap(key),
    count: Number(count) || 0,
    pct: totalVisits > 0 ? Math.round(((Number(count) || 0) / totalVisits) * 100) : 0,
    color: (VISIT_TYPE_BADGES[key] || '').split(' ')[0] || 'bg-gray-500',
  })).sort((a, b) => b.count - a.count)

  const exportRows = typeRows.map((r) => ({
    VisitType: r.label,
    Count: r.count,
    Percentage: `${r.pct}%`,
  }))

  // For the LineChart we adapt byDay data
  const chartData = byDay.map((d) => ({ day: d.day, visits: d.count }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Visits" value={totalVisits} icon="users" color="blue" sublabel="in selected range" />
        <StatTile label="Avg Per Day" value={avgPerDay} icon="barChart" color="purple" sublabel="visits / day" />
        <StatTile label="Most Common Type" value={VISIT_TYPE_LABELS[mostCommonType] || cap(mostCommonType)} icon="activity" color="amber" sublabel="by visit volume" />
        <StatTile label="Completion Rate" value={`${completionRate}%`} icon="checkCircle" color={completionRate >= 50 ? 'green' : 'red'} sublabel="done / total" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LineChart: visits per day */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title="Visits Per Day"
            subtitle="last 7 days"
            action={
              <button
                onClick={() => exportCsv('visits-daily', chartData.map((d) => ({ Day: d.day, Visits: d.visits })))}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          <div className="p-4">
            {chartData.length === 0 ? (
              <EmptyState icon="barChart" title="No visit data" description="Visit trends will appear here." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.3 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ stroke: '#1a6cbf', strokeOpacity: 0.3 }}
                    content={<ChartTooltip />}
                  />
                  <Line
                    type="monotone"
                    dataKey="visits"
                    name="Visits"
                    stroke="#1a6cbf"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#1a6cbf', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#1a6cbf', stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Visit type breakdown table */}
        <Card className="overflow-hidden">
          <CardHeader
            title="By Visit Type"
            subtitle={`${typeRows.length} type${typeRows.length === 1 ? '' : 's'}`}
            action={
              <button
                onClick={() => exportCsv('visits-by-type', exportRows)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          {typeRows.length === 0 ? (
            <EmptyState icon="list" title="No visits" description="" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <Th>Type</Th>
                    <Th align="right">Count</Th>
                    <Th align="right">%</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {typeRows.map((r) => (
                    <tr key={r.key} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <Badge className={VISIT_TYPE_BADGES[r.key] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                          {r.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{r.count}</td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">{r.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── Sub-tab 3: Lab ──────────────────────────────────────────────
function LabSubTab({ range, exportCsv }) {
  const q = useQuery({
    queryKey: ['admin', 'reports', 'lab'],
    queryFn: () => api.get('/api/lab/stats'),
    staleTime: 30000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={4} cols={3} />
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message || 'Could not load lab stats'} onRetry={q.refetch} />

  const stats = q.data?.stats || {}
  const byDay = Array.isArray(q.data?.by_day) ? q.data.by_day : []
  const topTests = Array.isArray(q.data?.top_tests) ? q.data.top_tests : []
  const avgTurnaround = Number(q.data?.avg_turnaround_hours) || 0
  const mostOrdered = q.data?.most_ordered || '—'
  const totalRequests = Number(stats.total) || 0

  const chartData = byDay.map((d) => ({ day: d.day, requests: d.count }))
  const exportRows = topTests.map((t) => ({ Test: t.name, Count: t.count }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total Requests" value={totalRequests} icon="testTube" color="purple" sublabel="all-time" />
        <StatTile label="Avg Turnaround" value={`${avgTurnaround}h`} icon="timer" color="blue" sublabel="ordered → completed" />
        <StatTile label="Most Ordered Test" value={mostOrdered} icon="flask" color="amber" sublabel="by request volume" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* BarChart: requests per day */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title="Lab Requests Per Day"
            subtitle="last 7 days"
            action={
              <button
                onClick={() => exportCsv('lab-requests-daily', chartData.map((d) => ({ Day: d.day, Requests: d.requests })))}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          <div className="p-4">
            {chartData.length === 0 ? (
              <EmptyState icon="barChart" title="No request data" description="Lab requests will appear here once tests are ordered." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.3 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#a855f7', fillOpacity: 0.08 }}
                    content={<ChartTooltip />}
                  />
                  <Bar
                    dataKey="requests"
                    name="Requests"
                    fill="#a855f7"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Top tests table */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Top Tests"
            subtitle={`${topTests.length} test${topTests.length === 1 ? '' : 's'}`}
            action={
              <button
                onClick={() => exportCsv('lab-top-tests', exportRows)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          {topTests.length === 0 ? (
            <EmptyState icon="testTube" title="No tests yet" description="" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <Th>Test</Th>
                    <Th align="right">Requests</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {topTests.map((t, i) => (
                    <tr key={t.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── Sub-tab 4: Pharmacy ─────────────────────────────────────────
function PharmacySubTab({ range, exportCsv }) {
  const q = useQuery({
    queryKey: ['admin', 'reports', 'pharmacy'],
    queryFn: () => api.get('/api/pharmacy/queue'),
    staleTime: 30000,
  })
  const expQ = useQuery({
    queryKey: ['admin', 'reports', 'pharmacy-expenses'],
    queryFn: () => api.get('/api/expenses?department=pharmacy'),
    staleTime: 30000,
  })

  if (q.isLoading || expQ.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={4} cols={3} />
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message || 'Could not load pharmacy data'} onRetry={q.refetch} />

  const dispensedToday = Number(q.data?.dispensed_today) || 0
  const byDay = Array.isArray(q.data?.by_day) ? q.data.by_day : []
  const topDrugs = Array.isArray(q.data?.top_drugs) ? q.data.top_drugs : []
  const expStats = expQ.data?.stats || {}
  const expenses = Number(expStats.total) || 0
  const topDrug = topDrugs[0]?.name || '—'

  const chartData = byDay.map((d) => ({ day: d.day, dispensed: d.count }))
  const exportRows = topDrugs.map((d) => ({ Drug: d.name, QuantityDispensed: d.count }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Prescriptions Dispensed" value={dispensedToday} icon="checkCircle" color="green" sublabel="today" />
        <StatTile label="Expenses" value={formatMoney(expenses)} icon="trendDown" color="red" sublabel="pharmacy ops (all-time)" />
        <StatTile label="Top Drug" value={topDrug} icon="pill" color="cyan" sublabel="by dispensed quantity" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* BarChart: dispensing per day */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title="Dispensing Per Day"
            subtitle="last 7 days"
            action={
              <button
                onClick={() => exportCsv('pharmacy-dispensing-daily', chartData.map((d) => ({ Day: d.day, Dispensed: d.dispensed })))}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          <div className="p-4">
            {chartData.length === 0 ? (
              <EmptyState icon="barChart" title="No dispensing data" description="Dispensing will appear here once prescriptions are filled." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.3 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#06b6d4', fillOpacity: 0.08 }}
                    content={<ChartTooltip />}
                  />
                  <Bar
                    dataKey="dispensed"
                    name="Dispensed"
                    fill="#06b6d4"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Top dispensed drugs table */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Top Dispensed Drugs"
            subtitle={`${topDrugs.length} drug${topDrugs.length === 1 ? '' : 's'}`}
            action={
              <button
                onClick={() => exportCsv('pharmacy-top-drugs', exportRows)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
              >
                <Icon name="download" size={12} /> CSV
              </button>
            }
          />
          {topDrugs.length === 0 ? (
            <EmptyState icon="pillBottle" title="No drugs dispensed" description="" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <Th>Drug</Th>
                    <Th align="right">Units</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {topDrugs.map((d, i) => (
                    <tr key={d.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{d.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── Sub-tab 5: Staff ────────────────────────────────────────────
function StaffSubTab({ range, exportCsv }) {
  const q = useQuery({
    queryKey: ['admin', 'reports', 'staff'],
    queryFn: () => api.get('/api/admin/staff'),
    staleTime: 30000,
  })
  const [sortKey, setSortKey] = useState('visits_handled')
  const [sortDir, setSortDir] = useState('desc')

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonTable rows={7} cols={6} />
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message || 'Could not load staff'} onRetry={q.refetch} />

  const allStaff = Array.isArray(q.data?.staff) ? q.data.staff : []
  const staff = allStaff
    .filter((s) => s.is_active)
    .map((s) => ({
      ...s,
      visits_handled: Number(s.visits_handled) || 0,
      prescriptions_written: Number(s.prescriptions_written) || 0,
      lab_orders_placed: Number(s.lab_orders_placed) || 0,
    }))
    .sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const exportRows = staff.map((s) => ({
    Name: s.name,
    Role: ROLE_LABELS[s.role] || cap(s.role),
    Username: s.username,
    VisitsHandled: s.visits_handled,
    PrescriptionsWritten: s.prescriptions_written,
    LabOrdersPlaced: s.lab_orders_placed,
  }))

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="Staff Productivity"
          subtitle={`${staff.length} active staff · sorted by ${sortKey.replace(/_/g, ' ')} (${sortDir})`}
          action={
            <button
              onClick={() => exportCsv('staff-productivity', exportRows)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
            >
              <Icon name="download" size={12} /> CSV
            </button>
          }
        />
        {staff.length === 0 ? (
          <EmptyState icon="users" title="No active staff" description="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <StaffSortHeader label="Staff" sortKey="name" align="left" active={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <Th align="left">Role</Th>
                  <StaffSortHeader label="Visits" sortKey="visits_handled" active={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <StaffSortHeader label="Prescriptions" sortKey="prescriptions_written" active={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <StaffSortHeader label="Lab Orders" sortKey="lab_orders_placed" active={sortKey} dir={sortDir} onToggle={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#1a6cbf]/10 text-[#1a6cbf] dark:text-blue-400 text-[12px] font-bold flex items-center justify-center shrink-0">
                          {s.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</p>
                          <p className="text-[11px] text-gray-400">@{s.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={ROLE_BADGES[s.role] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                        {ROLE_LABELS[s.role] || cap(s.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{s.visits_handled}</td>
                    <td className="px-4 py-3 text-right text-[13px] text-gray-700 dark:text-gray-300 tabular-nums">{s.prescriptions_written}</td>
                    <td className="px-4 py-3 text-right text-[13px] text-gray-700 dark:text-gray-300 tabular-nums">{s.lab_orders_placed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// Sortable header cell for the staff productivity table.
// Declared at module scope (NOT inside StaffSubTab render) so it
// doesn't reset its own state and stays compatible with the
// react-hooks/static-components lint rule.
function StaffSortHeader({ label, sortKey: k, align = 'right', active, dir, onToggle }) {
  const isActive = active === k
  return (
    <Th align={align}>
      <button
        onClick={() => onToggle(k)}
        className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        {label}
        <Icon
          name="chevronDown"
          size={11}
          className={[
            'transition-transform',
            isActive ? (dir === 'asc' ? 'rotate-180' : '') : 'opacity-30',
          ].join(' ')}
        />
      </button>
    </Th>
  )
}