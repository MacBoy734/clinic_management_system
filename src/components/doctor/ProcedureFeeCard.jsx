'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/doctor/visits/:id/procedure-fee
// Body: { procedure_fee }
// ─────────────────────────────────────────────────────────────────────────────
function useSetProcedureFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ visitId, procedure_fee }) =>
      api.patch(`/api/doctor/visits/${visitId}/procedure-fee`, { procedure_fee }),
    onSuccess: (_, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['doctor', 'visit', visitId] })
      qc.invalidateQueries({ queryKey: ['doctor', 'queue'] })
    },
  })
}

const inputCls = 'w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors font-mono'
const labelCls = 'block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1'

const VISIT_TYPE_LABELS = {
  injection: 'Injection',
  family_planning: 'Family planning',
}

/**
 * ProcedureFeeCard
 *
 * For injection / family_planning visits only. Doctor negotiates a price
 * with the patient and enters it freehand — no charge template, no
 * predefined list. Until a non-zero fee is saved, this visit cannot be
 * forwarded to billing (mirrors the server-side guard in forwardVisit).
 *
 * Props:
 *   visit        — full Visit object (needs id, visit_type, bill.procedure_fee)
 *   onFeeUpdated — optional callback(newFee) after a successful save
 */
export default function ProcedureFeeCard({ visit, onFeeUpdated }) {
  const isProcedureVisit = ['injection', 'family_planning'].includes(visit.visit_type)
  const currentFee = visit.bill?.procedure_fee ?? 0
  const isSet = currentFee > 0

  const [amount, setAmount] = useState(isSet ? String(currentFee) : '')
  const [error, setError] = useState('')

  const setFeeMut = useSetProcedureFee()

  if (!isProcedureVisit) return null

  const handleSave = async () => {
    const value = Number(amount)

    if (!amount || Number.isNaN(value) || value <= 0) {
      setError('Enter an amount greater than 0')
      return
    }
    setError('')

    try {
      await setFeeMut.mutateAsync({ visitId: visit.id, procedure_fee: value })
      onFeeUpdated?.(value)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save fee — try again')
    }
  }

  return (
    <div className={`rounded-xl border p-4 transition-colors ${isSet
        ? 'border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/40 dark:bg-emerald-900/10'
        : 'border-amber-200 dark:border-amber-700/40 bg-amber-50/40 dark:bg-amber-900/10'
      }`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">
            Procedure fee — {VISIT_TYPE_LABELS[visit.visit_type]}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            Negotiated with the patient, not from a price list
          </p>
        </div>
        {isSet && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40 shrink-0">
            Set
          </span>
        )}
        {!isSet && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40 shrink-0">
            Required to forward
          </span>
        )}
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className={labelCls}>Amount (KES)</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }}
            placeholder="e.g. 800"
            className={inputCls}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={setFeeMut.isPending}
          className="h-8.5 px-4 rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white text-[12px] font-semibold transition-colors disabled:opacity-50 shrink-0"
        >
          {setFeeMut.isPending ? 'Saving…' : isSet ? 'Update fee' : 'Set fee'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400 mt-2">{error}</p>
      )}

      {/* Confirmed amount readout */}
      {isSet && !error && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
          Current fee: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">KES {currentFee.toLocaleString()}</span>
        </p>
      )}
    </div>
  )
}

/**
 * Helper to use alongside the Forward button on the doctor consultation
 * screen. Pass the same `visit` object in. Returns whether forwarding
 * should be blocked, and why — so the Forward button can disable itself
 * and show a tooltip/message without duplicating this logic.
 *
 * Usage:
 *   const { blocked, reason } = getForwardGate(visit)
 *   <button disabled={blocked} title={reason}>Forward</button>
 */
export function getForwardGate(visit) {
  const isProcedureVisit = ['injection', 'family_planning'].includes(visit.visit_type)
  const fee = visit.bill?.procedure_fee ?? 0

  if (isProcedureVisit && fee <= 0) {
    return {
      blocked: true,
      reason: 'Set the procedure fee before forwarding this visit',
    }
  }

  return { blocked: false, reason: '' }
}