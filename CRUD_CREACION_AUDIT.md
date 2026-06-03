# Auditoria de creacion CRUD - DulceERP Distribuciones

Fecha: 2026-06-03 America/Bogota.

Alcance: revision de frontend, rutas backend y permisos de creacion. No se ejecutaron `POST`, seeds ni acciones de escritura contra Atlas.

## Matriz por modulo

| Modulo | Crear requerido | Boton existe | Formulario existe | Endpoint existe | Permisos correctos | Estado final |
|---|---:|---:|---:|---:|---|---|
| Dashboard | No directo | Accesos rapidos | No aplica | No aplica | Segun rutas destino | Mantiene accesos a Nueva venta, Registrar pago, Agregar producto, Nuevo cliente y reportes. |
| Productos | Si | Si, `Nuevo producto` | Si, abre bajo demanda | Si, `POST /api/products` | `admin`, `bodega` | Corregido: CTA visible, formulario crear/editar y cancelar. |
| Clientes | Si | Si, `Nuevo cliente` | Si, abre bajo demanda | Si, `POST /api/customers` | `admin`, `vendedor`, `cartera` | Corregido: CTA visible, formulario crear/editar y cancelar. |
| Ventas | Si | Si, `Nueva venta` | Si, abre bajo demanda | Si, `POST /api/sales` y `POST /api/sales/validate` | `admin`, `vendedor` | Corregido: CTA visible, mantiene validacion previa y cancelar. |
| Pagos / Cartera | Si | Si, `Registrar pago` | Si, abre bajo demanda | Si, `POST /api/payments` | `admin`, `contador`, `cartera` | Corregido: CTA visible y formulario de pago separado del listado. |
| Proveedores | Si | Si, `Nuevo proveedor` | Si, abre bajo demanda | Si, `POST /api/suppliers` | `admin`, `contador` | Corregido: CTA visible, formulario crear/editar y cancelar. |
| Compras | Si | Si, `Nueva compra` | Si, abre bajo demanda | Si, `POST /api/purchases` | `admin`, `contador`, `bodega` | Corregido: CTA visible, formulario de compra separado del listado. |
| Pagos proveedores | Si | Si, `Registrar pago proveedor` | Si, abre bajo demanda | Si, `POST /api/supplier-payments` | `admin`, `contador` | Corregido: CTA visible y formulario controlado. |
| Gastos | Si | Si, `Nuevo gasto` | Si, abre bajo demanda | Si, `POST /api/expenses` | `admin`, `contador` | Corregido: CTA visible, mantiene graficas, filtros, exportar e imprimir. |
| Mermas | Si, controlado | Si, `Registrar merma` | Si, abre bajo demanda | Si, `POST /api/wastes` | `admin`, `contador`, `bodega` | Corregido: CTA visible y advertencia de no eliminacion libre. |
| Usuarios | Si | Si, `Nuevo usuario` | Si, abre bajo demanda | Si, `POST /api/users` | `admin` | Corregido: CTA visible, formulario crear/editar y cancelar. |
| Lotes | No libre | No aplica | Gestion controlada | No hay POST libre de lotes | `admin`, `contador`, `bodega` para gestion | Correcto: lotes se crean desde compras o carga inicial real, no como lote libre. |
| Kardex | No | No | No | No | Solo lectura `admin`, `contador`, `bodega` | Correcto: no debe crear movimientos manuales. |
| Reportes | No | No | No | No | Consulta `admin`, `contador` | Correcto: consulta, exportacion e impresion. |
| Conciliacion | No registros normales | No | No | Solo preview/apply controlado | Preview `admin`, `contador`; apply `admin` | Correcto: diagnostico y reparacion controlada, sin crear registros normales. |
| Auditoria | No | No | No | No | Solo lectura `admin`, `contador` | Correcto: no debe crear auditoria manual. |
| Limpieza de datos | No normal | Acciones controladas | Si, carga inicial real | Si, endpoints controlados | `admin`; carga inicial tambien `bodega` | Correcto: detectar demo, marcar demo, preview, delete seguro y lote inicial real. |

## Modulos corregidos

- Productos: boton `Nuevo producto`, formulario oculto hasta crear/editar, cancelar y estado vacio.
- Clientes: boton `Nuevo cliente`, formulario oculto hasta crear/editar, cancelar y estado vacio.
- Proveedores: boton `Nuevo proveedor`, formulario oculto hasta crear/editar, cancelar y estado vacio.
- Ventas: boton `Nueva venta`, formulario oculto, validacion previa visible, exportar/imprimir conservados.
- Compras: boton `Nueva compra`, formulario oculto, tabla de items solo durante creacion.
- Pagos / Cartera: boton `Registrar pago`, formulario oculto y listado separado.
- Pagos proveedores: boton `Registrar pago proveedor`, formulario oculto.
- Gastos: boton `Nuevo gasto`, formulario oculto y graficas conservadas.
- Mermas: boton `Registrar merma`, formulario oculto y advertencia de seguridad conservada.
- Usuarios: boton `Nuevo usuario`, formulario oculto y edicion con cancelacion.

## Modulos solo lectura o sin crear normal

- Kardex: solo lectura por naturaleza contable; no se crean movimientos manuales desde UI.
- Auditoria: solo lectura; los eventos se crean por acciones del sistema.
- Reportes: consulta, exportacion e impresion.
- Dashboard: no crea registros, solo accesos rapidos.
- Conciliacion: diagnostico; `repair-preview` y `repair-apply` son acciones controladas, no creacion normal.
- Lotes: no hay alta libre; compras crean lotes y Limpieza de datos permite carga inicial real controlada.

## Permisos de creacion backend

- `POST /api/products`: `admin`, `bodega`.
- `POST /api/customers`: `admin`, `vendedor`, `cartera`.
- `POST /api/sales`: `admin`, `vendedor`.
- `POST /api/payments`: `admin`, `contador`, `cartera`.
- `POST /api/suppliers`: `admin`, `contador`.
- `POST /api/purchases`: `admin`, `contador`, `bodega`.
- `POST /api/supplier-payments`: `admin`, `contador`.
- `POST /api/expenses`: `admin`, `contador`.
- `POST /api/wastes`: `admin`, `contador`, `bodega`.
- `POST /api/users`: `admin`.

## Validaciones y seguridad revisadas

- Backend usa `protect` y `authorizeRoles` en rutas de creacion.
- Los controladores devuelven errores con `message`.
- Productos, clientes, proveedores y usuarios validan campos requeridos y bloquean casos inseguros.
- Ventas mantienen validacion previa con `/api/sales/validate`.
- Compras requieren items y datos de lote/vencimiento en UI.
- Pagos se registran contra clientes/proveedores con deuda.
- No se cambiaron reglas contables de anulacion, reverso, kardex, auditoria, mermas ni lotes.

## Recomendaciones pendientes

- Agregar tooltips o mensajes deshabilitados por rol si en el futuro se decide mostrar acciones bloqueadas en vez de ocultarlas.
- Revisar textos con acentos en archivos antiguos para evitar mojibake visual en terminales Windows.
- Si se habilita creacion manual de lotes, debe seguir llamandose `Carga inicial de lote real` y quedar auditada.
