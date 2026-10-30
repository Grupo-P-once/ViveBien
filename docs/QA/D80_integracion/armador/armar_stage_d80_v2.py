"""
Staging FAIL-CLOSED para D-80 (correo con Resend, APAGADO por defecto) sobre D-75 + D-76 (producción HOY: dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z).
NO despliega, NO promueve, NO aplica migraciones, NO toca Vercel/Supabase/Resend/DNS (sólo GET a la API de Vercel para comprobar producción).

Base  = vivebien-deploy-stage-d75-final: se comprueba su manifiesto y su payload por SHA-256 (aprobados en D-77/D-78), cada archivo por sha1
        y el árbol REAL del deployment de producción (382 archivos).
Trabajo = vivebien-candidato-d80 (sólo se LEE).
Encima de la base van ÚNICAMENTE los archivos de D-80 de una lista CERRADA (9 modificados, 34 nuevos). Cualquier otra diferencia ABORTA antes de
escribir nada. `vercel.json` entra por una regla propia y estrecha: el único cambio admitido es añadir el cron `/api/correo/tarea` (`0 16 * * *`).

Uso:   python armar_stage_d80.py                (validación en seco: no escribe el stage)
       python armar_stage_d80.py --ejecutar     (arma `C:\\Users\\jemil\\vivebien-deploy-stage-d80-final`; carpeta NUEVA, nunca la base)
Recuperación y rollback: ver RECUPERACION_D80.md (misma carpeta).
"""
import hashlib
import json
import os
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import armar_stage as ar  # noqa: E402
import clasificar_stage as cl  # noqa: E402

BASE = r'C:\Users\jemil\vivebien-deploy-stage-d75-final'
TRABAJO = r'C:\Users\jemil\vivebien-integracion-d78'   # worktree de integración, rama integracion/d80-correo (SOLO LECTURA)
STAGE = r'C:\Users\jemil\vivebien-deploy-stage-d80-modo-pruebas'
ACTUAL = 'dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z'              # producción HOY (D-75 + D-76, promovido en D-78)
MANIFIESTO_BASE = '0282b61ae188808172e6c2e341bbf3d5333082e87d8e4189c8b85eac7bb1dc6d'
PAYLOAD_BASE = 'fc8156d9c0aa1e945e58003ab0f0c5dda3769bd434dcadd17751ebb5aa815674'
ARCHIVOS_BASE = ('stage_manifest_d75.json', 'payload_esperado_d75.json')
GENERADOS = ('node_modules', '.next', '.git', 'test-results', 'playwright-report', '.vercel')

CRON_NUEVO = {'path': '/api/correo/tarea', 'schedule': '0 16 * * *'}

