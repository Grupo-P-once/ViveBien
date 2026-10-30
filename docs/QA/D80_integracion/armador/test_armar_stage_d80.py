"""
Pruebas del armador fail-closed de D-80, EN AISLAMIENTO: carpetas temporales, sin red, sin Vercel, sin tocar la base real.
Cada prueba NEGATIVA demuestra que un caso malo provoca `Rechazo` (el armado no sigue).

    python -m unittest test_armar_stage_d80 -v
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import armar_stage_d80 as d80  # noqa: E402
import armar_stage as ar  # noqa: E402
import clasificar_stage as cl  # noqa: E402

VERCEL_BASE = {'crons': [{'path': '/api/alertas/resumen', 'schedule': '0 15 * * *'}]}
VERCEL_OK = {'crons': [{'path': '/api/alertas/resumen', 'schedule': '0 15 * * *'}, {'path': '/api/correo/tarea', 'schedule': '0 16 * * *'}]}


def escribir(raiz, rel, contenido=b'x\n'):
    p = os.path.join(raiz, *rel.split('/'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(contenido if isinstance(contenido, bytes) else contenido.encode())


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='armador_d80_')
        self.base = os.path.join(self.tmp, 'base')
        self.trab = os.path.join(self.tmp, 'trabajo')
        for r in (self.base, self.trab):
            os.makedirs(r)
            escribir(r, 'src/app/page.tsx', 'export default 1\n')
            escribir(r, 'package.json', '{"name":"x"}\n')
            escribir(r, 'tsconfig.json', '{}\n')
            escribir(r, 'next.config.ts', 'export default {}\n')
            escribir(r, 'vercel.json', json.dumps(VERCEL_BASE))
            escribir(r, 'public/logo.svg', '<svg/>')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestRegla(unittest.TestCase):
    def test_rutas_permitidas(self):
        for r in ('src/lib/correo/enviar.ts', 'next.config.ts', 'vercel.json', 'tests/correo-enviar.test.ts'):
            self.assertTrue(d80.regla_candidato(r), r)

    def test_rutas_NO_permitidas(self):
        for r in ('.env.local', '.env', 'supabase/36-correo-suscripciones.sql', 'docs/QA/D80.md', 'tests/dobles/correo-pglite.ts',
                  'tests-visual/correo.e2e.ts', 'package.json', 'public/x.png', '../fuera.ts', 'src/../../x.ts', '/etc/passwd',
                  'src\\lib\\x.ts', 'C:/x.ts', 'src//x.ts', 'tests/x.js', '.vercelignore', '.vercel/project.json', None, ''):
            self.assertFalse(d80.regla_candidato(r), repr(r))


class TestVercelJson(unittest.TestCase):
    def comprobar(self, trab):
        d80.validar_vercel_json(json.dumps(VERCEL_BASE).encode(), json.dumps(trab).encode())

    def test_ok_solo_el_cron_de_d80(self):
        self.comprobar(VERCEL_OK)

    def test_rechaza_sin_el_cron(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar(VERCEL_BASE)

    def test_rechaza_cron_con_otro_horario(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar({'crons': VERCEL_BASE['crons'] + [{'path': '/api/correo/tarea', 'schedule': '* * * * *'}]})

    def test_rechaza_cron_extra(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar({'crons': VERCEL_OK['crons'] + [{'path': '/api/admin/borrar', 'schedule': '0 1 * * *'}]})

    def test_rechaza_quitar_un_cron_existente(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar({'crons': [CRON for CRON in VERCEL_OK['crons'][1:]]})

    def test_rechaza_cambiar_un_cron_existente(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar({'crons': [{'path': '/api/alertas/resumen', 'schedule': '0 9 * * *'}, d80.CRON_NUEVO]})

    def test_rechaza_clave_nueva(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar({**VERCEL_OK, 'headers': [{'source': '/(.*)', 'headers': []}]})

    def test_rechaza_redirecciones_o_rewrites(self):
        for extra in ({'redirects': []}, {'rewrites': []}, {'functions': {}}):
            with self.assertRaises(d80.Rechazo):
                self.comprobar({**VERCEL_OK, **extra})

    def test_rechaza_json_invalido_o_no_objeto(self):
        for malo in (b'{no es json', b'[]', b'"x"', b''):
            with self.assertRaises(d80.Rechazo):
                d80.validar_vercel_json(json.dumps(VERCEL_BASE).encode(), malo)

    def test_rechaza_crons_que_no_es_lista(self):
        with self.assertRaises(d80.Rechazo):
            self.comprobar({'crons': {'path': 'x'}})


class TestDiff(Base):
    ESP_MOD = {'next.config.ts'}
    ESP_NUE = {'src/lib/correo/enviar.ts'}

    def aplicar_d80(self):
        escribir(self.trab, 'next.config.ts', 'export default { cambio: 1 }\n')
        escribir(self.trab, 'src/lib/correo/enviar.ts', 'export const x = 1\n')

    def comprobar(self):
        mod, nue = d80.diff_contra_base(self.trab, self.base)
        d80.exigir_diff_esperado(mod, nue, self.ESP_MOD, self.ESP_NUE, set())
        d80.exigir_sin_cambios_ajenos(self.trab, self.base)

    def test_ok_el_diff_exacto(self):
        self.aplicar_d80()
        self.comprobar()

    def test_fin_de_linea_distinto_no_cuenta_como_cambio(self):
        self.aplicar_d80()
        escribir(self.base, 'src/app/page.tsx', b'export default 1\r\n')
        self.comprobar()

    def test_RECHAZA_archivo_nuevo_inesperado_en_src(self):
        self.aplicar_d80()
        escribir(self.trab, 'src/lib/extra-no-autorizado.ts', 'export const malo = 1\n')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_RECHAZA_test_nuevo_inesperado(self):
        self.aplicar_d80()
        escribir(self.trab, 'tests/otro.test.ts', 'x\n')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_RECHAZA_modificar_un_archivo_ajeno_a_la_lista(self):
        self.aplicar_d80()
        escribir(self.trab, 'src/app/page.tsx', 'export default 2 // alguien lo cambió\n')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_RECHAZA_si_falta_un_archivo_esperado(self):
        escribir(self.trab, 'next.config.ts', 'export default { cambio: 1 }\n')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_RECHAZA_si_un_modificado_esperado_no_cambio(self):
        escribir(self.trab, 'src/lib/correo/enviar.ts', 'export const x = 1\n')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_RECHAZA_cambio_en_la_raiz_del_payload_fuera_de_la_lista(self):
        for rel, cont in (('package.json', '{"name":"y"}\n'), ('tsconfig.json', '{"a":1}\n'), ('postcss.config.mjs', 'x\n')):
            self.aplicar_d80()
            escribir(self.trab, rel, cont)
            with self.assertRaises(d80.Rechazo, msg=rel):
                self.comprobar()
            shutil.rmtree(self.trab)
            shutil.copytree(self.base, self.trab)

    def test_RECHAZA_cambio_en_public(self):
        self.aplicar_d80()
        escribir(self.trab, 'public/logo.svg', '<svg id="alterado"/>')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_RECHAZA_archivo_nuevo_en_public(self):
        self.aplicar_d80()
        escribir(self.trab, 'public/nuevo.png', b'\x89PNG')
        with self.assertRaises(d80.Rechazo):
            self.comprobar()

    def test_archivos_fuera_del_alcance_no_entran_pero_no_son_cambios_de_payload(self):
        """.env.local, supabase/ y docs/ no son payload ni parte del diff: no se copian (y no rompen el armado)."""
        self.aplicar_d80()
        for rel in ('.env.local', 'supabase/36.sql', 'docs/QA/x.md', 'tests-visual/correo.e2e.ts', 'tests/dobles/x.ts'):
            escribir(self.trab, rel, 'SECRETO=1\n')
        self.comprobar()
        mod, nue = d80.diff_contra_base(self.trab, self.base)
        for rel in ('.env.local', 'supabase/36.sql', 'docs/QA/x.md', 'tests-visual/correo.e2e.ts', 'tests/dobles/x.ts'):
            self.assertNotIn(rel, mod | nue)

    def test_declarar_un_conocido_fuera_del_stage_lo_acepta_pero_no_se_copia(self):
        self.aplicar_d80()
        escribir(self.trab, 'tests/migracion-35-ayuda-guardados.test.ts', 'x\n')
        mod, nue = d80.diff_contra_base(self.trab, self.base)
        d80.exigir_diff_esperado(mod, nue, self.ESP_MOD, self.ESP_NUE, {'tests/migracion-35-ayuda-guardados.test.ts'})
        with self.assertRaises(d80.Rechazo):                 # sin declararlo, SÍ es una sorpresa
            d80.exigir_diff_esperado(mod, nue, self.ESP_MOD, self.ESP_NUE, set())

    def test_RECHAZA_vercel_json_con_cambio_no_autorizado(self):
        self.aplicar_d80()
        escribir(self.trab, 'vercel.json', json.dumps({**VERCEL_OK, 'headers': []}))
        mod, nue = d80.diff_contra_base(self.trab, self.base)
        with self.assertRaises(d80.Rechazo):
            d80.exigir_vercel_json(self.trab, self.base)


class TestBase(Base):
    def armar_base(self):
        manifiesto = {r: cl.sha1(open(os.path.join(self.base, *r.split('/')), 'rb').read()) for r in cl.caminar_local(self.base)}
        payload = {r: h for r, h in manifiesto.items() if ar.en_payload(r)}
        mb, pb = json.dumps(manifiesto).encode(), json.dumps(payload).encode()
        return mb, pb, manifiesto, payload

    def test_ok_base_integra(self):
        mb, pb, _, payload = self.armar_base()
        d80.verificar_base(self.base, mb, pb, dict(payload), d80.sha256_b(mb), d80.sha256_b(pb))

    def test_RECHAZA_manifiesto_con_hash_distinto(self):
        mb, pb, _, payload = self.armar_base()
        with self.assertRaises(d80.Rechazo):
            d80.verificar_base(self.base, mb, pb, dict(payload), '0' * 64, d80.sha256_b(pb))

    def test_RECHAZA_payload_con_hash_distinto(self):
        mb, pb, _, payload = self.armar_base()
        with self.assertRaises(d80.Rechazo):
            d80.verificar_base(self.base, mb, pb, dict(payload), d80.sha256_b(mb), '1' * 64)

    def test_RECHAZA_archivo_de_la_base_alterado(self):
        mb, pb, _, payload = self.armar_base()
        escribir(self.base, 'src/app/page.tsx', 'export default 999 // alterado\n')
        with self.assertRaises(d80.Rechazo):
            d80.verificar_base(self.base, mb, pb, dict(payload), d80.sha256_b(mb), d80.sha256_b(pb))

    def test_RECHAZA_archivo_de_la_base_faltante(self):
        mb, pb, _, payload = self.armar_base()
        os.remove(os.path.join(self.base, 'public', 'logo.svg'))
        with self.assertRaises(d80.Rechazo):
            d80.verificar_base(self.base, mb, pb, dict(payload), d80.sha256_b(mb), d80.sha256_b(pb))

    def test_RECHAZA_si_produccion_no_coincide_con_el_payload(self):
        mb, pb, _, payload = self.armar_base()
        distinto = dict(payload)
        distinto['src/app/page.tsx'] = '0' * 40
        with self.assertRaises(d80.Rechazo):
            d80.verificar_base(self.base, mb, pb, distinto, d80.sha256_b(mb), d80.sha256_b(pb))
        con_extra = dict(payload)
        con_extra['src/app/nueva-en-prod.tsx'] = '1' * 40
        with self.assertRaises(d80.Rechazo):
            d80.verificar_base(self.base, mb, pb, con_extra, d80.sha256_b(mb), d80.sha256_b(pb))


class TestPayload(unittest.TestCase):
    def test_ok(self):
        base = {'src/a.ts': 'h1', 'src/b.ts': 'h2'}
        nuevo = {'src/a.ts': 'h1', 'src/b.ts': 'hX', 'src/c.ts': 'h3'}
        pm, pn = d80.exigir_payload_dentro_de_cambios(nuevo, base, ['src/b.ts', 'src/c.ts'])
        self.assertEqual((pm, pn), (['src/b.ts'], ['src/c.ts']))

    def test_RECHAZA_cambio_fuera_de_la_lista(self):
        with self.assertRaises(d80.Rechazo):
            d80.exigir_payload_dentro_de_cambios({'src/a.ts': 'otro'}, {'src/a.ts': 'h1'}, [])

    def test_RECHAZA_archivo_nuevo_fuera_de_la_lista(self):
        with self.assertRaises(d80.Rechazo):
            d80.exigir_payload_dentro_de_cambios({'src/a.ts': 'h1', 'src/zz.ts': 'h9'}, {'src/a.ts': 'h1'}, [])

    def test_RECHAZA_que_el_payload_quite_archivos(self):
        with self.assertRaises(d80.Rechazo):
            d80.exigir_payload_dentro_de_cambios({'src/a.ts': 'h1'}, {'src/a.ts': 'h1', 'src/b.ts': 'h2'}, [])


class TestDestino(Base):
    def test_RECHAZA_destino_igual_a_la_base_o_al_trabajo_o_dentro(self):
        for destino in (self.base, self.trab, os.path.join(self.base, 'sub'), self.tmp):
            with self.assertRaises(d80.Rechazo, msg=destino):
                d80.exigir_destino(destino, (self.base, self.trab))

    def test_RECHAZA_destino_con_contenido_y_sin_marca(self):
        destino = os.path.join(self.tmp, 'otro-destino')
        os.makedirs(destino)
        escribir(destino, 'algo-importante.txt', 'no borrar')
        with self.assertRaises(d80.Rechazo):
            d80.exigir_destino(destino, (self.base, self.trab))
        self.assertTrue(os.path.isfile(os.path.join(destino, 'algo-importante.txt')))

    def test_ok_destino_nuevo_o_con_marca(self):
        d80.exigir_destino(os.path.join(self.tmp, 'nuevo'), (self.base, self.trab))
        con_marca = os.path.join(self.tmp, 'con-marca')
        os.makedirs(con_marca)
        with open(os.path.join(con_marca, ar.MARCA), 'w') as f:
            f.write(ar.TEXTO_MARCA)
        d80.exigir_destino(con_marca, (self.base, self.trab))


class TestSecretosYHuella(Base):
    def test_el_escaner_detecta_un_secreto_en_el_stage(self):
        escribir(self.base, 'src/lib/malo.ts', "const k = 'sk_live_" + 'a' * 24 + "'\n")
        hall, _ = ar.escanear(self.base)
        self.assertTrue(hall, 'el escáner debe señalar la clave sk_live')

    def test_huella_cambia_si_se_toca_la_carpeta_y_no_si_no(self):
        h1 = d80.huella(self.base)
        self.assertEqual(h1, d80.huella(self.base))
        escribir(self.base, 'src/app/page.tsx', 'export default 2\n')
        self.assertNotEqual(h1, d80.huella(self.base))

    def test_RECHAZA_ruta_no_segura_en_el_diff(self):
        self.assertFalse(ar.ruta_segura('src/../x.ts'))
        self.assertFalse(ar.ruta_segura('/abs/x.ts'))
        self.assertFalse(ar.ruta_segura('src\\x.ts'))


class TestExcepcionEscaner(Base):
    """La excepción del escáner es de clave EXACTA: sólo cubre ESA línea de ESE archivo."""
    LINEA = "const SECRETO = 'un-secreto-largo-de-prueba-0123456789'\n"

    def clave(self, linea):
        import hashlib
        return {('tests/correo-seguridad.test.ts', 'asignacion', 7, hashlib.sha256(linea.rstrip().encode()).hexdigest()): 'fixture'}

    def preparar(self, linea, relleno=6):
        cuerpo = ''.join('// %d\n' % n for n in range(relleno)) + linea
        escribir(self.base, 'tests/correo-seguridad.test.ts', cuerpo)

    def hallazgos_del_archivo(self, extra):
        hall, _ = d80.escanear_stage(self.base, extra)
        return [h for h in hall if h[0] == 'tests/correo-seguridad.test.ts']

    def test_sin_excepcion_es_un_hallazgo(self):
        self.preparar(self.LINEA)
        self.assertTrue(self.hallazgos_del_archivo({}))

    def test_con_la_excepcion_exacta_deja_de_serlo(self):
        self.preparar(self.LINEA)
        self.assertEqual(self.hallazgos_del_archivo(self.clave(self.LINEA)), [])

    def test_RECHAZA_si_el_valor_de_la_linea_cambia(self):
        self.preparar("const SECRETO = 'otro-valor-distinto-largo-0123456789'\n")
        self.assertTrue(self.hallazgos_del_archivo(self.clave(self.LINEA)))

    def test_RECHAZA_si_la_linea_cambia_de_posicion(self):
        self.preparar(self.LINEA, relleno=9)
        self.assertTrue(self.hallazgos_del_archivo(self.clave(self.LINEA)))

    def test_no_cubre_el_mismo_texto_en_otro_archivo(self):
        self.preparar(self.LINEA)
        escribir(self.base, 'src/lib/otro.ts', ''.join('// %d\n' % n for n in range(6)) + self.LINEA)
        hall, _ = d80.escanear_stage(self.base, self.clave(self.LINEA))
        self.assertTrue([h for h in hall if h[0] == 'src/lib/otro.ts'])

    def test_las_excepciones_originales_se_restauran(self):
        antes = dict(ar.EXCEPCIONES)
        d80.escanear_stage(self.base, self.clave(self.LINEA))
        self.assertEqual(ar.EXCEPCIONES, antes)

    def test_la_excepcion_declarada_en_el_armador_coincide_con_el_archivo_real(self):
        real = os.path.join(d80.TRABAJO, 'tests', 'correo-seguridad.test.ts')
        if not os.path.isfile(real):
            self.skipTest('el candidato no está en esta máquina')
        import hashlib
        b = open(real, 'rb').read()
        n, linea = ar.linea_de(b, b.find(b"const SECRETO = 'un-secreto"))
        (k, _), = d80.EXCEPCIONES_D80.items()
        self.assertEqual(k, ('tests/correo-seguridad.test.ts', 'asignacion', n, hashlib.sha256(linea).hexdigest()))


class TestConstantes(unittest.TestCase):
    def test_listas_cerradas_coherentes(self):
        self.assertEqual(len(d80.ESPERADOS_MOD), 9)
        self.assertEqual(len(d80.ESPERADOS_NUEVOS), 34)
        self.assertIn('vercel.json', d80.ESPERADOS_MOD)
        for r in d80.ESPERADOS_MOD | d80.ESPERADOS_NUEVOS:
            self.assertTrue(d80.regla_candidato(r), r)
        self.assertFalse(d80.ESPERADOS_MOD & d80.ESPERADOS_NUEVOS)
        self.assertFalse(d80.CONOCIDOS_FUERA_DEL_STAGE & (d80.ESPERADOS_MOD | d80.ESPERADOS_NUEVOS))

    def test_hashes_de_la_base_son_sha256_y_coinciden_con_los_archivos(self):
        for h in (d80.MANIFIESTO_BASE, d80.PAYLOAD_BASE):
            self.assertRegex(h, r'^[0-9a-f]{64}$')
        self.assertEqual(ar.sha256_archivo(os.path.join(AQUI, d80.ARCHIVOS_BASE[0])), d80.MANIFIESTO_BASE)
        self.assertEqual(ar.sha256_archivo(os.path.join(AQUI, d80.ARCHIVOS_BASE[1])), d80.PAYLOAD_BASE)


if __name__ == '__main__':
    unittest.main(verbosity=2)
