"use strict";

// The UI. cloud.js signs in, loads the voter list and calls startApp().
// `onSave(voterId, changes)` persists changes like { party: "tdp", abroad: null, deceased: 1, duplicate: "<voter id>" } (null clears).
window.startApp = ({ fields, rows, assign, abroad, deceased, duplicate, onSave }) => {

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
    deceased: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
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
  const isDuplicate = v => !!duplicate[v.voter_id];
  const isDeceased = v => !isDuplicate(v) && !!deceased[v.voter_id];
  // Deceased and duplicate voters don't vote: they have no party (null) and are left out of party counts.
  const isOut = v => isDeceased(v) || isDuplicate(v);
  const partyOf = v => (isOut(v) ? null : partyById(assign[v.voter_id]) ? assign[v.voter_id] : UNASSIGNED);
  const isAbroad = v => !isOut(v) && !!abroad[v.voter_id];

  // ---------- Name search ----------
  // Telugu names are spelled out in English letters (never shown), then both the name and
  // what was typed are reduced to a loose key so common spelling differences still match.
  const TE_VOWELS = { "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ii", "ఉ": "u", "ఊ": "uu", "ఋ": "ri", "ౠ": "ri",
    "ఎ": "e", "ఏ": "e", "ఐ": "ai", "ఒ": "o", "ఓ": "o", "ఔ": "au" };
  const TE_SIGNS = { "ా": "aa", "ి": "i", "ీ": "ii", "ు": "u", "ూ": "uu", "ృ": "ri", "ౄ": "ri",
    "ె": "e", "ే": "e", "ై": "ai", "ొ": "o", "ో": "o", "ౌ": "au" };
  const TE_CONS = { "క": "k", "ఖ": "kh", "గ": "g", "ఘ": "gh", "ఙ": "n", "చ": "ch", "ఛ": "chh", "జ": "j", "ఝ": "jh", "ఞ": "n",
    "ట": "t", "ఠ": "th", "డ": "d", "ఢ": "dh", "ణ": "n", "త": "t", "థ": "th", "ద": "d", "ధ": "dh", "న": "n",
    "ప": "p", "ఫ": "ph", "బ": "b", "భ": "bh", "మ": "m", "య": "y", "ర": "r", "ఱ": "r", "ల": "l", "ళ": "l", "వ": "v",
    "శ": "sh", "ష": "sh", "స": "s", "హ": "h", "ౘ": "ts", "ౙ": "dz" };
  const VIRAMA = "్";

  function teluguToLatin(text) {
    let out = "";
    const chars = [...String(text)];
    chars.forEach((ch, i) => {
      if (TE_CONS[ch]) {
        const next = chars[i + 1];
        out += TE_CONS[ch] + (next === VIRAMA || TE_SIGNS[next] ? "" : "a");
      } else if (TE_SIGNS[ch] || TE_VOWELS[ch]) out += TE_SIGNS[ch] || TE_VOWELS[ch];
      else if (ch === "ం" || ch === "ఁ") out += "m";
      else if (ch === "ః") out += "h";
      else if (ch !== VIRAMA) out += ch;
    });
    return out;
  }

  // Order matters: sound groups first, then vowel lengths, then doubled letters.
  const KEY_RULES = [
    [/[^a-z]+/g, " "],
    [/x/g, "ks"], [/q/g, "k"], [/z/g, "j"], [/f/g, "p"], [/w/g, "v"],
    [/([bcdgjkpt])h/g, "$1"], [/sh/g, "s"],
    [/ee|ii/g, "i"], [/oo|uu/g, "u"], [/aa/g, "a"],
    [/m(?=[^aeiouy ]|$)/g, "n"],
    [/h\b/g, ""], [/\bea/g, "e"], [/\bi/g, "e"],
    [/ayu/g, "ai"], [/ayi/g, "ai"], [/avu\b/g, "ao"], [/aia\b/g, "aya"], [/y\b/g, "i"],
    [/([a-z])\1+/g, "$1"],
  ];
  const nameKey = text => KEY_RULES.reduce((t, [re, to]) => t.replace(re, to), teluguToLatin(text).toLowerCase()).trim();

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
  // Small totals on top, then a row per ward with each party's expected votes.
  const COLS = [...PARTIES, { id: UNASSIGNED, name: "Not marked", color: "var(--unmarked)" }];

  function renderDashboard() {
    const total = VOTERS.length;
    const living = VOTERS.filter(v => !isOut(v)).length;
    const counts = countParties(VOTERS);
    const n = test => VOTERS.filter(test).length;

    const stat = (icon, color, label, value, link) => `
      <${link ? `a href="${link}"` : "div"} class="stat">
        <span class="stat-icon" style="--c:${color}">${svg(ICON[icon], 18)}</span>
        <div><div class="stat-value">${fmt(value)}</div><div class="stat-label">${label}</div></div>
      </${link ? "a" : "div"}>`;
    $("#stats").innerHTML =
      stat("users", "var(--brand-2)", "Total voters", total) +
      stat("male", "var(--male)", "Male", n(v => v.gender === MALE), "#voters?gender=" + encodeURIComponent(MALE)) +
      stat("female", "var(--female)", "Female", n(v => v.gender === FEMALE), "#voters?gender=" + encodeURIComponent(FEMALE)) +
      stat("plane", "var(--abroad)", "Out of country", n(isAbroad), "#voters?status=abroad") +
      stat("deceased", "var(--deceased)", "Deceased", n(isDeceased), "#voters?status=deceased") +
      stat("copy", "var(--duplicate)", "Duplicates", n(isDuplicate), "#voters?status=duplicate");
    $("#tag-progress").textContent = `${fmt(living - counts[UNASSIGNED])} / ${fmt(living)} marked`;

    $("#ward-title").innerHTML = `${svg(ICON.vote)} Votes by ward`;
    const head = `
      <div class="wt-row wt-head">
        <span>Ward</span><span>Voters</span>
        ${COLS.map(p => `<span class="num"><i style="--c:${p.color}"></i>${p.name}</span>`).join("")}
        <span style="justify-self:end">Leading</span>
      </div>`;
    $("#wards").innerHTML = head
      + wardRow(null, VOTERS)
      + WARDS.map(w => wardRow(w, VOTERS.filter(v => v.ward === w))).join("");
  }

  function wardRow(ward, list) {
    const c = countParties(list);
    const counted = list.filter(v => !isOut(v)).length;
    const link = extra => "#voters?" + new URLSearchParams({ ...(ward ? { ward } : {}), ...extra });
    const marks = [[isAbroad, "plane", "ic-abroad", "Out of country"], [isDeceased, "deceased", "ic-dead", "Deceased"], [isDuplicate, "copy", "ic-dup", "Duplicates"]]
      .map(([test, icon, cls, title]) => { const k = list.filter(test).length; return k ? `<span class="${cls}" title="${title}">${svg(ICON[icon], 11)}${k}</span>` : ""; })
      .join("");
    const lead = leading(c);
    const second = lead ? Math.max(0, ...PARTIES.filter(p => p.id !== "neutral" && p.id !== lead.id).map(p => c[p.id])) : 0;
    return `
      <div class="wt-row${ward ? "" : " wt-total"}">
        <a class="wt-ward" href="${link({})}"><span class="ward-no">${ward ?? "All"}</span><span class="wt-name">${ward ? `Ward ${ward}` : "All wards"}</span></a>
        <a class="wt-voters" href="${link({})}"><b>${fmt(list.length)}</b>${marks ? `<small>${marks}</small>` : ""}</a>
        ${COLS.map(p => `
          <a class="wt-cell${c[p.id] ? "" : " zero"}" href="${link({ party: p.id })}" data-label="${p.id === UNASSIGNED ? "Unmarked" : p.name}" style="--c:${p.color}">
            <b>${fmt(c[p.id])}</b><small>${pct(c[p.id], counted)}%</small>
          </a>`).join("")}
        <span class="wt-lead">${lead
          ? `<span class="lead-badge" style="background:${lead.color};color:${onColor(lead.color)}">${lead.name}</span>${c[lead.id] > second ? `<small>+${fmt(c[lead.id] - second)}</small>` : ""}`
          : `<small>—</small>`}</span>
        <div class="stackbar wt-bar">${stackBar(c)}</div>
      </div>`;
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
    village: { label: "In village", test: v => !isOut(v) && !isAbroad(v) },
    abroad: { label: "Out of country", test: isAbroad },
    deceased: { label: "Deceased", test: isDeceased },
    duplicate: { label: "Duplicate", test: isDuplicate },
  };

  // Numbers search గ్రా.పం.ఓ.జా.వ.సం.; letters with numbers search Voter ID; anything else searches names
  // (and the start of Voter IDs, so a typed ID prefix still finds voters).
  // Name matches are scored so names whose words start with what was typed come first.
  function matcher() {
    const raw = $("#q").value.trim().toUpperCase();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return v => String(v.serial) === raw;
    if (/\d/.test(raw)) return v => v._vid.includes(raw);
    const words = nameKey(raw).split(" ").filter(Boolean);
    if (!words.length) return null;
    return v => {
      if (v._vid.startsWith(raw)) return 1;
      const key = " " + (v._nameKey ??= nameKey(v.name));
      if (!words.every(w => key.includes(w))) return false;
      return 1 + words.filter(w => key.includes(" " + w)).length;
    };
  }

  function renderVoters() {
    const ward = $("#f-ward").value, gender = $("#f-gender").value, party = $("#f-party").value, status = $("#f-status").value;
    const m = matcher();
    const score = new Map();
    filtered = VOTERS.filter(v =>
      (!ward || v.ward === +ward) &&
      (!gender || v.gender === gender) &&
      (!party || partyOf(v) === party) &&
      (!status || STATUS[status].test(v)) &&
      (!m || score.set(v, m(v)).get(v)));
    if (m) filtered.sort((a, b) => score.get(b) - score.get(a));
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
      $("#voter-list").innerHTML = `<div class="empty">No voters found.<br><span class="small">Search with గ్రా.పం.ఓ.జా. వ.సం. (e.g. 1500), Voter ID (e.g. SZO1234567) or name (e.g. venkat).<br>For names, try fewer letters if nothing shows up.</span></div>`;
      $("#load-more").hidden = true;
      return;
    }
    more();
  }

  // Party and mark buttons, shown in the voter sheet.
  function pickerHTML(v) {
    const cur = partyOf(v), away = isAbroad(v), dead = isDeceased(v), dup = isDuplicate(v);
    const off = dead || dup ? " disabled" : "";
    const vid = esc(v.voter_id);
    return `<div class="party-pick">${PARTIES.map(p => `
      <button type="button" class="pp${cur === p.id ? " on" : ""}" data-vid="${vid}" data-p="${p.id}"${off}
        style="--c:${p.color};--on:${onColor(p.color)}" aria-pressed="${cur === p.id}"><i></i>${p.name}</button>`).join("")}</div>
      <div class="marks">
        <button type="button" class="pp abroad${away ? " on" : ""}" data-vid="${vid}" data-abroad${off}
          aria-pressed="${away}">${svg(ICON.plane, 14)}<span>Abroad</span></button>
        <button type="button" class="pp deceased${dead ? " on" : ""}" data-vid="${vid}" data-dead${dup ? " disabled" : ""}
          aria-pressed="${dead}">${svg(ICON.deceased, 14)}<span>Deceased</span></button>
        <button type="button" class="pp duplicate${dup ? " on" : ""}" data-vid="${vid}" data-dup${dead ? " disabled" : ""}
          aria-pressed="${dup}">${svg(ICON.copy, 14)}<span>Duplicate</span></button>
      </div>`;
  }

  // "Duplicate of …" for a duplicate entry, "Also listed as …" for the voter it duplicates.
  function dupHTML(v) {
    const ref = (o, label) => `<button type="button" class="v-dup" data-open="${esc(o.voter_id)}">${svg(ICON.copy, 12)} ${label} ${o.serial}<span class="v-dup-id"> · ${esc(o.voter_id)}</span></button>`;
    const orig = BY_VID.get(duplicate[v.voter_id]);
    if (orig) return ref(orig, "Duplicate of");
    return Object.keys(duplicate).filter(k => duplicate[k] === v.voter_id)
      .map(k => BY_VID.get(k)).filter(Boolean).map(o => ref(o, "Also listed as")).join("");
  }

  // A compact tile; tapping it opens the full details and the party buttons.
  function voterHTML(v) {
    const p = partyById(partyOf(v));
    const male = v.gender === MALE;
    const tags = isDeceased(v) ? `<span class="tag dead">Deceased</span>`
      : isDuplicate(v) ? `<span class="tag dup">Duplicate</span>`
      : (p ? `<span class="tag" style="background:${p.color};color:${onColor(p.color)}">${p.name}</span>` : `<span class="tag none">Not marked</span>`)
        + (isAbroad(v) ? `<span class="tag abroad" title="Out of country">${svg(ICON.plane, 12)}</span>` : "");
    return `
      <div class="voter${isAbroad(v) ? " is-abroad" : ""}${isDeceased(v) ? " is-dead" : ""}${isDuplicate(v) ? " is-dup" : ""}" data-vid="${esc(v.voter_id)}" style="--party-color:${p ? p.color : "var(--border)"}">
        <div class="serial" title="గ్రా.పం.ఓ.జా.వ.సం.">${v.serial}</div>
        <div class="v-main">
          <div class="v-name">${esc(v.name)}</div>
          <div class="v-meta"><span class="v-id">${esc(v.voter_id)}</span><span>${v.age} <span class="sex ${male ? "m" : "f"}">${male ? "M" : "F"}</span></span></div>
        </div>
        <div class="v-tags">${tags}</div>
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
    document.querySelectorAll(`.voter[data-vid="${CSS.escape(vid)}"]`).forEach(el => (el.outerHTML = voterHTML(v)));
    const s = $("#sheet");
    if (s.dataset.vid === vid) {
      s.className = sheetClass(v);
      s.querySelector(".pick").innerHTML = pickerHTML(v);
      s.querySelector(".dup-slot").innerHTML = dupHTML(v);
    }
    return v;
  }

  function setParty(vid, pid) {
    if (deceased[vid] || duplicate[vid]) return;
    if (assign[vid] === pid) delete assign[vid];
    else assign[vid] = pid;
    onSave(vid, { party: assign[vid] || null });
    const v = refresh(vid), p = partyById(assign[vid]);
    toast(p ? `${v.name} → ${p.name}` : `${v.name}: cleared`);
  }

  function toggleAbroad(vid) {
    if (deceased[vid] || duplicate[vid]) return;
    if (abroad[vid]) delete abroad[vid];
    else abroad[vid] = 1;
    onSave(vid, { abroad: abroad[vid] || null });
    const v = refresh(vid);
    toast(abroad[vid] ? `${v.name}: out of country` : `${v.name}: in village`);
  }

  // Marking deceased clears the voter's party and abroad marks.
  function toggleDeceased(vid) {
    const v = BY_VID.get(vid);
    if (duplicate[vid]) return;
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

  // Finds a voter by గ్రా.పం.ఓ.జా.వ.సం. or Voter ID.
  function findVoter(text) {
    const raw = String(text || "").trim().toUpperCase();
    if (!raw) return null;
    return VOTERS.find(/^\d+$/.test(raw) ? v => String(v.serial) === raw : v => v._vid === raw) || null;
  }

  // A duplicate entry points at the voter it repeats; like deceased, it clears and locks the other marks.
  function toggleDuplicate(vid) {
    const v = BY_VID.get(vid);
    if (deceased[vid] && !duplicate[vid]) return;
    if (duplicate[vid]) {
      delete duplicate[vid];
      onSave(vid, { duplicate: null });
      refreshDupLinks(vid);
      return toast(`${v.name}: duplicate mark removed`);
    }
    const input = prompt(`${v.name} (${v.serial}) is a duplicate of which voter?\nEnter their గ్రా.పం.ఓ.జా.వ.సం. or Voter ID.`);
    if (input == null) return;
    let o = findVoter(input);
    while (o && duplicate[o.voter_id]) o = BY_VID.get(duplicate[o.voter_id]);
    if (!o) return alert(`No voter found for “${input.trim()}”.`);
    if (o === v) return alert("A voter can't be a duplicate of themselves.");
    const p = partyById(assign[vid]);
    if (!confirm(`Mark ${v.name} (${v.serial} · ${v.voter_id}) as a duplicate of ${o.name} (${o.serial} · ${o.voter_id})?`
      + (p ? `\n\nTheir ${p.name} mark will be removed.` : ""))) return;
    // Anything that pointed at this voter now points at the original.
    for (const k of Object.keys(duplicate)) if (duplicate[k] === vid) { duplicate[k] = o.voter_id; onSave(k, { duplicate: o.voter_id }); }
    duplicate[vid] = o.voter_id;
    delete assign[vid];
    delete abroad[vid];
    delete deceased[vid];
    onSave(vid, { duplicate: o.voter_id, party: null, abroad: null, deceased: null });
    refreshDupLinks(vid, o.voter_id);
    toast(`${v.name}: duplicate of ${o.serial}`);
  }
  function refreshDupLinks(...vids) {
    const all = new Set(vids);
    Object.entries(duplicate).forEach(([k, o]) => { if (all.has(o)) all.add(k); });
    document.querySelectorAll(".voter[data-vid], .sheet[data-vid]").forEach(el => el.dataset.vid && all.add(el.dataset.vid));
    all.forEach(k => BY_VID.has(k) && refresh(k));
  }

  document.addEventListener("click", e => {
    const pp = e.target.closest(".pp");
    if (pp) {
      if ("dead" in pp.dataset) return toggleDeceased(pp.dataset.vid);
      if ("dup" in pp.dataset) return toggleDuplicate(pp.dataset.vid);
      return "abroad" in pp.dataset ? toggleAbroad(pp.dataset.vid) : setParty(pp.dataset.vid, pp.dataset.p);
    }
    const open = e.target.closest("[data-open]");
    if (open) return openSheet(open.dataset.open);
    const tile = e.target.closest(".voter");
    if (tile) return openSheet(tile.dataset.vid);
    if (e.target.closest("#view-dashboard a")) resetFilters();
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
  const sheetClass = v => "sheet" + (isDeceased(v) ? " is-dead" : "") + (isDuplicate(v) ? " is-dup" : "");

  function openSheet(vid) {
    const v = BY_VID.get(vid);
    if (!v) return;
    const s = $("#sheet");
    s.dataset.vid = vid;
    s.className = sheetClass(v);
    s.innerHTML = `
      <button class="icon-btn close" type="button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <h3 id="sheet-name">${esc(v.name)}</h3>
      <span class="v-id">${esc(v.voter_id)}</span>
      <div class="dup-slot">${dupHTML(v)}</div>
      <dl>
        <dt>గ్రా.పం.ఓ.జా.వ.సం.</dt><dd>${v.serial}</dd>
        <dt>వార్డు (Ward)</dt><dd>${v.ward}</dd>
        <dt>${esc(v.relation_type || "Relation")}</dt><dd>${esc(v.relation_name || "—")}</dd>
        <dt>వయస్సు / లింగము</dt><dd>${v.age} · ${v.gender === MALE ? "Male (పు)" : "Female (స్త్రీ)"}</dd>
        <dt>ఇంటి సంఖ్య</dt><dd>${esc(v.house_no)}</dd>
        <dt>అ.ఓ.జా.వ.సం.</dt><dd>${esc(v.ac_serial)}</dd>
      </dl>
      <div class="pick-label">Expected party</div>
      <div class="pick">${pickerHTML(v)}</div>`;
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
      for (const [cur, upd] of [[assign, next.assign], [abroad, next.abroad], [deceased, next.deceased], [duplicate, next.duplicate]]) {
        for (const k of Object.keys(cur)) if (!(k in upd)) delete cur[k];
        Object.assign(cur, upd);
      }
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(() => {
        if (parseHash().route === "voters") document.querySelectorAll(".voter, .sheet").forEach(el => el.dataset.vid && refresh(el.dataset.vid));
        else renderDashboard();
      }, 100);
    },
  };
};
