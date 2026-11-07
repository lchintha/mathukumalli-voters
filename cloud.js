// Sign-in, voter list loading and tag syncing via Firebase.
// Firestore layout:
//   data/voters      { fields, rows (JSON string), count }
//   wards/{ward}     { party: { voterId: partyId }, abroad: { voterId: 1 }, deceased: { voterId: 1 },
//                     duplicate: { voterId: originalVoterId } }
// Access is limited to approved Google accounts by Firestore security rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, collection, onSnapshot, writeBatch, deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function gate(html) {
  $("#gate").innerHTML = `<div class="gate-card">${html}</div>`;
  $("#gate").hidden = false;
  $("#app").hidden = true;
  $(".tabs").hidden = true;
}
function ungate() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  $(".tabs").hidden = false;
}
const spinner = msg => gate(`<div class="spinner"></div><p class="muted">${msg}</p>`);

$("#sign-out").addEventListener("click", () => signOut(auth).then(() => location.reload()));

onAuthStateChanged(auth, async user => {
  $("#sign-out").hidden = !user;
  if (!user) return showLogin();
  spinner("Loading voter list…");
  let snap;
  try {
    snap = await getDoc(doc(db, "data", "voters"));
  } catch (e) {
    if (e.code === "permission-denied") return showDenied(user);
    return gate(`<h2>Could not load data</h2><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button>`);
  }
  if (!snap.exists()) return showUpload(user);
  const { fields, rows } = snap.data();
  start(fields, JSON.parse(rows));
});

function showLogin() {
  gate(`
    <div class="gate-logo">${document.querySelector(".logo").innerHTML}</div>
    <h2>Mathukumalli Voters</h2>
    <p class="muted">Sign in with your approved Google account to continue.</p>
    <button class="btn google" id="sign-in" type="button">
      <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Sign in with Google
    </button>
    <p class="small muted" id="sign-in-error"></p>`);
  $("#sign-in").addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") $("#sign-in-error").textContent = e.message;
    }
  });
}

function showDenied(user) {
  gate(`
    <h2>No access</h2>
    <p class="muted"><b>${esc(user.email)}</b> is not approved to view the voter list.</p>
    <button class="btn ghost" id="switch" type="button">Use a different account</button>`);
  $("#switch").addEventListener("click", () => signOut(auth));
}

// ---------- One-time upload from the computer that has data.js ----------
const loadScript = src => new Promise(res => {
  const s = document.createElement("script");
  s.src = src; s.onload = () => res(true); s.onerror = () => res(false);
  document.head.appendChild(s);
});

async function showUpload(user) {
  const hasLocal = window.VOTER_ROWS || (await loadScript("data.js")) && window.VOTER_ROWS;
  if (!hasLocal) {
    return gate(`<h2>Voter list not uploaded yet</h2>
      <p class="muted">Open this site on the computer that has the voter list to upload it once.</p>`);
  }
  const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
  const party = read("mk.assign.v1"), abroad = read("mk.abroad.v1");
  gate(`
    <h2>Upload voter list</h2>
    <p class="muted">Signed in as <b>${esc(user.email)}</b>. This uploads the voter list once, so you can use it on any device.</p>
    <ul class="gate-list">
      <li><b>${window.VOTER_ROWS.length.toLocaleString("en-IN")}</b> voters</li>
      <li><b>${Object.keys(party).length}</b> party tags saved in this browser</li>
      <li><b>${Object.keys(abroad).length}</b> out-of-country marks saved in this browser</li>
    </ul>
    <button class="btn" id="upload" type="button">Upload</button>
    <p class="small muted" id="upload-status"></p>`);
  $("#upload").addEventListener("click", async () => {
    $("#upload").disabled = true;
    $("#upload-status").textContent = "Uploading…";
    try {
      const fields = window.VOTER_FIELDS, rows = window.VOTER_ROWS;
      const wardIdx = fields.indexOf("ward"), vidIdx = fields.indexOf("voter_id");
      const wards = {};
      for (const r of rows) {
        const w = (wards[r[wardIdx]] ||= { party: {}, abroad: {} });
        if (party[r[vidIdx]]) w.party[r[vidIdx]] = party[r[vidIdx]];
        if (abroad[r[vidIdx]]) w.abroad[r[vidIdx]] = 1;
      }
      const batch = writeBatch(db);
      batch.set(doc(db, "data", "voters"), { fields, rows: JSON.stringify(rows), count: rows.length });
      for (const [w, data] of Object.entries(wards)) batch.set(doc(db, "wards", String(w)), data);
      await batch.commit();
      location.reload();
    } catch (e) {
      $("#upload").disabled = false;
      $("#upload-status").textContent = "Upload failed: " + e.message;
    }
  });
}

// ---------- Running app ----------
function start(fields, rows) {
  const wardIdx = fields.indexOf("ward"), vidIdx = fields.indexOf("voter_id");
  const wardOf = new Map(rows.map(r => [r[vidIdx], r[wardIdx]]));
  let ui = null;

  const onSave = (vid, changes) => {
    const data = {};
    for (const [kind, value] of Object.entries(changes)) data[kind] = { [vid]: value ?? deleteField() };
    setDoc(doc(db, "wards", String(wardOf.get(vid))), data, { merge: true })
      .catch(e => alert("Could not save: " + e.message));
  };

  onSnapshot(collection(db, "wards"), snap => {
    const assign = {}, abroad = {}, deceased = {}, duplicate = {};
    snap.forEach(d => {
      Object.assign(assign, d.data().party || {});
      Object.assign(abroad, d.data().abroad || {});
      Object.assign(deceased, d.data().deceased || {});
      Object.assign(duplicate, d.data().duplicate || {});
    });
    if (!ui) {
      ungate();
      ui = window.startApp({ fields, rows, assign, abroad, deceased, duplicate, onSave });
    } else {
      ui.applyRemote({ assign, abroad, deceased, duplicate });
    }
  }, e => gate(`<h2>Connection problem</h2><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reload</button>`));
}
