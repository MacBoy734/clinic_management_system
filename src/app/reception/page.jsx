'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'

// ─── React Query hooks ────────────────────────────────────────────────────────
function useQueue() {
  return useQuery({
    queryKey: ['queue', 'today'],
    queryFn:  () => api.get('/api/visits/today'),
    refetchInterval: 15000,
    staleTime: 10000,
  })
}

function useStats() {
  return useQuery({
    queryKey: ['reception', 'stats'],
    queryFn:  () => api.get('/api/reception/stats'),
    refetchInterval: 30000,
    staleTime: 20000,
  })
}

function useRegisterPatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/api/patients/register', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'stats'] })
    },
  })
}

function useUpdateStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ visitId, status }) =>
      api.patch(`/api/visits/${visitId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'stats'] })
    },
  })
}

function useArchiveVisit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (visitId) => api.post(`/api/visits/${visitId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'stats'] })
    },
  })
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_QUEUE = [
  { id: 1, patient: { name: 'James Otieno',  age: 34 }, arrived_at: '08:12', status: 'waiting',     complaint: 'Fever & headache',  fee_status: 'paid'    },
  { id: 2, patient: { name: 'Aisha Kamau',   age: 28 }, arrived_at: '08:45', status: 'with_doctor', complaint: 'Persistent cough',  fee_status: 'paid'    },
  { id: 3, patient: { name: 'Peter Mwangi',  age: 52 }, arrived_at: '09:03', status: 'lab',         complaint: 'Chest pains',       fee_status: 'paid'    },
  { id: 4, patient: { name: 'Grace Wanjiku', age: 19 }, arrived_at: '09:20', status: 'pharmacy',    complaint: 'Skin rash',         fee_status: 'paid'    },
  { id: 5, patient: { name: 'David Ochieng', age: 41 }, arrived_at: '09:35', status: 'waiting',     complaint: 'Back pain',         fee_status: 'pending' },
  { id: 6, patient: { name: 'Faith Njeri',   age: 7  }, arrived_at: '09:48', status: 'waiting',     complaint: 'Stomach ache',      fee_status: 'paid'    },
  { id: 7, patient: { name: 'Samuel Korir',  age: 63 }, arrived_at: '10:02', status: 'billing',     complaint: 'Diabetes checkup',  fee_status: 'paid'    },
]

