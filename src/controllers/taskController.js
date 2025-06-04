
const taskService = require('../services/taskService');
const { Address } = require('@ton/core'); // For address validation

// Helper to validate TON address string
const isValidTonAddress = (addr) => {
    try {
        Address.parse(addr);
        return true;
    } catch (e) {
        return false;
    }
};

exports.getActiveTasks = async (req, res, next) => {
    try {
        const userWalletAddress = req.query.userWalletAddress; // Optional: to get completion status for this user
        if (userWalletAddress && !isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format in query." });
        }
        const tasks = await taskService.fetchActiveTasks(userWalletAddress);
        res.status(200).json(tasks);
    } catch (error) {
        console.error("CTRL: Error in getActiveTasks:", error.message);
        next(error);
    }
};

exports.submitTaskCompletion = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const { userWalletAddress, submissionData } = req.body;

        if (!userWalletAddress || !isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Valid userWalletAddress is required." });
        }
        if (!taskId || isNaN(parseInt(taskId))) {
            return res.status(400).json({ message: "Valid taskId parameter is required." });
        }
        // submissionData can be null/undefined for tasks like 'auto_approve'

        const result = await taskService.recordTaskSubmission(userWalletAddress, parseInt(taskId), submissionData);
        res.status(201).json(result);
    } catch (error) {
        console.error("CTRL: Error in submitTaskCompletion:", error.message, error.stack);
        if (error.message.includes("Task not found") || error.message.includes("not active") || error.message.includes("already completed") || error.message.includes("limit reached")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.getUserTaskHistory = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        if (!userWalletAddress || !isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Valid userWalletAddress parameter is required." });
        }
        const history = await taskService.fetchUserTaskCompletions(userWalletAddress);
        res.status(200).json(history);
    } catch (error) {
        console.error("CTRL: Error in getUserTaskHistory:", error.message);
        next(error);
    }
};