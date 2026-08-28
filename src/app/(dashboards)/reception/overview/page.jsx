'use client'

// OverviewTab — reception dashboard summary
// API: GET /api/reception/overview → { stats: { total_today, waiting, in_progress, done, total_revenue, stage1_collected } }

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { StatCard, Card, SkeletonCard, ErrorState, Badge, Icon, formatMoney, badgeClass } from '@/utils/helpers'

export default function OverviewTab({ onNavigate }) {
  // API: GET /api/reception/overview
  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['reception', 'overview'],
    queryFn: () => api.get('/api/reception/stats'),
    refetchInterval: 20000,
    staleTime: 10000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const stats  = data
  console.log('data ', data)
  console.log('stats ', stats)

    return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Dashboard</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
        >
          <Icon 
            name="refresh" 
            size={13} 
            className={isFetching ? 'animate-spin' : ''} 
          />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="users" color="blue" label="Patients Today" value={stats?.total_visits} sublabel="visits registered" />
        <StatCard icon="list" color="amber" label="Waiting" value={stats?.waiting} sublabel="in queue" />
<Card className="p-4">
  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Collected Today</p>
  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
    {formatMoney(stats?.revenue_today)}
  </p>
  {stats?.payments?.by_method && (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {Object.entries(stats.payments.by_method)
        .filter(([, amount]) => amount > 0)
        .map(([method, amount]) => (
          <span key={method} className="text-[11px] text-gray-500 dark:text-gray-400">
            <span className="capitalize">{method}</span>:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
              {formatMoney(amount)}
            </span>
          </span>
        ))}
    </div>
  )}
</Card>
      </div>

      {/* Quick actions + visit flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick actions */}
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button onClick={() => onNavigate?.('register')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-[#1a6cbf] dark:hover:border-[#1a6cbf] hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors text-left">
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-[#1a6cbf] dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center shrink-0"><Icon name="user" size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">Register Patient</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Add new patient to the system</p>
              </div>
              <Icon name="chevronRight" size={16} className="text-gray-400" />
            </button>
            <button onClick={() => onNavigate?.('queue')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-[#1a6cbf] dark:hover:border-[#1a6cbf] hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors text-left">
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 flex items-center justify-center shrink-0"><Icon name="list" size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">Manage Queue</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{stats?.waiting} waiting for consultation</p>
              </div>
              <Icon name="chevronRight" size={16} className="text-gray-400" />
            </button>
            <button onClick={() => onNavigate?.('billing')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-[#1a6cbf] dark:hover:border-[#1a6cbf] hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors text-left">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center justify-center shrink-0"><Icon name="receipt" size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">Billing Desk</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Collect stage 1 & 2 payments</p>
              </div>
              <Icon name="chevronRight" size={16} className="text-gray-400" />
            </button>
          </div>
        </Card>

        {/* Visit flow diagram */}
        <Card className="lg:col-span-2 p-4">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Patient Visit Flow</h3>
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <Badge className={badgeClass('waiting')}>Waiting</Badge>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('consultation_paid')}>Paid</Badge>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('with_doctor')}>With Doctor</Badge>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('lab')}>Lab</Badge>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('with_doctor')}>Back to Doctor</Badge>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('pharmacy')}>Pharmacy</Badge>
            <span className="text-[10px] text-gray-400">(if Rx)</span>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('billing')}>Billing</Badge>
            <Icon name="arrowRight" size={12} className="text-gray-400" />
            <Badge className={badgeClass('done')}>Done</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Stage 1</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Consultation fee paid at reception before seeing the doctor</p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3">
              <p className="text-[11px] font-semibold text-[#1a6cbf] dark:text-blue-400">Doctor (x2)</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">First visit: vitals, exam, lab orders. Second visit: review results, diagnosis & prescription</p>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Stage 2</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Lab + medication + procedure fees at billing desk</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
