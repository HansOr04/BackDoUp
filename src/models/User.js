/**
 * Modelo de usuarios
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  // Información de World App
  walletAddress: {
    type: String,
    trim: true,
    unique: true,
    sparse: true // Permite múltiples documentos con valor null
  },
  username: {
    type: String,
    trim: true
  },
  profilePictureUrl: {
    type: String
  },
  
  // Información de World ID
  nullifierHash: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  verificationLevel: {
    type: String,
    enum: ['orb', 'device', 'phone', null],
    default: null
  },
  verified: {
    type: Boolean,
    default: false
  },
  
  // Servicios pagados
  paidServices: [{
    type: Schema.Types.ObjectId,
    ref: 'Service'
  }],
  
  // Historial de búsquedas recientes
  recentSearches: [{
    query: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Estadísticas de uso
  totalSpent: {
    type: Number,
    default: 0
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  
  // Control de tiempo
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Índices para mejorar búsquedas
UserSchema.index({ walletAddress: 1 });
UserSchema.index({ nullifierHash: 1 });
UserSchema.index({ verified: 1 });

// Actualiza la fecha de updatedAt antes de guardar
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para comprobar si el usuario tiene acceso a un servicio
UserSchema.methods.hasAccessToService = function(serviceId) {
  return this.paidServices.some(id => id.toString() === serviceId.toString());
};

// Método para registrar una búsqueda
UserSchema.methods.addRecentSearch = function(query) {
  // Mantener sólo las 10 búsquedas más recientes
  this.recentSearches.unshift({ query, timestamp: new Date() });
  if (this.recentSearches.length > 10) {
    this.recentSearches = this.recentSearches.slice(0, 10);
  }
};

module.exports = mongoose.model('User', UserSchema);