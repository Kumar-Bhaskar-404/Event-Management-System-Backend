const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");

let customerToken;
let vendorToken;

let bookingId;
let serviceId;
let vendorId;
let itemId;

const customerEmail = `cust_${Date.now()}@test.com`;
const vendorEmail = `vendor_${Date.now()}@test.com`;

beforeAll(async () => {
    await pool.query(`
        TRUNCATE TABLE 
        reviews,
        booking_items,
        bookings,
        users,
        vendor_services
        RESTART IDENTITY CASCADE
    `);
});

describe("Review System Test", () => {

    test("setup: create booking + vendor + service", async () => {

        // ---------- Customer ----------
        const res1 = await request(app)
            .post("/auth/register")
            .send({
                full_name: "Customer",
                email: customerEmail,
                password: "123456"
            });

        const otp1 = res1.body.testOtp;

        const verify1 = await request(app)
            .post("/auth/verify-otp")
            .send({
                email: customerEmail,
                otp: otp1
            });

        customerToken = verify1.body.accessToken;


        // ---------- Vendor ----------
        const res2 = await request(app)
            .post("/auth/register")
            .send({
                full_name: "Vendor",
                email: vendorEmail,
                password: "123456"
            });

        const otp2 = res2.body.testOtp;

        await request(app)
            .post("/auth/verify-otp")
            .send({
                email: vendorEmail,
                otp: otp2
            });

        await pool.query(
            `UPDATE users SET role = 'vendor' WHERE email = $1`,
            [vendorEmail]
        );

        const loginVendor = await request(app)
            .post("/auth/login")
            .send({
                email: vendorEmail,
                password: "123456"
            });

        vendorToken = loginVendor.body.accessToken;

        const vendor = await pool.query(
            `SELECT id FROM users WHERE email = $1`,
            [vendorEmail]
        );

        vendorId = vendor.rows[0].id;


        // ---------- Booking ----------
        const booking = await request(app)
            .post("/bookings")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                title: "Test Event",
                event_start: "2026-02-10T09:00:00Z",
                event_end: "2026-02-12T23:00:00Z"
            });

        bookingId = booking.body.id;


        // ---------- Service ----------
        const service = await request(app)
            .post("/services")
            .set("Authorization", `Bearer ${vendorToken}`)
            .send({
                title: "Photography",
                description: "Test",
                city: "Delhi",
                price: 10000,
                price_type: "fixed"
            });

        serviceId = service.body.id;


        // ---------- Request ----------
        const item = await request(app)
            .post("/bookings/items")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                booking_id: bookingId,
                service_id: serviceId,
                vendor_id: vendorId
            });

        itemId = item.body.id;


        // ---------- Accept ----------
        await request(app)
            .patch(`/vendors/booking-requests/${itemId}`)
            .set("Authorization", `Bearer ${vendorToken}`)
            .send({
                status: "accepted"
            });


        // ---------- Select ----------
        await request(app)
            .patch(`/bookings/items/${itemId}/select`)
            .set("Authorization", `Bearer ${customerToken}`);

        // ---------- Fake Payment ----------
        await pool.query(
            `INSERT INTO payments (booking_id, amount, status) VALUES ($1, $2, 'successful')`,
            [bookingId, 10000]
        );
    });

    test("❌ cannot review before completion", async () => {

        const res = await request(app)
            .post("/reviews")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                booking_item_id: itemId,
                rating: 5,
                comment: "Great service"
            });

        console.log("BEFORE COMPLETION:", res.body);

        expect(res.statusCode).toBe(400);
    });

    test("✔ vendor marks complete", async () => {

        const res = await request(app)
            .patch(`/bookings/items/${itemId}/complete`)
            .set("Authorization", `Bearer ${vendorToken}`);

        console.log("COMPLETE RESPONSE:", res.body);

        expect(res.statusCode).toBe(200);
    });

    test("✔ customer can review after completion", async () => {

        const res = await request(app)
            .post("/reviews")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                booking_item_id: itemId,
                rating: 5,
                comment: "Amazing service"
            });

        console.log("REVIEW CREATED:", res.body);

        expect(res.statusCode).toBe(201);
    });

    test("❌ duplicate review blocked", async () => {

        const res = await request(app)
            .post("/reviews")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                booking_item_id: itemId,
                rating: 4,
                comment: "Second review"
            });

        console.log("DUPLICATE RESPONSE:", res.body);

        expect(res.statusCode).toBe(400);
    });

});