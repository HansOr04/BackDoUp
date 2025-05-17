/**
 * Controlador para gestión de servicios
 */
const Service = require('../models/Service');
const Category = require('../models/Category');
const User = require('../models/User');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const { schemas, validate, isValidMongoId } = require('../utils/validators');
const cacheService = require('../services/cacheService');
const pythonApiService = require('../services/pythonApiService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Obtener servicios por categoría
 * @route GET /api/categories/:id/services
 */
const getServicesByCategory = asyncHandler(async (req, res) => {
  const { id: categoryId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const sort = req.query.sort || 'rating'; // rating, relevance
  const sortDirection = req.query.direction === 'asc' ? 1 : -1;
  
  if (!isValidMongoId(categoryId)) {
    return responseFormatter.validationError(res, 'ID de categoría inválido');
  }
  
  // Verificar si existe la categoría
  const category = await Category.findById(categoryId);
  
  if (!category) {
    return responseFormatter.notFound(res, 'Categoría no encontrada');
  }
  
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getServicesKey(null, categoryId, page, limit);
  const cachedServices = cacheService.get(cacheKey);
  
  if (cachedServices) {
    return responseFormatter.paginated(res, {
      data: cachedServices.data,
      page: cachedServices.page,
      limit: cachedServices.limit,
      total: cachedServices.total,
      message: 'Servicios obtenidos de caché'
    });
  }
  
  // Calcular skip para paginación
  const skip = (page - 1) * limit;
  
  // Configurar ordenamiento
  const sortOptions = {};
  sortOptions[sort] = sortDirection;
  
  // Consultar servicios con paginación
  const query = { category: categoryId };
  
  // Para usuarios no autenticados o sin verificación, solo mostrar servicios no premium
  if (!req.user || !req.user.verified) {
    query.premiumOnly = false;
  }
  
  // Ejecutar consulta con contador
  const [services, total] = await Promise.all([
    Service.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Service.countDocuments(query)
  ]);
  
  // Transformar servicios para ocultar información sensible
  const transformedServices = services.map(service => {
    const serviceObj = service.toObject();
    
    // Ocultar información de contacto para servicios premium
    if (service.premiumOnly) {
      serviceObj.contactInfo = '*** Requiere pago para acceder ***';
    }
    
    return serviceObj;
  });
  
  // Calcular metadatos de paginación
  const result = {
    data: transformedServices,
    page,
    limit,
    total
  };
  
  // Guardar en caché
  cacheService.set(cacheKey, result);
  
  return responseFormatter.paginated(res, {
    data: transformedServices,
    page,
    limit,
    total,
    message: 'Servicios obtenidos correctamente'
  });
});

/**
 * Obtener servicio por ID
 * @route GET /api/services/:id
 */
const getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de servicio inválido');
  }
  
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getServicesKey(id);
  const cachedService = cacheService.get(cacheKey);
  
  if (cachedService) {
    return responseFormatter.success(res, {
      data: cachedService,
      message: 'Servicio obtenido de caché'
    });
  }
  
  // Buscar servicio y realizar populate de la categoría
  const service = await Service.findById(id)
    .populate('category', 'name icon')
    .select('-__v');
  
  if (!service) {
    return responseFormatter.notFound(res, 'Servicio no encontrado');
  }
  
  // Incrementar contador de vistas
  service.viewCount = (service.viewCount || 0) + 1;
  await service.save();
  
  // Transformar servicio para ocultar información sensible si es necesario
  const serviceObj = service.toObject();
  
  // Ocultar información de contacto para servicios premium si el usuario no tiene acceso
  if (service.premiumOnly) {
    const hasAccess = req.user && req.user.id && 
      await User.findOne({
        _id: req.user.id,
        paidServices: id
      });
    
    if (!hasAccess) {
      serviceObj.contactInfo = '*** Requiere pago para acceder ***';
    }
  }
  
  // Guardar en caché
  cacheService.set(cacheKey, serviceObj);
  
  return responseFormatter.success(res, {
    data: serviceObj,
    message: 'Servicio obtenido correctamente'
  });
});

/**
 * Obtener servicios destacados
 * @route GET /api/services/featured
 */
const getFeaturedServices = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  
  // Intentar obtener de caché primero
  const cacheKey = `services:featured:limit:${limit}`;
  const cachedServices = cacheService.get(cacheKey);
  
  if (cachedServices) {
    return responseFormatter.success(res, {
      data: cachedServices,
      message: 'Servicios destacados obtenidos de caché'
    });
  }
  
  // Consultar servicios destacados (alta valoración, verificados, no premium)
  const featuredServices = await Service.find({
    rating: { $gte: 4 },
    verified: true,
    premiumOnly: false
  })
    .sort({ rating: -1, viewCount: -1 })
    .limit(limit)
    .populate('category', 'name icon')
    .select('-__v');
  
  // Guardar en caché
  cacheService.set(cacheKey, featuredServices);
  
  return responseFormatter.success(res, {
    data: featuredServices,
    message: 'Servicios destacados obtenidos correctamente'
  });
});

