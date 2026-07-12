'use client'

// SettingsTab — admin settings with 8 secondary sub-tabs.
// APIs:
//   GET   /api/admin/settings     → clinic profile + arbitrary config slices
//   PATCH /api/admin/settings     → save any config slice (mock Object.assign's the body)
//   GET   /api/admin/audit-log    → audit trail (supports ?category=, ?limit=)
//   GET   /api/admin/sessions     → active sessions list
//   DELETE /api/admin/sessions/:id → kill one session
//
// Built defensively: every sub-tab falls back to sensible defaults if the API
// call fails, and save mutations catch + toast errors without crashing.

import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Card, CardHeader, Badge, EmptyState, ErrorState, Icon, StatCard,
  SkeletonCard, SkeletonList, SkeletonTable, Spinner,
  formatMoney, formatTime, timeAgo, cap, badgeClass,
} from '@/utils/helpers'

// ─── Sub-tab definitions ──────────────────────────────────────────
const SUBTABS = [
  { key: 'clinic',        label: 'Clinic Profile',     icon: 'building' },
  { key: 'visits',        label: 'Visit Rules',        icon: 'stethoscope' },
  { key: 'lab',           label: 'Lab Settings',       icon: 'flask' },
  { key: 'pharmacy',      label: 'Pharmacy Settings',  icon: 'pill' },
  { key: 'notifications', label: 'Notifications',      icon: 'bell' },
  { key: 'security',      label: 'Security',           icon: 'shield' },
  { key: 'audit',         label: 'Audit Log',          icon: 'clipboard' },
  { key: 'system',        label: 'System',             icon: 'settings' },
]

// ─── Defaults (used when API call fails or returns nothing) ───────
const DEFAULT_CLINIC = {
  name: '', tagline: '', address: '', phone: '', email: '',
}

const DEFAULT_VISIT_RULES = [
  { type: 'consultation',    label: 'Consultation',     default_fee: 500,  auto_waive_stage1: false, requires_doctor: true  },
]

const DEFAULT_LAB = {
  default_urgency: 'routine',
  auto_notify_doctor: true,
  result_flagging: true,
  report_footer: 'City Health Clinic · Moi Rd, Kitui · +254 700 000 000',
}

const DEFAULT_PHARMACY = {
  markup_pct: 125,
  low_stock_threshold: 50,
  auto_deduct_on_dispense: true,
}

const NOTIFICATION_ROLES = [
  { key: 'receptionist', label: 'Reception' },
  { key: 'doctor',       label: 'Doctor'    },
  { key: 'lab_tech',     label: 'Lab'       },
  { key: 'pharmacist',   label: 'Pharmacy'  },
  { key: 'admin',        label: 'Admin'     },
]

const DEFAULT_NOTIFICATIONS = [
  { event: 'visit_created',         description: 'New visit registered at reception',        enabled: true,  roles: ['receptionist', 'doctor'] },
  { event: 'lab_results_ready',     description: 'Lab results entered and verified',         enabled: true,  roles: ['doctor'] },
  { event: 'prescription_dispensed',description: 'Medication dispensed to patient',          enabled: true,  roles: ['doctor', 'receptionist'] },
  { event: 'low_stock_drug',        description: 'Pharmacy drug stock below threshold',      enabled: true,  roles: ['pharmacist', 'admin'] },
  { event: 'low_stock_lab',         description: 'Lab reagent/supply below threshold',       enabled: true,  roles: ['lab_tech', 'admin'] },
  { event: 'payment_received',      description: 'Payment collected from patient',           enabled: true,  roles: ['admin', 'receptionist'] },
  { event: 'visit_completed',       description: 'Visit marked done and ready for archive',  enabled: true,  roles: ['admin'] },
]

const DEFAULT_SECURITY = {
  session_timeout_hours: 8,
  password_min_length: 8,
  password_expiry_days: 90,
  force_relogin_on_inactivity: true,
}

const AUDIT_CATEGORIES = [
  { key: 'all',           label: 'All' },
  { key: 'payment',       label: 'Payment' },
  { key: 'lab',           label: 'Lab' },
  { key: 'pharmacy',      label: 'Pharmacy' },
  { key: 'prescription',  label: 'Prescription' },
  { key: 'patient',       label: 'Patient' },
  { key: 'inventory',     label: 'Inventory' },
  { key: 'expense',       label: 'Expense' },
  { key: 'restock',       label: 'Restock' },
  { key: 'staff',         label: 'Staff' },
]

