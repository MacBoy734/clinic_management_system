import AppLayout from '@/components/layout/dashboardLayout'

export default function PharmacyLayout({ children }) {
  return (
    <AppLayout title="Pharmacy" allowedRoles={['pharmacist', 'owner']}>
      {children}
    </AppLayout>
  )
}