'use client'

// PatientDatabaseTab — archive of patients the doctor has actually consulted.
// Only visits that went through consultation (have a diagnosis OR reached
// with_doctor/lab/pharmacy/billing/done/archived) are shown — waiting/paid-only
// visits that haven't seen the doctor are excluded (server enforces this).
//
// Filters: search (name / phone / diagnosis), gender, age group, visit type,
// allergies, date range, AND a diagnosis dropdown built from the clinic's OWN
// recorded diagnosis codes (returned by the API — no hardcoded catalog).
//
// Each card shows: diagnosis + vitals + SOAP + procedure + the bill
// (fees, paid, balance, payments[] breakdown by method).
//
// API:
//   GET /api/doctor/patients
//     Query params: search, gender, age_group, visit_type, diagnosis_code,
//                   has_allergies, date_from, date_to
//     Returns: { records: [...], stats: {...}, diagnoses: [{code,label,count}] }

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, formatDate, timeAgo, cap, formatMoney, badgeClass,
} from '@/utils/helpers'
import { MedicalReportModal } from '@/components/doctor/MedicalReportModal'

const inputCls =
  'w-full pl-9 pr-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const GENDER_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
]

const AGE_GROUPS = [
  { key: 'all', label: 'All Ages' },
  { key: 'under5', label: 'Under 5' },
  { key: 'over5', label: 'Over 5' },
  { key: 'under18', label: 'Under 18' },
  { key: 'adult', label: 'Adult' },
  { key: 'senior', label: 'Senior' },
]

const VISIT_TYPE_FILTERS = [
  { key: 'all', label: 'All Visits' },
  { key: 'consultation', label: 'Consultation' },
  { key: 'injection', label: 'Injection' },
  { key: 'family_planning', label: 'Family Planning' },
]

