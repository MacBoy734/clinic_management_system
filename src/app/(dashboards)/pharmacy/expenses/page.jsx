'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

const DOMAIN = 'pharmacy'

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useExpenses({ page, period, search }) {
  return useQuery({
    queryKey: [DOMAIN, 'expenses', { page, period, search }],
    queryFn: () =>
      api.get(`/api/expenses?domain=${DOMAIN}&page=${page}&limit=20&period=${period}&search=${encodeURIComponent(search)}`),
    placeholderData: (prev) => prev,
    staleTime: 30000,
  })
}

function useExpenseStats(period) {
  return useQuery({
    queryKey: [DOMAIN, 'expenses', 'stats', period],
    queryFn: () => api.get(`/api/expenses/stats?domain=${DOMAIN}&period=${period}`),
    staleTime: 60000,
  })
}

function useSaveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) =>
      id
        ? api.put(`/api/expenses/${id}`, { domain: DOMAIN, ...data })
        : api.post('/api/expenses', { domain: DOMAIN, ...data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DOMAIN, 'expenses'] }),
  })
}

function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/api/expenses/${id}?domain=${DOMAIN}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DOMAIN, 'expenses'] }),
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'this_year', label: 'This year' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputCls = 'w-full text-[12px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors'
const labelCls = 'block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1'

// ─── Skeletons ────────────────────────────────────────────────────────────────
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-gray-700/60 p-4 animate-pulse">
          <div className="h-2.5 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
          <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="h-2 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 flex flex-col gap-1 ${accent || 'border-gray-200 dark:border-gray-700/60'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Expense modal ────────────────────────────────────────────────────────────
const EMPTY_EXPENSE = { description: '', amount: '', incurred_at: '' }

function ExpenseModal({ expense, onClose, onSave }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(expense
    ? { ...expense, incurred_at: expense.incurred_at ? expense.incurred_at.slice(0, 10) : todayStr }
    : { ...EMPTY_EXPENSE, incurred_at: todayStr }
  )
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form)
      setSaving(false)
      onClose()
    } catch (error) {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
            {expense ? 'Edit expense' : 'Add expense'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={form.description} onChange={set('description')}
              placeholder="e.g. KPLC electricity bill" />
          </div>
          <div>
            <label className={labelCls}>Amount (KES)</label>
            <input className={inputCls} type="number" value={form.amount} onChange={set('amount')} placeholder="0" />
          </div>
          <div>
            <label className={labelCls}>Date incurred</label>
            <input className={inputCls} type="date" value={form.incurred_at} onChange={set('incurred_at')} />
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.description.trim() || !form.amount}
            className="px-4 py-2 text-[12px] rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReceptionExpensesPage() {
  const [period, setPeriod] = useState('this_month')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [expenseModal, setExpenseModal] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const expensesQuery = useExpenses({ page, period, search })
  const statsQuery = useExpenseStats(period)
  const saveMutation = useSaveExpense()
  const deleteMutation = useDeleteExpense()

  const expenses = expensesQuery.data?.expenses ?? []
  const total = expensesQuery.data?.total ?? 0
  const stats = statsQuery.data ?? { total_amount: 0, entry_count: 0, avg_amount: 0 }
  const totalPages = Math.ceil(total / 20) || 1

  const handleSaveExpense = async (form) => {
    await saveMutation.mutateAsync({
      id: form.id ?? null,
      data: {
        description: form.description.trim(),
        amount: Number(form.amount),
        incurred_at: form.incurred_at || null,
      },
    })
  }

  const handleDeleteExpense = async (id) => {
    try {

      await deleteMutation.mutateAsync(id)
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Failed to delete expense:', error.message)
    }
  }

  return (
    <>
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Expenses</h2>
          <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
            Track day-to-day clinic running costs
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${period === p.key
                  ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats ── */}
      {statsQuery.isLoading ? <StatsSkeleton /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard
            label="Total expenses"
            value={`KES ${stats.total_amount.toLocaleString()}`}
            sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
            accent="border-red-200 dark:border-red-700/40"
          />
          <StatCard
            label="Entries"
            value={stats.entry_count}
            sub="recorded"
          />
          <StatCard
            label="Average"
            value={`KES ${stats.avg_amount.toLocaleString()}`}
            sub="per entry"
            accent="border-blue-200 dark:border-blue-700/40"
          />
        </div>
      )}

      {/* ── Error ── */}
      {expensesQuery.isError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-[13px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          Failed to load expenses: {expensesQuery.error?.message}
        </div>
      )}

      {/* ── Main panel ── */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">
            {total} entr{total !== 1 ? 'ies' : 'y'}
          </span>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search description…"
              className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-48 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>
          <button
            onClick={() => setExpenseModal('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white font-medium transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add expense
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {expensesQuery.isLoading ? <TableSkeleton /> : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-left px-5 py-3">Description</th>
                  <th className="text-left px-5 py-3">Recorded by</th>
                  <th className="text-left px-5 py-3">Amount (KES)</th>
                  <th className="text-left px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-14 text-[13px] text-gray-400 dark:text-gray-500">
                      No expenses found
                    </td>
                  </tr>
                ) : expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors group">
                    <td className="px-5 py-3.5 font-mono text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(e.incurred_at)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-800 dark:text-gray-200 max-w-72 truncate" title={e.description}>
                      {e.description}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                      {e.recorder?.username ?? <span className="text-gray-300 dark:text-gray-600 italic">—</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {e.amount.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setExpenseModal(e)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-[#1a6cbf] dark:hover:text-blue-400 transition-all">
                          Edit
                        </button>
                        <button onClick={() => setDeleteConfirm(e)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400 transition-all">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {expenses.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/60">
                    <td colSpan={3} className="px-5 py-3 text-[12px] font-semibold text-gray-600 dark:text-gray-300 text-right">
                      Page total
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-gray-900 dark:text-gray-100">
                      {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {total.toLocaleString()} total entries
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Expense modal ── */}
      {expenseModal && (
        <ExpenseModal
          expense={expenseModal === 'new' ? null : expenseModal}
          onClose={() => setExpenseModal(null)}
          onSave={handleSaveExpense}
        />
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete expense?</h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-5">
              <span className="font-semibold text-gray-800 dark:text-gray-200">{deleteConfirm.description}</span> (KES {deleteConfirm.amount.toLocaleString()}) will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDeleteExpense(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-[12px] rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}