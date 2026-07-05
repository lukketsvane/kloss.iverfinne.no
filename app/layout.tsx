import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const DESCRIPTION =
  'Sling the five painted wooden blocks — each with its own power — and knock down the unpainted wooden towers.'

export const metadata: Metadata = {
  metadataBase: new URL('https://kloss.iverfinne.no'),
  title: 'kloss',
  description: DESCRIPTION,
  applicationName: 'kloss',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'kloss' },
  openGraph: {
    type: 'website',
    siteName: 'kloss',
    title: 'kloss',
    description: DESCRIPTION,
    url: 'https://kloss.iverfinne.no',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'kloss',
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} bg-white`}>
      <body className="overflow-hidden bg-white font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
