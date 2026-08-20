'use client'

import { useState } from 'react'
import { Icon, Badge, formatMoney, formatTime, cap, Spinner } from '@/utils/helpers'

function matchStockItem(item, stock) {
  if (!item || !stock?.length) return null
  if (item.product_id) {
    return stock.find((s) => s.id === item.product_id) || null
  }
  const firstWord = (item.drug_name || '').toLowerCase().split(' ')[0]
  if (!firstWord) return null
  return (
    stock.find(
      (s) =>
        s.name.toLowerCase().includes(firstWord) ||
        (s.generic_name && s.generic_name.toLowerCase().includes(firstWord))
    ) || null
  )
}

export function DispenseModal({ prescription, stock, loading, onClose, onConfirm }) {
  const [verified, setVerified] = useState(false)
  const [partialAck, setPartialAck] = useState(false)

  if (!prescription) return null

  const items = prescription.items || []
  const totalCost = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0)

  // ── Preview only: best-effort based on last-fetched stock ───────────────
  const linePreview = items.map((item) => {
    const si = matchStockItem(item, stock)
    if (!si) return { item, si, available: 0, looksGood: false, note: 'Not in inventory' }
    if (si.current_stock === 0) return { item, si, available: 0, looksGood: false, note: 'Out of stock' }
    if (si.current_stock < item.quantity) return { item, si, available: si.current_stock, looksGood: false, note: `Low stock (${si.current_stock})` }
    return { item, si, available: si.current_stock, looksGood: true, note: 'In stock' }
  })

  const hasRisk = linePreview.some((l) => !l.looksGood)
  const allRisk = linePreview.every((l) => !l.looksGood)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!verified || loading) return
    if (hasRisk && !partialAck) return
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
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              Review &amp; Dispense
            </h3>
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

          {/* Stock risk banner */}
          {hasRisk && (
            <div className="px-5 pt-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon name="alert" size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-400">
                    Stock check required
                  </p>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {allRisk
                    ? 'All items appear unavailable based on the last stock check. The server will verify current stock levels when you confirm.'
                    : 'Some items may be unavailable. The server will verify current stock and issue what is available, declining the rest.'}
                </p>
                {linePreview.filter((l) => !l.looksGood).map((l) => (
                  <div key={l.item.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600 dark:text-gray-400">{l.item.medication}</span>
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                      {l.note}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medication items */}
          <div className="px-5 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Medication Items ({items.length})
              </p>
              <span className="text-[10px] text-gray-400 italic">Stock levels may have changed</span>
            </div>
            {linePreview.map(({ item, si, available, looksGood, note }) => (
              <div key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.dosage} · {item.frequency} · {item.duration}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      Qty needed:{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{item.quantity}</span>
                      {si && (
                        <span className="ml-2">
                          · Last checked:{' '}
                          <span
                            className={[
                              'font-semibold',
                              available === 0
                                ? 'text-red-600 dark:text-red-400'
                                : !looksGood
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
                    {looksGood ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Looks OK</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{note}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total cost */}
          <div className="px-5 pb-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#1a6cbf] dark:text-blue-400">
                Prescription value
              </span>
              <span className="text-lg font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">
                {formatMoney(totalCost)}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-right">
              Actual charge will be based on items successfully issued
            </p>
          </div>

          {/* Verification checkboxes */}
          <div className="px-5 pb-3 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#1a6cbf] focus:ring-[#1a6cbf]/40"
              />
              <span className="text-[12px] text-gray-700 dark:text-gray-300">
                I have verified the prescription and confirmed the quantities.
              </span>
            </label>

            {hasRisk && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={partialAck}
                  onChange={(e) => setPartialAck(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500/40"
                />
                <span className="text-[12px] text-amber-700 dark:text-amber-400">
                  I understand that some items may be declined by the server due to stock changes, and the patient will return to the doctor for alternatives.
                </span>
              </label>
            )}
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
              disabled={!verified || loading || (hasRisk && !partialAck)}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Spinner size={14} /> Processing…
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