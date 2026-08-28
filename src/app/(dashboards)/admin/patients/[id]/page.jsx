'use client'

/**
 * /app/(dashboards)/admin/patients/[id]/page.jsx
 *
 * Full patient detail page — all visits, vitals, labs, prescriptions,
 * billing and payment history in one place.
 *
 * API: GET /api/admin/patients/:id
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePatientDetail(id) {
  return useQuery({
    queryKey: ['admin', 'patient-detail', id],
    queryFn: () => api.get(`/api/admin/patients/${id}`),
    enabled: !!id,
    staleTime: 60000,
  })
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VISIT_TYPE_LABELS = {
  consultation: 'Consultation',
  direct_lab: 'Direct Lab',
  injection: 'Injection',
  family_planning: 'Family Planning',
}

const VISIT_TYPE_COLORS = {
  consultation: 'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400   border-blue-100   dark:border-blue-800/40',
  direct_lab: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-800/40',
  injection: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-800/40',
  family_planning: 'bg-pink-50   dark:bg-pink-900/20   text-pink-700   dark:text-pink-400   border-pink-100   dark:border-pink-800/40',
}

const VISIT_STATUS_COLORS = {
  waiting: 'bg-amber-50   dark:bg-amber-900/20   text-amber-700   dark:text-amber-400',
  consultation_paid: 'bg-cyan-50    dark:bg-cyan-900/20    text-cyan-700    dark:text-cyan-400',
  with_doctor: 'bg-blue-50    dark:bg-blue-900/20    text-blue-700    dark:text-blue-400',
  lab: 'bg-purple-50  dark:bg-purple-900/20  text-purple-700  dark:text-purple-400',
  pharmacy: 'bg-teal-50    dark:bg-teal-900/20    text-teal-700    dark:text-teal-400',
  billing: 'bg-orange-50  dark:bg-orange-900/20  text-orange-700  dark:text-orange-400',
  done: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
  archived: 'bg-gray-100   dark:bg-gray-700/40    text-gray-500    dark:text-gray-400',
}

const FEE_STATUS_COLORS = {
  paid: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40',
  pending: 'bg-amber-50   dark:bg-amber-900/20   text-amber-700   dark:text-amber-400   border-amber-100   dark:border-amber-800/40',
  waived: 'bg-gray-50    dark:bg-gray-800/40    text-gray-500    dark:text-gray-400    border-gray-200    dark:border-gray-700/40',
}

const LAB_STATUS_COLORS = {
  pending: 'bg-amber-50   dark:bg-amber-900/20   text-amber-700   dark:text-amber-400',
  in_progress: 'bg-blue-50    dark:bg-blue-900/20    text-blue-700    dark:text-blue-400',
  ready: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
}

const RX_STATUS_COLORS = {
  pending: 'bg-amber-50   dark:bg-amber-900/20   text-amber-700   dark:text-amber-400',
  dispensed: 'bg-blue-50    dark:bg-blue-900/20    text-blue-700    dark:text-blue-400',
  issued: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
  returned: 'bg-orange-50  dark:bg-orange-900/20  text-orange-700  dark:text-orange-400',
  cancelled: 'bg-red-50     dark:bg-red-900/20     text-red-700     dark:text-red-400',
}

const URGENCY_COLORS = {
  routine: 'bg-gray-100   dark:bg-gray-700/40 text-gray-600   dark:text-gray-400',
  urgent: 'bg-amber-100  dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  stat: 'bg-red-100    dark:bg-red-900/30   text-red-700   dark:text-red-400',
}

const METHOD_LABELS = { cash: 'Cash', mpesa: 'M-Pesa', insurance: 'Insurance', other: 'Other' }
const GENDER_SYMBOL = { male: '♂', female: '♀', other: '⚧' }

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n) {
  return (n ?? 0).toLocaleString('en-KE')
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function cap(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ')
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${className}`}>
      {children}
    </span>
  )
}

function SectionTitle({ children, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {children}
      </h3>
      {count != null && (
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/40 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  )
}

function EmptyBlock({ text }) {
  return (
    <p className="text-[12px] text-gray-400 dark:text-gray-500 italic py-2">{text}</p>
  )
}

function Divider() {
  return <div className="border-t border-gray-100 dark:border-gray-700/60 my-4" />
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'border-blue-200   dark:border-blue-800/40   bg-blue-50/50   dark:bg-blue-950/20   text-blue-700   dark:text-blue-400',
    green: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
    amber: 'border-amber-200   dark:border-amber-800/40   bg-amber-50/50   dark:bg-amber-950/20   text-amber-700   dark:text-amber-400',
    red: 'border-red-200     dark:border-red-800/40     bg-red-50/50     dark:bg-red-950/20     text-red-700     dark:text-red-400',
    purple: 'border-purple-200  dark:border-purple-800/40  bg-purple-50/50  dark:bg-purple-950/20  text-purple-700  dark:text-purple-400',
    slate: 'border-gray-200    dark:border-gray-700/60    bg-white         dark:bg-[#1e293b]       text-gray-700    dark:text-gray-300',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${colors[color].split(' ').slice(4).join(' ')}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Vitals display ───────────────────────────────────────────────────────────

function VitalsBlock({ vitals }) {
  if (!vitals) return <EmptyBlock text="No vitals recorded for this visit." />

  const rows = [
    { label: 'Blood Pressure', value: vitals.bp_systolic && vitals.bp_diastolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg` : null },
    { label: 'Temperature', value: vitals.temperature ? `${vitals.temperature} °C` : null },
    { label: 'Pulse', value: vitals.pulse ? `${vitals.pulse} bpm` : null },
    { label: 'SpO2', value: vitals.spo2 ? `${vitals.spo2}%` : null },
    { label: 'Weight', value: vitals.weight_kg ? `${vitals.weight_kg} kg` : null },
    { label: 'Height', value: vitals.height_cm ? `${vitals.height_cm} cm` : null },
    { label: 'Resp. Rate', value: vitals.respiratory_rate ? `${vitals.respiratory_rate} /min` : null },
  ].filter(r => r.value)

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-2">
        {rows.map(r => (
          <div key={r.label} className="rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/40 px-3 py-2">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{r.label}</p>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{r.value}</p>
          </div>
        ))}
      </div>
      {vitals.vitals_notes && (
        <p className="text-[12px] text-gray-500 dark:text-gray-400 italic">{vitals.vitals_notes}</p>
      )}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Recorded {fmtDateTime(vitals.recorded_at)}</p>
    </div>
  )
}

// ─── Lab requests block ───────────────────────────────────────────────────────

function LabBlock({ labRequests }) {
  if (!labRequests?.length) return <EmptyBlock text="No lab tests ordered for this visit." />
  
  return (
    <div className="space-y-3">
      {labRequests.map(r => (
        <div key={r.id} className="rounded-xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
          {/* Request header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
                Lab Order #{r.id}
              </span>
              <Badge className={URGENCY_COLORS[r.urgency]}>{cap(r.urgency)}</Badge>
              <Badge className={LAB_STATUS_COLORS[r.status]}>{cap(r.status)}</Badge>
              {r.ordered_by && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  Ordered by {r.ordered_by}
                </span>
              )}
              {r.tech && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  · Tech: {r.tech}
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {fmtDateTime(r.requested_at)}
            </span>
          </div>

          {/* Test items */}
          {r.items?.length > 0 && (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
              {r.items.map(item => (
                <div key={item.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.test_name}</p>
                      {item.flagged && (
                        <Badge className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/40">
                          ⚠ Flagged
                        </Badge>
                      )}
                      <Badge className={LAB_STATUS_COLORS[item.status]}>{cap(item.status)}</Badge>
                    </div>
                    {item.reference_range && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        Ref: {item.reference_range}
                      </p>
                    )}
                    {item.result && (
                      <div className="mt-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/40 px-3 py-2">
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Result</p>
                        <p className="text-[13px] text-gray-800 dark:text-gray-200 font-medium">{item.result}</p>
                        {item.result_notes && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 italic">{item.result_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[12px] font-mono font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                      KES {fmt(item.unit_cost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {r.notes && (
            <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-800/20">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">{r.notes}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Prescriptions block ──────────────────────────────────────────────────────

function RxBlock({ prescriptions }) {
  if (!prescriptions?.length) return <EmptyBlock text="No prescriptions for this visit." />

  return (
    <div className="space-y-3">
      {prescriptions.map(rx => (
        <div key={rx.id} className="rounded-xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
          {/* Prescription header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
                Rx #{rx.id}
              </span>
              <Badge className={RX_STATUS_COLORS[rx.status]}>{cap(rx.status)}</Badge>
              {rx.prescribed_by && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">by {rx.prescribed_by}</span>
              )}
              {rx.pharmacist && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">· dispensed by {rx.pharmacist}</span>
              )}
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {fmtDateTime(rx.created_at)}
            </span>
          </div>

          {/* Drug items */}
          <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
            {rx.items.map(item => (
              <div key={item.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.drug_name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {item.dosage} · {item.frequency} · {item.duration} · Qty: {item.quantity}
                  </p>
                  {item.decline_reason && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                      ✕ {item.decline_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={
                    item.status === 'issued' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40' :
                      item.status === 'declined' ? 'bg-red-50     dark:bg-red-900/20     text-red-700     dark:text-red-400     border-red-100     dark:border-red-800/40' :
                        'bg-amber-50   dark:bg-amber-900/20   text-amber-700   dark:text-amber-400   border-amber-100   dark:border-amber-800/40'
                  }>{cap(item.status)}</Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Status trail */}
          {(rx.return_reason || rx.cancel_reason || rx.verified_by || rx.notes) && (
            <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-800/20 space-y-0.5">
              {rx.notes && <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">{rx.notes}</p>}
              {rx.verified_by && <p className="text-[11px] text-gray-500 dark:text-gray-400">Verified by {rx.verified_by} · {fmtDateTime(rx.verified_at)}</p>}
              {rx.return_reason && <p className="text-[11px] text-orange-600 dark:text-orange-400">Returned: {rx.return_reason}</p>}
              {rx.cancel_reason && <p className="text-[11px] text-red-600 dark:text-red-400">Cancelled: {rx.cancel_reason}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Bill block ───────────────────────────────────────────────────────────────

function BillBlock({ bill }) {
  if (!bill) return <EmptyBlock text="No bill generated for this visit." />

  const feeLines = [
    { 
      label: 'Consultation', 
      amount: bill.consultation_fee, 
      status: bill.consultation_fee_status,
      waivedBy: bill.consultation_fee_waived_by,
      waiveReason: bill.consultation_fee_waive_reason,
      waivedAt: bill.consultation_fee_waived_at,
    },
    { 
      label: 'Lab Tests', 
      amount: bill.lab_fee, 
      status: bill.stage2_status,
      waivedBy: bill.stage2_waived_by,
      waiveReason: bill.stage2_waive_reason,
      waivedAt: bill.stage2_waived_at,
    },
    { 
      label: 'Medication', 
      amount: bill.medication_fee, 
      status: bill.stage2_status,
      waivedBy: bill.stage2_waived_by,
      waiveReason: bill.stage2_waive_reason,
      waivedAt: bill.stage2_waived_at,
    },
    { 
      label: 'Procedure', 
      amount: bill.procedure_fee, 
      status: bill.stage2_status,
      waivedBy: bill.stage2_waived_by,
      waiveReason: bill.stage2_waive_reason,
      waivedAt: bill.stage2_waived_at,
    },
  ].filter(l => l.amount > 0)

  const hasWaivers = feeLines.some(l => l.waivedBy)
  const hasDiscount = bill.discount_amount > 0

  return (
    <div className="space-y-4">
      {/* Fee breakdown */}
      <div className="rounded-xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
        <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
          {feeLines.map(l => (
            <div key={l.label} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-700 dark:text-gray-300">{l.label}</span>
                  <Badge className={FEE_STATUS_COLORS[l.status]}>{cap(l.status)}</Badge>
                </div>
                <span className="text-[13px] font-mono font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  KES {fmt(l.amount)}
                </span>
              </div>
              {/* Waiver detail inline */}
              {l.waivedBy && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-md px-2.5 py-1.5 border border-gray-100 dark:border-gray-700/40">
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Waived</span>
                  <span>by {l.waivedBy}</span>
                  {l.waiveReason && <span>· "{l.waiveReason}"</span>}
                  {l.waivedAt && <span>· {fmtDateTime(l.waivedAt)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Discount (bill-level) */}
        {hasDiscount && (
          <div className="px-4 py-2.5 bg-amber-50/50 dark:bg-amber-950/20 border-t border-dashed border-amber-100 dark:border-amber-800/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-amber-700 dark:text-amber-400 font-medium">Discount</span>
                {bill.discount_reason && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">"{bill.discount_reason}"</span>
                )}
              </div>
              <span className="text-[13px] font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                – KES {fmt(bill.discount_amount)}
              </span>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700/60 px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-[13px] font-bold">
            <span className="text-gray-900 dark:text-gray-100">Total</span>
            <span className="tabular-nums">KES {fmt(bill.total_amount)}</span>
          </div>
          {hasDiscount && (
            <div className="flex justify-between text-[12px]">
              <span className="text-amber-600 dark:text-amber-400">Less Discount</span>
              <span className="text-amber-700 dark:text-amber-400 tabular-nums font-medium">– KES {fmt(bill.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-[12px]">
            <span className="text-emerald-600 dark:text-emerald-400">Paid</span>
            <span className="text-emerald-700 dark:text-emerald-400 tabular-nums font-semibold">KES {fmt(bill.paid_amount)}</span>
          </div>
          {bill.balance > 0 && (
            <div className="flex justify-between text-[12px]">
              <span className="text-amber-600 dark:text-amber-400">Balance</span>
              <span className="text-amber-700 dark:text-amber-400 tabular-nums font-semibold">KES {fmt(bill.balance)}</span>
            </div>
          )}
          {bill.balance === 0 && bill.fee_status !== 'waived' && (
            <div className="flex justify-between text-[12px]">
              <span className="text-emerald-600 dark:text-emerald-400">Status</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Fully Paid</span>
            </div>
          )}
          {bill.fee_status === 'waived' && (
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500 dark:text-gray-400">Status</span>
              <Badge className={FEE_STATUS_COLORS.waived}>Waived</Badge>
            </div>
          )}
        </div>
      </div>

      {/* Payment history */}
      {bill.payments?.length > 0 && (
        <div>
          <SectionTitle count={bill.payments.length}>Payment History</SectionTitle>
          <div className="space-y-2">
            {bill.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-[#1e293b]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">S{p.stage}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        KES {fmt(p.amount)}
                      </span>
                      <Badge className="bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                        {METHOD_LABELS[p.method] ?? cap(p.method)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {p.cashier ? `By ${p.cashier}` : ''}
                      {p.reference ? ` · Ref: ${p.reference}` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {fmtDateTime(p.paid_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit trail for financial adjustments */}
      {(hasWaivers || hasDiscount) && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/30 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Financial Adjustments</p>
          <div className="space-y-1.5">
            {feeLines.filter(l => l.waivedBy).map(l => (
              <p key={l.label} className="text-[11px] text-gray-600 dark:text-gray-400">
                <span className="font-semibold">{l.label}</span> waived by {l.waivedBy}
                {l.waiveReason ? ` · "${l.waiveReason}"` : ''}
                {l.waivedAt ? ` · ${fmtDateTime(l.waivedAt)}` : ''}
              </p>
            ))}
            {hasDiscount && (
              <p className="text-[11px] text-gray-600 dark:text-gray-400">
                <span className="font-semibold">Discount</span> of KES {fmt(bill.discount_amount)}
                {bill.discount_reason ? ` · "${bill.discount_reason}"` : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Single visit card (collapsible) ─────────────────────────────────────────

function VisitCard({ visit, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [section, setSection] = useState('clinical')

  const SECTIONS = [
    { key: 'clinical', label: 'Clinical' },
    { key: 'vitals', label: 'Vitals' },
    { key: 'lab', label: 'Lab', count: visit.lab_requests?.flatMap(r => r.items).length },
    { key: 'prescriptions', label: 'Rx', count: visit.prescriptions?.length },
    { key: 'billing', label: 'Billing' },
  ]

  const hasLabs = visit.lab_requests?.some(r => r.items?.length > 0)
  const hasPx = visit.prescriptions?.length > 0

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden bg-white dark:bg-[#1e293b]">

      {/* Visit header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Visit number & type */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-gray-400 dark:text-gray-500 tabular-nums">
              #{visit.queue_number ?? visit.id}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${VISIT_TYPE_COLORS[visit.visit_type]}`}>
              {VISIT_TYPE_LABELS[visit.visit_type]}
            </span>
          </div>

          {/* Status */}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${VISIT_STATUS_COLORS[visit.status]}`}>
            {cap(visit.status)}
          </span>

          {/* Date */}
          <span className="text-[12px] text-gray-500 dark:text-gray-400">
            {fmtDate(visit.arrived_at)} · {fmtTime(visit.arrived_at)}
            <span className="text-gray-300 dark:text-gray-600 ml-1">({timeAgo(visit.arrived_at)})</span>
          </span>

          {/* Doctor */}
          {visit.doctor && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Dr. {visit.doctor.username}
            </span>
          )}

          {/* Bill status */}
          {visit.bill && (
            <Badge className={FEE_STATUS_COLORS[visit.bill.fee_status]}>
              {cap(visit.bill.fee_status)} · KES {fmt(visit.bill.total_amount)}
            </Badge>
          )}

          {/* Flags */}
          {visit.has_lab_results && (
            <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">Lab ready</span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Chief complaint preview (always visible) */}
      {visit.chief_complaint && (
        <div className="px-5 pb-3 -mt-1">
          <p className="text-[12px] text-gray-500 dark:text-gray-400 italic">
            Chief complaint: {visit.chief_complaint}
          </p>
        </div>
      )}

      {/* Expanded content */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700/60">

          {/* Section tabs */}
          <div className="flex gap-0.5 px-4 pt-3 overflow-x-auto pb-0">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={[
                  'px-3 py-1.5 rounded-t-lg text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1',
                  section === s.key
                    ? 'bg-white dark:bg-[#1e293b] border border-b-white dark:border-gray-600 dark:border-b-[#1e293b] text-gray-900 dark:text-gray-100 -mb-px z-10 relative'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                ].join(' ')}
              >
                {s.label}
                {s.count != null && s.count > 0 && (
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1 rounded-full">
                    {s.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Section content */}
          <div className="p-5 bg-white dark:bg-[#1e293b]">

            {section === 'clinical' && (
              <div className="space-y-4">
                {/* Diagnosis */}
                {visit.diagnosis ? (
                  <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/40">
                    <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-1">
                      Diagnosis {visit.diagnosis_code && <span className="text-blue-400">· {visit.diagnosis_code}</span>}
                    </p>
                    <p className="text-[13px] text-gray-900 dark:text-gray-100 font-medium">{visit.diagnosis}</p>
                  </div>
                ) : (
                  <EmptyBlock text="No diagnosis recorded." />
                )}

                {/* SOAP */}
                {(visit.subjective || visit.objective || visit.assessment || visit.plan) && (
                  <div className="space-y-2">
                    <SectionTitle>SOAP Notes</SectionTitle>
                    {[
                      { label: 'S — Subjective', value: visit.subjective },
                      { label: 'O — Objective', value: visit.objective },
                      { label: 'A — Assessment', value: visit.assessment },
                      { label: 'P — Plan', value: visit.plan },
                    ].filter(r => r.value).map(r => (
                      <div key={r.label} className="rounded-lg border border-gray-100 dark:border-gray-700/60 px-4 py-3">
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{r.label}</p>
                        <p className="text-[13px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{r.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {visit.notes && (
                  <div>
                    <SectionTitle>Notes</SectionTitle>
                    <p className="text-[13px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.notes}</p>
                  </div>
                )}

                {/* Referral */}
                {visit.referred_by && (
                  <div className="flex items-center gap-3 rounded-lg border border-purple-100 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-950/20 px-4 py-2.5">
                    <span className="text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wide">Referred by</span>
                    <span className="text-[13px] text-purple-800 dark:text-purple-300 font-medium">{visit.referred_by}</span>
                    {visit.referrer_phone && (
                      <span className="text-[12px] text-purple-500 dark:text-purple-400">{visit.referrer_phone}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {section === 'vitals' && <VitalsBlock vitals={visit.vitals} />} 
            {section === 'lab' && <LabBlock labRequests={visit.lab_requests} />}
            {section === 'prescriptions' && <RxBlock prescriptions={visit.prescriptions} />}
            {section === 'billing' && <BillBlock bill={visit.bill} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data, isLoading, isError, error, refetch } = usePatientDetail(id)

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header skeleton */}
        <div className="h-28 bg-gray-100 dark:bg-gray-700/50 rounded-2xl animate-pulse" />
        {/* Summary cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700/50 rounded-xl animate-pulse" />
          ))}
        </div>
        {/* Visit cards skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 p-8 text-center">
          <p className="text-[14px] font-semibold text-red-700 dark:text-red-400 mb-2">
            Failed to load patient record
          </p>
          <p className="text-[12px] text-red-500 dark:text-red-500 mb-4">{error?.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  // API returns the patient object flat — not wrapped
  const patient = data
  const visits = data.visits || []

  // Derive financial summary from flat response + visits
  const fin = {
    total_billed: data.total_billed || 0,
    unpaid_balance: data.unpaid_balance || 0,
    by_category: visits.reduce((acc, v) => {
      acc.consultation += v.bill?.consultation_fee || 0
      acc.lab += v.bill?.lab_fee || 0
      acc.medication += v.bill?.medication_fee || 0
      acc.procedure += v.bill?.procedure_fee || 0
      return acc
    }, { consultation: 0, lab: 0, medication: 0, procedure: 0 }),
  }

  // Derive lab summary from visits
  const allLabs = visits.flatMap(v => v.lab_requests || [])
  const lab = {
    total_tests: allLabs.reduce((s, r) => s + (r.items?.length || 0), 0),
    tests_ready: allLabs.filter(r => r.status === 'ready').length,
    tests_pending: allLabs.filter(r => r.status === 'pending' || r.status === 'in_progress').length,
    tests_flagged: allLabs.filter(r => r.is_flagged).length,
  }

  // Derive visit summary from visits
  const vs = {
    total: data.total_visits || 0,
    last_visit: visits[0]?.arrived_at || null,
    by_type: visits.reduce((acc, v) => {
      acc[v.visit_type] = (acc[v.visit_type] || 0) + 1
      return acc
    }, {}),
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Back + page title ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Patients
        </button>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <span className="text-[12px] text-gray-500 dark:text-gray-400">{patient?.name}</span>
      </div>

      {/* ── Patient header card ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-2xl font-bold shrink-0">
            {patient.name.charAt(0)}
          </div>

          {/* Core info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-[20px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {patient?.name}
                  {patient?.gender && (
                    <span className="text-gray-400 dark:text-gray-500 text-[16px]">
                      {GENDER_SYMBOL[patient.gender]}
                    </span>
                  )}
                </h1>
                <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Patient #{patient.id}
                  {patient.national_id && <> · ID {patient.national_id}</>}
                  {patient.age != null && <> · {patient.age} yrs</>}
                </p>
              </div>
              {/* Last visit */}
              {vs.last_visit && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Last visit</p>
                  <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">{fmtDate(vs.last_visit)}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{timeAgo(vs.last_visit)}</p>
                </div>
              )}
            </div>

            {/* Metadata chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              {patient.phone && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 px-2.5 py-1 rounded-lg">
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {patient.phone}
                </span>
              )}
              {patient.blood_group && (
                <span className="text-[12px] font-semibold px-2.5 py-1 rounded-lg border bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/40">
                  {patient.blood_group}
                </span>
              )}
              {patient.allergies && (
                <span className="text-[12px] px-2.5 py-1 rounded-lg border bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-800/40">
                  ⚠ {patient.allergies}
                </span>
              )}
              <span className="text-[11px] text-gray-400 dark:text-gray-500 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60">
                Registered {fmtDate(patient.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Visits"
          value={vs.total}
          sub={vs.last_visit ? `Last: ${fmtDate(vs.last_visit)}` : 'No visits yet'}
          color="blue"
        />
        <SummaryCard
          label="Total Billed"
          value={`KES ${fmt(fin.total_billed)}`}
          sub="across all visits"
          color="slate"
        />
        <SummaryCard
          label="Unpaid Balance"
          value={`KES ${fmt(fin.unpaid_balance)}`}
          sub={fin.unpaid_balance > 0 ? 'outstanding' : 'fully cleared'}
          color={fin.unpaid_balance > 0 ? 'amber' : 'green'}
        />
        <SummaryCard
          label="Lab Tests"
          value={lab.total_tests}
          sub={`${lab.tests_ready} ready · ${lab.tests_pending} pending${lab.tests_flagged > 0 ? ` · ${lab.tests_flagged} flagged` : ''}`}
          color={lab.tests_flagged > 0 ? 'red' : 'purple'}
        />
      </div>

      {/* ── Financial breakdown ── */}
      {fin.total_billed > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] p-5">
          <SectionTitle>Financial Breakdown</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Consultation', value: fin.by_category.consultation },
              { label: 'Lab Tests', value: fin.by_category.lab },
              { label: 'Medication', value: fin.by_category.medication },
              { label: 'Procedure', value: fin.by_category.procedure },
            ].filter(c => c.value > 0).map(c => (
              <div key={c.label} className="rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/40 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{c.label}</p>
                <p className="text-[14px] font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                  KES {fmt(c.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Visit type breakdown ── */}
      {Object.keys(vs.by_type).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(vs.by_type).map(([type, count]) => (
            <div
              key={type}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-medium ${VISIT_TYPE_COLORS[type] || ''}`}
            >
              <span>{VISIT_TYPE_LABELS[type]}</span>
              <span className="font-bold">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Visit history ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Visit History</h2>
          <span className="text-[12px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/40 px-2 py-0.5 rounded-full">
            {vs.total}
          </span>
        </div>

        {visits?.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/60 p-12 text-center">
            <p className="text-[14px] text-gray-400 dark:text-gray-500">No visits recorded for this patient.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map((v, i) => (
              <VisitCard
                key={v.id}
                visit={v}
                defaultOpen={i === 0}  // open the most recent visit by default
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}