"""Prueba de MUTACIÓN del verificador D-80: si se desactiva cada guardia, las pruebas negativas DEBEN fallar (si no, esa guardia no está cubierta)."""
import importlib
import io
import sys
import unittest

import verificar_deployment_d80 as v

GUARDIAS = {
    'exigir_hashes': lambda *a, **k: None,
    'exigir_produccion_vigente': lambda *a, **k: None,
    'exigir_deployment': lambda *a, **k: None,
    'comparar_arbol': lambda *a, **k: 0,
    'es_propio': lambda alias: False,
    'llamar': lambda api, ruta: {},          # traga los fallos de la API y devuelve algo vacío
}
resultado = {}
for nombre, falso in GUARDIAS.items():
    original = getattr(v, nombre)
    setattr(v, nombre, falso)
    import test_verificar_deployment_d80 as t
    importlib.reload(t)
    t.v = v
    r = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromModule(t))
    resultado[nombre] = len(r.failures) + len(r.errors)
    setattr(v, nombre, original)
for n, f in resultado.items():
    print(f'{n}: {f} prueba(s) detectan que se la quitó', 'OK' if f else 'SIN COBERTURA')
sys.exit(0 if all(resultado.values()) else 1)
