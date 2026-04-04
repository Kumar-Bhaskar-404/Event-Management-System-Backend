const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");

describe("Profile & Security Integration", () => {
    let customerToken;
    let vendorToken;
    let vendorId;
    let customerEmail = `c_prof_${Date.now()}@test.com`;
    let vendorEmail = `v_prof_${Date.now()}@test.com`;

    beforeAll(async () => {
        // Setup Customer
        const regC = await request(app).post("/auth/register").send({
            full_name: "John Doe",
            email: customerEmail,
            password: "password123"
        });
        await request(app).post("/auth/verify-otp").send({ email: customerEmail, otp: regC.body.testOtp });
        const loginC = await request(app).post("/auth/login").send({ email: customerEmail, password: "password123" });
        customerToken = loginC.body.accessToken;

        // Setup Vendor
        const regV = await request(app).post("/auth/register").send({
            full_name: "Jane Smith",
            email: vendorEmail,
            password: "password123"
        });
        const vVerify = await request(app).post("/auth/verify-otp").send({ email: vendorEmail, otp: regV.body.testOtp });
        const vToken = vVerify.body.accessToken;
        const vProf = await request(app).get("/test/auth").set("Authorization", `Bearer ${vToken}`);
        vendorId = vProf.body.user.userId;
        
        // Promote to vendor with business details
        await pool.query(
            "UPDATE users SET role = 'vendor', business_name = 'Original Corp', business_city = 'New York' WHERE id = $1",
            [vendorId]
        );
        const loginV = await request(app).post("/auth/login").send({ email: vendorEmail, password: "password123" });
        vendorToken = loginV.body.accessToken;
    });

    test("✔ Customer can update their personal name", async () => {
        const res = await request(app)
            .patch("/auth/profile")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({ full_name: "John Improved" });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.data.full_name).toBe("John Improved");
    });

    test("✔ Vendor can update personal details but NOT business name", async () => {
        const res = await request(app)
            .patch("/auth/profile")
            .set("Authorization", `Bearer ${vendorToken}`)
            .send({ 
                full_name: "Jane Improved",
                business_name: "Scam Corp" // This should be ignored/locked
            });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.data.full_name).toBe("Jane Improved");
        expect(res.body.data.business_name).toBe("Original Corp"); // Unchanged
    });

    test("✔ Password Reset Flow", async () => {
        // 1. Forgot
        const forgot = await request(app)
            .post("/auth/forgot-password")
            .send({ email: customerEmail });
        
        expect(forgot.statusCode).toBe(200);
        const otp = forgot.body.testOtp;

        // 2. Reset
        const reset = await request(app)
            .post("/auth/reset-password")
            .send({
                email: customerEmail,
                otp: otp,
                newPassword: "newpassword456"
            });
        
        expect(reset.statusCode).toBe(200);

        // 3. Verify Login
        const login = await request(app)
            .post("/auth/login")
            .send({ email: customerEmail, password: "newpassword456" });
        
        expect(login.statusCode).toBe(200);
    });

    test("✔ Notifications flow", async () => {
        // 1. Seed a notification manually
        await pool.query(
            "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)",
            [vendorId, "Welcome", "Welcome to EMS", "system"]
        );

        const res = await request(app)
            .get("/notifications")
            .set("Authorization", `Bearer ${vendorToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        const notifId = res.body.data[0].id;

        // 2. Mark as read
        const read = await request(app)
            .patch(`/notifications/${notifId}/read`)
            .set("Authorization", `Bearer ${vendorToken}`);
        
        expect(read.statusCode).toBe(200);
        expect(read.body.data.is_read).toBe(true);
    });
});
