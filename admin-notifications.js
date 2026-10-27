const adminToken = localStorage.getItem("admin_token");
const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

/* Writing an announcement is the owner's alone - the endpoint refuses
   everybody else, so the button is only shown to whoever it would work for. */
if (adminUser.role === "owner") {
  document.getElementById("createAnnouncementBtn").hidden = false;
}

/* ── The inbox ──────────────────────────────────────────────────────────────
   Rows come from api/notifications.php newest first, paged on id rather than
   an offset so a fan-out written inside one second cannot shuffle between
   pages. `link` arrives ready-made, so nothing here knows about event types. */

const PAGE_SIZE = 25;
let currentPage = 1;

// The rows on screen, kept so a click can open the message it already has
// rather than fetching the same row back again.
let pageRows = [];

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* created_ts is a Unix epoch from the server. The plain created_at string is
   server-local and would be read as browser-local, so it is display-only. */
function timeAgo(seconds) {
  if (!seconds) return "";

  const diff = Math.round(Date.now() / 1000) - seconds;

  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";

  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rowHtml(item) {
  const isAnnouncement = Boolean(item.announcement_id);
  const classes =
    "notif" +
    (item.read ? "" : " unread") +
    (isAnnouncement ? " is-announcement" : "");

  const inner = `
    <span class="notif-dot"></span>
    <div class="notif-text">
      <strong>${esc(item.title)}${item.read ? "" : `<em class="notif-new">New</em>`}</strong>
      ${item.body ? `<p>${esc(item.body)}</p>` : ""}
      ${
        isAnnouncement
          ? `<span class="notif-clip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        Open announcement</span>`
          : ""
      }
    </div>
    <time>${esc(timeAgo(item.created_ts))}</time>
  `;

  // An announcement has nowhere to link to and opens its own popup. Every
  // other row opens the detail popup instead of following its link, but keeps
  // the anchor so the destination is still visible and openable in a new tab.
  if (isAnnouncement) {
    return `<div class="${classes}" data-id="${item.id}" data-announcement="${item.announcement_id}">${inner}</div>`;
  }

  return item.link
    ? `<a class="${classes}" href="${esc(item.link)}" data-id="${item.id}">${inner}</a>`
    : `<div class="${classes}" data-id="${item.id}">${inner}</div>`;
}

function paintUnread(count) {
  const button = document.getElementById("markAllBtn");
  if (button) button.hidden = Number(count) <= 0;

  // Keep the sidebar badge in step without a reload.
  const badge = document.getElementById("notifBadge");
  if (!badge) return;

  const n = Number(count) || 0;
  badge.textContent = n > 9 ? "9+" : String(n);
  badge.hidden = n <= 0;
}

async function loadPage(page) {
  const list = document.getElementById("notifList");

  const url =
    "api/notifications.php?action=list&limit=" +
    PAGE_SIZE +
    "&page=" +
    encodeURIComponent(page || 1);

  try {
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (!data.success) {
      pageRows = [];
      list.innerHTML = `<div class="empty">${esc(data.message || "Unable to load notifications.")}</div>`;
      renderPager(0, 0, 0, 0);
      return;
    }

    const rows = data.notifications || [];
    pageRows = rows;

    // The server clamps the page to what exists, so this is the page actually
    // being shown, not the one that was asked for.
    currentPage = Number(data.page) || 1;

    if (!rows.length) {
      list.innerHTML = `<div class="empty">Nothing yet. New forms, appointments and responses will show up here.</div>`;
      renderPager(0, 0, 0, 0);
      paintUnread(data.unread);
      return;
    }

    list.innerHTML = rows.map(rowHtml).join("");

    renderPager(
      Number(data.total) || rows.length,
      Number(data.total_pages) || 1,
      (currentPage - 1) * PAGE_SIZE,
      rows.length,
    );

    paintUnread(data.unread);
  } catch (err) {
    pageRows = [];
    list.innerHTML = `<div class="empty">Connection error.</div>`;
    renderPager(0, 0, 0, 0);
  }
}

/* The pager, same control as the content and clients lists. Paging is
   server-side here, so a page change is a fetch rather than a slice of
   something already in memory. */
function goToPage(page) {
  // Whatever is open belongs to a row that is about to be replaced.
  closeAnnouncement();
  closeNotifDetail();
  loadPage(page);
  document
    .getElementById("notifList")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPager(total, totalPages, start, shown) {
  const pager = document.getElementById("notifPager");

  if (total <= PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("notifPagerInfo").innerText =
    `Showing ${start + 1}-${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("notifPagerPages").innerHTML = `
    <button type="button" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map(
        (page) => `
      <button type="button" class="${page === currentPage ? "current" : ""}"
              onclick="goToPage(${page})">${page}</button>
    `,
      )
      .join("")}
    <button type="button" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

/* ── The detail popup for everything that is not an announcement ──
   The row already holds the whole notification, so this opens what is in
   `pageRows` rather than asking the server for it again. */
function openNotifDetail(id) {
  const item = pageRows.find((row) => Number(row.id) === Number(id));
  if (!item) return;

  document.getElementById("notifDetailTitle").innerText =
    item.title || "Notification";
  document.getElementById("notifDetailBody").innerText =
    item.body || "No further details for this notification.";
  document.getElementById("notifDetailTime").innerText = item.created_at
    ? timeAgo(item.created_ts) + " · " + item.created_at
    : timeAgo(item.created_ts);

  // Only a notification that points somewhere gets the jump.
  const foot = document.getElementById("notifDetailFoot");
  const link = document.getElementById("notifDetailLink");

  if (item.link) {
    link.setAttribute("href", item.link);
    foot.hidden = false;
  } else {
    link.removeAttribute("href");
    foot.hidden = true;
  }

  document.getElementById("notifModal").classList.add("show");
}

function closeNotifDetail() {
  document.getElementById("notifModal").classList.remove("show");
}

/* The announcement popup. The row carries only an id; the message itself -
   description, date, image - comes from api/announcements.php, which checks
   the caller was actually sent it. */
let openAnnouncementId = null;

async function openAnnouncement(id) {
  const modal = document.getElementById("announcementModal");

  openAnnouncementId = id;

  try {
    const res = await fetch(
      "api/announcements.php?action=get&id=" + encodeURIComponent(id),
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );

    const data = await res.json();

    // A second click landed first, and this reply is for the older one.
    if (openAnnouncementId !== id) return;

    if (!data.success || !data.announcement) {
      modal.classList.remove("show");
      return;
    }

    const item = data.announcement;

    document.getElementById("announcementTitle").innerText = item.title || "";
    document.getElementById("announcementBody").innerText = item.body || "—";
    document.getElementById("announcementDate").innerText = formatDate(
      item.event_date,
    );
    document.getElementById("announcementSender").innerText =
      item.created_by_name || "—";
    document.getElementById("announcementSent").innerText = timeAgo(
      item.created_ts,
    );

    const panel = document.getElementById("announcementPanel");
    panel.className = "detail" + (item.image_path ? "" : " no-media");

    document.getElementById("announcementMedia").style.backgroundImage =
      item.image_path ? `url('${encodeURI(item.image_path)}')` : "";

    modal.classList.add("show");
  } catch (err) {
    modal.classList.remove("show");
  }
}

function closeAnnouncement() {
  openAnnouncementId = null;
  document.getElementById("announcementModal").classList.remove("show");
}

// Escape closes whichever popup is open.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeAnnouncement();
  closeNotifDetail();
});

/* event_date is a bare Y-m-d with no time, so it is split by hand rather than
   passed to Date(), which would read it as UTC midnight and slip a day. */
function formatDate(value) {
  if (!value) return "—";

  const parts = String(value).split("-");
  if (parts.length !== 3) return value;

  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
  ).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function markRead(id) {
  try {
    const res = await fetch("api/notifications.php?action=mark_read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (data.success) paintUnread(data.unread);
  } catch (err) {
    // The row still opens. Worst case it stays bold until the next load.
  }
}

async function markAllRead() {
  try {
    const res = await fetch("api/notifications.php?action=mark_all_read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: "{}",
    });

    const data = await res.json();

    if (data.success) {
      document
        .querySelectorAll("#notifList .notif.unread")
        .forEach((row) => row.classList.remove("unread"));
      document
        .querySelectorAll("#notifList .notif-new")
        .forEach((pill) => pill.remove());
      pageRows.forEach((row) => {
        row.read = true;
      });
      paintUnread(0);
    }
  } catch (err) {
    // Nothing changes on screen; the button is still there to retry.
  }
}

/* One delegated handler, so the rows a page change redraws are covered too.
   Nothing navigates from here any more: every row opens a popup, and the
   "New" pill goes with the unread state the click clears. */
document.getElementById("notifList").addEventListener("click", (event) => {
  const row = event.target.closest(".notif");
  if (!row) return;

  // The row may be an <a>; the popup replaces following it.
  event.preventDefault();

  const id = Number(row.dataset.id);

  if (row.classList.contains("unread")) {
    row.classList.remove("unread");
    const pill = row.querySelector(".notif-new");
    if (pill) pill.remove();

    const item = pageRows.find((entry) => Number(entry.id) === id);
    if (item) item.read = true;

    if (id) markRead(id);
  }

  const announcementId = Number(row.dataset.announcement);

  if (announcementId) {
    openAnnouncement(announcementId);
    return;
  }

  openNotifDetail(id);
});

loadPage(1);

/* The calendar belongs to the roles that deal with clients. A plain seo_admin
   works on content, so the link comes out of their sidebar. api/calendar.php
   and the page itself refuse the role too - this only hides a dead link. */
(function () {
  var CALENDAR_ROLES = ["owner", "super_admin", "account_manager"];

  var role = "";
  try {
    role =
      (JSON.parse(localStorage.getItem("admin_user") || "{}") || {}).role || "";
  } catch (e) {}

  if (!role || CALENDAR_ROLES.indexOf(role) !== -1) return;

  document
    .querySelectorAll('a[href*="admin-calendar.html"]')
    .forEach(function (link) {
      link.remove();
    });
})();
