/**
 * Servicio de caché para optimizar rendimiento
 */
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

/**
 * Servicio para gestionar caché en memoria
 */
class CacheService {
  constructor() {
    // Crear caché con tiempo de vida predeterminado de 10 minutos
    this.cache = new NodeCache({
      stdTTL: 600, // 10 minutos en segundos
      checkperiod: 120, // Verificar expiración cada 2 minutos
      useClones: false // Para mejorar rendimiento, no clonar objetos
    });
    
    // Configuración de tiempos de caché para diferentes tipos de datos (en segundos)
    this.cacheTTL = {
      categories: 3600, // 1 hora para categorías
      services: 1800, // 30 minutos para servicios
      search: 300, // 5 minutos para resultados de búsqueda
      user: 60, // 1 minuto para datos de usuario
      default: 600 // 10 minutos por defecto
    };
    
    // Estadísticas de caché
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
    
    // Registrar evento de expiración
    this.cache.on('expired', (key, value) => {
      logger.debug(`Caché expirada para clave: ${key}`);
    });
    
    logger.info('Servicio de caché inicializado');
  }
  
  /**
   * Obtener un valor de la caché
   * 
   * @param {string} key - Clave de caché
   * @returns {*} Valor de caché o undefined si no existe
   */
  get(key) {
    const value = this.cache.get(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      logger.debug(`Caché HIT: ${key}`);
    } else {
      this.stats.misses++;
      logger.debug(`Caché MISS: ${key}`);
    }
    
    return value;
  }
  
  /**
   * Guardar un valor en la caché
   * 
   * @param {string} key - Clave de caché
   * @param {*} value - Valor a almacenar
   * @param {number} ttl - Tiempo de vida en segundos (opcional)
   * @returns {boolean} True si se guardó correctamente
   */
  set(key, value, ttl = null) {
    if (value === undefined || value === null) {
      logger.warn(`Intento de almacenar valor nulo en caché: ${key}`);
      return false;
    }
    
    // Usar TTL específico o el predeterminado para el tipo de clave
    const cacheTTL = ttl || this.getCacheTTLForKey(key);
    const success = this.cache.set(key, value, cacheTTL);
    
    if (success) {
      this.stats.sets++;
      logger.debug(`Caché SET: ${key} (TTL: ${cacheTTL}s)`);
    }
    
    return success;
  }
  
  /**
   * Eliminar una clave de la caché
   * 
   * @param {string} key - Clave a eliminar
   * @returns {number} Número de elementos eliminados (0 o 1)
   */
  delete(key) {
    const deleted = this.cache.del(key);
    
    if (deleted > 0) {
      logger.debug(`Caché DELETE: ${key}`);
    }
    
    return deleted;
  }
  
  /**
   * Invalidar todas las claves que coincidan con un patrón
   * 
   * @param {string} pattern - Patrón de clave para eliminar (por ejemplo, "services:*")
   * @returns {number} Número de elementos eliminados
   */
  invalidatePattern(pattern) {
    // Convertir el patrón a expresión regular
    const regex = new RegExp(pattern.replace('*', '.*'));
    
    // Obtener todas las claves de la caché
    const keys = this.cache.keys();
    
    // Filtrar las claves que coinciden con el patrón
    const matchingKeys = keys.filter(key => regex.test(key));
    
    // Eliminar las claves coincidentes
    let deletedCount = 0;
    matchingKeys.forEach(key => {
      this.cache.del(key);
      deletedCount++;
    });
    
    if (deletedCount > 0) {
      logger.info(`Invalidadas ${deletedCount} claves con patrón: ${pattern}`);
    }
    
    return deletedCount;
  }
  
  /**
   * Limpiar toda la caché
   * 
   * @returns {boolean} True si se limpió correctamente
   */
  clear() {
    this.cache.flushAll();
    logger.info('Caché limpiada completamente');
    return true;
  }
  
  /**
   * Obtener estadísticas de la caché
   * 
   * @returns {Object} Estadísticas de uso de caché
   */
  getStats() {
    // Combinar estadísticas propias con las del objeto cache
    const cacheStats = this.cache.getStats();
    
    return {
      ...this.stats,
      keys: this.cache.keys().length,
      memory: cacheStats.vsize,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100) 
        : 0
    };
  }
  
  /**
   * Determinar el TTL apropiado para una clave según su tipo
   * 
   * @param {string} key - Clave de caché
   * @returns {number} TTL en segundos
   */
  getCacheTTLForKey(key) {
    // Detectar tipo de clave basado en prefijo
    if (key.startsWith('categories:')) {
      return this.cacheTTL.categories;
    } else if (key.startsWith('services:')) {
      return this.cacheTTL.services;
    } else if (key.startsWith('search:')) {
      return this.cacheTTL.search;
    } else if (key.startsWith('user:')) {
      return this.cacheTTL.user;
    }
    
    return this.cacheTTL.default;
  }
  
  /**
   * Construir una clave de caché para categorías
   * 
   * @param {string} categoryId - ID de categoría o "all" para todas
   * @returns {string} Clave formateada
   */
  getCategoryKey(categoryId = 'all') {
    return `categories:${categoryId}`;
  }
  
  /**
   * Construir una clave de caché para servicios
   * 
   * @param {string} serviceId - ID de servicio o null
   * @param {string} categoryId - ID de categoría o null
   * @param {number} page - Número de página
   * @param {number} limit - Límite por página
   * @returns {string} Clave formateada
   */
  getServicesKey(serviceId = null, categoryId = null, page = 1, limit = 20) {
    if (serviceId) {
      return `services:id:${serviceId}`;
    }
    
    if (categoryId) {
      return `services:category:${categoryId}:page:${page}:limit:${limit}`;
    }
    
    return `services:all:page:${page}:limit:${limit}`;
  }
  
  /**
   * Construir una clave de caché para búsquedas
   * 
   * @param {string} query - Consulta de búsqueda
   * @param {Object} filters - Filtros aplicados
   * @returns {string} Clave formateada
   */
  getSearchKey(query, filters = {}) {
    // Normalizar la consulta (minúsculas, eliminar espacios extras)
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Convertir filtros a string ordenado para consistencia
    const filtersStr = Object.entries(filters)
      .filter(([_, value]) => value !== null && value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    
    return `search:q:${normalizedQuery}${filtersStr ? `:filters:${filtersStr}` : ''}`;
  }
  
  /**
   * Construir una clave de caché para usuarios
   * 
   * @param {string} userId - ID del usuario
   * @param {string} type - Tipo de información (profile, services, etc.)
   * @returns {string} Clave formateada
   */
  getUserKey(userId, type = 'profile') {
    return `user:${userId}:${type}`;
  }
}

module.exports = new CacheService();