'use client'

// ConsultationTab — unified clinical workspace with integrated observation/admission
// No separate admissions page. Observation is a mode of the consultation visit.
//
// FLOW:
//   1. Normal visit → doctor sees [Start Observation] + [End Consultation]
//   2. Doctor clicks Start Observation → admission created, banner appears
//   3. Doctor continues clinical work (same page, same forms)
//   4. Doctor clicks Discharge → admission.status = 'discharged'
//   5. Doctor clicks End Consultation → visit.status = 'billing'
//
// MOCK DATA: toggle MOCK_MODE = true to preview without endpoints.
// Remove MOCK_MODE and the mockData object once APIs are ready.

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, InlineLoader, Spinner, Icon,
  formatMoney, formatTime, formatDate, formatDateTime, timeAgo, badgeClass, cap,
} from '@/utils/helpers'
import { DIAGNOSIS_CATALOG, DIAGNOSIS_CATEGORIES } from '@/lib/diagnosis_catalog'

// ═════════════════════════════════════════════════════════════════════════════
// MOCK DATA — remove this entire block once endpoints exist
// ═════════════════════════════════════════════════════════════════════════════

const MOCK_MODE = true

const MOCK_VISIT = {
  id: 4821,
  patient_name: 'John Doe',
  patient_age: 35,
  patient_gender: 'male',
  blood_group: 'O+',
  allergies: 'Penicillin, Sulfa',
  chief_complaint: 'Severe abdominal pain and vomiting since last night',
  status: 'with_doctor',
  visit_type: 'consultation',
  arrived_at: '2026-07-31T10:00:00+03:00',
  from_pharmacy: false,

  // Latest vitals (synced into form on load)
  temperature: 37.8,
  bp_systolic: 128,
  bp_diastolic: 82,
  pulse: 88,
  respiratory_rate: 18,
  weight: 72,
  height: 175,
  spo2: 97,
  vitals_notes: 'Patient in mild distress, guarding abdomen on palpation',

  // SOAP
  subjective: 'Patient reports sharp abdominal pain starting last night after dinner. Associated with 3 episodes of vomiting. No fever reported initially.',
  objective: 'Alert, oriented. Abdomen tender in RLQ. Bowel sounds present. No rebound tenderness noted. Temp 37.8°C.',
  assessment: 'Acute appendicitis vs gastroenteritis. Awaiting FBC and urinalysis results.',
  plan: 'NPO status, IV fluids, analgesia. Surgical review if WBC elevated. Admit for observation.',

  // Diagnosis
  diagnosis: 'Acute Appendicitis',
  diagnosis_code: 'K35',

  // Bill preview (computed from fees)
  consultation_fee: 500,
  lab_fee: 1300,
  medication_fee: 850,
  procedure_fee: 0,
  bill_total: 2650,

  // ═══ ADMISSION / OBSERVATION ═══
  // Toggle this object to see different states:
  //   null                = normal visit (no observation)
  //   status: 'admitted'  = currently under observation
  //   status: 'discharged'= observation ended, ready for billing
  admission: {
    id: 101,
    status: 'admitted', // <-- try 'admitted' | 'discharged' | test with null
    admission_type: 'observation',
    reason: 'Post-procedure monitoring and pain management',
    deposit: 1000,
    expected_discharge: '2026-07-31T18:00:00+03:00',
    admitted_at: '2026-07-31T12:30:00+03:00',
    discharged_at: null,
    days_admitted: null,
    discharge_notes: null,
  },

  // Vitals history (for display only)
  vitals_history: [
    { id: 1, recorded_at: '2026-07-31T12:30:00+03:00', temperature: 37.8, bp_systolic: 128, bp_diastolic: 82, pulse: 88, respiratory_rate: 18, spo2: 97, weight: 72, recorded_by: 'Dr. Kimani' },
    { id: 2, recorded_at: '2026-07-31T14:00:00+03:00', temperature: 37.4, bp_systolic: 124, bp_diastolic: 78, pulse: 82, respiratory_rate: 16, spo2: 98, weight: null, recorded_by: 'Dr. Kimani' },
  ],

  // Lab requests
  lab_requests: [
    {
      id: 201,
      urgency: 'urgent',
      ordered_by: 'Dr. Kimani',
      ordered_at: '2026-07-31T12:45:00+03:00',
      status: 'ready',
      items: [
        { id: 301, test_name: 'Full Blood Count', category: 'hematology', status: 'ready', result: 'WBC 12.4, Hb 14.2, Plt 280', flagged: true, reference_range: 'WBC 4-11 x10⁹/L', completed_at: '2026-07-31T13:30:00+03:00', result_notes: 'Leukocytosis — correlate clinically' },
        { id: 302, test_name: 'Urinalysis', category: 'urinalysis', status: 'ready', result: 'Normal', flagged: false, reference_range: 'Negative', completed_at: '2026-07-31T13:45:00+03:00' },
      ]
    }
  ],

  // Prescriptions
  prescriptions: [
    {
      id: 401,
      prescribed_at: '2026-07-31T13:00:00+03:00',
      prescribed_by: 'Dr. Kimani',
      status: 'pending',
      items: [
        { id: 501, medication: 'Paracetamol', dosage: '1g', frequency: 'TID', duration: '3 days', quantity: 9, unit_cost: 15, form: 'tablet', status: 'pending' },
        { id: 502, medication: 'Ceftriaxone', dosage: '1g', frequency: 'BD', duration: '2 days', quantity: 4, unit_cost: 500, form: 'injection', status: 'pending' },
        { id: 503, medication: 'Metronidazole', dosage: '400mg', frequency: 'TID', duration: '3 days', quantity: 9, unit_cost: 12, form: 'tablet', status: 'pending' },
      ]
    }
  ],

  // Procedure / service
  procedure_name: null,
  procedure_type: null,
  procedure_notes: null,
  procedure_done_by: null,
  procedure_fee: 0,
}

const mockDelay = (ms = 600) => new Promise((r) => setTimeout(r, ms))