ESPERADOS_MOD = {
    'next.config.ts', 'vercel.json',
    'src/app/api/registro-lead/route.ts', 'src/app/api/usuarios/me/route.ts',
    'src/components/Footer.tsx', 'src/components/QuieroPublicar.tsx', 'src/components/portal/ConfiguracionPortal.tsx',
    'src/lib/limites.ts', 'tests/e39-guardias.test.ts',
    # modo de pruebas (commit a6ebdb6): emisores anteriores a D-80 que ahora pasan por lib/correo/resend.ts y el emulador de Firebase
    'src/lib/aviso-lead.ts', 'src/lib/citas/enviar.ts', 'src/lib/invitacion-correo.ts', 'src/lib/firebase.ts',
}
ESPERADOS_NUEVOS = {
    'src/app/api/correo/baja/route.ts', 'src/app/api/correo/confirmar/route.ts', 'src/app/api/correo/preferencias/route.ts',
    'src/app/api/correo/suscribir/route.ts', 'src/app/api/correo/tarea/route.ts', 'src/app/api/correo/webhook/route.ts',
    'src/app/correo/baja/page.tsx', 'src/app/correo/confirmar/page.tsx', 'src/app/recomendaciones/page.tsx',
    'src/components/correo/AccionConEnlace.tsx', 'src/components/correo/FormularioRecomendaciones.tsx', 'src/components/correo/PreferenciaCorreo.tsx',
    'src/lib/correo/config.ts', 'src/lib/correo/constantes.ts', 'src/lib/correo/enviar.ts',
    'src/lib/correo/plantillas/bloques.ts', 'src/lib/correo/plantillas/campana.ts', 'src/lib/correo/plantillas/index.ts',
    'src/lib/correo/plantillas/marca.ts', 'src/lib/correo/plantillas/portal.ts',
    'src/lib/correo/recomendaciones.ts', 'src/lib/correo/seguridad.ts', 'src/lib/correo/suscripcion.ts', 'src/lib/correo/tarea.ts',
    'src/lib/correo/transaccionales.ts',
    'tests/correo-enviar.test.ts', 'tests/correo-filtros.test.ts', 'tests/correo-guardias.test.ts', 'tests/correo-integracion.test.ts',
    'tests/correo-plantillas.test.ts', 'tests/correo-portal-datos.test.ts', 'tests/correo-seguridad.test.ts',
    'tests/migracion-36-correo.test.ts', 'tests/migracion-37-ayuda-correo.test.ts',
    'src/lib/correo/resend.ts', 'tests/correo-modo-pruebas.test.ts', 'tests/correo-modo-pruebas-emisores.test.ts', 'tests/firebase-emulador-correos.test.ts',
}
# Presentes en el candidato pero que NO forman parte de D-80 ni del stage (D-79, ya aplicada en producción; su prueba vive en el repo).
# Se declaran para que su presencia no sea una sorpresa, pero NUNCA se copian al stage.
CONOCIDOS_FUERA_DEL_STAGE = {'tests/migracion-35-ayuda-guardados.test.ts'}
# Excepciones DEL ESCÁNER de secretos propias de D-80 (clave exacta: archivo, tipo, línea y sha256 de la línea; cada una debe aplicarse UNA vez).
# Si la línea cambia, deja de coincidir y vuelve a ser un hallazgo.
EXCEPCIONES_D80 = {
    ('tests/correo-seguridad.test.ts', 'asignacion', 7,
     '038b8bc044dddd3bccd94e004e049aef2e062af723abe4cc624d1afbd16a5f5c'):
        'fixture: constante SECRETO de prueba (`un-secreto-largo-de-prueba-0123456789`) con la que se firman enlaces de ejemplo',
}
# Archivos de la raíz del payload que D-80 NO toca: si cambian respecto a la base, se aborta.
RAIZ_INTOCABLE = ('package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.mjs')


class Rechazo(Exception):
    """El armado se rechaza (fail-closed). Se lanza ANTES de escribir nada en el destino."""


def abortar(msg):
    raise Rechazo(msg)


def norm_nl(b):
    return b.replace(b'\r\n', b'\n')


def sha256_b(b):
    return hashlib.sha256(b).hexdigest()


# ── Regla de alcance (la lista CERRADA de rutas que pueden diferir de la base) ───────────────────────────────────────
def regla_candidato(rel):
    """¿Esta ruta PUEDE ser parte del diff? Sólo src/, next.config.ts, vercel.json (con su regla propia) y tests/*.ts de primer nivel."""
    if not isinstance(rel, str) or not ar.ruta_segura(rel):
        return False
    if rel.startswith('src/'):
        return True
    if rel in ('next.config.ts', 'vercel.json'):
        return True
    return rel.startswith('tests/') and rel.endswith('.ts') and rel.count('/') == 1


def validar_vercel_json(base_bytes, trabajo_bytes):
    """Regla EXPLÍCITA de vercel.json: mismas claves y mismos crons de la base, y como ÚNICA novedad el cron de D-80."""
    try:
        b = json.loads(base_bytes.decode('utf-8-sig'))
        t = json.loads(trabajo_bytes.decode('utf-8-sig'))
    except (ValueError, UnicodeDecodeError):
        abortar('vercel.json no es JSON válido.')
    if not isinstance(b, dict) or not isinstance(t, dict):
        abortar('vercel.json debe ser un objeto.')
    if set(b) != set(t):
        abortar(f'vercel.json: cambian las claves de primer nivel ({sorted(set(b) ^ set(t))}).')
    for k in b:
        if k != 'crons' and b[k] != t[k]:
            abortar(f'vercel.json: cambia `{k}` (sólo se admite añadir el cron de D-80).')
    cb, ct = b.get('crons'), t.get('crons')
    if not isinstance(cb, list) or not isinstance(ct, list):
        abortar('vercel.json: `crons` debe ser una lista.')
    if ct != cb + [CRON_NUEVO]:
        abortar('vercel.json: `crons` debe ser exactamente los de la base + el cron de D-80 (`/api/correo/tarea`, `0 16 * * *`) al final.')


