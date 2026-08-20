'use client'


import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import {
  Card, EmptyState, ErrorState,
  SkeletonCard, SkeletonList, Icon,
  formatMoney, timeAgo
} from '@/utils/helpers'

import socket from '@/lib/socket'

export default function ReferralsTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [paying, setPaying] = useState(null) // referral being confirmed for payment

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: () => api.get('/api/admin/referrals'),
    refetchInterval: 30000,
    staleTime: 15000,
  })


  const payMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/admin/referrals/${id}/pay`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] }),
  })

  const stats = data?.stats || {}
  // Only pending referrals are shown — paid ones disappear completely.
  const referrals = (data?.referrals || []).filter((r) => r.status === 'pending')

  const handlePay = async (referral, amountPaid, notes) => {
    try {
      await payMutation.mutateAsync({
        id: referral.id,
        body: {  amount_paid: Number(amountPaid), notes: notes.trim() },
      })
      toast.success(`Commission of ${formatMoney(amountPaid)} paid to ${referral.referrer_name}`)
      setPaying(null)
    } catch (err) {
      toast.error(err.message || 'Could not mark commission as paid')
    }
  }

  useEffect(() => {
    socket.on('referral:new', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] })
    })

    return () => {
      socket.off('referral:new')
    }
  }, [queryClient])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

   return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Referrals</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {referrals.length} pending
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

      {/* Compact stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Pending</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Icon name="clock" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{referrals.length}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">referrals awaiting commission</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Recently Paid</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <Icon name="checkCircle" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{stats.paid_count ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">paid referrals (disappear after 24h)</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Unique Referrers</p>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <Icon name="users" size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
            {new Set(referrals.map((r) => r.referrer_name)).size}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">external providers referring</p>
        </Card>
      </div>

      {/* Referrals list — only pending */}
      {referrals.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon="checkCircle"
            title="No pending referrals"
            description="All referral commissions have been paid. New referrals from external providers will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {referrals.map((r) => (
            <ReferralCard key={r.id} referral={r} onPay={() => setPaying(r)} />
          ))}
        </div>
      )}

      {/* Payment confirmation modal */}
      {paying && (
        <PayConfirmModal
          referral={paying}
          loading={payMutation.isPending}
          onClose={() => setPaying(null)}
          onConfirm={(amountPaid, notes) => handlePay(paying, amountPaid, notes)}
        />
      )}
    </div>
  )
}

// ─── Referral card — shows ONLY referrer name + contact, patient, tests ──
function ReferralCard({ referral, onPay }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Left: referrer + test info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Icon name="users" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            {/* Referrer name + contact — the main info the admin needs */}
            <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              {referral.referrer_name}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              <Icon name="phone" size={10} className="inline mr-1" />
              {referral.referrer_phone || 'No phone number'}
              {' · '}Referred {timeAgo(referral.referred_at)}
            </p>

            {/* Patient + tests referred */}
            <div className="flex items-center gap-3 mt-2 text-[12px] flex-wrap">
              <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                <Icon name="user" size={11} />
                {referral.patient_name}
              </span>
            </div>
          </div>
        </div>

        {/* Right: pay button */}
        <div className="shrink-0">
          <button
            onClick={onPay}
            className="px-3 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
          >
            <Icon name="dollarSign" size={13} /> Pay Commission
          </button>
        </div>
      </div>
    </Card>
  )
}

function PayConfirmModal({ referral, loading, onClose, onConfirm }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Icon name="dollarSign" size={16} />
            </div>
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Pay Commission</h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Referral details — ONLY referrer, contact, patient, tests */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 p-3 space-y-2">
            <Row label="Referrer" value={referral.referrer_name} />
            <Row label="Contact" value={referral.referrer_contact || '—'} />
            <Row label="Patient referred" value={referral.patient_name} />
            <Row label="Tests done" value={referral.test_ordered} />
          </div>

          {/* Owner enters the commission amount — no suggestion */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Commission to Pay (KSh) *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              autoFocus
              className="w-full px-3 py-2 text-[14px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">You decide the amount. Once paid, this referral will disappear from the list.</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              notes (optional) *
            </label>
            <input
              type="text"
              step="any"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment Notes"
              className="w-full px-3 py-2 text-[14px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-2.5">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <Icon name="alert" size={12} className="shrink-0 mt-0.5" />
              <span>Once confirmed, this referral will be marked as paid and removed from the pending list. This action cannot be undone!</span>
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount, notes)}
            disabled={loading || !amount || Number(amount) <= 0}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
            Confirm & Pay
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-[12px] font-medium text-gray-900 dark:text-gray-100 text-right">{value}</span>
    </div>
  )
}