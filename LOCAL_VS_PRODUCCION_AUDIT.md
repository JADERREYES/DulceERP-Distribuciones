# Auditoria local vs produccion - DulceERP Distribuciones

Fecha de auditoria: 2026-06-01 America/Bogota.

## Estado Git

- Rama local: `main`.
- Ultimo commit local: `bd236b8 Improve customer editing and debt detail`.
- Ultimo commit remoto despues de `git fetch origin`: `bd236b8 Improve customer editing and debt detail`.
- Divergencia local/remoto: ninguna.
- Estado inicial del arbol: limpio.
- `.env`, `backend/.env` y `frontend/.env` estan ignorados por `.gitignore`.
- No se imprimieron tokens ni credenciales completas. Los scripts mostraron URI Mongo enmascarada.

Comandos ejecutados:

```bash
git status --short --branch
git log --oneline -5
git remote -v
git branch --show-current
git fetch origin
git check-ignore -v .env backend/.env frontend/.env
```

## Vercel y variables

`vercel.json` define:

- Frontend: root `frontend`, routePrefix `/`, framework `vite`.
- Backend: root `backend`, routePrefix `/_/backend`, framework `express`, entrypoint `src/server.js`.

Variables que deben existir en Vercel:

- Frontend: `VITE_API_URL=/_/backend/api`.
- Backend: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NODE_ENV=production`.
- Backend CORS: `CORS_ORIGIN=https://<dominio-actual-vercel>` si el frontend y backend quedan en origenes distintos. Si usan el mismo dominio con `/_/backend`, CORS no deberia bloquear por origen, pero conviene mantenerlo correcto.

Hallazgo principal:

- Antes del ajuste, `frontend/src/api/axios.js` usaba `import.meta.env.VITE_API_URL || 'http://localhost:5000/api'`.
- Si Vercel no tenia `VITE_API_URL`, el bundle de produccion llamaba a `http://localhost:5000/api`, que en el navegador del usuario apunta a su propia maquina, no al backend de Vercel.
- Esto explica modulos vacios, funciones que no aparecen por errores de carga, y acciones que existen localmente pero fallan en produccion.
- Se corrigio el fallback para produccion a `/_/backend/api`.

## Frontend local vs build

Resultado:

- `cd frontend && npm run build`: OK.
- Vite genero bundle correctamente.
- Advertencia no bloqueante: chunk JS mayor a 500 kB. No impide despliegue; se puede optimizar luego con code splitting.

Rutas revisadas:

- `App.jsx` registra dashboard, productos, clientes, ventas, pagos, proveedores, compras, pagos proveedores, kardex, lotes, mermas, conciliacion, gastos, reportes, auditoria, limpieza y usuarios.
- `Sidebar.jsx` muestra modulos por rol.
- `Navbar.jsx` muestra usuario, rol y estado.
- `axios.js` usa `import.meta.env.VITE_API_URL` y ahora fallback productivo seguro.

## Backend local

Resultado:

- `cd backend && node -e "require('./src/app')"`: OK.
- `cd backend && npm run test:mongo`: OK, Atlas conecta y cierra conexion.
- `cd backend && npm run audit:readonly`: OK, modo solo lectura.

Rutas registradas en `app.js`:

- `/api/auth`
- `/api/users`
- `/api/audit-logs`
- `/api/products`
- `/api/customers`
- `/api/data-cleanup`
- `/api/sales`
- `/api/expenses`
- `/api/payments`
- `/api/suppliers`
- `/api/purchases`
- `/api/supplier-payments`
- `/api/kardex`
- `/api/batches`
- `/api/wastes`
- `/api/dashboard`
- `/api/reports`
- `/api/executive-reports`
- `/api/reconciliation`
- `/api/search`

## Produccion

No habia dominio Vercel documentado en el repo. Endpoints no destructivos a probar con el dominio real:

```bash
curl https://<dominio-vercel>/_/backend/api/health
curl -i https://<dominio-vercel>/_/backend/api/dashboard/summary
curl -i https://<dominio-vercel>/_/backend/api/executive-reports/summary
curl -i https://<dominio-vercel>/_/backend/api/products
curl -i https://<dominio-vercel>/_/backend/api/customers
curl -i https://<dominio-vercel>/_/backend/api/suppliers
curl -i https://<dominio-vercel>/_/backend/api/purchases
curl -i https://<dominio-vercel>/_/backend/api/sales
curl -i https://<dominio-vercel>/_/backend/api/kardex
curl -i https://<dominio-vercel>/_/backend/api/batches
curl -i https://<dominio-vercel>/_/backend/api/wastes
curl -i https://<dominio-vercel>/_/backend/api/users
curl -i https://<dominio-vercel>/_/backend/api/audit-logs
```

Interpretacion esperada:

- `/health` debe responder 200 sin token.
- Endpoints protegidos deben responder 401 sin token.
- Si responden 404, revisar `vercel.json`, routePrefix y deploy.
- Si responden CORS/network en navegador, revisar `VITE_API_URL` y `CORS_ORIGIN`.
- Si responden 403 con token, revisar rol/permisos.

## Causa probable de diferencias

Causa exacta encontrada en codigo:

1. Produccion podia quedar llamando a `http://localhost:5000/api` si faltaba `VITE_API_URL`.
2. El backend de Vercel esta bajo `/_/backend/api`, no en `/api` directo desde el frontend salvo que Vercel reescriba internamente.
3. Algunas acciones administrativas existian parcialmente en frontend/backend, pero no de forma consistente por modulo.
4. Deletes de productos, clientes y proveedores no validaban relaciones antes de eliminar. Quedaron bloqueados de forma segura.

Otras causas a descartar en Vercel:

- Deploy viejo: verificar que el commit desplegado sea `bd236b8` o posterior al commit nuevo.
- Variables ausentes: `VITE_API_URL`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`.
- Cache de navegador/CDN: redeploy y hard refresh.
- Roles: Sidebar oculta rutas por rol y backend tambien valida roles. Un modulo puede no aparecer por rol aunque exista.

## Pasos exactos para redeploy

1. Confirmar variables en Vercel:
   - `VITE_API_URL=/_/backend/api`
   - `MONGO_URI=<valor Atlas>`
   - `JWT_SECRET=<secreto fuerte>`
   - `JWT_EXPIRES_IN=7d` o el valor definido por negocio
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://<dominio-vercel>`
2. Subir cambios:
   ```bash
   git status
   git add .
   git commit -m "Improve production API fallback and ERP admin actions"
   git push origin main
   ```
3. En Vercel, verificar que el deploy use el ultimo commit.
4. Probar:
   - `https://<dominio-vercel>/_/backend/api/health`
   - Login admin.
   - Sidebar por rol.
   - Kardex con fechas, exportar e imprimir.
   - Ventas/compras/pagos/proveedores/reportes con filtros y exportacion.

## Seguridad

- No se crearon datos falsos.
- No se ejecutaron seeds.
- No se ejecutaron ventas, compras, pagos, anulaciones o eliminaciones contra Atlas.
- Los scripts ejecutados contra Atlas fueron de conexion y auditoria readonly.
- Las acciones peligrosas nuevas en UI piden confirmacion antes de llamar endpoints.
- Los deletes backend agregados bloquean registros con relaciones.
