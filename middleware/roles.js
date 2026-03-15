export const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.categoryAccount !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }
    next();
};

export const roleCheck = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        
        if (!allowedRoles.includes(req.user.categoryAccount)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        
        next();
    };
};