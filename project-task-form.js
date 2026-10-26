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

const params = new URLSearchParams(location.search);
const taskId = params.get("id") || "";
let projectId = params.get("project") || "";

let orientation = "horizontal";
let mediaFile = null; // a File chosen this session, or null
let removeMedia = false; // the existing image was cleared
let maxChars = 2000;
let maxBytes = 3 * 1024 * 1024;
let saving = false;

if (!taskId && !projectId) {
  location.replace("project-management.html");
}

/* ── Panels ─────────────────────────────────────────────────────────────── */

function togglePanel(head) {
  const panel = head.closest(".panel");
  const open = !panel.classList.toggle("collapsed");
  head.setAttribute("aria-expanded", String(open));
}

/* ── Orientation ────────────────────────────────────────────────────────── */

function selectOrientation(value) {
  orientation = value;

  document.querySelectorAll("[data-orientation]").forEach((button) => {
    button.classList.toggle(
      "selected",
      button.dataset.orientation === orientation,
    );
  });

  const preview = document.getElementById("mediaPreview");
  preview.classList.toggle("is-vertical", orientation === "vertical");
  preview.classList.toggle("is-horizontal", orientation !== "vertical");
}

/* ── Editor ─────────────────────────────────────────────────────────────── */

const editor = document.getElementById("description");
const counter = document.getElementById("counter");

function format(command) {
  editor.focus();
  document.execCommand(command, false, null);
  updateCounter();
}

function addLink() {
  const url = prompt("Link address", "https://");
  if (!url) return;
  editor.focus();
  document.execCommand("createLink", false, url);
  updateCounter();
}

/* Counts text, not markup - the same measure the server applies, so the
   number under the box and the rule that rejects it agree. */
function textLength() {
  return editor.innerText.replace(/\s+$/, "").length;
}

function updateCounter() {
  const used = textLength();
  counter.textContent = used + " / " + maxChars + " characters";
  counter.classList.toggle("over", used > maxChars);
}

editor.addEventListener("input", updateCounter);

/* Pasting from Word or a web page would otherwise drag its own styling in. */
editor.addEventListener("paste", function (event) {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData).getData(
    "text/plain",
  );
  document.execCommand("insertText", false, text);
});

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

  if (file.size > maxBytes) {
    mediaError(
      "Image must be " + Math.round(maxBytes / 1024 / 1024) + " MB or smaller.",
    );
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

/* ── Load ───────────────────────────────────────────────────────────────── */

function block(message) {
  const box = document.getElementById("blocked");
  box.textContent = message;
  box.hidden = false;
}

async function load() {
  // Editing an existing task: the task carries its own project, so the query
  // string's `project` is only a hint and the row's own wins.
  const url = taskId
    ? "api/project-tasks.php?id=" + encodeURIComponent(taskId)
    : "api/project-tasks.php?project_id=" + encodeURIComponent(projectId);

  const data = await api(url);

  if (!data.success) {
    block(data.message);
    return;
  }

  maxChars = Number(data.max_chars) || maxChars;
  maxBytes = Number(data.max_bytes) || maxBytes;

  document.getElementById("mediaHint").textContent =
    "Optional. Maximum " + Math.round(maxBytes / 1024 / 1024) + " MB";

  const project = data.project;
  projectId = project.id;

  const back = "project-details.html?id=" + encodeURIComponent(project.id);
  document.getElementById("backLink").href = back;

  const crumb = document.getElementById("crumbProject");
  crumb.textContent = project.title;
  crumb.href = back;

  if (!taskId && data.can_write === false) {
    block("You are not on this project's team, so you cannot add tasks to it.");
    return;
  }

  if (taskId) {
    if (!data.can_edit) {
      block("You can only edit tasks you created.");
      return;
    }

    fill(data.task);
    document.getElementById("formTitle").textContent = "Edit Task";
    document.title = "Edit Task - " + project.title;
  } else {
    document.getElementById("discardBtn").textContent = "Cancel";
    document.title = "New Task - " + project.title;
  }

  document.getElementById("taskForm").hidden = false;
  updateCounter();
}

function fill(task) {
  document.getElementById("taskName").value = task.title || "";
  document.getElementById("taskLink").value = task.link || "";

  editor.innerHTML = task.description || "";

  selectOrientation(
    task.orientation === "vertical" ? "vertical" : "horizontal",
  );

  document.getElementById("updateDate").value = task.scheduled_date || "";

  // The column is a TIME, so it round-trips with seconds the input rejects.
  document.getElementById("updateTime").value = task.scheduled_time
    ? String(task.scheduled_time).slice(0, 5)
    : "";

  document.getElementById("isComplete").checked = !!Number(task.is_complete);

  if (task.image_path) showMedia(task.image_path);
}

/* ── Save ───────────────────────────────────────────────────────────────── */

async function save(status) {
  if (saving) return;

  const title = document.getElementById("taskName").value.trim();

  if (!title) {
    toast("Task name is required.", true);
    document.getElementById("taskName").focus();
    return;
  }

  if (textLength() > maxChars) {
    toast("Description is over " + maxChars + " characters.", true);
    return;
  }

  const body = new FormData();

  if (taskId) body.append("id", taskId);

  body.append("project_id", projectId);
  body.append("title", title);
  body.append("link", document.getElementById("taskLink").value.trim());
  body.append("description", editor.innerHTML.trim());
  body.append("orientation", orientation);
  body.append("scheduled_date", document.getElementById("updateDate").value);
  body.append("scheduled_time", document.getElementById("updateTime").value);
  body.append(
    "is_complete",
    document.getElementById("isComplete").checked ? "1" : "0",
  );
  body.append("status", status);

  if (mediaFile) body.append("image", mediaFile);
  if (removeMedia && !mediaFile) body.append("remove_image", "1");

  setBusy(true);

  // No Content-Type header: the browser has to set the multipart boundary.
  const data = await api("api/project-tasks.php", { method: "POST", body });

  setBusy(false);

  toast(data.message, !data.success);

  if (!data.success) return;

  setTimeout(function () {
    location.href = "project-details.html?id=" + encodeURIComponent(projectId);
  }, 700);
}

function setBusy(busy) {
  saving = busy;
  document.getElementById("publishBtn").disabled = busy;
  document.getElementById("draftBtn").disabled = busy;
  document.getElementById("publishBtn").textContent = busy
    ? "Saving..."
    : "Publish";
}

/* Discard means delete when there is something saved to delete, and simply
   leave when there is not. */
async function discard() {
  const back = "project-details.html?id=" + encodeURIComponent(projectId);

  if (!taskId) {
    location.href = back;
    return;
  }

  const ok = await askConfirm({
    title: "Delete task",
    text:
      "This task will be removed from the project, along with anything the " +
      "client has already been shown of it. This cannot be undone.",
    action: "Delete task",
    word: "DELETE",
  });

  if (!ok) return;

  const data = await api(
    "api/project-tasks.php?id=" + encodeURIComponent(taskId),
    {
      method: "DELETE",
    },
  );

  toast(data.message, !data.success);

  if (!data.success) return;

  setTimeout(function () {
    location.href = back;
  }, 700);
}

load();
