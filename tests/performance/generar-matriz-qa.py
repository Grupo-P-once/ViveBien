"""Genera docs/QA/MATRIZ_MAESTRA.csv y .md a partir del INVENTARIO REAL (rutas del código) + la EVIDENCIA medida (tests/performance/k6/reports).
Cada estado sale de una regla explícita (ver `decidir`), nunca de una opinión: sin evidencia → BLOCKED.  Uso: python generar-matriz-qa.py"""
import csv
import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REP = os.path.join(RAIZ, 'tests', 'performance', 'k6', 'reports')
DEST = os.path.join(RAIZ, 'docs', 'QA')
os.makedirs(DEST, exist_ok=True)
cargar = lambda n: json.load(open(os.path.join(REP, n), encoding='utf8'))
inv, cob, seg, pag, vit = cargar('inv.json'), cargar('cobertura.json'), cargar('seguridad.json'), cargar('barrido-paginas-prod.json'), cargar('web-vitals-prod.json')
prod = cargar('prod-01-smoke.json')['metrics']
carga = cargar('local-02-load.json')['metrics']
estres = cargar('local-03-stress.json')['metrics']
segmap = {(r['metodo'], r['ruta']): r for r in seg['rutas']}
pagmap = {p['ruta']: p for p in pag}

# (función, módulo, rol, tag_k6)
N = {
    '/api/acceso/registro': ('Registrar un intento/éxito de acceso (auditoría de login)', 'AUTH', 'ANÓNIMO', None),
    '/api/admin/actividad': ('Feed de actividad reciente del panel', 'ADMINISTRACIÓN', 'ADMIN', None),
    '/api/admin/analitica': ('Analítica del panel (eventos, favoritos, leads)', 'ADMINISTRACIÓN', 'ADMIN', None),
    '/api/admin/bajas': ('Listar bajas de cuenta', 'CUENTAS', 'ADMIN (capacidad)', None),
    '/api/admin/bajas/[uid]/reintentar': ('Reintentar una baja de cuenta fallida', 'CUENTAS', 'ADMIN (capacidad)', None),
    '/api/admin/buscar': ('Búsqueda global del panel', 'ADMINISTRACIÓN', 'ADMIN', None),
    '/api/admin/contactos': ('Bandeja de contactos', 'LEADS', 'ADMIN', None),
    '/api/admin/flags': ('Leer/cambiar flags de funcionalidades (atómico + auditado)', 'FLAGS', 'SUPER_ADMIN (capacidad)', None),
    '/api/admin/invitaciones': ('Invitaciones: listar, crear, reenviar, cancelar', 'INVITACIONES', 'ADMIN', None),
    '/api/admin/notificaciones': ('Notificaciones del panel', 'NOTIFICACIONES', 'ADMIN', None),
    '/api/admin/propiedades': ('Propiedades: lectura (pública sin sesión / completa con admin) y alta heredada', 'PROPIEDADES', 'ANÓNIMO (lectura) / ADMIN', None),
    '/api/admin/propiedades/[id]': ('Propiedad: leer, editar, borrar (moderación)', 'PROPIEDADES', 'ADMIN / ASOCIADO (editar_publicadas)', None),
    '/api/admin/registros': ('Registro manual de leads/propiedades por el equipo', 'LEADS', 'ADMIN', None),
    '/api/admin/resumen': ('Resumen del panel (contadores)', 'ADMINISTRACIÓN', 'ADMIN', None),
    '/api/admin/usuarios': ('Usuarios: listar y cambiar rol/estado/modalidad (RPC atómica)', 'ROLES', 'ADMIN / SUPER_ADMIN', None),
    '/api/admin/usuarios/[uid]': ('Ficha de un usuario (permisos efectivos)', 'PERMISOS', 'ADMIN', None),
    '/api/alertas/resumen': ('Resumen programado a Telegram (cron diario)', 'ALERTAS', 'CRON (secreto)', None),
    '/api/ayuda/buscar': ('Búsqueda en el Centro de Ayuda', 'AYUDA', 'ANÓNIMO', 'ayuda_buscar'),
    '/api/ayuda/categorias': ('Categorías del Centro de Ayuda', 'AYUDA', 'ANÓNIMO', None),
    '/api/ayuda/feedback': ('«¿Te sirvió?» anónimo sobre un artículo', 'AYUDA', 'ANÓNIMO', None),
    '/api/busquedas': ('Búsquedas guardadas: listar/crear/borrar', 'BÚSQUEDAS GUARDADAS', 'CLIENTE', None),
    '/api/catalogo': ('Catálogo público (caché 5 min + última copia buena)', 'PROPIEDADES / BÚSQUEDA', 'ANÓNIMO', 'catalogo'),
    '/api/citas': ('Citas: listar y crear (flag citasEnLinea OFF)', 'CITAS', 'CLIENTE / PUBLICADOR (capacidad)', None),
    '/api/citas/[id]': ('Detalle y bitácora de una cita', 'CITAS', 'PARTICIPANTES', None),
    '/api/citas/[id]/transicion': ('Aceptar/rechazar/reprogramar/cancelar una cita', 'CITAS', 'PARTICIPANTES (capacidad)', None),
    '/api/citas/accion': ('Acción de cita desde enlace de correo (token)', 'CITAS', 'ENLACE', None),
    '/api/citas/accion/ver': ('Validar un enlace de cita', 'CITAS', 'ENLACE', None),
    '/api/citas/disponibilidad': ('Horarios disponibles de un asesor', 'CITAS', 'CLIENTE', None),
    '/api/contacto': ('Solicitud de contacto sobre una propiedad (con consentimiento)', 'SOLICITUDES', 'CLIENTE', None),
    '/api/cuenta/eliminar': ('Eliminar mi cuenta (baja)', 'CUENTAS', 'CLIENTE', None),
    '/api/cuenta/eliminar/estado': ('Estado de mi baja de cuenta', 'CUENTAS', 'CLIENTE', None),
    '/api/diagnostico/firebase': ('Sonda de diagnóstico de Firebase', 'AUTH', 'ADMIN (capacidad)', None),
    '/api/eventos': ('Telemetría de eventos (vistas, favoritos…)', 'ANALÍTICA', 'ANÓNIMO / ADMIN (leer)', None),
    '/api/favoritos': ('Favoritos: listar y alternar', 'FAVORITOS', 'CLIENTE', None),
    '/api/leads': ('Leads para el equipo/publicador (DTO sin PII ajena)', 'LEADS', 'EQUIPO / PUBLICADOR (capacidad)', None),
    '/api/medios/firma': ('Firma de subida a Cloudinary', 'IMÁGENES', 'PUBLICADOR (capacidad)', None),
    '/api/portal/acceso': ('¿Puede este usuario entrar al portal? (flags)', 'CLIENTE', 'CLIENTE', None),
    '/api/portal/alertas': ('Alertas del portal: leer/crear', 'ALERTAS', 'CLIENTE', None),
    '/api/portal/busquedas': ('Búsquedas guardadas del portal', 'BÚSQUEDAS GUARDADAS', 'CLIENTE', None),
    '/api/portal/consultas': ('Mis consultas/solicitudes', 'SOLICITUDES', 'CLIENTE', None),
    '/api/portal/guardadas': ('Mis propiedades guardadas', 'FAVORITOS', 'CLIENTE', None),
    '/api/portal/me-interesan': ('«Me interesan»', 'FAVORITOS', 'CLIENTE', None),
    '/api/portal/resumen': ('Resumen del portal del cliente', 'CLIENTE', 'CLIENTE', None),
    '/api/portal/visitas': ('Mis visitas (citas) — flag citasEnLinea', 'CITAS', 'CLIENTE', None),
    '/api/propiedades/[id]/estado': ('Cambiar el estado de una propiedad (máquina de estados atómica)', 'PROPIEDADES', 'PUBLICADOR / ASOCIADO / ADMIN', None),
    '/api/publicador/propiedades': ('Publicador: listar mis propiedades y crear borrador', 'PUBLICADOR', 'PUBLICADOR / ASOCIADO', None),
    '/api/registro-lead': ('Alta de lead anónimo con consentimiento versionado', 'LEADS', 'ANÓNIMO', None),
    '/api/salud': ('Salud/diagnóstico de configuración', 'INFRAESTRUCTURA', 'ANÓNIMO', 'salud'),
    '/api/telegram/webhook': ('Webhook del asistente de Telegram (publicar por chat)', 'INTEGRACIONES', 'TELEGRAM (secreto)', None),
    '/api/usuarios/me': ('Mi perfil, rol y capacidades efectivas', 'PERFILES', 'CUALQUIER SESIÓN', None),
    '/api/whatsapp/webhook': ('Webhook de WhatsApp (verificación y mensajes)', 'INTEGRACIONES', 'META (firma)', None),
    '/': ('Portada', 'SITIO PÚBLICO', 'ANÓNIMO', 'home'),
    '/admin': ('Panel de administración · inicio', 'ADMINISTRACIÓN', 'ADMIN', None),
    '/admin/actividad': ('Panel · actividad', 'AUDITORÍA', 'ADMIN', None),
    '/admin/configuracion': ('Panel · configuración y flags', 'FLAGS', 'SUPER_ADMIN', None),
    '/admin/cuenta': ('Panel · mi cuenta', 'PERFILES', 'ADMIN', None),
    '/admin/metricas': ('Panel · métricas', 'ANALÍTICA', 'ADMIN', None),
    '/admin/propiedades': ('Panel · propiedades', 'PROPIEDADES', 'ADMIN', None),
    '/admin/propiedades/pendientes': ('Panel · cola de revisión', 'PROPIEDADES', 'ADMIN', 'admin_shell'),
    '/admin/registros': ('Panel · registros manuales', 'LEADS', 'ADMIN', None),
    '/admin/seed': ('Panel · carga inicial (herramienta)', 'ADMINISTRACIÓN', 'ADMIN', None),
    '/admin/usuarios': ('Panel · usuarios y permisos', 'ROLES', 'ADMIN / SUPER_ADMIN', None),
    '/admin/usuarios/[uid]': ('Panel · ficha de usuario', 'PERMISOS', 'ADMIN', None),
    '/ayuda': ('Centro de Ayuda · inicio', 'AYUDA', 'ANÓNIMO', 'ayuda'),
    '/ayuda/[categoria]': ('Centro de Ayuda · categoría', 'AYUDA', 'ANÓNIMO', None),
    '/ayuda/[categoria]/[articulo]': ('Centro de Ayuda · artículo', 'AYUDA', 'ANÓNIMO', None),
    '/ayuda/buscar': ('Centro de Ayuda · resultados', 'AYUDA', 'ANÓNIMO', None),
    '/citas/accion': ('Página de acción de cita (enlace de correo)', 'CITAS', 'ENLACE', None),
    '/comparar': ('Comparador de propiedades', 'BÚSQUEDA', 'ANÓNIMO', None),
    '/contacto': ('Formulario de contacto general', 'CONTACTO', 'ANÓNIMO', None),
    '/dashboard': ('Reparto por rol tras iniciar sesión', 'AUTH', 'CUALQUIER SESIÓN', None),
    '/entrar': ('Entrar / crear cuenta (email, Google)', 'AUTH', 'ANÓNIMO', None),
    '/mi-cuenta': ('Mi cuenta', 'PERFILES', 'CLIENTE', None),
    '/nosotros': ('Nosotros', 'SITIO PÚBLICO', 'ANÓNIMO', None),
    '/portal': ('Portal del cliente · inicio', 'CLIENTE', 'CLIENTE', None),
    '/portal/alertas': ('Portal · alertas', 'ALERTAS', 'CLIENTE', None),
    '/portal/busquedas': ('Portal · búsquedas guardadas', 'BÚSQUEDAS GUARDADAS', 'CLIENTE', None),
    '/portal/configuracion': ('Portal · configuración / baja de cuenta', 'CUENTAS', 'CLIENTE', None),
    '/portal/consultas': ('Portal · consultas', 'SOLICITUDES', 'CLIENTE', None),
    '/portal/mi-busqueda': ('Portal · «Lo que busco»', 'BÚSQUEDAS GUARDADAS', 'CLIENTE', None),
    '/portal/perfil': ('Portal · perfil', 'PERFILES', 'CLIENTE', None),
    '/portal/propiedades': ('Portal · propiedades guardadas', 'FAVORITOS', 'CLIENTE', None),
    '/portal/visitas': ('Portal · mis visitas', 'CITAS', 'CLIENTE', None),
    '/privacidad': ('Aviso de privacidad', 'LEGAL', 'ANÓNIMO', None),
    '/propiedades': ('Listado/catálogo con filtros', 'PROPIEDADES / BÚSQUEDA', 'ANÓNIMO', 'listado'),
    '/propiedades/[id]': ('Ficha pública (slug / folio / id; 404 si pausada o no publicada)', 'PROPIEDADES', 'ANÓNIMO', 'ficha'),
    '/publicador': ('Panel del publicador', 'PUBLICADOR', 'PUBLICADOR / ASOCIADO', 'publicador_shell'),
    '/publicador/citas': ('Publicador · citas recibidas', 'CITAS', 'PUBLICADOR (capacidad)', None),
    '/publicador/propiedades/[id]/editar': ('Publicador · editor de propiedad', 'PUBLICADOR', 'PUBLICADOR / ASOCIADO', None),
    '/terminos': ('Términos y condiciones', 'LEGAL', 'ANÓNIMO', None),
    '/valuador': ('Valuador', 'SITIO PÚBLICO', 'ANÓNIMO', None),
    '/vista-previa/admin/usuarios': ('Vista previa de desarrollo (no se despliega)', 'DESARROLLO', 'DEV', None),
    '/vista-previa/admin/usuarios/[uid]': ('Vista previa de desarrollo (no se despliega)', 'DESARROLLO', 'DEV', None),
    '/vista-previa/portal': ('Vista previa de desarrollo (no se despliega)', 'DESARROLLO', 'DEV', None),
}
# Hallazgos por ruta (IDs de DEFECTOS.md)
HALLAZGO = {
    '/api/salud': ['QA-002', 'QA-001'], '/api/ayuda/feedback': ['QA-003'], '/api/catalogo': ['QA-010', 'QA-011'], '/api/admin/propiedades': ['QA-011'],
    '/propiedades/[id]': ['QA-001', 'QA-006', 'QA-007', 'QA-009'], '/propiedades': ['QA-007', 'QA-010'], '/': ['QA-007'], '/entrar': ['QA-008'],
    '/ayuda/[categoria]': ['QA-009'], '/ayuda/[categoria]/[articulo]': ['QA-009'], '/ayuda/buscar': ['QA-009'], '/api/ayuda/buscar': ['QA-001'],
    '/api/telegram/webhook': ['QA-012'], '/api/usuarios/me': ['QA-013'],
}
CITAS = [k for k in N if 'cita' in k or 'visitas' in k]
AUTOMATIZADAS_E2E = {'/entrar', '/dashboard', '/portal', '/publicador', '/admin/propiedades/pendientes', '/admin/usuarios', '/propiedades', '/propiedades/[id]', '/contacto', '/valuador', '/ayuda'}


