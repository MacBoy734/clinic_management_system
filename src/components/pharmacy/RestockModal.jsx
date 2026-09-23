'use client'
import { useState, useEffect } from 'react'
import { Icon, formatMoney, cap, Spinner, formatDate } from '@/utils/helpers'

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

const CATEGORY_LABELS = {
  medication: 'Medication',
  consumable: 'Consumable',
  general: 'General',
}

// 'YYYY-MM-DD' for <input type="date">
function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10)
}

export function RestockModal({
  item,
  pending = null,
  loading,
  expiryRequired = false,
  onClose,
  onConfirm,
}) {
  const suggestedQty = Math.max(1, (Number(item.reorder_level) || 0) * 2)
  const [quantity, setQuantity] = useState(suggestedQty)
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  const isMedication = item.category === 'medication'
  const qty = parseInt(quantity) || 0
  const today = isoDay(Date.now())

  const projectedStock = (item.current_stock || 0) + qty
  // At COST. `unit_cost` is what the clinic pays; unit_price is retail.
  const unitCost = item.unit_cost || 0
  const projectedValue = projectedStock * unitCost

  const expiryTime = expiryDate ? new Date(expiryDate).getTime() : NaN
  const expiryEntered = expiryDate.trim().length > 0
  const expiryValid = Number.isFinite(expiryTime)
  const expiryPast = expiryValid && expiryDate <= today
  // Not a blocker — short-dated stock is sometimes accepted knowingly.
  const expirySoon = expiryValid && !expiryPast &&
    (expiryTime - Date.now()) / 86400000 <= 90
  const expiryOk = expiryRequired
    ? (expiryEntered && expiryValid && !expiryPast)
    : (!expiryEntered || (expiryValid && !expiryPast))

  const valid = !pending && qty > 0 && expiryOk

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!valid || loading) return
    onConfirm(item, {
      quantity: qty,
      expiryDate: expiryDate || null,
      notes: notes.trim(),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={loading ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Request Restock</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
              {item.name}
              {item.category ? ` · ${CATEGORY_LABELS[item.category] || cap(item.category)}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Already-open request for this item */}
          {pending && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
              <Icon name="clock" size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                <span className="font-semibold">A request for this item is already awaiting approval.</span>{' '}
                {pending.requested_qty} {item.unit} requested by {pending.requested_by} on{' '}
                {formatDate(pending.requested_at)}. Wait for the admin to verify it before raising another.
              </p>
            </div>
          )}

          {/* Current stock summary */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 p-3 space-y-1.5">
            <Row label="Current stock" value={`${item.current_stock} ${item.unit}`} />
            <Row label="Reorder level" value={`${item.reorder_level} ${item.unit}`} />
            <Row label="Unit cost" value={formatMoney(unitCost)} />
            <Row label="Retail price" value={formatMoney(item.normal_price || 0)} />
            {item.sub_category && <Row label="Sub-category" value={cap(item.sub_category)} />}
            <Row label="Supplier" value={item.supplier || '—'} />
            <Row label="Current batch" value={item.batch_number || '—'} />
            <Row
              label="Current expiry"
              value={item.expiry_date ? formatDate(item.expiry_date) : '—'}
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Quantity to request *
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!!pending}
              className={`${inputCls} disabled:opacity-50`}
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {[10, 50, 100, 200].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q)}
                  disabled={!!pending}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuantity(suggestedQty)}
                disabled={!!pending}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
              >
                2× reorder
              </button>
            </div>
          </div>

          {/* Expiry date — optional unless the caller demands it */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Expiry date {expiryRequired ? '*' : <span className="font-normal text-gray-400">(if known)</span>}
            </label>
            <input
              type="date"
              value={expiryDate}
              min={today}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={!!pending}
              className={`${inputCls} disabled:opacity-50`}
            />
            {expiryPast ? (
              <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                <Icon name="alert" size={11} className="shrink-0" />
                Expiry must be a future date. Do not request stock that is already expired.
              </p>
            ) : expirySoon ? (
              <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                <Icon name="alert" size={11} className="shrink-0" />
                Short-dated — expires within 90 days. Note the reason below if this is intentional.
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-1">
                {expiryRequired
                  ? 'Expiry of the incoming batch. Applied to the stock row on approval.'
                  : 'Leave blank unless the supplier has already confirmed it — the admin records the real expiry on receipt.'}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Urgent — three days of cover left. Supplier quoted Friday delivery."
              disabled={!!pending}
              className={`${inputCls} resize-none disabled:opacity-50`}
            />
          </div>

          {/* Preview — explicitly conditional, stock has not moved */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1a6cbf] dark:text-blue-400">
              If approved in full
            </p>
            <Row label="Stock level would become" value={`${projectedStock} ${item.unit}`} highlight />
            <Row label="Stock value would become" value={`${formatMoney(projectedValue)} at cost`} highlight />
            {/* Medication-only. A box of gloves has no form or strength. */}
            {isMedication && (item.form || item.strength) && (
              <Row
                label="Form / Strength"
                value={[cap(item.form), item.strength].filter(Boolean).join(' · ')}
              />
            )}
            {isMedication && item.generic_name && (
              <Row label="Generic name" value={item.generic_name} />
            )}
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 px-3 py-2 flex items-start gap-2">
            <Icon name="info" size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Submitting sends this to the admin for verification. Stock, batch, and expiry update only when
              the admin confirms how many units arrived — which may be fewer than requested.
            </p>
          </div>
        </form>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || loading}
            title={pending ? 'A request for this item is already awaiting approval' : undefined}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Spinner size={14} /> Submitting…
              </>
            ) : (
              <>
                <Icon name="send" size={14} /> Submit Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span
        className={[
          'text-[12px] font-semibold tabular-nums truncate',
          highlight ? 'text-[#1a6cbf] dark:text-blue-400' : 'text-gray-900 dark:text-gray-100',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}