const router = require('express').Router();
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

const BASE_SQL = `
  SELECT f.*,
    l.nom  AS locataire_nom,
    e.nom  AS espace_nom, e.numero AS espace_numero,
    c.numero AS contrat_numero,
    (f.montant_ttc - f.montant_paye) AS reste_a_payer
  FROM factures f
  LEFT JOIN locataires l ON l.id = f.locataire_id
  LEFT JOIN espaces e ON e.id = f.espace_id
  LEFT JOIN contrats c ON c.id = f.contrat_id
`;

// GET /api/factures
router.get('/', auth, asyncHandler(async (req, res) => {
  const { statut, locataire_id, mois, annee } = req.query;
  let sql = BASE_SQL + ' WHERE 1=1';
  const params = [];
  if (statut)       { params.push(statut);       sql += ` AND f.statut = $${params.length}`; }
  if (locataire_id) { params.push(locataire_id); sql += ` AND f.locataire_id = $${params.length}`; }
  if (mois)         { params.push(parseInt(mois));  sql += ` AND EXTRACT(MONTH FROM f.date_emission) = $${params.length}`; }
  if (annee)        { params.push(parseInt(annee)); sql += ` AND EXTRACT(YEAR FROM f.date_emission) = $${params.length}`; }
  sql += ' ORDER BY f.date_emission DESC';
  res.json((await query(sql, params)).rows);
}));

// GET /api/factures/impayees
router.get('/impayees', auth, asyncHandler(async (req, res) => {
  const result = await query(BASE_SQL + ` WHERE f.statut IN ('impayee','partielle') ORDER BY f.date_echeance`);
  res.json(result.rows);
}));

// GET /api/factures/:id
router.get('/:id', auth, [param('id').isUUID(), validate], asyncHandler(async (req, res) => {
  const fRes = await query(BASE_SQL + ' WHERE f.id = $1', [req.params.id]);
  if (!fRes.rows[0]) return res.status(404).json({ error: 'Facture introuvable' });

  const pRes = await query(
    'SELECT * FROM paiements WHERE facture_id = $1 ORDER BY date_paiement DESC',
    [req.params.id]
  );
  res.json({ ...fRes.rows[0], paiements: pRes.rows });
}));

// POST /api/factures
router.post('/', auth, requireRole('admin','gestionnaire','comptable'), [
  body('numero').notEmpty(),
  body('locataire_id').isUUID(),
  body('date_emission').isDate(),
  body('date_echeance').isDate(),
  body('montant_ht').isFloat({ min: 0 }),
  validate
], asyncHandler(async (req, res) => {
  const { numero, contrat_id, locataire_id, espace_id, date_emission, date_echeance, periode, montant_ht, tva, notes } = req.body;
  const tvaTaux = parseFloat(tva) || 18;
  const montant_tva = Math.round(montant_ht * tvaTaux / 100);
  const montant_ttc = parseFloat(montant_ht) + montant_tva;

  const result = await query(`
    INSERT INTO factures (numero, contrat_id, locataire_id, espace_id, date_emission, date_echeance, periode, montant_ht, tva, montant_tva, montant_ttc, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
  `, [numero, contrat_id||null, locataire_id, espace_id||null, date_emission, date_echeance, periode||'', montant_ht, tvaTaux, montant_tva, montant_ttc, notes||'']);
  res.status(201).json(result.rows[0]);
}));

// PUT /api/factures/:id
router.put('/:id', auth, requireRole('admin','gestionnaire','comptable'), [
  param('id').isUUID(), validate
], asyncHandler(async (req, res) => {
  const { numero, contrat_id, locataire_id, espace_id, date_emission, date_echeance, periode, montant_ht, tva, notes } = req.body;
  const tvaTaux = parseFloat(tva) || 18;
  const montant_tva = Math.round(montant_ht * tvaTaux / 100);
  const montant_ttc = parseFloat(montant_ht) + montant_tva;

  const result = await query(`
    UPDATE factures SET numero=$1,contrat_id=$2,locataire_id=$3,espace_id=$4,date_emission=$5,
    date_echeance=$6,periode=$7,montant_ht=$8,tva=$9,montant_tva=$10,montant_ttc=$11,notes=$12
    WHERE id=$13 RETURNING *
  `, [numero, contrat_id||null, locataire_id, espace_id||null, date_emission, date_echeance, periode, montant_ht, tvaTaux, montant_tva, montant_ttc, notes, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Facture introuvable' });
  res.json(result.rows[0]);
}));

// DELETE /api/factures/:id
router.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM factures WHERE id=$1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Facture introuvable' });
  res.json({ message: 'Facture supprimée' });
}));

module.exports = router;
