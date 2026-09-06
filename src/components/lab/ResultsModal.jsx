'use client'

// ResultsModal — enter lab test results for each item in a request.
//
// Each item's fields are driven entirely by item.catalog.result_template,
// which is a list of SECTIONS, each holding a list of FIELDS. Every field
// declares its own input_type ('number' | 'text' | 'textarea' | 'select' |
// 'radio' | 'sensitivity'), so one generic field renderer handles every
// test in the catalog — there's no per-test-shape branching. Values are
// kept as a flat map keyed by field.key (unique across the whole template,
// per the catalog's own seeding convention), regardless of which section
// the field lives in.
//
// Reference ranges are resolved per-patient (gender) via evaluateField() in
// utils/labResult.js — sex-split ranges (by_sex) take priority over the
// plain reference_range string. A live status badge (normal/low/high/
// abnormal/unknown) updates as the tech types — purely client-side
// feedback; the server re-evaluates and stores result_data + flagged on
// save (see buildResultPayload / isAnyFieldAbnormal).
//
// STOCK USED: each test item carries a "Stock Used" section where the tech
// records consumables (reagents, tubes, strips…) drawn from REAL LabStock
// rows — dropdown only, no free text. Rows are SEEDED from the server's
// persisted stock_used (LabStockUsage rows), so reopening the modal shows
// exactly what was already deducted. On save the server DIFFS the payload
// against those rows: new rows deduct, removed rows restore, changed
// quantities move only the delta — so draft → ready re-saves never
// double-deduct. Availability shown per row = shelf count + what this row
// already took (_already), so an already-deducted row never false-alarms
// as "exceeds stock".
//
// PATCH /api/lab/requests/[id]/status
//   body: { status, item_results: [{ id, result, result_data, result_notes,
//           flagged, stock_used: [{ stock_item_id, item_name, quantity }] }] }
//   response: { success, warnings: string[] }  — warnings surfaced by QueueTab

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Icon, Badge, formatTime, Spinner, cap } from '@/utils/helpers'
import {
  flattenTemplateFields,
  evaluateField,
  buildResultPayload,
  buildAppliedRanges,
  isAnyFieldAbnormal,
} from '@/utils/labResult'

