const pool = require("../config/db");
const bcrypt = require("bcrypt");
const { sendPasswordResetOtpEmail, sendPasswordResetSuccessEmail } = require("../utils/email");

const forgotPassword = async (email) => {
    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
        throw new Error("User not found");
    }
    const userId = userResult.rows[0].id;

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await pool.query("DELETE FROM password_reset_otp WHERE user_id = $1", [userId]);
    await pool.query(
        "INSERT INTO password_reset_otp (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
        [userId, otpHash, expiresAt]
    );

    if (process.env.NODE_ENV === "test") {
        return { message: "Reset OTP sent", testOtp: otp };
    }

    await sendPasswordResetOtpEmail(email, otp);
    return { message: "Reset OTP sent to your email" };
};

const resetPassword = async (email, otp, newPassword) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userResult = await client.query("SELECT id FROM users WHERE email = $1", [email]);
        if (userResult.rows.length === 0) throw new Error("User not found");
        const userId = userResult.rows[0].id;

        const otpResult = await client.query("SELECT * FROM password_reset_otp WHERE user_id = $1", [userId]);
        if (otpResult.rows.length === 0) throw new Error("Reset request not found or expired");
        const otpRecord = otpResult.rows[0];

        if (new Date() > otpRecord.expires_at) throw new Error("OTP expired");

        const isMatch = await bcrypt.compare(otp, otpRecord.otp_hash);
        if (!isMatch) throw new Error("Invalid OTP");

        const newHash = await bcrypt.hash(newPassword, 10);
        await client.query(
            "UPDATE user_auth_providers SET password_hash = $1 WHERE user_id = $2 AND provider = 'local'",
            [newHash, userId]
        );

        await client.query("DELETE FROM password_reset_otp WHERE user_id = $1", [userId]);

        await client.query("COMMIT");

        // Send success notification after commit
        await sendPasswordResetSuccessEmail(email).catch(console.error);

        return { message: "Password reset successful" };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    forgotPassword,
    resetPassword
};
