"use strict";

// The UI. cloud.js signs in, loads the voter list and calls startApp().
// `onSave(voterId, changes)` persists changes like { party: "tdp", abroad: null, deceased: 1 } (null clears).
window.startApp = ({ fields, rows, assign, abroad, deceased, onSave }) => {

  // ---------- Data ----------
  const F = fields;
  const VOTERS = rows.map(row => {
    const v = {};
    F.forEach((k, i) => (v[k] = row[i]));
    v._vid = String(v.voter_id).toUpperCase();
    return v;
  });
  const BY_VID = new Map(VOTERS.map(v => [v.voter_id, v]));
  const WARDS = [...new Set(VOTERS.map(v => v.ward))].sort((a, b) => a - b);
  const MALE = "పు", FEMALE = "స్త్రీ";
  const UNASSIGNED = "__none";

  const PARTIES = [
    { id: "tdp", name: "TDP", color: "#f2c200" },
    { id: "jsp", name: "JSP", color: "#d32f2f" },
    { id: "ysrcp", name: "YSRCP", color: "#1e6fd9" },
    { id: "neutral", name: "Neutral", color: "#8a939b" },
  ];
  const partyById = id => PARTIES.find(p => p.id === id);

  // ---------- Icons ----------
  const svg = (d, size = 20) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    male: '<g fill="currentColor" stroke="none"><circle cx="12" cy="4" r="2.6"/><path d="M8.5 8h7A1.5 1.5 0 0 1 17 9.5V15h-2v7h-2.4v-5h-1.2v5H9v-7H7V9.5A1.5 1.5 0 0 1 8.5 8z"/></g>',
    female: '<g fill="currentColor" stroke="none"><circle cx="12" cy="4" r="2.6"/><path d="M9.8 8h4.4a1.5 1.5 0 0 1 1.45 1.1L17.5 16h-3v6h-2v-5h-1v5h-2v-6h-3l1.85-6.9A1.5 1.5 0 0 1 9.8 8z"/></g>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    vote: '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>',
    map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    deceased: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
  };

  // ---------- Helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => n.toLocaleString("en-IN");
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const onColor = hex => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#1a1a1a" : "#ffffff";
  };
  const toast = msg => {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  };
  const isDeceased = v => !!deceased[v.voter_id];
  // Deceased voters have no party (null) and are left out of party counts.
  const partyOf = v => (isDeceased(v) ? null : partyById(assign[v.voter_id]) ? assign[v.voter_id] : UNASSIGNED);
  const isAbroad = v => !isDeceased(v) && !!abroad[v.voter_id];

  function countParties(list) {
    const c = { [UNASSIGNED]: 0 };
    PARTIES.forEach(p => (c[p.id] = 0));
    list.forEach(v => { const p = partyOf(v); if (p) c[p]++; });
    return c;
  }

  function stackBar(counts) {
    const segs = PARTIES
      .filter(p => counts[p.id])
      .map(p => `<span title="${p.name}: ${counts[p.id]}" style="flex-grow:${counts[p.id]};background:${p.color}"></span>`);
    if (counts[UNASSIGNED]) segs.push(`<span title="Not assigned: ${counts[UNASSIGNED]}" style="flex-grow:${counts[UNASSIGNED]};background:var(--surface-2)"></span>`);
    return segs.join("");
  }

  function leading(counts) {
    let best = null;
    PARTIES.forEach(p => {
      if (p.id !== "neutral" && counts[p.id] && (!best || counts[p.id] > counts[best.id])) best = p;
    });
    return best;
  }

  // ---------- Router ----------
  function parseHash() {
    const [route, qs] = location.hash.replace(/^#/, "").split("?");
    return { route: route || "dashboard", params: new URLSearchParams(qs || "") };
  }
  function go(route, params) {
    const qs = params ? new URLSearchParams(params).toString() : "";
    location.hash = route + (qs ? "?" + qs : "");
  }
  function onRoute() {
    const { route, params } = parseHash();
    const r = route === "voters" ? "voters" : "dashboard";
    document.querySelectorAll(".view").forEach(el => (el.hidden = el.id !== "view-" + r));
    document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.dataset.route === r));
    closeSheet();
    if (r === "dashboard") renderDashboard();
    if (r === "voters") {
      for (const [k, sel] of [["ward", "#f-ward"], ["party", "#f-party"], ["gender", "#f-gender"], ["status", "#f-status"], ["q", "#q"]])
        if (params.has(k)) $(sel).value = params.get(k);
      renderVoters();
    }
    window.scrollTo(0, 0);
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const total = VOTERS.length;
    const male = VOTERS.filter(v => v.gender === MALE).length;
    const female = VOTERS.filter(v => v.gender === FEMALE).length;
    const away = VOTERS.filter(isAbroad).length;
    const dead = VOTERS.filter(isDeceased).length;
    const living = total - dead;
    const counts = countParties(VOTERS);
    const tagged = living - counts[UNASSIGNED];
    const lead = leading(counts);

    const kpi = (icon, tone, label, value, sub, link) => `
      <${link ? `a href="${link}"` : "div"} class="kpi">
        <span class="kpi-icon ${tone}">${svg(ICON[icon], icon === "male" || icon === "female" ? 28 : 22)}</span>
        <div>
          <div class="kpi-label">${label}</div>
          <div class="kpi-value">${value}</div>
          <div class="kpi-sub">${sub}</div>
        </div>
      </${link ? "a" : "div"}>`;

    $("#kpis").innerHTML =
      kpi("users", "brand", "Total voters", fmt(total), `${WARDS.length} wards`) +
      kpi("male", "male", "Male", fmt(male), `${pct(male, total)}%`) +
      kpi("female", "female", "Female", fmt(female), `${pct(female, total)}%`) +
      kpi("plane", "abroad", "Out of country", fmt(away), `${pct(away, total)}% of voters`, "#voters?status=abroad") +
      kpi("deceased", "deceased", "Deceased", fmt(dead), `${pct(dead, total)}% of voters`, "#voters?status=deceased");

    $("#party-title").innerHTML = `${svg(ICON.vote)} Expected votes`;
    $("#tag-progress").textContent = `${fmt(tagged)} / ${fmt(living)} marked`;
    $("#party-stack").innerHTML = stackBar(counts);

    const tile = (id, name, color, n, extra = "") => `
      <a class="party-tile${extra}" href="#voters?party=${id}" style="--c:${color}">
        <span class="party-badge" style="background:${color};color:${onColor(color)}">${
          id === UNASSIGNED ? svg(ICON.help, 18) : esc(name.slice(0, 1))}</span>
        <span class="party-name">${esc(name)}${lead && lead.id === id ? `<span class="lead-tag">${svg(ICON.trophy, 12)} Leading</span>` : ""}</span>
        <span class="party-count">${fmt(n)}</span>
        <span class="party-pct">${pct(n, living)}%</span>
        <span class="party-meter"><i style="width:${pct(n, living)}%"></i></span>
      </a>`;
    $("#party-tiles").innerHTML =
      PARTIES.map(p => tile(p.id, p.name, p.color, counts[p.id])).join("") +
      tile(UNASSIGNED, "Not marked", "var(--surface-2)", counts[UNASSIGNED], " unmarked");

    $("#ward-title").innerHTML = `${svg(ICON.map)} Wards`;
    $("#wards").innerHTML = WARDS.map(w => {
      const list = VOTERS.filter(v => v.ward === w);
      const c = countParties(list);
      const out = list.filter(isAbroad).length;
      const gone = list.filter(isDeceased).length;
      const l = leading(c);
      return `
        <a class="ward" href="#voters?ward=${w}">
          <div class="ward-top">
            <span class="ward-no">${w}</span>
            <div class="ward-info">
              <span class="ward-name">Ward ${w}</span>
              <span class="ward-sub">${fmt(list.length)} voters${out ? ` · ${svg(ICON.plane, 12)} ${out}` : ""}${gone ? ` · <span class="dead-ic">${svg(ICON.deceased, 12)}</span> ${gone}` : ""}</span>
            </div>
            ${l ? `<span class="ward-lead" style="background:${l.color};color:${onColor(l.color)}">${l.name}</span>` : ""}
            <span class="ward-go">${svg(ICON.chevron, 18)}</span>
          </div>
          <div class="stackbar thin">${stackBar(c)}</div>
        </a>`;
    }).join("");
  }

  // ---------- Voters ----------
  const PAGE = 60;
  let filtered = [], shown = 0;

  $("#f-ward").innerHTML = `<option value="">All wards</option>` + WARDS.map(w => `<option value="${w}">Ward ${w}</option>`).join("");
  $("#f-party").innerHTML = `<option value="">All</option>`
    + PARTIES.map(p => `<option value="${p.id}">${p.name}</option>`).join("")
    + `<option value="${UNASSIGNED}">Not marked</option>`;

  function resetFilters() {
    ["#q", "#f-ward", "#f-gender", "#f-party", "#f-status"].forEach(s => ($(s).value = ""));
  }

  const STATUS = {
    village: { label: "In village", test: v => !isDeceased(v) && !isAbroad(v) },
    abroad: { label: "Out of country", test: isAbroad },
    deceased: { label: "Deceased", test: isDeceased },
  };

  // Numbers search గ్రా.పం.ఓ.జా.వ.సం.; anything else searches Voter ID.
  function matcher() {
    const raw = $("#q").value.trim().toUpperCase();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return v => String(v.serial) === raw;
    return v => v._vid.includes(raw);
  }

  function renderVoters() {
    const ward = $("#f-ward").value, gender = $("#f-gender").value, party = $("#f-party").value, status = $("#f-status").value;
    const m = matcher();
    filtered = VOTERS.filter(v =>
      (!ward || v.ward === +ward) &&
      (!gender || v.gender === gender) &&
      (!party || partyOf(v) === party) &&
      (!status || STATUS[status].test(v)) &&
      (!m || m(v)));
    shown = 0;
    $("#voter-list").innerHTML = "";
    $("#result-count").textContent = `${fmt(filtered.length)} voter${filtered.length === 1 ? "" : "s"}`;

    const chips = [];
    if (ward) chips.push(["#f-ward", `Ward ${ward}`]);
    if (gender) chips.push(["#f-gender", gender === MALE ? "Male" : "Female"]);
    if (party) chips.push(["#f-party", party === UNASSIGNED ? "Not marked" : partyById(party)?.name]);
    if (status) chips.push(["#f-status", STATUS[status].label]);
    if ($("#q").value.trim()) chips.push(["#q", `“${$("#q").value.trim()}”`]);
    $("#active-filters").innerHTML = chips.map(([k, l]) => `<button class="pill-x" data-k="${k}" type="button">${esc(l)} ✕</button>`).join("")
      + (chips.length > 1 ? `<button class="pill-x clear" data-k="all" type="button">Clear all</button>` : "");

    if (!filtered.length) {
      $("#voter-list").innerHTML = `<div class="empty">No voters found.<br><span class="small">Search with గ్రా.పం.ఓ.జా. వ.సం. (e.g. 1500) or Voter ID (e.g. SZO1234567).</span></div>`;
      $("#load-more").hidden = true;
      return;
    }
    more();
  }

  function pickerHTML(v) {
    const cur = partyOf(v), away = isAbroad(v), dead = isDeceased(v);
    const off = dead ? " disabled" : "";
    return PARTIES.map(p => `
      <button type="button" class="pp${cur === p.id ? " on" : ""}" data-vid="${esc(v.voter_id)}" data-p="${p.id}"${off}
        style="--c:${p.color};--on:${onColor(p.color)}" aria-pressed="${cur === p.id}"><i></i>${p.name}</button>`).join("")
      + `<button type="button" class="pp abroad${away ? " on" : ""}" data-vid="${esc(v.voter_id)}" data-abroad${off}
        aria-pressed="${away}" title="Out of country">${svg(ICON.plane, 14)}<span>Abroad</span></button>`
      + `<button type="button" class="pp deceased${dead ? " on" : ""}" data-vid="${esc(v.voter_id)}" data-dead
        aria-pressed="${dead}" title="Deceased">${svg(ICON.deceased, 14)}<span>Deceased</span></button>`;
  }

  function voterHTML(v) {
    const p = partyById(partyOf(v));
    const male = v.gender === MALE;
    return `
      <div class="voter${isAbroad(v) ? " is-abroad" : ""}${isDeceased(v) ? " is-dead" : ""}" data-vid="${esc(v.voter_id)}" style="--party-color:${p ? p.color : "var(--border)"}">
        <div class="serial" title="గ్రా.పం.ఓ.జా.వ.సం.">${v.serial}</div>
        <div class="v-main">
          <div class="v-name" data-open="${esc(v.voter_id)}">${esc(v.name)}</div>
          <div class="v-rel">${esc(v.relation_type || "—")}: ${esc(v.relation_name || "—")}</div>
          <span class="v-id">${esc(v.voter_id)}</span>
        </div>
        <div class="v-loc">Ward ${v.ward} · H.No ${esc(v.house_no)}</div>
        <div class="v-age">${v.age} <span class="sex ${male ? "m" : "f"}">${male ? "M" : "F"}</span></div>
        <div class="party-pick">${pickerHTML(v)}</div>
      </div>`;
  }

  function more() {
    const next = filtered.slice(shown, shown + PAGE);
    $("#voter-list").insertAdjacentHTML("beforeend", next.map(voterHTML).join(""));
    shown += next.length;
    const btn = $("#load-more");
    btn.hidden = shown >= filtered.length;
    btn.textContent = `Show more (${fmt(filtered.length - shown)} left)`;
  }

  function refresh(vid) {
    const v = BY_VID.get(vid);
    const sel = CSS.escape(vid);
    document.querySelectorAll(`.voter[data-vid="${sel}"], .sheet[data-vid="${sel}"]`).forEach(el => {
      const p = partyById(partyOf(v));
      el.style.setProperty("--party-color", p ? p.color : "var(--border)");
      el.classList.toggle("is-abroad", isAbroad(v));
      el.classList.toggle("is-dead", isDeceased(v));
      el.querySelector(".party-pick").innerHTML = pickerHTML(v);
    });
    return v;
  }

  function setParty(vid, pid) {
    if (deceased[vid]) return;
    if (assign[vid] === pid) delete assign[vid];
    else assign[vid] = pid;
    onSave(vid, { party: assign[vid] || null });
    const v = refresh(vid), p = partyById(assign[vid]);
    toast(p ? `${v.name} → ${p.name}` : `${v.name}: cleared`);
  }

  function toggleAbroad(vid) {
    if (deceased[vid]) return;
    if (abroad[vid]) delete abroad[vid];
    else abroad[vid] = 1;
    onSave(vid, { abroad: abroad[vid] || null });
    const v = refresh(vid);
    toast(abroad[vid] ? `${v.name}: out of country` : `${v.name}: in village`);
  }

  // Marking deceased clears the voter's party and abroad marks.
  function toggleDeceased(vid) {
    const v = BY_VID.get(vid);
    if (deceased[vid]) {
      delete deceased[vid];
      onSave(vid, { deceased: null });
    } else {
      const p = partyById(assign[vid]);
      if (p && !confirm(`Mark ${v.name} as deceased? Their ${p.name} mark will be removed.`)) return;
      deceased[vid] = 1;
      delete assign[vid];
      delete abroad[vid];
      onSave(vid, { deceased: 1, party: null, abroad: null });
    }
    refresh(vid);
    toast(deceased[vid] ? `${v.name}: marked deceased` : `${v.name}: deceased mark removed`);
  }

  document.addEventListener("click", e => {
    const pp = e.target.closest(".pp");
    if (pp) {
      if ("dead" in pp.dataset) return toggleDeceased(pp.dataset.vid);
      return "abroad" in pp.dataset ? toggleAbroad(pp.dataset.vid) : setParty(pp.dataset.vid, pp.dataset.p);
    }
    const open = e.target.closest("[data-open]");
    if (open) return openSheet(open.dataset.open);
    const ward = e.target.closest("a.ward, a.party-tile, a.kpi");
    if (ward) resetFilters();
  });

  let qTimer;
  $("#q").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(renderVoters, 150); });
  ["#f-ward", "#f-gender", "#f-party", "#f-status"].forEach(s => $(s).addEventListener("change", renderVoters));
  $("#load-more").addEventListener("click", more);
  $("#active-filters").addEventListener("click", e => {
    const b = e.target.closest(".pill-x");
    if (!b) return;
    if (b.dataset.k === "all") resetFilters();
    else $(b.dataset.k).value = "";
    history.replaceState(null, "", "#voters");
    renderVoters();
  });

  // ---------- Detail sheet ----------
  function openSheet(vid) {
    const v = BY_VID.get(vid);
    if (!v) return;
    const s = $("#sheet");
    s.dataset.vid = vid;
    s.className = "sheet" + (isAbroad(v) ? " is-abroad" : "") + (isDeceased(v) ? " is-dead" : "");
    s.innerHTML = `
      <button class="icon-btn close" type="button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <h3 id="sheet-name">${esc(v.name)}</h3>
      <span class="v-id">${esc(v.voter_id)}</span>
      <dl>
        <dt>గ్రా.పం.ఓ.జా.వ.సం.</dt><dd>${v.serial}</dd>
        <dt>వార్డు (Ward)</dt><dd>${v.ward}</dd>
        <dt>${esc(v.relation_type || "Relation")}</dt><dd>${esc(v.relation_name || "—")}</dd>
        <dt>వయస్సు / లింగము</dt><dd>${v.age} · ${v.gender === MALE ? "Male (పు)" : "Female (స్త్రీ)"}</dd>
        <dt>ఇంటి సంఖ్య</dt><dd>${esc(v.house_no)}</dd>
        <dt>అ.ఓ.జా.వ.సం.</dt><dd>${esc(v.ac_serial)}</dd>
      </dl>
      <div class="muted small">Expected party</div>
      <div class="party-pick">${pickerHTML(v)}</div>`;
    s.hidden = false;
    $("#sheet-backdrop").hidden = false;
  }
  function closeSheet() { $("#sheet").hidden = true; $("#sheet-backdrop").hidden = true; }
  $("#sheet-backdrop").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

  // ---------- Init ----------
  window.addEventListener("hashchange", onRoute);
  onRoute();

  // Called by cloud.js when tags change on another device.
  let remoteTimer;
  return {
    applyRemote(next) {
      for (const [cur, upd] of [[assign, next.assign], [abroad, next.abroad], [deceased, next.deceased]]) {
        for (const k of Object.keys(cur)) if (!(k in upd)) delete cur[k];
        Object.assign(cur, upd);
      }
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(() => {
        if (parseHash().route === "voters") document.querySelectorAll(".voter, .sheet:not([hidden])").forEach(el => el.dataset.vid && refresh(el.dataset.vid));
        else renderDashboard();
      }, 100);
    },
  };
};
