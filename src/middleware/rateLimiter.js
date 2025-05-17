/**
 * Middlewares para limitar tasa de peticiones
 */
const rateLimit = require('express-rate-limit');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');

/**
 * Mensaje de error personalizado para límite excedido
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @returns {Object} Respuesta formateada
 */
const limitExceededHandler = (req, res) => {
  logger.warn(`Límite de tasa excedido: ${req.ip} - ${req.originalUrl}`);
  return responseFormatter.error(res, {
    statusCode: 429,
    message: 'Demasiadas solicitudes, por favor intenta de nuevo más tarde'
  });
};

/**
 * Middleware para limitar solicitudes en general
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite de 100 solicitudes por ventana por IP
  standardHeaders: true, // Devolver información estándar en encabezados
  legacyHeaders: false, // Deshabilitar encabezados `X-RateLimit-*`
  handler: limitExceededHandler,
  // Excluir rutas específicas
  skip: (req) => {
    // Ejemplo: excluir rutas públicas
    return req.path.startsWith('/api/public');
  }
});

/**
 * Middleware para limitar intentos de autenticación
 */
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Límite de 10 intentos por hora por IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Demasiados intentos de autenticación: ${req.ip}`);
    return responseFormatter.error(res, {
      statusCode: 429,
      message: 'Demasiados intentos de autenticación, por favor intenta de nuevo más tarde'
    });
  }
});

/**
 * Middleware para limitar solicitudes a la API de búsqueda
 */
const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 20, // Límite de 20 búsquedas por 5 minutos por IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Límite de búsqueda excedido: ${req.ip} - ${req.originalUrl}`);
    return responseFormatter.error(res, {
      statusCode: 429,
      message: 'Has realizado demasiadas búsquedas, por favor intenta de nuevo en unos minutos'
    });
  }
});

/**
 * Middleware para limitar solicitudes a la API de scraping
 */
const scrapingLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutos
  max: 5, // Límite de 5 scraping por 30 minutos
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Límite de scraping excedido: ${req.ip}`);
    return responseFormatter.error(res, {
      statusCode: 429,
      message: 'Has alcanzado el límite de solicitudes de actualización de datos, por favor intenta más tarde'
    });
  }
});

/**
 * Middleware para limitar solicitudes de procesamiento intensivo
 */
const heavyProcessingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 3, // Límite de 3 solicitudes por 10 minutos por IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Límite de procesamiento intensivo excedido: ${req.ip} - ${req.originalUrl}`);
    return responseFormatter.error(res, {
      statusCode: 429,
      message: 'Demasiadas solicitudes de procesamiento intensivo, por favor intenta de nuevo más tarde'
    });
  }
});

/**
 * Middleware para limitar operaciones de pago
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Límite de 10 operaciones de pago por hora por IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Límite de operaciones de pago excedido: ${req.ip}`);
    return responseFormatter.error(res, {
      statusCode: 429,
      message: 'Has alcanzado el límite de operaciones de pago, por favor intenta más tarde'
    });
  }
});

/**
 * Función para crear limitadores personalizados
 * 
 * @param {Object} options - Opciones de configuración
 * @returns {Function} Middleware de limitación personalizado
 */
const createCustomLimiter = (options) => {
  const defaultOptions = {
    windowMs: 60 * 1000, // 1 minuto por defecto
    max: 30, // 30 solicitudes por defecto
    message: 'Demasiadas solicitudes desde esta IP, por favor intenta de nuevo más tarde',
    standardHeaders: true,
    legacyHeaders: false
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return rateLimit({
    ...mergedOptions,
    handler: (req, res) => {
      logger.warn(`Límite personalizado excedido: ${req.ip} - ${req.originalUrl}`);
      return responseFormatter.error(res, {
        statusCode: 429,
        message: mergedOptions.message
      });
    }
  });
};

module.exports = {
  globalLimiter,
  authLimiter,
  searchLimiter,
  scrapingLimiter,
  heavyProcessingLimiter,
  paymentLimiter,
  createCustomLimiter
};