# ── Diff contra la base ──────────────────────────────────────────────────────────────────────────────────────────────
def diff_contra_base(trabajo, base, candidato=regla_candidato):
    """(modificados, nuevos) del árbol de trabajo frente a la base, SÓLO dentro de la regla de alcance; compara sin fin de línea."""
    mod, nue = set(), set()
    for r in cl.caminar_local(trabajo):
        if r.split('/')[0] in GENERADOS or not candidato(r):
            continue
        a, b = os.path.join(trabajo, *r.split('/')), os.path.join(base, *r.split('/'))
        if not os.path.isfile(b):
            nue.add(r)
        elif norm_nl(open(a, 'rb').read()) != norm_nl(open(b, 'rb').read()):
            mod.add(r)
    return mod, nue


def exigir_diff_esperado(mod, nue, esp_mod=None, esp_nue=None, conocidos=None):
    esp_mod = ESPERADOS_MOD if esp_mod is None else esp_mod
    esp_nue = ESPERADOS_NUEVOS if esp_nue is None else esp_nue
    conocidos = CONOCIDOS_FUERA_DEL_STAGE if conocidos is None else conocidos
    nue = set(nue) - set(conocidos)                       # lo declarado como «fuera del stage» no cuenta como novedad
    if mod != esp_mod or nue != esp_nue:
        abortar(f'El diff real no es el esperado. Sobran mod {sorted(mod - esp_mod)} nue {sorted(nue - esp_nue)}; '
                f'faltan mod {sorted(esp_mod - mod)} nue {sorted(esp_nue - nue)}')


def exigir_sin_cambios_ajenos(trabajo, base):
    """Cambios en el PAYLOAD fuera de la lista (raíz intocable, public/): se rechazan en vez de ignorarse en silencio."""
    for r in RAIZ_INTOCABLE:
        a, b = os.path.join(trabajo, r), os.path.join(base, r)
        if os.path.isfile(a) != os.path.isfile(b) or (os.path.isfile(a) and norm_nl(open(a, 'rb').read()) != norm_nl(open(b, 'rb').read())):
            abortar(f'Cambio ajeno al payload autorizado: {r}')
    pub = os.path.join(trabajo, 'public')
    if os.path.isdir(pub):
        for r in cl.caminar_local(trabajo):
            if r.startswith('public/'):
                b = os.path.join(base, *r.split('/'))
                if not os.path.isfile(b) or norm_nl(open(os.path.join(trabajo, *r.split('/')), 'rb').read()) != norm_nl(open(b, 'rb').read()):
                    abortar(f'Cambio ajeno al payload autorizado: {r}')


def exigir_vercel_json(trabajo, base):
    validar_vercel_json(open(os.path.join(base, 'vercel.json'), 'rb').read(), open(os.path.join(trabajo, 'vercel.json'), 'rb').read())


# ── Base aprobada ────────────────────────────────────────────────────────────────────────────────────────────────────
def verificar_base(base, manifiesto_bytes, payload_bytes, arbol_prod, manifiesto_sha=MANIFIESTO_BASE, payload_sha=PAYLOAD_BASE):
    """Manifiesto y payload por SHA-256; cada archivo de la base por sha1; payload == árbol real de producción."""
    if sha256_b(manifiesto_bytes) != manifiesto_sha or sha256_b(payload_bytes) != payload_sha:
        abortar('El manifiesto o el payload base no son los aprobados.')
    manifiesto, payload = json.loads(manifiesto_bytes), json.loads(payload_bytes)
    for r, h in manifiesto.items():
        p = os.path.join(base, *r.split('/'))
        if not os.path.isfile(p) or cl.sha1(open(p, 'rb').read()) != h:
            abortar(f'El staging base cambió: {r}')
    if set(arbol_prod) != set(payload) or any(arbol_prod[r] != payload[r] for r in payload):
        abortar('El árbol REAL de producción no coincide con el payload base.')
    return manifiesto, payload


def huella(raiz):
    """Huella barata de una carpeta (ruta, tamaño, mtime): para probar que el armado NO la tocó."""
    h = hashlib.sha256()
    for r in cl.caminar_local(raiz):
        if r.split('/')[0] in GENERADOS:
            continue
        s = os.stat(os.path.join(raiz, *r.split('/')))
        h.update(f'{r}|{s.st_size}|{s.st_mtime_ns}\n'.encode())
    return h.hexdigest()


