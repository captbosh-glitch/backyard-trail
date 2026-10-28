// Backyard & Trail: screens, places, sightings, camera and offline packs.
// Places come from OpenStreetMap (search, GPS) and Zippopotam (ZIP codes); which guide entries apply
// comes from iNaturalist research-grade sightings within 10 miles. Nothing is sent anywhere else.

const RADIUS_KM = 16;          // about 10 miles
const INAT = 'https://api.inaturalist.org/v1';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const STORE = { recent: 'bt-recent', packs: 'bt-packs', seenCam: 'bt-cam-ok', seenGps: 'bt-gps-ok' };

// ---------- small helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const cap = s => s[0].toUpperCase() + s.slice(1);
const placeKey = p => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const levelOf = h => state.dog ? h.pet : h.level;
const tier = n => n == null ? 'documented' : n >= 25 ? 'common' : n >= 5 ? 'occasional' : 'uncommon';

async function getJSON(url, signal) {
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function harm(lv, sub) {
  return `<span class="harm"><span class="lv lv-${lv}"><span class="meter" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${LEVELS[lv].label}</span>${sub ? `<small>${sub}</small>` : ''}</span>`;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4500);
}

// ---------- state ----------
const state = {
  screen: 'welcome', place: null, guide: null, loading: false, error: '', fromPack: null,
  cat: 'all', dog: false, sort: 'risk', map: true,
  search: '', results: null, searchMsg: '', busy: false,
  online: navigator.onLine,
};
const cam = { stream: null, file: null, url: null, cat: null, stage: 'capture', live: false, error: '' };
let sheet = null, lastFocus = null, guideCtl = null, leafletMap = null;

// ---------- places ----------
// A place: { name, short, lat, lng, state (two-letter, US only), sample? }
const US_STATES = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };

function fromNominatim(r) {
  const a = r.address || {};
  const st = (a['ISO3166-2-lvl4'] || '').replace('US-', '') || US_STATES[a.state] || '';
  const local = r.name || a.park || a.nature_reserve || a.city || a.town || a.village || a.hamlet || a.county || a.state;
  const short = local || r.display_name.split(',')[0];
  return { name: st ? `${short}, ${st}` : short, short, lat: +r.lat, lng: +r.lon, state: st, country: a.country_code };
}
async function searchPlaces(q) {
  if (/^\d{5}$/.test(q)) {
    const r = await fetch(`https://api.zippopotam.us/us/${q}`);
    if (r.status === 404) return [];
    if (!r.ok) throw new Error('zip');
    const z = await r.json(), p = z.places[0];
    return [{ name: `${p['place name']}, ${p['state abbreviation']} ${q}`, short: p['place name'], lat: +p.latitude, lng: +p.longitude, state: p['state abbreviation'] }];
  }
  const list = await getJSON(`${NOMINATIM}/search?${new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'us', limit: 6, addressdetails: 1 })}`);
  const seen = new Set();
  return list.map(fromNominatim).filter(p => { const k = p.name; if (seen.has(k)) return false; seen.add(k); return true; });
}
async function reverse(lat, lng) {
  try {
    const r = await getJSON(`${NOMINATIM}/reverse?${new URLSearchParams({ lat, lon: lng, format: 'jsonv2', zoom: 12, addressdetails: 1 })}`);
    return { ...fromNominatim(r), lat, lng };
  } catch { return { name: 'Your location', short: 'Your location', lat, lng, state: '' }; }
}

// ---------- sightings ----------
// Which guide entries have been documented near a place, with counts and points for the map.
const TAXON_TO_HAZARD = {};
for (const [id, list] of Object.entries(TAXA)) for (const t of list) TAXON_TO_HAZARD[t] = id;
function hazardFor(taxon, st) {
  const ids = [taxon.id, ...(taxon.ancestor_ids || []).slice().reverse()];
  const hit = ids.map(i => TAXON_TO_HAZARD[i]).find(Boolean);
  return hit && (STATE_SWAP[st]?.[hit] || hit);
}
async function fetchGuide(place, signal) {
  const taxa = Object.values(TAXA).flat().join(',');
  const q = { taxon_id: taxa, lat: place.lat, lng: place.lng, radius: RADIUS_KM, verifiable: 'true', quality_grade: 'research' };
  const [counts, obs] = await Promise.all([
    getJSON(`${INAT}/observations/species_counts?${new URLSearchParams({ ...q, per_page: 200 })}`, signal),
    getJSON(`${INAT}/observations?${new URLSearchParams({ ...q, per_page: 150, order_by: 'observed_on' })}`, signal),
  ]);
  const found = {};
  for (const r of counts.results) {
    const id = hazardFor(r.taxon, place.state);
    if (id) found[id] = (found[id] || 0) + r.count;
  }
  const points = [];
  for (const o of obs.results) {
    const id = hazardFor(o.taxon, place.state), c = o.geojson?.coordinates;
    if (id && c) points.push({ id, lat: c[1], lng: c[0], blurred: !!o.obscured, date: o.observed_on });
  }
  const byState = Object.entries(BY_STATE).filter(([, r]) => r.states.includes(place.state)).map(([id]) => id);
  return { counts: found, byState, points, fetched: Date.now() };
}
function hazardList(g) {
  const list = Object.entries(g.counts).map(([id, n]) => ({ id, ...H[id], n, tier: tier(n) }));
  for (const id of g.byState) if (!g.counts[id]) list.push({ id, ...H[id], n: null, tier: 'documented', stateNote: BY_STATE[id].note });
  return list;
}
function advisoryFor(place, list) {
  const sample = place.sample && SAMPLES[place.sample];
  if (sample) return sample.advisory;
  const m = new Date().getMonth() + 1, has = c => list.some(h => h.cat === c), hasId = id => list.some(h => h.id === id);
  if (has('reptiles') && m >= 4 && m <= 10) return 'Snakes are active this time of year, especially on warm afternoons. Watch where you step and where you put your hands.';
  if ((hasId('bear') || hasId('grizzly')) && m >= 8 && m <= 11) return 'Fall is peak feeding season for bears. Store food securely and make noise on the trail.';
  if ((hasId('tick') || hasId('woodtick')) && m >= 3 && m <= 7) return 'Tick season is here. Check yourself and your dog after every hike.';
  if (has('reptiles')) return 'Snakes are mostly inactive in cold weather but can come out to bask on warm, sunny days.';
  if (hasId('yellowjacket') && m >= 7 && m <= 10) return 'Yellowjacket nests are at their largest in late summer and fall. Watch for wasps flying in and out of the ground.';
  return 'Conditions change with the seasons. Check with local rangers for current wildlife activity before you go.';
}

