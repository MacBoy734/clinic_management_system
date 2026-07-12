'use client'

// PatientDatabaseTab — a searchable / filterable database of every patient
// visit the doctor has access to. The doctor can quickly find any patient by
// name, filter by gender / age group / visit type / allergies, and review
// their diagnosis & fees.
//
// API:
//   GET /api/doctor/patients
//     Query params:
//       diagnosis      — only return records with a diagnosis
//       age_group      — under5 | over5 | under18 | adult | senior
//       gender         — male | female
//       search         — name / phone / chief complaint substring
//       visit_type     — consultation | injection | family_planning | direct_lab
//       has_allergies  — '1' to filter to records with allergies only
//     Returns: { records: [...], stats: { total_records, unique_patients,
//                                         with_diagnosis, male, female,
//                                         under5, over5, with_allergies } }
//
// Each record: { visit_id, patient_id, patient_name, patient_gender,
//                patient_age, blood_group, allergies, phone, visit_type,
//                status, chief_complaint, diagnosis, diagnosis_code,
//                doctor, arrived_at, fees... }

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, formatDate, timeAgo, cap, formatMoney, badgeClass,
} from '@/components/dashboard'

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

const VISIT_TYPES = [
  { key: 'all', label: 'All Visits' },
  { key: 'consultation', label: 'Consultation' },
  { key: 'injection', label: 'Injection' },
  { key: 'family_planning', label: 'Family Planning' },
  { key: 'direct_lab', label: 'Direct Lab' },
]

// Visit type badge colours (mirrors helpers.js VISIT_TYPES)
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
  const [hasAllergies, setHasAllergies] = useState(false)

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
    if (hasAllergies) params.set('has_allergies', '1')
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [debouncedSearch, gender, ageGroup, visitType, hasAllergies])

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['doctor', 'patients', queryString],
    queryFn: () => api.get(`/api/doctor/patients${queryString}`),
    staleTime: 30000,
  })

  const records = data?.records || []
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
    hasAllergies

  const clearFilters = () => {
    setSearch('')
    setGender('all')
    setAgeGroup('all')
    setVisitType('all')
    setHasAllergies(false)
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
            placeholder="Search by patient name, phone, or chief complaint…"
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
          {VISIT_TYPES.map((v) => (
            <FilterPill key={v.key} active={visitType === v.key} onClick={() => setVisitType(v.key)}>
              {v.label}
            </FilterPill>
          ))}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {records.map((r) => (
            <PatientCard key={`${r.visit_id}-${r.patient_id}`} record={r} />
          ))}
        </div>
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

function PatientCard({ record }) {
  const [expanded, setExpanded] = useState(false)

  const totalFees =
    (record.consultation_fee || 0) +
    (record.lab_fee || 0) +
    (record.medication_fee || 0) +
    (record.procedure_fee || 0)
  const paid = record.paid_amount || 0
  const balance = Math.max(0, totalFees - paid)

  return (
    <Card className="p-4">
      {/* Top: avatar + name + badges */}
      <div className="flex items-start gap-3">
        <div className={[
          'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
          record.patient_gender === 'female'
            ? 'bg-pink-100 dark:bg-pink-900/30'
            : 'bg-blue-100 dark:bg-blue-900/30',
        ].join(' ')}>
          <span className={[
            'text-[13px] font-semibold',
            record.patient_gender === 'female'
              ? 'text-pink-600 dark:text-pink-400'
              : 'text-blue-600 dark:text-blue-400',
          ].join(' ')}>
            {record.patient_name?.charAt(0) || 'P'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
              {record.patient_name}
            </span>
            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
              {record.patient_age}y · {cap(record.patient_gender)}
            </Badge>
            {record.blood_group && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <Icon name="droplet" size={10} /> {record.blood_group}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Visit #{record.visit_id} · {formatDate(record.arrived_at)} · {formatTime(record.arrived_at)}
          </p>
        </div>

        {/* Status badge */}
        <Badge className={badgeClass(record.status)}>{cap(record.status)}</Badge>
      </div>

      {/* Visit type badge + phone */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Badge className={visitBadgeClass(record.visit_type)}>
          <Icon name="tag" size={10} /> {visitLabel(record.visit_type)}
        </Badge>
        {record.phone && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Icon name="phone" size={11} /> {record.phone}
          </span>
        )}
        {record.doctor && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Icon name="stethoscope" size={11} /> {record.doctor}
          </span>
        )}
      </div>

      {/* Chief complaint */}
      {record.chief_complaint && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Chief complaint</p>
          <p className="text-[12px] text-gray-700 dark:text-gray-300 mt-0.5">{record.chief_complaint}</p>
        </div>
      )}

      {/* Diagnosis (highlighted) */}
      {record.diagnosis && (
        <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2">
          <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Icon name="fileText" size={11} /> Diagnosis
            {record.diagnosis_code && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                {record.diagnosis_code}
              </span>
            )}
          </p>
          <p className="text-[12px] text-emerald-900 dark:text-emerald-200 mt-0.5">{record.diagnosis}</p>
        </div>
      )}

      {/* Allergies warning */}
      {record.allergies && (
        <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 flex items-start gap-2">
          <Icon name="alert" size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
              Allergies
            </p>
            <p className="text-[12px] text-red-700 dark:text-red-300 mt-0.5">{record.allergies}</p>
          </div>
        </div>
      )}

      {/* Fee summary + expand toggle */}
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/40">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-[12px]"
        >
          <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Icon name="receipt" size={12} />
            Fee details
            <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
              {formatMoney(totalFees)}
            </span>
            {balance > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                · Bal {formatMoney(balance)}
              </span>
            )}
          </span>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={13} className="text-gray-400" />
        </button>

        {expanded && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <FeeLine label="Consultation" amount={record.consultation_fee} />
            <FeeLine label="Lab" amount={record.lab_fee} />
            <FeeLine label="Medication" amount={record.medication_fee} />
            <FeeLine label="Procedure" amount={record.procedure_fee} />
            <FeeLine label="Total" amount={totalFees} strong />
            <FeeLine label="Paid" amount={paid} strong positive />
            {balance > 0 && <FeeLine label="Balance" amount={balance} strong negative />}
            {record.payment_method && (
              <div className="col-span-2 text-[10px] text-gray-400 mt-1 flex items-center gap-1.5">
                <Icon name="dollarSign" size={10} />
                Paid via <span className="font-semibold text-gray-600 dark:text-gray-300 uppercase">{record.payment_method}</span>
                {record.payment_reference && (
                  <span className="text-gray-400">· Ref: {record.payment_reference}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
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