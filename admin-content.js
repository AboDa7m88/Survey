const adminToken = localStorage.getItem("admin_token");
const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Content is open to both `admin` and `super_admin`; only these two links narrow.
// Clients Management is open to every admin, so the sidebar no longer hides it.

(function () {
  const name = adminUser.name || "Admin";
  const label =
    {
      owner: "Owner",
      super_admin: "Super Admin",
      account_manager: "Account Manager",
      seo_admin: "Admin",
    }[adminUser.role] || "";
  const initial = name.charAt(0).toUpperCase();
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set("adminName", name);
  set("adminRole", label);
  set("adminAvatar", initial);
  set("acctRole", label);
})();

let allContent = [];

/* Who is logged in, as the API sees it. The token is what identifies the
   admin, so the id and role come back with the content rather than being read
   out of localStorage - that keeps the two in step even after a re-login. */
let currentAdminId = null;
let currentAdminRole = null;

// The filter dropdowns: the client list, and the fixed nine content types.
let currentClient = "All";
let currentType = "All";
let selectedId = null;

// Twenty cards to a page - four lines of five on a desktop; the rest live
// behind the pager under the grid.
const PAGE_SIZE = 20;
let currentPage = 1;

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The caption comes back as HTML from the editor — strip anything the toolbar
// could not have produced before handing it to innerHTML. Text alignment is the
// one piece of styling the toolbar can set, so it is read off the node and put
// back after every other attribute is dropped.
const ALIGNMENTS = ["left", "center", "right", "justify"];

