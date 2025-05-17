/**
 * Controlador para autenticación con World App
 */
const jwt = require('jsonwebtoken');
const { MiniKit } = require('@worldcoin/minikit-js');
const User = require('../models/User');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const { isValidWalletAddress } = require('../utils/validators');
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Verificar firma de mensaje SIWE (Sign In With Ethereum) para autenticación
 * @route POST /api/auth/wallet
 */
const authenticateWallet = asyncHandler(async (req, res) => {
  const { message, signature } = req.body;
  
  if (!message || !signature) {
    return responseFormatter.validationError(res, 'Mensaje y firma son requeridos');
  }
  
  try {
    // Verificar firma con MiniKit
    const result = await MiniKit.verifySiweMessage(message, signature);
    
    if (!result.success) {
      logger.warn(`Fallo en verificación SIWE: ${result.error}`);
      return responseFormatter.error(res, {
        statusCode: 401,
        message: 'Verificación de firma fallida'
      });
    }
    
    const { address } = result;
    
    if (!isValidWalletAddress(address)) {
      return responseFormatter.validationError(res, 'Dirección de wallet inválida');
    }
    
    // Intentar obtener información del usuario desde World App
    let worldAppUser;
    try {
      worldAppUser = await MiniKit.getUserByAddress(address);
    } catch (error) {
      logger.warn(`No se pudo obtener información de usuario de World App: ${error.message}`);
      // Continuar con la autenticación aunque no se pueda obtener información adicional
    }
    
    // Buscar o crear usuario en nuestra base de datos
    let user = await User.findOne({ walletAddress: address });
    
    if (user) {
      // Actualizar información del usuario si tenemos nuevos datos de World App
      if (worldAppUser) {
        user.username = worldAppUser.username || user.username;
        user.profilePictureUrl = worldAppUser.profilePictureUrl || user.profilePictureUrl;
      }
      
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      // Crear nuevo usuario
      user = new User({
        walletAddress: address,
        username: worldAppUser ? worldAppUser.username : null,
        profilePictureUrl: worldAppUser ? worldAppUser.profilePictureUrl : null,
        lastLoginAt: new Date(),
        createdAt: new Date()
      });
      
      await user.save();
      logger.info(`Nuevo usuario creado con wallet: ${address}`);
    }
    
    // Generar token JWT
    const token = jwt.sign(
      {
        id: user._id,
        walletAddress: address,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        verified: user.verified
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Configurar cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
    });
    
    return responseFormatter.success(res, {
      data: {
        token,
        user: {
          id: user._id,
          walletAddress: address,
          username: user.username,
          profilePictureUrl: user.profilePictureUrl,
          verified: user.verified
        }
      },
      message: 'Autenticación exitosa'
    });
  } catch (error) {
    logger.error(`Error en autenticación de wallet: ${error.message}`);
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error durante la autenticación'
    });
  }
});

/**
 * Obtener perfil del usuario
 * @route GET /api/auth/profile
 * @access Private
 */
const getProfile = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getUserKey(req.user.id, 'profile');
  const cachedProfile = cacheService.get(cacheKey);
  
  if (cachedProfile) {
    return responseFormatter.success(res, {
      data: cachedProfile,
      message: 'Perfil obtenido de caché'
    });
  }
  
  // Buscar usuario y cargar servicios pagados
  const user = await User.findById(req.user.id)
    .populate('paidServices', 'title category rating');
  
  if (!user) {
    return responseFormatter.notFound(res, 'Usuario no encontrado');
  }
  
  // Preparar datos de perfil
  const profile = {
    id: user._id,
    walletAddress: user.walletAddress,
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
    verified: user.verified,
    verificationLevel: user.verificationLevel,
    paidServices: user.paidServices,
    totalSpent: user.totalSpent,
    recentSearches: user.recentSearches,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  };
  
  // Guardar en caché
  cacheService.set(cacheKey, profile);
  
  return responseFormatter.success(res, {
    data: profile,
    message: 'Perfil obtenido correctamente'
  });
});

/**
 * Cerrar sesión
 * @route POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  // Limpiar cookie
  res.clearCookie('authToken');
  
  return responseFormatter.success(res, {
    message: 'Sesión cerrada correctamente'
  });
});

module.exports = {
  authenticateWallet,
  getProfile,
  logout
};