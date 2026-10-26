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

const params = new URLSearchParams(window.location.search);
const surveyId = params.get("survey_id");

async function loadResponses() {
  const box = document.getElementById("responses");

  const apiUrl = surveyId
    ? "api/admin-responses.php?survey_id=" + surveyId
    : "api/admin-responses.php";

  try {
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();

    if (!data.success) {
      box.innerHTML = `<div class="empty">${data.message || "Unable to load responses."}</div>`;
      return;
    }

    if (!data.responses.length) {
      box.innerHTML = `<div class="empty">No responses found.</div>`;
      return;
    }

    if (surveyId) {
      document.getElementById("pageTitle").innerText =
        "Form Responses #" + surveyId;
    }

    box.innerHTML = data.responses
      .map(
        (item) => `
      <div class="card">

        <h2>${item.title || item.survey_title || "Survey"}</h2>

        <p>
          <b>User:</b>
          ${item.name}
        </p>

        <p>
          <b>Email:</b>
          ${item.email}
        </p>

        <p>
          <b>Date:</b>
          ${item.submitted_at}
        </p>

        <a href="response-details.html?id=${item.id}">
          View Answers
        </a>

      </div>
    `,
      )
      .join("");
  } catch (error) {
    box.innerHTML = `<div class="empty">Connection error.</div>`;
  }
}

loadResponses();

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
