'use client'

// ConsultationTab — the doctor's consultation room
// APIs:
//   GET   /api/doctor/visits/[id]                 → single visit (full details)
//   PATCH /api/doctor/visits/[id]                 → update visit (vitals, soap, diagnosis, status)
//   GET   /api/doctor/visits/[id]/labs            → lab orders for visit
//   POST  /api/doctor/visits/[id]/labs            → order new tests { tests:[{name,category,unit_cost,reference_range}], urgency }
//   GET   /api/doctor/visits/[id]/prescriptions   → prescriptions for visit
//   POST  /api/doctor/visits/[id]/prescriptions   → create prescription { items:[{medication,dosage,frequency,duration,quantity,unit_cost}] }
//   PATCH /api/doctor/prescriptions/[id]/return-item → return single med item to pharmacy { item_id, doctor_name, reason }

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, InlineLoader, Spinner, Icon,
  formatMoney, formatTime, timeAgo, badgeClass, cap, VISIT_TYPES,
} from '@/utils/helpers'
import { useSearchParams } from 'next/navigation'
import ProcedureFeeCard, { getForwardGate } from '@/components/doctor/ProcedureFeeCard'

// ─── Constants ────────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const EMPTY_VITALS = {
  temperature: '',
  bp_systolic: '',
  bp_diastolic: '',
  pulse: '',
  respiratory_rate: '',
  weight: '',
  height: '',
  spo2: '',
  vitals_notes: '',
}

const EMPTY_SOAP = { subjective: '', objective: '', assessment: '', plan: '' }

// Common lab test catalog (used when doctor orders new tests)
const LAB_CATALOG = [
  { name: 'Full Blood Count', category: 'hematology', unit_cost: 800, reference_range: '4.0-6.0 ×10^6/μL' },
  { name: 'ESR', category: 'hematology', unit_cost: 400, reference_range: '0-20 mm/hr' },
  { name: 'Random Blood Glucose', category: 'chemistry', unit_cost: 500, reference_range: '3.9-7.8 mmol/L' },
  { name: 'Urinalysis', category: 'urinalysis', unit_cost: 300, reference_range: 'Negative' },
  { name: 'Pregnancy Test', category: 'urinalysis', unit_cost: 300, reference_range: 'Negative' },
  { name: 'Blood Pressure', category: 'other', unit_cost: 200, reference_range: '<120/80 mmHg' },
  { name: 'Lipid Profile', category: 'chemistry', unit_cost: 1500, reference_range: 'TC <5.0 mmol/L' },
  { name: 'Liver Function Test', category: 'chemistry', unit_cost: 1800, reference_range: 'ALT 7-56 U/L' },
]

