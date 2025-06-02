// File: ar_backend/src/routes/taskRoutes.js
const express = require('express');
const taskController = require('../controllers/taskController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional: if auth is needed

const router = express.Router();

// GET /api/tasks/active - Get all active tasks for display
router.get('/active', taskController.getActiveTasks);

// POST /api/tasks/:taskId/submit - User submits a task completion
// :taskId should be the integer ID from the tasks table
router.post('/:taskId/submit', taskController.submitTaskCompletion);

// GET /api/tasks/user/:userWalletAddress - Get a user's task completion history
router.get('/user/:userWalletAddress', taskController.getUserTaskHistory);

module.exports = router;