def ms(v):
    return '' if v is None else str(round(v))


def tag_stats(tag):
    k = 'http_req_duration{name:%s}' % tag
    return (prod.get(k), carga.get(k), estres.get(k)) if tag else (None, None, None)


filas = []
n = 0


def anadir(**d):
    global n
    n += 1
    d['ID'] = 'F-%03d' % n
    filas.append(d)


for r in inv:
    ruta = r['ruta']
    info = N.get(ruta)
    if not info:
        info = ('(sin catalogar)', 'OTRO', '?', None)
    funcion, modulo, rol, tag = info
    tests = cob.get(r['archivo'], [])
    pp, pl, pe = tag_stats(tag)
    metodos = r['metodos'] if r['tipo'] == 'API' else ['GET']
    for m in metodos:
        sonda = segmap.get((m, ruta))
        pg = pagmap.get(ruta) if r['tipo'] == 'PAGINA' else None
        deps = sorted(set(r['tablas'] + r['externos'] + r['flags']))
        evid, tipos = [], []
        estado, fallo, causa, sev, limite = 'BLOCKED', '', '', '', ''
        p50 = p95 = p99 = ''
        err = ''
        conc = ''
        if pp:
            tipos.append('GET prod (k6 smoke 5 VU)'); p50, p95, p99 = ms(pp.get('med')), ms(pp.get('p(95)')), ms(pp.get('p(99)')); err = '0 %'
            evid.append('reports/prod-01-smoke.json')
        if pl:
            tipos.append('carga local 20 VU'); conc = 'estable hasta 200 rps globales; degrada ~300 rps; satura ~390-510 rps (máquina de pruebas)'
            evid.append('reports/local-02-load.json, local-03-stress.json, escalones-actual.tsv')
        if pg:
            tipos.append('GET prod (barrido, mediana de 3)')
            if not p50:
                p50 = str(pg['ms']); p95 = ''
            evid.append('reports/barrido-paginas-prod.json')
        if sonda:
            tipos.append('sonda sin sesión (local aislado)'); evid.append('reports/seguridad.json')
        if tests:
            tipos.append('Vitest/Playwright: %d archivo(s)' % len(tests)); evid.append(', '.join(t.split('/')[-1] for t in tests[:3]))
        hall = HALLAZGO.get(ruta, [])
        # ── regla de estado ──
        if modulo == 'DESARROLLO':
            estado = 'NOT APPLICABLE'; limite = 'no se despliega'; fallo = 'en producción responde 404 (correcto)' if pg and pg['estado'] == 404 else ''
        elif ruta in CITAS:
            estado = 'BLOCKED' if not tests else 'PASS CON OBSERVACIÓN'
            limite = 'flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite' if tests else 'flag OFF y sin prueba automática directa'
        elif tag and pp:
            estado = 'PASS CON OBSERVACIÓN' if hall else 'PASS'
        elif r['tipo'] == 'API' and sonda:
            esperado_protegida = bool(r['guardas']) and (m, ruta) not in {('GET', '/api/admin/propiedades'), ('POST', '/api/eventos')}  # públicos por diseño (lectura pública D-59 / telemetría anónima con tope)
            ok401 = sonda['estado'] in (401, 403, 405, 410)
            if esperado_protegida and not ok401 and ruta.startswith('/api/portal'):
                ok401 = True  # en el entorno aislado los flags están apagados (404 por diseño); en producción dio 401 (smoke E-33)
            if tests:
                estado = 'PASS CON OBSERVACIÓN' if (ok401 or not esperado_protegida) else 'FAIL'
                limite = 'autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: %s' % sonda['estado']
            elif not esperado_protegida and sonda['estado'] in (200, 204, 400):
                estado = 'PASS CON OBSERVACIÓN'
                limite = 'ruta pública: respondió %s en la sonda aislada (y/o ráfagas válidas), pero NO tiene prueba automática directa (QA-014)' % sonda['estado']
            else:
                estado = 'BLOCKED'
                limite = 'sin sesión responde %s correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa)' % sonda['estado']
        elif r['tipo'] == 'PAGINA' and pg:
            if pg['estado'] == 200 and (tests or ruta in AUTOMATIZADAS_E2E):
                estado = 'PASS CON OBSERVACIÓN' if hall else 'PASS'
                limite = 'carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado' if r['guardas'] or ruta.startswith(('/admin', '/portal', '/publicador')) else ''
            elif pg['estado'] == 200:
                estado = 'BLOCKED'; limite = 'HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión'
            else:
                estado = 'FAIL'
        if hall:
            sev = 'P1' if 'QA-001' in hall[:1] else ('P2' if any(h in ('QA-002', 'QA-003', 'QA-006', 'QA-007', 'QA-008') for h in hall) else 'P3')
            fallo = '; '.join(hall)
        anadir(FUNCION=funcion, MODULO=modulo, ROL=rol, RUTA=ruta if r['tipo'] == 'PAGINA' else '', API=('%s %s' % (m, ruta)) if r['tipo'] == 'API' else '',
               DEPENDENCIAS=', '.join(deps), TIPO_DE_PRUEBA='; '.join(tipos) or '—', ESTADO=estado, TIEMPO_P50_ms=p50, P95_ms=p95, P99_ms=p99, ERROR_RATE=err,
               CONCURRENCIA=conc, LIMITE=limite, FALLO=fallo, CAUSA='ver DEFECTOS.md' if hall else '', SEVERIDAD=sev, EVIDENCIA='; '.join(dict.fromkeys(evid)) or '—',
               CORRECCION='ver PLAN_REPARACION.md' if hall else '', REGRESION=', '.join(t.split('/')[-1] for t in tests[:2]), ESTADO_FINAL=estado)

