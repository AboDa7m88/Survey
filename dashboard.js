const token = localStorage.getItem("portal_token");
if (!token) window.location.href = "login.html";

let currentDate = new Date();

// The day the schedule panel is describing. Clicking a cell moves it; the
// Day and Week views narrow the grid around it.
let selectedDate = toDateStr(new Date());

let currentView = "month";
let showAllApprovals = false;

// Meetings from api/calendar.php, and the live content from
// api/user-content.php that the grid files under the day it went out.
let calendarEvents = { appointments: [], content: [] };

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

/** Every status the API can hand back, in the wording these panels use. */
function statusLabel(status) {
  if (status === "approved") return "Confirmed";
  if (status === "rejected") return "Declined";
  return "Pending";
}

/* Rows an admin created for this client, and rows this client created. */
function adminRequests() {
  return calendarEvents.appointments.filter(
    (a) => (a.requested_by || "admin") === "admin",
  );
}

function ownRequests() {
  return calendarEvents.appointments.filter((a) => a.requested_by === "user");
}

/* ── Load ──────────────────────────────────────────────────────────────── */

/* ── Local preview data ────────────────────────────────────────────────────
   The bypass button on login.html writes a token no server will accept, so
   there is nothing to fetch. Rather than show five empty panels, the page
   runs on this fixture instead and keeps every action working in memory.
   Nothing here is reachable with a real session - delete the block and the
   PREVIEW guards below to drop it. */

const PREVIEW = localStorage.getItem("portal_token") === "preview";

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
        notes: "Bring the Q3 deck",
        date: demoDate(0),
        time: "10:30:00",
        status: "pending",
        requested_by: "admin",
        admin_name: "Sarah Miller",
      },

      {
        id: 2,
        title: "Lead Gen Survey Review",
        topic: "Lead Gen Survey Review",
        notes: "",
        date: demoDate(2),
        time: "15:00:00",
        status: "pending",
        requested_by: "admin",
        admin_name: "Rob Lee",
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
        admin_name: "Rob Lee",
      },

      {
        id: 5,
        title: "Feedback loop review",
        topic: "Feedback loop review",
        notes: "Walk through last month's responses",
        date: demoDate(6),
        time: "15:00:00",
        status: "approved",
        requested_by: "user",
      },

      {
        id: 6,
        title: "Internal Review: Q3 Roadmap",
        topic: "Internal Review: Q3 Roadmap",
        notes: "",
        date: demoDate(3),
        time: "13:00:00",
        status: "pending",
        requested_by: "user",
      },

      {
        id: 7,
        title: "Content strategy",
        topic: "Content strategy",
        notes: "",
        date: demoDate(-3),
        time: "11:00:00",
        status: "rejected",
        requested_by: "user",
      },
    ],

    content: [
      {
        id: 1,
        title: "Five lessons from our spring campaign",
        platform: "LinkedIn",
        type_label: "Articles",
        live_at: demoDate(0) + " 09:00:00",
      },

      {
        id: 2,
        title: "Behind the scenes at the new studio",
        platform: "Instagram",
        type_label: "Photos",
        live_at: demoDate(-2) + " 17:30:00",
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
    const res = await fetch("api/calendar.php?action=get_user_calendar", {
      headers: { Authorization: "Bearer " + token },
    });

    if (!res.ok) throw new Error(`HTTP Error! Status: ${res.status}`);

    const data = await res.json();

    if (!data.success) {
      console.error(data.message);
      return;
    }

    calendarEvents.appointments = data.appointments || [];

    renderAll();
  } catch (err) {
    console.error("Error fetching data:", err.message);
  }
}

/* Live content only - api/user-content.php leaves out drafts and anything
   scheduled for later. Loaded once, beside the meetings: a failure here
   leaves the calendar showing meetings, never an error. */
async function fetchContent() {
  if (PREVIEW) return; // demoData() already carries a couple of posts

  try {
    const res = await fetch("api/user-content.php", {
      headers: { Authorization: "Bearer " + token },
    });

    const data = await res.json();

    calendarEvents.content = (data.success && data.content) || [];
    renderAll();
  } catch (err) {
    console.error("Error fetching content:", err.message);
  }
}

/* ── Content on the calendar ───────────────────────────────────────────── */

