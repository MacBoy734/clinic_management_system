'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

// ─── Icons ────────────────────────────────────────────────────────────────────
function Icon({ d, size = 16 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
    </svg>
  )
}

const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />
const TrashIcon = () => <Icon d={['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6']} />
const EditIcon = () => <Icon d={['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z']} />
const SaveIcon = () => <Icon d={['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8']} />
const ReceiptIcon = () => <Icon d={['M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 0 0-2-2z', 'M8 10h8', 'M8 14h5']} size={18} />
const TagIcon = () => <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" size={18} />
const ChevronDown = () => <Icon d="M6 9l6 6 6-6" />

// ─── Category colours ─────────────────────────────────────────────────────────
const CATEGORY_STYLES = {
  Consultation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Laboratory:   'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Pharmacy:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Procedure:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Other:        'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}
const CATEGORIES = Object.keys(CATEGORY_STYLES)

// ─── Seed data ─────────────────────────────────────────────────────────────────
const SEED_SERVICES = [
  { id: 1, name: 'General Consultation', category: 'Consultation', price: 500,  active: true },
  { id: 2, name: 'Specialist Consultation', category: 'Consultation', price: 1500, active: true },
  { id: 3, name: 'Full Blood Count (FBC)', category: 'Laboratory',   price: 800,  active: true },
  { id: 4, name: 'Malaria RDT',            category: 'Laboratory',   price: 300,  active: true },
  { id: 5, name: 'Urinalysis',             category: 'Laboratory',   price: 400,  active: true },
  { id: 6, name: 'Dispensing Fee',         category: 'Pharmacy',     price: 50,   active: true },
  { id: 7, name: 'Wound Dressing',         category: 'Procedure',    price: 600,  active: true },
  { id: 8, name: 'ECG',                    category: 'Procedure',    price: 1200, active: false },
]

const SEED_RECEIPT = {
  clinicName:    'City Health Clinic',
  tagline:       'Your health, our priority',
  address:       'Moi Avenue, Nairobi, Kenya',
  phone:         '+254 700 000 000',
  email:         'info@cityhealthclinic.co.ke',
  pin:           'P051234567X',
  footer:        'Thank you for choosing City Health Clinic. Get well soon!',
  showLogo:      true,
  showPin:       true,
  currency:      'KES',
  printCopies:   1,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2 })

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  )
}

function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full h-9 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-600
        bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
        placeholder:text-slate-400 dark:placeholder:text-slate-600
        focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
        disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:cursor-not-allowed transition-all"
    />
  )
}

function Select({ value, onChange, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full h-9 pl-3 pr-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600
          bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
          focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
          appearance-none transition-all"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
        <ChevronDown />
      </span>
    </div>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600
        bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
        placeholder:text-slate-400 dark:placeholder:text-slate-600
        focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
        resize-none transition-all"
    />
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    </label>
  )
}

