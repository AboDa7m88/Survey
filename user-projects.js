/*
|------------------------------------------------------------------------------
| Shared by the two client Project pages
|------------------------------------------------------------------------------
|
| The portal guard, the fetch wrapper and the date helpers. Kept inline per
| page, the way the rest of the portal does it.
|
*/

const token = localStorage.getItem("portal_token");

if (!token) {
  window.location.href = "login.html";
}

const user = JSON.parse(localStorage.getItem("portal_user") || "{}");

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[ch];
  });
}

/* One place that knows the token goes on every request, that a stale session
   is a redirect rather than an error, and that a non-JSON body (a PHP fatal,
   an HTML error page) is a failure and not a crash. The other client pages
   inline this handling around a bare fetch; these two are the first with two
   fetch-driven views, so it is worth a wrapper. */
async function api(url) {
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });

  if (res.status === 401) {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    window.location.href = "login.html";
    return { success: false, message: "Session expired." };
  }

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

/* "Jul 1, 2026" - the format the rest of the portal prints a date in. */
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

function setAvatarImage(user) {
  const avatar = document.getElementById("sideAvatar");
  if (!avatar) return;

  if (user.profile_image) {
    avatar.innerText = "";
    avatar.style.backgroundImage = `url('${user.profile_image}')`;
  } else {
    avatar.innerText = (user.name || "User").charAt(0).toUpperCase();
    avatar.style.backgroundImage = "";
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

document.getElementById("sideName").innerText = user.name || "User";
setAvatarImage(user);

/*
| The list is paged in the browser, the way content.html and the admin's own
| project list page theirs. The endpoint returns everything in scope and
| accepts the same filters server-side, so moving to a LIMIT later is an
| additive change rather than a rewrite.
*/

const PAGE_SIZE = 4;

let projects = [];
let filtered = [];
let page = 1;

function money(n) {
  return Number(n || 0).toLocaleString();
}

async function load() {
  const data = await api("api/user-projects.php");

  if (!data.success) {
    document.getElementById("rows").innerHTML =
      `<tr><td colspan="4" style="text-align:center;color:var(--brand);padding:30px">${esc(data.message)}</td></tr>`;
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

  const typeSelect = document.getElementById("filterType");
  (data.types || []).forEach((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.label;
    typeSelect.appendChild(option);
  });

  applyFilters();
}

function applyFilters() {
  const search = document
    .getElementById("filterSearch")
    .value.trim()
    .toLowerCase();
  const type = document.getElementById("filterType").value;

  filtered = projects.filter((project) => {
    if (type && project.project_type !== type) return false;

    if (search && project.title.toLowerCase().indexOf(search) === -1)
      return false;

    return true;
  });

  page = 1;
  render();
}

/*
| Two different empty states, because they need two different things from the
| reader. Nothing here at all is a first-run screen with no action attached -
| projects are created for a client, never by one. Nothing matching is a dead
| end the filters caused, and wants a way back out of them.
*/
function showEmptyState() {
  const box = document.getElementById("emptyState");

  const filtering = projects.length > 0;

  const icon = filtering
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';

  box.innerHTML =
    '<div class="icon">' +
    icon +
    "</div>" +
    "<h3>" +
    (filtering ? "Nothing matches those filters" : "No projects yet") +
    "</h3>" +
    "<p>" +
    (filtering
      ? "Nothing here matches the type or the search you picked. Try widening it."
      : "When work starts for you, it appears here with its timeline, its progress and the updates published against it.") +
    "</p>" +
    (filtering
      ? '<button class="btn btn-ghost" type="button" onclick="clearFilters()">Clear filters</button>'
      : "");

  box.hidden = false;
  document.querySelector(".table-card").hidden = true;
  document.getElementById("pager").hidden = true;
}

function clearFilters() {
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterType").value = "";
  applyFilters();
}

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
      <td class="col-type"><span class="p-type">${esc(project.type_label)}</span></td>
      <td class="col-timeline">
        <span class="timeline">
          ${esc(fmtDate(project.start_date))}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
          ${esc(fmtDate(project.end_date))}
        </span>
      </td>
      <td class="action">
        <a class="btn btn-ghost" href="user-project-details.html?id=${encodeURIComponent(project.id)}">View Details</a>
      </td>
    </tr>
  `,
    )
    .join("");

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

document.getElementById("filterSearch").addEventListener("input", applyFilters);
document.getElementById("filterType").addEventListener("change", applyFilters);

load();
