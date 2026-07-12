'use client'

// RestockModal — restock a drug with a quantity + new batch number
// Props:
//   item     — drugStock row
//   loading  — bool, true while PATCH is in-flight
//   onClose  — fn
//   onConfirm — fn(item, quantity, batchNumber)

import { useState, useEffect } from 'react'
import { Icon, formatMoney, cap, Spinner } from '@/utils/helpers'

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

export function RestockModal({ item, loading, onClose, onConfirm }) {
  const [quantity, setQuantity] = useState(Math.max(1, item.reorder_level * 2))
  const [batchNumber, setBatchNumber] = useState(item.batch_number || '')

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  const newStock = (item.current_stock || 0) + (Number(quantity) || 0)
  const newValue = newStock * (item.unit_price || 0)
  const qty = Number(quantity) || 0
  const valid = qty > 0 && batchNumber.trim().length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!valid || loading) return
    onConfirm(item, qty, batchNumber.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={loading ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Restock Drug</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.name}</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Current stock summary */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 p-3 space-y-1.5">
            <Row label="Current stock" value={`${item.current_stock} ${item.unit}`} />
            <Row label="Reorder level" value={`${item.reorder_level} ${item.unit}`} />
            <Row label="Unit price" value={formatMoney(item.unit_price)} />
            <Row label="Supplier" value={item.supplier || '—'} />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Quantity to add *
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputCls}
            />
            <div className="flex items-center gap-2 mt-2">
              {[10, 50, 100, 200].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  +{q}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, item.reorder_level * 2))}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
              >
                2× reorder
              </button>
            </div>
          </div>

          {/* Batch number */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              New Batch Number *
            </label>
            <input
              type="text"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. AMX2025-05"
              className={inputCls}
            />
            <p className="text-[10px] text-gray-400 mt-1">Previous batch: {item.batch_number || '—'}</p>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 space-y-1.5">
            <Row label="New stock level" value={`${newStock} ${item.unit}`} highlight />
            <Row label="New stock value" value={formatMoney(newValue)} highlight />
            <Row label="Form / Strength" value={`${cap(item.form)} · ${item.strength}`} />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700/60">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || loading}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Spinner size={14} /> Restocking…
                </>
              ) : (
                <>
                  <Icon name="plus" size={14} /> Restock
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Row({ label, value, highlight = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={[
          'text-[12px] font-semibold tabular-nums',
          highlight ? 'text-[#1a6cbf] dark:text-blue-400' : 'text-gray-900 dark:text-gray-100',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}