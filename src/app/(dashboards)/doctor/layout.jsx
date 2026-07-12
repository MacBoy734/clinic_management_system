import AppLayout from '@/components/layout/dashboardLayout'

export default function ConsultationLayout({ children }) {
  return (
    <AppLayout title="Consultation" allowedRoles={['doctor']}>
      {children}
    </AppLayout>
  )
}