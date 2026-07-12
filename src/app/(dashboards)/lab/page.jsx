'use client'

// QueueTab — lab tech's worklist of pending + in_progress requests
// APIs:
//   GET   /api/lab/stats                     → KPI counts
//   GET   /api/lab/queue                     → pending + in_progress, sorted by urgency
//   PATCH /api/lab/requests/[id]/status      → start (in_progress) or save results (ready)

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  StatCard, SkeletonCard, SkeletonList, ErrorState, EmptyState,
  Card, Badge, Icon, Spinner,
  badgeClass, cap, formatTime, waitMinutes,
} from '@/utils/helpers'
import socket from '@/lib/socket'
import { ResultsModal } from '@/components/lab/ResultsModal'

// ─── Client-side shaping ───────────────────────────────────────────────────────
// The backend already returns a flat response — patient_name, patient_age,
// patient_gender, ordered_by, ordered_at are all top-level fields.
// shapeReq only needs to:
//   1. Alias `allergies` → `patient_allergies` (what QueueCard reads)
//   2. Hoist result_template from item.catalog onto each item directly

function shapeReq(raw) {
  return {
    ...raw,
    // QueueCard reads req.patient_allergies — API returns req.allergies
    patient_allergies: raw.allergies ?? null,
    // Items — hoist result_template up from catalog for convenience
    items: (raw.items ?? []).map((item) => ({
      ...item,
      // test_name already present, catalog.name is a safe fallback
      test_name: item.test_name ?? item.catalog?.name ?? '—',
      // category already present, catalog.category is a safe fallback
      category: item.category ?? item.catalog?.category ?? null,
      // hoist so modal reads item.result_template directly
      result_template: item.catalog?.result_template ?? null,
    })),
  }
}

