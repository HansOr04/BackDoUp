/**
 * Controlador para pagos con World App
 */
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const worldAppConfig = require('../config/worldApp').config;
const Transaction = require('../models/Transaction');
const Service = require('../models/Service');
const User = require('../models/User');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const { isValidMongoId } = require('../utils/validators');
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Iniciar un proceso de pago para acceder a un servicio
 * @route POST /api/payments/initiate
 * @access Private
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const { serviceId, token = 'WLD' } = req.body;
  
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  if (!isValidMongoId(serviceId)) {
    return responseFormatter.validationError(res, 'ID de servicio inválido');
  }
  
  // Verificar que el token solicitado esté soportado
  if (!worldAppConfig.supportedTokens.includes(token)) {
    return responseFormatter.validationError(res, `Token no soportado. Tokens disponibles: ${worldAppConfig.supportedTokens.join(', ')}`);
  }
  
  // Verificar que el servicio existe
  const service = await Service.findById(serviceId);
  
  if (!service) {
    return responseFormatter.notFound(res, 'Servicio no encontrado');
  }
  
  // Verificar si el usuario ya ha pagado por este servicio
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return responseFormatter.notFound(res, 'Usuario no encontrado');
  }
  
  if (user.paidServices.includes(serviceId)) {
    return responseFormatter.success(res, {
      data: {
        alreadyPaid: true,
        service: {
          id: service._id,
          title: service.title,
          contactInfo: service.contactInfo
        }
      },
      message: 'Ya tienes acceso a este servicio'
    });
  }
  
  // Crear referencia única para esta transacción
  const reference = uuidv4().replace(/-/g, '');
  
  // Crear transacción en la base de datos
  const transaction = new Transaction({
    reference,
    userId: user._id,
    serviceId: service._id,
    amount: worldAppConfig.contactAccessPrice,
    token,
    status: 'pending',
    createdAt: new Date()
  });
  
  await transaction.save();
  
  logger.info(`Nueva transacción iniciada: ${reference} para servicio ${service.title}`);
  
  return responseFormatter.success(res, {
    statusCode: 200,
    data: {
      reference,
      amount: worldAppConfig.contactAccessPrice,
      token,
      walletAddress: worldAppConfig.paymentWalletAddress,
      service: {
        id: service._id,
        title: service.title
      }
    },
    message: 'Transacción iniciada correctamente'
  });
});

/**
 * Confirmar un pago realizado
 * @route POST /api/payments/confirm
 * @access Private
 */
