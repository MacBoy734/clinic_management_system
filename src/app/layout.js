import './globals.css'

export const metadata = {
  title: 'City Health Clinic',
  description: 'Clinic Management System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

import Providers from './providers'