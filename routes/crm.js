const router = require('express').Router();
const { body } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

const ETAPES = ['contact','visite','negociation','proposition','gagne','perdu'];

// GET /api/crm
router.get('/', auth, asyncHandler(async (req, res) => {
  const { etape } = req.query;
  let sql = 'SELECT * FROM crm WHERE 1=1';
  const params = [];
  if (etape) { params.push(etape); sql += ` AND etape = $${params.length}`; }
  sql += ' ORDER BY dernier_contact DESC NULLS LAST, created_at DESC';
  const result = await query(sql, params);
  res.json(result.rows);
}));

// GET /api/crm/stats
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE etape NOT IN ('gagne','perdu')) AS en_cours,
      COUNT(*) FILTER (WHERE etape = 'gagne')  AS gagnes,
      COUNT(*) FILTER (WHERE etape = 'perdu')  AS perdus,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE etape = 'gagne') * 100.0 / COUNT(*), 1)
        ELSE 0
      END AS taux_conversion
    FROM crm
  `);
  res.json(result.rows[0]);
}));

// GET /api/crm/:id
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM crm WHERE id::text = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Prospect introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/crm
router.post('/', auth, requireRole('admin', 'gestionnaire'), [
  body('nom').notEmpty().withMessage('Nom requis'),
  body('etape').isIn(ETAPES).optional(),
  validate
], asyncHandler(async (req, res) => {
  const {
    nom, societe, tel, email, etape,
    espace_id, loyer_propose, activite,
    dernier_contact, notes, date_creation
  } = req.body;

  const result = await query(`
    INSERT INTO crm
      (nom, societe, tel, email, etape, espace_id, loyer_propose,
       activite, dernier_contact, notes, date_creation)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [
    nom,
    societe         || null,
    tel             || null,
    email           || null,
    etape           || 'contact',
    espace_id       || null,
    parseFloat(loyer_propose) || 0,
    activite        || null,
    dernier_contact || new Date().toISOString().split('T')[0],
    notes           || null,
    date_creation   || new Date().toISOString().split('T')[0],
  ]);

  res.status(201).json(result.rows[0]);
}));

// PUT /api/crm/:id
router.put('/:id', auth, requireRole('admin', 'gestionnaire'), [
  body('etape').isIn(ETAPES).optional(),
  validate
], asyncHandler(async (req, res) => {
  const findResult = await query('SELECT id FROM crm WHERE id::text = $1', [req.params.id]);
  if (!findResult.rows[0]) return res.status(404).json({ error: 'Prospect introuvable' });

  const {
    nom, societe, tel, email, etape,
    espace_id, loyer_propose, activite,
    dernier_contact, notes
  } = req.body;

  const result = await query(`
    UPDATE crm SET
      nom=$1, societe=$2, tel=$3, email=$4, etape=$5,
      espace_id=$6, loyer_propose=$7, activite=$8,
      dernier_contact=$9, notes=$10
    WHERE id = $11
    RETURNING *
  `, [
    nom,
    societe         || null,
    tel             || null,
    email           || null,
    etape           || 'contact',
    espace_id       || null,
    parseFloat(loyer_propose) || 0,
    activite        || null,
    dernier_contact || new Date().toISOString().split('T')[0],
    notes           || null,
    findResult.rows[0].id
  ]);

  res.json(result.rows[0]);
}));

// PATCH /api/crm/:id/etape — avancement rapide
router.patch('/:id/etape', auth, requireRole('admin', 'gestionnaire'), [
  body('etape').isIn(ETAPES).withMessage('Étape invalide'),
  validate
], asyncHandler(async (req, res) => {
  const { etape } = req.body;
  const result = await query(
    'UPDATE crm SET etape=$1, dernier_contact=CURRENT_DATE WHERE id::text=$2 RETURNING *',
    [etape, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Prospect introuvable' });
  res.json(result.rows[0]);
}));

// DELETE /api/crm/:id
router.delete('/:id', auth, requireRole('admin', 'gestionnaire'), asyncHandler(async (req, res) => {
  const findResult = await query('SELECT id, nom FROM crm WHERE id::text = $1', [req.params.id]);
  if (!findResult.rows[0]) return res.status(404).json({ error: 'Prospect introuvable' });

  await query('DELETE FROM crm WHERE id = $1', [findResult.rows[0].id]);
  res.json({ message: 'Prospect supprimé avec succès' });
}));

module.exports = router;