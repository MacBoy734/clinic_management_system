'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon,
  SkeletonCard, SkeletonList, SkeletonTable, Spinner,
  formatMoney, formatTime, timeAgo, cap, badgeClass,
} from '@/utils/helpers'

// ─── Constants ────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf] transition-colors'

const SUBTABS = [
  { key: 'clinic',   label: 'Clinic Profile',     icon: 'building' },
  { key: 'pharmacy', label: 'Pharmacy',           icon: 'pill' },
  { key: 'charges', label: 'charge templates',  icon: 'tag' },
  { key: 'security', label: 'Security',           icon: 'shield' },
]

const DEFAULT_CLINIC = {
  name: '', tagline: '', address: '', phone: '', email: '',
}

const DEFAULT_PHARMACY = {
  markup_pct: 25,
  low_stock_threshold: 50,
  auto_deduct_on_dispense: true,
}

const DEFAULT_SECURITY = {
  session_timeout_hours: 8,
  password_min_length: 8,
  password_expiry_days: 90,
  force_relogin_on_inactivity: true,
}

// ChargeCategory enum — must match schema exactly
const TEMPLATE_CATEGORIES = [
  { key: 'consultation', label: 'Consultation' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'lab', label: 'Lab Test' },
  { key: 'medication', label: 'Medication' },
]




// ─── Shared bits ──────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function SaveBar({ saving, dirty, label = 'Save' }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-gray-200 dark:border-gray-700/60">
      {dirty && (
        <span className="mr-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
        </span>
      )}
      <button
        type="submit"
        disabled={saving || !dirty}
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? <Spinner size={14} /> : <Icon name="save" size={14} />}
        {saving ? 'Saving…' : `${label} Changes`}
      </button>
    </div>
  )
}

function ApiWarning({ show, message = 'Could not load saved values — showing defaults.' }) {
  if (!show) return null
  return (
    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[12px]">
      <Icon name="alert" size={14} />
      {message}
    </div>
  )
}

function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
        checked ? 'bg-[#1a6cbf]' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {description && (
          <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  )
}

function ConfirmModal({ open, title, description, confirmLabel = 'Confirm', onConfirm, onCancel, busy, danger }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              danger
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            }`}
          >
            <Icon name="alert" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-3 py-2 rounded-lg text-[13px] font-medium text-white flex items-center gap-2 disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a6cbf] hover:bg-[#155a9f]'
            }`}
          >
            {busy && <Spinner size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline Price Editor (from File 1) ─────────────────────────────────────

function InlinePrice({ value, onSave, isPending }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select()
  }, [editing])

  const submit = () => {
    const num = Number(draft)
    if (!Number.isFinite(num) || num < 0) {
      toast.error('Invalid price')
      setDraft(String(value))
    } else if (num !== value) {
      onSave(num)
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        disabled={isPending}
        className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 tabular-nums hover:bg-gray-100 dark:hover:bg-gray-700/40 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
        title="Click to edit"
      >
        {isPending ? <Spinner size={12} /> : formatMoney(value)}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') {
          setDraft(String(value))
          setEditing(false)
        }
      }}
      className={`${inputCls} w-28 text-right tabular-nums py-1 px-2 text-[13px]`}
      autoFocus
    />
  )
}

// ─── Table Toggle (File 1 style for inline tables) ─────────────────────────

function TableToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-[#1a6cbf]' : 'bg-gray-300 dark:bg-gray-600'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ─── Inline Add Row (File 1 style) ───────────────────────────────────────────

function InlineAddRow({ onSave, onCancel, loading }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('consultation')
  const [amount, setAmount] = useState('')

  const submit = () => {
    const amt = Number(amount)
    if (!name.trim()) return toast.error('Name is required')
    if (!Number.isFinite(amt) || amt < 0) return toast.error('Invalid amount')
    onSave({ name: name.trim(), category, amount: Math.round(amt), is_active: true })
  }

  return (
    <tr className="bg-blue-50/50 dark:bg-blue-950/20">
      <td className="px-4 py-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Service name"
          className={`${inputCls} py-1.5 px-2 text-[13px]`}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${inputCls} py-1.5 px-2 text-[13px] w-full`}
        >
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className={`${inputCls} py-1.5 px-2 text-[13px] w-28 text-right tabular-nums`}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-[11px] text-gray-400">Active</span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={submit}
            disabled={loading}
            className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-200"
          >
            {loading ? <Spinner size={12} /> : <Icon name="check" size={12} />}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400 hover:bg-gray-200"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────

export function SettingsTab() {
  const [subtab, setSubtab] = useState('clinic')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap p-1.5 rounded-xl bg-gray-100/70 dark:bg-[#1e293b]/60 border border-gray-200 dark:border-gray-700/60">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubtab(t.key)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
              subtab === t.key
                ? 'bg-[#1a6cbf] text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-[#1e293b] hover:text-gray-900 dark:hover:text-gray-200',
            ].join(' ')}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {subtab === 'clinic'   && <ClinicProfileTab />}
      {subtab === 'pharmacy' && <PharmacySettingsTab />}
      {subtab === 'charges' && <ChargeTemplatesTab />}
      {subtab === 'security' && <SecurityTab />}
    </div>
  )
}

// ─── 1. Clinic Profile ────────────────────────────────────────────

function ClinicProfileTab() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(DEFAULT_CLINIC)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings', 'clinic'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 60000,
    retry: false,
  })

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings
      setForm({
        name: s.name || '',
        tagline: s.tagline || '',
        address: s.address || '',
        phone: s.phone || '',
        email: s.email || '',
      })
      setDirty(false)
    }
    if (data || error) setLoaded(true)
  }, [data, error])

  const saveMutation = useMutation({
    mutationFn: (body) => api.patch('/api/admin/settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })

  const handleChange = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }))
    setDirty(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name?.trim()) {
      toast.error('Clinic name is required')
      return
    }
    try {
      await saveMutation.mutateAsync(form)
      toast.success('Clinic profile saved')
      setDirty(false)
    } catch (err) {
      toast.error(err.message || 'Could not save clinic profile')
    }
  }

  if (isLoading && !loaded) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-96" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Banner */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
            <Icon name="building" size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100 truncate">
              {form.name || 'Clinic Profile'}
            </h2>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 truncate">
              {form.tagline || 'Add a tagline to describe your clinic'}
            </p>
          </div>
          {user && (
            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
              <Icon name="user" size={11} /> {user.name || user.username || 'Admin'}
            </Badge>
          )}
        </div>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader
          title="Clinic Details"
          subtitle="Appears on invoices, receipts, reports & across the system"
        />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Clinic Name" hint="Required">
              <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="e.g. City Health Clinic" className={inputCls} />
            </Field>
            <Field label="Tagline" hint="Short descriptor shown under the clinic name">
              <input type="text" value={form.tagline} onChange={(e) => handleChange('tagline', e.target.value)} placeholder="e.g. Caring for our community since 1998" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="+254 700 000 000" className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="info@clinic.co.ke" className={inputCls} />
            </Field>
          </div>
          <Field label="Address">
            <textarea rows={3} value={form.address} onChange={(e) => handleChange('address', e.target.value)} placeholder="Street, town, county, country" className={`${inputCls} resize-none`} />
          </Field>

          <ApiWarning show={!!error} />
          <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Profile" />
        </div>
      </Card>
    </form>
  )
}



// ─── 2. Pharmacy Settings ─────────────────────────────────────────

function PharmacySettingsTab() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(DEFAULT_PHARMACY)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings', 'pharmacy'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 60000,
    retry: false,
  })

  useEffect(() => {
    if (data?.settings?.pharmacy_settings) {
      setForm({ ...DEFAULT_PHARMACY, ...data.settings.pharmacy_settings })
      setDirty(false)
    }
    if (data || error) setLoaded(true)
  }, [data, error])

  const saveMutation = useMutation({
    mutationFn: (body) => api.patch('/api/admin/settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })

  const handleChange = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }))
    setDirty(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      await saveMutation.mutateAsync({ pharmacy_settings: form })
      toast.success('Pharmacy settings saved')
      setDirty(false)
    } catch (err) {
      toast.error(err.message || 'Could not save pharmacy settings')
    }
  }

  if (isLoading && !loaded) return <SkeletonCard className="h-96" />

  const sampleRetail = 800
  const clinicPrice = Math.round((sampleRetail * (Number(form.markup_pct) || 0)) / 100)

  return (
    <Card>
      <CardHeader title="Pharmacy Settings" subtitle="Pricing, stock alerts, and dispensing behaviour" />
      <form onSubmit={handleSave} className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Clinic Markup %" hint="Multiplier applied to retail price for clinic sales">
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={form.markup_pct}
                onChange={(e) => handleChange('markup_pct', Number(e.target.value))}
                className={`${inputCls} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">%</span>
            </div>
          </Field>
          <Field label="Low Stock Alert Threshold" hint="Default reorder level for new stock items">
            <input
              type="number"
              min="0"
              step="1"
              value={form.low_stock_threshold}
              onChange={(e) => handleChange('low_stock_threshold', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Live preview */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-1.5">
            Live Pricing Preview
          </p>
          <p className="text-[13px] text-gray-700 dark:text-gray-300">
            Retail <span className="font-semibold tabular-nums">{formatMoney(sampleRetail)}</span>
            <span className="mx-2 text-gray-400">→</span>
            Clinic <span className="font-bold tabular-nums text-[#1a6cbf] dark:text-blue-400">{formatMoney(clinicPrice)}</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Multiplier: {(Number(form.markup_pct) || 0) / 100}× retail price
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40 px-4">
          <ToggleRow
            label="Auto-deduct stock on dispense"
            description="Reduce drug stock automatically when a prescription is dispensed"
            checked={form.auto_deduct_on_dispense}
            onChange={(v) => handleChange('auto_deduct_on_dispense', v)}
          />
        </div>

        <ApiWarning show={!!error} />

        <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Pharmacy Settings" />
      </form>
    </Card>
  )
}

// ─── Sub-tab 3: Charge Templates (merged Clinic Fees + Lab Tests) ────────────

function ChargeTemplatesTab() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)

  // ── Clinic Fees (Charge Templates) ──
  const q = useQuery({
    queryKey: ['admin', 'charge-templates'],
    queryFn: () => api.get('/api/admin/charge-templates'),
    staleTime: 30000,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/admin/charge-templates/${id}`, body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'charge-templates'] })
      const prev = queryClient.getQueryData(['admin', 'charge-templates'])
      queryClient.setQueryData(['admin', 'charge-templates'], (old) => {
        if (!old?.templates) return old
        return {
          ...old,
          templates: old.templates.map((t) => (t.id === id ? { ...t, ...body } : t)),
        }
      })
      return { prev }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'charge-templates'], ctx.prev)
      toast.error(err.message || 'Failed to update')
    },
    onSuccess: () => toast.success('Updated'),
  })

  const addMut = useMutation({
    mutationFn: (body) => api.post('/api/admin/charge-templates', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] })
      toast.success('Service added')
      setAdding(false)
    },
    onError: (e) => toast.error(e.message || 'Failed to add'),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/charge-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] })
      toast.success('Deleted')
    },
    onError: (e) => toast.error(e.message || 'Failed to delete'),
  })

  // ── Lab Tests ──
  const [search, setSearch] = useState('')
  const [labCategory, setLabCategory] = useState('all')

  const labQ = useQuery({
    queryKey: ['admin', 'lab-catalog'],
    queryFn: () => api.get('/api/admin/lab-catalog'),
    staleTime: 30000,
  })

  const labUpdateMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/api/admin/lab-catalog/${id}`, body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'lab-catalog'] })
      const prev = queryClient.getQueryData(['admin', 'lab-catalog'])
      queryClient.setQueryData(['admin', 'lab-catalog'], (old) => {
        if (!old?.tests) return old
        return {
          ...old,
          tests: old.tests.map((t) => (t.id === id ? { ...t, ...body } : t)),
        }
      })
      return { prev }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'lab-catalog'], ctx.prev)
      toast.error(err.message || 'Failed to update')
    },
    onSuccess: () => toast.success('Updated'),
  })

  const templates = q.data?.templates || []
  const allTests = labQ.data?.tests || []

  const categories = useMemo(() => {
    const set = new Set(allTests.map((t) => t.category).filter(Boolean))
    return Array.from(set).sort()
  }, [allTests])

  const filteredTests = useMemo(() => {
    return allTests.filter((t) => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
      const matchesCat = labCategory === 'all' || t.category === labCategory
      return matchesSearch && matchesCat
    })
  }, [allTests, search, labCategory])

  // Stats
  const activeCount = templates.filter((t) => t.is_active).length
  const avg = templates.length
    ? templates.reduce((s, t) => s + (Number(t.amount) || 0), 0) / templates.length
    : 0

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Templates" value={templates.length} icon="tag" color="blue" sublabel="chargeable services" />
        <StatTile label="Active" value={activeCount} icon="checkCircle" color="green" sublabel="available for billing" />
        <StatTile label="Inactive" value={templates.length - activeCount} icon="archive" color="slate" sublabel="hidden from billing" />
        <StatTile label="Avg Charge" value={formatMoney(avg)} icon="dollarSign" color="amber" sublabel="across all templates" />
      </div>

      {/* ── Clinic Fees ── */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Clinic Fees"
          subtitle="Consultation, procedures, and fixed service prices"
          action={
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-1.5"
            >
              <Icon name="plus" size={13} /> Add Service
            </button>
          }
        />

        {q.isLoading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message || 'Could not load fees'} onRetry={q.refetch} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Service</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Category</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Price</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Active</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3 text-[13px] font-medium text-gray-900 dark:text-gray-100">{t.name}</td>
                    <td className="px-4 py-3">
                      <Badge className={CATEGORY_BADGES[t.category] || CATEGORY_BADGES.other}>
                        {cap(t.category)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <InlinePrice
                        value={t.amount}
                        isPending={updateMut.isPending}
                        onSave={(amount) => updateMut.mutate({ id: t.id, body: { amount } })}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TableToggle
                        checked={t.is_active}
                        onChange={(is_active) => updateMut.mutate({ id: t.id, body: { is_active } })}
                        disabled={updateMut.isPending}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${t.name}"?`)) delMut.mutate(t.id)
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md"
                        title="Delete"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}

                {adding && (
                  <InlineAddRow
                    onSave={(body) => addMut.mutate(body)}
                    onCancel={() => setAdding(false)}
                    loading={addMut.isPending}
                  />
                )}
              </tbody>
            </table>

            {templates.length === 0 && !adding && (
              <div className="px-4 py-8">
                <EmptyState icon="receipt" title="No clinic fees" description="Add consultation and procedure fees." />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Lab Test Prices ── */}
      <Card className="overflow-hidden">
        <CardHeader title="Lab Test Prices" subtitle="Edit what patients are charged per test" />

        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests..."
              className="pl-8 pr-3 py-1.5 text-[12px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 w-48"
            />
          </div>
          <select
            value={labCategory}
            onChange={(e) => setLabCategory(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 ml-auto">
            {filteredTests.length} test{filteredTests.length === 1 ? '' : 's'}
          </p>
        </div>

        {labQ.isLoading ? (
          <SkeletonTable rows={6} cols={4} />
        ) : labQ.isError ? (
          <ErrorState message={labQ.error?.message || 'Could not load lab catalog'} onRetry={labQ.refetch} />
        ) : filteredTests.length === 0 ? (
          <EmptyState icon="flask" title="No tests found" description="Try adjusting your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Test Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Price</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filteredTests.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                      {t.reference_range && (
                        <p className="text-[10px] text-gray-400">{t.reference_range}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                        {t.category || '—'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <InlinePrice
                        value={t.unit_cost}
                        isPending={labUpdateMut.isPending}
                        onSave={(unit_cost) => labUpdateMut.mutate({ id: t.id, body: { unit_cost } })}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TableToggle
                        checked={t.is_active}
                        onChange={(is_active) => labUpdateMut.mutate({ id: t.id, body: { is_active } })}
                        disabled={labUpdateMut.isPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const CATEGORY_BADGES = {
  consultation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  procedure: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  lab: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  medication: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  family_planning: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  antibiotic: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  analgesic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  antihypertensive: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  antidiabetic: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  antihistamine: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  antacid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  vitamin: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  supplement: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  thyroid: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  general: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  hematology: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  chemistry: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  urinalysis: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  microbiology: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  supplies: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

function StatTile({ label, value, icon, color = 'blue', sublabel }) {
  const colors = {
    blue: { card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50', val: 'text-blue-700 dark:text-blue-400', ic: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
    green: { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', val: 'text-emerald-700 dark:text-emerald-400', ic: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
    amber: { card: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50', val: 'text-amber-700 dark:text-amber-400', ic: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
    red: { card: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50', val: 'text-red-700 dark:text-red-400', ic: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
    purple: { card: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50', val: 'text-purple-700 dark:text-purple-400', ic: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' },
    slate: { card: 'bg-white border-gray-200 dark:bg-[#1e293b] dark:border-gray-700/60', val: 'text-gray-700 dark:text-gray-300', ic: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`rounded-xl border p-4 ${c.card}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.ic}`}>
            <Icon name={icon} size={18} />
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${c.val} truncate`}>{value}</p>
      {sublabel && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{sublabel}</p>}
    </div>
  )
}

// ─── 4. Security ──────────────────────────────────────────────────

function SecurityTab() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(DEFAULT_SECURITY)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmKillAll, setConfirmKillAll] = useState(false)
  const [killAllBusy, setKillAllBusy] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings', 'security'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 60000,
    retry: false,
  })

  const sessionsQuery = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => api.get('/api/admin/sessions'),
    staleTime: 30000,
  })

  useEffect(() => {
    if (data?.settings?.security) {
      setForm({ ...DEFAULT_SECURITY, ...data.settings.security })
      setDirty(false)
    }
    if (data || error) setLoaded(true)
  }, [data, error])

  const saveMutation = useMutation({
    mutationFn: (body) => api.patch('/api/admin/settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })

  const killOneMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
  })

  const handleChange = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }))
    setDirty(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      await saveMutation.mutateAsync({ security: form })
      toast.success('Security settings saved')
      setDirty(false)
    } catch (err) {
      toast.error(err.message || 'Could not save security settings')
    }
  }

  const handleKillOne = async (id) => {
    try {
      await killOneMutation.mutateAsync(id)
      toast.success('Session terminated')
    } catch (err) {
      toast.error(err.message || 'Could not terminate session')
    }
  }

  const handleKillAll = async () => {
    setKillAllBusy(true)
    const list = sessionsQuery.data?.sessions || []
    let ok = 0
    let fail = 0
    for (const s of list) {
      try {
        await api.delete(`/api/admin/sessions/${s.id}`)
        ok++
      } catch {
        fail++
      }
    }
    setKillAllBusy(false)
    setConfirmKillAll(false)
    queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
    if (ok > 0) toast.success(`${ok} session${ok > 1 ? 's' : ''} terminated`)
    if (fail > 0) toast.error(`${fail} session${fail > 1 ? 's' : ''} could not be terminated`)
    if (ok === 0 && fail === 0) toast('No active sessions to terminate')
  }

  if (isLoading && !loaded) return <SkeletonCard className="h-96" />

  const sessions = sessionsQuery.data?.sessions || []
  const sessionsLoading = sessionsQuery.isLoading

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Security Policy" subtitle="Authentication, password, and session rules" />
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Session Timeout" hint="Hours of inactivity before auto-logout">
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.session_timeout_hours}
                  onChange={(e) => handleChange('session_timeout_hours', Number(e.target.value))}
                  className={`${inputCls} pr-12`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">hrs</span>
              </div>
            </Field>
            <Field label="Password Min Length" hint="Minimum characters required">
              <input
                type="number"
                min="4"
                step="1"
                value={form.password_min_length}
                onChange={(e) => handleChange('password_min_length', Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Password Expiry" hint="Days until forced reset (0 = never)">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.password_expiry_days}
                  onChange={(e) => handleChange('password_expiry_days', Number(e.target.value))}
                  className={`${inputCls} pr-12`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">days</span>
              </div>
            </Field>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40 px-4">
            <ToggleRow
              label="Force re-login on inactivity"
              description="Automatically log users out after the session timeout elapses"
              checked={form.force_relogin_on_inactivity}
              onChange={(v) => handleChange('force_relogin_on_inactivity', v)}
            />
          </div>

          <ApiWarning show={!!error} />

          <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Security Policy" />
        </form>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader
          title="Active Sessions"
          subtitle={`${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}
          action={
            <button
              type="button"
              onClick={() => setConfirmKillAll(true)}
              disabled={!sessions.length || killAllBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="xCircle" size={13} /> Kill All Sessions
            </button>
          }
        />
        {sessionsLoading ? (
          <div className="p-4">
            <SkeletonTable rows={3} cols={5} />
          </div>
        ) : !sessions.length ? (
          <EmptyState icon="shield" title="No active sessions" description="Active user logins will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700/60">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Logged In</th>
                  <th className="px-4 py-2">Last Active</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {s.staff_name || s.username || 'Unknown'}
                      </p>
                      <p className="text-[11px] text-gray-400">@{s.username || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={badgeClass(s.role)}>
                        {cap(s.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] text-gray-700 dark:text-gray-300">
                        {s.login_at ? formatTime(s.login_at) : '—'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {s.login_at ? timeAgo(s.login_at) : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] text-gray-700 dark:text-gray-300">
                        {s.last_active ? timeAgo(s.last_active) : '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleKillOne(s.id)}
                        disabled={killOneMutation.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                      >
                        <Icon name="x" size={11} /> Kill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={confirmKillAll}
        danger
        title="Kill all active sessions?"
        description={`This will immediately log out every user (including yourself). All ${sessions.length} active session${sessions.length === 1 ? '' : 's'} will be terminated and users will need to sign in again.`}
        confirmLabel={killAllBusy ? 'Terminating…' : 'Kill All Sessions'}
        busy={killAllBusy}
        onConfirm={handleKillAll}
        onCancel={() => setConfirmKillAll(false)}
      />
    </div>
  )
}

export default SettingsTab