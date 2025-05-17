/**
 * Configuración para la comunicación con el backend de Python
 */
const dotenv = require('dotenv');
const axios = require('axios');
const logger = require('../utils/logger');

dotenv.config();

// Configuración de la API de Python
const pythonApiConfig = {
  // URL base de la API de Python
  baseUrl: process.env.PYTHON_API_URL || 'http://localhost:8000',
  
  // Tiempo máximo de espera para requests (ms)
  timeout: parseInt(process.env.PYTHON_API_TIMEOUT || '30000'),
  
  // Número máximo de reintentos para requests fallidos
  maxRetries: parseInt(process.env.PYTHON_API_MAX_RETRIES || '3'),
  
  // API key para autenticación entre servicios (opcional)
  apiKey: process.env.PYTHON_API_KEY
};

// Cliente HTTP configurado para la API de Python
const apiClient = axios.create({
  baseURL: pythonApiConfig.baseUrl,
  timeout: pythonApiConfig.timeout,
  headers: {
    'Content-Type': 'application/json',
    ...(pythonApiConfig.apiKey && { 'X-API-Key': pythonApiConfig.apiKey })
  }
});

// Interceptor para logging
apiClient.interceptors.request.use(config => {
  logger.debug(`Python API Request: ${config.method.toUpperCase()} ${config.url}`);
  return config;
});

apiClient.interceptors.response.use(
  response => {
    logger.debug(`Python API Response: ${response.status} from ${response.config.url}`);
    return response;
  },
  async error => {
    if (error.response) {
      logger.error(`Python API Error: ${error.response.status} - ${error.response.data.message || 'Unknown error'}`);
    } else if (error.request) {
      logger.error(`Python API No Response: ${error.message}`);
    } else {
      logger.error(`Python API Request Error: ${error.message}`);
    }
    
    // Implementación de reintentos para errores de red o timeouts
    const originalRequest = error.config;
    if (
      (error.code === 'ECONNABORTED' || !error.response) && 
      originalRequest && 
      !originalRequest._retry && 
      originalRequest._retryCount < pythonApiConfig.maxRetries
    ) {
      originalRequest._retry = true;
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      
      logger.info(`Reintentando petición a Python API (${originalRequest._retryCount}/${pythonApiConfig.maxRetries})`);
      
      // Delay exponencial entre reintentos
      const delay = Math.pow(2, originalRequest._retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return apiClient(originalRequest);
    }
    
    return Promise.reject(error);
  }
);

// Verificar disponibilidad de la API de Python
const checkApiHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    if (response.status === 200) {
      logger.info('Python API health check: OK');
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Python API health check failed: ${error.message}`);
    return false;
  }
};

module.exports = {
  config: pythonApiConfig,
  client: apiClient,
  checkApiHealth
};