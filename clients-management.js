let adminToken = localStorage.getItem("admin_token");
let adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Not for seo_admin: they work on content, not on client accounts. The link is
// gone from their sidebar (assets/role-nav.js) and api/admin-user-details.php
// refuses them; this only stops a typed-in URL landing on an empty page.
if (adminUser.role === "seo_admin") {
  window.location.replace("admin.html");
}

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

// Every role but seo_admin reaches this page - what changes between them is the
// data scope and which actions render.
const myRole = adminUser.role;
const isOwner = myRole === "owner";

// Wording for the clients table changes with role: the owner sees every signup
// and decides on it from the client's own page, everyone below is just looking
// at the slice handed down to them.
const USERS_COPY = {
  owner: {
    title: "Clients Management",
    sub: "Approve or reject newly registered clients.",
  },
  super_admin: {
    title: "Clients Management",
    sub: "Clients whose team you are on.",
  },
  account_manager: {
    title: "Clients Management",
    sub: "Clients whose team you are on.",
  },
};

// Who works on each client is set on the client's own page now, in its Team
// section - see user-details.html and api/client-team.php.
document.addEventListener("DOMContentLoaded", function () {
  const copy = USERS_COPY[myRole] || USERS_COPY.super_admin;
  document.getElementById("usersPanelTitle").textContent = copy.title;
  document.getElementById("usersPanelSub").textContent = copy.sub;
});

let allUsers = [];

// Ten rows to a page; the rest live behind the pager under the table.
const USERS_PAGE_SIZE = 10;
let pendingPage = 1;
let approvedPage = 1;

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Both tables come out of one request: api/admin-users.php returns the whole
           scope and the split is done here, so approving somebody moves them from one
           table to the other without a second round trip. */
