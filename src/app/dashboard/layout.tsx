import type { Metadata } from 'next'

// V-1.1.77 (SEO-01): página privada. `robots.txt` la bloquea, pero eso no
// impide que Google indexe la URL si alguien la enlaza; `noindex` sí.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
