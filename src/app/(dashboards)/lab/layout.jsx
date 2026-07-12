import AppLayout from '@/components/layout/dashboardLayout'

export default function LabLayout({ children }) {
    const NAV = [
    { href: '/lab', label: 'Dashboard', icon: '⊞' },
    { href: '/lab/queue', label: 'Queue', icon: '👥' },
    { href: '/lab/requests', label: 'Requests', icon: '🗄' },
    { href: '/lab/stock', label: 'Stock', icon: '💊' },
  ]
  return (
    <AppLayout title="Laboratory" allowedRoles={['lab_tech']} navItems={NAV}>
      {children}
    </AppLayout>
  )
}