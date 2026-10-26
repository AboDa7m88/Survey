let token = localStorage.getItem("portal_token");

if (!token) {
  window.location.href = "login.html";
}

const params = new URLSearchParams(window.location.search);
const surveyId = params.get("id");

if (!surveyId) {
  alert("Survey ID missing");
  window.location.href = "forms.html";
}

let loadedQuestions = [];
let recognition;
let isRecording = false;
let currentButton = null;
const STORAGE_KEY = "survey_answers_" + surveyId;

/* A checklist puts several boxes under one question id, so each box is keyed
   by its item too - keyed by the id alone, every box overwrote the last and
   only one tick came back. A file can't be put back into a file input
   (setting its value throws), so file questions aren't saved at all. */
function draftKey(field) {
  return field.type === "checkbox"
    ? field.dataset.questionId + "|" + field.dataset.itemLabel
    : field.dataset.questionId;
}

function draftFields() {
  return document.querySelectorAll(
    "#questionsWrap input:not([type='file']), #questionsWrap textarea",
  );
}

function saveToLocalStorage() {
  const data = {};

  draftFields().forEach((field) => {
    data[draftKey(field)] =
      field.type === "checkbox"
        ? field.checked
          ? "checked"
          : "unchecked"
        : field.value;
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromLocalStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) return;

  const data = JSON.parse(saved);

  draftFields().forEach((field) => {
    const value = data[draftKey(field)];
    if (value === undefined) return;

    if (field.type === "checkbox") {
      field.checked = value === "checked";
    } else {
      field.value = value;
    }
  });
}

async function loadSurvey() {
  const status = document.getElementById("status");

  try {
    const res = await fetch("api/survey-details.php?id=" + surveyId, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();

    if (!data.success) {
      status.classList.add("error");
      status.innerText = data.message;
      return;
    }

    document.getElementById("surveyTitle").innerText = data.survey.title;

    // Optional: hidden entirely rather than left as an empty gap.
    const description = (data.survey.description || "").trim();
    const descriptionEl = document.getElementById("surveyDescription");
    descriptionEl.innerText = description;
    descriptionEl.hidden = !description;

    document.getElementById("surveyMeta").innerText =
      "Status: " +
      (data.survey.status === "completed" ? "Completed" : "Waiting on you") +
      " | Created: " +
      data.survey.created_at;

    loadedQuestions = data.questions;
    window.loadedAnswers = data.answers || [];
    window.loadedFiles = data.files || {};
    if (data.survey.status === "completed") {
      document.getElementById("completedBox").innerHTML =
        `<div class="completed">This survey has already been submitted.</div>`;

      document.getElementById("submitBtn").style.display = "none";
      // the confirm gate belongs to the fill-in flow only
      document.getElementById("confirmBox").style.display = "none";
    }

    renderQuestions();
    loadFromLocalStorage();
  } catch (error) {
    status.classList.add("error");
    status.innerText = "Connection error";
  }
}

/* Question text, checklist items and answers are typed by people, so they go
   into the markup as text - a "<" in a question is a character, not a tag. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderQuestions() {
  const wrap = document.getElementById("questionsWrap");

  if (!loadedQuestions.length) {
    wrap.innerHTML = `<p>No questions found.</p>`;
    return;
  }

  const isCompleted =
    document.getElementById("submitBtn").style.display === "none";

  if (isCompleted) {
    wrap.innerHTML = loadedQuestions
      .map((q) => {
        const answerObj = (window.loadedAnswers || []).find(
          (a) => Number(a.question_id) === Number(q.id),
        );
        const answerText = answerObj ? answerObj.answer : "No answer found";
        const isChecklist =
          q.question_type === "checkbox" || q.question_type === "checklist";

        let answerHTML;

        if (q.question_type === "file") {
          const upload = (window.loadedFiles || {})[q.id];

          if (upload) {
            const base =
              "api/download-survey-file.php?id=" +
              upload.id +
              "&token=" +
              encodeURIComponent(token);
            const isImage =
              String(upload.file_type || "").indexOf("image/") === 0;

            answerHTML = `
            <div class="answer-box">
              ${isImage ? `<img class="answer-image" src="${base}&mode=view" alt="${upload.original_name}">` : ""}
              <a class="answer-file" href="${base}" target="_blank" rel="noopener">
                ⬇ ${upload.original_name}
              </a>
            </div>
          `;
          } else {
            answerHTML = `<div class="answer-box" dir="auto">${esc(answerText)}</div>`;
          }
        } else if (isChecklist && answerObj) {
          // Checklist answers are stored as "✅ item, ✅ item" — split on the comma that
          // precedes a tick so item labels containing commas stay intact.
          const items = answerText
            .split(/,\s*(?=✅)/)
            .map((s) => s.trim())
            .filter(Boolean);

          answerHTML = items.length
            ? `<ul class="answer-list">${items.map((item) => `<li dir="auto">${esc(item)}</li>`).join("")}</ul>`
            : `<div class="answer-box" dir="auto">${esc(answerText)}</div>`;
        } else {
          answerHTML = `<div class="answer-box" dir="auto">${esc(answerText)}</div>`;
        }

        return `
        <div class="collapsible-question-card">
          <div class="collapsible-question-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div style="flex:1;">
              <span dir="auto">${esc(q.question_text)}</span>
            </div>
            <span class="collapsible-toggle-icon">▼</span>
          </div>

          <div class="collapsible-question-body">
            ${answerHTML}
          </div>
        </div>
      `;
      })
      .join("");

    return;
  }

  wrap.innerHTML = loadedQuestions
    .map((q) => {
      const required = Number(q.required) === 1;

      let inputHTML = "";
      let chips = [];

      try {
        chips = q.chips ? JSON.parse(q.chips) : [];
      } catch (e) {
        chips = [];
      }

      const chipsHTML = chips
        .map(
          (chip) => `
      <button
        class="chip-btn"
        type="button"
        onclick="insertChip('${q.id}', '${chip.replace(/'/g, "\\'")}')"
      >
        <span dir="auto">${esc(chip)}</span>
      </button>
    `,
        )
        .join("");

      const isCheckbox =
        q.question_type === "checkbox" || q.question_type === "checklist";

      if (q.question_type === "file") {
        inputHTML = `
        <div class="file-field">
          <input
            type="file"
            data-question-id="${q.id}"
            data-question-label="${esc(q.question_text)}"
            data-required="${required ? "1" : "0"}"
            data-max-size="${q.max_file_size_mb || ""}"
            required
            onchange="handleFilePick(this)"
            style="padding-left:16px;"
          >

          <div class="file-preview" hidden>
            <img alt="" hidden>
            <span class="file-name"></span>
            <button
              type="button"
              class="file-remove"
              onclick="clearFilePick(this)"
              title="Remove file"
              aria-label="Remove file"
            >&times;</button>
          </div>
        </div>
        ${
          q.max_file_size_mb
            ? `<div style="font-size:12px;color:#667085;margin-top:6px;">Max file size: ${q.max_file_size_mb} MB</div>`
            : ""
        }
      `;
      } else if (isCheckbox) {
        if (chips && chips.length > 0) {
          inputHTML = `
          <div class="check-count">${chips.length} ${chips.length === 1 ? "option" : "options"}</div>
          <div class="check-grid">
            ${chips
              .map(
                (item) => `
              <label class="check-option${/^\s*none of/i.test(item) ? " is-none" : ""}">
                <input
                  type="checkbox"
                  class="survey-checkbox-input"
                  data-question-id="${q.id}"
                  data-question-label="${esc(q.question_text)}"
                  data-item-label="${esc(item)}"
                  data-required="${required ? "1" : "0"}"
                >
                <span dir="auto">${esc(item)}</span>
              </label>
            `,
              )
              .join("")}
          </div>
        `;
        } else {
          inputHTML = `
          <label style="display:flex; align-items:center; gap:12px; cursor:pointer; font-weight:600; font-size:15px; padding:4px 0; margin:0;">
            <input
              type="checkbox"
              class="survey-checkbox-input"
              data-question-id="${q.id}"
              data-question-label="${esc(q.question_text)}"
              data-item-label="${esc(q.question_text)}"
              data-required="${required ? "1" : "0"}"
              style="width:24px; height:24px; cursor:pointer; accent-color:#1b1e3a; margin:0;"
            >
            <span>Complete item</span>
          </label>
        `;
        }
      } else if (q.question_type === "textarea") {
        // Paragraph: room for a few sentences, same mic and chips as Text.
        inputHTML = `
        <div class="input-area">
          <textarea
            rows="4"
            dir="auto"
            data-question-id="${q.id}"
            data-question-label="${esc(q.question_text)}"
            data-required="${required ? "1" : "0"}"
            placeholder="Type your answer here..."
            required
          ></textarea>
          <button class="mic-btn" type="button" onclick="toggleVoice('${q.id}', this)">🎙</button>
        </div>
      `;
      } else {
        inputHTML = `
        <div class="input-area">
          <input
            type="text"
            dir="auto"
            data-question-id="${q.id}"
            data-question-label="${esc(q.question_text)}"
            data-required="${required ? "1" : "0"}"
            placeholder="Type your answer here..."
            required
          >
          <button class="mic-btn" type="button" onclick="toggleVoice('${q.id}', this)">🎙</button>
        </div>
      `;
      }

      return `
      <div class="collapsible-question-card">
        <div class="collapsible-question-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div style="flex:1;">
            <span><span dir="auto">${esc(q.question_text)}</span> ${required ? `<span class="required" style="color:#c9000b">*</span>` : ""}</span>
          </div>
          <span class="collapsible-toggle-icon">▼</span>
        </div>

        <div class="collapsible-question-body">
          ${inputHTML}
          ${
            !isCheckbox && q.question_type !== "file" && chipsHTML
              ? `<div class="question-chips">${chipsHTML}</div>`
              : ""
          }
        </div>
      </div>
    `;
    })
    .join("");

  document
    .querySelectorAll("#questionsWrap input, #questionsWrap textarea")
    .forEach((field) => {
      field.addEventListener("input", function () {
        field.classList.remove("error-field");
        saveToLocalStorage();
      });

      field.addEventListener("change", function () {
        field.classList.remove("error-field");
        saveToLocalStorage();
      });
    });
}
function toggleVoice(fieldId, button) {
  if (isRecording) {
    stopVoice();
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Use Google Chrome");
    return;
  }

  const field = document.querySelector(`[data-question-id="${fieldId}"]`);

  if (!field) {
    alert("Field not found");
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = field.value || "";

  recognition.start();

  isRecording = true;
  currentButton = button;

  button.innerHTML = "⏹";
  button.classList.add("recording");

  document.getElementById("status").classList.remove("error");
  document.getElementById("status").innerText = "🎤 Listening...";

  recognition.onresult = function (event) {
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      let transcript = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interimTranscript += transcript;
      }
    }

    field.value = finalTranscript + interimTranscript;
    field.classList.remove("field-error");
    saveToLocalStorage();
  };

  recognition.onend = function () {
    resetButton();
  };

  recognition.onerror = function (event) {
    console.log("Speech error:", event.error);
    resetButton();
  };
}

function stopVoice() {
  if (recognition) {
    recognition.stop();
  }

  resetButton();
}

function resetButton() {
  isRecording = false;

  if (currentButton) {
    currentButton.innerHTML = "🎙";
    currentButton.classList.remove("recording");
  }

  document.getElementById("status").innerText = "Ready";
}

function validateSurvey() {
  const fields = document.querySelectorAll(
    "#questionsWrap input:not([type='checkbox']), #questionsWrap textarea",
  );
  let valid = true;

  fields.forEach((field) => {
    field.classList.remove("error-field");

    const required = field.dataset.required === "1";

    if (required) {
      if (field.type === "file") {
        if (!field.files.length) {
          field.classList.add("error-field");
          valid = false;
          return;
        }

        let maxMb = Number(field.dataset.maxSize || 0);

        if (maxMb <= 0 || maxMb > 5) {
          maxMb = 5;
        }

        if (field.files[0].size > maxMb * 1024 * 1024) {
          field.classList.add("error-field");
          document.getElementById("status").classList.add("error");
          document.getElementById("status").innerText =
            "Maximum file size allowed is " + maxMb + "MB.";
          valid = false;
          return;
        }
      } else if (field.value.trim() === "") {
        field.classList.add("error-field");
        valid = false;
      }
    }
  });

  const cards = document.querySelectorAll(
    "#questionsWrap .collapsible-question-card",
  );
  cards.forEach((card) => {
    const checkboxes = card.querySelectorAll("input[type='checkbox']");
    if (checkboxes.length > 0) {
      const isRequired = checkboxes[0].dataset.required === "1";
      if (isRequired) {
        const anyChecked = Array.from(checkboxes).some((cb) => cb.checked);
        if (!anyChecked) {
          card.classList.add("error-field");
          valid = false;
        } else {
          card.classList.remove("error-field");
        }
      }
    }
  });

  return valid;
}
function insertChip(questionId, text) {
  const field = document.querySelector(`[data-question-id="${questionId}"]`);

  if (!field) return;

  if (field.type === "file") return;

  if (field.value.trim()) {
    field.value += ", " + text;
  } else {
    field.value = text;
  }

  field.classList.remove("error-field");
  saveToLocalStorage();
}
// ── File picker preview ──────────────────────────────────────────────
// Images get a thumbnail; any file gets its name plus an × to clear it so a
// different one can be chosen (a file input cannot be emptied by the user).
function handleFilePick(input) {
  const wrap = input.closest(".file-field");
  const preview = wrap.querySelector(".file-preview");
  const img = preview.querySelector("img");
  const name = preview.querySelector(".file-name");
  const file = input.files[0];

  if (img.dataset.url) {
    URL.revokeObjectURL(img.dataset.url);
    delete img.dataset.url;
  }

  if (!file) {
    img.hidden = true;
    img.removeAttribute("src");
    preview.hidden = true;
    return;
  }

  name.textContent = file.name;

  if (file.type.indexOf("image/") === 0) {
    const url = URL.createObjectURL(file);
    img.dataset.url = url;
    img.src = url;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
  }

  preview.hidden = false;
}

function clearFilePick(btn) {
  const wrap = btn.closest(".file-field");
  const input = wrap.querySelector("input[type='file']");

  input.value = "";
  handleFilePick(input);
  input.focus();
}

async function submitSurvey() {
  const status = document.getElementById("status");
  status.classList.remove("error");

  const confirmSubmit = document.getElementById("confirmSubmit");

  if (!confirmSubmit.checked) {
    status.classList.add("error");
    status.innerText = "Please confirm that you reviewed all questions.";
    return;
  }

  if (!validateSurvey()) {
    status.classList.add("error");

    if (status.innerText.indexOf("Maximum file size") === -1) {
      status.innerText = "Please answer all required questions.";
    }

    return;
  }

  const nonCheckboxFields = document.querySelectorAll(
    "#questionsWrap input:not([type='checkbox']), #questionsWrap textarea",
  );

  const answers = [];
  const formData = new FormData();

  formData.append("surveyId", surveyId);

  nonCheckboxFields.forEach((field) => {
    if (field.type === "file") {
      if (field.files.length) {
        formData.append(
          "files[" + field.dataset.questionId + "]",
          field.files[0],
        );
      }

      answers.push({
        questionId: field.dataset.questionId,
        questionLabel: field.dataset.questionLabel,
        answer: field.files.length ? field.files[0].name : "",
      });
    } else {
      answers.push({
        questionId: field.dataset.questionId,
        questionLabel: field.dataset.questionLabel,
        answer: field.value.trim(),
      });
    }
  });

  const checkboxGroupMap = {};
  const allCheckboxes = document.querySelectorAll(
    "#questionsWrap input[type='checkbox']",
  );
  allCheckboxes.forEach((cb) => {
    const qId = cb.dataset.questionId;
    if (!checkboxGroupMap[qId]) {
      checkboxGroupMap[qId] = {
        questionLabel: cb.dataset.questionLabel,
        items: [],
      };
    }
    if (cb.checked) {
      const itemLabel = cb.dataset.itemLabel || "";
      checkboxGroupMap[qId].items.push(itemLabel ? `✅ ${itemLabel}` : "✅");
    }
  });

  Object.keys(checkboxGroupMap).forEach((qId) => {
    const group = checkboxGroupMap[qId];
    if (group.items.length > 0) {
      answers.push({
        questionId: qId,
        questionLabel: group.questionLabel,
        answer: group.items.join(", "),
      });
    }
  });

  formData.append("answers", JSON.stringify(answers));

  status.innerText = "Submitting...";

  try {
    const res = await fetch("api/submit-survey.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: formData,
    });

    const data = await res.json();

    status.innerText = data.message;

    if (data.success) {
      localStorage.removeItem(STORAGE_KEY);

      alert("Survey submitted successfully");

      window.location.href = "forms.html";
    } else {
      status.classList.add("error");
    }
  } catch (error) {
    status.classList.add("error");
    status.innerText = "Connection error";
  }
}
loadSurvey();
