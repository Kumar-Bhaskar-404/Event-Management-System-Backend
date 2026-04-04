const pool = require("../config/db");
const cloudinary = require("../config/cloudinary");
const fs = require("fs-extra");

const createReview = async (user, data) => {

    if (user.role !== "customer") {
        throw new Error("Only customers can review");
    }

    const { booking_item_id, rating, comment } = data;

    // get booking item + booking
    const result = await pool.query(
        `
        SELECT bi.*, b.customer_id
        FROM booking_items bi
        JOIN bookings b ON bi.booking_id = b.id
        WHERE bi.id = $1
        `,
        [booking_item_id]
    );

    if (result.rows.length === 0) {
        throw new Error("Booking item not found");
    }

    const item = result.rows[0];

    // ownership check
    if (item.customer_id !== user.userId) {
        throw new Error("Unauthorized");
    }

    // must be selected
    if (!item.is_selected) {
        throw new Error("Cannot review unselected vendor");
    }

    // must be completed
    if (item.status !== "completed") {
        throw new Error("Event not completed");
    }

    const paymentCheck = await pool.query(`
        SELECT p.status
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        JOIN booking_items bi ON bi.booking_id = b.id
        WHERE bi.id = $1
    `, [booking_item_id]);

    if (
        paymentCheck.rows.length === 0 ||
        paymentCheck.rows[0].status !== "successful"
    ) {
        throw new Error("Payment required before review");
    }

    const insert = `
        INSERT INTO reviews
        (booking_item_id, customer_id, rating, comment)
        VALUES ($1,$2,$3,$4)
        RETURNING *;
    `;

    const values = [
        booking_item_id,
        user.userId,
        rating,
        comment
    ];

    const { rows } = await pool.query(insert, values);

    return rows[0];
};

const getVendorRatings = async (vendorId) => {

    const query = `
        SELECT 
            ROUND(AVG(r.rating)::numeric, 1) AS average_rating,
            COUNT(r.id) AS total_reviews
        FROM reviews r
        JOIN booking_items bi ON r.booking_item_id = bi.id
        WHERE bi.vendor_id = $1
    `;

    const { rows } = await pool.query(query, [vendorId]);

    return {
        average_rating: parseFloat(rows[0].average_rating) || 0,
        total_reviews: parseInt(rows[0].total_reviews)
    };
};

const getVendorReviews = async (vendorId, queryParams) => {

    const limit = parseInt(queryParams.limit) || 5;
    const offset = parseInt(queryParams.offset) || 0;

    const sort = queryParams.sort || "latest";
    const minRating = parseInt(queryParams.min_rating);

    let orderBy = "r.created_at DESC";

    if (sort === "top") {
        orderBy = "r.rating DESC";
    }

    let filterQuery = "";
    let values = [vendorId, limit, offset];

    if (minRating) {
        filterQuery = "AND r.rating >= $4";
        values.push(minRating);
    }

    const query = `
        SELECT 
            r.id,
            r.rating,
            r.comment,
            r.created_at,
            u.full_name AS customer_name,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', rm.id,
                        'url', rm.media_url,
                        'type', rm.media_type
                    )
                ) FILTER (WHERE rm.id IS NOT NULL),
                '[]'
            ) AS media
        FROM reviews r
        JOIN booking_items bi ON r.booking_item_id = bi.id
        JOIN users u ON r.customer_id = u.id
        LEFT JOIN review_media rm ON r.id = rm.review_id
        WHERE bi.vendor_id = $1
        ${filterQuery}
        GROUP BY r.id, u.full_name
        ORDER BY ${orderBy}
        LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(query, values);

    return rows;
};

const uploadReviewMedia = async (user, reviewId, files) => {
    if (user.role !== "customer") {
        throw new Error("Only customers can upload review media");
    }

    if (!files || files.length === 0) {
        throw new Error("No media files attached");
    }

    const reviewCheck = await pool.query(
        "SELECT id, customer_id FROM reviews WHERE id = $1",
        [reviewId]
    );

    if (reviewCheck.rows.length === 0) {
        throw new Error("Review not found");
    }

    if (reviewCheck.rows[0].customer_id !== user.userId) {
        throw new Error("Unauthorized to add media to this review");
    }

    const uploadedMedia = [];

    try {
        // Upload all files in parallel
        await Promise.all(files.map(async (file) => {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: `reviews/${reviewId}`,
                resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image'
            });

            await fs.unlink(file.path);

            const insertQuery = `
                INSERT INTO review_media (review_id, media_url, media_type, uploaded_by)
                VALUES ($1, $2, $3, $4)
                RETURNING *;
            `;
            
            const { rows } = await pool.query(insertQuery, [
                reviewId,
                result.secure_url,
                file.mimetype.startsWith('video/') ? 'video' : 'image',
                user.userId
            ]);

            uploadedMedia.push(rows[0]);
        }));

        return uploadedMedia;

    } catch (error) {
        // Clean up remaining temp files on error
        for (const file of files) {
            if (file && file.path) await fs.unlink(file.path).catch(() => {});
        }
        throw error;
    }
};


module.exports = {
    createReview,
    getVendorRatings,
    getVendorReviews,
    uploadReviewMedia
};