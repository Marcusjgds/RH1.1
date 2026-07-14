/* ============================================================
   APP.JS — SCP SITE 11 — Firebase Firestore compat CDN
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA04uU6I2b4PDvjwHyeUuQvKrs5Jo3_56Y",
  authDomain:        "site-11-58f78.firebaseapp.com",
  projectId:         "site-11-58f78",
  storageBucket:     "site-11-58f78.firebasestorage.app",
  messagingSenderId: "1010449432094",
  appId:             "1:1010449432094:web:b17a0ad2e790681c62f80f",
};

const FORMSUBMIT_URL  = (e) => `https://formsubmit.co/ajax/${encodeURIComponent(e)}`;
const DEFAULT_CONFIG  = { rhEmail: '', password: 'rh2025', adminPassword: 'admin2025', maintenance: false };
const RH_NAME_KEY      = 'rh_name';
const RH_ROLE_KEY      = 'rh_role';
const DEFAULT_PERMISSIONS = { viewCandidatures: true, actionCandidatures: true };

/* ── DISCORD OAUTH2 (flux implicite, 100% côté client) ──
   1. Crée une application sur https://discord.com/developers/applications
   2. Onglet OAuth2 → General → copie le "CLIENT ID" et colle-le ci-dessous
   3. Onglet OAuth2 → Redirects → ajoute EXACTEMENT l'URL de ton site
      (celle utilisée par DISCORD_REDIRECT_URI, ex: https://tonsite.up.railway.app/)
*/
const DISCORD_CLIENT_ID    = '1501561347295412255';
const DISCORD_REDIRECT_URI = window.location.origin + '/';

let discordUser = null; // { id, username } une fois vérifié

let config       = loadConfig();
let postes       = [];
let candidatures = [];
let logs         = [];
let categories   = [];
let rhPermissions = { ...DEFAULT_PERMISSIONS };
let currentPoste = null;
let currentCand  = null;
let editPosteId  = null;
let editCatId    = null;
let db           = null;
let currentRHName = sessionStorage.getItem(RH_NAME_KEY) || '';
let currentRole    = sessionStorage.getItem(RH_ROLE_KEY) || ''; // 'admin' | 'rh'

/* ── DEBUG : affiche les erreurs directement à l'écran (utile sans F12) ── */
window.addEventListener('error', (e) => {
  toast('⚠ Erreur JS : ' + (e.message || 'inconnue'), 'error');
  console.error('[Erreur globale]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  toast('⚠ Erreur async : ' + (e.reason?.message || e.reason || 'inconnue'), 'error');
  console.error('[Promesse rejetée]', e.reason);
});

/* ── INIT ── */
window.addEventListener('load', () => {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  applyMaintenance();
  bindNav();
  bindFilters();
  bindRHLogin();
  bindMaintenanceLogin();
  bindFormCandidature();
  bindFormPoste();
  bindConfigForm();
  bindRHTabs();
  bindDetailModal();
  bindCandSearch();
  bindLogFilter();
  bindCopyDiscord();
  listenPostes();
  listenCandidatures();
  listenLogs();
  listenCategories();
  listenPermissions();
  bindDiscordConnect();
  bindCategorieForm();
  handleDiscordRedirect();
});

/* ============================================================
   CONFIG LOCALE
   ============================================================ */
function loadConfig() {
  try { return Object.assign({}, DEFAULT_CONFIG, JSON.parse(localStorage.getItem('rh_config') || '{}')); }
  catch { return { ...DEFAULT_CONFIG }; }
}
function saveConfig() { localStorage.setItem('rh_config', JSON.stringify(config)); }

/* ============================================================
   MAINTENANCE
   ============================================================ */
function applyMaintenance() {
  const maint  = document.getElementById('page-maintenance');
  const navbar = document.getElementById('navbar');
  const hero   = document.getElementById('hero');
  const postes = document.getElementById('postes');
  const footer = document.querySelector('footer');
  if (config.maintenance) {
    maint.style.display  = 'flex';
    navbar.style.display = 'none';
    hero.style.display   = 'none';
    postes.style.display = 'none';
    footer.style.display = 'none';
  } else {
    maint.style.display  = 'none';
    navbar.style.display = '';
    hero.style.display   = '';
    postes.style.display = '';
    footer.style.display = '';
  }
}

function bindMaintenanceLogin() {
  const btn = document.getElementById('btn-maintenance-login');
  if (btn) btn.addEventListener('click', () => show('modal-rh-login'));
}

function updateMaintenanceBtn() {
  const label = document.getElementById('maintenance-label');
  const btn   = document.getElementById('btn-toggle-maintenance');
  if (config.maintenance) {
    label.textContent = '⚠ Site en maintenance';
    label.style.color = '#d09050';
    btn.textContent   = 'Remettre en ligne';
    btn.style.borderColor = 'rgba(58,138,90,0.4)';
    btn.style.color       = '#5ab87a';
  } else {
    label.textContent = '✓ Site en ligne';
    label.style.color = '#5ab87a';
    btn.textContent   = 'Activer la maintenance';
    btn.style.borderColor = 'rgba(192,128,48,0.4)';
    btn.style.color       = '#d09050';
  }
}

/* ============================================================
   FIRESTORE — TEMPS RÉEL
   ============================================================ */
function listenPostes() {
  db.collection('postes').orderBy('createdAt', 'desc').onSnapshot(snap => {
    postes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cat = document.querySelector('.filter-btn.active')?.dataset.cat || 'all';
    renderPostesPublic(cat);
    updateStats();
    if (document.getElementById('rh-dashboard').style.display !== 'none') renderPostesRH();
  });
}

function listenCandidatures() {
  db.collection('candidatures').orderBy('createdAt', 'desc').onSnapshot(snap => {
    candidatures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats();
    if (document.getElementById('rh-dashboard').style.display !== 'none') renderCandidaturesRH();
    if (currentCand && document.getElementById('modal-cand-detail').style.display !== 'none') {
      const updated = candidatures.find(c => c.id === currentCand.id);
      if (updated) { currentCand = updated; renderDetailActions(updated); }
    }
  });
}

function listenLogs() {
  db.collection('logs').orderBy('createdAt', 'desc').limit(300).onSnapshot(
    snap => {
      logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.getElementById('rh-dashboard').style.display !== 'none') renderLogsRH();
    },
    err => {
      console.error('[Listen logs] ❌', err);
      toast('⚠ Impossible de lire les logs : ' + (err.message || err), 'error');
    }
  );
}

