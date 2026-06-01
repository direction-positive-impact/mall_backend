const jwt = require('jsonwebtoken');

// Vérifie le token JWT dans le header Authorization
const auth = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant ou invalide' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token expiré ou invalide' });
  }
};

// Restreint l'accès à certains rôles
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé : rôle insuffisant' });
  }
  next();
};

module.exports = { auth, requireRole };
