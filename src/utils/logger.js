/**
 * Sistema de logging centralizado para la aplicación
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Asegurar que existe el directorio de logs
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Formato personalizado para logs
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    const { timestamp, level, message, ...extra } = info;
    const extraInfo = Object.keys(extra).length ? JSON.stringify(extra) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${extraInfo}`;
  })
);

// Configuración de niveles de log
const levels = {
  error: 0,   // Errores críticos que requieren atención inmediata
  warn: 1,    // Advertencias que pueden indicar problemas potenciales
  info: 2,    // Información general sobre operaciones normales
  http: 3,    // Detalles sobre peticiones HTTP
  debug: 4    // Información detallada para depuración
};

// Determinar nivel de log basado en entorno
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'http';
};

// Crear logger de Winston
const logger = winston.createLogger({
  levels,
  level: level(),
  format: customFormat,
  transports: [
    // Logs de error a archivo separado
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    
    // Todos los logs a archivo combinado
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    }),
    
    // Logs a consola en desarrollo
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        customFormat
      )
    })
  ],
  // No detener la aplicación si el logging falla
  exitOnError: false
});

// Crear un stream para usar con Morgan (HTTP logging)
logger.stream = {
  write: message => logger.http(message.trim())
};

module.exports = logger;