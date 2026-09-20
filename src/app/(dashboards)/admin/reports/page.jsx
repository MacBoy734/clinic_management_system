'use client'

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import api from '@/lib/api'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonTable,
  formatMoney, cap,
} from '@/utils/helpers'

// TODO: every referral listed to show how much the client paid and lab tests they took

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'visits', label: 'Visits & Flow', icon: 'users', color: '#1a6cbf' },
  { key: 'lab', label: 'Lab Analytics', icon: 'flask', color: '#7c3aed' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'pillBottle', color: '#06b6d4' },
]

const PRESETS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'yesterday', label: 'Yesterday', days: 1, offset: -1 },
  { key: '7d', label: 'Last 7 Days', days: 7 },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: 'this_month', label: 'This Month', type: 'month' },
  { key: 'last_month', label: 'Last Month', type: 'last_month' },
  { key: 'custom', label: 'Custom', type: 'custom' },
]

const VISIT_TYPE_LABELS = {
  consultation: 'Consultation',
  injection: 'Procedure',
  family_planning: 'Family Planning',
  direct_lab: 'Direct Lab',
}

const VISIT_TYPE_COLORS = {
  consultation: '#1a6cbf',
  injection: '#f59e0b',
  family_planning: '#ec4899',
  direct_lab: '#7c3aed',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtISO = (d) => d.toISOString().slice(0, 10)

function getRange(preset, customStart, customEnd) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let start, end, label, days

  switch (preset) {
    case 'today':
      start = end = new Date(today)
      days = 1
      label = 'Today'
      break
    case 'yesterday':
      end = new Date(today)
      end.setDate(end.getDate() - 1)
      start = new Date(end)
      days = 1
      label = 'Yesterday'
      break
    case '7d':
      end = new Date(today)
      start = new Date(today)
      start.setDate(start.getDate() - 6)
      days = 7
      label = 'Last 7 Days'
      break
    case '30d':
      end = new Date(today)
      start = new Date(today)
      start.setDate(start.getDate() - 29)
      days = 30
      label = 'Last 30 Days'
      break
    case 'this_month':
      start = new Date(today.getFullYear(), today.getMonth(), 1)
      end = new Date(today)
      days = Math.round((end - start) / 86400000) + 1
      label = 'This Month'
      break
    case 'last_month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      end = new Date(today.getFullYear(), today.getMonth(), 0)
      days = Math.round((end - start) / 86400000) + 1
      label = 'Last Month'
      break
    case 'custom': {
      const s = new Date(customStart)
      const e = new Date(customEnd)
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) {
        start = end = new Date(today)
        days = 1
      } else {
        start = s
        end = e
        days = Math.round((e - s) / 86400000) + 1
      }
      label = `${fmtISO(start)} → ${fmtISO(end)}`
      break
    }
    default:
      start = end = new Date(today)
      days = 1
      label = 'Today'
  }

  return {
    start,
    end,
    days,
    label,
    apiRange: preset,
    startISO: fmtISO(start),
    endISO: fmtISO(end),
  }
}

function getCompareRange(current) {
  const duration = current.days
  const end = new Date(current.start)
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - duration + 1)
  return {
    start,
    end,
    days: duration,
    label: `${fmtISO(start)} → ${fmtISO(end)}`,
    apiRange: 'custom',
    startISO: fmtISO(start),
    endISO: fmtISO(end),
  }
}

function buildRangeQuery(range) {
  const params = new URLSearchParams({
    range: 'custom',
    start: range.startISO,
    end: range.endISO,
  })
  return params.toString()
}

