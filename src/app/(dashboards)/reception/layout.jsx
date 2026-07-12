import AppLayout from '@/components/layout/dashboardLayout'

export default function ReceptionLayout({ children }) {
    const NAV = [
    { href: '/reception', label: 'Queue', icon: '⊞' },
    { href: '/reception/expenses', label: 'Expenses', icon: '👥' }
  ]
  return (
    <AppLayout title="Reception Dashboard" allowedRoles={['receptionist']} navItems={NAV}>
      {children}
    </AppLayout>
  )
}