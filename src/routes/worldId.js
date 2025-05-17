/**
 * Rutas para World ID
 */
const express = require('express');
const router = express.Router();
const { authenticateUser, requireWorldIDVerification } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const worldIdController = require('../controllers/worldIdController');

// Aplicar limitador a rutas de verificación
router.use(authLimiter);

// Rutas de World ID
router.post('/verify', worldIdController.verifyProof);
router.get('/status', authenticateUser, worldIdController.getVerificationStatus);
router.get('/actions', authenticateUser, requireWorldIDVerification, worldIdController.getVerifyActions);

module.exports = router;