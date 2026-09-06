
// ─── Age ──────────────────────────────────────────────────────────────────────

/**
 * Normalise Patient.age + age_unit to decimal years. Without this a
 * 3-month-old stored as { age: 3, age_unit: 'months' } matches adult bands.
 */
export function ageInYears(age, unit) {
  if (age == null || age === '') return null
  const n = Number(age)
  if (!Number.isFinite(n)) return null
  switch (unit) {
    case 'days': return n / 365.25
    case 'weeks': return n / 52.18
    case 'months': return n / 12
    default: return n
  }
}

// ─── Flattening ───────────────────────────────────────────────────────────────

export function flattenTemplateFields(template) {
  if (!template?.sections) return []
  return template.sections.flatMap((s) => s.fields || [])
}

// ─── Band resolution ──────────────────────────────────────────────────────────

/**
 * Picks the band that applies to this patient. Bands are ordered in the
 * catalogue and the first match wins, so put the specific ones first.
 *
 * Returns null when nothing matches — that means "no range for this patient",
 * which is a legitimate outcome and must not be treated as normal.
 */
export function resolveBand(field, patient) {
  const bands = field?.ranges
  if (!Array.isArray(bands) || bands.length === 0) return null

  const gender = patient?.gender ?? null
  const years = ageInYears(patient?.age, patient?.age_unit)

  return bands.find((b) => {
    if (b.gender && b.gender !== 'any' && b.gender !== gender) return false
    if (years != null) {
      if (b.age_min != null && years < b.age_min) return false
      if (b.age_max != null && years >= b.age_max) return false
    }
    return true
  }) ?? null
}

/**
 * Bands that differ only by phase (menstrual cycle, pregnancy) cannot be
 * resolved from what the system knows. The tech has to pick.
 */
export function phaseBands(field, patient) {
  const bands = field?.ranges
  if (!Array.isArray(bands)) return []
  const gender = patient?.gender ?? null
  const withPhase = bands.filter((b) => b.phase)
  if (withPhase.length < 2) return []
  return withPhase.filter((b) => !b.gender || b.gender === 'any' || b.gender === gender)
}

/** Human-readable range for the Ref column. */
export function formatBand(band, unit = '') {
  if (!band) return null
  const u = unit ? ` ${unit}` : ''
  if (Array.isArray(band.normal_values) && band.normal_values.length) {
    return band.normal_values.join(' / ')
  }
  const { low, high } = band
  if (low == null && high == null) return null
  if (low == null) return `< ${high}${u}`
  if (high == null) return `> ${low}${u}`
  return `${low} – ${high}${u}`
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/**
 * status: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high'
 *       | 'abnormal' | 'unknown'
 *
 * Returns the matched band too, so callers can read `src` (unverified bands
 * should not drive an automatic flag) and `notes`.
 */
export function evaluateField(field, value, patient, options = {}) {
  const band = options.band ?? resolveBand(field, patient)
  const range = formatBand(band, field?.unit)
  const empty = value == null || value === ''

  if (empty) return { status: 'unknown', range, band }
  if (!band) return { status: 'unknown', range: null, band: null }

  if (field.input_type === 'select' || field.input_type === 'radio') {
    const normals = band.normal_values
    if (!Array.isArray(normals) || normals.length === 0) {
      return { status: 'unknown', range, band }
    }
    const v = String(value).trim().toLowerCase()
    const ok = normals.some((n) => String(n).trim().toLowerCase() === v)
    return { status: ok ? 'normal' : 'abnormal', range, band }
  }

  if (field.input_type === 'number') {
    const num = parseFloat(value)
    if (Number.isNaN(num)) return { status: 'unknown', range, band }

    if (band.crit_low != null && num < band.crit_low) return { status: 'critical_low', range, band }
    if (band.crit_high != null && num > band.crit_high) return { status: 'critical_high', range, band }
    if (band.low != null && num < band.low) return { status: 'low', range, band }
    if (band.high != null && num > band.high) return { status: 'high', range, band }
    if (band.low == null && band.high == null) return { status: 'unknown', range, band }
    return { status: 'normal', range, band }
  }

  // text / textarea / sensitivity — the tech's own judgment
  return { status: 'unknown', range, band }
}


export function isAbnormalStatus(status) {
  return ABNORMAL.has(status)
}

// ─── Payload ──────────────────────────────────────────────────────────────────

function formatSensitivitySummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows
    .filter((r) => r?.antibiotic?.trim())
    .map((r) => `${r.antibiotic}: ${r.result || '—'}`)
    .join(', ')
}

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
    parts.push(`${f.label}: ${v}${f.unit ? ` ${f.unit}` : ''}`)
  })

  return {
    result: parts.length > 0 ? parts.join('; ') : null,
    result_data: values || {},
  }
}

/**
 * The range that was actually applied, snapshotted at save time and stored on
 * LabRequestItem.reference_range. A reprint years later must show what was
 * used then, not what the catalogue says now — the patient will have aged and
 * the catalogue may have been revised.
 */
export function buildAppliedRanges(template, values, patient) {
  const applied = {}
  flattenTemplateFields(template).forEach((f) => {
    const v = values?.[f.key]
    if (v == null || v === '') return
    const band = resolveBand(f, patient)
    if (!band) return
    applied[f.key] = {
      label: f.label,
      unit: f.unit || null,
      range: formatBand(band, f.unit),
      low: band.low ?? null,
      high: band.high ?? null,
      crit_low: band.crit_low ?? null,
      crit_high: band.crit_high ?? null,
      src: band.src || 'unverified',
      notes: band.notes || null,
    }
  })
  return applied
}

export function isAnyFieldAbnormal(template, values, patient) {
  return flattenTemplateFields(template).some((f) => {
    const v = values?.[f.key]
    if (v == null || v === '') return false

    if (f.input_type === 'sensitivity') {
      return Array.isArray(v) && v.some((row) => row?.result === 'R')
    }

    const { status, band } = evaluateField(f, v, patient)
    if (!band) return false
    return isAbnormalStatus(status)
  })
}




const ABNORMAL = new Set(['low', 'high', 'critical_low', 'critical_high', 'abnormal'])
