
const express = require('express');
const taskController = require('../controllers/taskController');


const router = express.Router();


router.get('/active', taskController.getActiveTasks);



router.post('/:taskId/submit', taskController.submitTaskCompletion);


router.get('/user/:userWalletAddress', taskController.getUserTaskHistory);

module.exports = router;