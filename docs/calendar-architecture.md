# Calendario visual — arquitectura

> Aprobada el 18-sep-2026; se implementa por fases (ver `appointments-architecture.md` §8). Mockups: `design/references/06-portal-mis-visitas.webp` (cliente) y `07-admin-calendario.webp` (admin).

## 1 · Qué librería

| | FullCalendar 7.1 | react-big-calendar 1.20 | Cal.com |
|---|---|---|---|
| Licencia | MIT (lo que usamos). Las vistas por "recurso" (columnas por asesor) son de pago. | MIT | AGPL / comercial |
| Vistas del mockup: Mes, Semana, Día, Agenda | Sí: `dayGridMonth`, `timeGridWeek`, `timeGridDay`, `listMonth` | Sí | — |
| Zonas horarias por nombre | Sí (usa `temporal-polyfill`) | Con adaptadores (moment / luxon / globalize) | — |
| Peso y dependencias | Paquetes por vista (`@fullcalendar/react`, `daygrid`, `timegrid`, `list`, `interaction`) | Arrastra moment o luxon, lodash y más | Aplicación completa |
| Móvil | Vista lista y día funcionan bien en 390 px | Más trabajo propio | — |
| Uso | **Componente visual** | Alternativa descartada | **Sólo como referencia de ideas** (horarios, márgenes, anticipación mínima, enlaces de reprogramar/cancelar). No se copia código. |

**Decisión: FullCalendar**, versión exacta fijada en `package.json`.

- Sin la barra propia de FullCalendar (`headerToolbar: false`): la barra del mockup (Hoy · ‹ › · "Septiembre 2024" · Mes / Semana / Día / Agenda) es nuestro `CalendarToolbar`, que maneja el calendario por su API.
- Sin las vistas de pago: la vista del admin por asesor se resuelve con el filtro "Todos los asesores" y un color por asesor, no con columnas por recurso.
- Estilos con las variables de la marca (`--marca`, `--marca-tinte`, `--panel-*`) dentro de `.panel-vb`.
- Se carga sólo en las páginas de calendario (`next/dynamic`, sin SSR) para no pesar en el resto del sitio.
- Antes de instalar: un prototipo corto para confirmar que la zona `America/Mexico_City` y el tema funcionan con React 19 / Next 16.

### Interacción (selección, arrastrar y cambiar duración)

FullCalendar trae selección de huecos, arrastrar y soltar y cambiar la duración estirando el evento (plugin `interaction`). Se usan, pero **siempre pasan por las reglas de la cita**: el calendario nunca mueve una visita por su cuenta.

| Gesto | Quién | Qué hace |
|---|---|---|
| Seleccionar un hueco vacío | Asesor, admin | Abre "Registrar visita" con ese día y hora ya puestos |
| Arrastrar una visita a otra hora | Asesor, admin | Abre "Proponer otro horario" con la nueva hora. Al guardar queda **Cambio propuesto** y el cliente tiene que aceptarlo; mientras tanto la visita se ve en su hora original |
| Estirar o encoger una visita | Asesor, admin | Igual que arrastrar: propone el nuevo horario (misma regla) |
| Cualquier gesto sobre una visita pasada, cancelada o ya visitada | Nadie | No se puede arrastrar |
| Cliente | — | No arrastra: usa el botón **Reprogramar**, que le enseña sólo los horarios libres |

Si el horario nuevo choca con otra visita, la base lo rechaza, el evento regresa a su lugar y sale el aviso "Ese horario se acaba de ocupar". En móvil, arrastrar pide mantener pulsado (para no mover nada al hacer scroll).

## 2 · Datos

- El calendario pide `GET /api/citas?desde&hasta&vista=…` con el rango visible (fuente de eventos por función de FullCalendar).
- Al llegar un aviso en tiempo real (o cada 60 s con la pestaña visible), vuelve a pedir **sólo** el rango visible.
- Zona fija `America/Mexico_City` con la etiqueta "hora de León".
- Colores por estado (texto + color, nunca sólo color):

| Estado | Pastilla |
|---|---|
| Confirmada / Reprogramada | verde / azul (`--estado-bien`, `--serie-2`) |
| Por confirmar / Cambio propuesto | ámbar (`--estado-aviso`) |
| Cancelada | gris tachado (sólo si el filtro las incluye) |
| Visitada | gris |
| No asistió | rojo tenue |