function exportCsv(filename, rows) {
  if (!rows || rows.length === 0) {
    toast.error('No data to export')
    return
  }
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n'))
      return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`)
}

function pctChange(current, previous) {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ─── Shared Components ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: p.color || p.fill }}
          />
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {p.value?.toLocaleString?.() ?? p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, icon, color = '#1a6cbf', compareValue }) {
  const change = pctChange(value, compareValue)
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          {label}
        </p>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white"
            style={{ backgroundColor: color }}
          >
            <Icon name={icon} size={16} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
        {value?.toLocaleString?.() ?? value}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {sub && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>
        )}
        {change !== null && (
          <span
            className={[
              'text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded',
              change >= 0
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
            ].join(' ')}
          >
            {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ title, range, onRefresh, isFetching, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 print:hidden">
      <div>
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
          {range.label}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60 transition-colors"
        >
          <Icon
            name="refresh"
            size={13}
            className={isFetching ? 'animate-spin' : ''}
          />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
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

// ─── Visits Sub-Tab ──────────────────────────────────────────────────────────

function VisitsSubTab({ range, compareRange, compare }) {
  const q = useQuery({
    queryKey: ['reports', 'visits', range.apiRange, range.startISO, range.endISO],
    queryFn: () => api.get(`/api/admin/reports/visits?${buildRangeQuery(range)}`),
    staleTime: 60000,
  })

  const cq = useQuery({
    queryKey: ['reports', 'visits', 'compare', compareRange?.startISO, compareRange?.endISO],
    queryFn: () => {
      if (!compareRange) return Promise.resolve({ data: {} })
      return api.get(`/api/admin/reports/visits?${buildRangeQuery(compareRange)}`)
    },
    enabled: compare && !!compareRange,
    staleTime: 60000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable rows={5} cols={4} />
      </div>
    )
  }

  if (q.isError) {
    return (
      <ErrorState
        message={q.error?.message || 'Could not load visit report'}
        onRetry={q.refetch}
      />
    )
  }

  const stats = q.data?.stats || {}
  const byDay = q.data?.by_day || []
  const byType = q.data?.by_visit_type || {}

  const cStats = cq.data?.stats || {}
  const cByDay = cq.data?.by_day || []

  const total = stats.total_visits || 0
  const avg = stats.avg_per_day || 0
  const completion = stats.completion_rate || 0
  const mostCommon = VISIT_TYPE_LABELS[stats.most_common_type] || cap(stats.most_common_type) || '—'

  const typeRows = Object.entries(byType)
    .map(([key, count]) => ({
      key,
      label: VISIT_TYPE_LABELS[key] || cap(key),
      count: Number(count) || 0,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: VISIT_TYPE_COLORS[key] || '#94a3b8',
    }))
    .sort((a, b) => b.count - a.count)

  const peakDay = byDay.reduce((max, d) => (d.count > max.count ? d : max), byDay[0] || { day: '—', count: 0 })

  const chartData = byDay.map((d, i) => ({
    day: d.day,
    current: d.count,
    previous: cByDay[i]?.count ?? 0,
  }))

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Visit Trends"
        range={range}
        onRefresh={q.refetch}
        isFetching={q.isFetching}
        actions={
          <button
            onClick={() =>
              exportCsv(
                'visits-daily',
                chartData.map((d) => ({ Day: d.day, Visits: d.current }))
              )
            }
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
          >
            <Icon name="download" size={13} /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Visits"
          value={total}
          sub="in selected range"
          icon="users"
          color="#1a6cbf"
          compareValue={cStats.total_visits}
        />
        <StatCard
          label="Avg Per Day"
          value={avg}
          sub="visits / day"
          icon="barChart"
          color="#6366f1"
          compareValue={cStats.avg_per_day}
        />
        <StatCard
          label="Completion Rate"
          value={`${completion}%`}
          sub="done / total"
          icon="checkCircle"
          color={completion >= 80 ? '#10b981' : '#f59e0b'}
          compareValue={cStats.completion_rate}
        />
        <StatCard
          label="Peak Day"
          value={peakDay.count}
          sub={peakDay.day}
          icon="activity"
          color="#ec4899"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader title="Visits Per Day" subtitle={compare ? `Solid = current, dashed = previous` : range.label} />
          <div className="p-4">
            {chartData.length === 0 ? (
              <EmptyState icon="barChart" title="No visit data" description="Visit trends will appear here." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#1a6cbf', strokeOpacity: 0.2 }} />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="Visits"
                    stroke="#1a6cbf"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#1a6cbf', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  {compare && (
                    <Line
                      type="monotone"
                      dataKey="previous"
                      name="Previous Period"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="By Visit Type"
            subtitle={`${typeRows.length} type${typeRows.length === 1 ? '' : 's'}`}
          />
          <div className="p-4">
            {typeRows.length === 0 ? (
              <EmptyState icon="pieChart" title="No data" />
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={typeRows}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {typeRows.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {typeRows.map((r) => (
                    <div key={r.key} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="text-gray-700 dark:text-gray-300">{r.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{r.count}</span>
                        <span className="text-gray-400 w-8 text-right">{r.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Daily Breakdown" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                <Th>Day</Th>
                <Th align="right">Visits</Th>
                <Th align="right">Share</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {byDay.map((d) => (
                <tr key={d.day} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                  <td className="px-4 py-2.5 text-[13px] text-gray-700 dark:text-gray-300">{d.day}</td>
                  <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {d.count}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
                    {total > 0 ? Math.round((d.count / total) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── Lab Sub-Tab ─────────────────────────────────────────────────────────────

function LabSubTab({ range, compareRange, compare }) {
  const q = useQuery({
    queryKey: ['reports', 'lab', range.apiRange, range.startISO, range.endISO],
    queryFn: () => api.get(`/api/admin/reports/lab?${buildRangeQuery(range)}`),
    staleTime: 60000,
  })

  const cq = useQuery({
    queryKey: ['reports', 'lab', 'compare', compareRange?.startISO, compareRange?.endISO],
    queryFn: () => {
      if (!compareRange) return Promise.resolve({ data: {} })
      return api.get(`/api/admin/reports/lab?${buildRangeQuery(compareRange)}`)
    },
    enabled: compare && !!compareRange,
    staleTime: 60000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable rows={5} cols={3} />
      </div>
    )
  }

  if (q.isError) {
    return (
      <ErrorState
        message={q.error?.message || 'Could not load lab report'}
        onRetry={q.refetch}
      />
    )
  }

  const stats = q.data?.stats || {}
  const byDay = q.data?.by_day || []
  const topTests = q.data?.top_tests || []
  const avgTurnaround = Number(q.data?.avg_turnaround_hours) || 0
  const mostOrdered = q.data?.most_ordered || '—'

  const cStats = cq.data?.stats || {}
  const cByDay = cq.data?.by_day || []

  const total = stats.total || 0
  const chartData = byDay.map((d, i) => ({
    day: d.day,
    current: d.count,
    previous: cByDay[i]?.count ?? 0,
  }))

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Lab Performance"
        range={range}
        onRefresh={q.refetch}
        isFetching={q.isFetching}
        actions={
          <button
            onClick={() =>
              exportCsv(
                'lab-daily',
                chartData.map((d) => ({ Day: d.day, Requests: d.current }))
              )
            }
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
          >
            <Icon name="download" size={13} /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Requests"
          value={total}
          sub="in selected range"
          icon="testTube"
          color="#7c3aed"
          compareValue={cStats.total}
        />
        <StatCard
          label="Avg Turnaround"
          value={`${avgTurnaround}h`}
          sub="ordered → completed"
          icon="timer"
          color="#6366f1"
        />
        <StatCard
          label="Most Ordered"
          value={mostOrdered}
          sub="by request volume"
          icon="flask"
          color="#a855f7"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader title="Requests Per Day" subtitle={compare ? 'Solid = current, dashed = previous' : range.label} />
          <div className="p-4">
            {chartData.length === 0 ? (
              <EmptyState icon="barChart" title="No request data" description="Lab requests will appear here once tests are ordered." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#7c3aed', fillOpacity: 0.06 }} />
                  <Bar dataKey="current" name="Requests" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  {compare && <Bar dataKey="previous" name="Previous" fill="#c4b5fd" radius={[6, 6, 0, 0]} maxBarSize={40} />}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Top Tests"
            subtitle={`${topTests.length} test${topTests.length === 1 ? '' : 's'}`}
          />
          {topTests.length === 0 ? (
            <EmptyState icon="testTube" title="No tests yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <Th>Test</Th>
                    <Th align="right">Requests</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {topTests.map((t, i) => (
                    <tr key={t.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {t.count}
                      </td>
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

// ─── Pharmacy Sub-Tab ────────────────────────────────────────────────────────

function PharmacySubTab({ range, compareRange, compare }) {
  const q = useQuery({
    queryKey: ['reports', 'pharmacy', range.apiRange, range.startISO, range.endISO],
    queryFn: () => api.get(`/api/admin/reports/pharmacy?${buildRangeQuery(range)}`),
    staleTime: 60000,
  })

  const cq = useQuery({
    queryKey: ['reports', 'pharmacy', 'compare', compareRange?.startISO, compareRange?.endISO],
    queryFn: () => {
      if (!compareRange) return Promise.resolve({ data: {} })
      return api.get(`/api/admin/reports/pharmacy?${buildRangeQuery(compareRange)}`)
    },
    enabled: compare && !!compareRange,
    staleTime: 60000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable rows={5} cols={3} />
      </div>
    )
  }

  if (q.isError) {
    return (
      <ErrorState
        message={q.error?.message || 'Could not load pharmacy report'}
        onRetry={q.refetch}
      />
    )
  }

  const stats = q.data?.stats || {}
  const byDay = q.data?.by_day || []
  const topDrugs = q.data?.top_drugs || []

  const cStats = cq.data?.stats || {}
  const cByDay = cq.data?.by_day || []

  const dispensed = stats.dispensed_total || 0
  const otc = stats.otc_total || 0
  const expenses = stats.expenses_total || 0
  const topDrug = topDrugs[0]?.name || '—'

  const totalUnits = topDrugs.reduce((s, d) => s + (d.count || 0), 0)

  const chartData = byDay.map((d, i) => ({
    day: d.day,
    dispensed: d.dispensed,
    otc: d.otc,
    prevDispensed: cByDay[i]?.dispensed ?? 0,
    prevOtc: cByDay[i]?.otc ?? 0,
  }))

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Pharmacy Consumption"
        range={range}
        onRefresh={q.refetch}
        isFetching={q.isFetching}
        actions={
          <button
            onClick={() =>
              exportCsv(
                'pharmacy-daily',
                chartData.map((d) => ({
                  Day: d.day,
                  Dispensed: d.dispensed,
                  OTC: d.otc,
                }))
              )
            }
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
          >
            <Icon name="download" size={13} /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Prescriptions"
          value={dispensed}
          sub="dispensed"
          icon="checkCircle"
          color="#10b981"
          compareValue={cStats.dispensed_total}
        />
        <StatCard
          label="OTC Sales"
          value={otc}
          sub="transactions"
          icon="shoppingCart"
          color="#f59e0b"
          compareValue={cStats.otc_total}
        />
        <StatCard
          label="Top Drug"
          value={topDrug}
          sub="by quantity"
          icon="pill"
          color="#06b6d4"
        />
        <StatCard
          label="Pharmacy Expenses"
          value={formatMoney(expenses)}
          sub="in selected range"
          icon="trendDown"
          color="#ef4444"
          compareValue={cStats.expenses_total}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title="Dispensing & OTC Per Day"
            subtitle={range.label}
          />
          <div className="p-4">
            {chartData.length === 0 ? (
              <EmptyState icon="barChart" title="No pharmacy data" description="Activity will appear here once recorded." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#06b6d4', fillOpacity: 0.06 }} />
                  <Bar dataKey="dispensed" name="Dispensed" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="otc" name="OTC Sales" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Top Drugs"
            subtitle={`${topDrugs.length} drug${topDrugs.length === 1 ? '' : 's'}`}
          />
          {topDrugs.length === 0 ? (
            <EmptyState icon="pillBottle" title="No drugs dispensed" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <Th>Drug</Th>
                    <Th align="right">Units</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {topDrugs.map((d, i) => (
                    <tr key={d.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {d.count}
                      </td>
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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ReportsTab() {
  const [activeTab, setActiveTab] = useState('visits')
  const [preset, setPreset] = useState('7d')
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return fmtISO(d)
  })
  const [customEnd, setCustomEnd] = useState(() => fmtISO(new Date()))
  const [compare, setCompare] = useState(false)

  const range = useMemo(
    () => getRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  )

  const compareRange = useMemo(
    () => (compare ? getCompareRange(range) : null),
    [compare, range]
  )

  const activeColor = TABS.find((t) => t.key === activeTab)?.color || '#1a6cbf'

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Row 1: Tabs only — full width, clean */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={[
              'shrink-0 px-4 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 transition-all',
              activeTab === t.key
                ? 'text-white shadow-sm'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600',
            ].join(' ')}
            style={
              activeTab === t.key
                ? { backgroundColor: t.color, borderColor: t.color }
                : {}
            }
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Row 2: Date filters + actions — below tabs */}
      <Card className="p-3 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={[
                  'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors border',
                  preset === p.key
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60 hover:border-gray-300',
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
            <span className="text-[11px] text-gray-400 hidden lg:inline">{range.label}</span>

            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            <button
              onClick={() => setCompare((c) => !c)}
              className={[
                'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors flex items-center gap-1.5',
                compare
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50'
                  : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60',
              ].join(' ')}
            >
              <Icon name="gitCompare" size={13} />
              {compare ? 'Comparing' : 'Compare'}
            </button>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 flex items-center gap-1.5"
            >
              <Icon name="printer" size={13} /> Print
            </button>
          </div>
        </div>
      </Card>

      {compare && compareRange && (
        <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#1e293b]/50 border border-gray-200 dark:border-gray-700/60 rounded-lg px-3 py-2 print:hidden">
          <Icon name="gitCompare" size={12} />
          Comparing <span className="font-semibold text-gray-700 dark:text-gray-300">{range.label}</span> against{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">{compareRange.label}</span>
        </div>
      )}

      {/* Tab Content */}
      <div className="transition-opacity duration-200" key={activeTab}>
        {activeTab === 'visits' && (
          <VisitsSubTab range={range} compareRange={compareRange} compare={compare} />
        )}
        {activeTab === 'lab' && (
          <LabSubTab range={range} compareRange={compareRange} compare={compare} />
        )}
        {activeTab === 'pharmacy' && (
          <PharmacySubTab range={range} compareRange={compareRange} compare={compare} />
        )}
      </div>

      {/* Print Footer */}
      <div className="hidden print:block text-center text-[10px] text-gray-400 mt-8">
        Generated on {new Date().toLocaleString()} · {range.label}
      </div>
    </div>
  )
}