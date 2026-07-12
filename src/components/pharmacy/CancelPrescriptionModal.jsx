'use client'

// CancelPrescriptionModal — confirm cancelling a prescription
// Used by the pharmacist QueueTab when a client declines medication at the pharmacy.
//
// Props:
//   prescription — full prescription object (patient + items[])
//   loading      — bool, true while PATCH /cancel is in-flight
//   onClose      — fn
//   onConfirm    — fn(reason)  called with the entered reason

import { useState } from 'react'
import { Icon, Badge, formatMoney, formatTime, cap, Spinner } from '@/utils/helpers'

const SUGGESTIONS = [
  'Client declined medication',
  'Client could not afford the medication',
  'Out of stock — client chose to buy elsewhere',
  'Client reported allergy to the medication',
  'Client wanted to consult another doctor first',
]

export function CancelPrescriptionModal({ prescription, loading, onClose, onConfirm }) {
  const [reason, setReason] = useState('Client declined medication')

  const items = prescription.items || []
  const totalCost = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (loading || !reason.trim()) return
    onConfirm(reason.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <Icon name="xCircle" size={16} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Cancel Prescription</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Prescription #{prescription.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {/* Patient header */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
                <span className="text-[13px] font-semibold text-white">
                  {prescription.patient_name?.charAt(0) || 'P'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  {prescription.patient_name}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {prescription.patient_age}y · {cap(prescription.patient_gender)} · Prescribed by{' '}
                  {prescription.prescribed_by} at {formatTime(prescription.prescribed_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Medication items being cancelled */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Medications ({items.length}) · {formatMoney(totalCost)} will be removed from the bill
            </p>
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {item.dosage} · {item.frequency} · {item.duration} · Qty {item.quantity}
                  </p>
                </div>
                <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
                  to cancel
                </Badge>
              </div>
            ))}
          </div>

          {/* Warning banner */}
          <div className="px-5 pb-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
              <Icon name="alert" size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Cancelling removes the medication fee from the patient&rsquo;s bill and moves them straight to
                billing. This cannot be undone.
              </p>
            </div>
          </div>

          {/* Reason input */}
          <div className="px-5 pb-3">
            <label
              htmlFor="cancel-reason"
              className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"
            >
              Why is this prescription being cancelled?
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Enter the cancellation reason…"
              className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:border-red-400 resize-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
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
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 bg-gray-50/50 dark:bg-[#1e293b]/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20"
            >
              Keep Prescription
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Spinner size={14} /> Cancelling…
                </>
              ) : (
                <>
                  <Icon name="xCircle" size={14} /> Confirm Cancel
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}