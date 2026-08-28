'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Icon, formatDate, formatTime, formatMoney, cap, Spinner } from '@/utils/helpers'

export function ReceiptModal({ bill, onClose }) {
  const [printing, setPrinting] = useState(false)

  const clinicQuery = useQuery({
    queryKey: ['admin', 'settings', 'receipt'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 300000,
  })
  const clinic = clinicQuery.data?.settings || {}

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !printing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [printing, onClose])

  const handlePrint = () => {
    setPrinting(true)
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done, { once: true })
    setTimeout(() => window.print(), 50)
  }

  // ── Use backend-computed values ─────────────────────────────────
  const total = bill.effective_total ?? bill.total_amount ?? 0
  const discount = bill.discount_amount || 0
  const payable = bill.payable_amount ?? Math.max(0, total - discount)
  const paid = bill.paid_amount || 0
  const balance = Math.max(0, payable - paid)

  // PAID = money actually changed hands
  const isPaid = (bill.status === 'paid' || bill.fee_status === 'paid') && paid > 0
  // WAIVED = nothing to pay (all fees waived)
  const isWaived = bill.status === 'waived' || bill.fee_status === 'waived'
  // PARTIAL = some paid, some waived (e.g. consultation paid, stage 2 waived)
  const isPartial = paid > 0 && (bill.stage2_status === 'waived' || bill.consultation_fee_status === 'waived')

  const payments = bill.payments || []
  const items = bill.items || []
  const receiptDate = new Date()
  const receiptId = `RCP-${bill.visit_id}-${receiptDate.getFullYear()}${String(receiptDate.getMonth() + 1).padStart(2, '0')}${String(receiptDate.getDate()).padStart(2, '0')}`

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
  @media print {
    body * { visibility: hidden !important; }
    #receipt-print, #receipt-print * { visibility: visible !important; }

    #receipt-wrapper {
      position: static !important;
      max-width: none !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      background: transparent !important;
    }

    #receipt-print {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 20px !important;
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      background: white !important;
    }

    .no-print { display: none !important; }
    @page { margin: 1.5cm; }
  }
