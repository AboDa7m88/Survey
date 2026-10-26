const params = new URLSearchParams(window.location.search);

/* A link is ?name=<inquiry> - one link per inquiry, open while the inquiry
   is active. Links handed out earlier carried a per-person token instead
   (?token=, and ?ref= before that); those still resolve, and are still good
   for exactly one answer. */
const inquiryName = params.get("name") || "";
const inquiryToken = params.get("token") || params.get("ref") || "";

let inquiryFields = [];

/* How long an answer of each type may be, fixed by the type. The same two
   numbers api/public-inquiry.php enforces on the way in. */
const TYPE_MAX_CHARS = { input: 120, textarea: 800 };

function capFor(field) {
  return TYPE_MAX_CHARS[field.field_type] || 120;
}

function panel(html) {
  document.getElementById("view").innerHTML =
    '<div class="panel">' + html + "</div>";
}

/*
| The logo links to the website address set in Settings, and to nothing at all
| when that has been left empty. The server has already thrown away anything
| that is not an http(s) address, so what arrives here is either a link or an
| empty string - but it is checked again on the way in, because a link in the
| letterhead of a public page is not the place to trust one hop.
*/
function applyWebsiteLink(site) {
  const link = document.getElementById("logoLink");
  const url = String((site || {}).website_url || "").trim();

  if (!link) return;

  if (!/^https?:\/\//i.test(url)) {
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.removeAttribute("title");
    return;
  }

  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Visit our website";
}

/*
|------------------------------------------------------------------------------
| "You have already answered this"
|------------------------------------------------------------------------------
|
| A flag in localStorage against this inquiry's name, written when a submission
| succeeds and read before the form is drawn.
|
| It is a courtesy and not a control, and it is worth being plain about which:
| a private window, a different browser, a different device or clearing site
| data all wipe it, and none of that is hard to do. What it stops is the honest
| case - somebody who answered last week following the same link again, or
| double-clicking Submit - which is most of what actually happens.
|
| The rule that does hold is on the server, and only for the older per-person
| links: a ?token= link is claimed the moment it is used and cannot be answered
| twice, whatever any browser thinks.
|
| Every access is wrapped, because localStorage throws rather than returning
| null when a browser has storage switched off, and a form that will not load
| is worse than one that can be answered twice.
*/

const DONE_KEY = "wz_inquiry_done_" + (inquiryName || inquiryToken);

function markAnswered() {
  try {
    localStorage.setItem(DONE_KEY, new Date().toISOString());
  } catch (e) {}
}

function answeredAt() {
  try {
    return localStorage.getItem(DONE_KEY);
  } catch (e) {
    return null;
  }
}

/* "on 4 September 2026", or nothing at all if the stored value is not a date
   we can read - the sentence has to work either way. */
function answeredWhen(stored) {
  const at = new Date(stored);

  if (isNaN(at.getTime())) return "";

  return (
    " on " +
    at.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );
}

function alreadyAnswered(inquiry, stored) {
  panel(
    '<div class="panel-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
      "</div>" +
      "<h2>You have already answered this</h2>" +
      "<p>Your answers to &ldquo;" +
      escapeHtml(inquiry.title) +
      "&rdquo; were sent" +
      answeredWhen(stored) +
      ". There is nothing else to do.</p>",
  );
}

async function loadInquiry() {
  if (!inquiryName && !inquiryToken) {
    panel(
      "<h2>This link is missing or invalid</h2><p>Check the address you were sent, or ask whoever sent it for a new one.</p>",
    );
    return;
  }

  try {
    const res = await fetch(
      "api/public-inquiry.php?token=" +
        encodeURIComponent(inquiryToken) +
        "&name=" +
        encodeURIComponent(inquiryName),
    );
    const data = await res.json();

    // Branding travels with every answer, refusals included.
    applyWebsiteLink(data.site);

    if (!data.success) {
      panel(
        "<h2>This link is no longer available</h2><p>" +
          escapeHtml(data.message || "") +
          "</p>",
      );
      return;
    }

    /* After the fetch rather than before it, so the panel can name the
       inquiry - and so a closed or deleted one still says so first. */
    const stored = answeredAt();

    if (stored) {
      alreadyAnswered(data.inquiry, stored);
      return;
    }

    inquiryFields = data.fields || [];
    renderForm(data.inquiry, inquiryFields);
  } catch (err) {
    panel(
      "<h2>Connection error</h2><p>Something went wrong reaching the server. Please try again.</p>",
    );
  }
}

/* One question, one control. 'choice' and 'select' cannot be created any more,
   but questions written before this still carry them, so both still render. */
