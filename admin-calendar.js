let adminToken = localStorage.getItem("admin_token");
let adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

/* The calendar is about client meetings, so it belongs to the roles that deal
   with clients: owner, super admin and account manager. A plain `seo_admin`
   works on content and never books time with a client, so the page turns them
   away here rather than loading and failing on every request. api/calendar.php
   applies the same list - this only saves the round trip. */
const CALENDAR_ROLES = ["owner", "super_admin", "account_manager"];

if (adminToken && !CALENDAR_ROLES.includes(adminUser.role)) {
  window.location.replace("admin.html");
}

let currentDate = new Date();

// The day the schedule panel is describing. Clicking a cell moves it; the
// Day and Week views narrow the grid around it.
let selectedDate = toDateStr(new Date());

let currentView = "month";

let calendarEvents = { appointments: [] };
let myAdminId = 0;

const MONTHS = [
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

/* Cards drawn in one day's cell in Month and Week view; the rest read
   "+N more". Day view has the room, so it shows every card. */
const MAX_DAY_CARDS = 3;

/* ── Small helpers ─────────────────────────────────────────────────────── */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateStr(value) {
  const [y, m, d] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/** "3:00 PM" from either "15:00" or "15:00:00". */
function prettyTime(value) {
  const [h, m] = String(value || "")
    .split(":")
    .map(Number);

  if (Number.isNaN(h)) return "";

  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;

  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

/** "Aug 12, 2026". */
function prettyDate(value) {
  const date = parseDateStr(value);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function initials(name) {
  return (
    String(name || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?"
  );
}

function statusLabel(status) {
  if (status === "approved") return "Confirmed";
  if (status === "rejected") return "Declined";
  return "Pending";
}

/* Rows a client raised, and rows this admin team raised. */
function clientRequests() {
  return calendarEvents.appointments.filter((a) => a.requested_by === "user");
}

function ourRequests() {
  return calendarEvents.appointments.filter(
    (a) => (a.requested_by || "admin") === "admin",
  );
}

/* ── Load ──────────────────────────────────────────────────────────────── */

/* ── Local preview data ────────────────────────────────────────────────────
   The bypass button on admin-login.html writes a token no server will accept,
   so there is nothing to fetch. Rather than show four empty panels, the page
   runs on this fixture instead and keeps every action working in memory.
   Nothing here is reachable with a real session - delete the block and the
   PREVIEW guards below to drop it. */

const PREVIEW = adminToken === "preview";

const DEMO_CLIENTS = ["Acme Media", "Northwind", "Vertex Labs"];

function demoDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateStr(date);
}

function demoData() {
  return {
    appointments: [
      {
        id: 1,
        title: "AI Research Interview",
        topic: "AI Research Interview",
        notes: "Wants the Q3 numbers first",
        date: demoDate(0),
        time: "10:30:00",
        status: "pending",
        requested_by: "user",
        user_name: "Jane Cooper",
        company_name: "Acme Media",
        client: "Acme Media",
      },

      {
        id: 2,
        title: "Lead Gen Survey Review",
        topic: "Lead Gen Survey Review",
        notes: "",
        date: demoDate(2),
        time: "15:00:00",
        status: "pending",
        requested_by: "user",
        user_name: "Peter Lee",
        company_name: "Northwind",
        client: "Northwind",
      },

      {
        id: 3,
        title: "Modern SaaS Architecture",
        topic: "Modern SaaS Architecture",
        notes: "Kick-off for the new build",
        date: demoDate(0),
        time: "09:30:00",
        status: "approved",
        requested_by: "admin",
        admin_name: "Sarah Miller",
        user_name: "Jane Cooper",
        company_name: "Acme Media",
        client: "Acme Media",
      },

      {
        id: 4,
        title: "User Experience Trends",
        topic: "User Experience Trends",
        notes: "",
        date: demoDate(1),
        time: "12:00:00",
        status: "approved",
        requested_by: "admin",
        admin_name: "Sarah Miller",
        user_name: "Dana White",
        company_name: "Vertex Labs",
        client: "Vertex Labs",
      },

      {
        id: 5,
        title: "Feedback loop review",
        topic: "Feedback loop review",
        notes: "",
        date: demoDate(6),
        time: "15:00:00",
        status: "pending",
        requested_by: "admin",
        admin_name: "Sarah Miller",
        user_name: "Peter Lee",
        company_name: "Northwind",
        client: "Northwind",
      },

      {
        id: 6,
        title: "Content strategy",
        topic: "Content strategy",
        notes: "",
        date: demoDate(-3),
        time: "11:00:00",
        status: "rejected",
        requested_by: "admin",
        admin_name: "Rob Lee",
        user_name: "Dana White",
        company_name: "Vertex Labs",
        client: "Vertex Labs",
      },
    ],
  };
}

/** Highest id in play, so a request added in preview gets a fresh one. */
function nextDemoId() {
  return (
    calendarEvents.appointments.reduce(
      (max, a) => Math.max(max, Number(a.id) || 0),
      0,
    ) + 1
  );
}

async function fetchCalendarData() {
  if (PREVIEW) {
    calendarEvents = demoData();
    renderAll();
    return;
  }

  try {
    const res = await fetch("api/calendar.php?action=get_admin_calendar", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    if (!res.ok) throw new Error(`HTTP Error! Status: ${res.status}`);

    const data = await res.json();

    if (!data.success) {
      console.error(data.message);
      return;
    }

    calendarEvents.appointments = data.appointments || [];
    myAdminId = data.admin_id || 0;

    renderAll();
    openLinkedAppointment();
  } catch (err) {
    console.error("Error fetching data:", err.message);
  }
}

/* The Client dropdown, same list the content form offers: the distinct
   company names on the clients this admin can reach. */
async function loadClients() {
  const select = document.getElementById("reqClient");

  if (!select) return;

  if (PREVIEW) {
    select.innerHTML =
      `<option value="">Select a client</option>` +
      DEMO_CLIENTS.map(
        (c) => `<option value="${esc(c)}">${esc(c)}</option>`,
      ).join("");
    return;
  }

  try {
    const res = await fetch("api/calendar.php?action=get_clients", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (!data.success) return;

    select.innerHTML =
      `<option value="">Select a client</option>` +
      (data.clients || [])
        .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
        .join("");
  } catch (err) {
    console.error("Could not load clients:", err);
  }
}

function renderAll() {
  renderCalendar();
  renderDailySchedule();
  renderApprovals();
  renderYourRequests();
}

/* ── Calendar grid ─────────────────────────────────────────────────────── */

/** The days the grid covers, which is what Day / Week / Month actually change. */
function visibleDays() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  if (currentView === "day") {
    return [parseDateStr(selectedDate)];
  }

  if (currentView === "week") {
    const anchor = parseDateStr(selectedDate);

    // Monday-first, matching the column headers.
    const offset = (anchor.getDay() + 6) % 7;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - offset);

    return Array.from({ length: 7 }, (unused, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day;
    });
  }

  const total = new Date(year, month + 1, 0).getDate();

  return Array.from(
    { length: total },
    (unused, i) => new Date(year, month, i + 1),
  );
}

/** A greyed-out cell from the neighbouring month, used only to pad the weeks. */
function padCell(dayNumber) {
  const cell = document.createElement("div");
  cell.className = "day-cell other-month";
  cell.innerHTML = `<span>${dayNumber}</span>`;
  return cell;
}

// Show Today button only when the selected date or displayed month differs from today
function updateTodayButton() {
  const todayBtn = document.getElementById("todayBtn");
  if (!todayBtn) return;

  const today = new Date();
  const todayStr = toDateStr(today);
  const isTodaySelected = selectedDate === todayStr;
  const isCurrentMonth =
    currentDate.getFullYear() === today.getFullYear() &&
    currentDate.getMonth() === today.getMonth();

  todayBtn.hidden = isTodaySelected && isCurrentMonth;
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const monthTitle = document.getElementById("calendarMonthTitle");

  if (!grid || !monthTitle) return;

  monthTitle.innerText = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const days = visibleDays();
  const todayStr = toDateStr(new Date());

  const headers = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /* Day view is one day, so seven columns are six columns of nothing - and
     the day landed under "Mon" whatever weekday it actually was. One column,
     headed with the real weekday and date. */
  const oneDay = currentView === "day";

  grid.classList.toggle("one-day", oneDay);

  if (oneDay) {
    const day = days[0];
    const name = headers[(day.getDay() + 6) % 7];

    grid.innerHTML = `<div class="day-header">${name} ${day.getDate()} ${MONTHS[day.getMonth()]}</div>`;
  } else {
    grid.innerHTML = headers
      .map((day) => `<div class="day-header">${day}</div>`)
      .join("");

    updateTodayButton();
  }

  // Month view pads to whole weeks so the columns line up with the headers.
  // These go in as nodes, never through innerHTML: assigning innerHTML on the
  // grid re-parses it and would drop the click handlers set further down.
  if (currentView === "month") {
    const lead = (days[0].getDay() + 6) % 7;
    const prevLast = new Date(
      days[0].getFullYear(),
      days[0].getMonth(),
      0,
    ).getDate();

    for (let i = lead; i > 0; i--) {
      grid.appendChild(padCell(prevLast - i + 1));
    }
  }

  days.forEach((day) => {
    const dateStr = toDateStr(day);

    const cell = document.createElement("div");
    cell.className =
      "day-cell" +
      (dateStr === todayStr ? " today-cell" : "") +
      (dateStr === selectedDate && currentView !== "day"
        ? " selected-cell"
        : "");

    // Time-ordered; a month or week cell shows the first MAX_DAY_CARDS and
    // Day view shows them all. The schedule panel below lists every one.
    const cards = calendarEvents.appointments
      .filter((a) => a.date === dateStr)
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
      .map((a) => {
        const title = a.topic || a.title || "Meeting";
        const meta = [a.user_name, prettyTime(a.time)]
          .filter(Boolean)
          .join(" · ");

        return `
          <div class="event-card ${esc(a.status || "pending")}" title="${esc(title + (meta ? " · " + meta : ""))}">
            <span class="ev-line">● <b>${esc(title)}</b></span>
            <small class="ev-line">${esc(meta)}</small>
          </div>`;
      });

    const cap = oneDay ? cards.length : MAX_DAY_CARDS;

    cell.innerHTML =
      `<span>${day.getDate()}</span>` +
      cards.slice(0, cap).join("") +
      (cards.length > cap
        ? `<div class="more-events">+${cards.length - cap} more</div>`
        : "");

    cell.onclick = () => {
      selectedDate = dateStr;
      renderCalendar();
      renderDailySchedule();
    };

    grid.appendChild(cell);
  });

  if (currentView === "month") {
    const cells = grid.children.length - 7;
    const trail = (7 - (cells % 7)) % 7;

    for (let i = 1; i <= trail; i++) {
      grid.appendChild(padCell(i));
    }
  }
}

/* The eye that opens a row in full. Phone only - shell.css's breakpoint
   hides it above 768px, where the row already shows everything the dialog
   would. It is in the markup either way, so a resize needs no re-render. */
function eyeButton(id) {
  return `
    <button type="button" class="eye-btn" aria-haspopup="dialog"
            title="View details" aria-label="View details"
            onclick="openRequestModal(${Number(id)})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </button>
  `;
}

/* ── Daily schedule ────────────────────────────────────────────────────── */

function renderDailySchedule() {
  const list = document.getElementById("dailySchedule");
  const title = document.getElementById("dailyScheduleTitle");

  if (!list) return;

  title.innerText = `Daily Schedule – ${prettyDate(selectedDate)}`;

  const rows = calendarEvents.appointments
    .filter((a) => a.date === selectedDate)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  if (!rows.length) {
    list.innerHTML = `<div class="empty-cell" style="padding:22px 0;">Nothing scheduled for this day.</div>`;
    return;
  }

  list.innerHTML = rows
    .map((row) => {
      const date = parseDateStr(row.date);
      const who = row.company_name || row.client || row.user_name || "Client";

      /* A wide screen gets the whole row, as it always did. A phone keeps the
       meeting and the client and reaches the rest through the eye - see the
       .wide-only rules in the phone block. */
      return `
      <div class="schedule-row">
        <div class="schedule-date">
          <span class="m">${MONTHS_SHORT[date.getMonth()]}</span>
          <span class="d">${String(date.getDate()).padStart(2, "0")}</span>
        </div>

        <div class="schedule-info">
          <h4>${esc(row.topic || row.title || "Meeting")}</h4>
          <p>${esc(who)}<span class="wide-only"> &middot; ${esc(row.user_name || "")}</span></p>
        </div>

        <span class="schedule-time wide-only">${esc(prettyTime(row.time))}</span>
        <span class="badge wide-only ${esc(row.status || "pending")}">${statusLabel(row.status)}</span>

        ${eyeButton(row.id)}
      </div>
    `;
    })
    .join("");
}

/* ── Approvals Hub ─────────────────────────────────────────────────────── */

/* Five to a page, the same as "Your requests" below. Deciding a request drops
   it out of the queue, so the page you are on can empty under you - hence the
   clamp in renderApprovals(). */
const APPROVALS_PAGE_SIZE = 5;
let approvalsPage = 1;

function goToApprovalsPage(page) {
  approvalsPage = page;
  renderApprovals();

  // The table is above the pager, so jump back to the top of the new page.
  document
    .getElementById("approvalsTable")
    .scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderApprovalsPager(total, totalPages, start, shown) {
  const pager = document.getElementById("approvalsPager");

  if (!pager) return;

  if (total <= APPROVALS_PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("approvalsPagerInfo").innerText =
    `Showing ${start + 1}–${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("approvalsPagerPages").innerHTML = `
    <button type="button" onclick="goToApprovalsPage(${approvalsPage - 1})" ${approvalsPage === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map(
        (page) => `
      <button type="button" class="${page === approvalsPage ? "current" : ""}"
              onclick="goToApprovalsPage(${page})">${page}</button>
    `,
      )
      .join("")}
    <button type="button" onclick="goToApprovalsPage(${approvalsPage + 1})" ${approvalsPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

function renderApprovals() {
  const table = document.getElementById("approvalsTable");

  if (!table) return;

  /* Two filters, both of them the point of the panel. Only client-raised rows
     are the admin's to answer - the ones this team sent out wait on the client
     and live in "Your requests" instead - and only the ones still waiting for
     a decision, because a decided request has no action left on it. */
  const rows = clientRequests()
    .filter((a) => (a.status || "pending") === "pending")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!rows.length) {
    table.innerHTML = `
      <tr><td colspan="4" class="empty-cell">Nothing waiting on you.</td></tr>
    `;
    renderApprovalsPager(0, 0, 0, 0);
    return;
  }

  // Answering the last request on a page leaves that page empty.
  const totalPages = Math.max(1, Math.ceil(rows.length / APPROVALS_PAGE_SIZE));
  approvalsPage = Math.min(Math.max(1, approvalsPage), totalPages);

  const start = (approvalsPage - 1) * APPROVALS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + APPROVALS_PAGE_SIZE);

  renderApprovalsPager(rows.length, totalPages, start, pageRows.length);

  table.innerHTML = pageRows
    .map((row) => {
      const requester = row.user_name || "Client";

      const actions = `
        <div class="row-actions">
          <button class="icon-btn" title="Decline" aria-label="Decline"
                  onclick="respondRequest(${row.id}, 'rejected')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <button class="icon-btn confirm" title="Confirm" aria-label="Confirm"
                  onclick="respondRequest(${row.id}, 'approved')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        </div>
    `;

      return `
      <tr>
        <td>
          <div class="primary-cell">${esc(row.topic || row.title || "Meeting")}</div>
          <div class="sub-cell">${esc(row.notes || "No notes")}</div>
        </td>
        <td>
          <div class="who">
            <span class="who-avatar">${esc(initials(requester))}</span>
            <div>
              <strong>${esc(requester)}</strong>
              <div class="sub-cell">${esc(row.company_name || "")}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="primary-cell" style="font-size:13px;">${esc(prettyDate(row.date))}</div>
          <div class="sub-cell">${esc(prettyTime(row.time))}</div>
        </td>
        <td>
          ${actions}

          <!-- Phone only, and the whole action column there: two 30px circles
               do not fit beside the meeting and the requester. Opens the
               request in full, decision buttons included. -->
          <button type="button" class="row-kebab" aria-haspopup="dialog"
                  aria-label="View request"
                  onclick="openRequestModal(${Number(row.id)})">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

/* ── One request, in full ──────────────────────────────────────────────────
   The Approvals Hub row is four columns on a desktop and two on a phone, and
   the notes never fitted in either. This is the whole record, and the place
   the decision is taken from a phone - approving with the notes on screen
   rather than from a truncated line of them. */

let openRequestId = null;

/* Any appointment, not just a client request: the Daily Schedule and Your
   requests open this too, and both of those list meetings this team raised
   as well as ones the client did. */
function openRequestModal(id) {
  const row = calendarEvents.appointments.find(
    (a) => Number(a.id) === Number(id),
  );

  if (!row) return;

  openRequestId = Number(id);

  const set = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) element.innerText = value;
  };

  // Who asked is the admin on our own requests and the client on theirs.
  const fromUs = row.requested_by === "admin";

  set("reqModalTopic", row.topic || row.title || "Meeting");
  set("reqModalWho", (fromUs ? row.admin_name : row.user_name) || "-");
  set(
    "reqModalClient",
    [row.user_name, row.company_name || row.client]
      .filter(Boolean)
      .join(" · ") || "-",
  );
  set("reqModalDate", prettyDate(row.date));
  set("reqModalTime", prettyTime(row.time));
  set("reqModalNotes", (row.notes || "").trim() || "No notes.");

  const status = document.getElementById("reqModalStatus");
  status.className = "badge " + esc(row.status || "pending");
  status.innerText = statusLabel(row.status);

  /* Approve and Decline belong to a request the client raised and nobody has
     answered. One this team sent out waits on them, not on us, and the hub
     only ever lists pending rows anyway - so this is normally true there and
     false everywhere else. */
  const decidable = !fromUs && (row.status || "pending") === "pending";
  document.getElementById("reqModalFoot").hidden = !decidable;

  document.getElementById("requestModal").classList.add("show");
}

/* A meeting notification or email links here as ?appointment=<id>. Once the
   calendar has loaded, jump to that meeting's day and open it in full -
   once only, so a later refresh after approving does not reopen it. A
   meeting this admin can't see (another team's client) just leaves the
   calendar as it is. */
let linkedAppointmentHandled = false;

function openLinkedAppointment() {
  if (linkedAppointmentHandled) return;
  linkedAppointmentHandled = true;

  const id = new URLSearchParams(location.search).get("appointment");
  if (!/^\d+$/.test(id || "")) return;

  const row = calendarEvents.appointments.find(
    (a) => Number(a.id) === Number(id),
  );
  if (!row) return;

  if (row.date) {
    selectedDate = row.date;
    currentDate = parseDateStr(row.date);
    renderCalendar();
    renderDailySchedule();
  }
  openRequestModal(row.id);
}

function closeRequestModal() {
  openRequestId = null;
  document.getElementById("requestModal").classList.remove("show");
}

/* Same call the inline circles make. Closing first means the list underneath
   repaints without the dialog sitting over a row that has just changed. */
function decideFromModal(status) {
  if (!openRequestId) return;

  const id = openRequestId;

  closeRequestModal();
  respondRequest(id, status);
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  const modal = document.getElementById("requestModal");
  if (modal && modal.classList.contains("show")) closeRequestModal();
});

/* ── Your requests ─────────────────────────────────────────────────────── */

// Five to a page; the rest live behind the pager under the list.
const REQUESTS_PAGE_SIZE = 5;
let requestsPage = 1;

function goToRequestsPage(page) {
  requestsPage = page;
  renderYourRequests();

  // The list is above the pager, so jump back to the top of the new page.
  document
    .getElementById("yourRequests")
    .scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderRequestsPager(total, totalPages, start, shown) {
  const pager = document.getElementById("requestsPager");

  if (!pager) return;

  if (total <= REQUESTS_PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("requestsPagerInfo").innerText =
    `Showing ${start + 1}–${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("requestsPagerPages").innerHTML = `
    <button type="button" onclick="goToRequestsPage(${requestsPage - 1})" ${requestsPage === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map(
        (page) => `
      <button type="button" class="${page === requestsPage ? "current" : ""}"
              onclick="goToRequestsPage(${page})">${page}</button>
    `,
      )
      .join("")}
    <button type="button" onclick="goToRequestsPage(${requestsPage + 1})" ${requestsPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

function renderYourRequests() {
  const list = document.getElementById("yourRequests");

  if (!list) return;

  // Every request this team has sent, whatever the client has done with it.
  const rows = ourRequests().sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );

  if (!rows.length) {
    list.innerHTML = `<div class="empty-cell" style="padding:22px 0;">Your team has not asked a client for a meeting yet.</div>`;
    renderRequestsPager(0, 0, 0, 0);
    return;
  }

  // Answering a request can shorten the list out from under the current page.
  const totalPages = Math.max(1, Math.ceil(rows.length / REQUESTS_PAGE_SIZE));
  requestsPage = Math.min(Math.max(1, requestsPage), totalPages);

  const start = (requestsPage - 1) * REQUESTS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + REQUESTS_PAGE_SIZE);

  renderRequestsPager(rows.length, totalPages, start, pageRows.length);

  /* A wide screen gets the whole line, as it always did. A phone keeps the
     meeting and the client and reaches the rest through the eye. */
  list.innerHTML = pageRows
    .map(
      (row) => `
    <div class="request-item">
      <div>
        <h4>${esc(row.topic || row.title || "Meeting")}</h4>
        <p>${esc(row.company_name || row.client || "Client")}<span class="wide-only">
          &middot; ${esc(row.user_name || "")}
          &middot; Requested for ${esc(prettyDate(row.date))} &middot; ${esc(prettyTime(row.time))}
        </span></p>
      </div>
      <span class="badge wide-only ${esc(row.status || "pending")}">${statusLabel(row.status)}</span>
      ${eyeButton(row.id)}
    </div>
  `,
    )
    .join("");
}

/* ── Actions ───────────────────────────────────────────────────────────── */

async function respondRequest(id, status) {
  if (PREVIEW) {
    const row = calendarEvents.appointments.find(
      (a) => Number(a.id) === Number(id),
    );
    if (row) row.status = status;
    renderAll();
    return;
  }

  try {
    const res = await fetch("api/calendar.php?action=respond_request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ id, status }),
    });

    const data = await res.json();
    alert(data.message || "Status updated!");

    await fetchCalendarData();
  } catch (err) {
    console.error(err);
    alert("Failed to update status");
  }
}

async function sendRequest() {
  const status = document.getElementById("requestStatus");
  const button = document.getElementById("sendRequestBtn");

  const client = document.getElementById("reqClient").value;
  const date = document.getElementById("reqDate").value;
  const time = document.getElementById("reqTime").value;
  const topic = document.getElementById("reqTopic").value.trim();
  const notes = document.getElementById("reqNotes").value.trim();

  const fail = (message) => {
    status.innerText = message;
    status.className = "form-status error";
  };

  if (!client) {
    fail("Pick the client this request is for.");
    return;
  }

  if (!date || !time) {
    fail("Pick a preferred date and time.");
    return;
  }

  if (!topic) {
    fail("Say what the meeting is about.");
    return;
  }

  status.innerText = "Sending...";
  status.className = "form-status";
  button.disabled = true;

  if (PREVIEW) {
    calendarEvents.appointments.push({
      id: nextDemoId(),
      title: topic,
      topic,
      notes,
      date,
      time: time + ":00",
      status: "pending",
      requested_by: "admin",
      admin_name: "Sarah Miller",
      user_name: client + " team",
      company_name: client,
      client,
    });

    document.getElementById("reqTopic").value = "";
    document.getElementById("reqNotes").value = "";

    status.innerText = "Request sent to 1 client.";
    status.className = "form-status ok";
    button.disabled = false;

    renderAll();
    return;
  }

  try {
    const res = await fetch("api/calendar.php?action=create_admin_request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ client, date, time, topic, notes }),
    });

    const data = await res.json();

    status.innerText = data.message;
    status.className = "form-status " + (data.success ? "ok" : "error");

    if (data.success) {
      document.getElementById("reqDate").value = "";
      document.getElementById("reqTime").value = "";
      document.getElementById("reqTopic").value = "";
      document.getElementById("reqNotes").value = "";
    }

    await fetchCalendarData();
  } catch (err) {
    console.error(err);
    fail("Network or server error.");
  }

  button.disabled = false;
}

/* ── Chrome ────────────────────────────────────────────────────────────── */

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const datePickerBtn = document.getElementById("datePickerBtn");
  const customDatePicker = document.getElementById("customDatePicker");
  const customDatePickerTitle = document.getElementById(
    "customDatePickerTitle",
  );
  const customDatePickerGrid = document.getElementById("customDatePickerGrid");
  const directDateInput = document.getElementById("directDateInput");

  function renderCustomDatePicker() {
    if (!customDatePickerGrid) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    customDatePickerTitle.textContent = new Date(
      year,
      month,
      1,
    ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    customDatePickerGrid.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = (firstDay + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPreviousMonth = new Date(year, month, 0).getDate();

    for (let i = 0; i < 42; i++) {
      let day;
      let date;
      let otherMonth = false;

      if (i < startOffset) {
        day = daysInPreviousMonth - startOffset + i + 1;
        date = new Date(year, month - 1, day);
        otherMonth = true;
      } else if (i >= startOffset + daysInMonth) {
        day = i - startOffset - daysInMonth + 1;
        date = new Date(year, month + 1, day);
        otherMonth = true;
      } else {
        day = i - startOffset + 1;
        date = new Date(year, month, day);
      }

      const dateString = toDateStr(date);
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = day;
      button.setAttribute("aria-label", dateString);

      if (dateString === selectedDate) button.classList.add("selected");
      if (dateString === toDateStr(new Date())) button.classList.add("today");
      if (otherMonth) button.classList.add("other-month");

      button.addEventListener("click", () => {
        selectedDate = dateString;
        currentDate = new Date(date.getFullYear(), date.getMonth(), 1);

        renderAll();
        renderCustomDatePicker();

        customDatePicker.hidden = true;
        datePickerBtn.setAttribute("aria-expanded", "false");
      });

      customDatePickerGrid.appendChild(button);
    }
  }

  datePickerBtn.onclick = () => {
    const isOpening = customDatePicker.hidden;

    if (isOpening) {
      currentDate = parseDateStr(selectedDate);
      renderCustomDatePicker();
    }

    customDatePicker.hidden = !isOpening;
    datePickerBtn.setAttribute("aria-expanded", String(isOpening));
  };

  document.getElementById("datePickerPrev").onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCustomDatePicker();
  };

  document.getElementById("datePickerNext").onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCustomDatePicker();
  };

  function goToEnteredDate() {
    const value = directDateInput.value.trim();

    if (!value) return;

    let date = null;
    let match;

    // YYYY-MM-DD or YYYY/MM/DD
    match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

    if (match) {
      date = new Date(+match[1], +match[2] - 1, +match[3]);
    } else {
      // DD/MM/YYYY, DD-MM-YYYY, or MM/DD/YYYY
      match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

      if (match) {
        const first = +match[1];
        const second = +match[2];
        const year = +match[3];

        // If one number is above 12, the format is unambiguous.
        // Otherwise, interpret as DD/MM/YYYY.
        const day = first > 12 ? first : second > 12 ? second : first;
        const month = first > 12 ? second : second > 12 ? first : second;

        date = new Date(year, month - 1, day);
      } else {
        // Natural language formats supported by the browser, e.g. 25 Dec 2026
        const parsed = Date.parse(value);

        if (!Number.isNaN(parsed)) {
          date = new Date(parsed);
        }
      }
    }

    // Reject invalid or impossible dates.
    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      !/^\d{4}$/.test(String(date.getFullYear())) ||
      !isValidEnteredDate(value, date)
    ) {
      alert(
        "Couldn't recognize that date. Try a format like 25/12/2026 or 2026-12-25.",
      );
      return;
    }

    selectedDate = toDateStr(date);
    currentDate = new Date(date.getFullYear(), date.getMonth(), 1);

    renderAll();
    renderCustomDatePicker();

    customDatePicker.hidden = true;
    datePickerBtn.setAttribute("aria-expanded", "false");
  }

  function isValidEnteredDate(value, date) {
    const match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

    if (match) {
      return (
        date.getFullYear() === +match[1] &&
        date.getMonth() === +match[2] - 1 &&
        date.getDate() === +match[3]
      );
    }

    const numericMatch = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

    if (numericMatch) {
      const first = +numericMatch[1];
      const second = +numericMatch[2];
      const year = +numericMatch[3];

      const day = first > 12 ? first : second > 12 ? first : second;
      const month = first > 12 ? second : second > 12 ? first : first;

      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    }

    return true;
  }

  document.getElementById("goToDateBtn").onclick = goToEnteredDate;

  directDateInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToEnteredDate();
    }
  });

  document.getElementById("customDatePickerToday").onclick = () => {
    selectedDate = toDateStr(new Date());
    currentDate = new Date();

    renderAll();
    customDatePicker.hidden = true;
    datePickerBtn.setAttribute("aria-expanded", "false");
  };

  document.getElementById("prevMonthBtn").onclick = () => {
    currentDate.setDate(1);
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  };

  document.getElementById("nextMonthBtn").onclick = () => {
    currentDate.setDate(1);
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  };

  document.getElementById("todayBtn").onclick = () => {
    currentDate = new Date();
    selectedDate = toDateStr(new Date());
    renderAll();
  };

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".date-picker-wrapper") &&
      !customDatePicker.hidden
    ) {
      customDatePicker.hidden = true;
      datePickerBtn.setAttribute("aria-expanded", "false");
    }
  });

  loadClients();
  fetchCalendarData();
});

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
