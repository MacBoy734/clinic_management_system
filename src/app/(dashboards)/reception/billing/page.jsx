'use client'

// BillingTab — stage 2 billing desk
// API: GET /api/reception/bills → list bills (includes visit_status + payments)
//      PATCH /api/reception/payments → collect stage 2 payment
//
// IMPORTANT: Stage 2 collection is only allowed when the patient has
// completed all services (lab, pharmacy) and returned to reception with
// status = 'billing'. Bills for patients still in process show a "Not ready"
// indicator and cannot be collected.
//
// Receipts are printed MANUALLY via the printer button on a row — never
// automatically after collection.

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonTable, ErrorState, EmptyState, Card, Badge, Icon,
  badgeClass, cap, formatMoney, formatTime,
} from '@/utils/helpers'
import { PaymentModal } from '@/components/reception/paymentModal'
import { ReceiptModal } from '@/components/reception/ReceiptModal'

// Map visit status → friendly location label for "not ready" bills
const WHERE_LABEL = {
  waiting: 'Waiting at reception',
  consultation_paid: 'Waiting for doctor',
  with_doctor: 'In consultation',
  lab: 'In the laboratory',
  pharmacy: 'In the pharmacy',
  done: 'Completed',
  archived: 'Archived',
}

export default function BillingTab() {
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState(null)
  const [receiptBill, setReceiptBill] = useState(null)

  // API: GET /api/reception/bills
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reception', 'payments'],
    queryFn: () => api.get('/api/reception/bills'),
    refetchInterval: 20000,
    staleTime: 10000,
  })

  // API: PATCH /api/reception/payments (stage 2)
  const payMutation = useMutation({
    mutationFn: (body) => api.patch('/api/reception/payments', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception'] })
    },
  })

  const bills = data ?? []

  // payload = { payments:[{method,amount,reference}], discount_amount, discount_reason }
  const handlePay = async (bill, payload) => {
    try {
      await payMutation.mutateAsync({
        visit_id: bill.visit_id,
        stage: 2,
        ...payload,
      })
      toast.success(`Payment collected from ${bill.patient_name}`)
      setPaying(null)
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    }
  }

  if (isLoading) return <SkeletonTable rows={5} cols={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!bills.length) return <EmptyState icon="receipt" title="No bills" description="Bills appear here when patients incur lab, medication, or procedure fees." />

  // Split bills into 3 groups based on visit_status
  const readyForBilling = bills.filter((b) => b.visit_status === 'billing' && b.status !== 'paid')
  const inProcess = bills.filter((b) => !['billing', 'done', 'archived'].includes(b.visit_status) && b.status !== 'paid')
  const completed = bills.filter((b) => b.visit_status === 'done' || b.status === 'paid')

  const totalCollected = completed.reduce((s, b) => s + b.paid_amount, 0)
  const totalReady = readyForBilling.reduce((s, b) => s + ((b.payable_amount ?? b.total_amount) - b.paid_amount), 0)
  const totalPending = inProcess.reduce((s, b) => s + ((b.payable_amount ?? b.total_amount) - b.paid_amount), 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Collected</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatMoney(totalCollected)}</p>
        </Card>
        <Card className="p-4 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Ready for Billing</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatMoney(totalReady)}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{readyForBilling.length} patient{readyForBilling.length !== 1 ? 's' : ''} waiting at billing desk</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">In Process (not ready)</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">{formatMoney(totalPending)}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{inProcess.length} patient{inProcess.length !== 1 ? 's' : ''} still in consultation/lab/pharmacy</p>
        </Card>
      </div>

      {/* Ready for billing — can collect */}
      {readyForBilling.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Ready for Billing</h3>
            <span className="text-[11px] text-gray-400">— patient has returned to reception, collect Stage 2 payment</span>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patient</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Items</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {readyForBilling.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 bg-emerald-50/30 dark:bg-emerald-950/10">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{b.patient_name}</p>
                        <p className="text-[10px] text-gray-400">Arrived {formatTime(b.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-gray-600 dark:text-gray-300">{b.items.map((i) => i.name).join(', ')}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatMoney((b.payable_amount ?? b.total_amount) - b.paid_amount)}</td>
                      <td className="px-4 py-3 text-center"><Badge className={badgeClass(b.status)}>{cap(b.status)}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setReceiptBill(b)}
                            title="Print receipt"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#1a6cbf] hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200 dark:border-gray-700 transition-colors"
                          >
                            <Icon name="printer" size={13} />
                          </button>
                          <button onClick={() => setPaying(b)}
                            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5">
                            <Icon name="dollarSign" size={13} /> Collect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* In process — cannot collect yet */}
      {inProcess.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">In Process — Not Ready for Billing</h3>
            <span className="text-[11px] text-gray-400">— patient must complete all services and return to reception first</span>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patient</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Items</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Current Location</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {inProcess.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 opacity-75">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{b.patient_name}</p>
                        <p className="text-[10px] text-gray-400">Arrived {formatTime(b.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-gray-600 dark:text-gray-300">{b.items.map((i) => i.name).join(', ')}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{formatMoney((b.payable_amount ?? b.total_amount) - b.paid_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <Icon name="clock" size={11} /> {WHERE_LABEL[b.visit_status] || cap(b.visit_status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[11px] text-gray-400 italic flex items-center gap-1 justify-end">
                          <Icon name="alert" size={12} /> Not ready
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Completed — paid bills */}
      {completed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Completed</h3>
            <span className="text-[11px] text-gray-400">— fully paid visits</span>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patient</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Items</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Paid</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Method</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                  {completed.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{b.patient_name}</p>
                        <p className="text-[10px] text-gray-400">{formatTime(b.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-gray-600 dark:text-gray-300">{b.items.map((i) => i.name).join(', ')}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMoney(b.paid_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 capitalize">
                          {b.payments && b.payments.length > 1 ? `Split (${b.payments.length})` : (b.method || '—')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <Icon name="check" size={11} /> Paid
                          </Badge>
                          <button
                            onClick={() => setReceiptBill(b)}
                            title="Print receipt"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#1a6cbf] hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200 dark:border-gray-700 transition-colors"
                          >
                            <Icon name="printer" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Info banner */}
      {inProcess.length > 0 && readyForBilling.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Icon name="alert" size={18} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">
              No patients ready for billing yet
            </p>
            <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 mt-0.5">
              Patients appear in the "Ready for Billing" section once they complete all services (consultation, lab, pharmacy) and return to the reception desk. The {inProcess.length} patient{inProcess.length !== 1 ? 's' : ''} listed above are still in process.
            </p>
          </div>
        </div>
      )}

      {/* Payment modal — stage 2 */}
      {paying && (
        <PaymentModal
          visit={paying}
          stage={2}
          title="Collect Stage 2 Payment"
          description="Lab + medication + procedure fees — split methods & discount supported"
          amount={paying.total_amount - paying.paid_amount}
          loading={payMutation.isPending}
          onClose={() => setPaying(null)}
          onConfirm={(payload) => handlePay(paying, payload)}
        />
      )}

      {/* Receipt modal — manual print only */}
      {receiptBill && (
        <ReceiptModal bill={receiptBill} onClose={() => setReceiptBill(null)} />
      )}
    </div>
  )
}