async function loadUsers() {
  const table = document.getElementById("approvedTable");

  try {
    const res = await fetch("api/admin-users.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();

    if (!data.success) {
      allUsers = [];
      failTables(data.message || "Unable to load clients.");
      return;
    }

    allUsers = data.users || [];

    // Keep the page the admin was on - approving someone should not send them
    // back to page 1. renderUsers() clamps it if the page no longer exists.
    renderUsers();
  } catch (error) {
    allUsers = [];
    failTables("Connection error.");
  }
}

/* The message goes in the list, and the queue above it is put away - it has no
           rows to show and an empty panel with an error in it says nothing useful
           twice. */
function failTables(message) {
  document.getElementById("pendingPanel").hidden = true;
  document.getElementById("pendingPager").hidden = true;
  document.getElementById("approvedPager").hidden = true;

  document.getElementById("approvedTable").innerHTML = `
    <tr>
      <td colspan="5" class="empty">${esc(message)}</td>
    </tr>
  `;
}

/*
        |------------------------------------------------------------------------------
        | Two tables, not one
        |------------------------------------------------------------------------------
        |
        | Pending and approved are two different jobs. Pending is a queue: somebody has
        | to say yes or no, and once they have, the row leaves. Approved is a reference
        | list you come to in order to look something up. Mixed into one table sorted by
        | signup date, a registration waiting on a decision could be on page three.
        |
        | So: the queue on top, hidden when it is empty, and the list below it. The two
        | page independently - working through the queue does not move the list.
        |
        | A row is approved or it is pending; nothing is in both tables.
        |
        */

function pendingUsers() {
  return allUsers.filter((user) => Number(user.approved) !== 1);
}

function approvedUsers() {
  return allUsers.filter((user) => Number(user.approved) === 1);
}

function renderUsers() {
  renderPending();
  renderApproved();
}

/* One row, in whichever table it belongs to. View is the only action here:
           Approve, Reject and Delete all decide something about one account, so they
           live on that account's own page, where the rest of what the decision affects
           is on screen. The list stays a list. */
function userRow(user) {
  const approved = Number(user.approved) === 1;

  return `
    <tr>
      <td>${esc(user.company_name || "—")}</td>
      <td>${esc(user.email)}</td>
      <td>
        <span class="badge ${approved ? "approved" : "pending"}">
          ${approved ? "Approved" : "Pending"}
        </span>
      </td>
      <td>${esc(user.created_at)}</td>
      <td>
        <div class="actions">
          <a class="btn action-btn" href="user-details.html?id=${esc(user.id)}">View</a>
        </div>
      </td>
    </tr>
  `;
}

function renderPending() {
  const panel = document.getElementById("pendingPanel");
  const table = document.getElementById("pendingTable");
  const rows = pendingUsers();

  /* Nothing waiting is not an empty table to explain - it is the normal state,
             so the panel goes away entirely rather than sitting there saying so. */
  if (!rows.length) {
    panel.hidden = true;
    document.getElementById("pendingPager").hidden = true;
    return;
  }

  panel.hidden = false;

  document.getElementById("pendingSub").textContent = isOwner
    ? "Newly registered clients waiting on your decision - open one to approve or reject it."
    : "Newly registered clients waiting on the owner's decision.";

  // Deciding the last row on the last page would otherwise leave it blank.
  const totalPages = Math.max(1, Math.ceil(rows.length / USERS_PAGE_SIZE));
  pendingPage = Math.min(Math.max(1, pendingPage), totalPages);

  const start = (pendingPage - 1) * USERS_PAGE_SIZE;
  const shown = rows.slice(start, start + USERS_PAGE_SIZE);

  table.innerHTML = shown.map(userRow).join("");

  renderPager({
    prefix: "pending",
    page: pendingPage,
    total: rows.length,
    totalPages,
    start,
    shown: shown.length,
  });
}

function renderApproved() {
  const table = document.getElementById("approvedTable");
  const rows = approvedUsers();

  document.getElementById("approvedSub").textContent = isOwner
    ? "Approved accounts. Open one to manage or delete it."
    : "Approved accounts you can manage.";

  if (!rows.length) {
    document.getElementById("approvedPager").hidden = true;

    table.innerHTML = `
      <tr>
        <td colspan="5" class="empty">${
          pendingUsers().length
            ? "No approved clients yet - the registrations above are waiting on a decision."
            : "No clients found."
        }</td>
      </tr>
    `;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / USERS_PAGE_SIZE));
  approvedPage = Math.min(Math.max(1, approvedPage), totalPages);

  const start = (approvedPage - 1) * USERS_PAGE_SIZE;
  const shown = rows.slice(start, start + USERS_PAGE_SIZE);

  table.innerHTML = shown.map(userRow).join("");

  renderPager({
    prefix: "approved",
    page: approvedPage,
    total: rows.length,
    totalPages,
    start,
    shown: shown.length,
  });
}

/* Both tables share this, keyed by the id prefix of the one asking - the two
           pagers are identical apart from which page number they move. */
function renderPager(o) {
  const pager = document.getElementById(o.prefix + "Pager");

  if (o.total <= USERS_PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById(o.prefix + "PagerInfo").innerText =
    `Showing ${o.start + 1}–${o.start + o.shown} of ${o.total}`;

  const pages = Array.from(
    { length: o.totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById(o.prefix + "PagerPages").innerHTML = `
    <button type="button" onclick="goToPage('${o.prefix}', ${o.page - 1})" ${o.page === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map(
        (page) => `
      <button type="button" class="${page === o.page ? "current" : ""}"
              onclick="goToPage('${o.prefix}', ${page})">${page}</button>
    `,
      )
      .join("")}
    <button type="button" onclick="goToPage('${o.prefix}', ${o.page + 1})" ${o.page === o.totalPages ? "disabled" : ""}>Next</button>
  `;
}

function goToPage(prefix, page) {
  if (prefix === "pending") pendingPage = page;
  else approvedPage = page;

  renderUsers();

  document
    .getElementById(prefix + "Table")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

loadUsers();