function control(field) {
  const required = Number(field.required) === 1;
  const options = String(field.options || "")
    .split(/\r\n|\r|\n/)
    .map((o) => o.trim())
    .filter(Boolean);
  const cap = capFor(field);

  if (field.field_type === "choice" && options.length) {
    return `
      <div class="choices" data-choice-for="${field.id}">
        ${options
          .map(
            (option) => `
          <label class="choice">
            <input type="checkbox" name="field-${field.id}" value="${escapeHtml(option)}"
                   data-choice-id="${field.id}">
            <span>${escapeHtml(option)}</span>
          </label>
        `,
          )
          .join("")}
      </div>
    `;
  }

  if (field.field_type === "select" && options.length) {
    return `
      <select data-field-id="${field.id}" ${required ? "required" : ""}>
        <option value="">Choose one...</option>
        ${options
          .map(
            (option) => `
          <option value="${escapeHtml(option)}">${escapeHtml(option)}</option>
        `,
          )
          .join("")}
      </select>
    `;
  }

  if (field.field_type === "textarea") {
    return `<textarea data-field-id="${field.id}" maxlength="${cap}" dir="auto"
                      ${required ? "required" : ""}></textarea>`;
  }

  return `<input type="text" data-field-id="${field.id}" maxlength="${cap}" dir="auto"
                 ${required ? "required" : ""}>`;
}

/* Only the two text types have a length to count down. */
function counter(field) {
  if (field.field_type !== "input" && field.field_type !== "textarea")
    return "";

  return `<span class="counter" data-counter-for="${field.id}">${capFor(field)} characters left</span>`;
}

function renderForm(inquiry, fields) {
  document.getElementById("view").innerHTML = `
    <div class="layout">

      <div class="intro-col">
        <div class="intro-rule"></div>
        <h1 dir="auto">${escapeHtml(inquiry.title)}</h1>
        ${inquiry.intro_text ? `<p class="intro" dir="auto">${escapeHtml(inquiry.intro_text)}</p>` : ``}
      </div>

      <div class="form-col">
        <form id="inquiryForm">
          ${fields
            .map(
              (f) => `
            <div class="field-group">
              <div class="field-head">
                <label dir="auto">${escapeHtml(f.field_label)} ${Number(f.required) === 1 ? `<span class="req">*</span>` : ``}</label>
                ${counter(f)}
              </div>
              ${control(f)}
            </div>
          `,
            )
            .join("")}

          <button type="submit" class="submit-btn" id="submitBtn">Submit</button>
          <div class="status" id="formStatus"></div>
        </form>
      </div>

    </div>
  `;

  document
    .getElementById("inquiryForm")
    .addEventListener("submit", submitInquiry);
  wireCounters();
}

/* The counter under a text control. maxlength stops the typing on its own;
   this is so the stop is not a surprise. */
function wireCounters() {
  inquiryFields.forEach((field) => {
    const input = document.querySelector(`[data-field-id="${field.id}"]`);
    const counter = document.querySelector(`[data-counter-for="${field.id}"]`);

    if (!input || !counter) return;

    const cap = capFor(field);

    const update = () => {
      const left = cap - input.value.length;
      counter.textContent =
        left + (left === 1 ? " character left" : " characters left");
      counter.classList.toggle("low", left <= cap * 0.1 && left > 0);
      counter.classList.toggle("out", left === 0);
    };

    input.addEventListener("input", update);
    update();
  });
}

async function submitInquiry(e) {
  e.preventDefault();

  const btn = document.getElementById("submitBtn");
  const statusEl = document.getElementById("formStatus");

  const answers = inquiryFields.map((f) => {
    if (f.field_type === "choice") {
      const ticked = Array.from(
        document.querySelectorAll(`[data-choice-id="${f.id}"]:checked`),
      ).map((box) => box.value);

      return { fieldId: f.id, value: ticked };
    }

    const input = document.querySelector(`[data-field-id="${f.id}"]`);
    return { fieldId: f.id, value: input ? input.value.trim() : "" };
  });

  const missing = inquiryFields.find(
    (f, i) => Number(f.required) === 1 && !answers[i].value,
  );
  if (missing) {
    statusEl.innerText = `Please fill in "${missing.field_label}"`;
    statusEl.className = "status error";
    return;
  }

  btn.disabled = true;
  statusEl.innerText = "Sending...";
  statusEl.className = "status";

  try {
    const res = await fetch("api/public-inquiry.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inquiryToken, name: inquiryName, answers }),
    });

    const data = await res.json();

    if (!data.success) {
      statusEl.innerText =
        data.message || "Something went wrong. Please try again.";
      statusEl.className = "status error";
      btn.disabled = false;
      return;
    }

    markAnswered();

    panel(
      '<div class="panel-icon">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
        "</div>" +
        "<h2>Thank you!</h2><p>" +
        escapeHtml(data.message) +
        "</p>",
    );
  } catch (err) {
    statusEl.innerText = "Connection error. Please try again.";
    statusEl.className = "status error";
    btn.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

loadInquiry();
