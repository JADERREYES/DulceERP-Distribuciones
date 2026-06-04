const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['entrada_compra', 'salida_venta', 'salida_venta_prueba_sin_fefo', 'devolucion_anulacion', 'anulacion_compra', 'ajuste', 'merma', 'carga_inicial_lote'], required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, min: 0, default: 0 },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    referenceType: { type: String, enum: ['Purchase', 'Sale', 'Adjustment', 'Waste'], required: true },
    referenceId: String,
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBatch' },
    batchNumber: { type: String, trim: true },
    description: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