// Visit type badge colours
const VISIT_BADGES = {
  consultation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  injection: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  family_planning: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  direct_lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

function visitBadgeClass(t) {
  return VISIT_BADGES[t] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'
}

function visitLabel(t) {
  if (t === 'family_planning') return 'Family Planning'
  if (t === 'direct_lab') return 'Direct Lab'
  return cap(t)
}

export default function PatientDatabaseTab() {
  // Filter state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [gender, setGender] = useState('all')
  const [ageGroup, setAgeGroup] = useState('all')
  const [visitType, setVisitType] = useState('all')
  const [diagnosisCode, setDiagnosisCode] = useState('all')
  const [hasAllergies, setHasAllergies] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reportVisitId, setReportVisitId] = useState(null)

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Build the query string for the API
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (gender !== 'all') params.set('gender', gender)
    if (ageGroup !== 'all') params.set('age_group', ageGroup)
    if (visitType !== 'all') params.set('visit_type', visitType)
    if (diagnosisCode !== 'all') params.set('diagnosis_code', diagnosisCode)
    if (hasAllergies) params.set('has_allergies', '1')
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [debouncedSearch, gender, ageGroup, visitType, diagnosisCode, hasAllergies, dateFrom, dateTo])

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['doctor', 'patients', queryString],
    queryFn: () => api.get(`/api/doctor/patients${queryString}`),
    staleTime: 30000,
  })

  const records = data?.records || []
  const diagnoses = data?.diagnoses || []
  const stats = data?.stats || {
    total_records: 0,
    unique_patients: 0,
    with_diagnosis: 0,
    with_allergies: 0,
  }

  const hasActiveFilters =
    debouncedSearch !== '' ||
    gender !== 'all' ||
    ageGroup !== 'all' ||
    visitType !== 'all' ||
    diagnosisCode !== 'all' ||
    hasAllergies ||
    dateFrom !== '' ||
    dateTo !== ''

  const clearFilters = () => {
    setSearch('')
    setGender('all')
    setAgeGroup('all')
    setVisitType('all')
    setDiagnosisCode('all')
    setHasAllergies(false)
    setDateFrom('')
    setDateTo('')
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="list" color="blue" label="Total Records" value={stats.total_records} sublabel="visits recorded" />
        <StatCard icon="users" color="purple" label="Unique Patients" value={stats.unique_patients} sublabel="individuals" />
        <StatCard icon="fileText" color="green" label="With Diagnosis" value={stats.with_diagnosis} sublabel="diagnosed visits" />
        <StatCard icon="alert" color="amber" label="With Allergies" value={stats.with_allergies} sublabel="allergy flagged" />
      </div>

      {/* Search + filter bar */}
      <Card className="p-3 space-y-3">
        {/* Search row */}
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient name, phone, or diagnosis…"
            className={inputCls}
          />
          {isFetching && (
            <Icon name="refresh" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Gender pills */}
        <FilterRow label="Gender">
          {GENDER_FILTERS.map((g) => (
            <FilterPill key={g.key} active={gender === g.key} onClick={() => setGender(g.key)}>
              {g.label}
            </FilterPill>
          ))}
        </FilterRow>

        {/* Age group pills */}
        <FilterRow label="Age Group">
          {AGE_GROUPS.map((a) => (
            <FilterPill key={a.key} active={ageGroup === a.key} onClick={() => setAgeGroup(a.key)}>
              {a.label}
            </FilterPill>
          ))}
        </FilterRow>

        {/* Visit type pills */}
        <FilterRow label="Visit Type">
          {VISIT_TYPE_FILTERS.map((v) => (
            <FilterPill key={v.key} active={visitType === v.key} onClick={() => setVisitType(v.key)}>
              {v.label}
            </FilterPill>
          ))}
        </FilterRow>

        {/* Diagnosis dropdown — built from the clinic's own recorded codes */}
        <FilterRow label="Diagnosis">
          <div className="relative flex-1 min-w-50">
            <select
              value={diagnosisCode}
              onChange={(e) => setDiagnosisCode(e.target.value)}
              className="w-full appearance-none pl-3 pr-9 py-1.5 text-[12px] rounded-full border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf] cursor-pointer"
            >
              <option value="all">All diagnoses</option>
              {diagnoses.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.label} ({d.count})
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </FilterRow>

        {/* Date range filter — preset pills */}
        <FilterRow label="Date Range">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(() => {
              const now = new Date()
              const todayStr = now.toISOString().split('T')[0]
              const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
              const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1)
              const yearAgo = new Date(now); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
              const presets = [
                { key: 'today', label: 'Today', from: todayStr, to: todayStr },
                { key: 'week', label: 'This Week', from: weekAgo.toISOString().split('T')[0], to: todayStr },
                { key: 'month', label: 'This Month', from: monthAgo.toISOString().split('T')[0], to: todayStr },
                { key: 'year', label: 'This Year', from: yearAgo.toISOString().split('T')[0], to: todayStr },
              ]
              const activeKey = presets.find((p) => p.from === dateFrom && p.to === dateTo)?.key
              return presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                  className={[
                    'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                    activeKey === p.key
                      ? 'bg-[#1a6cbf] text-white'
                      : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))
            })()}
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo('') }}
                className="px-2.5 py-1 rounded-full text-[12px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              >
                All Time
              </button>
            )}
          </div>
        </FilterRow>

        {/* Allergies toggle + clear */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-gray-100 dark:border-gray-700/40">
          <button
            type="button"
            onClick={() => setHasAllergies((v) => !v)}
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              hasAllergies
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-amber-300 dark:hover:border-amber-700',
            ].join(' ')}
          >
            <Icon name="alert" size={13} />
            Only with allergies
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5"
            >
              <Icon name="x" size={13} /> Clear Filters
            </button>
          )}
        </div>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          Showing <span className="font-semibold text-gray-700 dark:text-gray-300">{records.length}</span>{' '}
          record{records.length !== 1 ? 's' : ''}
          {hasActiveFilters && <span className="text-gray-400"> · filtered</span>}
        </p>
      </div>

      {/* Patient list */}
      {!records.length ? (
        <EmptyState
          icon="users"
          title={hasActiveFilters ? 'No matching records' : 'No patient records yet'}
          description={hasActiveFilters
            ? 'Try adjusting your filters or clearing them to see more patients.'
            : 'Patient records will appear here as visits are recorded.'}
          action={hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
            >
              <Icon name="x" size={13} /> Clear Filters
            </button>
          ) : null}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {records.map((r) => (
            <PatientCard
              key={`${r.visit_id}-${r.patient_id}`}
              record={r}
              onPrint={() => setReportVisitId(r.visit_id)}
            />
          ))}
        </div>
      )}

      {/* Medical report modal — print a formal report for a past visit */}
      {reportVisitId && (
        <MedicalReportModal
          visitId={reportVisitId}
          onClose={() => setReportVisitId(null)}
        />
      )}
    </div>
  )
}

