const { validationResult } = require('express-validator');

// Gestion centralisée des erreurs
const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} →`, err.message);

  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({ error: 'Un enregistrement avec ces données existe déjà.' });
  }
  if (err.code === '23503') { // FK violation
    return res.status(400).json({ error: 'Référence invalide : élément lié introuvable.' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Erreur interne du serveur'
  });
};

// Valide les résultats express-validator
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Wrapper async pour éviter les try/catch répétitifs
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, validate, asyncHandler };
