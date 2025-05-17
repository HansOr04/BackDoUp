/**
 * Servicio para integraciones con World ID
 */
const { verifyCloudProof } = require('@worldcoin/minikit-js');
const axios = require('axios');
const worldAppConfig = require('../config/worldApp').config;
const logger = require('../utils/logger');
const User = require('../models/User');

/**
 * Servicio para gestionar la verificación e interacción con World ID
 */
class WorldIdService {
  /**
   * Verificar una prueba de World ID
   * 
   * @param {Object} payload - Objeto con la prueba y metadata
   * @param {string} action - Acción a verificar
   * @param {string} signal - Señal opcional
   * @returns {Promise<Object>} Resultado de la verificación
   */
  async verifyProof(payload, action, signal) {
    try {
      logger.info(`Verificando prueba World ID para acción: ${action}`);
      
      if (!payload) {
        throw new Error('Payload no proporcionado');
      }
      
      // Verificar la prueba con World ID
      const verifyResult = await verifyCloudProof(
        payload,
        worldAppConfig.appId,
        action,
        signal
      );
      
      logger.info(`Resultado de verificación: ${verifyResult.success ? 'Éxito' : 'Fallo'}`);
      
      if (!verifyResult.success) {
        logger.error(`Error de verificación: ${verifyResult.error}`);
        throw new Error(`Error de verificación World ID: ${verifyResult.error}`);
      }
      
      return {
        success: true,
        nullifierHash: payload.nullifier_hash,
        verificationLevel: payload.verification_level
      };
    } catch (error) {
      logger.error(`Error al verificar prueba World ID: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Actualizar o crear un usuario verificado en la base de datos
   * 
   * @param {string} nullifierHash - Hash de nullifier único del usuario
   * @param {string} verificationLevel - Nivel de verificación (orb, device, phone)
   * @param {string} walletAddress - Dirección de wallet opcional
   * @returns {Promise<Object>} Usuario actualizado o creado
   */
  async updateVerifiedUser(nullifierHash, verificationLevel, walletAddress = null) {
    try {
      // Buscar usuario existente por nullifierHash
      let user = await User.findOne({ nullifierHash });
      
      if (user) {
        // Actualizar usuario existente
        user.verified = true;
        user.verificationLevel = verificationLevel;
        
        // Actualizar dirección de wallet si no tiene una asignada y se proporciona una nueva
        if (walletAddress && !user.walletAddress) {
          user.walletAddress = walletAddress;
        }
        
        await user.save();
        logger.info(`Usuario actualizado con verificación World ID: ${user._id}`);
      } else {
        // Crear nuevo usuario
        user = new User({
          nullifierHash,
          verificationLevel,
          verified: true,
          walletAddress,
          createdAt: new Date()
        });
        
        await user.save();
        logger.info(`Nuevo usuario creado con verificación World ID: ${user._id}`);
      }
      
      return {
        success: true,
        user: {
          id: user._id,
          verified: user.verified,
          verificationLevel: user.verificationLevel,
          walletAddress: user.walletAddress
        }
      };
    } catch (error) {
      logger.error(`Error al actualizar usuario verificado: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Verificar si un usuario está verificado con World ID
   * 
   * @param {string} userId - ID del usuario a verificar
   * @returns {Promise<boolean>} True si el usuario está verificado
   */
  async isUserVerified(userId) {
    try {
      const user = await User.findById(userId);
      return user ? user.verified : false;
    } catch (error) {
      logger.error(`Error al verificar estado de usuario: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Obtener las acciones disponibles para verificación
   * 
   * @returns {Promise<Array>} Lista de acciones configuradas
   */
  async getVerifyActions() {
    try {
      const url = `${worldAppConfig.devPortalUrl}/minikit/actions?app_id=${worldAppConfig.appId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${worldAppConfig.devPortalApiKey}`
        }
      });
      
      if (response.status === 200) {
        return {
          success: true,
          actions: response.data
        };
      }
      
      throw new Error('Error al obtener acciones de verificación');
    } catch (error) {
      logger.error(`Error al obtener acciones de verificación: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new WorldIdService();