import AppLayout from '@/components/layout/dashboardLayout'

export default function ReceptionLayout({ children }) {
  return (
    <AppLayout title="Reception Dashboard" allowedRoles={['receptionist', 'owner']}>
      {children}
    </AppLayout>
  )
}