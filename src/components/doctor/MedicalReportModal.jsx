'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Icon, formatDate, formatTime, cap, Spinner } from '@/utils/helpers'
import { evaluateField } from '@/utils/labResult'

// Fallbacks used only when clinic settings haven't loaded or a field is missing.
const FALLBACK = {
  name: 'The Kitui Royal Diagnostic Centre',
  services: 'Lab Services, General Outpatient Services, Specialised Clinic, Ultra Sound Services.',
  email: 'thekituiroyaldiagnosticcentre@gmail.com',
  address: 'Kitui Town, Kitui County, Kenya',
  tel: '0721532841 / 0114367561',
  motto: 'We Listen, We Care; your Health is our Concern',
  logo: '/clinic-logo.png',
}

const BLUE = '#2e7dd1'
const GREEN = '#2e9e3e'

// Item statuses that mean the medication was NOT actually given — excluded
// from the printed report.
const RX_EXCLUDED = ['declined', 'returned', 'restocked', 'cancelled']

const FLAG_CLASS = {
  low: 'font-bold text-amber-600',
  high: 'font-bold text-red-700',
  abnormal: 'font-bold text-red-700',
}

export function MedicalReportModal({ visitId, onClose }) {
  // Portal mount guard — document doesn't exist during SSR
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Same queryKeys as ConsultationTab → cache hits, no extra load time.
  const visitQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}`),
    enabled: !!visitId,
    staleTime: 15000,
  })
  const labsQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'labs'],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}/labs`),
    enabled: !!visitId,
    staleTime: 15000,
  })
  const rxQuery = useQuery({
    queryKey: ['doctor', 'visit', visitId, 'prescriptions'],
    queryFn: () => api.get(`/api/doctor/visits/${visitId}/prescriptions`),
    enabled: !!visitId,
    staleTime: 15000,
  })
  const clinicQuery = useQuery({
    queryKey: ['admin', 'settings', 'receipt'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 300000,
  })

  const clinic = clinicQuery.data?.settings || {}

  // Letterhead built from fetched clinic settings with hardcoded fallbacks.
  const letterhead = {
    name: clinic.name || FALLBACK.name,
    services: clinic.services || FALLBACK.services,
    email: clinic.email || FALLBACK.email,
    tel: clinic.phone || FALLBACK.tel,
    address: clinic.address || FALLBACK.address,
    logo: FALLBACK.logo,
  }
  const motto = clinic.tagline || FALLBACK.motto

  const visit = visitQuery.data?.visit
  const labRequests = labsQuery.data?.requests || []
  const prescriptions = rxQuery.data?.prescriptions || []
  const loading = visitQuery.isLoading || labsQuery.isLoading || rxQuery.isLoading

  const reportId = `MED-${String(visitId).padStart(5, '0')}`

  // Saved-PDF filename = report id, not the app title
  const handlePrint = () => {
    const prev = document.title
    document.title = reportId
    window.print()
    document.title = prev
  }

  if (!mounted) return null

  const patient = { gender: visit?.patient_gender, age: visit?.patient_age }

  // Vitals rows — only render what was recorded
  const vitalsRows = visit ? [
    visit.temperature != null && { label: 'Temperature', value: `${visit.temperature} °C`, abnormal: visit.temperature > 37.5 },
    (visit.bp_systolic != null || visit.bp_diastolic != null) && {
      label: 'Blood Pressure',
      value: `${visit.bp_systolic ?? '—'}/${visit.bp_diastolic ?? '—'} mmHg`,
      abnormal: (visit.bp_systolic ?? 0) > 140 || (visit.bp_diastolic ?? 0) > 90,
    },
    visit.pulse != null && { label: 'Pulse', value: `${visit.pulse} bpm`, abnormal: visit.pulse < 60 || visit.pulse > 100 },
    visit.respiratory_rate != null && { label: 'Respiratory Rate', value: `${visit.respiratory_rate} /min`, abnormal: visit.respiratory_rate < 12 || visit.respiratory_rate > 20 },
    visit.spo2 != null && { label: 'SpO₂', value: `${visit.spo2} %`, abnormal: visit.spo2 < 95 },
    visit.weight != null && { label: 'Weight', value: `${visit.weight} kg`, abnormal: false },
    visit.height != null && { label: 'Height', value: `${visit.height} cm`, abnormal: false },
    (visit.weight != null && visit.height != null) && {
      label: 'BMI',
      value: (visit.weight / Math.pow(visit.height / 100, 2)).toFixed(1),
      abnormal: false,
    },
  ].filter(Boolean) : []

  const soapBlocks = visit ? [
    visit.subjective && { letter: 'S', label: 'Subjective', text: visit.subjective },
    visit.objective && { letter: 'O', label: 'Objective', text: visit.objective },
    visit.assessment && { letter: 'A', label: 'Assessment', text: visit.assessment },
    visit.plan && { letter: 'P', label: 'Plan', text: visit.plan },
  ].filter(Boolean) : []

  // Flatten lab items across requests
  const labItems = labRequests.flatMap((r) => r.items || [])
  const completedLabItems = labItems.filter((it) => it.status === 'ready' && (it.result || it.result_data))

  // Medications actually given (exclude declined/returned/restocked/cancelled)
  const rxItems = prescriptions.flatMap((p) =>
    (p.items || []).filter((it) => !RX_EXCLUDED.includes(it.status))
  )

  // Content gate — the report only prints MEDICAL content. If none exists
  // yet (no notes, no diagnosis, no vitals, no results, no meds, no
  // procedure), show an empty state instead of a blank letterhead.
  const hasContent = !!(
    visit && (
      visit.diagnosis?.trim() ||
      visit.subjective || visit.objective || visit.assessment || visit.plan ||
      visit.chief_complaint ||
      visit.procedure_name ||
      vitalsRows.length > 0 ||
      completedLabItems.length > 0 ||
      rxItems.length > 0
    )
  )

  return createPortal(
    <>
      <style>{`
        @media print {
          /* ── PORTAL ISOLATION ── the report is the only content in flow */
          body > *:not(.medical-report-overlay) { display: none !important; }

          .medical-report-overlay {
            position: static !important;
            display: block !important;
            padding: 0 !important;
            inset: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          .medical-report-backdrop { display: none !important; }
          .medical-report-header-bar { display: none !important; }

          .medical-report-print {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
          }
          .medreport-scroll {
            display: block !important;
            flex: none !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
          }

          /* Letterhead colours must survive the printer */
          .medical-report-print, .medical-report-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Running header / footer: repeat on every printed page */
          thead.medreport-running-header { display: table-header-group !important; }
          tfoot.medreport-running-footer { display: table-footer-group !important; }

          /* Pagination discipline */
          .medreport-block     { break-inside: auto; }   /* long sections may split */
          .medreport-row       { break-inside: avoid; }  /* never split a single row */
          .medreport-bar       { break-after: avoid; }   /* no orphaned section header */
          .medreport-signature { break-inside: avoid; }

          @page { size: A4; margin: 1cm; }
        }
      `}</style>

      <div className="medical-report-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="medical-report-backdrop absolute inset-0 bg-black/50" />

        <div
          className="medical-report-print relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-gray-200 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Screen-only toolbar ── */}
          <div className="medical-report-header-bar px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-gray-900">Medical Report</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                {visit?.patient_name || '…'} · {reportId}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                disabled={loading || !visit || !hasContent}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white disabled:opacity-50"
              >
                <Icon name="printer" size={14} />
                Print
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          {/* ── Printable report ── */}
          <div className="medreport-scroll flex-1 overflow-y-auto bg-white text-gray-900">
            {loading || !visit ? (
              <div className="flex items-center justify-center py-24">
                <Spinner size={22} />
              </div>
            ) : !hasContent ? (
              <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                  <Icon name="fileText" size={22} className="text-gray-400" />
                </div>
                <p className="text-[14px] font-semibold text-gray-900">Nothing to report yet</p>
                <p className="text-[12px] text-gray-500 mt-1 max-w-sm">
                  This visit has no clinical content — record notes, vitals, a diagnosis,
                  lab results, medications, or a procedure first, then print the report.
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse">

                {/* ═══ RUNNING HEADER (repeats every page) ═══ */}
                <thead className="medreport-running-header">
                  <tr>
                    <td className="p-0">
                      <div
                        className="h-3 w-full"
                        style={{ background: BLUE, borderRadius: '0 0 100% 100% / 0 0 14px 14px' }}
                      />
                      <div className="text-center pt-3 px-8">
                        <img
                          src={letterhead.logo}
                          alt=""
                          className="h-16 mx-auto mb-1"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <h1
                          className="text-[26px] leading-tight font-extrabold"
                          style={{ color: BLUE, fontFamily: 'Georgia, "Times New Roman", serif' }}
                        >
                          {letterhead.name}
                        </h1>
                        <p className="text-[12px] font-bold mt-0.5" style={{ color: GREEN }}>
                          {letterhead.services}
                        </p>
                        <p className="text-[12px] mt-0.5 text-gray-900">
                          <span className="font-semibold italic" style={{ color: BLUE }}>Email: </span>
                          <span className="italic" style={{ color: BLUE }}>{letterhead.email}</span>
                          <span className="font-bold ml-4">Tel: {letterhead.tel}</span>
                        </p>
                      </div>
                      <div className="mt-2 mx-6" style={{ borderTop: `3px solid ${BLUE}` }} />
                      <div className="mt-0.75 mx-6 border-t border-gray-800" />
                    </td>
                  </tr>
                </thead>

                {/* ═══ RUNNING FOOTER (repeats every page) ═══ */}
                <tfoot className="medreport-running-footer">
                  <tr>
                    <td className="p-0">
                      <div className="flex items-stretch h-7 mt-3">
                        <div className="w-1/5" style={{ background: GREEN }} />
                        <div
                          className="flex-1 flex items-center justify-center text-white italic font-semibold text-[12px]"
                          style={{ background: BLUE }}
                        >
                          {motto}
                        </div>
                        <div className="w-1/5" style={{ background: GREEN }} />
                      </div>
                    </td>
                  </tr>
                </tfoot>

                {/* ═══ FLOWING BODY ═══ */}
                <tbody>
                  <tr>
                    <td className="px-8 align-top">

                      {/* Report number + date */}
                      <div className="flex justify-between items-end mt-4 text-[13px]">
                        <div>
                          <span className="font-bold mr-2">Date:</span>
                          <span>{formatDate(visit.arrived_at)} · {formatTime(visit.arrived_at)}</span>
                        </div>
                        <div>
                          <span className="font-bold mr-2">Report No.</span>
                          <span className="inline-block min-w-36 border-b border-gray-500 font-mono text-center">
                            {reportId}
                          </span>
                        </div>
                      </div>

                      {/* Patient block */}
                      <div className="mt-3 text-[13px]">
                        <div className="grid grid-cols-[140px_1fr_120px_1fr]">
                          <div className="text-right pr-2 py-1 font-bold">Patient's Name:</div>
                          <div className="border border-gray-400 px-2 py-1 uppercase">{visit.patient_name || ''}</div>
                          <div className="text-right pr-2 py-1 font-bold">Visit Type:</div>
                          <div className="border border-gray-400 border-l-0 px-2 py-1">
                            {visit.visit_type === 'family_planning' ? 'Family Planning' : cap(visit.visit_type || '')}
                          </div>

                          <div className="text-right pr-2 py-1 font-bold">Age:</div>
                          <div className="border border-gray-400 border-t-0 px-2 py-1">
                            {visit.patient_age != null ? `${visit.patient_age} ${visit.patient_age_unit}` : ''}
                          </div>
                          <div className="text-right pr-2 py-1 font-bold">Gender:</div>
                          <div className="border border-gray-400 border-t-0 border-l-0 px-2 py-1">{cap(visit.patient_gender || '')}</div>

                          <div className="text-right pr-2 py-1 font-bold">Phone:</div>
                          <div className="border border-gray-400 border-t-0 px-2 py-1">{visit.phone || '—'}</div>
                          <div className="text-right pr-2 py-1 font-bold">Attending Dr:</div>
                          <div className="border border-gray-400 border-t-0 border-l-0 px-2 py-1">{visit.doctor || ''}</div>
                        </div>
                      </div>

                      {/* Chief complaint + allergies */}
                      {(visit.chief_complaint || visit.allergies) && (
                        <div className="mt-3 text-[12px]">
                          {visit.chief_complaint && (
                            <p className="medreport-row">
                              <span className="font-bold">Chief Complaint: </span>{visit.chief_complaint}
                            </p>
                          )}
                          {visit.allergies && (
                            <p className="medreport-row mt-1 font-semibold text-red-700">
                              <span className="font-bold text-gray-900">Known Allergies: </span>{visit.allergies}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Section rule */}
                      <div className="mt-4" style={{ borderTop: `2px solid ${BLUE}` }} />

                      {/* Title */}
                      <h2 className="text-center text-[17px] font-extrabold underline underline-offset-4 tracking-wide mt-5 mb-4">
                        MEDICAL REPORT
                      </h2>

                      {/* ── Vital signs ── */}
                      {vitalsRows.length > 0 && (
                        <div className="medreport-block mb-6">
                          <SectionBar title="Vital Signs" />
                          <div className="grid grid-cols-2 gap-x-6">
                            {vitalsRows.map((v) => (
                              <div key={v.label} className="medreport-row flex text-[12px] border-b border-gray-300">
                                <div className="w-1/2 px-2 py-1 text-gray-700">{v.label}</div>
                                <div className={`flex-1 px-2 py-1 text-right tabular-nums ${v.abnormal ? 'font-bold text-red-700' : 'font-medium'}`}>
                                  {v.value}
                                </div>
                              </div>
                            ))}
                          </div>
                          {visit.vitals_notes && (
                            <p className="text-[11px] italic text-gray-700 mt-1.5 px-1">
                              <span className="font-bold not-italic">Note: </span>{visit.vitals_notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* ── Clinical notes (SOAP) ── */}
                      {soapBlocks.length > 0 && (
                        <div className="medreport-block mb-6">
                          <SectionBar title="Clinical Notes" />
                          {soapBlocks.map((b) => (
                            <div key={b.letter} className="medreport-row flex gap-2 text-[12px] border-b border-gray-300 py-1.5 px-1">
                              <span
                                className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-[11px] font-bold text-white"
                                style={{ background: BLUE }}
                              >
                                {b.letter}
                              </span>
                              <div className="flex-1">
                                <span className="font-bold">{b.label}: </span>
                                <span className="whitespace-pre-line">{b.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Diagnosis — prominent ── */}
                      <div className="medreport-block mb-6">
                        <SectionBar title="Diagnosis" />
                        <div
                          className="medreport-row border-2 px-3 py-2 text-[13px]"
                          style={{ borderColor: BLUE, background: '#eef5fc' }}
                        >
                          {visit.diagnosis ? (
                            <p className="font-bold">
                              {visit.diagnosis}
                              {visit.diagnosis_code && (
                                <span className="ml-2 font-mono font-semibold text-[12px]" style={{ color: BLUE }}>
                                  [{visit.diagnosis_code}]
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="italic text-gray-500">No diagnosis recorded</p>
                          )}
                        </div>
                      </div>

                      {/* ── Laboratory investigations ── */}
                      {labItems.length > 0 && (
                        <div className="medreport-block mb-6">
                          <SectionBar title="Laboratory Investigations" />
                          {completedLabItems.length === 0 ? (
                            <p className="text-[12px] italic text-gray-500 px-1 py-1.5">
                              {labItems.length} test{labItems.length > 1 ? 's' : ''} ordered — results pending at time of printing.
                            </p>
                          ) : (
                            completedLabItems.map((item) => (
                              <LabResultBlock key={item.id} item={item} patient={patient} />
                            ))
                          )}
                        </div>
                      )}

                      {/* ── Medications prescribed ── */}
                      {rxItems.length > 0 && (
                        <div className="medreport-block mb-6">
                          <SectionBar title="Medications Prescribed" />
                          <div className="medreport-row flex text-[11px] font-bold uppercase tracking-wider border-b border-gray-500 px-1 py-1">
                            <div className="flex-1">Medication</div>
                            <div className="w-24 text-center">Dosage</div>
                            <div className="w-24 text-center">Frequency</div>
                            <div className="w-20 text-center">Duration</div>
                            <div className="w-12 text-center">Qty</div>
                          </div>
                          {rxItems.map((it) => (
                            <div key={it.id} className="medreport-row flex text-[12px] border-b border-gray-300 px-1 py-1">
                              <div className="flex-1 font-medium">
                                {it.medication}
                                {it.form === 'injection' && (
                                  <span className="ml-1.5 text-[10px] font-bold uppercase" style={{ color: '#a21caf' }}>(Injection)</span>
                                )}
                              </div>
                              <div className="w-24 text-center">{it.dosage || '—'}</div>
                              <div className="w-24 text-center">{it.frequency || '—'}</div>
                              <div className="w-20 text-center">{it.duration || '—'}</div>
                              <div className="w-12 text-center tabular-nums">{it.quantity}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Procedure / service ── */}
                      {visit.procedure_name && (
                        <div className="medreport-block mb-6">
                          <SectionBar title="Procedure / Service Performed" />
                          <div className="medreport-row text-[12px] border-b border-gray-300 px-1 py-1.5">
                            <p className="font-bold">
                              {visit.procedure_name}
                              <span className="ml-2 font-normal text-gray-600">
                                ({visit.procedure_type === 'family_planning' ? 'Family Planning' : 'Procedure'} · performed by {visit.procedure_done_by || 'Doctor'})
                              </span>
                            </p>
                            {visit.procedure_notes && (
                              <p className="italic text-gray-700 mt-1">{visit.procedure_notes}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Signatures */}
                      <div className="medreport-signature grid grid-cols-2 gap-10 mt-10 text-[12px]">
                        <div>
                          <div className="border-b border-gray-800 h-8" />
                          <p className="font-bold mt-1">Attending Doctor</p>
                          <p className="text-gray-700">{visit.doctor || ''}</p>
                        </div>
                        <div>
                          <div className="border-b border-gray-800 h-8" />
                          <p className="font-bold mt-1">Official Stamp</p>
                        </div>
                      </div>

                      <p className="text-[10px] text-gray-500 text-center mt-6 mb-2">
                        Computer-generated report · {reportId} · Printed {formatDate(new Date().toISOString())} {formatTime(new Date().toISOString())}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── Section bar — grey band matching the lab report's section headers ────────
function SectionBar({ title }) {
  return (
    <div className="medreport-bar flex text-[12px] font-bold uppercase mb-1">
      <div className="px-3 py-1" style={{ background: '#bcd7ee' }}>{title}</div>
      <div className="flex-1 py-1" style={{ background: '#dcebf7' }} />
    </div>
  )
}

// ─── One completed lab item — summary line or template-driven rows ────────────
function LabResultBlock({ item, patient }) {
  const sections = item.result_template?.sections

  return (
    <div className="mb-3">
      {/* Test name bar */}
      <div className="medreport-row flex items-center justify-between text-[12px] font-bold border-b-2 border-gray-500 px-1 py-1">
        <span className="uppercase">{item.test_name}</span>
        {item.flagged && <span className="text-red-700 text-[10px] uppercase tracking-wider">⚠ Abnormal</span>}
      </div>

      {sections?.length && item.result_data ? (
        sections.map((section, si) => (
          <ReportLabSection
            key={si}
            section={section}
            values={item.result_data || {}}
            patient={patient}
          />
        ))
      ) : (
        <div className="medreport-row flex text-[12px] border-b border-gray-300 px-1 py-1">
          <div className="w-3/5 text-gray-700">Result</div>
          <div className={`flex-1 text-center ${item.flagged ? FLAG_CLASS.abnormal : 'font-medium'}`}>
            {item.result || '—'}
          </div>
        </div>
      )}

      {item.result_notes && (
        <p className="text-[11px] italic text-gray-700 mt-1 px-1">
          <span className="font-bold not-italic">Lab comment: </span>{item.result_notes}
        </p>
      )}
    </div>
  )
}

// Template section rows — same evaluateField contract as the lab report.
function ReportLabSection({ section, values, patient }) {
  const fields = section.fields || []

  const evaluated = fields.map((f) => {
    if (['textarea', 'sensitivity'].includes(f.input_type)) return { f }
    const raw = values[f.key]
    const has = raw != null && raw !== ''
    const { status, range } = evaluateField(f, raw, patient)
    return {
      f,
      display: has ? `${raw}${f.unit ? ` ${f.unit}` : ''}` : '—',
      status: has ? status : null,
      range: range || f.reference_range || null,
    }
  })
  const showRef = evaluated.some((e) => e.range)

  return (
    <div className="mt-1">
      {section.title && (
        <p className="medreport-row text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1 pt-1">
          {section.title}
        </p>
      )}
      {evaluated.map(({ f, display, status, range }) => {
        if (f.input_type === 'sensitivity') {
          const raw = values[f.key]
          const rows = Array.isArray(raw) ? raw.filter((r) => r.antibiotic) : []
          if (!rows.length) return null
          return (
            <div key={f.key} className="mt-1">
              <div className="medreport-row flex text-[11px] font-bold border-b border-gray-400 px-1 py-0.5">
                <div className="w-3/5">{f.rows_label || 'Antibiotic'}</div>
                <div className="flex-1 text-center">Sensitivity</div>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="medreport-row flex text-[12px] border-b border-gray-200 px-1 py-0.5">
                  <div className="w-3/5">{r.antibiotic}</div>
                  <div className="flex-1 text-center font-semibold">{r.result || '—'}</div>
                </div>
              ))}
            </div>
          )
        }
        if (f.input_type === 'textarea') {
          const raw = values[f.key]
          const text = raw != null && raw !== '' ? String(raw) : null
          if (!text) return null
          return (
            <div key={f.key} className="medreport-row text-[12px] px-1 py-1 whitespace-pre-line border-b border-gray-200">
              {f.label && <span className="font-bold">{f.label}: </span>}{text}
            </div>
          )
        }
        return (
          <div key={f.key} className="medreport-row flex text-[12px] border-b border-gray-200 px-1 py-0.5">
            <div className={showRef ? 'w-2/5 text-gray-700' : 'w-3/5 text-gray-700'}>{f.label}</div>
            <div className={`flex-1 text-center tabular-nums ${FLAG_CLASS[status] || 'font-medium'}`}>{display}</div>
            {showRef && (
              <div className="w-2/5 text-right font-mono text-[10px] text-gray-500">{range || ''}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}