function listenCategories() {
  db.collection('categories').orderBy('createdAt', 'asc').onSnapshot(
    snap => {
      categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      populateCategorySelects();
      renderCategoriesRH();
      const cat = document.querySelector('.filter-btn.active')?.dataset.cat || 'all';
      renderPostesPublic(cat);
      if (document.getElementById('rh-dashboard').style.display !== 'none') {
        renderPostesRH();
        renderCandidaturesRH();
      }
    },
    err => {
      console.error('[Listen categories] ❌', err);
      toast('⚠ Impossible de lire les catégories : ' + (err.message || err), 'error');
    }
  );
}

function listenPermissions() {
  db.collection('meta').doc('rhPermissions').onSnapshot(
    doc => {
      rhPermissions = doc.exists ? { ...DEFAULT_PERMISSIONS, ...doc.data() } : { ...DEFAULT_PERMISSIONS };
      applyRolePermissions();
    },
    err => {
      console.error('[Listen permissions] ❌', err);
    }
  );
}

function updateStats() {
  const openPostes = postes.filter(p => p.ouvert !== false).length;
  const s1 = document.getElementById('stat-postes');
  const s2 = document.getElementById('stat-cands');
  if (s1) s1.textContent = openPostes;
  if (s2) s2.textContent = candidatures.length;
}

/* ============================================================
   CATÉGORIES DYNAMIQUES
   ============================================================ */
function getCategory(nom) { return categories.find(c => c.nom === nom); }
function getCategoryColor(nom) { return getCategory(nom)?.color || '#8a8a8a'; }

