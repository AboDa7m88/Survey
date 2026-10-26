let token = localStorage.getItem("portal_token");
if (!token) {
  window.location.href = "login.html";
}

let allSurveys = [];
let currentFilter = "all";

/* What the client reads for each status. Only released forms reach
       this page: api/dashboard.php leaves out "pending_review" (still with
       a reviewer) and "rejected" (sent back to its creator). */
const statusMeta = {
  pending: { label: "Waiting on you", cls: "waiting" },
  completed: { label: "Completed", cls: "responded" },
};

const filterTitles = {
  all: "All forms",
  pending: "Waiting on you",
  completed: "Completed",
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* "2026-10-01 14:05:00" -> "1 Oct 2026". Falls back to the raw value. */
function prettyDate(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  if (isNaN(date)) return value || "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const EYE_ICON = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>`;

function renderSurveys() {
  const surveyTable = document.getElementById("surveyTable");
  const rows =
    currentFilter === "all"
      ? allSurveys
      : allSurveys.filter((s) => s.status === currentFilter);

  document.getElementById("formsHeading").innerText =
    filterTitles[currentFilter];
  document.getElementById("formsCount").innerText =
    `${rows.length} item${rows.length === 1 ? "" : "s"}`;
  document.getElementById("showAll").hidden = currentFilter === "all";
  document.querySelectorAll(".stat").forEach((card) => {
    card.classList.toggle("active", card.dataset.filter === currentFilter);
  });

  if (!rows.length) {
    const empty =
      currentFilter === "all"
        ? "No forms yet. When your account manager sends one, it will appear here."
        : "Nothing here right now.";
    surveyTable.innerHTML = `<tr><td colspan="4" class="empty">${empty}</td></tr>`;
    return;
  }

  /* The phone swaps the text link for the eye icon; see the 768px block. */
  surveyTable.innerHTML = rows
    .map((s) => {
      const meta = statusMeta[s.status] || { label: s.status, cls: "closed" };
      const href = `survey.html?id=${encodeURIComponent(s.id)}`;
      const action = s.status === "completed" ? "View" : "Fill in";
      return `
            <tr>
              <td><b dir="auto">${esc(s.title)}</b></td>
              <td>${esc(prettyDate(s.created_at))}</td>
              <td><span class="badge ${meta.cls}">${esc(meta.label)}</span></td>
              <td class="row-action">
                <a class="view" href="${href}">${action}</a>
                <a class="eye-btn" href="${href}" title="${action}" aria-label="${action}">${EYE_ICON}</a>
              </td>
            </tr>
          `;
    })
    .join("");
}

function setFilter(filter) {
  currentFilter = filter;
  renderSurveys();
}

/* The three newest published posts. api/user-content.php already sorts
       newest first; each card opens that post on content.html. */
async function loadLatestContent() {
  const grid = document.getElementById("latestContent");
  try {
    const res = await fetch("api/user-content.php", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    renderLatestContent(((data.success && data.content) || []).slice(0, 3));
  } catch (e) {
    grid.innerHTML = `<div class="latest-empty">Couldn't load content.</div>`;
  }
}

function renderLatestContent(items) {
  const grid = document.getElementById("latestContent");
  if (!items.length) {
    grid.innerHTML = `<div class="latest-empty">No content published yet.</div>`;
    return;
  }
  grid.innerHTML = items
    .map(
      (item) => `
          <a class="latest-card" href="content.html?id=${encodeURIComponent(item.id)}">
            <div class="latest-img" style="${item.media_path ? `background-image:url('${esc(item.media_path)}')` : ""}"></div>
            <div class="latest-body">
              <div class="latest-eyebrow">${esc([item.platform, item.type_label].filter(Boolean).join(" · "))}</div>
              <h4 dir="auto">${esc(item.title)}</h4>
              <span class="latest-date">${esc(prettyDate(item.created_at))}</span>
            </div>
          </a>
        `,
    )
    .join("");
}

async function loadDashboard() {
  try {
    const res = await fetch("api/dashboard.php", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!data.success) {
      localStorage.clear();
      window.location.href = "login.html";
      return;
    }

    allSurveys = data.surveys || [];
    const name = data.user.name || "User";
    localStorage.setItem("portal_user", JSON.stringify(data.user));
    setAvatarImage(data.user);
    document.getElementById("sideName").innerText = name;

    document.getElementById("submittedSurveys").innerText =
      data.stats.submittedSurveys;
    document.getElementById("pendingResponses").innerText =
      data.stats.pendingResponses;
    document.getElementById("responsesReceived").innerText =
      data.stats.responsesReceived;

    renderSurveys();
  } catch (e) {
    alert("Error loading forms");
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

function setAvatarImage(user) {
  const image = user.profile_image;
  const name = user.name || "User";
  const letter = name.charAt(0).toUpperCase();

  [document.getElementById("sideAvatar")].forEach((avatar) => {
    if (!avatar) return;
    if (image) {
      avatar.innerText = "";
      avatar.style.backgroundImage = `url('${image}')`;
      avatar.style.backgroundSize = "cover";
    } else {
      avatar.innerText = letter;
    }
  });
}

loadDashboard();
loadLatestContent();
