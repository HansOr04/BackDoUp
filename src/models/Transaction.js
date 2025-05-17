/**
 * Modelo de transacciones para pagos World App
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
  // Identificadores de la transacción
  reference: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  transactionId: {
    type: String,
    trim: true,
    sparse: true
  },
  transactionHash: {
    type: String,
    trim: true,
    sparse: true
  },
  
  // Información de usuario y servicio
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceId: {
    type: Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  
  // Información de pago
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  token: {
    type: String,
    enum: ['WLD', 'USDC', 'ETH'],
    default: 'WLD'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Metadatos
  network: {
    type: String,
    default: 'worldchain'
  },
  notes: {
    type: String
  },
  
  // Control de tiempo
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
});

// Índices para mejorar búsquedas
TransactionSchema.index({ reference: 1 });
TransactionSchema.index({ transactionId: 1 });
TransactionSchema.index({ userId: 1 });
TransactionSchema.index({ serviceId: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ createdAt: -1 });

// Actualiza la fecha de updatedAt antes de guardar
TransactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Si la transacción cambia a completada, actualizar completedAt
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = Date.now();
  }
  
  next();
});

// Método para comprobar si la transacción ha expirado (más de 1 hora)
TransactionSchema.methods.isExpired = function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const hoursSinceCreation = (now - created) / (1000 * 60 * 60);
  
  return hoursSinceCreation > 1 && this.status === 'pending';
};

module.exports = mongoose.model('Transaction', TransactionSchema);