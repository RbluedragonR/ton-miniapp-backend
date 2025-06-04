
const express = require('express');
const pushController = require('../controllers/pushController');

const router = express.Router();


router.get('/announcements', pushController.getAnnouncements);

module.exports = router;