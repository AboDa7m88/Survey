/*
|------------------------------------------------------------------------------
| Inquiries: one inquiry, read-only
|------------------------------------------------------------------------------
|
| Two fetches, no new endpoints: api/admin-inquiries.php?id= for the inquiry
| itself and api/admin-inquiry-responses.php for what came back.
|
| Every response lives here, five to a page and collapsed to one line each. The
| newest starts open, because that is the one anybody arriving here wants; a
| link from the list carrying #response-41 opens that one instead, on whatever
| page it falls.
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

if (adminUser.role !== "owner" && adminUser.role !== "account_manager") {
  window.location.href = "admin.html";
}

const isOwner = adminUser.role === "owner";
const inquiryId = Number(
  new URLSearchParams(window.location.search).get("id") || 0,
);

// Responses are paged in the browser, five at a time - the whole set arrives
// in one fetch and the card slices it.
const PER_PAGE = 5;

let inquiryName = "";
let fields = [];
let responses = [];
/* Set only when the URL names a response to open. Nothing else scrolls the
   page off the summary card it is supposed to start on. */
let scrollToOpen = false;
let respPage = 1;
let openId = null;

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

function block(message) {
  const box = document.getElementById("blocked");
  box.innerHTML = `
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg>
    </div>
    <h3>${WZI.escapeHtml(message)}</h3>
    <a class="btn btn-ghost" href="inquiries.html">Back to inquiries</a>
  `;
  box.hidden = false;
}

/* ── The inquiry ─────────────────────────────────────────────────────────── */

