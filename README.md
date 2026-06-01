# Betna Mall – Backend API

API REST **Node.js / Express / PostgreSQL** pour l'application Betna Executive Mall Manager.

---

## ⚡ Démarrage rapide

### 1. Prérequis
- Node.js ≥ 18
- PostgreSQL ≥ 14

### 2. Installation

```bash
cd betna-backend
npm install
```

### 3. Configuration

```bash
cp .env.example .env
# Éditez .env avec vos informations de base de données
```

### 4. Créer la base de données PostgreSQL

```sql
-- Dans psql ou pgAdmin :
CREATE DATABASE betna_mall;
```

### 5. Migrations (création des tables)

```bash
npm run migrate
```

### 6. Données de démonstration (optionnel)

```bash
npm run seed
# → Crée admin@betna.td / admin123
```

### 7. Démarrage

```bash
# Production
npm start

# Développement (rechargement auto)
npm run dev
```

L'API est disponible sur **http://localhost:3000**

---

## 🔐 Authentification

Toutes les routes (sauf `/api/health`) nécessitent un token JWT.

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@betna.td", "mot_de_passe": "admin123" }
```

Réponse :
```json
{ "token": "eyJ...", "user": { "id": "...", "nom": "Administrateur", "role": "admin" } }
```

Utilisez le token dans le header :
```
Authorization: Bearer eyJ...
```

---

## 📋 Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion |
| GET | `/api/auth/me` | Profil connecté |
| POST | `/api/auth/register` | Créer utilisateur (admin) |
| PUT | `/api/auth/password` | Changer mot de passe |
| GET/POST | `/api/espaces` | Liste / Créer espace |
| GET/PUT/DELETE | `/api/espaces/:id` | Détail / Modifier / Supprimer |
| GET | `/api/espaces/stats` | Statistiques occupation |
| GET/POST | `/api/locataires` | Liste / Créer |
| GET | `/api/locataires/:id` | Détail + contrats + factures |
| GET/POST | `/api/contrats` | Liste / Créer |
| GET | `/api/contrats/expirant` | Contrats expirant dans 60j |
| GET/POST | `/api/factures` | Liste / Créer |
| GET | `/api/factures/impayees` | Factures impayées ou partielles |
| GET/POST | `/api/paiements` | Liste / Créer (+ upload preuve) |
| GET/POST | `/api/maintenance` | Tickets maintenance |
| GET | `/api/maintenance/stats` | Stats tickets |
| GET/POST | `/api/crm` | Prospects CRM |
| GET | `/api/rapports/dashboard` | KPIs dashboard |
| GET | `/api/rapports/revenus` | Rapport revenus (mois/année) |
| GET/PUT | `/api/parametres` | Paramètres application |
| GET | `/api/activites` | Journal d'activité |
| GET | `/api/health` | Santé de l'API |

---

## 🔑 Rôles utilisateurs

| Rôle | Accès |
|------|-------|
| `admin` | Accès complet, suppression, gestion utilisateurs |
| `gestionnaire` | Création et modification de toutes les données |
| `comptable` | Création factures et paiements, lecture |
| `lecture` | Lecture seule |

---

## 📁 Structure du projet

```
betna-backend/
├── server.js           # Point d'entrée
├── package.json
├── .env.example        # Variables d'environnement
├── config/
│   └── database.js     # Pool PostgreSQL
├── db/
│   ├── migrate.js      # Création des tables
│   └── seed.js         # Données de démonstration
├── middleware/
│   ├── auth.js         # JWT middleware
│   └── errorHandler.js # Gestion erreurs centralisée
├── routes/
│   ├── auth.js         # Authentification
│   ├── espaces.js      # Gestion espaces
│   ├── locataires.js   # Gestion locataires
│   ├── contrats.js     # Gestion contrats
│   ├── factures.js     # Gestion factures
│   ├── paiements.js    # Paiements + upload preuve
│   └── autres.js       # Maintenance, CRM, Rapports, Paramètres
└── uploads/            # Fichiers uploadés (créé automatiquement)
```

---

## 🔗 Connecter le frontend

Pour connecter le frontend existant au backend, modifiez `js/db.js` pour remplacer les appels `localStorage` par des appels `fetch` vers l'API. Exemple :

```javascript
// Avant (localStorage)
const espaces = DB.getAll('espaces');

// Après (API)
const espaces = await fetch('/api/espaces', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
}).then(r => r.json());
```

---

## 🛡️ Sécurité en production

1. Changez `JWT_SECRET` dans `.env` par une chaîne aléatoire longue
2. Définissez `CORS_ORIGIN` avec votre domaine exact
3. Activez HTTPS (nginx/caddy en reverse proxy)
4. Limitez les accès PostgreSQL à `localhost`