/** "YYYY-MM-DD HH:MM:SS" the post went live: its scheduled moment, or when it
    was created for "Publish immediately". The API sends it as live_at; the
    fallback covers a response from before that field existed. */
function contentLiveAt(item) {
  if (item.live_at) return String(item.live_at);

  if (Number(item.publish_now) === 1 || !item.post_date) {
    return String(item.created_at || "");
  }

  return `${item.post_date} ${item.post_time || "00:00:00"}`;
}

function contentOn(dateStr) {
  return (calendarEvents.content || [])
    .filter((item) => contentLiveAt(item).slice(0, 10) === dateStr)
    .sort((a, b) => contentLiveAt(a).localeCompare(contentLiveAt(b)));
}

function contentHref(item) {
  return `content.html?id=${encodeURIComponent(item.id)}`;
}

function contentMeta(item) {
  return (
    [item.platform, item.type_label].filter(Boolean).join(" · ") || "Content"
  );
}

function renderAll() {
  renderCalendar();
  renderDailySchedule();
  renderApprovals();
  renderAdminRequests();
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

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const monthTitle = document.getElementById("calendarMonthTitle");

  if (!grid || !monthTitle) return;

  monthTitle.innerText = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const headers = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const days = visibleDays();
  const todayStr = toDateStr(new Date());

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

    // Meetings and posts in one time-ordered list. A month or week cell shows
    // the first MAX_DAY_CARDS and Day view shows them all; the schedule panel
    // below lists every one.
    const meetingCards = calendarEvents.appointments
      .filter((a) => a.date === dateStr)
      .map((a) => {
        const title = a.topic || a.title || "Meeting";
        const time = prettyTime(a.time);

        return {
          time: String(a.time || ""),
          html: `
            <div class="event-card ${esc(a.status || "pending")}" title="${esc(title + (time ? " · " + time : ""))}">
              <span class="ev-line">● <b dir="auto">${esc(title)}</b></span>
              <small class="ev-line">${esc(time)}</small>
            </div>`,
        };
      });

    // A post opens itself; stopPropagation keeps the click from also
    // selecting the day, which would repaint the grid under the link.
    const postCards = contentOn(dateStr).map((item) => {
      const title = item.title || "Content";
      const meta = `${prettyTime(contentLiveAt(item).slice(11))} · ${contentMeta(item)}`;

      return {
        time: contentLiveAt(item).slice(11),
        html: `
          <a class="event-card content" href="${contentHref(item)}"
             onclick="event.stopPropagation()" title="${esc(title + " · " + meta)}">
            <span class="ev-line">■ <b dir="auto">${esc(title)}</b></span>
            <small class="ev-line">${esc(meta)}</small>
          </a>`,
      };
    });

    const cards = meetingCards
      .concat(postCards)
      .sort((a, b) => a.time.localeCompare(b.time));
    const cap = oneDay ? cards.length : MAX_DAY_CARDS;

    cell.innerHTML =
      `<span>${day.getDate()}</span>` +
      cards
        .slice(0, cap)
        .map((card) => card.html)
        .join("") +
      (cards.length > cap
        ? `<div class="more-events">+${cards.length - cap} more</div>`
        : "");

    // Picking a day drives the schedule panel, and the Day/Week views.
    cell.onclick = () => {
      selectedDate = dateStr;
      renderCalendar();
      renderDailySchedule();
    };

    grid.appendChild(cell);
  });

  if (currentView === "month") {
    const cells = grid.children.length - 7; // less the seven headers
    const trail = (7 - (cells % 7)) % 7;

    for (let i = 1; i <= trail; i++) {
      grid.appendChild(padCell(i));
    }
  }
}

/* ── Daily schedule ────────────────────────────────────────────────────── */

function renderDailySchedule() {
  const list = document.getElementById("dailySchedule");
  const title = document.getElementById("dailyScheduleTitle");

  if (!list) return;

  title.innerText = `Daily Schedule – ${prettyDate(selectedDate)}`;

  // Meetings and posts in one list, in time order.
  const meetings = calendarEvents.appointments
    .filter((a) => a.date === selectedDate)
    .map((row) => ({ time: String(row.time || ""), html: meetingRow(row) }));

  const posts = contentOn(selectedDate).map((item) => ({
    time: contentLiveAt(item).slice(11),
    html: contentRow(item),
  }));

  const rows = meetings
    .concat(posts)
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!rows.length) {
    list.innerHTML = `<div class="empty-cell" style="padding:22px 0;">No events scheduled.</div>`;
    return;
  }

  list.innerHTML = rows.map((row) => row.html).join("");
}

