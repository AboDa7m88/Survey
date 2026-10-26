/*
|------------------------------------------------------------------------------
| Inquiries: create and edit
|------------------------------------------------------------------------------
|
| One page for both, the way project-form.html does it: ?id= present means
| edit. Creating is open to the owner and any access-granted account manager;
| editing is the owner's alone, so an account manager arriving with an id is
| turned around here as well as at the endpoint.
|
| An inquiry that has been answered keeps its questions: rewriting them would
| delete the rows those answers point at. The endpoint enforces that and saves
| the status and account manager anyway; this page greys out the rest so the
| refusal is visible before the save, not after.
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

// Creating and editing inquiries are the owner's. An account manager reads
// them on inquiries.html, so that is where they are sent; anyone else has no
// inquiries at all. api/admin-inquiries.php refuses the save either way.
if (adminUser.role === "account_manager") {
  window.location.href = "inquiries.html";
} else if (adminUser.role !== "owner") {
  window.location.href = "admin.html";
}

const isOwner = adminUser.role === "owner";
const inquiryId = Number(
  new URLSearchParams(window.location.search).get("id") || 0,
);
const isEdit = inquiryId > 0;

let managers = [];
let inquiryName = "";
let locked = false;
let fieldSeq = 0;

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

function block(message) {
  document.getElementById("form").hidden = true;

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

/* ── Custom field rows ───────────────────────────────────────────────────── */

/* Two types: one line of text, or a paragraph of it.

   'choice' and 'select' used to be here as well. Questions of those types
   written before still render on the public page and still read back on the
   details page - nothing deletes them - but they cannot be created any more,
   and an old inquiry that goes through this form again comes out with them
   converted to short answers. */
const FIELD_TYPES = ["input", "textarea"];

const TYPE_LABELS = {
  input: "Short answer",
  textarea: "Paragraph",
};

/* How long an answer of each type may be. Fixed by the type rather than set
   per question - "short answer" and "paragraph" are the promise, and these are
   the numbers that make them mean something. Shown on the Type dropdown so the
   admin picking one can see what they are choosing. Enforced in
   api/public-inquiry.php, which is where it counts. */
const TYPE_MAX_CHARS = {
  input: 120,
  textarea: 800,
};

function addField(label, type, required) {
  fieldSeq++;

  const id = "cf-" + fieldSeq;
  const kind = FIELD_TYPES.includes(type) ? type : "input";

  const row = document.createElement("div");

  row.className = "cf-row";
  row.id = id;
  row.innerHTML = `
    <button class="cf-head" type="button" aria-expanded="true" onclick="toggleField(this)">
      <svg class="cf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      <span class="cf-head-label" dir="auto">${WZI.escapeHtml(label || "New question")}</span>
      <em class="cf-head-type">${TYPE_LABELS[kind]}</em>
    </button>

    <div class="cf-main">
      <div class="field-row">
        <label>Label</label>
        <input type="text" class="cf-label" maxlength="200" dir="auto" value="${WZI.escapeHtml(label || "")}"
               placeholder="e.g. Phone Number" oninput="labelChanged(this)">
      </div>
      <div class="field-row">
        <label>Type</label>
        <select class="cf-type" onchange="typeChanged(this)">
          <option value="input"${kind === "input" ? " selected" : ""}>Short answer (${TYPE_MAX_CHARS.input} characters)</option>
          <option value="textarea"${kind === "textarea" ? " selected" : ""}>Paragraph (${TYPE_MAX_CHARS.textarea} characters)</option>
        </select>
      </div>
      <label class="cf-req">
        <input type="checkbox" class="cf-required"${required === false ? "" : " checked"}>
        Required
      </label>
      <button class="cf-remove" type="button" aria-label="Remove this field" onclick="document.getElementById('${id}').remove()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>

  `;

  document.getElementById("cfList").appendChild(row);
  return row;
}

/* Adding a question folds up the ones above it. What you are writing stays
   open; everything already written gets out of the way. */
function addNewField() {
  foldAllFields();
  addField().querySelector(".cf-label").focus();
}

function foldAllFields() {
  document.querySelectorAll(".cf-row").forEach((row) => {
    row.classList.add("folded");
    row.querySelector(".cf-head").setAttribute("aria-expanded", "false");
  });
}

/* The question, folded. Only a phone acts on this - the stylesheet hides the
   header above the drawer breakpoint - but the class is set at every width so
   nothing has to ask how wide the window is. */