// ---------- offline packs ----------
// A pack keeps a place's guide data on this device; the service worker keeps its photos and illustrations.
const packs = () => load(STORE.packs, {});
async function savePack(place, guide) {
  const all = packs(); all[placeKey(place)] = { place, guide, savedAt: Date.now() }; save(STORE.packs, all);
  if ('caches' in window) {
    const ids = hazardList(guide).map(h => h.id);
    const files = [...new Set(ids.flatMap(id => [`photos/${id}.jpg`, ART[IC[id]] ? `art/${ART[IC[id]]}.png` : null]).filter(Boolean))];
    try { const c = await caches.open('bt-media-v1'); await c.addAll(files); } catch {}
  }
}
function removePack(key) { const all = packs(); delete all[key]; save(STORE.packs, all); }

// ---------- screens ----------
function header() {
  const n = Object.keys(packs()).length;
  return `${state.online ? '' : `<div class="offbar" role="status">${icon('warn')} You’re offline. Saved packs still work.</div>`}
  <header class="top"><div class="wrap"><button class="brand" data-act="home" aria-label="Backyard and Trail home"><span class="mark">${icon('shield')}</span><span>Backyard <span class="amp">&amp;</span> Trail</span></button>
    <span class="tag">A proactive wilderness awareness guide</span>
    <button class="btn acct" data-act="saved">${icon('download')} Saved${n ? ` <span class="count">${n}</span>` : ''}</button></div></header>`;
}

function welcome() {
  const demo = SAMPLES['blue-ridge'];
  const fakeList = ['copperhead', 'timber', 'bear', 'poisonivy', 'yellowjacket'].map(id => ({ id, ...H[id] }));
  return header() + `<main class="wrap welcome">
    <div><p class="eyebrow">Know before you go</p>
      <h1 class="display" style="margin-top:18px">Explore with <em>confidence.</em></h1>
      <p class="lede">See the plants, wildlife and natural hazards documented near your backyard, your trail or your next destination, before you get there.</p>
      <div class="cta"><button class="btn primary" data-act="start">Find a place ${icon('arrow')}</button><button class="btn" data-act="login">Log in</button></div>
      <p class="fine">No account needed. Sightings come from iNaturalist, a community of naturalists and scientists.</p></div>
    <div class="mapcard" aria-hidden="true">${mapSVG({ name: demo.name, terrain: 'forest', water: true }, fakeList)}
      <div class="foot"><div><small>Regional profile</small><strong>Blue Ridge foothills</strong></div><div class="bignum"><b>13</b><span>documented<br>hazards</span></div></div></div>
  </main>
  <div class="strip"><div class="wrap"><span>${icon('shield')} Educational guidance</span><span>${icon('pin')} Real sightings near you</span><span>${icon('check')} Safety-first recommendations</span></div></div>`;
}

function login() {
  return `<div class="loginpage"><div class="wrap"><button class="backlink" data-act="home">${icon('back')} Back</button>
    <div class="panel login"><span class="brand" style="justify-content:center"><span class="mark">${icon('shield')}</span><span>Backyard <span class="amp">&amp;</span> Trail</span></span>
      <p class="eyebrow">Accounts</p><h1>Accounts are coming soon</h1>
      <p class="sub">For now, everything you save stays on this device: recent places and offline packs. Nothing you search for is tied to you.</p>
      <div style="display:grid;gap:12px;margin-top:26px">
        <button class="btn primary block" data-act="start">Find a place ${icon('arrow')}</button>
        <button class="btn block" data-act="saved">${icon('download')} See saved places</button>
      </div>
      <p class="legal">This guide is educational and not a substitute for emergency or medical advice.</p>
    </div></div></div>`;
}

