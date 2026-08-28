'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, InlineLoader, Spinner, Icon,
  formatMoney, formatTime, formatDate, timeAgo, badgeClass, cap, VISIT_TYPES,
} from '@/utils/helpers'
import { useSearchParams } from 'next/navigation'
import { evaluateField } from '@/utils/labResult'
import {
  SUBJECTIVE_SUGGESTIONS, OBJECTIVE_SUGGESTIONS,
  ASSESSMENT_SUGGESTIONS, PLAN_SUGGESTIONS,
} from '@/lib/enums'
import socket from '@/lib/socket'
import { DIAGNOSIS_CATALOG, DIAGNOSIS_CATEGORIES } from '@/lib/diagnosis_catalog'
import { MedicalReportModal } from '@/components/doctor/MedicalReportModal'
import {
  patchVisitSchema,
  orderLabTestsSchema,
  createPrescriptionSchema,
  completeProcedureSchema,
  returnItemSchema,
} from '@/lib/validation'

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

export default function ConsultationTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [vitals, setVitals] = useState(EMPTY_VITALS)
  const [soap, setSoap] = useState(EMPTY_SOAP)
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [openSoap, setOpenSoap] = useState({ subjective: true, objective: false, assessment: false, plan: false })
  const [showLabModal, setShowLabModal] = useState(false)
  const [showRxModal, setShowRxModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [procedureFee, setProcedureFee] = useState('')
  const [editingProcedure, setEditingProcedure] = useState(false)
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

  const locked = visitQuery.data?.locked === true

  // API: GET /api/doctor/visits/[id]/labs
  const labsQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'labs'],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}/labs`),
    enabled: !!visitId && !locked,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // API: GET /api/doctor/visits/[id]/prescriptions
  const rxQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'prescriptions'],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}/prescriptions`),
    enabled: !!visitId && !locked,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const visit = visitQuery.data?.visit
  const labRequests = labsQuery.data?.requests || []
  const prescriptions = rxQuery.data?.prescriptions || []

  // Diagnosis gate: cannot save diagnosis while lab tests are still pending.
  const labsBlockingDiagnosis = labRequests.length > 0 && labRequests.some((r) =>
    r.items.some((it) => it.status === 'pending' || it.status === 'in_progress')
  )

  // Sync form state when the visit loads.
  // Hooks stay ABOVE the locked early-return; the effect itself no-ops when locked.
  useEffect(() => {
    if (!visit || locked) return
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
  }, [visit?.id, locked])

  // ── Websockets ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visitId) return

    const handleDispensed = () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId, 'prescriptions'] })
    }

    const handleCancelled = () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId, 'prescriptions'] })
    }
    const handleLabrequests = () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
    }

    socket.on('rx:dispensed', handleDispensed)
    socket.on('rx:cancelled', handleCancelled)
    socket.on('lab:results_ready', handleLabrequests)

    return () => {
      socket.off('rx:dispensed', handleDispensed)
      socket.off('rx:cancelled', handleCancelled)
      socket.off('lab:results_ready', handleLabrequests)
    }
  }, [visitId, queryClient])

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

  // API: PATCH /api/doctor/visits/[id]/complete-procedure
  const procedureMutation = useMutation({
    mutationFn: (body) => api.patch(`/api/doctor/visits/${visitId}/complete-procedure`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
    },
  })

  // ─── Save handlers ──────────────────────────────────────────────────────────

  const handleSaveVitals = async () => {
    const payload = {
      temperature: vitals.temperature === '' ? null : Number(vitals.temperature),
      bp_systolic: vitals.bp_systolic === '' ? null : Number(vitals.bp_systolic),
      bp_diastolic: vitals.bp_diastolic === '' ? null : Number(vitals.bp_diastolic),
      pulse: vitals.pulse === '' ? null : Number(vitals.pulse),
      respiratory_rate: vitals.respiratory_rate === '' ? null : Number(vitals.respiratory_rate),
      weight: vitals.weight === '' ? null : Number(vitals.weight),
      height: vitals.height === '' ? null : Number(vitals.height),
      spo2: vitals.spo2 === '' ? null : Number(vitals.spo2),
      vitals_notes: vitals.vitals_notes?.trim() || null,
    }

    const parsed = patchVisitSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message)
      return
    }

    try {
      await patchMutation.mutateAsync(parsed.data)
      toast.success('Vitals saved')
    } catch (err) {
      toast.error(err.message || 'Could not save vitals')
    }
  }

  const handleSaveSoap = async () => {
    const payload = {
      subjective: soap.subjective?.trim() || null,
      objective: soap.objective?.trim() || null,
      assessment: soap.assessment?.trim() || null,
      plan: soap.plan?.trim() || null,
    }

    const parsed = patchVisitSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message)
      return
    }

    try {
      await patchMutation.mutateAsync(parsed.data)
      toast.success('SOAP notes saved')
    } catch (err) {
      toast.error(err.message || 'Could not save notes')
    }
  }

  const handleSaveDiagnosis = async () => {
    if (labsBlockingDiagnosis) {
      toast.error('Diagnosis cannot be saved until all lab results are ready. Please wait for the lab to complete the tests.')
      return
    }

    const payload = {
      diagnosis: diagnosis?.trim() || null,
      diagnosis_code: diagnosisCode?.trim() || null,
    }

    const parsed = patchVisitSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message)
      return
    }

    try {
      await patchMutation.mutateAsync(parsed.data)
      toast.success('Diagnosis saved')
    } catch (err) {
      toast.error(err.message || 'Could not save diagnosis')
    }
  }
  const handleEndConsultation = async () => {
    if (endBlockReason) {
      toast.error(endBlockReason)
      return
    }

    const payload = {
      status: 'billing',
      from_pharmacy: false,
      diagnosis: diagnosis?.trim() || null,
      diagnosis_code: diagnosisCode?.trim() || null,
      subjective: soap.subjective?.trim() || null,
      objective: soap.objective?.trim() || null,
      assessment: soap.assessment?.trim() || null,
      plan: soap.plan?.trim() || null,
    }

    const parsed = patchVisitSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message)
      return
    }

    try {
      await patchMutation.mutateAsync(parsed.data)
      toast.success('Consultation completed — patient sent to billing')
    } catch (err) {
      return toast.error(err.message || 'Could not end consultation')
    }
  }

  const handleAddProcedure = async () => {
    const raw = Number(procedureFee)
    if (!Number.isFinite(raw) || raw <= 0) {
      toast.error('Enter a valid procedure fee')
      return
    }

    const price = Math.round(raw)

    try {
      const result = await procedureMutation.mutateAsync({ price })
      toast.success(result.message || 'Procedure fee added')
      setProcedureFee('')
      setEditingProcedure(false)
    } catch (err) {
      toast.error(err.message || 'Could not add procedure fee')
    }
  }

  const handleOrderLabs = async (testIds, urgency) => {
    if (!testIds.length) {
      toast.error('Select at least one test')
      return
    }

    const payload = { test_ids: testIds, urgency }
    const parsed = orderLabTestsSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message)
      return
    }

    try {
      await labMutation.mutateAsync(parsed.data)
      toast.success(`${testIds.length} lab test${testIds.length > 1 ? 's' : ''} ordered`)
      setShowLabModal(false)
    } catch (err) {
      toast.error(err.message || 'Could not order lab tests')
    }
  }

 const handleAddPrescription = async (items) => {
  const payload = {
    items: items.map((it) => ({
      medication: it.medication,
      product_id: it.product_id,
      drug_id: it.drug_id,
      dosage: it.dosage,
      frequency: it.frequency,
      duration: it.duration,
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
      form: it.form,
    })),
  }

  const parsed = createPrescriptionSchema.safeParse(payload)
  if (!parsed.success) {
    toast.error(parsed.error.errors[0].message)
    return
  }

  try {
    await rxMutation.mutateAsync(parsed.data)
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

  // Stage lock: the patient has moved past the doctor's part of the flow
  // (billing, done, archived) or hasn't paid yet. Do not open the chart.
  if (locked) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Icon name="lock" size={22} />
          </div>
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
            Patient is no longer in consultation
          </h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
            {visit.patient_name ? `${visit.patient_name} has ` : 'This patient has '}
            moved to <span className="font-semibold">{cap(visit.status)}</span> and can no longer be
            managed from the consultation room.
          </p>
        </div>
      </div>
    )
  }

  const visitType = VISIT_TYPES[visit.visit_type] || { label: cap(visit.visit_type), badge: badgeClass(visit.visit_type) }
  const pendingLabsCount = labRequests.reduce((n, r) => n + r.items.filter((it) => it.status === 'pending' || it.status === 'in_progress').length, 0)
  const pendingRxCount = prescriptions.reduce((n, p) => n + p.items.filter((it) => it.status === 'pending').length, 0)
  const readyLabsCount = labRequests.reduce((n, r) => {
    if (r.status !== 'ready') return n
    return n + r.items.filter((it) => it.status === 'ready' && (it.result || it.result_data)).length
  }, 0)
  const hasReadyLabs = readyLabsCount > 0
  const patientForEval = { gender: visit.patient_gender, age: visit.patient_age }


  // Single source of truth for why End Consultation is blocked (null = allowed)
  const endBlockReason =
    pendingLabsCount > 0
      ? `Cannot end — ${pendingLabsCount} lab test${pendingLabsCount > 1 ? 's are' : ' is'} still pending. Patient is at the lab.`
      : pendingRxCount > 0
        ? `Cannot end — ${pendingRxCount} medication${pendingRxCount > 1 ? 's are' : ' is'} pending at the pharmacy.`
         : null

  // The report only opens once the chart has medical content to print.
  const reportHasContent = !!(
    visit.diagnosis?.trim() ||
    visit.subjective || visit.objective || visit.assessment || visit.plan ||
    visit.chief_complaint ||
    visit.procedure_name ||
    readyLabsCount > 0 ||
    prescriptions.some((p) => (p.items || []).length > 0)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <PatientBanner visit={visit} visitType={visitType} />
      </div>

      {/* Lab results ready banner */}
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
              {readyLabsCount} test{readyLabsCount > 1 ? 's' : ''} completed. Review the full results in the Lab Orders section below, record your diagnosis, and prescribe medication if necessary before ending the consultation.
            </p>
          </div>
        </div>
      )}

      {/* From Pharmacy banner — patient returned with dispensed meds */}
      {visit.from_pharmacy && (
        <div className="flex items-start gap-3 rounded-xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50 dark:bg-cyan-950/30 p-4">
          <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Icon name="pillBottle" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-cyan-700 dark:text-cyan-400">
              From Pharmacy — review dispensed medications
            </p>
            <p className="text-[11px] text-cyan-700/70 dark:text-cyan-400/70 mt-0.5">
              The pharmacy has dispensed the prescribed medications. Review them in the Prescriptions section below. If any medication needs to be returned (client declined, wrong dose, adverse reaction), click the return button — the pharmacy will confirm receipt and restock automatically. When ready, end the consultation to send the patient to billing.
            </p>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left column */}
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
                suggestions={SUBJECTIVE_SUGGESTIONS}
                placeholder="e.g. Patient complains of headache and fever for 3 days. No history of hypertension or diabetes."
              />
              <SoapSection
                letter="O" label="Objective" hint="Examination findings & observed signs"
                open={openSoap.objective}
                onToggle={() => setOpenSoap({ ...openSoap, objective: !openSoap.objective })}
                value={soap.objective}
                onChange={(v) => setSoap({ ...soap, objective: v })}
                suggestions={OBJECTIVE_SUGGESTIONS}
                placeholder="e.g. Alert, oriented. No pallor, jaundice, or cyanosis. Throat mildly erythematous."
              />
              <SoapSection
                letter="A" label="Assessment" hint="Differential & working diagnosis"
                open={openSoap.assessment}
                onToggle={() => setOpenSoap({ ...openSoap, assessment: !openSoap.assessment })}
                value={soap.assessment}
                onChange={(v) => setSoap({ ...soap, assessment: v })}
                suggestions={ASSESSMENT_SUGGESTIONS}
                placeholder="e.g. Likely viral upper respiratory tract infection. Malaria ruled out by negative RDT."
              />
              <SoapSection
                letter="P" label="Plan" hint="Investigations, treatment & follow-up"
                open={openSoap.plan}
                onToggle={() => setOpenSoap({ ...openSoap, plan: !openSoap.plan })}
                value={soap.plan}
                onChange={(v) => setSoap({ ...soap, plan: v })}
                suggestions={PLAN_SUGGESTIONS}
                placeholder="e.g. Paracetamol 1g STAT, plenty of fluids, rest. Review in 3 days if no improvement."
              />
            </div>
          </Card>

          {/* Lab Orders — with detailed template-driven results viewer */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Lab Orders"
              subtitle={pendingLabsCount > 0 ? `${pendingLabsCount} pending test${pendingLabsCount > 1 ? 's' : ''}` : hasReadyLabs ? `${readyLabsCount} result${readyLabsCount > 1 ? 's' : ''} ready — click a test to expand` : 'No lab tests ordered yet'}
              action={
                <button
                  onClick={() => setShowLabModal(true)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center gap-1.5"
                >
                  <Icon name="flask" size={13} /> Order Lab Tests
                </button>
              }
            />
            <LabOrdersList loading={labsQuery.isLoading} requests={labRequests} patient={patientForEval} />
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
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                  Diagnosis {diagnosisCode && <span className="text-[#1a6cbf] dark:text-blue-400 normal-case font-bold ml-1">· {diagnosisCode}</span>}
                </label>
                <DiagnosisSearchSelect
                  code={diagnosisCode}
                  text={diagnosis}
                  disabled={labsBlockingDiagnosis}
                  onSelect={(code, label) => {
                    setDiagnosisCode(code)
                    setDiagnosis(label)
                  }}
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
              subtitle={pendingRxCount > 0
                ? `${pendingRxCount} pending item${pendingRxCount > 1 ? 's' : ''}`
                : 'No pending prescriptions.'
              }
              action={
                <button
                  onClick={() => setShowRxModal(true)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
                >
                  <Icon name='pill' size={13} /> Add Prescription
                </button>
              }
            />
            <PrescriptionsList loading={rxQuery.isLoading} prescriptions={prescriptions} visitId={visitId} />
          </Card>

          {/* Services & Procedures */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Services & Procedures"
              subtitle={
                visit?.procedure_fee > 0 && !editingProcedure
                  ? `Fee: ${formatMoney(visit.procedure_fee)}`
                  : editingProcedure
                    ? 'Edit procedure fee'
                    : 'No procedure fee added'
              }
            />
            <div className="p-4">
              {visit?.procedure_fee > 0 && !editingProcedure ? (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">
                        Procedure Fee
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                        Added to bill
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatMoney(visit.procedure_fee)}
                      </span>
                      <button
                        onClick={() => {
                          setProcedureFee(String(visit.procedure_fee))
                          setEditingProcedure(true)
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Procedure Fee (KSh)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={procedureFee}
                      onChange={(e) => setProcedureFee(e.target.value)}
                      placeholder="e.g. 1500"
                      className={`${inputCls} tabular-nums`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAddProcedure}
                      disabled={
                        procedureMutation.isPending ||
                        !procedureFee ||
                        Number(procedureFee) <= 0
                      }
                      className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {procedureMutation.isPending ? (
                        <Icon name="refresh" size={14} className="animate-spin" />
                      ) : (
                        <Icon name={editingProcedure ? 'save' : 'plus'} size={14} />
                      )}
                      {editingProcedure ? 'Update Fee' : 'Add to Bill'}
                    </button>
                    {editingProcedure && (
                      <button
                        onClick={() => {
                          setEditingProcedure(false)
                          setProcedureFee('')
                        }}
                        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column: vitals + end consultation */}
        <div className="space-y-4">
          {/* Vitals */}
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
                  value={vitals.vitals_notes ?? ''}
                  onChange={(e) => setVitals({ ...vitals, vitals_notes: e.target.value })}
                  rows={2}
                  placeholder="e.g. Patient appears in mild distress"
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </Card>

          {/* End consultation + report */}
          <Card className="p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-1">End Consultation</h3>
            <p className={`text-[11px] mb-3 ${endBlockReason ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
              {endBlockReason || 'All services complete — patient will be sent to BILLING for final payment.'}
            </p>
            <button
              onClick={handleEndConsultation}
              disabled={patchMutation.isPending || !!endBlockReason}
              title={endBlockReason || undefined}
              className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {patchMutation.isPending
                ? <Icon name="refresh" size={14} className="animate-spin" />
                : <Icon name="check" size={14} />}
              End Consultation
            </button>
            <button
              onClick={() => setShowReportModal(true)}
              disabled={!reportHasContent}
              title={!reportHasContent ? 'Nothing to report yet — record notes, a diagnosis, results, medications, or a procedure first' : undefined}
              className="w-full mt-2 px-4 py-2 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:border-[#1a6cbf] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
            >
              <Icon name="printer" size={13} />
              Print Medical Report
            </button>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {showLabModal && (
        <LabOrderModal
          onClose={() => setShowLabModal(false)}
          existingRequests={labRequests}
          onSubmit={handleOrderLabs}
          loading={labMutation.isPending}
        />
      )}
      {showRxModal && (
        <PrescriptionModal
          onClose={() => setShowRxModal(false)}
          onSubmit={handleAddPrescription}
          loading={rxMutation.isPending}
        />
      )}
      {showReportModal && (
        <MedicalReportModal
          visitId={visitId}
          onClose={() => setShowReportModal(false)}
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
            {visit.from_pharmacy && (
              <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                <Icon name="pillBottle" size={11} /> From Pharmacy
              </Badge>
            )}
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

function SoapSection({ letter, label, hint, open, onToggle, value, onChange, placeholder, suggestions }) {
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const q = search.trim().toLowerCase()
  // Empty query on focus shows the first few for discovery; typing filters.
  const filtered = suggestions
    ? (q
      ? suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 12)
      : suggestions.slice(0, 10))
    : []

  const addSuggestion = (text) => {
    const current = value ? value.trim() : ''
    // Append on a new line — findings accumulate, they don't replace.
    onChange(current ? `${current}\n${text}` : text)
    setSearch('')
    setShowSuggestions(false)
  }

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
          {/* Suggestion search — type to filter, click or Enter to append */}
          {suggestions && (
            <div className="mb-2 relative">
              <div className="relative">
                <Icon name="search" size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (filtered.length > 0) addSuggestion(filtered[0])
                    }
                    if (e.key === 'Escape') setShowSuggestions(false)
                  }}
                  placeholder={`Search ${suggestions.length} common phrases… (Enter adds top match)`}
                  className="w-full h-8 pl-8 pr-3 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]"
                />
              </div>
              {showSuggestions && filtered.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg">
                  {filtered.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); addSuggestion(s) }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-b border-gray-100 dark:border-gray-700/40 last:border-0 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {showSuggestions && q && filtered.length === 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg px-3 py-2">
                  <p className="text-[11px] text-gray-400">No matching phrases. Type your own in the text area below.</p>
                </div>
              )}
            </div>
          )}

          <textarea
            value={value ?? ''}
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

function DiagnosisSearchSelect({ code, text, disabled, onSelect }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const selectedItem = code ? DIAGNOSIS_CATALOG.find((d) => d.code === code) : null
  const hasFreeText = !code && !!text?.trim()

  const q = search.trim().toLowerCase()
  const filtered = q
    ? DIAGNOSIS_CATALOG.filter((d) =>
      d.label.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
    ).slice(0, 15)
    : []

  const pick = (c, label) => {
    onSelect(c, label)
    setSearch('')
    setOpen(false)
  }

  if (disabled) {
    return (
      <div className={`${inputCls} opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50`}>
        <span className="text-gray-400">Locked — waiting for lab results</span>
      </div>
    )
  }

  // Selected state — coded pick or free-text, with edit/clear controls
  if ((selectedItem || hasFreeText) && !open) {
    return (
      <div className={`${inputCls} flex items-center justify-between`}>
        <span className="flex items-center gap-2 min-w-0">
          {selectedItem ? (
            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-[#1a6cbf] dark:text-blue-400 text-[10px] font-bold tabular-nums shrink-0">
              {selectedItem.code}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 text-[10px] font-bold shrink-0">
              free text
            </span>
          )}
          <span className="text-gray-900 dark:text-gray-100 truncate">{selectedItem ? selectedItem.label : text}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setOpen(true); setSearch('') }}
            title="Change diagnosis"
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-[#1a6cbf] hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
          >
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            onClick={() => pick('', '')}
            title="Clear diagnosis"
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length > 0) pick(filtered[0].code, filtered[0].label)
              else if (q) pick('', search.trim())
            }
          }}
          placeholder={`Search ${DIAGNOSIS_CATALOG.length} diagnoses by name or ICD code…`}
          className={`${inputCls} pl-9`}
        />
      </div>

      {open && q && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg">
          {filtered.map((d) => (
            <button
              key={d.code}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(d.code, d.label) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-b border-gray-100 dark:border-gray-700/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-[#1a6cbf] dark:text-blue-400 text-[10px] font-bold tabular-nums shrink-0">
                  {d.code}
                </span>
                <span className="text-[12px] text-gray-700 dark:text-gray-300">{d.label}</span>
                {DIAGNOSIS_CATEGORIES[d.category] && (
                  <span className="text-[9px] text-gray-400 ml-auto shrink-0">{DIAGNOSIS_CATEGORIES[d.category]}</span>
                )}
              </div>
            </button>
          ))}
          {/* Free-text escape — the catalog never blocks an uncatalogued diagnosis */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); pick('', search.trim()) }}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors"
          >
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Use "<span className="font-semibold text-gray-700 dark:text-gray-200">{search.trim()}</span>" as free-text diagnosis (no ICD code)
            </span>
          </button>
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
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} ${borderColor} ${valueColor} tabular-nums`}
      />
    </div>
  )
}

const FLAG_TEXT = {
  low: 'font-bold text-amber-600 dark:text-amber-400',
  high: 'font-bold text-red-600 dark:text-red-400',
  abnormal: 'font-bold text-red-600 dark:text-red-400',
}

const ITEM_STATUS_BADGE = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

function LabOrdersList({ loading, requests, patient }) {
  const [openItems, setOpenItems] = useState({})

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

  const toggle = (id) => setOpenItems((s) => ({ ...s, [id]: !(s[id] ?? true) }))

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

          <div className="space-y-2">
            {r.items.map((it) => {
              const hasStructured = !!(it.result_data && it.result_template?.sections?.length)
              const hasAnyResult = hasStructured || !!it.result
              const isReady = it.status === 'ready'
              // Ready results default open; user toggles override
              const isOpen = hasAnyResult && (openItems[it.id] ?? isReady)
              const statusCls = ITEM_STATUS_BADGE[it.status] || ITEM_STATUS_BADGE.pending

              return (
                <div
                  key={it.id}
                  className={[
                    'rounded-lg border overflow-hidden',
                    isReady
                      ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10'
                      : 'border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-700/20',
                  ].join(' ')}
                >
                  {/* Item header — clickable when results exist */}
                  <button
                    type="button"
                    onClick={() => hasAnyResult && toggle(it.id)}
                    disabled={!hasAnyResult}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left ${hasAnyResult ? 'hover:bg-white/60 dark:hover:bg-gray-700/30 cursor-pointer' : 'cursor-default'} transition-colors`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{it.test_name}</p>
                        {it.flagged && (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <Icon name="alert" size={10} /> Abnormal
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {cap(it.category || 'uncategorised')}
                        {it.completed_at && ` · Completed ${formatDate(it.completed_at)} ${formatTime(it.completed_at)}`}
                        {!it.completed_at && it.reference_range && ` · Ref: ${it.reference_range}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!hasAnyResult && <span className="text-[11px] text-gray-400 italic">awaiting</span>}
                      <Badge className={statusCls}>{cap(it.status)}</Badge>
                      {hasAnyResult && (
                        <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded result body */}
                  {isOpen && (
                    <div className="border-t border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#0f172a] px-3 py-3">
                      {hasStructured ? (
                        <>
                          {it.result_template.sections.map((section, si) => (
                            <ResultSection
                              key={si}
                              section={section}
                              index={si}
                              sectionCount={it.result_template.sections.length}
                              values={it.result_data || {}}
                              patient={patient}
                            />
                          ))}
                        </>
                      ) : (
                        // Fallback: simple summary result
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-gray-500 dark:text-gray-400">Result</span>
                          <span className={it.flagged ? FLAG_TEXT.abnormal : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
                            {it.result || '—'}
                          </span>
                        </div>
                      )}

                      {/* Tech comment */}
                      {it.result_notes && (
                        <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 px-3 py-2 flex items-start gap-2">
                          <Icon name="info" size={12} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-[11px] text-blue-700 dark:text-blue-400">
                            <span className="font-semibold">Lab comment: </span>{it.result_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// One template section: number/select/radio/text → label|value|ref rows,
// textarea → free-text block, sensitivity → antibiotic table.
function ResultSection({ section, index, sectionCount, values, patient }) {
  const fields = section.fields || []
  const hasInline = fields.some((f) => !['textarea', 'sensitivity'].includes(f.input_type))

  const evaluated = fields.map((f) => {
    if (['textarea', 'sensitivity'].includes(f.input_type)) return { f }
    const raw = values[f.key]
    const has = raw != null && raw !== ''
    const { status, range } = evaluateField(f, raw, patient)
    return {
      f,
      display: has ? `${raw}${f.unit ? ` ${f.unit}` : ''}` : '—',
      status: has ? status : null, // 'low' | 'high' | 'abnormal' | 'normal' | 'unknown'
      range: range || f.reference_range || null,
    }
  })
  const showRef = evaluated.some((e) => e.range)

  return (
    <div className={index > 0 ? 'mt-4' : ''}>
      {/* Section header — only shown when the template has multiple sections
          or a real title, to keep single-panel tests compact */}
      {(section.title || sectionCount > 1) && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            {section.title || `Section ${index + 1}`}
          </span>
          <span className="flex-1 border-t border-gray-200 dark:border-gray-700/60" />
        </div>
      )}

      {/* Column headers for inline fields */}
      {hasInline && (
        <div className="flex text-[9px] font-bold uppercase tracking-widest text-gray-400 px-2 pb-1">
          <div className={showRef ? 'w-2/5' : 'w-3/5'}>Parameter</div>
          <div className="flex-1 text-center">Result</div>
          {showRef && <div className="w-2/5 text-right">Ref. Range</div>}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40 overflow-hidden">
        {evaluated.map(({ f, display, status, range }) => {
          // Sensitivity table (culture & sensitivity tests)
          if (f.input_type === 'sensitivity') {
            const raw = values[f.key]
            const rows = Array.isArray(raw) ? raw.filter((r) => r.antibiotic) : []
            if (!rows.length) return null
            return (
              <div key={f.key}>
                <div className="flex text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 px-2 py-1">
                  <div className="w-3/5">{f.rows_label || 'Antibiotic'}</div>
                  <div className="flex-1 text-center">Sensitivity</div>
                </div>
                {rows.map((row, ri) => (
                  <div key={ri} className="flex text-[12px] px-2 py-1 border-t border-gray-100 dark:border-gray-700/40">
                    <div className="w-3/5 text-gray-700 dark:text-gray-300">{row.antibiotic}</div>
                    <div className="flex-1 text-center font-semibold text-gray-900 dark:text-gray-100">{row.result || '—'}</div>
                  </div>
                ))}
              </div>
            )
          }

          // Free-text block (deposits, microscopy descriptions, comments)
          if (f.input_type === 'textarea') {
            const raw = values[f.key]
            const text = raw != null && raw !== '' ? String(raw) : null
            if (!text) return null
            return (
              <div key={f.key} className="px-2 py-1.5 text-[12px] text-gray-700 dark:text-gray-300 whitespace-pre-line">
                {f.label && <span className="font-semibold text-gray-900 dark:text-gray-100">{f.label}: </span>}{text}
              </div>
            )
          }

          // Standard parameter row
          return (
            <div key={f.key} className="flex items-center text-[12px] px-2 py-1.5">
              <div className={`${showRef ? 'w-2/5' : 'w-3/5'} text-gray-600 dark:text-gray-400`}>{f.label}</div>
              <div className={`flex-1 text-center tabular-nums ${FLAG_TEXT[status] || 'font-medium text-gray-900 dark:text-gray-100'}`}>
                {display}
                {status === 'low' && <span className="ml-1 text-[9px] font-bold uppercase">↓ low</span>}
                {status === 'high' && <span className="ml-1 text-[9px] font-bold uppercase">↑ high</span>}
              </div>
              {showRef && (
                <div className="w-2/5 text-right font-mono text-[10px] text-gray-400">{range || ''}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══ Prescriptions ═════════════════════════════════════════════════════════════

// Only issued (dispensed) medications can be returned to pharmacy.
// Pending items haven't been dispensed yet — no stock movement to reverse.
const RETURNABLE_ITEM_STATUSES = ['issued']

const RETURN_REASON_SUGGESTIONS = [
  'Client declined',
  'Wrong medication',
  'Adverse reaction',
]

const ITEM_STATUS_BADGES = {
  pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400' },
  issued: { label: 'Issued', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  returned: { label: 'Returned — awaiting pharmacy confirmation', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  restocked: { label: 'Restocked', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

function PrescriptionsList({ loading, prescriptions, visitId }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [returnTarget, setReturnTarget] = useState(null) // { prescription, item }
  const [returnReason, setReturnReason] = useState(RETURN_REASON_SUGGESTIONS[0])

  // API: PATCH /api/doctor/prescriptions/[id]/return-item
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

    const payload = {
      item_id: returnTarget.item.id,
      doctor_name: user?.username || 'Doctor',
      reason: returnReason.trim(),
    }

    const parsed = returnItemSchema.safeParse(payload)
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message)
      return
    }

    returnItemMutation.mutate({
      prescriptionId: returnTarget.prescription.id,
      itemId: parsed.data.item_id,
      doctorName: parsed.data.doctor_name,
      reason: parsed.data.reason,
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
                const statusBadge = ITEM_STATUS_BADGES[it.status] || ITEM_STATUS_BADGES.pending
                const isInjectable = it.form === 'injection'
                const feeRemoved = ['returned', 'restocked', 'declined', 'cancelled'].includes(it.status)
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
                          {isInjectable && (
                            <Badge className="bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">
                              <Icon name="syringe" size={10} /> Injection
                            </Badge>
                          )}
                          <Badge className={statusBadge.cls}>{statusBadge.label}</Badge>
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
                        </p>
                        {it.return_reason && (it.status === 'returned' || it.status === 'restocked') && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                            <Icon name="alert" size={11} className="shrink-0" />
                            <span>{it.return_reason}</span>
                          </p>
                        )}
                        {it.decline_reason && it.status === 'declined' && (
                          <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1">
                            <Icon name="alert" size={11} className="shrink-0" />
                            <span>{it.decline_reason}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[12px] font-semibold tabular-nums ${feeRemoved ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
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

// ReturnItemModal — confirmation modal for returning a single med item to pharmacy
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
          Returning this medication will remove its fee from the patient&rsquo;s bill immediately.
          The medication&rsquo;s stock will be restored once the pharmacist confirms receipt of the
          returned item. This cannot be undone.
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

// Lab order modal — fetches the real catalog from the DB and submits test ids.
function LabOrderModal({ onClose, onSubmit, loading, existingRequests = [] }) {
  const [selected, setSelected] = useState({}) // catalog id → true
  const [urgency, setUrgency] = useState('routine')
  const [search, setSearch] = useState('')
 
  const { data, isLoading, error } = useQuery({
    queryKey: ['doctor', 'lab-catalog'],
    queryFn: () => api.get('/api/doctor/lab-catalog'),
    staleTime: 5 * 60 * 1000, // catalog rarely changes within a shift
  })
  const tests = data?.tests || []
 
  // Tests already on this visit. Re-ordering one bills the patient twice, so
  // flag them rather than silently allowing a duplicate.
  const alreadyOrdered = new Map()
  for (const r of existingRequests) {
    for (const it of r.items || []) {
      if (it.test_id != null) alreadyOrdered.set(it.test_id, it.status)
    }
  }
 
  // Filtering only affects what is RENDERED. selected/total read from `tests`,
  // so a test picked before typing stays selected and stays in the total when
  // it filters out of view.
  const q = search.trim().toLowerCase()
  const visible = (q
    ? tests.filter((t) =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    )
    : tests
  ).slice().sort((a, b) => (selected[b.id] ? 1 : 0) - (selected[a.id] ? 1 : 0))
 
  const toggle = (t) => setSelected((s) => ({ ...s, [t.id]: !s[t.id] }))
  const selectedTests = tests.filter((t) => selected[t.id])
  const selectedIds = selectedTests.map((t) => t.id)
  const totalCost = selectedTests.reduce((s, t) => s + (t.unit_cost || 0), 0)
  const duplicateCount = selectedIds.filter((id) => alreadyOrdered.has(id)).length
 
  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {selectedIds.length} test{selectedIds.length !== 1 ? 's' : ''} selected
        </span>
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
          {formatMoney(totalCost)}
        </span>
      </div>
      <button
        onClick={() => onSubmit(selectedIds, urgency)}
        disabled={loading || selectedIds.length === 0}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
 
      {/* Search */}
      <div className="relative mb-2">
        <Icon name="search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tests.length ? `Search ${tests.length} tests by name or category…` : 'Search tests…'}
          className={`${inputCls} pl-9 pr-8`}
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
 
      {/* Selection stays live while filtered — say so, since selected tests
          can sit outside the current results. */}
      {q && selectedIds.length > 0 && (
        <p className="text-[10px] text-gray-400 mb-2">
          {selectedIds.length} selected test{selectedIds.length !== 1 ? 's' : ''} kept while searching
        </p>
      )}
 
      {duplicateCount > 0 && (
        <div className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
          <Icon name="alert" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {duplicateCount} selected test{duplicateCount !== 1 ? 's have' : ' has'} already been ordered for this visit. Ordering again bills the patient a second time.
          </p>
        </div>
      )}
 
      {isLoading ? (
        <p className="text-[12px] text-gray-400 py-6 text-center">Loading test catalog…</p>
      ) : error ? (
        <p className="text-[12px] text-red-500 py-6 text-center">Could not load lab tests. {error.message}</p>
      ) : tests.length === 0 ? (
        <p className="text-[12px] text-gray-400 py-6 text-center">No active lab tests in the catalog.</p>
      ) : visible.length === 0 ? (
        <p className="text-[12px] text-gray-400 py-6 text-center">No test matches &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visible.map((t) => {
            const isSel = !!selected[t.id]
            const prevStatus = alreadyOrdered.get(t.id)
            return (
              <button
                key={t.id}
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
                    <p className="text-[10px] text-gray-400 mt-0.5">{t.category ? cap(t.category) : 'Uncategorised'}</p>
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
                {prevStatus && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                    <Icon name="alert" size={10} className="shrink-0" />
                    Already ordered · {cap(prevStatus)}
                  </p>
                )}
                {t.reference_range && (
                  <p className="text-[10px] text-gray-400 mt-1.5">Ref: {t.reference_range}</p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </ModalShell>
  )
}
 

// Drop-in replacement for PrescriptionModal + DrugSearchInput in ConsultationTab.jsx.
// No new imports required.

function PrescriptionModal({ onClose, onSubmit, loading }) {
  const [items, setItems] = useState([
    { medication: '', dosage: '', frequency: '', duration: '', quantity: 1, unit_cost: '', form: 'oral', drug_id: null, _stock: null },
  ])

  const { data: drugsData, isLoading: drugsLoading, error: drugsError } = useQuery({
    queryKey: ['pharmacy', 'drugs'],
    queryFn: () => api.get('/api/pharmacy/drugs'),
    staleTime: 30000,
  })
  const drugs = drugsData?.items || []

  const updateItem = (i, field, value) => {
    setItems((arr) => arr.map((it, idx) => {
      if (idx !== i) return it

      // Quantity can never exceed the stock of the linked drug.
      if (field === 'quantity' && it._stock != null && Number(value) > it._stock) {
        return { ...it, quantity: it._stock }
      }

      // Typing over a selected drug unlinks it. Without this the order carries
      // drug_id X while reading as drug Y — the pharmacy decrements the wrong
      // stock line, and the quantity cap enforces the wrong drug's ceiling.
      if (field === 'medication' && it.drug_id) {
        return { ...it, medication: value, drug_id: null, _stock: null, form: 'oral' }
      }

      return { ...it, [field]: value }
    }))
  }

  // Selecting a drug links it and carries its form. Price stays manual.
  const selectDrug = (i, drug) => {
    setItems((arr) => arr.map((it, idx) => idx === i ? {
      ...it,
      medication: drug.name ?? '',
      form: drug.form ?? 'oral',
      drug_id: drug.id,
      _stock: drug.current_stock ?? null,
    } : it))
  }

  const addItem = () => setItems((arr) => [...arr, { medication: '', dosage: '', frequency: '', duration: '', quantity: 1, unit_cost: '', form: 'oral', drug_id: null, _stock: null }])
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))

  const handleModalSubmit = () => {
    const payloadItems = validItems.map((it) => ({
      medication: it.medication?.trim(),
      product_id: Number(it.drug_id),
      drug_id: Number(it.drug_id),
      dosage: it.dosage?.trim() || '',
      frequency: it.frequency?.trim() || '',
      duration: it.duration?.trim() || '',
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
      unit_cost: Math.max(0, Math.round(Number(it.unit_cost) || 0)),
      form: it.form || 'oral',
    }))

    onSubmit(payloadItems)
  }

  // A row is only sendable when it is linked to a real stock item AND priced.
  // drug_id carries the medication name, so no separate name check is needed.
  const validItems = items.filter((it) =>
    it.drug_id && Number(it.unit_cost) >= 1 && Number(it.quantity) >= 1
  )
  const totalCost = validItems.reduce((s, it) => s + Number(it.unit_cost) * Number(it.quantity), 0)

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {validItems.length} medication{validItems.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(totalCost)}</span>
      </div>
      <button
        onClick={handleModalSubmit}
        disabled={loading || validItems.length === 0}
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
      subtitle="Select medications from pharmacy stock and enter the unit price for each"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">

        {items.map((it, i) => {
          return (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Medication #{i + 1}
                </span>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1">
                    <Icon name="trash" size={12} /> Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Drug search */}
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Medication *</label>
                  <DrugSearchInput
                    value={it.medication}
                    drugs={drugs}
                    loading={drugsLoading}
                    error={drugsError}
                    onChange={(v) => updateItem(i, 'medication', v)}
                    onSelect={(drug) => selectDrug(i, drug)}
                  />
                  {it.medication.trim() && !it.drug_id && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                      Select a medication from the list — only drugs in pharmacy stock can be prescribed
                    </p>
                  )}
                  {it.drug_id && (
                    <p className="text-[10px] text-gray-400 mt-1">{it._stock} in stock</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Dosage</label>
                  <input type="text" value={it.dosage ?? ''} onChange={(e) => updateItem(i, 'dosage', e.target.value)} placeholder="e.g. 500mg" className={inputCls} maxLength={20} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Frequency</label>
                  <input type="text" value={it.frequency ?? ''} onChange={(e) => updateItem(i, 'frequency', e.target.value)} placeholder="e.g. 3x daily" className={inputCls} maxLength={20} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Duration</label>
                  <input type="text" value={it.duration ?? ''} onChange={(e) => updateItem(i, 'duration', e.target.value)} placeholder="e.g. 7 days" className={inputCls} maxLength={20} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={it._stock ?? undefined}
                    value={it.quantity ?? ''}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Unit Cost (KSh) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={it.unit_cost ?? ''}
                    onChange={(e) => updateItem(i, 'unit_cost', e.target.value)}
                    placeholder="Enter price e.g. 250"
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
              </div>
            </div>
          )
        })}

        <button
          type="button"
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

function DrugSearchInput({ value, drugs, loading, error, onChange, onSelect }) {
  const [focused, setFocused] = useState(false)

  // Out-of-stock drugs are hidden — a zero-stock pick would clamp quantity to 0
  // and leave a row that can never be sent.
  const inStock = drugs.filter((d) => (d.current_stock ?? 0) > 0)

  // Guards: name/generic_name can be undefined if an API row is malformed —
  // .toLowerCase() on undefined would CRASH the modal, not just warn.
  const query = (value || '').trim().toLowerCase()
  const filtered = (query
    ? inStock.filter((d) =>
      (d.name || '').toLowerCase().includes(query) ||
      (d.generic_name || '').toLowerCase().includes(query)
    )
    : inStock
  ).slice(0, 8)

  return (
    <div className="relative">
      <input
        type="text"
        value={value ?? ''}
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
                    {d.generic_name || '—'} · {cap(d.category || 'uncategorised')} · {d.form || ''} {d.strength || ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-medium tabular-nums ${d.current_stock < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                    {d.current_stock} left
                  </span>
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                    {formatMoney(d.unit_price ?? d.normal_price ?? 0)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {focused && filtered.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg px-3 py-2">
          <p className={`text-[11px] ${error ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
            {error
              ? `Could not load pharmacy stock. ${error.message}`
              : loading
                ? 'Loading pharmacy stock…'
                : query
                  ? 'No matching drug in pharmacy stock.'
                  : 'No medications in stock.'}
          </p>
        </div>
      )}
    </div>
  )
}

