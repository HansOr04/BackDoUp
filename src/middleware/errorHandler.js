/**
 * Middleware para manejo centralizado de errores
 */
const logger = require('../utils/logger');
const responseFormatter = require('../utils/responseFormatter');
const mongoose = require('mongoose');

/**
 * Maneja errores HTTP conocidos
 * 
 * @param {Error} err - Objeto de error
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const errorHandler = (err, req, res, next) => {
  // Si ya se envió una respuesta, pasar al siguiente middleware
  if (res.headersSent) {
    return next(err);
  }
  
  // Registrar el error
  logger.error(`Error: ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    stack: err.stack,
    ...(req.user && { userId: req.user.id }),
    body: Object.keys(req.body).length ? req.body : undefined
  });
  
  // Gestionar tipos de errores específicos
  
  // Error 404 - No encontrado
  if (err.name === 'NotFoundError' || err.statusCode === 404) {
    return responseFormatter.notFound(res, err.message || 'Recurso no encontrado');
  }
  
  // Error de validación
  if (err.name === 'ValidationError' || err.statusCode === 400) {
    // Formatear errores de validación de Mongoose
    if (err instanceof mongoose.Error.ValidationError) {
      const validationErrors = {};
      
      for (const field in err.errors) {
        validationErrors[field] = err.errors[field].message;
      }
      
      return responseFormatter.validationError(res, 'Error de validación', validationErrors);
    }
    
    return responseFormatter.validationError(res, err.message || 'Datos de solicitud inválidos');
  }
  
  // Error de autorización
  if (err.name === 'UnauthorizedError' || err.statusCode === 401) {
    return responseFormatter.unauthorized(res, err.message || 'No autorizado');
  }
  
  // Error de permisos
  if (err.name === 'ForbiddenError' || err.statusCode === 403) {
    return responseFormatter.forbidden(res, err.message || 'Acceso prohibido');
  }
  
  // Error de tiempo de espera
  if (err.name === 'TimeoutError') {
    return responseFormatter.error(res, {
      statusCode: 408,
      message: err.message || 'Tiempo de espera agotado para la solicitud'
    });
  }
  
  // Error de conflicto (ejemplo: duplicado)
  if (err.name === 'ConflictError' || err.statusCode === 409) {
    return responseFormatter.error(res, {
      statusCode: 409,
      message: err.message || 'Conflicto con el estado actual del recurso'
    });
  }
  
  // Error de servicio no disponible
  if (err.name === 'ServiceUnavailableError' || err.statusCode === 503) {
    return responseFormatter.error(res, {
      statusCode: 503,
      message: err.message || 'Servicio temporalmente no disponible'
    });
  }
  
  // Error general del servidor (default)
  return responseFormatter.error(res, {
    statusCode: err.statusCode || 500,
    message: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message || 'Error interno del servidor'
  });
};

/**
 * Manejador para rutas no encontradas
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 */
const notFoundHandler = (req, res) => {
  logger.warn(`Ruta no encontrada: ${req.originalUrl}`);
  return responseFormatter.notFound(res, `Ruta no encontrada: ${req.originalUrl}`);
};

/**
 * Middleware para capturar errores asíncronos
 * 
 * @param {Function} fn - Función de controlador asíncrona
 * @returns {Function} Middleware con manejo de errores
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Maneja errores de cierre de la aplicación
 */
const setupUnhandledErrorHandlers = () => {
  // Capturar excepciones no controladas
  process.on('uncaughtException', (error) => {
    logger.error('Excepción no controlada:', error.stack);
    // Cerrar el proceso de manera ordenada después de un breve retraso
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  // Capturar promesas rechazadas no controladas
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promesa rechazada no controlada:', reason);
  });
  
  // Manejar señales de terminación
  process.on('SIGTERM', () => {
    logger.info('Proceso terminado por SIGTERM');
    process.exit(0);
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  setupUnhandledErrorHandlers
};