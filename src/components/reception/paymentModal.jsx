'use client'

import { useState, useMemo, useEffect } from 'react'
import { Icon, formatMoney } from '@/utils/helpers'
import toast from 'react-hot-toast'
import { paymentModalSchema } from '@/lib/validation'

const METHODS = [
  { value: 'cash', label: 'Cash', icon: 'dollarSign' },
  { value: 'mpesa', label: 'M-Pesa', icon: 'smartphone' },
  { value: 'insurance', label: 'Insurance', icon: 'shield' },
  { value: 'other', label: 'Other', icon: 'creditCard' },
]

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]'

let LINE_KEY = 0

export function PaymentModal({ visit, title, description, amount, stage = 2, loading, onClose, onConfirm, onWaive }) {
  const outstanding = Math.max(0, Number(amount) || 0)

  // ── Mode: 'payment' | 'waive' ────────────────────────────────────
  const [mode, setMode] = useState('payment')
  const [waiveReason, setWaiveReason] = useState('')

  // Payment lines
  const [lines, setLines] = useState([
    { key: ++LINE_KEY, method: 'cash', amount: String(outstanding), reference: '' },
  ])
  const [discount, setDiscount] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  const discountNum = stage === 2 ? Math.max(0, parseInt(discount) || 0) : 0
  const payable = Math.max(0, outstanding - discountNum)

  const linesSum = useMemo(
    () => lines.reduce((s, l) => s + (parseInt(l.amount) || 0), 0),
    [lines]
  )
  const remaining = payable - linesSum

  const canWaive = stage === 1 && onWaive && visit?.visit_type === 'consultation'

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  // Reset waive reason when switching to payment
  useEffect(() => {
    if (mode === 'payment') setWaiveReason('')
  }, [mode])

  const updateLine = (key, field, value) =>
    setLines((arr) => arr.map((l) => (l.key === key ? { ...l, [field]: value } : l)))

  const addLine = () =>
    setLines((arr) => [
      ...arr,
      { key: ++LINE_KEY, method: 'mpesa', amount: remaining > 0 ? String(remaining) : '', reference: '' },
    ])

  const removeLine = (key) => setLines((arr) => arr.filter((l) => l.key !== key))

  const consumeRemaining = () => {
    if (remaining === 0 || !lines.length) return
    const last = lines[lines.length - 1]
    const newAmount = (parseInt(last.amount) || 0) + remaining
    if (newAmount < 0) return
    updateLine(last.key, 'amount', String(newAmount))
  }

  const handleDiscountChange = (v) => {
    setDiscount(v)
    const d = Math.max(0, parseInt(v) || 0)
    const newPayable = Math.max(0, outstanding - d)
    setLines([{ key: ++LINE_KEY, method: lines[0]?.method || 'cash', amount: String(newPayable), reference: '' }])
  }

  const discountTooBig = discountNum > outstanding
  const discountNeedsReason = discountNum > 0 && !discountReason.trim()
  const invalidLine = lines.some((l) => !((parseInt(l.amount) || 0) > 0))
  const canSubmit =
    !loading && payable >= 0 && remaining === 0 && !invalidLine &&
    !discountTooBig && !discountNeedsReason &&
    (payable > 0 || discountNum > 0)

  const handleSubmit = () => {
    if (!canSubmit) return

    const payload = {
      payments: lines
        .filter((l) => (parseInt(l.amount) || 0) > 0)
        .map((l) => ({
          method: l.method,
          amount: parseInt(l.amount),
          reference: l.reference.trim() || null,
        })),
      discount_amount: discountNum,
      discount_reason: discountNum > 0 ? discountReason.trim() : null,
    }

    const result = paymentModalSchema.safeParse(payload)
    if (!result.success) {
      const message = result.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ')
      toast.error(message)
      return
    }

    onConfirm(result.data)
  }

  const handleWaiveSubmit = () => {
    const reason = waiveReason.trim()
    if (!reason) {
      toast.error('Reason is required to waive the fee')
      return
    }
    onWaive({ reason })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !loading && onClose()}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title || 'Collect Payment'}</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {visit?.patient_name} {description ? `· ${description}` : ''}
            </p>
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

          {/* Mode toggle — stage 1 consultation only */}
          {canWaive && (
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('payment')}
                className={[
                  'flex-1 px-3 py-1.5 text-[12px] font-medium transition-colors',
                  mode === 'payment'
                    ? 'bg-[#1a6cbf] text-white'
                    : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20',
                ].join(' ')}
              >
                Collect Payment
              </button>
              <button
                type="button"
                onClick={() => setMode('waive')}
                className={[
                  'flex-1 px-3 py-1.5 text-[12px] font-medium transition-colors',
                  mode === 'waive'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20',
                ].join(' ')}
              >
                Waive Fee
              </button>
            </div>
          )}

          {mode === 'waive' ? (
            /* ── Waive form ─────────────────────────────────────────── */
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-400">
                    Waive Consultation Fee
                  </p>
                  <span className="text-[15px] font-bold text-amber-800 dark:text-amber-400 tabular-nums">
                    {formatMoney(outstanding)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400/80">
                  {visit?.patient_name} will be forwarded to the doctor without paying the consultation fee.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  placeholder="e.g. Staff patient, emergency, VIP"
                  rows={3}
                  className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-500 resize-none"
                />
              </div>
            </div>
          ) : (
            /* ── Payment form (unchanged) ───────────────────────────── */
            <>
              {/* Outstanding */}
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outstanding balance</span>
                <span className="text-[15px] font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(outstanding)}</span>
              </div>

              {/* Discount — stage 2 only */}
              {stage === 2 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Discount (optional)
                    </label>
                    {discountNum > 0 && !discountTooBig && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        − {formatMoney(discountNum)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={outstanding}
                    step="1"
                    value={discount}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    placeholder="0"
                    className={`${inputCls} tabular-nums`}
                  />
                  {discountTooBig && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                      Discount cannot exceed the outstanding balance ({formatMoney(outstanding)}).
                    </p>
                  )}
                  {discountNum > 0 && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Reason (required)
                      </label>
                      <input
                        type="text"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="e.g. Staff family, waived by Dr. Mwangi"
                        className={inputCls}
                      />
                    </div>
                  )}
                  {discountNum > 0 && !discountTooBig && (
                    <div className="flex items-center justify-between text-[12px] pt-1 border-t border-gray-100 dark:border-gray-700/40">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Payable after discount</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(payable)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Payment lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Payment method{lines.length > 1 ? 's' : ''}
                  </label>
                  <button
                    type="button"
                    onClick={consumeRemaining}
                    disabled={remaining === 0}
                    title={remaining !== 0 ? 'Click to pour the remainder into the last line' : undefined}
                    className={[
                      'text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full transition-colors',
                      remaining === 0
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-default'
                        : remaining > 0
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200',
                    ].join(' ')}
                  >
                    {remaining === 0
                      ? 'Settled ✓'
                      : remaining > 0
                        ? `${formatMoney(remaining)} remaining`
                        : `${formatMoney(-remaining)} over`}
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((l) => {
                    const usedElsewhere = new Set(
                      lines.filter((ln) => ln.key !== l.key).map((ln) => ln.method)
                    )

                    return (
                      <div key={l.key} className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          {/* Method selector */}
                          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden">
                            {METHODS.map((m, mi) => {
                              const disabled = usedElsewhere.has(m.value)
                              return (
                                <button
                                  key={m.value}
                                  type="button"
                                  onClick={() => !disabled && updateLine(l.key, 'method', m.value)}
                                  disabled={disabled}
                                  title={disabled ? 'Already used in another line' : m.label}
                                  className={[
                                    'px-2 py-1.5 text-[11px] font-medium flex items-center gap-1 transition-colors',
                                    mi > 0 ? 'border-l border-gray-200 dark:border-gray-700/60' : '',
                                    l.method === m.value
                                      ? 'bg-[#1a6cbf] text-white'
                                      : disabled
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                        : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20',
                                  ].join(' ')}
                                >
                                  {m.label}
                                </button>
                              )
                            })}
                          </div>
                          {/* Amount */}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={l.amount}
                            onChange={(e) => updateLine(l.key, 'amount', e.target.value)}
                            placeholder="Amount"
                            className={`${inputCls} flex-1 tabular-nums`}
                          />
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(l.key)}
                              title="Remove this payment"
                              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          )}
                        </div>
                        {/* Reference */}
                        {l.method !== 'cash' && (
                          <input
                            type="text"
                            value={l.reference}
                            onChange={(e) => updateLine(l.key, 'reference', e.target.value)}
                            placeholder={l.method === 'mpesa' ? 'M-Pesa code (e.g. SBK4XY123)' : 'Reference / claim number'}
                            className={inputCls}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <button
                  type="button"
                  onClick={addLine}
                  className="mt-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-[#1a6cbf] hover:text-[#1a6cbf] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Icon name="plus" size={13} /> Split with another method
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 shrink-0 flex items-center justify-between gap-3">
          {mode === 'waive' ? (
            <>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                Waiving <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(outstanding)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWaiveSubmit}
                  disabled={loading || !waiveReason.trim()}
                  title={!waiveReason.trim() ? 'Enter a reason to waive the fee' : undefined}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="slash" size={14} />}
                  Waive Fee
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                Collecting <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(linesSum)}</span>
                {discountNum > 0 && !discountTooBig && (
                  <> · discount <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{formatMoney(discountNum)}</span></>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                title={
                  remaining !== 0 ? 'Payments must settle the balance exactly'
                    : discountNeedsReason ? 'Enter a reason for the discount'
                      : undefined
                }
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
                Collect {formatMoney(linesSum)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}