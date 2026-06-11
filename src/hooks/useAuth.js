import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export const useAuth = (allowedRoles) => {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) {
      router.push('/')
      return
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.push('/unauthorized')
    }
  }, [user])

  return user
}