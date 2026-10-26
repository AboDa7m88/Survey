/*
|------------------------------------------------------------------------------
| Shared by the two client Project pages
|------------------------------------------------------------------------------
*/

const token = localStorage.getItem("portal_token");

if (!token) {
  window.location.href = "login.html";
}

const user = JSON.parse(localStorage.getItem("portal_user") || "{}");

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[ch];
  });
}

/* One place that knows the token goes on every request, that a stale session
   is a redirect rather than an error, and that a non-JSON body (a PHP fatal,
   an HTML error page) is a failure and not a crash. */
async function api(url) {
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });

  if (res.status === 401) {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    window.location.href = "login.html";
    return { success: false, message: "Session expired." };
  }

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

/* "Jul 1, 2026" - the format the rest of the portal prints a date in. */
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

/* Short form for the summary tiles. */
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

function setAvatarImage(user) {
  const avatar = document.getElementById("sideAvatar");
  if (!avatar) return;

  if (user.profile_image) {
    avatar.innerText = "";
    avatar.style.backgroundImage = `url('${user.profile_image}')`;
  } else {
    avatar.innerText = (user.name || "User").charAt(0).toUpperCase();
    avatar.style.backgroundImage = "";
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

document.getElementById("sideName").innerText = user.name || "User";
setAvatarImage(user);

/*
|------------------------------------------------------------------------------
| The View panel's two borrowed helpers
|------------------------------------------------------------------------------
|
| sanitizeCaption() and renderLink() from content.html, unchanged apart from
| the first one's name.
|
| This matters more here than it does there: api/project-tasks.php stores the
| update's description exactly as the editor wrote it and only strip_tags()es
| a copy to measure its length. No endpoint in this codebase sanitises rich
| text, so this function is the only thing standing between a pasted <script>
| and a client session - and portal_token lives in localStorage.
|
| Text alignment is the one piece of styling the editor's toolbar can set, and
| direction is what an Arabic paragraph carries. Both are read off the node and
| put back after every other attribute is dropped.
*/

const ALIGNMENTS = ["left", "center", "right", "justify"];
const DIRECTIONS = ["ltr", "rtl", "auto"];

function sanitizeRichText(html) {
  /* Parsed into a <template>, not a <div>: a template's content lives in an
     inert document, so an <img src=x onerror=...> in here never loads and
     never fires. A live element would run the handler while this function was
     still busy stripping it - the returned markup was clean either way, but
     the payload had already gone off. */
  const frame = document.createElement("template");
  frame.innerHTML = html || "";
  const box = frame.content;

  const allowed = [
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "UL",
    "OL",
    "LI",
    "A",
    "BR",
    "P",
    "DIV",
  ];

  box.querySelectorAll("*").forEach((node) => {
    // Unwrapping a script or style would leave its source behind as text.
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      node.remove();
      return;
    }

    if (!allowed.includes(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }

    // Browsers write alignment as either inline style or an align attribute.
    const align = (
      (node.style && node.style.textAlign) ||
      node.getAttribute("align") ||
      ""
    ).toLowerCase();

    /* Read for the same reason as the alignment above: an Arabic paragraph
       carries its direction on the node, and the loop below is about to drop
       every attribute it has. */
    const dir = (node.getAttribute("dir") || "").toLowerCase();

    [...node.attributes].forEach((attr) => {
      const keep =
        node.tagName === "A" &&
        attr.name === "href" &&
        !/^\s*(javascript|data|vbscript):/i.test(attr.value);
      if (!keep) node.removeAttribute(attr.name);
    });

    if (ALIGNMENTS.includes(align)) node.style.textAlign = align;
    if (DIRECTIONS.includes(dir)) node.setAttribute("dir", dir);

    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  return frame.innerHTML;
}

/** The link shows as a "View link" action on the footer line, never a URL. */
function renderLink(item) {
  const slot = document.getElementById("linkSlot");

  slot.textContent = "";

  // Only http(s) reaches an href — the API normalises, but this page is the one
  // building the anchor.
  if (!item.link || !/^https?:\/\//i.test(item.link)) return;

  // A heading like the field beside it, so the button lines up with its value
  // rather than floating against its label.
  const heading = document.createElement("h5");
  heading.textContent = "Link";
  slot.appendChild(heading);

  const anchor = document.createElement("a");
  anchor.className = "view-link";
  anchor.href = item.link;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.title = item.link;
  anchor.textContent = "View link";

  slot.appendChild(anchor);
}

/*
|------------------------------------------------------------------------------
| The page
|------------------------------------------------------------------------------
*/

const projectId = new URLSearchParams(location.search).get("id");

const TASK_PAGE_SIZE = 3;

let project = null;
let tasks = [];
let page = 1;

/* The day the update grid below is scoped to, or null for the whole project. */
let selectedDate = null;

/* The update the View panel is showing, or null for none. */
let selectedTaskId = null;

/* The month on screen. Opens on the month the project starts in, not on the
   real today - a project that ran last quarter should not open on an empty
   grid, and a client will not think to page backwards to find it. */
let calYear = 0;
let calMonth = 0;

if (!projectId) {
  location.replace("user-projects.html");
}

async function load() {
  const data = await api(
    "api/user-projects.php?id=" + encodeURIComponent(projectId),
  );

  if (!data.success) {
    document.getElementById("projectTitle").textContent = "Project not found";
    document.getElementById("projectSubtitle").textContent = data.message || "";
    document.getElementById("notFound").hidden = false;
    return;
  }

  project = data.project;
  tasks = data.tasks || [];

  document.getElementById("projectBody").hidden = false;

  paintHead();
  paintTiles();

  const start = new Date(project.start_date + "T00:00:00");
  calYear = start.getFullYear();
  calMonth = start.getMonth();

  paintCalendar();
  renderTasks();
  paintPanel();
}

function paintHead() {
  document.title = project.title + " - Projects";
  document.getElementById("projectTitle").textContent = project.title;
  document.getElementById("projectSubtitle").textContent =
    project.type_label + " · " + project.status_label;
}

function paintTiles() {
  document.getElementById("tileStart").textContent = fmtDateShort(
    project.start_date,
  );
  document.getElementById("tileEnd").textContent = fmtDateShort(
    project.end_date,
  );

  const progress = Number(project.progress || 0);
  document.getElementById("tileProgress").textContent = progress + "%";
  document.getElementById("tileBar").style.width = progress + "%";
}

/*
| The month grid. Monday-first, six rows, with the days that fall inside the
| project's own dates tinted so the timeline is visible at a glance.
*/
function paintCalendar() {
  document.getElementById("calLabel").textContent =
    MONTHS_LONG[calMonth] + " " + calYear;

  const first = new Date(calYear, calMonth, 1);

  // getDay() is Sunday-first; the grid is Monday-first.
  const lead = (first.getDay() + 6) % 7;

  const cursor = new Date(calYear, calMonth, 1 - lead);
  const today = todayISO();

  // Every dated update bucketed by day, so painting a cell is one lookup.
  const byDay = {};

  tasks.forEach((task) => {
    if (!task.scheduled_date) return;
    const key = String(task.scheduled_date).slice(0, 10);
    (byDay[key] = byDay[key] || []).push(task);
  });

  let html = "";

  for (let week = 0; week < 6; week++) {
    html += '<div class="cal-week">';

    for (let day = 0; day < 7; day++) {
      const iso =
        cursor.getFullYear() +
        "-" +
        String(cursor.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(cursor.getDate()).padStart(2, "0");

      const classes = ["cal-day"];

      if (cursor.getMonth() !== calMonth) classes.push("muted");
      if (iso === today) classes.push("today");
      if (iso >= project.start_date && iso <= project.end_date)
        classes.push("in-range");
      if (iso === selectedDate) classes.push("selected");

      const dots = (byDay[iso] || [])
        .map(
          (task) =>
            '<i class="cal-dot ' +
            (Number(task.is_complete) ? "done" : "") +
            '" title="' +
            esc(task.title) +
            '"></i>',
        )
        .join("");

      const count = (byDay[iso] || []).length;

      /* Every day is selectable, not only the ones carrying an update -
         picking an empty day is how you confirm nothing landed on it. */
      html +=
        '<div class="' +
        classes.join(" ") +
        '" role="button" tabindex="0"' +
        ' data-date="' +
        iso +
        '"' +
        ' aria-pressed="' +
        (iso === selectedDate) +
        '"' +
        ' aria-label="' +
        esc(fmtDate(iso)) +
        ", " +
        (count
          ? count + (count === 1 ? " update" : " updates")
          : "no updates") +
        '">' +
        "<b>" +
        cursor.getDate() +
        "</b>" +
        (dots ? '<div class="cal-dots">' + dots + "</div>" : "") +
        "</div>";

      cursor.setDate(cursor.getDate() + 1);
    }

    html += "</div>";
  }

  document.getElementById("calBody").innerHTML = html;

  document.querySelectorAll(".cal-day[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => pickDay(cell.dataset.date));
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pickDay(cell.dataset.date);
      }
    });
  });
}

/*
| Selecting a day scopes the update grid below it to that date - the dots on
| the calendar and the cards under it are the same updates, so the calendar
| acts as a filter over them rather than opening a separate view.
|
| Clicking the selected day again clears it, which is the only affordance that
| does not need a second control explaining itself.
*/
function pickDay(iso) {
  selectedDate = selectedDate === iso ? null : iso;
  page = 1;
  paintCalendar();
  renderTasks();
}

function clearDay() {
  selectedDate = null;
  page = 1;
  paintCalendar();
  renderTasks();
}

/* What the grid below is currently showing. */
function visibleTasks() {
  if (!selectedDate) return tasks;
  return tasks.filter(
    (task) => String(task.scheduled_date || "").slice(0, 10) === selectedDate,
  );
}

document.getElementById("calPrev").addEventListener("click", function () {
  calMonth--;
  if (calMonth < 0) {
    calMonth = 11;
    calYear--;
  }
  paintCalendar();
});

document.getElementById("calNext").addEventListener("click", function () {
  calMonth++;
  if (calMonth > 11) {
    calMonth = 0;
    calYear++;
  }
  paintCalendar();
});

document.getElementById("calToday").addEventListener("click", function () {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  paintCalendar();
});

/*
| Two states, read off one column. The admin's version reads three, because it
| also shows drafts and updates whose date has not arrived - neither of which
| exists in this payload, so the other two arms would be dead code waiting for
| somebody to re-add the columns behind them.
*/
function badgeFor(task) {
  return Number(task.is_complete)
    ? { cls: "completed", text: "Completed" }
    : { cls: "active", text: "Active" };
}

/* scheduled_time comes back from a TIME column as HH:MM:SS; the seconds are
   never anything but 00 and are not worth printing. Neither value is put
   through Date() - fmtDate() splits the string itself, which sidesteps the
   browsers that will not parse "YYYY-MM-DD HH:MM:SS" without the T in it. */
function whenFor(task) {
  if (!task.scheduled_date) return "No date set";

  const time = String(task.scheduled_time || "").slice(0, 5);

  return fmtDate(task.scheduled_date) + (time ? " · " + time : "");
}

function renderTasks() {
  const grid = document.getElementById("taskGrid");
  const shown = visibleTasks();
  const total = shown.length;
  const pages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE));

  if (page > pages) page = pages;

  // The heading says which day is being shown, and carries the way back out.
  document.getElementById("tasksHeading").textContent = selectedDate
    ? "Updates on " + fmtDate(selectedDate)
    : "Updates";
  document.getElementById("clearDayBtn").hidden = !selectedDate;

  // An update the day filter has just hidden should not stay open below it.
  if (
    selectedTaskId != null &&
    !shown.some((task) => String(task.id) === String(selectedTaskId))
  ) {
    closeTask();
  }

  if (!total) {
    /* Neither of these offers an action: a client cannot write an update.
       The day-scoped one says the updates are still there behind the filter
       the calendar just applied, and hands back the way out. */
    grid.innerHTML = selectedDate
      ? '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>' +
        "<h3>Nothing on this day</h3>" +
        "<p>No update on this project is dated " +
        esc(fmtDate(selectedDate)) +
        ".</p>" +
        '<button class="btn btn-ghost" type="button" onclick="clearDay()">Show all updates</button>' +
        "</div>"
      : '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/></svg></div>' +
        "<h3>No updates yet</h3>" +
        "<p>Updates are published against this project as the work happens. When the first one lands, it appears here.</p>" +
        "</div>";

    document.getElementById("pager").hidden = true;
    return;
  }

  const start = (page - 1) * TASK_PAGE_SIZE;
  const slice = shown.slice(start, start + TASK_PAGE_SIZE);

  grid.innerHTML = slice
    .map((task) => {
      const badge = badgeFor(task);

      const image = task.image_path
        ? "style=\"background-image:url('" + esc(task.image_path) + "')\""
        : "";

      const placeholder = task.image_path
        ? ""
        : '<span class="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>';

      return (
        "" +
        '<div class="card ' +
        (String(task.id) === String(selectedTaskId) ? "selected" : "") +
        '"' +
        ' data-id="' +
        esc(task.id) +
        '">' +
        '<div class="card-img ' +
        (task.image_path ? "" : "empty") +
        '" ' +
        image +
        ">" +
        placeholder +
        '<span class="badge ' +
        badge.cls +
        '">' +
        badge.text +
        "</span>" +
        "</div>" +
        '<div class="card-body">' +
        '<h3 dir="auto">' +
        esc(task.title) +
        "</h3>" +
        '<span class="card-when">' +
        esc(whenFor(task)) +
        "</span>" +
        "</div>" +
        '<div class="card-actions">' +
        '<button class="btn btn-ghost" type="button" onclick="openTask(\'' +
        esc(task.id) +
        "')\">View</button>" +
        "</div>" +
        "</div>"
      );
    })
    .join("");

  renderPager(total, pages, start, slice.length);
}

