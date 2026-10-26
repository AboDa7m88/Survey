const token = localStorage.getItem("portal_token");

if (!token) {
  window.location.href = "login.html";
}

const user = JSON.parse(localStorage.getItem("portal_user") || "{}");
document.getElementById("sideName").innerText = user.name || "User";
setAvatarImage(user);

let allContent = [];
let selectedId = null;

// Six cards to a page; the rest live behind the pager under the grid.
const PAGE_SIZE = 6;
let currentPage = 1;

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Captions are stored as HTML from the admin editor. The API sanitises them, but
// this page is the one calling innerHTML — strip anything unexpected here too.
// Text alignment is the one piece of styling the toolbar can set, so it is read
// off the node and put back after every other attribute is dropped.
const ALIGNMENTS = ["left", "center", "right", "justify"];

function sanitizeCaption(html) {
  /* Parsed into a <template>, not a <div>: a template's content lives in an
   inert document, so an <img src=x onerror=...> in here never loads and
   never fires. A live element would run the handler while this function was
   still busy stripping it - the returned markup was clean either way, but
   the payload had already gone off. */
  const frame = document.createElement("template");
  frame.innerHTML = html || "";
  const box = frame.content;

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

  return frame.innerHTML;
}

/** The link shows as a "View link" action on the footer line, never a URL. */
function renderLink(item) {
  const slot = document.getElementById("linkSlot");

  slot.textContent = "";

  // Only http(s) reaches an href — the API normalises, but this page is the one
  // building the anchor.
  if (!item.link || !/^https?:\/\//i.test(item.link)) return;

  // A heading like the field beside it, so the button lines up with its value
  // rather than floating against its label.
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

// The user endpoint returns published content only, with `created_by` already
// resolved to the admin's name.
async function loadContent() {
  const grid = document.getElementById("contentGrid");
  grid.innerHTML = `<div class="empty">Loading content...</div>`;

  try {
    const res = await fetch("api/user-content.php", {
      headers: { Authorization: "Bearer " + token },
    });

    // A stale session should send the user back to login, not show an error.
    if (res.status === 401) {
      localStorage.removeItem("portal_token");
      localStorage.removeItem("portal_user");
      window.location.href = "login.html";
      return;
    }

    const data = await res.json();

    allContent = (data.success && data.content) || [];

    if (!allContent.length) {
      grid.innerHTML = `<div class="empty">No content published yet.</div>`;
      return;
    }

    // A notification or a "Latest content" card on forms.html links here as
    // ?id=. Start on the page that post sits on, so applyFilters keeps it
    // selected instead of falling back to the first card.
    const linkedId = new URLSearchParams(location.search).get("id");
    const linkedIndex = linkedId
      ? allContent.findIndex((item) => String(item.id) === String(linkedId))
      : -1;

    if (linkedIndex >= 0) {
      selectedId = linkedId;
      currentPage = Math.floor(linkedIndex / PAGE_SIZE) + 1;
      applyFilters(true);

      // Straight to the post itself. A frame later, so the panel has been
      // shown and laid out before the page measures where it is.
      requestAnimationFrame(() => {
        document
          .getElementById("detailWrap")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    applyFilters();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty">Failed to load content.</div>`;
  }
}

/* ── Content type filter ────────────────────────────────────────────────────
 The same nine types the content form offers, named after the icons in
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

let currentType = "All";

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

  return typeIdFor(item.type_label || "") === currentType;
}

renderTypeFilter();

// A new search or filter starts at page 1; paging itself keeps the page it set.
document
  .getElementById("contentSearch")
  .addEventListener("input", () => applyFilters());

function applyFilters(keepPage) {
  const search = document
    .getElementById("contentSearch")
    .value.toLowerCase()
    .trim();

  let filtered = allContent.filter(matchesType);

  if (search) {
    filtered = filtered.filter(
      (item) =>
        (item.title || "").toLowerCase().includes(search) ||
        (item.type_label || "").toLowerCase().includes(search) ||
        (item.platform || "").toLowerCase().includes(search),
    );
  }

  if (!keepPage) currentPage = 1;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  renderGrid(pageItems);
  renderPager(filtered.length, totalPages, start, pageItems.length);

  // Keep the current selection when it survives the filter, otherwise take the first.
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
         data-id="${esc(item.id)}" onclick="selectContent('${esc(item.id)}')">
      <div class="card-img" style="${item.media_path ? `background-image:url('${esc(item.media_path)}')` : ""}"></div>
      <div class="card-body">
        <div class="card-eyebrow">${esc(eyebrowFor(item)) || "&nbsp;"}</div>
        <h3>${esc(item.title)}</h3>
        ${cardTimes(item)}
      </div>
    </div>
  `,
    )
    .join("");
}

/* "Instagram · Reel", or whichever half the post has. */
function eyebrowFor(item) {
  return [item.platform, item.type_label].filter(Boolean).join(" · ");
}

/* The detail panel's images: the first one large, and - when there is
 more than one - a strip of buttons that swaps which one is large. The
 lightbox reads the large box's background when clicked, so it opens
 whichever image is showing. Older rows have only media_path. */
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

  document.getElementById("detailScheduled").innerText = formatTiming(item);
  document.getElementById("detailCreated").innerText = formatStamp(
    item.created_at,
  );
  document.getElementById("detailUpdated").innerText = formatStamp(
    item.updated_at,
  );
  document.getElementById("detailUpdatedField").hidden = !wasUpdated(item);
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

loadContent();
