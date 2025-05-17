/**
 * Rutas de autenticación
 */
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

// Aplicar limitador a todas las rutas de autenticación
router.use(authLimiter);

// Rutas de autenticación con wallet
router.post('/wallet', authController.authenticateWallet);
router.get('/profile', authenticateUser, authController.getProfile);
router.post('/logout', authController.logout);

module.exports = router;