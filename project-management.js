/*
|------------------------------------------------------------------------------
| Shared by the four Project Management pages
|------------------------------------------------------------------------------
|
| The same auth guard, escaping and date helpers every admin page needs. Kept
| inline per page, the way the rest of the portal does it, rather than as a
| fifth file in assets/.
|
*/

const adminToken = localStorage.getItem("admin_token");
let adminUser = {};

try {
  adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");
} catch (e) {}

// Every endpoint checks the token again; this only saves a pointless round trip.
if (!adminToken || !adminUser.role) {
  location.replace("admin-login.html");
}

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  sessionStorage.removeItem("sources_token");
  location.replace("admin-login.html");
}

/* Everything rendered through a template literal goes through this first -
   titles and client names are free text an admin typed. */
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch];
  });
}

let toastTimer = null;

function toast(message, bad) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("bad", !!bad);
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    box.classList.remove("show");
  }, 3200);
}

/* One place that knows the token goes on every request and that a non-JSON
   body (a PHP fatal, an HTML error page) is a failure and not a crash. */
async function api(url, options) {
  const config = Object.assign({}, options || {});
  config.headers = Object.assign({}, config.headers || {}, {
    Authorization: "Bearer " + adminToken,
  });

  const res = await fetch(url, config);
  let data = null;

  try {
    data = await res.json();
  } catch (e) {}

  if (!data) {
    return {
      success: false,
      message: "The server sent an unreadable response.",
    };
  }

  return data;
}

/* "Jul 1, 2026" - the format the mockups use everywhere a date is printed. */
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function fmtDate(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  return (
    MONTHS_SHORT[Number(parts[1]) - 1] +
    " " +
    Number(parts[2]) +
    ", " +
    parts[0]
  );
}

/* Short form for the summary tiles: "1 Jul", "Sep 15" in the mockup are the
   same date printed two ways, so this keeps one of them. */
function fmtDateShort(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  return MONTHS_SHORT[Number(parts[1]) - 1] + " " + Number(parts[2]);
}

function todayISO() {
  const now = new Date();
  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

/*
| The list is paged in the browser, the way admin-content.html and
| admin-calendar.html page theirs. The endpoint returns the whole scoped set
| and accepts the same filters server-side, so moving to a LIMIT later is an
| additive change rather than a rewrite.
*/

const PAGE_SIZE = 4;

let projects = [];
let filtered = [];
let page = 1;
let canCreate = false; // mirrors data.can_create, read by the empty state

function money(n) {
  return Number(n || 0).toLocaleString();
}

async function load() {
  const data = await api("api/projects.php");

  if (!data.success) {
    document.getElementById("rows").innerHTML =
      `<tr><td colspan="5" style="text-align:center;color:var(--brand);padding:30px">${esc(data.message)}</td></tr>`;
    return;
  }

  projects = data.projects || [];

  document.getElementById("statTotal").textContent = money(data.stats.total);
  document.getElementById("statActive").textContent = money(data.stats.active);
  document.getElementById("statCompleted").textContent = money(
    data.stats.completed,
  );
  document.getElementById("statUpcoming").textContent = money(
    data.stats.upcoming,
  );

  canCreate = !!data.can_create;
  document.getElementById("newProjectBtn").hidden = !canCreate;

  const clientSelect = document.getElementById("filterClient");
  (data.clients || []).forEach((client) => {
    const option = document.createElement("option");
    option.value = client.id;
    option.textContent = client.company_name || client.name;
    clientSelect.appendChild(option);
  });

  applyFilters();
}

function applyFilters() {
  const search = document
    .getElementById("filterSearch")
    .value.trim()
    .toLowerCase();
  const client = document.getElementById("filterClient").value;

  filtered = projects.filter((project) => {
    if (client && String(project.client_id) !== client) return false;

    if (search) {
      const haystack = (
        project.title +
        " " +
        (project.company_name || "") +
        " " +
        (project.client_name || "")
      ).toLowerCase();
      if (haystack.indexOf(search) === -1) return false;
    }

    return true;
  });

  page = 1;
  render();
}

/*
| Two different empty states, because they need two different things from the
| reader. Nothing here at all is a first-run screen and wants a way to create
| something; nothing matching is a dead end the filters caused, and wants a way
| back out of them.
*/
function showEmptyState() {
  const box = document.getElementById("emptyState");

  const filtering = projects.length > 0;

  const icon = filtering
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';

  let action = "";

  if (filtering) {
    action =
      '<button class="btn btn-ghost" type="button" onclick="clearFilters()">Clear filters</button>';
  } else if (canCreate) {
    // Only offered to the roles that may actually create one, the same rule
    // that decides whether the header button is there at all.
    action = '<a class="create-btn" href="project-form.html">New project</a>';
  }

  box.innerHTML =
    '<div class="icon">' +
    icon +
    "</div>" +
    "<h3>" +
    (filtering ? "No projects match those filters" : "No projects yet") +
    "</h3>" +
    "<p>" +
    (filtering
      ? "Nothing here matches the client or search you picked. Try widening it."
      : "Projects hold the timeline, the team and the task updates for a piece of client work.") +
    "</p>" +
    action;

  box.hidden = false;
  document.querySelector(".table-card").hidden = true;
  document.getElementById("pager").hidden = true;
}

function clearFilters() {
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterClient").value = "";
  applyFilters();
}

/*
| The three-dot menus. Re-bound on every render because the rows are replaced
| wholesale, and opening one closes any other - two menus open at once is
| never what was meant.
*/
function closeKebabs() {
  document.querySelectorAll(".kebab-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.querySelector(".kebab").setAttribute("aria-expanded", "false");
  });
}

