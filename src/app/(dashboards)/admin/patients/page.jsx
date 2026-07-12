'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import api from '@/lib/api'

// ─── React Query hooks ────────────────────────────────────────────────────────
function usePatients({ page, period, visitType, feeStatus, gender, search }) {
  return useQuery({
    queryKey: ['admin', 'patients', { page, period, visitType, feeStatus, gender, search }],
    queryFn: () =>
      api.get(
        `/api/admin/patients?page=${page}&limit=20&period=${period}&visit_type=${visitType}&fee_status=${feeStatus}&gender=${gender}&search=${encodeURIComponent(search)}`
      ),
    placeholderData: (prev) => prev,  // replaces deprecated keepPreviousData
    staleTime: 30000,
  })
}

function usePatientStats(period) {
  return useQuery({
    queryKey: ['admin', 'patient-stats', period],
    queryFn: () => api.get(`/api/admin/patients/stats?period=${period}`),
    staleTime: 60000,
  })
}

function usePatientDetail(patientId) {
  return useQuery({
    queryKey: ['admin', 'patient-detail', patientId],
    queryFn: () => api.get(`/api/admin/patients/${patientId}`),
    enabled: !!patientId,
    staleTime: 60000,
  })
}

// ─── Period options ───────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'this_year', label: 'This year' },
]

// ─── Visit type filter tabs ───────────────────────────────────────────────────
const VISIT_TYPE_TABS = [
  { key: 'all', label: 'All patients' },
  { key: 'consultation', label: 'Consultation' },
  { key: 'direct_lab', label: 'Direct to lab' },
  { key: 'injection', label: 'Injection' },
  { key: 'family_planning', label: 'Family planning' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAge(dob) {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit',
  })
}

const FEE_COLORS = {
  paid:    'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600  dark:text-amber-400',
  waived:  'text-gray-400   dark:text-gray-500',
}

const FEE_BADGE = {
  paid:    'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40',
  pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40',
  waived:  'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700/40',
}

const LAB_STATUS_COLORS = {
  pending:     'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40',
  in_progress: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-700/40',
  ready:       'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40',
}

const VISIT_TYPE_COLORS = {
  consultation:   'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-700/40',
  direct_lab:     'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-700/40',
  injection:      'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-700/40',
  family_planning:'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400 border-pink-100 dark:border-pink-700/40',
}

const VISIT_TYPE_LABELS = {
  consultation: 'Consultation',
  direct_lab: 'Direct lab',
  injection: 'Injection',
  family_planning: 'Family planning',
}

const GENDER_INITIALS = { male: '♂', female: '♀', other: '⚧' }

