const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
  console.log('🌱 Insertion des données de démonstration...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Admin user ──────────────────────────────────────────────────────────
    const hash = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO utilisateurs (nom, email, mot_de_passe, role)
      VALUES ('Administrateur', 'admin@betna.td', $1, 'admin')
      ON CONFLICT (email) DO NOTHING
    `, [hash]);
    console.log('  ✓ Utilisateur admin créé (admin@betna.td / admin123)');

    // ── Espaces ─────────────────────────────────────────────────────────────
    const espaces = [
      { numero:'A-01', nom:'Boutique Mode Prestige', type:'Boutique', etage:'RDC', superficie:45, loyer:450000, statut:'occupe' },
      { numero:'A-02', nom:'Café Central', type:'Restauration', etage:'RDC', superficie:80, loyer:650000, statut:'occupe' },
      { numero:'A-03', nom:'Espace Téléphonie', type:'Boutique', etage:'RDC', superficie:30, loyer:350000, statut:'occupe' },
      { numero:'B-01', nom:'Grand Restaurant', type:'Restauration', etage:'1er', superficie:200, loyer:1200000, statut:'occupe' },
      { numero:'B-02', nom:'Espace Beauté', type:'Services', etage:'1er', superficie:55, loyer:400000, statut:'occupe' },
      { numero:'B-03', nom:'Bureau Conseil', type:'Bureau', etage:'1er', superficie:40, loyer:300000, statut:'disponible' },
      { numero:'C-01', nom:'Salle de Cinéma', type:'Loisirs', etage:'2ème', superficie:300, loyer:2000000, statut:'occupe' },
      { numero:'C-02', nom:'Espace Jeux', type:'Loisirs', etage:'2ème', superficie:150, loyer:800000, statut:'travaux' },
      { numero:'C-03', nom:'Grande Boutique', type:'Boutique', etage:'2ème', superficie:120, loyer:750000, statut:'disponible' },
      { numero:'D-01', nom:'Bureau Administratif', type:'Bureau', etage:'3ème', superficie:60, loyer:350000, statut:'reserve' },
    ];

    const espaceIds = {};
    for (const e of espaces) {
      const r = await client.query(`
        INSERT INTO espaces (numero, nom, type, etage, superficie, loyer, statut)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (numero) DO UPDATE SET nom=EXCLUDED.nom
        RETURNING id
      `, [e.numero, e.nom, e.type, e.etage, e.superficie, e.loyer, e.statut]);
      espaceIds[e.numero] = r.rows[0].id;
    }
    console.log('  ✓ 10 espaces créés');

    // ── Locataires ──────────────────────────────────────────────────────────
    const locataires = [
      { nom:'Amina Hassan', contact:'Amina Hassan', tel:'+235 66 11 22 33', email:'amina@example.com' },
      { nom:'Jean-Pierre Moussa', contact:'JP Moussa', tel:'+235 66 44 55 66', email:'jp@example.com' },
      { nom:'Fatima Mahamat', contact:'Fatima Mahamat', tel:'+235 66 77 88 99', email:'fatima@example.com' },
      { nom:'Ali Idriss', contact:'Ali Idriss', tel:'+235 66 12 34 56', email:'ali@example.com' },
      { nom:'Marie Ngaradoum', contact:'Marie N.', tel:'+235 66 98 76 54', email:'marie@example.com' },
      { nom:'Entreprise CinéChad SARL', contact:'Directeur', tel:'+235 22 51 00 10', email:'contact@cinechad.td' },
    ];

    const locataireIds = [];
    for (const l of locataires) {
      const r = await client.query(`
        INSERT INTO locataires (nom, contact, tel, email)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [l.nom, l.contact, l.tel, l.email]);
      if (r.rows[0]) locataireIds.push(r.rows[0].id);
    }
    console.log('  ✓ 6 locataires créés');

    // ── Contrats ────────────────────────────────────────────────────────────
    const contrats = [
      { numero:'CTR-2024-001', espace:'A-01', locIdx:0, debut:'2024-01-01', fin:'2024-12-31', duree:12, loyer:450000 },
      { numero:'CTR-2024-002', espace:'A-02', locIdx:1, debut:'2024-02-01', fin:'2025-01-31', duree:12, loyer:650000 },
      { numero:'CTR-2024-003', espace:'A-03', locIdx:2, debut:'2024-03-01', fin:'2025-02-28', duree:12, loyer:350000 },
      { numero:'CTR-2024-004', espace:'B-01', locIdx:3, debut:'2024-01-15', fin:'2025-01-14', duree:12, loyer:1200000 },
      { numero:'CTR-2024-005', espace:'B-02', locIdx:4, debut:'2024-04-01', fin:'2025-03-31', duree:12, loyer:400000 },
      { numero:'CTR-2023-006', espace:'C-01', locIdx:5, debut:'2023-06-01', fin:'2026-05-31', duree:36, loyer:2000000 },
    ];

    const contratIds = [];
    for (const c of contrats) {
      if (!espaceIds[c.espace] || !locataireIds[c.locIdx]) continue;
      const r = await client.query(`
        INSERT INTO contrats (numero, espace_id, locataire_id, date_debut, date_fin, duree_mois, loyer, statut)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'actif')
        ON CONFLICT (numero) DO NOTHING
        RETURNING id
      `, [c.numero, espaceIds[c.espace], locataireIds[c.locIdx], c.debut, c.fin, c.duree, c.loyer]);
      if (r.rows[0]) contratIds.push({ id: r.rows[0].id, ...c });
    }
    console.log('  ✓ Contrats créés');

    // ── Factures & Paiements (3 derniers mois) ───────────────────────────────
    const today = new Date();
    let facNum = 1;
    let payNum = 1;

    for (const c of contratIds) {
      for (let m = 2; m >= 0; m--) {
        const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
        const mois = String(d.getMonth() + 1).padStart(2, '0');
        const annee = d.getFullYear();
        const ht = c.loyer;
        const tva = 18;
        const mtva = Math.round(ht * tva / 100);
        const ttc = ht + mtva;
        const echeance = new Date(d.getFullYear(), d.getMonth() + 1, 5);
        const isPaid = m > 0; // les 2 mois précédents sont payés
        const fNum = `FAC-${annee}-${String(facNum).padStart(4,'0')}`;
        facNum++;

        const fRes = await client.query(`
          INSERT INTO factures (numero, contrat_id, locataire_id, espace_id, date_emission, date_echeance, periode, montant_ht, tva, montant_tva, montant_ttc, montant_paye, statut)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (numero) DO NOTHING
          RETURNING id
        `, [
          fNum, c.id, locataireIds[contratIds.indexOf(c)], espaceIds[c.espace],
          d.toISOString().slice(0,10),
          echeance.toISOString().slice(0,10),
          `${mois}/${annee}`,
          ht, tva, mtva, ttc,
          isPaid ? ttc : 0,
          isPaid ? 'payee' : 'impayee'
        ]);

        if (isPaid && fRes.rows[0]) {
          const pNum = `REC-${annee}-${String(payNum).padStart(4,'0')}`;
          payNum++;
          const datePay = new Date(d.getFullYear(), d.getMonth(), 20);
          await client.query(`
            INSERT INTO paiements (numero, facture_id, locataire_id, montant, mode_paiement, date_paiement)
            VALUES ($1,$2,$3,$4,'virement',$5)
            ON CONFLICT (numero) DO NOTHING
          `, [pNum, fRes.rows[0].id, locataireIds[contratIds.indexOf(c)], ttc, datePay.toISOString().slice(0,10)]);
        }
      }
    }
    console.log('  ✓ Factures et paiements créés');

    // ── Maintenance ──────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO maintenance (numero, titre, categorie, priorite, statut, espace_id, date_creation)
      VALUES
        ('TKT-2024-001', 'Fuite d''eau plafond', 'Plomberie', 'haute', 'en_cours', $1, CURRENT_DATE - 5),
        ('TKT-2024-002', 'Climatisation en panne', 'Climatisation', 'urgente', 'ouvert', $2, CURRENT_DATE - 1),
        ('TKT-2024-003', 'Ampoules à remplacer', 'Électricité', 'basse', 'resolu', NULL, CURRENT_DATE - 10)
      ON CONFLICT (numero) DO NOTHING
    `, [espaceIds['B-01'], espaceIds['A-02']]);
    console.log('  ✓ Tickets maintenance créés');

    // ── CRM ──────────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO crm (nom, societe, tel, email, etape, loyer_propose, activite, dernier_contact)
      VALUES
        ('Ibrahim Saleh', 'Tech Solutions SARL', '+235 66 11 00 11', 'ibrahim@tech.td', 'negociation', 500000, 'Informatique', CURRENT_DATE - 3),
        ('Célestine Mbodou', NULL, '+235 66 22 33 44', NULL, 'visite', 300000, 'Cosmétiques', CURRENT_DATE - 7),
        ('Groupe SOGEA', 'SOGEA International', '+235 22 52 00 00', 'contact@sogea.td', 'proposition', 800000, 'Construction', CURRENT_DATE - 1)
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✓ Prospects CRM créés');

    // ── Activités ────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO activites (texte) VALUES
        ('🌱 Base de données initialisée avec données de démonstration'),
        ('👤 Compte administrateur créé'),
        ('🏢 10 espaces configurés'),
        ('👥 6 locataires enregistrés')
    `);

    await client.query('COMMIT');
    console.log('\n✅ Seed terminé avec succès !');
    console.log('   → Connexion admin : admin@betna.td / admin123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
