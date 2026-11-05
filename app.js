/* Omni — interface. Aucune donnée inventée : tout vient de /api/*. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const etat = { vue: 'bord', resultats: [], selection: new Set(), filtres: {}, sources: [],
               lien: { entrees: [], sel: new Set() } };

/* L'API est sur la même origine seulement si la page est servie par l'agent lui-même. */
const API = (location.host === '127.0.0.1:8765' || location.host === 'localhost:8765')
  ? '' : 'http://127.0.0.1:8765';

const fmtDuree = s => {
  s = Math.round(Number(s) || 0);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const octets = n => {
  n = Number(n) || 0;
  if (n < 1024) return n + ' o';
  if (n < 1048576) return Math.round(n / 1024) + ' Ko';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' Mo';
  return (n / 1073741824).toFixed(1) + ' Go';
};
const res = v => (Number(v.hauteur) > 0 ? v.hauteur + 'p · ' : '');

function toast(msg, ms = 3800) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.hidden = true), ms);
}

async function api(url, opt) {
  try { return await _api(url, opt); }
  catch (e) {
    if (String(e.message).includes('Failed to fetch') || String(e.message).includes('NetworkError')) {
      agentAbsent();
      throw new Error('agent local hors ligne');
    }
    throw e;
  }
}

function agentAbsent() {
  if (document.getElementById('bandeau-agent')) return;
  const b = document.createElement('div');
  b.id = 'bandeau-agent';
  b.className = 'erreurs';
  b.style.margin = '0 0 14px';
  b.innerHTML = "Agent local hors ligne — lance <code>lancer.bat</code> sur la machine, "
    + "puis recharge cette page. Le site ne peut rien faire sans lui.";
  document.querySelector('.main').prepend(b);
}

async function _api(url, opt) {
  const r = await fetch(API + url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erreur || ('HTTP ' + r.status));
  return j;
}

/* ---------------- navigation ---------------- */
function aller(vue) {
  etat.vue = vue;
  $$('.nav').forEach(b => b.classList.toggle('on', b.dataset.vue === vue));
  ['bord', 'recherche', 'biblio', 'reglages'].forEach(v => {
    $('#vue-' + v).hidden = v !== vue;
  });
  if (vue === 'bord') chargerBord();
  if (vue === 'biblio') chargerBiblio();
  if (vue === 'reglages') chargerReglages();
}

/* ---------------- tableau de bord ---------------- */
async function chargerBord() {
  try {
    const e = await api('/api/etat');
    $('#metrics').innerHTML = [
      ['vidéos', e.stats.videos], ['sur disque', e.stats.taille],
      ['jour(s) de collecte', e.stats.lots],
      ['sources actives', Object.values(e.sources).filter(Boolean).length]
    ].map(([l, v]) => `<div class="metric"><b>${v}</b><span>${l}</span></div>`).join('');

    $('#dernier').innerHTML = (e.dernier || []).map(l => `
      <div class="vid">
        <div class="cover">${l.vignette ? `<img src="${l.vignette}" alt="" loading="lazy">` : '<div class="noimg">pas de vignette</div>'}
          <span class="src">${(l.source || '').toUpperCase()}</span>
          ${l.duree_s ? `<span class="dur">${fmtDuree(l.duree_s)}</span>` : ''}</div>
        <div class="txt"><div class="t">${l.titre || l.fichier}</div>
          <div class="m">${res(l)}${octets(l.octets)}</div></div>
      </div>`).join('') || '<div class="vide">Aucun téléchargement encore. Va dans Rechercher.</div>';

    $('#src-util').innerHTML = (e.sources_utilisees || []).map(s =>
      `<div class="liste"><div class="ligne"><span>${s.mot}</span><span>${s.n}</span></div></div>`).join('')
      || '<p class="small muted">—</p>';

    $('#dossier').textContent = e.dossier;
    $('#rail-foot').innerHTML = Object.entries(e.sources)
      .map(([k, v]) => `${k} ${v ? '✓' : '—'}`).join(' · ');
    etat.profil = e.profil || { fait: true };
    etat.roles = e.roles || {};
    etat.themes = e.themes || [];
    if (etat.profil && etat.profil.fait === false) ouvrirOnb();
    chargerSuggestions();
  } catch (err) {
    toast('État indisponible : ' + err.message);
  }
}