def exigir_destino(stage, prohibidos):
    for p in prohibidos:
        if ar.norm(stage) == ar.norm(p) or ar.norm(stage).startswith(ar.norm(p) + os.sep) or ar.norm(p).startswith(ar.norm(stage) + os.sep):
            abortar(f'El destino coincide con (o contiene / está dentro de) {p}.')
    if os.path.lexists(stage) and os.listdir(stage):
        m = os.path.join(stage, ar.MARCA)
        if not (os.path.isfile(m) and open(m).read() == ar.TEXTO_MARCA):
            abortar('El destino existe, no está vacío y su marca falta: no se borra.')
        if ar.sin_enlaces(stage):
            abortar('El destino contiene enlaces: no se borra.')


def exigir_payload_dentro_de_cambios(payload_nuevo, payload_base, cambios):
    pm = sorted(r for r in payload_nuevo if r in payload_base and payload_nuevo[r] != payload_base[r])
    pn = sorted(r for r in payload_nuevo if r not in payload_base)
    pq = sorted(r for r in payload_base if r not in payload_nuevo)
    if pq or [r for r in pm + pn if r not in cambios]:
        abortar('El payload quita archivos o cambia archivos fuera de la lista autorizada.')
    return pm, pn


def escanear_stage(raiz, extra=None):
    """Escáner de secretos del armador base + las excepciones EXACTAS de D-80. Restaura las excepciones originales al terminar."""
    extra = EXCEPCIONES_D80 if extra is None else extra
    original = dict(ar.EXCEPCIONES)
    try:
        ar.EXCEPCIONES.update(extra)
        return ar.escanear(raiz)
    finally:
        ar.EXCEPCIONES.clear()
        ar.EXCEPCIONES.update(original)


