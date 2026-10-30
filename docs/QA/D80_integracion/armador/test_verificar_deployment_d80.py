"""
Pruebas del verificador de deployment D-80. TODAS las respuestas de la API de Vercel están SIMULADAS (mocks):
NO validan un deployment real; sólo demuestran que la compuerta acepta lo correcto y rechaza lo incorrecto. Sin red.
El «árbol» simulado se construye con el `payload_esperado_d80.json` real (407 archivos), por eso lo positivo es realista.

    python -m unittest test_verificar_deployment_d80 -v
"""
import copy
import json
import os
import shutil
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import verificar_deployment_d80 as v  # noqa: E402
import armar_stage as ar  # noqa: E402

NUEVO = 'dpl_STAGEDd80Ejemplo123'
PAYLOAD = json.load(open(os.path.join(AQUI, 'payload_esperado_d80.json'), encoding='utf-8'))
MANIFIESTO_SHA, PAYLOAD_SHA = v.MANIFIESTO_D80, v.PAYLOAD_D80
CREADO = 4_000_000_000_000  # muy posterior al manifiesto


def arbol_de(payload, extra=None, tolerados=('.vercelignore',), envolturas=('src',)):
    """Árbol con el formato de /v6/deployments/<id>/files a partir de {ruta: sha1} (SIMULADO)."""
    todo = dict(payload)
    for t in tolerados:
        todo[t] = 'a' * 40
    todo.update(extra or {})
    raiz = {}
    for ruta, uid in todo.items():
        nodo = raiz
        partes = ruta.split('/')
        for p in partes[:-1]:
            nodo = nodo.setdefault(p, {})
        nodo[partes[-1]] = uid

    def convertir(d):
        return [({'name': k, 'type': 'directory', 'children': convertir(x)} if isinstance(x, dict) else {'name': k, 'type': 'file', 'uid': x}) for k, x in sorted(d.items())]
    src = {'name': 'src', 'type': 'directory', 'children': convertir(raiz)}
    return [src] + [{'name': e, 'type': 'directory', 'children': []} for e in envolturas if e != 'src']


def deployment_ok(**cambios):
    d = {'id': NUEVO, 'projectId': ar.PROYECTO, 'ownerId': ar.TEAM, 'target': 'production', 'readyState': 'READY', 'readySubstate': 'STAGED', 'alias': [], 'createdAt': CREADO}
    d.update(cambios)
    return d


_DEF = object()


class ApiFalsa:
    """Mock de la API (SIMULADO). Cada escenario puede cambiar una pieza."""

    def __init__(self, deployment=_DEF, arbol=_DEF, alias_actual=v.ACTUAL, proyecto_id=v.ACTUAL, proyecto_sub='PROMOTED', falla_en=None):
        self.deployment = deployment_ok() if deployment is _DEF else deployment
        self.arbol = arbol_de(PAYLOAD) if arbol is _DEF else arbol
        self.alias_actual, self.proyecto_id, self.proyecto_sub, self.falla_en = alias_actual, proyecto_id, proyecto_sub, falla_en
        self.llamadas = []

    def __call__(self, ruta):
        self.llamadas.append(ruta)
        if self.falla_en and self.falla_en in ruta:
            raise RuntimeError('503 simulado')
        if '/v4/aliases/' in ruta:
            return {'deploymentId': self.alias_actual}
        if '/v9/projects/' in ruta:
            return {'targets': {'production': {'id': self.proyecto_id, 'readySubstate': self.proyecto_sub}}}
        if '/v13/deployments/' in ruta:
            return self.deployment
        if '/files' in ruta:
            return self.arbol
        raise AssertionError('ruta no prevista: ' + ruta)


def correr(api, nuevo=NUEVO, msha=MANIFIESTO_SHA, psha=PAYLOAD_SHA, aqui=AQUI):
    return v.verificar(nuevo, msha, psha, api=api, aqui=aqui, mtime_ms=1000)


