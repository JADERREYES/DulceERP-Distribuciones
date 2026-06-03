# Auditoria de compras y proveedores

Fecha: 2026-06-03

Modo: revision tecnica. No se ejecutaron compras reales, ventas reales, seeds, borrados ni cambios de inventario.

## Flujo de negocio validado

El flujo correcto del ERP para abastecimiento mayorista queda asi:

Proveedor real -> Compra -> Productos comprados -> Cantidades -> Costos -> Lotes -> Vencimientos -> Stock -> Kardex `entrada_compra` -> Cuentas por pagar si la compra es a credito.

## Modelo proveedor-compra

Cada compra requiere:

| Campo | Estado |
| --- | --- |
| supplier | Obligatorio. Relaciona la compra con un proveedor. |
| invoiceNumber | Obligatorio en validacion backend/frontend. |
| paymentMethod | Obligatorio. Valores validos: `contado`, `credito`. |
| items | Obligatorio. Permite multiples productos. |
| total | Calculado por backend. |
| paidAmount | Calculado por backend segun forma de pago. |
| balance | Calculado por backend segun forma de pago. |
| paymentStatus | `pagado` para contado, `pendiente` para credito. |
| status | `activa` o `anulada`. |

No debe existir compra sin proveedor.

## Modelo compra-productos

Cada item de compra requiere:

| Campo | Estado |
| --- | --- |
| product | Obligatorio. |
| quantity | Mayor que 0. Permite valores mayores que 1. |
| unitCost | Mayor que 0. |
| batchNumber | Opcional. Si queda vacio, backend genera lote. |
| expirationDate | Obligatorio. |
| subtotal | Calculado por backend como `quantity * unitCost`. |

## Payload esperado y enviado

```json
{
  "supplier": "idProveedor",
  "invoiceNumber": "FC-001",
  "paymentMethod": "contado",
  "note": "opcional",
  "items": [
    {
      "product": "idProducto",
      "quantity": 10,
      "unitCost": 1000,
      "batchNumber": "A1",
      "expirationDate": "2026-12-31"
    },
    {
      "product": "idProducto2",
      "quantity": 30,
      "unitCost": 800,
      "batchNumber": "B1",
      "expirationDate": "2026-12-31"
    }
  ]
}
```

El frontend construye este payload con `buildPurchasePayload()` y convierte `quantity` y `unitCost` a `Number`.

## Problemas encontrados

- La compra ya soportaba multiples items en estado, pero la tabla de productos agregados era solo lectura y podia dar la impresion de que la cantidad quedaba fija en 1 tras agregar cada producto.
- El formulario reseteaba la cantidad a 1 despues de agregar un producto, que es correcto para cargar el siguiente item, pero no era claro porque la fila agregada no se podia editar.
- Compras no imprimia un log propio de payload; al revisar consola podia confundirse con `Payload venta recibido`.
- Proveedores aceptaba payload completo y no removia explicitamente `currentDebt`, aunque el formulario no lo enviaba.
- Proveedores tenia campos sin `id/name` y no mostraba direccion aunque estaba en el estado.

## Soluciones aplicadas

- Compras mantiene proveedor, factura, metodo de pago y nota mientras se agregan varios productos.
- El item actual permite cantidad mayor que 1 con input numerico `min=1`, `step=1`.
- Al agregar producto, la cantidad se guarda como numero y el item queda en tabla editable.
- La tabla de items ahora muestra producto, SKU, cantidad, costo unitario, subtotal, lote, vencimiento y accion quitar.
- Se agrego `updateItem()` para editar cantidad, costo, lote y vencimiento por linea antes de validar o registrar.
- Se advierte si se intenta duplicar producto+lote.
- `Validar compra` llama `POST /api/purchases/validate` sin modificar inventario.
- `Registrar compra` valida frontend, luego backend validate, y solo despues llama `POST /api/purchases`.
- En desarrollo se muestra `Payload compra:` desde frontend y `Payload compra recibido:` desde backend.
- Proveedores ahora sanitiza `currentDebt` y `status` en backend para que la deuda no sea editable manualmente.
- Proveedores valida nombre/NIT, cupo y plazo con mensajes claros.
- Se agregaron `id` y `name` a campos de Compras y Proveedores.

## Endpoints usados

| Endpoint | Uso | Escritura |
| --- | --- | --- |
| `GET /api/suppliers` | Cargar proveedores | No |
| `GET /api/products` | Cargar productos | No |
| `GET /api/purchases` | Cargar compras | No |
| `POST /api/purchases/validate` | Validar compra | No |
| `POST /api/purchases` | Registrar compra real | Si, solo cuando usuario confirma datos reales |
| `POST /api/suppliers` | Crear proveedor real | Si |
| `PUT /api/suppliers/:id` | Editar proveedor | Si |

## Seguridad contable

- Una compra real aumenta stock, crea lotes, crea Kardex `entrada_compra`, actualiza costo promedio y aumenta deuda proveedor si es credito.
- La validacion de compra no modifica stock, lotes, Kardex ni cuentas por pagar.
- La deuda del proveedor no se edita manualmente; cambia por compras credito, pagos o anulaciones.
- No se ejecutaron compras reales durante esta auditoria.
