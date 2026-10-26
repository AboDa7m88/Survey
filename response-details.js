const id = new URLSearchParams(location.search).get("id");
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

// Clients Management is open to every admin, so the sidebar no longer hides it.

let responseAnswers = [];

// Answers are typed by the user and file names come off their upload, so both
// are escaped before they go anywhere near innerHTML.
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* A checklist answer is saved as the ticked items only - "✅ Logo, ✅ Web"
   (survey.html) - so each option on the form is looked up in it whole, which
   keeps an option with a comma in it intact. Ticked items the form no longer
   offers are still shown, after the rest. A checklist without options is one
   box to tick. */
function checklistAnswerHTML(item) {
  let options = [];
  try {
    options = item.chips ? JSON.parse(item.chips) : [];
  } catch (e) {
    options = [];
  }
  options = Array.isArray(options) ? options.map(String) : [];

  const answer = String(item.answer || "");

  if (!options.length) {
    const ticked = answer.trim() !== "";
    return `<ul class="q-options"><li class="${ticked ? "is-ticked" : ""}">${ticked ? "Ticked" : "Not ticked"}</li></ul>`;
  }

  const saved = ", " + answer + ",";
  const isTicked = (option) => saved.includes(", ✅ " + option + ",");

  // Ticked items no longer on the form: what is left once the known ones go.
  let rest = saved;
  options.forEach((option) => {
    rest = rest.split(", ✅ " + option + ",").join(",");
  });
  const extra = rest
    .split(", ✅ ")
    .slice(1)
    .map((part) => part.replace(/,$/, "").replace(/,+$/, "").trim())
    .filter(Boolean);

  const rows = options
    .map((option) => ({ label: option, ticked: isTicked(option) }))
    .concat(extra.map((label) => ({ label, ticked: true })));
  const count = rows.filter((row) => row.ticked).length;

  return `
    <div class="q-options-count">${count} of ${rows.length} selected</div>
    <ul class="q-options">
      ${rows
        .map(
          (row) => `
        <li class="${row.ticked ? "is-ticked" : ""}${/^\s*none of/i.test(row.label) ? " is-none" : ""}" dir="auto">
          <span class="sr-only">${row.ticked ? "Selected: " : "Not selected: "}</span>${esc(row.label)}
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

// The endpoint now checks who is asking - the answers are client data.
fetch("api/response-details.php?id=" + encodeURIComponent(id), {
  headers: { Authorization: "Bearer " + adminToken },
})
  .then((r) => {
    // A stale session goes back to login rather than showing "no answers".
    if (r.status === 401) {
      logoutAdmin();
      throw new Error("signed out");
    }
    return r.json();
  })
  .then((data) => {
    const target = document.getElementById("answers");

    if (!data.success) {
      target.innerHTML = `<div class="empty">${esc(data.message || "Unable to load this response.")}</div>`;
      return;
    }

    responseAnswers = data.answers || [];

    if (!responseAnswers.length) {
      target.innerHTML = `<div class="empty">No answers were submitted for this response.</div>`;
      return;
    }

    target.innerHTML = responseAnswers
      .map((item, index) => {
        const fileButton = item.file_id
          ? `
        <a class="download-file"
          href="api/download-survey-file.php?id=${encodeURIComponent(item.file_id)}&token=${encodeURIComponent(adminToken)}">
          Download File: ${esc(item.file_name)}
        </a>
      `
          : "";

        const isChecklist =
          item.question_type === "checkbox" ||
          item.question_type === "checklist";

        const body = isChecklist
          ? checklistAnswerHTML(item)
          : `<div class="answer${item.answer ? "" : " is-blank"}" dir="auto">${esc(item.answer) || "—"}</div>${fileButton}`;

        return `
      <div class="review-question">
        <button
          type="button"
          class="rq-head"
          aria-expanded="true"
          onclick="const card = this.parentElement; this.setAttribute('aria-expanded', !card.classList.toggle('collapsed'));"
        >
          <span class="rq-title">
            <span class="q-index">Question ${index + 1}</span>
            <span class="q-text" dir="auto">${esc(item.question_text)}</span>
          </span>
          <span class="rq-toggle" aria-hidden="true">▼</span>
        </button>
        <div class="rq-body">${body}</div>
      </div>
    `;
      })
      .join("");
  })
  .catch(() => {
    document.getElementById("answers").innerHTML =
      `<div class="empty">Connection error.</div>`;
  });

function downloadWord() {
  if (!responseAnswers.length) {
    alert("No answers to download");
    return;
  }

  let content = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Form Answers</title>
      <style>
        body{font-family:Arial;line-height:1.6;}
        h1{color:#c9000b;}
        .answer-box{
          border:1px solid #ddd;
          padding:15px;
          margin-bottom:15px;
          border-radius:10px;
        }
        .question{font-weight:bold;margin-bottom:8px;}
      </style>
    </head>
    <body>
      <h1>Form Answers</h1>
  `;

  responseAnswers.forEach((item) => {
    content += `
      <div class="answer-box">
        <div class="question">${item.question_text}</div>
        <div>${item.answer || ""}</div>
        ${item.file_name ? `<div>Attached File: ${item.file_name}</div>` : ""}
      </div>
    `;
  });

  content += `
    </body>
    </html>
  `;

  const blob = new Blob([content], {
    type: "application/msword",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "form-answers.doc";
  link.click();

  URL.revokeObjectURL(link.href);
}

function downloadExcel() {
  if (!responseAnswers.length) {
    alert("No answers to download");
    return;
  }

  let csv = "Question,Answer,Attached File\n";

  responseAnswers.forEach((item) => {
    const question = `"${String(item.question_text || "").replace(/"/g, '""')}"`;
    const answer = `"${String(item.answer || "").replace(/"/g, '""')}"`;
    const file = `"${String(item.file_name || "").replace(/"/g, '""')}"`;

    csv += `${question},${answer},${file}\n`;
  });

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "form-answers.csv";
  link.click();

  URL.revokeObjectURL(link.href);
}
function downloadMarkdown() {
  if (!responseAnswers.length) {
    alert("No answers to download");
    return;
  }

  let markdown = "# Form Answers\n\n";

  responseAnswers.forEach((item, index) => {
    markdown += `## ${index + 1}. ${item.question_text || ""}\n\n`;

    markdown += `${item.answer || ""}\n\n`;

    if (item.file_name) {
      markdown += `**Attached File:** ${item.file_name}\n\n`;
    }

    markdown += "---\n\n";
  });

  const blob = new Blob([markdown], {
    type: "text/markdown;charset=utf-8;",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "form-answers.md";
  link.click();

  URL.revokeObjectURL(link.href);
}
