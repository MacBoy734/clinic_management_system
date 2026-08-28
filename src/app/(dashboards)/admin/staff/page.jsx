'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Icon } from '@/utils/helpers'

// ─── Config ───────────────────────────────────────────────────────────────────
const ROLES = ['doctor', 'receptionist', 'lab_tech', 'pharmacist']

const ROLE_CONFIG = {
  doctor: { label: 'Doctor', cls: 'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400   border-blue-200   dark:border-blue-800' },
  receptionist: { label: 'Receptionist', cls: 'bg-teal-50   dark:bg-teal-900/20   text-teal-700   dark:text-teal-400   border-teal-200   dark:border-teal-800' },
  lab_tech: { label: 'Lab Tech', cls: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  pharmacist: { label: 'Pharmacist', cls: 'bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-400  border-amber-200  dark:border-amber-800' },
}

const AVATAR_COLORS = {
  doctor: 'bg-blue-600',
  receptionist: 'bg-teal-600',
  lab_tech: 'bg-purple-600',
  pharmacist: 'bg-amber-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return 'Never'
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

function initials(name) {
  return name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ─── React Query hooks ────────────────────────────────────────────────────────
function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get('/api/admin/staff'),
    staleTime: 30000,
  })
}

function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/api/admin/staff', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/api/admin/staff/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

function useToggleStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) =>
      api.patch(`/api/admin/staff/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }) =>
      api.patch(`/api/admin/staff/${id}/password`, { password }),
  })
}

// ─── Input component ──────────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5
        text-gray-500 dark:text-gray-400">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = `
  w-full h-9 px-3 text-[13px] rounded-lg border outline-none transition-colors
  bg-white dark:bg-gray-800
  border-gray-200 dark:border-gray-600
  text-gray-900 dark:text-gray-100
  placeholder:text-gray-400 dark:placeholder:text-gray-600
  focus:border-blue-500 dark:focus:border-blue-500
  focus:ring-2 focus:ring-blue-500/10
`

// ─── Staff Modal (Add / Edit) ─────────────────────────────────────────────────
function StaffModal({ staff, onClose, onCreate, onUpdate, onResetPassword, isSaving }) {
  const isEdit = !!staff

  const [form, setForm] = useState({
    username: staff?.username || '',
    role: staff?.role || 'doctor',
    password: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [resetPw, setResetPw] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.username.trim()) return
    if (!isEdit && !form.password.trim()) {
      toast.error('Password is required for new staff')
      return
    }
    if (isEdit) {
      onUpdate({ id: staff.id, username: form.username, role: form.role })
    } else {
      onCreate(form)
    }
  }

  const handleResetPassword = () => {
    if (!resetPw.trim() || resetPw.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    onResetPassword({ id: staff.id, password: resetPw })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md
                      bg-white dark:bg-[#1e293b]
                      border border-gray-200 dark:border-gray-700
                      rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Staff Member' : 'Add New Staff'}
            </h2>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">
              {isEdit ? `Editing ${staff.username}` : 'Create a new staff account'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg
                       text-gray-400 dark:text-gray-500
                       hover:bg-gray-100 dark:hover:bg-gray-700
                       hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-lg">
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!isEdit && (
            <>
              <Field label="Username" required>
                <input value={form.username} onChange={set('username')}
                  placeholder="e.g. Dr. James Kimani"
                  className={inputCls} required minLength={3} maxLength={20} />
              </Field>

              <Field label="Role" required>
                <select value={form.role} onChange={set('role')}
                  className={inputCls}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_CONFIG[r]?.label || r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Password" required>
                <div className="relative">
                  <input value={form.password} onChange={set('password')}
                    type={showPw ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
                    className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2
                             text-gray-400 dark:text-gray-500 text-xs">
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 h-9 rounded-xl text-[13px] font-medium transition-colors
                         border border-gray-200 dark:border-gray-600
                         text-gray-600 dark:text-gray-400
                         hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex-1 h-9 rounded-xl text-[13px] font-semibold text-white transition-colors
                         bg-[#0c2340] hover:bg-[#0f2d52] dark:bg-blue-700 dark:hover:bg-blue-600
                         disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </>
          )}

        </form>

        {/* Reset password section — edit mode only */}
        {isEdit && (
          <div className="px-6 pb-5">
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Reset Password
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    type={showResetPw ? 'text' : 'password'}
                    placeholder="New password"
                    className={`${inputCls} pr-10`}
                  />
                  <button type="button" onClick={() => setShowResetPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2
                               text-gray-400 dark:text-gray-500 text-xs">
                    {showResetPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="px-4 h-9 rounded-lg text-[13px] font-semibold text-white transition-colors
                             bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600
                             shrink-0">
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Deactivate confirm modal ─────────────────────────────────────────────────
function ConfirmModal({ staff, action, onConfirm, onClose, isLoading }) {
  const isDeactivating = action === 'deactivate'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm
                      bg-white dark:bg-[#1e293b]
                      border border-gray-200 dark:border-gray-700
                      rounded-2xl shadow-2xl p-6">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl mb-4
          ${isDeactivating
            ? 'bg-red-100 dark:bg-red-900/30'
            : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
          {isDeactivating ? '⚠️' : '✅'}
        </div>
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {isDeactivating ? 'Deactivate Account' : 'Reactivate Account'}
        </h3>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
          {isDeactivating
            ? `${staff.username} will no longer be able to log in. Their data and history will be preserved.`
            : `${staff.username} will be able to log in again with their existing password.`}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 h-9 rounded-xl text-[13px] font-medium transition-colors
                       border border-gray-200 dark:border-gray-600
                       text-gray-600 dark:text-gray-400
                       hover:bg-gray-50 dark:hover:bg-gray-700/50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isLoading}
            className={`flex-1 h-9 rounded-xl text-[13px] font-semibold text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isDeactivating
                ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600'
                : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600'}`}>
            {isLoading ? 'Saving…' : isDeactivating ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-700/50">
      {[40, 60, 30, 20, 20, 15].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className={`h-4 rounded animate-pulse bg-gray-200 dark:bg-gray-700`}
            style={{ width: `${w}%` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const staffQuery = useStaff()
  const createMut = useCreateStaff()
  const updateMut = useUpdateStaff()
  const toggleMut = useToggleStatus()
  const resetPwMut = useResetPassword()

  const staff = staffQuery.data || []

  const filtered = staff.filter((s) => {
    const matchSearch = s.username.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || s.role === roleFilter
    return matchSearch && matchRole
  })

  const activeCount = staff.filter((s) => s.is_active === 'active').length
  const inactiveCount = staff.filter((s) => s.is_active === 'inactive').length

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = (form) => {
    createMut.mutate(form, {
      onSuccess: () => { toast.success('Staff account created'); setModal(null) },
      onError: () => toast.error('Failed to create account'),
    })
  }

  const handleUpdate = (data) => {
    updateMut.mutate(data, {
      onSuccess: () => { toast.success('Staff updated'); setModal(null) },
      onError: () => toast.error('Failed to update'),
    })
  }

  const handleToggle = () => {
    const { staff: s } = confirm
    toggleMut.mutate({ id: s.id }, {
      onSuccess: () => {
        toast.success(s.is_active ? 'Account deactivated' : 'Account reactivated')
        setConfirm(null)
      },
      onError: () => toast.error('Failed to update status'),
    })
  }

  const handleResetPassword = ({ id, password }) => {
    resetPwMut.mutate({ id, password }, {
      onSuccess: () => {toast.success('Password reset successfully'); setModal(null)},
      onError: () => toast.error('Failed to reset password'),
    })
  }

  return (
    <>
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Staff Management
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {staff.length} member{staff.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => staffQuery.refetch()}
            disabled={staffQuery.isFetching}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon 
              name="refresh" 
              size={13} 
              className={staffQuery.isFetching ? 'animate-spin' : ''} 
            />
            {staffQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold
                       text-white transition-colors
                       bg-[#0c2340] hover:bg-[#0f2d52] dark:bg-blue-700 dark:hover:bg-blue-600">
            + Add Staff
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {staffQuery.isError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-[13px]
                        bg-red-50 dark:bg-red-900/20
                        border border-red-200 dark:border-red-800
                        text-red-700 dark:text-red-400">
          Could not load staff: {staffQuery.error?.message}
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Staff', value: staff.length, color: 'border-gray-200 dark:border-gray-700' },
          { label: 'Active', value: staff.filter(user => user.is_active).length, color: 'border-emerald-200 dark:border-emerald-800' },
          { label: 'Inactive', value: staff.filter(user => !user.is_active).length, color: 'border-red-200 dark:border-red-800' },
          { label: 'Roles', value: ROLES.length, color: 'border-blue-200 dark:border-blue-800' },
        ].map((c) => (
          <div key={c.label}
            className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 transition-colors ${c.color}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest
                          text-gray-400 dark:text-gray-500">
              {c.label}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 leading-none">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Table card ── */}
      <div className="bg-white dark:bg-[#1e293b]
                      border border-gray-200 dark:border-gray-700
                      rounded-2xl overflow-hidden transition-colors">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4
                        border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-[14px] font-bold text-gray-800 dark:text-gray-100 flex-1">
            All Staff
          </h3>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5
                            text-gray-400 dark:text-gray-600 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username…"
              className="pl-8 pr-4 py-1.5 text-[13px] rounded-lg w-52 outline-none transition-colors
                         border border-gray-200 dark:border-gray-600
                         bg-white dark:bg-gray-800
                         text-gray-900 dark:text-gray-100
                         placeholder:text-gray-400 dark:placeholder:text-gray-600
                         focus:border-blue-500 dark:focus:border-blue-500"
            />
          </div>

          {/* Role filter */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {['all', ...ROLES].map((r) => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all
                  ${roleFilter === r
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {r === 'all' ? 'All' : ROLE_CONFIG[r]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/70 dark:bg-gray-800/50
                             border-b border-gray-100 dark:border-gray-700">
                {['Staff Member', 'Role', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3
                                         text-[11px] font-semibold uppercase tracking-wide
                                         text-gray-400 dark:text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {staffQuery.isLoading
                ? [1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="text-center py-14
                                                  text-[13px] text-gray-400 dark:text-gray-600">
                        No staff found
                      </td>
                    </tr>
                  )
                  : filtered.map((s) => (
                    <tr key={s.id}
                      className="hover:bg-blue-50/30 dark:hover:bg-blue-900/20
                                 transition-colors group">

                      {/* Staff member */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full shrink-0
                                           flex items-center justify-center
                                           text-white text-[11px] font-bold
                                           ${AVATAR_COLORS[s.role] || 'bg-gray-500'}`}>
                            {initials(s.username)}
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md
                                          text-[11px] font-medium border
                                          ${ROLE_CONFIG[s.role]?.cls}`}>
                          {ROLE_CONFIG[s.role]?.label || s.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold
                          ${s.is_active
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-400 dark:text-gray-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full
                            ${s.is_active === 'active'
                              ? 'bg-emerald-500'
                              : 'bg-gray-400 dark:bg-gray-600'}`} />
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions — reveal on hover */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5
                                        opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Edit */}
                          <button
                            onClick={() => setModal(s)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors
                                       border border-gray-200 dark:border-gray-600
                                       text-gray-600 dark:text-gray-400
                                       hover:bg-gray-100 dark:hover:bg-gray-700">
                            Edit
                          </button>

                          {/* Deactivate / Reactivate */}
                          {s.is_active ? (
                            <button
                              onClick={() => setConfirm({ staff: s, action: 'deactivate' })}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors
                                         bg-red-50 dark:bg-red-900/20
                                         text-red-600 dark:text-red-400
                                         border border-red-100 dark:border-red-800
                                         hover:bg-red-100 dark:hover:bg-red-900/40">
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirm({ staff: s, action: 'reactivate' })}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors
                                         bg-emerald-50 dark:bg-emerald-900/20
                                         text-emerald-600 dark:text-emerald-400
                                         border border-emerald-100 dark:border-emerald-800
                                         hover:bg-emerald-100 dark:hover:bg-emerald-900/40">
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between
                        bg-gray-50/70 dark:bg-gray-800/30
                        border-t border-gray-100 dark:border-gray-700">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Showing {filtered.length} of {staff.length} staff members
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Owner account is managed separately
          </p>
        </div>
      </div>

      {/* ── Add / Edit modal ── */}
      {modal && (
        <StaffModal
          staff={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onResetPassword={handleResetPassword}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* ── Confirm deactivate / reactivate modal ── */}
      {confirm && (
        <ConfirmModal
          staff={confirm.staff}
          action={confirm.action}
          onConfirm={handleToggle}
          onClose={() => setConfirm(null)}
          isLoading={toggleMut.isPending}
        />
      )}
    </>
  )
}