const CATEGORY_BADGE = {
  payment:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  lab:           'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pharmacy:      'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  prescription:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  patient:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  inventory:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  expense:       'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  restock:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  referral:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  order:         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  staff:         'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}

const PAGE_SIZE = 50

// ─── Shared bits ──────────────────────────────────────────────────
const inputCls =
  'w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a6cbf]/40 focus:border-[#1a6cbf] transition-colors'

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

// Merge saved array over defaults by `type`/`event` key
function mergeArrayDefaults(defaults, saved, key = 'type') {
  if (!Array.isArray(saved)) return defaults
  return defaults.map((d) => {
    const s = saved.find((x) => x && x[key] === d[key]) || {}
    return { ...d, ...s }
  })
}

// ─── Main component ───────────────────────────────────────────────
export default function SettingsTab() {
  const [subtab, setSubtab] = useState('clinic')

  return (
    <div className="space-y-4">
      {/* Secondary pill nav */}
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

      {/* Active sub-tab */}
      {subtab === 'clinic'        && <ClinicProfileTab />}
      {subtab === 'visits'        && <VisitRulesTab />}
      {subtab === 'lab'           && <LabSettingsTab />}
      {subtab === 'pharmacy'      && <PharmacySettingsTab />}
      {subtab === 'notifications' && <NotificationsTab />}
      {subtab === 'security'      && <SecurityTab />}
      {subtab === 'audit'         && <AuditLogSubTab />}
      {subtab === 'system'        && <SystemTab />}
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
          title="Clinic Profile"
          subtitle="Appears on invoices, receipts, and across the system"
        />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Clinic Name">
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. City Health Clinic"
                className={inputCls}
              />
            </Field>
            <Field label="Tagline" hint="Short descriptor under the clinic name">
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => handleChange('tagline', e.target.value)}
                placeholder="e.g. Caring for our community since 1998"
                className={inputCls}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+254 700 000 000"
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="info@clinic.co.ke"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Address">
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Street, town, county, country"
              className={`${inputCls} resize-none`}
            />
          </Field>

          <ApiWarning show={!!error} />

          <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Profile" />
        </div>
      </Card>
    </form>
  )
}

