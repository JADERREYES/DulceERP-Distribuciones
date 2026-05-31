# Flujo de Demo en Clase - DulceERP Distribuciones

## 1. Login admin

Entrar a la aplicación en:

```text
http://localhost:5173
```

Usar el usuario administrador autorizado.

Objetivo: mostrar que el sistema tiene autenticación, roles y rutas protegidas.

## 2. Dashboard

Mostrar:

- KPIs financieros.
- Alertas.
- Gráficas.
- Estado del backend.
- Datos reales del sistema.

Mensaje clave: el dashboard resume ventas, utilidad, cartera, inventario y riesgos.

## 3. Productos y lotes

Entrar a `Productos` y luego `Lotes`.

Mostrar:

- Stock.
- Costo.
- Precio de venta.
- Estado.
- Lotes disponibles.
- Fechas de vencimiento.

Mensaje clave: el ERP controla inventario alimenticio por producto y lote.

## 4. Compra

Entrar a `Compras`.

Mostrar el formulario y la tabla histórica, sin crear datos falsos.

Explicar:

- Una compra aumenta inventario.
- Una compra crea lotes.
- El sistema calcula costo promedio.
- Si es crédito, genera cuenta por pagar.

## 5. Venta

Entrar a `Ventas`.

Mostrar:

- Selección de cliente.
- Carrito de productos.
- Validación de stock.
- Venta contado o crédito.

Explicar:

- La venta descuenta inventario.
- El sistema descuenta primero el lote más próximo a vencer usando FEFO.
- Si es crédito, aumenta cartera.

## 6. Pago

Entrar a `Pagos / Cartera`.

Mostrar:

- Clientes con deuda.
- Registro de pagos.
- Aplicación de pagos a ventas pendientes.

Mensaje clave: la cartera queda sincronizada con los documentos pendientes.

## 7. Kardex

Entrar a `Kardex`.

Mostrar movimientos:

- Entrada por compra.
- Salida por venta.
- Devolución por anulación.
- Merma.
- Carga inicial de lote.

Mensaje clave: cada movimiento de inventario queda trazado.

## 8. Conciliación

Entrar a `Conciliación`.

Mostrar:

- Conciliación de inventario.
- Conciliación financiera.
- Diferencias entre saldos y documentos pendientes.

Mensaje clave: el sistema detecta inconsistencias sin corregir automáticamente.

## 9. Reportes

Entrar a `Reportes`.

Mostrar:

- Resumen ejecutivo.
- Estado de resultados.
- Inventario valorizado.
- Cartera.
- Cuentas por pagar.
- Mermas.
- Auditoría resumida.

Usar el botón `Imprimir reporte`.

## 10. Auditoría

Entrar a `Auditoría`.

Mostrar filtros por:

- Módulo.
- Acción.
- Usuario.
- Fecha.

Mensaje clave: acciones críticas quedan registradas para control interno.

## 11. Usuarios y roles

Entrar a `Usuarios`.

Mostrar:

- Roles.
- Estados.
- Restricciones.

Explicar que cada rol ve y ejecuta solo lo permitido.

## 12. Cierre

Cerrar con estos puntos:

- Es un ERP MERN conectado a MongoDB Atlas.
- Maneja operación comercial, inventario, cartera, proveedores y reportes.
- Tiene seguridad JWT, roles, auditoría y conciliación.
- No se deben crear datos falsos en la base real.
- Las integraciones externas como DIAN, WhatsApp, scanner e IA quedan para fases futuras.
