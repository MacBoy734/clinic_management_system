'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import toast from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────
function usePrescriptions() {
  return useQuery({
    queryKey: ['pharmacy', 'prescriptions'],
    queryFn:  () => api.get('/api/pharmacy/prescriptions'),
    refetchInterval: 15000,
    staleTime: 10000,
  })
}

function useStock() {
  return useQuery({
    queryKey: ['pharmacy', 'stock'],
    queryFn:  () => api.get('/api/pharmacy/stock'),
    staleTime: 60000,
  })
}

function useDispense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prescriptionId) => api.post(`/api/pharmacy/prescriptions/${prescriptionId}/dispense`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacy', 'prescriptions'] })
      qc.invalidateQueries({ queryKey: ['pharmacy', 'stock'] })
      toast.success('Medications dispensed — reception notified')
    },
    onError: (e) => toast.error(e.message),
  })
}

function useUpdateStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, quantity }) => api.patch(`/api/pharmacy/stock/${itemId}`, { quantity }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacy', 'stock'] })
      toast.success('Stock updated')
    },
    onError: (e) => toast.error(e.message),
  })
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_PRESCRIPTIONS = [
  {
    id: 1, patient: { name: 'Grace Wanjiku', age: 19 }, doctor: 'Dr. Kim',
    issued_at: '09:22', status: 'pending',
    medications: [
      { name: 'Hydrocortisone 1% Cream', dosage: 'Apply thin layer', frequency: 'Twice daily', duration: '7 days', notes: 'Affected area only' },
      { name: 'Cetirizine 10mg',          dosage: '10mg',             frequency: 'Once daily',  duration: '5 days', notes: 'At night' },
    ],
  },
  {
    id: 2, patient: { name: 'James Otieno', age: 34 }, doctor: 'Dr. Kim',
    issued_at: '09:50', status: 'pending',
    medications: [
      { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Three times daily', duration: '5 days', notes: 'Take with food' },
      { name: 'Paracetamol 500mg', dosage: '1g',    frequency: 'Every 8 hours',     duration: '3 days', notes: 'As needed for fever' },
      { name: 'ORS Sachets',       dosage: '1 sachet', frequency: 'After each loose stool', duration: 'As needed', notes: 'Mix in 200ml clean water' },
    ],
  },
  {
    id: 3, patient: { name: 'Aisha Kamau', age: 28 }, doctor: 'Dr. Kim',
    issued_at: '08:50', status: 'dispensed',
    medications: [
      { name: 'Azithromycin 500mg', dosage: '500mg', frequency: 'Once daily', duration: '3 days', notes: 'Take on empty stomach' },
    ],
  },
]

const MOCK_STOCK = [
  { id: 1, name: 'Amoxicillin 500mg',          category: 'Antibiotic',    quantity: 240,  unit: 'caps',    low_threshold: 50,  expiry: '2026-08' },
  { id: 2, name: 'Paracetamol 500mg',           category: 'Analgesic',     quantity: 580,  unit: 'tabs',    low_threshold: 100, expiry: '2027-01' },
  { id: 3, name: 'Metformin 500mg',             category: 'Antidiabetic',  quantity: 18,   unit: 'tabs',    low_threshold: 50,  expiry: '2026-05' },
  { id: 4, name: 'Cetirizine 10mg',             category: 'Antihistamine', quantity: 120,  unit: 'tabs',    low_threshold: 30,  expiry: '2026-11' },
  { id: 5, name: 'Hydrocortisone 1% Cream',     category: 'Corticosteroid',quantity: 24,   unit: 'tubes',   low_threshold: 10,  expiry: '2026-09' },
  { id: 6, name: 'Azithromycin 500mg',          category: 'Antibiotic',    quantity: 6,    unit: 'tabs',    low_threshold: 20,  expiry: '2025-12' },
  { id: 7, name: 'ORS Sachets',                 category: 'Electrolyte',   quantity: 200,  unit: 'sachets', low_threshold: 50,  expiry: '2027-06' },
  { id: 8, name: 'Omeprazole 20mg',             category: 'PPI',           quantity: 90,   unit: 'caps',    low_threshold: 30,  expiry: '2026-10' },
]

const MOCK_STATS = { pending: 2, dispensed_today: 11, low_stock_items: 3, total_items: 48 }

const STATUS_CFG = {
  pending:   { label: 'Pending',   light: 'bg-amber-50 text-amber-700 border-amber-200',      dark: 'dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/40'     },
  dispensed: { label: 'Dispensed', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/40'},
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PharmacyDashboard() {
  const user              = useAuthStore((s) => s.user)
  const prescriptionsQuery = usePrescriptions()
  const stockQuery         = useStock()
  const dispenseMut        = useDispense()
  const updateStockMut     = useUpdateStock()

  const [tab, setTab]               = useState('prescriptions')
  const [expandedRx, setExpandedRx] = useState(null)
  const [stockSearch, setStockSearch] = useState('')
  const [editingStock, setEditingStock] = useState(null)
  const [newQty, setNewQty]           = useState('')

  const prescriptions = prescriptionsQuery.data || MOCK_PRESCRIPTIONS
  const stock         = stockQuery.data          || MOCK_STOCK
  const stats         = MOCK_STATS

  const today = new Date().toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const filteredStock = stock.filter((s) =>
    s.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.category.toLowerCase().includes(stockSearch.toLowerCase())
  )

  const stockLevel = (item) => {
    if (item.quantity === 0) return 'out'
    if (item.quantity <= item.low_threshold) return 'low'
    return 'ok'
  }

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
        {prescriptionsQuery.isFetching && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 animate-pulse mt-2">Refreshing...</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Pending Rx',      value: stats.pending,          accent: 'border-amber-200 dark:border-amber-700/40'   },
          { label: 'Dispensed Today', value: stats.dispensed_today,  accent: 'border-emerald-200 dark:border-emerald-700/40'},
          { label: 'Low Stock Items', value: stats.low_stock_items,  accent: 'border-red-200 dark:border-red-700/40'       },
          { label: 'Total Items',     value: stats.total_items,      accent: 'border-blue-200 dark:border-blue-700/40'     },
        ].map((s) => (
          <div key={s.label} className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 transition-colors ${s.accent}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-4 w-fit">
        {[
          { key: 'prescriptions', label: 'Prescriptions' },
          { key: 'stock',         label: 'Stock'         },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              tab === t.key
                ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {t.label}
            {t.key === 'prescriptions' && stats.pending > 0 && (
              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                {stats.pending}
              </span>
            )}
            {t.key === 'stock' && stats.low_stock_items > 0 && (
              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                {stats.low_stock_items}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Prescriptions tab */}
      {tab === 'prescriptions' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">Incoming Prescriptions</h3>
          </div>
          {prescriptionsQuery.isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2].map((i) => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-700/50 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="px-5 py-4 transition-colors">
                  {/* Rx header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-[13px] font-bold shrink-0">
                        {rx.patient.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{rx.patient.name}</p>
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">{rx.patient.age} yrs</span>
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                          {rx.doctor} · {rx.issued_at} · {rx.medications.length} medication{rx.medications.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${STATUS_CFG[rx.status].light} ${STATUS_CFG[rx.status].dark}`}>
                        {STATUS_CFG[rx.status].label}
                      </span>
                      <button onClick={() => setExpandedRx(expandedRx === rx.id ? null : rx.id)}
                        className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50">
                        {expandedRx === rx.id ? 'Hide ▲' : 'View ▼'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded medications */}
                  {expandedRx === rx.id && (
                    <div className="mt-3 ml-12">
                      <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                              <th className="text-left px-4 py-2">Medication</th>
                              <th className="text-left px-4 py-2">Dosage</th>
                              <th className="text-left px-4 py-2">Frequency</th>
                              <th className="text-left px-4 py-2">Duration</th>
                              <th className="text-left px-4 py-2">Instructions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                            {rx.medications.map((med, i) => (
                              <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                                <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{med.name}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{med.dosage}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{med.frequency}</td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{med.duration}</td>
                                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-500 italic">{med.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {rx.status === 'pending' && (
                        <button
                          onClick={() => dispenseMut.mutate(rx.id)}
                          disabled={dispenseMut.isPending}
                          className="mt-3 w-full py-2.5 rounded-xl bg-teal-600 text-white text-[13px] font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50">
                          {dispenseMut.isPending ? 'Processing...' : 'Dispense All Medications'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stock tab */}
      {tab === 'stock' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden transition-colors">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">Medicine Stock</h3>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
              </svg>
              <input value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search medicine..."
                className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-44 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Medicine</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-left px-5 py-3">Stock</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Expiry</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filteredStock.map((item) => {
                  const level = stockLevel(item)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors group">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{item.category}</td>
                      <td className="px-5 py-3.5">
                        {editingStock === item.id ? (
                          <div className="flex items-center gap-1.5">
                            <input value={newQty} onChange={(e) => setNewQty(e.target.value)}
                              type="number" min="0"
                              className="w-20 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-[12px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                            <span className="text-[11px] text-gray-400">{item.unit}</span>
                            <button onClick={() => {
                              updateStockMut.mutate({ itemId: item.id, quantity: Number(newQty) })
                              setEditingStock(null)
                            }}
                              className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700">✓</button>
                            <button onClick={() => setEditingStock(null)}
                              className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                        ) : (
                          <span className={`font-semibold ${
                            level === 'out' ? 'text-red-600 dark:text-red-400' :
                            level === 'low' ? 'text-orange-600 dark:text-orange-400' :
                            'text-gray-900 dark:text-gray-100'
                          }`}>
                            {item.quantity} <span className="font-normal text-gray-400 dark:text-gray-500">{item.unit}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          level === 'out' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700/40'         :
                          level === 'low' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-700/40' :
                          'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/40'
                        }`}>
                          {level === 'out' ? 'Out of Stock' : level === 'low' ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-[11px]">{item.expiry}</td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => { setEditingStock(item.id); setNewQty(String(item.quantity)) }}
                          className="text-[11px] font-medium text-[#1a6cbf] dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-all">
                          Update Stock
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}