// ─── Filter row + pill ────────────────────────────────────────────────────────

function FilterRow({ label, children }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20 shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  )
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
        active
          ? 'bg-[#1a6cbf] text-white'
          : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── Patient card ─────────────────────────────────────────────────────────────

function PatientCard({ record, onPrint }) {
  const [expanded, setExpanded] = useState(false)

  const totalFees =
    (record.consultation_fee || 0) +
    (record.lab_fee || 0) +
    (record.medication_fee || 0) +
    (record.procedure_fee || 0)
  const paid = record.paid_amount || 0
  const balance = Math.max(0, totalFees - paid)
  const hasVitals = record.bp_systolic || record.temperature || record.pulse || record.weight || record.height || record.spo2
  const hasSoap = record.subjective || record.objective || record.assessment || record.plan
  const bmi = record.weight && record.height
    ? (parseFloat(record.weight) / Math.pow(parseFloat(record.height) / 100, 2)).toFixed(1)
    : null

  return (
    <Card className="overflow-hidden">
      {/* Compact row — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div className={[
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          record.patient_gender === 'female' ? 'bg-pink-100 dark:bg-pink-900/30' : 'bg-blue-100 dark:bg-blue-900/30',
        ].join(' ')}>
          <span className={[
            'text-[11px] font-semibold',
            record.patient_gender === 'female' ? 'text-pink-600 dark:text-pink-400' : 'text-blue-600 dark:text-blue-400',
          ].join(' ')}>
            {record.patient_name?.charAt(0) || 'P'}
          </span>
        </div>

        {/* Name + visit info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 truncate">{record.patient_name}</span>
            <span className="text-[10px] text-gray-400">{record.patient_age}y · {cap(record.patient_gender)}</span>
          </div>
          <p className="text-[10px] text-gray-400 truncate">
            {formatDate(record.arrived_at)} · {visitLabel(record.visit_type)} · {record.diagnosis || 'No diagnosis yet'}
          </p>
        </div>

        {/* Diagnosis code badge (if set) */}
        {record.diagnosis_code && (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px] font-bold shrink-0">
            {record.diagnosis_code}
          </Badge>
        )}

        {/* Status */}
        <Badge className={`${badgeClass(record.status)} shrink-0 hidden sm:inline-flex`}>{cap(record.status)}</Badge>

        {/* Bill total */}
        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums shrink-0">
          {formatMoney(totalFees)}
        </span>

        {/* Expand chevron */}
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} className="text-gray-400 shrink-0" />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700/40 space-y-3 bg-gray-50/30 dark:bg-gray-800/20">
          {/* Top row: badges + print button */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={visitBadgeClass(record.visit_type)}><Icon name="tag" size={10} /> {visitLabel(record.visit_type)}</Badge>
            <Badge className={badgeClass(record.status)}>{cap(record.status)}</Badge>
            {record.blood_group && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><Icon name="droplet" size={10} /> {record.blood_group}</Badge>
            )}
            {record.allergies && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Icon name="alert" size={10} /> {record.allergies}</Badge>
            )}
            <button
              onClick={onPrint}
              title="Print medical report"
              className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] transition-colors"
            >
              <Icon name="printer" size={12} /> Print Report
            </button>
          </div>

          {/* Contact + doctor info */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500 dark:text-gray-400">
            {record.phone && <span className="flex items-center gap-1"><Icon name="phone" size={11} /> {record.phone}</span>}
            {record.doctor && <span className="flex items-center gap-1"><Icon name="stethoscope" size={11} /> {record.doctor}</span>}
            <span className="flex items-center gap-1"><Icon name="clock" size={11} /> Visit #{record.visit_id}</span>
          </div>

          {/* Diagnosis */}
          {record.diagnosis && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2">
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <Icon name="fileText" size={11} /> Diagnosis
                {record.diagnosis_code && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">{record.diagnosis_code}</span>
                )}
              </p>
              <p className="text-[12px] text-emerald-900 dark:text-emerald-200 mt-0.5">{record.diagnosis}</p>
            </div>
          )}

          {/* Vitals */}
          {hasVitals && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Vital Signs</p>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                {record.bp_systolic && record.bp_diastolic && <DetailMini label="BP" value={`${record.bp_systolic}/${record.bp_diastolic}`} />}
                {record.temperature && <DetailMini label="Temp" value={`${record.temperature}°C`} />}
                {record.pulse && <DetailMini label="Pulse" value={`${record.pulse} bpm`} />}
                {record.respiratory_rate && <DetailMini label="RR" value={`${record.respiratory_rate}/min`} />}
                {record.weight && <DetailMini label="Wt" value={`${record.weight}kg`} />}
                {record.height && <DetailMini label="Ht" value={`${record.height}cm`} />}
                {bmi && <DetailMini label="BMI" value={bmi} />}
                {record.spo2 && <DetailMini label="SpO₂" value={`${record.spo2}%`} />}
              </div>
            </div>
          )}

          {/* SOAP notes */}
          {hasSoap && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Clinical Notes (SOAP)</p>
              <div className="space-y-1 text-[11px]">
                {record.subjective && <SoapMini letter="S" value={record.subjective} />}
                {record.objective && <SoapMini letter="O" value={record.objective} />}
                {record.assessment && <SoapMini letter="A" value={record.assessment} />}
                {record.plan && <SoapMini letter="P" value={record.plan} />}
              </div>
            </div>
          )}

          {/* Procedure */}
          {record.procedure_name && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Procedure</p>
                <p className="text-[12px] text-gray-700 dark:text-gray-300">{record.procedure_name}</p>
              </div>
              <span className="text-[12px] font-bold text-blue-700 dark:text-blue-400 tabular-nums">{formatMoney(record.procedure_fee)}</span>
            </div>
          )}

          {/* Financial summary */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Bill Summary</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <FeeLine label="Consultation" amount={record.consultation_fee} />
              <FeeLine label="Lab" amount={record.lab_fee} />
              <FeeLine label="Medication" amount={record.medication_fee} />
              <FeeLine label="Procedure" amount={record.procedure_fee} />
              <FeeLine label="Total" amount={totalFees} strong />
              <FeeLine label="Paid" amount={paid} strong positive />
              {balance > 0 && <FeeLine label="Balance" amount={balance} strong negative />}
            </div>
            {record.payments && record.payments.length > 0 && (
              <div className="mt-1 space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Payment Breakdown</p>
                {record.payments.map((pmt, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-gray-50 dark:bg-gray-700/20">
                    <span className="flex items-center gap-1.5">
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300 uppercase text-[9px]">{pmt.method}</Badge>
                      {pmt.reference && <span className="text-gray-400">Ref: {pmt.reference}</span>}
                      {pmt.stage === 1 && <span className="text-[9px] text-blue-500">stage 1</span>}
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{formatMoney(pmt.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function DetailMini({ label, value }) {
  return (
    <div className="rounded bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/40 px-2 py-1 text-center">
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{value}</p>
    </div>
  )
}

function SoapMini({ letter, value }) {
  return (
    <div className="flex gap-1.5">
      <span className="w-4 h-4 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{letter}</span>
      <span className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{value}</span>
    </div>
  )
}

function FeeLine({ label, amount, strong = false, positive = false, negative = false }) {
  const valueColor = positive
    ? 'text-emerald-600 dark:text-emerald-400'
    : negative
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-700 dark:text-gray-300'
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-gray-50 dark:bg-gray-700/20">
      <span className={`text-gray-500 dark:text-gray-400 ${strong ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : 'font-medium'} ${valueColor}`}>
        {formatMoney(amount || 0)}
      </span>
    </div>
  )
}