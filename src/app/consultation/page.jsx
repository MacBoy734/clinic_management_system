'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useVisitStore } from '@/store/visitStore'
import api from '@/lib/api'
import toast from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useMyQueue() {
  return useQuery({
    queryKey: ['doctor', 'queue'],
    queryFn:  () => api.get('/api/consultation/queue'),
    refetchInterval: 15000,
    staleTime: 10000,
  })
}

function useVisitDetail(visitId) {
  return useQuery({
    queryKey: ['visit', visitId],
    queryFn:  () => api.get(`/api/visits/${visitId}`),
    enabled:  !!visitId,
  })
}

function useSaveNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ visitId, notes }) => api.patch(`/api/visits/${visitId}/notes`, { notes }),
    onSuccess: (_, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['visit', visitId] })
      toast.success('Notes saved')
    },
    onError: (e) => toast.error(e.message),
  })
}

function useRequestLab() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ visitId, tests }) => api.post(`/api/visits/${visitId}/lab-request`, { tests }),
    onSuccess: (_, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['visit', visitId] })
      toast.success('Lab request sent to lab technician')
    },
    onError: (e) => toast.error(e.message),
  })
}

function useWritePrescription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ visitId, medications }) => api.post(`/api/visits/${visitId}/prescription`, { medications }),
    onSuccess: (_, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['visit', visitId] })
      toast.success('Prescription sent to pharmacy')
    },
    onError: (e) => toast.error(e.message),
  })
}

function useCompleteVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (visitId) => api.post(`/api/visits/${visitId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor', 'queue'] })
      toast.success('Visit completed — patient sent to billing')
    },
    onError: (e) => toast.error(e.message),
  })
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_QUEUE = [
  { id: 1, patient: { name: 'James Otieno',  age: 34, phone: '0712345678' }, arrived_at: '08:12', complaint: 'Fever & headache',  status: 'waiting',     priority: 'normal' },
  { id: 2, patient: { name: 'Aisha Kamau',   age: 28, phone: '0723456789' }, arrived_at: '08:45', complaint: 'Persistent cough',  status: 'in_progress', priority: 'normal' },
  { id: 3, patient: { name: 'Peter Mwangi',  age: 52, phone: '0734567890' }, arrived_at: '09:03', complaint: 'Chest pains',       status: 'waiting',     priority: 'urgent' },
  { id: 4, patient: { name: 'Faith Njeri',   age: 7,  phone: '0745678901' }, arrived_at: '09:48', complaint: 'Stomach ache',      status: 'waiting',     priority: 'normal' },
  { id: 5, patient: { name: 'David Ochieng', age: 41, phone: '0756789012' }, arrived_at: '09:35', complaint: 'Back pain',         status: 'waiting',     priority: 'normal' },
]

const MOCK_VISIT = {
  id: 2,
  patient: { name: 'Aisha Kamau', age: 28, phone: '0723456789', blood_type: 'O+', allergies: 'Penicillin' },
  complaint: 'Persistent cough for 2 weeks, mild fever',
  vitals: { bp: '118/76', temp: '37.8°C', pulse: '88 bpm', spo2: '97%', weight: '62 kg' },
  notes: '',
  lab_requested: false,
  prescription_written: false,
}

const LAB_TESTS = [
  'Full Blood Count (FBC)', 'Blood Sugar (RBS)', 'Malaria Test (RDT)',
  'Urinalysis', 'Chest X-Ray', 'ECG', 'Liver Function Tests (LFTs)',
  'Renal Function Tests', 'Thyroid Function', 'Sputum Culture',
]

// ─── Sub components ───────────────────────────────────────────────────────────
function VitalBadge({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 text-center border border-gray-100 dark:border-gray-700/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <p className="text-[14px] font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

function LabRequestModal({ visitId, onClose, onSave, isLoading }) {
  const [selected, setSelected] = useState([])
  const [notes, setNotes]       = useState('')

  const toggle = (t) => setSelected((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Request Lab Tests</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Select Tests</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {LAB_TESTS.map((t) => (
              <button key={t} type="button" onClick={() => toggle(t)}
                className={`text-left px-3 py-2 rounded-lg border text-[12px] transition-all ${
                  selected.includes(t)
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300 font-medium'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                }`}>
                {selected.includes(t) && <span className="mr-1.5">✓</span>}{t}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Additional Notes for Lab</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Any specific instructions for the lab tech..."
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 resize-none transition-colors" />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            Cancel
          </button>
          <button onClick={() => { if (selected.length > 0) onSave({ tests: selected, notes }) }}
            disabled={selected.length === 0 || isLoading}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-[13px] font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
            {isLoading ? 'Sending...' : `Send ${selected.length > 0 ? `(${selected.length})` : ''} to Lab`}
          </button>
        </div>
      </div>
    </div>
  )
}