function locate() {
  const recent = load(STORE.recent, []);
  const results = state.results;
  return header() + `<main class="locate">
    <div class="left"><div>
      <p class="step">01 <i></i> LOCATION</p>
      <h1 class="display" style="margin-top:18px">Where are you <em>heading?</em></h1>
      <p class="lede">Search a trail, park, town or ZIP code, or use your current location, to see the natural hazards documented nearby.</p>
      <div class="panel searchbox">
        <form class="search" id="search-form" role="search"><span aria-hidden="true">${icon('search')}</span>
          <label class="sr" for="q">Trail, park, town or ZIP code</label>
          <input id="q" type="search" enterkeyhint="search" placeholder="Trail, park, town or ZIP code" value="${esc(state.search)}" autocomplete="off">
          <button class="iconbtn" type="submit" aria-label="Search" ${state.busy ? 'disabled' : ''}>${state.busy ? '<span class="spin light"></span>' : icon('arrow')}</button></form>
        ${results ? `<div class="results" role="list">${results.length ? results.map((p, i) => `<button class="result" role="listitem" data-act="pick" data-i="${i}">${icon('pin')}<span>${esc(p.name)}</span>${icon('chev', 'chev')}</button>`).join('') : ''}</div>` : ''}
        <div class="or" style="margin:10px 0 4px">or</div>
        <button class="gps" data-act="gps"><span class="dot">${icon('crosshair')}</span><span><b>Use my current location</b><small>We’ll ask before using it</small></span>${icon('chev', 'chev')}</button>
      </div>
      ${state.searchMsg ? `<p class="notice" role="status">${esc(state.searchMsg)}</p>` : ''}
      ${recent.length ? `<div class="recent">Recent ${recent.map((p, i) => `<button class="chip" data-act="recent" data-i="${i}">${icon('pin')} ${esc(p.short)} ${icon('arrow')}</button>`).join('')}</div>` : ''}
    </div></div>
    <aside class="right"><p class="eyebrow plain" style="color:var(--forest)">Try a sample place</p>
      <div class="regions">${Object.entries(SAMPLES).map(([id, r]) => `<button class="regioncard" data-act="sample" data-id="${id}"><strong>${esc(r.short)}</strong><small>${esc(r.habitat)}</small>${icon('chev', 'chev')}</button>`).join('')}</div>
      <div class="aside-note">${icon('shield')}<div><b>Built for awareness, not identification</b>Wildlife moves and species can look alike. We show documented regional risks so you can plan defensively.</div></div>
    </aside></main>`;
}

function guideScreen() {
  const p = state.place;
  const band = (count) => `<section class="band"><div class="wrap">
      <div><button class="back" data-act="start">${icon('back')} Change location</button>
        <p class="eyebrow">Regional field guide</p><h1>${esc(p.name)}</h1>
        <p class="habitat">${icon('pin')} ${p.sample ? esc(SAMPLES[p.sample].habitat) + ' · ' : ''}Sightings within 10 miles</p></div>
      <div class="actions">
        <button class="btn ghost-dark" data-act="camera">${icon('camera')} Compare a photo</button>
        ${state.guide ? `<button class="btn ghost-dark" data-act="offline" aria-pressed="${!!packs()[placeKey(p)]}">${packs()[placeKey(p)] ? icon('check') + ' Saved offline' : icon('download') + ' Save for offline'}</button>` : ''}
        ${count != null ? `<div class="bignum"><b>${count}</b><span>documented<br>hazards</span></div>` : ''}
      </div></div></section>`;
  if (state.loading) return header() + band(null) + `<main class="guide"><div class="state-card">${'<span class="spin"></span>'}<div><b>Checking sightings near ${esc(p.short)}…</b><p>Looking through iNaturalist records within 10 miles.</p></div></div>
      ${[0, 1, 2].map(() => '<div class="hz skeleton"><span class="cat"></span><span class="body"><i></i><i></i><i></i></span></div>').join('')}</main>` + sos();
  if (state.error) return header() + band(null) + `<main class="guide"><div class="state-card error">${icon('warn')}<div><b>We couldn’t load sightings for ${esc(p.short)}.</b>
      <p>${esc(state.error)}</p><div class="cta" style="margin-top:14px"><button class="btn primary" data-act="retry">Try again</button><button class="btn" data-act="saved">Open a saved pack</button></div></div></div>
      <p class="disclaimer">${icon('shield')} In an emergency, call 911. For plants, mushrooms or stings, call Poison Control at 1-800-222-1222.</p></main>` + sos();

  const all = hazardList(state.guide);
  if (!all.length) return header() + band(0) + `<main class="guide"><div class="state-card">${icon('check')}<div><b>No hazards from this guide have been documented within 10 miles.</b>
      <p>That doesn’t mean there are none. The guide covers 40 of the most dangerous species in the U.S., and many places have few iNaturalist records. Watch where you step, don’t touch or eat anything you can’t identify, and keep dogs leashed.</p></div></div></main>` + sos();

  const counts = {}; all.forEach(h => { counts[h.cat] = (counts[h.cat] || 0) + 1; });
  if (state.cat !== 'all' && !counts[state.cat]) state.cat = 'all';
  let list = state.cat === 'all' ? all : all.filter(h => h.cat === state.cat);
  list = list.slice().sort((a, b) => state.sort === 'risk'
    ? LEVELS[levelOf(b)].rank - LEVELS[levelOf(a)].rank || (b.n ?? 0) - (a.n ?? 0)
    : (b.n ?? 0) - (a.n ?? 0) || LEVELS[levelOf(b)].rank - LEVELS[levelOf(a)].rank);
  const tabs = [['all', 'All', all.length], ...Object.keys(CATS).filter(c => counts[c]).map(c => [c, CATS[c].label, counts[c]])];
  const whose = state.dog ? 'Harm to dogs' : 'Harm to people';
  const catName = state.cat === 'all' ? 'documented hazards' : CATS[state.cat].label.toLowerCase();
  const sightLine = h => h.n == null ? esc(h.stateNote) : `${h.n.toLocaleString()} sighting${h.n === 1 ? '' : 's'} within 10 mi`;
  return header() + band(all.length) + `
    <nav class="tabs" aria-label="Categories"><div class="wrap" role="tablist">${tabs.map(([k, l, n]) => `<button class="tab" role="tab" aria-selected="${state.cat === k}" data-act="cat" data-id="${k}">${l}<span>${n}</span></button>`).join('')}</div></nav>
    <main class="guide">
      ${state.fromPack ? `<div class="advisory offline" role="status">${icon('download')}<p><b>Offline pack.</b> Showing what you saved on ${fmtDate(state.fromPack)}. Reconnect to check for newer sightings.</p></div>` : ''}
      <div class="advisory" role="note">${icon('warn')}<p><b>Seasonal advisory.</b> ${esc(advisoryFor(p, all))}</p></div>
      <div class="toolbar"><div><p class="eyebrow plain">Near this location</p><h2>${list.length} ${catName}</h2></div>
        <div class="tools">
          <button class="toggle" role="switch" aria-checked="${state.dog}" data-act="dog"><span class="sw" aria-hidden="true"></span>${icon('dog')} Hiking with a dog</button>
          <label class="sr" for="sort">Sort</label>
          <select id="sort" class="select"><option value="risk"${state.sort === 'risk' ? ' selected' : ''}>Highest risk first</option><option value="common"${state.sort === 'common' ? ' selected' : ''}>Most sightings first</option></select>
          <button class="chip" data-act="map" aria-pressed="${state.map}">${icon('pin')} ${state.map ? 'Hide map' : 'Show map'}</button>
        </div></div>
      ${state.dog ? `<p class="petnote">${icon('dog')} Harm levels now show the risk to dogs, with dog-specific advice on each card.</p>` : ''}
      ${state.map ? `<div class="map live"><div id="leaflet" role="region" aria-label="Map of sightings near ${esc(p.short)}"></div>
        <div class="legend"><span><i style="background:var(--pin-red)"></i>Critical / severe</span><span><i style="background:var(--pin-gold)"></i>High / moderate</span><b>Latest ${state.guide.points.length} sightings · some locations blurred to protect wildlife</b></div></div>` : ''}
      <div class="list">${list.map(h => `<button class="hz" data-act="hazard" data-id="${h.id}">
          <span class="cat cat-${h.cat}">${hzArt(h)}${CATS[h.cat].one}</span>
          <span class="body"><span class="eyebrow">${CATS[h.cat].one}</span><h3>${esc(h.name)}</h3><span class="latin">${esc(h.latin)}</span>
            <p class="sum">${esc(h.sum)}</p>${state.dog ? `<span class="petline">${icon('dog')}<span>${esc(h.dog)}</span></span>` : ''}</span>
          <span class="side">${harm(levelOf(h), whose)}<span class="common">${sightLine(h)}</span>${icon('chev', 'chev')}</span>
        </button>`).join('')}</div>
      <div class="scale" aria-label="Harm scale">${Object.entries(LEVELS).map(([k, v]) => `<div>${harm(k)}<div>${v.means}</div></div>`).join('')}</div>
      <p class="disclaimer">${icon('shield')} Never handle or eat unknown species. In an emergency, call 911 or Poison Control. Sightings: <a href="https://www.inaturalist.org/observations?${new URLSearchParams({ lat: p.lat, lng: p.lng, radius: RADIUS_KM, quality_grade: 'research' })}" target="_blank" rel="noopener">iNaturalist</a> research-grade records. Harm levels are educational guidance, not medical advice.</p>
    </main>` + sos();
}
const sos = () => `<button class="sos" data-act="sos">${icon('phone')} Emergency</button>`;

