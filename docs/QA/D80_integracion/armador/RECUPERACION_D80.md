# Recuperación y rollback del armador D-80

**El armador sólo LEE la base y el trabajo y escribe en una carpeta NUEVA** (`C:\Users\jemil\vivebien-deploy-stage-d80-final`, con marca `.armar_stage_marca`). Nunca despliega, promueve ni toca Vercel/Supabase/Resend/DNS (sólo GET a la API de Vercel).

## Qué hay y dónde
| Elemento | Ubicación | Huella |
|---|---|---|
| Base aprobada (producción D-78) | `C:\Users\jemil\vivebien-deploy-stage-d75-final` | manifiesto `0282b61ae188808172e6c2e341bbf3d5333082e87d8e4189c8b85eac7bb1dc6d` · payload `fc8156d9c0aa1e945e58003ab0f0c5dda3769bd434dcadd17751ebb5aa815674` |
| Respaldo verificado del manifiesto y payload base | `scratchpad\respaldo_base_d75\` (copiado con sha256 comprobado; el armador se niega a sobrescribirlo si difiere) | mismos sha256 |
| Trabajo (sólo lectura) | `C:\Users\jemil\vivebien-candidato-d80` | 374/382 contra producción |
| Stage D-80 | `C:\Users\jemil\vivebien-deploy-stage-d80-final` | manifiesto `4140b01a66c47e8c83e4b6b5de60a64ba6a905586d04c215edc7a858a80d14eb` (769) · payload `6e64feeca5edcc9b2919a1c3708cfbfcf063e11db9b179399f19211ad5eb56da` (407) |
| Commits | rama `integracion/d78-base` = `2af9dc1d5d5209df1e6ab54d1a3b66cdd1708b26`; rama `integracion/d80-correo` = `1af90017e9d2fbdc8f82da52b6ca7ad8ccc25fbd` (worktree `C:\Users\jemil\vivebien-integracion-d78`) | |

## Si algo sale mal
1. **El stage queda incompleto o dudoso:** borrarlo y volver a armarlo. El armador sólo borra un destino que lleve SU marca y no tenga enlaces; si no, se niega (`RECHAZADO`). Es seguro repetir `python armar_stage_d80.py --ejecutar`.
2. **La base cambió:** el armador aborta antes de escribir (hash del manifiesto/payload, sha1 por archivo y árbol REAL de producción). Restaurar la base desde `vivebien-deploy-stage-d75-final` verificando contra `respaldo_base_d75\`.
3. **Producción cambió (otro alias):** aborta (`… no apunta a dpl_99T2…`). No continuar hasta reconciliar.
4. **Rollback de producción (si algún día se promoviera D-80):** `vercel promote dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z --yes` (D-78) o, más atrás, `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`. D-80 trae el correo APAGADO y no requiere revertir datos (migraciones 36/37 sin aplicar).
5. **Ramas de git:** no se modificó ninguna rama existente. Para descartar la integración basta con `git worktree remove C:\Users\jemil\vivebien-integracion-d78` y borrar las dos ramas `integracion/*` (nada de esto se ha hecho ni se hará sin autorización).

## Comandos
* Pruebas del armador (50, aisladas, sin red): `python -m unittest test_armar_stage_d80`
* Prueba de mutación (cada guardia desactivada debe romper alguna prueba): `python mutacion_d80.py`
* Validación en seco (sólo GET a Vercel): `python armar_stage_d80.py`
* Armado: `python armar_stage_d80.py --ejecutar`
* Verificar un árbol contra producción (sha1 de los 382 archivos): `node verificar_arbol.cjs <carpeta>`; un commit: `node verificar_commit.cjs <repo> <rama>`