const MOCK_STATS = {
  today_patients: 23,
  waiting:        4,
  with_doctor:    1,
  completed:      11,
  revenue:        34500,
}

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  waiting:     { label: 'Waiting',     cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'       },
  with_doctor: { label: 'With Doctor', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'             },
  lab:         { label: 'In Lab',      cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800' },
  pharmacy:    { label: 'Pharmacy',    cls: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800'             },
  billing:     { label: 'Billing',     cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800' },
  done:        { label: 'Done',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' },
}

// ─── Small components ─────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accentClass }) {
  return (
    <div className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 flex flex-col gap-1 ${accentClass || 'border-gray-200 dark:border-gray-700'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.waiting
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function NewPatientModal({ onClose, onSave, isLoading }) {
  const [form, setForm] = useState({
    name: '', age: '', phone: '', complaint: '', fee_status: 'paid'
  })

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.complaint.trim()) return
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Register New Patient</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name *</label>
            <input
              value={form.name} onChange={set('name')} placeholder="e.g. John Otieno"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Age</label>
              <input
                value={form.age} onChange={set('age')} type="number" min="0" max="120" placeholder="Age"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
              <input
                value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Presenting Complaint *</label>
            <textarea
              value={form.complaint} onChange={set('complaint')}
              placeholder="Chief complaint / reason for visit" rows={2}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Consultation Fee</label>
            <div className="flex gap-2">
              {['paid', 'pending', 'waived'].map((opt) => (
                <button
                  key={opt} type="button"
                  onClick={() => setForm((f) => ({ ...f, fee_status: opt }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-all ${
                    form.fee_status === opt
                      ? 'bg-[#0c2340] border-[#0c2340] text-white'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-[#1a6cbf] text-white text-sm font-semibold hover:bg-[#155aa3] transition-colors disabled:opacity-60"
            >
              {isLoading ? 'Registering...' : 'Register & Add to Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ReceptionDashboard() {
  const user = useAuthStore((s) => s.user)

  const [showModal, setShowModal] = useState(false)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('all')

  const queueQuery  = useQueue()
  const statsQuery  = useStats()
  const registerMut = useRegisterPatient()
  const statusMut   = useUpdateStatus()
  const archiveMut  = useArchiveVisit()

  const queue = queueQuery.data || MOCK_QUEUE
  const stats = statsQuery.data || MOCK_STATS

  const today = new Date().toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const filtered = queue.filter((v) => {
    const name = v.patient?.name || ''
    return (
      name.toLowerCase().includes(search.toLowerCase()) &&
      (filterStatus === 'all' || v.status === filterStatus)
    )
  })

  const handleRegister = (form) => {
    registerMut.mutate(form, { onSuccess: () => setShowModal(false) })
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Good morning, {user?.name?.split(' ')[0]}
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          {(queueQuery.isFetching || statsQuery.isFetching) && (
            <span className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Refreshing...</span>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#1a6cbf] hover:bg-[#155aa3] text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            New Patient
          </button>
        </div>
      </div>

      {/* Error */}
      {queueQuery.isError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          Could not load queue: {queueQuery.error?.message}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Today's Patients" value={stats.today_patients} sub="registered today" />
        <StatCard label="In Queue"         value={stats.waiting}        sub="awaiting doctor"   accentClass="border-amber-200 dark:border-amber-800"   />
        <StatCard label="With Doctor"      value={stats.with_doctor}    sub="in consultation"   accentClass="border-blue-200 dark:border-blue-800"    />
        <StatCard label="Completed"        value={stats.completed}      sub="seen & discharged" accentClass="border-emerald-200 dark:border-emerald-800" />
        <StatCard label="Revenue"          value={`KES ${(stats.revenue || 0).toLocaleString()}`} sub="today's total" accentClass="border-purple-200 dark:border-purple-800" />
      </div>

      {/* Queue table */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">Patient Queue</h3>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
            </svg>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient..."
              className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg w-44 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-1">
            {['all', 'waiting', 'with_doctor', 'lab', 'pharmacy', 'billing'].map((s) => (
              <button
                key={s} onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  filterStatus === s
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {queueQuery.isLoading ? (
          <div className="p-8 space-y-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50/70 dark:bg-gray-800/50">
                  <th className="text-left px-5 py-3">#</th>
                  <th className="text-left px-5 py-3">Patient</th>
                  <th className="text-left px-5 py-3">Complaint</th>
                  <th className="text-left px-5 py-3">Arrived</th>
                  <th className="text-left px-5 py-3">Fee</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                      No patients found
                    </td>
                  </tr>
                ) : filtered.map((v, idx) => {
                  const name = v.patient?.name || 'Unknown'
                  const age  = v.patient?.age  || '—'
                  return (
                    <tr key={v.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors group">
                      <td className="px-5 py-3.5 text-gray-400 dark:text-gray-500 text-xs">{idx + 1}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#e8f0fb] dark:bg-[#1a6cbf]/20 text-[#1a6cbf] dark:text-[#60a5fa] flex items-center justify-center text-xs font-bold shrink-0">
                            {name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{age} yrs</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 max-w-45 truncate">{v.complaint}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">{v.arrived_at}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium capitalize ${
                          v.fee_status === 'paid'    ? 'text-emerald-600 dark:text-emerald-400' :
                          v.fee_status === 'pending' ? 'text-amber-600 dark:text-amber-400'     : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {v.fee_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={v.status} /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {v.status !== 'billing' && v.status !== 'done' && (
                            <button
                              onClick={() => statusMut.mutate({ visitId: v.id, status: 'billing' })}
                              disabled={statusMut.isPending}
                              className="px-2 py-1 text-xs rounded-md bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 disabled:opacity-40"
                            >
                              Bill
                            </button>
                          )}
                          {v.status !== 'done' && (
                            <button
                              onClick={() => statusMut.mutate({ visitId: v.id, status: 'done' })}
                              disabled={statusMut.isPending}
                              className="px-2 py-1 text-xs rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-40"
                            >
                              Done
                            </button>
                          )}
                          {v.status === 'done' && (
                            <button
                              onClick={() => archiveMut.mutate(v.id)}
                              disabled={archiveMut.isPending}
                              className="px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 bg-gray-50/70 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-gray-500">Showing {filtered.length} of {queue.length} patients</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Auto-refreshes every 15s</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="mt-4 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[
            { time: '10:02', msg: 'Samuel Korir moved to billing',      type: 'billing'  },
            { time: '09:55', msg: 'Lab results ready for Peter Mwangi', type: 'lab'      },
            { time: '09:48', msg: 'Grace Wanjiku sent to pharmacy',     type: 'pharmacy' },
            { time: '09:20', msg: 'Faith Njeri registered',             type: 'info'     },
            { time: '08:45', msg: 'Aisha Kamau in consultation',        type: 'doctor'   },
          ].map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono pt-0.5 w-10 shrink-0">{a.time}</span>
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                a.type === 'lab'      ? 'bg-purple-400' :
                a.type === 'pharmacy' ? 'bg-teal-400'   :
                a.type === 'billing'  ? 'bg-orange-400' :
                a.type === 'doctor'   ? 'bg-blue-400'   : 'bg-gray-300 dark:bg-gray-600'
              }`} />
              <p className="text-sm text-gray-600 dark:text-gray-400">{a.msg}</p>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <NewPatientModal
          onClose={() => setShowModal(false)}
          onSave={handleRegister}
          isLoading={registerMut.isPending}
        />
      )}
    </>
  )
}