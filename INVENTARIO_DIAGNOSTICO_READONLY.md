# Diagnostico readonly de inventario

Fecha de auditoria: 2026-06-03T22:10:29.543Z

Modo: SOLO LECTURA. No se aplicaron reparaciones, no se crearon mermas, no se modifico stock, no se borraron productos ni lotes.

## Resumen

| Indicador | Resultado |
| --- | ---: |
| Lotes vencidos con stock disponible | 10 |
| Productos con diferencia Product.stock vs suma de ProductBatch.availableQuantity | 4 |
| Productos con stock negativo | 0 |
| Lotes con cantidad negativa | 0 |
| Diferencia cartera | $0 |
| Diferencia proveedores | $0 |

La cartera esta conciliada porque la diferencia entre deuda de clientes y ventas credito pendientes es $0. Las cuentas por pagar estan conciliadas porque la diferencia entre deuda de proveedores y compras credito pendientes es $0.

## Lotes vencidos con stock disponible

Recomendacion general: no vender ni consumir automaticamente estos lotes sin revision. Para cada caso, validar fisicamente el producto y elegir una accion controlada: registrar merma por vencimiento si no es comercializable, bloquear el lote mientras se revisa, o corregir la fecha con razon si fue un error de digitacion.

| Producto | SKU | Lote | Cantidad disponible | Vencimiento | Dias vencido | Costo unitario | Valor estimado | Recomendacion |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| Chocolatina Jet Caja x 50 | JET-CAJA-50 | 2345 | 120 | 2026-05-30 | 4 | $24.500 | $2.940.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Oreo Paquete Mayorista | OREO-MAY-01 | 908 | 80 | 2026-05-30 | 4 | $31.500 | $2.520.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Super-coco | DET24 | 666 | 7 | 2026-05-30 | 4 | $1.628 | $11.396 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Papitas Surtidas Caja x 24 | PAP-SUR-24 | 777 | 65 | 2026-05-30 | 4 | $42.800 | $2.782.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Caramelo Surtido Bolsa x 100 | CAR-SUR-100 | 888 | 8 | 2026-05-30 | 4 | $11.200 | $89.600 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Gaseosa 350 ml Caja x 12 | GAS-350-12 | 989 | 70 | 2026-05-30 | 4 | $26.500 | $1.855.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Chicles Surtidos Caja x 100 | CHI-SUR-100 | 555 | 110 | 2026-05-30 | 4 | $15.800 | $1.738.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Combo Lonchera Dulce | COM-LON-DUL | 333 | 35 | 2026-05-30 | 4 | $36.000 | $1.260.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Wafers Caja x 30 | WAF-CAJA-30 | 454 | 90 | 2026-05-30 | 4 | $22.800 | $2.052.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |
| Mix Snacks Familiar | MIX-SNA-FAM | 6565 | 45 | 2026-05-30 | 4 | $48.000 | $2.160.000 | Merma si no es comercializable; bloqueo temporal; correccion con razon si la fecha es erronea. |

## Productos con diferencia stock/lotes

| Producto | SKU | Stock en Product | Suma lotes disponibles | Diferencia | Posible causa | Accion recomendada |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Bon Bon Bum Caja x 48 | BBB-CAJA-48 | 95 | 0 | 95 | Producto con stock maestro pero sin lotes registrados; posible inventario historico anterior a lotes o carga inicial pendiente. | Verificar inventario fisico y crear carga inicial de lote real solo con autorizacion; no ajustar stock automaticamente. |
| Chicles Surtidos Caja x 100 | CHI-SUR-100 | 107 | 110 | -3 | Lotes disponibles superan stock maestro; posible salida, merma, venta, anulacion o reverso aplicado de forma parcial entre producto y lote. | Revisar Kardex, compras, ventas, mermas y lotes del producto; aplicar correccion controlada solo con autorizacion. |
| Combo Lonchera Dulce | COM-LON-DUL | 55 | 35 | 20 | Stock maestro mayor que lotes disponibles; posible compra/venta historica sin lote, carga inicial pendiente o movimiento no asociado a lote. | Revisar Kardex, compras, ventas, mermas y lotes del producto; aplicar correccion controlada solo con autorizacion. |
| Super-coco | DET24 | 10 | 9 | 1 | Stock maestro mayor que lotes disponibles; posible compra/venta historica sin lote, carga inicial pendiente o movimiento no asociado a lote. | Revisar Kardex, compras, ventas, mermas y lotes del producto; aplicar correccion controlada solo con autorizacion. |

## Observaciones de conciliacion de inventario

- El diagnostico compara `Product.stock` contra la suma de `ProductBatch.availableQuantity`.
- Los lotes vencidos con stock no son una diferencia aritmetica por si solos; son riesgo operativo y contable porque el stock sigue disponible aunque el vencimiento ya paso.
- Las diferencias stock/lotes no deben corregirse con actualizaciones directas en MongoDB. Deben revisarse contra Kardex, ventas, compras, mermas, anulaciones y reversos.
- No se llamaron endpoints de conciliacion que registren auditoria en base de datos. Esta revision uso el script readonly.

## Validaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `cd backend && npm run test:mongo` | OK. Conexion a MongoDB Atlas exitosa y cerrada correctamente. |
| `cd backend && npm run audit:readonly` | OK. Reporto 10 lotes vencidos con stock y 4 diferencias stock/lotes. |
| `cd backend && node -e "require('./src/app')"` | OK. La aplicacion carga sin errores. |

## Acciones no ejecutadas

- No se crearon datos falsos.
- No se ejecuto seed.
- No se ejecuto `repair-apply`.
- No se ejecuto `delete-demo-apply`.
- No se registraron mermas reales.
- No se modifico `Product.stock`.
- No se modifico `ProductBatch.availableQuantity`.
- No se borraron productos ni lotes.