async function loadInquiry() {
  if (!inquiryId) {
    block("No inquiry was named in the link.");
    return;
  }

  try {
    const res = await fetch("api/admin-inquiries.php?id=" + inquiryId, {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();

    if (!data.success) {
      block(data.message || "Unable to load this inquiry.");
      return;
    }

    fill(data.inquiry);
  } catch (error) {
    block("Connection error.");
  }
}

function fill(inq) {
  inquiryName = inq.slug || "";

  document.title = inq.title + " - Inquiry";
  /* Carried as a title attribute too: on a phone this line is clipped to one
     line with an ellipsis, and that is the only way to read the rest. */
  const headName = document.getElementById("headName");
  headName.textContent = inq.title;
  headName.title = inq.title;
  document.getElementById("vTitle").textContent = inq.title;

  const status = document.getElementById("vStatus");
  const inactive = inq.status === "inactive";
  status.textContent = inactive ? "Inactive" : "Active";
  status.className = "pill " + (inactive ? "pill-inactive" : "pill-active");

  const desc = String(inq.intro_text || "").trim();
  document.getElementById("descRow").hidden = !desc;
  document.getElementById("vDesc").textContent = desc;

  document.getElementById("vManager").innerHTML = inq.account_manager_name
    ? `<div class="who">
         <div class="who-avatar">${WZI.escapeHtml(WZI.initials(inq.account_manager_name))}</div>
         <div>
           <div class="who-name" dir="auto">${WZI.escapeHtml(inq.account_manager_name)}</div>
           ${inq.account_manager_email ? `<div class="who-sub">${WZI.escapeHtml(inq.account_manager_email)}</div>` : ``}
         </div>
       </div>`
    : `<div class="f-value t-muted">Nobody assigned</div>`;

  document.getElementById("vCreated").textContent = WZI.fmtDateTime(
    inq.created_at,
  );

  /* The office's own handle for this inquiry. Never shown on the public form. */
  const reference = document.getElementById("vReference");
  reference.textContent = inq.reference || "Not set";
  reference.classList.toggle("t-muted", !inq.reference);

  document.getElementById("vLink").textContent = WZI.publicLink(inquiryName);

  if (inactive) {
    document.getElementById("linkHint").textContent =
      "This inquiry is inactive, so its link is closed. Set it back to active to reopen it.";
  }

  if (isOwner) {
    const edit = document.getElementById("editBtn");
    edit.href = "inquiry-form.html?id=" + inquiryId;
    edit.hidden = false;
  }

  document.getElementById("summaryCard").hidden = false;
}

function copyLink() {
  WZI.copyLink(inquiryName);
}

/* ── What came back ──────────────────────────────────────────────────────── */

async function loadResponses() {
  if (!inquiryId) return;

  try {
    const res = await fetch(
      "api/admin-inquiry-responses.php?inquiry_id=" + inquiryId,
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );
    const data = await res.json();

    if (!data.success) return;

    renderResponses(data.fields || [], data.responses || []);
  } catch (error) {
    /* The summary card above is the point of this page; a responses list that
       could not load is not worth an error banner of its own. */
  }
}

function renderResponses(fieldList, list) {
  fields = fieldList;
  responses = list;

  const card = document.getElementById("responsesCard");
  const sub = document.getElementById("respSub");

  card.hidden = false;

  if (!responses.length) {
    sub.textContent = "Nobody has answered yet.";
    document.getElementById("respPager").hidden = true;
    document.getElementById("respList").innerHTML = `
      <div class="empty-state" style="box-shadow:none;padding:34px 20px">
        <div class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3>No one has answered yet</h3>
        <p>Copy a link from the box above and send it to the person you want to hear from.</p>
        <button class="btn btn-ghost" type="button" onclick="copyLink()">Copy a link</button>
      </div>
    `;
    return;
  }

  const count = responses.length;
  sub.textContent =
    count +
    (count === 1 ? " person has" : " people have") +
    " submitted this inquiry so far.";

  /* Landing on #response-41 from the list has to open that answer, which may
     be on any page - so the page is worked out from where it sits. */
  const wanted = window.location.hash.replace("#", "");
  const at =
    wanted.indexOf("response-") === 0
      ? responses.findIndex((r) => "response-" + r.id === wanted)
      : -1;

  if (at > -1) {
    respPage = Math.floor(at / PER_PAGE) + 1;
    openId = responses[at].id;
    /* Only a URL naming a response is a request to be taken to it. */
    scrollToOpen = true;
  } else {
    // Otherwise the newest is the one open, because it is the one anybody
    // arriving here came to read - open, but not scrolled to. This page starts
    // at the top, on the summary card.
    openId = responses[0].id;
  }

  renderPage();
}

function renderPage() {
  const total = responses.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  if (respPage > pages) respPage = pages;

  const start = (respPage - 1) * PER_PAGE;
  const slice = responses.slice(start, start + PER_PAGE);

  document.getElementById("respList").innerHTML = slice
    .map((response, i) => item(response, start + i))
    .join("");

  renderRespPager(total, pages, start, slice.length);

  /* One-shot: the deep link is honoured on the render it arrived for, and
     paging through the answers afterwards does not re-trigger it. */
  if (openId && scrollToOpen) {
    scrollToOpen = false;
    const el = document.getElementById("response-" + openId);
    if (el) el.scrollIntoView({ block: "nearest" });
  }
}

function item(response, index) {
  const who = WZI.identify(fields, response.answers, index);
  const open = Number(response.id) === Number(openId);

  const cells = fields
    .map((field) => {
      const answer = String((response.answers || {})[field.id] || "").trim();
      const wide = field.field_type === "textarea";

      return `
      <div class="${wide ? "full" : ""}">
        <span class="f-label" dir="auto">${WZI.escapeHtml(field.field_label)}</span>
        <div class="f-value${wide ? " pre" : ""}">${WZI.answerHtml(field.field_label, answer)}</div>
      </div>
    `;
    })
    .join("");

  return `
    <div class="resp${open ? " open" : ""}" id="response-${response.id}">
      <a class="resp-head" href="inquiry-response.html?id=${response.id}"
         aria-expanded="${open ? "true" : "false"}" aria-controls="body-${response.id}"
         onclick="return openResponse(event, this, ${response.id})">
        <span class="who">
          <span class="who-avatar lg">${WZI.escapeHtml(who.initials)}</span>
          <span>
            <span class="who-name" dir="auto">${WZI.escapeHtml(who.name)}</span>
            ${who.sub ? `<span class="who-sub" dir="auto">${WZI.escapeHtml(who.sub)}</span>` : ``}
          </span>
        </span>
        <span class="resp-when">${response.source === "mcp" ? `<span class="via-ai">via AI assistant</span>` : ``}${WZI.fmtDateTime(response.submitted_at)}</span>
        <svg class="resp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </a>
      <div class="resp-body" id="body-${response.id}">
        <div class="f-grid" style="margin-bottom:0">${cells}</div>
      </div>
    </div>
  `;
}

/*
| The head is an <a> pointing at inquiry-response.html, so it works with no
| script, opens in a new tab and reads as a link. Wide enough to show the
| answers in place, that navigation is cancelled and the disclosure opens
| instead - a phone has no room for that, and follows the link.
|
| DRAWER matches the breakpoint assets/shell.css uses for the same reason.
*/
const DRAWER = 768;

function openResponse(event, link, id) {
  if (window.innerWidth <= DRAWER) return true;

  event.preventDefault();
  toggleResponse(link, id);
  return false;
}

/* One at a time: two long answers open at once turns the card into a wall,
   and the point of the list is scanning who answered. */
function toggleResponse(button, id) {
  const box = document.getElementById("response-" + id);

  // Paging replaces the list, so an id from a page that is no longer on screen
  // simply has nothing to toggle.
  if (!box) return;

  const wasOpen = box.classList.contains("open");

  document.querySelectorAll("#respList .resp.open").forEach((el) => {
    el.classList.remove("open");
    el.querySelector(".resp-head").setAttribute("aria-expanded", "false");
  });

  openId = wasOpen ? null : id;

  if (!wasOpen) {
    box.classList.add("open");
    button.setAttribute("aria-expanded", "true");
  }
}

function renderRespPager(total, pages, start, shown) {
  const pager = document.getElementById("respPager");

  if (pages < 2) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("respPagerInfo").textContent =
    "Showing " +
    (start + 1) +
    " to " +
    (start + shown) +
    " of " +
    total +
    " responses";

  let html = `<button type="button" ${respPage === 1 ? "disabled" : ""} onclick="goToResponses(${respPage - 1})" aria-label="Previous page">&lsaquo;</button>`;

  for (let n = 1; n <= pages; n++) {
    html += `<button type="button" class="${n === respPage ? "current" : ""}" onclick="goToResponses(${n})">${n}</button>`;
  }

  html += `<button type="button" ${respPage === pages ? "disabled" : ""} onclick="goToResponses(${respPage + 1})" aria-label="Next page">&rsaquo;</button>`;

  document.getElementById("respPagerPages").innerHTML = html;
}

function goToResponses(n) {
  respPage = n;
  openId = null;
  renderPage();
  document
    .getElementById("responses")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

loadInquiry();
loadResponses();
