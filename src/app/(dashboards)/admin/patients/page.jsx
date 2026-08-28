'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import api from '@/lib/api'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonList
} from '@/utils/helpers'
import { DIAGNOSIS_CATALOG, DIAGNOSIS_CATEGORIES } from '@/lib/diagnosis_catalog'

// ─── React Query hooks ────────────────────────────────────────────────────────
function usePatients({ page, period, visitType, feeStatus, gender, search }) {
  return useQuery({
    queryKey: ['admin', 'patients', { page, period, visitType, feeStatus, gender, search }],
    queryFn: () =>
      api.get(
        `/api/admin/patients?page=${page}&limit=20&period=${period}&visit_type=${visitType}&fee_status=${feeStatus}&gender=${gender}&search=${encodeURIComponent(search)}`
      ),
    placeholderData: (prev) => prev,
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

// NEW: Insights hook — endpoint to be built later
function usePatientInsights(period) {
  return useQuery({
    queryKey: ['admin', 'patient-insights', period],
    queryFn: () => api.get(`/api/admin/patients/insights?period=${period}`),
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

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { key: 'records', label: 'Patient Records', icon: 'list' },
  { key: 'insights', label: 'Patient Insights', icon: 'barChart' },
]

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
                  {patient.age !== null ? `${patient.age} yrs` : 'Age N/A'}
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

// ─── Patient Insights Sub-Tab ─────────────────────────────────────────────────
function PatientInsightsSubTab({ period }) {
  const q = usePatientInsights(period)

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={6} />
      </div>
    )
  }
  if (q.isError) return <ErrorState message={q.error?.message || 'Could not load insights'} onRetry={q.refetch} />

  // NOTE: The endpoint should return { records: [...] } where each record has:
  // patient_id, patient_gender, patient_age, allergies, diagnosis_code, diagnosis
  const records = Array.isArray(q.data?.records) ? q.data.records : []
  const total = records.length
  const male = records.filter((r) => r.patient_gender === 'male').length
  const female = records.filter((r) => r.patient_gender === 'female').length
  const withAllergies = records.filter((r) => r.allergies).length

  // Age bands
  const ageBands = [
    { key: 'under5', label: '0–4', filter: (r) => r.patient_age != null && r.patient_age < 5 },
    { key: '5_17', label: '5–17', filter: (r) => r.patient_age != null && r.patient_age >= 5 && r.patient_age < 18 },
    { key: '18_29', label: '18–29', filter: (r) => r.patient_age != null && r.patient_age >= 18 && r.patient_age < 30 },
    { key: '30_44', label: '30–44', filter: (r) => r.patient_age != null && r.patient_age >= 30 && r.patient_age < 45 },
    { key: '45_59', label: '45–59', filter: (r) => r.patient_age != null && r.patient_age >= 45 && r.patient_age < 60 },
    { key: '60_plus', label: '60+', filter: (r) => r.patient_age != null && r.patient_age >= 60 },
  ]
  const pyramid = ageBands.map((b) => ({
    ...b,
    male: records.filter((r) => b.filter(r) && r.patient_gender === 'male').length,
    female: records.filter((r) => b.filter(r) && r.patient_gender === 'female').length,
  }))
  const pyramidMax = Math.max(1, ...pyramid.flatMap((p) => [p.male, p.female]))

  // Diagnosis tally
  const codeMap = new Map()
  for (const r of records) {
    if (!r.diagnosis_code) continue
    const existing = codeMap.get(r.diagnosis_code) || { code: r.diagnosis_code, label: r.diagnosis || r.diagnosis_code, count: 0 }
    existing.count += 1
    codeMap.set(r.diagnosis_code, existing)
  }
  const codeByCode = new Map(DIAGNOSIS_CATALOG.map((d) => [d.code, d]))
  const codeRows = Array.from(codeMap.values())
    .map((r) => {
      const meta = codeByCode.get(r.code)
      return {
        ...r,
        category: meta?.category || 'general',
        categoryLabel: meta ? DIAGNOSIS_CATEGORIES[meta.category] : 'General / Symptoms',
      }
    })
    .sort((a, b) => b.count - a.count)

  const diagnosed = codeRows.reduce((s, r) => s + r.count, 0)
  const topCode = codeRows[0]?.code || '—'

  const topDiagnoses = codeRows.slice(0, 8)
  const maxDiagCount = Math.max(1, ...topDiagnoses.map((d) => d.count))

  const catMap = new Map()
  for (const r of codeRows) {
    catMap.set(r.category, (catMap.get(r.category) || 0) + r.count)
  }
  const catRows = Object.entries(DIAGNOSIS_CATEGORIES)
    .map(([key, label]) => ({ key, label, count: catMap.get(key) || 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)

  const heatmap = pyramid.map((band) => ({
    band,
    cells: topDiagnoses.map((d) => records.filter((r) => band.filter(r) && r.diagnosis_code === d.code).length),
  }))
  const heatMax = Math.max(1, ...heatmap.flatMap((row) => row.cells))

  const coveragePct = total > 0 ? Math.round((diagnosed / total) * 100) : 0

    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Patient Insights</h3>
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

      {/* 5 stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <InsightStat icon="list" color="blue" label="Total Records" value={total} sublabel="done + archived" />
        <InsightStat icon="users" color="purple" label="Unique Patients" value={new Set(records.map((r) => r.patient_id)).size} sublabel="individuals" />
        <InsightStat icon="fileText" color="green" label="Diagnosed" value={diagnosed} sublabel={`${coveragePct}% coverage`} />
        <InsightStat icon="alert" color="amber" label="With Allergies" value={withAllergies} sublabel="allergy flagged" />
        <InsightStat icon="tag" color="cyan" label="Top ICD Code" value={topCode} sublabel={codeRows[0]?.label || '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Population Pyramid */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader title="Population Pyramid" subtitle={`${male} male · ${female} female`} />
          <div className="p-4 space-y-1.5">
            {total === 0 ? (
              <EmptyState icon="users" title="No patient data" description="" />
            ) : (
              <>
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 px-1">
                  <span className="text-blue-600 dark:text-blue-400">← Male</span>
                  <span>Age Band</span>
                  <span className="text-fuchsia-600 dark:text-fuchsia-400">Female →</span>
                </div>
                {pyramid.map((b) => (
                  <div key={b.key} className="grid grid-cols-[1fr_60px_1fr] items-center gap-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{b.male || ''}</span>
                      <div className="h-4 bg-blue-500 rounded-l-sm transition-all" style={{ width: `${(b.male / pyramidMax) * 100}%`, minWidth: b.male > 0 ? '4px' : '0' }} />
                    </div>
                    <div className="text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300">{b.label}</div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-4 bg-fuchsia-500 rounded-r-sm transition-all" style={{ width: `${(b.female / pyramidMax) * 100}%`, minWidth: b.female > 0 ? '4px' : '0' }} />
                      <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{b.female || ''}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>

        {/* Diagnosis Coverage Ring */}
        <Card className="overflow-hidden">
          <CardHeader title="Diagnosis Coverage" subtitle="records with an ICD-10 code" />
          <div className="p-4 flex flex-col items-center justify-center">
            <div className="relative w-40 h-40 my-2">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: `conic-gradient(#10b981 0% ${coveragePct}%, #e5e7eb ${coveragePct}% 100%)` }}
              />
              <div className="absolute inset-3 rounded-full bg-white dark:bg-[#1e293b] flex flex-col items-center justify-center">
                <p className="text-[28px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{coveragePct}%</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">covered</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-2 py-1.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Diagnosed</p>
                <p className="text-[16px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{diagnosed}</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700/60 px-2 py-1.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Undiagnosed</p>
                <p className="text-[16px] font-bold tabular-nums text-gray-700 dark:text-gray-300">{Math.max(0, total - diagnosed)}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 8 Diagnoses */}
        <Card className="overflow-hidden">
          <CardHeader title="Top 8 Diagnoses" subtitle="by record volume" />
          <div className="p-4 space-y-3">
            {topDiagnoses.length === 0 ? (
              <EmptyState icon="activity" title="No diagnoses recorded" description="" />
            ) : (
              topDiagnoses.map((d) => (
                <div key={d.code}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px] font-bold shrink-0">{d.code}</Badge>
                      <span className="truncate text-gray-700 dark:text-gray-300">{d.label}</span>
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0 ml-2">{d.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(d.count / maxDiagCount) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* By Category */}
        <Card className="overflow-hidden">
          <CardHeader title="By ICD-10 Category" subtitle={`${catRows.length} categor${catRows.length === 1 ? 'y' : 'ies'}`} />
          <div className="p-4">
            {catRows.length === 0 ? (
              <EmptyState icon="tag" title="No categories" description="" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {catRows.map((c, i) => {
                  const palette = [
                    'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500',
                    'bg-cyan-500', 'bg-pink-500', 'bg-rose-500', 'bg-indigo-500',
                    'bg-teal-500', 'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-500',
                  ]
                  const color = palette[i % palette.length]
                  return (
                    <div key={c.key} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700/60 px-2.5 py-2">
                      <span className={`w-3 h-3 rounded-sm ${color} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{c.label}</p>
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">{c.count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Age × Diagnosis Heatmap */}
      <Card className="overflow-hidden">
        <CardHeader title="Age × Diagnosis Heatmap" subtitle="record count by age band × top diagnoses" />
        <div className="p-4">
          {topDiagnoses.length === 0 ? (
            <EmptyState icon="barChart" title="No diagnosis data" description="Heatmap will appear once visits are coded." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: '2px' }}>
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 py-1 sticky left-0 bg-white dark:bg-[#1e293b]">Age Band</th>
                    {topDiagnoses.map((d) => (
                      <th key={d.code} className="text-center text-[10px] font-semibold px-1 py-1 min-w-11">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold">{d.code}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => (
                    <tr key={row.band.key}>
                      <td className="text-left text-[11px] font-medium text-gray-700 dark:text-gray-300 px-2 py-1 whitespace-nowrap sticky left-0 bg-white dark:bg-[#1e293b]">{row.band.label}</td>
                      {row.cells.map((count, i) => {
                        const intensity = count === 0 ? 0 : Math.max(0.18, count / heatMax)
                        return (
                          <td
                            key={i}
                            className="text-center text-[11px] font-semibold tabular-nums rounded-md px-1 py-1.5"
                            style={{
                              backgroundColor: count === 0 ? 'rgba(229, 231, 235, 0.3)' : `rgba(16, 185, 129, ${intensity})`,
                              color: count === 0 ? '#9ca3af' : intensity > 0.55 ? '#ffffff' : '#065f46',
                            }}
                            title={`${row.band.label} × ${topDiagnoses[i]?.code}: ${count}`}
                          >
                            {count || ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ICD-10 Codes table */}
      <Card className="overflow-hidden">
        <CardHeader title="ICD-10 Codes" subtitle={`${codeRows.length} code${codeRows.length === 1 ? '' : 's'}`} />
        {codeRows.length === 0 ? (
          <EmptyState icon="tag" title="No ICD codes recorded" description="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">ICD Code</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Diagnosis</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {codeRows.map((r, i) => (
                  <tr key={`${r.code}-${i}`} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold">{r.code}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-gray-900 dark:text-gray-100">{r.label}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-[12px] text-gray-500 dark:text-gray-400">{r.categoryLabel}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{r.count}</td>
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

function InsightStat({ icon, color, label, value, sublabel }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50 text-blue-700 dark:text-blue-400',
    purple: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50 text-purple-700 dark:text-purple-400',
    green:  'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400',
    amber:  'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 text-amber-700 dark:text-amber-400',
    cyan:   'bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-900/50 text-cyan-700 dark:text-cyan-400',
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`rounded-xl border p-4 ${c}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-white/60 dark:bg-white/5 flex items-center justify-center">
          <Icon name={icon} size={16} className={c.split(' ').find((cl) => cl.startsWith('text-'))} />
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {sublabel && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sublabel}</p>}
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
  const [subTab, setSubTab]       = useState('records')

  const patientsQuery = usePatients({ page, period, visitType, feeStatus, gender, search })
  const statsQuery    = usePatientStats(period)

  const allPatients = patientsQuery.data?.patients ?? []
  const total       = patientsQuery.data?.total    ?? 0
  const stats       = statsQuery.data              ?? {}

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
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {total} patient{total !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => patientsQuery.refetch()}
            disabled={patientsQuery.isFetching}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon 
              name="refresh" 
              size={13} 
              className={patientsQuery.isFetching ? 'animate-spin' : ''} 
            />
            {patientsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
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
      </div>

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors border ${
              subTab === t.key
                ? 'bg-[#1a6cbf] text-white border-[#1a6cbf]'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === 'records' ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Total patients"
              value={(stats.total_patients ?? 0).toLocaleString()}
              sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
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
                                  {p.age !== null ? `${p.age} yrs` : '—'}
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
      ) : (
        <PatientInsightsSubTab period={period} />
      )}
    </>
  )
}