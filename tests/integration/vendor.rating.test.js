const request = require("supertest");
const app = require("../../src/index");
const pool = require("../../src/config/db");

let customerToken;
let vendorToken;
let vendorId;

let bookingId;
let serviceId;
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

describe("Vendor Rating Test", () => {

    test("setup complete flow with review", async () => {

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


        // ---------- Complete ----------
        await request(app)
            .patch(`/bookings/items/${itemId}/complete`)
            .set("Authorization", `Bearer ${vendorToken}`);


        // ---------- Review ----------
        await request(app)
            .post("/reviews")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                booking_item_id: itemId,
                rating: 5,
                comment: "Great!"
            });
    });

    test("should get vendor ratings", async () => {

        const res = await request(app)
            .get(`/reviews/vendors/${vendorId}/ratings`);

        console.log("RATING RESPONSE:", res.body);

        expect(res.statusCode).toBe(200);

        expect(res.body.average_rating).toBe(5);
        expect(res.body.total_reviews).toBe(1);
    });

});

test("should get vendor reviews", async () => {

    const res = await request(app)
        .get(`/reviews/vendors/${vendorId}/reviews`);

    console.log("REVIEWS RESPONSE:", res.body);

    expect(res.statusCode).toBe(200);

    expect(Array.isArray(res.body.reviews)).toBe(true);

    if (res.body.reviews.length > 0) {
        expect(res.body.reviews[0]).toHaveProperty("rating");
        expect(res.body.reviews[0]).toHaveProperty("comment");
        expect(res.body.reviews[0]).toHaveProperty("customer_name");
    }
});

test("should filter reviews by rating", async () => {

    const res = await request(app)
        .get(`/reviews/vendors/${vendorId}/reviews?min_rating=5`);

    console.log("FILTERED REVIEWS:", res.body);

    expect(res.statusCode).toBe(200);

    if (res.body.reviews.length > 0) {
        expect(res.body.reviews[0].rating).toBeGreaterThanOrEqual(5);
    }
});

test("should get vendor profile", async () => {

    const res = await request(app)
        .get(`/vendors/${vendorId}`);

    console.log("PROFILE RESPONSE:", res.body);

    expect(res.statusCode).toBe(200);

    expect(res.body).toHaveProperty("full_name");
    expect(res.body).toHaveProperty("rating");
    expect(res.body).toHaveProperty("services");
    expect(res.body).toHaveProperty("reviews_preview");

});

test("should search vendors", async () => {

    const res = await request(app)
        .get("/vendors");

    console.log("SEARCH RESPONSE:", res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.vendors)).toBe(true);
});