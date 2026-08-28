'use client'


import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Icon, formatDate, formatTime } from '@/utils/helpers'
import { evaluateField } from '@/utils/labResult'
import Image from 'next/image'

// Letterhead constants — move to ClinicSettings-backed config when the
// admin SettingsTab is wired; values transcribed from the printed report.
const FALLBACK = {
  name: 'The Kitui Royal Diagnostic Centre',
  services: 'Lab Services, General Outpatient Services, Specialised Clinic, Ultra Sound Services.',
  email: 'thekituiroyaldiagnosticcentre@gmail.com',
  tel: '0721532841 / 0114367561',
  motto: 'We Listen, We Care; your Health is our Concern',
  logo: '/images/logo.png',
}

const BLUE = '#2e7dd1'
const GREEN = '#2e9e3e'

export function ReportModal({ request, onClose }) {
  // Portal mount guard — document doesn't exist during SSR
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clinicQuery = useQuery({
    queryKey: ['admin', 'settings', 'receipt'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 300000,
  })

  const clinic = clinicQuery.data?.settings || {}

  const LETTERHEAD = {
    name: clinic.name || FALLBACK.name,
    services: clinic.services || FALLBACK.services,
    email: clinic.email || FALLBACK.email,
    tel: clinic.phone || FALLBACK.tel,
    address: clinic.address || FALLBACK.address,
    logo: FALLBACK.logo,
    motto: clinic.tagline || FALLBACK.motto,
  }

  // Saved-PDF filename = report id, not the app title
  const handlePrint = () => {
    const prev = document.title
    document.title = `LAB-${String(request.id).padStart(5, '0')}`
    window.print()
    document.title = prev
  }

  const reportId = `LAB-${String(request.id).padStart(5, '0')}`
  const patient = { gender: request.patient_gender, age: request.patient_age }

  if (!mounted) return null

  return createPortal(
    <>
      <style>{`
        @media print {
          /* ── PORTAL ISOLATION ────────────────────────────────────────
             The modal is portaled to be a DIRECT CHILD of <body>.
             display:none (unlike visibility:hidden) removes the app's
             layout entirely, so the report is the only content in flow:
             it starts at the top of page 1 and paginates freely. */
          body > *:not(.lab-report-overlay) { display: none !important; }

          .lab-report-overlay {
            position: static !important;
            display: block !important;
            padding: 0 !important;
            inset: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          .lab-report-backdrop { display: none !important; }
          .lab-report-header-bar { display: none !important; }

          .lab-report-print {
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
          .report-scroll {
            display: block !important;
            flex: none !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
          }

          /* Letterhead colours must survive the printer */
          .lab-report-print, .lab-report-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Running header / footer: repeat on every printed page */
          thead.report-running-header { display: table-header-group !important; }
          tfoot.report-running-footer { display: table-footer-group !important; }

          /* Pagination discipline */
          .report-test-block { break-inside: auto; }        /* start on the current page; split across pages when too tall */
          .report-section    { break-inside: auto; }        /* a long panel section may also split */
          .report-field-row  { break-inside: avoid; }       /* never split a single row */
          .report-test-bar   { break-after: avoid; }        /* no orphaned test header  */
          .report-section-bar{ break-after: avoid; }        /* no orphaned section header */
          .report-signatures { break-inside: avoid; }

          @page { size: A4; margin: 1cm; }
        }
      `}</style>

      <div className="lab-report-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="lab-report-backdrop absolute inset-0 bg-black/50" />

        <div
          className="lab-report-print relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-gray-200 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Screen-only toolbar ── */}
          <div className="lab-report-header-bar px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-gray-900">Lab Report</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                {request.patient_name} · {reportId} · {request.items?.length || 0} test{(request.items?.length || 0) !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white"
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
          <div className="report-scroll flex-1 overflow-y-auto bg-white text-gray-900">
            <table className="w-full border-collapse">

              {/* ═══ RUNNING HEADER (repeats every page) ═══ */}
              <thead className="report-running-header">
                <tr>
                  <td className="p-0">
                    {/* Top swoosh bar */}
                    <div
                      className="h-3 w-full"
                      style={{ background: BLUE, borderRadius: '0 0 100% 100% / 0 0 14px 14px' }}
                    />
                    {/* Masthead */}
                    <div className="text-center pt-3 px-8">
                      <Image
                        src={LETTERHEAD.logo}
                        alt=""
                        width={100}
                        height={100}
                        className="h-16 mx-auto mb-1"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                      <h1
                        className="text-[26px] leading-tight font-extrabold"
                        style={{ color: BLUE, fontFamily: 'Georgia, "Times New Roman", serif' }}
                      >
                        {LETTERHEAD.name}
                      </h1>
                      <p className="text-[12px] font-bold mt-0.5" style={{ color: GREEN }}>
                        {LETTERHEAD.services}
                      </p>
                      <p className="text-[12px] mt-0.5 text-gray-900">
                        <span className="font-semibold italic" style={{ color: BLUE }}>Email: </span>
                        <span className="italic" style={{ color: BLUE }}>{LETTERHEAD.email}</span>
                        <span className="font-bold ml-4">Tel: {LETTERHEAD.tel}</span>
                      </p>
                    </div>
                    {/* Double rule */}
                    <div className="mt-2 mx-6" style={{ borderTop: `3px solid ${BLUE}` }} />
                    <div className="mt-0.75 mx-6 border-t border-gray-800" />
                  </td>
                </tr>
              </thead>

              {/* ═══ RUNNING FOOTER (repeats every page) ═══ */}
              <tfoot className="report-running-footer">
                <tr>
                  <td className="p-0">
                    <div className="flex items-stretch h-7 mt-3">
                      <div className="w-1/5" style={{ background: GREEN }} />
                      <div
                        className="flex-1 flex items-center justify-center text-white italic font-semibold text-[12px]"
                        style={{ background: BLUE }}
                      >
                        {LETTERHEAD.motto}
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

                    {/* Lab number (page 1) */}
                    <div className="flex justify-end mt-4 text-[13px]">
                      <span className="font-bold mr-2">Lab Number</span>
                      <span className="inline-block min-w-40 border-b border-gray-500 font-mono text-center">
                        {reportId}
                      </span>
                    </div>

                    {/* Patient block (page 1) */}
                    <div className="mt-3 w-full text-[13px] flex flex-row gap-10 items-center justify-between">
                      <div className='flex-1 min-w-0'>
                        <div className="grid grid-cols-[150px_1fr]">
                          <div className="text-right pr-2 py-1 font-bold">Patient's Name:</div>
                          <div className="border border-gray-400 px-2 py-1 uppercase">{request.patient_name || ''}</div>

                          <div className="text-right pr-2 py-1 font-bold">Age:</div>
                          <div className="border border-gray-400 border-t-0 px-2 py-1">
                            {request.patient_age != null ? `${request.patient_age} ${request.age_unit}(s)` : 'Year(s)'}
                          </div>

                          <div className="text-right pr-2 py-1 font-bold">Gender:</div>
                          <div className="border border-gray-400 border-t-0 px-2 py-1 flex items-center gap-6">
                            <GenderOption label="Male" active={request.patient_gender === 'male'} />
                            <GenderOption label="Female" active={request.patient_gender === 'female'} />
                          </div>
                        </div>

                        <div className="grid grid-cols-[150px_1fr] mt-3">
                          <div className="text-right pr-2 py-1 font-bold">Requesting Dr:</div>
                          <div className="border border-gray-400 px-2 py-1">{request.ordered_by || request.referred_by || ''}</div>
                        </div>
                      </div>
                      <div>
                        <Image src={'/images/microscope.png'} width={130} height={130} onError={(e) => { e.currentTarget.style.display = 'none' }} alt="" />
                      </div>
                    </div>

                    {/* Section rule */}
                    <div className="mt-4" style={{ borderTop: `2px solid ${BLUE}` }} />

                    {/* Title */}
                    <h2 className="text-center text-[17px] font-extrabold underline underline-offset-4 tracking-wide mt-5 mb-4">
                      LAB REPORT
                    </h2>

                    {/* One block per test item */}
                    {request.items?.map((item) => (
                      <TestBlock key={item.id} item={item} patient={patient} />
                    ))}

                    {/* Signatures */}
                    <div className="report-signatures grid grid-cols-2 gap-10 mt-10 text-[12px]">
                      <div>
                        <div className="border-b border-gray-800 h-8" />
                        <p className="font-bold mt-1">Laboratory Officer</p>
                        <p className="text-gray-700">{request.tech_name || ''}</p>
                      </div>
                      <div>
                        <div className="border-b border-gray-800 h-8" />
                        <p className="font-bold mt-1">Verified By</p>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 text-center mt-6 mb-2">
                      Computer-generated report · {reportId} · Printed {formatDate(new Date().toISOString())} {formatTime(new Date().toISOString())}
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── Radio-style gender marker (matches the printed form's ◉ / ○) ─────────────
function GenderOption({ label, active }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full border border-gray-600 inline-flex items-center justify-center">
        {active && <span className="w-1.5 h-1.5 rounded-full bg-gray-900" />}
      </span>
      <span className="border border-gray-400 px-2 py-0.5">{label}</span>
    </span>
  )
}

// ─── One test item: TEST bar + template-driven sections ──────────────────────
function TestBlock({ item, patient }) {
  const sections = item.catalog?.result_template?.sections

  return (
    <div className="report-test-block mb-8">
      {/* TEST bar */}
      <div className="report-test-bar flex text-[13px] font-bold">
        <div className="px-4 py-1.5" style={{ background: '#bcd7ee' }}>TEST</div>
        <div className="flex-1 px-3 py-1.5 uppercase" style={{ background: '#dcebf7' }}>
          {item.test_name}
        </div>
      </div>

      {/* Template-driven sections; fallback = single result row */}
      {sections?.length ? (
        sections.map((section, si) => (
          <ReportSection
            key={si}
            section={section}
            index={si}
            values={item.result_data || {}}
            patient={patient}
          />
        ))
      ) : (
        <div className="report-section mt-3 max-w-xl">
          <SectionBar title={item.test_name} showResults />
          <FieldRow label={item.test_name} display={item.result || '—'} status={item.flagged ? 'abnormal' : null} />
        </div>
      )}

      {/* Tech notes for this test */}
      {item.result_notes && (
        <p className="text-[12px] italic text-gray-700 mt-2 pl-1">
          <span className="font-bold not-italic">Comment: </span>{item.result_notes}
        </p>
      )}
    </div>
  )
}

function SectionBar({ title, showResults, showRef }) {
  return (
    <div className="report-section-bar flex text-[12px] font-bold uppercase">
      <div className={showRef ? 'w-2/5 px-2 py-1' : 'w-3/5 px-2 py-1'} style={{ background: '#b9b9b9' }}>{title}</div>
      <div className="flex-1 px-2 py-1" style={{ background: '#d9d9d9' }}>
        {showResults ? 'RESULTS:' : ''}
      </div>
      {showRef && (
        <div className="w-2/5 px-2 py-1" style={{ background: '#d9d9d9' }}>REF. RANGES</div>
      )}
    </div>
  )
}

// Flag colour per evaluation status. Low = amber (pure yellow is
// illegible on white paper), high and qualitative-abnormal = red.
const FLAG_CLASS = {
  low: 'font-bold text-amber-600',
  high: 'font-bold text-red-700',
  abnormal: 'font-bold text-red-700',
}

function FieldRow({ label, display, status, refRange, showRef }) {
  return (
    <div className="report-field-row flex text-[12px] border-b border-gray-400">
      <div className={showRef ? 'w-2/5 px-2 py-1' : 'w-3/5 px-2 py-1'}>{label}</div>
      <div className={`flex-1 px-2 py-1 text-center ${FLAG_CLASS[status] || ''}`}>
        {display}
      </div>
      {showRef && (
        <div className="w-2/5 px-2 py-1 font-mono text-[11px] text-gray-600">{refRange || ''}</div>
      )}
    </div>
  )
}

// ─── One template section ─────────────────────────────────────────────────────
// number/select/radio/text fields → two-column rows (photo: URINALYSIS)
// textarea fields → free-text block (photo: DEPOSITS)
// sensitivity fields → antibiotic/result table
// Fields render in template order — interleaved blocks preserved.
// Ref column auto-enables when any field in the section resolves a range.
function ReportSection({ section, index, values, patient }) {
  const fields = section.fields || []
  const hasInline = fields.some((f) => !['textarea', 'sensitivity'].includes(f.input_type))
  const title = section.title ? `${index + 1}. ${section.title}` : `${index + 1}.`

  const evaluated = fields.map((f) => {
    if (['textarea', 'sensitivity'].includes(f.input_type)) return { f }
    const raw = values[f.key]
    const has = raw != null && raw !== ''
    const { status, range } = evaluateField(f, raw, patient)
    return {
      f,
      raw,
      display: has ? `${raw}${f.unit ? ` ${f.unit}` : ''}` : '—',
      status: has ? status : null,   // 'low' | 'high' | 'abnormal' | 'normal' | 'unknown'
      range: range || f.reference_range || null,
    }
  })
  const showRef = evaluated.some((e) => e.range)

  return (
    <div className="report-section mt-3 max-w-xl">
      <SectionBar title={title} showResults={hasInline} showRef={showRef} />

      {evaluated.map(({ f, display, status, range }) => {
        if (f.input_type === 'sensitivity') {
          const raw = values[f.key]
          const rows = Array.isArray(raw) ? raw.filter((r) => r.antibiotic) : []
          if (!rows.length) return null
          return (
            <div key={f.key} className="border border-gray-400 border-t-0">
              <div className="report-field-row flex text-[11px] font-bold border-b border-gray-400">
                <div className="w-3/5 px-2 py-1">{f.rows_label || 'Antibiotic'}</div>
                <div className="flex-1 px-2 py-1 text-center">Sensitivity</div>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="report-field-row flex text-[12px] border-b border-gray-300 last:border-b-0">
                  <div className="w-3/5 px-2 py-0.5">{r.antibiotic}</div>
                  <div className="flex-1 px-2 py-0.5 text-center font-semibold">{r.result || '—'}</div>
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
            <div key={f.key} className="border border-gray-400 border-t-0 px-2 py-1.5 text-[12px] whitespace-pre-line min-h-16">
              {f.label && <span className="font-bold">{f.label}: </span>}{text}
            </div>
          )
        }
        return (
          <FieldRow
            key={f.key}
            label={f.label}
            display={display}
            status={status}
            refRange={range}
            showRef={showRef}
          />
        )
      })}
    </div>
  )
}