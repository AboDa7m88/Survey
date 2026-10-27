let adminToken = localStorage.getItem("admin_token");
let adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* A client is named by its company, as the tables on this page already do;
   the person's name stands in only when no company was given. */
function clientLabel(user) {
  return (
    String(user.company_name || "").trim() || user.name || "Unnamed client"
  );
}

/* ── Status vocabulary ───────────────────────────────────────────────────────
   Three states are shown anywhere a form's status appears: Pending, Completed,
   Rejected. The database still carries 'pending_review' for the review gate,
   but outside the Form Review queue that is just another kind of pending -
   nobody waiting on a form cares which desk it is sitting on. */

function displayStatus(status) {
  return status === "pending_review" ? "pending" : status;
}

const statusMeta = {
  pending: { label: "Pending", cls: "pending" },
  rejected: { label: "Rejected", cls: "rejected" },
  completed: { label: "Completed", cls: "approved" },
};

/* ── The row kebab ──────────────────────────────────────────────────────────
   A phone has room for Form, Client and one control, so below 768px the row's
   View button is swapped for this and the actions move into a menu. The button
   is in the markup on every screen; shell.css's breakpoint decides which of the
   two is on show, so nothing has to re-render when the window is resized.

   The menu is one element reused by every row, positioned under whichever
   button was pressed - a menu per row would be hundreds of hidden nodes. */

function kebabButton(surveyId, kind) {
  return `
    <button class="row-kebab" type="button" aria-haspopup="true" aria-expanded="false"
            aria-label="Actions" onclick="openRowMenu(event, ${Number(surveyId)}, '${kind}')">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
      </svg>
    </button>
  `;
}

let rowMenuButton = null;

function rowMenuEl() {
  let menu = document.getElementById("rowMenu");

  if (!menu) {
    menu = document.createElement("div");
    menu.id = "rowMenu";
    menu.className = "row-menu";
    menu.hidden = true;
    document.body.appendChild(menu);
  }

  return menu;
}

function openRowMenu(event, surveyId, kind) {
  event.stopPropagation();

  const button = event.currentTarget;

  // Second press on the same row closes it, the way the button's own toggle
  // state suggests it should.
  if (rowMenuButton === button) {
    closeRowMenu();
    return;
  }

  closeRowMenu();

  /* Exactly what the row offers on a desktop, which is one action. Send Again,
     View Responses, Approve and Reject all live inside the modal this opens -
     the phone is the same page in a narrower column, not a different set of
     rules about where a form is acted on. */
  const label = kind === "review" && canReview ? "Review form" : "View form";

  const items = [
    `<button type="button" onclick="runRowAction(() => openReview(${Number(surveyId)}))">${label}</button>`,
  ];

  const menu = rowMenuEl();
  menu.innerHTML = items.join("");
  menu.hidden = false;

  placeRowMenu(menu, button);

  button.setAttribute("aria-expanded", "true");
  rowMenuButton = button;

  // preventScroll: the menu is fixed and already on screen, and a scroll here
  // would trip the listener below and close what was just opened.
  const first = menu.querySelector("button, a");
  if (first) first.focus({ preventScroll: true });
}

/* position:fixed, so the box is measured against the viewport and never
   clipped by the panel's own overflow:hidden. Right-aligned under the button,
   and flipped above it when the row is near the bottom of the screen. */
function placeRowMenu(menu, button) {
  const rect = button.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  const gap = 6;

  let left = rect.right - box.width;
  left = Math.min(Math.max(8, left), window.innerWidth - box.width - 8);

  const below = rect.bottom + gap;
  const top =
    below + box.height > window.innerHeight - 8
      ? Math.max(8, rect.top - gap - box.height)
      : below;

  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function closeRowMenu() {
  const menu = document.getElementById("rowMenu");
  if (menu) menu.hidden = true;

  if (rowMenuButton) rowMenuButton.setAttribute("aria-expanded", "false");
  rowMenuButton = null;
}

/* Every menu item closes the menu before it does anything, so the box is never
   left floating over the modal it just opened. */
function runRowAction(action) {
  closeRowMenu();
  action();
}

document.addEventListener("click", closeRowMenu);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeRowMenu();
});
window.addEventListener("resize", closeRowMenu);

