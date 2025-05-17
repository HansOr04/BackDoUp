/**
 * Rutas API principales
 */
const express = require('express');
const router = express.Router();
const { authenticateUser, requireWorldIDVerification } = require('../middleware/auth');
const { globalLimiter, searchLimiter, scrapingLimiter } = require('../middleware/rateLimiter');

// Importar controladores
const categoryController = require('../controllers/categoryController');
const serviceController = require('../controllers/serviceController');
const searchController = require('../controllers/searchController');

// Aplicar limitador global a todas las rutas
router.use(globalLimiter);

// Rutas de categorías
router.get('/categories', categoryController.getAllCategories);
router.get('/categories/:id', categoryController.getCategoryById);
router.get('/categories/:id/services', serviceController.getServicesByCategory);
router.post('/categories', authenticateUser, requireWorldIDVerification, categoryController.createCategory);
router.put('/categories/:id', authenticateUser, requireWorldIDVerification, categoryController.updateCategory);
router.delete('/categories/:id', authenticateUser, requireWorldIDVerification, categoryController.deleteCategory);
router.post('/categories/:id/scrape', authenticateUser, requireWorldIDVerification, scrapingLimiter, categoryController.scrapeCategory);

// Rutas de servicios
router.get('/services/featured', serviceController.getFeaturedServices);
router.get('/services/:id', serviceController.getServiceById);
router.post('/services', authenticateUser, requireWorldIDVerification, serviceController.createService);
router.put('/services/:id', authenticateUser, requireWorldIDVerification, serviceController.updateService);
router.delete('/services/:id', authenticateUser, requireWorldIDVerification, serviceController.deleteService);
router.post('/services/:id/enhance', authenticateUser, requireWorldIDVerification, scrapingLimiter, serviceController.enhanceServiceDescription);

// Rutas de búsqueda
router.post('/search', searchLimiter, searchController.search);
router.get('/search/recent', authenticateUser, searchController.getRecentSearches);
router.delete('/search/recent', authenticateUser, searchController.clearRecentSearches);

module.exports = router;