// ═════════════════════════════════════════════════════════════════════════════
// END MOCK DATA
// ═════════════════════════════════════════════════════════════════════════════

// ─── Shared constants ───────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const EMPTY_VITALS = {
  temperature: '', bp_systolic: '', bp_diastolic: '', pulse: '',
  respiratory_rate: '', weight: '', height: '', spo2: '', vitals_notes: '',
}

const EMPTY_SOAP = { subjective: '', objective: '', assessment: '', plan: '' }

const ADMISSION_TYPES = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'elective', label: 'Elective' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'observation', label: 'Observation' },
]

// ─── Medication schedule helper (pure frontend, read-only) ──────────────────

const FREQUENCY_SLOTS = {
  OD: ['08:00'],
  BD: ['08:00', '20:00'],
  TID: ['08:00', '14:00', '20:00'],
  QID: ['08:00', '12:00', '16:00', '20:00'],
  STAT: ['Once — immediately'],
  PRN: ['As needed'],
  Q12H: ['08:00', '20:00'],
  Q8H: ['06:00', '14:00', '22:00'],
  Q6H: ['06:00', '12:00', '18:00', '00:00'],
  Q4H: ['06:00', '10:00', '14:00', '18:00', '22:00', '02:00'],
}

function parseDuration(durationStr) {
  if (!durationStr) return 1
  const match = String(durationStr).match(/(\d+)/)
  return match ? parseInt(match[1]) : 1
}

