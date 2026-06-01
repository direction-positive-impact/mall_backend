const router = require('express').Router();
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

// GET /api/locataires
router.get('/', auth, asyncHandler(async (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT * FROM locataires WHERE 1=1';
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (nom ILIKE $1 OR email ILIKE $1 OR tel ILIKE $1)`;
  }
  sql += ' ORDER BY nom';
  res.json((await query(sql, params)).rows);
}));

// GET /api/locataires/:id  (avec contrats et factures)
router.get('/:id', auth, [param('id').isUUID(), validate], asyncHandler(async (req, res) => {
  const { id } = req.params;
  const locRes = await query('SELECT * FROM locataires WHERE id = $1', [id]);
  if (!locRes.rows[0]) return res.status(404).json({ error: 'Locataire introuvable' });

  const [contrats, factures] = await Promise.all([
    query(`SELECT c.*, e.nom AS espace_nom, e.numero AS espace_numero
           FROM contrats c LEFT JOIN espaces e ON e.id = c.espace_id
           WHERE c.locataire_id = $1 ORDER BY c.date_debut DESC`, [id]),
    query(`SELECT f.*, e.nom AS espace_nom
           FROM factures f LEFT JOIN espaces e ON e.id = f.espace_id
           WHERE f.locataire_id = $1 ORDER BY f.date_emission DESC LIMIT 20`, [id]),
  ]);

  res.json({ ...locRes.rows[0], contrats: contrats.rows, factures: factures.rows });
}));

// POST /api/locataires
router.post('/', auth, requireRole('admin','gestionnaire'), [
  body('nom').notEmpty().withMessage('Nom requis'),
  body('email').isEmail().optional({ checkFalsy: true }),
  validate
], asyncHandler(async (req, res) => {
  const { nom, contact, tel, email, piece_identite, adresse, notes } = req.body;
  const result = await query(`
    INSERT INTO locataires (nom, contact, tel, email, piece_identite, adresse, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [nom, contact||nom, tel||'', email||'', piece_identite||'', adresse||'', notes||'']);
  res.status(201).json(result.rows[0]);
}));

// PUT /api/locataires/:id
router.put('/:id', auth, requireRole('admin','gestionnaire'), [
  param('id').isUUID(),
  body('nom').notEmpty().optional(),
  validate
], asyncHandler(async (req, res) => {
  const { nom, contact, tel, email, piece_identite, adresse, notes } = req.body;
  const result = await query(`
    UPDATE locataires SET nom=$1,contact=$2,tel=$3,email=$4,piece_identite=$5,adresse=$6,notes=$7
    WHERE id=$8 RETURNING *
  `, [nom, contact, tel, email, piece_identite, adresse, notes, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Locataire introuvable' });
  res.json(result.rows[0]);
}));

// DELETE /api/locataires/:id
router.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM locataires WHERE id=$1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Locataire introuvable' });
  res.json({ message: 'Locataire supprimé' });
}));

module.exports = router;
