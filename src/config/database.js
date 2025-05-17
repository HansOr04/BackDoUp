/**
 * Configuración de la conexión a MongoDB para el backend de Node.js
 * Este archivo gestiona la conexión a la base de datos y maneja reconexiones
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Variables de entorno
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/servicefinder';
const DB_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Tiempo de espera para selección de servidor
  socketTimeoutMS: 45000, // Tiempo de espera para operaciones socket
};

// Estado de la conexión
let isConnected = false;

/**
 * Conecta a la base de datos MongoDB
 * @returns {Promise} Promesa que resuelve cuando la conexión se establece
 */
const connectDB = async () => {
  if (isConnected) {
    logger.info('Usando conexión existente a MongoDB');
    return;
  }

  try {
    logger.info('Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI, DB_OPTIONS);
    isConnected = true;
    logger.info('Conexión a MongoDB establecida');
    
    // Eventos de conexión
    mongoose.connection.on('error', (err) => {
      logger.error(`Error en la conexión a MongoDB: ${err.message}`);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB desconectado, intentando reconectar...');
      isConnected = false;
      setTimeout(connectDB, 5000); // Intentar reconexión después de 5 segundos
    });
    
    // Manejo de señales para cierre limpio
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('Conexión a MongoDB cerrada por finalización de la aplicación');
        process.exit(0);
      } catch (err) {
        logger.error(`Error al cerrar conexión MongoDB: ${err}`);
        process.exit(1);
      }
    });
    
  } catch (error) {
    logger.error(`Error al conectar con MongoDB: ${error.message}`);
    isConnected = false;
    
    // Reintentar conexión después de un tiempo
    logger.info('Intentando reconectar en 5 segundos...');
    setTimeout(connectDB, 5000);
  }
};

/**
 * Cierra la conexión a la base de datos
 * @returns {Promise} Promesa que resuelve cuando la conexión se cierra
 */
const closeConnection = async () => {
  if (!isConnected) {
    return;
  }
  
  try {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('Conexión a MongoDB cerrada correctamente');
  } catch (error) {
    logger.error(`Error al cerrar la conexión a MongoDB: ${error.message}`);
    throw error;
  }
};

/**
 * Verifica el estado de la conexión
 * @returns {boolean} Estado de la conexión
 */
const isConnectedToDB = () => isConnected;

module.exports = {
  connectDB,
  closeConnection,
  isConnectedToDB,
  getConnection: () => mongoose.connection
};