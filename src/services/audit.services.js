const pool = require("../config/db");

/**
 * Logs a sensitive system or security event to the audit_logs table.
 * @param {string} eventType - The type of event (from audit_event_type enum)
 * @param {string} userId - The ID of the user involved (optional)
 * @param {object} metadata - Additional JSON data (reasons, IP, old/new values)
 */
const logAuditEvent = async (eventType, userId = null, metadata = {}) => {
    try {
        const query = `
            INSERT INTO audit_logs (event_type, user_id, metadata)
            VALUES ($1, $2, $3)
            RETURNING id, created_at;
        `;
        const { rows } = await pool.query(query, [eventType, userId, JSON.stringify(metadata)]);
        return rows[0];
    } catch (error) {
        // We log the error but don't throw, 
        // to prevent audit failure from crashing primary business logic
        console.error("CRITICAL: Audit Log Failure:", error.message);
        return null;
    }
};

module.exports = { logAuditEvent };
