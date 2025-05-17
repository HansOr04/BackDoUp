/**
 * Middleware de autenticación para World App
 */
const jwt = require('jsonwebtoken');
const { MiniKit } = require('@worldcoin/minikit-js');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const User = require('../models/User');
const worldAppConfig = require('../config/worldApp').config;

/**
 * Middleware para autenticar usuarios mediante World App wallet
 * Verifica el token JWT y carga información del usuario
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Obtener token del encabezado Authorization o cookie
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : req.cookies?.authToken;
    
    if (!token) {
      return responseFormatter.unauthorized(res, 'Token de autenticación no proporcionado');
    }
    
    // Verificar el token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Añadir información del usuario decodificada
      req.user = decoded;
      
      // Si tiene dirección de wallet, buscar en la base de datos
      if (decoded.walletAddress) {
        const user = await User.findOne({ walletAddress: decoded.walletAddress });
        
        if (user) {
          // Actualizar última actividad del usuario
          await User.updateOne(
            { _id: user._id },
            { lastLoginAt: new Date() }
          );
          
          // Agregar ID de usuario a la solicitud
          req.user.id = user._id;
          req.user.verified = user.verified;
        }
      }
      
      next();
    } catch (error) {
      logger.error(`Error al verificar token: ${error.message}`);
      return responseFormatter.unauthorized(res, 'Token inválido o expirado');
    }
  } catch (error) {
    logger.error(`Error en middleware de autenticación: ${error.message}`);
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error interno durante la autenticación'
    });
  }
};

/**
 * Middleware para verificar que el usuario ha sido autenticado mediante World ID
 * Requiere que authenticateUser se ejecute primero
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const requireWorldIDVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return responseFormatter.unauthorized(res, 'Autenticación requerida');
    }
    
    if (!req.user.id) {
      return responseFormatter.unauthorized(res, 'Usuario no encontrado');
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user || !user.verified) {
      return responseFormatter.forbidden(res, 'Se requiere verificación con World ID para acceder a este recurso');
    }
    
    next();
  } catch (error) {
    logger.error(`Error en verificación World ID: ${error.message}`);
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al verificar credenciales World ID'
    });
  }
};

/**
 * Verifica si el usuario tiene acceso a un servicio específico
 * Requiere que authenticateUser se ejecute primero
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const verifyServiceAccess = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return responseFormatter.unauthorized(res, 'Autenticación requerida');
    }
    
    const serviceId = req.params.serviceId || req.body.serviceId;
    
    if (!serviceId) {
      return responseFormatter.validationError(res, 'ID de servicio requerido');
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return responseFormatter.unauthorized(res, 'Usuario no encontrado');
    }
    
    // Verificar si el usuario ha pagado por este servicio
    if (!user.hasAccessToService(serviceId)) {
      return responseFormatter.forbidden(res, 'No tienes acceso a este servicio. Se requiere pago para ver detalles completos.');
    }
    
    next();
  } catch (error) {
    logger.error(`Error al verificar acceso a servicio: ${error.message}`);
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al verificar acceso al servicio'
    });
  }
};

/**
 * Validar wallet de World App
 * Esta función verifica si un wallet está autenticado con World App
 * 
 * @param {string} walletAddress - Dirección de wallet a verificar
 * @returns {Promise<Object>} Objeto con información del usuario
 */
const validateWorldAppWallet = async (walletAddress) => {
  try {
    if (!walletAddress) {
      throw new Error('Dirección de wallet no proporcionada');
    }
    
    // Obtener información del usuario por dirección
    const worldAppUser = await MiniKit.getUserByAddress(walletAddress);
    
    if (!worldAppUser) {
      throw new Error('Usuario no encontrado en World App');
    }
    
    return worldAppUser;
  } catch (error) {
    logger.error(`Error al validar wallet en World App: ${error.message}`);
    throw error;
  }
};

module.exports = {
  authenticateUser,
  requireWorldIDVerification,
  verifyServiceAccess,
  validateWorldAppWallet
};