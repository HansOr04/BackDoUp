/**
 * Servidor principal para ServiceFinder API
 * Node.js Backend con Express
 */
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Importar configuraciones
const { connectDB } = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler, setupUnhandledErrorHandlers } = require('./middleware/errorHandler');
const pythonApi = require('./config/pythonApi');

// Importar rutas
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const worldIdRoutes = require('./routes/worldId');
const paymentRoutes = require('./routes/payments');

// Inicializar la aplicación
const app = express();
const PORT = process.env.PORT || 4000;

// Configurar middleware
app.use(helmet()); // Seguridad

// Configurar CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Parseo de peticiones
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // Parseo de cookies

// Logging de peticiones HTTP
app.use(morgan('combined', { stream: logger.stream }));

// Servir contenido estático (si es necesario)
app.use('/public', express.static(path.join(__dirname, '../public')));

// Conectar a la base de datos
(async () => {
  try {
    await connectDB();
    logger.info('Conexión a MongoDB establecida');
  } catch (error) {
    logger.error(`Error al conectar a MongoDB: ${error.message}`);
    process.exit(1);
  }
})();

// Configurar manejadores de errores no controlados
setupUnhandledErrorHandlers();

// Verificar conexión con Python backend
(async () => {
  try {
    const isHealthy = await pythonApi.checkApiHealth();
    if (isHealthy) {
      logger.info('Conexión con Python backend verificada correctamente');
    } else {
      logger.warn('No se pudo verificar la conexión con Python backend');
    }
  } catch (error) {
    logger.warn(`Error al verificar Python backend: ${error.message}`);
    logger.info('Continuando inicio del servidor sin Python backend');
  }
})();

// Middleware para interceptar y registrar tiempo de respuesta
app.use((req, res, next) => {
  const start = Date.now();
  
  // Función que se ejecuta cuando la respuesta se completa
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Log de rendimiento para peticiones que tardan demasiado
    if (duration > 1000) {
      logger.warn(`Petición lenta: ${req.method} ${req.originalUrl} tomó ${duration}ms`);
    }
  });
  
  next();
});

// Ruta base para verificar API
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'ServiceFinder API',
    version: process.env.API_VERSION || 'v1',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Ruta de estado para health checks
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mongodb: connectDB.isConnectedToDB() ? 'connected' : 'disconnected'
  });
});

// Definir rutas API
app.use('/api/auth', authRoutes);
app.use('/api/worldid', worldIdRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api', apiRoutes); // Rutas generales al final para evitar conflictos

// Manejador de rutas no encontradas
app.use(notFoundHandler);

// Manejador de errores
app.use(errorHandler);

// Iniciar servidor
const server = app.listen(PORT, () => {
  logger.info(`Servidor iniciado en http://localhost:${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Manejar cierre ordenado del servidor
const gracefulShutdown = (signal) => {
  logger.info(`${signal} recibido, cerrando servidor...`);
  
  server.close(async () => {
    logger.info('Servidor HTTP cerrado');
    
    try {
      // Cerrar conexión a MongoDB
      if (connectDB.isConnectedToDB()) {
        await connectDB.closeConnection();
        logger.info('Conexión a MongoDB cerrada');
      }
      
      logger.info('Servidor cerrado correctamente');
      process.exit(0);
    } catch (error) {
      logger.error(`Error durante el cierre: ${error.message}`);
      process.exit(1);
    }
  });
  
  // Forzar cierre después de 10 segundos si no se cierra ordenadamente
  setTimeout(() => {
    logger.error('Forzando cierre después de 10s de timeout');
    process.exit(1);
  }, 10000);
};

// Manejar señales de terminación
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;