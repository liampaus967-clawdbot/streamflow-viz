import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Streamflow Visualization',
  description: 'Real-time stream flow visualization using National Water Model data',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