function savedScreen() {
  const all = Object.entries(packs()).sort((a, b) => b[1].savedAt - a[1].savedAt);
  return header() + `<main class="wrap saved">
    <button class="backlink" data-act="${state.place ? 'back-guide' : 'start'}">${icon('back')} ${state.place ? 'Back to guide' : 'Find a place'}</button>
    <p class="eyebrow" style="margin-top:12px">On this device</p><h1 class="display small">Saved places</h1>
    <p class="lede">Offline packs keep a place’s field guide, photos and illustrations on your phone, so they work without signal. Maps need a connection.</p>
    ${all.length ? `<div class="packs">${all.map(([k, pk]) => `<div class="pack">
        <div><b>${esc(pk.place.name)}</b><small>${hazardList(pk.guide).length} hazards · saved ${fmtDate(pk.savedAt)}</small></div>
        <div class="pack-actions"><button class="btn primary" data-act="open-pack" data-k="${k}">Open</button>
          ${state.online ? `<button class="btn" data-act="update-pack" data-k="${k}">Update</button>` : ''}
          <button class="btn" data-act="remove-pack" data-k="${k}" aria-label="Remove ${esc(pk.place.name)}">Remove</button></div>
      </div>`).join('')}</div><p class="fine" id="storage"></p>`
    : `<div class="state-card">${icon('download')}<div><b>No saved places yet.</b><p>Open any place and tap “Save for offline” before you lose signal on the trail.</p>
        <div class="cta" style="margin-top:14px"><button class="btn primary" data-act="start">Find a place ${icon('arrow')}</button></div></div></div>`}
    <div class="install-tip">${icon('check')}<p><b>Add it to your home screen</b> so saved packs stay on your phone. On iPhone, tap Share, then “Add to Home Screen.” On Android, tap the menu, then “Install app.”</p></div>
  </main>`;
}

function render() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  const app = document.getElementById('app');
  app.innerHTML = ({ welcome, login, locate, guide: guideScreen, saved: savedScreen })[state.screen]();
  if (state.screen === 'locate') bindSearch();
  if (state.screen === 'guide' && state.guide) {
    const s = document.getElementById('sort'); if (s) s.onchange = e => { state.sort = e.target.value; render(); };
    if (state.map) drawMap();
  }
  if (state.screen === 'saved') showStorage();
}
async function showStorage() {
  const el = document.getElementById('storage');
  if (!el || !navigator.storage?.estimate) return;
  const { usage } = await navigator.storage.estimate();
  el.textContent = `Using about ${(usage / 1048576).toFixed(1)} MB on this device.`;
}