function scheduleDate(dateStr) {
  const date = parseDateStr(dateStr);

  return `
    <div class="schedule-date">
      <span class="m">${MONTHS_SHORT[date.getMonth()]}</span>
      <span class="d">${String(date.getDate()).padStart(2, "0")}</span>
    </div>
  `;
}

function meetingRow(row) {
  const who =
    row.requested_by === "user"
      ? "Your request"
      : `With ${row.admin_name || "the admin team"}`;

  return `
    <div class="schedule-row">
      ${scheduleDate(row.date)}

      <div class="schedule-info">
        <h4 dir="auto">${esc(row.topic || row.title || "Meeting")}</h4>
        <p>${esc(who)}</p>
      </div>

      <span class="schedule-time wide-only">${esc(prettyTime(row.time))}</span>
      <span class="badge wide-only ${esc(row.status || "pending")}">${statusLabel(row.status)}</span>
      ${eyeButton(row.id)}
    </div>
  `;
}

/* A post is a link to itself: the title on a desktop, the eye on a phone. */
function contentRow(item) {
  const liveAt = contentLiveAt(item);
  const href = contentHref(item);

  return `
    <div class="schedule-row">
      ${scheduleDate(liveAt.slice(0, 10))}

      <div class="schedule-info">
        <h4 dir="auto"><a class="schedule-link" href="${href}">${esc(item.title || "Content")}</a></h4>
        <p>${esc(contentMeta(item))}</p>
      </div>

      <span class="schedule-time wide-only">${esc(prettyTime(liveAt.slice(11)))}</span>
      <span class="badge wide-only content">Content</span>
      <a class="eye-btn" href="${href}" title="Open this post" aria-label="Open this post">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </a>
    </div>
  `;
}

/* ── Approvals Hub ─────────────────────────────────────────────────────── */

function toggleApprovals() {
  showAllApprovals = !showAllApprovals;
  approvalsPage = 1;

  document.getElementById("approvalsToggle").innerText = showAllApprovals
    ? "Show pending only"
    : "View All Requests";

  renderApprovals();
}

/* Five to a page. Answering a request takes it out of the pending list, so
   the page you are on can empty under you - hence the clamp below. */
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
    `Showing ${start + 1} to ${start + shown} of ${total}`;

  const pages = Array.from({ length: totalPages }, (unused, i) => i + 1);

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

/* Phone only: the whole action column there, opening the meeting in full. */
function kebabButton(id) {
  return `
    <button type="button" class="row-kebab" aria-haspopup="dialog"
            aria-label="View meeting" onclick="openRequestModal(${Number(id)})">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
      </svg>
    </button>
  `;
}

/* Phone only, in the lists: the 768px block turns it on. A desktop row
   already shows everything the dialog would. */
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

function renderApprovals() {
  const table = document.getElementById("approvalsTable");

  if (!table) return;

  // Only admin-created rows are the client's to answer; their own requests
  // wait on the admin team and live in "Your requests" instead.
  const rows = adminRequests()
    .filter((a) => showAllApprovals || (a.status || "pending") === "pending")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!rows.length) {
    table.innerHTML = `
      <tr><td colspan="4" class="empty-cell">
        ${showAllApprovals ? "No meeting requests yet." : "Nothing waiting on you."}
      </td></tr>
    `;
    renderApprovalsPager(0, 0, 0, 0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / APPROVALS_PAGE_SIZE));
  approvalsPage = Math.min(Math.max(1, approvalsPage), totalPages);

  const start = (approvalsPage - 1) * APPROVALS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + APPROVALS_PAGE_SIZE);

  renderApprovalsPager(rows.length, totalPages, start, pageRows.length);

  table.innerHTML = pageRows
    .map((row) => {
      const pending = (row.status || "pending") === "pending";
      const requester = row.admin_name || "Admin team";

      const actions = pending
        ? `
        <div class="row-actions">
          <button class="icon-btn" title="Decline" aria-label="Decline"
                  onclick="respondAppointment(${row.id}, 'rejected')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <button class="icon-btn confirm" title="Confirm" aria-label="Confirm"
                  onclick="respondAppointment(${row.id}, 'approved')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        </div>
      `
        : `<span class="badge ${esc(row.status)}">${statusLabel(row.status)}</span>`;

      return `
      <tr>
        <td>
          <div class="primary-cell">${esc(row.topic || row.title || "Meeting")}</div>
          <div class="sub-cell">${esc(row.notes || "No notes")}</div>
        </td>
        <td>
          <div class="who">
            <span class="who-avatar">${esc(initials(requester))}</span>
            <strong>${esc(requester)}</strong>
          </div>
        </td>
        <td>
          <div class="primary-cell" style="font-size:13px;">${esc(prettyDate(row.date))}</div>
          <div class="sub-cell">${esc(prettyTime(row.time))}</div>
        </td>
        <td>
          ${actions}
          ${kebabButton(row.id)}
        </td>
      </tr>
    `;
    })
    .join("");
}