function PrescriptionModal({ visitId, onClose, onSave, isLoading }) {
  const [meds, setMeds] = useState([{ name: '', dosage: '', frequency: '', duration: '', notes: '' }])

  const addMed    = () => setMeds((p) => [...p, { name: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const removeMed = (i) => setMeds((p) => p.filter((_, idx) => idx !== i))
  const updateMed = (i, field, val) => setMeds((p) => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m))

  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-2 text-[12px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1e293b] z-10">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Write Prescription</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {meds.map((med, i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Medicine {i + 1}</p>
                {meds.length > 1 && (
                  <button onClick={() => removeMed(i)}
                    className="text-[11px] text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Drug Name *</label>
                  <input value={med.name} onChange={(e) => updateMed(i, 'name', e.target.value)}
                    placeholder="e.g. Amoxicillin 500mg" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Dosage</label>
                  <input value={med.dosage} onChange={(e) => updateMed(i, 'dosage', e.target.value)}
                    placeholder="e.g. 500mg" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Frequency</label>
                  <select value={med.frequency} onChange={(e) => updateMed(i, 'frequency', e.target.value)}
                    className={inputCls}>
                    <option value="">Select...</option>
                    <option>Once daily</option>
                    <option>Twice daily</option>
                    <option>Three times daily</option>
                    <option>Four times daily</option>
                    <option>Every 8 hours</option>
                    <option>Every 6 hours</option>
                    <option>As needed (PRN)</option>
                    <option>At night (nocte)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Duration</label>
                  <input value={med.duration} onChange={(e) => updateMed(i, 'duration', e.target.value)}
                    placeholder="e.g. 5 days" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Instructions</label>
                  <input value={med.notes} onChange={(e) => updateMed(i, 'notes', e.target.value)}
                    placeholder="e.g. Take with food" className={inputCls} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addMed}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
            + Add Another Medicine
          </button>
        </div>
        <div className="flex gap-2 px-6 pb-5 sticky bottom-0 bg-white dark:bg-[#1e293b] pt-2 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (meds.some((m) => m.name)) onSave({ medications: meds.filter((m) => m.name) }) }}
            disabled={!meds.some((m) => m.name) || isLoading}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-[13px] font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50">
            {isLoading ? 'Sending...' : 'Send to Pharmacy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ConsultationDashboard() {
  const user      = useAuthStore((s) => s.user)
  const { activeVisitId, setActiveVisit, clearActiveVisit } = useVisitStore()

  const queueQuery    = useMyQueue()
  const visitQuery    = useVisitDetail(activeVisitId)
  const saveNotesMut  = useSaveNotes()
  const labMut        = useRequestLab()
  const rxMut         = useWritePrescription()
  const completeMut   = useCompleteVisit()

  const [notes, setNotes]     = useState('')
  const [showLab, setShowLab] = useState(false)
  const [showRx, setShowRx]   = useState(false)

  const queue = queueQuery.data || MOCK_QUEUE
  const visit = visitQuery.data  || (activeVisitId ? MOCK_VISIT : null)

  const waiting    = queue.filter((v) => v.status === 'waiting').length
  const inProgress = queue.filter((v) => v.status === 'in_progress').length

  const selectPatient = (v) => {
    setActiveVisit(v.id, v.patient?.id)
    setNotes(v.notes || '')
  }

  return (
    <div className="flex gap-5 h-full">

      {/* ── LEFT: Queue panel ─────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-amber-200 dark:border-amber-700/40 p-3 transition-colors">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Waiting</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{waiting}</p>
          </div>
          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-blue-200 dark:border-blue-700/40 p-3 transition-colors">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">In Progress</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgress}</p>
          </div>
        </div>

        {/* Queue list */}
        <div className="flex-1 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden flex flex-col transition-colors">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
            <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">My Queue</h3>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{queue.length} patients today</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/40">
            {queueQuery.isLoading ? (
              <div className="p-4 space-y-2">
                {[1,2,3].map((i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />)}
              </div>
            ) : queue.map((v) => {
              const isSelected = activeVisitId === v.id
              return (
                <button key={v.id} onClick={() => selectPatient(v)}
                  className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/15 border-l-2 border-l-[#1a6cbf]' : ''
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {v.patient?.name?.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 truncate">{v.patient?.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{v.complaint}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{v.arrived_at}</span>
                      {v.priority === 'urgent' && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/40">
                          Urgent
                        </span>
                      )}
                      {v.status === 'in_progress' && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700/40">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Consultation panel ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {!visit ? (
          // Empty state
          <div className="h-full bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 flex flex-col items-center justify-center gap-3 transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-300 dark:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-gray-700 dark:text-gray-300">Select a patient to begin</p>
            <p className="text-[12px] text-gray-400 dark:text-gray-500">Click a patient from the queue on the left</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Patient header */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 p-5 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-lg font-bold">
                    {visit.patient?.name?.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">{visit.patient?.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[12px] text-gray-500 dark:text-gray-400">{visit.patient?.age} yrs</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-[12px] text-gray-500 dark:text-gray-400">{visit.patient?.phone}</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-[12px] font-semibold text-red-500 dark:text-red-400">Blood: {visit.patient?.blood_type}</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-[12px] font-semibold text-orange-500 dark:text-orange-400">⚠ Allergies: {visit.patient?.allergies}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { clearActiveVisit(); setNotes('') }}
                  className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  Close ×
                </button>
              </div>
              <div className="mt-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/15 rounded-lg border border-blue-100 dark:border-blue-800/40">
                <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-0.5">Chief Complaint</p>
                <p className="text-[13px] text-gray-700 dark:text-gray-300">{visit.complaint}</p>
              </div>
            </div>

            {/* Vitals */}
            {visit.vitals && (
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 p-5 transition-colors">
                <h3 className="text-[12px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Vitals</h3>
                <div className="grid grid-cols-5 gap-2">
                  <VitalBadge label="Blood Pressure" value={visit.vitals.bp}     />
                  <VitalBadge label="Temperature"    value={visit.vitals.temp}   />
                  <VitalBadge label="Pulse"          value={visit.vitals.pulse}  />
                  <VitalBadge label="SpO2"           value={visit.vitals.spo2}   />
                  <VitalBadge label="Weight"         value={visit.vitals.weight} />
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 p-5 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Clinical Notes</h3>
                <button
                  onClick={() => saveNotesMut.mutate({ visitId: visit.id, notes })}
                  disabled={saveNotesMut.isPending}
                  className="text-[11px] font-semibold text-[#1a6cbf] dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 transition-colors">
                  {saveNotesMut.isPending ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="History of presenting illness, examination findings, assessment, plan..."
                rows={5}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-[13px] bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-colors leading-relaxed"
              />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setShowLab(true)}
                disabled={visit.lab_requested}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-dashed border-purple-200 dark:border-purple-700/40 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all group">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
                    {visit.lab_requested ? '✓ Lab Requested' : 'Request Lab'}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Send tests to lab tech</p>
                </div>
              </button>

              <button onClick={() => setShowRx(true)}
                disabled={visit.prescription_written}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-dashed border-teal-200 dark:border-teal-700/40 hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all group">
                <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center group-hover:bg-teal-200 dark:group-hover:bg-teal-900/50 transition-colors">
                  <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
                    {visit.prescription_written ? '✓ Prescription Sent' : 'Write Prescription'}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Send to pharmacy</p>
                </div>
              </button>

              <button
                onClick={() => completeMut.mutate(visit.id, { onSuccess: clearActiveVisit })}
                disabled={completeMut.isPending}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-700/40 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 disabled:opacity-50 transition-all group">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50 transition-colors">
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">Complete Visit</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Send to billing</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {showLab && visit && (
        <LabRequestModal
          visitId={visit.id}
          onClose={() => setShowLab(false)}
          onSave={(data) => labMut.mutate({ visitId: visit.id, ...data }, { onSuccess: () => setShowLab(false) })}
          isLoading={labMut.isPending}
        />
      )}
      {showRx && visit && (
        <PrescriptionModal
          visitId={visit.id}
          onClose={() => setShowRx(false)}
          onSave={(data) => rxMut.mutate({ visitId: visit.id, ...data }, { onSuccess: () => setShowRx(false) })}
          isLoading={rxMut.isPending}
        />
      )}
    </div>
  )
}