async function chargerSuggestions() {
  try {
    const r = await api('/api/suggestions');
    const s = r.suggestions || [];
    $('#suggestions').innerHTML = s.length ? s.map((x, i) => `
      <div class="sugg" data-s="${i}">
        <div><span class="sugg-q">${x.q}</span><span class="sugg-r">${x.raison}</span></div>
        <span class="sugg-type">${x.type}</span>
      </div>`).join('') : '<p class="small muted">Rien à proposer pour l\'instant.</p>';
    $$('#suggestions .sugg').forEach(el => el.addEventListener('click', () => {
      const item = s[+el.dataset.s];
      $('#q').value = item.q;
      chercher();
    }));
  } catch (_) { $('#suggestions').innerHTML = ''; }
}

/* ---------------- onboarding ---------------- */
function ouvrirOnb() {
  const sel = { role: (etat.profil || {}).role || '', themes: new Set((etat.profil || {}).themes || []) };
  $('#onb-roles').innerHTML = Object.entries(etat.roles || {})
    .map(([k, lib]) => `<button data-role="${k}" class="${sel.role === k ? 'on' : ''}">${lib}</button>`).join('');
  $('#onb-themes').innerHTML = (etat.themes || [])
    .map(t => `<button data-theme="${t}" class="${sel.themes.has(t) ? 'on' : ''}">${t}</button>`).join('');

  $$('#onb-roles button').forEach(b => b.addEventListener('click', () => {
    sel.role = b.dataset.role;
    $$('#onb-roles button').forEach(x => x.classList.toggle('on', x === b));
  }));
  $$('#onb-themes button').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.theme;
    if (sel.themes.has(t)) sel.themes.delete(t); else if (sel.themes.size < 5) sel.themes.add(t);
    b.classList.toggle('on', sel.themes.has(t));
  }));

  $('#onb').hidden = false;
  $('#onb-go').onclick = async () => {
    if (!sel.role) return toast('Choisis au moins ton usage.');
    if (sel.themes.size < 3) return toast('Choisis 3 thèmes au minimum.');
    try {
      const r = await api('/api/profil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: sel.role, themes: [...sel.themes], fait: true })
      });
      $('#onb').hidden = true;
      appliquerFiltres(r.filtres || {});
      toast('Profil enregistré.');
      chargerSuggestions();
    } catch (e) { toast(e.message); }
  };
  $('#onb-skip').onclick = () => { $('#onb').hidden = true; };
}

function appliquerFiltres(f) {
  if (!f) return;
  $$('[data-f]').forEach(s => {
    const v = f[s.dataset.f];
    if (v !== undefined && v !== null && v !== '') s.value = String(v);
  });
}

/* ---------------- recherche ---------------- */
function lireFiltres() {
  const o = {};
  $$('[data-f]').forEach(s => (o[s.dataset.f] = s.value));
  o.sources = [
    $('#src-pixabay').checked ? 'pixabay' : '',
    $('#src-coverr').checked ? 'coverr' : '',
    $('#src-archive').checked ? 'archive' : ''
  ].filter(Boolean);
  return o;
}

async function chercher() {
  const q = $('#q').value.trim();
  if (!q) return toast('Écris un sujet.');
  aller('recherche');
  const f = lireFiltres();
  $('#resultats').innerHTML = '<div class="vide">Recherche en cours…</div>';
  $('#vide-recherche').hidden = true;
  $('#erreurs').hidden = true;
  try {
    const p = new URLSearchParams({ q, sources: f.sources.join(','), n: 12, ...f });
    const r = await api('/api/recherche?' + p.toString());
    etat.resultats = r.resultats || [];
    etat.selection.clear();
    afficherResultats(r);
  } catch (e) {
    $('#resultats').innerHTML = '';
    $('#erreurs').hidden = false;
    $('#erreurs').textContent = 'Recherche impossible — ' + e.message;
  }
}