`}} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !printing && onClose()}>
<div id="receipt-wrapper" className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-xl bg-white text-gray-900 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>          {/* Header */}
          <div className="no-print flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><Icon name="receipt" size={16} /></div>
              <div>
                <h3 className="text-[14px] font-semibold text-gray-900">Payment Receipt</h3>
                <p className="text-[11px] text-gray-500">{bill.patient_name} · Visit #{bill.visit_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"><Icon name="printer" size={14} /> Print</button>
              <button onClick={onClose} disabled={printing} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 disabled:opacity-50"><Icon name="x" size={16} /></button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-white" id="receipt-print">
            {clinicQuery.isLoading ? (
              <div className="flex items-center justify-center py-20"><Spinner size={20} /></div>
            ) : (
              <div className="p-8 text-gray-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                {/* Letterhead */}
                <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
                  <h1 className="text-[20px] font-bold tracking-tight">{clinic.name || 'City Health Clinic'}</h1>
                  <p className="text-[11px] text-gray-600 mt-0.5">{clinic.address || 'Moi Rd, Kitui Town, Kenya'}</p>
                  <p className="text-[11px] text-gray-600">Tel: {clinic.phone || '+254 700 000 000'}{clinic.email && ` · ${clinic.email}`}</p>
                </div>

                {/* Receipt title */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Payment Receipt</p>
                    <p className="text-[12px] font-semibold text-gray-900 mt-0.5">Receipt #: {receiptId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-600">Date: {formatDate(receiptDate.toISOString())}</p>
                    <p className="text-[11px] text-gray-600">Time: {formatTime(receiptDate.toISOString())}</p>
                  </div>
                </div>

                {/* Patient details */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mb-4 pb-3 border-b border-gray-200">
                  <div className="flex"><span className="text-gray-500 w-20 shrink-0">Patient:</span><span className="font-medium text-gray-900">{bill.patient_name}</span></div>
                  <div className="flex"><span className="text-gray-500 w-20 shrink-0">Visit ID:</span><span className="font-medium text-gray-900">V-{bill.visit_id}</span></div>
                  <div className="flex"><span className="text-gray-500 w-20 shrink-0">Visit Type:</span><span className="font-medium text-gray-900">{bill.visit_type === 'family_planning' ? 'Family Planning' : bill.visit_type === 'direct_lab' ? 'Direct Lab' : cap(bill.visit_type || '—')}</span></div>
                  <div className="flex"><span className="text-gray-500 w-20 shrink-0">Date:</span><span className="font-medium text-gray-900">{formatDate(bill.created_at)} · {formatTime(bill.created_at)}</span></div>
                </div>

                {/* Bill items */}
                <table className="w-full text-[12px] border-collapse mb-3">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-gray-500">
                      <th className="py-1.5 pr-3 font-semibold uppercase tracking-wider text-[10px]">Description</th>
                      <th className="py-1.5 pl-3 font-semibold uppercase tracking-wider text-[10px] text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const waived = item.status === 'waived'
                      return (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-1.5 pr-3 text-gray-800">
                            {item.name}
                            {waived && (
                              <span className="ml-1.5 text-[10px] font-medium text-amber-600">(Waived)</span>
                            )}
                          </td>
                          <td className="py-1.5 pl-3 text-right tabular-nums">
                            {waived ? (
                              <span className="text-amber-600 font-medium text-[11px]">Waived</span>
                            ) : (
                              <span className="text-gray-800">{formatMoney(item.amount || 0)}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-400">
                      <td className="py-2 pr-3 font-bold text-gray-900 uppercase tracking-wider text-[11px]">Total Bill</td>
                      <td className="py-2 pl-3 font-bold text-gray-900 text-right tabular-nums text-[14px]">{formatMoney(total)}</td>
                    </tr>
                    {discount > 0 && (
                      <>
                        <tr>
                          <td className="py-1.5 pr-3 text-gray-700 text-[11px]">
                            Discount{bill.discount_reason ? ` — ${bill.discount_reason}` : ''}
                          </td>
                          <td className="py-1.5 pl-3 text-gray-700 text-right tabular-nums">− {formatMoney(discount)}</td>
                        </tr>
                        <tr className="border-t border-gray-300">
                          <td className="py-2 pr-3 font-bold text-gray-900 uppercase tracking-wider text-[11px]">Amount Payable</td>
                          <td className="py-2 pl-3 font-bold text-gray-900 text-right tabular-nums text-[14px]">{formatMoney(payable)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {/* Payment details */}
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-2">Payment Details</p>
                  {payments.length > 0 ? (
                    <div className="space-y-1">
                      {payments.map((pmt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[12px] px-2 py-1 rounded bg-gray-50">
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-gray-700 uppercase text-[11px]">{pmt.method}</span>
                            {pmt.reference && <span className="text-gray-500 text-[10px]">Ref: {pmt.reference}</span>}
                            {pmt.stage === 1 && <span className="text-[9px] text-blue-500">stage 1</span>}
                          </span>
                          <span className="font-medium text-gray-900 tabular-nums">{formatMoney(pmt.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (<p className="text-[11px] text-gray-400 italic">No payments recorded</p>)}
                </div>

                {/* Waiver audit trail */}
                {(bill.consultation_fee_waive_reason || bill.stage2_waive_reason) && (
                  <div className="mb-4 space-y-1">
                    {bill.consultation_fee_waive_reason && (
                      <div className="px-2 py-1.5 rounded bg-amber-50 border border-amber-200">
                        <p className="text-[11px] text-amber-700 font-medium">
                          Consultation fee waived by {bill.consultation_fee_waived_by || 'staff'} — {bill.consultation_fee_waive_reason}
                        </p>
                      </div>
                    )}
                    {bill.stage2_waive_reason && (
                      <div className="px-2 py-1.5 rounded bg-amber-50 border border-amber-200">
                        <p className="text-[11px] text-amber-700 font-medium">
                          Stage 2 fees waived by {bill.stage2_waived_by || 'staff'} — {bill.stage2_waive_reason}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 text-[12px] mb-4 pt-2 border-t border-gray-200">
                  <div className="flex justify-between px-2 py-1 rounded bg-emerald-50">
                    <span className="text-gray-600 font-medium">Total Paid</span>
                    <span className="font-bold text-emerald-700 tabular-nums">{formatMoney(paid)}</span>
                  </div>
                  {balance > 0 ? (
                    <div className="flex justify-between px-2 py-1 rounded bg-red-50">
                      <span className="text-gray-600 font-medium">Balance Due</span>
                      <span className="font-bold text-red-700 tabular-nums">{formatMoney(balance)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between px-2 py-1 rounded bg-emerald-50">
                      <span className="text-gray-600 font-medium">Balance</span>
                      <span className="font-bold text-emerald-700 tabular-nums">KSh 0</span>
                    </div>
                  )}
                </div>

                {/* Stamps */}
                {isPaid && (
                  <div className="flex justify-center my-4">
                    <div className="border-4 border-emerald-600 rounded-lg px-6 py-2 transform -rotate-3">
                      <p className="text-[18px] font-bold text-emerald-600 tracking-widest">PAID</p>
                    </div>
                  </div>
                )}
                {isWaived && (
                  <div className="flex justify-center my-4">
                    <div className="border-4 border-amber-500 rounded-lg px-6 py-2 transform -rotate-3">
                      <p className="text-[18px] font-bold text-amber-500 tracking-widest">WAIVED</p>
                    </div>
                  </div>
                )}
                {isPartial && !isWaived && (
                  <div className="flex justify-center my-4">
                    <div className="border-4 border-blue-500 rounded-lg px-6 py-2 transform -rotate-3">
                      <p className="text-[18px] font-bold text-blue-500 tracking-widest">PARTIALLY PAID</p>
                    </div>
                  </div>
                )}

                {/* Signature */}
                <div className="mt-6 pt-3 border-t border-gray-200 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-gray-500 mb-5">Received by</p>
                    <div className="border-t border-gray-400 pt-1 min-w-45">
                      <p className="text-[12px] font-semibold text-gray-900">you were served by: {bill.cashier}</p>
                      <p className="text-[10px] text-gray-500">{clinic.name || 'Kitui Health diagnostic center'}</p>
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-400 text-right max-w-50">This is a computer-generated receipt. Retain for your records.</p>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-2 border-t border-gray-200 text-center">
                  <p className="text-[10px] text-gray-400">{clinic.name || 'City Health Clinic'} · Thank you for choosing us</p>
                  <p className="text-[9px] text-gray-300 mt-0.5">Receipt ID: {receiptId} · Generated {formatDate(receiptDate.toISOString())} at {formatTime(receiptDate.toISOString())}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}