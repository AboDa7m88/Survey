
  
const adminToken = localStorage.getItem("admin_token");
const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if(!adminToken || !adminUser.role){
  window.location.href = "admin-login.html";
}

/* Writing an announcement is the owner's alone - api/announcements.php refuses
   everybody else too, so this only saves them a wasted trip. */
if(adminUser.role !== "owner"){
  window.location.href = "admin-notifications.html";
}

function logoutAdmin(){
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

function esc(value){
  return String(value == null ? "" : value)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function setStatus(message, kind){
  const el = document.getElementById("statusText");
  el.innerText = message || "";
  el.className = "status-text" + (kind ? " " + kind : "");
}

/* ── Audience and recipients ─────────────────────────────────────────────────
   Both lists arrive in one payload and are re-rendered from memory when the
   tab changes, so switching back and forth costs nothing. The two selections
   are kept apart: ticking three admins and then switching to clients must not
   send an announcement to three ids from the wrong table. */

let audience = "team";
let scope = "all";
let people = { team: [], client: [] };
let selected = { team: [], client: [] };

const ROLE_GROUPS = [
  { role:"owner",           label:"Owner" },
  { role:"super_admin",     label:"Super Admins" },
  { role:"account_manager", label:"Account Managers" },
  { role:"seo_admin",       label:"Team Members" }
];

async function loadRecipients(){
  try{
    const res = await fetch("api/announcements.php?action=recipients", {
      headers:{ Authorization:"Bearer " + adminToken }
    });

    const data = await res.json();

    if(!data.success){
      setStatus(data.message || "Unable to load the people list.", "error");
      return;
    }

    people.team = data.team || [];
    people.client = data.clients || [];

    renderPicker();

  }catch(error){
    setStatus("Connection error.", "error");
  }
}

function selectAudience(value){
  if(audience === value) return;

  audience = value;

  document.getElementById("tabTeam").classList.toggle("selected", value === "team");
  document.getElementById("tabClient").classList.toggle("selected", value === "client");

  document.getElementById("scopeAllLabel").innerText =
    value === "team" ? "Whole team" : "All clients";
  document.getElementById("sendLabel").innerText =
    value === "team" ? "Send to team" : "Send to client";

  document.getElementById("pickerSearch").value = "";
  renderPicker();
  renderPills();
  setStatus("");
}

function selectScope(value){
  scope = value;
  document.getElementById("picker").hidden = value !== "specific";
  if(value !== "specific") closePicker();
  renderPills();
}

function togglePicker(){
  document.getElementById("picker").classList.toggle("open");
}

function closePicker(){
  document.getElementById("picker").classList.remove("open");
}

// A dropdown that stays open behind a click elsewhere on the form reads as
// stuck, so anything outside it closes it.
document.addEventListener("click", event => {
  const picker = document.getElementById("picker");
  if(picker && !picker.contains(event.target)) closePicker();
});

/** The people the current tab offers, narrowed by the search box. */
function visiblePeople(){
  const term = document.getElementById("pickerSearch").value.trim().toLowerCase();
  const list = people[audience] || [];

  if(!term) return list;

  return list.filter(person =>
    (person.name || "").toLowerCase().includes(term) ||
    (person.email || "").toLowerCase().includes(term) ||
    (person.company || "").toLowerCase().includes(term)
  );
}

function renderPicker(){
  const list = document.getElementById("pickerList");
  const visible = visiblePeople();

  if(!visible.length){
    list.innerHTML = `<div class="picker-empty">${
      (people[audience] || []).length ? "Nobody matches that search." : "Nobody to send to yet."
    }</div>`;
    renderPickerLabel();
    return;
  }

  if(audience === "client"){
    list.innerHTML = visible.map(person => itemHtml(person, person.company || person.email)).join("");
    renderPickerLabel();
    return;
  }

  // Admins are grouped by role, so a long list still reads as a team rather
  // than one flat column of names.
  list.innerHTML = ROLE_GROUPS.map(group => {
    const members = visible.filter(person => person.role === group.role);
    if(!members.length) return "";

    return `<div class="picker-group">${esc(group.label)}</div>` +
      members.map(person => itemHtml(person, person.email)).join("");
  }).join("");

  renderPickerLabel();
}

function itemHtml(person, secondary){
  const checked = selected[audience].includes(person.id) ? " checked" : "";

  return `
    <label class="picker-item">
      <input type="checkbox" value="${person.id}"${checked} onchange="togglePerson(${person.id}, this.checked)">
      <span class="who">
        <strong>${esc(person.name)}</strong>
        <span>${esc(secondary || "")}</span>
      </span>
    </label>
  `;
}

function togglePerson(id, checked){
  const list = selected[audience];
  const at = list.indexOf(id);

  if(checked && at === -1) list.push(id);
  if(!checked && at !== -1) list.splice(at, 1);

  renderPickerLabel();
  renderPills();
}

function removePerson(id){
  selected[audience] = selected[audience].filter(entry => entry !== id);
  renderPicker();
  renderPills();
}

function renderPickerLabel(){
  const count = selected[audience].length;

  document.getElementById("pickerLabel").innerText =
    count ? count + " selected" : "Select people";
}

/* The dropdown closes over its own checkboxes, so the names also live outside
   it - the mockup's chips, each one a way to unpick that person. */
function renderPills(){
  const wrap = document.getElementById("pickerPills");

  if(scope !== "specific" || !selected[audience].length){
    wrap.innerHTML = "";
    return;
  }

  const byId = {};
  (people[audience] || []).forEach(person => { byId[person.id] = person; });

  wrap.innerHTML = selected[audience].map(id => {
    const person = byId[id];
    if(!person) return "";

    return `
      <span class="pill">
        ${esc(person.name)}
        <button type="button" onclick="removePerson(${id})" title="Remove" aria-label="Remove">&times;</button>
      </span>
    `;
  }).join("");
}

/* ── Attachment ──────────────────────────────────────────────────────────────
   The same control as the content creation page: a hidden input behind a
   dropzone, previewed as a data URL. A dropped file never reaches the input,
   so the file object is what gets held, not input.files. */

let mediaFile = null;

const MAX_MEDIA = 3 * 1024 * 1024;
const dropzone = document.getElementById("dropzone");

document.getElementById("mediaInput").addEventListener("change", event => {
  if(event.target.files[0]) handleMedia(event.target.files[0]);
});

["dragenter","dragover"].forEach(type => {
  dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave","drop"].forEach(type => {
  dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", event => {
  const file = event.dataTransfer.files[0];
  if(file) handleMedia(file);
});

function handleMedia(file){
  const error = document.getElementById("mediaError");

  if(!file.type.startsWith("image/")){
    error.innerText = "Only image files are allowed.";
    error.classList.add("show");
    return;
  }

  if(file.size > MAX_MEDIA){
    error.innerText = "That image is over 3 MB. Pick a smaller one.";
    error.classList.add("show");
    return;
  }

  error.classList.remove("show");
  mediaFile = file;

  const reader = new FileReader();
  reader.onload = () => showMedia(reader.result);
  reader.onerror = () => {
    error.innerText = "That image could not be read.";
    error.classList.add("show");
  };
  reader.readAsDataURL(file);
}

function showMedia(url){
  document.getElementById("mediaThumb").style.backgroundImage = `url('${url}')`;
  document.getElementById("mediaPreview").classList.add("show");
  dropzone.style.display = "none";
}

function clearMedia(){
  mediaFile = null;
  document.getElementById("mediaInput").value = "";
  document.getElementById("mediaThumb").style.backgroundImage = "";
  document.getElementById("mediaPreview").classList.remove("show");
  document.getElementById("mediaError").classList.remove("show");
  dropzone.style.display = "";
}

/* ── Sending ── */

async function sendAnnouncement(){
  const button = document.getElementById("sendBtn");
  const title = document.getElementById("titleInput").value.trim();

  if(!title){
    setStatus("Give the announcement a title.", "error");
    return;
  }

  if(scope === "specific" && !selected[audience].length){
    setStatus("Pick at least one person.", "error");
    return;
  }

  const form = new FormData();
  form.append("action", "create");
  form.append("audience", audience);
  form.append("scope", scope);
  form.append("title", title);
  form.append("description", document.getElementById("descInput").value.trim());
  form.append("event_date", document.getElementById("dateInput").value);

  if(scope === "specific"){
    form.append("recipient_ids", selected[audience].join(","));
  }

  if(mediaFile) form.append("image", mediaFile);

  button.disabled = true;
  setStatus("Sending...");

  try{
    // No Content-Type header: the browser has to set the multipart boundary.
    const res = await fetch("api/announcements.php", {
      method: "POST",
      headers:{ Authorization:"Bearer " + adminToken },
      body: form
    });

    const data = await res.json();

    if(!res.ok || !data.success){
      setStatus(data.message || "Something went wrong.", "error");
      button.disabled = false;
      return;
    }

    setStatus(data.message, "ok");

    // Straight back to the inbox, where the announcement now sits.
    setTimeout(() => { window.location.href = "admin-notifications.html"; }, 900);

  }catch(error){
    setStatus("Connection error.", "error");
    button.disabled = false;
  }
}

loadRecipients();




/* The calendar is account-management work, so the link is hidden from admins
   who cannot open it. api/calendar.php and the page itself refuse the role
   too - this only hides a dead link. */
(function () {
  var CALENDAR_ROLES = ["owner", "super_admin", "account_manager"];
  var role = "";
  try { role = (JSON.parse(localStorage.getItem("admin_user") || "{}") || {}).role || ""; } catch (e) {}
  if (!role || CALENDAR_ROLES.indexOf(role) !== -1) return;
  document.querySelectorAll('a[href*="admin-calendar.html"]').forEach(function (link) { link.remove(); });
})();