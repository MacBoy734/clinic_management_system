import AppLayout from '@/components/layout/dashboardLayout'

export default function AdminLayout({ children }) {
  const NAV = [
    { href: '/admin', label: 'Dashboard', icon: '⊞' },
    { href: '/admin/staff', label: 'Staff', icon: '👥' },
    { href: '/admin/patients', label: 'Patient Archive', icon: '🗄' },
    { href: '/admin/pharmacy', label: 'Pharmacy', icon: '💊' },
    { href: '/admin/lab', label: 'Lab', icon: '🔬' },
    { href: '/admin/reports', label: 'Reports', icon: '📊' },
    { href: '/admin/logs', label: 'Logs', icon: '📜' },
    { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
  ]
  return (
    <AppLayout title="Admin Dashboard" allowedRoles={['admin']} navItems={NAV}>
      {children}
    </AppLayout>
  )
}