# Ventas: modo prueba sin FEFO

## Por que existe

Este modo permite probar el flujo completo de ventas en desarrollo cuando los datos locales tienen stock general, pero no tienen lotes vigentes disponibles por FEFO. No reemplaza las reglas reales de inventario.

## Variable de entorno

En `backend/.env` local:

```env
ALLOW_EXPIRED_LOT_SALES_FOR_TEST=true
NODE_ENV=development
```

Reiniciar backend:

```bash
npm run dev
```

Para desactivar:

```env
ALLOW_EXPIRED_LOT_SALES_FOR_TEST=false
```

## Seguridad

El modo queda desactivado por defecto en `backend/.env.example`.

Aunque `ALLOW_EXPIRED_LOT_SALES_FOR_TEST=true` se configure por error, el backend bloquea el bypass si `NODE_ENV=production`.

## Que hace

Cuando el usuario activa la opcion en Ventas y el backend permite el modo prueba:

- valida contra `Product.stock` general;
- no usa lotes vencidos como lotes vendidos;
- no descuenta `ProductBatch.availableQuantity`;
- descuenta `Product.stock`;
- crea un movimiento Kardex `salida_venta_prueba_sin_fefo`;
- marca la venta con `testMode=true`, `bypassFefo=true` y `bypassReason`;
- registra AuditLog con accion `TEST_BYPASS_FEFO_SALE`.

## Riesgos

Este modo no debe usarse con datos reales ni en produccion porque permite registrar ventas sin asignacion FEFO real. Puede afectar indicadores, reportes y conciliaciones si se usa fuera de pruebas controladas.

## Como identificar ventas de prueba

En ventas:

- `testMode: true`
- `bypassFefo: true`
- `bypassReason: "Venta permitida por modo de prueba local"`

En Kardex:

- tipo `salida_venta_prueba_sin_fefo`
- texto visible: `Salida venta prueba sin FEFO`

En AuditLog:

- module: `sales`
- action: `TEST_BYPASS_FEFO_SALE`
- description: `Venta registrada en modo prueba sin FEFO`

## Pendiente recomendado

Reportes y dashboard deberian excluir `testMode=true` de indicadores reales o mostrar estas ventas separadas cuando se requiera operar con datos reales.