function afficherResultats(r) {
  const n = etat.resultats.length;
  $('#compte').textContent = n + ' résultat' + (n > 1 ? 's' : '');
  if (r.erreurs && r.erreurs.length) {
    $('#erreurs').hidden = false;
    $('#erreurs').textContent = 'Source(s) en échec — ' + r.erreurs.join(' · ');
  }
  $('#resultats').innerHTML = etat.resultats.map((v, i) => `
    <div class="vid ${v.deja ? 'deja' : ''}" data-i="${i}" title="${v.licence || ''}">
      <div class="cover">${v.vignette ? `<img src="${v.vignette}" alt="" loading="lazy">` : '<div class="noimg">pas de vignette</div>'}
        <span class="src">${v.source.toUpperCase()}</span>
        ${v.duree ? `<span class="dur">${fmtDuree(v.duree)}</span>` : ''}
        <span class="pick"></span></div>
      <div class="txt"><div class="t">${v.titre}</div>
        <div class="m">${res(v) || '—'} · ${v.licence || ''}
          ${v.deja ? ' · <span class="deja-tag">déjà pris</span>' : ''}
          ${!v.telechargeable ? ' · <span class="deja-tag">lien manuel</span>' : ''}</div></div>
    </div>`).join('') || '<div class="vide">Aucun résultat avec ces filtres.</div>';
  $$('#resultats .vid').forEach(el => el.addEventListener('click', ev => {
    const i = +el.dataset.i;
    if (ev.target.closest('.pick')) return basculer(i, el);
    lire(etat.resultats[i]);
  }));
  majSelection();
}

function basculer(i, el) {
  const v = etat.resultats[i];
  if (!v || !v.telechargeable) return toast('Cette source demande un lien direct : ouvre la page.');
  if (etat.selection.has(i)) etat.selection.delete(i);
  else etat.selection.add(i);
  el.classList.toggle('on', etat.selection.has(i));
  majSelection();
}

function majSelection() {
  const n = etat.selection.size;
  const ok = [...etat.selection].filter(i => etat.resultats[i] && etat.resultats[i].telechargeable).length;
  $('#selbar').hidden = n === 0 || etat.vue !== 'recherche';
  $('#sel-n').textContent = n;
  $('#sel-ok').textContent = ok;
}

/* ---------------- lecteur ---------------- */
function lire(v) {
  if (!v) return;
  const url = v.fichier_local ? '/media/' + encodeURIComponent(v.fichier_local) : (v.fichier || v.url || '');
  if (!url) { if (v.page) window.open(v.page, '_blank'); return; }
  const box = $('#player'), vid = $('#pvideo');
  vid.src = url;
  $('#pmeta').innerHTML = `<b>${v.titre || v.fichier_local || ''}</b><br>
    ${v.source || ''} ${v.hauteur ? '· ' + v.hauteur + 'p' : ''} ${v.licence ? '· ' + v.licence : ''}
    ${v.style ? ' · style : ' + v.style : ''}
    ${v.page ? ` · <a href="${v.page}" target="_blank" rel="noopener">page d'origine</a>` : ''}`;
  box.hidden = false;
  vid.play().catch(() => {});
}

function fermerPlayer() {
  const vid = $('#pvideo');
  vid.pause();
  vid.removeAttribute('src');
  vid.load();
  $('#player').hidden = true;
}

/* ---------------- téléchargement ---------------- */
async function telecharger() {
  if (!etat.selection.size) return;
  if (!$('#droits').checked) return toast('Coche d\'abord la case des droits.');
  const items = [...etat.selection].map(i => etat.resultats[i]).filter(v => v.telechargeable);
  const sujet = $('#q').value.trim() || 'lot';
  $('#dl').disabled = true;
  try {
    const r = await api('/api/telecharger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sujet, droits: true, items, style: ($('#style') || {}).value || '' })
    });
    toast('Lot lancé — ' + items.length + ' vidéo(s).');
    suivreLot(r.id);
  } catch (e) {
    toast('Échec : ' + e.message);
  } finally {
    $('#dl').disabled = false;
  }
}

