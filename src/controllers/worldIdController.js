/**
 * Controlador para verificación con World ID
 */
const worldIdService = require('../services/worldIdService');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const { schemas, validate } = require('../utils/validators');
const worldAppConfig = require('../config/worldApp').config;
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Verificar prueba de World ID
 * @route POST /api/worldid/verify
 */
const verifyProof = asyncHandler(async (req, res) => {
  // Validar datos de entrada
  const { value, error } = validate(req.body, schemas.worldIdVerify);
  
  if (error) {
    return responseFormatter.validationError(res, error);
  }
  
  try {
    const { payload, action, signal } = value;
    
    // Verificar la prueba con World ID
    const verifyResult = await worldIdService.verifyProof(payload, action, signal);
    
    if (!verifyResult.success) {
      return responseFormatter.error(res, {
        statusCode: 400,
        message: 'Error de verificación',
        errors: { details: verifyResult.error }
      });
    }
    
    // Actualizar o crear usuario verificado
    const walletAddress = req.user ? req.user.walletAddress : null;
    const updateResult = await worldIdService.updateVerifiedUser(
      verifyResult.nullifierHash,
      verifyResult.verificationLevel,
      walletAddress
    );
    
    // Invalidar caché de usuario
    if (req.user && req.user.id) {
      cacheService.invalidatePattern(`user:${req.user.id}:*`);
    }
    
    return responseFormatter.success(res, {
      data: {
        verified: true,
        verificationLevel: verifyResult.verificationLevel,
        nullifierHash: verifyResult.nullifierHash
      },
      message: 'Verificación completada exitosamente'
    });
  } catch (error) {
    logger.error(`Error al verificar World ID: ${error.message}`);
    
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al verificar la prueba',
      errors: { details: error.message }
    });
  }
});

/**
 * Obtener el estado de verificación del usuario
 * @route GET /api/worldid/status
 * @access Private
 */
const getVerificationStatus = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  // Obtener estado de verificación
  const isVerified = await worldIdService.isUserVerified(req.user.id);
  
  return responseFormatter.success(res, {
    data: {
      verified: isVerified,
      action: worldAppConfig.verifyAction
    },
    message: 'Estado de verificación obtenido'
  });
});

/**
 * Obtener acciones de verificación disponibles
 * @route GET /api/worldid/actions
 * @access Admin
 */
const getVerifyActions = asyncHandler(async (req, res) => {
  try {
    // Intentar obtener de caché primero
    const cacheKey = 'worldid:actions';
    const cachedActions = cacheService.get(cacheKey);
    
    if (cachedActions) {
      return responseFormatter.success(res, {
        data: cachedActions,
        message: 'Acciones de verificación obtenidas de caché'
      });
    }
    
    // Obtener acciones del servicio
    const result = await worldIdService.getVerifyActions();
    
    if (!result.success) {
      throw new Error('Error al obtener acciones de verificación');
    }
    
    // Guardar en caché
    cacheService.set(cacheKey, result.actions, 3600); // 1 hora
    
    return responseFormatter.success(res, {
      data: result.actions,
      message: 'Acciones de verificación obtenidas correctamente'
    });
  } catch (error) {
    logger.error(`Error al obtener acciones de verificación: ${error.message}`);
    
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al obtener acciones de verificación',
      errors: { details: error.message }
    });
  }
});

module.exports = {
  verifyProof,
  getVerificationStatus,
  getVerifyActions
};