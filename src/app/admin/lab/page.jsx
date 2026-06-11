'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ─── React Query hooks ────────────────────────────────────────────────────────
function useLabRequests({ page, period, status, referredFilter, techId, search }) {
  return useQuery({
    queryKey: ['admin', 'lab-requests', { page, period, status, referredFilter, techId, search }],
    queryFn: () =>
      api.get(`/api/admin/lab-requests?page=${page}&limit=20&period=${period}&status=${status}&referred=${referredFilter}&tech_id=${techId}&search=${encodeURIComponent(search)}`),
    placeholderData: (prev) => prev,
    staleTime: 30000,
  })
}

function useLabStats(period) {
  return useQuery({
    queryKey: ['admin', 'lab-stats', period],
    queryFn: () => api.get(`/api/admin/lab-stats?period=${period}`),
    staleTime: 60000,
  })
}

function useLabTechs() {
  return useQuery({
    queryKey: ['admin', 'lab-techs'],
    // getAllStaff returns a plain array
    queryFn: () => api.get('/api/admin/lab-techs'),
    staleTime: 300000,
  })
}

function useLabStock() {
  return useQuery({
    queryKey: ['admin', 'lab-stock'],
    queryFn: () => api.get('/api/admin/lab-stock'),
    staleTime: 30000,
  })
}

function useUpdateLabStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) =>
      id
        ? api.put(`/api/admin/lab-stock/${id}`, data)
        : api.post('/api/admin/lab-stock', data),
    onSuccess: () => qc.invalidateQueries(['admin', 'lab-stock']),
  })
}

function useDeleteLabStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/api/admin/lab-stock/${id}`),
    onSuccess: () => qc.invalidateQueries(['admin', 'lab-stock']),
  })
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_LAB_REQUESTS = [
  {
    id: 1,
    visit_id: 9,
    test_name: 'Malaria RDT',
    status: 'ready',
    result: 'Positive (P. falciparum)',
    notes: null,
    unit_cost: 400,
    requested_at: '2026-06-10T07:30:00Z',
    completed_at: '2026-06-10T08:10:00Z',
    tech: { id: 2, username: 'Njeri W.' },
    visit: {
      id: 9,
      visit_type: 'direct_lab',
      queue_number: 3,
      referred_by: 'Dr. Omondi (Aga Khan)',
      referrer_phone: '0711 222 333',
      patient: { id: 9, name: 'John Kamande', phone: '0799 123 456', date_of_birth: '1997-09-08' },
    },
  },
  {
    id: 2,
    visit_id: 1,
    test_name: 'Full Blood Count',
    status: 'ready',
    result: '5.2 × 10³/μL — within normal limits',
    notes: 'No abnormalities detected',
    unit_cost: 600,
    requested_at: '2026-06-10T08:45:00Z',
    completed_at: '2026-06-10T09:30:00Z',
    tech: { id: 2, username: 'Njeri W.' },
    visit: {
      id: 1,
      visit_type: 'consultation',
      queue_number: 5,
      referred_by: null,
      referrer_phone: null,
      patient: { id: 1, name: 'James Otieno', phone: '0712 345 678', date_of_birth: '1990-03-14' },
    },
  },
  {
    id: 3,
    visit_id: 13,
    test_name: 'PSA (Prostate Specific Antigen)',
    status: 'ready',
    result: '3.2 ng/mL — normal range',
    notes: null,
    unit_cost: 1200,
    requested_at: '2026-06-10T09:00:00Z',
    completed_at: '2026-06-10T10:15:00Z',
    tech: { id: 3, username: 'Kamau J.' },
    visit: {
      id: 13,
      visit_type: 'direct_lab',
      queue_number: 7,
      referred_by: 'Dr. Waweru (MP Shah)',
      referrer_phone: '0733 444 555',
      patient: { id: 12, name: 'Kevin Njoroge', phone: '0722 567 890', date_of_birth: '1978-03-27' },
    },
  },
  {
    id: 4,
    visit_id: 13,
    test_name: 'Lipid Profile',
    status: 'ready',
    result: 'LDL 3.1 mmol/L — borderline',
    notes: 'Recommend dietary review',
    unit_cost: 900,
    requested_at: '2026-06-10T09:00:00Z',
    completed_at: '2026-06-10T10:20:00Z',
    tech: { id: 3, username: 'Kamau J.' },
    visit: {
      id: 13,
      visit_type: 'direct_lab',
      queue_number: 7,
      referred_by: 'Dr. Waweru (MP Shah)',
      referrer_phone: '0733 444 555',
      patient: { id: 12, name: 'Kevin Njoroge', phone: '0722 567 890', date_of_birth: '1978-03-27' },
    },
  },
  {
    id: 5,
    visit_id: 3,
    test_name: 'Renal Function Tests',
    status: 'ready',
    result: 'Creatinine 88 μmol/L — within range',
    notes: null,
    unit_cost: 800,
    requested_at: '2026-06-09T10:20:00Z',
    completed_at: '2026-06-09T11:45:00Z',
    tech: { id: 2, username: 'Njeri W.' },
    visit: {
      id: 3,
      visit_type: 'consultation',
      queue_number: 12,
      referred_by: null,
      referrer_phone: null,
      patient: { id: 3, name: 'Peter Mwangi', phone: '0733 567 890', date_of_birth: '1973-11-05' },
    },
  },
  {
    id: 6,
    visit_id: 20,
    test_name: 'Thyroid Function Tests',
    status: 'in_progress',
    result: null,
    notes: null,
    unit_cost: 1500,
    requested_at: '2026-06-10T10:30:00Z',
    completed_at: null,
    tech: { id: 3, username: 'Kamau J.' },
    visit: {
      id: 20,
      visit_type: 'direct_lab',
      queue_number: 11,
      referred_by: 'Dr. Mwangi (Kenyatta Hospital)',
      referrer_phone: '0700 111 222',
      patient: { id: 15, name: 'Agnes Mutua', phone: '0744 888 999', date_of_birth: '1985-07-14' },
    },
  },
  {
    id: 7,
    visit_id: 21,
    test_name: 'HbA1c',
    status: 'pending',
    result: null,
    notes: null,
    unit_cost: 1100,
    requested_at: '2026-06-10T11:00:00Z',
    completed_at: null,
    tech: null,
    visit: {
      id: 21,
      visit_type: 'consultation',
      queue_number: 14,
      referred_by: null,
      referrer_phone: null,
      patient: { id: 16, name: 'George Kiprop', phone: '0755 000 111', date_of_birth: '1960-02-28' },
    },
  },
  {
    id: 8,
    visit_id: 22,
    test_name: 'Urine Culture & Sensitivity',
    status: 'pending',
    result: null,
    notes: null,
    unit_cost: 1400,
    requested_at: '2026-06-10T11:15:00Z',
    completed_at: null,
    tech: null,
    visit: {
      id: 22,
      visit_type: 'direct_lab',
      queue_number: 16,
      referred_by: 'Dr. Omondi (Aga Khan)',
      referrer_phone: '0711 222 333',
      patient: { id: 17, name: 'Esther Njoki', phone: '0766 222 333', date_of_birth: '1993-11-11' },
    },
  },
]

const MOCK_STATS = {
  total_tests: 312,
  lab_revenue: 284600,
  pending_count: 14,
  referred_count: 128,
  avg_turnaround_mins: 47,
}

const MOCK_TECHS = [
  { id: 2, username: 'Njeri W.' },
  { id: 3, username: 'Kamau J.' },
]

// Mock stock uses controller field names: item_name, reorder_at, expiry
const MOCK_LAB_STOCK = [
  { id: 1,  item_name: 'Malaria RDT Kit',          quantity: 80,  unit: 'kits',   reorder_at: 30,  expiry: '2027-03-01' },
  { id: 2,  item_name: 'EDTA Vacutainer Tubes',     quantity: 200, unit: 'tubes',  reorder_at: 100, expiry: '2027-06-01' },
  { id: 3,  item_name: 'HbA1c Reagent Kit',         quantity: 12,  unit: 'kits',   reorder_at: 15,  expiry: '2026-09-15' },
  { id: 4,  item_name: 'Urine Dipstick Strips',     quantity: 500, unit: 'strips', reorder_at: 200, expiry: '2026-12-01' },
  { id: 5,  item_name: 'Glucose (FBS) Reagent',     quantity: 8,   unit: 'vials',  reorder_at: 10,  expiry: '2026-08-20' },
  { id: 6,  item_name: 'Lipid Profile Reagent',     quantity: 20,  unit: 'vials',  reorder_at: 8,   expiry: '2026-11-30' },
  { id: 7,  item_name: 'PSA Test Kit',              quantity: 25,  unit: 'kits',   reorder_at: 10,  expiry: '2027-01-15' },
  { id: 8,  item_name: 'Creatinine Reagent',        quantity: 30,  unit: 'vials',  reorder_at: 12,  expiry: '2026-10-10' },
  { id: 9,  item_name: 'Thyroid (TSH) Reagent Kit', quantity: 6,   unit: 'kits',   reorder_at: 8,   expiry: '2026-07-30' },
  { id: 10, item_name: 'Microscope Slides',         quantity: 400, unit: 'pieces', reorder_at: 150, expiry: null         },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'today',      label: 'Today'      },
  { key: 'this_week',  label: 'This week'  },
  { key: 'this_month', label: 'This month' },
  { key: 'this_year',  label: 'This year'  },
]

const STATUS_TABS = [
  { key: 'all',         label: 'All'         },
  { key: 'pending',     label: 'Pending'     },
  { key: 'in_progress', label: 'In progress' },
  { key: 'ready',       label: 'Ready'       },
]

const REFERRED_TABS = [
  { key: 'all',          label: 'All patients'  },
  { key: 'referred',     label: 'Referred'       },
  { key: 'not_referred', label: 'Walk-in / Own'  },
]

const LAB_STATUS_COLORS = {
  pending:     'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40',
  in_progress: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-700/40',
  ready:       'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function turnaround(requested, completed) {
  if (!completed) return null
  const mins = Math.round((new Date(completed) - new Date(requested)) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function getAge(dob) {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25))
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false
  const days = (new Date(dateStr) - Date.now()) / (1000 * 60 * 60 * 24)
  return days >= 0 && days <= 90
}

function isExpired(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
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

// ─── Lab request detail slide-over ───────────────────────────────────────────
function LabRequestPanel({ request, onClose }) {
  if (!request) return null
  const { visit } = request
  const age = getAge(visit.patient.date_of_birth)
  const ta  = turnaround(request.requested_at, request.completed_at)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1e293b] h-full overflow-y-auto shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1e293b] z-10">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{request.test_name}</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Lab Request #{request.id} · {formatDateTime(request.requested_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none transition-colors">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 flex-1">

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-base font-bold">
              {visit.patient.name.charAt(0)}
            </div>
            <div>
              <p className="text-[14px] font-bold text-gray-900 dark:text-gray-100">{visit.patient.name}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {age !== null ? `${age} yrs` : '—'}
                {visit.patient.phone && <> · {visit.patient.phone}</>}
                {' · '}Queue #{visit.queue_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border ${
              visit.visit_type === 'direct_lab'
                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-700/40'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-700/40'
            }`}>
              {visit.visit_type === 'direct_lab' ? 'Direct lab (referred)' : 'Consultation'}
            </span>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border ${LAB_STATUS_COLORS[request.status]}`}>
              {request.status.replace('_', ' ')}
            </span>
          </div>

          {visit.referred_by ? (
            <div className="rounded-xl border border-purple-200 dark:border-purple-700/40 bg-purple-50 dark:bg-purple-900/10 px-4 py-3.5 space-y-2">
              <p className="text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wide">
                Referrer details — for commission
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Referred by</span>
                  <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{visit.referred_by}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Contact</span>
                  <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300">{visit.referrer_phone ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Commission basis</span>
                  <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300">KES {request.unit_cost.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 px-4 py-3 text-[12px] text-gray-400 dark:text-gray-500 italic">
              No referrer — walk-in or consultation patient
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Test details</p>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden text-[12px]">
              <div className="flex justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/40">
                <span className="text-gray-500 dark:text-gray-400">Test</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{request.test_name}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/40">
                <span className="text-gray-500 dark:text-gray-400">Fee charged</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">KES {request.unit_cost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/40">
                <span className="text-gray-500 dark:text-gray-400">Requested</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{formatDateTime(request.requested_at)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/40">
                <span className="text-gray-500 dark:text-gray-400">Completed</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{formatDateTime(request.completed_at)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/40">
                <span className="text-gray-500 dark:text-gray-400">Turnaround</span>
                <span className={`font-mono font-semibold ${ta ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600 italic'}`}>
                  {ta ?? 'In progress'}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500 dark:text-gray-400">Technician</span>
                <span className="text-gray-700 dark:text-gray-300">{request.tech?.username ?? <span className="italic text-gray-300 dark:text-gray-600">Unassigned</span>}</span>
              </div>
            </div>
          </div>

          {request.result && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Result</p>
              <div className="rounded-xl border border-emerald-100 dark:border-emerald-800/30 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3">
                <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{request.result}</p>
                {request.notes && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 italic">{request.notes}</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Stock modal ──────────────────────────────────────────────────────────────
// Fields match controller: item_name, quantity, reorder_at, expiry, unit
const EMPTY_STOCK = { item_name: '', quantity: '', unit: 'kits', reorder_at: '', expiry: '' }

function LabStockModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item
    ? { ...item, expiry: item.expiry ? item.expiry.slice(0, 10) : '' }
    : EMPTY_STOCK
  )
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  const inputCls = 'w-full text-[12px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors'
  const labelCls = 'block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
            {item ? 'Edit stock item' : 'Add stock item'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Item name</label>
            <input className={inputCls} value={form.item_name} onChange={set('item_name')} placeholder="e.g. Malaria RDT Kit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity</label>
              <input className={inputCls} type="number" value={form.quantity} onChange={set('quantity')} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input className={inputCls} value={form.unit} onChange={set('unit')} placeholder="kits / vials / strips" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Reorder at</label>
            <input className={inputCls} type="number" value={form.reorder_at} onChange={set('reorder_at')} placeholder="0" />
          </div>
          <div>
            <label className={labelCls}>Expiry date</label>
            <input className={inputCls} type="date" value={form.expiry} onChange={set('expiry')} />
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.item_name}
            className="px-4 py-2 text-[12px] rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminLabPage() {
  const [activeTab,      setActiveTab]      = useState('requests')
  const [period,         setPeriod]         = useState('this_month')
  const [page,           setPage]           = useState(1)
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [referredFilter, setReferredFilter] = useState('all')
  const [techId,         setTechId]         = useState('all')
  const [search,         setSearch]         = useState('')
  const [selectedReq,    setSelectedReq]    = useState(null)
  const [stockSearch,    setStockSearch]    = useState('')
  const [stockModal,     setStockModal]     = useState(null) // null | 'new' | item object
  const [deleteConfirm,  setDeleteConfirm]  = useState(null)

  const labQuery   = useLabRequests({ page, period, status: statusFilter, referredFilter, techId, search })
  const statsQuery = useLabStats(period)
  const techsQuery = useLabTechs()
  const stockQuery = useLabStock()
  const saveMutation   = useUpdateLabStock()
  const deleteMutation = useDeleteLabStock()

  // Fallback to mock data while APIs are unavailable
  // getAllStaff returns a plain array (no wrapper object)
  const requests = labQuery.data?.requests  || MOCK_LAB_REQUESTS
  const total    = labQuery.data?.total     || MOCK_LAB_REQUESTS.length
  const stats    = statsQuery.data          || MOCK_STATS
  const techs    = Array.isArray(techsQuery.data) ? techsQuery.data : MOCK_TECHS
  // getLabStock returns { stock: [...] }
  const allStock = stockQuery.data?.stock   || MOCK_LAB_STOCK

  const filteredRequests = useMemo(() => {
    if (labQuery.data) return requests
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (referredFilter === 'referred'     && !r.visit.referred_by) return false
      if (referredFilter === 'not_referred' &&  r.visit.referred_by) return false
      if (techId !== 'all' && r.tech?.id !== Number(techId)) return false
      if (search) {
        const q = search.toLowerCase()
        return r.visit.patient.name.toLowerCase().includes(q) ||
               r.test_name.toLowerCase().includes(q) ||
               r.visit.referred_by?.toLowerCase().includes(q)
      }
      return true
    })
  }, [requests, statusFilter, referredFilter, techId, search, labQuery.data])

  const filteredStock = useMemo(() => {
    if (!stockSearch) return allStock
    const q = stockSearch.toLowerCase()
    // filter on item_name (controller field)
    return allStock.filter((d) => d.item_name.toLowerCase().includes(q))
  }, [allStock, stockSearch])

  // low stock: quantity <= reorder_at  (controller field name)
  const lowStockCount = allStock.filter((d) => d.quantity <= d.reorder_at).length
  const expiredCount  = allStock.filter((d) => isExpired(d.expiry)).length

  const totalPages = Math.ceil(total / 20)

  // Payload matches createLabStockItem / updateLabStockItem expectations
  const handleSaveItem = async (form) => {
    await saveMutation.mutateAsync({
      id: form.id ?? null,
      data: {
        item_name:  form.item_name,
        quantity:   Number(form.quantity),
        unit:       form.unit,
        reorder_at: Number(form.reorder_at) || 0,
        expiry:     form.expiry || null,
      },
    })
  }

  const handleDeleteItem = async (id) => {
    await deleteMutation.mutateAsync(id)
    setDeleteConfirm(null)
  }

  const referredCounts = useMemo(() => ({
    all:          requests.length,
    referred:     requests.filter((r) => r.visit.referred_by).length,
    not_referred: requests.filter((r) => !r.visit.referred_by).length,
  }), [requests])

  return (
    <>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Laboratory</h2>
          <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
            Test requests · referrer tracking · stock management
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                period === p.key
                  ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Tests run"      value={(stats.total_tests ?? 0).toLocaleString()}               sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()} />
        <StatCard label="Pending"        value={stats.pending_count ?? 0}                                 sub="awaiting results"     accent="border-amber-200 dark:border-amber-700/40" />
        <StatCard label="Referred tests" value={stats.referred_count ?? 0}                                sub="direct lab patients"  accent="border-purple-200 dark:border-purple-700/40" />
      </div>

      {/* ── Tab switcher ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            activeTab === 'requests'
              ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Test requests
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            activeTab === 'stock'
              ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Stock
          {(lowStockCount > 0 || expiredCount > 0) && (
            <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
              {lowStockCount + expiredCount}
            </span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TEST REQUESTS                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'requests' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">

          {/* Referred filter */}
          <div className="flex gap-1 px-5 pt-4 pb-0">
            {REFERRED_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setReferredFilter(tab.key); setPage(1) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
                  referredFilter === tab.key
                    ? 'bg-[#1a6cbf] text-white border-[#1a6cbf] shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700 hover:text-[#1a6cbf] dark:hover:text-blue-400'
                }`}
              >
                {tab.key === 'referred' && (
                  <span className={`w-1.5 h-1.5 rounded-full ${referredFilter === tab.key ? 'bg-white/60' : 'bg-purple-400'}`} />
                )}
                {tab.label}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  referredFilter === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {referredCounts[tab.key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 px-5 pt-3 pb-0">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setPage(1) }}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  statusFilter === tab.key
                    ? tab.key === 'pending'     ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : tab.key === 'in_progress' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : tab.key === 'ready'       ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700/60 mt-3">
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">
              {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
            </span>

            <select
              value={techId}
              onChange={(e) => { setTechId(e.target.value); setPage(1) }}
              className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            >
              <option value="all">All technicians</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.username}</option>)}
            </select>

            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
              </svg>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Patient, test, referrer…"
                className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-48 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>

            <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Export
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Patient</th>
                  <th className="text-left px-5 py-3">Test</th>
                  <th className="text-left px-5 py-3">Referrer</th>
                  <th className="text-left px-5 py-3">Requested</th>
                  <th className="text-left px-5 py-3">Turnaround</th>
                  <th className="text-left px-5 py-3">Tech</th>
                  <th className="text-left px-5 py-3">Fee (KES)</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-14 text-[13px] text-gray-400 dark:text-gray-500">
                      No requests found
                    </td>
                  </tr>
                ) : filteredRequests.map((r) => {
                  const ta = turnaround(r.requested_at, r.completed_at)
                  return (
                    <tr key={r.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors group">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{r.visit.patient.name}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">Q#{r.visit.queue_number}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300 max-w-40 truncate" title={r.test_name}>
                        {r.test_name}
                      </td>
                      <td className="px-5 py-3.5">
                        {r.visit.referred_by ? (
                          <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                            <span className="truncate max-w-30" title={r.visit.referred_by}>{r.visit.referred_by}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300 dark:text-gray-600 italic">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDateTime(r.requested_at)}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px]">
                        {ta
                          ? <span className="text-gray-700 dark:text-gray-300">{ta}</span>
                          : <span className="text-gray-300 dark:text-gray-600 italic">—</span>
                        }
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                        {r.tech?.username ?? <span className="text-gray-300 dark:text-gray-600 italic">—</span>}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {r.unit_cost.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${LAB_STATUS_COLORS[r.status]}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setSelectedReq(r)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-[#1a6cbf] dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          View more
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {total.toLocaleString()} total requests
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 px-2">
                {page} / {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || totalPages === 0}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: STOCK                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'stock' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">

          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">
              {filteredStock.length} items
              {lowStockCount > 0 && (
                <span className="ml-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  · {lowStockCount} low stock
                </span>
              )}
              {expiredCount > 0 && (
                <span className="ml-2 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  · {expiredCount} expired
                </span>
              )}
            </span>

            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
              </svg>
              <input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search items…"
                className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-44 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>

            <button
              onClick={() => setStockModal('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Add item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Item</th>
                  <th className="text-left px-5 py-3">Qty</th>
                  <th className="text-left px-5 py-3">Reorder at</th>
                  <th className="text-left px-5 py-3">Unit</th>
                  <th className="text-left px-5 py-3">Expiry</th>
                  <th className="text-left px-5 py-3">Stock status</th>
                  <th className="text-left px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-14 text-[13px] text-gray-400 dark:text-gray-500">
                      No items found
                    </td>
                  </tr>
                ) : filteredStock.map((item) => {
                  // use controller field names: reorder_at, expiry
                  const low     = item.quantity <= item.reorder_at
                  const expired = isExpired(item.expiry)
                  const soon    = !expired && isExpiringSoon(item.expiry)
                  return (
                    <tr key={item.id} className={`hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors group ${expired ? 'bg-red-50/30 dark:bg-red-900/5' : low ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}>

                      <td className="px-5 py-3.5">
                        {/* item_name — controller field */}
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{item.item_name}</p>
                      </td>

                      <td className="px-5 py-3.5">
                        <span className={`font-mono font-semibold ${low ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.quantity}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 font-mono text-gray-500 dark:text-gray-400">
                        {item.reorder_at}
                      </td>

                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                        {item.unit ?? '—'}
                      </td>

                      <td className="px-5 py-3.5 font-mono text-[11px]">
                        {item.expiry ? (
                          <span className={
                            expired ? 'text-red-600 dark:text-red-400 font-semibold' :
                            soon    ? 'text-amber-600 dark:text-amber-400 font-semibold' :
                            'text-gray-500 dark:text-gray-400'
                          }>
                            {formatDate(item.expiry)}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 italic">No expiry</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        {expired ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-700/40">
                            Expired
                          </span>
                        ) : low ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40">
                            Low stock
                          </span>
                        ) : soon ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-700/40">
                            Expiring soon
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40">
                            OK
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => setStockModal(item)}
                            className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-[#1a6cbf] dark:hover:text-blue-400 transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(item)}
                            className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400 transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Lab request detail panel ──────────────────────────────────────── */}
      {selectedReq && (
        <LabRequestPanel
          request={selectedReq}
          onClose={() => setSelectedReq(null)}
        />
      )}

      {/* ── Stock modal ───────────────────────────────────────────────────── */}
      {stockModal && (
        <LabStockModal
          item={stockModal === 'new' ? null : stockModal}
          onClose={() => setStockModal(null)}
          onSave={handleSaveItem}
        />
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete stock item?</h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-5">
              <span className="font-semibold text-gray-800 dark:text-gray-200">{deleteConfirm.item_name}</span> will be permanently removed from stock.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteItem(deleteConfirm.id)}
                className="px-4 py-2 text-[12px] rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}