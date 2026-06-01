const { pool } = require('../config/database');
require('dotenv').config();

const migrations = `

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Utilisateurs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utilisateurs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom         VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  mot_de_passe VARCHAR(255) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'gestionnaire' CHECK (role IN ('admin','gestionnaire','comptable','lecture')),
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Paramètres ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parametres (
  id              SERIAL PRIMARY KEY,
  societe         VARCHAR(150) NOT NULL DEFAULT 'Betna Executive',
  mall            VARCHAR(150) NOT NULL DEFAULT 'N''Djamena Mall',
  adresse         TEXT,
  tel             VARCHAR(30),
  email           VARCHAR(150),
  site            VARCHAR(200),
  rccm            VARCHAR(100),
  logo            TEXT,
  devise          VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  tva             NUMERIC(5,2) NOT NULL DEFAULT 18,
  primary_color   VARCHAR(10) DEFAULT '#6366f1',
  titre_facture   VARCHAR(50) DEFAULT 'FACTURE',
  stietre_facture VARCHAR(100) DEFAULT 'Loyer et charges',
  note_facture    TEXT DEFAULT 'Merci pour votre confiance. Paiement à réception.',
  conditions      TEXT,
  note_contrat    TEXT,
  prefixe_facture VARCHAR(10) DEFAULT 'FAC',
  prefixe_contrat VARCHAR(10) DEFAULT 'CTR',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valeur par défaut
INSERT INTO parametres (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── Espaces ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS espaces (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero      VARCHAR(20) UNIQUE NOT NULL,
  nom         VARCHAR(150) NOT NULL,
  type        VARCHAR(50) NOT NULL DEFAULT 'Boutique',
  etage       VARCHAR(30),
  superficie  NUMERIC(10,2),
  loyer       NUMERIC(12,2) NOT NULL DEFAULT 0,
  statut      VARCHAR(20) NOT NULL DEFAULT 'disponible' CHECK (statut IN ('disponible','occupe','travaux','reserve')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Locataires ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locataires (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom             VARCHAR(150) NOT NULL,
  contact         VARCHAR(150),
  tel             VARCHAR(30),
  email           VARCHAR(150),
  piece_identite  VARCHAR(100),
  adresse         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Contrats ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contrats (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero          VARCHAR(30) UNIQUE NOT NULL,
  espace_id       UUID REFERENCES espaces(id) ON DELETE SET NULL,
  locataire_id    UUID REFERENCES locataires(id) ON DELETE SET NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE NOT NULL,
  duree_mois      INTEGER NOT NULL DEFAULT 12,
  loyer           NUMERIC(12,2) NOT NULL,
  depot_garantie  NUMERIC(12,2) DEFAULT 0,
  statut          VARCHAR(20) NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','expire','resilie','suspendu')),
  contrat_archive TEXT,  -- base64 ou chemin fichier
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Factures ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero          VARCHAR(30) UNIQUE NOT NULL,
  contrat_id      UUID REFERENCES contrats(id) ON DELETE SET NULL,
  locataire_id    UUID REFERENCES locataires(id) ON DELETE SET NULL,
  espace_id       UUID REFERENCES espaces(id) ON DELETE SET NULL,
  date_emission   DATE NOT NULL,
  date_echeance   DATE NOT NULL,
  periode         VARCHAR(30),
  montant_ht      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva             NUMERIC(5,2) NOT NULL DEFAULT 18,
  montant_tva     NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_ttc     NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_paye    NUMERIC(12,2) NOT NULL DEFAULT 0,
  statut          VARCHAR(20) NOT NULL DEFAULT 'impayee' CHECK (statut IN ('impayee','partielle','payee','annulee')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Paiements ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paiements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero          VARCHAR(30) UNIQUE NOT NULL,
  facture_id      UUID REFERENCES factures(id) ON DELETE SET NULL,
  locataire_id    UUID REFERENCES locataires(id) ON DELETE SET NULL,
  montant         NUMERIC(12,2) NOT NULL,
  mode_paiement   VARCHAR(30) NOT NULL DEFAULT 'especes' CHECK (mode_paiement IN ('especes','virement','cheque','mobile_money','carte')),
  date_paiement   DATE NOT NULL,
  reference       VARCHAR(100),
  preuve_paiement TEXT,  -- chemin fichier ou base64
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Maintenance ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero                  VARCHAR(30) UNIQUE NOT NULL,
  titre                   VARCHAR(200) NOT NULL,
  description             TEXT,
  categorie               VARCHAR(50),
  priorite                VARCHAR(20) NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute','urgente')),
  statut                  VARCHAR(20) NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','resolu','ferme')),
  espace_id               UUID REFERENCES espaces(id) ON DELETE SET NULL,
  date_creation           DATE NOT NULL DEFAULT CURRENT_DATE,
  date_resolution_prevue  DATE,
  intervenant             VARCHAR(150),
  cout                    NUMERIC(12,2) DEFAULT 0,
  notes_resolution        TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CRM Prospects ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom             VARCHAR(150) NOT NULL,
  societe         VARCHAR(150),
  tel             VARCHAR(30),
  email           VARCHAR(150),
  etape           VARCHAR(20) NOT NULL DEFAULT 'contact' CHECK (etape IN ('contact','visite','negociation','proposition','gagne','perdu')),
  espace_id       UUID REFERENCES espaces(id) ON DELETE SET NULL,
  loyer_propose   NUMERIC(12,2) DEFAULT 0,
  activite        VARCHAR(150),
  dernier_contact DATE,
  notes           TEXT,
  date_creation   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Activités (journal) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  texte       TEXT NOT NULL,
  couleur     VARCHAR(20) DEFAULT '#1a56db',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contrats_espace    ON contrats(espace_id);
CREATE INDEX IF NOT EXISTS idx_contrats_locataire ON contrats(locataire_id);
CREATE INDEX IF NOT EXISTS idx_factures_contrat   ON factures(contrat_id);
CREATE INDEX IF NOT EXISTS idx_factures_locataire ON factures(locataire_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut    ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_paiements_facture  ON paiements(facture_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_statut ON maintenance(statut);
CREATE INDEX IF NOT EXISTS idx_crm_etape          ON crm(etape);

-- ─── Trigger updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['utilisateurs','espaces','locataires','contrats','factures','maintenance','crm']) LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END $$;
`;

async function migrate() {
  console.log('🚀 Démarrage des migrations...');
  try {
    await pool.query(migrations);
    console.log('✅ Tables créées avec succès.');
  } catch (err) {
    console.error('❌ Erreur migration:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
