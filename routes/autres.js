// ─── MAINTENANCE ─────────────────────────────────────────────────────────────
const express = require('express');
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

// ── Maintenance ──────────────────────────────────────────────────────────────
const maintenance = express.Router();

maintenance.get('/', auth, asyncHandler(async (req, res) => {
  const { statut, priorite } = req.query;
  let sql = `SELECT m.*, e.nom AS espace_nom, e.numero AS espace_numero
             FROM maintenance m LEFT JOIN espaces e ON e.id = m.espace_id WHERE 1=1`;
  const params = [];
  if (statut)   { params.push(statut);   sql += ` AND m.statut = $${params.length}`; }
  if (priorite) { params.push(priorite); sql += ` AND m.priorite = $${params.length}`; }
  sql += ' ORDER BY CASE m.priorite WHEN \'urgente\' THEN 1 WHEN \'haute\' THEN 2 WHEN \'normale\' THEN 3 ELSE 4 END, m.created_at DESC';
  res.json((await query(sql, params)).rows);
}));

maintenance.get('/stats', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE statut = 'ouvert')   AS ouverts,
      COUNT(*) FILTER (WHERE statut = 'en_cours') AS en_cours,
      COUNT(*) FILTER (WHERE statut = 'resolu')   AS resolus,
      COUNT(*) FILTER (WHERE priorite = 'urgente' AND statut NOT IN ('resolu','ferme')) AS urgents,
      SUM(cout) FILTER (WHERE statut = 'resolu')  AS cout_total_resolu
    FROM maintenance
  `);
  res.json(result.rows[0]);
}));

maintenance.post('/', auth, requireRole('admin','gestionnaire'), [
  body('titre').notEmpty().withMessage('Titre requis'),
  body('priorite').isIn(['basse','normale','haute','urgente']).optional(),
  validate
], asyncHandler(async (req, res) => {
  const { numero, titre, description, categorie, priorite, statut, espace_id, date_creation, date_resolution_prevue, intervenant, cout, notes_resolution } = req.body;
  const result = await query(`
    INSERT INTO maintenance (numero, titre, description, categorie, priorite, statut, espace_id, date_creation, date_resolution_prevue, intervenant, cout, notes_resolution)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
  `, [numero, titre, description||'', categorie||'Autre', priorite||'normale', statut||'ouvert',
      espace_id||null, date_creation||new Date().toISOString().slice(0,10),
      date_resolution_prevue||null, intervenant||'', cout||0, notes_resolution||'']);
  res.status(201).json(result.rows[0]);
}));

maintenance.put('/:id', auth, requireRole('admin','gestionnaire'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const { titre, description, categorie, priorite, statut, espace_id, date_creation, date_resolution_prevue, intervenant, cout, notes_resolution } = req.body;
  const result = await query(`
    UPDATE maintenance SET titre=$1,description=$2,categorie=$3,priorite=$4,statut=$5,
    espace_id=$6,date_creation=$7,date_resolution_prevue=$8,intervenant=$9,cout=$10,notes_resolution=$11
    WHERE id=$12 RETURNING *
  `, [titre, description, categorie, priorite, statut, espace_id||null,
      date_creation, date_resolution_prevue||null, intervenant, cout||0, notes_resolution, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Ticket introuvable' });
  res.json(result.rows[0]);
}));

maintenance.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM maintenance WHERE id=$1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Ticket introuvable' });
  res.json({ message: 'Ticket supprimé' });
}));

// ── CRM ──────────────────────────────────────────────────────────────────────
const crm = express.Router();

crm.get('/', auth, asyncHandler(async (req, res) => {
  const { etape } = req.query;
  let sql = `SELECT c.*, e.nom AS espace_nom FROM crm c LEFT JOIN espaces e ON e.id = c.espace_id WHERE 1=1`;
  const params = [];
  if (etape) { params.push(etape); sql += ` AND c.etape = $${params.length}`; }
  sql += ' ORDER BY c.created_at DESC';
  res.json((await query(sql, params)).rows);
}));

crm.post('/', auth, requireRole('admin','gestionnaire'), [
  body('nom').notEmpty().withMessage('Nom requis'),
  validate
], asyncHandler(async (req, res) => {
  const { nom, societe, tel, email, etape, espace_id, loyer_propose, activite, dernier_contact, notes } = req.body;
  const result = await query(`
    INSERT INTO crm (nom, societe, tel, email, etape, espace_id, loyer_propose, activite, dernier_contact, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
  `, [nom, societe||'', tel||'', email||'', etape||'contact', espace_id||null,
      loyer_propose||0, activite||'', dernier_contact||new Date().toISOString().slice(0,10), notes||'']);
  res.status(201).json(result.rows[0]);
}));

crm.put('/:id', auth, requireRole('admin','gestionnaire'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const { nom, societe, tel, email, etape, espace_id, loyer_propose, activite, dernier_contact, notes } = req.body;
  const result = await query(`
    UPDATE crm SET nom=$1,societe=$2,tel=$3,email=$4,etape=$5,espace_id=$6,
    loyer_propose=$7,activite=$8,dernier_contact=$9,notes=$10
    WHERE id=$11 RETURNING *
  `, [nom, societe, tel, email, etape, espace_id||null, loyer_propose||0, activite, dernier_contact, notes, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Prospect introuvable' });
  res.json(result.rows[0]);
}));

crm.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM crm WHERE id=$1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Prospect introuvable' });
  res.json({ message: 'Prospect supprimé' });
}));

// ── Rapports ─────────────────────────────────────────────────────────────────
const rapports = express.Router();

rapports.get('/revenus', auth, asyncHandler(async (req, res) => {
  const { mois, annee } = req.query;
  const y = parseInt(annee) || new Date().getFullYear();
  const m = parseInt(mois)  || new Date().getMonth() + 1;

  const [paiements, impayees, parLocataire, mensuel12] = await Promise.all([
    query(`
      SELECT p.*, l.nom AS locataire_nom, f.numero AS facture_numero, f.periode,
             e.nom AS espace_nom
      FROM paiements p
      LEFT JOIN locataires l ON l.id = p.locataire_id
      LEFT JOIN factures f ON f.id = p.facture_id
      LEFT JOIN espaces e ON e.id = f.espace_id
      WHERE EXTRACT(MONTH FROM p.date_paiement)=$1 AND EXTRACT(YEAR FROM p.date_paiement)=$2
      ORDER BY p.date_paiement
    `, [m, y]),

    query(`
      SELECT f.*, l.nom AS locataire_nom, e.nom AS espace_nom,
             (f.montant_ttc - f.montant_paye) AS reste
      FROM factures f
      LEFT JOIN locataires l ON l.id = f.locataire_id
      LEFT JOIN espaces e ON e.id = f.espace_id
      WHERE f.statut IN ('impayee','partielle')
      ORDER BY f.date_echeance
    `, []),

    query(`
      SELECT l.nom AS locataire_nom, e.nom AS espace_nom,
             SUM(p.montant) AS total_paye, COUNT(p.id) AS nb_paiements
      FROM paiements p
      LEFT JOIN locataires l ON l.id = p.locataire_id
      LEFT JOIN factures f ON f.id = p.facture_id
      LEFT JOIN espaces e ON e.id = f.espace_id
      WHERE EXTRACT(MONTH FROM p.date_paiement)=$1 AND EXTRACT(YEAR FROM p.date_paiement)=$2
      GROUP BY l.nom, e.nom ORDER BY total_paye DESC
    `, [m, y]),

    query(`
      SELECT EXTRACT(YEAR FROM date_paiement) AS annee,
             EXTRACT(MONTH FROM date_paiement) AS mois,
             SUM(montant) AS total, COUNT(*) AS nb
      FROM paiements
      WHERE date_paiement >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY annee, mois ORDER BY annee, mois
    `, []),
  ]);

  res.json({
    mois: m, annee: y,
    paiements:    paiements.rows,
    impayees:     impayees.rows,
    par_locataire: parLocataire.rows,
    mensuel_12:   mensuel12.rows,
  });
}));

rapports.get('/dashboard', auth, asyncHandler(async (req, res) => {
  const today = new Date();
  const m = today.getMonth() + 1;
  const y = today.getFullYear();

  const [occupation, revenusMois, impayeTotal, maintenance_actif, expirant] = await Promise.all([
    query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE statut='occupe') AS occupes FROM espaces`),
    query(`SELECT COALESCE(SUM(montant),0) AS total FROM paiements WHERE EXTRACT(MONTH FROM date_paiement)=$1 AND EXTRACT(YEAR FROM date_paiement)=$2`, [m, y]),
    query(`SELECT COALESCE(SUM(montant_ttc - montant_paye),0) AS total FROM factures WHERE statut IN ('impayee','partielle')`),
    query(`SELECT COUNT(*) AS total FROM maintenance WHERE statut IN ('ouvert','en_cours')`),
    query(`SELECT COUNT(*) AS total FROM contrats WHERE statut='actif' AND date_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'`),
  ]);

  res.json({
    occupation:       occupation.rows[0],
    revenus_mois:     parseFloat(revenusMois.rows[0].total),
    impaye_total:     parseFloat(impayeTotal.rows[0].total),
    maintenance_actif: parseInt(maintenance_actif.rows[0].total),
    contrats_expirant: parseInt(expirant.rows[0].total),
  });
}));