// ─── Patient detail slide-over ────────────────────────────────────────────────
function PatientDetailPanel({ patientId, onClose }) {
  const { data: patientData, isLoading } = usePatientDetail(patientId)
  const [expandedVisitId, setExpandedVisitId] = useState(null)

  const patient = patientData
  if (!patient && !isLoading) return null

  const age = getAge(patient?.date_of_birth)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white dark:bg-[#1e293b] h-full overflow-y-auto shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1e293b] z-10">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Patient Record</h2>
            {patient && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                {patient.total_visits} visit{patient.total_visits !== 1 ? 's' : ''} · ID {patient.national_id ?? 'not captured'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none transition-colors"
          >×</button>
        </div>

        {isLoading ? (
          <div className="flex-1 p-6 space-y-4">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : patient ? (
          <div className="px-6 py-5 space-y-5 flex-1">

            {/* Patient profile */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-lg font-bold">
                {patient.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{patient.name}</p>
                  {patient.gender && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{GENDER_INITIALS[patient.gender]}</span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 dark:text-gray-500">
                  {age !== null ? `${age} yrs` : 'Age unknown'}
                  {patient.phone && <> · {patient.phone}</>}
                </p>
              </div>
            </div>

            {/* Patient metadata chips */}
            <div className="flex flex-wrap gap-2">
              {patient.blood_group && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg border bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 border-red-100 dark:border-red-700/40 font-semibold">
                  {patient.blood_group}
                </span>
              )}
              {patient.allergies && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg border bg-orange-50 dark:bg-orange-900/15 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-700/40">
                  ⚠ {patient.allergies}
                </span>
              )}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-gray-900 dark:text-gray-100">{patient.total_visits}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">Visits</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-center">
                <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
                  {(patient.total_billed / 1000).toFixed(1)}k
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">KES billed</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-center">
                <p className={`text-[15px] font-bold ${patient.unpaid_balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {patient.unpaid_balance > 0 ? `${(patient.unpaid_balance / 1000).toFixed(1)}k` : '0'}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">Unpaid</p>
              </div>
            </div>

            {/* Visit history */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                Visit History ({patient.visits?.length ?? 0})
              </p>
              <div className="space-y-2">
                {(patient.visits || []).map((v) => (
                  <div key={v.id} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* Visit header — clickable to expand */}
                    <button
                      onClick={() => setExpandedVisitId(expandedVisitId === v.id ? null : v.id)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/60 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${VISIT_TYPE_COLORS[v.visit_type]}`}>
                          {VISIT_TYPE_LABELS[v.visit_type]}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatDate(v.arrived_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.bill && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${FEE_BADGE[v.bill.fee_status]}`}>
                            {v.bill.fee_status}
                          </span>
                        )}
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expandedVisitId === v.id ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </div>
                    </button>

                    {/* Expanded visit content */}
                    {expandedVisitId === v.id && (
                      <div className="px-4 py-3 space-y-3">

                        {/* Doctor / referrer */}
                        <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                          {v.doctor && <span>Dr: {v.doctor.username}</span>}
                          {v.referred_by && (
                            <span className="text-purple-600 dark:text-purple-400">
                              Ref: {v.referred_by}
                            </span>
                          )}
                        </div>

                        {/* Diagnosis */}
                        {v.diagnosis && (
                          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/15 rounded-lg border border-blue-100 dark:border-blue-800/40">
                            <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-0.5">Diagnosis</p>
                            <p className="text-[12px] text-gray-800 dark:text-gray-200">{v.diagnosis}</p>
                          </div>
                        )}

                        {/* Bill breakdown */}
                        {v.bill && (
                          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden text-[11px]">
                            {v.bill.consultation_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Consultation</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.consultation_fee.toLocaleString()}</span>
                              </div>
                            )}
                            {v.bill.lab_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Lab</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.lab_fee.toLocaleString()}</span>
                              </div>
                            )}
                            {v.bill.medication_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Medication</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.medication_fee.toLocaleString()}</span>
                              </div>
                            )}
                            {v.bill.procedure_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Procedure</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.procedure_fee.toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/40">
                              <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200">Total</span>
                              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">KES {v.bill.total_amount.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {/* Lab requests */}
                        {v.lab_requests?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
                              Lab Results ({v.lab_requests.length})
                            </p>
                            <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                              <table className="w-full text-[11px]">
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                                  {v.lab_requests.map((lr) => (
                                    <tr key={lr.id}>
                                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{lr.test_name}</td>
                                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                                        {lr.result ?? <span className="italic text-gray-300 dark:text-gray-600">Pending</span>}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${LAB_STATUS_COLORS[lr.status]}`}>
                                          {lr.status.replace('_', ' ')}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Prescriptions */}
                        {v.prescriptions?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
                              Prescriptions
                            </p>
                            {v.prescriptions.map((rx) => (
                              <div key={rx.id} className="rounded-lg border border-teal-100 dark:border-teal-800/30 overflow-hidden">
                                <div className="divide-y divide-gray-50 dark:divide-gray-700/30">
                                  {rx.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800/20">
                                      <div>
                                        <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200">{item.drug_name}</p>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.frequency} · {item.duration}</p>
                                      </div>
                                      <p className="text-[10px] text-gray-400 dark:text-gray-500">×{item.quantity}</p>
                                    </div>
                                  ))}
                                </div>
                                {rx.notes && (
                                  <p className="px-3 py-1.5 text-[10px] italic text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/40">
                                    {rx.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 flex flex-col gap-1 transition-colors ${accent || 'border-gray-200 dark:border-gray-700/60'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PatientArchivePage() {
  const [period, setPeriod]       = useState('this_month')
  const [page, setPage]           = useState(1)
  const [visitType, setVisitType] = useState('all')
  const [feeStatus, setFeeStatus] = useState('all')
  const [gender, setGender]       = useState('all')
  const [search, setSearch]       = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const patientsQuery = usePatients({ page, period, visitType, feeStatus, gender, search })
  const statsQuery    = usePatientStats(period)

  // Safe fallbacks — data is undefined while loading
  const allPatients = patientsQuery.data?.patients ?? []
  const total       = patientsQuery.data?.total    ?? 0
  const stats       = statsQuery.data              ?? {}

  // All filtering is done server-side via query params.
  // This useMemo is kept only for the gender filter which isn't sent
  // as a query param in usePatients — everything else comes pre-filtered.
  const patients = useMemo(() => {
    if (gender === 'all') return allPatients
    return allPatients.filter((p) => p.gender === gender)
  }, [allPatients, gender])

  const totalPages = total > 0 ? Math.ceil(total / 20) : 1

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1) }

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3)              return [1, 2, 3, '...', totalPages]
    if (page >= totalPages - 2) return [1, '...', totalPages - 2, totalPages - 1, totalPages]
    return [1, '...', page - 1, page, page + 1, '...', totalPages]
  }

  // Count per tab badge — derived from allPatients (the current page)
  // The API returns patients pre-filtered so counts reflect the current filter set
  const tabCounts = useMemo(() => {
    if (!allPatients.length) return {}
    return VISIT_TYPE_TABS.reduce((acc, tab) => {
      acc[tab.key] = tab.key === 'all'
        ? allPatients.length
        : allPatients.filter((p) => p.last_visit_type === tab.key).length
      return acc
    }, {})
  }, [allPatients])

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Patients</h2>
          <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
            One record per patient — all visits aggregated
          </p>
        </div>
        {/* Period tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                period === p.key
                  ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total patients"
          value={(stats.total_patients ?? 0).toLocaleString()}
          sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
        />
        <StatCard
          label="Total billed"
          value={`KES ${((stats.total_billed || 0) / 1000).toFixed(0)}k`}
          sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
          accent="border-emerald-200 dark:border-emerald-700/40"
        />
        <StatCard
          label="Unpaid balance"
          value={`KES ${((stats.unpaid_balance || 0) / 1000).toFixed(0)}k`}
          sub="outstanding"
          accent="border-amber-200 dark:border-amber-700/40"
        />
        <StatCard
          label="Top diagnosis"
          value={stats.top_diagnosis ?? '—'}
          sub="most common"
          accent="border-blue-200 dark:border-blue-700/40"
        />
      </div>

      {/* Visit type filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {VISIT_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setVisitType(tab.key); setPage(1) }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all border ${
              visitType === tab.key
                ? 'bg-[#1a6cbf] text-white border-[#1a6cbf] shadow-sm'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700 hover:text-[#1a6cbf] dark:hover:text-blue-400'
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] !== undefined && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                visitType === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden transition-colors">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">
            {patients.length.toLocaleString()} patients
          </h3>

          {/* Gender filter */}
          <select
            value={gender}
            onChange={(e) => { setGender(e.target.value); setPage(1) }}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          >
            <option value="all">All genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>

          {/* Fee status filter */}
          <select
            value={feeStatus}
            onChange={(e) => { setFeeStatus(e.target.value); setPage(1) }}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          >
            <option value="all">All fees</option>
            <option value="paid">Paid</option>
            <option value="pending">Has unpaid</option>
            <option value="waived">Has waived</option>
          </select>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
            </svg>
            <input
              value={search}
              onChange={handleSearch}
              placeholder="Name, phone, ID…"
              className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-44 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Export */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export
          </button>

          {patientsQuery.isFetching && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 animate-pulse">Loading…</span>
          )}
        </div>

        {/* Table */}
        {patientsQuery.isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Patient</th>
                  <th className="text-left px-5 py-3">Last visit</th>
                  <th className="text-left px-5 py-3">Type</th>
                  <th className="text-left px-5 py-3">Last diagnosis</th>
                  <th className="text-left px-5 py-3">Visits</th>
                  <th className="text-left px-5 py-3">Total billed</th>
                  <th className="text-left px-5 py-3">Unpaid</th>
                  <th className="text-left px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-14 text-[13px] text-gray-400 dark:text-gray-500">
                      No patients found
                    </td>
                  </tr>
                ) : patients.map((p) => {
                  const age = getAge(p.date_of_birth)
                  return (
                    <tr key={p.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors group">

                      {/* Patient */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              {age !== null ? `${age} yrs` : '—'}
                              {p.allergies && <> · <span className="text-orange-500 dark:text-orange-400">⚠</span></>}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Last visit date */}
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-[11px] whitespace-nowrap">
                        {p.last_visit_date ? (
                          <>
                            <p>{formatDate(p.last_visit_date)}</p>
                            <p className="text-gray-300 dark:text-gray-600">{formatTime(p.last_visit_date)}</p>
                          </>
                        ) : '—'}
                      </td>

                      {/* Last visit type */}
                      <td className="px-5 py-3.5">
                        {p.last_visit_type ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${VISIT_TYPE_COLORS[p.last_visit_type]}`}>
                            {VISIT_TYPE_LABELS[p.last_visit_type]}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Last diagnosis */}
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 max-w-45 truncate" title={p.last_diagnosis}>
                        {p.last_diagnosis ?? <span className="text-gray-300 dark:text-gray-600 italic">None recorded</span>}
                      </td>

                      {/* Total visits */}
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{p.total_visits}</span>
                      </td>

                      {/* Total billed */}
                      <td className="px-5 py-3.5 font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {p.total_billed.toLocaleString()}
                      </td>

                      {/* Unpaid balance */}
                      <td className="px-5 py-3.5">
                        {p.unpaid_balance > 0 ? (
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            {p.unpaid_balance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-500 dark:text-emerald-400 text-[11px] font-semibold">Cleared</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/patients/${p.id}`}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-[#1a6cbf] dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-5 py-3 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {total === 0
              ? 'No patients found'
              : `Showing ${((page - 1) * 20) + 1}–${Math.min(page * 20, total)} of ${total.toLocaleString()} · Page ${page}/${totalPages}`
            }
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </button>

            {getPageNumbers().map((pg, i) =>
              pg === '...' ? (
                <span key={`dots-${i}`} className="text-[11px] text-gray-400 dark:text-gray-500 px-1">···</span>
              ) : (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-medium transition-colors ${
                    page === pg
                      ? 'bg-[#1a6cbf] text-white border border-[#1a6cbf]'
                      : 'border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {pg}
                </button>
              )
            )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Detail slide-over */}
      {selectedId && (
        <PatientDetailPanel
          patientId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}