// ---------- maps ----------
// The welcome card keeps the illustrated map; the guide uses a real map with real sighting points.
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mapSVG(r, list) {
  const W = 1000, Hh = 340, cx = 470, cy = 175;
  let s = `<svg viewBox="0 0 ${W} ${Hh}"><rect width="${W}" height="${Hh}" fill="var(--map-land)"/><path d="M830 0H1000V340H760Z" fill="var(--map-water)"/>`;
  s += `<g fill="none" stroke="var(--map-trail)" stroke-width="16" stroke-linecap="round"><path d="M-20 262C 220 240, 460 200, 1020 120"/><path d="M300 -20C 430 80, 640 210, 840 360"/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="118" fill="none" stroke="var(--map-ring)" stroke-opacity=".55" stroke-dasharray="3 5"/>`;
  list.forEach((h, i) => {
    const k = hash(h.id + r.name), a = (i / list.length) * Math.PI * 2 + (k % 60) / 100, d = 120 + (k % 170);
    const x = Math.max(70, Math.min(W - 70, cx + Math.cos(a) * d * 1.5)), y = Math.max(46, Math.min(Hh - 92, cy + Math.sin(a) * d * 0.62));
    const rx = 52 + (k >> 4) % 46, color = LEVELS[h.level].rank >= 3 ? 'var(--pin-red)' : 'var(--pin-gold)';
    s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * .62}" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".55" stroke-dasharray="4 4"/><circle cx="${x}" cy="${y}" r="15" fill="${color}"/><g transform="translate(${x - 9} ${y - 9}) scale(.75)" fill="none" stroke="var(--card)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${ICONS[IC[h.id] || h.cat]}</g>`;
  });
  return s + `<circle cx="${cx}" cy="${cy}" r="14" fill="var(--terra)" fill-opacity=".2"/><circle cx="${cx}" cy="${cy}" r="6" fill="var(--terra)" stroke="var(--card)" stroke-width="2"/></svg>`;
}
function drawMap() {
  const el = document.getElementById('leaflet');
  if (!el) return;
  if (!window.L || !state.online) { el.innerHTML = `<div class="map-off">${icon('pin')}<span>${state.online ? 'The map couldn’t load.' : 'Maps need a connection. Your saved field guide still works.'}</span></div>`; return; }
  const p = state.place, css = getComputedStyle(document.documentElement);
  const red = css.getPropertyValue('--pin-red').trim(), gold = css.getPropertyValue('--pin-gold').trim(), terra = css.getPropertyValue('--terra').trim();
  leafletMap = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([p.lat, p.lng], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Sightings <a href="https://www.inaturalist.org">iNaturalist</a>',
  }).addTo(leafletMap);
  L.circle([p.lat, p.lng], { radius: RADIUS_KM * 1000, color: '#5a6a61', weight: 1.2, dashArray: '3 6', fill: false }).addTo(leafletMap);
  const visible = new Set(state.cat === 'all' ? Object.keys(H) : Object.keys(H).filter(id => H[id].cat === state.cat));
  for (const pt of state.guide.points) {
    if (!visible.has(pt.id)) continue;
    const h = H[pt.id], color = LEVELS[levelOf(h)].rank >= 3 ? red : gold;
    L.circleMarker([pt.lat, pt.lng], { radius: 6.5, color: '#fffef9', weight: 1.5, fillColor: color, fillOpacity: .9 })
      .bindTooltip(`${h.name}${pt.date ? ` · ${pt.date}` : ''}${pt.blurred ? ' · location blurred' : ''}`)
      .on('click', () => open('hazard', pt.id)).addTo(leafletMap);
  }
  L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fffef9', weight: 2.5, fillColor: terra, fillOpacity: 1 }).bindTooltip(p.short).addTo(leafletMap);
}

// ---------- sheets ----------
function open(kind, data) { lastFocus = document.activeElement; sheet = { kind, data }; renderSheet(); }
function closeSheet() {
  stopCamera();
  sheet = null; document.getElementById('layer').innerHTML = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
function renderSheet() {
  if (!sheet) return;
  const body = ({ hazard: hazardSheet, camera: cameraSheet, sos: sosSheet, ask: askSheet })[sheet.kind](sheet.data);
  const layer = document.getElementById('layer');
  layer.innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet ${['camera', 'ask'].includes(sheet.kind) ? '' : 'wide'}" data-kind="${sheet.kind}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
    <button class="close${sheet.kind === 'hazard' ? ' on-photo' : ''}" data-act="close" aria-label="Close">${icon('close')}</button>${body}</div></div>`;
  layer.querySelector('.sheet').focus({ preventScroll: true });
  if (sheet.kind === 'camera' && cam.stream) { const v = document.getElementById('cam-video'); if (v) { v.srcObject = cam.stream; v.play().catch(() => {}); } }
}

function hazardSheet(id) {
  const h = { id, ...H[id] }, ph = PHOTOS[id];
  const near = state.guide && hazardList(state.guide).find(x => x.id === id);
  const photo = ph ? `<figure class="photo"><img src="photos/${id}.jpg"${focus(id)} alt="${esc(PHOTO_NOTE[id] || 'Photo of ' + h.name)}">
    <figcaption>${PHOTO_NOTE[id] ? esc(PHOTO_NOTE[id]) + ' · ' : ''}Photo: <a href="${ph.url}" target="_blank" rel="noopener">${esc(ph.by)}, ${esc(ph.lic)}</a></figcaption></figure>` : '';
  const howCommon = near ? (near.n == null ? esc(near.stateNote) : `${cap(near.tier)} · ${near.n.toLocaleString()} sighting${near.n === 1 ? '' : 's'} within 10 mi`) : 'Documented nearby';
  return `${photo}<p class="eyebrow">${CATS[h.cat].one}</p><h2 id="sheet-title">${esc(h.name)}</h2><p class="latin">${esc(h.latin)}</p>
    <p class="lead">${esc(h.sum)}</p>
    <div class="facts"><div>${harm(h.level, 'Harm to people')}</div><div>${harm(h.pet, 'Harm to dogs')}</div>
      <div><div class="k">How common here</div><div class="v">${howCommon}</div></div><div><div class="k">When</div><div class="v">${esc(h.season)}</div></div></div>
    <div class="sec"><h3>Where it’s found</h3><p>${esc(h.where)}</p></div>
    <div class="sec"><h3>What to look for, from a distance</h3><p>${esc(h.look)}</p></div>
    <div class="sec"><h3>How to stay clear</h3><p>${esc(h.avoid)}</p></div>
    <div class="sec alert"><h3>If someone is exposed</h3><ol class="steps">${h.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <div class="sec dog"><h3>${icon('dog')} With a dog</h3><p>${esc(h.dog)}</p></div>
    <div class="sec"><h3>Often confused with</h3><p>${esc(h.confused)}</p></div>
    <div class="actions"><button class="btn primary" data-act="sos">${icon('phone')} Emergency numbers</button><button class="btn" data-act="close">Back to guide</button></div>`;
}

function sosSheet() {
  return `<p class="eyebrow" style="color:var(--sev-critical)">Emergency</p><h2 id="sheet-title">Get help now</h2>
    <p class="lead">Say what happened, when, what was involved, and the person’s age and weight. Have this guide’s entry open if you can.</p>
    <div class="numbers">
      ${numRow('Emergency services', '911', 'Bites from venomous snakes, trouble breathing, seizures, collapse', true)}
      ${numRow('Poison Control', '1-800-222-1222', 'Plants, mushrooms, berries, stings. Free, 24 hours, U.S.')}
      ${numRow('ASPCA Animal Poison Control', '(888) 426-4435', 'For pets. A consultation fee may apply.')}
    </div>
    <p class="fine">Out of signal? Text 911 where available, or move to higher ground and try again.</p>`;
}
function numRow(name, n, note, first) {
  const tel = n.replace(/[^\d]/g, '');
  return `<div class="num${first ? ' first' : ''}"><b>${name}</b><span class="n">${n}</span><small>${note}</small>
    <span class="go"><a class="btn${first ? ' primary' : ''}" href="tel:${tel}">${icon('phone')} Call</a><button class="btn" data-act="copy" data-n="${n}" aria-label="Copy ${name} number">${icon('copy')}</button></span></div>`;
}

// Permission explainers: what we'll use, why, and what leaves the phone, before the browser asks.
function askSheet(kind) {
  if (kind === 'gps') return `<div class="camhead"><div class="badge">${icon('crosshair')}</div><p class="eyebrow">Your location</p><h2 id="sheet-title">Find hazards around you</h2>
    <p class="lead">We use your location once, to look up sightings within 10 miles. Your coordinates are sent to iNaturalist and OpenStreetMap to find sightings and your town’s name, and aren’t stored or shared anywhere else.</p></div>
    <div class="actions"><button class="btn primary" data-act="gps-go">${icon('crosshair')} Use my location</button><button class="btn" data-act="close">Not now</button></div>
    <p class="fine">Your phone will ask for permission next. You can always search for a place instead.</p>`;
  if (kind === 'gps-denied') return `<div class="camhead"><div class="badge">${icon('warn')}</div><p class="eyebrow">Location is off</p><h2 id="sheet-title">We couldn’t get your location</h2>
    <p class="lead">${esc(sheet.msg || 'Location access was blocked.')} To turn it on, allow location for this site in your browser settings, then try again. Or search for a place instead.</p></div>
    <div class="actions"><button class="btn primary" data-act="close-focus-search">Search for a place</button><button class="btn" data-act="gps-go">Try again</button></div>`;
  if (kind === 'cam') return `<div class="camhead"><div class="badge">${icon('camera')}</div><p class="eyebrow">Camera</p><h2 id="sheet-title">Compare from a safe distance</h2>
    <p class="lead">The camera shows a guide ring to help you keep 6+ feet away. Photos stay on your phone: nothing is uploaded, and the guide never identifies anything as safe.</p></div>
    <div class="actions"><button class="btn primary" data-act="cam-allow">${icon('camera')} Turn on camera</button><label class="btn" for="cam-input">Choose a photo instead</label></div>
    <p class="fine">Your phone will ask for camera permission next.</p>`;
  return '';
}

function cameraSheet() {
  const p = state.place, all = state.guide ? hazardList(state.guide) : [];
  const head = `<div class="camhead"><div class="badge">${icon('camera')}</div><p class="eyebrow">Safe-distance camera</p><h2 id="sheet-title">Compare to this area’s guide</h2>
    <p class="lead">Stay at least 6 feet away. Take a clear photo without touching, moving or provoking anything.</p></div>`;
  if (cam.stage === 'result') {
    const pool = all.filter(h => !cam.cat || h.cat === cam.cat).sort((a, b) => LEVELS[levelOf(b)].rank - LEVELS[levelOf(a)].rank);
    return `<p class="eyebrow">Compared with ${esc(p.short)}</p><h2 id="sheet-title">${pool.length ? `Documented ${cam.cat ? CATS[cam.cat].label.toLowerCase() : 'hazards'} near here` : 'Nothing in this group documented here'}</h2>
      <div class="matchwarn">${icon('warn')}<p><b>Treat it as dangerous.</b> Compare your photo with these documented within 10 miles. This guide can’t confirm what you found, and nothing here means something is safe to touch or eat.</p></div>
      ${cam.url ? `<img class="yourphoto" src="${cam.url}" alt="Your photo">` : ''}
      ${pool.map(h => `<button class="match" data-act="hazard" data-id="${h.id}"><img class="thumb" src="photos/${h.id}.jpg"${focus(h.id)} alt="">
        <span><b>${esc(h.name)}</b><span class="why">${esc(h.look)}</span></span>${harm(levelOf(h))}</button>`).join('')}
      ${!pool.length ? '<p class="lead">That doesn’t make it safe. Keep your distance and don’t touch or eat it.</p>' : ''}
      <div class="actions"><button class="btn primary" data-act="sos">${icon('phone')} Someone was exposed</button><button class="btn" data-act="cam-reset">Compare another</button></div>`;
  }
  const cats = [...new Set(all.map(h => h.cat))];
  const finder = cam.live && !cam.url
    ? `<div class="viewfinder live"><video id="cam-video" playsinline muted autoplay></video><span class="ring"></span><span class="label">KEEP 6+ FEET AWAY</span>
        <button class="shutter" data-act="cam-shoot" aria-label="Take photo"></button></div>`
    : `<label class="viewfinder" for="cam-input" style="cursor:pointer">${cam.url ? `<img src="${cam.url}" alt="Your photo">` : `<span class="empty">${icon('camera')}<span>Tap to take or choose a photo</span></span>`}
        <span class="ring"></span><span class="label">KEEP 6+ FEET AWAY</span></label>`;
  return head + finder + (cam.error ? `<p class="notice">${esc(cam.error)}</p>` : '') + `
    <p class="q">What is it? <small>Pick the closest group</small></p>
    <div class="chips">${cats.map(c => `<button class="chip" data-act="cam-cat" data-id="${c}" aria-pressed="${cam.cat === c}">${icon(c)} ${CATS[c].ask}</button>`).join('')}</div>
    <div class="actions">${cam.url ? `<button class="btn" data-act="cam-retake">${icon('camera')} Retake</button>` : cam.live ? `<label class="btn" for="cam-input">Choose a photo instead</label>` : `<label class="btn primary" for="cam-input">${icon('camera')} Open camera or choose photo</label>`}
      <button class="btn${cam.url || cam.cat ? ' primary' : ''}" data-act="cam-run" ${cam.cat ? '' : 'disabled'}>Compare ${icon('arrow')}</button></div>
    <p class="fine">Photos stay on your phone. The guide shows what’s documented nearby to compare against; it doesn’t identify species.</p>`;
}

async function startCamera() {
  cam.error = '';
  if (!navigator.mediaDevices?.getUserMedia) { cam.live = false; return renderSheet(); }
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    cam.live = true; save(STORE.seenCam, true);
  } catch (e) {
    cam.live = false;
    cam.error = e?.name === 'NotAllowedError' ? 'Camera access is blocked. You can still choose a photo, or allow the camera for this site in your browser settings.' : 'The camera isn’t available. You can still choose a photo.';
  }
  sheet = { kind: 'camera' }; renderSheet();
}
function stopCamera() { cam.stream?.getTracks().forEach(t => t.stop()); cam.stream = null; }
function shoot() {
  const v = document.getElementById('cam-video');
  if (!v?.videoWidth) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(b => { if (!b) return; setPhoto(b); stopCamera(); }, 'image/jpeg', .9);
}
function setPhoto(blob) { if (cam.url) URL.revokeObjectURL(cam.url); cam.file = blob; cam.url = URL.createObjectURL(blob); cam.stage = 'capture'; renderSheet(); }
function resetCam() { stopCamera(); if (cam.url) URL.revokeObjectURL(cam.url); Object.assign(cam, { file: null, url: null, cat: null, stage: 'capture', live: false, error: '' }); }

