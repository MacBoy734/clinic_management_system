'use client'

// MedicationVerificationTab — lets the doctor verify pharmacy-issued
// medications BEFORE the patient is sent to billing. After the pharmacy
// dispenses a prescription, the patient returns to the doctor for a final
// verification step (e.g. confirm dosage instructions, check the dispensed
// medications match what was prescribed). The doctor can either:
//   • Verify & Issue to Patient → patient goes to billing
//   • Return to Pharmacy          → patient goes back to pharmacy with a reason
//
// APIs:
//   GET   /api/doctor/queue                          → { visits: [...] }
//        (client filters: status === 'with_doctor' && medication_verification === true)
//   GET   /api/doctor/visits/[id]/prescriptions      → { prescriptions: [...] }
//   PATCH /api/doctor/prescriptions/:id/verify       → Body: { doctor_name, notes }
//        Returns { success, prescription }
//   PATCH /api/doctor/prescriptions/:id/return       → Body: { doctor_name, reason }
//        Returns { success, prescription }

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api  from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, Badge, EmptyState, ErrorState, Icon,
  StatCard, SkeletonCard, SkeletonList,
  formatTime, timeAgo, cap, formatMoney, badgeClass,
} from '@/utils/helpers'

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const RETURN_REASONS = [
  'Wrong medication dispensed',
  'Incorrect dosage or quantity',
  'Medication appears damaged or expired',
  'Patient reports adverse reaction',
  'Stock shortage — partial dispense',
]