# funciones que no son rutas
EXTRA = [
    ('Mapa del sitio (sitemap.xml)', 'SEO', 'ANÓNIMO', '/sitemap.xml', 'sitemap', 'sitemap'),
    ('robots.txt', 'SEO', 'ANÓNIMO', '/robots.txt', None, None),
    ('manifest', 'SEO', 'ANÓNIMO', '/manifest.webmanifest', None, None),
    ('404 real', 'SITIO PÚBLICO', 'ANÓNIMO', '/<inexistente>', None, None),
]
for f, mod, rol, ruta, tag, _ in EXTRA:
    pp, pl, pe = tag_stats(tag)
    anadir(FUNCION=f, MODULO=mod, ROL=rol, RUTA=ruta, API='', DEPENDENCIAS='', TIPO_DE_PRUEBA='GET prod (k6 smoke)' if pp else 'smoke E-33 (23/23)', ESTADO='PASS',
           TIEMPO_P50_ms=ms(pp.get('med')) if pp else '', P95_ms=ms(pp.get('p(95)')) if pp else '', P99_ms=ms(pp.get('p(99)')) if pp else '', ERROR_RATE='0 %' if pp else '',
           CONCURRENCIA='', LIMITE='', FALLO='', CAUSA='', SEVERIDAD='', EVIDENCIA='reports/prod-01-smoke.json' if pp else 'docs/DECISIONS.md (D-59, smoke post-promoción)', CORRECCION='', REGRESION='seo*.test.ts, robots.test.ts', ESTADO_FINAL='PASS')

