/** Lo mínimo de las notas del contador que necesita también el navegador (temas y límites). Vive aparte para no meter la base de conocimiento completa en el paquete del cliente. */
export const TEMAS_DE_NOTA = Object.freeze({ fiscal: 'Fiscal', contable: 'Contable', pld: 'Prevención de lavado', inmobiliario: 'Inmobiliario', vivebien: 'VIVE BIEN', otro: 'Otro' })
export const LIMITES_DE_NOTA = Object.freeze({ titulo: 120, texto: 1200, vigentes: 30 })