function toggleField(button) {
  const row = button.closest(".cf-row");
  const folded = row.classList.toggle("folded");

  button.setAttribute("aria-expanded", folded ? "false" : "true");

  if (!folded) row.querySelector(".cf-label").focus();
}

function labelChanged(input) {
  const row = input.closest(".cf-row");
  row.querySelector(".cf-head-label").textContent =
    input.value.trim() || "New question";
}

function typeChanged(select) {
  const row = select.closest(".cf-row");
  row.querySelector(".cf-head-type").textContent =
    TYPE_LABELS[select.value] || "";
}

function readFields() {
  return Array.from(document.querySelectorAll(".cf-row"))
    .map((row) => ({
      label: row.querySelector(".cf-label").value.trim(),
      type: row.querySelector(".cf-type").value,
      required: row.querySelector(".cf-required").checked,
    }))
    .filter((field) => field.label !== "");
}

/* ── Account manager ─────────────────────────────────────────────────────
   Three or four names, so a select says it in one control. */

async function loadManagers() {
  try {
    const res = await fetch("api/admin-inquiries.php?managers=1", {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();

    managers = data.success ? data.managers || [] : [];
  } catch (error) {
    managers = [];
  }

  const select = document.getElementById("fManager");

  select.innerHTML =
    '<option value="">Select an account manager...</option>' +
    managers
      .map(
        (m) =>
          `<option value="${m.id}">${WZI.escapeHtml(m.name)}${m.email ? " - " + WZI.escapeHtml(m.email) : ""}</option>`,
      )
      .join("");

  // Saying so beats an empty dropdown that looks broken.
  const none = !managers.length;
  document.getElementById("mgrHint").hidden = !none;
  select.disabled = none;
}

document.getElementById("fStatus").addEventListener("change", function () {
  const pill = document.getElementById("statusPill");
  const inactive = this.value === "inactive";

  pill.textContent = inactive ? "Inactive" : "Active";
  pill.className = "pill " + (inactive ? "pill-inactive" : "pill-active");
});

/* ── Loading ─────────────────────────────────────────────────────────────── */

async function start() {
  // Shown only for the moment before the redirect above lands.
  if (!isOwner) {
    block("Only the owner can create or edit inquiries.");
    return;
  }

  await loadManagers();

  if (!isEdit) {
    addField("Full Name", "input", true);
    document.getElementById("form").hidden = false;
    return;
  }

  document.getElementById("formHeading").textContent = "Edit Inquiry";
  document.getElementById("saveLabel").textContent = "Save Changes";

  try {
    const res = await fetch("api/admin-inquiries.php?id=" + inquiryId, {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();

    if (!data.success) {
      block(data.message || "Unable to load this inquiry.");
      return;
    }

    fill(data.inquiry, data.fields || [], data.hasAnswers);
    document.getElementById("form").hidden = false;
  } catch (error) {
    block("Connection error.");
  }
}

function fill(inq, fields, answered) {
  inquiryName = inq.slug || "";

  const headName = document.getElementById("headName");
  headName.textContent = inq.title;
  headName.title = inq.title;
  headName.hidden = false;
  document.getElementById("fTitle").value = inq.title || "";
  document.getElementById("fDesc").value = inq.intro_text || "";

  const status = document.getElementById("fStatus");
  status.value = inq.status === "inactive" ? "inactive" : "active";
  status.dispatchEvent(new Event("change"));

  if (inq.account_manager_admin_id) {
    const select = document.getElementById("fManager");

    /* The assigned manager may since have changed role, in which case they are
       not in the list - keep them as an option rather than silently dropping
       the assignment on the next save. */
    if (
      !managers.some(
        (m) => Number(m.id) === Number(inq.account_manager_admin_id),
      )
    ) {
      const option = document.createElement("option");
      option.value = inq.account_manager_admin_id;
      option.textContent =
        (inq.account_manager_name || "Account manager") +
        " - no longer an account manager";
      select.appendChild(option);
      select.disabled = false;
    }

    select.value = String(inq.account_manager_admin_id);
  }

  document.getElementById("fReference").value = inq.reference || "";

  fields.forEach((field) => {
    addField(field.field_label, field.field_type, Number(field.required) === 1);
  });

  setLink(WZI.publicLink(inquiryName));
  document.getElementById("copyBtn").disabled = false;

  if (answered) {
    lockQuestions();
  }
}

/* Answers point at the field rows, so the endpoint refuses to rewrite them
   once any exist. Shown here as disabled inputs rather than a message after a
   failed save. */
function lockQuestions() {
  locked = true;

  document.getElementById("lockedHint").hidden = false;
  document.querySelector(".add-field-btn").hidden = true;
  document.getElementById("fTitle").disabled = true;
  document.getElementById("fDesc").disabled = true;

  document
    .querySelectorAll(".cf-row input, .cf-row select, .cf-row textarea")
    .forEach((el) => {
      el.disabled = true;
    });
  document.querySelectorAll(".cf-remove").forEach((el) => {
    el.hidden = true;
  });
}

/* ── Saving ──────────────────────────────────────────────────────────────── */

/*
|------------------------------------------------------------------------------
| Validation
|------------------------------------------------------------------------------
|
| Every complaint lands the same way: say what is wrong, mark the control, and
| put the cursor in it. A question folded away on a phone is opened first -
| focusing something with display:none silently does nothing, and the admin
| would be told a question is wrong with no way to see which.
|
| The important one is the empty label. readFields() drops unlabelled rows, so
| without this a question you forgot to name would vanish on save with nothing
| said about it.
|
*/

function fail(message, element, row) {
  if (row) unfoldRow(row);

  WZI.toast(message, true);

  if (element) {
    element.classList.add("is-invalid");
    element.focus();
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return false;
}

// Opening the question a complaint is about.
function unfoldRow(row) {
  row.classList.remove("folded");
  row.querySelector(".cf-head").setAttribute("aria-expanded", "true");
}

// The mark clears as soon as the admin does something about it.
document.addEventListener("input", function (event) {
  if (event.target.classList) event.target.classList.remove("is-invalid");
});
document.addEventListener("change", function (event) {
  if (event.target.classList) event.target.classList.remove("is-invalid");
});

function validate() {
  const titleInput = document.getElementById("fTitle");
  const managerSelect = document.getElementById("fManager");

  document
    .querySelectorAll(".is-invalid")
    .forEach((el) => el.classList.remove("is-invalid"));

  if (!locked) {
    if (!titleInput.value.trim()) {
      return fail("Give the inquiry a title.", titleInput);
    }

    const rows = Array.from(document.querySelectorAll(".cf-row"));

    if (!rows.length) {
      return fail("Add at least one question.", null);
    }

    const seen = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const labelInput = row.querySelector(".cf-label");
      const label = labelInput.value.trim();
      const type = row.querySelector(".cf-type").value;

      if (!label) {
        return fail("Question " + (i + 1) + " needs a label.", labelInput, row);
      }

      /* Answers are keyed by label on the responses table, so two questions
         sharing one give two columns nobody can tell apart. */
      if (seen.indexOf(label.toLowerCase()) !== -1) {
        return fail(
          `Two questions are both called "${label}".`,
          labelInput,
          row,
        );
      }

      seen.push(label.toLowerCase());
    }
  }

  if (!managerSelect.value) {
    return fail("Choose an account manager.", managerSelect);
  }

  return true;
}

async function save() {
  if (!validate()) return;

  const title = document.getElementById("fTitle").value.trim();
  const introText = document.getElementById("fDesc").value.trim();
  const reference = document.getElementById("fReference").value.trim();
  const fields = readFields();
  const status = document.getElementById("fStatus").value;
  const managerId = document.getElementById("fManager").value;

  const btn = document.getElementById("saveBtn");
  const label = document.getElementById("saveLabel").textContent;

  btn.disabled = true;
  document.getElementById("saveLabel").textContent = "Saving...";

  const body = {
    title: title,
    introText: introText,
    reference: reference,
    fields: fields,
    status: status,
    accountManagerId: managerId,
  };

  if (isEdit) body.id = inquiryId;

  try {
    const res = await fetch("api/admin-inquiries.php", {
      method: isEdit ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      WZI.toast(data.message || "Could not save.", true);
      btn.disabled = false;
      document.getElementById("saveLabel").textContent = label;
      return;
    }

    // The detail page is where the new link and the answers live, so that is
    // where a save lands rather than back on the list.
    window.location.href =
      "inquiry-details.html?id=" + (isEdit ? inquiryId : data.id);
  } catch (error) {
    WZI.toast("Network or server error.", true);
    btn.disabled = false;
    document.getElementById("saveLabel").textContent = label;
  }
}

// The box starts holding a sentence rather than a link, and reads muted until
// there is a real one to show.
function setLink(url) {
  const box = document.getElementById("fLink");
  box.textContent = url;
  box.classList.remove("empty");
}

function copyLink() {
  WZI.copyLink(inquiryName);
}

start();
