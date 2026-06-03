# Auditoria de limpieza para datos reales

Fecha: 2026-06-03T23:11:49.707Z

Modo: SOLO LECTURA. No se borraron ni modificaron datos.

## Resumen de colecciones

| Coleccion | Registros |
| --- | ---: |
| products | 11 |
| customers | 5 |
| suppliers | 2 |
| sales | 7 |
| purchases | 7 |
| payments | 3 |
| supplierPayments | 7 |
| expenses | 9 |
| productBatches | 14 |
| wastes | 2 |
| inventoryMovements | 25 |
| costHistories | 7 |
| auditLogs | 163 |
| users | 5 |

## Datos demo detectados

| Indicador | Resultado |
| --- | ---: |
| Posibles demo por patron | 31 |
| Registros marcados isDemo=true | 0 |
| Registros bloqueados por riesgo/contabilidad | 27 |
| Registros riesgosos | 0 |
| Admin activos | 1 |

Patrones revisados: prueba, test, demo, auditoria, auditoría, 4D, F5, LOTE-F5, PRUEBA, FC-AUD, Proveedor Auditoria, Mayorista Aliado Plus, Colegio Santa Maria, Cafeteria El Recreo.

## Inventario y FEFO

| Indicador | Resultado |
| --- | ---: |
| Lotes vencidos con stock | 13 |
| Diferencias Product.stock vs lotes | 4 |
| Productos con stock negativo | 0 |
| Productos con diagnostico FEFO | 11 |

### Diagnostico FEFO por producto

| Producto | SKU | Stock general | Vendible FEFO | Vencido/no vendible | Diferencia | Recomendacion |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Chocolatina Jet Caja x 50 | JET-CAJA-50 | 120 | 0 | 120 | 120 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Bon Bon Bum Caja x 48 | BBB-CAJA-48 | 95 | 0 | 0 | 95 | Cargar lote real verificado desde Limpieza de datos si existe mercancia fisica. |
| Oreo Paquete Mayorista | OREO-MAY-01 | 80 | 0 | 80 | 80 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Papitas Surtidas Caja x 24 | PAP-SUR-24 | 65 | 0 | 65 | 65 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Caramelo Surtido Bolsa x 100 | CAR-SUR-100 | 8 | 0 | 8 | 8 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Gaseosa 350 ml Caja x 12 | GAS-350-12 | 70 | 0 | 70 | 70 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Chicles Surtidos Caja x 100 | CHI-SUR-100 | 107 | 0 | 110 | 107 | Merma por vencimiento, correccion de fecha con razon o revisar conciliacion. |
| Combo Lonchera Dulce | COM-LON-DUL | 55 | 0 | 35 | 55 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Wafers Caja x 30 | WAF-CAJA-30 | 90 | 0 | 90 | 90 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Mix Snacks Familiar | MIX-SNA-FAM | 45 | 0 | 45 | 45 | Merma por vencimiento, correccion de fecha con razon o carga de lote real si aplica. |
| Super-coco | DET24 | 91 | 2 | 88 | 89 | Registrar merma si vencio realmente o corregir vencimiento con razon si fue error. |

## Financiero

| Indicador | Resultado |
| --- | ---: |
| Clientes con deuda | 0 |
| Proveedores con deuda | 1 |
| Clientes con deuda negativa | 0 |
| Proveedores con deuda negativa | 0 |

## Riesgos de limpieza

| Riesgo | Estado |
| --- | --- |
| Sin admin activo | No |
| Hay ventas/compras/pagos | Si |
| Hay movimientos Kardex | Si |
| Hay lotes vencidos con stock | Si |
| Hay diferencias stock/lotes | Si |

## Clasificacion

### Datos seguros para borrar

Solo registros marcados `isDemo=true`, no transaccionales y sin relaciones. Actualmente no hay registros marcados `isDemo=true`.

### Datos riesgosos

Registros no transaccionales con relaciones menores. Deben revisarse manualmente antes de marcarlos como demo o eliminarlos.

### Datos bloqueados

Ventas, compras, pagos, pagos a proveedores, lotes, Kardex, historial de costos y auditoria no se eliminan desde limpieza selectiva porque tienen impacto contable o de inventario.

## Recomendacion

Para preparar operacion real hay dos caminos:

1. Limpieza selectiva: detectar posibles demo, marcar manualmente como demo, ejecutar preview, y eliminar solo registros `isDemo=true` clasificados como seguros.
2. Reinicio operativo controlado: ejecutar preview, confirmar que todo lo operativo es prueba, activar `ALLOW_OPERATIONAL_RESET=true`, escribir `REINICIAR DATOS OPERATIVOS`, indicar razon, y aplicar desde usuario admin.

Despues de limpiar, el flujo correcto es: crear proveedores reales, crear productos reales, registrar compras reales con lote y vencimiento, validar disponibilidad FEFO, registrar ventas reales, registrar pagos, revisar Kardex y conciliacion. No se debe modificar ventas ni lotes para saltarse FEFO.
