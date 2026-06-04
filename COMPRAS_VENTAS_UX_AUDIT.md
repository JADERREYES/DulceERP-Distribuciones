# Auditoria UX Compras y Ventas

## Alcance

Revision funcional de los flujos de compras y ventas de DulceERP Distribuciones, con foco en simplicidad operativa, control contable, inventario por lotes, FEFO, kardex, cartera y trazabilidad.

No se crearon datos falsos, no se ejecutaron compras o ventas reales y no se modifico stock, lotes ni cartera durante esta auditoria.

## Compras

### Flujo actual auditado

1. El usuario abre Compras y pulsa Nueva compra.
2. Selecciona proveedor.
3. Selecciona forma de pago.
4. Ingresa numero de factura.
5. Selecciona producto desde un select.
6. Ingresa cantidad, costo unitario, lote opcional y vencimiento obligatorio.
7. Agrega productos a una tabla editable.
8. Valida con `POST /api/purchases/validate`.
9. Registra con `POST /api/purchases`.

### Backend de compras

`POST /api/purchases/validate` valida proveedor, factura, forma de pago, items, producto, cantidad, costo y vencimiento.

`POST /api/purchases` reutiliza la misma validacion y ejecuta una transaccion que:

- crea la compra;
- aumenta `Product.stock`;
- recalcula costo promedio;
- crea `ProductBatch` por cada item;
- crea `InventoryMovement` tipo `entrada_compra`;
- crea `CostHistory` si cambia el costo promedio;
- aumenta deuda del proveedor si la compra es credito;
- registra auditoria.

### Problemas encontrados en compras

- El formulario mezclaba datos generales, captura de producto, resumen y acciones en una sola grilla, lo que hacia largo el flujo.
- Los filtros del listado compartian protagonismo con el alta de compra.
- La ayuda de negocio sobre lotes y vencimientos no era suficientemente visible.
- El producto se seleccionaba solo desde un select amplio, sin busqueda previa.
- La tabla de productos agregados quedaba visualmente separada del formulario, haciendo menos claro el paso antes de registrar.
- El resumen no destacaba total de productos, total de unidades y forma de pago como cierre del flujo.

### Campos obligatorios de compra

- Proveedor.
- Numero de factura.
- Forma de pago.
- Al menos un producto.
- Producto valido por item.
- Cantidad mayor que cero.
- Costo unitario mayor que cero.
- Fecha de vencimiento por item.

### Flujo recomendado de compras

1. Datos de la compra: proveedor, factura, forma de pago, fecha y nota.
2. Agregar productos: busqueda, producto, cantidad, costo, lote y vencimiento.
3. Productos agregados: tabla editable con quitar.
4. Resumen: totales, validacion y registro.

### Mejoras aplicadas en compras

- Se reorganiza `Purchases.jsx` en secciones visuales.
- Se agrega busqueda de producto antes del select.
- Se conserva lote opcional y vencimiento obligatorio.
- Se muestra texto de ayuda FEFO: para vender, primero debe existir compra con lote y vencimiento.
- Se agregan accesos rapidos a nuevo proveedor, nuevo producto y lotes.
- Se muestra resumen con total de productos, unidades, total de compra y forma de pago.
- Se mantiene `POST /api/purchases/validate` antes de registrar.

### Riesgos contables de compras

- Anular compras con inventario ya vendido debe seguir bloqueado.
- Cambios de costo promedio deben quedar en `CostHistory`.
- Compras a credito deben mantener sincronizada la deuda del proveedor.
- Todo ingreso de mercancia debe generar lote y kardex.

## Ventas

### Flujo actual auditado

1. El usuario abre Ventas y pulsa Nueva venta.
2. Selecciona cliente.
3. Selecciona forma de pago.
4. Ingresa zona/ruta.
5. Consulta productos vendibles con `GET /api/products/sellable`.
6. Agrega cantidad desde tabla de disponibles.
7. Valida con `POST /api/sales/validate`.
8. Registra con `POST /api/sales`.

### Backend de ventas

`POST /api/sales/validate` valida cliente, forma de pago, zona/ruta, items, cantidad, precio y disponibilidad FEFO.

`POST /api/sales` reutiliza la misma validacion y ejecuta una transaccion que:

- asigna lotes FEFO vigentes y no bloqueados;
- descuenta `ProductBatch.availableQuantity`;
- descuenta `Product.stock`;
- crea `InventoryMovement` tipo `salida_venta`;
- calcula total, costo y utilidad bruta;
- aumenta cartera del cliente si la venta es credito;
- registra auditoria.

### Problemas encontrados en ventas

- El vendedor podia ver stock general, pero eso no explicaba con claridad si existian lotes vendibles.
- La seleccion por producto podia inducir a elegir productos con stock historico no vendible.
- La diferencia entre stock general, vendible y no vendible no era el primer dato de decision.
- El vendedor necesitaba una vista inicial de productos que si puede vender.

### Campos obligatorios de venta

- Cliente.
- Forma de pago.
- Zona/ruta.
- Al menos un producto.
- Producto valido por item.
- Cantidad mayor que cero.
- Precio mayor que cero.
- Disponibilidad FEFO suficiente.

### Flujo recomendado de ventas

1. Datos de venta: cliente, forma de pago, zona/ruta y nota.
2. Productos disponibles: busqueda, categoria, solo vendibles o vista avanzada.
3. Carrito: productos agregados, cantidades, precio, subtotal y utilidad.
4. Resumen: total productos, unidades, total venta, utilidad, validar y guardar.

### Mejoras aplicadas en ventas

- Se usa `GET /api/products/sellable` como entrada principal de productos.
- Se muestra solo productos con `sellableQuantity > 0` en vista principal.
- Se permite busqueda avanzada para ver productos no vendibles con mensaje claro.
- Se valida cantidad contra `sellableQuantity` antes de agregar al carrito.
- Se conserva validacion final con `POST /api/sales/validate`.
- Se conserva FEFO y el panel de disponibilidad como detalle.

### Riesgos contables de ventas

- Nunca vender contra stock general sin lote vendible.
- No vender lotes vencidos, bloqueados o agotados.
- No permitir venta a credito si supera cupo o el cliente esta bloqueado.
- Toda salida debe generar kardex y mantener trazabilidad de lotes.

## Validaciones necesarias

- Compras y ventas deben validar en frontend para UX, pero el backend debe seguir siendo la fuente de verdad.
- Los endpoints `/validate` deben mantenerse sin efectos secundarios.
- Los endpoints reales deben usar las mismas validaciones que `/validate`.
- Toda modificacion de inventario debe ocurrir dentro de transacciones.
- Los formularios deben mantener `id` y `name` en inputs, selects y textareas.