const EVAL_BADGES = {
  normal:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  low:           'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high:          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  critical_low:  'bg-red-600 text-white dark:bg-red-700',
  critical_high: 'bg-red-600 text-white dark:bg-red-700',
  abnormal:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  unknown:       'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

const EVAL_LABELS = {
  normal: 'Normal',
  low: 'LOW',
  high: 'HIGH',
  critical_low: 'CRITICAL LOW',
  critical_high: 'CRITICAL HIGH',
  abnormal: 'ABNORMAL',
  unknown: '—',
}

// Result options for a sensitivity table's per-antibiotic column, if the
// test's own `columns` array isn't provided for some reason.
const DEFAULT_SENSITIVITY_COLUMNS = ['HS', 'S', 'SS', 'R']

export function ResultsModal({ request, loading, onClose, onSave }) {
  // patient context used to resolve gender-specific ranges
   const patient = {
    gender: request.patient_gender,
    age: request.patient_age,
    age_unit: request.age_unit || 'years',
  }

  // values[itemId] = flat map keyed by field.key across all sections,
  // e.g. { haemoglobin: '14.2', wbc: '6.1', sensitivity_table: [...] }
  const [values, setValues] = useState(() => {
    const map = {}
    request.items?.forEach((it) => {
      map[it.id] = it.result_data || {}
    })
    return map
  })
  const [notes, setNotes] = useState(() => {
    const map = {}
    request.items?.forEach((it) => { map[it.id] = it.result_notes || '' })
    return map
  })

  // stockUsed[itemId] = [{ stock_item_id, item_name, quantity, _already }]
  // Seeded from the server's persisted usage rows (it.stock_used). Rows whose
  // stock item was since deleted (stock_item_id null) are historical orphans:
  // not seeded, not resent, and the server leaves them untouched.
  // _already = quantity_deducted from the server — UI-only, stripped from the
  // payload; used so availability math accounts for stock this row already took.
  const [stockUsed, setStockUsed] = useState(() => {
    const map = {}
    request.items?.forEach((it) => {
      map[it.id] = (it.stock_used || [])
        .filter((u) => u.stock_item_id != null)
        .map((u) => ({
          stock_item_id: String(u.stock_item_id),
          item_name: u.item_name || '',
          quantity: u.quantity,
          _already: u.quantity_deducted ?? 0,
        }))
    })
    return map
  })

  // Real lab inventory for the Stock Used dropdowns — no free-text entry.
  const { data: stockData } = useQuery({
    queryKey: ['lab', 'stock'],
    queryFn: () => api.get('/api/lab/stock'),
    staleTime: 30000,
  })
  const labStock = stockData?.items || []

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  const setFieldValue = (itemId, key, val) => {
    setValues((v) => ({ ...v, [itemId]: { ...v[itemId], [key]: val } }))
  }

  const setNote = (itemId, val) => setNotes((n) => ({ ...n, [itemId]: val }))

  // ─── Stock Used row handlers ────────────────────────────────────────────
  const addStockRow = (itemId) => {
    setStockUsed((s) => ({
      ...s,
      [itemId]: [
        ...(s[itemId] || []),
        { stock_item_id: '', item_name: '', quantity: 1, _already: 0 },
      ],
    }))
  }

  const updateStockRow = (itemId, idx, field, value) => {
    setStockUsed((s) => {
      const rows = [...(s[itemId] || [])]
      const updated = { ...rows[idx], [field]: value }
      if (field === 'stock_item_id') {
        // Selecting a different stock item: autofill its name and reset
        // _already — any prior deduction belonged to the previous item and
        // the server's diff will restore it.
        const matched = labStock.find((st) => String(st.id) === String(value))
        updated.item_name = matched?.name || ''
        updated._already = 0
      }
      rows[idx] = updated
      return { ...s, [itemId]: rows }
    })
  }

  const removeStockRow = (itemId, idx) => {
    setStockUsed((s) => ({
      ...s,
      [itemId]: (s[itemId] || []).filter((_, i) => i !== idx),
    }))
  }

  // An item counts as "filled" once at least one of its fields has a value.
  // Stock rows alone do NOT count — consumables without a result is not a result.
  const isItemFilled = (item) => {
    const fields = flattenTemplateFields(item.catalog?.result_template)
    if (fields.length === 0) return false
    const v = values[item.id] || {}
    return fields.some((f) => v[f.key] != null && v[f.key] !== '')
  }

  const filledCount = request.items?.filter(isItemFilled).length || 0
  const total = request.items?.length || 0
  const allFilled = total > 0 && filledCount === total

  const buildPayload = () =>
    (request.items || []).map((item) => {
      const template = item.catalog?.result_template
      const v = values[item.id] || {}
            const { result, result_data } = buildResultPayload(template, v)
      const flagged = isAnyFieldAbnormal(template, v, patient)
      return {
        id: item.id,
        result,
        result_data,
        // Snapshot of the ranges actually applied. Stored so a reprint years
        // later shows what was used then, not what the catalogue says now.
        applied_ranges: buildAppliedRanges(template, v, patient),
        result_notes: notes[item.id]?.trim() || null,
        flagged,
        // Always send the array (even empty — that means "tech cleared them"
        // and the server restores stock). Drop rows with no selection, strip
        // UI-only _already.
        stock_used: (stockUsed[item.id] || [])
          .filter((s) => s.stock_item_id)
          .map(({ _already, ...rest }) => ({
            stock_item_id: Number(rest.stock_item_id),
            item_name: rest.item_name,
            quantity: Number(rest.quantity) || 1,
          })),
      }
    })

  const handleSaveReady = () => {
    if (!allFilled) return
    onSave(request, buildPayload(), 'ready')
  }

  const handleSaveDraft = () => {
    onSave(request, buildPayload(), 'in_progress')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !loading && onClose()}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Enter Lab Results</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {request.patient_name} · ordered {formatTime(request.ordered_at)} by {request.ordered_by}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-50"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Progress chip */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
            <span className="text-[11px] font-medium text-[#1a6cbf] dark:text-blue-400">
              {filledCount} of {total} tests have results
            </span>
            <div className="flex-1 max-w-30 h-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
              <div
                className="h-full bg-[#1a6cbf] transition-all"
                style={{ width: `${total > 0 ? (filledCount / total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Per-test cards */}
          {request.items?.map((item) => (
            <ResultItemCard
              key={item.id}
              item={item}
              patient={patient}
              values={values[item.id] || {}}
              note={notes[item.id] || ''}
              stockRows={stockUsed[item.id] || []}
              labStock={labStock}
              onFieldChange={(key, val) => setFieldValue(item.id, key, val)}
              onNoteChange={(val) => setNote(item.id, val)}
              onAddStock={() => addStockRow(item.id)}
              onUpdateStock={(idx, field, val) => updateStockRow(item.id, idx, field, val)}
              onRemoveStock={(idx) => removeStockRow(item.id, idx)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {allFilled
              ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Icon name="check" size={12} /> All results entered</span>
              : 'Fill in all result values to mark request as ready'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={loading}
              className="px-3 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
            >
              Save Progress
            </button>
            <button
              onClick={handleSaveReady}
              disabled={loading || !allFilled}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner size={13} /> : <Icon name="check" size={14} />}
              Save as Ready
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── One test's result card ───────────────────────────────────────────────────
function ResultItemCard({
  item, patient, values, note, stockRows, labStock,
  onFieldChange, onNoteChange, onAddStock, onUpdateStock, onRemoveStock,
}) {
  const template = item.catalog?.result_template

  // No catalog entry / no template — fall back to a plain text input so the
  // tech is never blocked, but flag it visually as unconfigured. A test with
  // no template still burns reagents, so Stock Used renders here too.
  if (!template?.sections?.length) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{item.test_name}</p>
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            No template configured
          </Badge>
        </div>
        <input
          value={values.value || ''}
          onChange={(e) => onFieldChange('value', e.target.value)}
          placeholder="Enter result"
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <StockUsedSection
          rows={stockRows}
          labStock={labStock}
          onAdd={onAddStock}
          onUpdate={onUpdateStock}
          onRemove={onRemoveStock}
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3.5">
      <div className="mb-3">
        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{item.test_name}</p>
        {item.category && (
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">{item.category}</p>
        )}
      </div>

      <div className="space-y-4">
        {template.sections.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                {section.title}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(section.fields || []).map((field) => (
                <GenericField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(val) => onFieldChange(field.key, val)}
                  patient={patient}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <input
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Notes (optional)"
        className="mt-4 w-full text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40 text-gray-700 dark:text-gray-300 placeholder-gray-400"
      />

      {/* Consumables drawn from lab inventory for this test */}
      <StockUsedSection
        rows={stockRows}
        labStock={labStock}
        onAdd={onAddStock}
        onUpdate={onUpdateStock}
        onRemove={onRemoveStock}
      />
    </div>
  )
}

// ─── Stock Used section ───────────────────────────────────────────────────────
// Dropdown of real LabStock rows only — no free text. "in stock" shows the
// live shelf count; the exceeds-stock check uses shelf + what this row has
// already deducted (_already), so a previously-saved row never false-alarms.
function StockUsedSection({ rows, labStock, onAdd, onUpdate, onRemove }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Stock Used (deducted from inventory)
        </label>
        <button
          type="button"
          onClick={onAdd}
          className="text-[10px] font-medium text-[#1a6cbf] dark:text-blue-400 hover:underline"
        >
          + Add Item
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[10px] text-gray-400 italic">
          No consumables recorded. Click "+ Add Item" to deduct stock used for this test.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((su, idx) => {
            const selectedStock = labStock.find((s) => String(s.id) === String(su.stock_item_id))
            const unit = selectedStock?.unit || ''
            const shelf = selectedStock?.current_stock ?? 0
            const already = Number(su._already) || 0
            const available = shelf + already
            const qty = Number(su.quantity) || 0
            const outOfStock = selectedStock && available === 0
            const exceedsStock = selectedStock && !outOfStock && qty > available

            return (
              <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700/60 px-2 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={su.stock_item_id}
                      onChange={(e) => onUpdate(idx, 'stock_item_id', e.target.value)}
                      className="w-full appearance-none px-2 py-1.5 pr-7 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-[#1a6cbf]/40 cursor-pointer"
                    >
                      <option value="">Select stock item…</option>
                      {labStock.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={s.current_stock === 0 && String(s.id) !== String(su.stock_item_id)}
                        >
                          {s.name} — {s.current_stock} {s.unit}{s.category ? ` (${cap(s.category)})` : ''}{s.current_stock === 0 ? ' [OUT]' : ''}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevronDown" size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                    title="Remove — restores this row's deducted stock on save"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>

                {selectedStock && (
                  <div className="flex items-center gap-2 pl-1 flex-wrap">
                    <input
                      type="number"
                      min="1"
                      value={su.quantity}
                      onChange={(e) => onUpdate(idx, 'quantity', e.target.value)}
                      className="w-16 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#1a6cbf]/40"
                    />
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{unit}</span>
                    <span className="text-[10px] text-gray-400">· in stock: {shelf} {unit}</span>
                    {already > 0 && (
                      <span className="text-[10px] text-gray-400">· already deducted: {already}</span>
                    )}
                    {outOfStock && (
                      <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">OUT OF STOCK</span>
                    )}
                    {exceedsStock && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">exceeds stock</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Generic field dispatcher ──────────────────────────────────────────────────
// Every field in every test's template goes through here. Text/textarea/
// number/select/radio render inline in the 2-column grid; sensitivity spans
// the full row since it's a table, not a single value.
function GenericField({ field, value, onChange, patient }) {
  switch (field.input_type) {
    case 'number':
      return <NumberField field={field} value={value} onChange={onChange} patient={patient} />
    case 'select':
      return <SelectField field={field} value={value} onChange={onChange} patient={patient} />
    case 'radio':
      return <RadioField field={field} value={value} onChange={onChange} patient={patient} />
    case 'textarea':
      return <TextareaField field={field} value={value} onChange={onChange} />
    case 'sensitivity':
      return <SensitivityField field={field} value={value} onChange={onChange} />
    case 'text':
    default:
      return <TextField field={field} value={value} onChange={onChange} />
  }
}

// Shared wrapper: label + status badge + the actual control underneath.
function FieldShell({ field, status, children, fullWidth }) {
  return (
    <div className={`rounded-lg bg-gray-50/60 dark:bg-gray-700/20 p-2.5 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <label className="text-[11px] font-medium text-gray-600 dark:text-gray-300">{field.label}</label>
        {status && status !== 'unknown' && (
          <Badge className={EVAL_BADGES[status]}>{EVAL_LABELS[status]}</Badge>
        )}
      </div>
      {children}
    </div>
  )
}

function NumberField({ field, value, onChange, patient }) {
  const { status, range, band } = evaluateField(field, value, patient)
  const showBadge = value !== '' && value != null
  return (
    <FieldShell field={field} status={showBadge ? status : null}>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step="any"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="w-24 text-[12px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        {field.unit && <span className="text-[10px] text-gray-400">{field.unit}</span>}
      </div>
            {range && (
        <p className="text-[10px] text-gray-400 mt-1">
          Ref: {range}
          {band?.src === 'unverified' && (
            <span className="ml-1 text-amber-500" title="Placeholder range — not yet confirmed by the lab">
              (unverified)
            </span>
          )}
        </p>
      )}
    </FieldShell>
  )
}

function TextField({ field, value, onChange }) {
  return (
    <FieldShell field={field}>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full text-[12px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      />
      {field.reference_range && (
        <p className="text-[10px] text-gray-400 mt-1">Ref: {field.reference_range}</p>
      )}
    </FieldShell>
  )
}

function TextareaField({ field, value, onChange }) {
  return (
    <FieldShell field={field} fullWidth>
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full text-[12px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
      />
    </FieldShell>
  )
}

function SelectField({ field, value, onChange, patient }) {
    const { status, range, band } = evaluateField(field, value, patient)
  const showBadge = value !== '' && value != null
  return (
    <FieldShell field={field} status={showBadge ? status : null}>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[12px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <option value="">Select…</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {range && <p className="text-[10px] text-gray-400 mt-1">Ref: {range}</p>}
    </FieldShell>
  )
}

function RadioField({ field, value, onChange, patient }) {
  const { status, range, band } = evaluateField(field, value, patient)
  const showBadge = value !== '' && value != null
  return (
    <FieldShell field={field} status={showBadge ? status : null}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {(field.options || []).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={[
              'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
              value === opt
                ? 'bg-[#1a6cbf] text-white border-[#1a6cbf]'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300',
            ].join(' ')}
          >
            {opt}
          </button>
        ))}
      </div>
            {range && (
        <p className="text-[10px] text-gray-400 mt-1">
          Ref: {range}
          {band?.src === 'unverified' && (
            <span className="ml-1 text-amber-500" title="Placeholder range — not yet confirmed by the lab">
              (unverified)
            </span>
          )}
        </p>
      )}
    </FieldShell>
  )
}

// Sensitivity table — the one structurally different field type. Value is
// an array of rows: [{ antibiotic: string, result: 'HS'|'S'|'SS'|'R' }].
// Antibiotic names are free text (no fixed catalog to draw from), added one
// row at a time.
function SensitivityField({ field, value, onChange }) {
  const rows = Array.isArray(value) ? value : []
  const columns = field.columns?.length ? field.columns : DEFAULT_SENSITIVITY_COLUMNS
  const rowsLabel = field.rows_label || 'Antibiotic'

  const addRow = () => onChange([...rows, { antibiotic: '', result: '' }])
  const updateRow = (idx, patch) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const removeRow = (idx) => onChange(rows.filter((_, i) => i !== idx))

  return (
    <FieldShell field={field} fullWidth>
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-[11px] text-gray-400">No organisms added yet.</p>
        )}
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <input
              type="text"
              value={row.antibiotic}
              onChange={(e) => updateRow(idx, { antibiotic: e.target.value })}
              placeholder={rowsLabel}
              className="flex-1 text-[12px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <select
              value={row.result}
              onChange={(e) => updateRow(idx, { result: e.target.value })}
              className="w-20 text-[12px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">—</option>
              {columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="text-[11px] font-medium text-[#1a6cbf] dark:text-blue-400 inline-flex items-center gap-1"
        >
          <Icon name="plus" size={12} /> Add {rowsLabel.toLowerCase()}
        </button>
      </div>
    </FieldShell>
  )
}