export default function MedicationVerificationTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const doctorName = user?.name || 'Doctor'

  // Verification target: { visit, prescription }
  const [verifying, setVerifying] = useState(null)
  const [returning, setReturning] = useState(null)

  // API: GET /api/doctor/queue
  const queueQuery = useQuery({
    queryKey: ['doctor', 'queue'],
    queryFn: () => api.get('/api/doctor/queue'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // API: PATCH /api/doctor/prescriptions/:id/verify
  const verifyMutation = useMutation({
    mutationFn: ({ id, doctor_name, notes }) =>
      api.patch(`/api/doctor/prescriptions/${id}/verify`, { doctor_name, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor'] })
    },
  })

  // API: PATCH /api/doctor/prescriptions/:id/return
  const returnMutation = useMutation({
    mutationFn: ({ id, doctor_name, reason }) =>
      api.patch(`/api/doctor/prescriptions/${id}/return`, { doctor_name, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor'] })
    },
  })

  // Client-side filter: visits awaiting medication verification
  const visits = (queueQuery.data?.visits || []).filter(
    (v) => v.status === 'with_doctor' && v.medication_verification === true
  )

  const handleVerify = async (prescription, notes) => {
    try {
      await verifyMutation.mutateAsync({ id: prescription.id, doctor_name: doctorName, notes })
      toast.success(`Prescription #${prescription.id} verified & issued to ${prescription.patient_name}`)
      setVerifying(null)
    } catch (err) {
      toast.error(err.message || 'Could not verify prescription')
    }
  }

  const handleReturn = async (prescription, reason) => {
    try {
      await returnMutation.mutateAsync({ id: prescription.id, doctor_name: doctorName, reason })
      toast.success(`Prescription #${prescription.id} returned to pharmacy`)
      setReturning(null)
    } catch (err) {
      toast.error(err.message || 'Could not return prescription')
    }
  }

  if (queueQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={2} />
      </div>
    )
  }
  if (queueQuery.error) return <ErrorState message={queueQuery.error.message} onRetry={queueQuery.refetch} />

  return (
    <div className="space-y-4">
      {/* Stat card: patients awaiting verification */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon="checkCircle"
          color="amber"
          label="Awaiting Verification"
          value={visits.length}
          sublabel="patients ready for final check"
        />
        <StatCard
          icon="stethoscope"
          color="blue"
          label="Doctor on Duty"
          value={doctorName}
          sublabel="verifying officer"
        />
        <StatCard
          icon="pill"
          color="green"
          label="Flow Stage"
          value="Pre-Billing"
          sublabel="verify before billing"
        />
      </div>

      {/* Info banner explaining the flow */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
          <Icon name="info" size={16} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-blue-900 dark:text-blue-200">
            Medication Verification Flow
          </p>
          <p className="text-[12px] text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
            After the pharmacy dispenses a prescription, the patient returns to you for a final
            verification before billing. Review the dispensed medications against the prescription,
            confirm dosage instructions with the patient, then choose{' '}
            <span className="font-semibold">Verify &amp; Issue to Patient</span> to send them to billing,
            or <span className="font-semibold">Return to Pharmacy</span> if there&apos;s an issue.
          </p>
        </div>
      </div>

      {/* Patient list */}
      {!visits.length ? (
        <EmptyState
          icon="checkCircle"
          title="No patients awaiting verification"
          description="When the pharmacy dispenses a prescription, the patient will appear here for a final verification check before billing."
        />
      ) : (
        <div className="space-y-3">
          {visits.map((v) => (
            <PatientVerificationCard
              key={v.id}
              visit={v}
              doctorName={doctorName}
              onVerify={(p) => setVerifying({ visit: v, prescription: p })}
              onReturn={(p) => setReturning({ visit: v, prescription: p })}
            />
          ))}
        </div>
      )}

      {/* Verify modal */}
      {verifying && (
        <VerifyModal
          visit={verifying.visit}
          prescription={verifying.prescription}
          doctorName={doctorName}
          loading={verifyMutation.isPending}
          onClose={() => setVerifying(null)}
          onConfirm={(notes) => handleVerify(verifying.prescription, notes)}
        />
      )}

      {/* Return modal */}
      {returning && (
        <ReturnModal
          visit={returning.visit}
          prescription={returning.prescription}
          doctorName={doctorName}
          loading={returnMutation.isPending}
          onClose={() => setReturning(null)}
          onConfirm={(reason) => handleReturn(returning.prescription, reason)}
        />
      )}
    </div>
  )
}

// ─── Patient verification card ────────────────────────────────────────────────

function PatientVerificationCard({ visit, doctorName, onVerify, onReturn }) {
  // Fetch prescriptions for this visit
  const { data, isLoading, error } = useQuery({
    queryKey: ['doctor', 'visit', visit.id, 'prescriptions'],
    queryFn: () => api.get(`/api/doctor/visits/${visit.id}/prescriptions`),
    staleTime: 10000,
  })

  const prescriptions = data?.prescriptions || []
  // Only show prescriptions that have been dispensed by pharmacy (need verification)
  const toVerify = prescriptions.filter(
    (p) => p.status === 'dispensed' || p.status === 'issued' || p.status === 'pending'
  )

  return (
    <Card className="p-4">
      {/* Patient header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
          <span className="text-[13px] font-semibold text-white">
            {visit.patient_name?.charAt(0) || 'P'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              {visit.patient_name}
            </span>
            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
              {visit.patient_age}y · {cap(visit.patient_gender)}
            </Badge>
            {visit.blood_group && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <Icon name="droplet" size={10} /> {visit.blood_group}
              </Badge>
            )}
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Visit #{visit.id}
            </Badge>
            <Badge className={badgeClass(visit.status)}>{cap(visit.status)}</Badge>
          </div>
          <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-1">
            <span className="font-medium">Chief complaint:</span> {visit.chief_complaint || '—'}
          </p>
          {visit.allergies && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
              <Icon name="alert" size={11} /> Allergies: {visit.allergies}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-0.5">
            Arrived {timeAgo(visit.arrived_at)} · {formatTime(visit.arrived_at)}
            {visit.doctor ? ` · Attending: ${visit.doctor}` : ''}
          </p>
        </div>
      </div>

      {/* Prescriptions to verify */}
      <div className="mt-3">
        {isLoading ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 text-[12px] text-gray-400 flex items-center gap-2">
            <Icon name="refresh" size={12} className="animate-spin" /> Loading prescriptions…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-[12px] text-red-600 dark:text-red-400">
            Could not load prescriptions: {error.message}
          </div>
        ) : !toVerify.length ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700/60 p-3 text-[12px] text-gray-400 text-center">
            No prescriptions awaiting verification for this patient.
          </div>
        ) : (
          <div className="space-y-3">
            {toVerify.map((p) => (
              <PrescriptionVerifyCard
                key={p.id}
                prescription={p}
                onVerify={() => onVerify(p)}
                onReturn={() => onReturn(p)}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Prescription card with verify / return buttons ───────────────────────────

function PrescriptionVerifyCard({ prescription, onVerify, onReturn }) {
  const items = prescription.items || []
  const totalCost = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0)

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Prescription header */}
      <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-700/20 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">
            Rx #{prescription.id}
          </span>
          <Badge className={badgeClass(prescription.status)}>{cap(prescription.status)}</Badge>
          <span className="text-[11px] text-gray-400">
            Prescribed by {prescription.prescribed_by} · {timeAgo(prescription.prescribed_at)}
          </span>
        </div>
        <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
          {formatMoney(totalCost)}
        </span>
      </div>

      {/* Medication items */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <Icon name="pill" size={14} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                {item.status && (
                  <Badge className={badgeClass(item.status)}>{cap(item.status)}</Badge>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {item.dosage} · {item.frequency} · {item.duration} · Qty {item.quantity}
              </p>
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
              {formatMoney((item.unit_cost || 0) * (item.quantity || 0))}
            </span>
          </div>
        ))}
      </div>

      {/* Action footer */}
      <div className="px-3 py-2.5 bg-gray-50/50 dark:bg-gray-700/10 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2">
        <button
          onClick={onReturn}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5"
        >
          <Icon name="xCircle" size={12} /> Return to Pharmacy
        </button>
        <button
          onClick={onVerify}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
        >
          <Icon name="check" size={12} /> Verify &amp; Issue to Patient
        </button>
      </div>
    </div>
  )
}

// ─── Verify modal ─────────────────────────────────────────────────────────────

function VerifyModal({ visit, prescription, doctorName, loading, onClose, onConfirm }) {
  const [notes, setNotes] = useState('')

  const items = prescription.items || []
  const totalCost = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0)

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onClose}
        disabled={loading}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        onClick={() => onConfirm(notes.trim())}
        disabled={loading}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
        Verify &amp; Issue
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <Icon name="checkCircle" size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                Verify Prescription #{prescription.id}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Confirm medications &amp; issue to {prescription.patient_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Patient summary */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 bg-gray-50/50 dark:bg-gray-700/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {prescription.patient_name}
              </span>
              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                {prescription.patient_age}y · {cap(prescription.patient_gender)}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Visit #{visit.id}
              </Badge>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Chief complaint: {visit.chief_complaint || '—'}
            </p>
          </div>

          {/* Medications being verified */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Dispensed medications ({items.length})
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Icon name="pill" size={14} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.dosage} · {item.frequency} · {item.duration} · Qty {item.quantity}
                    </p>
                  </div>
                  <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300 tabular-nums shrink-0">
                    {formatMoney((item.unit_cost || 0) * (item.quantity || 0))}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-2 text-[12px]">
              <span className="text-gray-500 dark:text-gray-400">Total medication cost:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatMoney(totalCost)}
              </span>
            </div>
          </div>

          {/* Confirmation banner */}
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5 flex items-start gap-2">
            <Icon name="checkCircle" size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Verifying will mark the prescription as <span className="font-semibold">issued</span> and send{' '}
              <span className="font-semibold">{prescription.patient_name}</span> to billing. The patient
              will be billed for the medication fee of <span className="font-semibold">{formatMoney(totalCost)}</span>.
            </p>
          </div>

          {/* Notes textarea */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Verification notes (optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Patient counselled on dosage schedule. Advised to complete full course."
              className={inputCls + ' resize-none'}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Verified by <span className="font-semibold text-gray-600 dark:text-gray-300">{doctorName}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 shrink-0">{footer}</div>
      </div>
    </div>
  )
}

// ─── Return modal ─────────────────────────────────────────────────────────────

function ReturnModal({ visit, prescription, doctorName, loading, onClose, onConfirm }) {
  const [reason, setReason] = useState('')

  const items = prescription.items || []

  const canSubmit = reason.trim().length > 0 && !loading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
              <Icon name="xCircle" size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                Return Prescription #{prescription.id}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Send back to pharmacy for correction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Patient summary */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 bg-gray-50/50 dark:bg-gray-700/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {prescription.patient_name}
              </span>
              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                {prescription.patient_age}y · {cap(prescription.patient_gender)}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Visit #{visit.id}
              </Badge>
            </div>
          </div>

          {/* Medications being returned */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Medications to return ({items.length})
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                    <Icon name="pill" size={14} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.dosage} · Qty {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning banner */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5 flex items-start gap-2">
            <Icon name="alert" size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Returning this prescription will send <span className="font-semibold">{prescription.patient_name}</span>{' '}
              back to the pharmacy. The pharmacist will be notified of the reason and can re-dispense
              once corrected.
            </p>
          </div>

          {/* Reason textarea */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Reason for return *
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this prescription is being returned to the pharmacy…"
              className={inputCls + ' resize-none'}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {RETURN_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60"
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Returned by <span className="font-semibold text-gray-600 dark:text-gray-300">{doctorName}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="xCircle" size={14} />}
            Return to Pharmacy
          </button>
        </div>
      </div>
    </div>
  )
}