/**
 * Crear nuevo servicio
 * @route POST /api/services
 * @access Admin
 */
const createService = asyncHandler(async (req, res) => {
  // Validar datos de entrada
  const { value, error } = validate(req.body, schemas.service);
  
  if (error) {
    return responseFormatter.validationError(res, error);
  }
  
  // Verificar si existe la categoría
  if (!isValidMongoId(value.category)) {
    return responseFormatter.validationError(res, 'ID de categoría inválido');
  }
  
  const category = await Category.findById(value.category);
  
  if (!category) {
    return responseFormatter.validationError(res, 'Categoría no encontrada');
  }
  
  // Crear nuevo servicio
  const service = new Service({
    ...value,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastScraped: new Date()
  });
  
  await service.save();
  
  // Invalidar caché
  cacheService.invalidatePattern(`services:category:${value.category}:*`);
  cacheService.invalidatePattern('services:featured:*');
  
  logger.info(`Nuevo servicio creado: ${service.title}`);
  
  return responseFormatter.success(res, {
    statusCode: 201,
    data: service,
    message: 'Servicio creado correctamente'
  });
});

/**
 * Actualizar servicio
 * @route PUT /api/services/:id
 * @access Admin
 */
const updateService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de servicio inválido');
  }
  
  // Validar datos de entrada
  const { value, error } = validate(req.body, schemas.service);
  
  if (error) {
    return responseFormatter.validationError(res, error);
  }
  
  // Verificar si existe el servicio
  const service = await Service.findById(id);
  
  if (!service) {
    return responseFormatter.notFound(res, 'Servicio no encontrado');
  }
  
  // Si se cambió la categoría, verificar que exista
  if (value.category && value.category !== service.category.toString()) {
    if (!isValidMongoId(value.category)) {
      return responseFormatter.validationError(res, 'ID de categoría inválido');
    }
    
    const category = await Category.findById(value.category);
    
    if (!category) {
      return responseFormatter.validationError(res, 'Categoría no encontrada');
    }
  }
  
  // Actualizar servicio
  const updatedService = await Service.findByIdAndUpdate(
    id,
    {
      ...value,
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );
  
  // Invalidar caché
  cacheService.delete(cacheService.getServicesKey(id));
  cacheService.invalidatePattern(`services:category:${service.category}:*`);
  if (value.category && value.category !== service.category.toString()) {
    cacheService.invalidatePattern(`services:category:${value.category}:*`);
  }
  cacheService.invalidatePattern('services:featured:*');
  
  logger.info(`Servicio actualizado: ${updatedService.title}`);
  
  return responseFormatter.success(res, {
    data: updatedService,
    message: 'Servicio actualizado correctamente'
  });
});

/**
 * Eliminar servicio
 * @route DELETE /api/services/:id
 * @access Admin
 */
const deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de servicio inválido');
  }
  
  // Verificar si existe el servicio
  const service = await Service.findById(id);
  
  if (!service) {
    return responseFormatter.notFound(res, 'Servicio no encontrado');
  }
  
  // Eliminar servicio
  await Service.findByIdAndDelete(id);
  
  // Eliminar referencia en paidServices de usuarios
  await User.updateMany(
    { paidServices: id },
    { $pull: { paidServices: id } }
  );
  
  // Invalidar caché
  cacheService.delete(cacheService.getServicesKey(id));
  cacheService.invalidatePattern(`services:category:${service.category}:*`);
  cacheService.invalidatePattern('services:featured:*');
  
  logger.info(`Servicio eliminado: ${service.title}`);
  
  return responseFormatter.success(res, {
    message: 'Servicio eliminado correctamente'
  });
});

/**
 * Solicitar mejora de descripción con IA
 * @route POST /api/services/:id/enhance
 * @access Admin
 */
const enhanceServiceDescription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de servicio inválido');
  }
  
  // Verificar si existe el servicio
  const service = await Service.findById(id);
  
  if (!service) {
    return responseFormatter.notFound(res, 'Servicio no encontrado');
  }
  
  try {
    // Solicitar mejora al servicio Python
    const result = await pythonApiService.enhanceServiceDescription(id);
    
    if (result.success && result.service) {
      // Actualizar servicio con datos mejorados
      const updatedService = await Service.findByIdAndUpdate(
        id,
        {
          description: result.service.description,
          keywords: result.service.keywords || service.keywords,
          updatedAt: new Date()
        },
        { new: true }
      );
      
      // Invalidar caché
      cacheService.delete(cacheService.getServicesKey(id));
      
      return responseFormatter.success(res, {
        data: updatedService,
        message: 'Descripción del servicio mejorada correctamente'
      });
    }
    
    throw new Error('Error al procesar la mejora del servicio');
  } catch (error) {
    logger.error(`Error al mejorar descripción: ${error.message}`);
    
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al mejorar la descripción del servicio',
      errors: { details: error.message }
    });
  }
});

module.exports = {
  getServicesByCategory,
  getServiceById,
  getFeaturedServices,
  createService,
  updateService,
  deleteService,
  enhanceServiceDescription
};