function SaveBar({ dirty, saving, onSave }) {
  if (!dirty) return null
  return (
    <div className="sticky bottom-0 left-0 right-0 z-10 flex items-center justify-between
      bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700
      px-6 py-3 shadow-lg">
      <p className="text-xs text-slate-500 dark:text-slate-400">You have unsaved changes</p>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 h-8 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {saving ? (
          <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        ) : <SaveIcon />}
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

// ─── Services & Pricing ───────────────────────────────────────────────────────
function ServicesSection() {
  const [services, setServices] = useState(SEED_SERVICES)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [filter, setFilter] = useState('All')

  // modal state
  const [modal, setModal] = useState(null) // null | 'add' | { ...service }
  const [form, setForm] = useState({ name: '', category: 'Consultation', price: '', active: true })
  const [formErr, setFormErr] = useState('')

  const mark = () => setDirty(true)

  const openAdd = () => {
    setForm({ name: '', category: 'Consultation', price: '', active: true })
    setFormErr('')
    setModal('add')
  }

  const openEdit = (svc) => {
    setForm({ name: svc.name, category: svc.category, price: String(svc.price), active: svc.active })
    setFormErr('')
    setModal(svc)
  }

  const closeModal = () => setModal(null)

  const saveForm = () => {
    if (!form.name.trim()) { setFormErr('Service name is required.'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price < 0) { setFormErr('Enter a valid price.'); return }

    if (modal === 'add') {
      setServices(prev => [...prev, { id: Date.now(), name: form.name.trim(), category: form.category, price, active: form.active }])
    } else {
      setServices(prev => prev.map(s => s.id === modal.id ? { ...s, name: form.name.trim(), category: form.category, price, active: form.active } : s))
    }
    mark()
    closeModal()
  }

  const toggle = (id) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s))
    mark()
  }

  const remove = (id) => {
    setServices(prev => prev.filter(s => s.id !== id))
    mark()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('http://localhost:5000/api/settings/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ services }),
      })
      toast.success('Services saved')
      setDirty(false)
    } catch {
      toast.error('Failed to save. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const allCategories = ['All', ...CATEGORIES]
  const visible = filter === 'All' ? services : services.filter(s => s.category === filter)

  return (
    <div>
      <SectionHeader
        icon={<TagIcon />}
        title="Services & Pricing"
        subtitle="Define every billable service, test, and procedure with its category and price."
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {/* Category filter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                filter === cat
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors shrink-0"
        >
          <PlusIcon /> Add service
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Service</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Category</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Price (KES)</th>
              <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-sm text-slate-400 dark:text-slate-500">
                  No services in this category yet.
                </td>
              </tr>
            )}
            {visible.map(svc => (
              <tr key={svc.id} className={`group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${!svc.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{svc.name}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${CATEGORY_STYLES[svc.category] || CATEGORY_STYLES.Other}`}>
                    {svc.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                  {fmt(svc.price)}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggle(svc.id)}
                    className={`w-4 h-4 rounded border-2 transition-colors inline-flex items-center justify-center ${
                      svc.active
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-transparent border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {svc.active && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(svc)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                      <EditIcon />
                    </button>
                    <button onClick={() => remove(svc.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        {services.filter(s => s.active).length} active · {services.filter(s => !s.active).length} inactive · {services.length} total
      </p>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} />

      {/* Add / Edit modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {modal === 'add' ? 'Add service' : 'Edit service'}
            </h3>

            <div className="space-y-3">
              <div>
                <FieldLabel>Service name</FieldLabel>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Typhoid Test"
                />
              </div>
              <div>
                <FieldLabel>Category</FieldLabel>
                <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel>Price (KES)</FieldLabel>
                <Input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <Toggle
                checked={form.active}
                onChange={v => setForm(f => ({ ...f, active: v }))}
                label="Available for billing"
              />
            </div>

            {formErr && (
              <p className="mt-3 text-xs text-red-600 dark:text-red-400">{formErr}</p>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={closeModal} className="flex-1 h-9 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button onClick={saveForm} className="flex-1 h-9 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors">
                {modal === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Receipt Template ─────────────────────────────────────────────────────────
function ReceiptSection() {
  const [form, setForm] = useState(SEED_RECEIPT)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('http://localhost:5000/api/settings/receipt-template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      toast.success('Receipt template saved')
      setDirty(false)
    } catch {
      toast.error('Failed to save. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionHeader
        icon={<ReceiptIcon />}
        title="Receipt & Invoice Template"
        subtitle="This information prints on every patient receipt and invoice generated by the system."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left — form fields */}
        <div className="space-y-4">
          <div>
            <FieldLabel>Clinic name</FieldLabel>
            <Input value={form.clinicName} onChange={e => set('clinicName', e.target.value)} placeholder="City Health Clinic" />
          </div>
          <div>
            <FieldLabel>Tagline</FieldLabel>
            <Input value={form.tagline} onChange={e => set('tagline', e.target.value)} placeholder="Your health, our priority" />
          </div>
          <div>
            <FieldLabel>Address</FieldLabel>
            <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, City, Country" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Phone</FieldLabel>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+254 700 000 000" />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="info@clinic.co.ke" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Currency</FieldLabel>
              <Select value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="USD">USD — US Dollar</option>
                <option value="UGX">UGX — Ugandan Shilling</option>
                <option value="TZS">TZS — Tanzanian Shilling</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Print copies</FieldLabel>
              <Select value={String(form.printCopies)} onChange={e => set('printCopies', Number(e.target.value))}>
                <option value="1">1 copy</option>
                <option value="2">2 copies</option>
                <option value="3">3 copies</option>
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel>Footer message</FieldLabel>
            <Textarea
              value={form.footer}
              onChange={e => set('footer', e.target.value)}
              placeholder="Thank you for visiting…"
              rows={2}
            />
          </div>
          <div className="space-y-2.5 pt-1">
            <Toggle checked={form.showPin} onChange={v => set('showPin', v)} label="Show KRA PIN on receipt" />
            {form.showPin && (
              <div className="ml-11">
                <Input value={form.pin} onChange={e => set('pin', e.target.value)} placeholder="P051234567X" />
              </div>
            )}
            <Toggle checked={form.showLogo} onChange={v => set('showLogo', v)} label="Show clinic logo (when logo is uploaded)" />
          </div>
        </div>

        {/* Right — live preview */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Preview</p>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 shadow-sm">

            {/* Header */}
            <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-600 pb-3 mb-3">
              {form.showLogo && (
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mx-auto mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
              )}
              <p className="font-bold text-[13px] text-slate-800 dark:text-slate-100">{form.clinicName || '—'}</p>
              {form.tagline && <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">{form.tagline}</p>}
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{form.address}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{form.phone} · {form.email}</p>
              {form.showPin && form.pin && <p className="text-[10px] text-slate-500 dark:text-slate-400">KRA PIN: {form.pin}</p>}
            </div>

            {/* Receipt meta */}
            <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-3">
              <span>Receipt #: <span className="text-slate-700 dark:text-slate-300">REC-00123</span></span>
              <span>Date: <span className="text-slate-700 dark:text-slate-300">11 Jun 2026</span></span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">
              Patient: <span className="text-slate-700 dark:text-slate-300">Jane Mwangi</span>
            </div>

            {/* Line items */}
            <div className="border-t border-dashed border-slate-300 dark:border-slate-600 pt-2 mb-2 space-y-1">
              {[
                { name: 'General Consultation', qty: 1, price: 500 },
                { name: 'Malaria RDT',           qty: 1, price: 300 },
                { name: 'Amoxicillin 500mg x6',  qty: 1, price: 180 },
              ].map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                  <span className="tabular-nums">{form.currency} {fmt(item.price)}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="border-t border-dashed border-slate-300 dark:border-slate-600 pt-2 mb-3">
              <div className="flex justify-between font-bold text-[12px] text-slate-800 dark:text-slate-100">
                <span>TOTAL</span>
                <span className="tabular-nums">{form.currency} {fmt(980)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                <span>Paid (Cash)</span>
                <span className="tabular-nums">{form.currency} {fmt(1000)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>Change</span>
                <span className="tabular-nums">{form.currency} {fmt(20)}</span>
              </div>
            </div>

            {/* Footer */}
            {form.footer && (
              <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 border-t border-dashed border-slate-300 dark:border-slate-600 pt-2">
                {form.footer}
              </p>
            )}
            <p className="text-center text-[9px] text-slate-400 dark:text-slate-600 mt-1">
              {form.printCopies > 1 ? `${form.printCopies} copies will print` : '1 copy will print'}
            </p>
          </div>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
    </div>
  )
}

// ─── Tab nav ──────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'services', label: 'Services & Pricing', icon: <TagIcon /> },
  { key: 'receipt',  label: 'Receipt Template',   icon: <ReceiptIcon /> },
]

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [tab, setTab] = useState('services')

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your clinic's services, pricing, and receipt format.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === t.key
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className={tab === t.key ? 'text-white' : 'text-slate-400 dark:text-slate-500'}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          {tab === 'services' && <ServicesSection />}
          {tab === 'receipt'  && <ReceiptSection />}
        </div>

      </div>
    </div>
  )
}