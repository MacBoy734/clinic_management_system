'use client'

import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

const ROLE_LABELS = {
  receptionist: 'Receptionist',
  doctor:       'Consultant',
  lab_tech:     'Lab Technician',
  pharmacist:   'Pharmacist',
  owner:        'Administrator',
}

const ROLE_HOMES = {
  receptionist: '/reception',
  doctor:       '/doctor',
  lab_tech:     '/lab',
  pharmacist:   '/pharmacy',
  owner:        '/admin',
}

export default function UnauthorizedPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const roleLabel = user ? (ROLE_LABELS[user.role] ?? user.role) : null
  const homeRoute = user ? (ROLE_HOMES[user.role] ?? '/') : '/'

  const handleGoHome = () => router.push(homeRoute)

  const handleSwitchAccount = () => {
    logout()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Big background numeral */}
      <span
        aria-hidden="true"
        className="absolute select-none font-black leading-none text-[clamp(20rem,50vw,38rem)] text-[#1a6cbf]/9 dark:text-[#1a6cbf]/16 tracking-tighter"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        403
      </span>

      <div className="w-full max-w-75 max-h-56 relative z-10">

        {/* Card */}
        <div className="bg-white/90 dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl border border-gray-200/80 dark:border-gray-700/60 shadow-lg shadow-black/5 overflow-hidden">

          {/* Top accent strip */}
          <div className="h-1 bg-[#1a6cbf]" />

          <div className="px-5 pt-5 pb-5">

            {/* Icon */}
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-700/40 flex items-center justify-center mb-3.5">
              <svg className="w-4 h-4 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v2" />
              </svg>
            </div>

            {/* Copy */}
            <h1 className="text-[14px] font-bold text-gray-900 dark:text-gray-100 leading-snug">
              This page isn&apos;t part of your role
            </h1>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {roleLabel
                ? <>You&apos;re signed in as <span className="font-semibold text-gray-700 dark:text-gray-300">{roleLabel}</span>, and this area belongs to a different part of the system.</>
                : 'You need to sign in to view this page.'
              }
            </p>

            {/* Divider */}
            <div className="h-px bg-gray-100 dark:bg-gray-700/60 my-4" />

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {user ? (
                <>
                  <button
                    onClick={handleGoHome}
                    className="w-full h-9 rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white text-[12px] font-semibold transition-colors active:scale-[0.98]"
                  >
                    Take me to my dashboard
                  </button>
                  <button
                    onClick={handleSwitchAccount}
                    className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-600 text-[12px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    Sign in as someone else
                  </button>
                </>
              ) : (
                <button
                  onClick={() => router.push('/')}
                  className="w-full h-9 rounded-lg bg-[#1a6cbf] hover:bg-[#155fa0] text-white text-[12px] font-semibold transition-colors active:scale-[0.98]"
                >
                  Go to sign in
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}