const confirmPayment = asyncHandler(async (req, res) => {
  const { reference, transaction_id } = req.body;
  
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  if (!reference || !transaction_id) {
    return responseFormatter.validationError(res, 'Referencia y ID de transacción son requeridos');
  }
  
  // Buscar la transacción en nuestra base de datos
  const transaction = await Transaction.findOne({ reference });
  
  if (!transaction) {
    return responseFormatter.notFound(res, 'Transacción no encontrada');
  }
  
  // Verificar que la transacción pertenece al usuario actual
  if (transaction.userId.toString() !== req.user.id) {
    return responseFormatter.forbidden(res, 'No tienes permiso para confirmar esta transacción');
  }
  
  // Verificar que la transacción no esté ya completada
  if (transaction.status === 'completed') {
    // Obtener detalles del servicio
    const service = await Service.findById(transaction.serviceId);
    
    return responseFormatter.success(res, {
      data: {
        status: 'completed',
        service: {
          id: service._id,
          title: service.title,
          contactInfo: service.contactInfo
        }
      },
      message: 'La transacción ya fue completada anteriormente'
    });
  }
  
  try {
    // Verificar el estado de la transacción en World App
    const response = await axios.get(
      `${worldAppConfig.devPortalUrl}/minikit/transaction/${transaction_id}?app_id=${worldAppConfig.appId}`,
      {
        headers: {
          'Authorization': `Bearer ${worldAppConfig.devPortalApiKey}`
        }
      }
    );
    
    const txData = response.data;
    
    // Verificar que la transacción es válida y corresponde a la misma referencia
    if (txData.reference !== reference) {
      logger.warn(`Referencia de transacción no coincide: ${txData.reference} vs ${reference}`);
      return responseFormatter.error(res, {
        statusCode: 400,
        message: 'La referencia de la transacción no coincide'
      });
    }
    
    // Actualizar el estado de la transacción en nuestra base de datos
    transaction.transactionId = transaction_id;
    transaction.transactionHash = txData.transactionHash || null;
    transaction.status = txData.status === 'failed' ? 'failed' : 
                          txData.status === 'mined' ? 'completed' : 'processing';
    transaction.updatedAt = new Date();
    
    if (transaction.status === 'completed') {
      transaction.completedAt = new Date();
    }
    
    await transaction.save();
    
    // Si la transacción está minada o en proceso, permitir acceso al servicio
    if (transaction.status === 'completed' || transaction.status === 'processing') {
      // Buscar el servicio
      const service = await Service.findById(transaction.serviceId);
      
      if (!service) {
        return responseFormatter.notFound(res, 'Servicio no encontrado');
      }
      
      // Actualizar el usuario para darle acceso al servicio
      if (transaction.status === 'completed') {
        await User.findByIdAndUpdate(
          req.user.id,
          { 
            $addToSet: { paidServices: transaction.serviceId },
            $inc: { totalSpent: transaction.amount }
          }
        );
        
        // Invalidar caché
        cacheService.invalidatePattern(`user:${req.user.id}:*`);
      }
      
      return responseFormatter.success(res, {
        data: {
          status: transaction.status,
          service: {
            id: service._id,
            title: service.title,
            contactInfo: transaction.status === 'completed' ? service.contactInfo : '*** Transacción en proceso, espere un momento ***'
          }
        },
        message: transaction.status === 'completed' 
          ? 'Pago confirmado correctamente' 
          : 'Pago en proceso, por favor espere'
      });
    }
    
    // Si la transacción falló
    if (transaction.status === 'failed') {
      return responseFormatter.error(res, {
        statusCode: 400,
        message: 'La transacción ha fallado',
        errors: { details: txData.error || 'Error desconocido' }
      });
    }
    
    // Estado desconocido
    return responseFormatter.error(res, {
      statusCode: 400,
      message: `Estado de transacción desconocido: ${txData.status}`
    });
  } catch (error) {
    logger.error(`Error al confirmar pago: ${error.message}`);
    
    // Si hay respuesta del servidor
    if (error.response) {
      logger.error(`Detalles del error: ${JSON.stringify(error.response.data)}`);
    }
    
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al confirmar el pago',
      errors: { details: error.message }
    });
  }
});

/**
 * Obtener historial de transacciones del usuario
 * @route GET /api/payments/history
 * @access Private
 */
const getTransactionHistory = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getUserKey(req.user.id, 'transactions');
  const cachedTransactions = cacheService.get(cacheKey);
  
  if (cachedTransactions) {
    return responseFormatter.success(res, {
      data: cachedTransactions,
      message: 'Historial de transacciones obtenido de caché'
    });
  }
  
  // Obtener transacciones del usuario con detalles del servicio
  const transactions = await Transaction.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .populate('serviceId', 'title category rating')
    .select('-__v');
  
  // Guardar en caché
  cacheService.set(cacheKey, transactions, 300); // 5 minutos
  
  return responseFormatter.success(res, {
    data: transactions,
    message: 'Historial de transacciones obtenido correctamente'
  });
});

/**
 * Obtener detalles de una transacción
 * @route GET /api/payments/:reference
 * @access Private
 */
const getTransactionDetails = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  // Buscar la transacción
  const transaction = await Transaction.findOne({ reference })
    .populate('serviceId', 'title description category rating location')
    .select('-__v');
  
  if (!transaction) {
    return responseFormatter.notFound(res, 'Transacción no encontrada');
  }
  
  // Verificar que la transacción pertenece al usuario actual
  if (transaction.userId.toString() !== req.user.id) {
    return responseFormatter.forbidden(res, 'No tienes permiso para ver esta transacción');
  }
  
  return responseFormatter.success(res, {
    data: transaction,
    message: 'Detalles de transacción obtenidos correctamente'
  });
});

module.exports = {
  initiatePayment,
  confirmPayment,
  getTransactionHistory,
  getTransactionDetails
};