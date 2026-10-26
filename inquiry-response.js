/*
|------------------------------------------------------------------------------
| Inquiries: one response, on its own
|------------------------------------------------------------------------------
|
| A phone has no room to expand an answer inside a list, so tapping one there
| comes here instead. On a desktop the same link is intercepted and the answer
| opens in place - this page is what that link points at when it is not.
|
| One fetch: api/admin-inquiry-responses.php?response_id= finds the inquiry
| from the response, so the URL only ever carries the one id.
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

const responseId = Number(
  new URLSearchParams(window.location.search).get("id") || 0,
);

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

function block(message) {
  document.getElementById("card").hidden = true;

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

async function load() {
  if (!responseId) {
    block("No response was named in the link.");
    return;
  }

  try {
    const res = await fetch(
      "api/admin-inquiry-responses.php?response_id=" + responseId,
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );
    const data = await res.json();

    if (!data.success) {
      block(data.message || "Unable to load this response.");
      return;
    }

    fill(data);
  } catch (error) {
    block("Connection error.");
  }
}

const ICON = {
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
};

function fill(data) {
  const fields = data.fields || [];
  const response = data.response || {};
  const answers = response.answers || {};
  const who = WZI.identify(fields, answers, response.position || 0);

  document.getElementById("backLink").href =
    "inquiry-details.html?id=" + data.id + "#response-" + response.id;

  document.title = who.name + " - " + data.title;
  document.getElementById("pageTitle").textContent = who.name;

  /* Which inquiry this answers, under the name of whoever answered it. Clipped
     to one line on a phone, so the full string rides along as a title. */
  const headName = document.getElementById("headName");
  headName.textContent = data.title;
  headName.title = data.title;

  document.getElementById("vAvatar").textContent = who.initials;
  document.getElementById("vName").textContent = who.name;

  const sub = document.getElementById("vSub");
  sub.textContent = who.sub;
  sub.hidden = !who.sub;

  /* Where this one sits in the pile, which is the question anybody arriving
     from the list has: is this the newest, or one of forty. */
  const place = data.total
    ? "Response " + ((response.position || 0) + 1) + " of " + data.total
    : "";

  document.getElementById("vMeta").innerHTML = `
    <span>${ICON.clock} Submitted ${WZI.escapeHtml(WZI.fmtDateTime(response.submitted_at))}</span>
    ${response.source === "mcp" ? `<span class="via-ai" title="Sent by an AI assistant through the W|ZONE MCP server, after the person confirmed their answers">via AI assistant</span>` : ``}
    ${place ? `<span class="lead-place">${place}</span>` : ``}
  `;

  renderActions(fields, answers, who.name);
  renderAnswers(fields, answers);

  document.getElementById("card").hidden = false;
}

/* The two things anybody does with a lead. Only offered when the answers
   actually carry an address or a number - a dead button is worse than none. */
function renderActions(fields, answers, name) {
  const email = WZI.findAnswer(fields, answers, "email");
  const phone = WZI.findAnswer(fields, answers, "phone");

  const buttons = [];

  if (email) {
    buttons.push(`<a class="btn btn-dark btn-lg" href="mailto:${WZI.escapeHtml(encodeURI(email))}">
      ${ICON.mail} Email
    </a>`);
  }

  if (phone) {
    buttons.push(`<a class="btn btn-ghost btn-lg" href="tel:${WZI.escapeHtml(phone.replace(/[^0-9+]/g, ""))}">
      ${ICON.phone} Call
    </a>`);
  }

  const box = document.getElementById("vActions");
  box.innerHTML = buttons.join("");
  box.hidden = !buttons.length;
}

function renderAnswers(fields, answers) {
  document.getElementById("vAnswers").innerHTML = fields
    .map((field) => {
      const raw = String(answers[field.id] || "").trim();
      const kind = WZI.answerKind(field.field_label, raw);

      // Long answers get the full width; so does anything that simply runs long.
      const wide = field.field_type === "textarea" || raw.length > 60;

      // Worth a copy button only where copying is the point.
      const copyable = kind === "email" || kind === "phone";

      return `
      <div class="answer${wide ? " full" : ""}${kind === "empty" ? " is-empty" : ""}">
        <span class="f-label" dir="auto">${WZI.escapeHtml(field.field_label)}</span>
        <div class="f-value${wide && kind === "text" ? " pre" : ""}">${WZI.answerHtml(field.field_label, raw)}</div>
        ${
          copyable
            ? `
          <button class="answer-copy" type="button"
                  aria-label="Copy ${WZI.escapeHtml(field.field_label)}"
                  data-copy="${WZI.escapeHtml(raw)}"
                  onclick="copyValue(this)">
            ${ICON.copy}
          </button>`
            : ``
        }
      </div>
    `;
    })
    .join("");
}

async function copyValue(button) {
  const ok = await WZI.copy(button.dataset.copy || "");
  WZI.toast(
    ok ? "Copied." : "Copying was blocked - select the text instead.",
    !ok,
  );
}

load();