/* ── Admin meeting requests ────────────────────────────────────────────── */

function renderAdminRequests() {
  const table = document.getElementById("adminRequestsTable");

  if (!table) return;

  const rows = adminRequests().sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );

  if (!rows.length) {
    table.innerHTML = `<tr><td colspan="4" class="empty-cell">No scheduled meetings.</td></tr>`;
    return;
  }

  table.innerHTML = rows
    .map((row) => {
      const who = row.admin_name || "Admin team";

      return `
      <tr>
        <td>
          <div class="who">
            <span class="who-avatar">${esc(initials(who))}</span>
            <div>
              <strong>${esc(who)}</strong>
              <div class="sub-cell">${esc(statusLabel(row.status))}</div>
            </div>
          </div>
        </td>
        <td><span class="topic-cell" dir="auto">${esc(row.topic || row.title || "Meeting")}</span></td>
        <td>
          <div class="primary-cell" style="font-size:13px;">${esc(prettyDate(row.date))}</div>
          <div class="sub-cell">${esc(prettyTime(row.time))}</div>
        </td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" title="Open the day" aria-label="Open the day"
                    onclick="openCalendarDay('${esc(row.date)}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
          ${kebabButton(row.id)}
        </td>
      </tr>
    `;
    })
    .join("");
}

/* ── Your requests ─────────────────────────────────────────────────────── */

function renderYourRequests() {
  const list = document.getElementById("yourRequests");

  if (!list) return;

  const rows = ownRequests().sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );

  if (!rows.length) {
    list.innerHTML = `<div class="empty-cell" style="padding:22px 0;">You have not asked for a meeting yet.</div>`;
    return;
  }

  list.innerHTML = rows
    .map(
      (row) => `
    <div class="request-item">
      <div>
        <h4 dir="auto">${esc(row.topic || row.title || "Meeting")}</h4>
        <p class="wide-only">Requested for ${esc(prettyDate(row.date))} · ${esc(prettyTime(row.time))}</p>
      </div>
      <span class="badge wide-only ${esc(row.status || "pending")}">${statusLabel(row.status)}</span>
      ${eyeButton(row.id)}
    </div>
  `,
    )
    .join("");
}

/* ── Actions ───────────────────────────────────────────────────────────── */

