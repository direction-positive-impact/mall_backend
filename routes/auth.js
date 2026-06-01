const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe').notEmpty().withMessage('Mot de passe requis'),
  validate
], asyncHandler(async (req, res) => {
  const { email, mot_de_passe } = req.body;
  const result = await query('SELECT * FROM utilisateurs WHERE email = $1 AND actif = TRUE', [email]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(mot_de_passe, user.mot_de_passe))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, nom: user.nom, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: { id: user.id, nom: user.nom, email: user.email, role: user.role }
  });
}));

// GET /api/auth/me
router.get('/me', auth, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, nom, email, role, created_at FROM utilisateurs WHERE id = $1',
    [req.user.id]
  );
  res.json(result.rows[0]);
}));

// POST /api/auth/register  (admin seulement)
router.post('/register', auth, requireRole('admin'), [
  body('nom').notEmpty().withMessage('Nom requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe').isLength({ min: 6 }).withMessage('Mot de passe min. 6 caractères'),
  body('role').isIn(['admin','gestionnaire','comptable','lecture']).withMessage('Rôle invalide'),
  validate
], asyncHandler(async (req, res) => {
  const { nom, email, mot_de_passe, role } = req.body;
  const hash = await bcrypt.hash(mot_de_passe, 10);
  const result = await query(
    'INSERT INTO utilisateurs (nom, email, mot_de_passe, role) VALUES ($1,$2,$3,$4) RETURNING id, nom, email, role',
    [nom, email, hash, role]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/auth/password  (changer son mot de passe)
router.put('/password', auth, [
  body('ancien').notEmpty().withMessage('Ancien mot de passe requis'),
  body('nouveau').isLength({ min: 6 }).withMessage('Nouveau mot de passe min. 6 caractères'),
  validate
], asyncHandler(async (req, res) => {
  const { ancien, nouveau } = req.body;
  const result = await query('SELECT mot_de_passe FROM utilisateurs WHERE id = $1', [req.user.id]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(ancien, user.mot_de_passe))) {
    return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
  }
  const hash = await bcrypt.hash(nouveau, 10);
  await query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2', [hash, req.user.id]);
  res.json({ message: 'Mot de passe mis à jour' });
}));

module.exports = router;
