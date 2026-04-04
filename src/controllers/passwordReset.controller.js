const passwordResetService = require("../services/passwordReset.services");
const asyncHandler = require("../utils/asyncHandler");

const forgotPasswordController = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await passwordResetService.forgotPassword(email);
    res.status(200).json({
        success: true,
        message: result.message,
        testOtp: result.testOtp // Only returned in test mode
    });
});

const resetPasswordController = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const result = await passwordResetService.resetPassword(email, otp, newPassword);
    res.status(200).json({
        success: true,
        message: result.message
    });
});

module.exports = {
    forgotPasswordController,
    resetPasswordController
};