async function respondAppointment(id, status) {
  if (PREVIEW) {
    const row = calendarEvents.appointments.find(
      (a) => Number(a.id) === Number(id),
    );
    if (row) row.status = status;
    renderAll();
    return;
  }

  try {
    const res = await fetch("api/calendar.php?action=respond_appointment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
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

  const date = document.getElementById("reqDate").value;
  const time = document.getElementById("reqTime").value;
  const topic = document.getElementById("reqTopic").value.trim();
  const notes = document.getElementById("reqNotes").value.trim();

  const fail = (message) => {
    status.innerText = message;
    status.className = "form-status error";
  };

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
      requested_by: "user",
    });

    document.getElementById("reqTopic").value = "";
    document.getElementById("reqNotes").value = "";

    status.innerText = "Request sent to the admin team.";
    status.className = "form-status ok";
    button.disabled = false;

    renderAll();
    return;
  }

  try {
    const res = await fetch("api/calendar.php?action=create_user_request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ date, time, topic, notes }),
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

/* ── Day modal ─────────────────────────────────────────────────────────── */

function openCalendarDay(date) {
  const modal = document.getElementById("calendarModal");
  const title = document.getElementById("calendarModalTitle");
  const content = document.getElementById("calendarModalContent");

  title.innerText = prettyDate(date);

  const apps = calendarEvents.appointments.filter((a) => a.date === date);
  const posts = contentOn(date);

  let html = "";

  if (!apps.length && !posts.length) {
    html = `<div class="day-details-item">No events scheduled.</div>`;
  }

  apps.forEach((a) => {
    html += `
      <div class="day-details-item">
        📅 <b>${esc(a.topic || a.title || "Meeting")}</b><br>
        Time: ${esc(prettyTime(a.time))}<br>
        ${a.notes ? `Notes: ${esc(a.notes)}<br>` : ""}
        Status: <span class="badge ${esc(a.status || "pending")}">${statusLabel(a.status)}</span>
      </div>
    `;
  });

  posts.forEach((item) => {
    html += `
      <div class="day-details-item">
        ■ <b dir="auto"><a class="schedule-link" href="${contentHref(item)}">${esc(item.title || "Content")}</a></b><br>
        Time: ${esc(prettyTime(contentLiveAt(item).slice(11)))}<br>
        <span class="badge content">Content</span> ${esc(contentMeta(item))}
      </div>
    `;
  });

  content.innerHTML = html;
  modal.classList.add("show");
}

function closeCalendarModal() {
  document.getElementById("calendarModal").classList.remove("show");
}

/* ── One meeting, in full ──────────────────────────────────────────────────
   Opened by the kebab in the tables and the eye in the lists, which is where
   a phone sends everything its rows leave out. */

let openRequestId = null;

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

  const fromAdmin = (row.requested_by || "admin") === "admin";
  const admin = row.admin_name || "The admin team";

  document.getElementById("reqModalHeading").innerText = fromAdmin
    ? "Meeting request"
    : "Your request";

  set("reqModalTopic", row.topic || row.title || "Meeting");
  set("reqModalWho", fromAdmin ? admin : "You");
  set("reqModalWith", fromAdmin ? "You" : admin);
  set("reqModalDate", prettyDate(row.date));
  set("reqModalTime", prettyTime(row.time));
  set("reqModalNotes", (row.notes || "").trim() || "No notes.");

  const status = document.getElementById("reqModalStatus");
  status.className = "badge " + esc(row.status || "pending");
  status.innerText = statusLabel(row.status);

  // Only an admin's request still waiting on this client is theirs to answer.
  const decidable = fromAdmin && (row.status || "pending") === "pending";
  document.getElementById("reqModalFoot").hidden = !decidable;

  document.getElementById("requestModal").classList.add("show");
}

function closeRequestModal() {
  openRequestId = null;
  document.getElementById("requestModal").classList.remove("show");
}

/* Same call the inline buttons make. Closing first means the list underneath
   repaints without the dialog sitting over a row that has just changed. */
function decideFromModal(status) {
  if (!openRequestId) return;

  const id = openRequestId;

  closeRequestModal();
  respondAppointment(id, status);
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  const modal = document.getElementById("requestModal");
  if (modal && modal.classList.contains("show")) closeRequestModal();
});

/* ── Chrome ────────────────────────────────────────────────────────────── */

function setAvatarImage(user) {
  const image = user.profile_image;
  const letter = (user.name || "User").charAt(0).toUpperCase();

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

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", () => {
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
    renderCalendar();
    renderDailySchedule();
  };

  document.querySelectorAll("#viewToggle .view-btn").forEach((button) => {
    button.onclick = () => {
      document
        .querySelectorAll("#viewToggle .view-btn")
        .forEach((other) => other.classList.toggle("active", other === button));

      currentView = button.dataset.view;

      // Day and Week read from selectedDate, so keep the month in step with
      // whatever day is selected before repainting.
      currentDate = parseDateStr(selectedDate);

      renderCalendar();
    };
  });

  const storedUser = JSON.parse(localStorage.getItem("portal_user") || "{}");

  if (storedUser.name) {
    document.getElementById("sideName").innerText = storedUser.name;
  }

  setAvatarImage(storedUser);

  fetchCalendarData();
  fetchContent();
});
