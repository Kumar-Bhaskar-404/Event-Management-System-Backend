const pool = require("../config/db");

const getDashboardStats = async () => {
    // 1. Revenue Analytics (Lifetime & Monthly)
    const revenueQuery = `
        SELECT 
            COALESCE(SUM(amount), 0) as total,
            COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) as monthly
        FROM payments 
        WHERE status = 'successful'
    `;
    const { rows: [revenue] } = await pool.query(revenueQuery);

    // 2. Refund Analytics (New)
    const refundQuery = `
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(amount), 0) as total
        FROM refunds 
        WHERE status = 'successful'
    `;
    const { rows: [refunds] } = await pool.query(refundQuery);

    // 3. System Counts & Moderation Statuses
    const countsQuery = `
        SELECT 
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM users WHERE is_active = false) as blocked_users,
            (SELECT COUNT(*) FROM users WHERE role = 'vendor') as total_vendors,
            (SELECT COUNT(*) FROM bookings WHERE event_start >= NOW()) as upcoming_events,
            (SELECT COUNT(*) FROM vendor_requests WHERE status = 'pending') as pending_verifications,
            (SELECT COUNT(*) FROM vendor_requests WHERE status = 'approved') as approved_vendors_count
        FROM (SELECT 1) AS dummy
    `;
    const { rows: [counts] } = await pool.query(countsQuery);

    // 4. Audit & Insights
    const auditQuery = `
        SELECT 
            COUNT(*) FILTER (WHERE event_type = 'account_deletion') as deletion_count,
            COUNT(*) FILTER (WHERE event_type = 'security_breach') as breach_count
        FROM audit_logs
        WHERE created_at >= date_trunc('month', NOW())
    `;
    const { rows: [audit] } = await pool.query(auditQuery);

    return {
        revenue: {
            lifetime: parseFloat(revenue.total),
            monthly: parseFloat(revenue.monthly)
        },
        refunds: {
            total_count: parseInt(refunds.count),
            total_value: parseFloat(refunds.total)
        },
        stats: {
            total_users: parseInt(counts.total_users),
            blocked_users: parseInt(counts.blocked_users),
            total_vendors: parseInt(counts.total_vendors),
            approved_vendors: parseInt(counts.approved_vendors_count),
            upcoming_events: parseInt(counts.upcoming_events),
            pending_verifications: parseInt(counts.pending_verifications),
            monthly_deletions: parseInt(audit.deletion_count)
        }
    };
};

const getModerationQueue = async () => {
    const query = `
        SELECT 
            u.id as vendor_id,
            u.full_name,
            u.email,
            COUNT(vr.id) as report_count,
            ARRAY_AGG(vr.reason) as reasons
        FROM users u
        JOIN vendor_reports vr ON u.id = vr.vendor_id
        WHERE u.is_active = true
        GROUP BY u.id
        ORDER BY report_count DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
};

const getPendingVendorRequests = async () => {
    const query = `
        SELECT 
            vr.*,
            u.full_name as requester_name,
            u.email as requester_email
        FROM vendor_requests vr
        JOIN users u ON vr.user_id = u.id
        WHERE vr.status = 'pending'
        ORDER BY vr.created_at ASC
    `;
    const { rows } = await pool.query(query);
    return rows;
};

const getAllUsers = async (limit = 10, offset = 0) => {
    const query = `
        SELECT id, full_name, email, role, is_active, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(query, [limit, offset]);
    return rows;
};

const { sendAccountStatusEmail } = require("../utils/email");

const blockUser = async (userId, adminId) => {
    const query = `
        UPDATE users 
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id, full_name, email, is_active
    `;
    const { rows } = await pool.query(query, [userId]);
    if (rows.length === 0) {
        throw new Error("User not found");
    }

    // Notify user of account suspension
    const user = rows[0];
    await sendAccountStatusEmail(user.email, "BLOCKED", "Suspended due to policy violation or security review.").catch(console.error);

    return user;
};

module.exports = {
    getDashboardStats,
    getModerationQueue,
    getPendingVendorRequests,
    getAllUsers,
    blockUser
};