function hexToRgba(hex, alpha) {
  const h = (hex || '#8a8a8a').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function catBadgeHtml(nom) {
  const color = getCategoryColor(nom);
  const style = `background:${hexToRgba(color,0.14)};color:${color};border:1px solid ${hexToRgba(color,0.35)}`;
  return `<span class="cat-badge" style="${style}">${esc(nom || '—')}</span>`;
}

function populateCategorySelects() {
  const posteSelect = document.getElementById('poste-cat');
  const filterSelect = document.getElementById('filter-cat-cand');
  if (posteSelect) {
    const current = posteSelect.value;
    posteSelect.innerHTML = '<option value="">Choisir...</option>' +
      categories.map(c => `<option value="${esc(c.nom)}">${esc(c.nom)}</option>`).join('');
    if (current) posteSelect.value = current;
  }
  if (filterSelect) {
    const current = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">Toutes catégories</option>' +
      categories.map(c => `<option value="${esc(c.nom)}">${esc(c.nom)}</option>`).join('');
    filterSelect.value = current || 'all';
  }
  const filtersContainer = document.getElementById('filters-container');
  if (filtersContainer) {
    const activeCat = filtersContainer.querySelector('.filter-btn.active')?.dataset.cat || 'all';
    filtersContainer.innerHTML = '<button class="filter-btn" data-cat="all">Tous</button>' +
      categories.map(c => `<button class="filter-btn" data-cat="${esc(c.nom)}" style="--pill-color:${c.color}">${esc(c.nom)}</button>`).join('');
    const toActivate = filtersContainer.querySelector(`[data-cat="${CSS.escape(activeCat)}"]`) || filtersContainer.querySelector('[data-cat="all"]');
    toActivate.classList.add('active');
    bindFilters();
  }
}

function bindCategorieForm() {
  const form = document.getElementById('form-categorie');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nom   = val('cat-nom');
    const color = document.getElementById('cat-color').value;
    if (!nom) return;
    if (editCatId) {
      await db.collection('categories').doc(editCatId).update({ nom, color });
      logAction('Catégorie', `Modification de la catégorie "${nom}"`);
      editCatId = null;
      form.querySelector('button[type="submit"]').textContent = '+ Ajouter';
    } else {
      await db.collection('categories').add({ nom, color, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      logAction('Catégorie', `Création de la catégorie "${nom}"`);
    }
    form.reset();
    document.getElementById('cat-color').value = '#5ab87a';
    toast('✓ Catégorie enregistrée', 'success');
  });
}

function renderCategoriesRH() {
  const container = document.getElementById('categories-list');
  if (!container) return;
  container.innerHTML = '';
  if (categories.length === 0) { container.innerHTML = '<div class="empty-state"><p>Aucune catégorie créée.</p></div>'; return; }
  categories.forEach(c => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-swatch" style="background:${c.color}"></span>
      <span class="cat-row-nom">${esc(c.nom)}</span>
      <div class="cat-row-actions">
        <button class="btn-sm" data-edit-cat="${c.id}">Modifier</button>
        <button class="btn-sm danger" data-del-cat="${c.id}">Supprimer</button>
      </div>
    `;
    row.querySelector('[data-edit-cat]').addEventListener('click', () => {
      editCatId = c.id;
      document.getElementById('cat-nom').value   = c.nom;
      document.getElementById('cat-color').value = c.color;
      document.querySelector('#form-categorie button[type="submit"]').textContent = 'Enregistrer';
    });
    row.querySelector('[data-del-cat]').addEventListener('click', async () => {
      if (!confirm(`Supprimer la catégorie "${c.nom}" ? Les postes existants garderont ce nom mais perdront la couleur associée.`)) return;
      await db.collection('categories').doc(c.id).delete();
      logAction('Catégorie', `Suppression de la catégorie "${c.nom}"`);
      toast('Catégorie supprimée', 'success');
    });
    container.appendChild(row);
  });
}

/* ============================================================
   RÔLES & PERMISSIONS (ADMIN / RH)
   ============================================================ */
function applyRolePermissions() {
  const isAdmin = currentRole === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  const candTab = document.querySelector('.rh-tab[data-tab="candidatures"]');
  if (candTab) candTab.style.display = (isAdmin || rhPermissions.viewCandidatures) ? '' : 'none';

  const nouveauPosteBtn = document.getElementById('btn-nouveau-poste');
  if (nouveauPosteBtn) nouveauPosteBtn.style.display = isAdmin ? '' : 'none';

  // Si le RH courant a perdu l'accès à l'onglet actif, on le renvoie vers Postes
  const activeTab = document.querySelector('.rh-tab.active');
  if (activeTab && activeTab.style.display === 'none') {
    document.querySelector('.rh-tab[data-tab="postes"]')?.click();
  }
  if (document.getElementById('rh-dashboard').style.display !== 'none') {
    renderPostesRH();
    renderCandidaturesRH();
  }
}

/* ============================================================
   LOGS D'ACTIVITÉ RH
   ============================================================ */
async function logAction(type, details = '', actor = null) {
  try {
    await db.collection('logs').add({
      rh: actor || currentRHName || 'Inconnu',
      type,
      details,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      dateStr: new Date().toLocaleString('fr-FR'),
    });
  } catch (err) {
    console.error('[Log] ❌', err);
    toast('⚠ Log non enregistré : ' + (err.message || err), 'error');
  }
}

function bindLogFilter() {
  const sel = document.getElementById('filter-log-type');
  if (sel) sel.addEventListener('change', renderLogsRH);
}

function renderLogsRH() {
  const container = document.getElementById('logs-list');
  const empty     = document.getElementById('empty-logs');
  if (!container) return;
  const typeFilter = document.getElementById('filter-log-type')?.value || 'all';
  const list = typeFilter === 'all' ? logs : logs.filter(l => l.type === typeFilter);
  container.innerHTML = '';
  if (list.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  list.forEach(l => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    const highlighted = esc(l.details || '').replace(
      /Discord\s*:\s*([^\s(—][^(—]*)/i,
      (m, name) => `Discord : <span class="log-discord">${name.trim()}</span>`
    );
    row.innerHTML = `
      <span class="log-type log-type-${slugType(l.type)}">${esc(l.type)}</span>
      <div class="log-body">
        <div class="log-details">${highlighted}</div>
        <div class="log-meta"><strong>${esc(l.rh || 'Inconnu')}</strong> — ${esc(l.dateStr || '')}</div>
      </div>
    `;
    container.appendChild(row);
  });
}

function slugType(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}

/* ============================================================
   POSTES PUBLICS
   ============================================================ */
function renderPostesPublic(filterCat = 'all') {
  const container = document.getElementById('postes-container');
  const empty      = document.getElementById('empty-postes');
  const openPostes = postes.filter(p => p.ouvert !== false);
  const list = filterCat === 'all' ? openPostes : openPostes.filter(p => p.cat === filterCat);
  container.innerHTML = '';
  if (list.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  // Ordre des catégories : celles créées par l'admin, dans l'ordre, puis "autres" si besoin
  const catNames = filterCat === 'all'
    ? [...categories.map(c => c.nom), ...[...new Set(list.map(p => p.cat))].filter(n => !categories.some(c => c.nom === n))]
    : [filterCat];

  catNames.forEach(catNom => {
    const postesCat = list.filter(p => p.cat === catNom);
    if (postesCat.length === 0) return;
    const color = getCategoryColor(catNom);

    const divider = document.createElement('div');
    divider.className = 'cat-divider';
    divider.innerHTML = `
      <span class="cat-divider-line" style="background:${hexToRgba(color,0.4)}"></span>
      <span class="cat-divider-label" style="color:${color}">${esc(catNom)}</span>
      <span class="cat-divider-line" style="background:${hexToRgba(color,0.4)}"></span>
    `;
    container.appendChild(divider);

    const grid = document.createElement('div');
    grid.className = 'postes-grid';
    postesCat.forEach(p => {
      const card = document.createElement('div');
      card.className = 'poste-card';
      card.innerHTML = `
        <div class="poste-card-top">
          <div class="poste-nom">${esc(p.nom)}</div>
          ${catBadgeHtml(p.cat)}
        </div>
        <p class="poste-desc">${esc(p.desc)}</p>
        ${p.prereq ? `<p class="poste-prereq"><strong>Prérequis :</strong> ${esc(p.prereq)}</p>` : ''}
        <button class="btn-postuler">Postuler →</button>
      `;
      card.querySelector('.btn-postuler').addEventListener('click', () => openPostuler(p));
      grid.appendChild(card);
    });
    container.appendChild(grid);
  });
}

function bindFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPostesPublic(btn.dataset.cat);
    });
  });
}

function bindNav() {
  document.getElementById('btn-open-rh-login').addEventListener('click', () => show('modal-rh-login'));
  const heroRH = document.getElementById('btn-hero-rh');
  if (heroRH) heroRH.addEventListener('click', () => show('modal-rh-login'));
}

/* ============================================================
   POSTULER
   ============================================================ */
function openPostuler(poste) {
  currentPoste = poste;
  document.getElementById('modal-poste-title').textContent = poste.nom;
  document.getElementById('form-candidature').reset();
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('f-discord-id').value = '';
  const statusEl = document.getElementById('discord-status');
  statusEl.textContent = 'Clique pour vérifier ton compte Discord.';
  statusEl.className   = 'discord-status';
  show('modal-postuler');
}

document.getElementById('close-postuler').addEventListener('click', () => hide('modal-postuler'));
document.getElementById('modal-postuler').addEventListener('click', e => {
  if (e.target === e.currentTarget) hide('modal-postuler');
});

function bindFormCandidature() {
  document.getElementById('form-candidature').addEventListener('submit', async e => {
    e.preventDefault();
    const prenom = val('f-prenom'), nom = val('f-nom'), rp = val('f-rp'),
          email  = val('f-email'), motiv = val('f-motivation'),
          cv     = val('f-cv'),   extra = val('f-extra'),
          discordId = val('f-discord-id');
    if (!prenom || !rp || !email || !motiv) {
      showFormError('form-error', 'Merci de remplir tous les champs obligatoires.'); return;
    }
    if (!nom || !discordId) {
      showFormError('form-error', 'Merci de te connecter avec Discord avant d\'envoyer ta candidature.'); return;
    }
    if (!emailValid(email)) { showFormError('form-error', 'Adresse email invalide.'); return; }
    setBtnLoading(true);
    const cand = {
      posteId: currentPoste.id, posteNom: currentPoste.nom, posteCat: currentPoste.cat,
      prenom, nom, discordId, rp, email, motiv, cv: cv||'', extra: extra||'',
      statut: 'en_attente',
      date: new Date().toLocaleDateString('fr-FR'),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('candidatures').add(cand);
    logAction('Candidature', `Nouvelle candidature — Discord : ${nom} (vérifié, ID Roblox : ${prenom}) — poste "${currentPoste.nom}"`, 'Candidat (soumission publique)');
    await sendMailRH(cand);
    await sendMailAccuse(cand);
    setBtnLoading(false);
    hide('modal-postuler');
    toast('✓ Candidature envoyée avec succès !', 'success');
  });
}

function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; }

function bindDiscordConnect() {
  const btn = document.getElementById('btn-discord-connect');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!currentPoste) { toast('Sélectionne d\'abord un poste.', 'error'); return; }
    if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID === 'REMPLACE_PAR_TON_CLIENT_ID') {
      toast('⚠ Connexion Discord non configurée (CLIENT_ID manquant dans app.js)', 'error');
      return;
    }
    const draft = {
      posteId: currentPoste.id, posteNom: currentPoste.nom, posteCat: currentPoste.cat,
      prenom: val('f-prenom'), rp: val('f-rp'), email: val('f-email'),
      motiv: val('f-motivation'), cv: val('f-cv'), extra: val('f-extra'),
    };
    sessionStorage.setItem('cand_draft', JSON.stringify(draft));
    const state = Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem('discord_oauth_state', state);
    const authUrl = `https://discord.com/oauth2/authorize?response_type=token`
      + `&client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}`
      + `&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}`
      + `&scope=identify&state=${state}`;
    window.location.href = authUrl;
  });
}