// ---------- navigation ----------
function go(screen) { state.screen = screen; render(); window.scrollTo(0, 0); }
function remember(place) {
  const list = load(STORE.recent, []).filter(p => placeKey(p) !== placeKey(place));
  save(STORE.recent, [place, ...list].slice(0, 4));
}
async function openPlace(place, { packOnly = false } = {}) {
  guideCtl?.abort(); guideCtl = new AbortController();
  Object.assign(state, { place, guide: null, error: '', fromPack: null, cat: 'all', loading: true, results: null, searchMsg: '' });
  remember(place);
  history.replaceState(null, '', `?${new URLSearchParams({ at: `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`, name: place.name, st: place.state || '', s: place.sample || '' })}`);
  go('guide');
  const pk = packs()[placeKey(place)];
  if (packOnly || (!navigator.onLine && pk)) { Object.assign(state, { guide: pk.guide, fromPack: pk.savedAt, loading: false }); return render(); }
  try {
    const g = await fetchGuide(place, guideCtl.signal);
    Object.assign(state, { guide: g, loading: false });
    if (pk) savePack(place, g);   // keep saved packs fresh whenever the place is opened online
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (pk) Object.assign(state, { guide: pk.guide, fromPack: pk.savedAt, loading: false });
    else Object.assign(state, { loading: false, error: navigator.onLine ? 'iNaturalist didn’t respond. This usually clears up in a minute.' : 'You’re offline, and this place isn’t saved for offline use.' });
  }
  if (state.screen === 'guide' && state.place === place) render();
}
function samplePlace(id) { const s = SAMPLES[id]; return { name: s.name, short: s.short, lat: s.lat, lng: s.lng, state: s.state, sample: id }; }

