const router = require('express').Router();
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

const STATUTS = ['disponible','occupe','travaux','reserve'];

// GET /api/espaces
router.get('/', auth, asyncHandler(async (req, res) => {
  const { statut, type } = req.query;
  let sql = 'SELECT * FROM espaces WHERE 1=1';
  const params = [];
  if (statut) { params.push(statut); sql += ` AND statut = $${params.length}`; }
  if (type)   { params.push(type);   sql += ` AND type = $${params.length}`; }
  sql += ' ORDER BY numero';
  const result = await query(sql, params);
  res.json(result.rows);
}));

// GET /api/espaces/stats
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE statut = 'occupe')     AS occupes,
      COUNT(*) FILTER (WHERE statut = 'disponible') AS disponibles,
      COUNT(*) FILTER (WHERE statut = 'travaux')    AS travaux,
      COUNT(*) FILTER (WHERE statut = 'reserve')    AS reserves,
      SUM(loyer) FILTER (WHERE statut = 'occupe')   AS revenus_mensuels
    FROM espaces
  `);
  res.json(result.rows[0]);
}));

// GET /api/espaces/:id
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM espaces WHERE id::text = $1 OR numero = $1',
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Espace introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/espaces
router.post('/', auth, requireRole('admin', 'gestionnaire'), [
  body('numero').notEmpty().withMessage('Numéro requis'),
  body('nom').notEmpty().withMessage('Nom requis'),
  body('loyer').isFloat({ min: 0 }).withMessage('Loyer invalide'),
  body('statut').isIn(STATUTS).optional(),
  validate
], asyncHandler(async (req, res) => {
  const { numero, nom, type, etage, superficie, loyer, statut, description } = req.body;
  const result = await query(`
    INSERT INTO espaces (numero, nom, type, etage, superficie, loyer, statut, description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [numero, nom, type||'Boutique', etage||'', superficie||null, loyer, statut||'disponible', description||'']);
  res.status(201).json(result.rows[0]);
}));

// PUT /api/espaces/:id
router.put('/:id', auth, requireRole('admin', 'gestionnaire'), [
  body('loyer').isFloat({ min: 0 }).optional(),
  body('statut').isIn(STATUTS).optional(),
  validate
], asyncHandler(async (req, res) => {
  const { numero, nom, type, etage, superficie, loyer, statut, description } = req.body;

  const findResult = await query(
    'SELECT id FROM espaces WHERE id::text = $1 OR numero = $1',
    [req.params.id]
  );
  if (!findResult.rows[0]) return res.status(404).json({ error: 'Espace introuvable' });
  const espaceId = findResult.rows[0].id;

  const result = await query(`
    UPDATE espaces SET
      numero=$1, nom=$2, type=$3, etage=$4, superficie=$5,
      loyer=$6, statut=$7, description=$8
    WHERE id = $9 RETURNING *
  `, [numero, nom, type, etage, superficie, loyer, statut, description, espaceId]);

  res.json(result.rows[0]);
}));

// DELETE /api/espaces/:id
router.delete('/:id', auth, requireRole('admin', 'gestionnaire'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  console.log('Tentative suppression ID reçu:', id);
  console.log('Rôle utilisateur:', req.user?.role);

  // Chercher l'espace par ID ou numéro
  const findResult = await query(
    'SELECT id, numero, nom FROM espaces WHERE id::text = $1 OR numero = $1',
    [id]
  );
  if (findResult.rows.length === 0) {
    return res.status(404).json({ error: 'Espace non trouvé' });
  }

  const espace = findResult.rows[0];
  console.log('Espace trouvé:', espace);

  // Vérifier s'il y a un contrat actif
  const contratResult = await query(
    'SELECT id FROM contrats WHERE espace_id = $1 AND statut = $2',
    [espace.id, 'actif']
  );
  if (contratResult.rows.length > 0) {
    return res.status(400).json({ error: 'Impossible de supprimer un espace avec un contrat actif' });
  }

  // Supprimer
  await query('DELETE FROM espaces WHERE id = $1', [espace.id]);

  res.json({ message: 'Espace supprimé avec succès' });
}));

module.exports = router;