function renderPager(total, pages, start, shown) {
  document.getElementById("pagerInfo").textContent =
    "Showing " +
    (start + 1) +
    " to " +
    (start + shown) +
    " of " +
    total +
    " update" +
    (total === 1 ? "" : "s");

  const buttons = [];

  buttons.push(
    '<button type="button" onclick="goTo(' +
      (page - 1) +
      ')" ' +
      (page === 1 ? "disabled" : "") +
      ">Prev</button>",
  );

  for (let n = 1; n <= pages; n++) {
    buttons.push(
      '<button type="button" class="' +
        (n === page ? "current" : "") +
        '" onclick="goTo(' +
        n +
        ')">' +
        n +
        "</button>",
    );
  }

  buttons.push(
    '<button type="button" onclick="goTo(' +
      (page + 1) +
      ')" ' +
      (page === pages ? "disabled" : "") +
      ">Next</button>",
  );

  document.getElementById("pagerPages").innerHTML = buttons.join("");
  document.getElementById("pager").hidden = false;
}

function goTo(n) {
  page = n;
  renderTasks();
}

/*
| The View panel. One markup block - the orientation class is what swaps the
| layout, the same way content.html does it.
*/
function openTask(id) {
  const task = tasks.find((entry) => String(entry.id) === String(id));
  if (!task) return;

  selectedTaskId = task.id;

  document.querySelectorAll("#taskGrid .card").forEach((card) => {
    card.classList.toggle(
      "selected",
      card.dataset.id === String(selectedTaskId),
    );
  });

  document.getElementById("detailWrap").style.display = "block";

  document.getElementById("detailEyebrow").textContent = project.title;
  document.getElementById("detailTitle").textContent = task.title || "";

  const panel = document.getElementById("detailPanel");
  panel.className =
    "detail " +
    (task.orientation === "vertical" ? "is-vertical" : "is-horizontal");

  const media = document.getElementById("detailMedia");
  media.style.backgroundImage = task.image_path
    ? `url('${task.image_path}')`
    : "";
  media.hidden = !task.image_path;

  /* The description is rich text written for the client, and it is the reason
     this panel exists - so it is rendered as markup, through the scrubber
     above, never flattened by esc(). */
  document.getElementById("detailDescription").innerHTML =
    sanitizeRichText(task.description) || "—";

  renderLink(task);

  document.getElementById("detailScheduled").textContent = whenFor(task);
  document.getElementById("detailStatus").textContent = badgeFor(task).text;

  document
    .getElementById("detailWrap")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeTask() {
  selectedTaskId = null;
  document.getElementById("detailWrap").style.display = "none";
}

function paintPanel() {
  const image = document.getElementById("projectImg");

  /* The image is optional, so its absence is not something to draw. A
     placeholder here would be a 320px empty rectangle above the title on
     every project that has not had one uploaded. */
  if (project.image_path) {
    image.style.backgroundImage = "url('" + project.image_path + "')";
    image.hidden = false;
  } else {
    image.hidden = true;
  }

  document.getElementById("panelTitle").textContent = project.title;

  // Plain text out of a textarea, per the schema - textContent, not innerHTML.
  document.getElementById("panelDesc").textContent =
    project.description || "No description was added.";

  document.getElementById("panelType").textContent = project.type_label;
  document.getElementById("panelTimeline").textContent =
    fmtDate(project.start_date) + " – " + fmtDate(project.end_date);
  document.getElementById("panelStatus").textContent = project.status_label;
}

load();
