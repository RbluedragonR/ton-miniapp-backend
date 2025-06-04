
const pushService = require('../services/pushService');

exports.getAnnouncements = async (req, res, next) => {
    try {
        // You could add query parameters for pagination later if needed (e.g., ?page=1&limit=10)
        const announcements = await pushService.fetchActiveAnnouncements();
        res.status(200).json(announcements);
    } catch (error) {
        console.error("CTRL: Error in getAnnouncements:", error.message);
        next(error);
    }
};