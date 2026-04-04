const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");

describe("Admin Dashboard Integration", () => {
    let adminToken;
    let customerToken;
    let vendorId;
    let requestId;

    const adminEmail = `admin_${Date.now()}@test.com`;
    const customerEmail = `customer_rep_${Date.now()}@test.com`;
    const vendorEmail = `vendor_to_be_${Date.now()}@test.com`;

    beforeAll(async () => {
        // 1. Setup Admin
        const regA = await request(app).post("/auth/register").send({
            full_name: "Super Admin",
            email: adminEmail,
            password: "password123"
        });
        const aOtp = regA.body.testOtp;
        await request(app).post("/auth/verify-otp").send({ email: adminEmail, otp: aOtp });
        const aLogin = await request(app).post("/auth/login").send({ email: adminEmail, password: "password123" });
        adminToken = aLogin.body.accessToken;
        
        const aProfile = await request(app).get("/test/auth").set("Authorization", `Bearer ${adminToken}`);
        await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [aProfile.body.user.userId]);
        // Refresh token role
        const aLogin2 = await request(app).post("/auth/login").send({ email: adminEmail, password: "password123" });
        adminToken = aLogin2.body.accessToken;

        // 2. Setup Customer for reporting
        const regC = await request(app).post("/auth/register").send({
            full_name: "Reporting Customer",
            email: customerEmail,
            password: "password123"
        });
        const cOtp = regC.body.testOtp;
        const cVerify = await request(app).post("/auth/verify-otp").send({ email: customerEmail, otp: cOtp });
        customerToken = cVerify.body.accessToken;

        // 3. Setup Customer requesting Vendor role
        const regV = await request(app).post("/auth/register").send({
            full_name: "Future Vendor",
            email: vendorEmail,
            password: "password123"
        });
        const vOtp = regV.body.testOtp;
        const vVerify = await request(app).post("/auth/verify-otp").send({ email: vendorEmail, otp: vOtp });
        const vToken = vVerify.body.accessToken;
        
        const vProfile = await request(app).get("/test/auth").set("Authorization", `Bearer ${vToken}`);
        vendorId = vProfile.body.user.userId;

        // Submit Vendor Request
        const reqRes = await request(app).post("/vendors/request").set("Authorization", `Bearer ${vToken}`).send({
            business_name: "Mega Events",
            city: "Berlin"
        });
        requestId = reqRes.body.id;
    });

    test("✔ Admin can view Dashboard Stats", async () => {
        const res = await request(app)
            .get("/api/admin/stats")
            .set("Authorization", `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.stats).toHaveProperty("total_users");
        expect(res.body.data.stats).toHaveProperty("blocked_users");
        expect(res.body.data.stats).toHaveProperty("approved_vendors");
        expect(res.body.data).toHaveProperty("refunds");
        expect(res.body.data.refunds).toHaveProperty("total_count");
    });

    test("✔ Admin can view Verification Queue", async () => {
        const res = await request(app)
            .get("/api/admin/vendor-requests")
            .set("Authorization", `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        const req = res.body.data.find(r => r.id === requestId);
        expect(req).toBeDefined();
        expect(req.requester_name).toBe("Future Vendor");
    });

    test("✔ Customer can report a vendor and Admin sees it in Moderation", async () => {
        // Report the vendor (we manually promote them first to be reported)
        await pool.query("UPDATE users SET role = 'vendor' WHERE id = $1", [vendorId]);

        await request(app)
            .post(`/vendors/${vendorId}/report`)
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                reason: "Spammy behavior",
                details: "Sent me 100 emails in a day"
            });
        
        const res = await request(app)
            .get("/api/admin/moderation")
            .set("Authorization", `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        const report = res.body.data.find(r => r.vendor_id === vendorId);
        expect(report).toBeDefined();
        expect(report.report_count).toBe("1");
    });

    test("❌ Non-admins cannot access dashboard", async () => {
        const res = await request(app)
            .get("/api/admin/stats")
            .set("Authorization", `Bearer ${customerToken}`);
        
        expect(res.statusCode).toBe(403);
    });

    test("✔ Admin can block a user", async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${vendorId}/block`)
            .set("Authorization", `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body.data.is_active).toBe(false);
    });
});
