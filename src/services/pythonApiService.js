/**
 * Servicio para comunicarse con la API de Python
 */
const pythonApi = require('../config/pythonApi');
const logger = require('../utils/logger');

/**
 * Servicio para gestionar la comunicación con el backend de Python
 */
class PythonApiService {
  /**
   * Iniciar una tarea de scraping para una categoría
   * 
   * @param {string} categoryId - ID de la categoría para hacer scraping
   * @param {boolean} forceUpdate - Si se debe forzar la actualización incluso si los datos son recientes
   * @returns {Promise<Object>} Objeto con información de la tarea
   */
  async scrapeCategory(categoryId, forceUpdate = false) {
    try {
      logger.info(`Solicitando scraping para categoría ${categoryId}`);
      
      const response = await pythonApi.client.post('/scrape-category', {
        category_id: categoryId,
        force_update: forceUpdate
      });
      
      if (response.status === 202) {
        logger.info(`Tarea de scraping iniciada: ${response.data.task_id}`);
        return {
          success: true,
          taskId: response.data.task_id,
          message: response.data.message
        };
      }
      
      throw new Error('Respuesta inesperada del servicio de Python');
    } catch (error) {
      logger.error(`Error al iniciar tarea de scraping: ${error.message}`);
      
      if (error.response) {
        logger.error(`Detalles: ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Error al solicitar scraping: ${error.message}`);
    }
  }
  
  /**
   * Realizar una búsqueda personalizada con scraping en tiempo real
   * 
   * @param {string} query - Término de búsqueda
   * @param {string} userId - ID del usuario que realiza la búsqueda (opcional)
   * @returns {Promise<Array>} Resultados de la búsqueda
   */
  async customSearch(query, userId = null) {
    try {
      logger.info(`Realizando búsqueda personalizada: "${query}"`);
      
      const response = await pythonApi.client.post('/custom-search', {
        query,
        user_id: userId
      });
      
      if (response.status === 200) {
        logger.info(`Búsqueda completada: ${response.data.results?.length || 0} resultados`);
        return {
          success: true,
          results: response.data.results || [],
          message: response.data.message
        };
      }
      
      throw new Error('Respuesta inesperada del servicio de Python');
    } catch (error) {
      logger.error(`Error en búsqueda personalizada: ${error.message}`);
      
      if (error.response) {
        logger.error(`Detalles: ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Error en búsqueda personalizada: ${error.message}`);
    }
  }
  
  /**
   * Obtener el estado de una tarea de scraping
   * 
   * @param {string} taskId - ID de la tarea
   * @returns {Promise<Object>} Estado de la tarea
   */
  async getTaskStatus(taskId) {
    try {
      logger.debug(`Consultando estado de tarea ${taskId}`);
      
      const response = await pythonApi.client.get(`/task/${taskId}`);
      
      if (response.status === 200) {
        return {
          success: true,
          task: response.data
        };
      }
      
      throw new Error('Respuesta inesperada del servicio de Python');
    } catch (error) {
      logger.error(`Error al consultar estado de tarea: ${error.message}`);
      
      if (error.response) {
        logger.error(`Detalles: ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Error al consultar estado de tarea: ${error.message}`);
    }
  }
  
  /**
   * Mejorar la descripción de un servicio usando IA
   * 
   * @param {string} serviceId - ID del servicio a mejorar
   * @returns {Promise<Object>} Servicio mejorado
   */
  async enhanceServiceDescription(serviceId) {
    try {
      logger.info(`Solicitando mejora de descripción para servicio ${serviceId}`);
      
      const response = await pythonApi.client.post('/enhance-service', {
        service_id: serviceId
      });
      
      if (response.status === 200) {
        logger.info(`Descripción mejorada para servicio ${serviceId}`);
        return {
          success: true,
          service: response.data.service,
          message: response.data.message
        };
      }
      
      throw new Error('Respuesta inesperada del servicio de Python');
    } catch (error) {
      logger.error(`Error al mejorar descripción: ${error.message}`);
      
      if (error.response) {
        logger.error(`Detalles: ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Error al mejorar descripción del servicio: ${error.message}`);
    }
  }
  
  /**
   * Verificar que el servicio Python está disponible
   * 
   * @returns {Promise<boolean>} True si el servicio está disponible
   */
  async isHealthy() {
    try {
      const isHealthy = await pythonApi.checkApiHealth();
      return isHealthy;
    } catch (error) {
      logger.error(`Error al verificar salud del servicio Python: ${error.message}`);
      return false;
    }
  }
}

module.exports = new PythonApiService();