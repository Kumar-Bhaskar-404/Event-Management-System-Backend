const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");
const jwt = require("jsonwebtoken");

describe("Account Deletion Verification", () => {
    let userToken, userId, email;

    beforeAll(async () => {
        email = `delete-test-${Date.now()}@test.com`;
        const reg = await request(app).post("/auth/register").send({ 
            full_name: "Delete Me", 
            email, 
            password: "password123" 
        });
        const vV = await request(app).post("/auth/verify-otp").send({ 
            email, 
            otp: reg.body.testOtp 
        });
        userToken = vV.body.accessToken;
        const decoded = jwt.decode(userToken);
        userId = decoded.userId;

        // Create a related record (Password Reset OTP) to test CASCADE
        await pool.query(
            "INSERT INTO password_reset_otp (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
            [userId, 'fake-hash', new Date(Date.now() + 10000).toISOString()]
        );
    });

    test("DELETE /profile should remove user and cascaded data", async () => {
        // 1. Verify data exists first
        const preCheck = await pool.query("SELECT * FROM password_reset_otp WHERE user_id = $1", [userId]);
        expect(preCheck.rows.length).toBe(1);

        // 2. Trigger Deletion
        const response = await request(app)
            .delete("/auth/profile")
            .set("Authorization", `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // 3. Verify User is gone
        const userCheck = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        expect(userCheck.rows.length).toBe(0);

        // 4. Verify Cascaded Data is gone
        const cascadeCheck = await pool.query("SELECT * FROM password_reset_otp WHERE user_id = $1", [userId]);
        expect(cascadeCheck.rows.length).toBe(0);
    });
});