// ── Paramètres ───────────────────────────────────────────────────────────────
const parametres = express.Router();

parametres.get('/', auth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM parametres WHERE id = 1');
  res.json(result.rows[0] || {});
}));

parametres.put('/', auth, requireRole('admin'), asyncHandler(async (req, res) => {
  const {
    societe, mall, adresse, tel, email, site, rccm, logo,
    devise, tva, primary_color,
    titre_facture, stietre_facture, note_facture, conditions, note_contrat,
    prefixe_facture, prefixe_contrat
  } = req.body;

  const result = await query(`
    INSERT INTO parametres (id, societe, mall, adresse, tel, email, site, rccm, logo, devise, tva, primary_color,
      titre_facture, stietre_facture, note_facture, conditions, note_contrat, prefixe_facture, prefixe_contrat)
    VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (id) DO UPDATE SET
      societe=$1, mall=$2, adresse=$3, tel=$4, email=$5, site=$6, rccm=$7, logo=$8,
      devise=$9, tva=$10, primary_color=$11,
      titre_facture=$12, stietre_facture=$13, note_facture=$14, conditions=$15,
      note_contrat=$16, prefixe_facture=$17, prefixe_contrat=$18,
      updated_at=NOW()
    RETURNING *
  `, [societe, mall, adresse, tel, email, site, rccm, logo,
      devise||'FCFA', tva||18, primary_color||'#6366f1',
      titre_facture, stietre_facture, note_facture, conditions, note_contrat,
      prefixe_facture||'FAC', prefixe_contrat||'CTR']);
  res.json(result.rows[0]);
}));

// ── Activités ────────────────────────────────────────────────────────────────
const activites = express.Router();

activites.get('/', auth, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const result = await query('SELECT * FROM activites ORDER BY created_at DESC LIMIT $1', [limit]);
  res.json(result.rows);
}));

activites.post('/', auth, asyncHandler(async (req, res) => {
  const { texte, couleur } = req.body;
  if (!texte) return res.status(400).json({ error: 'Texte requis' });
  const result = await query(
    'INSERT INTO activites (texte, couleur) VALUES ($1,$2) RETURNING *',
    [texte, couleur||'#1a56db']
  );
  res.status(201).json(result.rows[0]);
}));

module.exports = { maintenance, crm, rapports, parametres, activites };
