/*
|------------------------------------------------------------------------------
| Shared by the four Project Management pages
|------------------------------------------------------------------------------
|
| The same auth guard, escaping and date helpers every admin page needs. Kept
| inline per page, the way the rest of the portal does it, rather than as a
| fifth file in assets/.
|
*/

const adminToken = localStorage.getItem("admin_token");
let adminUser = {};

try {
  adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");
} catch (e) {}

// Every endpoint checks the token again; this only saves a pointless round trip.
if (!adminToken || !adminUser.role) {
  location.replace("admin-login.html");
}

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  sessionStorage.removeItem("sources_token");
  location.replace("admin-login.html");
}

/* Everything rendered through a template literal goes through this first -
   titles and client names are free text an admin typed. */
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch];
  });
}

let toastTimer = null;

function toast(message, bad) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("bad", !!bad);
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    box.classList.remove("show");
  }, 3200);
}

/* One place that knows the token goes on every request and that a non-JSON
   body (a PHP fatal, an HTML error page) is a failure and not a crash. */
async function api(url, options) {
  const config = Object.assign({}, options || {});
  config.headers = Object.assign({}, config.headers || {}, {
    Authorization: "Bearer " + adminToken,
  });

  const res = await fetch(url, config);
  let data = null;

  try {
    data = await res.json();
  } catch (e) {}

  if (!data) {
    return {
      success: false,
      message: "The server sent an unreadable response.",
    };
  }

  return data;
}

/* "Jul 1, 2026" - the format the mockups use everywhere a date is printed. */
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function fmtDate(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  return (
    MONTHS_SHORT[Number(parts[1]) - 1] +
    " " +
    Number(parts[2]) +
    ", " +
    parts[0]
  );
}

/* Short form for the summary tiles: "1 Jul", "Sep 15" in the mockup are the
   same date printed two ways, so this keeps one of them. */
function fmtDateShort(value) {
  if (!value) return "—";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  return MONTHS_SHORT[Number(parts[1]) - 1] + " " + Number(parts[2]);
}

function todayISO() {
  const now = new Date();
  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

/* Doubles as the edit form: ?id= swaps the heading, the button and adds the
   delete control. Everything else is identical. */
const editId = new URLSearchParams(location.search).get("id") || "";

const PROJECT_MAX_BYTES = 3 * 1024 * 1024;

let mediaFile = null; // a File chosen this session, or null
let removeMedia = false; // the existing image was cleared
let saving = false;

/* ── Media ──────────────────────────────────────────────────────────────── */

const dropzone = document.getElementById("dropzone");
const input = document.getElementById("mediaInput");

dropzone.addEventListener("click", () => input.click());

dropzone.addEventListener("keydown", function (event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    input.click();
  }
});

