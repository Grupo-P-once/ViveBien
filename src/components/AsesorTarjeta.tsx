'use client'
import { useState } from 'react'
import { inicialesDe, miniaturaDeFoto, type AsesorPublico } from '@/lib/asesor-publico'

/**
 * «Publicado por»: un círculo pequeño y discreto con quién subió el anuncio.
 *
 *  · `asesor` con datos  → foto (o iniciales) y nombre de la persona (el asociado, por sus capacidades `mostrar_*`).
 *  · `asesor === null`   → el perfil de VIVE BIEN (anuncios de admin, Super Admin y publicador).
 *  · `asesor` ausente    → no se sabe (el servidor no pudo calcularlo): NO se pinta nada, antes que atribuir mal.
 *
 * Es solo informativo: no es un enlace ni cambia el contacto, que sigue siendo el de VIVE BIEN. El texto es visible (no hay que adivinar
 * quién es por la foto) y el color cumple contraste AA sobre blanco.
 */
export default function AsesorTarjeta({ asesor }: { asesor?: AsesorPublico | null }) {
  const [fotoRota, setFotoRota] = useState(false)
  if (asesor === undefined) return null

  const esCasa = asesor === null
  const nombre = esCasa ? 'VIVE BIEN' : asesor.nombre
  const foto = !esCasa && asesor.foto && !fotoRota ? miniaturaDeFoto(asesor.foto) : null

  return (
    <div data-asesor={esCasa ? 'vivebien' : 'persona'} title={esCasa ? 'Publicado por VIVE BIEN' : `Publicado por ${nombre}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span aria-hidden="true" style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center',
        background: esCasa ? '#fff' : '#E9EDF2', border: '1px solid #E2E6EB', color: '#5A6472', fontSize: '.6rem', fontWeight: 800,
      }}>
        {esCasa
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src="/icon.png" alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
          : foto
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={foto} alt="" width={22} height={22} loading="lazy" decoding="async" onError={() => setFotoRota(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : inicialesDe(nombre)}
      </span>
      <span style={{ fontSize: '.72rem', color: '#5A6472', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 500 }}>Publicado por </span>{nombre}
      </span>
    </div>
  )
}