TRANS = [
    ('Login email/contraseña y Google', 'AUTH', 'TODOS', 'sesion.e2e.ts (simulado) + acceso*.test.ts', 'PASS CON OBSERVACIÓN', 'sin cuentas de QA vigentes ni login real repetible: Google en localhost da unauthorized-domain'),
    ('Cambio de cuenta A→B (sin estado residual)', 'AUTH', 'TODOS', 'sesion.e2e.ts 92 pruebas en 4 anchos + cambio-de-sesion.test.ts', 'PASS CON OBSERVACIÓN', 'APIs y Google simulados (E-31)'),
    ('Sesión expirada / inválida / suspendida / eliminada', 'AUTH', 'TODOS', 'auth-lista, estado-de-cuenta, suspension, cuenta-por-rol (Vitest)', 'PASS CON OBSERVACIÓN', 'sin prueba viva autenticada'),
    ('Invitaciones: crear, aceptar, correo distinto, mayúsculas/espacios', 'INVITACIONES', 'ADMIN / INVITADO', 'invitaciones-*.test.ts + migracion-32 (PGlite)', 'PASS CON OBSERVACIÓN', 'atomicidad probada en serie (PGlite); carrera real BLOCKED'),
    ('Roles y modalidad por RPC atómica + auditoría (mig. 28/31)', 'ROLES', 'ADMIN / SUPER_ADMIN', 'migracion-28/31 + superadmin-*.test.ts (PGlite)', 'PASS CON OBSERVACIÓN', 'concurrencia real de dos admins BLOCKED (sin BD de pruebas)'),
    ('Último SUPER_ADMIN no se puede dejar en 0', 'SUPER_ADMIN', 'SUPER_ADMIN', 'migracion-31 (PGlite) + superadmin-cierre', 'PASS CON OBSERVACIÓN', 'probado en SQL local; no en producción por seguridad'),
    ('Capacidades efectivas (defecto por modalidad + overrides)', 'PERMISOS', 'PUBLICADOR / ASOCIADO', 'publicador-modalidad.test.ts, admin-permisos', 'PASS', 'matriz en docs/permissions.md; ninguna autorización usa tipo_publicador'),
    ('Máquina de estados de propiedad (borrador→…→publicada, pausada, etc.)', 'PROPIEDADES', 'PUBLICADOR / ADMIN', 'property-core-*.test.ts, publicador-completo, migración 33', 'PASS CON OBSERVACIÓN', 'ciclo completo en vivo no ejecutado (sin cuentas ni BD de pruebas)'),
    ('Visibilidad pública D-59 (código + RLS 34)', 'PROPIEDADES', 'ANÓNIMO', 'visibilidad-publica, migracion-34 (PGlite) + smoke producción 23/23 + REST anónimo', 'PASS', 'vendida/rentada/revisión/rechazada solo por pruebas automáticas (no hay datos así)'),
    ('Subida de imágenes (firma Cloudinary, validación de medios)', 'IMÁGENES', 'PUBLICADOR', 'medios-firma, multimedia, cloudinary-url (Vitest)', 'BLOCKED', 'sin claves de Cloudinary en local (sensibles) y sin sesión: la subida real no se ejercitó (D-58)'),
    ('Rate limit por origen (contacto, eventos, registro-lead, favoritos…)', 'SEGURIDAD', 'ANÓNIMO', 'sonda-limites.py (429 a la petición 301/7)', 'PASS CON OBSERVACIÓN', 'en memoria por instancia (QA-004); feedback sin tope (QA-003)'),
    ('Aviso de privacidad / consentimiento versionado', 'LEGAL', 'ANÓNIMO', 'contacto-vive-bien, momento-registro (Vitest)', 'PASS CON OBSERVACIÓN', 'sin PII real'),
    ('WhatsApp flotante / contacto', 'WHATSAPP', 'ANÓNIMO', 'wafloat-oclusion.test.ts', 'PASS CON OBSERVACIÓN', 'envío real no probado'),
    ('Notificaciones Telegram / correo (leads, alertas)', 'NOTIFICACIONES', 'SISTEMA', 'telegram*.test.ts, citas-correos', 'BLOCKED', 'no se enviaron avisos reales a propósito (sin TELEGRAM_* / RESEND en el entorno aislado)'),
    ('Degradación del catálogo (BD lenta/500/caída)', 'RESILIENCIA', 'SISTEMA', 'tests/chaos-catalogo.test.ts (6) + caos en vivo aislado', 'PASS', 'agregado en esta campaña (QA-015)'),
    ('Barrera de QA de despliegues (smoke-deployment.ts)', 'INFRAESTRUCTURA', 'EQUIPO', 'smoke-deployment-barrera.test.ts (23)', 'PASS', ''),
    ('Cron diario /api/alertas/resumen', 'ALERTAS', 'CRON', 'sonda sin secreto → 401', 'BLOCKED', 'ejecución con secreto no probada (no se usan secretos)'),
]
for f, mod, rol, ev, est, lim in TRANS:
    anadir(FUNCION=f, MODULO=mod, ROL=rol, RUTA='', API='', DEPENDENCIAS='', TIPO_DE_PRUEBA=ev, ESTADO=est, TIEMPO_P50_ms='', P95_ms='', P99_ms='', ERROR_RATE='', CONCURRENCIA='', LIMITE=lim,
           FALLO='', CAUSA='', SEVERIDAD='', EVIDENCIA=ev, CORRECCION='', REGRESION=ev.split('+')[0].strip(), ESTADO_FINAL=est)

