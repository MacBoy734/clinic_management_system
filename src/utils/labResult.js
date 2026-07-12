/**
 * utils/labResult.js
 *
 * Works against the REAL result_template shape produced by prisma/seed.js:
 *
 *   result_template: {
 *     sections: [
 *       {
 *         title?: string,
 *         fields: [
 *           {
 *             key: string,               // unique within the whole template
 *             label: string,
 *             unit: string,              // '' if unitless
 *             input_type: 'number' | 'text' | 'textarea' | 'select' | 'radio' | 'sensitivity',
 *             options?: string[],        // select / radio only
 *             reference_range?: string,  // free-text range, e.g. "2.5 - 7.1", "< 5.2", "Negative"
 *             by_sex?: { male: string, female: string }, // optional, overrides reference_range
 *             columns?: string[],        // sensitivity only, e.g. ['HS','S','SS','R']
 *             rows_label?: string,       // sensitivity only, e.g. 'Antibiotic'
 *           },
 *         ],
 *       },
 *     ],
 *   }
 *
 * There is no top-level `type: 'single' | 'panel'` distinction — a
 * "single-value" test is simply a template with one section containing one
 * field. Every field is rendered/evaluated the same way, dispatched on
 * input_type.
 */

// ─── Flattening ────────────────────────────────────────────────────────────────

/** Returns every field across every section as one flat array. */
export function flattenTemplateFields(template) {
  if (!template?.sections) return []
  return template.sections.flatMap((s) => s.fields || [])
}

// ─── Range resolution + parsing ────────────────────────────────────────────────

/** Picks the range string to use for a given patient: by_sex override first, else reference_range. */
function resolveRangeString(field, patient) {
  if (field.by_sex && patient?.gender && field.by_sex[patient.gender]) {
    return field.by_sex[patient.gender]
  }
  return field.reference_range ?? null
}

/**
 * Attempts to parse a numeric bound out of a reference-range string.
 * Handles: "a - b", "< x", "≤ x", "<= x", "> x", "≥ x", ">= x".
 * Deliberately bails out (returns null) on compound/tiered strings
 * containing '|' (e.g. "Deficient:<30 | Insuff:30-50 | Suff:50-125") since
 * those have no single "normal" band — those tests carry a separate
 * `interpretation` select field for the tech to use instead.
 */
function parseNumericRange(rangeStr) {
  if (!rangeStr || rangeStr.includes('|')) return null
  const str = rangeStr.trim()

  let m = str.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/)
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) }

  m = str.match(/[≤]|<=|(?:^|\s)<\s*(-?\d+(?:\.\d+)?)/)
  m = str.match(/(?:≤|<=)\s*(-?\d+(?:\.\d+)?)/) || str.match(/<\s*(-?\d+(?:\.\d+)?)/)
  if (m) {
    const inclusive = str.includes('≤') || str.includes('<=')
    return { max: parseFloat(m[1]), maxInclusive: inclusive }
  }

  m = str.match(/(?:≥|>=)\s*(-?\d+(?:\.\d+)?)/) || str.match(/>\s*(-?\d+(?:\.\d+)?)/)
  if (m) {
    const inclusive = str.includes('≥') || str.includes('>=')
    return { min: parseFloat(m[1]), minInclusive: inclusive }
  }

  return null
}

// ─── Per-field evaluation (live feedback as the tech types) ───────────────────

/**
 * Returns { status, range } for a single field given its current value.
 * status: 'normal' | 'low' | 'high' | 'abnormal' | 'unknown'
 * range:  the resolved range string, for display (e.g. "Ref: 13.5 - 17.5")
 */
export function evaluateField(field, value, patient) {
  const range = resolveRangeString(field, patient)
  const empty = value == null || value === ''

  if (empty) return { status: 'unknown', range }

  if (field.input_type === 'select' || field.input_type === 'radio') {
    if (!range) return { status: 'unknown', range }
    return {
      status: String(value).trim().toLowerCase() === String(range).trim().toLowerCase()
        ? 'normal'
        : 'abnormal',
      range,
    }
  }

  if (field.input_type === 'number') {
    const parsed = parseNumericRange(range)
    const num = parseFloat(value)
    if (!parsed || Number.isNaN(num)) return { status: 'unknown', range }

    if (parsed.min != null && parsed.max != null) {
      if (num < parsed.min) return { status: 'low', range }
      if (num > parsed.max) return { status: 'high', range }
      return { status: 'normal', range }
    }
    if (parsed.max != null) {
      const withinUpper = parsed.maxInclusive ? num <= parsed.max : num < parsed.max
      return { status: withinUpper ? 'normal' : 'high', range }
    }
    if (parsed.min != null) {
      const withinLower = parsed.minInclusive ? num >= parsed.min : num > parsed.min
      return { status: withinLower ? 'normal' : 'low', range }
    }
    return { status: 'unknown', range }
  }

  // text / textarea / sensitivity — no automatic evaluation, tech's own judgment
  return { status: 'unknown', range }
}

// ─── Result payload building (on save) ─────────────────────────────────────────

function formatSensitivitySummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows
    .filter((r) => r?.antibiotic?.trim())
    .map((r) => `${r.antibiotic}: ${r.result || '—'}`)
    .join(', ')
}

/**
 * Builds { result, result_data } for one lab request item from its
 * flat values map (keyed by field.key across all sections).
 *
 * result_data: the raw values map, saved as-is (Json column).
 * result:      a short human-readable summary string used anywhere the full
 *              structured data isn't rendered (e.g. patient visit history,
 *              admin overview activity feed).
 */
export function buildResultPayload(template, values) {
  const fields = flattenTemplateFields(template)
  const parts = []

  fields.forEach((f) => {
    const v = values?.[f.key]
    if (v == null || v === '') return

    if (f.input_type === 'sensitivity') {
      const summary = formatSensitivitySummary(v)
      if (summary) parts.push(`${f.label}: ${summary}`)
      return
    }

    const unit = f.unit ? ` ${f.unit}` : ''
    parts.push(`${f.label}: ${v}${unit}`)
  })

  return {
    result: parts.length > 0 ? parts.join('; ') : null,
    result_data: values || {},
  }
}

/**
 * True if any field's value falls outside its normal range, so the item can
 * be flagged for the doctor. Sensitivity fields flag if any organism shows
 * resistant ('R').
 */
export function isAnyFieldAbnormal(template, values, patient) {
  const fields = flattenTemplateFields(template)

  return fields.some((f) => {
    const v = values?.[f.key]
    if (v == null || v === '') return false

    if (f.input_type === 'sensitivity') {
      return Array.isArray(v) && v.some((row) => row?.result === 'R')
    }

    const { status } = evaluateField(f, v, patient)
    return status === 'low' || status === 'high' || status === 'abnormal'
  })
}

/** True if at least one field on this item has a non-empty value. */
export function isItemFilled(item) {
  const fields = flattenTemplateFields(item.catalog?.result_template)
  const v = item._values || {}
  return fields.some((f) => v[f.key] != null && v[f.key] !== '')
}

// ─── Range helpers used by ReportModal ────────────────────────────────────────

/**
 * resolveRange — used by ReportModal to get a display range string for a
 * field or a whole-template range.
 *
 * Accepts two call signatures to match how ReportModal calls it:
 *   resolveRange(field.ranges, patient)   — where field.ranges is an object
 *                                           like { low, high } (old shape)
 *   resolveRange(template.ranges, patient) — same
 *
 * Since your real template shape uses free-text reference_range strings
 * (not { low, high } objects), ReportModal should ideally be updated to call
 * evaluateField / resolveRangeString instead. But to fix the build error
 * without touching ReportModal, this shim handles both shapes:
 *
 *   - If passed a field object (has .reference_range or .by_sex) → resolves
 *     via resolveRangeString and returns the string directly.
 *   - If passed a { low, high } object → returns it as-is (legacy shape).
 *   - If passed null/undefined → returns null.
 */
export function resolveRange(rangesOrField, patient) {
  if (!rangesOrField) return null

  // If it looks like a field descriptor (has reference_range or by_sex or input_type)
  // resolve via the internal resolveRangeString helper which handles by_sex overrides
  if (
    typeof rangesOrField === 'object' &&
    ('reference_range' in rangesOrField || 'by_sex' in rangesOrField || 'input_type' in rangesOrField)
  ) {
    return resolveRangeString(rangesOrField, patient) ?? null
  }

  // Legacy { low, high } shape — return as-is so formatRange can display it
  if (typeof rangesOrField === 'object' && ('low' in rangesOrField || 'high' in rangesOrField)) {
    return rangesOrField
  }

  // Plain string passed directly — return as-is
  if (typeof rangesOrField === 'string') return rangesOrField

  return null
}

/**
 * formatRange — formats a resolved range value into a human-readable string
 * for the Reference Range column in the printed lab report.
 *
 * Accepts:
 *   formatRange(rangeString, unit)  — e.g. formatRange('4.0 - 11.0', 'x10³/μL')
 *   formatRange({ low, high }, unit) — legacy object shape
 *   formatRange(null, unit)          — returns '—'
 */
export function formatRange(range, unit = '') {
  if (!range) return '—'

  // Free-text string (your real shape) — append unit if not already present
  if (typeof range === 'string') {
    const trimmed = range.trim()
    if (!trimmed) return '—'
    // Avoid doubling the unit if it's already in the string
    if (unit && !trimmed.includes(unit)) return `${trimmed} ${unit}`.trim()
    return trimmed
  }

  // Legacy { low, high } object shape
  if (typeof range === 'object') {
    const { low, high, min, max } = range
    const lo = low  ?? min  ?? null
    const hi = high ?? max  ?? null
    const u  = unit ? ` ${unit}` : ''

    if (lo == null && hi == null) return '—'
    if (lo == null) return `< ${hi}${u}`
    if (hi == null) return `> ${lo}${u}`
    return `${lo} – ${hi}${u}`
  }

  return '—'
}