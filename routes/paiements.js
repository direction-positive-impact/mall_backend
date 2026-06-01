const router = require('express').Router();
const { body, param } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { query, withTransaction } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');

// Config upload preuve de paiement
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `preuve-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.pdf'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Format non autorisé (jpg, png, pdf seulement)'));
  }
});

// GET /api/paiements
router.get('/', auth, asyncHandler(async (req, res) => {
  const { locataire_id, facture_id, mois, annee } = req.query;
  let sql = `
    SELECT p.*, l.nom AS locataire_nom, f.numero AS facture_numero, f.montant_ttc
    FROM paiements p
    LEFT JOIN locataires l ON l.id = p.locataire_id
    LEFT JOIN factures f ON f.id = p.facture_id
    WHERE 1=1
  `;
  const params = [];
  if (locataire_id) { params.push(locataire_id); sql += ` AND p.locataire_id = $${params.length}`; }
  if (facture_id)   { params.push(facture_id);   sql += ` AND p.facture_id = $${params.length}`; }
  if (mois)         { params.push(parseInt(mois));  sql += ` AND EXTRACT(MONTH FROM p.date_paiement) = $${params.length}`; }
  if (annee)        { params.push(parseInt(annee)); sql += ` AND EXTRACT(YEAR FROM p.date_paiement) = $${params.length}`; }
  sql += ' ORDER BY p.date_paiement DESC';
  res.json((await query(sql, params)).rows);
}));

// GET /api/paiements/:id
router.get('/:id', auth, [param('id').isUUID(), validate], asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT p.*, l.nom AS locataire_nom, f.numero AS facture_numero, f.montant_ttc, f.montant_paye
    FROM paiements p
    LEFT JOIN locataires l ON l.id = p.locataire_id
    LEFT JOIN factures f ON f.id = p.facture_id
    WHERE p.id = $1
  `, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Paiement introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/paiements  (avec upload optionnel de preuve)
router.post('/', auth, requireRole('admin','gestionnaire','comptable'),
upload.single('preuve_paiement'),
asyncHandler(async (req, res) => {
  const { numero, facture_id, locataire_id, montant, mode_paiement, date_paiement, reference, notes } = req.body;

  if (!numero || !facture_id || !locataire_id || !montant || !date_paiement) {
    return res.status(400).json({ error: 'Champs obligatoires manquants: numero, facture_id, locataire_id, montant, date_paiement' });
  }

  const preuvePath = req.file ? req.file.filename : null;
  const montantNum = parseFloat(montant);

  const result = await withTransaction(async (client) => {
    // Récupérer la facture
    const fRes = await client.query('SELECT * FROM factures WHERE id = $1 FOR UPDATE', [facture_id]);
    const facture = fRes.rows[0];
    if (!facture) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
    if (facture.statut === 'payee') throw Object.assign(new Error('Cette facture est déjà entièrement payée'), { status: 400 });

    // Calculer nouveau montant payé
    const nouveauPaye = parseFloat(facture.montant_paye) + montantNum;
    const ttc = parseFloat(facture.montant_ttc);
    const newStatut = nouveauPaye >= ttc ? 'payee' : 'partielle';

    // Créer le paiement
    const pRes = await client.query(`
      INSERT INTO paiements (numero, facture_id, locataire_id, montant, mode_paiement, date_paiement, reference, preuve_paiement, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [numero, facture_id, locataire_id, montantNum, mode_paiement||'especes', date_paiement, reference||'', preuvePath, notes||'']);

    // Mettre à jour la facture
    await client.query(
      'UPDATE factures SET montant_paye=$1, statut=$2 WHERE id=$3',
      [Math.min(nouveauPaye, ttc), newStatut, facture_id]
    );

    // Activité
    await client.query(
      `INSERT INTO activites (texte) VALUES ($1)`,
      [`💰 Paiement enregistré: ${montantNum.toLocaleString('fr-FR')} FCFA (Facture ${facture.numero})`]
    );

    return pRes;
  });

  res.status(201).json(result.rows[0]);
}));

// DELETE /api/paiements/:id  (annule et inverse le statut facture)
router.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const pRes = await client.query('SELECT * FROM paiements WHERE id=$1', [req.params.id]);
    const p = pRes.rows[0];
    if (!p) throw Object.assign(new Error('Paiement introuvable'), { status: 404 });

    await client.query('DELETE FROM paiements WHERE id=$1', [req.params.id]);

    if (p.facture_id) {
      const fRes = await client.query('SELECT * FROM factures WHERE id=$1', [p.facture_id]);
      const f = fRes.rows[0];
      if (f) {
        const newPaye = Math.max(0, parseFloat(f.montant_paye) - parseFloat(p.montant));
        const newStatut = newPaye <= 0 ? 'impayee' : 'partielle';
        await client.query('UPDATE factures SET montant_paye=$1, statut=$2 WHERE id=$3', [newPaye, newStatut, f.id]);
      }
    }
  });
  res.json({ message: 'Paiement annulé et facture mise à jour' });
}));

module.exports = router;
