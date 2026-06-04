# Simplificacion UX de Compras y Ventas

## Objetivo

Reducir friccion en compras y ventas con flujos tipo carrito, sin perder trazabilidad de inventario, lotes, FEFO, costos, cartera, kardex ni auditoria.

## Pasos actuales de compra

1. Abrir Compras.
2. Crear nueva compra.
3. Seleccionar proveedor.
4. Ingresar factura, forma de pago y fecha.
5. Buscar producto.
6. Ingresar cantidad, costo, vencimiento y lote si aplica.
7. Agregar al carrito.
8. Revisar totales.
9. Registrar compra, previa validacion backend.

## Pasos actuales de venta

1. Abrir Ventas.
2. Crear nueva venta.
3. Seleccionar cliente, forma de pago y zona/ruta.
4. Buscar productos disponibles por FEFO.
5. Ingresar cantidad.
6. Agregar al carrito.
7. Guardar venta, previa validacion backend.

## Campos realmente obligatorios

### Compras

- Proveedor.
- Factura.
- Forma de pago.
- Producto.
- Cantidad mayor que cero.
- Costo unitario mayor que cero.
- Vencimiento del lote.
- Al menos un producto en carrito.

### Ventas

- Cliente.
- Forma de pago.
- Zona/ruta.
- Producto vendible.
- Cantidad mayor que cero.
- Cantidad menor o igual a disponibilidad FEFO.
- Al menos un producto en carrito.

## Campos con valor por defecto

### Compras

- Forma de pago: contado.
- Fecha: hoy.
- Cantidad: 1.
- Lote: automatico si el usuario no lo escribe.

### Ventas

- Forma de pago: contado.
- Zona/ruta: se toma del cliente si existe.
- Cantidad: 1.
- Precio: `salePrice` del producto.
- Productos: solo vendibles por defecto.

## Opciones avanzadas

### Compras

- Lote manual.
- Nota.
- Accesos a proveedores, productos y lotes.

### Ventas

- Nota.
- Accesos a compras, lotes y productos.
- Vista avanzada para incluir productos no vendibles con estado claro.

## Propuesta de flujo rapido

### Compra rapida

1. Seleccionar proveedor.
2. Ingresar factura.
3. Confirmar forma de pago y fecha.
4. Buscar producto.
5. Ingresar cantidad, costo y vencimiento.
6. Agregar al carrito.
7. Registrar compra.

### Venta rapida

1. Seleccionar cliente.
2. Confirmar forma de pago y zona/ruta.
3. Buscar producto vendible.
4. Ingresar cantidad.
5. Agregar al carrito.
6. Guardar venta.

## Riesgos si se eliminan campos criticos

- Sin proveedor no hay trazabilidad de cuentas por pagar ni compras por tercero.
- Sin cliente no hay cartera ni trazabilidad comercial.
- Sin vencimiento no se puede aplicar FEFO correctamente.
- Sin lotes no se puede bloquear venta de vencidos o no vendibles.
- Sin validacion backend se podria vender stock general sin lote real.
- Sin forma de pago se rompen cartera, pagos y reportes financieros.

## Cambios aplicados

- Compras se reorganizo en `quick-form`, `quick-section`, `quick-product-row`, `quick-cart`, `quick-summary` y `advanced-options`.
- Ventas se reorganizo en flujo de venta rapida con productos disponibles por FEFO.
- Se redujeron botones visibles: la validacion backend queda integrada antes de registrar/guardar.
- Se agregaron estados vacios de carrito.
- Se mantuvieron los mensajes reales del backend en los `catch`.
- No se cambiaron reglas contables ni reglas FEFO.
