/**
 * Controlador para gestión de categorías
 */
const Category = require('../models/Category');
const Service = require('../models/Service');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const { schemas, validate, isValidMongoId } = require('../utils/validators');
const cacheService = require('../services/cacheService');
const pythonApiService = require('../services/pythonApiService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Obtener todas las categorías
 * @route GET /api/categories
 */
const getAllCategories = asyncHandler(async (req, res) => {
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getCategoryKey('all');
  const cachedCategories = cacheService.get(cacheKey);
  
  if (cachedCategories) {
    return responseFormatter.success(res, {
      data: cachedCategories,
      message: 'Categorías obtenidas de caché'
    });
  }
  
  // Ordenar por displayOrder y luego por nombre
  const categories = await Category.find({ isActive: true })
    .sort({ displayOrder: 1, name: 1 })
    .select('-__v');
  
  // Guardar en caché
  cacheService.set(cacheKey, categories);
  
  return responseFormatter.success(res, {
    data: categories,
    message: 'Categorías obtenidas correctamente'
  });
});

/**
 * Obtener categoría por ID
 * @route GET /api/categories/:id
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de categoría inválido');
  }
  
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getCategoryKey(id);
  const cachedCategory = cacheService.get(cacheKey);
  
  if (cachedCategory) {
    return responseFormatter.success(res, {
      data: cachedCategory,
      message: 'Categoría obtenida de caché'
    });
  }
  
  const category = await Category.findById(id).select('-__v');
  
  if (!category) {
    return responseFormatter.notFound(res, 'Categoría no encontrada');
  }
  
  // Guardar en caché
  cacheService.set(cacheKey, category);
  
  return responseFormatter.success(res, {
    data: category,
    message: 'Categoría obtenida correctamente'
  });
});

/**
 * Crear nueva categoría
 * @route POST /api/categories
 * @access Admin
 */
const createCategory = asyncHandler(async (req, res) => {
  // Validar datos de entrada
  const { value, error } = validate(req.body, schemas.category);
  
  if (error) {
    return responseFormatter.validationError(res, error);
  }
  
  // Verificar si ya existe una categoría con el mismo nombre
  const existingCategory = await Category.findOne({ name: value.name });
  
  if (existingCategory) {
    return responseFormatter.error(res, {
      statusCode: 409,
      message: 'Ya existe una categoría con este nombre'
    });
  }
  
  // Crear nueva categoría
  const category = new Category(value);
  await category.save();
  
  // Invalidar caché de categorías
  cacheService.invalidatePattern('categories:*');
  
  logger.info(`Nueva categoría creada: ${category.name}`);
  
  return responseFormatter.success(res, {
    statusCode: 201,
    data: category,
    message: 'Categoría creada correctamente'
  });
});

/**
 * Actualizar categoría
 * @route PUT /api/categories/:id
 * @access Admin
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de categoría inválido');
  }
  
  // Validar datos de entrada
  const { value, error } = validate(req.body, schemas.category);
  
  if (error) {
    return responseFormatter.validationError(res, error);
  }
  
  // Verificar si existe la categoría
  const category = await Category.findById(id);
  
  if (!category) {
    return responseFormatter.notFound(res, 'Categoría no encontrada');
  }
  
  // Si se cambió el nombre, verificar que no exista otra categoría con ese nombre
  if (value.name && value.name !== category.name) {
    const existingCategory = await Category.findOne({ 
      name: value.name, 
      _id: { $ne: id } 
    });
    
    if (existingCategory) {
      return responseFormatter.error(res, {
        statusCode: 409,
        message: 'Ya existe otra categoría con este nombre'
      });
    }
  }
  
  // Actualizar categoría
  const updatedCategory = await Category.findByIdAndUpdate(
    id,
    value,
    { new: true, runValidators: true }
  );
  
  // Invalidar caché
  cacheService.invalidatePattern(`categories:*`);
  cacheService.invalidatePattern(`services:category:${id}:*`);
  
  logger.info(`Categoría actualizada: ${updatedCategory.name}`);
  
  return responseFormatter.success(res, {
    data: updatedCategory,
    message: 'Categoría actualizada correctamente'
  });
});

/**
 * Eliminar categoría
 * @route DELETE /api/categories/:id
 * @access Admin
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de categoría inválido');
  }
  
  // Verificar si existen servicios asociados a esta categoría
  const servicesCount = await Service.countDocuments({ category: id });
  
  if (servicesCount > 0) {
    return responseFormatter.error(res, {
      statusCode: 400,
      message: `No se puede eliminar la categoría porque tiene ${servicesCount} servicios asociados`
    });
  }
  
  // Eliminar categoría
  const deletedCategory = await Category.findByIdAndDelete(id);
  
  if (!deletedCategory) {
    return responseFormatter.notFound(res, 'Categoría no encontrada');
  }
  
  // Invalidar caché
  cacheService.invalidatePattern(`categories:*`);
  cacheService.invalidatePattern(`services:category:${id}:*`);
  
  logger.info(`Categoría eliminada: ${deletedCategory.name}`);
  
  return responseFormatter.success(res, {
    message: 'Categoría eliminada correctamente'
  });
});

/**
 * Solicitar scraping de una categoría
 * @route POST /api/categories/:id/scrape
 * @access Admin
 */
const scrapeCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { forceUpdate = false } = req.body;
  
  if (!isValidMongoId(id)) {
    return responseFormatter.validationError(res, 'ID de categoría inválido');
  }
  
  // Verificar si existe la categoría
  const category = await Category.findById(id);
  
  if (!category) {
    return responseFormatter.notFound(res, 'Categoría no encontrada');
  }
  
  try {
    // Solicitar scraping al servicio Python
    const result = await pythonApiService.scrapeCategory(id, forceUpdate);
    
    // Actualizar timestamp de última actualización en la categoría
    category.lastUpdated = new Date();
    await category.save();
    
    return responseFormatter.success(res, {
      statusCode: 202, // Accepted
      data: {
        taskId: result.taskId,
        category: {
          id: category._id,
          name: category.name
        }
      },
      message: 'Tarea de scraping iniciada correctamente'
    });
  } catch (error) {
    logger.error(`Error al solicitar scraping: ${error.message}`);
    
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al iniciar tarea de scraping',
      errors: { details: error.message }
    });
  }
});

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  scrapeCategory
};