async function suivreLot(id) {
  const t0 = Date.now();
  while (Date.now() - t0 < 15 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 1500));
    let e;
    try { e = await api('/api/lot/' + id); } catch (_) { return; }
    const b = e.bilan;
    toast(`Lot : ${b.ok} OK · ${b.echecs} échec(s) · ${octets(b.octets)}${e.termine ? ' — terminé' : ''}`, 2200);
    if (e.termine) {
      toast(`Terminé : ${b.ok} téléchargée(s), ${b.echecs} échec(s), ${b.ignores} ignorée(s).`, 6000);
      etat.selection.clear();
      majSelection();
      chargerBord();
      return;
    }
  }
}

/* ---------------- lien ---------------- */
async function analyserLien() {
  const url = $('#lien-url').value.trim();
  $('#lien-erreur').hidden = true;
  if (!/^https?:\/\//.test(url)) { $('#lien-erreur').hidden = false; $('#lien-erreur').textContent = 'Lien invalide.'; return; }
  $('#lien-liste').innerHTML = '<p class="small muted">Analyse en cours… (une playlist peut prendre 20 s)</p>';
  $('#lien-go').disabled = true;
  try {
    const r = await api('/api/lien', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    etat.lien = { entrees: r.entrees || [], sel: new Set((r.entrees || []).map((_, i) => i)), titre: r.titre };
    $('#lien-titre').style.display = 'block';
    $('#lien-titre').textContent = `${r.titre} — ${etat.lien.entrees.length} vidéo(s) · ${r.source}`;
    afficherLien();
  } catch (e) {
    $('#lien-erreur').hidden = false;
    $('#lien-erreur').textContent = 'Impossible : ' + e.message;
    $('#lien-liste').innerHTML = '';
  } finally { $('#lien-go').disabled = false; }
}

function afficherLien() {
  const e = etat.lien.entrees;
  $('#lien-liste').innerHTML = e.length ? e.map((v, i) => `
    <div class="lien-row">
      <label class="chk"><input type="checkbox" data-l="${i}" ${etat.lien.sel.has(i) ? 'checked' : ''}>
        <span>${v.titre}${v.duree ? `<span class="dur">${fmtDuree(v.duree)}</span>` : ''}</span></label>
    </div>`).join('') + `
    <div class="row" style="margin-top:14px">
      <button id="lien-dl" class="chip">Télécharger ${etat.lien.sel.size} vidéo(s)</button>
      <input id="lien-style" class="q" style="max-width:220px" placeholder="style (optionnel)">
    </div>` : '<p class="small muted">Aucune vidéo dans ce lien.</p>';

  $$('#lien-liste input[data-l]').forEach(cb => cb.addEventListener('change', () => {
    const i = +cb.dataset.l;
    if (cb.checked) etat.lien.sel.add(i); else etat.lien.sel.delete(i);
    $('#lien-dl').textContent = `Télécharger ${etat.lien.sel.size} vidéo(s)`;
  }));
  const b = $('#lien-dl');
  if (b) b.onclick = telechargerLiens;
}

async function telechargerLiens() {
  if (!etat.lien.sel.size) return toast('Coche au moins une vidéo.');
  const entrees = [...etat.lien.sel].map(i => etat.lien.entrees[i]);
  try {
    const r = await api('/api/telecharger-lien', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrees, sujet: (etat.lien.titre || 'lien').slice(0, 40), droits: true,
                             style: ($('#lien-style') || {}).value || '' })
    });
    toast('Lot lancé — ' + entrees.length + ' vidéo(s).');
    suivreLot(r.id);
  } catch (e) { toast('Échec : ' + e.message); }
}

/* ---------------- bibliothèque ---------------- */
async function chargerBiblio() {
  try {
    const b = await api('/api/bibliotheque');
    etat.biblio = b.lignes || [];
    $('#biblio-dossier').textContent = b.dossier;
    afficherBiblio();
  } catch (e) { toast(e.message); }
}

