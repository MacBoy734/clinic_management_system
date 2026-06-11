'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from '@/store/themeStore'
import { Toaster } from 'react-hot-toast'

function ThemeApplier() {
  const dark = useThemeStore((s) => s.dark)

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  return null
}

export default function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeApplier />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            fontSize: '13px',
            borderRadius: '10px',
          },
        }}
      />
      {children}
    </QueryClientProvider>
  )
}