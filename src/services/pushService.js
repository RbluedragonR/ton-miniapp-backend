
const db = require('../config/database');

class PushService {
    async fetchActiveAnnouncements() {
        const query = `
            SELECT 
                announcement_id, title, content, type, image_url, action_url, action_text,
                is_pinned, published_at
            FROM announcements
            WHERE is_active = TRUE
            ORDER BY is_pinned DESC, published_at DESC
            LIMIT 20; -- Add a limit for MVP, can be paginated later
        `;
        const { rows } = await db.query(query);
        return rows;
    }
}

module.exports = new PushService();