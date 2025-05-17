/**
 * Modelo de servicios profesionales
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ServiceSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  price: {
    type: String,
    enum: ['$', '$$', '$$$', '$$$$'],
    default: '$$'
  },
  location: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  relevance: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  keywords: [{
    type: String,
    trim: true
  }],
  contactInfo: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String
  },
  sourceUrl: {
    type: String
  },
  verified: {
    type: Boolean,
    default: false
  },
  premiumOnly: {
    type: Boolean,
    default: true // Por defecto requiere pago para ver contacto
  },
  viewCount: {
    type: Number,
    default: 0
  },
  lastScraped: {
    type: Date,
    default: Date.now
  },
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
ServiceSchema.index({ category: 1 });
ServiceSchema.index({ location: 1 });
ServiceSchema.index({ rating: -1 });
ServiceSchema.index({ relevance: -1 });
ServiceSchema.index({ title: 'text', description: 'text', keywords: 'text' });

// Actualiza la fecha de updatedAt antes de guardar
ServiceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para verificar si es hora de actualizar la información
ServiceSchema.methods.needsUpdate = function() {
  const now = new Date();
  const hoursSinceLastUpdate = (now - this.lastScraped) / (1000 * 60 * 60);
  
  // Determinar frecuencia según la categoría
  return this.category.updateFrequency === 'high' ? 
    hoursSinceLastUpdate > 6 : // 6 horas para alta frecuencia
    hoursSinceLastUpdate > 24; // 24 horas para frecuencia normal
};

module.exports = mongoose.model('Service', ServiceSchema);