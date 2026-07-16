'use client'

// ReferralsTab — Admin dashboard for tracking external referrals & paying commissions
// APIs:
//   GET   /api/admin/referrals              -> { referrals, stats, by_referrer }
//   PATCH /api/admin/referrals/:id/pay      -> mark commission as paid

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Card, Badge, EmptyState, ErrorState,
  SkeletonCard, SkeletonList, Icon,
  formatMoney, formatDate, timeAgo, badgeClass, cap,
} from '@/utils/helpers'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
]

export default function ReferralsTab() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState('all')
  const [paying, setPaying] = useState(null) 

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: () => api.get('/api/admin/referrals'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const payMutation = useMutation({
    mutationFn: ({ id, body }) =>
      api.patch(`/api/admin/referrals/${id}/pay`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] })
    },
  })

  const stats = data?.stats
  const allReferrals = data?.referrals || []
  const byReferrer = data?.by_referrer || []

  const filtered =
    filter === 'all'
      ? allReferrals
      : allReferrals.filter((r) => r.status === filter)

  const handlePay = async (referral, amountPaid) => {
    try {
      await payMutation.mutateAsync({
        id: referral.id,
        body: {
          paid_by: user?.name || 'Clinic Owner',
          amount_paid: Number(amountPaid),
        },
      })
      toast.success(
        `Commission of ${formatMoney(amountPaid)} paid to ${referral.referrer_name}`
      )
      setPaying(null)
    } catch (err) {
      toast.error(err.message || 'Could not mark commission as paid')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count =
            f.key === 'all'
              ? allReferrals.length
              : allReferrals.filter((r) => r.status === f.key).length
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={[
                'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                filter === f.key
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700',
              ].join(' ')}
            >
              {f.label} <span className="opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Referrals list */}
      {!filtered.length ? (
        <EmptyState
          icon="stethoscope"
          title="No referrals found"
          description="External referrals from other doctors/facilities will appear here for commission tracking."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReferralCard
              key={r.id}
              referral={r}
              onPay={() => setPaying(r)}
            />
          ))}
        </div>
      )}

      {/* Payment confirmation modal */}
      {paying && (
        <PayConfirmModal
          referral={paying}
          loading={payMutation.isPending}
          onClose={() => setPaying(null)}
          onConfirm={(amountPaid) => handlePay(paying, amountPaid)}
        />
      )}
    </div>
  )
}

// ─── Referral card ────────────────────────────────────────────────
function ReferralCard({ referral, onPay }) {
  const isPaid = referral.status === 'paid'
  const urgent = !isPaid && timeAgo(referral.referred_at).includes('day')

  return (
    <Card className={`p-4 ${isPaid ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Left: referrer + patient info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={[
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            isPaid
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
          ].join(' ')}>
            <Icon name={isPaid ? 'checkCircle' : 'clock'} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {referral.patient_name}
              </span>
              <Badge className={badgeClass(referral.status === 'paid' ? 'paid' : 'pending_pay')}>
                {isPaid ? 'Paid' : 'Pending'}
              </Badge>
              {urgent && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <Icon name="alert" size={10} /> Aged
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Referred by <span className="font-medium text-gray-700 dark:text-gray-300">{referral.referrer_name}</span>
              {' · '}{referral.referrer_facility}
            </p>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Icon name="testTube" size={11} />
                {referral.test_ordered}
              </span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" size={11} />
                Referred {timeAgo(referral.referred_at)}
              </span>
              {referral.notes && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="italic truncate max-w-xs">{referral.notes}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: commission + action */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Commission
            </p>
            <p className={[
              'text-[15px] font-bold tabular-nums',
              isPaid
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400',
            ].join(' ')}>
              {formatMoney(referral.commission_amount)}
            </p>
            <p className="text-[10px] text-gray-400">
              {Math.round(referral.commission_rate * 100)}% of {formatMoney(referral.test_cost)}
            </p>
          </div>
          {!isPaid ? (
            <button
              onClick={onPay}
              className="px-3 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            >
              <Icon name="dollarSign" size={13} /> Mark Paid
            </button>
          ) : (
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Paid {formatDate(referral.paid_at)}</p>
              <p className="text-[10px] text-gray-400">by {referral.paid_by}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Payment confirmation modal ───────────────────────────────────
function PayConfirmModal({ referral, loading, onClose, onConfirm }) {
  const [amount, setAmount] = useState(String(referral.commission_amount || ''))
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
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
              Confirm Commission Payment
            </h3>
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
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700/60 p-3 space-y-2">
            <Row label="Patient" value={referral.patient_name} />
            <Row label="Referred by" value={referral.referrer_name} />
            <Row label="Facility" value={referral.referrer_facility} />
            <Row label="Test ordered" value={referral.test_ordered} />
            <Row label="Test cost" value={formatMoney(referral.test_cost)} />
            <Row label="Suggested commission" value={`${Math.round(referral.commission_rate * 100)}% = ${formatMoney(referral.commission_amount)}`} />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Amount to Pay (KSh) *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount paid"
              autoFocus
              className="w-full px-3 py-2 text-[14px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">Enter the actual amount paid to the referrer. This may differ from the suggested commission.</p>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Once marked as paid, this referral will move to the &ldquo;Paid&rdquo; list and the
            referrer&rsquo;s pending balance will be reduced. This action is recorded for audit purposes.
          </p>
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
            onClick={() => onConfirm(amount)}
            disabled={loading || !amount || Number(amount) <= 0}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
            Confirm Payment
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
