const adminToken = localStorage.getItem("admin_token");
const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Which form to copy: admin-form-duplicate.html?id=52
const sourceId = new URLSearchParams(location.search).get("id");

/* An account manager or the owner is the approval step, so their own forms go
   straight to the client - matching what api/admin-surveys.php does on save. */
const canReview =
  adminUser.role === "account_manager" || adminUser.role === "owner";

let sourceQuestions = [];

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* A client is named by its company, as every other list in the admin does;
   the person's name stands in only when no company was given. */
function clientLabel(user) {
  return (
    String(user.company_name || "").trim() || user.name || "Unnamed client"
  );
}

function chipsToArray(chips) {
  try {
    const parsed = chips ? JSON.parse(chips) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

/* Chips come back as a JSON array but are posted as a comma-separated string,
   which is the shape the create endpoint parses. */
function chipsToText(chips) {
  return chipsToArray(chips).join(", ");
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

function fail(message) {
  document.getElementById("body").style.display = "none";
  document.getElementById("state").innerHTML =
    `<div class="empty">${esc(message)}</div>`;
}

async function load() {
  if (!sourceId) {
    fail("No form selected.");
    return;
  }

  try {
    // One call carries the source form and its questions; a second brings the
    // client list, already scoped to this admin by the same endpoint that
    // scopes the forms list.
    const [oneRes, listRes] = await Promise.all([
      fetch("api/admin-surveys.php?survey_id=" + encodeURIComponent(sourceId), {
        headers: { Authorization: "Bearer " + adminToken },
      }),
      fetch("api/admin-surveys.php", {
        headers: { Authorization: "Bearer " + adminToken },
      }),
    ]);

    const one = await oneRes.json();
    const list = await listRes.json();

    if (!one.success) {
      fail(one.message || "Could not load this form.");
      return;
    }

    sourceQuestions = one.questions || [];

    document.getElementById("state").style.display = "none";
    document.getElementById("body").style.display = "block";

    if (!canReview) {
      document.getElementById("reviewNote").style.display = "flex";
    }

    document.getElementById("sendBtn").innerText = canReview
      ? "Send to client"
      : "Send for approval";

    document.getElementById("title").value = one.survey.title || "";

    const select = document.getElementById("userSelect");
    const users = list.success && list.users ? list.users : [];

    select.innerHTML = users.length
      ? `<option value="">Select a client</option>` +
        users
          .map(
            (user) =>
              `<option value="${esc(user.id)}" dir="auto">${esc(clientLabel(user))}</option>`,
          )
          .join("")
      : `<option value="">No clients are assigned to you</option>`;

    // The original's client is preselected only as a starting point - the
    // usual reason for being here is to pick a different one.
    if (one.survey.assigned_user_id) {
      select.value = String(one.survey.assigned_user_id);
    }

    renderQuestions();
  } catch (error) {
    fail("Connection error.");
  }
}

function renderQuestions() {
  const box = document.getElementById("questions");

  document.getElementById("questionsHead").innerText =
    `Questions (${sourceQuestions.length})`;

  if (!sourceQuestions.length) {
    box.innerHTML = `<div class="empty">This form has no questions.</div>`;
    return;
  }

  box.innerHTML = sourceQuestions
    .map((q, index) => {
      const chips = chipsToArray(q.chips);

      const body =
        (chips.length
          ? optionsHTML(
              chips,
              q.question_type === "checkbox" || q.question_type === "checklist",
            )
          : ``) +
        (q.question_type === "file" && q.max_file_size_mb
          ? `<div class="q-chips">Max file size: ${esc(q.max_file_size_mb)} MB</div>`
          : ``);

      return questionCardHTML(index, q.question_text, body);
    })
    .join("");
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

  if (!body) return `<div class="q"><div class="rq-head">${title}</div></div>`;

  return `
    <div class="q">
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

async function sendCopy() {
  const status = document.getElementById("status");
  const button = document.getElementById("sendBtn");

  const title = document.getElementById("title").value.trim();
  const userId = document.getElementById("userSelect").value;

  status.className = "status";

  if (!title) {
    status.className = "status bad";
    status.innerText = "Give the copy a title.";
    return;
  }

  if (!userId) {
    status.className = "status bad";
    status.innerText = "Pick the client to send it to.";
    return;
  }

  if (!sourceQuestions.length) {
    status.className = "status bad";
    status.innerText = "This form has no questions to copy.";
    return;
  }

  button.disabled = true;
  status.innerText = "Sending...";

  try {
    /* Posted through the ordinary create endpoint rather than a copy-specific
       one. That is deliberate: the copy then gets the same validation, the
       same pending_review status and the same reviewer notification as a form
       built by hand, with no second code path to keep in step. */
    const res = await fetch("api/admin-surveys.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        title: title,
        description: "",
        assignedUserId: Number(userId),
        questions: sourceQuestions.map((q) => ({
          text: q.question_text,
          type: q.question_type,
          chips: chipsToText(q.chips),
          maxFileSizeMb: q.max_file_size_mb || "",
        })),
      }),
    });

    const data = await res.json();

    if (!data.success) {
      status.className = "status bad";
      status.innerText = data.message || "Could not send the copy.";
      button.disabled = false;
      return;
    }

    status.className = "status ok";
    status.innerText = data.message;

    // Sent. Leave the tab open but stop it being sent twice by accident.
    button.innerText = "Sent";
  } catch (error) {
    status.className = "status bad";
    status.innerText = "Connection error.";
    button.disabled = false;
  }
}

load();
