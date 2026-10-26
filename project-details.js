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

const projectId = new URLSearchParams(location.search).get("id");

const TASK_PAGE_SIZE = 3;

let project = null;
let tasks = [];
let canEdit = false;
let page = 1;
/* The day the task grid below is scoped to, or null for the whole project. */
let selectedDate = null;
/* The task showing in the panel at the foot, or null when the project is. */
let openTaskId = null;

/* The month on screen. Opens on the month the project starts in, not on the
   real today - a project that ran last quarter should not open on an empty
   grid. */
let calYear = 0;
let calMonth = 0;

if (!projectId) {
  location.replace("project-management.html");
}

async function load() {
  const data = await api(
    "api/projects.php?id=" + encodeURIComponent(projectId),
  );

  if (!data.success) {
    document.getElementById("projectTitle").textContent = "Project not found";
    document.getElementById("projectSubtitle").textContent = data.message || "";
    document.getElementById("notFound").hidden = false;
    return;
  }

  project = data.project;
  tasks = data.tasks || [];
  canEdit = !!data.can_edit;

  document.getElementById("projectBody").hidden = false;

  paintHead();

  const start = new Date(project.start_date + "T00:00:00");
  calYear = start.getFullYear();
  calMonth = start.getMonth();

  paintCalendar();
  renderTasks();
  paintDetail();
}

