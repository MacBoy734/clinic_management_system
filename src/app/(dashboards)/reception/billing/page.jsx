'use client'

// BillingTab — stage 2 billing desk
// Architecture: fees start at 0, departments increment them.
// Bill is resolved when both stages are paid or waived.
// Receipts ONLY print when is_resolved === true.

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

const WHERE_LABEL = {
  waiting: 'Waiting at reception',
  consultation_paid: 'Waiting for doctor',
  with_doctor: 'In consultation',
  lab: 'In the laboratory',
  pharmacy: 'In the pharmacy',
  billing: 'At billing desk',
  done: 'Completed',
  archived: 'Archived',
}

export default function BillingTab() {
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState(null)
  const [receiptBill, setReceiptBill] = useState(null)

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['reception', 'payments'],
    queryFn: () => api.get('/api/reception/bills'),
    refetchInterval: 20000,
    staleTime: 10000,
  })

  const payMutation = useMutation({
    mutationFn: (body) => api.patch('/api/reception/payments', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception'] })
      setPaying(null)
    },
    onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Payment failed'),
  })

  const waiveMutation = useMutation({
    mutationFn: ({ visitId, stage, reason }) =>
      api.patch(`/api/reception/visits/${visitId}/waive`, { stage, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception'] })
      toast.success('Fee waived')
      setPaying(null)
    },
    onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Could not waive fee'),
  })

  const bills = data ?? []

  const handlePay = async (payload) => {
    if (!paying?.visit_id) {
      toast.error('Visit ID missing')
      return
    }
    try {
      await payMutation.mutateAsync({
        visit_id: paying.visit_id,
        stage: 2,
        ...payload,
      })
      toast.success(`Payment collected from ${paying.patient_name}`)
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    }
  }

  const handleWaive = ({ reason }) => {
    if (!paying?.visit_id) {
      toast.error('Visit ID missing')
      return
    }
    waiveMutation.mutate({ visitId: paying.visit_id, stage: 2, reason })
  }

  // ── Grouping by resolution state ─────────────────────────────────
  const readyForBilling = bills.filter((b) => b.visit_status === 'billing' && !b.is_resolved)
  const inProcess = bills.filter((b) => !b.is_resolved && b.visit_status !== 'billing')
  const completed = bills.filter((b) => b.is_resolved)

  const totalCollected = completed.reduce((s, b) => s + b.paid_amount, 0)
  const totalReady = readyForBilling.reduce((s, b) => s + b.payable_amount, 0)
  const totalPending = inProcess.reduce((s, b) => s + b.payable_amount, 0)

  if (isLoading) return <SkeletonTable rows={5} cols={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!bills.length) return <EmptyState icon="receipt" title="No bills" description="Bills appear here when patients incur fees." />

  return (
    <div className="space-y-4">
      {/* Header + Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Billing Desk</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {bills.length} bill{bills.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon
              name="refresh"
              size={13}
              className={isFetching ? 'animate-spin' : ''}
            />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Collected Today</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatMoney(totalCollected)}</p>
        </Card>
        <Card className="p-4 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Ready for Billing</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatMoney(totalReady)}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{readyForBilling.length} patient{readyForBilling.length !== 1 ? 's' : ''} at desk</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">In Process</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">{formatMoney(totalPending)}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{inProcess.length} patient{inProcess.length !== 1 ? 's' : ''} still in consultation/lab/pharmacy</p>
        </Card>
      </div>

      {/* Ready for billing */}
      {readyForBilling.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Ready for Billing</h3>
            <span className="text-[11px] text-gray-400">— collect Stage 2 payment or waive</span>
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
                        <div className="flex flex-wrap gap-1.5">
                          {b.items?.map((item, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              <span className={item.status === 'waived' ? 'line-through text-gray-400 text-[12px]' : 'text-[12px] text-gray-600 dark:text-gray-300'}>
                                {item.name}
                              </span>
                              {item.status === 'waived' && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Waived</Badge>}
                              {item.status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Paid</Badge>}
                              {item.status === 'pending' && <Badge className="bg-gray-100 text-gray-600 text-[10px]">Pending</Badge>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.effective_total ?? b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatMoney(b.payable_amount)}</td>
                      <td className="px-4 py-3 text-center"><Badge className={badgeClass(b.status)}>{cap(b.status)}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
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

      {/* In process */}
      {inProcess.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">In Process — Not Ready</h3>
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
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Location</th>
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
                        <div className="flex flex-wrap gap-1.5">
                          {b.items?.map((item, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              <span className={item.status === 'waived' ? 'line-through text-gray-400 text-[12px]' : 'text-[12px] text-gray-600 dark:text-gray-300'}>
                                {item.name}
                              </span>
                              {item.status === 'waived' && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Waived</Badge>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.effective_total ?? b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{formatMoney(b.payable_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                          <Icon name="clock" size={11} /> {WHERE_LABEL[b.visit_status] || cap(b.visit_status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[11px] text-gray-400 italic">Not ready</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Completed / Resolved */}
      {completed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Completed & Paid</h3>
            <span className="text-[11px] text-gray-400">— fully resolved visits</span>
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
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Receipt</th>
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
                        <div className="flex flex-wrap gap-1.5">
                          {b.items?.map((item, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              <span className="text-[12px] text-gray-600 dark:text-gray-300">{item.name}</span>
                              {item.status === 'waived' && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Waived</Badge>}
                              {item.status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Paid</Badge>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(b.effective_total ?? b.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMoney(b.paid_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 capitalize">
                          {b.payments && b.payments.length > 1 ? `Split (${b.payments.length})` : (b.method || '—')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setReceiptBill(b)}
                          title="Print receipt"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-[#1a6cbf] hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200 dark:border-gray-700 transition-colors"
                        >
                          <Icon name="printer" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Payment modal — stage 2 */}
      {paying && (
        <PaymentModal
          visit={paying}
          stage={2}
          title="Collect Stage 2 Payment"
          description="Lab + medication + procedure fees"
          amount={paying.payable_amount}
          loading={payMutation.isPending || waiveMutation.isPending}
          onClose={() => setPaying(null)}
          onConfirm={handlePay}
          onWaive={handleWaive}
        />
      )}

      {/* Receipt modal — only for resolved bills */}
      {receiptBill && (
        <ReceiptModal bill={receiptBill} onClose={() => setReceiptBill(null)} />
      )}
    </div>
  )
}