const router = require('express').Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/rapports/dashboard
router.get('/dashboard', auth, asyncHandler(async (req, res) => {
  const [espaces, locataires, contrats, factures, maintenance] = await Promise.all([
    query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE statut=\'occupe\') AS occupes FROM espaces'),
    query('SELECT COUNT(*) AS total FROM locataires'),
    query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE statut=\'actif\') AS actifs FROM contrats'),
    query(`SELECT
      COALESCE(SUM(montant_ttc) FILTER (WHERE statut='impayee'), 0) AS impayees,
      COALESCE(SUM(montant_ttc) FILTER (WHERE statut='payee'
        AND date_echeance >= date_trunc('month', CURRENT_DATE)
        AND date_echeance <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      ), 0) AS revenus_mois
    FROM factures`),
    query(`SELECT COUNT(*) AS actifs FROM maintenance WHERE statut IN ('ouvert','en_cours')`),
  ]);

  const e = espaces.rows[0];
  const tauxOccup = e.total > 0 ? Math.round(e.occupes * 100 / e.total) : 0;

  res.json({
    espaces:        { total: parseInt(e.total), occupes: parseInt(e.occupes), taux_occupation: tauxOccup },
    locataires:     { total: parseInt(locataires.rows[0].total) },
    contrats:       { total: parseInt(contrats.rows[0].total), actifs: parseInt(contrats.rows[0].actifs) },
    factures:       { impayees: parseFloat(factures.rows[0].impayees), revenus_mois: parseFloat(factures.rows[0].revenus_mois) },
    maintenance:    { actifs: parseInt(maintenance.rows[0].actifs) },
  });
}));

// GET /api/rapports/revenus?mois=6&annee=2025
router.get('/revenus', auth, asyncHandler(async (req, res) => {
  const mois  = parseInt(req.query.mois)  || new Date().getMonth() + 1;
  const annee = parseInt(req.query.annee) || new Date().getFullYear();

  // Paiements du mois
  const paiements = await query(`
    SELECT
      p.*,
      l.nom AS locataire_nom,
      f.numero AS facture_numero,
      f.periode
    FROM paiements p
    LEFT JOIN locataires l ON l.id = p.locataire_id
    LEFT JOIN factures   f ON f.id = p.facture_id
    WHERE EXTRACT(MONTH FROM p.date_paiement) = $1
      AND EXTRACT(YEAR  FROM p.date_paiement) = $2
    ORDER BY p.date_paiement DESC
  `, [mois, annee]);

  // Factures impayées
  const impayees = await query(`
    SELECT
      f.*,
      l.nom AS locataire_nom,
      e.nom AS espace_nom, e.numero AS espace_numero
    FROM factures f
    LEFT JOIN locataires l ON l.id = f.locataire_id
    LEFT JOIN espaces    e ON e.id = f.espace_id
    WHERE f.statut IN ('impayee','partielle')
    ORDER BY f.date_echeance ASC
  `);

  // Revenus 6 derniers mois
  const sixMois = await query(`
    SELECT
      EXTRACT(MONTH FROM date_paiement)::int AS mois,
      EXTRACT(YEAR  FROM date_paiement)::int AS annee,
      COALESCE(SUM(montant), 0) AS total
    FROM paiements
    WHERE date_paiement >= (CURRENT_DATE - INTERVAL '6 months')
    GROUP BY 1, 2
    ORDER BY 2, 1
  `);

  // Synthèse par locataire pour le mois
  const parLocataire = await query(`
    SELECT
      l.nom,
      COALESCE(SUM(p.montant), 0) AS total_paye,
      COUNT(p.id) AS nb_paiements
    FROM locataires l
    LEFT JOIN paiements p ON p.locataire_id = l.id
      AND EXTRACT(MONTH FROM p.date_paiement) = $1
      AND EXTRACT(YEAR  FROM p.date_paiement) = $2
    GROUP BY l.id, l.nom
    ORDER BY total_paye DESC
  `, [mois, annee]);

  res.json({
    mois, annee,
    paiements:      paiements.rows,
    impayees:       impayees.rows,
    six_mois:       sixMois.rows,
    par_locataire:  parLocataire.rows,
    total_mois:     paiements.rows.reduce((s, p) => s + parseFloat(p.montant || 0), 0),
    total_impayees: impayees.rows.reduce((s, f) => s + parseFloat(f.montant_ttc || 0), 0),
  });
}));

// GET /api/rapports/occupation
router.get('/occupation', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      e.type,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE e.statut = 'occupe')    AS occupes,
      COUNT(*) FILTER (WHERE e.statut = 'disponible') AS disponibles,
      COALESCE(SUM(e.loyer) FILTER (WHERE e.statut = 'occupe'), 0) AS revenus_mensuels
    FROM espaces e
    GROUP BY e.type
    ORDER BY total DESC
  `);
  res.json(result.rows);
}));

// GET /api/rapports/maintenance
router.get('/maintenance', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      m.*,
      e.nom AS espace_nom, e.numero AS espace_numero
    FROM maintenance m
    LEFT JOIN espaces e ON e.id = m.espace_id
    ORDER BY
      CASE m.priorite WHEN 'urgente' THEN 0 WHEN 'haute' THEN 1 WHEN 'normale' THEN 2 ELSE 3 END,
      m.date_creation DESC
  `);
  res.json(result.rows);
}));

module.exports = router;