function MedicationSchedule({ frequency, duration, prescribedAt }) {
  const slots = FREQUENCY_SLOTS[frequency?.toUpperCase()] || null
  const days = parseDuration(duration)
  const start = prescribedAt ? new Date(prescribedAt) : new Date()

  if (!slots || slots.length === 0) {
    return <p className="text-[10px] text-gray-400 italic mt-1">No schedule for &quot;{frequency}&quot;</p>
  }

  const dayLabels = []
  for (let d = 0; d < days; d++) {
    const date = new Date(start)
    date.setDate(date.getDate() + d)
    const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : formatDate(date)
    dayLabels.push(label)
  }

  return (
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/40 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
        Schedule · {frequency} · {days} day{days > 1 ? 's' : ''}
      </p>
      <div className="space-y-1">
        {dayLabels.map((label, di) => (
          <div key={di} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 w-14 shrink-0">{label}</span>
            <div className="flex items-center gap-1 flex-wrap">
              {slots.map((slot, si) => (
                <span key={si} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                  {slot}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Vital status helper ────────────────────────────────────────────────────

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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ConsultationTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [visitId] = useState(MOCK_MODE ? String(MOCK_VISIT.id) : null)

  // Form states
  const [vitals, setVitals] = useState(EMPTY_VITALS)
  const [soap, setSoap] = useState(EMPTY_SOAP)
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [openSoap, setOpenSoap] = useState({ subjective: true, objective: false, assessment: false, plan: false })

  // Modal states
  const [showLabModal, setShowLabModal] = useState(false)
  const [showRxModal, setShowRxModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showProcedureModal, setShowProcedureModal] = useState(false)
  const [showStartObsModal, setShowStartObsModal] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const visitQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId],
    queryFn: async () => {
      if (MOCK_MODE) { await mockDelay(400); return { locked: false, visit: MOCK_VISIT } }
      return api.get(`/api/doctor/visits/${visitId}`)
    },
    enabled: !!visitId,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const labsQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'labs'],
    queryFn: async () => {
      if (MOCK_MODE) { await mockDelay(300); return { requests: MOCK_VISIT.lab_requests } }
      return api.get(`/api/doctor/visits/${visitId}/labs`)
    },
    enabled: !!visitId,
  })

  const rxQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'prescriptions'],
    queryFn: async () => {
      if (MOCK_MODE) { await mockDelay(300); return { prescriptions: MOCK_VISIT.prescriptions } }
      return api.get(`/api/doctor/visits/${visitId}/prescriptions`)
    },
    enabled: !!visitId,
  })

  const visit = visitQuery.data?.visit
  const locked = visitQuery.data?.locked === true
  const labRequests = labsQuery.data?.requests || []
  const prescriptions = rxQuery.data?.prescriptions || []
  const admission = visit?.admission || null

  // Sync form state
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

  // ── Mutations ─────────────────────────────────────────────────────────────

  const patchMutation = useMutation({
    mutationFn: async (body) => {
      if (MOCK_MODE) { await mockDelay(500); Object.assign(MOCK_VISIT, body); return { visit: MOCK_VISIT } }
      return api.patch(`/api/doctor/visits/${visitId}`, body)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] }),
  })

  const startObsMutation = useMutation({
    mutationFn: async (body) => {
      if (MOCK_MODE) {
        await mockDelay(600)
        MOCK_VISIT.admission = {
          id: 999, status: 'admitted', admission_type: body.admission_type || 'observation',
          reason: body.reason, deposit: Number(body.deposit) || 0,
          expected_discharge: body.expected_discharge || null,
          admitted_at: new Date().toISOString(), discharged_at: null, days_admitted: null, discharge_notes: null,
        }
        return { admission: MOCK_VISIT.admission }
      }
      return api.post('/api/admissions', { ...body, visit_id: Number(visitId) })
    },
    onSuccess: () => { toast.success('Observation started'); setShowStartObsModal(false); queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] }) },
    onError: (e) => toast.error(e.message || 'Could not start observation'),
  })

  const dischargeMutation = useMutation({
    mutationFn: async (body) => {
      if (MOCK_MODE) {
        await mockDelay(600)
        const adm = MOCK_VISIT.admission
        adm.status = 'discharged'
        adm.discharged_at = new Date().toISOString()
        adm.days_admitted = 1
        adm.discharge_notes = body.discharge_notes || ''
        MOCK_VISIT.procedure_fee = (MOCK_VISIT.procedure_fee || 0) + 500
        MOCK_VISIT.bill_total = (MOCK_VISIT.bill_total || 0) + 500
        return { admission: adm }
      }
      return api.patch(`/api/admissions/${admission.id}/discharge`, body)
    },
    onSuccess: () => { toast.success('Patient discharged'); setShowDischargeModal(false); queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] }) },
    onError: (e) => toast.error(e.message || 'Could not discharge'),
  })

  const labMutation = useMutation({
    mutationFn: (body) => MOCK_MODE ? mockDelay(400).then(() => ({ ok: true })) : api.post(`/api/doctor/visits/${visitId}/labs`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] }),
  })

  const rxMutation = useMutation({
    mutationFn: (body) => MOCK_MODE ? mockDelay(400).then(() => ({ ok: true })) : api.post(`/api/doctor/visits/${visitId}/prescriptions`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] }),
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveVitals = async () => {
    try { await patchMutation.mutateAsync({ ...vitals }); toast.success('Vitals saved') }
    catch (err) { toast.error(err.message || 'Could not save vitals') }
  }

  const handleSaveSoap = async () => {
    try { await patchMutation.mutateAsync({ ...soap }); toast.success('SOAP notes saved') }
    catch (err) { toast.error(err.message || 'Could not save notes') }
  }

  const handleSaveDiagnosis = async () => {
    try { await patchMutation.mutateAsync({ diagnosis, diagnosis_code: diagnosisCode }); toast.success('Diagnosis saved') }
    catch (err) { toast.error(err.message || 'Could not save diagnosis') }
  }

  const handleEndConsultation = async () => {
    if (endBlockReason) { toast.error(endBlockReason); return }
    try {
      await patchMutation.mutateAsync({ status: 'billing', from_pharmacy: false, diagnosis, diagnosis_code: diagnosisCode, ...soap })
      toast.success('Consultation ended — sent to billing')
    } catch (err) { toast.error(err.message || 'Could not end consultation') }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const pendingLabsCount = labRequests.reduce((n, r) => n + r.items.filter((it) => it.status === 'pending' || it.status === 'in_progress').length, 0)
  const pendingRxCount = prescriptions.reduce((n, p) => n + p.items.filter((it) => it.status === 'pending').length, 0)
  const readyLabsCount = labRequests.reduce((n, r) => { if (r.status !== 'ready') return n; return n + r.items.filter((it) => it.status === 'ready' && it.result).length }, 0)
  const hasReadyLabs = readyLabsCount > 0
  const isAdmitted = admission?.status === 'admitted'
  const isDischarged = admission?.status === 'discharged'

  let endBlockReason = null
  if (isAdmitted && !isDischarged) {
    endBlockReason = 'Patient is under observation. Discharge before ending consultation.'
  } else if (pendingLabsCount > 0) {
    endBlockReason = `${pendingLabsCount} lab test${pendingLabsCount > 1 ? 's are' : ' is'} still pending.`
  } else if (pendingRxCount > 0) {
    endBlockReason = `${pendingRxCount} medication${pendingRxCount > 1 ? 's are' : ' is'} pending at pharmacy.`
  }

  const reportHasContent = !!(visit?.diagnosis?.trim() || visit?.subjective || readyLabsCount > 0 || prescriptions.some((p) => (p.items || []).length > 0))

  // ── Render guards ─────────────────────────────────────────────────────────

  if (!visitId) return <EmptyState icon="stethoscope" title="No patient selected" description="Pick a patient from the queue." />
  if (visitQuery.isLoading) return <InlineLoader label="Loading patient chart…" />
  if (visitQuery.error) return <ErrorState message={visitQuery.error.message} onRetry={visitQuery.refetch} />
  if (!visit) return <EmptyState icon="alert" title="Visit not found" />
  if (locked) return <LockedState visit={visit} />

  // ── Main Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PatientBanner visit={visit} />

      {isAdmitted && !isDischarged && <ObservationBanner admission={admission} onDischarge={() => setShowDischargeModal(true)} />}
      {isDischarged && <DischargedBanner admission={admission} />}

      {hasReadyLabs && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center justify-center shrink-0"><Icon name="checkCircle" size={18} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">Lab results ready</p>
            <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">{readyLabsCount} test{readyLabsCount > 1 ? 's' : ''} completed.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <SoapCard soap={soap} setSoap={setSoap} openSoap={openSoap} setOpenSoap={setOpenSoap} onSave={handleSaveSoap} saving={patchMutation.isPending} />
          <LabCard requests={labRequests} loading={labsQuery.isLoading} onOrder={() => setShowLabModal(true)} />
          <DiagnosisCard diagnosis={diagnosis} setDiagnosis={setDiagnosis} diagnosisCode={diagnosisCode} setDiagnosisCode={setDiagnosisCode} onSave={handleSaveDiagnosis} saving={patchMutation.isPending} />
          <PrescriptionsCard prescriptions={prescriptions} loading={rxQuery.isLoading} onAdd={() => setShowRxModal(true)} />
          <ProceduresCard visit={visit} onAdd={() => setShowProcedureModal(true)} />
        </div>

        <div className="space-y-4">
          <VitalsCard vitals={vitals} setVitals={setVitals} history={visit.vitals_history || []} onSave={handleSaveVitals} saving={patchMutation.isPending} />
          <ActionCard
            isAdmitted={isAdmitted} isDischarged={isDischarged} endBlockReason={endBlockReason}
            onEndConsultation={handleEndConsultation} onStartObservation={() => setShowStartObsModal(true)}
            onPrintReport={() => setShowReportModal(true)} reportHasContent={reportHasContent} ending={patchMutation.isPending}
          />
        </div>
      </div>

      {showStartObsModal && <StartObservationModal onClose={() => setShowStartObsModal(false)} onSubmit={(d) => startObsMutation.mutate(d)} loading={startObsMutation.isPending} patientName={visit.patient_name} />}
      {showDischargeModal && <DischargeModal onClose={() => setShowDischargeModal(false)} onSubmit={(d) => dischargeMutation.mutate(d)} loading={dischargeMutation.isPending} admission={admission} />}
      {showLabModal && <LabOrderModal onClose={() => setShowLabModal(false)} onSubmit={(ids, urgency) => { labMutation.mutate({ test_ids: ids, urgency }); setShowLabModal(false) }} loading={labMutation.isPending} />}
      {showRxModal && <PrescriptionModal onClose={() => setShowRxModal(false)} onSubmit={(items) => { rxMutation.mutate({ items }); setShowRxModal(false) }} loading={rxMutation.isPending} allergies={visit.allergies} />}
      {showReportModal && <ReportModal visit={visit} onClose={() => setShowReportModal(false)} />}
      {showProcedureModal && <ProcedureModal onClose={() => setShowProcedureModal(false)} onConfirm={(type, id, notes, price) => { console.log('procedure', type, id, notes, price); setShowProcedureModal(false) }} />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════════

function PatientBanner({ visit }) {
  const isAdmitted = visit.admission?.status === 'admitted'
  const isDischarged = visit.admission?.status === 'discharged'
  return (
    <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
          <span className="text-[15px] font-semibold text-white">{visit.patient_name?.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{visit.patient_name}</h2>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{visit.patient_age}y · {cap(visit.patient_gender)}</Badge>
            <Badge className={badgeClass(visit.status)}>{cap(visit.status)}</Badge>
            {isAdmitted && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Icon name="clock" size={10} /> Under Observation</Badge>}
            {isDischarged && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400"><Icon name="archive" size={10} /> Discharged</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
            <span>Visit #{visit.id}</span><span>·</span><span>Arrived {timeAgo(visit.arrived_at)}</span>
            {visit.blood_group && <><span>·</span><span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium"><Icon name="droplet" size={11} /> {visit.blood_group}</span></>}
          </div>
          {visit.chief_complaint && (
            <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Chief Complaint</p>
              <p className="text-[12px] text-gray-700 dark:text-gray-200 mt-0.5">{visit.chief_complaint}</p>
            </div>
          )}
          {visit.allergies && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-2">
              <Icon name="alert" size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-700 dark:text-red-400"><span className="font-semibold">Allergy:</span> {visit.allergies}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ObservationBanner({ admission, onDischarge }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 flex items-center justify-center shrink-0"><Icon name="clock" size={18} /></div>
        <div>
          <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-400">Patient Under Observation</p>
          <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 mt-0.5">
            Admitted {timeAgo(admission.admitted_at)}
            {admission.deposit > 0 && <> · Deposit {formatMoney(admission.deposit)}</>}
            {admission.expected_discharge && <> · Expected {formatDateTime(admission.expected_discharge)}</>}
          </p>
          <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 mt-0.5">Reason: {admission.reason}</p>
        </div>
      </div>
      <button onClick={onDischarge} className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5">
        <Icon name="archive" size={12} /> Discharge
      </button>
    </div>
  )
}

function DischargedBanner({ admission }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/40 px-4 py-3">
      <Icon name="archive" size={14} className="text-gray-500" />
      <p className="text-[12px] text-gray-600 dark:text-gray-400">
        <span className="font-semibold">Discharged</span> from observation {timeAgo(admission.discharged_at)}
        {admission.days_admitted ? <> after {admission.days_admitted} day{admission.days_admitted > 1 ? 's' : ''}</> : null}.
        End consultation to send to billing.
      </p>
    </div>
  )
}

function LockedState({ visit }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center mx-auto mb-3"><Icon name="lock" size={22} /></div>
      <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Patient is no longer in consultation</h2>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">{visit.patient_name} has moved to <span className="font-semibold">{cap(visit.status)}</span>.</p>
    </div>
  )
}

function SoapCard({ soap, setSoap, openSoap, setOpenSoap, onSave, saving }) {
  const sections = [
    { key: 'subjective', letter: 'S', label: 'Subjective', hint: 'Patient-reported' },
    { key: 'objective', letter: 'O', label: 'Objective', hint: 'Exam findings' },
    { key: 'assessment', letter: 'A', label: 'Assessment', hint: 'Working diagnosis' },
    { key: 'plan', letter: 'P', label: 'Plan', hint: 'Treatment plan' },
  ]
  return (
    <Card className="overflow-hidden">
      <CardHeader title="SOAP Notes" subtitle="Subjective · Objective · Assessment · Plan"
        action={<button onClick={onSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50">{saving ? <Icon name="refresh" size={13} className="animate-spin" /> : <Icon name="save" size={13} />} Save</button>} />
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {sections.map((s) => (
          <div key={s.key}>
            <button onClick={() => setOpenSoap({ ...openSoap, [s.key]: !openSoap[s.key] })} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
              <span className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-[12px] font-bold shrink-0">{s.letter}</span>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{s.label}</p>
                <p className="text-[11px] text-gray-400">{s.hint}</p>
              </div>
              <Icon name={openSoap[s.key] ? 'chevronDown' : 'chevronRight'} size={16} className="text-gray-400 shrink-0" />
            </button>
            {openSoap[s.key] && (
              <div className="px-4 pb-4">
                <textarea value={soap[s.key] ?? ''} onChange={(e) => setSoap({ ...soap, [s.key]: e.target.value })} rows={3} placeholder={`Enter ${s.label.toLowerCase()}...`} className={`${inputCls} resize-none`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function LabCard({ requests, loading, onOrder }) {
  const pending = requests.reduce((n, r) => n + r.items.filter((it) => it.status === 'pending' || it.status === 'in_progress').length, 0)
  const ready = requests.reduce((n, r) => { if (r.status !== 'ready') return n; return n + r.items.filter((it) => it.status === 'ready' && it.result).length }, 0)
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Lab Orders" subtitle={pending > 0 ? `${pending} pending` : ready > 0 ? `${ready} result(s) ready` : 'No lab tests ordered'}
        action={<button onClick={onOrder} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] flex items-center gap-1.5"><Icon name="flask" size={13} /> Order Labs</button>} />
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {loading ? <InlineLoader label="Loading labs…" /> : requests.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-gray-400">No lab tests ordered yet</div>
        ) : requests.map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><Badge className={badgeClass(r.urgency)}>{cap(r.urgency)}</Badge><span className="text-[11px] text-gray-400">{r.ordered_by} · {timeAgo(r.ordered_at)}</span></div>
              <Badge className={badgeClass(r.status)}>{cap(r.status)}</Badge>
            </div>
            <div className="space-y-2">
              {r.items.map((it) => (
                <div key={it.id} className={`rounded-lg border px-3 py-2 ${it.status === 'ready' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-700/20'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{it.test_name}</p>
                      {it.flagged && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[9px]">Abnormal</Badge>}
                    </div>
                    <Badge className={badgeClass(it.status)}>{cap(it.status)}</Badge>
                  </div>
                  {it.result && (
                    <div className="mt-1.5 text-[12px]">
                      <span className="text-gray-500 dark:text-gray-400">Result: </span>
                      <span className={it.flagged ? 'font-bold text-red-600 dark:text-red-400' : 'font-medium text-emerald-600 dark:text-emerald-400'}>{it.result}</span>
                      {it.reference_range && <span className="text-gray-400 ml-2">(Ref: {it.reference_range})</span>}
                    </div>
                  )}
                  {it.result_notes && <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">{it.result_notes}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function DiagnosisCard({ diagnosis, setDiagnosis, diagnosisCode, setDiagnosisCode, onSave, saving }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Diagnosis</h3>
        <button onClick={onSave} disabled={saving || !diagnosis.trim()} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50">{saving ? <Icon name="refresh" size={13} className="animate-spin" /> : <Icon name="save" size={13} />} Save</button>
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Diagnosis {diagnosisCode && <span className="text-[#1a6cbf]">· {diagnosisCode}</span>}</label>
        <DiagnosisSearchSelect code={diagnosisCode} text={diagnosis} onSelect={(code, label) => { setDiagnosisCode(code); setDiagnosis(label) }} />
      </div>
    </Card>
  )
}

function DiagnosisSearchSelect({ code, text, onSelect }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selectedItem = code ? DIAGNOSIS_CATALOG.find((d) => d.code === code) : null
  const q = search.trim().toLowerCase()
  const filtered = q ? DIAGNOSIS_CATALOG.filter((d) => d.label.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)).slice(0, 15) : []

  if ((selectedItem || (text && !code)) && !open) {
    return (
      <div className={`${inputCls} flex items-center justify-between`}>
        <span className="flex items-center gap-2 min-w-0">
          {selectedItem ? <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-[#1a6cbf] text-[10px] font-bold shrink-0">{selectedItem.code}</span> : <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/40 text-gray-500 text-[10px] font-bold shrink-0">free text</span>}
          <span className="truncate">{selectedItem ? selectedItem.label : text}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => { setOpen(true); setSearch('') }} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-[#1a6cbf]"><Icon name="edit" size={12} /></button>
          <button type="button" onClick={() => onSelect('', '')} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500"><Icon name="x" size={12} /></button>
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search diagnoses…" className={`${inputCls} pl-9`} />
      </div>
      {open && q && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 shadow-lg">
          {filtered.map((d) => (
            <button key={d.code} type="button" onMouseDown={(e) => { e.preventDefault(); onSelect(d.code, d.label); setSearch(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-b border-gray-100 dark:border-gray-700/40 transition-colors">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-[#1a6cbf] text-[10px] font-bold shrink-0">{d.code}</span>
                <span className="text-[12px] text-gray-700 dark:text-gray-300">{d.label}</span>
              </div>
            </button>
          ))}
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onSelect('', search.trim()); setSearch(''); setOpen(false) }}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
            <span className="text-[11px] text-gray-500">Use &quot;<span className="font-semibold text-gray-700">{search.trim()}</span>&quot; as free-text</span>
          </button>
        </div>
      )}
    </div>
  )
}

function PrescriptionsCard({ prescriptions, loading, onAdd }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Prescriptions" subtitle={prescriptions.length > 0 ? `${prescriptions.reduce((n, p) => n + (p.items || []).length, 0)} item(s)` : 'No prescriptions'}
        action={<button onClick={onAdd} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] flex items-center gap-1.5"><Icon name="pill" size={13} /> Prescribe</button>} />
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {loading ? <InlineLoader label="Loading prescriptions…" /> : prescriptions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-gray-400">No prescriptions yet</div>
        ) : prescriptions.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-gray-400">{p.prescribed_by} · {timeAgo(p.prescribed_at)}</span>
              <Badge className={badgeClass(p.status)}>{cap(p.status)}</Badge>
            </div>
            <div className="space-y-3">
              {p.items.map((it) => (
                <div key={it.id} className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{it.medication}</p>
                        {it.form === 'injection' && <Badge className="bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 text-[9px]"><Icon name="syringe" size={8} /> Injection</Badge>}
                        <Badge className={badgeClass(it.status)}>{cap(it.status)}</Badge>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}</p>
                    </div>
                    <span className="text-[12px] font-semibold tabular-nums text-gray-700 dark:text-gray-300">{formatMoney(it.unit_cost * it.quantity)}</span>
                  </div>
                  <MedicationSchedule frequency={it.frequency} duration={it.duration} prescribedAt={p.prescribed_at} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ProceduresCard({ visit, onAdd }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Services & Procedures" subtitle={visit.procedure_fee > 0 ? `${visit.procedure_name} — ${formatMoney(visit.procedure_fee)}` : 'No procedure added'}
        action={<button onClick={onAdd} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] flex items-center gap-1.5"><Icon name="stethoscope" size={13} /> Add Procedure</button>} />
      <div className="p-4">
        {visit.procedure_fee > 0 ? (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">{visit.procedure_name}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">{cap(visit.procedure_type || 'procedure')} · {visit.procedure_done_by || 'Doctor'}</p>
              </div>
              <span className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatMoney(visit.procedure_fee)}</span>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 text-center py-3">No procedure added. Click &quot;Add Procedure&quot; if one was performed.</p>
        )}
      </div>
    </Card>
  )
}

function VitalsCard({ vitals, setVitals, history, onSave, saving }) {
  const fields = [
    { key: 'temperature', label: 'Temp (°C)', icon: 'thermometer', placeholder: '36.5', hint: '>37.5' },
    { key: 'pulse', label: 'Pulse (bpm)', icon: 'heart', placeholder: '72', hint: '<60 or >100' },
    { key: 'bp_systolic', label: 'BP Sys', icon: 'activity', placeholder: '120', hint: '>140' },
    { key: 'bp_diastolic', label: 'BP Dia', icon: 'activity', placeholder: '80', hint: '>90' },
    { key: 'respiratory_rate', label: 'RR', icon: 'activity', placeholder: '16', hint: '<12 or >20' },
    { key: 'spo2', label: 'SpO₂ (%)', icon: 'droplet', placeholder: '98', hint: '<95' },
    { key: 'weight', label: 'Weight (kg)', icon: 'barChart', placeholder: '65' },
    { key: 'height', label: 'Height (cm)', icon: 'barChart', placeholder: '170' },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Vital Signs" subtitle={history.length > 0 ? `${history.length} previous reading(s)` : 'Color-coded: red = abnormal'}
        action={<button onClick={onSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5 disabled:opacity-50">{saving ? <Icon name="refresh" size={13} className="animate-spin" /> : <Icon name="save" size={13} />} Save</button>} />
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <VitalsField key={f.key} label={f.label} icon={f.icon} value={vitals[f.key]} onChange={(v) => setVitals({ ...vitals, [f.key]: v })} placeholder={f.placeholder} status={vitalStatus(f.key, vitals[f.key])} abnormalHint={f.hint} />
          ))}
        </div>
        {vitals.weight && vitals.height && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#1a6cbf] dark:text-blue-400 uppercase tracking-widest">BMI</span>
            <span className="text-[13px] font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">{(parseFloat(vitals.weight) / Math.pow(parseFloat(vitals.height) / 100, 2)).toFixed(1)}</span>
          </div>
        )}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Vitals Notes</label>
          <textarea value={vitals.vitals_notes ?? ''} onChange={(e) => setVitals({ ...vitals, vitals_notes: e.target.value })} rows={2} placeholder="e.g. Patient appears in mild distress" className={`${inputCls} resize-none`} />
        </div>

        {/* Vitals history table */}
        {history.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">History</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="px-2 py-1.5 font-semibold">Time</th>
                    <th className="px-2 py-1.5 font-semibold">T</th>
                    <th className="px-2 py-1.5 font-semibold">BP</th>
                    <th className="px-2 py-1.5 font-semibold">P</th>
                    <th className="px-2 py-1.5 font-semibold">SpO₂</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {history.map((h) => (
                    <tr key={h.id} className="text-gray-700 dark:text-gray-300">
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatTime(h.recorded_at)}</td>
                      <td className="px-2 py-1.5">{h.temperature ?? '—'}</td>
                      <td className="px-2 py-1.5">{h.bp_systolic ? `${h.bp_systolic}/${h.bp_diastolic}` : '—'}</td>
                      <td className="px-2 py-1.5">{h.pulse ?? '—'}</td>
                      <td className="px-2 py-1.5">{h.spo2 ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function VitalsField({ label, icon, value, onChange, placeholder, status, abnormalHint }) {
  const borderColor = status === 'abnormal' ? 'border-red-300 dark:border-red-900/60 focus:border-red-500 focus:ring-red-500/30' : status === 'normal' ? 'border-emerald-300 dark:border-emerald-900/60 focus:border-emerald-500 focus:ring-emerald-500/30' : ''
  const valueColor = status === 'abnormal' ? 'text-red-600 dark:text-red-400 font-semibold' : status === 'normal' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-900 dark:text-gray-100'
  return (
    <div>
      <label className="flex items-center justify-between text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        <span className="flex items-center gap-1">{icon && <Icon name={icon} size={11} />}{label}</span>
        {status === 'abnormal' && abnormalHint && <span className="text-[9px] text-red-500 dark:text-red-400 font-medium normal-case">abnormal {abnormalHint}</span>}
      </label>
      <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} ${borderColor} ${valueColor} tabular-nums`} />
    </div>
  )
}

function ActionCard({ isAdmitted, isDischarged, endBlockReason, onEndConsultation, onStartObservation, onPrintReport, reportHasContent, ending }) {
  return (
    <Card className="p-4 space-y-3">
      {/* Observation actions */}
      {!isAdmitted && !isDischarged && (
        <button onClick={onStartObservation} className="w-full px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center justify-center gap-2">
          <Icon name="clock" size={14} /> Start Observation
        </button>
      )}

      {isAdmitted && !isDischarged && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 text-center">
          <p className="text-[12px] text-amber-700 dark:text-amber-400 font-medium">Observation in progress</p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400/70 mt-0.5">Discharge patient to enable billing</p>
        </div>
      )}

      {isDischarged && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-center">
          <p className="text-[12px] text-emerald-700 dark:text-emerald-400 font-medium">Patient discharged</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400/70 mt-0.5">Ready for billing</p>
        </div>
      )}

      {/* End consultation */}
      <div>
        <p className={`text-[11px] mb-2 ${endBlockReason ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
          {endBlockReason || 'All services complete — send to billing'}
        </p>
        <button onClick={onEndConsultation} disabled={ending || !!endBlockReason} title={endBlockReason || undefined}
          className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          {ending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
          End Consultation
        </button>
      </div>

      {/* Print report */}
      <button onClick={onPrintReport} disabled={!reportHasContent}
        className="w-full px-4 py-2 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] flex items-center justify-center gap-1.5 disabled:opacity-50">
        <Icon name="printer" size={13} /> Print Medical Report
      </button>
    </Card>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Modals
// ═════════════════════════════════════════════════════════════════════════════

function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-2xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className={`relative w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><Icon name="x" size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function StartObservationModal({ onClose, onSubmit, loading, patientName }) {
  const [type, setType] = useState('observation')
  const [reason, setReason] = useState('')
  const [deposit, setDeposit] = useState('')
  const [expectedDischarge, setExpectedDischarge] = useState('')

  const handleSubmit = () => {
    if (!reason.trim()) { toast.error('Reason is required'); return }
    onSubmit({ admission_type: type, reason: reason.trim(), deposit: Number(deposit) || 0, expected_discharge: expectedDischarge || null })
  }

  return (
    <ModalShell title="Start Observation" subtitle={patientName} onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 disabled:opacity-50">{loading ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="check" size={12} />} Start Observation</button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Admission Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {ADMISSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Reason for Observation *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Post-procedure monitoring" className={`${inputCls} resize-none`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Deposit (KSh)</label>
            <input type="number" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Expected Discharge</label>
            <input type="datetime-local" value={expectedDischarge} onChange={(e) => setExpectedDischarge(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function DischargeModal({ onClose, onSubmit, loading, admission }) {
  const [notes, setNotes] = useState('')

  return (
    <ModalShell title="Discharge from Observation" subtitle={`Admitted ${timeAgo(admission.admitted_at)}`} onClose={onClose} maxWidth="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400">Cancel</button>
          <button onClick={() => onSubmit({ discharge_notes: notes.trim() })} disabled={loading} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 disabled:opacity-50">{loading ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="archive" size={12} />} Discharge</button>
        </div>
      }>
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2">
          <p className="text-[12px] text-gray-600 dark:text-gray-300">Deposit: <span className="font-semibold">{formatMoney(admission.deposit)}</span></p>
          {admission.expected_discharge && <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">Expected: {formatDateTime(admission.expected_discharge)}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Discharge Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Discharge instructions, follow-up plan..." className={`${inputCls} resize-none`} />
        </div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 px-3 py-2 flex items-start gap-2">
          <Icon name="info" size={13} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-blue-700 dark:text-blue-400">Discharging will add an observation fee to the bill and free the patient for billing. The doctor must still click &quot;End Consultation&quot; to finalize.</p>
        </div>
      </div>
    </ModalShell>
  )
}

function LabOrderModal({ onClose, onSubmit, loading }) {
  const [selected, setSelected] = useState({})
  const [urgency, setUrgency] = useState('routine')

  // Mock catalog for preview
  const tests = [
    { id: 1, name: 'Full Blood Count', category: 'hematology', unit_cost: 800, reference_range: 'Hb 12-17 g/dL' },
    { id: 2, name: 'ESR', category: 'hematology', unit_cost: 400, reference_range: '0-20 mm/hr' },
    { id: 3, name: 'Random Blood Glucose', category: 'chemistry', unit_cost: 500, reference_range: '3.9-7.8 mmol/L' },
    { id: 4, name: 'Urinalysis', category: 'urinalysis', unit_cost: 300, reference_range: 'Negative' },
    { id: 5, name: 'Liver Function Test', category: 'chemistry', unit_cost: 1800, reference_range: 'ALT 7-56 U/L' },
  ]

  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }))
  const selectedTests = tests.filter((t) => selected[t.id])
  const totalCost = selectedTests.reduce((s, t) => s + (t.unit_cost || 0), 0)

  return (
    <ModalShell title="Order Lab Tests" subtitle="Select tests and set urgency" onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{selectedTests.length} test(s)</span>
            <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(totalCost)}</span>
          </div>
          <button onClick={() => onSubmit(selectedTests.map((t) => t.id), urgency)} disabled={loading || selectedTests.length === 0} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">{loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />} Order</button>
        </div>
      }>
      <div className="mb-4">
        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Urgency</label>
        <div className="grid grid-cols-3 gap-2">
          {[{v:'routine',l:'Routine'},{v:'urgent',l:'Urgent'},{v:'stat',l:'STAT'}].map((u) => (
            <button key={u.v} onClick={() => setUrgency(u.v)} className={`px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors ${urgency === u.v ? 'bg-[#1a6cbf] text-white' : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700/60'}`}>{u.l}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tests.map((t) => {
          const isSel = !!selected[t.id]
          return (
            <button key={t.id} onClick={() => toggle(t.id)} className={`text-left p-3 rounded-lg border transition-all ${isSel ? 'border-[#1a6cbf] bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{cap(t.category)} · Ref: {t.reference_range}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{formatMoney(t.unit_cost)}</span>
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSel ? 'bg-[#1a6cbf] border-[#1a6cbf] text-white' : 'border-gray-300 dark:border-gray-600 text-transparent'}`}><Icon name="check" size={12} /></span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </ModalShell>
  )
}

function PrescriptionModal({ onClose, onSubmit, loading, allergies }) {
  const [items, setItems] = useState([{ medication: '', dosage: '', frequency: '', duration: '', quantity: 1, unit_cost: 0, form: 'oral', drug_id: null }])

  const updateItem = (i, field, value) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  const addItem = () => setItems((arr) => [...arr, { medication: '', dosage: '', frequency: '', duration: '', quantity: 1, unit_cost: 0, form: 'oral', drug_id: null }])
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))

  const totalCost = items.reduce((s, it) => s + (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0), 0)
  const validItems = items.filter((it) => it.medication.trim())

  return (
    <ModalShell title="Add Prescription" subtitle="Enter medications and dosages" onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{validItems.length} medication(s)</span>
            <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(totalCost)}</span>
          </div>
          <button onClick={() => onSubmit(validItems)} disabled={loading || validItems.length === 0} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">{loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />} Send to Pharmacy</button>
        </div>
      }>
      <div className="space-y-4">
        {allergies && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-3 py-2 flex items-start gap-2">
            <Icon name="alert" size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-700 dark:text-red-400"><span className="font-semibold">Allergy alert:</span> {allergies}</p>
          </div>
        )}
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Medication #{i + 1}</span>
              {items.length > 1 && <button onClick={() => removeItem(i)} className="text-[11px] text-red-500 hover:text-red-600 flex items-center gap-1"><Icon name="trash" size={12} /> Remove</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Medication *</label>
                <input type="text" value={it.medication} onChange={(e) => updateItem(i, 'medication', e.target.value)} placeholder="e.g. Paracetamol" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Dosage</label>
                <input type="text" value={it.dosage} onChange={(e) => updateItem(i, 'dosage', e.target.value)} placeholder="e.g. 1g" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Frequency</label>
                <input type="text" value={it.frequency} onChange={(e) => updateItem(i, 'frequency', e.target.value)} placeholder="e.g. TID" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Duration</label>
                <input type="text" value={it.duration} onChange={(e) => updateItem(i, 'duration', e.target.value)} placeholder="e.g. 3 days" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Quantity</label>
                <input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Unit Cost (KSh)</label>
                <input type="number" min="0" value={it.unit_cost} onChange={(e) => updateItem(i, 'unit_cost', e.target.value)} className={`${inputCls} tabular-nums`} />
              </div>
            </div>
          </div>
        ))}
        <button onClick={addItem} className="w-full px-4 py-2 rounded-lg text-[13px] font-medium border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] flex items-center justify-center gap-2"><Icon name="plus" size={14} /> Add Another</button>
      </div>
    </ModalShell>
  )
}

function ReportModal({ visit, onClose }) {
  const admission = visit.admission
  return (
    <ModalShell title="Medical Report" subtitle={`${visit.patient_name} · Visit #${visit.id}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
          <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">{visit.patient_name}</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">{visit.patient_age} years · {cap(visit.patient_gender)} · Blood group {visit.blood_group || '—'}</p>
          {visit.allergies && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">Allergies: {visit.allergies}</p>}
        </div>

        {/* Admission info */}
        {admission && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Observation Record</p>
            <p className="text-[12px] text-gray-700 dark:text-gray-300">Type: {cap(admission.admission_type)} · Admitted: {formatDateTime(admission.admitted_at)}</p>
            {admission.discharged_at && <p className="text-[12px] text-gray-700 dark:text-gray-300">Discharged: {formatDateTime(admission.discharged_at)} · {admission.days_admitted} day(s)</p>}
            <p className="text-[12px] text-gray-700 dark:text-gray-300">Reason: {admission.reason}</p>
            {admission.discharge_notes && <p className="text-[12px] text-gray-700 dark:text-gray-300 mt-1">Discharge notes: {admission.discharge_notes}</p>}
          </div>
        )}

        {/* SOAP */}
        <div className="space-y-2">
          {visit.subjective && <div><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Subjective:</span><p className="text-[12px] text-gray-800 dark:text-gray-200 mt-0.5">{visit.subjective}</p></div>}
          {visit.objective && <div><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Objective:</span><p className="text-[12px] text-gray-800 dark:text-gray-200 mt-0.5">{visit.objective}</p></div>}
          {visit.assessment && <div><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Assessment:</span><p className="text-[12px] text-gray-800 dark:text-gray-200 mt-0.5">{visit.assessment}</p></div>}
          {visit.plan && <div><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Plan:</span><p className="text-[12px] text-gray-800 dark:text-gray-200 mt-0.5">{visit.plan}</p></div>}
        </div>

        {/* Diagnosis */}
        {visit.diagnosis && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Diagnosis</p>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{visit.diagnosis} {visit.diagnosis_code && <span className="text-[11px] text-gray-500">({visit.diagnosis_code})</span>}</p>
          </div>
        )}

        {/* Labs */}
        {visit.lab_requests?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Lab Results</p>
            <div className="space-y-1.5">
              {visit.lab_requests.flatMap((r) => r.items).map((it) => (
                <div key={it.id} className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-700/20">
                  <span className="text-gray-700 dark:text-gray-300">{it.test_name}</span>
                  <span className={it.flagged ? 'font-bold text-red-600 dark:text-red-400' : 'font-medium text-emerald-600 dark:text-emerald-400'}>{it.result || 'Pending'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prescriptions */}
        {visit.prescriptions?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Prescriptions</p>
            <div className="space-y-1.5">
              {visit.prescriptions.flatMap((p) => p.items).map((it) => (
                <div key={it.id} className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-700/20">
                  <span className="text-gray-700 dark:text-gray-300">{it.medication} {it.dosage} {it.frequency} × {it.duration}</span>
                  <span className="text-gray-500 dark:text-gray-400">Qty {it.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bill summary */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Bill Summary</p>
          <div className="space-y-1 text-[12px]">
            <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Consultation</span><span className="tabular-nums">{formatMoney(visit.consultation_fee)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Lab</span><span className="tabular-nums">{formatMoney(visit.lab_fee)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Medications</span><span className="tabular-nums">{formatMoney(visit.medication_fee)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Procedures / Observation</span><span className="tabular-nums">{formatMoney(visit.procedure_fee)}</span></div>
            {admission?.deposit > 0 && <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Less: Deposit</span><span className="tabular-nums">-{formatMoney(admission.deposit)}</span></div>}
            <div className="flex justify-between text-[13px] font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-100 dark:border-gray-700/40">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney((visit.bill_total || 0) - (admission?.deposit || 0))}</span>
            </div>
          </div>
        </div>

        <button onClick={() => window.print()} className="w-full px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center justify-center gap-2">
          <Icon name="printer" size={14} /> Print
        </button>
      </div>
    </ModalShell>
  )
}

function ProcedureModal({ onClose, onConfirm }) {
  const [type, setType] = useState('procedure')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim() || !price) return
    onConfirm(type, null, notes.trim(), Number(price))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Add Procedure / Service</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40"><Icon name="x" size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden w-full">
            <button type="button" onClick={() => setType('procedure')} className={`flex-1 px-3 py-2 text-[13px] font-medium transition-colors ${type !== 'family_planning' ? 'bg-[#1a6cbf] text-white' : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400'}`}>Procedure</button>
            <button type="button" onClick={() => setType('family_planning')} className={`flex-1 px-3 py-2 text-[13px] font-medium transition-colors border-l border-gray-200 dark:border-gray-700/60 ${type === 'family_planning' ? 'bg-fuchsia-600 text-white' : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400'}`}>Family Planning</button>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wound dressing" className={inputCls} required />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Price (KSh) *</label>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} tabular-nums`} required />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center justify-center gap-2"><Icon name="plus" size={14} /> Add to Bill</button>
          </div>
        </form>
      </div>
    </div>
  )
}
