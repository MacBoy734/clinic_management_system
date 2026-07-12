'use client'

// DispenseModal — review & confirm dispensing of a prescription
// Props:
//   prescription — full prescription object (patient + items[])
//   stock        — array of drugStock items, used to check availability per line
//   loading      — bool, true while PATCH is in-flight
//   onClose      — fn
//   onConfirm    — fn()  called after the user ticks the verification checkbox and clicks Confirm

import { useState } from 'react'
import { Icon, Badge, formatMoney, formatTime, cap, Spinner } from '@/utils/helpers'

// Match a prescription line to a stock item by the medication's first word
// (same heuristic the dispense API uses, so client + server agree)
function matchStockItem(medication, stock) {
  if (!medication || !stock?.length) return null
  const firstWord = medication.toLowerCase().split(' ')[0]
  return (
    stock.find(
      (s) =>
        s.name.toLowerCase().includes(firstWord) ||
        s.generic_name.toLowerCase().includes(firstWord)
    ) || null
  )
}

export function DispenseModal({ prescription, stock, loading, onClose, onConfirm }) {
  const [verified, setVerified] = useState(false)

  const items = prescription.items || []
  const totalCost = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0)

  const lineStatus = items.map((item) => {
    const si = matchStockItem(item.medication, stock)
    if (!si) return { item, si: null, available: 0, status: 'unknown' }
    if (si.current_stock === 0) return { item, si, available: 0, status: 'out' }
    if (si.current_stock < item.quantity) return { item, si, available: si.current_stock, status: 'insufficient' }
    return { item, si, available: si.current_stock, status: 'available' }
  })

  const hasStockIssues = lineStatus.some((l) => l.status !== 'available')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!verified || loading) return
    onConfirm()
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
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Review &amp; Dispense</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Prescription #{prescription.id}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
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
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{prescription.patient_name}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {prescription.patient_age}y · {cap(prescription.patient_gender)} · Prescribed by {prescription.prescribed_by} at {formatTime(prescription.prescribed_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Medication items */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Medication Items ({items.length})
            </p>
            {lineStatus.map(({ item, si, available, status }) => (
              <div key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.dosage} · {item.frequency} · {item.duration}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      Quantity:{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{item.quantity}</span>
                      {si && (
                        <span className="ml-2">
                          · In stock:{' '}
                          <span
                            className={[
                              'font-semibold',
                              status === 'out'
                                ? 'text-red-600 dark:text-red-400'
                                : status === 'insufficient'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400',
                            ].join(' ')}
                          >
                            {available}
                          </span>
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {status === 'out' && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Out of stock</Badge>}
                    {status === 'insufficient' && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Insufficient</Badge>}
                    {status === 'available' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Available</Badge>}
                    {status === 'unknown' && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">Not in inventory</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total cost */}
          <div className="px-5 pb-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#1a6cbf] dark:text-blue-400">Total Cost</span>
              <span className="text-lg font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">{formatMoney(totalCost)}</span>
            </div>
          </div>

          {/* Stock warning */}
          {hasStockIssues && (
            <div className="px-5 pb-3">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
                <Icon name="alert" size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Some items have insufficient stock. Please verify before dispensing — stock will go negative if confirmed.
                </p>
              </div>
            </div>
          )}

          {/* Verification checkbox */}
          <div className="px-5 pb-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#1a6cbf] focus:ring-[#1a6cbf]/40"
              />
              <span className="text-[12px] text-gray-700 dark:text-gray-300">
                I have verified the prescription and dispensed all items.
              </span>
            </label>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 bg-gray-50/50 dark:bg-[#1e293b]/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!verified || loading}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Spinner size={14} /> Dispensing…
                </>
              ) : (
                <>
                  <Icon name="check" size={14} /> Confirm Dispense
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}