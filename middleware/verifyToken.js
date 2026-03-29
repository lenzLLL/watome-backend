import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
    // Lire le token depuis Authorization header (préféré) ou cookie authToken en fallback
    let token;

    if (req.headers["authorization"]) {
        const authHeader = req.headers["authorization"];
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token && req.cookies?.authToken) {
        token = req.cookies.authToken;
    }

    if (!token && req.headers.cookie) {
        const cookieString = req.headers.cookie;
        const match = cookieString.match(/(?:^|; )authToken=([^;]+)/);
        if (match) {
            token = decodeURIComponent(match[1]);
        }
    }

    if (!token) {
        console.log('VerifyToken - No token provided');
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_KEY);
        // attach payload to request for downstream handlers
        req.user = decoded;
        next();
    } catch (err) {
        console.log('VerifyToken - Token verification error:', err.message);
        return res.status(401).json({ error: "Invalid token" });
    }
};

// Optional authentication middleware - sets req.user if token is valid, mais ne bloque pas si pas de token
export const optionalAuth = (req, res, next) => {
    // Lire le token depuis Authorization header (préféré) ou cookie authToken en fallback
    let token;

    if (req.headers["authorization"]) {
        const authHeader = req.headers["authorization"];
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
            console.log('OptionalAuth - Token extracted from Bearer header');
        }
    }

    if (!token && req.cookies?.authToken) {
        token = req.cookies.authToken;
        console.log('OptionalAuth - Token extracted from authToken cookie');
    }

    if (!token && req.headers.cookie) {
        const cookieString = req.headers.cookie;
        const match = cookieString.match(/(?:^|; )authToken=([^;]+)/);
        if (match) {
            token = decodeURIComponent(match[1]);
            console.log('OptionalAuth - Token extracted from Cookie header');
        }
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            console.log('OptionalAuth - Token decoded:', decoded);
            // attach payload to request for downstream handlers
            req.user = decoded;
        } catch (err) {
            console.log('OptionalAuth - Token verification error:', err.message);
            // Don't return error, just continue without req.user
        }
    } else {
        console.log('OptionalAuth - No token provided, continuing as anonymous');
    }

    next();
};