def respaldar_base():
    """Copia VERIFICADA (sha256) del manifiesto y el payload aprobados de la base. No se sobrescribe: si ya existe, debe ser idéntica."""
    d = os.path.join(AQUI, 'respaldo_base_d75')
    os.makedirs(d, exist_ok=True)
    for f in ARCHIVOS_BASE:
        origen, destino = os.path.join(AQUI, f), os.path.join(d, f)
        if os.path.exists(destino):
            if ar.sha256_archivo(destino) != ar.sha256_archivo(origen):
                abortar(f'El respaldo {destino} difiere del original: no se sobrescribe.')
        else:
            shutil.copy2(origen, destino)
        if ar.sha256_archivo(destino) != ar.sha256_archivo(origen):
            abortar(f'No se pudo verificar el respaldo de {f}.')
    return d


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    ejecutar = '--ejecutar' in argv
    exigir_destino(STAGE, (BASE, TRABAJO, ar.RAIZ))
    respaldo = respaldar_base()
    print('respaldo verificado de la base aprobada en', respaldo)

    for dom in ('vivebienn.com', 'www.vivebienn.com'):
        a = ar.vercel_api(f'/v4/aliases/{dom}?teamId={ar.TEAM}')
        if not isinstance(a, dict) or a.get('deploymentId') != ACTUAL:
            abortar(f'{dom} no apunta a {ACTUAL}: producción cambió.')
    p = ar.vercel_api(f'/v9/projects/{ar.PROYECTO}?teamId={ar.TEAM}')
    t = ((p.get('targets') or {}).get('production') or {}) if isinstance(p, dict) else {}
    if t.get('id') != ACTUAL or t.get('readySubstate') != 'PROMOTED':
        abortar(f'El deployment de producción es {t.get("id")} ({t.get("readySubstate")}), no {ACTUAL}.')
    arbol_prod = cl.arbol_a_mapa(ar.vercel_api(f'/v6/deployments/{ACTUAL}/files?teamId={ar.TEAM}'))
    print('producción vigente:', ACTUAL, '(PROMOTED) · archivos fuente:', len(arbol_prod))

    huella_base, huella_trabajo = huella(BASE), huella(TRABAJO)
    mp, pp = (open(os.path.join(AQUI, f), 'rb').read() for f in ARCHIVOS_BASE)
    manifiesto, payload_base = verificar_base(BASE, mp, pp, arbol_prod)
    print(f'base verificada: manifiesto {MANIFIESTO_BASE[:8]} ({len(manifiesto)}) · payload {PAYLOAD_BASE[:8]} == árbol real ({len(payload_base)}/{len(payload_base)})')

    mod, nue = diff_contra_base(TRABAJO, BASE)
    print('modificados:', sorted(mod))
    print('nuevos:', len(nue), '(incluye los declarados fuera del stage:', sorted(nue & CONOCIDOS_FUERA_DEL_STAGE), ')')
    exigir_diff_esperado(mod, nue)
    exigir_sin_cambios_ajenos(TRABAJO, BASE)
    exigir_vercel_json(TRABAJO, BASE)
    cambios = sorted(mod | (nue - CONOCIDOS_FUERA_DEL_STAGE))
    for r in cambios:
        if not ar.ruta_segura(r):
            abortar(f'Ruta no segura: {r}')
    print(f'diff validado: {len(mod)} modificados + {len(nue - CONOCIDOS_FUERA_DEL_STAGE)} nuevos = {len(cambios)} cambios')

    if not ejecutar:
        print('\n(validación en seco: NO se escribió el stage; use --ejecutar para armarlo)')
        return 0

    # ── destino (carpeta NUEVA; nunca la base ni el trabajo) ──
    if os.path.exists(STAGE) and os.listdir(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE, exist_ok=True)
    open(os.path.join(STAGE, ar.MARCA), 'w').write(ar.TEXTO_MARCA)
    for r, h in manifiesto.items():
        if r == ar.MARCA:
            continue
        if not ar.ruta_segura(r):
            abortar(f'Ruta no segura en el manifiesto: {r}')
        b = open(os.path.join(BASE, *r.split('/')), 'rb').read()
        if cl.sha1(b) != h:
            abortar(f'{r} cambió mientras se copiaba.')
        d = os.path.join(STAGE, *r.split('/'))
        os.makedirs(os.path.dirname(d), exist_ok=True)
        open(d, 'wb').write(b)
    for r in cambios:
        d = os.path.join(STAGE, *r.split('/'))
        os.makedirs(os.path.dirname(d), exist_ok=True)
        open(d, 'wb').write(open(os.path.join(TRABAJO, *r.split('/')), 'rb').read())

    hall, _ = escanear_stage(STAGE)
    print('\nESCANEO DE SECRETOS:', 'LIMPIO' if not hall else f'{len(hall)} hallazgos')
    for h in hall:
        print('  HALLAZGO:', h)
    if hall:
        abortar('Hay posibles secretos en el staging.')

    nuevo = {}
    for r in cl.caminar_local(STAGE):
        if r != ar.MARCA:
            nuevo[r] = cl.sha1(open(os.path.join(STAGE, *r.split('/')), 'rb').read())
    m_ = sorted(r for r in nuevo if r in manifiesto and nuevo[r] != manifiesto[r])
    n_ = sorted(r for r in nuevo if r not in manifiesto)
    q_ = sorted(r for r in manifiesto if r not in nuevo and r != ar.MARCA)
    print(f'STAGING vs BASE → modificados {len(m_)} | nuevos {len(n_)} | quitados {len(q_)}')
    if m_ != sorted(mod) or n_ != sorted(nue - CONOCIDOS_FUERA_DEL_STAGE) or q_:
        abortar('El staging no es la base + lo autorizado.')

    payload_nuevo = {r: h for r, h in sorted(nuevo.items()) if ar.en_payload(r)}
    pm, pn = exigir_payload_dentro_de_cambios(payload_nuevo, payload_base, cambios)
    json.dump(nuevo, open(os.path.join(AQUI, 'stage_manifest_d80v2.json'), 'w'), indent=0)
    json.dump(payload_nuevo, open(os.path.join(AQUI, 'payload_esperado_d80v2.json'), 'w'), indent=0)
    json.dump({'modificados': pm, 'nuevos': pn, 'solo_staging': [r for r in cambios if not ar.en_payload(r)]}, open(os.path.join(AQUI, 'stage_informe_d80v2.json'), 'w'), indent=1)
    print(f'PAYLOAD D-80 vs producción: modificados {len(pm)} | nuevos {len(pn)} | quitados 0 | total {len(payload_nuevo)}')
    for r in pm:
        print('  ~', r)
    for r in pn:
        print('  +', r)

    # la base y el trabajo NO deben haber cambiado durante el armado
    if huella(BASE) != huella_base or huella(TRABAJO) != huella_trabajo:
        abortar('La base o el trabajo cambiaron durante el armado.')
    print('\nAPROBACIÓN (D-80):')
    print('  manifiesto SHA-256', ar.sha256_archivo(os.path.join(AQUI, 'stage_manifest_d80v2.json')))
    print('  payload    SHA-256', ar.sha256_archivo(os.path.join(AQUI, 'payload_esperado_d80v2.json')))
    print('\nstaging listo en', STAGE, '(NO desplegado)')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Rechazo as e:
        print('\nRECHAZADO:', e)
        sys.exit(2)