class TestPositivo(unittest.TestCase):
    def test_deployment_correcto_simulado(self):
        r = correr(ApiFalsa())
        self.assertEqual(r['archivos_fuente'], 407)
        self.assertEqual(r['esperados'], 407)

    def test_tolera_solo_vercelignore(self):
        correr(ApiFalsa(arbol=arbol_de(PAYLOAD, tolerados=('.vercelignore',))))
        correr(ApiFalsa(arbol=arbol_de(PAYLOAD, tolerados=())))

    def test_acepta_envoltura_out_vacia(self):
        correr(ApiFalsa(arbol=arbol_de(PAYLOAD, envolturas=('src', 'out'))))

    def test_createdAt_con_la_clave_antigua_created(self):
        d = deployment_ok()
        del d['createdAt']
        d['created'] = CREADO
        correr(ApiFalsa(deployment=d))

    def test_equipo_por_cualquiera_de_las_tres_claves(self):
        for clave in ('ownerId', 'teamId'):
            d = deployment_ok()
            del d['ownerId']
            d[clave] = ar.TEAM
            correr(ApiFalsa(deployment=d))
        d = deployment_ok()
        del d['ownerId']
        d['team'] = {'id': ar.TEAM}
        correr(ApiFalsa(deployment=d))


class TestRechazaElId(unittest.TestCase):
    def test_RECHAZA_la_produccion_actual_sin_llamar_a_la_api(self):
        api = ApiFalsa()
        with self.assertRaises(v.Rechazo):
            correr(api, nuevo=v.ACTUAL)
        self.assertEqual(api.llamadas, [], 'ni siquiera debe consultar la API')

    def test_RECHAZA_producciones_anteriores(self):
        for dpl in v.PRODUCCIONES_ANTERIORES:
            with self.assertRaises(v.Rechazo):
                correr(ApiFalsa(), nuevo=dpl)

    def test_RECHAZA_ids_con_formato_invalido_o_inyeccion(self):
        for malo in ('', 'dpl_', 'dpl_x y', 'dpl_x;rm -rf', 'dpl_../x', 'dep_abc', 'DPL_abc', 'dpl_a/b', 'dpl_a?teamId=otro', None, 123):
            with self.assertRaises(v.Rechazo, msg=repr(malo)):
                correr(ApiFalsa(), nuevo=malo)

    def test_RECHAZA_si_la_api_contesta_otro_deployment(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(deployment=deployment_ok(id='dpl_otroDistinto999')))

    def test_RECHAZA_si_la_api_dice_que_es_la_produccion_actual(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(deployment=deployment_ok(id=v.ACTUAL, uid=NUEVO)))


class TestRechazaLosHashes(unittest.TestCase):
    def test_RECHAZA_hash_de_manifiesto_distinto(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(), msha='0' * 64)

    def test_RECHAZA_hash_de_payload_distinto(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(), psha='1' * 64)

    def test_RECHAZA_hashes_con_formato_invalido(self):
        for malo in ('', 'xyz', MANIFIESTO_SHA.upper(), MANIFIESTO_SHA[:-1], None, 5):
            with self.assertRaises(v.Rechazo, msg=repr(malo)):
                correr(ApiFalsa(), msha=malo)

    def test_RECHAZA_hashes_intercambiados(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(), msha=PAYLOAD_SHA, psha=MANIFIESTO_SHA)

    def test_RECHAZA_si_los_archivos_de_referencia_fueron_alterados(self):
        tmp = tempfile.mkdtemp(prefix='verif_d80_')
        try:
            for f in v.ARCHIVOS:
                shutil.copy(os.path.join(AQUI, f), tmp)
            with open(os.path.join(tmp, v.ARCHIVOS[1]), 'a', encoding='utf-8') as f:
                f.write('\n')
            with self.assertRaises(v.Rechazo):
                correr(ApiFalsa(), aqui=tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_RECHAZA_si_falta_un_archivo_de_referencia(self):
        tmp = tempfile.mkdtemp(prefix='verif_d80_')
        try:
            shutil.copy(os.path.join(AQUI, v.ARCHIVOS[0]), tmp)
            with self.assertRaises((v.Rechazo, FileNotFoundError, OSError)):
                correr(ApiFalsa(), aqui=tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class TestRechazaProduccionCambiada(unittest.TestCase):
    def test_RECHAZA_si_el_alias_ya_no_apunta_a_la_produccion_esperada(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(alias_actual='dpl_otraProduccion1'))

    def test_RECHAZA_si_el_alias_apunta_al_deployment_a_verificar(self):
        """Ya fue promovido (o alguien lo asignó): no es un candidato sin promover."""
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(alias_actual=NUEVO))

    def test_RECHAZA_si_el_destino_de_produccion_del_proyecto_no_es_el_esperado(self):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(proyecto_id='dpl_otroDestino2'))

    def test_RECHAZA_si_el_destino_de_produccion_no_esta_promovido(self):
        for sub in ('STAGED', 'READY', None):
            with self.assertRaises(v.Rechazo, msg=str(sub)):
                correr(ApiFalsa(proyecto_sub=sub))


