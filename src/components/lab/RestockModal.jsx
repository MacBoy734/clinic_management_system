'use client'

// RestockModal — add quantity to a lab stock item
// PATCH /api/lab/stock { id, quantity }

import { useState, useEffect } from 'react'
import { Spinner, Icon, formatMoney } from '@/utils/helpers'

const QUICK_VALUES = [10, 25, 50, 100]

export function RestockModal({ item, loading, onClose, onConfirm }) {
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  const newStock = (item.current_stock || 0) + qty
  const cost = qty * (item.unit_cost || 0)
  const valid = qty > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!valid || loading) return
    onConfirm(item, qty)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !loading && onClose()}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#1a6cbf]/10 text-[#1a6cbf] dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Icon name="box" size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">Restock Item</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{item.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Current stock info */}
          <div className="grid grid-cols-3 gap-2">
            <InfoCell label="Current" value={`${item.current_stock}`} sub={item.unit} />
            <InfoCell label="Reorder At" value={`${item.reorder_level}`} sub={item.unit} />
            <InfoCell label="Unit Cost" value={formatMoney(item.unit_cost)} sub={`per ${item.unit.replace(/s$/, '')}`} />
          </div>

          {/* Quantity input */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Quantity to add
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 text-[15px] font-semibold rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf] tabular-nums"
            />
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {QUICK_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQuantity(v)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60"
                >
                  +{v}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {valid && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500 dark:text-gray-400">New stock level</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {item.current_stock} + {qty} = <span className="text-[#1a6cbf] dark:text-blue-400">{newStock}</span> {item.unit}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500 dark:text-gray-400">Cost of restock</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(cost)}</span>
              </div>
              {newStock > item.reorder_level && item.current_stock <= item.reorder_level && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1">
                  <Icon name="check" size={11} /> Will be above reorder level after restock
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !valid}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner size={13} /> : <Icon name="plus" size={14} />}
              Confirm Restock
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InfoCell({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-2.5 py-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">{value}</p>
      <p className="text-[9px] text-gray-400">{sub}</p>
    </div>
  )
}
