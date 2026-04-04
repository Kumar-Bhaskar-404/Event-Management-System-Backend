const {
    registerUser,
    verifyOtp,
    loginUser,
    googleAuthService,
    refreshTokenService,
    logoutService
} = require("../services/auth.services");
const asyncHandler = require("../utils/asyncHandler");

// Helper to set refresh token cookie
const setRefreshCookie = (res, refreshToken) => {
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};

// REGISTER
const register = asyncHandler(async (req, res) => {
    const result = await registerUser(req.body);
    res.status(201).json(result);
});

// VERIFY OTP
const verify = asyncHandler(async (req, res) => {
    const { accessToken, refreshToken } = await verifyOtp(req.body);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ accessToken });
});

// LOGIN
const login = asyncHandler(async (req, res) => {
    const { accessToken, refreshToken } = await loginUser(req.body);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ accessToken });
});

// GOOGLE AUTH
const googleAuth = asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    const { accessToken, refreshToken } = await googleAuthService(idToken);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ accessToken });
});


// REFRESH
const refresh = asyncHandler(async (req, res) => {
    const oldRefreshToken = req.cookies.refreshToken;
    if (!oldRefreshToken) {
        return res.status(401).json({ message: "No refresh token" });
    }
    
    try {
        const { accessToken, refreshToken: newRefreshToken } = await refreshTokenService(oldRefreshToken);
        
        // Rotate the cookie with the new token
        setRefreshCookie(res, newRefreshToken);
        
        res.status(200).json({ accessToken });
    } catch (error) {
        // If rotation fails (e.g., token already consumed), clear the cookie to force re-login
        res.clearCookie("refreshToken", {
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production"
        });
        res.status(401).json({ message: error.message });
    }
});

// LOGOUT
const logout = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
        return res.status(400).json({ message: "No refresh token" });
    }
    await logoutService(refreshToken);
    res.clearCookie("refreshToken", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production"
    });
    res.status(200).json({ message: "Logged out successfully" });
});

module.exports = {
    register,
    verify,
    login,
    googleAuth,
    refresh,
    logout
};