/**
 * Funciones de validación reutilizables
 */
const Joi = require('joi');
const mongoose = require('mongoose');

// Esquemas de validación comunes
const schemas = {
  // Validación de ID de MongoDB
  mongoId: Joi.string().custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'MongoDB ObjectId validation'),
  
  // Validación para dirección de wallet
  walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/),
  
  // Validación para categorías
  category: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    description: Joi.string().max(500),
    icon: Joi.string().max(10),
    externalId: Joi.string().max(100),
    updateFrequency: Joi.string().valid('low', 'medium', 'high'),
    isActive: Joi.boolean(),
    displayOrder: Joi.number().integer().min(0),
    parentCategory: Joi.string().allow(null, '')
  }),
  
  // Validación para servicios
  service: Joi.object({
    title: Joi.string().min(3).max(100).required(),
    description: Joi.string().min(10).max(2000).required(),
    category: Joi.string().required(),
    price: Joi.string().valid('$', '$$', '$$$', '$$$$'),
    location: Joi.string().required(),
    rating: Joi.number().min(0).max(5),
    contactInfo: Joi.string().required(),
    imageUrl: Joi.string().uri().allow(null, ''),
    sourceUrl: Joi.string().uri().allow(null, ''),
    verified: Joi.boolean(),
    premiumOnly: Joi.boolean()
  }),
  
  // Validación para búsquedas
  search: Joi.object({
    query: Joi.string().min(2).max(100).required(),
    category: Joi.string().allow(null, ''),
    location: Joi.string().allow(null, ''),
    price: Joi.string().valid('$', '$$', '$$$', '$$$$', '').allow(null),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20)
  }),
  
  // Validación para pagos
  payment: Joi.object({
    serviceId: Joi.string().required(),
    token: Joi.string().valid('WLD', 'USDC').default('WLD')
  }),
  
  // Validación para verificación de World ID
  worldIdVerify: Joi.object({
    payload: Joi.object({
      merkle_root: Joi.string().required(),
      nullifier_hash: Joi.string().required(),
      proof: Joi.string().required(),
      verification_level: Joi.string().valid('orb', 'device', 'phone').required()
    }).required(),
    action: Joi.string().required(),
    signal: Joi.string().allow(null, '')
  })
};

/**
 * Valida datos contra un esquema Joi
 * @param {Object} data - Los datos a validar
 * @param {Object} schema - El esquema Joi para validar
 * @returns {Object} Objeto con error o valor validado
 */
const validate = (data, schema) => {
  const options = {
    abortEarly: false, // Incluir todos los errores
    allowUnknown: true, // Ignorar propiedades desconocidas
    stripUnknown: true // Eliminar propiedades desconocidas
  };
  
  const { error, value } = schema.validate(data, options);
  
  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join(', ');
    return { error: errorMessage };
  }
  
  return { value };
};

/**
 * Valida un ID de MongoDB
 * @param {string} id - El ID a validar
 * @returns {boolean} True si es válido
 */
const isValidMongoId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Valida una dirección de wallet Ethereum
 * @param {string} address - La dirección a validar
 * @returns {boolean} True si es válida
 */
const isValidWalletAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

module.exports = {
  schemas,
  validate,
  isValidMongoId,
  isValidWalletAddress
};