function handleDiscordRedirect() {
  if (!window.location.hash.includes('access_token')) return;
  const params     = new URLSearchParams(window.location.hash.slice(1));
  const token      = params.get('access_token');
  const state      = params.get('state');
  const savedState = sessionStorage.getItem('discord_oauth_state');
  history.replaceState(null, '', window.location.pathname + window.location.search);
  if (!token || !state || state !== savedState) {
    toast('⚠ Connexion Discord invalide ou expirée, réessaie.', 'error');
    return;
  }
  sessionStorage.removeItem('discord_oauth_state');

  fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error('Réponse Discord invalide'); return r.json(); })
    .then(user => {
      const username = user.global_name || user.username;
      discordUser = { id: user.id, username };

      const draftRaw = sessionStorage.getItem('cand_draft');
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        currentPoste = { id: draft.posteId, nom: draft.posteNom, cat: draft.posteCat };
        document.getElementById('modal-poste-title').textContent = draft.posteNom;
        setVal('f-prenom', draft.prenom);
        setVal('f-rp', draft.rp);
        setVal('f-email', draft.email);
        setVal('f-motivation', draft.motiv);
        setVal('f-cv', draft.cv);
        setVal('f-extra', draft.extra);
        sessionStorage.removeItem('cand_draft');
      }
      setVal('f-nom', username);
      setVal('f-discord-id', user.id);
      const statusEl = document.getElementById('discord-status');
      statusEl.textContent = `✓ Connecté en tant que ${username}`;
      statusEl.className   = 'discord-status verified';
      show('modal-postuler');
      toast('✓ Compte Discord vérifié', 'success');
    })
    .catch(err => {
      console.error('[Discord OAuth] ❌', err);
      toast('⚠ Impossible de récupérer les infos Discord : ' + err.message, 'error');
    });
}