## 3 · Componentes

Nombres del encargo, en `src/components/citas/`.

| Componente | Qué es | Dónde |
|---|---|---|
| `CalendarToolbar` | Hoy, anterior/siguiente, título del mes, Mes/Semana/Día/Agenda | Todos |
| `CalendarFilters` | Asesor, tipo de propiedad, estado | Admin (y publicador: estado) |
| `CalendarEvent` | Pastilla dentro de la celda: punto de estado + hora + propiedad | Todos |
| `AppointmentStatus` | Insignia de estado (Confirmada, Por confirmar…) | Todos |
| `AppointmentCard` | Tarjeta de lista: foto, fecha, hora, lugar, estado | "Visitas programadas", "Próximas visitas" |
| `AppointmentDrawer` | Panel lateral (escritorio) / hoja inferior (móvil) con el detalle | Todos |
| `AppointmentDetails` | Contenido del detalle según quién mira | Dentro del drawer y "Detalle de la visita seleccionada" |
| `AppointmentForm` | Agendar: propiedad, día, horario, datos de contacto, consentimiento | Cliente (desde la ficha o "Agendar visita"), admin ("Registrar visita") |
| `AvailabilityPicker` | Días y horarios libres del asesor | Dentro del formulario y de Reprogramar |
| `RescheduleDialog` | Proponer otro horario | Todos |
| `CancelAppointmentDialog` | Cancelar con motivo | Todos |
| `ClientCalendar` | Página "Mis visitas" | `/portal/visitas` |
| `PublisherCalendar` | Visitas a mis propiedades | Según decisión 6 |
| `AdminCalendar` | Página "Calendario de visitas" | `/admin/calendario` |
| `NotificationCenter` | La campana existente, con avisos de citas | Barra superior (admin y portal) |

Se reutiliza lo que ya hay: `TarjetaKpi`, `Encabezado`, `Insignia`, `Confirmar`, `TablaDatos`, `Distribucion` (dona de tipos), `ActividadReciente`, `formato.ts`, `saludo.ts`, `periodo.ts`.

## 4 · Pantallas

### Cliente · "Mis visitas" (mockup 06)

- Encabezado "MIS VISITAS · Tu calendario de visitas" + botón **Agendar visita**.
- 4 tarjetas: Visitas agendadas · Visitada · Por confirmar · Canceladas.
- Calendario (izquierda) + "Visitas programadas" / "Visitas anteriores" (derecha).
- Abajo: detalle de la visita seleccionada (Reprogramar · Cancelar · Ver propiedad), recomendaciones para la visita (texto fijo del mockup) y "¿Necesitas agendar otra visita?" / "Contáctanos".

### Admin · "Calendario de visitas" (mockup 07)

- Un solo elemento nuevo en la barra lateral: **Calendario**. El resto de la barra del mockup (Contactos, Visitas, Leads, Contenido, SEO, Marketing, Configuración) **no se crea**.
- 5 tarjetas: Programadas · Realizadas · Por realizar · Canceladas · Asesores con visitas, con comparación contra el mes anterior bajo las reglas honestas del panel (sin historial no hay porcentaje).
- Calendario + filtros (asesor, tipo) + "Visitas del día" a la derecha + **Registrar visita**.
- Abajo: tabla "Próximas visitas", dona "Tipos de visitas" por tipo de propiedad y "Actividad reciente" de citas (de `citas_eventos`).

## 5 · Tamaños de pantalla

| Ancho | Vista por defecto | Distribución |
|---|---|---|
| ≥ 1280 px (escritorio) | Mes | Calendario + columna lateral |
| 768–1279 px (tableta) | Mes o Semana | Columna lateral pasa abajo; barra lateral en cajón (< 1024) |
| < 768 px (móvil) | **Agenda** (lista) | Una columna; el detalle abre como hoja inferior; filtros en un botón |

- Botones táctiles de al menos 44 px; el selector de horarios en rejilla de 2–3 columnas en móvil.
- Accesibilidad: cada pastilla con texto completo para lector de pantalla ("Confirmada, martes 3 de septiembre 11:00, Nave Industrial San Juan Bosco"); navegación con teclado del calendario; foco visible con el color de marca.
