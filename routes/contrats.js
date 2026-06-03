// ─── CONTRATS ────────────────────────────────────────────────────────────────
const router  = require('express').Router();
const { body, param } = require('express-validator');
const { query, withTransaction } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/errorHandler');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer : stockage des contrats signés ────────────────────────────────────
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'contrats');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `contrat_${req.params.id}_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF, JPG et PNG sont acceptés'));
    }
  }
});

// GET /api/contrats
router.get('/', auth, asyncHandler(async (req, res) => {
  const { statut, locataire_id, espace_id } = req.query;
  let sql = `
    SELECT c.*,
      l.nom  AS locataire_nom,
      e.nom  AS espace_nom,
      e.numero AS espace_numero
    FROM contrats c
    LEFT JOIN locataires l ON l.id = c.locataire_id
    LEFT JOIN espaces    e ON e.id = c.espace_id
    WHERE 1=1
  `;
  const params = [];
  if (statut)       { params.push(statut);       sql += ` AND c.statut = $${params.length}`; }
  if (locataire_id) { params.push(locataire_id); sql += ` AND c.locataire_id = $${params.length}`; }
  if (espace_id)    { params.push(espace_id);    sql += ` AND c.espace_id = $${params.length}`; }
  sql += ' ORDER BY c.date_debut DESC';
  res.json((await query(sql, params)).rows);
}));

// GET /api/contrats/expirant
router.get('/expirant', auth, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.*, l.nom AS locataire_nom, e.nom AS espace_nom
    FROM contrats c
    LEFT JOIN locataires l ON l.id = c.locataire_id
    LEFT JOIN espaces    e ON e.id = c.espace_id
    WHERE c.statut = 'actif'
      AND c.date_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
    ORDER BY c.date_fin
  `);
  res.json(result.rows);
}));

// GET /api/contrats/:id
router.get('/:id', auth, [param('id').isUUID(), validate], asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.*,
      l.nom   AS locataire_nom, l.tel AS locataire_tel, l.email AS locataire_email,
      e.nom   AS espace_nom,   e.numero AS espace_numero, e.etage
    FROM contrats c
    LEFT JOIN locataires l ON l.id = c.locataire_id
    LEFT JOIN espaces    e ON e.id = c.espace_id
    WHERE c.id = $1
  `, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/contrats
router.post('/', auth, requireRole('admin', 'gestionnaire'), [
  body('espace_id').isUUID(),
  body('locataire_id').isUUID(),
  body('date_debut').isDate(),
  body('date_fin').isDate(),
  body('loyer').isFloat({ min: 0 }),
  validate
], asyncHandler(async (req, res) => {
  const {
    numero, espace_id, locataire_id,
    date_debut, date_fin, duree_mois,
    loyer, depot_garantie, notes
  } = req.body;

  // Générer un numéro si non fourni
  let finalNumero = numero;
  if (!finalNumero) {
    const seq = await query("SELECT nextval('contrat_numero_seq') AS num");
    finalNumero = `CTR-${seq.rows[0].num}`;
  }

  const result = await withTransaction(async (client) => {
    const r = await client.query(`
      INSERT INTO contrats
        (numero, espace_id, locataire_id, date_debut, date_fin, duree_mois, loyer, depot_garantie, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      finalNumero, espace_id, locataire_id,
      date_debut, date_fin,
      duree_mois || 12,
      loyer,
      depot_garantie || 0,
      notes || ''
    ]);
    await client.query(`UPDATE espaces SET statut = 'occupe' WHERE id = $1`, [espace_id]);
    return r;
  });

  res.status(201).json(result.rows[0]);
}));

// PUT /api/contrats/:id
router.put('/:id', auth, requireRole('admin', 'gestionnaire'), [
  param('id').isUUID(), validate
], asyncHandler(async (req, res) => {
  const {
    numero, espace_id, locataire_id,
    date_debut, date_fin, duree_mois,
    loyer, depot_garantie, statut,
    contrat_archive, notes
  } = req.body;

  const result = await query(`
    UPDATE contrats SET
      numero=$1, espace_id=$2, locataire_id=$3,
      date_debut=$4, date_fin=$5, duree_mois=$6,
      loyer=$7, depot_garantie=$8, statut=$9,
      contrat_archive=$10, notes=$11
    WHERE id = $12
    RETURNING *
  `, [
    numero, espace_id, locataire_id,
    date_debut, date_fin, duree_mois,
    loyer, depot_garantie, statut,
    contrat_archive || null, notes,
    req.params.id
  ]);

  if (!result.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(result.rows[0]);
}));

// POST /api/contrats/:id/upload  — upload du contrat signé (PDF/image)
router.post('/:id/upload', auth, requireRole('admin', 'gestionnaire'),
  upload.single('contrat_signe'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    // Chemin relatif stocké en base
    const filePath = `/uploads/contrats/${req.file.filename}`;

    // Supprimer l'ancien fichier si existait
    const old = await query('SELECT contrat_archive FROM contrats WHERE id = $1', [req.params.id]);
    if (old.rows[0]?.contrat_archive) {
      const oldPath = path.join(__dirname, '..', old.rows[0].contrat_archive);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const result = await query(
      'UPDATE contrats SET contrat_archive = $1 WHERE id = $2 RETURNING *',
      [filePath, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });

    res.json({
      message:   'Contrat signé uploadé avec succès',
      file_path: filePath,
      contrat:   result.rows[0]
    });
  })
);

// DELETE /api/contrats/:id/upload — supprimer le fichier uploadé
router.delete('/:id/upload', auth, requireRole('admin', 'gestionnaire'),
  asyncHandler(async (req, res) => {
    const old = await query('SELECT contrat_archive FROM contrats WHERE id = $1', [req.params.id]);
    if (old.rows[0]?.contrat_archive) {
      const oldPath = path.join(__dirname, '..', old.rows[0].contrat_archive);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await query('UPDATE contrats SET contrat_archive = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: 'Fichier supprimé' });
  })
);

// DELETE /api/contrats/:id
router.delete('/:id', auth, requireRole('admin'), [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const c = await query('SELECT espace_id, contrat_archive FROM contrats WHERE id = $1', [req.params.id]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Contrat introuvable' });

    // Supprimer le fichier uploadé si présent
    if (c.rows[0].contrat_archive) {
      const filePath = path.join(__dirname, '..', c.rows[0].contrat_archive);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await withTransaction(async (client) => {
      await client.query('DELETE FROM contrats WHERE id = $1', [req.params.id]);
      const remaining = await client.query(
        `SELECT id FROM contrats WHERE espace_id = $1 AND statut = 'actif'`,
        [c.rows[0].espace_id]
      );
      if (remaining.rows.length === 0) {
        await client.query(`UPDATE espaces SET statut = 'disponible' WHERE id = $1`, [c.rows[0].espace_id]);
      }
    });

    res.json({ message: 'Contrat supprimé' });
  })
);

module.exports = router;