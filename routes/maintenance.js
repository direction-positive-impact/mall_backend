const router = require('express').Router();
const { body } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

const PRIORITES  = ['basse','normale','haute','urgente'];
const STATUTS    = ['ouvert','en_cours','resolu','ferme'];
const CATEGORIES = ['Électricité','Plomberie','Climatisation','Sécurité','Nettoyage','Ascenseur','Structure','Autre'];

// GET /api/maintenance
router.get('/', auth, asyncHandler(async (req, res) => {
  const { statut, priorite } = req.query;
  let sql = 'SELECT * FROM maintenance WHERE 1=1';
  const params = [];
  if (statut)   { params.push(statut);   sql += ` AND statut = $${params.length}`; }
  if (priorite) { params.push(priorite); sql += ` AND priorite = $${params.length}`; }
  sql += ' ORDER BY CASE priorite WHEN \'urgente\' THEN 0 WHEN \'haute\' THEN 1 WHEN \'normale\' THEN 2 ELSE 3 END, date_creation DESC';
  const result = await query(sql, params);
  res.json(result.rows);
}));

// GET /api/maintenance/stats
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE statut = 'ouvert')   AS ouverts,
      COUNT(*) FILTER (WHERE statut = 'en_cours') AS en_cours,
      COUNT(*) FILTER (WHERE statut = 'resolu')   AS resolus,
      COUNT(*) FILTER (WHERE statut = 'ferme')    AS fermes,
      COUNT(*) FILTER (WHERE priorite = 'urgente' AND statut NOT IN ('ferme','resolu')) AS urgents_actifs
    FROM maintenance
  `);
  res.json(result.rows[0]);
}));

// GET /api/maintenance/:id
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM maintenance WHERE id::text = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Ticket introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/maintenance
router.post('/', auth, requireRole('admin', 'gestionnaire'), [
  body('titre').notEmpty().withMessage('Titre requis'),
  body('priorite').isIn(PRIORITES).optional(),
  body('statut').isIn(STATUTS).optional(),
  body('categorie').isIn(CATEGORIES).optional(),
  validate
], asyncHandler(async (req, res) => {
  const {
    titre, categorie, priorite, statut, espace_id,
    date_creation, date_resolution_prevue,
    description, intervenant, cout, notes_resolution, numero
  } = req.body;

  const result = await query(`
    INSERT INTO maintenance
      (numero, titre, categorie, priorite, statut, espace_id,
       date_creation, date_resolution_prevue, description, intervenant, cout, notes_resolution)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    numero || null,
    titre,
    categorie || 'Autre',
    priorite  || 'normale',
    statut    || 'ouvert',
    espace_id || null,
    date_creation || new Date().toISOString().split('T')[0],
    date_resolution_prevue || null,
    description    || '',
    intervenant    || '',
    parseFloat(cout) || 0,
    notes_resolution || ''
  ]);

  res.status(201).json(result.rows[0]);
}));

// PUT /api/maintenance/:id
router.put('/:id', auth, requireRole('admin', 'gestionnaire'), [
  body('priorite').isIn(PRIORITES).optional(),
  body('statut').isIn(STATUTS).optional(),
  validate
], asyncHandler(async (req, res) => {
  const findResult = await query('SELECT id FROM maintenance WHERE id::text = $1', [req.params.id]);
  if (!findResult.rows[0]) return res.status(404).json({ error: 'Ticket introuvable' });

  const {
    titre, categorie, priorite, statut, espace_id,
    date_creation, date_resolution_prevue,
    description, intervenant, cout, notes_resolution
  } = req.body;

  const result = await query(`
    UPDATE maintenance SET
      titre=$1, categorie=$2, priorite=$3, statut=$4, espace_id=$5,
      date_creation=$6, date_resolution_prevue=$7, description=$8,
      intervenant=$9, cout=$10, notes_resolution=$11
    WHERE id = $12
    RETURNING *
  `, [
    titre,
    categorie || 'Autre',
    priorite  || 'normale',
    statut    || 'ouvert',
    espace_id || null,
    date_creation || new Date().toISOString().split('T')[0],
    date_resolution_prevue || null,
    description    || '',
    intervenant    || '',
    parseFloat(cout) || 0,
    notes_resolution || '',
    findResult.rows[0].id
  ]);

  res.json(result.rows[0]);
}));

// PATCH /api/maintenance/:id/statut — changement rapide de statut
router.patch('/:id/statut', auth, requireRole('admin', 'gestionnaire'), [
  body('statut').isIn(STATUTS).withMessage('Statut invalide'),
  validate
], asyncHandler(async (req, res) => {
  const { statut } = req.body;
  const result = await query(
    'UPDATE maintenance SET statut=$1 WHERE id::text=$2 RETURNING *',
    [statut, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Ticket introuvable' });
  res.json(result.rows[0]);
}));

// DELETE /api/maintenance/:id
router.delete('/:id', auth, requireRole('admin', 'gestionnaire'), asyncHandler(async (req, res) => {
  const findResult = await query('SELECT id, titre FROM maintenance WHERE id::text = $1', [req.params.id]);
  if (!findResult.rows[0]) return res.status(404).json({ error: 'Ticket introuvable' });

  await query('DELETE FROM maintenance WHERE id = $1', [findResult.rows[0].id]);
  res.json({ message: 'Ticket supprimé avec succès' });
}));

module.exports = router;