function setBtnLoading(l) {
  document.getElementById('btn-submit-text').style.display   = l ? 'none' : '';
  document.getElementById('btn-submit-loader').style.display = l ? ''     : 'none';
  document.getElementById('btn-submit-cand').disabled        = l;
}

/* ============================================================
   RH LOGIN
   ============================================================ */
function bindRHLogin() {
  document.getElementById('close-rh-login').addEventListener('click', () => hide('modal-rh-login'));
  document.getElementById('modal-rh-login').addEventListener('click', e => {
    if (e.target === e.currentTarget) hide('modal-rh-login');
  });
  document.getElementById('form-rh-login').addEventListener('submit', e => {
    e.preventDefault();
    const name = val('rh-name');
    if (!name) {
      document.getElementById('login-error').textContent = 'Merci d\'indiquer ton nom / pseudo.';
      document.getElementById('login-error').style.display = '';
      return;
    }
    if (val('rh-password') === config.adminPassword) {
      currentRHName = name;
      currentRole   = 'admin';
      sessionStorage.setItem(RH_NAME_KEY, name);
      sessionStorage.setItem(RH_ROLE_KEY, 'admin');
      hide('modal-rh-login');
      try {
        openDashboard();
        logAction('Connexion', 'Connexion à l\'espace Admin');
      } catch (err) {
        console.error('[Connexion Admin] ❌', err);
        toast('⚠ Échec ouverture dashboard : ' + (err.message || err), 'error');
      }
    } else if (val('rh-password') === config.password) {
      currentRHName = name;
      currentRole   = 'rh';
      sessionStorage.setItem(RH_NAME_KEY, name);
      sessionStorage.setItem(RH_ROLE_KEY, 'rh');
      hide('modal-rh-login');
      try {
        openDashboard();
        logAction('Connexion', 'Connexion à l\'espace RH');
      } catch (err) {
        console.error('[Connexion RH] ❌', err);
        toast('⚠ Échec ouverture dashboard : ' + (err.message || err), 'error');
      }
    } else {
      document.getElementById('login-error').textContent = 'Mot de passe incorrect.';
      document.getElementById('login-error').style.display = '';
    }
  });
}

/* ============================================================
   DASHBOARD RH
   ============================================================ */
function openDashboard() {
  document.getElementById('page-maintenance').style.display = 'none';
  document.getElementById('navbar').style.display           = 'none';
  document.getElementById('hero').style.display             = 'none';
  document.getElementById('postes').style.display           = 'none';
  document.querySelector('footer').style.display            = 'none';
  document.getElementById('rh-dashboard').style.display     = '';
  const connEl = document.getElementById('rh-connected-as');
  if (connEl) connEl.textContent = currentRHName ? `Connecté en tant que ${currentRHName} (${currentRole === 'admin' ? 'Admin' : 'RH'})` : '';
  applyRolePermissions();
  renderCandidaturesRH();
  renderPostesRH();
  renderLogsRH();
  renderCategoriesRH();
  fillConfigForm();
}

function closeDashboard() {
  document.getElementById('rh-dashboard').style.display = 'none';
  applyMaintenance();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  try {
    logAction('Connexion', `Déconnexion de l'espace ${currentRole === 'admin' ? 'Admin' : 'RH'}`);
    sessionStorage.removeItem(RH_ROLE_KEY);
    currentRole = '';
    closeDashboard();
  } catch (err) {
    console.error('[Déconnexion RH] ❌', err);
    toast('⚠ Échec déconnexion : ' + (err.message || err), 'error');
  }
});

function bindRHTabs() {
  document.querySelectorAll('.rh-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rh-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.rh-content').forEach(c => c.style.display = 'none');
      document.getElementById(`tab-${tab.dataset.tab}`).style.display = '';
      if (tab.dataset.tab === 'logs') renderLogsRH();
      if (tab.dataset.tab === 'categories') renderCategoriesRH();
    });
  });
}

function bindCandSearch() {
  const input = document.getElementById('search-discord');
  if (input) input.addEventListener('input', renderCandidaturesRH);
}

