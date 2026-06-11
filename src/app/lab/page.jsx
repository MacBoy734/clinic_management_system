'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import toast from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useLabRequests() {
  return useQuery({
    queryKey: ['lab', 'requests'],
    queryFn:  () => api.get('/api/lab/requests'),
    refetchInterval: 15000,
    staleTime: 10000,
  })
}

function useSubmitResults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, results }) => api.post(`/api/lab/requests/${requestId}/results`, { results }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab', 'requests'] })
      toast.success('Results submitted — doctor and reception notified')
    },
    onError: (e) => toast.error(e.message),
  })
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_REQUESTS = [
  {
    id: 1, patient: { name: 'Peter Mwangi', age: 52 }, doctor: 'Dr. Kim',
    requested_at: '09:10', status: 'pending', priority: 'urgent',
    tests: [
      { name: 'Full Blood Count (FBC)', result: '', unit: 'cells/μL', normal_range: '4.5–11.0 × 10³' },
      { name: 'Blood Sugar (RBS)',      result: '', unit: 'mmol/L',   normal_range: '3.9–7.8' },
      { name: 'ECG',                    result: '', unit: '',         normal_range: 'Normal sinus rhythm' },
    ],
  },
  {
    id: 2, patient: { name: 'James Otieno', age: 34 }, doctor: 'Dr. Kim',
    requested_at: '08:30', status: 'in_progress', priority: 'normal',
    tests: [
      { name: 'Malaria Test (RDT)', result: '', unit: '',       normal_range: 'Negative' },
      { name: 'Urinalysis',         result: '', unit: '',       normal_range: 'Normal' },
    ],
  },
  {
    id: 3, patient: { name: 'Faith Njeri', age: 7 }, doctor: 'Dr. Kim',
    requested_at: '10:05', status: 'pending', priority: 'normal',
    tests: [
      { name: 'Full Blood Count (FBC)', result: '', unit: 'cells/μL', normal_range: '4.5–13.5 × 10³' },
      { name: 'Malaria Test (RDT)',     result: '', unit: '',         normal_range: 'Negative' },
    ],
  },
  {
    id: 4, patient: { name: 'Grace Wanjiku', age: 19 }, doctor: 'Dr. Kim',
    requested_at: '07:55', status: 'completed', priority: 'normal',
    tests: [
      { name: 'Full Blood Count (FBC)', result: '5.2 × 10³', unit: 'cells/μL', normal_range: '4.5–11.0 × 10³' },
    ],
  },
]

const MOCK_STATS = { pending: 2, in_progress: 1, completed_today: 8, avg_turnaround: '18 min' }

const STATUS_CFG = {
  pending:     { label: 'Pending',     light: 'bg-amber-50 text-amber-700 border-amber-200',     dark: 'dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/40'    },
  in_progress: { label: 'Processing',  light: 'bg-blue-50 text-blue-700 border-blue-200',        dark: 'dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700/40'       },
  completed:   { label: 'Completed',   light: 'bg-emerald-50 text-emerald-700 border-emerald-200',dark: 'dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/40'},
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.light} ${cfg.dark}`}>
      {cfg.label}
    </span>
  )
}

function ResultsModal({ request, onClose, onSave, isLoading }) {
  const [results, setResults] = useState(
    request.tests.map((t) => ({ ...t, result: t.result || '', flag: 'normal' }))
  )

  const update = (i, field, val) =>
    setResults((p) => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1e293b]">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Enter Results</h2>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">
              {request.patient.name} · Requested by {request.doctor}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {results.map((r, i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{r.name}</p>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">Normal range: {r.normal_range}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Result {r.unit && `(${r.unit})`}</label>
                  <input value={r.result} onChange={(e) => update(i, 'result', e.target.value)}
                    placeholder="Enter result value..."
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Flag</label>
                  <select value={r.flag} onChange={(e) => update(i, 'flag', e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-colors">
                    <option value="normal">Normal</option>
                    <option value="high">High ↑</option>
                    <option value="low">Low ↓</option>
                    <option value="critical">Critical ‼</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-6 pb-5 sticky bottom-0 bg-white dark:bg-[#1e293b] pt-2 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (results.some((r) => r.result)) onSave(results) }}
            disabled={!results.some((r) => r.result) || isLoading}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-[13px] font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
            {isLoading ? 'Submitting...' : 'Submit Results to Doctor'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LabDashboard() {
  const user         = useAuthStore((s) => s.user)
  const requestsQuery = useLabRequests()
  const submitMut     = useSubmitResults()

  const [selected, setSelected] = useState(null)
  const [filter, setFilter]     = useState('all')

  const requests = requestsQuery.data || MOCK_REQUESTS
  const stats    = MOCK_STATS

  const today = new Date().toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const filtered = requests.filter((r) => filter === 'all' || r.status === filter)

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">
            Good morning, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">{today}</p>
        </div>
        {requestsQuery.isFetching && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 animate-pulse mt-2">Refreshing...</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Pending',           value: stats.pending,          accent: 'border-amber-200 dark:border-amber-700/40'   },
          { label: 'In Progress',       value: stats.in_progress,      accent: 'border-blue-200 dark:border-blue-700/40'     },
          { label: 'Completed Today',   value: stats.completed_today,  accent: 'border-emerald-200 dark:border-emerald-700/40'},
          { label: 'Avg. Turnaround',   value: stats.avg_turnaround,   accent: 'border-purple-200 dark:border-purple-700/40' },
        ].map((s) => (
          <div key={s.label} className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 transition-colors ${s.accent}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Requests */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden transition-colors">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">Lab Requests</h3>
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {['all', 'pending', 'in_progress', 'completed'].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all capitalize ${
                  filter === s
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {s === 'all' ? 'All' : STATUS_CFG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {requestsQuery.isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map((i) => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700/50 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
            {filtered.length === 0 ? (
              <div className="py-14 text-center text-[13px] text-gray-400 dark:text-gray-500">No requests found</div>
            ) : filtered.map((req) => (
              <div key={req.id} className="px-5 py-4 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-[13px] font-bold shrink-0">
                      {req.patient.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{req.patient.name}</p>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">{req.patient.age} yrs</span>
                        {req.priority === 'urgent' && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/40">
                            Urgent
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                        Requested by {req.doctor} · {req.requested_at}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {req.tests.map((t, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800/40">
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={req.status} />
                    {req.status !== 'completed' && (
                      <button onClick={() => setSelected(req)}
                        className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors opacity-0 group-hover:opacity-100">
                        Enter Results
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ResultsModal
          request={selected}
          onClose={() => setSelected(null)}
          onSave={(results) => submitMut.mutate(
            { requestId: selected.id, results },
            { onSuccess: () => setSelected(null) }
          )}
          isLoading={submitMut.isPending}
        />
      )}
    </>
  )
}