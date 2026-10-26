/*
|------------------------------------------------------------------------------
| Inquiries: the list
|------------------------------------------------------------------------------
|
| Every inquiry is a template. A link is minted per person from the Copy link
| column, and each link is good for exactly one answer - so "list of people"
| counts the links that came back, not the links sent.
|
| Paged in the browser rather than in SQL, the same way admin-content.html and
| project-management.html do it: the whole set arrives once and the page slices
| it. These lists are tens of rows, not thousands.
|
*/

const adminToken = localStorage.getItem("admin_token");
let adminUser = {};
try {
  adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");
} catch (e) {}

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// The page itself is owner + account manager; the endpoints check the
// inquiries_access flag properly, this only saves a wasted load.
if (adminUser.role !== "owner" && adminUser.role !== "account_manager") {
  window.location.href = "admin.html";
}

const isOwner = adminUser.role === "owner";
const PAGE_SIZE = 10;

let inquiries = [];
/* What the table is showing: every inquiry, or the ones matching the search. */
let filtered = [];
let page = 1;

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

// Creating inquiries is the owner's; an account manager views them only.
document.getElementById("newBtn").hidden = !isOwner;

if (!isOwner) {
  document.getElementById("pageSub").textContent =
    "Share a link, and read what comes back.";
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

async function load() {
  const rows = document.getElementById("rows");

  try {
    const res = await fetch("api/admin-inquiries.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();

    if (!data.success) {
      rows.innerHTML = `<tr><td colspan="6" class="note">${WZI.escapeHtml(data.message || "Unable to load inquiries.")}</td></tr>`;
      return;
    }

    inquiries = data.inquiries || [];
    fillStats(data.stats || {});
    applyFilter();
  } catch (error) {
    rows.innerHTML = `<tr><td colspan="6" class="note">Connection error.</td></tr>`;
  }
}

function fillStats(stats) {
  document.getElementById("statTotal").textContent = stats.total ?? "—";
  document.getElementById("statActive").textContent = stats.active ?? "—";
  document.getElementById("statPeople").textContent = stats.people ?? "—";
}

/* ── Filtering ───────────────────────────────────────────────────────────
   Over the copy already in the browser: the whole list arrives in one request
   and is tens of rows, so going back to the server per keystroke would be
   slower than the typing. Name and reference both match, because the reference
   is the thing half the office will search by. */

function applyFilter() {
  const term = document
    .getElementById("filterSearch")
    .value.trim()
    .toLowerCase();

  filtered = !term
    ? inquiries
    : inquiries.filter(
        (inq) =>
          (inq.title + " " + (inq.reference || ""))
            .toLowerCase()
            .indexOf(term) !== -1,
      );

  page = 1;
  render();
}

function clearFilter() {
  document.getElementById("filterSearch").value = "";
  applyFilter();
}

document.getElementById("filterSearch").addEventListener("input", applyFilter);

/* ── Rendering ───────────────────────────────────────────────────────────── */

function render() {
  const rows = document.getElementById("rows");
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (page > pages) page = pages;

  if (!total) {
    showEmptyState();
    return;
  }

  document.getElementById("tableCard").hidden = false;
  document.getElementById("emptyState").hidden = true;

  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  rows.innerHTML = slice.map(row).join("");

  WZI.wireKebabs();
  renderPager(total, pages, start, slice.length);
}

function row(inq) {
  const leads = Number(inq.lead_count) || 0;
  const title = WZI.escapeHtml(inq.title);
  const inactive = inq.status === "inactive";

  // Just the number. The column heading says what it counts, so repeating
  // "people" in every row only made the column wider.
  const ANSWER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const answers = leads
    ? `<a class="answers-link" href="inquiry-details.html?id=${inq.id}#responses"
          aria-label="${leads} answer${leads === 1 ? "" : "s"} to ${title}">${ANSWER_ICON}${leads}</a>`
    : `<span class="answers-none">${ANSWER_ICON}0</span>`;

  const refChip = `<span class="t-ref" dir="auto">${WZI.escapeHtml(inq.reference || "")}</span>`;

  const reference = inq.reference
    ? refChip
    : `<span class="t-ref-none">&mdash;</span>`;

  return `
    <tr>
      <td>
        <a class="t-link" href="inquiry-details.html?id=${inq.id}">
          <span class="clamp2 t-title" dir="auto">${title}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </a>
        ${inactive ? `<span class="t-sub"><span class="pill pill-inactive">Inactive</span></span>` : ""}
        ${inq.reference ? `<span class="ref-inline t-sub">${refChip}</span>` : ""}
      </td>
      <td class="col-ref">${reference}</td>
      <td class="col-answers">${answers}</td>
      <td class="col-hide t-when">
        <b>${WZI.fmtDateISO(inq.created_at)}</b>${WZI.fmtTime(inq.created_at)}
      </td>
      <td class="action">
        <span class="actions">
          <a class="btn btn-dark" href="inquiry-details.html?id=${inq.id}">View</a>
        </span>
      </td>
      <td class="menu-cell">
          <span class="kebab-wrap">
            <button class="kebab" type="button" aria-haspopup="menu" aria-expanded="false"
                    aria-label="More actions for ${title}">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
            <div class="kebab-menu" role="menu">
              <a class="menu-view" role="menuitem" href="inquiry-details.html?id=${inq.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
                View details
              </a>
              <button role="menuitem" type="button" onclick="WZI.copyLink('${inq.slug}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>
                Copy link
              </button>
              ${
                isOwner
                  ? `
              <a role="menuitem" href="inquiry-form.html?id=${inq.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                Edit
              </a>
              <button role="menuitem" type="button" class="danger" onclick="removeInquiry(${inq.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                Delete
              </button>`
                  : ``
              }
            </div>
          </span>
      </td>
    </tr>
  `;
}

function showEmptyState() {
  document.getElementById("tableCard").hidden = true;

  const box = document.getElementById("emptyState");
  const searching = inquiries.length > 0;

  box.innerHTML = searching
    ? `
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    </div>
    <h3>No inquiries match that search</h3>
    <p>Nothing here has that in its name or its reference. Try a shorter term.</p>
    <button class="btn btn-ghost" type="button" onclick="clearFilter()">Clear search</button>
  `
    : `
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    </div>
    <h3>No inquiries yet</h3>
    ${
      isOwner
        ? `
    <p>An inquiry is a template. Write the questions once, then share its link with everyone you want to hear from.</p>
    <a class="create-btn" href="inquiry-form.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      New Inquiry
    </a>`
        : `
    <p>The owner creates inquiries. Once there is one, it shows up here with everything that comes back from it.</p>`
    }
  `;

  box.hidden = false;
  document.getElementById("pager").hidden = true;
}

/* ── Pager ───────────────────────────────────────────────────────────────── */

function renderPager(total, pages, start, shown) {
  const pager = document.getElementById("pager");

  if (pages < 2) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("pagerInfo").textContent =
    "Showing " +
    (start + 1) +
    " to " +
    (start + shown) +
    " of " +
    total +
    " inquiries";

  let html = `<button type="button" ${page === 1 ? "disabled" : ""} onclick="goTo(${page - 1})" aria-label="Previous page">&lsaquo;</button>`;

  for (let n = 1; n <= pages; n++) {
    html += `<button type="button" class="${n === page ? "current" : ""}" onclick="goTo(${n})">${n}</button>`;
  }

  html += `<button type="button" ${page === pages ? "disabled" : ""} onclick="goTo(${page + 1})" aria-label="Next page">&rsaquo;</button>`;

  document.getElementById("pagerPages").innerHTML = html;
}

function goTo(n) {
  page = n;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Delete ──────────────────────────────────────────────────────────────── */

async function removeInquiry(id) {
  const inq = inquiries.find((row) => Number(row.id) === Number(id));
  const leads = inq ? Number(inq.lead_count) || 0 : 0;

  const ok = await askConfirm({
    title: "Delete inquiry",
    text:
      '"' +
      (inq ? inq.title : "This inquiry") +
      '" will be deleted, along with ' +
      "its link" +
      (leads
        ? " and its " + leads + " answer" + (leads === 1 ? "" : "s")
        : "") +
      ". This cannot be undone.",
    action: "Delete inquiry",
  });

  if (!ok) return;

  try {
    const res = await fetch("api/admin-inquiries.php?id=" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();

    WZI.toast(
      data.message || (data.success ? "Inquiry deleted" : "Could not delete."),
      !data.success,
    );
  } catch (error) {
    WZI.toast("Network or server error.", true);
  }

  load();
}

/*
|------------------------------------------------------------------------------
| Delete confirmation
|------------------------------------------------------------------------------
|
| window.confirm() cannot name the row it is about to destroy and takes a single
| stray Enter as consent. This resolves a promise instead, and keeps the Delete
| button disabled until DELETE has been typed into the field, so the consent is
| a deliberate second action rather than a reflex.
|
*/

let confirmResolve = null;

function askConfirm(options) {
  const box = document.getElementById("confirmModal");
  const ack = document.getElementById("confirmAck");
  const okBtn = document.getElementById("confirmOk");

  document.getElementById("confirmTitle").textContent =
    options.title || "Delete";
  document.getElementById("confirmText").textContent = options.text || "";
  okBtn.textContent = options.action || "Delete";

  // Never inherit the previous answer: every deletion is acknowledged on its own.
  ack.value = "";
  ack.classList.remove("ok");
  okBtn.disabled = true;

  box.classList.add("show");
  ack.focus();

  return new Promise(function (resolve) {
    confirmResolve = resolve;
  });
}

function closeConfirm(answer) {
  document.getElementById("confirmModal").classList.remove("show");

  const resolve = confirmResolve;
  confirmResolve = null;

  if (resolve) resolve(!!answer);
}

/* Case-insensitive and trimmed: the point is a deliberate second action, not a
   typing test. Enter in the field is the same as pressing the button, but only
   once the word is there - otherwise Enter would be exactly the reflex
   dismissal this box exists to prevent. */
function ackIsGiven() {
  return (
    document.getElementById("confirmAck").value.trim().toUpperCase() ===
    "DELETE"
  );
}

document.getElementById("confirmAck").addEventListener("input", function () {
  const given = ackIsGiven();
  this.classList.toggle("ok", given);
  document.getElementById("confirmOk").disabled = !given;
});

document
  .getElementById("confirmAck")
  .addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (ackIsGiven()) closeConfirm(true);
    }
  });

document.getElementById("confirmOk").addEventListener("click", function () {
  if (!this.disabled) closeConfirm(true);
});

document.getElementById("confirmCancel").addEventListener("click", function () {
  closeConfirm(false);
});

// Clicking the backdrop cancels; clicking the box itself must not.
document
  .getElementById("confirmModal")
  .addEventListener("click", function (event) {
    if (event.target === this) closeConfirm(false);
  });

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && confirmResolve) closeConfirm(false);
});

load();