function renderCandidaturesRH() {
  const container = document.getElementById('candidatures-list');
  const empty     = document.getElementById('empty-cands');
  if (currentRole === 'rh' && !rhPermissions.viewCandidatures) {
    container.innerHTML = '';
    empty.style.display = '';
    empty.querySelector('p').textContent = 'Tu n\'as pas la permission de voir les candidatures.';
    return;
  }
  empty.querySelector('p').textContent = 'Aucune candidature reçue.';
  const sf = document.getElementById('filter-status').value;
  const cf = document.getElementById('filter-cat-cand').value;
  const search = (document.getElementById('search-discord')?.value || '').trim().toLowerCase();
  const list = candidatures.filter(c => {
    if (sf !== 'all' && c.statut   !== sf) return false;
    if (cf !== 'all' && c.posteCat !== cf) return false;
    if (search && !(c.nom || '').toLowerCase().includes(search)) return false;
    return true;
  });
  container.innerHTML = '';
  if (list.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  list.forEach(c => {
    const card = document.createElement('div');
    card.className = 'cand-card';
    card.innerHTML = `
      <div class="cand-avatar">${c.nom[0]}${c.prenom[0]}</div>
      <div class="cand-info">
        <div class="cand-name">
          <span class="discord-pill">Discord : ${esc(c.nom)}</span>
        </div>
        <div class="cand-meta">
          <span>RP : <strong>${esc(c.rp)}</strong></span>
          <span>ID Roblox : <strong>${esc(c.prenom)}</strong></span>
          <span>${esc(c.posteNom)}</span>
          ${catBadgeHtml(c.posteCat)}
        </div>
      </div>
      <div class="cand-right">
        <span class="status-badge status-${c.statut}">${statusLabel(c.statut)}</span>
        <span class="cand-date">${c.date}</span>
      </div>
    `;
    card.addEventListener('click', () => openCandDetail(c));
    container.appendChild(card);
  });
}

document.getElementById('filter-status').addEventListener('change', renderCandidaturesRH);
document.getElementById('filter-cat-cand').addEventListener('change', renderCandidaturesRH);

function renderPostesRH() {
  const container = document.getElementById('postes-rh-list');
  const isAdmin = currentRole === 'admin';
  container.innerHTML = '';
  if (postes.length === 0) { container.innerHTML = '<div class="empty-state"><p>Aucun poste créé.</p></div>'; return; }
  postes.forEach(p => {
    const ouvert = p.ouvert !== false;
    const row    = document.createElement('div');
    row.className = 'poste-rh-row';
    row.innerHTML = `
      ${catBadgeHtml(p.cat)}
      <div class="poste-rh-info">
        <div class="poste-rh-nom">${esc(p.nom)}</div>
        <div class="poste-rh-desc">${esc(p.desc)}</div>
      </div>
      <div class="poste-rh-actions">
        <span class="status-badge ${ouvert ? 'status-accepte' : 'status-refuse'}">${ouvert ? 'Ouvert' : 'Fermé'}</span>
        <button class="btn-sm" data-toggle="${p.id}">${ouvert ? 'Fermer' : 'Ouvrir'}</button>
        ${isAdmin ? `<button class="btn-sm" data-edit="${p.id}">Modifier</button>
        <button class="btn-sm danger" data-del="${p.id}">Supprimer</button>` : ''}
      </div>
    `;
    row.querySelector('[data-toggle]').addEventListener('click', () => togglePoste(p));
    if (isAdmin) {
      row.querySelector('[data-edit]').addEventListener('click', () => openEditPoste(p));
      row.querySelector('[data-del]').addEventListener('click',  () => deletePoste(p.id));
    }
    container.appendChild(row);
  });
}

async function togglePoste(p) {
  const newVal = p.ouvert === false;
  try {
    await db.collection('postes').doc(p.id).update({ ouvert: newVal });
    logAction('Poste', `${newVal ? 'Ouverture' : 'Fermeture'} du poste "${p.nom}"`);
    toast(newVal ? '✓ Poste ouvert' : 'Poste fermé', 'success');
  } catch (err) {
    console.error('[Toggle poste] ❌', err);
    toast('⚠ Échec : ' + (err.message || err), 'error');
  }
}

document.getElementById('btn-nouveau-poste').addEventListener('click', () => {
  if (currentRole !== 'admin') { toast('⚠ Réservé aux admins', 'error'); return; }
  editPosteId = null;
  document.getElementById('nouveau-poste-title').textContent = 'Nouveau poste';
  document.getElementById('btn-submit-poste').textContent    = 'Créer le poste';
  document.getElementById('form-poste').reset();
  show('modal-nouveau-poste');
});

document.getElementById('close-nouveau-poste').addEventListener('click', () => hide('modal-nouveau-poste'));
document.getElementById('modal-nouveau-poste').addEventListener('click', e => {
  if (e.target === e.currentTarget) hide('modal-nouveau-poste');
});

function openEditPoste(p) {
  editPosteId = p.id;
  document.getElementById('nouveau-poste-title').textContent = 'Modifier le poste';
  document.getElementById('btn-submit-poste').textContent    = 'Enregistrer';
  document.getElementById('poste-nom').value    = p.nom;
  document.getElementById('poste-cat').value    = p.cat;
  document.getElementById('poste-desc').value   = p.desc;
  document.getElementById('poste-prereq').value = p.prereq || '';
  document.getElementById('poste-statut').value = p.ouvert === false ? 'ferme' : 'ouvert';
  show('modal-nouveau-poste');
}

function bindFormPoste() {
  document.getElementById('form-poste').addEventListener('submit', async e => {
    e.preventDefault();
    if (currentRole !== 'admin') { toast('⚠ Réservé aux admins', 'error'); return; }
    const nom    = val('poste-nom'), cat  = val('poste-cat'),
          desc   = val('poste-desc'), prereq = val('poste-prereq');
    const ouvert = document.getElementById('poste-statut').value !== 'ferme';
    if (!nom || !cat || !desc) return;
    if (editPosteId) {
      await db.collection('postes').doc(editPosteId).update({ nom, cat, desc, prereq, ouvert });
      logAction('Poste', `Modification du poste "${nom}"`);
    } else {
      await db.collection('postes').add({ nom, cat, desc, prereq, ouvert, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      logAction('Poste', `Création du poste "${nom}"`);
    }
    hide('modal-nouveau-poste');
    toast(editPosteId ? '✓ Poste modifié' : '✓ Poste créé', 'success');
  });
}

async function deletePoste(id) {
  if (currentRole !== 'admin') { toast('⚠ Réservé aux admins', 'error'); return; }
  if (!confirm('Supprimer ce poste ?')) return;
  const p = postes.find(x => x.id === id);
  await db.collection('postes').doc(id).delete();
  logAction('Poste', `Suppression du poste "${p ? p.nom : id}"`);
  toast('Poste supprimé', 'success');
}

/* ============================================================
   DETAIL CANDIDATURE
   ============================================================ */
function bindDetailModal() {
  document.getElementById('close-cand-detail').addEventListener('click', () => hide('modal-cand-detail'));
  document.getElementById('modal-cand-detail').addEventListener('click', e => {
    if (e.target === e.currentTarget) hide('modal-cand-detail');
  });
}

function bindCopyDiscord() {
  const btn = document.getElementById('btn-copy-discord');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = document.getElementById('detail-discord').textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast('✓ Pseudo Discord copié', 'success');
    } catch {
      toast('Impossible de copier automatiquement', 'error');
    }
  });
}

