let adminToken = localStorage.getItem("admin_token");
let adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

/* An account manager or the owner is the approval step, so a form they write
   goes straight to the client - api/admin-surveys.php does the same on save. */
const canReview =
  adminUser.role === "account_manager" || adminUser.role === "owner";

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

/* ── Create or edit ─────────────────────────────────────────────────────────
   One builder, two modes, picked off the query string exactly like the content
   form: admin-form-builder.html for a new form, ?edit=<id> for an existing
   one. Editing an existing form never touches the draft. */

const editingSurveyId = new URLSearchParams(location.search).get("edit");
const draftingEnabled = !editingSurveyId;

const DRAFT_KEY = `survey_draft_${adminUser.id || "admin"}`;

/* ── The item cards ─────────────────────────────────────────────────────── */

function parseChipsToArray(chips) {
  if (!chips) return [];
  if (Array.isArray(chips)) return chips;
  try {
    const parsed = JSON.parse(chips);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return String(chips)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function createOptionsBuilder(
  initialChips = [],
  isCheckbox = false,
  onUpdate = null,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "extra-field-options";
  wrapper.style.cssText = "grid-column: 1 / -1;";

  const label = document.createElement("label");
  label.className = "options-field-label";
  label.style.cssText =
    "font-weight:700; font-size:13px; margin-bottom:8px; display:block;";
  label.textContent = isCheckbox
    ? "Checklist Items / Options"
    : "Quick Keywords (Optional)";

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "options-items-list";
  itemsContainer.style.cssText =
    "display:flex; flex-direction:column; gap:8px;";

  function addOptionRow(val = "") {
    const row = document.createElement("div");
    row.className = "option-row";
    row.style.cssText = "display:flex; align-items:center; gap:8px;";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "option-input";
    input.dir = "auto";
    input.placeholder = isCheckbox
      ? "Enter checklist item (e.g. Check Tires)"
      : "Enter keyword (e.g. Quick Service)";
    input.value = val;
    input.style.cssText = "flex:1;";

    if (onUpdate) {
      input.addEventListener("input", onUpdate);
      input.addEventListener("change", onUpdate);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-option-btn";
    removeBtn.title = "Remove Option";
    removeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none; display:block;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    removeBtn.style.cssText =
      "background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:8px; width:40px; height:40px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.15s ease;";

    removeBtn.onmouseenter = () => {
      removeBtn.style.background = "#dc2626";
      removeBtn.style.color = "#ffffff";
    };
    removeBtn.onmouseleave = () => {
      removeBtn.style.background = "#fee2e2";
      removeBtn.style.color = "#ef4444";
    };

    removeBtn.addEventListener("click", function () {
      row.remove();
      if (onUpdate) onUpdate();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    itemsContainer.appendChild(row);

    return input;
  }

  const initialArray = parseChipsToArray(initialChips);
  if (initialArray.length > 0) {
    initialArray.forEach((val) => addOptionRow(val));
  } else {
    addOptionRow("");
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "secondary-btn add-option-btn";
  addBtn.style.cssText =
    "margin-top:10px; padding:9px 14px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; gap:6px; border-radius:8px; cursor:pointer;";
  addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Option`;

  addBtn.addEventListener("click", function () {
    const newInput = addOptionRow("");
    newInput.focus();
    if (onUpdate) onUpdate();
  });

  wrapper.appendChild(label);
  wrapper.appendChild(itemsContainer);
  wrapper.appendChild(addBtn);

  return {
    wrapper,
    label,
    itemsContainer,
    addOptionRow,
  };
}

function addQuestion(
  value = "",
  type = "input",
  chips = "",
  maxFileSizeMb = "",
) {
  const wrap = document.getElementById("questionsWrap");

  const div = document.createElement("div");
  div.className = "question-card";

  const typeLabels = {
    input: "Text",
    textarea: "Paragraph",
    file: "File Upload",
    checkbox: "Checklist",
    checklist: "Checklist",
  };

  const initialType = type || "input";
  const isCheckbox = initialType === "checkbox" || initialType === "checklist";

  div.innerHTML = `
    <div class="question-card-header">
      <div class="question-card-header-left">
        <span class="toggle-icon">▼</span>
        <span class="question-card-title-preview" dir="auto">${escapeHtml(value) || "New Item / Question"}</span>
        <span class="type-badge badge-${isCheckbox ? "checkbox" : initialType}">${typeLabels[initialType] || initialType}</span>
      </div>
      <div class="question-card-actions">
        <button class="remove-btn" type="button" style="padding:6px 14px;font-size:12px;">Remove</button>
      </div>
    </div>
    <div class="question-card-body">
      <div>
        <label>Item / Question Text</label>
        <input type="text" class="questionText" placeholder="Enter title or text" dir="auto" value="${escapeHtml(value)}">
      </div>
      <div>
        <label>Type</label>
        <select class="questionType">
          <option value="input" ${initialType === "input" ? "selected" : ""}>Text</option>
          <option value="textarea" ${initialType === "textarea" ? "selected" : ""}>Paragraph</option>
          <option value="file" ${initialType === "file" ? "selected" : ""}>File Upload</option>
          <option value="checkbox" ${isCheckbox ? "selected" : ""}>Checklist</option>
        </select>
      </div>
      <div class="extra-field-file" style="grid-column: 1 / -1; display: ${initialType === "file" ? "block" : "none"};">
        <label>Max File Size (MB)</label>
        <input
          type="number"
          class="questionMaxFileSize question-chips-input"
          placeholder="Max file size MB (e.g. 5)"
          value="${escapeHtml(maxFileSizeMb)}"
        >
      </div>
    </div>
  `;

  const body = div.querySelector(".question-card-body");
  const optionsBuilder = createOptionsBuilder(chips, isCheckbox, saveDraft);

  // Options belong to a checklist only. A Text or Paragraph answer is free typing, and a
  // File Upload has nothing to list either.
  if (!isCheckbox) {
    optionsBuilder.wrapper.style.display = "none";
  }
  body.appendChild(optionsBuilder.wrapper);

  const header = div.querySelector(".question-card-header");
  header.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-btn")) return;
    div.classList.toggle("collapsed");
  });

  const textInput = div.querySelector(".questionText");
  const previewSpan = div.querySelector(".question-card-title-preview");
  textInput.addEventListener("input", function () {
    previewSpan.textContent = textInput.value.trim() || "New Item / Question";
  });

  const typeSelect = div.querySelector(".questionType");
  const badgeSpan = div.querySelector(".type-badge");
  const fileField = div.querySelector(".extra-field-file");

  typeSelect.addEventListener("change", function () {
    const selected = typeSelect.value;
    const isCb = selected === "checkbox" || selected === "checklist";
    badgeSpan.className = `type-badge badge-${isCb ? "checkbox" : selected}`;
    badgeSpan.textContent = typeLabels[selected] || selected;

    if (selected === "input" || selected === "textarea") {
      optionsBuilder.wrapper.style.display = "none";
      fileField.style.display = "none";
    } else if (isCb) {
      optionsBuilder.wrapper.style.display = "block";
      optionsBuilder.label.textContent = "Checklist Items / Options";
      fileField.style.display = "none";
    } else if (selected === "file") {
      optionsBuilder.wrapper.style.display = "none";
      fileField.style.display = "block";
    }
  });

  div.querySelector(".remove-btn").addEventListener("click", function (e) {
    e.stopPropagation();
    div.remove();
    saveDraft();
  });

  div.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", saveDraft);
    el.addEventListener("change", saveDraft);
  });

  wrap.appendChild(div);
  saveDraft();
}

/* The card markup is built from a template string, so anything coming back
   from the server or a draft has to be escaped before it goes in. */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getQuestionsData() {
  return Array.from(document.querySelectorAll("#questionsWrap .question-card"))
    .map((box) => {
      const chipInputs = Array.from(box.querySelectorAll(".option-input"))
        .map((i) => i.value.trim())
        .filter(Boolean);
      return {
        text: box.querySelector(".questionText")?.value.trim() || "",
        type: box.querySelector(".questionType")?.value || "input",
        chips: chipInputs.join(", "),
        maxFileSizeMb:
          box.querySelector(".questionMaxFileSize")?.value.trim() || "",
      };
    })
    .filter((q) => q.text);
}

/* ── Unsaved-work recovery ──────────────────────────────────────────────────
   Create mode only. A draft holding no title, no user and no item text would
   restore nothing, so it is never written and never announced. */

function currentDraft() {
  return {
    savedAt: Date.now(),
    title: document.getElementById("surveyTitle").value,
    description: document.getElementById("surveyDescription").value,
    assignedUserId: document.getElementById("assignedUser").value,
    questions: getQuestionsData(),
  };
}

function hasWork(draft) {
  if (!draft) return false;

  return Boolean(
    (draft.title || "").trim() ||
    (draft.description || "").trim() ||
    draft.assignedUserId ||
    (draft.questions || []).some((q) => (q.text || "").trim()),
  );
}

function saveDraft() {
  if (!draftingEnabled) return;

  try {
    const draft = currentDraft();

    if (hasWork(draft)) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch (e) {
    // Quota or private mode - autosave is a convenience, never block the form.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
}

function describeAge(savedAt) {
  const mins = Math.round((Date.now() - savedAt) / 60000);
  if (!savedAt || mins < 1) return "a moment ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "earlier";
}

function loadDraft() {
  if (!draftingEnabled) return false;

  let draft;
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return false;
    draft = JSON.parse(saved);
  } catch (e) {
    return false;
  }

  // JSON.parse returns null, a number or a string for a key written by an
  // older build or corrupted; none of those can be restored.
  if (
    !draft ||
    typeof draft !== "object" ||
    Array.isArray(draft) ||
    !hasWork(draft)
  ) {
    clearDraft();
    return false;
  }

  document.getElementById("surveyTitle").value = draft.title || "";
  document.getElementById("surveyDescription").value = draft.description || "";
  document.getElementById("assignedUser").value = draft.assignedUserId || "";

  document.getElementById("questionsWrap").innerHTML = "";
  (draft.questions || []).forEach((q) =>
    addQuestion(q.text, q.type, q.chips, q.maxFileSizeMb),
  );

  document.getElementById("restoreText").innerText =
    `Restored unsaved changes from ${describeAge(draft.savedAt)}.`;
  document.getElementById("restoreBar").hidden = false;

  return true;
}

async function startFresh() {
  const ok = await askConfirm({
    title: "Start fresh",
    text: "The restored changes will be discarded and you start again with a blank form.",
    action: "Start fresh",
  });

  if (!ok) return;

  clearDraft();
  location.href = location.pathname;
}

/* ── Load ───────────────────────────────────────────────────────────────── */

/* A client is named by its company, as every other list in the admin does;
   the person's name stands in only when no company was given. */
function clientLabel(user) {
  return (
    String(user.company_name || "").trim() || user.name || "Unnamed client"
  );
}

async function loadAssignableUsers() {
  const userSelect = document.getElementById("assignedUser");

  try {
    const res = await fetch("api/admin-surveys.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (!data.success) {
      userSelect.innerHTML = `<option value="">Unable to load users</option>`;
      return false;
    }

    if (data.users && data.users.length) {
      userSelect.innerHTML = `
        <option value="">Select user</option>
        ${data.users
          .map(
            (user) => `
          <option value="${escapeHtml(user.id)}" dir="auto">${escapeHtml(clientLabel(user))}</option>
        `,
          )
          .join("")}
      `;
    } else {
      userSelect.innerHTML = `<option value="">No approved users</option>`;
    }

    return true;
  } catch (error) {
    userSelect.innerHTML = `<option value="">Connection error</option>`;
    return false;
  }
}

async function loadSurveyForEdit() {
  const status = document.getElementById("surveyStatus");
  status.innerText = "Loading form...";

  try {
    const res = await fetch(
      "api/admin-surveys.php?survey_id=" + encodeURIComponent(editingSurveyId),
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );

    const data = await res.json();

    if (!data.success) {
      status.innerText = data.message || "Unable to load this form.";
      return;
    }

    if (
      !["pending_review", "pending", "rejected"].includes(data.survey.status)
    ) {
      alert(
        "Only forms awaiting approval, pending, or rejected can be edited.",
      );
      window.location.href = "admin.html";
      return;
    }

    document.getElementById("surveyTitle").value = data.survey.title || "";
    document.getElementById("surveyDescription").value =
      data.survey.description || "";
    document.getElementById("assignedUser").value =
      data.survey.assigned_user_id || "";

    document.getElementById("questionsWrap").innerHTML = "";

    (data.questions || []).forEach((q) => {
      const chipsText = parseChipsToArray(q.chips).join(", ");
      addQuestion(
        q.question_text,
        q.question_type,
        chipsText,
        q.max_file_size_mb || "",
      );
    });

    if (!document.querySelector("#questionsWrap .question-card")) addQuestion();

    // The reviewer's reason for sending it back belongs on screen, not
    // buried in the list it was opened from.
    status.innerText =
      data.survey.status === "rejected" && data.survey.review_note
        ? "Rejected by reviewer: " + data.survey.review_note
        : "";
  } catch (error) {
    status.innerText = "Connection error.";
  }
}

async function init() {
  if (!editingSurveyId && canReview) {
    document.getElementById("pageSub").innerText =
      "Assign a form to an approved client. It goes straight to them.";
  }

  if (editingSurveyId) {
    document.title = "Edit Form — Admin";
    document.getElementById("pageHeading").innerText = "Edit Form";
    document.getElementById("pageSub").innerText = canReview
      ? "Change the title, the assigned user or the items below. The client sees the update straight away."
      : "Change the title, the assigned user or the items below, then send it back for approval.";
    document.getElementById("surveySubmitBtn").innerText = "Update Form";
  }

  await loadAssignableUsers();

  if (editingSurveyId) {
    await loadSurveyForEdit();
    return;
  }

  // The users have to be in the select before a draft can select one.
  if (!loadDraft()) addQuestion();
}

/* ── Save ───────────────────────────────────────────────────────────────── */

async function saveSurvey() {
  const title = document.getElementById("surveyTitle").value.trim();
  const description = document.getElementById("surveyDescription").value.trim();
  const assignedUserId = document.getElementById("assignedUser").value;
  const status = document.getElementById("surveyStatus");

  const questions = getQuestionsData();

  if (!title || !assignedUserId || !questions.length) {
    status.innerText = "Please add title, user and at least one item/question.";
    return;
  }

  const submitBtn = document.getElementById("surveySubmitBtn");
  submitBtn.disabled = true;
  status.innerText = editingSurveyId ? "Updating..." : "Creating...";

  try {
    const res = await fetch("api/admin-surveys.php", {
      method: editingSurveyId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        surveyId: editingSurveyId,
        title,
        description,
        assignedUserId,
        questions,
      }),
    });

    const data = await res.json();

    status.innerText = data.message;

    if (data.success) {
      clearDraft();
      // Back to the list, the way the content form returns to Content.
      window.location.href = "admin.html";
      return;
    }

    submitBtn.disabled = false;
  } catch (error) {
    status.innerText = "Connection error.";
    submitBtn.disabled = false;
  }
}

// Autosave anything typed outside a card too - the title and the user select.
document.getElementById("surveyTitle").addEventListener("input", saveDraft);
document
  .getElementById("surveyDescription")
  .addEventListener("input", saveDraft);
document.getElementById("assignedUser").addEventListener("change", saveDraft);

init();
