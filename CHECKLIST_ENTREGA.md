# Checklist de Entrega - DulceERP Distribuciones

## Requisitos previos

- Node.js instalado.
- MongoDB Atlas activo y accesible.
- Variables `.env` configuradas en `backend`.
- Variables `.env` configuradas en `frontend`.
- Puerto backend esperado: `5000`.
- Puerto frontend esperado: `5173`.

## Variables de entorno

Backend `backend/.env`:

```env
PORT=5000
MONGO_URI=TU_URI_DE_MONGODB_ATLAS
JWT_SECRET=TU_SECRETO_JWT
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
```

Frontend `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

## Iniciar backend

```powershell
cd backend
npm run start:safe
```

Alternativa si el encadenamiento falla:

```powershell
cd backend
npm run kill:5000
npm run dev
```

## Iniciar frontend

```powershell
cd frontend
npm run dev
```

Abrir:

```text
http://localhost:5173
```

## Verificar MongoDB Atlas

```powershell
cd backend
npm run test:mongo
```

Debe mostrar conexión exitosa y cerrar la conexión.

## Verificar health check

Con backend encendido:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

O en navegador:

```text
http://localhost:5000/api/health
```

## Iniciar sesión

Usuario administrador inicial:

```text
admin@dulceerp.com
Admin12345
```

Cambiar la contraseña antes de usar el sistema con operación real.

## Módulos para mostrar

- Dashboard gerencial.
- Productos.
- Lotes.
- Compras.
- Ventas.
- Pagos / Cartera.
- Kardex.
- Conciliación.
- Reportes ejecutivos.
- Auditoría.
- Usuarios y roles.
- Limpieza de datos.

## Flujo recomendado de demostración

1. Login como admin.
2. Revisar dashboard y estado del backend.
3. Mostrar productos y lotes.
4. Mostrar compras y cómo alimentan inventario.
5. Mostrar ventas y descuento FEFO.
6. Mostrar pagos de cartera.
7. Mostrar kardex.
8. Mostrar conciliación.
9. Mostrar reportes ejecutivos e imprimir.
10. Mostrar auditoría.
11. Mostrar administración de usuarios.

## Datos reales: no tocar sin autorización

No crear datos falsos ni ejecutar acciones destructivas en exposición:

- No borrar productos, clientes, proveedores, compras, ventas, pagos, lotes ni mermas.
- No ejecutar `repair-apply`.
- No ejecutar `delete-demo-apply`.
- No modificar saldos o stock manualmente.
- No crear lotes iniciales sin datos reales autorizados.

## Imprimir reportes

1. Ir a `Reportes`.
2. Seleccionar periodo.
3. Clic en `Consultar`.
4. Clic en `Imprimir reporte`.

## Revisar conciliación

Ir a `Conciliación` y validar:

- Diferencia cartera.
- Diferencia proveedores.
- Stock producto vs lotes.
- Stock producto vs kardex.

## Revisar auditoría

Ir a `Auditoría` y filtrar por:

- Módulo.
- Acción.
- Usuario.
- Fecha.

## Detener procesos en puerto 5000

```powershell
cd backend
npm run kill:5000
```

Este comando solo intenta detener procesos en estado `Listen` sobre el puerto `5000`.

## Comandos finales de validación

```powershell
cd backend
npm run test:mongo
npm run audit:readonly
npm run final:audit
npm run check:api
```

```powershell
cd frontend
npm run build
```
