'use client'

// OverviewTab — Admin dashboard overview (KPIs + visit pipeline + staff + low stock + activity)
// API: GET /api/admin/overview
// Defensive against partial / unexpected API shapes — uses optional chaining
// and fallback defaults throughout.
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonList,
  formatMoney, formatTime, timeAgo, cap, badgeClass,
} from '@/utils/helpers'

// Visit pipeline stages and colors (per task spec):
// amber=waiting, blue=with_doctor, purple=lab, cyan=pharmacy,
// orange=billing, green=done. 'consultation_paid' uses slate as a neutral.
const PIPELINE = [
  { key: 'waiting', label: 'Waiting', color: 'amber' },
  { key: 'consultation_paid', label: 'Consult Paid', color: 'slate' },
  { key: 'with_doctor', label: 'With Doctor', color: 'blue' },
  { key: 'lab', label: 'Lab', color: 'purple' },
  { key: 'pharmacy', label: 'Pharmacy', color: 'cyan' },
  { key: 'billing', label: 'Billing', color: 'orange' },
  { key: 'partially_paid', label: 'Unpaid', color: 'red' },
  { key: 'done', label: 'Done', color: 'green' },
]

const PIPELINE_BG = {
  amber: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 text-amber-700 dark:text-amber-400',
  blue: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50 text-blue-700 dark:text-blue-400',
  purple: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50 text-purple-700 dark:text-purple-400',
  cyan: 'bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-900/50 text-cyan-700 dark:text-cyan-400',
  orange: 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900/50 text-orange-700 dark:text-orange-400',
  green: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400',
  slate: 'bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/50 text-slate-700 dark:text-slate-300',
  red: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50 text-red-700 dark:text-red-400',
}

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

const ACTIVITY_ICON = {
  payment: 'dollarSign',
  lab: 'testTube',
  pharmacy: 'pill',
  patient: 'user',
  expense: 'receipt',
  inventory: 'box',
  staff: 'users',
  general: 'activity',
}

const ACTIVITY_COLOR = {
  payment: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  lab: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  pharmacy: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400',
  patient: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  expense: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  inventory: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  staff: 'bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400',
  general: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

export default function OverviewTab() {
  const q = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get('/api/admin/overview'),
    refetchInterval: 20000, // 20s — keeps the activity feed fresh
    staleTime: 10000,
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={6} />
      </div>
    )
  }
  if (q.isError) {
    return <ErrorState message={q.error?.message || 'Could not load dashboard'} onRetry={q.refetch} />
  }

  // Defensive normalization — the API may return partial / missing fields.
  const data = q.data || {}
  const stats = data.stats || {}
  const pipeline = data.pipeline || {}
  const staffOnDuty = Array.isArray(data.staff_on_duty) ? data.staff_on_duty : []
  const lowStock = data.low_stock || {}
  const drugs = Array.isArray(lowStock.drugs) ? lowStock.drugs : []
  const reagents = Array.isArray(lowStock.reagents) ? lowStock.reagents : []
  const activity = Array.isArray(data.recent_activity) ? data.recent_activity : []

  const patientsToday = Number(stats.patients_today ?? 0)
  const revenueToday = Number(stats.revenue_today ?? 0)
  const pendingPayments = Number(stats.pending_payments ?? 0)
  const pendingAmount = Number(stats.pending_amount ?? 0)
  const staffOnDutyCount = Number(stats.staff_on_duty ?? staffOnDuty.length)

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Dashboard Overview
          </h2>
        </div>
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
      {/* KPI cards (4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patients Today</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <Icon name="users" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{patientsToday}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">across the pipeline</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Revenue Today</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <Icon name="dollarSign" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(revenueToday)}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            stage 1 + stage 2
            {stats.stage1_collected != null && stats.stage2_collected != null && (
              <span className="ml-1">· {formatMoney(stats.stage1_collected)} + {formatMoney(stats.stage2_collected)}</span>
            )}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Pending Payments</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Icon name="receipt" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{pendingPayments}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            {formatMoney(pendingAmount)} outstanding · all time
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Active Staff</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              <Icon name="stethoscope" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-400">{staffOnDutyCount}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">active accounts</p>
        </Card>
      </div>

      {/* Visit pipeline */}
      <PipelineCard pipeline={pipeline} />

      {/* Two-col: staff on duty + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActiveStaffCard staff={staffOnDuty}/>
        <RecentActivityCard activity={activity} />
      </div>

      {/* Low stock alerts */}
      <LowStockAlertsCard drugs={drugs} reagents={reagents} />
    </div>
  )
}

