import type { Metadata } from 'next'
import AdminShell from '@/components/admin/AdminShell'

// El panel no debe aparecer en buscadores. Tampoco se anuncia en el sitemap.
export const metadata: Metadata = {
  title: 'Panel de administración — Vive Bien',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