// The menu is position:fixed and the page scrolls behind it, so it would
// otherwise drift away from its row.
window.addEventListener("scroll", closeRowMenu, true);

/* ── The forms list ─────────────────────────────────────────────────────────
   Building and editing both live on admin-form-builder.html, the same split
   the Content page uses. This page only lists and routes. */

let allAdminSurveys = [];

/* Both filters and the pager work on the same array, and changing a filter has
   to start the result over from page one - otherwise narrowing to one client
   leaves you on a page the filtered set no longer has. */
let listPage = 1;

const LIST_PAGE_SIZE = 10;

function resetListPage() {
  listPage = 1;
  renderSurveysTable();
}

async function loadSurveyData() {
  const surveysTable = document.getElementById("surveysTable");
  const surveyUserFilter = document.getElementById("surveyUserFilter");

  try {
    const res = await fetch("api/admin-surveys.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();

    if (!data.success) {
      surveysTable.innerHTML = `
        <tr>
          <td colspan="4" class="empty">Unable to load forms.</td>
        </tr>
      `;
      return;
    }

    allAdminSurveys = data.surveys || [];

    /* The clients the listed forms went to, not the admin's assigned clients:
       the account manager sees every form, including ones for clients not
       assigned to them, and a filter should offer exactly what the list holds. */
    const clients = new Map();
    allAdminSurveys.forEach((survey) => {
      clients.set(
        String(survey.assigned_user_id),
        clientLabel({
          company_name: survey.company_name,
          name: survey.user_name,
        }),
      );
    });

    surveyUserFilter.innerHTML = `
      <option value="all">All Clients</option>
      ${[...clients]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(
          ([id, label]) => `
          <option value="${esc(id)}" dir="auto">${esc(label)}</option>
        `,
        )
        .join("")}
    `;
    renderSurveysTable();
  } catch (error) {
    surveysTable.innerHTML = `
      <tr>
        <td colspan="4" class="empty">Connection error.</td>
      </tr>
    `;
  }
}

function renderSurveysTable() {
  const surveysTable = document.getElementById("surveysTable");
  const filterValue = document.getElementById("surveyUserFilter").value;
  const statusFilter = document.getElementById("surveyStatusFilter").value;

  let surveys = allAdminSurveys;

  if (filterValue !== "all") {
    surveys = allAdminSurveys.filter(
      (s) => Number(s.assigned_user_id) === Number(filterValue),
    );
  }

  if (statusFilter !== "all") {
    surveys = surveys.filter((s) => displayStatus(s.status) === statusFilter);
  }

  if (!surveys.length) {
    surveysTable.innerHTML = `
      <tr>
        <td colspan="4" class="empty">No forms found.</td>
      </tr>
    `;
    renderListPager(0, 0, 0, 0);
    return;
  }

  /* Clamped rather than trusted: a filter can shrink the set under the page
     you were on, and so can a form being deleted between two renders. */
  const totalPages = Math.max(1, Math.ceil(surveys.length / LIST_PAGE_SIZE));
  listPage = Math.min(Math.max(1, listPage), totalPages);

  const start = (listPage - 1) * LIST_PAGE_SIZE;
  const rows = surveys.slice(start, start + LIST_PAGE_SIZE);

  renderListPager(surveys.length, totalPages, start, rows.length);

  surveysTable.innerHTML = rows
    .map((survey) => {
      const meta = statusMeta[displayStatus(survey.status)] || {
        label: survey.status,
        cls: "pending",
      };

      return `
    <tr>
      <td><span dir="auto">${esc(survey.title)}</span></td>
      <td><span dir="auto">${esc(survey.company_name || "—")}</span></td>
      <td>
        <span class="badge ${meta.cls}">
          ${esc(meta.label)}
        </span>
        <!-- The rejection reason is in the View popup; in the row it made the
             Status column wider than the Form Review table beside it. -->
      </td>
      <td>
        <div class="actions">
          <!-- View is the whole column. Send Again and View Responses live
               inside the modal it opens, so the column stays narrow. On a
               phone the button is swapped for the kebab, which offers the same
               one action - a full-width button does not fit beside the form
               title and the client. -->
          <button class="btn action-btn" type="button" onclick="openReview(${Number(survey.id)})">View</button>
          ${kebabButton(survey.id, "list")}
        </div>
      </td>
    </tr>
  `;
    })
    .join("");
}

function goToListPage(page) {
  listPage = page;
  renderSurveysTable();
  document
    .getElementById("formsListTable")
    .scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderListPager(total, totalPages, start, shown) {
  const pager = document.getElementById("listPager");
  if (!pager) return;

  // One page is no choice to offer.
  if (total <= LIST_PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("listPagerInfo").innerText =
    `Showing ${start + 1}-${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("listPagerPages").innerHTML = `
    <button type="button" onclick="goToListPage(${listPage - 1})" ${listPage === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map(
        (page) => `
      <button type="button" class="${page === listPage ? "current" : ""}"
              onclick="goToListPage(${page})">${page}</button>
    `,
      )
      .join("")}
    <button type="button" onclick="goToListPage(${listPage + 1})" ${listPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

/* The modal's own Responses button. Same lookup as the row button, but it
   reads the form the modal currently has open rather than being told which. */
function openReviewResponses() {
  if (!currentReviewSurveyId) return;
  viewSurveyResponses(currentReviewSurveyId);
}

async function viewSurveyResponses(surveyId) {
  try {
    const res = await fetch("api/admin-responses.php?survey_id=" + surveyId, {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();

    if (!data.success) {
      alert(data.message || "Could not load the responses.");
      return;
    }

    if (!data.responses || !data.responses.length) {
      alert("No responses found for this form.");
      return;
    }

    // Newest first from the endpoint, so [0] is the latest submission rather
    // than an arbitrary one. Opened in its own tab: the modal behind it keeps
    // its place, the same as Send Again.
    window.open(
      "response-details.html?id=" + encodeURIComponent(data.responses[0].id),
      "_blank",
      "noopener",
    );
  } catch (error) {
    alert("Connection error.");
  }
}

/* ── Form Review ────────────────────────────────────────────────────────────
   The queue that used to be its own page, cut down to the forms actually
   waiting on a decision - anything already approved or rejected shows up in
   the Forms List below instead.

   Two audiences, one panel, matching the split api/admin-survey-review.php
   enforces:
   - account manager and owner see every submission, with Approve/Reject;
   - any other admin sees only the forms they submitted, sitting there while
     they wait to hear back. */

const canReview =
  adminUser.role === "account_manager" || adminUser.role === "owner";

let allReviewSurveys = [];
let reviewPage = 1;
let currentReviewSurveyId = null;

const REVIEW_PAGE_SIZE = 5;

async function loadReviewSurveys() {
  const table = document.getElementById("reviewTable");
  if (!table) return;

  table.innerHTML = `<tr><td colspan="4" class="empty">Loading forms...</td></tr>`;

  try {
    // No status parameter: the endpoint only ever returns the waiting queue.
    const res = await fetch("api/admin-survey-review.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (!data.success) {
      allReviewSurveys = [];
      table.innerHTML = `<tr><td colspan="4" class="empty">${esc(data.message || "Unable to load forms.")}</td></tr>`;
      renderReviewPager(0, 0, 0, 0);
      return;
    }

    // Everything here is pending_review already, so the server's newest-first
    // order stands.
    allReviewSurveys = data.surveys || [];

    renderReviewTable();
  } catch (error) {
    allReviewSurveys = [];
    table.innerHTML = `<tr><td colspan="4" class="empty">Connection error.</td></tr>`;
    renderReviewPager(0, 0, 0, 0);
  }
}

function renderReviewTable() {
  const table = document.getElementById("reviewTable");

  const matching = allReviewSurveys;

  if (!matching.length) {
    table.innerHTML = `<tr><td colspan="4" class="empty">${
      canReview
        ? "No forms are waiting for a decision."
        : "None of your forms are waiting for approval."
    }</td></tr>`;
    renderReviewPager(0, 0, 0, 0);
    return;
  }

  // Deciding a form drops it out of the queue, which can empty the page you
  // were on.
  const totalPages = Math.max(1, Math.ceil(matching.length / REVIEW_PAGE_SIZE));
  reviewPage = Math.min(Math.max(1, reviewPage), totalPages);

  const start = (reviewPage - 1) * REVIEW_PAGE_SIZE;
  const rows = matching.slice(start, start + REVIEW_PAGE_SIZE);

  renderReviewPager(matching.length, totalPages, start, rows.length);

  table.innerHTML = rows
    .map((survey) => {
      return `
    <tr>
      <td><span dir="auto">${esc(survey.title)}</span></td>
      <td><span dir="auto">${esc(survey.company_name || "—")}</span></td>
      <td>
        <span class="badge survey-status">In Review</span>
      </td>
      <td>
        <div class="actions">
          <button class="btn action-btn" type="button" onclick="openReview(${Number(survey.id)})">
            ${canReview ? "Review" : "View"}
          </button>
          ${kebabButton(survey.id, "review")}
        </div>
      </td>
    </tr>
    `;
    })
    .join("");
}

function goToReviewPage(page) {
  reviewPage = page;
  renderReviewTable();
  document
    .getElementById("formReviewSection")
    .scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderReviewPager(total, totalPages, start, shown) {
  const pager = document.getElementById("reviewPager");
  if (!pager) return;

  if (total <= REVIEW_PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("reviewPagerInfo").innerText =
    `Showing ${start + 1}–${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("reviewPagerPages").innerHTML = `
    <button type="button" onclick="goToReviewPage(${reviewPage - 1})" ${reviewPage === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map(
        (page) => `
      <button type="button" class="${page === reviewPage ? "current" : ""}"
              onclick="goToReviewPage(${page})">${page}</button>
    `,
      )
      .join("")}
    <button type="button" onclick="goToReviewPage(${reviewPage + 1})" ${reviewPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

async function openReview(surveyId) {
  currentReviewSurveyId = surveyId;

  const statusEl = document.getElementById("reviewStatus");
  statusEl.innerText = "Loading...";
  document.getElementById("reviewQuestions").innerHTML = "";
  document.getElementById("rejectNoteField").style.display = "none";
  document.getElementById("rejectNote").value = "";

  try {
    const res = await fetch(
      "api/admin-survey-review.php?survey_id=" + encodeURIComponent(surveyId),
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );

    const data = await res.json();

    // The modal is still closed here, so a message written into it would never
    // be seen and the View button would just look dead.
    if (!data.success) {
      statusEl.innerText = "";
      alert(data.message || "Unable to load this form.");
      return;
    }

    const survey = data.survey;

    document.getElementById("reviewTitle").innerText = survey.title;

    const description = (survey.description || "").trim();
    const descriptionEl = document.getElementById("reviewDescription");
    descriptionEl.innerText = description;
    descriptionEl.hidden = !description;

    // Names only - no email addresses on this page.
    document.getElementById("reviewFrom").innerText =
      survey.created_by_name || "Unknown admin";
    document.getElementById("reviewTo").innerText = clientLabel({
      company_name: survey.company_name,
      name: survey.user_name,
    });

    document.getElementById("reviewQuestions").innerHTML =
      (data.questions || [])
        .map((q, index) => {
          let chipsArr = [];
          try {
            chipsArr = q.chips ? JSON.parse(q.chips) : [];
          } catch (e) {
            chipsArr = [];
          }

          const body =
            (chipsArr.length
              ? optionsHTML(
                  chipsArr,
                  q.question_type === "checkbox" ||
                    q.question_type === "checklist",
                )
              : ``) +
            (q.question_type === "file" && q.max_file_size_mb
              ? `<div class="q-chips">Max file size: ${esc(q.max_file_size_mb)} MB</div>`
              : ``);

          return questionCardHTML(index, q.question_text, body);
        })
        .join("") || `<p class="status-text">No questions on this form.</p>`;

    // Approve/Reject only make sense on a form still waiting for an answer,
    // and only for the admins allowed to give one.
    document.getElementById("reviewDuplicate").href =
      "admin-form-duplicate.html?id=" + encodeURIComponent(surveyId);

    // There is nothing to read until the client has filled the form in, so the
    // button only exists once the form is completed.
    document.getElementById("reviewResponses").style.display =
      survey.status === "completed" ? "" : "none";

    const footer = document.getElementById("reviewFooter");
    const decidable = canReview && survey.status === "pending_review";
    footer.querySelector(".approve-btn").style.display = decidable
      ? ""
      : "none";
    footer.querySelector(".reject-btn").style.display = decidable ? "" : "none";

    statusEl.innerText =
      survey.status === "rejected" && survey.review_note
        ? "Rejection reason: " + survey.review_note
        : "";

    document.getElementById("reviewModal").classList.add("show");
  } catch (error) {
    statusEl.innerText = "";
    alert("Connection error.");
  }
}

/* A question with nothing beneath it has nothing to collapse, so its header is
   plain text rather than a toggle. */
function questionCardHTML(index, questionText, body) {
  const title = `
    <span class="rq-title">
      <span class="q-index">Question ${index + 1}</span>
      <span class="q-text" dir="auto">${esc(questionText)}</span>
    </span>
  `;

  if (!body)
    return `<div class="review-question"><div class="rq-head">${title}</div></div>`;

  return `
    <div class="review-question">
      <button
        type="button"
        class="rq-head"
        aria-expanded="true"
        onclick="const card = this.parentElement; this.setAttribute('aria-expanded', !card.classList.toggle('collapsed'));"
      >
        ${title}
        <span class="rq-toggle" aria-hidden="true">▼</span>
      </button>
      <div class="rq-body">${body}</div>
    </div>
  `;
}

/* A checklist's items get an empty tick box; a text question's quick keywords
   don't, since nothing gets ticked. */
function optionsHTML(items, isChecklist) {
  const noun = isChecklist ? "option" : "quick keyword";
  return `
    <div class="q-options-count">${items.length} ${noun}${items.length === 1 ? "" : "s"}</div>
    <ul class="q-options">
      ${items
        .map(
          (item) => `
        <li class="${isChecklist ? "is-check" : ""}${/^\s*none of/i.test(item) ? " is-none" : ""}" dir="auto">${esc(item)}</li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function closeReview() {
  currentReviewSurveyId = null;
  document.getElementById("reviewModal").classList.remove("show");
  document.getElementById("rejectNoteField").style.display = "none";
}

/* First click opens the note field, second submits - a rejection without a
   reason is no use to whoever has to act on it. */
function startReject() {
  const field = document.getElementById("rejectNoteField");

  if (field.style.display === "none") {
    field.style.display = "block";
    document.getElementById("rejectNote").focus();
    return;
  }

  submitReview("reject");
}

function approveSurvey() {
  submitReview("approve");
}

async function submitReview(action) {
  if (!currentReviewSurveyId) return;

  const statusEl = document.getElementById("reviewStatus");
  const note = document.getElementById("rejectNote").value.trim();

  if (action === "reject" && !note) {
    statusEl.innerText = "Please add a short note explaining the rejection.";
    return;
  }

  statusEl.innerText = action === "approve" ? "Approving..." : "Rejecting...";

  try {
    const res = await fetch("api/admin-survey-review.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ surveyId: currentReviewSurveyId, action, note }),
    });

    const data = await res.json();
    statusEl.innerText = data.message;

    if (data.success) {
      setTimeout(() => {
        closeReview();
        loadReviewSurveys();
        // The decision changes the form's status, so the list below is stale.
        loadSurveyData();
      }, 700);
    }
  } catch (error) {
    statusEl.innerText = "Connection error.";
  }
}

// Everyone gets the panel: reviewers to decide on what was submitted to them,
// every other admin to watch their own submissions wait.
document.getElementById("formReviewSection").hidden = false;
document.getElementById("reviewIntro").innerText = canReview
  ? "Forms submitted by admins, waiting on your approval or rejection."
  : "Forms you submitted, waiting on approval from an account manager or the owner.";
loadReviewSurveys();

loadSurveyData();

/* A "form awaiting approval" notification or email links here as
   ?review=<id>: open that form's review straight away, with the queue
   scrolled into view behind it. openReview() fetches the form by id itself,
   so it does not wait on the queue loading; if the form was already
   decided, it says so. */
(function () {
  const reviewId = new URLSearchParams(location.search).get("review");
  if (!/^\d+$/.test(reviewId || "")) return;
  document
    .getElementById("formReviewSection")
    .scrollIntoView({ behavior: "smooth", block: "start" });
  openReview(Number(reviewId));
})();

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