function sanitizeCaption(html) {
  const box = document.createElement("div");
  box.innerHTML = html || "";

  const allowed = [
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "UL",
    "OL",
    "LI",
    "A",
    "BR",
    "P",
    "DIV",
  ];

  box.querySelectorAll("*").forEach((node) => {
    // Unwrapping a script or style would leave its source behind as text.
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      node.remove();
      return;
    }

    if (!allowed.includes(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }

    // Browsers write alignment as either inline style or an align attribute.
    const align = (
      (node.style && node.style.textAlign) ||
      node.getAttribute("align") ||
      ""
    ).toLowerCase();

    [...node.attributes].forEach((attr) => {
      const keep =
        node.tagName === "A" &&
        attr.name === "href" &&
        !/^\s*(javascript|data|vbscript):/i.test(attr.value);
      if (!keep) node.removeAttribute(attr.name);
    });

    if (ALIGNMENTS.includes(align)) node.style.textAlign = align;

    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  return box.innerHTML;
}

/** The link shows as a "View link" action on the footer line, never a URL. */
function renderLink(item) {
  const slot = document.getElementById("linkSlot");

  slot.textContent = "";

  // Only http(s) reaches an href — the API normalises, but this page is the one
  // building the anchor.
  if (!item.link || !/^https?:\/\//i.test(item.link)) return;

  // A heading like the fields beside it, so the button lines up with their
  // values rather than floating against their labels.
  const heading = document.createElement("h5");
  heading.textContent = "Link";
  slot.appendChild(heading);

  const anchor = document.createElement("a");
  anchor.className = "view-link";
  anchor.href = item.link;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.title = item.link;
  anchor.textContent = "View link";

  slot.appendChild(anchor);
}

function formatTiming(item) {
  if (Number(item.publish_now) === 1) return "Published immediately";
  if (!item.post_date) return "Not scheduled";

  const time = (item.post_time || "00:00:00").slice(0, 5);
  const date = new Date(item.post_date + "T" + time);
  if (isNaN(date)) return "Not scheduled";

  return (
    date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    time
  );
}

/* When the post was created. MySQL hands back "YYYY-MM-DD HH:MM:SS", which
   only some browsers parse - the T is what makes it a valid date string
   everywhere. */
function formatStamp(value) {
  if (!value) return "—";

  const date = new Date(String(value).replace(" ", "T"));

  if (isNaN(date)) return String(value);

  return (
    date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    date.toTimeString().slice(0, 5)
  );
}

/* updated_at is set on insert too, so it only means an edit when it moved on
   from created_at. A minute's grace covers the save that created the row. */
function wasUpdated(item) {
  if (!item.updated_at || !item.created_at) return false;

  const created = new Date(String(item.created_at).replace(" ", "T"));
  const updated = new Date(String(item.updated_at).replace(" ", "T"));

  return !isNaN(created) && !isNaN(updated) && updated - created > 60 * 1000;
}

function cardTimes(item) {
  return `
    <div class="card-times">
      <span>Created ${esc(formatStamp(item.created_at))}</span>
      ${wasUpdated(item) ? `<span>Updated ${esc(formatStamp(item.updated_at))}</span>` : ""}
    </div>`;
}

async function loadContent() {
  const grid = document.getElementById("contentGrid");

  grid.innerHTML = `<div class="empty">Loading content...</div>`;

  try {
    const response = await fetch("api/admin-content.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (response.status === 401) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");

        window.location.href = "admin-login.html";

        return;
      }

      grid.innerHTML = `<div class="empty">${
        data.message || "Failed to load content."
      }</div>`;

      return;
    }

    allContent = data.content || [];

    currentAdminId = data.admin_id != null ? String(data.admin_id) : null;
    currentAdminRole = data.admin_role || null;

    // The owner, the account managers and the super admins create posts.
    document.getElementById("createBtn").hidden = !data.can_create;

    renderFilters();
    renderTypeFilter();

    // Keep the page the admin was on — a reload after a delete should not send
    // them back to page 1. applyFilters() clamps it if the page no longer exists.
    applyFilters(true);

    openLinkedContent();
  } catch (error) {
    console.error(error);

    grid.innerHTML = `<div class="empty">Connection error.</div>`;
  }
}

/* ?id=<content id> - opened from the calendar on a client's page
   (user-details.html). Shows that post's details once, then drops the
   parameter so a reload after an edit or delete is an ordinary visit. A post
   this admin may not read is not in allContent, and the page simply opens as
   usual. */
let linkedContentId = new URLSearchParams(location.search).get("id");

function openLinkedContent() {
  if (!linkedContentId) return;

  const id = linkedContentId;
  linkedContentId = null;
  history.replaceState(null, "", location.pathname);

  if (!allContent.some((item) => String(item.id) === String(id))) return;

  selectContent(id);
  document
    .getElementById("detailWrap")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Every post belongs to a client, so the filter is the list of companies that
   have content. Posts saved before a client was compulsory have none; they show
   under All rather than getting an entry of their own. */
function renderFilters() {
  const select = document.getElementById("clientFilter");

  const clients = [
    ...new Set(
      allContent.map((item) => (item.client || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  // The chosen company can disappear when its last post is deleted.
  if (currentClient !== "All" && !clients.includes(currentClient)) {
    currentClient = "All";
  }

  select.innerHTML =
    `<option value="All">All clients</option>` +
    clients
      .map((client) => `<option value="${esc(client)}">${esc(client)}</option>`)
      .join("");

  select.value = currentClient;
}

function filterByClient(client) {
  currentClient = client;
  applyFilters();
}

/* ── Content type filter ────────────────────────────────────────────────────
   The nine types the content form offers, named after the icons in
   assets/icon. Posts written before the list settled carry their own type
   label; matching on the label as well as the id keeps those findable. */

const TYPE_TITLES = [
  "Articles",
  "Campaign",
  "Design",
  "Events",
  "Photos",
  "Reports",
  "Social Media",
  "Training",
  "Videos",
];

function typeIdFor(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function renderTypeFilter() {
  const select = document.getElementById("typeFilter");

  select.innerHTML =
    `<option value="All">All types</option>` +
    TYPE_TITLES.map(
      (title) =>
        `<option value="${esc(typeIdFor(title))}">${esc(title)}</option>`,
    ).join("");

  select.value = currentType;
}

function filterByType(type) {
  currentType = type;
  applyFilters();
}

function matchesType(item) {
  if (currentType === "All") return true;
  if ((item.content_type || "") === currentType) return true;

  // A post saved with a label but no matching id still belongs under its type.
  return typeIdFor(item.type_label || "") === currentType;
}

// A new search or tab starts at page 1; paging itself keeps the page it set.
document
  .getElementById("contentSearch")
  .addEventListener("input", () => applyFilters());

function applyFilters(keepPage) {
  const search = document
    .getElementById("contentSearch")
    .value.toLowerCase()
    .trim();

  let filtered = allContent;

  if (currentClient !== "All") {
    filtered = filtered.filter(
      (item) => (item.client || "").trim() === currentClient,
    );
  }

  filtered = filtered.filter(matchesType);

  if (search) {
    filtered = filtered.filter(
      (item) =>
        (item.title || "").toLowerCase().includes(search) ||
        (item.type_label || "").toLowerCase().includes(search) ||
        (item.platform || "").toLowerCase().includes(search) ||
        (item.client || "").toLowerCase().includes(search),
    );
  }

  if (!keepPage) currentPage = 1;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Deleting the last card on the last page would otherwise leave an empty grid.
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  renderGrid(pageItems);
  renderPager(filtered.length, totalPages, start, pageItems.length);

  const stillVisible = pageItems.some(
    (item) => String(item.id) === String(selectedId),
  );
  selectContent(
    stillVisible ? selectedId : pageItems[0] ? pageItems[0].id : null,
  );
}

function goToPage(page) {
  currentPage = page;
  applyFilters(true);

  // The grid is above the pager, so jump back to the top of the new page.
  document
    .getElementById("contentGrid")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPager(total, totalPages, start, shown) {
  const pager = document.getElementById("pager");

  if (total <= PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("pagerInfo").innerText =
    `Showing ${start + 1}–${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("pagerPages").innerHTML = `
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

/* What this admin may do with a post comes with the row - canEditContent() and
   canDeleteContent() in api/admin-content.php. The owner and the account
   managers get both; a teammate assigned to a post fills it in, so they get
   Edit but no Delete on a post someone else created. */
function cardActions(item) {
  if (!item.can_edit && !item.can_delete) return "";

  return `
    <div class="card-actions">
      ${item.can_edit ? `<a href="admin-content-form.html?id=${esc(item.id)}">Edit</a>` : ""}
      ${
        item.can_delete
          ? `<button class="danger" type="button"
              onclick="deleteContent('${esc(item.id)}','${esc(item.title)}')">Delete</button>`
          : ""
      }
    </div>`;
}

/* "Instagram · Reel", or whichever half the post has - a task saved with only
   a title has neither yet. */
function eyebrowFor(item) {
  return [item.platform, item.type_label].filter(Boolean).join(" · ");
}

function renderGrid(items) {
  const grid = document.getElementById("contentGrid");

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No content found.</div>`;
    return;
  }

  grid.innerHTML = items
    .map(
      (item) => `
    <div class="card ${String(item.id) === String(selectedId) ? "selected" : ""}"
         data-id="${esc(item.id)}">
      <div class="card-img" onclick="selectContent('${esc(item.id)}')"
           style="${item.media_path ? `background-image:url('${esc(item.media_path)}')` : ""}">
        <span class="badge ${esc(item.status)}">${esc(item.status)}</span>
      </div>
      <div class="card-body" onclick="selectContent('${esc(item.id)}')">
        <div class="card-eyebrow">${esc(eyebrowFor(item)) || "&nbsp;"}</div>
        <h3>${esc(item.title)}</h3>
        ${cardTimes(item)}
      </div>
      ${cardActions(item)}
    </div>
  `,
    )
    .join("");
}

/* The detail panel's images: the first one large, and - when there is more
   than one - a strip of buttons that swaps which one is large. The lightbox
   reads the large box's background when clicked, so it opens whichever image
   is showing. Rows from before a post could hold several have only media_path. */
function renderGallery(item) {
  const media = document.getElementById("detailMedia");
  const thumbs = document.getElementById("detailThumbs");

  const images = Array.isArray(item.images)
    ? item.images
    : item.media_path
      ? [item.media_path]
      : [];

  const show = (index) => {
    media.style.backgroundImage = images[index]
      ? `url('${images[index]}')`
      : "";
    thumbs.querySelectorAll(".detail-thumb").forEach((button, i) => {
      button.classList.toggle("active", i === index);
      button.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
  };

  thumbs.innerHTML =
    images.length > 1
      ? images
          .map(
            (src, index) => `
        <button class="detail-thumb" type="button" data-index="${index}"
                style="background-image:url('${esc(src)}')"
                aria-label="Show image ${index + 1} of ${images.length}"></button>
      `,
          )
          .join("")
      : "";

  thumbs.querySelectorAll(".detail-thumb").forEach((button) => {
    button.addEventListener("click", () => show(Number(button.dataset.index)));
  });

  show(0);
}

function selectContent(id) {
  const wrap = document.getElementById("detailWrap");

  if (id == null) {
    selectedId = null;
    wrap.style.display = "none";
    return;
  }

  const item = allContent.find((entry) => String(entry.id) === String(id));
  if (!item) return;

  selectedId = item.id;

  document.querySelectorAll("#contentGrid .card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.id === String(selectedId));
  });

  wrap.style.display = "block";

  document.getElementById("detailEyebrow").innerText = eyebrowFor(item);
  document.getElementById("detailTitle").innerText = item.title || "";

  // One markup block — the orientation class is what swaps the layout.
  const panel = document.getElementById("detailPanel");
  panel.className =
    "detail " +
    (item.orientation === "vertical" ? "is-vertical" : "is-horizontal");

  renderGallery(item);

  // Alignment travels with the caption HTML, set on the editor's toolbar.
  document.getElementById("detailCaption").innerHTML =
    sanitizeCaption(item.caption) || "—";

  renderLink(item);

  document.getElementById("detailClient").innerText = item.client || "—";

  // The email identifies the author unambiguously; the name is only the
  // fallback for rows whose admin account no longer exists.
  document.getElementById("detailCreatedBy").innerText =
    item.created_by_email || item.created_by || "—";
  document.getElementById("detailAssignees").innerText =
    (item.assignees || [])
      .map((person) => person.name || person.email)
      .join(", ") || "—";
  document.getElementById("detailScheduled").innerText = formatTiming(item);
  document.getElementById("detailCreated").innerText = formatStamp(
    item.created_at,
  );
  document.getElementById("detailUpdated").innerText = formatStamp(
    item.updated_at,
  );
  document.getElementById("detailUpdatedField").hidden = !wasUpdated(item);
}

async function deleteContent(id, title) {
  const ok = await askConfirm({
    title: "Delete content",
    text: `“${title}” will be deleted, along with its image. This cannot be undone.`,
    action: "Delete content",
    word: "DELETE",
  });

  if (!ok) return;

  try {
    const response = await fetch(
      `api/admin-content.php?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + adminToken,
        },
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert(data.message || "Could not delete content.");

      return;
    }

    if (String(selectedId) === String(id)) {
      selectedId = null;
    }

    await loadContent();

    document.getElementById("detailWrap").style.display = "none";
  } catch (error) {
    console.error(error);

    alert("Connection error.");
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "admin-login.html";
}

loadContent();

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
