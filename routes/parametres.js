const router = require('express').Router();
const { body } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

// GET /api/parametres
router.get('/', auth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM parametres WHERE id = 1');
  res.json(result.rows[0] || {});
}));

// PUT /api/parametres
router.put('/', auth, requireRole('admin'), [
  body('tva').isFloat({ min: 0, max: 100 }).optional(),
  validate
], asyncHandler(async (req, res) => {
  const {
    societe, mall, adresse, tel, email, site, rccm, logo,
    devise, tva, primary_color,
    titre_facture, stietre_facture, note_facture,
    conditions, note_contrat,
    prefixe_facture, prefixe_contrat
  } = req.body;

  const result = await query(`
    INSERT INTO parametres (id,
      societe, mall, adresse, tel, email, site, rccm, logo,
      devise, tva, primary_color,
      titre_facture, stietre_facture, note_facture,
      conditions, note_contrat,
      prefixe_facture, prefixe_contrat
    ) VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (id) DO UPDATE SET
      societe          = EXCLUDED.societe,
      mall             = EXCLUDED.mall,
      adresse          = EXCLUDED.adresse,
      tel              = EXCLUDED.tel,
      email            = EXCLUDED.email,
      site             = EXCLUDED.site,
      rccm             = EXCLUDED.rccm,
      logo             = EXCLUDED.logo,
      devise           = EXCLUDED.devise,
      tva              = EXCLUDED.tva,
      primary_color    = EXCLUDED.primary_color,
      titre_facture    = EXCLUDED.titre_facture,
      stietre_facture  = EXCLUDED.stietre_facture,
      note_facture     = EXCLUDED.note_facture,
      conditions       = EXCLUDED.conditions,
      note_contrat     = EXCLUDED.note_contrat,
      prefixe_facture  = EXCLUDED.prefixe_facture,
      prefixe_contrat  = EXCLUDED.prefixe_contrat,
      updated_at       = NOW()
    RETURNING *
  `, [
    societe         || 'Betna Executive',
    mall            || "N'Djamena Mall",
    adresse         || null,
    tel             || null,
    email           || null,
    site            || null,
    rccm            || null,
    logo            || null,
    devise          || 'FCFA',
    parseFloat(tva) || 18,
    primary_color   || '#6366f1',
    titre_facture   || 'FACTURE',
    stietre_facture || 'Loyer et charges',
    note_facture    || 'Merci pour votre confiance. Paiement à réception.',
    conditions      || null,
    note_contrat    || null,
    prefixe_facture || 'FAC',
    prefixe_contrat || 'CTR',
  ]);

  res.json(result.rows[0]);
}));

module.exports = router;