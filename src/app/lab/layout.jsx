import AppLayout from '@/components/layout/dashboardLayout'

export default function LabLayout({ children }) {
  return (
    <AppLayout title="Laboratory" allowedRoles={['lab_tech', 'owner']}>
      {children}
    </AppLayout>
  )
}