function openCandDetail(c) {
  currentCand = c;
  document.getElementById('detail-cat').textContent        = c.posteCat;
  document.getElementById('detail-cat').className          = 'modal-tag';
  const catColor = getCategoryColor(c.posteCat);
  document.getElementById('detail-cat').style.color        = catColor;
  document.getElementById('detail-poste').textContent      = c.posteNom;
  document.getElementById('detail-discord').textContent    = c.nom;
  const badgeEl = document.getElementById('detail-discord-verified');
  if (c.discordId) {
    badgeEl.textContent = '✓ Vérifié';
    badgeEl.className   = 'discord-verified-badge verified';
  } else {
    badgeEl.textContent = '⚠ Non vérifié';
    badgeEl.className   = 'discord-verified-badge unverified';
  }
  document.getElementById('detail-roblox').textContent     = c.prenom;
  document.getElementById('detail-rp').textContent         = c.rp;
  document.getElementById('detail-email').textContent      = c.email;
  document.getElementById('detail-motivation').textContent = c.motiv;
  document.getElementById('detail-extra').textContent      = c.extra || '—';
  const cvEl = document.getElementById('detail-cv');
  cvEl.innerHTML = c.cv ? `<a href="${esc(c.cv)}" target="_blank" style="color:var(--gold)">${esc(c.cv)}</a>` : '—';
  renderDetailActions(c);
  show('modal-cand-detail');
}

function renderDetailActions(c) {
  const container = document.getElementById('detail-actions');
  container.innerHTML = '';
  if (c.statut === 'accepte') { container.innerHTML = `<span style="color:#5ab87a;font-weight:800;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">✓ CANDIDATURE ACCEPTÉE</span>`; return; }
  if (c.statut === 'refuse')  { container.innerHTML = `<span style="color:#e07070;font-weight:800;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">✕ CANDIDATURE REFUSÉE</span>`;  return; }
  if (currentRole === 'rh' && !rhPermissions.actionCandidatures) {
    container.innerHTML = `<span style="color:var(--text3);font-weight:700;font-size:11px;letter-spacing:0.06em;text-transform:uppercase">Tu n'as pas la permission d'agir sur cette candidature.</span>`;
    return;
  }
  if (c.statut === 'en_attente') container.appendChild(makeActionBtn('Prendre en charge', 'charge', () => actionCand(c, 'en_charge')));
  container.appendChild(makeActionBtn('✓ Accepter', 'accept', () => actionCand(c, 'accepte')));
  container.appendChild(makeActionBtn('✕ Refuser',  'refuse', () => actionCand(c, 'refuse')));
}

function makeActionBtn(label, cls, handler) {
  const btn = document.createElement('button');
  btn.className = `btn-action ${cls}`;
  btn.textContent = label;
  btn.addEventListener('click', handler);
  return btn;
}

async function actionCand(c, newStatut) {
  await db.collection('candidatures').doc(c.id).update({ statut: newStatut });
  const updated = { ...c, statut: newStatut };
  currentCand = updated;
  if (newStatut === 'en_charge') await sendMailCharge(updated);
  if (newStatut === 'accepte')   await sendMailAccept(updated);
  if (newStatut === 'refuse')    await sendMailRefuse(updated);
  const actionLabel = newStatut === 'en_charge' ? 'Prise en charge' : newStatut === 'accepte' ? 'Acceptation' : 'Refus';
  logAction('Candidature', `${actionLabel} — Discord : ${c.nom} (ID Roblox : ${c.prenom}) — poste "${c.posteNom}"`);
  renderDetailActions(updated);
  toast(
    newStatut === 'en_charge' ? '📧 Email de prise en charge envoyé' :
    newStatut === 'accepte'   ? '✓ Candidature acceptée — email envoyé' :
                                '✕ Candidature refusée — email envoyé',
    newStatut === 'refuse' ? 'error' : 'success'
  );
}

/* ============================================================
   CONFIG
   ============================================================ */
function fillConfigForm() {
  document.getElementById('cfg-rh-email').value = config.rhEmail || '';
  document.getElementById('cfg-password').value = '';
  const adminPwdField = document.getElementById('cfg-admin-password');
  if (adminPwdField) adminPwdField.value = '';
  const viewCb = document.getElementById('perm-view-cand');
  const actCb  = document.getElementById('perm-action-cand');
  if (viewCb) viewCb.checked = rhPermissions.viewCandidatures;
  if (actCb)  actCb.checked  = rhPermissions.actionCandidatures;
  updateMaintenanceBtn();
}

