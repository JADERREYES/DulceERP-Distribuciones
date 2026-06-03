# Auditoria local vs produccion - DulceERP Distribuciones

Fecha de auditoria: 2026-06-03 America/Bogota.

## Estado local y Git

- Rama local: `main`.
- Ultimo commit local antes de estos cambios: `32795bc Improve production API fallback and ERP admin actions`.
- `origin/main` verificado por `git ls-remote`: `32795bc9fb2b2cf187d5a14fec6bdfb02382eb17`.
- Divergencia local/remoto antes de confirmar cambios nuevos: ninguna.
- Arbol actual: contiene cambios locales de esta auditoria pendientes de commit.
- No se ejecutaron seeds ni comandos destructivos.

## Vercel y API

`vercel.json` mantiene:

- Frontend: root `frontend`, routePrefix `/`, framework `vite`.
- Backend: root `backend`, routePrefix `/_/backend`, framework `express`, entrypoint `src/server.js`.

`frontend/src/api/axios.js` mantiene fallback correcto:

- Desarrollo: `http://localhost:5000/api`.
- Produccion: `/_/backend/api`.
- Si existe `VITE_API_URL`, se respeta su valor.

Variables esperadas en Vercel:

- `VITE_API_URL=/_/backend/api`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `NODE_ENV=production`
- `CORS_ORIGIN=https://<dominio-vercel>` si aplica por origen.

## Produccion

No hay carpeta `.vercel` ni dominio Vercel documentado en el repositorio local. Por eso no se pudo verificar directamente:

- deploy activo de Vercel.
- `/_/backend/api/health` en produccion.
- commit exacto desplegado.
- paridad visual local vs produccion.

### Revision final de produccion 2026-06-03

- Dominio Vercel usado: no disponible en el repositorio local.
- Ultimo commit desplegado: no verificable sin dominio/proyecto Vercel vinculado.
- Resultado de `/_/backend/api/health`: no probado por falta de dominio.
- Resultado del login en produccion: no probado por falta de dominio y para evitar acciones no autorizadas.
- Modulos local vs produccion: local verificado por rutas y build; produccion pendiente de prueba manual con dominio real.
- Exportaciones en produccion: pendiente de prueba manual con dominio real.
- Filtros en produccion: pendiente de prueba manual con dominio real.
- Impresion en produccion: pendiente de prueba manual con dominio real.
- Errores de consola: no verificables sin abrir el dominio real.

El codigo local evita el fallo mas comun de produccion: `frontend/src/api/axios.js` usa `/_/backend/api` en build productivo, por lo que no debe llamar a `localhost` salvo que `VITE_API_URL` se configure mal en Vercel.

Pruebas no destructivas a ejecutar con el dominio real:

```bash
curl https://<dominio-vercel>/_/backend/api/health
curl -i https://<dominio-vercel>/_/backend/api/products
curl -i https://<dominio-vercel>/_/backend/api/customers
curl -i https://<dominio-vercel>/_/backend/api/sales
curl -i https://<dominio-vercel>/_/backend/api/purchases
curl -i https://<dominio-vercel>/_/backend/api/kardex
```

Interpretacion:

- `/health` debe responder 200 sin token.
- Endpoints protegidos deben responder 401 sin token.
- 404 indica problema de `vercel.json`, routePrefix o deploy.
- Error de red/CORS en navegador indica revisar `VITE_API_URL` y `CORS_ORIGIN`.
- 403 con token indica revisar rol/permisos.

## Diferencias local vs produccion

Diferencias comprobadas:

- Local tiene cambios nuevos pendientes de commit; produccion/remoto aun no los tiene.
- `origin/main` sigue en `32795bc`, anterior a esta auditoria.

Diferencias no comprobables sin dominio:

- Estado del ultimo deploy Vercel.
- Health real de produccion.
- Si Vercel esta desplegando exactamente `origin/main`.

Causa probable si produccion no coincide:

- Deploy viejo en Vercel.
- Variables de entorno incompletas.
- Dominio sin `VITE_API_URL=/_/backend/api`.
- Cache de navegador/CDN.
- Rol del usuario ocultando modulos o botones.

## Cambios aplicados en esta auditoria

- Gastos: filtros por fecha/categoria/concepto/metodo, exportacion, impresion, total filtrado, graficas por categoria y mes, ver/editar/eliminar con confirmacion.
- Mermas: filtros por producto/lote/motivo/fecha/busqueda, ver detalle, exportar, imprimir, y aviso de no eliminacion.
- Proveedores: filtros por estado/ciudad/deuda/fecha/busqueda, exportacion filtrada e impresion.
- Lotes: filtros por producto/proveedor/estado/vencimiento/busqueda, exportacion filtrada e impresion.
- Clientes: exportacion filtrada, impresion, eliminacion segura visible para admin.
- Productos: filtro stock bajo y fechas, impresion, mensaje backend especifico al bloquear eliminacion con movimientos.
- Pagos y pagos proveedores: impresion de listados filtrados.
- Export utils: `normalizeRowsForExport`.
- Backend: filtros adicionales en productos, proveedores, lotes, mermas y gastos.

## Validaciones ejecutadas

```bash
cd backend
node -e "require('./src/app')"
npm run test:mongo
npm run audit:readonly

cd frontend
npm run build
```

Resultados:

- `node -e "require('./src/app')"`: OK.
- `npm run test:mongo`: OK, Atlas conecto y cerro conexion.
- `npm run audit:readonly`: OK, modo solo lectura.
- `npm run build`: OK con advertencia no bloqueante de chunk JS mayor a 500 kB.

Hallazgos readonly relevantes:

- Diferencia cartera: `$0`.
- Diferencia proveedores: `$0`.
- Proveedores deuda: `$12.338`.
- Lotes vencidos con stock disponible: `10`.
- Productos con stock vs lotes inconsistente/parcial: `4`.
- Registros `isDemo=true`: `0`.
- Posibles registros demo por patron: `12`; no se marcaron ni eliminaron.

## Pasos para redeploy

1. Confirmar variables en Vercel.
2. Subir cambios:

```bash
git status
git add .
git commit -m "Improve ERP filters exports and safe admin actions"
git push origin main
```

3. En Vercel, confirmar que el deploy usa el commit nuevo.
4. Probar `https://<dominio-vercel>/_/backend/api/health`.
5. Login admin y revisar Dashboard, Ventas, Compras, Proveedores, Gastos, Kardex, Pagos, Reportes, Lotes y Mermas.

## Seguridad

- No se crearon datos falsos.
- No se ejecuto seed.
- No se borraron datos reales.
- No se ejecutaron ventas, compras, pagos, anulaciones, reversos, reparaciones ni eliminaciones reales.
- Los comandos contra Atlas fueron de conexion y auditoria readonly.
- No se modificaron credenciales ni configuracion sensible.
