// File: AR_Proj/ar_backend/src/routes/pushRoutes.js
const express = require('express');
const pushController = require('../controllers/pushController');

const router = express.Router();

// GET /api/push/announcements - Get all active and pinned announcements
router.get('/announcements', pushController.getAnnouncements);

module.exports = router;