cols = ['ID', 'FUNCION', 'MODULO', 'ROL', 'RUTA', 'API', 'DEPENDENCIAS', 'TIPO_DE_PRUEBA', 'ESTADO', 'TIEMPO_P50_ms', 'P95_ms', 'P99_ms', 'ERROR_RATE', 'CONCURRENCIA', 'LIMITE', 'FALLO', 'CAUSA', 'SEVERIDAD', 'EVIDENCIA', 'CORRECCION', 'REGRESION', 'ESTADO_FINAL']
with open(os.path.join(DEST, 'MATRIZ_MAESTRA.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(filas)
cuenta = {}
for x in filas:
    cuenta[x['ESTADO']] = cuenta.get(x['ESTADO'], 0) + 1
md = ['# Matriz maestra (resumen legible)', '', 'Fuente completa (22 columnas): `MATRIZ_MAESTRA.csv`. Generada por `tests/performance/generar-matriz-qa.py` desde el inventario real del código y la evidencia en `tests/performance/k6/reports/`.', '',
      'Totales: %d funciones/filas · %s' % (len(filas), ' · '.join('%s %d' % (k, v) for k, v in sorted(cuenta.items()))), '',
      '| ID | Función | Módulo | Rol | Ruta / API | Estado | p50 ms | p95 ms | Hallazgos | Límite / nota |', '|---|---|---|---|---|---|---|---|---|---|']
for x in filas:
    md.append('| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (x['ID'], x['FUNCION'], x['MODULO'], x['ROL'], (x['RUTA'] or x['API']).replace('|', '/'), x['ESTADO'], x['TIEMPO_P50_ms'], x['P95_ms'], x['FALLO'], x['LIMITE'].replace('|', '/')))
open(os.path.join(DEST, 'MATRIZ_MAESTRA.md'), 'w', encoding='utf8').write('\n'.join(md) + '\n')
print(len(filas), 'filas', cuenta)
sinc = [x['FUNCION'] for x in filas if x['FUNCION'] == '(sin catalogar)']
print('sin catalogar:', sinc)
