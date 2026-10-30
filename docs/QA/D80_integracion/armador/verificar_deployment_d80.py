"""
COMPUERTA OBLIGATORIA entre `vercel deploy --prod --skip-domain` y cualquier promoción de D-80. NO despliega, NO promueve, NO escribe en Vercel:
sólo hace GET a la API (aliases, proyecto, deployment y su árbol real de archivos).

Verifica que el deployment indicado es EL STAGE D-80 y no otra cosa. Rechaza (código de salida 2, `Rechazo`) si:
  1. el id no tiene el formato de un deployment, o es la producción ACTUAL (dpl_99T2…) o una producción anterior conocida;
  2. los hashes pasados (--manifest-sha, --payload-sha) no son los documentados de D-80 o los archivos de referencia fueron alterados;
  3. producción dejó de ser dpl_99T2… (alias de vivebienn.com y www, y destino PROMOTED del proyecto): se verifica ANTES de promover;
  4. la API contesta otro deployment, o de otro proyecto/equipo, o con target distinto de `production`;
  5. no está READY, o no fue creado como STAGED (readySubstate), o ya tiene dominios propios (vivebienn.com, www o vive-bien.vercel.app);
  6. es anterior al manifiesto del stage D-80;
  7. su ÁRBOL REAL no es EXACTAMENTE `payload_esperado_d80.json` (ni un archivo de más, ni de menos, mismo sha1); `.vercelignore` se tolera;
  8. cualquier llamada a la API falla o devuelve algo con forma inesperada (falla cerrada).

Uso:  python verificar_deployment_d80.py dpl_XXXX --manifest-sha <sha256> --payload-sha <sha256>
Lo que NO demuestra: que la app funcione ni que el correo esté apagado en ese deployment (eso lo prueban el gate y las variables de entorno).
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import armar_stage as ar  # noqa: E402
import clasificar_stage as cl  # noqa: E402

ACTUAL = 'dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z'                 # producción HOY (D-75 + D-76, promovido en D-78)
PRODUCCIONES_ANTERIORES = ('dpl_CfwgKgpGRRAniArNXymWBSEWSVXj', 'dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4')
MANIFIESTO_D80 = '4140b01a66c47e8c83e4b6b5de60a64ba6a905586d04c215edc7a858a80d14eb'
PAYLOAD_D80 = '6e64feeca5edcc9b2919a1c3708cfbfcf063e11db9b179399f19211ad5eb56da'
ARCHIVOS = ('stage_manifest_d80.json', 'payload_esperado_d80.json')
TOLERADOS = {'.vercelignore'}
DOMINIOS_PROPIOS = ('vivebienn.com', 'vive-bien.vercel.app')
ID_OK = re.compile(r'^dpl_[A-Za-z0-9]+$')
SHA256_OK = re.compile(r'^[0-9a-f]{64}$')


class Rechazo(Exception):
    """El deployment se rechaza (fail-closed). No se promueve nada."""


def abortar(msg):
    raise Rechazo(msg)


def es_propio(alias):
    return isinstance(alias, str) and any(d in alias for d in DOMINIOS_PROPIOS)


def llamar(api, ruta):
    """GET con falla cerrada: una excepción de la API es un rechazo, no un «seguimos»."""
    try:
        return api(ruta)
    except Rechazo:
        raise
    except Exception as e:  # noqa: BLE001 — cualquier fallo de la API detiene la compuerta
        abortar(f'La API falló en {ruta.split("?")[0]}: {str(e)[:120]}')


def exigir_hashes(manifiesto_sha, payload_sha, aqui=AQUI, archivos=ARCHIVOS, esperados=(MANIFIESTO_D80, PAYLOAD_D80)):
    for sha, archivo, aprobado in zip((manifiesto_sha, payload_sha), archivos, esperados):
        if not isinstance(sha, str) or not SHA256_OK.match(sha):
            abortar(f'El hash pasado para {archivo} no es un sha256.')
        if sha != aprobado:
            abortar(f'El hash pasado para {archivo} no es el documentado de D-80.')
        if ar.sha256_archivo(os.path.join(aqui, archivo)) != aprobado:
            abortar(f'{archivo} no coincide con el hash aprobado: alguien lo cambió.')


def exigir_produccion_vigente(api, actual=ACTUAL):
    for dom in ('vivebienn.com', 'www.vivebienn.com'):
        a = llamar(api, f'/v4/aliases/{dom}?teamId={ar.TEAM}')
        if not isinstance(a, dict) or a.get('deploymentId') != actual:
            abortar(f'{dom} no apunta a {actual}: producción cambió; no se verifica contra otra base.')
    p = llamar(api, f'/v9/projects/{ar.PROYECTO}?teamId={ar.TEAM}')
    t = ((p.get('targets') or {}).get('production') or {}) if isinstance(p, dict) else {}
    if t.get('id') != actual or t.get('readySubstate') != 'PROMOTED':
        abortar(f'El destino de producción del proyecto es {t.get("id")} ({t.get("readySubstate")}), no {actual} PROMOTED.')


def exigir_deployment(d, nuevo, manifiesto_mtime_ms):
    if not isinstance(d, dict):
        abortar('La API devolvió un deployment con forma inesperada.')
    if d.get('id') != nuevo and d.get('uid') != nuevo:
        abortar(f'La API contestó otro deployment ({d.get("id")}) en vez de {nuevo}.')
    if d.get('id') in (ACTUAL, *PRODUCCIONES_ANTERIORES):
        abortar('La API identifica este deployment como una producción conocida.')
    equipo = d.get('ownerId') or (d.get('team') or {}).get('id') or d.get('teamId')
    if d.get('projectId') != ar.PROYECTO or equipo != ar.TEAM or d.get('target') != 'production':
        abortar(f'No es del proyecto/equipo/target esperados: project={d.get("projectId")} team={equipo} target={d.get("target")}')
    if d.get('readyState') != 'READY':
        abortar(f'No está READY: {d.get("readyState")}')
    if d.get('readySubstate') != 'STAGED':
        abortar(f'No fue creado como STAGED (readySubstate={d.get("readySubstate")}): si ya está PROMOTED no es un candidato sin promover.')
    propios = [x for x in (d.get('alias') or []) if es_propio(x)]
    if propios:
        abortar(f'Tiene dominios propios asignados: {propios}')
    creado = d.get('createdAt') if d.get('createdAt') is not None else d.get('created')
    if isinstance(creado, bool) or not isinstance(creado, (int, float)) or creado < manifiesto_mtime_ms:
        abortar('El deployment no es posterior al manifiesto del stage D-80.')


def comparar_arbol(arbol_crudo, payload_esperado):
    try:
        arbol = cl.arbol_a_mapa(arbol_crudo)
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        abortar(f'Árbol del deployment con forma inesperada: {str(e)[:100]}')
    fuente = {r: h for r, h in arbol.items() if r not in TOLERADOS}
    sobran = sorted(set(fuente) - set(payload_esperado))
    faltan = sorted(set(payload_esperado) - set(fuente))
    distintos = sorted(r for r in set(fuente) & set(payload_esperado) if fuente[r] != payload_esperado[r])
    if sobran or faltan or distintos:
        abortar(f'El árbol NO coincide con el payload aprobado: sobran {len(sobran)}, faltan {len(faltan)}, sha1 distinto {len(distintos)} '
                f'(sobran {sobran[:3]}, faltan {faltan[:3]}, distintos {distintos[:3]}).')
    return len(fuente)


def verificar(nuevo, manifiesto_sha, payload_sha, api=ar.vercel_api, aqui=AQUI, mtime_ms=None):
    if not isinstance(nuevo, str) or not ID_OK.match(nuevo):
        abortar('El id del deployment no tiene el formato dpl_XXXX.')
    if nuevo == ACTUAL:
        abortar('El deployment a verificar NO puede ser el de producción actual.')
    if nuevo in PRODUCCIONES_ANTERIORES:
        abortar('El deployment a verificar es una producción anterior conocida.')
    exigir_hashes(manifiesto_sha, payload_sha, aqui)
    exigir_produccion_vigente(api)
    mtime_ms = os.path.getmtime(os.path.join(aqui, ARCHIVOS[0])) * 1000 if mtime_ms is None else mtime_ms
    d = llamar(api, f'/v13/deployments/{nuevo}?teamId={ar.TEAM}')
    exigir_deployment(d, nuevo, mtime_ms)
    payload = json.load(open(os.path.join(aqui, ARCHIVOS[1]), encoding='utf-8'))
    n = comparar_arbol(llamar(api, f'/v6/deployments/{nuevo}/files?teamId={ar.TEAM}'), payload)
    return {'deployment': nuevo, 'archivos_fuente': n, 'esperados': len(payload), 'estado': 'READY/STAGED, sin dominios propios, árbol == payload D-80'}


def main(argv=None):
    a = sys.argv[1:] if argv is None else argv
    if len(a) != 5 or a[1] != '--manifest-sha' or a[3] != '--payload-sha':
        print('Uso: python verificar_deployment_d80.py dpl_X --manifest-sha <sha256> --payload-sha <sha256>')
        return 2
    try:
        r = verificar(a[0], a[2], a[4])
    except Rechazo as e:
        print('\nRECHAZADO:', e, '\nNO PROMOVER.')
        return 2
    print(f'OK: {r["deployment"]}: {r["archivos_fuente"]} archivos fuente = {r["esperados"]} esperados · {r["estado"]}.')
    print('Esta compuerta no promueve nada.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