// ─── Visit Pipeline ──────────────────────────────────────────────
function PipelineCard({ pipeline }) {
  const total = PIPELINE.reduce((s, stage) => s + (Number(pipeline[stage.key]) || 0), 0)
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Today&apos;s Visit Pipeline</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{total} visit{total === 1 ? '' : 's'} in progress</p>
        </div>
        <Badge className="bg-[#1a6cbf]/10 text-[#1a6cbf] dark:bg-[#1a6cbf]/20 dark:text-blue-400">
          <Icon name="activity" size={11} /> live
        </Badge>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {PIPELINE.map((stage, idx) => {
          const count = Number(pipeline[stage.key]) || 0
          return (
            <div key={stage.key} className="flex items-stretch shrink-0">
              <div className={`flex flex-col items-center justify-center min-w-24 px-3 py-3 rounded-lg border ${PIPELINE_BG[stage.color]} transition-all`}>
                <span className="text-2xl font-bold tabular-nums leading-none">{count}</span>
                <span className="text-[11px] font-medium mt-1 text-center leading-tight">{stage.label}</span>
              </div>
              {idx < PIPELINE.length - 1 && (
                <div className="flex items-center px-0.5 text-gray-300 dark:text-gray-600">
                  <Icon name="chevronRight" size={14} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Staff on Duty ───────────────────────────────────────────────
function ActiveStaffCard({ staff }) {
  return (
    <Card className="flex flex-col">
      <CardHeader title="Active Staff" subtitle={`${staff.length} active`} />
      {staff.length === 0 ? (
        <EmptyState icon="users" title="No Active Staff" description="Active staff will appear here." />
      ) : (
        <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
          {staff.map((s) => {
            const label = s.name || s.username || 'Unknown'
            const initials = label.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
            const visits = Number(s.active_visits ?? 0)
            return (
              <div key={s.id ?? label} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700/40 hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                <div className="w-9 h-9 rounded-full bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-bold text-white">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{label}</p>
                  <Badge className={ROLE_BADGES[s.role] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                    {ROLE_LABELS[s.role] || cap(s.role)}
                  </Badge>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">{visits}</p>
                  <p className="text-[10px] text-gray-400 mt-1">active visit{visits === 1 ? '' : 's'}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Recent Activity ─────────────────────────────────────────────
function RecentActivityCard({ activity }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Recent Activity"
        subtitle="last 20 events"
        action={
          <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
            <Icon name="refresh" size={12} className="animate-pulse" /> auto
          </span>
        }
      />
      {activity.length === 0 ? (
        <EmptyState icon="activity" title="No activity yet" description="Audit events will stream in here." />
      ) : (
        <div className="p-3 space-y-1 max-h-96 overflow-y-auto">
          {activity.map((e) => {
            const cat = e.category || 'general'
            const iconName = ACTIVITY_ICON[cat] || 'activity'
            const colorCls = ACTIVITY_COLOR[cat] || ACTIVITY_COLOR.general
            return (
              <div key={e.id ?? `${e.user}-${e.timestamp}`} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorCls}`}>
                  <Icon name={iconName} size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-gray-700 dark:text-gray-200 leading-snug">{e.description || e.action}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                    <span className="font-medium text-gray-500 dark:text-gray-400">{e.user || 'System'}</span>
                    <span>·</span>
                    <span>{timeAgo(e.timestamp)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Low Stock Alerts ────────────────────────────────────────────
function LowStockAlertsCard({ drugs, reagents }) {
  const total = drugs.length + reagents.length
  if (total === 0) {
    return (
      <Card className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Icon name="checkCircle" size={20} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Inventory healthy</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">No low-stock drugs or lab reagents.</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Low Stock Alerts"
        subtitle={`${total} item${total === 1 ? '' : 's'} need restocking`}
      />
      <div className="p-3 space-y-3">
        {drugs.length > 0 && (
          <AlertGroup
            title={`Pharmacy drugs (${drugs.length})`}
            icon="pill"
            accent="amber"
            items={drugs}
          />
        )}
        {reagents.length > 0 && (
          <AlertGroup
            title={`Lab reagents (${reagents.length})`}
            icon="testTube"
            accent="purple"
            items={reagents}
          />
        )}
      </div>
    </Card>
  )
}

function AlertGroup({ title, icon, accent, items }) {
  const accentText = accent === 'purple'
    ? 'text-purple-600 dark:text-purple-400'
    : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="space-y-2">
      <p className={`text-[11px] font-semibold uppercase tracking-widest flex items-center gap-1.5 ${accentText}`}>
        <Icon name={icon} size={12} /> {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const alert = item.alert || (Number(item.current_stock) === 0 ? 'out_of_stock' : 'low_stock')
          const isOut = alert === 'out_of_stock'
          return (
            <div
              key={`${item.id}-${item.name}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40"
            >
              <Icon name={isOut ? 'xCircle' : 'alert'} size={13} className={isOut ? 'text-red-500' : 'text-amber-500'} />
              <span className="text-[12px] font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
              <Badge className={badgeClass(alert)}>{cap(alert).replace('_', ' ')}</Badge>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                {item.current_stock}/{item.reorder_level} {item.unit || ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}