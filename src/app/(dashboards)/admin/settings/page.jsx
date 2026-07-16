'use client'

// SettingsTab — admin settings with 3 secondary sub-tabs.
// APIs:
//   GET    /api/admin/settings     → arbitrary config slices
//   PATCH  /api/admin/settings     → save any config slice (mock Object.assign's the body)
//   GET    /api/admin/sessions     → active sessions list
//   DELETE /api/admin/sessions/:id → kill one session
//
// Built defensively: every sub-tab falls back to sensible defaults if the API
// call fails, and save mutations catch + toast errors without crashing.

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Card, CardHeader, Badge, EmptyState, Icon,
  SkeletonCard, SkeletonTable, Spinner,
  formatMoney, formatTime, timeAgo, cap, badgeClass,
} from '@/utils/helpers'

// ─── Sub-tab definitions ──────────────────────────────────────────
const SUBTABS = [
  { key: 'lab',      label: 'Lab Settings',      icon: 'flask' },
  { key: 'pharmacy', label: 'Pharmacy Settings', icon: 'pill' },
  { key: 'security', label: 'Security',          icon: 'shield' },
]

// ─── Defaults (used when API call fails or returns nothing) ───────
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

const DEFAULT_SECURITY = {
  session_timeout_hours: 8,
  password_min_length: 8,
  password_expiry_days: 90,
  force_relogin_on_inactivity: true,
}

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

// ─── Main component ───────────────────────────────────────────────
export default function SettingsTab() {
  const [subtab, setSubtab] = useState('lab')

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
      {subtab === 'lab'      && <LabSettingsTab />}
      {subtab === 'pharmacy' && <PharmacySettingsTab />}
      {subtab === 'security' && <SecurityTab />}
    </div>
  )
}

// ─── 1. Lab Settings ──────────────────────────────────────────────
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

// ─── 3. Security ──────────────────────────────────────────────────
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