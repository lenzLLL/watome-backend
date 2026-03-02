export const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.categoryAccount !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }
    next();
};