/**
 * Rutas para pagos
 */
const express = require('express');
const router = express.Router();
const { authenticateUser, verifyServiceAccess } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const paymentController = require('../controllers/paymentController');

// Aplicar limitador a rutas de pago
router.use(paymentLimiter);

// Rutas de pagos
router.post('/initiate', authenticateUser, paymentController.initiatePayment);
router.post('/confirm', authenticateUser, paymentController.confirmPayment);
router.get('/history', authenticateUser, paymentController.getTransactionHistory);
router.get('/:reference', authenticateUser, paymentController.getTransactionDetails);

module.exports = router;