/**
 * Controlador para búsquedas de servicios
 */
const Service = require('../models/Service');
const Category = require('../models/Category');
const User = require('../models/User');
const responseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');
const { schemas, validate } = require('../utils/validators');
const cacheService = require('../services/cacheService');
const pythonApiService = require('../services/pythonApiService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Realizar búsqueda de servicios
 * @route POST /api/search
 */
const search = asyncHandler(async (req, res) => {
  // Validar parámetros de búsqueda
  const { value, error } = validate(req.body, schemas.search);
  
  if (error) {
    return responseFormatter.validationError(res, error);
  }
  
  // Extraer parámetros de búsqueda
  const { query, category, location, price, page = 1, limit = 20 } = value;
  
  // Filtros para la consulta
  const filters = {
    category: category || undefined,
    location: location ? { $regex: location, $options: 'i' } : undefined,
    price: price || undefined
  };
  
  // Eliminar filtros undefined
  Object.keys(filters).forEach(key => {
    if (filters[key] === undefined) {
      delete filters[key];
    }
  });
  
  // Comprobar si tenemos resultados en caché
  const cacheKey = cacheService.getSearchKey(query, { category, location, price, page, limit });
  const cachedResults = cacheService.get(cacheKey);
  
  if (cachedResults) {
    logger.debug(`Resultados de búsqueda encontrados en caché: "${query}"`);
    return responseFormatter.paginated(res, {
      data: cachedResults.data,
      page: cachedResults.page,
      limit: cachedResults.limit,
      total: cachedResults.total,
      message: 'Resultados de búsqueda obtenidos de caché'
    });
  }
  
  // Verificar si hay resultados en la base de datos local primero
  try {
    // Búsqueda de texto completo en MongoDB
    const searchQuery = {
      $text: { $search: query },
      ...filters
    };
    
    // Para usuarios no autenticados o sin verificación, solo mostrar servicios no premium
    if (!req.user || !req.user.verified) {
      searchQuery.premiumOnly = false;
    }
    
    // Calcular skip para paginación
    const skip = (page - 1) * limit;
    
    // Ejecutar consulta con contador
    const [services, total] = await Promise.all([
      Service.find(searchQuery, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, rating: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name icon')
        .select('-__v'),
      Service.countDocuments(searchQuery)
    ]);
    
    // Si encontramos suficientes resultados, devolverlos directamente
    if (services.length >= 5 || total >= 10) {
      logger.info(`Búsqueda encontró ${total} resultados locales para: "${query}"`);
      
      // Transformar servicios para ocultar información sensible
      const transformedServices = services.map(service => {
        const serviceObj = service.toObject();
        
        // Ocultar información de contacto para servicios premium
        if (service.premiumOnly) {
          serviceObj.contactInfo = '*** Requiere pago para acceder ***';
        }
        
        return serviceObj;
      });
      
      // Guardar resultados en caché
      const result = {
        data: transformedServices,
        page,
        limit,
        total
      };
      
      cacheService.set(cacheKey, result);
      
      // Si el usuario está autenticado, registrar la búsqueda
      if (req.user && req.user.id) {
        try {
          const user = await User.findById(req.user.id);
          if (user) {
            user.addRecentSearch(query);
            await user.save();
          }
        } catch (error) {
          logger.error(`Error al registrar búsqueda de usuario: ${error.message}`);
        }
      }
      
      return responseFormatter.paginated(res, {
        data: transformedServices,
        page,
        limit,
        total,
        message: 'Resultados de búsqueda obtenidos correctamente'
      });
    }
    
    // Si hay pocos resultados o ninguno, intentar con el servicio de Python
    logger.info(`Búsqueda local insuficiente (${services.length}/${total}), consultando servicio de scraping para: "${query}"`);
    
    // Obtener resultados del servicio de Python con scraping en tiempo real
    const userId = req.user ? req.user.id : null;
    const pythonResults = await pythonApiService.customSearch(query, userId);
    
    if (pythonResults.success && pythonResults.results.length > 0) {
      // Procesar los nuevos resultados
      const newServices = [];
      
      // Intentar guardar cada resultado en la base de datos
      for (const result of pythonResults.results) {
        try {
          // Si se proporcionó category como nombre en lugar de ID, buscar la categoría correspondiente
          let categoryId = category;
          
          if (result.category && typeof result.category === 'string' && !mongoose.Types.ObjectId.isValid(result.category)) {
            const foundCategory = await Category.findOne({ 
              name: { $regex: new RegExp(result.category, 'i') } 
            });
            
            if (foundCategory) {
              categoryId = foundCategory._id;
            }
          }
          
          // Verificar si ya existe un servicio similar
          const existingService = await Service.findOne({
            $or: [
              { sourceUrl: result.sourceUrl },
              { 
                title: { $regex: new RegExp(result.title.substring(0, 20), 'i') },
                category: categoryId
              }
            ]
          });
          
          if (existingService) {
            newServices.push(existingService);
          } else {
            // Crear nuevo servicio con los resultados del scraping
            const newService = new Service({
              title: result.title,
              description: result.description,
              category: categoryId,
              price: result.price || '$$',
              location: result.location || 'No especificada',
              rating: result.rating || 0,
              relevance: result.relevance || 0,
              keywords: result.keywords || [],
              contactInfo: result.contactInfo || 'Información no disponible',
              imageUrl: result.imageUrl,
              sourceUrl: result.sourceUrl,
              premiumOnly: true, // Los resultados de scraping requieren pago por defecto
              verified: false,
              lastScraped: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            });
            
            await newService.save();
            newServices.push(newService);
          }
        } catch (error) {
          logger.error(`Error al guardar resultado de scraping: ${error.message}`);
        }
      }
      
      // Combinar resultados locales con los nuevos (eliminando duplicados)
      const combinedServicesMap = new Map();
      
      // Añadir servicios locales al mapa
      services.forEach(service => {
        combinedServicesMap.set(service._id.toString(), service);
      });
      
      // Añadir nuevos servicios al mapa (sin duplicados)
      newServices.forEach(service => {
        if (!combinedServicesMap.has(service._id.toString())) {
          combinedServicesMap.set(service._id.toString(), service);
        }
      });
      
// Convertir mapa a array y ordenar por relevancia/rating
      const combinedServices = Array.from(combinedServicesMap.values())
        .sort((a, b) => {
          // Primero por relevancia (si existe)
          if (a.relevance !== undefined && b.relevance !== undefined) {
            return b.relevance - a.relevance;
          }
          // Luego por rating
          return b.rating - a.rating;
        });
      
      // Aplicar paginación a los resultados combinados
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedServices = combinedServices.slice(startIndex, endIndex);
      
      // Transformar servicios para ocultar información sensible
      const transformedServices = paginatedServices.map(service => {
        const serviceObj = service.toObject ? service.toObject() : {...service};
        
        // Ocultar información de contacto para servicios premium
        if (service.premiumOnly) {
          serviceObj.contactInfo = '*** Requiere pago para acceder ***';
        }
        
        return serviceObj;
      });
      
      // Guardar resultados en caché
      const result = {
        data: transformedServices,
        page,
        limit,
        total: combinedServices.length
      };
      
      cacheService.set(cacheKey, result);
      
      // Si el usuario está autenticado, registrar la búsqueda
      if (req.user && req.user.id) {
        try {
          const user = await User.findById(req.user.id);
          if (user) {
            user.addRecentSearch(query);
            await user.save();
          }
        } catch (error) {
          logger.error(`Error al registrar búsqueda de usuario: ${error.message}`);
        }
      }
      
      return responseFormatter.paginated(res, {
        data: transformedServices,
        page,
        limit,
        total: combinedServices.length,
        message: 'Resultados de búsqueda obtenidos correctamente (combinados)'
      });
    }
    
    // Si no hay resultados de Python, devolver los resultados locales (aunque sean pocos)
    logger.info(`Sin resultados adicionales del servicio de scraping, devolviendo ${services.length} resultados locales para: "${query}"`);
    
    // Transformar servicios para ocultar información sensible
    const transformedServices = services.map(service => {
      const serviceObj = service.toObject();
      
      // Ocultar información de contacto para servicios premium
      if (service.premiumOnly) {
        serviceObj.contactInfo = '*** Requiere pago para acceder ***';
      }
      
      return serviceObj;
    });
    
    // Guardar resultados en caché
    const result = {
      data: transformedServices,
      page,
      limit,
      total
    };
    
    cacheService.set(cacheKey, result);
    
    // Si el usuario está autenticado, registrar la búsqueda
    if (req.user && req.user.id) {
      try {
        const user = await User.findById(req.user.id);
        if (user) {
          user.addRecentSearch(query);
          await user.save();
        }
      } catch (error) {
        logger.error(`Error al registrar búsqueda de usuario: ${error.message}`);
      }
    }
    
    return responseFormatter.paginated(res, {
      data: transformedServices,
      page,
      limit,
      total,
      message: 'Resultados de búsqueda obtenidos correctamente'
    });
  } catch (error) {
    logger.error(`Error en búsqueda: ${error.message}`);
    
    return responseFormatter.error(res, {
      statusCode: 500,
      message: 'Error al procesar la búsqueda',
      errors: { details: error.message }
    });
  }
});

/**
 * Obtener búsquedas recientes del usuario
 * @route GET /api/search/recent
 * @access Private
 */
const getRecentSearches = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  // Intentar obtener de caché primero
  const cacheKey = cacheService.getUserKey(req.user.id, 'recent-searches');
  const cachedSearches = cacheService.get(cacheKey);
  
  if (cachedSearches) {
    return responseFormatter.success(res, {
      data: cachedSearches,
      message: 'Búsquedas recientes obtenidas de caché'
    });
  }
  
  // Buscar usuario y obtener búsquedas recientes
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return responseFormatter.notFound(res, 'Usuario no encontrado');
  }
  
  // Guardar en caché (con TTL bajo para mantener actualizado)
  cacheService.set(cacheKey, user.recentSearches, 60); // 60 segundos
  
  return responseFormatter.success(res, {
    data: user.recentSearches,
    message: 'Búsquedas recientes obtenidas correctamente'
  });
});

/**
 * Borrar búsquedas recientes del usuario
 * @route DELETE /api/search/recent
 * @access Private
 */
const clearRecentSearches = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return responseFormatter.unauthorized(res, 'Autenticación requerida');
  }
  
  // Actualizar usuario para eliminar búsquedas recientes
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { recentSearches: [] },
    { new: true }
  );
  
  if (!user) {
    return responseFormatter.notFound(res, 'Usuario no encontrado');
  }
  
  // Invalidar caché
  cacheService.delete(cacheService.getUserKey(req.user.id, 'recent-searches'));
  
  return responseFormatter.success(res, {
    message: 'Búsquedas recientes eliminadas correctamente'
  });
});

module.exports = {
  search,
  getRecentSearches,
  clearRecentSearches
};