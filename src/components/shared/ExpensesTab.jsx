'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { StatCard, Card, EmptyState, ErrorState, SkeletonCard, SkeletonList, Icon, formatMoney, timeAgo, cap } from '@/utils/helpers'

const CATEGORIES = ['supplies', 'utilities', 'transport', 'misc']

export function ExpensesTab({ department }) {
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['expenses', department],
    queryFn: () => api.get(`/api/expenses?department=${department}`),
    refetchInterval: 30000, staleTime: 15000,
  })
  const mut = useMutation({
    mutationFn: (body) => api.post('/api/expenses', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete('/api/expenses', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })

  if (isLoading) return <div className="space-y-4"><div className="grid grid-cols-3 gap-4">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i}/>)}</div><SkeletonList items={4}/></div>
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const expenses = data?.expenses || []
  const stats = data?.stats

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-4 py-3 flex items-start gap-2">
        <Icon name="info" size={14} className="text-[#1a6cbf] dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#1a6cbf] dark:text-blue-400">Expenses are automatically deducted from today's income/revenue calculations.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon="trendDown" color="red" label="Today" value={formatMoney(stats?.today_total ?? 0)} sublabel={`${stats?.today_count ?? 0} records`} />
        <StatCard icon="dollarSign" color="blue" label="Total" value={formatMoney(stats?.total ?? 0)} sublabel="all-time" />
        <StatCard icon="building" color="purple" label={cap(department)} value={formatMoney(stats?.by_department?.[department] ?? 0)} sublabel="this department" />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Recent Expenses</h3>
        <button onClick={() => setShowModal(true)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5">
          <Icon name="plus" size={14} /> Record Expense
        </button>
      </div>

      {!expenses.length ? (
        <EmptyState icon="trendDown" title="No expenses recorded" description="Record department expenses here — they'll be deducted from daily income." />
      ) : (
        <div className="space-y-2">
          {expenses.map(e => (
            <Card key={e.id} className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Icon name="trendDown" size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{e.description}</p>
                  <p className="text-[11px] text-gray-400">{cap(e.category)} · {e.recorded_by} · {timeAgo(e.recorded_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[13px] font-semibold text-red-600 dark:text-red-400 tabular-nums">−{formatMoney(e.amount)}</span>
                <button onClick={async () => { try { await delMut.mutateAsync(e.id); toast.success('Expense deleted') } catch(err) { toast.error(err.message) } }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && <ExpenseModal department={department} user={user} loading={mut.isPending} onClose={() => setShowModal(false)}
        onSubmit={async (body) => { try { await mut.mutateAsync(body); toast.success('Expense recorded'); setShowModal(false) } catch(err) { toast.error(err.message) } }} />}
    </div>
  )
}

function ExpenseModal({ department, user, loading, onClose, onSubmit }) {
  const [category, setCategory] = useState('supplies')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Record Expense</h3>
          <button onClick={onClose} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Category</label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)} className={['px-2 py-1.5 rounded-lg text-[11px] font-medium', category === c ? 'bg-[#1a6cbf] text-white' : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400'].join(' ')}>{cap(c)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Description *</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Printing paper" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Amount (KSh) *</label>
            <input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf]" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">Cancel</button>
          <button onClick={() => onSubmit({ department, category, description, amount: Number(amount), recorded_by: user?.name || 'Staff' })} disabled={loading || !description.trim() || !amount} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50 flex items-center gap-2">{loading ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="save" size={14} />} Record</button>
        </div>
      </div>
    </div>
  )
}
