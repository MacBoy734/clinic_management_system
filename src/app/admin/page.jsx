'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Layout from '@/components/layout/dashboardLayout'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MOCK_STATS = {
  patients_today: 23, revenue_today: 34500, pending_bills: 3,
  low_stock_alerts: 5, total_patients: 1284, staff_count: 8,
}

const MOCK_REVENUE = [
  { day: 'Mon', revenue: 28000 }, { day: 'Tue', revenue: 31500 },
  { day: 'Wed', revenue: 27000 }, { day: 'Thu', revenue: 34500 },
  { day: 'Fri', revenue: 29000 }, { day: 'Sat', revenue: 18000 },
  { day: 'Sun', revenue: 12000 },
]

const MOCK_RECENT = [
  { id: 1, patient: 'James Otieno',  visit: 'VIS-0012', amount: 2800, status: 'paid',   time: '10:32' },
  { id: 2, patient: 'Aisha Kamau',   visit: 'VIS-0011', amount: 1500, status: 'paid',   time: '10:15' },
  { id: 3, patient: 'Peter Mwangi',  visit: 'VIS-0010', amount: 4200, status: 'pending',time: '09:58' },
  { id: 4, patient: 'Grace Wanjiku', visit: 'VIS-0009', amount: 950,  status: 'paid',   time: '09:40' },
  { id: 5, patient: 'Samuel Korir',  visit: 'VIS-0008', amount: 6800, status: 'paid',   time: '09:20' },
]

const MOCK_ALERTS = [
  { item: 'Amoxicillin 500mg', qty: 8,  reorder: 20, type: 'pharmacy' },
  { item: 'Paracetamol 500mg', qty: 12, reorder: 30, type: 'pharmacy' },
  { item: 'Malaria RDT Kits',  qty: 4,  reorder: 10, type: 'lab'      },
  { item: 'Metformin 500mg',   qty: 6,  reorder: 20, type: 'pharmacy' },
  { item: 'Blood Glucose Strips', qty: 7, reorder: 15, type: 'lab'    },
]

function StatCard({ label, value, sub, color, onClick }) {
  const colors = {
    blue:   'border-blue-200 bg-blue-50',
    green:  'border-emerald-200 bg-emerald-50',
    amber:  'border-amber-200 bg-amber-50',
    red:    'border-red-200 bg-red-50',
    purple: 'border-purple-200 bg-purple-50',
    slate:  'border-slate-200 bg-white',
  }
  const vals = {
    blue: 'text-blue-700', green: 'text-emerald-700', amber: 'text-amber-700',
    red: 'text-red-700', purple: 'text-purple-700', slate: 'text-slate-700',
  }
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 ${colors[color]} ${onClick ? 'cursor-pointer hover:shadow-sm transition-all' : ''}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold leading-none ${vals[color]}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/api/admin/stats').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: revenue } = useQuery({
    queryKey: ['admin', 'revenue', 'week'],
    queryFn: () => api.get('/api/admin/revenue/week').then(r => r.data),
  })

  const { data: recent } = useQuery({
    queryKey: ['admin', 'recent-bills'],
    queryFn: () => api.get('/api/admin/bills/recent').then(r => r.data),
    refetchInterval: 30000,
  })

  const s = stats ?? MOCK_STATS
  const rev = revenue ?? MOCK_REVENUE
  const bills = recent ?? MOCK_RECENT
  const alerts = MOCK_ALERTS

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {greeting}, {user?.username?.split(' ')[0]}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">Here's what's happening at the clinic today</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/admin/reports/daily')}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Daily report
            </button>
            <button
              onClick={() => router.push('/admin/staff/new')}
              className="px-4 py-2 bg-[#0d3d6b] text-white text-sm font-medium rounded-lg hover:bg-[#0a2f54] transition-colors"
            >
              + Add staff
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Patients today"  value={s.patients_today}                    color="blue"   sub="All visits"        onClick={() => router.push('/admin/patients')} />
          <StatCard label="Revenue today"   value={`KSh ${s.revenue_today.toLocaleString()}`} color="green" sub="Collected"   />
          <StatCard label="Pending bills"   value={s.pending_bills}                     color="amber"  sub="Awaiting payment"  onClick={() => router.push('/admin/patients')} />
          <StatCard label="Stock alerts"    value={s.low_stock_alerts}                  color="red"    sub="Low/out of stock"   onClick={() => router.push('/admin/pharmacy-stock')} />
          <StatCard label="Total patients"  value={s.total_patients.toLocaleString()}   color="purple" sub="All time"          onClick={() => router.push('/admin/patients')} />
          <StatCard label="Staff"           value={s.staff_count}                       color="slate"  sub="Active accounts"    onClick={() => router.push('/admin/staff')} />
        </div>

        {/* Revenue chart + recent bills */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Revenue — last 7 days</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Total: KSh {rev.reduce((a, b) => a + b.revenue, 0).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => router.push('/admin/reports/monthly')}
                className="text-xs text-blue-600 hover:underline"
              >
                Full report →
              </button>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={rev} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1a6cbf" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#1a6cbf" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}/>
                <Tooltip
                  formatter={(v) => [`KSh ${v.toLocaleString()}`, 'Revenue']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#1a6cbf" strokeWidth={2} fill="url(#rev)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Quick access</h3>
            <div className="space-y-2">
              {[
                { label: 'Patient archive',   sub: 'All completed visits',  href: '/admin/patients',       color: 'bg-blue-50 text-blue-600'   },
                { label: 'Pharmacy stock',    sub: 'Manage medications',     href: '/admin/pharmacy-stock', color: 'bg-teal-50 text-teal-600'   },
                { label: 'Lab stock',         sub: 'Manage lab supplies',    href: '/admin/lab-stock',      color: 'bg-purple-50 text-purple-600'},
                { label: 'Staff management',  sub: 'Accounts & roles',       href: '/admin/staff',          color: 'bg-slate-50 text-slate-600'  },
                { label: 'Reports',           sub: 'Daily & monthly',        href: '/admin/reports',        color: 'bg-emerald-50 text-emerald-600'},
                { label: 'Settings',          sub: 'Clinic configuration',   href: '/admin/settings',       color: 'bg-amber-50 text-amber-600'  },
              ].map((link) => (
                <button
                  key={link.href}
                  onClick={() => router.push(link.href)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${link.color}`}>
                    <span className="text-sm">→</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{link.label}</p>
                    <p className="text-[11px] text-slate-400">{link.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent bills + stock alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Recent bills */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Recent bills</h3>
              <button onClick={() => router.push('/admin/patients')} className="text-xs text-blue-600 hover:underline">
                View all
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {bills.map((bill) => (
                <div key={bill.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{bill.patient}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{bill.visit} · {bill.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-800">KSh {bill.amount.toLocaleString()}</p>
                    <span className={`text-[11px] font-medium ${bill.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {bill.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stock alerts */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Stock alerts
                <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {alerts.length}
                </span>
              </h3>
              <div className="flex gap-2">
                <button onClick={() => router.push('/admin/pharmacy-stock')} className="text-xs text-blue-600 hover:underline">Pharmacy</button>
                <span className="text-xs text-slate-300">·</span>
                <button onClick={() => router.push('/admin/lab-stock')} className="text-xs text-blue-600 hover:underline">Lab</button>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {alerts.map((a, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.item}</p>
                    <span className={`text-[11px] font-medium capitalize ${a.type === 'pharmacy' ? 'text-teal-600' : 'text-purple-600'}`}>
                      {a.type}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{a.qty} left</p>
                    <p className="text-[11px] text-slate-400">Reorder at {a.reorder}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
  )
}