function bindConfigForm() {
  document.getElementById('btn-toggle-maintenance').addEventListener('click', () => {
    config.maintenance = !config.maintenance;
    saveConfig();
    updateMaintenanceBtn();
    logAction('Maintenance', config.maintenance ? 'Activation du mode maintenance' : 'Désactivation du mode maintenance');
    toast(config.maintenance ? '⚠ Site en maintenance' : '✓ Site remis en ligne', config.maintenance ? 'error' : 'success');
  });
  document.getElementById('btn-save-config').addEventListener('click', async () => {
    config.rhEmail = val('cfg-rh-email');
    const newPwd      = val('cfg-password');
    const newAdminPwd = val('cfg-admin-password');
    if (newPwd) config.password = newPwd;
    if (newAdminPwd) config.adminPassword = newAdminPwd;
    saveConfig();

    const viewCb = document.getElementById('perm-view-cand');
    const actCb  = document.getElementById('perm-action-cand');
    if (viewCb && actCb) {
      rhPermissions = { viewCandidatures: viewCb.checked, actionCandidatures: actCb.checked };
      try {
        await db.collection('meta').doc('rhPermissions').set(rhPermissions);
      } catch (err) {
        console.error('[Permissions] ❌', err);
        toast('⚠ Échec sauvegarde permissions : ' + (err.message || err), 'error');
      }
    }

    logAction('Configuration', (newPwd || newAdminPwd) ? 'Mise à jour de la configuration (mots de passe + permissions)' : 'Mise à jour de la configuration (email + permissions)');
    const ok = document.getElementById('config-success');
    ok.style.display = '';
    setTimeout(() => ok.style.display = 'none', 3000);
  });
}

/* ============================================================
   FORMSUBMIT — MAILS
   ============================================================ */
async function fsSend(to, subject, body) {
  if (!to) return;
  try {
    const res = await fetch(FORMSUBMIT_URL(to), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ subject, message: body, _subject: subject, _captcha: 'false', _template: 'box', from_name: 'SCP SITE 11 — Recrutement' }),
    });
    const data = await res.json();
    console.log(data.success ? `[Mail] ✅ ${to}` : `[Mail] ❌ ${data.message}`);
  } catch(err) { console.error('[Mail] ❌', err); }
}

async function sendMailRH(c) {
  if (!config.rhEmail) return;
  await fsSend(config.rhEmail, `[SCP SITE 11] Nouvelle candidature — ${c.posteNom}`,
    `Nouvelle candidature sur SCP SITE 11.\n\nPoste : ${c.posteNom} (${c.posteCat})\nDiscord : ${c.nom}${c.discordId ? ` (ID vérifié : ${c.discordId})` : ' (non vérifié)'}\nID Roblox : ${c.prenom}\nRP : ${c.rp}\nEmail : ${c.email}\nDate : ${c.date}\n\nMOTIVATION :\n${c.motiv}\n\nCV : ${c.cv||'Non fourni'}\n\nINFOS SUPP. :\n${c.extra||'Aucune'}`);
}
async function sendMailAccuse(c) {
  await fsSend(c.email, `[SCP SITE 11] Candidature reçue — ${c.posteNom}`,
    `Bonjour ${c.prenom},\n\nNous avons bien reçu votre candidature et nous vous remercions de la confiance que vous nous témoignez.\n\nVotre dossier a été transmis à la personne en charge de ce recrutement, qui reviendra vers vous si votre candidature correspond à la recherche en cours. Si vous n'êtes pas contacté prochainement, veuillez considérer que votre profil ne correspond pas à la recherche en cours.\n\nNéanmoins, votre profil est susceptible de nous intéresser pour d'autres postes que nous aurions à pourvoir.\n\nAussi, sauf avis contraire de votre part, nous vous proposons de conserver votre dossier afin de pouvoir vous recontacter en fonction de futures opportunités.\n\nLe service des Ressources Humaines`);
}
async function sendMailCharge(c) {
  await fsSend(c.email, `[SCP SITE 11] Ta candidature est prise en charge`,
    `Bonjour ${c.prenom},\n\nVotre candidature pour le poste ${c.posteNom} sur SCP SITE 11 — Nous accusons réception de votre candidature et nous vous remercions de l'intérêt que vous portez à la société. Votre dossier sera traité dans les plus brefs délais.\n\nCependant si aucune réponse ne vous a été formulée dans un délai de deux mois suivant votre candidature, considérez que votre dossier n'est pas retenu.\n\nNous vous prions d'agréer, nos salutations les meilleures.\n\nLe service des Ressources Humaines`);
}
async function sendMailAccept(c) {
  await fsSend(c.email, `[SCP SITE 11] Candidature acceptée !`,
    `Bonjour ${c.prenom},\n\nVotre candidature pour le poste ${c.posteNom} sur SCP SITE 11 a été acceptée.\n\nBienvenue dans l'équipe ! Nous allons vous recontacter prochainement.\n\nLe service des Ressources Humaines`);
}
async function sendMailRefuse(c) {
  await fsSend(c.email, `[SCP SITE 11] Résultat de ta candidature`,
    `Bonjour ${c.prenom},\n\nMalgré tout l'intérêt de votre candidature pour le poste ${c.posteNom} sur SCP SITE 11, nous sommes dans le regret de ne pas pouvoir donner suite à votre demande. Nous vous souhaitons de trouver satisfaction dans votre recherche.\n\nLe service des Ressources Humaines`);
}

/* ============================================================
   UTILITAIRES
   ============================================================ */
function show(id) { document.getElementById(id).style.display = 'flex'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function val(id)  { return document.getElementById(id).value.trim(); }
function esc(s)   { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function emailValid(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function showFormError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.style.display = ''; }
function statusLabel(s) { return { en_attente:'En attente', en_charge:'Pris en charge', accepte:'Accepté', refuse:'Refusé' }[s]||s; }
let toastTimer = null;
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
