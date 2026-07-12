'use client'

// PaymentModal — reusable payment collection modal
// Used for both Stage 1 (consultation) and Stage 2 (lab+medication+procedure) payments

import { useState } from 'react'
import { Icon, formatMoney, PAYMENT_METHODS} from '@/utils/helpers'
import { Spinner } from '@/utils/helpers'

export function PaymentModal({ visit, title, description, amount, loading, onClose, onConfirm }) {
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm(visit, method, reference || null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Patient + description */}
          <div>
            <p className="text-[11px] text-gray-400">Patient</p>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{visit.patient_name}</p>
            {description && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
          </div>

          {/* Bill items (if stage 2) */}
          {visit.items && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-50 dark:divide-gray-700/40">
              {visit.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[13px] text-gray-700 dark:text-gray-200">{item.name}</span>
                  <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(item.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Amount */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#1a6cbf] dark:text-blue-400">Amount Due</span>
            <span className="text-lg font-bold text-[#1a6cbf] dark:text-blue-400 tabular-nums">{formatMoney(amount)}</span>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className={['px-2 py-2 rounded-lg text-[11px] font-semibold capitalize transition-colors',
                    method === m ? 'bg-[#1a6cbf] text-white' : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400'].join(' ')}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Reference (for mpesa/insurance) */}
          {(method === 'mpesa' || method === 'insurance') && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {method === 'mpesa' ? 'M-Pesa Reference' : 'Insurance Reference'}
              </label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder={method === 'mpesa' ? 'e.g. QGH7XK2P9' : 'Policy / claim number'}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]" />
            </div>
          )}

          {/* Actions */}
          <button type="submit" disabled={loading}
            className="w-full h-9 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <><Spinner size={14} /> Processing…</> : `Collect ${formatMoney(amount)}`}
          </button>
        </form>
      </div>
    </div>
  )
}