function wireKebabs() {
  document.querySelectorAll(".kebab-wrap").forEach((wrap) => {
    wrap.querySelector(".kebab").addEventListener("click", function (event) {
      event.stopPropagation();
      const open = wrap.classList.contains("open");
      closeKebabs();
      if (!open) {
        wrap.classList.add("open");
        this.setAttribute("aria-expanded", "true");
      }
    });
  });
}

document.addEventListener("click", closeKebabs);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeKebabs();
});

function render() {
  const rows = document.getElementById("rows");
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (page > pages) page = pages;

  if (!total) {
    showEmptyState();
    return;
  }

  document.querySelector(".table-card").hidden = false;
  document.getElementById("emptyState").hidden = true;

  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  rows.innerHTML = slice
    .map(
      (project) => `
    <tr>
      <td>
        <span class="p-title" dir="auto">${esc(project.title)}</span>
        ${bucketPill(project.bucket)}
      </td>
      <td><span class="p-client" dir="auto">${esc(project.company_name || project.client_name || "—")}</span></td>
      <td class="col-timeline">
        <span class="timeline">
          ${esc(fmtDate(project.start_date))}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
          ${esc(fmtDate(project.end_date))}
        </span>
      </td>
      <td class="action">
        <span class="action-btns">
          <a class="btn btn-dark" href="project-details.html?id=${encodeURIComponent(project.id)}">View</a>
        </span>
      </td>
      <td class="menu-cell">${rowMenu(project)}</td>
    </tr>
  `,
    )
    .join("");

  wireKebabs();
  renderPager(total, pages, start, slice.length);
}

const BUCKET_LABELS = {
  active: "Active",
  upcoming: "Upcoming",
  completed: "Completed",
};

// The card's status pill on a phone; the CSS keeps it out of the desktop row.
function bucketPill(bucket) {
  if (!BUCKET_LABELS[bucket]) return "";
  return `<span class="p-bucket ${bucket}">${BUCKET_LABELS[bucket]}</span>`;
}

/*
| The three-dot menu beside View. It holds only what this admin may actually do
| with the row - the API decides that per project, since editing follows the
| account manager and deleting follows whoever created it - and an admin who may
| do neither gets no button at all rather than a menu that only says no.
*/
function rowMenu(project) {
  const items = [];

  if (project.can_edit) {
    items.push(`
      <a role="menuitem" href="project-form.html?id=${encodeURIComponent(project.id)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        Edit
      </a>`);
  }

  if (project.can_delete) {
    items.push(`
      <button class="danger" role="menuitem" type="button" onclick="removeProject(${Number(project.id)})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Delete
      </button>`);
  }

  /* A row with nothing to offer is marked so the CSS can hide the control
     while keeping the space it occupies on a desktop. */
  return `
    <div class="kebab-wrap${items.length ? "" : " view-only"}">
      <button class="kebab" type="button" aria-haspopup="menu" aria-expanded="false"
              aria-label="More actions for ${esc(project.title)}">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
      </button>
      <div class="kebab-menu" role="menu">${items.join("")}</div>
    </div>`;
}

/*
| Deleting from the list rather than from the project's own form: the row is the
| thing being removed, so the confirmation names it and the table drops it in
| place. api/projects.php takes its tasks and members with it.
*/
async function removeProject(id) {
  const project = projects.find((p) => Number(p.id) === Number(id));

  if (!project) return;

  closeKebabs();

  const ok = await askConfirm({
    title: "Delete project",
    text:
      '"' +
      project.title +
      '" will be deleted, along with every task on ' +
      "it and everyone assigned to it. This cannot be undone.",
    action: "Delete project",
  });

  if (!ok) return;

  const data = await api("api/projects.php?id=" + encodeURIComponent(id), {
    method: "DELETE",
  });

  toast(data.message, !data.success);

  if (!data.success) return;

  projects = projects.filter((p) => Number(p.id) !== Number(id));

  /* The cards are counted in SQL over the whole scope, so nothing on the page
     recomputes them. Reloading to refresh four numbers would re-append the
     client filter's options, so the row that left is subtracted instead - from
     the total and from whichever bucket the server put it in. */
  bumpStat("statTotal", -1);
  bumpStat(
    {
      active: "statActive",
      completed: "statCompleted",
      upcoming: "statUpcoming",
    }[project.bucket],
    -1,
  );

  /* applyFilters re-derives `filtered` and re-renders, which also pulls the
     page back when the last row on the last page was the one deleted. */
  applyFilters();
}

function bumpStat(id, by) {
  const el = id && document.getElementById(id);
  if (!el) return;

  const now = Number(String(el.textContent).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(now)) return;

  el.textContent = money(Math.max(0, now + by));
}

function renderPager(total, pages, start, shown) {
  const pager = document.getElementById("pager");

  document.getElementById("pagerInfo").textContent =
    `Showing ${start + 1} to ${start + shown} of ${total} project${total === 1 ? "" : "s"}`;

  const buttons = [];

  buttons.push(
    `<button type="button" onclick="goTo(${page - 1})" ${page === 1 ? "disabled" : ""} aria-label="Previous page">&lsaquo;</button>`,
  );

  for (let n = 1; n <= pages; n++) {
    buttons.push(
      `<button type="button" class="${n === page ? "current" : ""}" onclick="goTo(${n})">${n}</button>`,
    );
  }

  buttons.push(
    `<button type="button" onclick="goTo(${page + 1})" ${page === pages ? "disabled" : ""} aria-label="Next page">&rsaquo;</button>`,
  );

  document.getElementById("pagerPages").innerHTML = buttons.join("");
  pager.hidden = false;
}

function goTo(n) {
  page = n;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
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

document.getElementById("filterSearch").addEventListener("input", applyFilters);
document
  .getElementById("filterClient")
  .addEventListener("change", applyFilters);

load();
