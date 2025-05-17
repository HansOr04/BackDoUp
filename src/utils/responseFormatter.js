/**
 * Utilidad para formatear respuestas API de manera consistente
 */

/**
 * Formatea una respuesta exitosa
 * @param {Object} res - Objeto de respuesta Express
 * @param {number} statusCode - Código HTTP (default: 200)
 * @param {string} message - Mensaje de éxito
 * @param {*} data - Datos a enviar en la respuesta
 * @param {Object} meta - Metadatos adicionales (paginación, etc.)
 * @returns {Object} Respuesta JSON formateada
 */
const success = (res, { statusCode = 200, message = 'Operación exitosa', data = null, meta = null }) => {
  const response = {
    success: true,
    message
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (meta !== null) {
    response.meta = meta;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Formatea una respuesta de error
 * @param {Object} res - Objeto de respuesta Express
 * @param {number} statusCode - Código HTTP (default: 500)
 * @param {string} message - Mensaje de error
 * @param {*} errors - Detalles de errores específicos
 * @returns {Object} Respuesta JSON formateada
 */
const error = (res, { statusCode = 500, message = 'Error interno del servidor', errors = null }) => {
  const response = {
    success: false,
    message
  };
  
  if (errors !== null) {
    response.errors = errors;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Formatea una respuesta para datos paginados
 * @param {Object} res - Objeto de respuesta Express
 * @param {Array} data - Datos a enviar
 * @param {number} page - Página actual
 * @param {number} limit - Límite por página
 * @param {number} total - Total de items
 * @param {string} message - Mensaje de éxito
 * @returns {Object} Respuesta JSON formateada con metadatos de paginación
 */
const paginated = (res, { data, page, limit, total, message = 'Datos obtenidos correctamente' }) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return success(res, {
    statusCode: 200,
    message,
    data,
    meta: {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      }
    }
  });
};

/**
 * Formatea una respuesta para contenido no encontrado
 * @param {Object} res - Objeto de respuesta Express
 * @param {string} message - Mensaje personalizado
 * @returns {Object} Respuesta JSON formateada para 404
 */
const notFound = (res, message = 'Recurso no encontrado') => {
  return error(res, {
    statusCode: 404,
    message
  });
};

/**
 * Formatea una respuesta para errores de validación
 * @param {Object} res - Objeto de respuesta Express
 * @param {string} message - Mensaje general
 * @param {Object} validationErrors - Errores de validación
 * @returns {Object} Respuesta JSON formateada para 400
 */
const validationError = (res, message = 'Error de validación', validationErrors = null) => {
  return error(res, {
    statusCode: 400,
    message,
    errors: validationErrors
  });
};

/**
 * Formatea una respuesta para errores de autenticación
 * @param {Object} res - Objeto de respuesta Express
 * @param {string} message - Mensaje personalizado
 * @returns {Object} Respuesta JSON formateada para 401
 */
const unauthorized = (res, message = 'No autorizado') => {
  return error(res, {
    statusCode: 401,
    message
  });
};

/**
 * Formatea una respuesta para errores de permisos
 * @param {Object} res - Objeto de respuesta Express
 * @param {string} message - Mensaje personalizado
 * @returns {Object} Respuesta JSON formateada para 403
 */
const forbidden = (res, message = 'Acceso prohibido') => {
  return error(res, {
    statusCode: 403,
    message
  });
};

module.exports = {
  success,
  error,
  paginated,
  notFound,
  validationError,
  unauthorized,
  forbidden
};