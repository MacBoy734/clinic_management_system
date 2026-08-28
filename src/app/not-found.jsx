'use client'

import { useRouter } from 'next/navigation'

export default function notFoundPage() {
  const router = useRouter()

  const handleGoHome = () => router.back()

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Big background numeral */}
      <span
        aria-hidden="true"
        className="absolute select-none font-black leading-none text-[clamp(20rem,50vw,38rem)] text-[#1a6cbf]/6 dark:text-[#1a6cbf]/10 tracking-tighter"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        404
      </span>

      <div className="w-full max-w-75 max-h-56 relative z-10">

        {/* Card */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm overflow-hidden">

          {/* Top accent strip — same blue used for active nav state */}
          <div className="h-1 bg-[#1a6cbf]" />

          <div className="px-7 pt-8 pb-7">

            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-700/40 flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v2" />
              </svg>
            </div>

            {/* Copy */}
            <h1 className="text-[17px] font-bold text-gray-900 dark:text-gray-100">
              We can help you in many ways but finding this page is not one of them!
            </h1>

            {/* Divider */}
            <div className="h-px bg-gray-100 dark:bg-gray-700/60 my-6" />

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
                <>
                  <button
                    onClick={handleGoHome}
                    className="w-full h-10 rounded-xl bg-[#1a6cbf] hover:bg-[#155fa0] text-white text-[13px] font-semibold transition-colors active:scale-[0.98]"
                  >
                    Go back
                  </button>
                </>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}