const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../middlewares/validate.middleware");

const authenticateUser = require("../middlewares/auth.middleware");
const { createReviewController } = require("../controllers/review.controller");
const { getVendorRatingsController } = require("../controllers/review.controller");
const { getVendorReviewsController } = require("../controllers/review.controller");
const { uploadReviewMediaController } = require("../controllers/review.controller");
const upload = require("../middlewares/upload.middleware");

// Validation Schema for creating a review
const createReviewValidation = [
    body("booking_item_id").notEmpty().withMessage("Booking Item ID is required").isUUID().withMessage("Valid Booking Item ID is required"),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be an integer between 1 and 5"),
    body("comment").optional().isString().trim(),
    validate
];

// Route to create a new review
router.post("/", authenticateUser, createReviewValidation, createReviewController);
router.get("/vendors/:id/ratings", getVendorRatingsController);
router.get("/vendors/:id/reviews", getVendorReviewsController);
router.post("/:id/media", authenticateUser, upload.array("files", 5), uploadReviewMediaController);

module.exports = router;