// ─── CONTRATS ────────────────────────────────────────────────────────────────
const router = require('express').Router();
const { body, param } = require('express-validator');
const { query, withTransaction } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

// GET /api/contrats
router.get('/', auth, asyncHandler(async (req, res) => {
  const { statut, locataire_id, espace_id } = req.query;
  let sql = `SELECT c.*, l.nom AS locataire_nom, e.nom AS espace_nom, e.numero AS espace_numero
             FROM contrats c
             LEFT JOIN locataires l ON l.id = c.locataire_id
             LEFT JOIN espaces e ON e.id = c.espace_id
             WHERE 1=1`;
  const params = [];
  if (statut)       { params.push(statut);       sql += ` AND c.statut = $${params.length}`; }
  if (locataire_id) { params.push(locataire_id); sql += ` AND c.locataire_id = $${params.length}`; }
  if (espace_id)    { params.push(espace_id);    sql += ` AND c.espace_id = $${params.length}`; }
  sql += ' ORDER BY c.date_debut DESC';
  res.json((await query(sql, params)).rows);
}));

// GET /api/contrats/expirant  (dans les 60 prochains jours)
router.get('/expirant', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.*, l.nom AS locataire_nom, e.nom AS espace_nom
    FROM contrats c
    LEFT JOIN locataires l ON l.id = c.locataire_id
    LEFT JOIN espaces e ON e.id = c.espace_id
    WHERE c.statut = 'actif' AND c.date_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
    ORDER BY c.date_fin
  `);
  res.json(result.rows);
}));

// GET /api/contrats/:id
router.get('/:id', auth, [param('id').isUUID(), validate], asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.*, l.nom AS locataire_nom, l.tel AS locataire_tel, l.email AS locataire_email,
           e.nom AS espace_nom, e.numero AS espace_numero, e.etage
    FROM contrats c
    LEFT JOIN locataires l ON l.id = c.locataire_id
    LEFT JOIN espaces e ON e.id = c.espace_id
    WHERE c.id = $1
  `, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/contrats
router.post('/', auth, requireRole('admin','gestionnaire'), [
  body('numero').notEmpty(),
  body('espace_id').isUUID(),
  body('locataire_id').isUUID(),
  body('date_debut').isDate(),
  body('date_fin').isDate(),
  body('loyer').isFloat({ min: 0 }),
  validate
], asyncHandler(async (req, res) => {
  const { numero, espace_id, locataire_id, date_debut, date_fin, duree_mois, loyer, depot_garantie, notes } = req.body;
  const result = await withTransaction(async (client) => {
    const r = await client.query(`
      INSERT INTO contrats (numero, espace_id, locataire_id, date_debut, date_fin, duree_mois, loyer, depot_garantie, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [numero, espace_id, locataire_id, date_debut, date_fin, duree_mois||12, loyer, depot_garantie||0, notes||'']);
    await client.query(`UPDATE espaces SET statut='occupe' WHERE id=$1`, [espace_id]);
    return r;
  });
  res.status(201).json(result.rows[0]);
}));

// PUT /api/contrats/:id
router.put('/:id', auth, requireRole('admin','gestionnaire'), [
  param('id').isUUID(), validate
], asyncHandler(async (req, res) => {
  const { numero, espace_id, locataire_id, date_debut, date_fin, duree_mois, loyer, depot_garantie, statut, contrat_archive, notes } = req.body;
  const result = await query(`
    UPDATE contrats SET numero=$1,espace_id=$2,locataire_id=$3,date_debut=$4,date_fin=$5,
    duree_mois=$6,loyer=$7,depot_garantie=$8,statut=$9,contrat_archive=$10,notes=$11
    WHERE id=$12 RETURNING *
  `, [numero, espace_id, locataire_id, date_debut, date_fin, duree_mois, loyer, depot_garantie, statut, contrat_archive||null, notes, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(result.rows[0]);
}));

// DELETE /api/contrats/:id
router.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const c = await query('SELECT espace_id FROM contrats WHERE id=$1', [req.params.id]);
  if (!c.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });
  await withTransaction(async (client) => {
    await client.query('DELETE FROM contrats WHERE id=$1', [req.params.id]);
    // Libérer l'espace si plus de contrats actifs
    const remaining = await client.query(
      `SELECT id FROM contrats WHERE espace_id=$1 AND statut='actif'`, [c.rows[0].espace_id]
    );
    if (remaining.rows.length === 0) {
      await client.query(`UPDATE espaces SET statut='disponible' WHERE id=$1`, [c.rows[0].espace_id]);
    }
  });
  res.json({ message: 'Contrat supprimé' });
}));

module.exports = router;
