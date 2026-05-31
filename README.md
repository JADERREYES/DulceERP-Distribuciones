# DulceERP Distribuciones

Sistema web ERP inicial para **Dulces Epifania Distribuciones S.A.S.**

Incluye:

- Backend Node.js, Express, MongoDB, Mongoose, JWT y bcryptjs.
- Frontend React con Vite, React Router DOM y Axios.
- CRUD de productos, clientes, ventas y gastos.
- Dashboard financiero con calculos de utilidad, margenes, punto de equilibrio, margen de seguridad y ROI.

## Estructura

```text
backend/
frontend/
README.md
```

## Inicio rapido

1. Usar MongoDB Atlas configurado en `backend/.env`.
2. Configurar variables de entorno en backend y frontend.
3. Instalar dependencias.
4. Ejecutar seed solo si necesitas garantizar el usuario admin.
5. Levantar backend y frontend.

```bash
cd backend
npm install
copy .env.example .env
npm run seed
npm run dev
```

En otra terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Credenciales iniciales:

- Email: `admin@dulceerp.com`
- Password: `Admin12345`

## Operacion con datos reales

Desde Fase 6 el proyecto queda preparado para operar con datos reales. No se deben crear datos demo en la base de MongoDB Atlas de trabajo.

### Seed

`npm run seed` solo crea el usuario administrador si no existe. No crea productos, clientes, proveedores, compras, ventas, pagos, gastos, lotes ni mermas demo.

### Auditoria read-only

Para revisar el estado de la base sin modificar registros:

```bash
cd backend
npm run audit:readonly
```

Este comando cuenta documentos, detecta posibles datos demo por patrones, reporta registros `isDemo=true`, identifica productos con stock sin lotes suficientes y revisa saldos negativos o inconsistencias basicas.

### Limpieza de datos demo

La limpieza se realiza desde el modulo **Limpieza de datos** visible solo para `admin`.

Flujo recomendado:

1. Detectar posibles datos demo.
2. Revisar relaciones y advertencias.
3. Marcar manualmente registros como demo.
4. Generar vista previa de eliminacion.
5. Eliminar solo registros seguros sin relaciones.

Nunca borrar manualmente ventas, compras, pagos, kardex o lotes desde la base de datos. Esos documentos tienen impacto contable e inventario.

### Lotes iniciales reales

Los productos historicos pueden tener stock sin lotes suficientes porque los lotes se implementaron despues. Para asignar lote al stock ya existente:

1. Ir a **Limpieza de datos**.
2. Buscar productos con stock sin lotes suficientes.
3. Crear lote inicial real con datos reales: numero de lote, cantidad, vencimiento, costo y proveedor opcional.

La carga inicial de lote real no aumenta stock. Solo asigna trazabilidad por lote al stock historico existente y genera kardex de tipo `carga_inicial_lote`.

### Respaldo

Antes de aplicar cualquier eliminacion demo o carga masiva real, crea respaldo de Atlas o snapshot exportado. No ejecutes `repair-apply` ni eliminaciones sin autorizacion formal.