class TestRechazaElDeployment(unittest.TestCase):
    def rechaza(self, **cambios):
        with self.assertRaises(v.Rechazo, msg=str(cambios)):
            correr(ApiFalsa(deployment=deployment_ok(**cambios)))

    def test_proyecto_equipo_o_target_distintos(self):
        self.rechaza(projectId='prj_otroProyecto')
        self.rechaza(ownerId='team_otroEquipo')
        self.rechaza(target='preview')
        self.rechaza(target=None)

    def test_estados_que_no_son_ready(self):
        for estado in ('BUILDING', 'QUEUED', 'ERROR', 'CANCELED', 'INITIALIZING', None):
            self.rechaza(readyState=estado)

    def test_no_creado_como_staged(self):
        for sub in ('PROMOTED', 'ROLLING', 'READY', 'PENDING', None):
            self.rechaza(readySubstate=sub)

    def test_con_dominios_propios(self):
        for alias in (['vivebienn.com'], ['www.vivebienn.com'], ['vive-bien.vercel.app'], ['staging.vivebienn.com'], ['x.vercel.app', 'vivebienn.com']):
            self.rechaza(alias=alias)

    def test_la_url_automatica_del_deployment_no_es_dominio_propio(self):
        correr(ApiFalsa(deployment=deployment_ok(alias=['vive-bien-git-x-grupo-p-once.vercel.app'])))

    def test_anterior_al_manifiesto_o_sin_fecha(self):
        self.rechaza(createdAt=10)
        self.rechaza(createdAt=None)
        self.rechaza(createdAt='ayer')
        self.rechaza(createdAt=True)

    def test_respuesta_con_forma_inesperada(self):
        for malo in (None, [], 'texto', 5):
            with self.assertRaises(v.Rechazo, msg=repr(malo)):
                correr(ApiFalsa(deployment=malo))


