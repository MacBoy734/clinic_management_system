'use client'

// QueueTab — patient queue for the doctor
// APIs:
//   GET   /api/doctor/queue          → list of visits with status consultation_paid|with_doctor|lab|pharmacy
//   PATCH /api/doctor/visits/[id]    → set status='with_doctor' to start consultation

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import {
  StatCard, SkeletonCard, SkeletonList, ErrorState, EmptyState,
  Card, Badge, Icon, badgeClass, cap, waitMinutes, formatTime, VISIT_TYPES,
} from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'
import socket from '@/lib/socket'

// Filter pills — statuses shown in the doctor queue
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'consultation_paid', label: 'Waiting' },
  { key: 'with_doctor', label: 'In Consultation' },
  { key: 'lab', label: 'Lab' },
  { key: 'pharmacy', label: 'Pharmacy' },
]

export default function QueueTab({ onStartConsultation }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [filter, setFilter] = useState('all')
  const user = useAuthStore((s) => s.user)

  // API: GET /api/doctor/queue
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['doctor', 'queue'],
    queryFn: () => api.get('/api/doctor/queue'),
    refetchInterval: 20000,
    staleTime: 10000,
  })

    useEffect(() => {
    socket.on('visit:new', () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'queue'] })
    })
    socket.on('lab:results_ready', () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'queue'] })
    })

    return () => {
      socket.off('visit:new')
      socket.off('visit:status_changed')
    }
  }, [])

  // API: PATCH /api/doctor/visits/[id] — start consultation
  const startMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/doctor/visits/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor'] })
    },
  })

  const visits = data?.visits || []

  // Stats grouped by status
  const counts = {
    consultation_paid: visits.filter((v) => v.status === 'consultation_paid').length,
    with_doctor: visits.filter((v) => v.status === 'with_doctor').length,
    lab: visits.filter((v) => v.status === 'lab').length,
    pharmacy: visits.filter((v) => v.status === 'pharmacy').length,
    lab_results_ready: visits.filter((v) => v.has_lab_results).length,
  }

  const filtered = filter === 'all' ? visits : visits.filter((v) => v.status === filter)

  const handleStart = async (visit) => {
    try {
      await startMutation.mutateAsync({ id: visit.id, body: { status: 'with_doctor', doctor: user.name } })
      toast.success(`Consultation started for ${visit.patient_name}`)
      router.push(`/doctor/consultation?visitId=${visit.id}`)
    } catch (err) {
      toast.error(err.message || 'Could not start consultation')
    }
  }


  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!visits.length) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon="clock" color="amber" label="Waiting" value={0} sublabel="for consultation" />
          <StatCard icon="stethoscope" color="blue" label="In Consultation" value={0} sublabel="being seen" />
          <StatCard icon="flask" color="purple" label="Sent to Lab" value={0} sublabel="awaiting results" />
          <StatCard icon="checkCircle" color="green" label="Lab Results Ready" value={0} sublabel="awaiting diagnosis" />
          <StatCard icon="pill" color="cyan" label="Sent to Pharmacy" value={0} sublabel="for dispensing" />
        </div>
        <EmptyState
          icon="list"
          title="No patients in your queue"
          description="Patients who have paid the consultation fee will appear here automatically."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon="clock" color="amber" label="Waiting" value={counts.consultation_paid} sublabel="for consultation" />
        <StatCard icon="stethoscope" color="blue" label="In Consultation" value={counts.with_doctor} sublabel="being seen" />
        <StatCard icon="flask" color="purple" label="Sent to Lab" value={counts.lab} sublabel="awaiting results" />
        <StatCard icon="checkCircle" color="green" label="Lab Results Ready" value={counts.lab_results_ready} sublabel="awaiting diagnosis" />
        <StatCard icon="pill" color="cyan" label="Sent to Pharmacy" value={counts.pharmacy} sublabel="for dispensing" />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => {
          const count = s.key === 'all' ? visits.length : (counts[s.key] || 0)
          return (
            <button key={s.key} onClick={() => setFilter(s.key)}
              className={[
                'px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5',
                filter === s.key
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700',
              ].join(' ')}>
              {s.label}
              <span className={[
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                filter === s.key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400',
              ].join(' ')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Queue list */}
      {!filtered.length ? (
        <EmptyState
          icon="list"
          title={`No patients "${STATUS_FILTERS.find((s) => s.key === filter)?.label || ''}"`}
          description="Try a different filter to see other patients."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const wait = waitMinutes(v.arrived_at)
            const waitColor = wait > 45
              ? 'text-red-600 dark:text-red-400'
              : wait > 20
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-500 dark:text-gray-400'
            const waitDot = wait > 45
              ? 'bg-red-500'
              : wait > 20
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            const visitType = VISIT_TYPES[v.visit_type] || { label: cap(v.visit_type), badge: badgeClass(v.visit_type) }
            return (
              <Card key={v.id} className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Queue number */}
                  <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center shrink-0">
                    <span className="text-[13px] font-bold text-gray-600 dark:text-gray-300">{v.queue_number || '—'}</span>
                  </div>

                  {/* Patient info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{v.patient_name}</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {v.patient_age != null ? `${v.patient_age}y` : '—'} · {cap(v.patient_gender || '—')}
                      </span>
                      {v.blood_group && (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{v.blood_group}</Badge>
                      )}
                      <Badge className={visitType.badge}>{visitType.label}</Badge>
                      <Badge className={badgeClass(v.status)}>{cap(v.status)}</Badge>
                      {v.has_lab_results && (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <Icon name="checkCircle" size={11} /> Lab results ready
                        </Badge>
                      )}
                      {v.allergies && (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          ⚠ {v.allergies}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {v.chief_complaint || 'No chief complaint recorded'}
                      {v.diagnosis && <span className="ml-2">· Dx: {v.diagnosis}</span>}
                      {v.has_lab_results && <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">· Review lab results & diagnose</span>}
                    </p>
                  </div>

                  {/* Wait time */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className={`w-1.5 h-1.5 rounded-full ${waitDot}`} />
                      <p className={`text-[13px] font-semibold tabular-nums ${waitColor}`}>{wait} min</p>
                    </div>
                    <p className="text-[10px] text-gray-400">{formatTime(v.arrived_at)}</p>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {v.status === 'consultation_paid' && (
                      <button
                        onClick={() => handleStart(v)}
                        disabled={startMutation.isPending}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {startMutation.isPending && startMutation.variables?.id === v.id
                          ? <Icon name="refresh" size={13} className="animate-spin" />
                          : <Icon name="stethoscope" size={13} />}
                        Start Consultation
                      </button>
                    )}
                    {v.status === 'with_doctor' && (
                      <button
                        onClick={() => router.push(`/doctor/consultation?visitId=${v.id}`)}
                        className={[
                          'px-3 py-1.5 rounded-lg text-[13px] font-medium border flex items-center gap-1.5',
                          v.has_lab_results
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/50'
                            : 'bg-blue-50 dark:bg-blue-950/30 text-[#1a6cbf] dark:text-blue-400 border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-950/50',
                        ].join(' ')}
                      >
                        <Icon name={v.has_lab_results ? 'checkCircle' : 'arrowRight'} size={13} />
                        {v.has_lab_results ? 'Review Results' : 'Resume'}
                      </button>
                    )}
                    {v.status === 'lab' && (
                      <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium px-3 py-1.5">In Lab</span>
                    )}
                    {v.status === 'pharmacy' && (
                      <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium px-3 py-1.5">In Pharmacy</span>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}