const URGENCY_OPTIONS = [
  { value: 'routine', label: 'Routine', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400' },
  { value: 'urgent', label: 'Urgent', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'stat', label: 'STAT', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns 'normal' | 'abnormal' | null for a vital sign
function vitalStatus(key, value) {
  if (value === '' || value == null) return null
  const v = parseFloat(value)
  if (isNaN(v)) return null
  switch (key) {
    case 'temperature': return v > 37.5 ? 'abnormal' : 'normal'
    case 'bp_systolic': return v > 140 ? 'abnormal' : 'normal'
    case 'bp_diastolic': return v > 90 ? 'abnormal' : 'normal'
    case 'pulse': return (v < 60 || v > 100) ? 'abnormal' : 'normal'
    case 'respiratory_rate': return (v < 12 || v > 20) ? 'abnormal' : 'normal'
    case 'spo2': return v < 95 ? 'abnormal' : 'normal'
    default: return 'normal'
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConsultationTab({ onBack }) {
  const queryClient = useQueryClient()
  const [vitals, setVitals] = useState(EMPTY_VITALS)
  const [soap, setSoap] = useState(EMPTY_SOAP)
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [openSoap, setOpenSoap] = useState({ subjective: true, objective: false, assessment: false, plan: false })
  const [showLabModal, setShowLabModal] = useState(false)
  const [showRxModal, setShowRxModal] = useState(false)
  const searchParams = useSearchParams()
  const visitId = searchParams.get('visitId')

  // API: GET /api/doctor/visits/[id]
  const visitQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}`),
    enabled: !!visitId,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // API: GET /api/doctor/visits/[id]/labs
  const labsQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'labs'],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}/labs`),
    enabled: !!visitId,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // API: GET /api/doctor/visits/[id]/prescriptions
  const rxQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'prescriptions'],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}/prescriptions`),
    enabled: !!visitId,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const visit = visitQuery.data?.visit
  const labRequests = labsQuery.data?.requests || []
  const prescriptions = rxQuery.data?.prescriptions || []

  // Diagnosis gate: cannot save diagnosis while lab tests are still pending.
  // Rule: if any lab request has items still 'pending' or 'in_progress', block the save.
  // The diagnosis INPUT remains editable — only the Save action is gated.
  const labsBlockingDiagnosis = labRequests.length > 0 && labRequests.some((r) =>
    r.items.some((it) => it.status === 'pending' || it.status === 'in_progress')
  )

  // ADDED: Prescription gate — cannot prescribe until a diagnosis has been
  // SAVED to the visit record (not just typed in the local input below).
  // Reads visit.diagnosis (persisted data), the same way labsBlockingDiagnosis
  // reads labRequests (persisted data) rather than any local form state.
  // A prescription created without a saved diagnosis would be orphaned from
  // the patient's chart if the doctor navigates away before saving.
  const rxBlockedNoDiagnosis = !visit?.diagnosis || !visit.diagnosis.trim()

  // Sync form state when the visit loads
  useEffect(() => {
    if (!visit) return
    setVitals({
      temperature: visit.temperature ?? '',
      bp_systolic: visit.bp_systolic ?? '',
      bp_diastolic: visit.bp_diastolic ?? '',
      pulse: visit.pulse ?? '',
      respiratory_rate: visit.respiratory_rate ?? '',
      weight: visit.weight ?? '',
      height: visit.height ?? '',
      spo2: visit.spo2 ?? '',
      vitals_notes: visit.vitals_notes ?? '',
    })
    setSoap({
      subjective: visit.subjective ?? '',
      objective: visit.objective ?? '',
      assessment: visit.assessment ?? '',
      plan: visit.plan ?? '',
    })
    setDiagnosis(visit.diagnosis ?? '')
    setDiagnosisCode(visit.diagnosis_code ?? '')
  }, [visit?.id])

  // API: PATCH /api/doctor/visits/[id]
  const patchMutation = useMutation({
    mutationFn: (body) => api.patch(`/api/doctor/visits/${visitId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor'] })
    },
  })

  // API: POST /api/doctor/visits/[id]/labs
  const labMutation = useMutation({
    mutationFn: (body) => api.post(`/api/doctor/visits/${visitId}/labs`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
    },
  })

  // API: POST /api/doctor/visits/[id]/prescriptions
  const rxMutation = useMutation({
    mutationFn: (body) => api.post(`/api/doctor/visits/${visitId}/prescriptions`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
    },
  })

  // ─── Save handlers ──────────────────────────────────────────────────────────

  const handleSaveVitals = async () => {
    try {
      await patchMutation.mutateAsync({ ...vitals })
      toast.success('Vitals saved')
    } catch (err) {
      toast.error(err.message || 'Could not save vitals')
    }
  }

  const handleSaveSoap = async () => {
    try {
      await patchMutation.mutateAsync({ ...soap })
      toast.success('SOAP notes saved')
    } catch (err) {
      toast.error(err.message || 'Could not save notes')
    }
  }

  const handleSaveDiagnosis = async () => {
    // Diagnosis gate — block until ALL lab results are ready
    if (labsBlockingDiagnosis) {
      toast.error('Diagnosis cannot be saved until all lab results are ready. Please wait for the lab to complete the tests.')
      return
    }
    try {
      await patchMutation.mutateAsync({ diagnosis, diagnosis_code: diagnosisCode })
      toast.success('Diagnosis saved')
    } catch (err) {
      toast.error(err.message || 'Could not save diagnosis')
    }
  }

  const handleEndConsultation = async () => {
    // Determine where the patient goes next based on pending orders
    const hasPendingLabs = labRequests.some((r) =>
      ['pending', 'in_progress'].includes(r.status) &&
      r.items.some((it) => it.status === 'pending' || it.status === 'in_progress')
    )
    const hasPendingRx = prescriptions.some((p) => p.status === 'pending')

    let nextStatus = 'billing'
    let label = 'billing'
    if (hasPendingLabs) { nextStatus = 'lab'; label = 'lab for tests' }
    else if (hasPendingRx) { nextStatus = 'pharmacy'; label = 'pharmacy for medication' }

    try {
      await patchMutation.mutateAsync({ status: nextStatus, diagnosis, diagnosis_code: diagnosisCode, ...soap })
      toast.success(`Consultation completed — patient sent to ${label}`)
      onBack?.()
    } catch (err) {
      toast.error(err.message || 'Could not end consultation')
    }
  }

  const handleOrderLabs = async (tests, urgency) => {
    if (!tests.length) {
      toast.error('Select at least one test')
      return
    }
    try {
      await labMutation.mutateAsync({ tests, urgency })
      toast.success(`${tests.length} lab test${tests.length > 1 ? 's' : ''} ordered`)
      setShowLabModal(false)
    } catch (err) {
      toast.error(err.message || 'Could not order lab tests')
    }
  }

  const handleAddPrescription = async (items) => {
    // ADDED — re-checked at submit time too (defense in depth), in case the
    // modal was already open when the diagnosis got cleared by a refetch.
    if (rxBlockedNoDiagnosis) {
      toast.error('Save a diagnosis before adding a prescription.')
      setShowRxModal(false)
      return
    }
    if (!items.length) {
      toast.error('Add at least one medication')
      return
    }
    try {
      await rxMutation.mutateAsync({ items })
      toast.success('Prescription sent to pharmacy')
      setShowRxModal(false)
    } catch (err) {
      toast.error(err.message || 'Could not add prescription')
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!visitId) {
    return (
      <EmptyState
        icon="stethoscope"
        title="No patient selected"
        description="Pick a patient from the queue to start a consultation. Their full chart will appear here."
      />
    )
  }

  if (visitQuery.isLoading) return <InlineLoader label="Loading patient chart…" />
  if (visitQuery.error) return <ErrorState message={visitQuery.error.message} onRetry={visitQuery.refetch} />
  if (!visit) return <EmptyState icon="alert" title="Visit not found" description="This visit may have been archived." />

  const visitType = VISIT_TYPES[visit.visit_type] || { label: cap(visit.visit_type), badge: badgeClass(visit.visit_type) }
  const pendingLabsCount = labRequests.reduce((n, r) => n + r.items.filter((it) => it.status === 'pending' || it.status === 'in_progress').length, 0)
  const pendingRxCount = prescriptions.reduce((n, p) => n + p.items.filter((it) => it.status === 'pending').length, 0)
  const readyLabsCount = labRequests.reduce((n, r) => {
    if (r.status !== 'ready') return n
    return n + r.items.filter((it) => it.status === 'ready' && it.result).length
  }, 0)
  const hasReadyLabs = readyLabsCount > 0

  return (
    <div className="space-y-4">
      {/* Back button + patient banner + notification bell */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          title="Back to queue"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <PatientBanner visit={visit} visitType={visitType} />
        <NotificationBell />
      </div>

      {/* Lab results ready banner — shown when patient returns from lab */}
      {hasReadyLabs && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Icon name="checkCircle" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
              Lab results ready — review & diagnose
            </p>
            <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">
              {readyLabsCount} test{readyLabsCount > 1 ? 's' : ''} completed. Review the results in the Lab Orders section below, record your diagnosis, and prescribe medication if necessary before ending the consultation.
            </p>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left column: SOAP + Diagnosis */}
        <div className="xl:col-span-2 space-y-4">
          {/* SOAP Notes */}
          <Card className="overflow-hidden">
            <CardHeader
              title="SOAP Notes"
              subtitle="Subjective · Objective · Assessment · Plan"
              action={
                <button
                  onClick={handleSaveSoap}
                  disabled={patchMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50"
                >
                  {patchMutation.isPending
                    ? <Icon name="refresh" size={13} className="animate-spin" />
                    : <Icon name="save" size={13} />}
                  Save
                </button>
              }
            />
            <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
              <SoapSection
                letter="S" label="Subjective" hint="Patient-reported symptoms & history"
                open={openSoap.subjective}
                onToggle={() => setOpenSoap({ ...openSoap, subjective: !openSoap.subjective })}
                value={soap.subjective}
                onChange={(v) => setSoap({ ...soap, subjective: v })}
                placeholder="e.g. Patient complains of headache and fever for 3 days. No history of hypertension or diabetes."
              />
              <SoapSection
                letter="O" label="Objective" hint="Examination findings & observed signs"
                open={openSoap.objective}
                onToggle={() => setOpenSoap({ ...openSoap, objective: !openSoap.objective })}
                value={soap.objective}
                onChange={(v) => setSoap({ ...soap, objective: v })}
                placeholder="e.g. Alert, oriented. No pallor, jaundice, or cyanosis. Throat mildly erythematous."
              />
              <SoapSection
                letter="A" label="Assessment" hint="Differential & working diagnosis"
                open={openSoap.assessment}
                onToggle={() => setOpenSoap({ ...openSoap, assessment: !openSoap.assessment })}
                value={soap.assessment}
                onChange={(v) => setSoap({ ...soap, assessment: v })}
                placeholder="e.g. Likely viral upper respiratory tract infection. Malaria ruled out by negative RDT."
              />
              <SoapSection
                letter="P" label="Plan" hint="Investigations, treatment & follow-up"
                open={openSoap.plan}
                onToggle={() => setOpenSoap({ ...openSoap, plan: !openSoap.plan })}
                value={soap.plan}
                onChange={(v) => setSoap({ ...soap, plan: v })}
                placeholder="e.g. Paracetamol 1g STAT, plenty of fluids, rest. Review in 3 days if no improvement."
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Vital Signs"
              subtitle="Color-coded: red = abnormal"
              action={
                <button
                  onClick={handleSaveVitals}
                  disabled={patchMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50"
                >
                  {patchMutation.isPending
                    ? <Icon name="refresh" size={13} className="animate-spin" />
                    : <Icon name="save" size={13} />}
                  Save
                </button>
              }
            />
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <VitalsField
                  label="Temp (°C)" icon="thermometer"
                  value={vitals.temperature}
                  onChange={(v) => setVitals({ ...vitals, temperature: v })}
                  placeholder="36.5"
                  status={vitalStatus('temperature', vitals.temperature)}
                  abnormalHint=">37.5"
                />
                <VitalsField
                  label="Pulse (bpm)" icon="heart"
                  value={vitals.pulse}
                  onChange={(v) => setVitals({ ...vitals, pulse: v })}
                  placeholder="72"
                  status={vitalStatus('pulse', vitals.pulse)}
                  abnormalHint="<60 or >100"
                />
                <VitalsField
                  label="BP Systolic" icon="activity"
                  value={vitals.bp_systolic}
                  onChange={(v) => setVitals({ ...vitals, bp_systolic: v })}
                  placeholder="120"
                  status={vitalStatus('bp_systolic', vitals.bp_systolic)}
                  abnormalHint=">140"
                />
                <VitalsField
                  label="BP Diastolic" icon="activity"
                  value={vitals.bp_diastolic}
                  onChange={(v) => setVitals({ ...vitals, bp_diastolic: v })}
                  placeholder="80"
                  status={vitalStatus('bp_diastolic', vitals.bp_diastolic)}
                  abnormalHint=">90"
                />
                <VitalsField
                  label="Resp Rate" icon="activity"
                  value={vitals.respiratory_rate}
                  onChange={(v) => setVitals({ ...vitals, respiratory_rate: v })}
                  placeholder="16"
                  status={vitalStatus('respiratory_rate', vitals.respiratory_rate)}
                  abnormalHint="<12 or >20"
                />
                <VitalsField
                  label="SpO₂ (%)" icon="droplet"
                  value={vitals.spo2}
                  onChange={(v) => setVitals({ ...vitals, spo2: v })}
                  placeholder="98"
                  status={vitalStatus('spo2', vitals.spo2)}
                  abnormalHint="<95"
                />
                <VitalsField
                  label="Weight (kg)" icon="barChart"
                  value={vitals.weight}
                  onChange={(v) => setVitals({ ...vitals, weight: v })}
                  placeholder="65"
                />
                <VitalsField
                  label="Height (cm)" icon="barChart"
                  value={vitals.height}
                  onChange={(v) => setVitals({ ...vitals, height: v })}
                  placeholder="170"
                />
              </div>

              {/* BMI helper */}
              {vitals.weight && vitals.height && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#1a6cbf] dark:text-blue-400 uppercase tracking-widest">BMI</span>
                  <span className="text-[13px] font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">
                    {(parseFloat(vitals.weight) / Math.pow(parseFloat(vitals.height) / 100, 2)).toFixed(1)}
                  </span>
                </div>
              )}

              {/* Vitals notes */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Vitals Notes</label>
                <textarea
                  value={vitals.vitals_notes}
                  onChange={(e) => setVitals({ ...vitals, vitals_notes: e.target.value })}
                  rows={2}
                  placeholder="e.g. Patient appears in mild distress"
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </Card>

          {/* Lab Orders */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Lab Orders"
              subtitle={pendingLabsCount > 0 ? `${pendingLabsCount} pending test${pendingLabsCount > 1 ? 's' : ''}` : 'No lab tests ordered yet'}
              action={
                <button
                  onClick={() => setShowLabModal(true)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center gap-1.5"
                >
                  <Icon name="flask" size={13} /> Order Lab Tests
                </button>
              }
            />
            <LabOrdersList loading={labsQuery.isLoading} requests={labRequests} />
          </Card>

          {/* Diagnosis */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  Diagnosis
                  {labsBlockingDiagnosis && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Icon name="clock" size={10} /> Locked until labs ready
                    </Badge>
                  )}
                  {!labsBlockingDiagnosis && labRequests.length > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <Icon name="check" size={10} /> Labs complete
                    </Badge>
                  )}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {labsBlockingDiagnosis
                    ? 'Diagnosis is recorded AFTER lab results are reviewed'
                    : 'Final diagnosis & ICD code (optional)'}
                </p>
              </div>
              <button
                onClick={handleSaveDiagnosis}
                disabled={patchMutation.isPending || labsBlockingDiagnosis || !diagnosis.trim()}
                title={labsBlockingDiagnosis ? 'Lab results are still pending — diagnosis is locked' : !diagnosis.trim() ? 'Enter a diagnosis first' : undefined}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {patchMutation.isPending
                  ? <Icon name="refresh" size={13} className="animate-spin" />
                  : labsBlockingDiagnosis
                    ? <Icon name="clock" size={13} />
                    : <Icon name="save" size={13} />}
                Save
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Diagnosis</label>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  disabled={labsBlockingDiagnosis}
                  placeholder={labsBlockingDiagnosis ? 'Locked — waiting for lab results' : 'e.g. Essential hypertension'}
                  className={`${inputCls} ${labsBlockingDiagnosis ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50' : ''}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">ICD Code</label>
                <input
                  type="text"
                  value={diagnosisCode}
                  onChange={(e) => setDiagnosisCode(e.target.value)}
                  disabled={labsBlockingDiagnosis}
                  placeholder={labsBlockingDiagnosis ? 'Locked' : 'e.g. I10'}
                  className={`${inputCls} ${labsBlockingDiagnosis ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50' : ''}`}
                />
              </div>
              {labsBlockingDiagnosis && (
                <div className="sm:col-span-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
                  <Icon name="alert" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">Diagnosis is locked until lab results are ready.</span> Per clinic protocol, the diagnosis is entered AFTER reviewing the lab results — not before. Once the lab marks all tests as ready, this section unlocks automatically.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Prescriptions */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Prescriptions"
              subtitle={
                rxBlockedNoDiagnosis
                  ? 'Save a diagnosis above to enable prescribing'
                  : pendingRxCount > 0
                    ? `${pendingRxCount} pending item${pendingRxCount > 1 ? 's' : ''}`
                    : 'No prescriptions yet'
              }
              action={
                <button
                  onClick={() => {
                    if (rxBlockedNoDiagnosis) {
                      toast.error('Save a diagnosis before adding a prescription.')
                      return
                    }
                    setShowRxModal(true)
                  }}
                  disabled={rxBlockedNoDiagnosis}
                  title={rxBlockedNoDiagnosis ? 'Save a diagnosis first' : undefined}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
                >
                  <Icon name={rxBlockedNoDiagnosis ? 'lock' : 'pill'} size={13} /> Add Prescription
                </button>
              }
            />
            <PrescriptionsList loading={rxQuery.isLoading} prescriptions={prescriptions} visitId={visitId} />
          </Card>
        </div>

        {/* Right column: vitals + end consultation */}
        <div className="space-y-4">
          <ProcedureFeeCard
            visit={visit}
            onFeeUpdated={() => visitQuery.refetch()}
          />

          {/* End consultation */}
          <Card className="p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-1">End Consultation</h3>
            <p className="text-[11px] text-gray-400 mb-3">
              {pendingLabsCount > 0
                ? `Patient will be sent to LAB for ${pendingLabsCount} pending test${pendingLabsCount > 1 ? 's' : ''}.`
                : pendingRxCount > 0
                  ? `Patient will be sent to PHARMACY for ${pendingRxCount} medication${pendingRxCount > 1 ? 's' : ''}.`
                  : 'Patient will be sent to BILLING for final payment.'}
            </p>
            {(() => {
              const { blocked, reason } = getForwardGate(visit)
              return (
                <button
                  onClick={handleEndConsultation}
                  disabled={patchMutation.isPending || blocked}
                  title={blocked ? reason : undefined}
                  className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {patchMutation.isPending
                    ? <Icon name="refresh" size={14} className="animate-spin" />
                    : <Icon name="check" size={14} />}
                  End Consultation
                </button>
              )
            })()}
          </Card>
        </div>
      </div>

      {/* Modals */}
      {showLabModal && (
        <LabOrderModal
          onClose={() => setShowLabModal(false)}
          onSubmit={handleOrderLabs}
          loading={labMutation.isPending}
        />
      )}
      {showRxModal && (
        <PrescriptionModal
          onClose={() => setShowRxModal(false)}
          onSubmit={handleAddPrescription}
          loading={rxMutation.isPending}
          allergies={visit?.allergies}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PatientBanner({ visit, visitType }) {
  return (
    <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
          <span className="text-[15px] font-semibold text-white">{visit.patient_name?.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{visit.patient_name}</h2>
            <Badge className={visitType.badge}>{visitType.label}</Badge>
            <Badge className={badgeClass(visit.status)}>{cap(visit.status)}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
            <span>{visit.patient_age != null ? `${visit.patient_age} yrs` : '—'} · {cap(visit.patient_gender || '—')}</span>
            {visit.blood_group && (
              <span className="inline-flex items-center gap-1">
                <Icon name="droplet" size={11} className="text-red-500" />
                <span className="text-red-600 dark:text-red-400 font-medium">{visit.blood_group}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" size={11} />
              Arrived {formatTime(visit.arrived_at)}
            </span>
          </div>
          {visit.chief_complaint && (
            <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Chief Complaint</p>
              <p className="text-[12px] text-gray-700 dark:text-gray-200 mt-0.5">{visit.chief_complaint}</p>
            </div>
          )}
          {visit.allergies && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2">
              <Icon name="alert" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Allergy:</span> {visit.allergies}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SoapSection({ letter, label, hint, open, onToggle, value, onChange, placeholder }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-[12px] font-bold shrink-0">
          {letter}
        </span>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{label}</p>
          <p className="text-[11px] text-gray-400">{hint}</p>
        </div>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            placeholder={placeholder}
            className={`${inputCls} resize-none`}
          />
        </div>
      )}
    </div>
  )
}

function VitalsField({ label, icon, value, onChange, placeholder, status, abnormalHint }) {
  const borderColor =
    status === 'abnormal'
      ? 'border-red-300 dark:border-red-900/60 focus:border-red-500 focus:ring-red-500/30'
      : status === 'normal'
        ? 'border-emerald-300 dark:border-emerald-900/60 focus:border-emerald-500 focus:ring-emerald-500/30'
        : ''
  const valueColor =
    status === 'abnormal'
      ? 'text-red-600 dark:text-red-400 font-semibold'
      : status === 'normal'
        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
        : 'text-gray-900 dark:text-gray-100'
  return (
    <div>
      <label className="flex items-center justify-between text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        <span className="flex items-center gap-1">
          {icon && <Icon name={icon} size={11} />}
          {label}
        </span>
        {status === 'abnormal' && abnormalHint && (
          <span className="text-[9px] text-red-500 dark:text-red-400 font-medium normal-case tracking-normal">abnormal {abnormalHint}</span>
        )}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} ${borderColor} ${valueColor} tabular-nums`}
      />
    </div>
  )
}

function LabOrdersList({ loading, requests }) {
  if (loading) return <InlineLoader label="Loading lab orders…" />
  if (!requests.length) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center mx-auto mb-2">
          <Icon name="flask" size={18} className="text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 dark:text-gray-400">No lab tests ordered for this visit yet</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
      {requests.map((r) => (
        <div key={r.id} className="px-4 py-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={badgeClass(r.urgency)}>{cap(r.urgency)}</Badge>
              <span className="text-[11px] text-gray-400">
                Ordered {timeAgo(r.ordered_at)} · {r.ordered_by}
              </span>
            </div>
            <Badge className={badgeClass(r.status)}>{cap(r.status)}</Badge>
          </div>
          <div className="space-y-1.5">
            {r.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{it.test_name}</p>
                  <p className="text-[10px] text-gray-400">
                    {cap(it.category)} · {it.reference_range ? `Ref: ${it.reference_range}` : 'No reference range'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {it.result ? (
                    <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">{it.result}</span>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">awaiting</span>
                  )}
                  <Badge className={badgeClass(it.status)}>{cap(it.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Statuses that are still returnable to pharmacy (i.e. NOT declined/cancelled/dispensed)
const RETURNABLE_ITEM_STATUSES = ['pending', 'issued', 'verified']

const RETURN_REASON_SUGGESTIONS = [
  'Client declined',
  'Wrong medication',
  'Adverse reaction',
]

function PrescriptionsList({ loading, prescriptions, visitId }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [returnTarget, setReturnTarget] = useState(null) // { prescription, item }
  const [returnReason, setReturnReason] = useState(RETURN_REASON_SUGGESTIONS[0])

  // API: PATCH /api/doctor/prescriptions/[id]/return-item — return a single item to pharmacy
  const returnItemMutation = useMutation({
    mutationFn: ({ prescriptionId, itemId, doctorName, reason }) =>
      api.patch(`/api/doctor/prescriptions/${prescriptionId}/return-item`, {
        item_id: itemId,
        doctor_name: doctorName,
        reason,
      }),
    onSuccess: (_data, variables) => {
      toast.success(`${variables.medicationName} returned to pharmacy`)
      setReturnTarget(null)
      setReturnReason(RETURN_REASON_SUGGESTIONS[0])
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
    },
    onError: (err) => {
      toast.error(err.message || 'Could not return item to pharmacy')
    },
  })

  const openReturnModal = (prescription, item) => {
    setReturnTarget({ prescription, item })
    setReturnReason(RETURN_REASON_SUGGESTIONS[0])
  }

  const closeReturnModal = () => {
    if (returnItemMutation.isPending) return
    setReturnTarget(null)
    setReturnReason(RETURN_REASON_SUGGESTIONS[0])
  }

  const confirmReturn = () => {
    if (!returnTarget || !returnReason.trim()) return
    returnItemMutation.mutate({
      prescriptionId: returnTarget.prescription.id,
      itemId: returnTarget.item.id,
      doctorName: user?.name || 'Doctor',
      reason: returnReason.trim(),
      medicationName: returnTarget.item.medication,
    })
  }

  if (loading) return <InlineLoader label="Loading prescriptions…" />
  if (!prescriptions.length) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center mx-auto mb-2">
          <Icon name="pill" size={18} className="text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 dark:text-gray-400">No prescriptions for this visit yet</p>
      </div>
    )
  }
  return (
    <>
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {prescriptions.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="text-[11px] text-gray-400">
                Prescribed {timeAgo(p.prescribed_at)} · {p.prescribed_by}
              </span>
              <Badge className={badgeClass(p.status)}>{cap(p.status)}</Badge>
            </div>
            <div className="space-y-1.5">
              {p.items.map((it) => {
                const isReturnable = RETURNABLE_ITEM_STATUSES.includes(it.status)
                const isDeclined = it.status === 'declined'
                return (
                  <div
                    key={it.id}
                    className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100">
                            {it.medication}
                          </p>
                          {isDeclined && (
                            <Badge className={badgeClass('declined')}>Declined</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
                        </p>
                        {isDeclined && it.decline_reason && (
                          <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1">
                            <Icon name="alert" size={11} className="shrink-0" />
                            <span>{it.decline_reason}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                          {formatMoney(it.unit_cost * (it.quantity || 1))}
                        </span>
                        {isReturnable && (
                          <button
                            type="button"
                            onClick={() => openReturnModal(p, it)}
                            disabled={returnItemMutation.isPending}
                            title="Return to pharmacy"
                            aria-label={`Return ${it.medication} to pharmacy`}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 border border-transparent hover:border-red-200 dark:hover:border-red-900/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {returnTarget && (
        <ReturnItemModal
          prescription={returnTarget.prescription}
          item={returnTarget.item}
          reason={returnReason}
          setReason={setReturnReason}
          loading={returnItemMutation.isPending}
          onClose={closeReturnModal}
          onConfirm={confirmReturn}
        />
      )}
    </>
  )
}

// ReturnItemModal — small confirmation modal for returning a single med item to pharmacy
function ReturnItemModal({ prescription, item, reason, setReason, loading, onClose, onConfirm }) {
  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Keep Item
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={loading || !reason.trim()}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Icon name="refresh" size={12} className="animate-spin" />
        ) : (
          <Icon name="trash" size={12} />
        )}
        Return to Pharmacy
      </button>
    </div>
  )

  return (
    <ModalShell
      title="Return medication to pharmacy"
      subtitle={`Prescription #${prescription.id} · ${item.medication}`}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={footer}
    >
      {/* Item summary */}
      <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2 mb-4">
        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {item.dosage} · {item.frequency} · {item.duration} · Qty {item.quantity}
        </p>
      </div>

      {/* Warning banner */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2 mb-4">
        <Icon name="alert" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Returning this medication will restore its stock at the pharmacy and remove its fee from the
          patient&rsquo;s bill. This cannot be undone.
        </p>
      </div>

      {/* Reason input */}
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Reason for return
      </label>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Enter the reason…"
        className={inputCls}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {RETURN_REASON_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setReason(s)}
            className={[
              'px-2 py-1 rounded-full text-[11px] font-medium transition-colors border',
              reason === s
                ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60 hover:border-red-300 dark:hover:border-red-800',
            ].join(' ')}
          >
            {s}
          </button>
        ))}
      </div>
    </ModalShell>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-2xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}

function LabOrderModal({ onClose, onSubmit, loading }) {
  const [selected, setSelected] = useState({}) // test name → true
  const [urgency, setUrgency] = useState('routine')

  const toggle = (t) => setSelected((s) => ({ ...s, [t.name]: !s[t.name] }))
  const selectedTests = LAB_CATALOG.filter((t) => selected[t.name])
  const totalCost = selectedTests.reduce((s, t) => s + t.unit_cost, 0)

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {selectedTests.length} test{selectedTests.length !== 1 ? 's' : ''} selected
        </span>
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
          {formatMoney(totalCost)}
        </span>
      </div>
      <button
        onClick={() => onSubmit(selectedTests, urgency)}
        disabled={loading || selectedTests.length === 0}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
        Order Tests
      </button>
    </div>
  )

  return (
    <ModalShell
      title="Order Lab Tests"
      subtitle="Select tests from the catalog and set urgency"
      onClose={onClose}
      footer={footer}
    >
      {/* Urgency selector */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Urgency</label>
        <div className="grid grid-cols-3 gap-2">
          {URGENCY_OPTIONS.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => setUrgency(u.value)}
              className={[
                'px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors',
                urgency === u.value
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700/60',
              ].join(' ')}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      {/* Test catalog */}
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Available Tests
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LAB_CATALOG.map((t) => {
          const isSel = !!selected[t.name]
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => toggle(t)}
              className={[
                'text-left p-3 rounded-lg border transition-all',
                isSel
                  ? 'border-[#1a6cbf] bg-blue-50 dark:bg-blue-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{cap(t.category)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{formatMoney(t.unit_cost)}</span>
                  <span className={[
                    'w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
                    isSel ? 'bg-[#1a6cbf] border-[#1a6cbf] text-white' : 'border-gray-300 dark:border-gray-600 text-transparent',
                  ].join(' ')}>
                    <Icon name="check" size={12} />
                  </span>
                </div>
              </div>
              {t.reference_range && (
                <p className="text-[10px] text-gray-400 mt-1.5">Ref: {t.reference_range}</p>
              )}
            </button>
          )
        })}
      </div>
    </ModalShell>
  )
}

function PrescriptionModal({ onClose, onSubmit, loading, allergies }) {
  const [items, setItems] = useState([
    { medication: '', dosage: '', frequency: '', duration: '', quantity: 1, unit_cost: 0, drug_id: null, _stock: null, _reorder_level: null, _pharmacy_normal_price: null, _unit: '' },
  ])

  // Fetch drug stock from pharmacy — gives the doctor live visibility into stock
  // and the clinic price (125% of pharmacy normal price) at the point of prescribing.
  const { data: drugsData } = useQuery({
    queryKey: ['pharmacy', 'drugs'],
    queryFn: () => api.get('/api/pharmacy/drugs'),
    staleTime: 30000,
  })
  const drugs = drugsData?.items || []

  // Parse allergies into a list of lowercase keywords for matching
  const allergyKeywords = (allergies || '')
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  // Check if a drug name matches any allergy keyword
  function checkAllergy(drugName, genericName) {
    if (!allergyKeywords.length) return null
    const name = (drugName || '').toLowerCase()
    const generic = (genericName || '').toLowerCase()
    for (const kw of allergyKeywords) {
      if (name.includes(kw) || generic.includes(kw)) {
        return kw
      }
    }
    return null
  }

  const updateItem = (i, field, value) => {
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }
  // When a drug is picked from the search dropdown, auto-fill medication + clinic price (unit_price)
  const selectDrug = (i, drug) => {
    setItems((arr) => arr.map((it, idx) => idx === i ? {
      ...it,
      medication: drug.name,
      unit_cost: drug.unit_price,
      drug_id: drug.id,
      _stock: drug.current_stock,
      _reorder_level: drug.reorder_level,
      _pharmacy_normal_price: drug.pharmacy_normal_price,
      _unit: drug.unit,
      _allergy_hit: checkAllergy(drug.name, drug.generic_name),
    } : it))
  }
  const addItem = () => setItems((arr) => [...arr, { medication: '', dosage: '', frequency: '', duration: '', quantity: 1, unit_cost: 0, drug_id: null, _stock: null, _reorder_level: null, _pharmacy_normal_price: null, _unit: '' }])
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))

  const totalCost = items.reduce((s, it) => s + (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0), 0)
  // Strip temp/UI-only fields before submitting to the API
  const validItems = items
    .filter((it) => it.medication.trim() && !it._allergy_hit)
    .map(({ _stock, _reorder_level, _pharmacy_normal_price, _unit, _allergy_hit, drug_id, ...rest }) => rest)

  // Block submission if any item has an allergy conflict
  const hasAllergyConflict = items.some((it) => it._allergy_hit)

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {validItems.length} medication{validItems.length !== 1 ? 's' : ''} · total
        </span>
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(totalCost)}</span>
      </div>
      <button
        onClick={() => onSubmit(validItems)}
        disabled={loading || validItems.length === 0 || hasAllergyConflict}
        title={hasAllergyConflict ? 'Remove the allergy-conflicting medication to proceed' : undefined}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
        Send to Pharmacy
      </button>
    </div>
  )

  return (
    <ModalShell
      title="Add Prescription"
      subtitle="Search the pharmacy drug stock — clinic price (125%) is auto-applied"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        {allergyKeywords.length > 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-2 flex items-start gap-2">
            <Icon name="alert" size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-700 dark:text-red-400">
              <span className="font-semibold">Patient allergy alert:</span> {allergies}. Drugs matching these allergens will be flagged and blocked from prescription.
            </p>
          </div>
        )}
        {items.map((it, i) => {
          const stock = it._stock
          const reorder = it._reorder_level
          const qty = parseInt(it.quantity) || 0
          const outOfStock = it.drug_id != null && stock === 0
          const exceedsStock = it.drug_id != null && stock > 0 && qty > stock
          const allergyHit = it._allergy_hit
          return (
            <div key={i} className={`rounded-lg border p-3 ${allergyHit ? 'border-red-300 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/10' : 'border-gray-200 dark:border-gray-700/60'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Medication #{i + 1}
                  {allergyHit && (
                    <span className="ml-2 text-red-600 dark:text-red-400 normal-case tracking-normal font-bold">
                      ⚠ ALLERGY CONFLICT
                    </span>
                  )}
                </span>
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(i)}
                    className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1"
                  >
                    <Icon name="trash" size={12} /> Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Medication *</label>
                  <DrugSearchInput
                    value={it.medication}
                    drugs={drugs}
                    onChange={(v) => updateItem(i, 'medication', v)}
                    onSelect={(drug) => selectDrug(i, drug)}
                  />
                  {/* Allergy conflict warning — highest priority */}
                  {allergyHit && (
                    <div className="mt-2 rounded-lg bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-900 px-3 py-2 flex items-start gap-2">
                      <Icon name="xCircle" size={14} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[12px] font-semibold text-red-700 dark:text-red-400">
                          ALLERGY CONFLICT — "{allergyHit}"
                        </p>
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                          This patient is allergic to <span className="font-semibold">{allergyHit}</span>. Select a different medication or remove this item. The prescription cannot be sent while this conflict exists.
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Stock badge + price breakdown shown once a drug is selected */}
                  {it.drug_id != null && !allergyHit && (
                    <div className="mt-2 space-y-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap text-[10px]">
                        <StockPill stock={stock} reorder={reorder} />
                        <span className="text-gray-500 dark:text-gray-400">
                          Pharmacy price: <span className="tabular-nums">{formatMoney(it._pharmacy_normal_price)}</span>
                          {' · '}
                          Clinic price (125%): <span className="font-semibold text-[#1a6cbf] dark:text-blue-400 tabular-nums">{formatMoney(it.unit_cost)}</span>
                        </span>
                      </div>
                      {outOfStock && (
                        <div className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 font-semibold">
                          <Icon name="xCircle" size={12} /> OUT OF STOCK — select an alternative or restock
                        </div>
                      )}
                      {exceedsStock && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          <Icon name="alert" size={12} />
                          Requested quantity ({qty}) exceeds current stock ({stock}). Pharmacy will partially dispense.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Dosage</label>
                  <input
                    type="text"
                    value={it.dosage}
                    onChange={(e) => updateItem(i, 'dosage', e.target.value)}
                    placeholder="e.g. 500mg"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Frequency</label>
                  <input
                    type="text"
                    value={it.frequency}
                    onChange={(e) => updateItem(i, 'frequency', e.target.value)}
                    placeholder="e.g. 3x daily"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Duration</label>
                  <input
                    type="text"
                    value={it.duration}
                    onChange={(e) => updateItem(i, 'duration', e.target.value)}
                    placeholder="e.g. 7 days"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Unit Cost (KSh) — auto-filled from clinic price</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={it.unit_cost}
                    onChange={(e) => updateItem(i, 'unit_cost', e.target.value)}
                    placeholder="0"
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
              </div>
            </div>
          )
        })}

        <button
          onClick={addItem}
          className="w-full px-4 py-2 rounded-lg text-[13px] font-medium border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center justify-center gap-2"
        >
          <Icon name="plus" size={14} /> Add Another Medication
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Drug search dropdown (used inside PrescriptionModal) ────────────────────

function DrugSearchInput({ value, drugs, onChange, onSelect }) {
  const [focused, setFocused] = useState(false)

  const query = value.trim().toLowerCase()
  const filtered = query
    ? drugs.filter((d) =>
      d.name.toLowerCase().includes(query) ||
      d.generic_name.toLowerCase().includes(query)
    ).slice(0, 8)
    : drugs.slice(0, 8)

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search drug name or generic (e.g. Amoxicillin)…"
        className={inputCls}
        autoComplete="off"
      />
      {focused && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg">
          {filtered.map((d) => (
            <button
              key={d.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(d); setFocused(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors border-b border-gray-100 dark:border-gray-700/40 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{d.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {d.generic_name} · {cap(d.category)} · {d.form} {d.strength}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                    {formatMoney(d.unit_price)}
                  </span>
                  <StockPill stock={d.current_stock} reorder={d.reorder_level} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {focused && filtered.length === 0 && query && (
        <div className="absolute z-30 mt-1 w-full rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg px-3 py-2">
          <p className="text-[11px] text-gray-400">No matching drug in stock. You may still type a custom medication.</p>
        </div>
      )}
    </div>
  )
}

function StockPill({ stock, reorder }) {
  const cls = stock === 0
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : stock <= reorder
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  const label = stock === 0 ? 'OUT' : stock <= reorder ? 'LOW' : 'IN STOCK'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      <Icon name="box" size={10} /> {label} {stock}
    </span>
  )
}

// ─── NotificationBell — dropdown of recent events (the "drop toast") ──────────

const NOTIF_ICON = {
  lab_ready: 'checkCircle',
  rx_dispensed: 'pill',
  patient_waiting: 'clock',
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Auto-refresh every 30s so the doctor sees fresh events without reloading
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/api/notifications'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const notifications = data?.notifications || []
  const unread = data?.unread_count || 0

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        title="Notifications"
        aria-label="Toggle notifications"
      >
        <Icon name="bell" size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-lg z-50">
          <div className="sticky top-0 bg-white dark:bg-[#1e293b] px-4 py-3 border-b border-gray-100 dark:border-gray-700/40 flex items-center justify-between">
            <h4 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Notifications</h4>
            {unread > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{unread} new</span>
            ) : (
              <span className="text-[10px] text-gray-400">All caught up</span>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center mx-auto mb-2">
                <Icon name="bell" size={18} className="text-gray-400" />
              </div>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">No recent notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {notifications.map((n) => {
                const iconName = NOTIF_ICON[n.type] || 'info'
                const iconBg = n.type === 'lab_ready'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : n.type === 'rx_dispensed'
                    ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400'
                    : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                return (
                  <div key={n.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                        <Icon name={iconName} size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.timestamp)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}