["dragenter", "dragover"].forEach((name) => {
  dropzone.addEventListener(name, function (event) {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  dropzone.addEventListener(name, function (event) {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", function (event) {
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) acceptMedia(file);
});

input.addEventListener("change", function () {
  if (input.files && input.files[0]) acceptMedia(input.files[0]);
});

function mediaError(message) {
  const box = document.getElementById("mediaError");
  box.textContent = message || "";
  box.classList.toggle("show", !!message);
}

/* Checked here as well as on the server: an oversized file would otherwise be
   uploaded in full only to be rejected. */
function acceptMedia(file) {
  if (!/^image\//.test(file.type)) {
    mediaError("Only JPG, PNG, WEBP and GIF images are allowed.");
    return;
  }

  if (file.size > PROJECT_MAX_BYTES) {
    mediaError("Image must be 3 MB or smaller.");
    return;
  }

  mediaError("");
  mediaFile = file;
  removeMedia = false;

  showMedia(URL.createObjectURL(file));
}

function showMedia(url) {
  document.getElementById("mediaThumb").style.backgroundImage =
    "url('" + url + "')";
  document.getElementById("mediaPreview").classList.add("show");
  document.getElementById("dropzone").hidden = true;
}

function clearMedia() {
  mediaFile = null;
  removeMedia = true;
  input.value = "";
  mediaError("");
  document.getElementById("mediaPreview").classList.remove("show");
  document.getElementById("dropzone").hidden = false;
}

/* ── Progress slider ────────────────────────────────────────────────────── */

const slider = document.getElementById("progress");
const output = document.getElementById("progressOut");

slider.addEventListener("input", function () {
  output.textContent = slider.value + "%";
});

/* ── Options and prefill ────────────────────────────────────────────────── */

function fillSelect(id, rows, valueKey, labelFn) {
  const select = document.getElementById(id);

  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row[valueKey];
    option.textContent = labelFn(row);
    select.appendChild(option);
  });
}

const ROLE_LABELS = {
  owner: "Owner",
  super_admin: "Super Admin",
  account_manager: "Account Manager",
  seo_admin: "Admin",
};

function block(message) {
  const box = document.getElementById("blocked");
  box.textContent = message;
  box.hidden = false;
}

async function load() {
  // Editing reads the project itself; creating reads the list, which carries
  // the same option arrays.
  const url = editId
    ? "api/projects.php?id=" + encodeURIComponent(editId)
    : "api/projects.php";

  const data = await api(url);

  if (!data.success) {
    block(data.message);
    return;
  }

  if (!editId && !data.can_create) {
    block(
      "Your role cannot create projects. Ask an account manager or the owner.",
    );
    return;
  }

  fillSelect("clientId", data.clients || [], "id", (client) =>
    client.company_name
      ? client.company_name + " (" + client.name + ")"
      : client.name,
  );

  fillSelect("status", data.statuses || [], "id", (status) => status.label);

  fillSelect(
    "managerId",
    data.managers || [],
    "id",
    (manager) =>
      manager.name + " — " + (ROLE_LABELS[manager.role] || manager.role),
  );

  const list = document.getElementById("memberList");

  if (!(data.admins || []).length) {
    list.innerHTML = '<div class="none">No other admin accounts yet.</div>';
  } else {
    list.innerHTML = data.admins
      .map(
        (row) =>
          '<label><input type="checkbox" name="member" value="' +
          Number(row.id) +
          '">' +
          "<span>" +
          esc(row.name) +
          "</span>" +
          '<span class="role">' +
          esc(ROLE_LABELS[row.role] || row.role) +
          "</span>" +
          "</label>",
      )
      .join("");
  }

  wireMemberSelect();

  if (editId) {
    if (!data.can_edit) {
      block("You do not have permission to edit this project.");
      return;
    }

    fill(data.project, data.members || []);

    document.getElementById("formTitle").textContent = "Edit Project";
    document.getElementById("saveLabel").textContent = "Save changes";

    /* Cancel goes back where the edit started rather than to the list. */
    document.getElementById("cancelBtn").href =
      "project-details.html?id=" + encodeURIComponent(editId);
    document.title = "Edit Project - " + data.project.title;
  }

  document.getElementById("projectForm").hidden = false;
}

function fill(project, members) {
  document.getElementById("clientId").value = project.client_id || "";
  document.getElementById("title").value = project.title || "";
  document.getElementById("description").value = project.description || "";
  document.getElementById("status").value = project.status || "planning";
  document.getElementById("startDate").value = project.start_date || "";
  document.getElementById("endDate").value = project.end_date || "";
  document.getElementById("managerId").value =
    project.account_manager_admin_id || "";

  slider.value = Number(project.progress || 0);
  output.textContent = slider.value + "%";

  const chosen = members.map((m) => String(m.admin_id));

  document.querySelectorAll('input[name="member"]').forEach((box) => {
    box.checked = chosen.indexOf(box.value) !== -1;
  });

  updateMemberSummary();

  if (project.image_path) showMedia(project.image_path);
}

/* ── Team members dropdown ──────────────────────────────────────────────────
|
| The checkboxes inside the panel remain the state of record, so save() below
| is untouched. This only opens and closes the panel and keeps the trigger
| describing what is ticked.
|
*/

function updateMemberSummary() {
  const summary = document.getElementById("memberSummary");
  const picked = Array.from(
    document.querySelectorAll('input[name="member"]:checked'),
  ).map((box) => box.closest("label").querySelector("span").textContent);

  summary.classList.toggle("placeholder", !picked.length);

  // Two names fit on the trigger; past that a count reads better than an
  // ellipsis eating the third one.
  summary.textContent = !picked.length
    ? "Select members..."
    : picked.length <= 2
      ? picked.join(", ")
      : picked.length + " members selected";
}

function wireMemberSelect() {
  const box = document.getElementById("memberSelect");
  const trigger = document.getElementById("memberTrigger");

  trigger.addEventListener("click", function () {
    const open = box.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  box.addEventListener("change", updateMemberSummary);

  // Ticking a name should not close the panel - picking three people would
  // otherwise mean opening it three times.
  document.addEventListener("click", function (event) {
    if (!box.contains(event.target)) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") close();
  });

  function close() {
    box.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  updateMemberSummary();
}

/* ── Save ───────────────────────────────────────────────────────────────── */

async function save() {
  if (saving) return;

  const clientId = document.getElementById("clientId").value;
  const title = document.getElementById("title").value.trim();
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  if (!clientId) {
    toast("Choose a client for this project.", true);
    return;
  }
  if (!title) {
    toast("Project title is required.", true);
    return;
  }

  if (!startDate || !endDate) {
    toast("A start date and an end date are both required.", true);
    return;
  }

  if (endDate < startDate) {
    toast("The end date cannot be before the start date.", true);
    return;
  }

  const body = new FormData();

  if (editId) body.append("id", editId);

  body.append("client_id", clientId);
  body.append("title", title);
  body.append(
    "description",
    document.getElementById("description").value.trim(),
  );
  body.append("status", document.getElementById("status").value);
  body.append("start_date", startDate);
  body.append("end_date", endDate);
  body.append("progress", slider.value);
  body.append(
    "account_manager_admin_id",
    document.getElementById("managerId").value,
  );

  document.querySelectorAll('input[name="member"]:checked').forEach((box) => {
    body.append("member_ids[]", box.value);
  });

  if (mediaFile) body.append("image", mediaFile);
  if (removeMedia && !mediaFile) body.append("remove_image", "1");

  setBusy(true);

  // No Content-Type header: the browser has to set the multipart boundary.
  const data = await api("api/projects.php", { method: "POST", body });

  setBusy(false);

  toast(data.message, !data.success);

  if (!data.success) return;

  setTimeout(function () {
    location.href = "project-details.html?id=" + encodeURIComponent(data.id);
  }, 700);
}

function setBusy(busy) {
  saving = busy;
  const button = document.getElementById("saveBtn");
  button.disabled = busy;
  document.getElementById("saveLabel").textContent = busy
    ? "Saving..."
    : editId
      ? "Save changes"
      : "+ Create project";
}

load();