class TestRechazaElArbol(unittest.TestCase):
    def rechaza(self, arbol):
        with self.assertRaises(v.Rechazo):
            correr(ApiFalsa(arbol=arbol))

    def test_archivo_de_mas(self):
        self.rechaza(arbol_de(PAYLOAD, extra={'src/lib/extra-no-autorizado.ts': 'b' * 40}))

    def test_archivo_de_menos(self):
        p = dict(PAYLOAD)
        del p['src/lib/correo/enviar.ts']
        self.rechaza(arbol_de(p))

    def test_sha1_distinto(self):
        p = dict(PAYLOAD)
        p['src/lib/correo/enviar.ts'] = 'c' * 40
        self.rechaza(arbol_de(p))

    def test_un_cambio_ajeno_a_d80_se_detecta(self):
        p = dict(PAYLOAD)
        p['src/app/page.tsx'] = 'd' * 40
        self.rechaza(arbol_de(p, tolerados=()))

    def test_tolera_solo_vercelignore_no_otros_archivos_de_raiz(self):
        self.rechaza(arbol_de(PAYLOAD, extra={'.env': 'e' * 40}))
        self.rechaza(arbol_de(PAYLOAD, extra={'.vercel/project.json': 'f' * 40}))

    def test_el_arbol_de_la_produccion_actual_no_vale(self):
        """Un deployment que sirva lo MISMO que producción (sin D-80) falla: faltan los 25 archivos nuevos."""
        base = json.load(open(os.path.join(AQUI, 'payload_esperado_d75.json'), encoding='utf-8'))
        self.rechaza(arbol_de(base))

    def test_envolturas_o_tipos_inesperados(self):
        malo = arbol_de(PAYLOAD)
        malo.append({'name': 'raro', 'type': 'directory', 'children': []})
        self.rechaza(malo)
        self.rechaza([])
        self.rechaza('no es lista')
        self.rechaza(None)
        sin_uid = arbol_de(PAYLOAD)
        carpeta = next(n for n in sin_uid[0]['children'] if n['type'] == 'directory')
        carpeta['children'].append({'name': 'sinuid.ts', 'type': 'file'})
        self.rechaza(sin_uid)
        symlink = arbol_de(PAYLOAD)
        symlink[0]['children'].append({'name': 'enlace', 'type': 'symlink', 'uid': 'a' * 40})
        self.rechaza(symlink)

    def test_ruta_repetida(self):
        dup = arbol_de(PAYLOAD)
        dup[0]['children'].append(copy.deepcopy(dup[0]['children'][0]))
        self.rechaza(dup)


class TestFallaCerrada(unittest.TestCase):
    def test_RECHAZA_si_falla_cada_llamada_de_la_api(self):
        for pieza in ('/v4/aliases/', '/v9/projects/', '/v13/deployments/', '/files'):
            with self.assertRaises(v.Rechazo, msg=pieza):
                correr(ApiFalsa(falla_en=pieza))

    def test_se_consulta_la_produccion_ANTES_que_el_deployment(self):
        api = ApiFalsa()
        correr(api)
        orden = [r.split('?')[0] for r in api.llamadas]
        self.assertLess(max(i for i, r in enumerate(orden) if '/v4/aliases/' in r or '/v9/projects/' in r), orden.index('/v13/deployments/' + NUEVO))

    def test_solo_hace_GET_sin_parametros_extra(self):
        api = ApiFalsa()
        correr(api)
        for r in api.llamadas:
            self.assertTrue(r.startswith('/v'), r)
            self.assertIn('teamId=' + ar.TEAM, r)


class TestCLI(unittest.TestCase):
    def test_uso_incorrecto_da_2(self):
        for args in ([], ['dpl_x'], ['dpl_x', '--manifest-sha', 'a'], ['dpl_x', '--payload-sha', 'a', '--manifest-sha', 'b', 'z'], ['dpl_x', '--manifest-sha', 'a', '--otro', 'b']):
            self.assertEqual(v.main(args), 2, args)

    def test_la_produccion_actual_por_CLI_da_2_sin_red(self):
        self.assertEqual(v.main([v.ACTUAL, '--manifest-sha', MANIFIESTO_SHA, '--payload-sha', PAYLOAD_SHA]), 2)


class TestConstantes(unittest.TestCase):
    def test_hashes_documentados_y_archivos(self):
        self.assertEqual(ar.sha256_archivo(os.path.join(AQUI, v.ARCHIVOS[0])), v.MANIFIESTO_D80)
        self.assertEqual(ar.sha256_archivo(os.path.join(AQUI, v.ARCHIVOS[1])), v.PAYLOAD_D80)
        self.assertEqual(len(PAYLOAD), 407)

    def test_la_produccion_esperada_es_d78(self):
        self.assertEqual(v.ACTUAL, 'dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z')
        self.assertNotIn(v.ACTUAL, v.PRODUCCIONES_ANTERIORES)


if __name__ == '__main__':
    unittest.main(verbosity=2)
