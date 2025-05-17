/**
 * Configuración para la integración con World App
 */
const dotenv = require('dotenv');
dotenv.config();

// Configuración de World App
const worldAppConfig = {
  // ID de aplicación en World App
  appId: process.env.WORLD_APP_ID || 'app_placeholder_id',
  
  // URL base para API de World App Developer Portal
  devPortalUrl: process.env.DEV_PORTAL_URL || 'https://developer.worldcoin.org/api/v2',
  
  // API key para el Developer Portal
  devPortalApiKey: process.env.DEV_PORTAL_API_KEY,
  
  // Acción de verificación para World ID
  verifyAction: process.env.WORLD_ID_ACTION || 'service-finder-verify',
  
  // Dirección de billetera para recibir pagos
  paymentWalletAddress: process.env.PAYMENT_WALLET_ADDRESS,
  
  // Network a utilizar (worldchain, etc.)
  network: process.env.WORLD_NETWORK || 'worldchain',
  
  // Tokens soportados para pagos
  supportedTokens: ['WLD', 'USDC.e'],
  
  // Precio en WLD para acceder a detalles de contacto
  contactAccessPrice: 1, // 1 WLD
};

// Validar configuración crítica
const validateConfig = () => {
  const requiredFields = ['appId', 'devPortalApiKey', 'paymentWalletAddress'];
  const missingFields = requiredFields.filter(field => 
    !worldAppConfig[field] || worldAppConfig[field].includes('placeholder')
  );
  
  if (missingFields.length > 0) {
    console.warn(`ADVERTENCIA: Faltan configuraciones críticas para World App: ${missingFields.join(', ')}`);
    return false;
  }
  return true;
};

// Función para obtener headers para API del Developer Portal
const getDevPortalHeaders = () => {
  return {
    'Authorization': `Bearer ${worldAppConfig.devPortalApiKey}`,
    'Content-Type': 'application/json'
  };
};

module.exports = {
  config: worldAppConfig,
  validateConfig,
  getDevPortalHeaders
};