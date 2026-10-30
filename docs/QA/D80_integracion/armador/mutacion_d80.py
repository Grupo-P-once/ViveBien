"""Prueba de MUTACIÓN: si se desactiva cada guardia del armador, las pruebas negativas DEBEN fallar (si no, no protegen nada)."""
import importlib
import io
import sys
import unittest

import armar_stage_d80 as d80

GUARDIAS = {
    'validar_vercel_json': lambda *a, **k: None,
    'exigir_diff_esperado': lambda *a, **k: None,
    'exigir_sin_cambios_ajenos': lambda *a, **k: None,
    'verificar_base': lambda *a, **k: ({}, {}),
    'exigir_destino': lambda *a, **k: None,
    'exigir_payload_dentro_de_cambios': lambda *a, **k: ([], []),
}
resultado = {}
for nombre, falso in GUARDIAS.items():
    original = getattr(d80, nombre)
    setattr(d80, nombre, falso)
    import test_armar_stage_d80 as t
    importlib.reload(t)
    t.d80 = d80
    suite = unittest.defaultTestLoader.loadTestsFromModule(t)
    r = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(suite)
    resultado[nombre] = len(r.failures) + len(r.errors)
    setattr(d80, nombre, original)
for n, f in resultado.items():
    print(f'{n}: {f} prueba(s) detectan que se la quitó', '✓' if f else '✗ SIN COBERTURA')
sys.exit(0 if all(resultado.values()) else 1)
