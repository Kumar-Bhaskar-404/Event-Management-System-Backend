const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");

describe("Refresh Token Rotation Integration", () => {
    let refreshToken;
    let email = `rotation-test-${Date.now()}@test.com`;

    beforeAll(async () => {
        try {
            // 1. Create and verify a test user
            const reg = await request(app).post("/auth/register").send({
                full_name: "Rotation Tester",
                email: email,
                password: "password123"
            });
            
            if (reg.statusCode !== 201) throw new Error(`Registration failed: ${JSON.stringify(reg.body)}`);

            const verify = await request(app).post("/auth/verify-otp").send({
                email: email,
                otp: reg.body.testOtp
            });
            if (verify.statusCode !== 200) throw new Error(`OTP verification failed: ${JSON.stringify(verify.body)}`);

            // 2. Login to get initial refresh token
            const login = await request(app).post("/auth/login").send({
                email: email,
                password: "password123"
            });
            if (login.statusCode !== 200) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);

            const cookies = login.headers['set-cookie'];
            if (!cookies) throw new Error("No cookies returned in login");
            
            refreshToken = cookies[0].split(';')[0].split('=')[1];
        } catch (error) {
            console.error("SETUP FAILURE:", error.message);
            throw error;
        }
    });

    test("✔ Should successfully rotate tokens", async () => {
        const oldToken = refreshToken;
        const res = await request(app)
            .post("/auth/refresh")
            .set("Cookie", [`refreshToken=${oldToken}`]);
        
        expect(res.statusCode).toBe(200);
        
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        
        const newRefreshingToken = cookies[0].split(';')[0].split('=')[1];
        expect(newRefreshingToken).not.toBe(oldToken);
        
        // ❌ REUSE ATTEMPT: Trying the old token again should fail
        const reuseRes = await request(app)
            .post("/auth/refresh")
            .set("Cookie", [`refreshToken=${oldToken}`]);
        
        expect(reuseRes.statusCode).toBe(401);
        expect(reuseRes.body.message).toMatch(/Invalid or consumed/);
    });

    afterAll(async () => {
        await pool.query("DELETE FROM users WHERE email = $1", [email]).catch(() => {});
        await pool.end();
    });
});