export default function QueueTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [entering, setEntering] = useState(null) // request being result-entered

  useEffect(() => {
    // Doctor sent a new lab order
    socket.on('visit:new', () => {
      queryClient.invalidateQueries({ queryKey: ['lab', 'queue'] })
      queryClient.invalidateQueries({ queryKey: ['lab', 'stats'] })
    })
    socket.on('visit:status_changed', () => {
      queryClient.invalidateQueries({ queryKey: ['lab', 'queue'] })
      queryClient.invalidateQueries({ queryKey: ['lab', 'stats'] })
    })

    return () => {
      socket.off('visit:new')
      socket.off('visit:status_changed')
    }
  }, [])

  // KPI stats
  const statsQ = useQuery({
    queryKey: ['lab', 'stats'],
    queryFn: () => api.get('/api/lab/stats'),
    refetchInterval: 20000,
    staleTime: 10000,
  })

  // Queue (pending + in_progress) — shape each raw request on the way in
  const queueQ = useQuery({
    queryKey: ['lab', 'queue'],
    queryFn: async () => {
      const data = await api.get('/api/lab/queue')
      return {
        ...data,
        requests: (data?.requests ?? []).map(shapeReq),
      }
    },
    refetchInterval: 20000,
    staleTime: 10000,
  })

  // Status mutation (start / save results)
  const statusMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/lab/requests/${id}/status`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab'] })
    },
  })

  const stats = statsQ.data?.stats
  const requests = queueQ.data?.requests || []

  const handleStart = async (req) => {
    try {
      await statusMut.mutateAsync({
        id: req.id,
        body: { status: 'in_progress', tech_id: Number(user?.id) || 4 },
      })
      toast.success(`${req.patient_name} — tests now in progress`)
    } catch (err) {
      toast.error(err.message || 'Could not start test')
    }
  }

  const handleSaveResults = async (req, itemResults, saveStatus) => {
    try {
      await statusMut.mutateAsync({
        id: req.id,
        body: {
          status: saveStatus,
          item_results: itemResults,
          tech_id: Number(user?.id) || 4,
        },
      })
      if (saveStatus === 'ready') {
        toast.success(`Results saved — ${req.patient_name}'s request is ready`)
      } else {
        toast.success('Progress saved')
      }
      setEntering(null)
    } catch (err) {
      toast.error(err.message || 'Could not save results')
    }
  }

  // ─── Loading ────────────────────────────────────────────────
  if (statsQ.isLoading || queueQ.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────────
  if (statsQ.error || queueQ.error) {
    return (
      <ErrorState
        message={statsQ.error?.message || queueQ.error?.message || 'Failed to load'}
        onRetry={() => { statsQ.refetch(); queueQ.refetch() }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon="clock"
          color="amber"
          label="Pending"
          value={stats?.pending ?? 0}
          sublabel="awaiting start"
        />
        <StatCard
          icon="activity"
          color="blue"
          label="In Progress"
          value={stats?.in_progress ?? 0}
          sublabel="being processed"
        />
        <StatCard
          icon="check"
          color="green"
          label="Ready Today"
          value={stats?.ready ?? 0}
          sublabel="results available"
        />
        <StatCard
          icon="testTube"
          color="purple"
          label="Total Tests"
          value={stats?.total ?? 0}
          sublabel="all-time requests"
        />
      </div>

      {/* Queue header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Worklist</h3>
          <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
            {requests.length} active
          </Badge>
        </div>
        <button
          onClick={() => queueQ.refetch()}
          disabled={queueQ.isFetching}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
        >
          <Icon name="refresh" size={13} className={queueQ.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Queue list */}
      {!requests.length ? (
        <EmptyState
          icon="flask"
          title="No tests in queue"
          description="New lab requests from the doctor will appear here automatically."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <QueueCard
              key={req.id}
              req={req}
              onStart={() => handleStart(req)}
              onEnterResults={() => setEntering(req)}
              starting={statusMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Results modal */}
      {entering && (
        <ResultsModal
          request={entering}
          loading={statusMut.isPending}
          onClose={() => setEntering(null)}
          onSave={handleSaveResults}
        />
      )}
    </div>
  )
}

// ─── Queue card ────────────────────────────────────────────────
function QueueCard({ req, onStart, onEnterResults, starting }) {
  const urgency = URGENCY_META[req.urgency] || URGENCY_META.routine
  const wait = waitMinutes(req.ordered_at)
  const waitColor =
    wait > 60 ? 'text-red-600 dark:text-red-400'
      : wait > 30 ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-500 dark:text-gray-400'

  const testCount = req.items?.length || 0
  const completedCount = (req.items || []).filter((i) => i.status === 'ready').length
  const progressPct = testCount > 0 ? Math.round((completedCount / testCount) * 100) : 0

  return (
    <Card className={`relative overflow-hidden hover:bg-gray-50/30 dark:hover:bg-gray-700/10 transition-colors`}>
      {/* Urgency left bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${urgency.bar}`} />

      <div className="p-4 pl-5">
        {/* Top row: patient + urgency + action */}
        <div className="flex items-start gap-3 flex-wrap">
          {/* Patient info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
                {req.patient_name}
              </span>
              {/* age — computed from date_of_birth via shapeReq */}
              {req.patient_age !== null && (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {req.patient_age}y · {cap(req.patient_gender || '—')}
                </span>
              )}
              {/* allergy warning */}
              {req.patient_allergies && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                  ⚠ {req.patient_allergies}
                </span>
              )}
              <Badge className={urgency.badge + (req.urgency === 'stat' ? ' animate-pulse' : '')}>
                {req.urgency === 'stat' && <span className="w-1 h-1 rounded-full bg-current" />}
                {urgency.label}
              </Badge>
              <Badge className={badgeClass(req.status)}>{cap(req.status)}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" size={11} />
                {/* ordered_at mapped from requested_at via shapeReq */}
                {formatTime(req.ordered_at)}
              </span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className={`tabular-nums ${waitColor}`}>{wait} min wait</span>
              {/* queue number from visit */}
              {req.queue_number && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span>Q#{req.queue_number}</span>
                </>
              )}
              {/* ordered_by — doctor name if available */}
              {req.ordered_by && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="stethoscope" size={11} />
                    {req.ordered_by}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Action button */}
          <div className="shrink-0">
            {req.status === 'pending' ? (
              <button
                onClick={onStart}
                disabled={starting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50"
              >
                {starting ? <Spinner size={13} /> : <Icon name="testTube" size={13} />}
                Start
              </button>
            ) : (
              <button
                onClick={onEnterResults}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white"
              >
                <Icon name="clipboard" size={13} />
                Enter Result
                <Icon name="arrowRight" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Test items */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Tests ({testCount})
            </p>
            {req.status === 'in_progress' && (
              <p className="text-[10px] text-gray-400 tabular-nums">{completedCount}/{testCount} ready · {progressPct}%</p>
            )}
          </div>
          <div className="space-y-1.5">
            {req.items?.map((item) => {
              // result_template shape: { sections: [{ fields: [...] }] }
              // count total fields across all sections for panel progress
              const allFields = item.result_template?.sections?.flatMap((s) => s.fields ?? []) ?? []
              const totalFieldCount = allFields.length || 1
              const filledFieldCount = Object.keys(item.result_data ?? {}).length
              const isPanel = allFields.length > 1

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50/60 dark:bg-gray-700/20"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ITEM_DOT[item.status] || 'bg-gray-400'}`} />
                  <span className="text-[12px] font-medium text-gray-900 dark:text-gray-100 flex-1 min-w-0 truncate">
                    {item.test_name}
                    {/* panel progress — uses sections-based field count */}
                    {isPanel && item.status !== 'ready' && totalFieldCount > 0 && (
                      <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
                        {filledFieldCount}/{totalFieldCount} filled
                      </span>
                    )}
                  </span>
                  {/* category from catalog */}
                  {item.category && (
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 hidden sm:inline">
                      {item.category}
                    </span>
                  )}
                  {item.result && (
                    <span
                      className={[
                        'text-[11px] font-semibold tabular-nums truncate max-w-35',
                        // flagged boolean from schema drives color
                        item.flagged
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400',
                      ].join(' ')}
                      title={item.result}
                    >
                      {item.result}
                    </span>
                  )}
                  <Badge className={badgeClass(item.status)}>{cap(item.status)}</Badge>
                </div>
              )
            })}
          </div>

          {/* Progress bar for in_progress */}
          {req.status === 'in_progress' && testCount > 0 && (
            <div className="mt-2.5 h-1 rounded-full bg-gray-100 dark:bg-gray-700/40 overflow-hidden">
              <div
                className="h-full bg-[#1a6cbf] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// Urgency styling
const URGENCY_META = {
  stat: {
    label: 'STAT',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    bar: 'bg-red-500',
  },
  urgent: {
    label: 'Urgent',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    bar: 'bg-amber-500',
  },
  routine: {
    label: 'Routine',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
    bar: 'bg-gray-300 dark:bg-gray-600',
  },
}

const ITEM_DOT = {
  pending: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  ready: 'bg-emerald-500',
  cancelled: 'bg-red-500',
}