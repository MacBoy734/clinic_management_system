'use client'

import { useState, useEffect } from 'react'
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

// ─── Sub-tab 3: Charge Templates ─────────────────────────────────
function ChargeTemplatesTab() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const q = useQuery({
    queryKey: ['admin', 'charge-templates'],
    queryFn: () => api.get('/api/admin/charge-templates'),
    staleTime: 60000,
  })

  const addMut = useMutation({
    mutationFn: (body) => api.post('/api/admin/charge-templates', {
      name: body.name, category: body.category, amount: Number(body.price), is_active: body.is_active,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] }),
  })
  const editMut = useMutation({
    mutationFn: ({ id, body }) => {
      const patch = {}
      if (body.price != null) patch.amount = Number(body.price)
      if (body.is_active != null) patch.is_active = body.is_active
      if (body.name != null) patch.name = body.name
      if (body.category != null) patch.category = body.category
      return api.patch(`/api/admin/charge-templates/${id}`, patch)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] }),
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/admin/charge-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'charge-templates'] }),
  })

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={5} />
      </div>
    )
  }
  if (q.isError) {
    return <ErrorState message={q.error?.message || 'Could not load charge templates'} onRetry={q.refetch} />
  }

  // Single ChargeTemplate table. Alias amount -> price for the existing UI.
  const templates = Array.isArray(q.data?.templates) ? q.data.templates : []
  const all = templates.map((t) => ({ ...t, price: t.amount }))

  // Group by category
  const groups = {}
  for (const t of all) {
    const key = t.category || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }
  const groupOrder = ['consultation', 'procedure', 'lab', 'medication']
  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a[0])
    const bi = groupOrder.indexOf(b[0])
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const activeCount = all.filter((t) => t.is_active).length
  const avg = all.length ? all.reduce((s, t) => s + (Number(t.price) || 0), 0) / all.length : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total Templates" value={all.length} icon="tag" color="blue" sublabel="chargeable services" />
        <StatTile label="Active" value={activeCount} icon="checkCircle" color="green" sublabel="available for billing" />
        <StatTile label="Inactive" value={all.length - activeCount} icon="archive" color="slate" sublabel="hidden from billing" />
        <StatTile label="Avg Charge" value={formatMoney(avg)} icon="dollarSign" color="amber" sublabel="across all templates" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          {sortedGroups.length} categor{sortedGroups.length === 1 ? 'y' : 'ies'} · inline-edit amount, toggle active, or delete
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white inline-flex items-center gap-1.5"
        >
          <Icon name="plus" size={14} /> Add Template
        </button>
      </div>

      {sortedGroups.length === 0 ? (
        <EmptyState icon="tag" title="No charge templates" description="Add your first chargeable service to get started." />
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([cat, items]) => (
            <Card key={cat} className="overflow-hidden">
              <CardHeader
                title={cap(cat)}
                subtitle={`${items.length} template${items.length === 1 ? '' : 's'}`}
                action={<Badge className={CATEGORY_BADGES[cat] || CATEGORY_BADGES.other}>{cap(cat)}</Badge>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                      <Th>Name</Th>
                      <Th align="left" className="hidden sm:table-cell">Category</Th>
                      <Th align="right">Amount</Th>
                      <Th align="center">Active</Th>
                      <Th align="right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                    {items.map((t) => (
                      <ChargeTemplateRow
                        key={t.id}
                        template={t}
                        isEditing={editingId === t.id}
                        loading={editMut.isPending || delMut.isPending}
                        onEdit={() => setEditingId(editingId === t.id ? null : t.id)}
                        onToggle={async () => {
                          try {
                            await editMut.mutateAsync({ id: t.id, body: { is_active: !t.is_active } })
                            toast.success(`${t.name} ${t.is_active ? 'deactivated' : 'activated'}`)
                          } catch (err) {
                            toast.error(err.message || 'Could not update template')
                          }
                        }}
                        onSave={async (price) => {
                          try {
                            await editMut.mutateAsync({ id: t.id, body: { price: Number(price) } })
                            toast.success(`${t.name} amount updated`)
                            setEditingId(null)
                          } catch (err) {
                            toast.error(err.message || 'Could not update amount')
                          }
                        }}
                        onDelete={async () => {
                          if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return
                          try {
                            await delMut.mutateAsync(t.id)
                            toast.success('Template deleted')
                          } catch (err) {
                            toast.error(err.message || 'Could not delete template')
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <AddTemplateModal
          loading={addMut.isPending}
          onClose={() => setShowAdd(false)}
          onSubmit={async (body) => {
            try {
              await addMut.mutateAsync(body)
              toast.success('Template added')
              setShowAdd(false)
            } catch (err) {
              toast.error(err.message || 'Could not add template')
            }
          }}
        />
      )}
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
function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full ${maxWidth} rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 shadow-2xl max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
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
function RowAction({ icon, label, onClick, color = 'gray', disabled }) {
  const colors = {
    gray: 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 hover:text-gray-700 dark:hover:text-gray-200',
    blue: 'text-[#1a6cbf] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30',
    amber: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30',
    red: 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${colors[color]}`}
    >
      <Icon name={icon} size={13} />
    </button>
  )
}
function Th({ children, align = 'left', className = '' }) {
  return (
    <th
      className={[
        'px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function ChargeTemplateRow({ template, isEditing, loading, onEdit, onToggle, onSave, onDelete }) {
  const [price, setPrice] = useState(String(template.price || 0))

  // Re-sync the local price input when the parent template price changes
  // (e.g. after a successful save round-trip or external mutation).
  useEffect(() => {
    if (!isEditing) setPrice(String(template.price || 0))
  }, [template.price, isEditing])

  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
      <td className="px-4 py-3">
        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{template.name}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider sm:hidden">{cap(template.category)}</p>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <Badge className={CATEGORY_BADGES[template.category] || CATEGORY_BADGES.other}>{cap(template.category)}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[11px] text-gray-400">KSh</span>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-24 px-2 py-1 text-[13px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 tabular-nums"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave(price)
                if (e.key === 'Escape') onEdit()
              }}
            />
          </div>
        ) : (
          <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(template.price)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={onToggle}
          disabled={loading}
          title={template.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
          className={[
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50',
            template.is_active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
              template.is_active ? 'translate-x-5' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {isEditing ? (
            <>
              <RowAction icon="check" label="Save" color="blue" onClick={() => onSave(price)} disabled={loading} />
              <RowAction icon="x" label="Cancel" onClick={onEdit} disabled={loading} />
            </>
          ) : (
            <>
              <RowAction icon="edit" label="Edit amount" color="amber" onClick={onEdit} disabled={loading} />
              <RowAction icon="trash" label="Delete" color="red" onClick={onDelete} disabled={loading} />
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function AddTemplateModal({ loading, onClose, onSubmit }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('procedure')
  const [price, setPrice] = useState('')
  const [isActive, setIsActive] = useState(true)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const numPrice = Number(price)
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      toast.error('Amount must be a non-negative number')
      return
    }
    await onSubmit({ name: name.trim(), category, price: numPrice, is_active: isActive })
  }

  return (
    <ModalShell
      title="Add Charge Template"
      subtitle="Create a new chargeable service line"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="add-template-form" disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-2 disabled:opacity-50">
            {loading ? <Spinner size={14} /> : <Icon name="save" size={14} />}
            {loading ? 'Saving…' : 'Add Template'}
          </button>
        </>
      }
    >
      <form id="add-template-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ECG, Ultrasound, Depo-Provera Injection"
            className={inputCls}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category *">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (KSh) *">
            <input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className={`${inputCls} tabular-nums`}
            />
          </Field>
        </div>
        <Field label="Status">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#1a6cbf] focus:ring-[#1a6cbf]/40"
            />
            <span className="text-[13px] text-gray-700 dark:text-gray-300">Active (available for billing)</span>
          </label>
        </Field>
      </form>
    </ModalShell>
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
            <table className="w-full min-w-[640px]">
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