function afficherBiblio() {
  const q = ($('#biblio-q').value || '').toLowerCase().trim();
  const tri = $('#biblio-tri').value;
  let lignes = (etat.biblio || []).filter(l =>
    !q || [l.titre, l.source, l.style, l.fichier, l.licence].join(' ').toLowerCase().includes(q));
  if (tri === 'titre') lignes.sort((a, b) => (a.titre || '').localeCompare(b.titre || ''));
  if (tri === 'taille') lignes.sort((a, b) => (+b.octets || 0) - (+a.octets || 0));
  $('#biblio-compte').textContent = lignes.length + ' fichier' + (lignes.length > 1 ? 's' : '');
  $('#biblio-list').innerHTML = lignes.length ? lignes.map((l, i) => `
    <div class="vid" data-b="${i}">
      <div class="cover">${l.vignette ? `<img src="${l.vignette}" alt="" loading="lazy">` : '<div class="noimg">pas de vignette</div>'}
        <span class="src">${(l.source || '').toUpperCase()}</span>
        ${l.duree_s ? `<span class="dur">${fmtDuree(l.duree_s)}</span>` : ''}</div>
      <div class="txt"><div class="t">${l.titre || l.fichier}</div>
        <div class="m">${res(l)}${octets(l.octets)}${l.style ? ' · ' + l.style : ''}</div></div>
    </div>`).join('') : '<div class="vide">Rien encore.</div>';
  $$('#biblio-list .vid').forEach(el => el.addEventListener('click', () => {
    lire(lignes[+el.dataset.b]);
  }));
}

/* ---------------- réglages ---------------- */
async function chargerReglages() {
  try {
    const e = await api('/api/etat');
    $('#dossier-input').value = e.dossier;
    $('#src-etat').innerHTML = Object.entries(e.sources).map(([k, v]) =>
      `<div class="ligne"><span>${k}</span><span>${v ? 'configurée' : 'absente'}</span></div>`).join('');
  } catch (_) {}
}

/* ---------------- démarrage ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  $$('.nav').forEach(b => b.addEventListener('click', () => aller(b.dataset.vue)));
  $('#go').addEventListener('click', chercher);
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('on', x === t));
    const lien = t.dataset.mode === 'lien';
    $('#panneau-sujet').hidden = lien;
    $('#panneau-lien').hidden = !lien;
    if (lien) $('#selbar').hidden = true;
  }));
  $('#lien-go').addEventListener('click', analyserLien);
  $('#lien-url').addEventListener('keydown', e => { if (e.key === 'Enter') analyserLien(); });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') chercher(); });
  $$('[data-f], #src-pixabay, #src-coverr, #src-archive')
    .forEach(el => el.addEventListener('change', () => { if ($('#q').value.trim()) chercher(); }));
  $('#dl').addEventListener('click', telecharger);
  $('#pclose').addEventListener('click', fermerPlayer);
  $('#player').addEventListener('click', e => { if (e.target.id === 'player') fermerPlayer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fermerPlayer(); });
  $('#biblio-q').addEventListener('input', afficherBiblio);
  $('#biblio-tri').addEventListener('change', afficherBiblio);
  $('#ouvrir').addEventListener('click', async () => {
    try { const r = await api('/api/ouvrir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      toast('Dossier ouvert : ' + r.ouvert); }
    catch (e) { toast('Impossible d\'ouvrir : ' + e.message); }
  });
  $('#dossier-save').addEventListener('click', async () => {
    try {
      const r = await api('/api/dossier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier: $('#dossier-input').value.trim() })
      });
      toast('Dossier : ' + r.dossier);
    } catch (e) { toast(e.message); }
  });
  const m = location.hash.match(/^#q=(.+)$/);
  if (m) { $('#q').value = decodeURIComponent(m[1]); chercher(); }
  else if (['#biblio', '#recherche', '#reglages'].includes(location.hash)) { aller(location.hash.slice(1)); }
  else if (location.hash === '#lien') {
    aller('recherche');
    const t = $$('.tab').find(x => x.dataset.mode === 'lien');
    if (t) t.click();
  }
  else { aller('bord'); }
});
