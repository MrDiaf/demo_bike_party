(function () {
  'use strict';

  const DATA = window.CYCLEFEST;
  const ROUND_COLORS = ['var(--r1)', 'var(--r2)', 'var(--r3)'];
  const ROUND_HEX = ['#e4572e', '#2e86de', '#8e44ad'];
  const BIKE_ROUTER = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/';
  const STORE_KEY = 'cyclefest-group';

  const $ = (id) => document.getElementById(id);
  const groupIds = Object.keys(DATA.groups).sort((a, b) => a.slice(1) - b.slice(1));

  let current = null;     // selected group id
  let myPosition = null;  // [lat, lon] once the user presses "Where am I?"
  let allRound = 0;       // round shown in the "All parties" tab

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function telLinks(phone) {
    // "Joel: +46 73 826 62 01; Meron: ..." or "0739132274 (Haniye), +46 ..." -> clickable numbers
    return esc(phone).replace(/\+?\d[\d ]{6,}\d/g, (n) => `<a href="tel:${n.replace(/ /g, '')}">${n}</a>`);
  }
  function place(addr) { return DATA.places[addr]; }

  function getStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function setStored(v) { try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode */ } }

  // Where is group g in each round? Reports conflicts present in the source schedule.
  function stopsFor(g) {
    return DATA.rounds.map((r, i) => {
      const hosting = r.parties.find((p) => p.host === g);
      const visiting = r.parties.filter((p) => p.guests.includes(g));
      const party = hosting || visiting[0] || null;
      return {
        index: i, round: r, party,
        role: hosting ? 'host' : visiting.length ? 'guest' : 'free',
        conflict: (hosting ? 1 : 0) + visiting.length > 1 ? [hosting, ...visiting].filter(Boolean) : null,
      };
    });
  }

  // Which round is happening now / next, by time of day.
  function timeState() {
    const t = nowMin();
    const rs = DATA.rounds.map((r) => ({ s: toMin(r.start), e: toMin(r.end) }));
    if (t < 4 * 60) return { phase: 'after' }; // after midnight the party is over
    for (let i = 0; i < rs.length; i++) {
      if (t < rs[i].s) return { phase: i === 0 ? 'before' : 'travel', next: i, minsLeft: rs[i].s - t };
      if (t < rs[i].e) return { phase: 'during', now: i, next: i + 1 < rs.length ? i + 1 : null, minsLeft: rs[i].e - t };
    }
    return { phase: 'after' };
  }

  function directionsUrl(from, to) {
    const a = from ? `${from[0]},${from[1]}` : '';
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_bike&route=${encodeURIComponent(a + ';' + to.lat + ',' + to.lon)}`;
  }
  function geoUrl(addr) {
    const p = place(addr);
    return `geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}(${encodeURIComponent(addr)})`;
  }

  // ---------- map ----------
  const map = L.map('map', { zoomControl: true }).setView([63.8155, 20.31], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let meMarker = null;
  let routeToken = 0;

  function pinIcon(label, color, small) {
    return L.divIcon({
      className: '',
      html: `<div class="pin${small ? ' small' : ''}" style="background:${color}"><span>${esc(label)}</span></div>`,
      iconSize: small ? [22, 22] : [30, 30],
      iconAnchor: small ? [11, 22] : [15, 30],
      popupAnchor: [0, -28],
    });
  }

  async function bikeRoute(points) {
    const coords = points.map((p) => `${p[1]},${p[0]}`).join(';');
    const res = await fetch(`${BIKE_ROUTER}${coords}?overview=full&geometries=geojson`);
    if (!res.ok) throw new Error('route ' + res.status);
    const json = await res.json();
    if (json.code !== 'Ok') throw new Error(json.code);
    return json.routes[0];
  }

  function drawMine() {
    layer.clearLayers();
    const stops = stopsFor(current).filter((s) => s.party);
    const pts = [];
    stops.forEach((s) => {
      const p = place(s.party.address);
      const latlng = [p.lat, p.lon];
      pts.push(latlng);
      L.marker(latlng, { icon: pinIcon(String(s.index + 1), ROUND_HEX[s.index]) })
        .bindPopup(`<b>${esc(s.round.name)} · ${esc(s.round.start)}</b><br>${esc(s.party.address)}<br>Host: ${esc(s.party.host)}`)
        .addTo(layer);
    });
    const info = $('route-info');
    info.hidden = true;
    if (pts.length > 1) {
      const fallback = L.polyline(pts, { color: '#888', weight: 3, dashArray: '6 8' }).addTo(layer);
      const token = ++routeToken;
      bikeRoute(pts).then((r) => {
        if (token !== routeToken) return;
        layer.removeLayer(fallback);
        L.geoJSON(r.geometry, { style: { color: ROUND_HEX[0], weight: 5, opacity: 0.75 } }).addTo(layer);
        info.textContent = `Whole route by bike: ${(r.distance / 1000).toFixed(1)} km, about ${Math.round(r.duration / 60)} min of cycling.`;
        info.hidden = false;
      }).catch(() => { /* keep the dashed straight line */ });
    }
    fitTo(pts);
  }

  function drawAll(ri) {
    layer.clearLayers();
    routeToken++;
    $('route-info').hidden = true;
    const pts = [];
    DATA.rounds[ri].parties.forEach((p) => {
      const pl = place(p.address);
      pts.push([pl.lat, pl.lon]);
      const mine = p.host === current || p.guests.includes(current);
      L.marker([pl.lat, pl.lon], { icon: pinIcon(p.host.slice(1), mine ? ROUND_HEX[ri] : '#777', !mine), zIndexOffset: mine ? 1000 : 0 })
        .bindPopup(`<b>${esc(p.address)}</b><br>Host ${esc(p.host)} · Guests ${esc(p.guests.join(', '))}`)
        .addTo(layer);
    });
    fitTo(pts);
  }

  function fitTo(pts) {
    const all = myPosition ? pts.concat([myPosition]) : pts;
    if (all.length === 1) map.setView(all[0], 16);
    else if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 16 });
  }

  function focusStop(addr) {
    const p = place(addr);
    map.setView([p.lat, p.lon], 17);
    layer.eachLayer((l) => {
      if (l.getLatLng && l.getLatLng().lat === p.lat && l.getLatLng().lng === p.lon) l.openPopup();
    });
    if (window.innerWidth < 900) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // "Where am I?": blue dot + bike route from here to the next stop
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Your browser cannot share your location.'); return; }
    $('locate').textContent = '📍 Locating…';
    navigator.geolocation.getCurrentPosition((pos) => {
      $('locate').textContent = '📍 Where am I?';
      myPosition = [pos.coords.latitude, pos.coords.longitude];
      if (meMarker) map.removeLayer(meMarker);
      meMarker = L.marker(myPosition, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) })
        .bindPopup('You are here').addTo(map);
      routeFromMe();
      render();
    }, (err) => {
      $('locate').textContent = '📍 Where am I?';
      alert('Could not get your location: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 15000 });
  });

  function routeFromMe() {
    const target = nextStop();
    if (!myPosition || !target) return;
    const p = place(target.party.address);
    const token = ++routeToken;
    layer.clearLayers();
    L.marker([p.lat, p.lon], { icon: pinIcon(String(target.index + 1), ROUND_HEX[target.index]) })
      .bindPopup(`<b>${esc(target.party.address)}</b>`).addTo(layer);
    bikeRoute([myPosition, [p.lat, p.lon]]).then((r) => {
      if (token !== routeToken) return;
      L.geoJSON(r.geometry, { style: { color: ROUND_HEX[target.index], weight: 6, opacity: 0.8 } }).addTo(layer);
      $('route-info').textContent = `From you to ${target.party.address}: ${(r.distance / 1000).toFixed(1)} km, about ${Math.max(1, Math.round(r.duration / 60))} min by bike.`;
      $('route-info').hidden = false;
    }).catch(() => {
      L.polyline([myPosition, [p.lat, p.lon]], { color: '#888', weight: 3, dashArray: '6 8' }).addTo(layer);
    });
    fitTo([[p.lat, p.lon]]);
  }

  $('fit').addEventListener('click', () => ($('all').hidden ? drawMine() : drawAll(allRound)));

  // The stop the user should head to now (current round if it's on, else the next one with a party).
  function nextStop() {
    const stops = stopsFor(current);
    const ts = timeState();
    const order = ts.phase === 'during' ? [ts.now, ts.next] : ts.phase === 'after' ? [] : [ts.next];
    for (let i = order[0] ?? 99; i < stops.length; i++) if (stops[i].party) return stops[i];
    return null;
  }

  // ---------- rendering ----------
  function peopleList(party) {
    return [party.host, ...party.guests].map((g) => {
      const info = DATA.groups[g];
      const tag = g === party.host ? ' ⭐ host' : '';
      return `<li><span class="g">${esc(g)}${tag}</span> — ${esc(info.members)}<br><span class="diet">${esc(info.notes)}</span></li>`;
    }).join('');
  }

  function stopCard(s, prev, ts) {
    const color = ROUND_COLORS[s.index];
    let state = '';
    if (ts.phase === 'during' && ts.now === s.index) state = 'now';
    else if (ts.phase !== 'after' && ts.phase !== 'during' && ts.next === s.index) state = 'next';
    else if (ts.phase === 'during' && s.index < ts.now) state = 'past';
    else if ((ts.phase === 'travel') && s.index < ts.next) state = 'past';
    else if (ts.phase === 'after') state = 'past';
    const badge = state === 'now' ? '<span class="badge now">Now</span>' : state === 'next' ? '<span class="badge next">Next</span>' : '';

    let body;
    if (!s.party) {
      body = '<p class="free">Your group is not listed in this round. Free time, or check with the organisers.</p>';
    } else {
      const host = DATA.groups[s.party.host];
      const p = place(s.party.address);
      const from = prev && prev.party ? [place(prev.party.address).lat, place(prev.party.address).lon] : myPosition;
      body = `
        <p class="role">${s.role === 'host' ? '⭐ You are hosting at' : `Go to ${esc(s.party.host)}'s place`}</p>
        <p class="addr">${esc(s.party.address)} ${p.exact ? '' : '<span class="approx">approx. pin</span>'}</p>
        ${host.details ? `<p class="details"><strong>Entry:</strong> ${esc(host.details)}</p>` : ''}
        <p class="details"><strong>Host phone:</strong> ${telLinks(host.phone)}</p>
        ${s.conflict ? `<div class="warn">⚠ The schedule lists your group in ${s.conflict.length} places this round (${s.conflict.map((c) => esc(c.host === current ? 'hosting' : 'guest at ' + c.host)).join(', ')}). Check with the organisers.</div>` : ''}
        <ul class="people">${peopleList(s.party)}</ul>
        <div class="actions">
          <button class="btn primary" type="button" data-focus="${esc(s.party.address)}">🗺 Show on map</button>
          <a class="btn" href="${directionsUrl(from, p)}" target="_blank" rel="noopener">🚲 Bike directions</a>
          <a class="btn" href="${geoUrl(s.party.address)}">📱 Map app</a>
        </div>`;
    }
    return `<article class="card ${state ? 'is-' + state : ''}" style="--round-color:${color}">
      <div class="card-head"><h3>${esc(s.round.name)} ${badge}</h3><span class="time">${esc(s.round.start)}–${esc(s.round.end)}</span></div>
      ${body}
    </article>`;
  }

  function banner(ts) {
    const stops = stopsFor(current);
    const el = $('now-banner');
    const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
    if (ts.phase === 'after') {
      el.innerHTML = '<div class="label">Cyclefest</div><div class="big">All rounds are done 🎉</div><div class="small">Ride home safe!</div>';
      return;
    }
    const target = nextStop();
    if (!target) { el.innerHTML = '<div class="big">No more stops for your group tonight.</div>'; return; }
    let label, small;
    if (ts.phase === 'during' && target.index === ts.now) {
      label = `Now · ${target.round.name}`;
      small = `Ends in ${fmt(ts.minsLeft)}.`;
      const after = stops[ts.now + 1];
      if (after && after.party) small += ` Then: ${after.party.address}.`;
    } else {
      label = `Next · ${target.round.name} starts ${target.round.start}`;
      small = ts.minsLeft != null ? `Starts in ${fmt(ts.phase === 'during' ? ts.minsLeft + DATA.travelMinutes : ts.minsLeft)}. Allow ${DATA.travelMinutes} min by bike.` : `Allow ${DATA.travelMinutes} min by bike between rounds.`;
    }
    el.innerHTML = `<div class="label">${esc(label)}</div>
      <div class="big">${target.role === 'host' ? '⭐ Host at ' : ''}${esc(target.party.address)}</div>
      <div class="small">${esc(small)}</div>
      <div class="actions"><button class="btn" type="button" id="go-now">🚲 Route me there</button></div>`;
    $('go-now').addEventListener('click', () => {
      if (myPosition) { routeFromMe(); focusMapOnMobile(); } else $('locate').click();
    });
  }

  function focusMapOnMobile() { if (window.innerWidth < 900) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  function renderMine() {
    const ts = timeState();
    const stops = stopsFor(current);
    banner(ts);
    let html = '';
    stops.forEach((s, i) => {
      if (i > 0) html += `<div class="travel">${DATA.travelMinutes} min to ride to the next stop</div>`;
      html += stopCard(s, stops[i - 1], ts);
    });
    const g = DATA.groups[current];
    html = `<p class="details" style="margin:0 0 10px"><strong>${esc(current)}:</strong> ${esc(g.members)}</p>` + html;
    $('mine').innerHTML = html;
  }

  function renderAll() {
    const r = DATA.rounds[allRound];
    const filter = DATA.rounds.map((x, i) => `<button type="button" data-round="${i}" aria-pressed="${i === allRound}">${esc(x.name)} · ${esc(x.start)}</button>`).join('');
    const list = r.parties.map((p) => {
      const mine = p.host === current || p.guests.includes(current);
      return `<button type="button" class="party${mine ? ' mine' : ''}" data-focus="${esc(p.address)}">
        <b>${esc(p.address)}</b><span>⭐ ${esc(p.host)} · guests ${esc(p.guests.join(', '))}${mine ? ' · <strong>you</strong>' : ''}</span></button>`;
    }).join('');
    $('all').innerHTML = `<div class="round-filter">${filter}</div><div class="party-list">${list}</div>`;
  }

  function render() {
    if (!current) {
      $('welcome').hidden = false;
      $('plan').hidden = true;
      return;
    }
    $('welcome').hidden = true;
    $('plan').hidden = false;
    $('group-select').value = current;
    renderMine();
    if (!$('all').hidden) renderAll();
    map.invalidateSize();
  }

  function selectGroup(g) {
    if (!DATA.groups[g]) return;
    current = g;
    setStored(g);
    history.replaceState(null, '', '#' + g);
    render();
    if ($('all').hidden) drawMine(); else drawAll(allRound);
  }

  // ---------- wiring ----------
  $('group-select').innerHTML += groupIds.map((g) => `<option value="${g}">${g}</option>`).join('');
  $('group-grid').innerHTML = groupIds.map((g) => `<button type="button" data-group="${g}">${g}</button>`).join('');
  $('group-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-group]'); if (b) selectGroup(b.dataset.group); });
  $('group-select').addEventListener('change', (e) => (e.target.value ? selectGroup(e.target.value) : null));

  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-focus]');
    if (f) { focusStop(f.dataset.focus); return; }
    const r = e.target.closest('[data-round]');
    if (r) { allRound = Number(r.dataset.round); renderAll(); drawAll(allRound); }
  });

  function showTab(which) {
    const mine = which === 'mine';
    $('tab-mine').setAttribute('aria-selected', mine);
    $('tab-all').setAttribute('aria-selected', !mine);
    $('mine').hidden = !mine;
    $('all').hidden = mine;
    if (mine) drawMine();
    else {
      const ts = timeState();
      allRound = ts.phase === 'during' ? ts.now : ts.phase === 'after' ? 0 : ts.next;
      renderAll();
      drawAll(allRound);
    }
  }
  $('tab-mine').addEventListener('click', () => showTab('mine'));
  $('tab-all').addEventListener('click', () => showTab('all'));

  // keep "Now / Next" fresh during the evening
  setInterval(() => { if (current && !$('mine').hidden) renderMine(); }, 60 * 1000);

  const fromHash = decodeURIComponent(location.hash.slice(1)).toUpperCase();
  current = DATA.groups[fromHash] ? fromHash : (DATA.groups[getStored()] ? getStored() : null);
  render();
  if (current) drawMine();
})();