// ─── 2. Visit Rules ───────────────────────────────────────────────
function VisitRulesTab() {
  const queryClient = useQueryClient()
  const [rules, setRules] = useState(DEFAULT_VISIT_RULES)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings', 'visits'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 60000,
    retry: false,
  })

  useEffect(() => {
    if (data?.settings?.visit_rules) {
      setRules(mergeArrayDefaults(DEFAULT_VISIT_RULES, data.settings.visit_rules))
      setDirty(false)
    }
    if (data || error) setLoaded(true)
  }, [data, error])

  const saveMutation = useMutation({
    mutationFn: (body) => api.patch('/api/admin/settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })

  const updateRule = (idx, key, val) => {
    setRules((r) => r.map((rule, i) => (i === idx ? { ...rule, [key]: val } : rule)))
    setDirty(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      await saveMutation.mutateAsync({ visit_rules: rules })
      toast.success('Visit rules saved')
      setDirty(false)
    } catch (err) {
      toast.error(err.message || 'Could not save visit rules')
    }
  }

  if (isLoading && !loaded) return <SkeletonCard className="h-72" />

  return (
    <Card>
      <CardHeader
        title="Visit Rules"
        subtitle="Default fees and stage-1 behaviour per visit type"
      />
      <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-3">
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="w-full min-w-160">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700/60">
                <th className="px-2 py-2">Visit Type</th>
                <th className="px-2 py-2">Default Fee</th>
                <th className="px-2 py-2">Auto-waive Stage 1</th>
                <th className="px-2 py-2">Requires Doctor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {rules.map((rule, idx) => (
                <tr key={rule.type} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10">
                  <td className="px-2 py-3">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{rule.label}</p>
                    <p className="text-[11px] text-gray-400 capitalize">{rule.type.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="px-2 py-3">
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">KSh</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={rule.default_fee}
                        onChange={(e) => updateRule(idx, 'default_fee', Number(e.target.value))}
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <Toggle
                      checked={rule.auto_waive_stage1}
                      onChange={(v) => updateRule(idx, 'auto_waive_stage1', v)}
                      ariaLabel={`Auto-waive Stage 1 for ${rule.label}`}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <Toggle
                      checked={rule.requires_doctor}
                      onChange={(v) => updateRule(idx, 'requires_doctor', v)}
                      ariaLabel={`Requires doctor for ${rule.label}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ApiWarning show={!!error} />

        <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Visit Rules" />
      </form>
    </Card>
  )
}

// ─── 3. Lab Settings ──────────────────────────────────────────────
function LabSettingsTab() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(DEFAULT_LAB)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings', 'lab'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 60000,
    retry: false,
  })

  useEffect(() => {
    if (data?.settings?.lab_settings) {
      setForm({ ...DEFAULT_LAB, ...data.settings.lab_settings })
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
      await saveMutation.mutateAsync({ lab_settings: form })
      toast.success('Lab settings saved')
      setDirty(false)
    } catch (err) {
      toast.error(err.message || 'Could not save lab settings')
    }
  }

  if (isLoading && !loaded) return <SkeletonCard className="h-96" />

  return (
    <Card>
      <CardHeader title="Lab Settings" subtitle="Defaults for lab orders, results, and reports" />
      <form onSubmit={handleSave} className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Default Urgency" hint="Used when no urgency is selected at order time">
            <select
              value={form.default_urgency}
              onChange={(e) => handleChange('default_urgency', e.target.value)}
              className={inputCls}
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40 px-4">
          <ToggleRow
            label="Auto-notify doctor when results ready"
            description="Send a notification to the prescribing doctor when results are entered"
            checked={form.auto_notify_doctor}
            onChange={(v) => handleChange('auto_notify_doctor', v)}
          />
          <ToggleRow
            label="Result flagging enabled"
            description="Automatically flag abnormal results based on reference ranges"
            checked={form.result_flagging}
            onChange={(v) => handleChange('result_flagging', v)}
          />
        </div>

        <Field label="Report Footer Text" hint="Printed at the bottom of every lab report">
          <textarea
            rows={3}
            value={form.report_footer}
            onChange={(e) => handleChange('report_footer', e.target.value)}
            placeholder="Clinic contact info, disclaimer, etc."
            className={`${inputCls} resize-none`}
          />
        </Field>

        <ApiWarning show={!!error} />

        <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Lab Settings" />
      </form>
    </Card>
  )
}

// ─── 4. Pharmacy Settings ─────────────────────────────────────────
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

  // Live preview: Retail KES 800 → Clinic KES {800 * markup/100}
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

// ─── 5. Notifications ─────────────────────────────────────────────
function NotificationsTab() {
  const queryClient = useQueryClient()
  const [events, setEvents] = useState(DEFAULT_NOTIFICATIONS)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings', 'notifications'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 60000,
    retry: false,
  })

  useEffect(() => {
    if (data?.settings?.notifications) {
      setEvents(mergeArrayDefaults(DEFAULT_NOTIFICATIONS, data.settings.notifications, 'event'))
      setDirty(false)
    }
    if (data || error) setLoaded(true)
  }, [data, error])

  const saveMutation = useMutation({
    mutationFn: (body) => api.patch('/api/admin/settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })

  const toggleEvent = (idx, val) => {
    setEvents((arr) => arr.map((e, i) => (i === idx ? { ...e, enabled: val } : e)))
    setDirty(true)
  }

  const toggleRole = (idx, roleKey) => {
    setEvents((arr) =>
      arr.map((e, i) => {
        if (i !== idx) return e
        const has = e.roles.includes(roleKey)
        return {
          ...e,
          roles: has ? e.roles.filter((r) => r !== roleKey) : [...e.roles, roleKey],
        }
      })
    )
    setDirty(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      await saveMutation.mutateAsync({ notifications: events })
      toast.success('Notification settings saved')
      setDirty(false)
    } catch (err) {
      toast.error(err.message || 'Could not save notification settings')
    }
  }

  if (isLoading && !loaded) return <SkeletonCard className="h-96" />

  return (
    <Card>
      <CardHeader
        title="Notifications"
        subtitle="Choose which events fire notifications and which roles receive them"
      />
      <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-3">
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="w-full min-w-190">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700/60">
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Enabled</th>
                <th className="px-2 py-2" colSpan={NOTIFICATION_ROLES.length}>Roles Notified</th>
              </tr>
              <tr className="text-left text-[10px] font-medium uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700/60">
                <th className="px-2 py-1.5" />
                <th className="px-2 py-1.5" />
                {NOTIFICATION_ROLES.map((r) => (
                  <th key={r.key} className="px-2 py-1.5 text-center">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {events.map((ev, idx) => (
                <tr key={ev.event} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10">
                  <td className="px-2 py-3">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                      {ev.event.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 max-w-xs">{ev.description}</p>
                  </td>
                  <td className="px-2 py-3">
                    <Toggle
                      checked={ev.enabled}
                      onChange={(v) => toggleEvent(idx, v)}
                      ariaLabel={`Enable ${ev.event}`}
                    />
                  </td>
                  {NOTIFICATION_ROLES.map((r) => (
                    <td key={r.key} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={ev.roles.includes(r.key)}
                        onChange={() => toggleRole(idx, r.key)}
                        disabled={!ev.enabled}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-[#1a6cbf] focus:ring-[#1a6cbf] disabled:opacity-40 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ApiWarning show={!!error} />

        <SaveBar saving={saveMutation.isPending} dirty={dirty} label="Save Notifications" />
      </form>
    </Card>
  )
}

// ─── 6. Security ──────────────────────────────────────────────────
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
                      <Badge className={badgeClass(s.role === 'on_shift' ? 'on_shift' : s.role)}>
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

// ─── 7. Audit Log ─────────────────────────────────────────────────
function AuditLogSubTab() {
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(0)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'audit-log', 'settings-tab', category],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '1000' })
      if (category !== 'all') params.set('category', category)
      return api.get(`/api/admin/audit-log?${params.toString()}`)
    },
    staleTime: 15000,
  })

  // Reset page when filter changes
  useEffect(() => {
    setPage(0)
  }, [category])

  const entries = data?.entries || []
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleExportCsv = () => {
    if (!entries.length) {
      toast.error('No entries to export')
      return
    }
    const rows = [['Timestamp', 'Action', 'Description', 'User', 'Category']]
    entries.forEach((e) => {
      rows.push([
        e.timestamp || '',
        e.action || '',
        e.description || '',
        e.user || '',
        e.category || '',
      ])
    })
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${entries.length} entries`)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-16" />
        <SkeletonTable rows={8} cols={5} />
      </div>
    )
  }
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Filters + export */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {AUDIT_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={[
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                  category === c.key
                    ? 'bg-[#1a6cbf] text-white'
                    : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700',
                ].join(' ')}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!entries.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-50"
          >
            <Icon name="download" size={13} /> Export CSV
          </button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Audit Trail"
          subtitle={`${entries.length} event${entries.length === 1 ? '' : 's'} · page ${page + 1} of ${totalPages}`}
        />
        {!entries.length ? (
          <EmptyState
            icon="clipboard"
            title="No audit events"
            description="Actions across the clinic will be logged here automatically."
          />
        ) : (
          <>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full min-w-190">
                <thead className="sticky top-0 bg-gray-50 dark:bg-[#1e293b]/90 backdrop-blur z-10">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700/60">
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5">User</th>
                    <th className="px-4 py-2.5">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {pageEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10">
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12px] text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {e.timestamp ? formatTime(e.timestamp) : '—'}
                        </p>
                        <p className="text-[11px] text-gray-400 whitespace-nowrap">
                          {e.timestamp ? timeAgo(e.timestamp) : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{e.action}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12px] text-gray-600 dark:text-gray-300">{e.description}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12px] text-gray-700 dark:text-gray-300">{e.user || '—'}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge className={CATEGORY_BADGE[e.category] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400'}>
                          {cap(e.category)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700/60">
              <p className="text-[11px] text-gray-400">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, entries.length)} of {entries.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="arrowLeft" size={12} /> Prev
                </button>
                <span className="text-[12px] text-gray-500 dark:text-gray-400 px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <Icon name="arrowRight" size={12} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// ─── 8. System ────────────────────────────────────────────────────
function SystemTab() {
  // Mock/static system info — task allows mock values.
  const systemInfo = useMemo(() => ({
    app_version: 'v2.4.1',
    total_visits: 1248,
    total_patients: 873,
    uptime: '3d 14h 22m',
    database: 'SQLite (local)',
    node_version: process.env.NEXT_PUBLIC_NODE_VERSION || 'v20.x',
    last_backup: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  }), [])

  const [archiveDays, setArchiveDays] = useState(90)
  const [purgeDays, setPurgeDays] = useState(30)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [purgeBusy, setPurgeBusy] = useState(false)

  const handleArchive = async () => {
    setArchiveBusy(true)
    try {
      await api.patch('/api/admin/settings', { archive_visits_older_than_days: archiveDays })
      toast.success(`Archive scheduled for visits older than ${archiveDays} days`)
      setConfirmArchive(false)
    } catch (err) {
      toast.error(err.message || 'Could not schedule archive')
    } finally {
      setArchiveBusy(false)
    }
  }

  const handlePurge = async () => {
    setPurgeBusy(true)
    try {
      await api.patch('/api/admin/settings', { purge_notifications_older_than_days: purgeDays })
      toast.success(`Purge scheduled for notifications older than ${purgeDays} days`)
      setConfirmPurge(false)
    } catch (err) {
      toast.error(err.message || 'Could not schedule purge')
    } finally {
      setPurgeBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* System info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon="info" color="blue"   label="App Version"    value={systemInfo.app_version} sublabel="current build" />
        <StatCard icon="list"  color="purple" label="Total Visits"  value={systemInfo.total_visits.toLocaleString()} sublabel="all-time" />
        <StatCard icon="users" color="green"  label="Total Patients" value={systemInfo.total_patients.toLocaleString()} sublabel="registered" />
        <StatCard icon="clock" color="amber"  label="Uptime"        value={systemInfo.uptime} sublabel="since last restart" />
      </div>

      {/* System details */}
      <Card>
        <CardHeader title="System Information" subtitle="Runtime environment" />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <InfoRow label="Database" value={systemInfo.database} />
          <InfoRow label="Node Version" value={systemInfo.node_version} />
          <InfoRow label="Last Backup" value={timeAgo(systemInfo.last_backup)} />
          <InfoRow label="Build" value={systemInfo.app_version} />
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-300 dark:border-red-900/60">
        <CardHeader
          title={<span className="text-red-600 dark:text-red-400 flex items-center gap-1.5"><Icon name="alert" size={14} /> Danger Zone</span>}
          subtitle="Irreversible maintenance operations — proceed with caution"
        />
        <div className="p-5 space-y-4">
          {/* Archive old visits */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20">
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Archive Old Visits</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Move completed visits older than the specified number of days into the archive.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative w-32">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={archiveDays}
                    onChange={(e) => setArchiveDays(Number(e.target.value))}
                    className={`${inputCls} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">days</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              disabled={archiveBusy || archiveDays < 1}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Icon name="archive" size={14} /> Archive Now
            </button>
          </div>

          {/* Purge old notifications */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20">
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Purge Old Notifications</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Permanently delete notification records older than the specified number of days.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative w-32">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={purgeDays}
                    onChange={(e) => setPurgeDays(Number(e.target.value))}
                    className={`${inputCls} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">days</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmPurge(true)}
              disabled={purgeBusy || purgeDays < 1}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Icon name="trash" size={14} /> Purge Now
            </button>
          </div>
        </div>
      </Card>

      <ConfirmModal
        open={confirmArchive}
        danger
        title="Archive old visits?"
        description={`All completed visits older than ${archiveDays} days will be moved to the archive. They will no longer appear in active lists but remain searchable in the patient archive.`}
        confirmLabel={archiveBusy ? 'Archiving…' : 'Archive Visits'}
        busy={archiveBusy}
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
      />
      <ConfirmModal
        open={confirmPurge}
        danger
        title="Purge old notifications?"
        description={`All notification records older than ${purgeDays} days will be permanently deleted. This action cannot be undone.`}
        confirmLabel={purgeBusy ? 'Purging…' : 'Purge Notifications'}
        busy={purgeBusy}
        onConfirm={handlePurge}
        onCancel={() => setConfirmPurge(false)}
      />
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700/40 last:border-0">
      <span className="text-[12px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  )
}