function bindSearch() {
  document.getElementById('search-form').onsubmit = async e => {
    e.preventDefault();
    const q = document.getElementById('q').value.trim(); state.search = q;
    if (!q) return;
    if (!navigator.onLine) { state.searchMsg = 'Search needs a connection. Open a saved place instead.'; return render(); }
    state.busy = true; state.searchMsg = ''; state.results = null; render();
    try {
      const list = await searchPlaces(q);
      state.busy = false;
      if (list.length === 1) return openPlace(list[0]);
      state.results = list;
      state.searchMsg = list.length ? '' : (/^\d+$/.test(q) && q.length !== 5 ? 'ZIP codes have 5 digits.' : `We couldn’t find “${q}.” Try a town, park, trail or ZIP code in the U.S.`);
    } catch {
      state.busy = false; state.searchMsg = 'Search isn’t responding right now. Try again in a moment, or use your location.';
    }
    render(); document.getElementById('q')?.focus();
  };
}
function locateMe() {
  if (!navigator.geolocation) { sheet = { kind: 'ask', data: 'gps-denied', msg: 'This browser can’t share location.' }; return renderSheet(); }
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition(async pos => {
    save(STORE.seenGps, true); closeSheet();
    const place = await reverse(pos.coords.latitude, pos.coords.longitude);
    openPlace(place);
  }, err => {
    const msg = err.code === 1 ? 'Location access was blocked.' : err.code === 3 ? 'Finding your location took too long.' : 'Your location isn’t available right now.';
    sheet = { kind: 'ask', data: 'gps-denied', msg }; lastFocus = lastFocus || document.activeElement; renderSheet();
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  if (act === 'scrim') { if (e.target === t) closeSheet(); return; }
  switch (act) {
    case 'home': return go('welcome');
    case 'login': return go('login');
    case 'start': closeSheet(); state.results = null; state.searchMsg = ''; return go('locate');
    case 'saved': closeSheet(); return go('saved');
    case 'back-guide': return go('guide');
    case 'sample': return openPlace(samplePlace(id));
    case 'pick': return openPlace(state.results[+t.dataset.i]);
    case 'recent': return openPlace(load(STORE.recent, [])[+t.dataset.i]);
    case 'gps': if (load(STORE.seenGps, false)) return locateMe(); return open('ask', 'gps');
    case 'gps-go': return locateMe();
    case 'close-focus-search': closeSheet(); return document.getElementById('q')?.focus();
    case 'retry': return openPlace(state.place);
    case 'cat': state.cat = id; render(); return document.querySelector(`.tab[data-id="${id}"]`)?.focus();
    case 'dog': state.dog = !state.dog; render(); return document.querySelector('[data-act="dog"]')?.focus();
    case 'map': state.map = !state.map; render(); return document.querySelector('[data-act="map"]')?.focus();
    case 'offline': {
      const k = placeKey(state.place);
      if (packs()[k]) { removePack(k); render(); return toast('Removed the offline pack.'); }
      await savePack(state.place, state.guide); render();
      return toast(`Saved ${state.place.short} for offline use.`);
    }
    case 'open-pack': return openPlace(packs()[t.dataset.k].place, { packOnly: !navigator.onLine });
    case 'update-pack': { const pk = packs()[t.dataset.k]; toast('Updating…'); try { await savePack(pk.place, await fetchGuide(pk.place)); toast(`Updated ${pk.place.short}.`); } catch { toast('Couldn’t update right now. Try again later.'); } return render(); }
    case 'remove-pack': removePack(t.dataset.k); render(); return toast('Removed.');
    case 'hazard': return open('hazard', id);
    case 'sos': return open('sos');
    case 'camera': resetCam(); if (!state.guide) return toast('Wait for the guide to load first.');
      if (navigator.mediaDevices?.getUserMedia && !load(STORE.seenCam, false)) return open('ask', 'cam');
      lastFocus = document.activeElement; return startCamera();
    case 'cam-allow': return startCamera();
    case 'cam-shoot': return shoot();
    case 'cam-retake': if (cam.url) URL.revokeObjectURL(cam.url); cam.url = null; cam.file = null; return startCamera();
    case 'close': return closeSheet();
    case 'cam-cat': cam.cat = cam.cat === id ? null : id; return renderSheet();
    case 'cam-run': stopCamera(); cam.stage = 'result'; return renderSheet();
    case 'cam-reset': resetCam(); return startCamera();
    case 'copy': {
      const n = t.dataset.n;
      try { await navigator.clipboard.writeText(n); toast(`Copied ${n}`); }
      catch { const el = t.closest('.num').querySelector('.n'); getSelection().selectAllChildren(el); toast('Number selected. Copy it from here.'); }
      return;
    }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) closeSheet(); });
document.getElementById('cam-input').addEventListener('change', e => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  stopCamera(); cam.live = false;
  if (!sheet || sheet.kind !== 'camera') sheet = { kind: 'camera' };
  setPhoto(f);
});
addEventListener('online', () => { state.online = true; render(); });
addEventListener('offline', () => { state.online = false; render(); });

// ---------- start ----------
// A shared link (?at=lat,lng&name=...) opens straight to that place's guide.
(() => {
  const q = new URLSearchParams(location.search), at = q.get('at');
  if (at) {
    const [lat, lng] = at.split(',').map(Number);
    if (isFinite(lat) && isFinite(lng)) return openPlace({ name: q.get('name') || 'Shared place', short: (q.get('name') || 'Shared place').split(',')[0], lat, lng, state: q.get('st') || '', sample: q.get('s') || undefined });
  }
  render();
})();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
