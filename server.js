require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

// ── Dossier uploads ───────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '20mb' }));        // JSON body (incl. base64 logos)
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers uploadés (preuves de paiement, etc.)
app.use('/uploads', express.static(path.join(__dirname, uploadDir)));

// ── Routes ───────────────────────────────────────────────────────────────────
const { maintenance, crm, rapports, parametres, activites } = require('./routes/autres');

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/espaces',     require('./routes/espaces'));
app.use('/api/locataires',  require('./routes/locataires'));
app.use('/api/contrats',    require('./routes/contrats'));
app.use('/api/factures',    require('./routes/factures'));
app.use('/api/paiements',   require('./routes/paiements'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/rapports', require('./routes/rapports'));
app.use('/api/parametres', require('./routes/parametres'));
app.use('/api/activites',   activites);

// ── Santé ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route non trouvée: ${req.method} ${req.path}` });
});

// ── Gestion erreurs ───────────────────────────────────────────────────────────
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Betna Mall API démarrée sur http://localhost:${PORT}`);
  console.log(`   Environnement : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check  : http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
