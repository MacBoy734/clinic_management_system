'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonList, ErrorState, EmptyState, Card, Badge, Icon,
  badgeClass, cap, formatTime, formatMoney, waitMinutes, VISIT_TYPES, PAYMENT_METHODS,
} from '@/utils/helpers'
import { PaymentModal } from '@/components/reception/paymentModal'

const STATUS_FILTERS = ['all', 'waiting', 'consultation_paid', 'with_doctor', 'lab', 'pharmacy', 'billing', 'done']

// ─── Register modal ───────────────────────────────────────────────────────────
const EMPTY_PATIENT = {
  name: '', gender: 'male', phone: '', national_id: '', age: '',
}

const inputCls = 'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ─── Lab test picker — direct_lab visits only ──────────────────────────────
// Searchable, grouped-by-category multi-select over LabTestCatalog. Kept as
// its own component since it has its own query + local search/filter state
// that shouldn't re-run every time an unrelated form field changes.
function LabTestPicker({ selectedTests, onToggle }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['lab-catalog'],
    queryFn: () => api.get('/api/lab/catalog'),
    staleTime: 5 * 60 * 1000, // catalog rarely changes within a shift
  })

  const allTests = data?.tests || []
  const categories = ['all', ...new Set(allTests.map((t) => t.category).filter(Boolean))]

  const filtered = allTests.filter((t) => {
    const matchesSearch = !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase())
    const matchesCategory = category === 'all' || t.category === category
    return matchesSearch && matchesCategory
  })

  // Group filtered results by category for display
  const grouped = filtered.reduce((acc, t) => {
    const key = t.category || 'Other'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const selectedIds = new Set(selectedTests.map((t) => t.id))
  const total = selectedTests.reduce((s, t) => s + (t.unit_cost || 0), 0)

  if (isLoading) {
    return <p className="text-[12px] text-gray-400 py-3">Loading test catalog…</p>
  }
  if (error) {
    return <p className="text-[12px] text-red-500 py-3">Could not load lab tests. {error.message}</p>
  }

  return (
    <div className="rounded-xl border border-purple-100 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-900/10 p-4 space-y-3">
      {/* Search + category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests…"
            className={`${inputCls} pl-8`}
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${inputCls} w-auto`}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All categories' : cap(c)}</option>
          ))}
        </select>
      </div>

      {/* Selected chips */}
      {selectedTests.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pb-1">
          {selectedTests.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-[#1a6cbf] text-white"
            >
              {t.name}
              <button
                type="button"
                onClick={() => onToggle(t)}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Grouped test list */}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-purple-100 dark:border-purple-800/30 bg-white dark:bg-[#0f172a] divide-y divide-gray-100 dark:divide-gray-800">
        {Object.keys(grouped).length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-4">No tests match your search.</p>
        ) : (
          Object.entries(grouped).map(([cat, tests]) => (
            <div key={cat} className="p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1.5 py-1">{cap(cat)}</p>
              {tests.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => onToggle(t)}
                      className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-[#1a6cbf] focus:ring-[#1a6cbf]"
                    />
                    <span className="text-[12px] text-gray-700 dark:text-gray-300 truncate">{t.name}</span>
                  </span>
                  <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{formatMoney(t.unit_cost)}</span>
                </label>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between px-1 pt-1 border-t border-purple-100 dark:border-purple-800/30">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {selectedTests.length} test{selectedTests.length === 1 ? '' : 's'} selected
        </span>
        <span className="text-[13px] font-semibold text-[#1a6cbf] dark:text-blue-400 tabular-nums">
          {formatMoney(total)}
        </span>
      </div>
    </div>
  )
}

function RegisterModal({ onClose }) {
  const queryClient = useQueryClient()
  const [patient, setPatient] = useState(EMPTY_PATIENT)
  const [visitType, setVisitType] = useState('consultation')
  const [referredBy, setReferredBy] = useState('')
  const [referrerPhone, setReferrerPhone] = useState('')
  const [selectedTests, setSelectedTests] = useState([])

  const toggleTest = (test) => {
    setSelectedTests((prev) =>
      prev.some((t) => t.id === test.id) ? prev.filter((t) => t.id !== test.id) : [...prev, test]
    )
  }

  const registerMut = useMutation({
    mutationFn: (body) => api.post('/api/reception/register', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception'] })
      toast.success('Patient registered and added to queue')
      onClose()
    },
    onError: (err) => toast.error(err.message || 'Could not register patient'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!patient.name.trim()) return toast.error('Full name is required')
    if (!patient.gender) return toast.error('Gender is required')
    if (visitType === 'direct_lab' && selectedTests.length === 0) {
      return toast.error('Select at least one lab test')
    }

    registerMut.mutate({
      patient: {
        name: patient.name.trim(),
        gender: patient.gender,
        phone: patient.phone || null,
        national_id: patient.national_id || null,
        blood_group: patient.blood_group || null,
        allergies: patient.allergies || null,
        age: patient.age ? Number(patient.age) : null,
      },
      visit_type: visitType,
      referred_by: visitType === 'direct_lab' ? (referredBy || null) : null,
      referrer_phone: visitType === 'direct_lab' ? (referrerPhone || null) : null,
      lab_test_ids: visitType === 'direct_lab' ? selectedTests.map((t) => t.id) : undefined,
    })
  }

  const saving = registerMut.isPending

  const VISIT_TYPE_OPTIONS = [
    { key: 'consultation', label: 'Consultation', icon: '🩺', desc: 'Sees a doctor' },
    { key: 'injection', label: 'Injection', icon: '💉', desc: 'Procedure only' },
    { key: 'family_planning', label: 'Family Planning', icon: '🌿', desc: 'FP service' },
    { key: 'direct_lab', label: 'Direct Lab', icon: '🔬', desc: 'Referred — no doctor' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-[#0f172a] rounded-t-2xl">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Register Patient</h2>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Add a new patient to today's queue</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none transition-colors">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* Visit type */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Visit Type</p>
            <div className="grid grid-cols-2 gap-2">
              {VISIT_TYPE_OPTIONS.map((vt) => (
                <button key={vt.key} type="button" onClick={() => setVisitType(vt.key)}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${visitType === vt.key
                      ? 'border-[#1a6cbf] bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#1e293b]'
                    }`}>
                  <span className="text-xl shrink-0 mt-0.5">{vt.icon}</span>
                  <div>
                    <p className={`text-[13px] font-semibold ${visitType === vt.key ? 'text-[#1a6cbf] dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
                      {vt.label}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{vt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Fee waived notice */}
            {visitType !== 'consultation' && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2.5">
                <span className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Consultation fee is <strong>waived</strong> for {VISIT_TYPE_OPTIONS.find(v => v.key === visitType)?.label} visits.
                </p>
              </div>
            )}
          </div>

          {/* Personal info */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Patient Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Name *">
                <input type="text" value={patient.name}
                  onChange={(e) => setPatient({ ...patient, name: e.target.value })}
                  placeholder="e.g. Mary Kamau" className={inputCls} required />
              </Field>
              <Field label="Gender *">
                <select value={patient.gender}
                  onChange={(e) => setPatient({ ...patient, gender: e.target.value })}
                  className={inputCls}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Age *">
                <input type="number" value={patient.age}
                  onChange={(e) => setPatient({ ...patient, age: e.target.value })}
                  placeholder="e.g. 30" className={inputCls} required min={1} max={110} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={patient.phone}
                  onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
                  placeholder="07XX XXX XXX" className={inputCls} />
              </Field>
              <Field label="National ID">
                <input type="text" value={patient.national_id}
                  onChange={(e) => setPatient({ ...patient, national_id: e.target.value })}
                  placeholder="Optional" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Referrer info — direct lab only */}
          {visitType === 'direct_lab' && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Referrer Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-purple-100 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-900/10">
                <Field label="Referred By">
                  <input type="text" value={referredBy}
                    onChange={(e) => setReferredBy(e.target.value)}
                    placeholder="e.g. Dr. Omondi (Aga Khan)" className={inputCls} />
                </Field>
                <Field label="Referrer Phone">
                  <input type="tel" value={referrerPhone}
                    onChange={(e) => setReferrerPhone(e.target.value)}
                    placeholder="07XX XXX XXX" className={inputCls} />
                </Field>
              </div>
            </div>
          )}

          {/* Lab test selection — direct_lab only */}
          {visitType === 'direct_lab' && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                Lab Tests *
              </p>
              <LabTestPicker selectedTests={selectedTests} onToggle={toggleTest} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#1a6cbf] hover:bg-[#155a9f] text-white text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
              {saving ? 'Registering…' : 'Register & Add to Queue'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Queue tab ────────────────────────────────────────────────────────────────
export default function QueueTab() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [paying, setPaying] = useState(null)
  const [showRegister, setShowRegister] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reception', 'visits', filter],
    queryFn: () => api.get(`/api/reception/queue${filter !== 'all' ? `?status=${filter}` : ''}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const payMutation = useMutation({
    mutationFn: ({ visitId, stage, ...body }) =>
      api.patch(`/api/reception/visits/${visitId}/stage${stage}-payment`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reception'] }),
  })

  const visits = data ?? []

  const handlePay = async (visit, method, reference) => {
    try {
      await payMutation.mutateAsync({
        visitId: visit.id,
        amount: visit.bill?.consultation_fee || 500,
        method,
        reference,
        stage: 1,
      })
      toast.success(`Payment collected — moved to consultation`)
      setPaying(null)
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    }
  }

  if (isLoading) return <SkeletonList items={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={[
                'px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors',
                filter === s
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700',
              ].join(' ')}>
              {s === 'all' ? 'All' : cap(s)}
            </button>
          ))}
        </div>

        {/* Register button */}
        <button
          onClick={() => setShowRegister(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a6cbf] hover:bg-[#155a9f] text-white text-[13px] font-semibold transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Register Patient
        </button>
      </div>

      {/* Queue list */}
      {visits.length === 0 ? (
        <EmptyState
          icon="list"
          title="No patients in queue"
          description={filter === 'all'
            ? 'Register a patient to get started.'
            : `No patients with status "${cap(filter)}"`
          }
        />
      ) : (
        <div className="space-y-2">
          {visits.map((v) => {
            const wait = waitMinutes(v.arrived_at)
            const waitColor = wait > 45 ? 'text-red-600 dark:text-red-400' : wait > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
            const typeCfg = VISIT_TYPES?.[v.visit_type] || { label: cap(v.visit_type), badge: badgeClass(v.visit_type) }

            return (
              <Card key={v.id} className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Queue number */}
                  <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center shrink-0">
                    <span className="text-[13px] font-bold text-gray-600 dark:text-gray-300">{v.queue_number ?? '—'}</span>
                  </div>

                  {/* Patient info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {v.patient?.name ?? '—'}
                      </span>
                      <Badge className={typeCfg.badge}>{typeCfg.label}</Badge>
                      <Badge className={badgeClass(v.status)}>{cap(v.status)}</Badge>
                      {v.patient?.allergies && (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          ⚠ {v.patient.allergies}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {v.doctor && <span>· {v.doctor.username}</span>}
                      {v.referred_by && <span className="ml-2">· referred by {v.referred_by}</span>}
                    </p>
                  </div>

                  {/* Wait time */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className={`text-[13px] font-semibold tabular-nums ${waitColor}`}>{wait}m</p>
                    <p className="text-[10px] text-gray-400">{formatTime(v.arrived_at)}</p>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {v.status === 'waiting' && v.visit_type === 'consultation' && (
                      <button onClick={() => setPaying(v)}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 transition-colors">
                        Collect Stage 1
                      </button>
                    )}
                    {v.status === 'waiting' && v.visit_type !== 'consultation' && (
                      <span className="text-[11px] text-gray-400 px-3 py-1.5">Fee waived</span>
                    )}
                    {v.status === 'consultation_paid' && (
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium px-3 py-1.5">Waiting for doctor</span>
                    )}
                    {v.status === 'with_doctor' && (
                      <span className="text-[11px] text-gray-400 px-3 py-1.5">In consultation</span>
                    )}
                    {['lab', 'pharmacy', 'billing'].includes(v.status) && (
                      <span className="text-[11px] text-gray-400 px-3 py-1.5">{cap(v.status)}</span>
                    )}
                    {v.status === 'done' && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium px-3 py-1.5">Completed</span>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Payment modal */}
      {paying && (
        <PaymentModal
          visit={paying}
          title="Collect Stage 1 Payment"
          description="Consultation fee — paid upfront before seeing the doctor"
          amount={paying.bill?.consultation_fee || 500}
          loading={payMutation.isPending}
          onClose={() => setPaying(null)}
          onConfirm={handlePay}
        />
      )}

      {/* Register modal */}
      {showRegister && (
        <RegisterModal onClose={() => setShowRegister(false)} />
      )}
    </div>
  )
}