function paintHead() {
  document.title = project.title + " - Project Management";
  document.getElementById("projectTitle").textContent = project.title;
  document.getElementById("projectSubtitle").textContent =
    (project.company_name || project.client_name || "No client") +
    " · " +
    project.status_label;

  /* Lives in the Tasks section head now, but it is still the project's id it
     needs, so it is still filled in here. */
  const button = document.getElementById("newTaskBtn");
  button.href =
    "project-task-form.html?project=" + encodeURIComponent(project.id);
  button.hidden = false;

  /* Same corner, and the same rule, as inquiry-details.html: the button is only
     there for an admin the API says may edit this project. */
  const edit = document.getElementById("editProjectBtn");
  edit.href = "project-form.html?id=" + encodeURIComponent(project.id);
  edit.hidden = !canEdit;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* How many tasks a cell names before it gives up and counts the rest. Three
   fits the 110px cell without the row growing to match its busiest day. */
const CAL_MAX_CARDS = 3;

/** "14:30", or nothing when the task has no time against its date. */
function calTime(task) {
  return task.scheduled_time ? String(task.scheduled_time).slice(0, 5) : "";
}

/*
| The month grid. Monday-first, six rows, headers in the same seven columns as
| the days, with the days that fall inside the project's own dates tinted so
| the timeline is visible at a glance.
|
| Each dated task is named in its cell rather than marked with a dot: the point
| of a month view is to read the month without opening every day in it. The
| phone rules in the stylesheet turn the cards back into dots, because a cell
| one-seventh of a phone wide cannot hold a title.
*/
function paintCalendar() {
  document.getElementById("calLabel").textContent =
    MONTHS_LONG[calMonth] + " " + calYear;

  const first = new Date(calYear, calMonth, 1);

  // getDay() is Sunday-first; the grid is Monday-first.
  const lead = (first.getDay() + 6) % 7;

  const cursor = new Date(calYear, calMonth, 1 - lead);
  const today = todayISO();

  // Every dated task bucketed by day, so painting a cell is one lookup.
  const byDay = {};

  tasks.forEach((task) => {
    if (!task.scheduled_date) return;
    const key = String(task.scheduled_date).slice(0, 10);
    (byDay[key] = byDay[key] || []).push(task);
  });

  // Earliest first inside a day, so a cell reads down the day in order.
  Object.keys(byDay).forEach((key) => {
    byDay[key].sort((a, b) => calTime(a).localeCompare(calTime(b)));
  });

  let html = WEEKDAYS.map(
    (name) => '<div class="day-header">' + name + "</div>",
  ).join("");

  for (let week = 0; week < 6; week++) {
    for (let day = 0; day < 7; day++) {
      const iso =
        cursor.getFullYear() +
        "-" +
        String(cursor.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(cursor.getDate()).padStart(2, "0");

      const outside = cursor.getMonth() !== calMonth;
      const dayTasks = byDay[iso] || [];
      const count = dayTasks.length;

      const classes = ["day-cell"];

      if (outside) classes.push("other-month");
      if (iso === today) classes.push("today-cell");
      if (iso >= project.start_date && iso <= project.end_date)
        classes.push("in-range");
      if (iso === selectedDate) classes.push("selected-cell");

      const cards = dayTasks
        .slice(0, CAL_MAX_CARDS)
        .map((task) => {
          const time = calTime(task);

          /* Amber while the task is outstanding, green once it is published -
           the same two readings the cards below the grid give. */
          return (
            '<div class="event-card ' +
            (Number(task.is_complete) ? "done" : "pending") +
            '" title="' +
            esc(task.title) +
            (time ? " - " + esc(time) : "") +
            '">' +
            "<b>" +
            esc(task.title) +
            "</b>" +
            (time ? "<small>" + esc(time) + "</small>" : "") +
            "</div>"
          );
        })
        .join("");

      const more =
        count > CAL_MAX_CARDS
          ? '<div class="event-more">+' +
            (count - CAL_MAX_CARDS) +
            " more</div>"
          : "";

      /* Every day of this month is selectable, not only the ones carrying a
         task - the same as admin-calendar.html, where picking an empty day is
         how you confirm nothing is booked on it. A padding day from the
         neighbouring month is not: it is there to keep the columns lined up
         under their weekday, and picking it would filter the list below to a
         date this grid is not showing. */
      html +=
        '<div class="' +
        classes.join(" ") +
        '"' +
        (outside
          ? ' aria-hidden="true"'
          : ' role="button" tabindex="0"' +
            ' data-date="' +
            iso +
            '"' +
            ' aria-pressed="' +
            (iso === selectedDate) +
            '"' +
            ' aria-label="' +
            esc(fmtDate(iso)) +
            ", " +
            (count ? count + (count === 1 ? " task" : " tasks") : "no tasks") +
            '"') +
        ">" +
        "<span>" +
        cursor.getDate() +
        "</span>" +
        cards +
        more +
        "</div>";

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  document.getElementById("calBody").innerHTML = html;

  document.querySelectorAll(".day-cell[data-date]").forEach((cell) => {
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
| Selecting a day scopes the task grid below it to that date - the dots on the
| calendar and the cards under it are the same tasks, so the calendar acts as a
| filter over them rather than opening a separate view.
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

/*
|------------------------------------------------------------------------------
| The task panel at the foot of the page
|------------------------------------------------------------------------------
|
| It holds a task and nothing else. The project has its own panel pinned to the
| top of the page, so opening a task no longer hides the project it belongs to -
| the two are read together, which is the point of being on this page.
|
| Nothing is open by default: the panel and its heading appear when a card is
| clicked and go away again when it is closed.
|
| The panel carries no buttons. Edit and Delete are on the card's own menu, one
| click from anywhere in the grid, and repeating them at the foot of the page
| gave the same task two places to be acted on and two places to keep in sync.
|
*/

function showTaskPanel(id) {
  const task = tasks.find((t) => Number(t.id) === Number(id));

  if (!task) return;

  openTaskId = Number(task.id);

  paintTaskPanel(task);

  document.getElementById("taskDetailHead").hidden = false;
  document.getElementById("taskPanel").hidden = false;

  // Re-render so the card that was clicked picks up the selected outline.
  renderTasks();

  document
    .getElementById("taskDetailHead")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeTaskPanel() {
  openTaskId = null;

  document.getElementById("taskDetailHead").hidden = true;
  document.getElementById("taskPanel").hidden = true;

  renderTasks();
}

function paintTaskPanel(task) {
  const image = document.getElementById("taskImg");

  /* Same rule the project panel uses: no image is not something to draw. */
  if (task.image_path) {
    image.style.backgroundImage = "url('" + task.image_path + "')";
    image.innerHTML = "";
    image.hidden = false;
  } else {
    image.hidden = true;
  }

  document.getElementById("taskTitle").textContent = task.title;
  document.getElementById("taskDesc").textContent =
    task.description || "No description was added.";

  /* The time is optional against a date that is itself optional. */
  const when = task.scheduled_date
    ? fmtDate(task.scheduled_date) +
      (task.scheduled_time
        ? " at " + String(task.scheduled_time).slice(0, 5)
        : "")
    : "No date set";

  document.getElementById("taskWhen").textContent = when;
  document.getElementById("taskStatus").textContent = badgeFor(task).text;
  document.getElementById("taskProgress").textContent = progressFor(task).text;
  document.getElementById("taskAuthor").textContent =
    task.created_by_name || "—";

  const link = document.getElementById("taskLink");

  /* Only http(s) becomes a clickable link - a `javascript:` or `data:` value
     stored on the task would otherwise run from a click here. Anything else is
     shown as the text it is. */
  if (/^https?:\/\//i.test(task.link || "")) {
    link.innerHTML =
      '<a class="link" target="_blank" rel="noopener noreferrer" href="' +
      esc(task.link) +
      '">' +
      esc(task.link) +
      "</a>";
  } else {
    link.textContent = task.link || "—";
  }
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
| Two independent readings of a task, and they used to be crushed into one chip.
|
| badgeFor answers "can the client see this yet": a draft is not published at
| all, a published task dated ahead is waiting for its date, and one whose date
| has arrived is Published. `status` and `is_live` are the two columns behind
| it.
|
| progressFor answers "is the work done", which `is_complete` tracks on its own
| and which has nothing to do with publishing. Under the old single chip a
| completed task stopped reporting that it was published, and a published one
| never said whether it was finished.
*/
function badgeFor(task) {
  if (task.status === "draft") return { cls: "draft", text: "Draft" };
  if (!Number(task.is_live)) return { cls: "scheduled", text: "Scheduled" };
  return { cls: "published", text: "Published" };
}

function progressFor(task) {
  return Number(task.is_complete)
    ? { cls: "done", text: "Completed" }
    : { cls: "doing", text: "In Progress" };
}

function renderTasks() {
  const grid = document.getElementById("taskGrid");
  const shown = visibleTasks();
  const total = shown.length;
  const pages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE));

  if (page > pages) page = pages;

  // The heading says which day is being shown, and carries the way back out.
  document.getElementById("tasksHeading").textContent = selectedDate
    ? "Tasks on " + fmtDate(selectedDate)
    : "Tasks";
  document.getElementById("clearDayBtn").hidden = !selectedDate;

  if (!total) {
    /* A project with no tasks at all needs pointing at the form. A day with
       none only needs telling, because the tasks are still there behind the
       filter the calendar just applied. */
    grid.innerHTML = selectedDate
      ? '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>' +
        "<h3>Nothing scheduled for this day</h3>" +
        "<p>No task on this project is dated " +
        esc(fmtDate(selectedDate)) +
        ".</p>" +
        '<button class="btn btn-ghost" type="button" onclick="clearDay()">Show all tasks</button>' +
        "</div>"
      : '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/></svg></div>' +
        "<h3>No tasks yet</h3>" +
        "<p>Tasks are the updates published against this project - what was done, when, and what the client gets to see.</p>" +
        '<a class="create-btn" href="project-task-form.html?project=' +
        encodeURIComponent(project.id) +
        '">New Task</a>' +
        "</div>";

    document.getElementById("pager").hidden = true;
    return;
  }

  const start = (page - 1) * TASK_PAGE_SIZE;
  const slice = shown.slice(start, start + TASK_PAGE_SIZE);

  grid.innerHTML = slice
    .map((task) => {
      const badge = badgeFor(task);
      const prog = progressFor(task);
      const when = task.scheduled_date
        ? fmtDate(task.scheduled_date)
        : "No date set";

      const image = task.image_path
        ? "style=\"background-image:url('" + esc(task.image_path) + "')\""
        : "";

      const placeholder = task.image_path
        ? ""
        : '<span class="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>';

      return (
        "" +
        '<div class="card ' +
        (task.orientation === "vertical" ? "is-vertical" : "") +
        (Number(task.id) === openTaskId ? " selected" : "") +
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
        '<div class="card-head">' +
        '<div class="card-head-text">' +
        '<span class="card-client" dir="auto">' +
        esc(project.company_name || project.client_name || "") +
        "</span>" +
        '<h3 dir="auto">' +
        esc(task.title) +
        "</h3>" +
        '<p class="card-desc" dir="auto">' +
        esc(task.description || "No description was added.") +
        "</p>" +
        "</div>" +
        taskMenu(task) +
        "</div>" +
        '<span class="card-when">' +
        esc(when) +
        (task.created_by_name ? " · " + esc(task.created_by_name) : "") +
        "</span>" +
        "</div>" +
        /* The state of the work itself, kept away from the publish badge. */
        '<div class="card-foot">' +
        '<span class="prog ' +
        prog.cls +
        '"><i></i>' +
        prog.text +
        "</span>" +
        "</div>" +
        /* Last in the markup and stretched over the card behind the menu, so a
         click anywhere that is not the menu opens the panel below. */
        '<button class="card-open" type="button" onclick="showTaskPanel(' +
        Number(task.id) +
        ')"' +
        ' aria-label="Show details for ' +
        esc(task.title) +
        '"></button>' +
        "</div>"
      );
    })
    .join("");

  wireKebabs();
  renderPager(total, pages, start, slice.length);
}

/*
| The three dots beside a card's title. Everything the card used to spend a
| two-button row on now lives in here, plus the View details the stretched hit
| area offers silently - a menu that leaves its own affordance out is a menu
| people do not find.
*/
function taskMenu(task) {
  const editHref =
    "project-task-form.html?project=" +
    encodeURIComponent(project.id) +
    "&id=" +
    encodeURIComponent(task.id);

  return (
    "" +
    '<div class="kebab-wrap card-menu">' +
    '<button class="kebab" type="button" aria-haspopup="menu" aria-expanded="false"' +
    ' aria-label="More actions for ' +
    esc(task.title) +
    '">' +
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>' +
    "</button>" +
    '<div class="kebab-menu" role="menu">' +
    '<button role="menuitem" type="button" onclick="showTaskPanel(' +
    Number(task.id) +
    ')">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
    "View details" +
    "</button>" +
    '<a role="menuitem" href="' +
    esc(editHref) +
    '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' +
    "Edit" +
    "</a>" +
    '<button class="danger" role="menuitem" type="button" onclick="removeTask(' +
    Number(task.id) +
    ')">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
    "Delete" +
    "</button>" +
    "</div>" +
    "</div>"
  );
}

/*
| The menus are re-bound on every render because the grid is replaced wholesale,
| and opening one closes any other - two menus open at once is never what was
| meant.
*/
function closeKebabs() {
  document.querySelectorAll(".kebab-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.querySelector(".kebab").setAttribute("aria-expanded", "false");
  });
}

function wireKebabs() {
  document.querySelectorAll(".kebab-wrap").forEach((wrap) => {
    wrap.querySelector(".kebab").addEventListener("click", function (event) {
      event.stopPropagation();
      const open = wrap.classList.contains("open");
      closeKebabs();
      if (!open) {
        wrap.classList.add("open");
        this.setAttribute("aria-expanded", "true");
      }
    });
  });
}

document.addEventListener("click", closeKebabs);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeKebabs();
});

function renderPager(total, pages, start, shown) {
  document.getElementById("pagerInfo").textContent =
    "Showing " +
    (start + 1) +
    " to " +
    (start + shown) +
    " of " +
    total +
    " result" +
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

async function removeTask(id) {
  const task = tasks.find((t) => Number(t.id) === Number(id));

  if (!task) return;

  closeKebabs();

  const ok = await askConfirm({
    title: "Delete task",
    text:
      '"' +
      task.title +
      '" will be removed from this project, along with ' +
      "anything the client has already been shown of it. This cannot be undone.",
    action: "Delete task",
  });

  if (!ok) return;

  const data = await api("api/project-tasks.php?id=" + encodeURIComponent(id), {
    method: "DELETE",
  });

  toast(data.message, !data.success);

  if (!data.success) return;

  tasks = tasks.filter((t) => Number(t.id) !== Number(id));

  // Deleting the last card on the last page would otherwise leave an empty grid.
  const pages = Math.max(1, Math.ceil(visibleTasks().length / TASK_PAGE_SIZE));
  if (page > pages) page = pages;

  /* The panel cannot go on describing a task that is no longer there, so it
     closes. closeTaskPanel renders the grid itself. */
  if (openTaskId === Number(id)) {
    closeTaskPanel();
  } else {
    renderTasks();
  }

  paintCalendar();
}

function paintDetail() {
  const image = document.getElementById("detailImg");

  /* The image is optional, so its absence is not something to draw. Showing a
     placeholder here would put a 320px empty rectangle above the title on
     every project that has not had one uploaded. */
  if (project.image_path) {
    image.style.backgroundImage = "url('" + project.image_path + "')";
    image.innerHTML = "";
    image.hidden = false;
  } else {
    image.hidden = true;
  }

  document.getElementById("detailTitle").textContent = project.title;
  document.getElementById("detailDesc").textContent =
    project.description || "No description was added.";
  document.getElementById("detailClient").textContent =
    project.company_name || project.client_name || "—";
  document.getElementById("detailTimeline").textContent =
    fmtDate(project.start_date) + " – " + fmtDate(project.end_date);
  document.getElementById("detailManager").textContent =
    project.account_manager_name || "Unassigned";
  document.getElementById("detailStatus").textContent = project.status_label;

  const progress = Number(project.progress || 0);
  document.getElementById("detailProgress").textContent = progress + "%";
  document.getElementById("detailBar").style.width = progress + "%";
}

/*
|------------------------------------------------------------------------------
| Delete confirmation
|------------------------------------------------------------------------------
|
| window.confirm() cannot name the row it is about to destroy and takes a single
| stray Enter as consent. This resolves a promise instead, and keeps the Delete
| button disabled until DELETE has been typed into the field, so the consent is
| a deliberate second action rather than a reflex.
|
*/

let confirmResolve = null;

function askConfirm(options) {
  const box = document.getElementById("confirmModal");
  const ack = document.getElementById("confirmAck");
  const okBtn = document.getElementById("confirmOk");

  document.getElementById("confirmTitle").textContent =
    options.title || "Delete";
  document.getElementById("confirmText").textContent = options.text || "";
  okBtn.textContent = options.action || "Delete";

  // Never inherit the previous answer: every deletion is acknowledged on its own.
  ack.value = "";
  ack.classList.remove("ok");
  okBtn.disabled = true;

  box.classList.add("show");
  ack.focus();

  return new Promise(function (resolve) {
    confirmResolve = resolve;
  });
}

function closeConfirm(answer) {
  document.getElementById("confirmModal").classList.remove("show");

  const resolve = confirmResolve;
  confirmResolve = null;

  if (resolve) resolve(!!answer);
}

/* Case-insensitive and trimmed: the point is a deliberate second action, not a
   typing test. Enter in the field is the same as pressing the button, but only
   once the word is there - otherwise Enter would be exactly the reflex
   dismissal this box exists to prevent. */
function ackIsGiven() {
  return (
    document.getElementById("confirmAck").value.trim().toUpperCase() ===
    "DELETE"
  );
}

document.getElementById("confirmAck").addEventListener("input", function () {
  const given = ackIsGiven();
  this.classList.toggle("ok", given);
  document.getElementById("confirmOk").disabled = !given;
});

document
  .getElementById("confirmAck")
  .addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (ackIsGiven()) closeConfirm(true);
    }
  });

document.getElementById("confirmOk").addEventListener("click", function () {
  if (!this.disabled) closeConfirm(true);
});

document.getElementById("confirmCancel").addEventListener("click", function () {
  closeConfirm(false);
});

// Clicking the backdrop cancels; clicking the box itself must not.
document
  .getElementById("confirmModal")
  .addEventListener("click", function (event) {
    if (event.target === this) closeConfirm(false);
  });

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && confirmResolve) closeConfirm(false);
});

load();
