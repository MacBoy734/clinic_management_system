'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Icon, Spinner, formatMoney, formatDateTime } from '@/utils/helpers'

const DISPOSITIONS = [
  { key: 'restock', label: 'Resaleable', active: 'bg-emerald-500 text-white border-emerald-500' },
  { key: 'writeoff', label: 'Write off', active: 'bg-red-500 text-white border-red-500' },
]

export default function ReturnModal({ sale, loading, onClose, onSubmit }) {
  const items = (sale.items || []).filter((i) => (i.returnable_qty ?? i.quantity) > 0)

  // sale_item_id -> { quantity, disposition }
  const [lines, setLines] = useState({})
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')

  function setQty(item, qty) {
    const max = item.returnable_qty ?? item.quantity
    const next = Math.max(0, Math.min(max, qty))
    setLines((prev) => {
      if (next === 0) {
        const { [item.id]: _drop, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [item.id]: { quantity: next, disposition: prev[item.id]?.disposition || 'restock' },
      }
    })
  }

  function setDisposition(itemId, disposition) {
    setLines((prev) =>
      prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], disposition } } : prev
    )
  }

  // Gross value of the selected lines, then scaled by the sale's discount so a
  // returned line refunds what was actually charged for it. The server derives
  // this independently — this is the cashier's preview.
  const grossRefund = items.reduce(
    (s, it) => s + (lines[it.id]?.quantity || 0) * it.unit_price,
    0
  )
  const discountRatio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1
  const estRefund = Math.round(grossRefund * discountRatio)

  // Debt first: whatever is still owed on this sale is cleared before any cash
  // leaves the drawer. You don't pay someone who still owes you for it.
  const creditOnSale = (sale.payments || [])
    .filter((p) => p.method === 'credit')
    .reduce((s, p) => s + p.amount, 0)
  const alreadyNoted = (sale.returns || []).reduce(
    (s, r) => s + (r.credit_note_amount || 0),
    0
  )
  const creditRemaining = Math.max(0, creditOnSale - alreadyNoted)
  const creditNote = Math.min(estRefund, creditRemaining)
  const cashBack = estRefund - creditNote

  const selectedCount = Object.keys(lines).length
  const writeoffCount = Object.values(lines).filter((l) => l.disposition === 'writeoff').length
  const canSubmit = selectedCount > 0 && reason.trim().length >= 3

  function handleSubmit(e) {
    e.preventDefault()
    if (selectedCount === 0) {
      toast.error('Select at least one line to return')
      return
    }
    if (reason.trim().length < 3) {
      toast.error('A reason of at least 3 characters is required')
      return
    }
    onSubmit({
      reason: reason.trim(),
      reference: reference.trim() || null,
      lines: Object.entries(lines).map(([saleItemId, l]) => ({
        sale_item_id: Number(saleItemId),
        quantity: l.quantity,
        disposition: l.disposition,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-xl rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
              <Icon name="arrowLeft" size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                Process Return
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {sale.receipt_number} · {sale.customer_name} · {formatDateTime(sale.sold_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {/* Lines */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              What is coming back
            </p>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700/60 px-4 py-6 text-center text-[12px] text-gray-400">
                Every line on this sale has already been returned.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
                {items.map((it) => {
                  const max = it.returnable_qty ?? it.quantity
                  const line = lines[it.id]
                  const qty = line?.quantity || 0
                  return (
                    <div key={it.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">
                            {it.name}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                            {formatMoney(it.unit_price)} · sold {it.quantity} {it.unit || ''}
                            {it.returned_qty > 0 && ` · ${it.returned_qty} already returned`}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(it, qty - 1)}
                            disabled={qty === 0}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(it, qty + 1)}
                            disabled={qty >= max}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30"
                          >
                            +
                          </button>
                          <span className="text-[10px] text-gray-400 w-10 text-right">of {max}</span>
                        </div>
                      </div>

                      {qty > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase tracking-widest text-gray-400 mr-1">
                            Condition
                          </span>
                          {DISPOSITIONS.map((d) => (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => setDisposition(it.id, d.key)}
                              className={[
                                'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                                line?.disposition === d.key
                                  ? d.active
                                  : 'bg-white dark:bg-[#1e293b] border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-gray-300',
                              ].join(' ')}
                            >
                              {d.label}
                            </button>
                          ))}
                          {line?.disposition === 'writeoff' && (
                            <span className="text-[10px] text-red-500 dark:text-red-400">
                              not returned to stock
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. wrong item dispensed; customer changed mind"
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                autoFocus
              />
            </div>

            {cashBack > 0 && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                  Reference
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional — M-Pesa reversal code, cash voucher no."
                  className="w-full h-9 px-3 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40"
                />
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="px-5 py-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                  Refund ({selectedCount} line{selectedCount === 1 ? '' : 's'})
                </span>
                <span className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {formatMoney(estRefund)}
                </span>
              </div>

              {creditNote > 0 && (
                <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400">
                  <span>Cleared off their outstanding debt</span>
                  <span className="tabular-nums">{formatMoney(creditNote)}</span>
                </div>
              )}
              {cashBack > 0 && (
                <div className="flex items-center justify-between text-[11px] text-gray-700 dark:text-gray-300 font-medium">
                  <span>Paid back to the customer</span>
                  <span className="tabular-nums">{formatMoney(cashBack)}</span>
                </div>
              )}
              {writeoffCount > 0 && (
                <div className="flex items-center justify-between text-[11px] text-red-600 dark:text-red-400 pt-1 border-t border-amber-200 dark:border-amber-900/60">
                  <span>
                    {writeoffCount} line{writeoffCount === 1 ? '' : 's'} written off
                  </span>
                  <span>not returned to stock</span>
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-400 mt-1.5">
              The final amounts are confirmed by the server. Nothing on the original sale changes — this
              is recorded as a separate return.
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 bg-gray-50/50 dark:bg-[#1e293b]/50">
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
              disabled={loading || !canSubmit}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Spinner size={14} /> Processing…</>
              ) : (
                <><Icon name="check" size={14} /> Confirm Return</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}