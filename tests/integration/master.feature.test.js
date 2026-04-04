const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");

describe("Master Phase 2 Feature Integration Test", () => {
    let customerToken, customerRefreshToken, customerEmail, vendorA, vendorB;
    customerEmail = `master-cust-${Date.now()}@test.com`;
    const vendorAEmail = `master-vend-a-${Date.now()}@test.com`;
    const vendorBEmail = `master-vend-b-${Date.now()}@test.com`;

    beforeAll(async () => {
        // 1. Create Customer
        const cReg = await request(app).post("/auth/register").send({ full_name: "Master Customer", email: customerEmail, password: "Pass123!" });
        await request(app).post("/auth/verify-otp").send({ email: customerEmail, otp: cReg.body.testOtp });
        const cLogin = await request(app).post("/auth/login").send({ email: customerEmail, password: "Pass123!" });
        customerToken = cLogin.body.accessToken;
        customerRefreshToken = cLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];

        // 2. Create Vendor A (Main)
        const vaReg = await request(app).post("/auth/register").send({ full_name: "Vendor A (Catering)", email: vendorAEmail, password: "Pass123!" });
        await request(app).post("/auth/verify-otp").send({ email: vendorAEmail, otp: vaReg.body.testOtp });
        const vaLogin = await request(app).post("/auth/login").send({ email: vendorAEmail, password: "Pass123!" });
        
        // Fetch ID from DB
        const vendorARes = await pool.query("SELECT id FROM users WHERE email = $1", [vendorAEmail]);
        vendorA = { id: vendorARes.rows[0].id };
        
        await pool.query("UPDATE users SET role = 'vendor' WHERE id = $1", [vendorA.id]);
        await pool.query("INSERT INTO vendor_services (vendor_id, title, city, price, category, is_active) VALUES ($1, 'Elite Catering', 'Dubai', 500, 'catering', true)", [vendorA.id]);

        // 3. Create Vendor B (Alternative)
        const vbReg = await request(app).post("/auth/register").send({ full_name: "Vendor B (Catering)", email: vendorBEmail, password: "Pass123!" });
        await request(app).post("/auth/verify-otp").send({ email: vendorBEmail, otp: vbReg.body.testOtp });
        
        // Fetch ID from DB
        const vendorBRes = await pool.query("SELECT id FROM users WHERE email = $1", [vendorBEmail]);
        vendorB = { id: vendorBRes.rows[0].id };
        
        await pool.query("UPDATE users SET role = 'vendor' WHERE id = $1", [vendorB.id]);
        await pool.query("INSERT INTO vendor_services (vendor_id, title, city, price, category, is_active) VALUES ($1, 'Standard Catering', 'Dubai', 300, 'catering', true)", [vendorB.id]);
    });

    test("✔ Flow 1: Search with Budget Filters", async () => {
        // Search for catering in Dubai within 200-400 budget (Should return Vendor B)
        const res = await request(app).get("/vendors/search?city=Dubai&min_price=200&max_price=400");
        expect(res.statusCode).toBe(200);
        expect(res.body.vendors.some(v => v.full_name.includes("Vendor B"))).toBe(true);
        expect(res.body.vendors.some(v => v.full_name.includes("Vendor A"))).toBe(false);
    });

    test("✔ Flow 2: Refresh Token Rotation", async () => {
        const oldToken = customerRefreshToken;
        const res = await request(app)
            .post("/auth/refresh")
            .set("Cookie", [`refreshToken=${oldToken}`]);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("accessToken");
        
        const newCookie = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
        expect(newCookie).not.toBe(oldToken);
        customerRefreshToken = newCookie; // Update for cleanup or subsequent checks
    });

    test("✔ Flow 3: Booking Edit Conflict & Smart Recommendations", async () => {
        // 1. Create a booking for tomorrow
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);
        
        const bRes = await request(app).post("/bookings").set("Authorization", `Bearer ${customerToken}`).send({
            title: "Master Gala",
            event_start: tomorrow.toISOString(),
            event_end: new Date(tomorrow.getTime() + 3600000).toISOString(), // 1 hour
            location: "Grand Hall",
            guest_count: 100
        });
        const bookingId = bRes.body.id;

        // 2. Add Vendor A
        const serviceRes = await pool.query("SELECT id FROM vendor_services WHERE vendor_id = $1", [vendorA.id]);
        const iRes = await request(app).post("/bookings/items").set("Authorization", `Bearer ${customerToken}`).send({
            booking_id: bookingId,
            service_id: serviceRes.rows[0].id,
            vendor_id: vendorA.id
        });
        const itemId = iRes.body.id;

        // 3. Mark Vendor A as BUSY on the "New Date" (Day after tomorrow)
        await pool.query("INSERT INTO vendor_availability (vendor_id, start_time, end_time, reason) VALUES ($1, $2, $3, $4)", [
            vendorA.id, dayAfter.toISOString(), new Date(dayAfter.getTime() + 7200000).toISOString(), "Private Party"
        ]);

        // 4. Edit Booking to the conflicted date
        const editRes = await request(app)
            .patch(`/bookings/${bookingId}`)
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                event_start: dayAfter.toISOString(),
                event_end: new Date(dayAfter.getTime() + 3600000).toISOString()
            });
        
        expect(editRes.statusCode).toBe(200);
        
        // 5. Verify Conflict Recovery: Suggestions should contain Vendor B
        expect(editRes.body.suggestions).toHaveProperty(itemId);
        const suggested = editRes.body.suggestions[itemId];
        expect(suggested.some(v => v.full_name.includes("Vendor B"))).toBe(true);
    });

    test("✔ Flow 4: Account Deletion with Audit Logging", async () => {
        const reason = "Switching to another platform";
        const res = await request(app)
            .delete("/auth/profile") 
            .set("Authorization", `Bearer ${customerToken}`)
            .send({ reason });
        
        expect(res.statusCode).toBe(200);

        // Verify Audit Log
        const auditRes = await pool.query("SELECT * FROM audit_logs WHERE event_type = 'account_deletion' ORDER BY created_at DESC LIMIT 1");
        expect(auditRes.rows.length).toBe(1);
        expect(auditRes.rows[0].metadata.reason).toBe(reason);
    });

    afterAll(async () => {
        await pool.query("DELETE FROM users WHERE email IN ($1, $2, $3)", [customerEmail, vendorAEmail, vendorBEmail]);
        // await pool.end();
    });
});
