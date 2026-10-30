import { FRASES_MARCA } from '@/lib/admin/panel-config'

export default function PiePanel() {
  return (
    <footer className="mt-10 flex flex-col gap-2 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-semibold text-foreground">Vive Bien</span> Grupo Inmobiliario
        <span aria-hidden className="mx-3 text-border">|</span>
        Panel de administración
      </p>
      <p className="versal !text-[0.62rem] !tracking-[.28em]">{FRASES_MARCA.valores}</p>
    </footer>
  )
}
