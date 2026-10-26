const adminToken = localStorage.getItem("admin_token");
const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Part of Clients Management, which is not for seo_admin. api/admin-user-details.php
// refuses the role as well; this only stops a typed-in URL loading an empty page.
if (adminUser.role === "seo_admin") {
  window.location.replace("admin.html");
}

(function () {
  const name = adminUser.name || "Admin";
  const label =
    {
      owner: "Owner",
      super_admin: "Super Admin",
      account_manager: "Account Manager",
      seo_admin: "Admin",
    }[adminUser.role] || "";
  const initial = name.charAt(0).toUpperCase();
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set("adminName", name);
  set("adminRole", label);
  set("adminAvatar", initial);
  set("acctRole", label);
})();

const userId = new URLSearchParams(location.search).get("id");

// Every value below is user-authored and goes through innerHTML.
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
| An address a browser can follow.
|
| "example.com" in href is a relative path, so the link used to land on
| /example.com on this site rather than on the client's website. A bare domain
| gets https:// put in front of it; anything that is still not http(s) after
| that - a mailto:, a javascript: - is not made into a link at all, because
| this value came from a form the client fills in themselves.
|
| Returns "" when there is nothing safe to link to, which is the caller's cue
| to show the text instead.
*/
function webUrl(value) {
  let url = String(value == null ? "" : value).trim();

  if (!url) return "";

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = "https://" + url;

  return /^https?:\/\/[^\s]+$/i.test(url) ? url : "";
}

function orDash(value) {
  const text = String(value == null ? "" : value).trim();
  return text ? esc(text) : `<span class="muted">—</span>`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(String(value).replace(" ", "T"));
  if (isNaN(date)) return esc(value);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSize(bytes) {
  const size = Number(bytes);
  if (!size) return "—";
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}

/* ── Appointments calendar ─────────────────────────────────────────────
   Same behaviour as admin-calendar.html, narrowed to this one client:
   a month grid, and the schedule for whichever day is selected. Like the
   client's own dashboard.html calendar, it also shows the content posts
   this client sees, on the day each went live. */

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

/* Cards drawn in one day's cell; the rest read "+N more". */
const MAX_DAY_CARDS = 3;

let appointments = [];
let contentItems = [];
let currentDate = new Date();
let selectedDate = toDateStr(new Date());

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

/** "YYYY-MM-DD HH:MM:SS" the post went live: its scheduled moment, or when it
    was created for "Publish immediately". Same as dashboard.html. */
function contentLiveAt(item) {
  if (item.live_at) return String(item.live_at);

  if (Number(item.publish_now) === 1 || !item.post_date) {
    return String(item.created_at || "");
  }

  return `${item.post_date} ${item.post_time || "00:00:00"}`;
}

function contentOn(dateStr) {
  return contentItems
    .filter((item) => contentLiveAt(item).slice(0, 10) === dateStr)
    .sort((a, b) => contentLiveAt(a).localeCompare(contentLiveAt(b)));
}

/* The admin view of the post - content.html is the client's and needs their
   session. admin-content.html opens the post named in ?id=. */
function contentHref(item) {
  return `admin-content.html?id=${encodeURIComponent(item.id)}`;
}

function contentMeta(item) {
  return (
    [item.platform, item.type_label].filter(Boolean).join(" · ") || "Content"
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

  monthTitle.textContent = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const headers = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  grid.innerHTML = headers
    .map((day) => `<div class="day-header">${day}</div>`)
    .join("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  const days = Array.from(
    { length: total },
    (unused, i) => new Date(year, month, i + 1),
  );
  const todayStr = toDateStr(new Date());

  // Cells go in as nodes, never through innerHTML: reassigning innerHTML on the
  // grid re-parses it and would drop the click handlers set further down.
  const lead = (days[0].getDay() + 6) % 7;
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = lead; i > 0; i--) {
    grid.appendChild(padCell(prevLast - i + 1));
  }

  days.forEach((day) => {
    const dateStr = toDateStr(day);

    const cell = document.createElement("div");
    cell.className =
      "day-cell" +
      (dateStr === todayStr ? " today-cell" : "") +
      (dateStr === selectedDate ? " selected-cell" : "");

    // Meetings and posts in one time-ordered list, of which the day shows the
    // first MAX_DAY_CARDS; the schedule panel below lists them all.
    const meetingCards = appointments
      .filter((a) => a.date === dateStr)
      .map((a) => {
        const title = a.topic || a.title || "Meeting";
        const time = prettyTime(a.time);

        return {
          time: String(a.time || ""),
          html: `
            <div class="event-card ${esc(a.status || "pending")}" title="${esc(title + (time ? " · " + time : ""))}">
              <span class="ev-line">● <b>${esc(title)}</b></span>
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

    cell.innerHTML =
      `<span>${day.getDate()}</span>` +
      cards
        .slice(0, MAX_DAY_CARDS)
        .map((card) => card.html)
        .join("") +
      (cards.length > MAX_DAY_CARDS
        ? `<div class="more-events">+${cards.length - MAX_DAY_CARDS} more</div>`
        : "");

    cell.onclick = () => {
      selectedDate = dateStr;
      renderCalendar();
      renderDailySchedule();
    };

    grid.appendChild(cell);
  });

  const cells = grid.children.length - 7;
  const trail = (7 - (cells % 7)) % 7;
  for (let i = 1; i <= trail; i++) {
    grid.appendChild(padCell(i));
  }
}

function renderDailySchedule() {
  const list = document.getElementById("dailySchedule");
  const title = document.getElementById("dailyScheduleTitle");
  if (!list) return;

  title.textContent = `Daily Schedule – ${prettyDate(selectedDate)}`;

  // Meetings and posts in one list, in time order.
  const meetings = appointments
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
    list.innerHTML = `<div class="empty">Nothing scheduled for this day.</div>`;
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
    </div>`;
}

function meetingRow(row) {
  const raisedBy =
    row.requested_by === "user"
      ? "Requested by the client"
      : `Requested by ${row.admin_name || "the team"}`;

  return `
    <div class="schedule-row">
      ${scheduleDate(row.date)}

      <div class="schedule-info">
        <h4>${esc(row.topic || row.title || "Meeting")}</h4>
        <p>${esc(raisedBy)}${row.notes ? " · " + esc(row.notes) : ""}</p>
      </div>

      <span class="schedule-time">${esc(prettyTime(row.time))}</span>
    </div>`;
}

/* A post is a link to itself. */
function contentRow(item) {
  const liveAt = contentLiveAt(item);

  return `
    <div class="schedule-row">
      ${scheduleDate(liveAt.slice(0, 10))}

      <div class="schedule-info">
        <h4 dir="auto"><a class="schedule-link" href="${contentHref(item)}">${esc(item.title || "Content")}</a></h4>
        <p>${esc(contentMeta(item))}</p>
      </div>

      <span class="schedule-time">${esc(prettyTime(liveAt.slice(11)))}</span>
    </div>`;
}

/** Wires the month controls and paints the calendar, once its markup is in the DOM. */
function initCalendar(rows, content) {
  appointments = rows || [];
  contentItems = content || [];

  // Land on the month of the newest meeting or post, so the grid is not empty.
  const latest = appointments
    .map((a) => a.date)
    .concat(contentItems.map((item) => contentLiveAt(item).slice(0, 10)))
    .filter(Boolean)
    .sort()
    .pop();

  if (latest) {
    currentDate = parseDateStr(latest);
    selectedDate = latest;
  }

  const shift = (step) => {
    currentDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + step,
      1,
    );
    renderCalendar();
  };

  document.getElementById("prevMonthBtn").onclick = () => shift(-1);
  document.getElementById("nextMonthBtn").onclick = () => shift(1);
  document.getElementById("todayBtn").onclick = () => {
    currentDate = new Date();
    selectedDate = toDateStr(new Date());
    renderCalendar();
    renderDailySchedule();
  };

  renderCalendar();
  renderDailySchedule();
}

/** A panel wrapping a table, or its empty state when there are no rows. */
function tablePanel(title, description, headers, rows, emptyText) {
  const body = rows.length
    ? `<table>
         <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
         <tbody>${rows.join("")}</tbody>
       </table>`
    : `<div class="empty">${esc(emptyText)}</div>`;

  return `
    <div class="panel">
      <div class="panel-head">
        <h2>${esc(title)} ${rows.length ? `<span class="badge neutral">${rows.length}</span>` : ""}</h2>
        <p>${esc(description)}</p>
      </div>
      ${body}
    </div>`;
}

/*
|------------------------------------------------------------------------------
| The internal note
|------------------------------------------------------------------------------
|
| A note belongs to the admin who wrote it. Whoever added it is the only person
| who ever reads it back - not the other managers, not the owner - so what is
| drawn here is this admin's own note and nothing else. It lives in the Details
| panel on this page and appears nowhere else: not on the clients list, and
| nowhere a client can reach.
|
| canManageNotes decides whether the field is drawn at all. It is the server's
| answer and not this page's guess, and it is still only about the markup:
| api/admin-user-details.php checks the role again on the way in, so a hand-made
| POST from an admin who may not write one is refused there - and the note of an
| admin who is not the one asking is never on the response to begin with.
|
*/

function notesField(user, canManage) {
  const note = String(user.admin_notes == null ? "" : user.admin_notes);

  /* Nothing to draw for an admin who may not write one: a note is private to
     its author, so they would be looking at an empty box that can never fill. */
  if (!canManage) return "";

  return `
    <div class="note-field">
      <div class="note-head">
        <h5>Internal note</h5>
        <span class="note-why">Private to you &middot; no other admin sees this, and the client never does</span>
      </div>
      <textarea id="clientNote" maxlength="5000" rows="4"
                placeholder="Anything you want to remember about this client next time..."
                aria-label="Internal note about this client">${esc(note)}</textarea>
      <div class="note-bar">
        <button class="note-save" type="button" onclick="saveClientNote()">Save note</button>
        <span class="note-status" id="noteStatus"></span>
      </div>
    </div>`;
}

async function saveClientNote() {
  const field = document.getElementById("clientNote");
  const status = document.getElementById("noteStatus");
  const button = document.querySelector(".note-save");

  if (!field) return;

  button.disabled = true;
  status.className = "note-status";
  status.innerText = "Saving...";

  try {
    const res = await fetch("api/admin-user-details.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        action: "save_notes",
        id: userId,
        notes: field.value,
      }),
    });

    const data = await res.json();

    if (data.success) {
      currentData.user.admin_notes = data.notes;
      noteDraft = null;
    }

    status.className = "note-status " + (data.success ? "ok" : "error");
    status.innerText =
      data.message || (data.success ? "Saved." : "Could not save.");
  } catch (error) {
    status.className = "note-status error";
    status.innerText = "Connection error. Please try again.";
  }

  button.disabled = false;
}

/*
|------------------------------------------------------------------------------
| The decision about this client
|------------------------------------------------------------------------------
|
| Approve, Reject and Delete used to live only on the list. They are here now,
| in the header of the profile they act on, because this page is where you find
| out who the client is - deciding from a row and deciding after reading are not
| the same act, and only one of them is informed.
|
| Which pair shows depends on the account: pending gets Approve and Reject,
| approved gets Delete. The owner alone gets any of them, matching
| api/admin-users.php and api/delete-client.php - no button is offered that is
| going to come back Unauthorized.
|
*/

const isOwner = adminUser.role === "owner";

function decideButtons(approved) {
  if (!isOwner) return "";

  if (!approved) {
    return `
      <div class="head-decide">
        <button class="btn approve-btn" type="button" onclick="decide('approve')">Approve</button>
        <button class="btn reject-btn" type="button" onclick="decide('reject')">Reject</button>
      </div>`;
  }

  return `
    <div class="head-decide">
      <button class="btn delete-btn" type="button" onclick="removeClient()">Delete client</button>
    </div>`;
}

/*
| Approving lands the client in the approved table and reloads this page, so
| everything an approved client has - surveys, appointments, files - appears.
| Rejecting removes the registration, so there is no profile left to be on and
| the browser goes back to the list.
*/
async function decide(action) {
  if (!isOwner) return;

  if (action === "reject") {
    const ok = await askConfirm({
      title: "Reject registration",
      text:
        (currentUser.name || "This client") +
        " (" +
        (currentUser.email || "") +
        ") will be turned away and the registration removed. They can sign " +
        "up again later.",
      action: "Reject",
      icon: "warn",
    });

    if (!ok) return;
  }

  setDecideBusy(true);

  try {
    const res = await fetch("api/admin-users.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ userId: Number(userId), action }),
    });

    const data = await res.json();

    alert(data.message);

    if (!data.success) {
      setDecideBusy(false);
      return;
    }

    // A rejected client no longer exists, so there is no page to stay on.
    if (action === "reject") {
      window.location.href = "clients-management.html";
      return;
    }

    loadUser();
  } catch (error) {
    alert("Connection error.");
    setDecideBusy(false);
  }
}

/* Permanent, and the whole account: the dialog names it and holds its button
   until DELETE has been typed. Same dialog the Project Management page uses. */
async function removeClient() {
  if (!isOwner) return;

  const ok = await askConfirm({
    title: "Delete client",
    text:
      (currentUser.name || "This client") +
      " (" +
      (currentUser.email || "") +
      ") will be erased, along with everything tied to the account - " +
      "responses, appointments, assigned files and notifications. This " +
      "cannot be undone.",
    action: "Delete client",
    word: "DELETE",
  });

  if (!ok) return;

  setDecideBusy(true);

  try {
    const res = await fetch("api/delete-client.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      // The email is a staleness check: if this page is out of date, the
      // server refuses rather than deleting whoever now holds that id.
      body: JSON.stringify({
        user_id: Number(userId),
        confirm_email: currentUser.email,
      }),
    });

    const data = await res.json();

    alert(data.message);

    if (data.success) {
      window.location.href = "clients-management.html";
      return;
    }

    setDecideBusy(false);
  } catch (error) {
    alert("Connection error.");
    setDecideBusy(false);
  }
}

function setDecideBusy(busy) {
  document.querySelectorAll(".head-decide .btn").forEach((button) => {
    button.disabled = busy;
  });
}

/*
|------------------------------------------------------------------------------
| WhatsApp
|------------------------------------------------------------------------------
|
| The client gives the number on their own profile page, with its country code -
| that is the part api/db.php insists on, because a number without one cannot be
| dialled from anywhere else and nothing about the value shows it is wrong.
|
| Here it is a button rather than a number: what you want from this field is to
| reach the person, so clicking it opens the conversation. wa.me decides where -
| the app if it is installed, the web client if not.
|
| The server works the address out and sends it; this only checks it is what it
| says it is, because an href built from stored text is not somewhere to take
| one hop on trust.
*/

const WA_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.92 1.16-.15.2-.3.22-.6.07-.3-.15-1.1-.4-2.1-1.3-.78-.7-1.3-1.55-1.45-1.85-.15-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.18-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.46 0 1.45 1.06 2.85 1.21 3.05.15.2 2.09 3.2 5.07 4.37.71.3 1.26.48 1.69.61.71.23 1.36.2 1.87.12.57-.08 1.75-.71 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
  '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2 22l5.25-1.38c1.45.79 3.08 1.21 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.92 6.45 17.5 2 12.04 2zm0 18.13h-.01c-1.48 0-2.94-.4-4.21-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24z"/>' +
  "</svg>";

function whatsappCell(user) {
  const number = String(user.whatsapp || "").trim();
  const link = String(user.whatsapp_link || "").trim();

  if (!number) return `<span class="muted">—</span>`;

  // Only an http(s) wa.me address becomes a link; anything else is text.
  if (!/^https:\/\/wa\.me\/[0-9]+$/.test(link)) {
    return esc(number);
  }

  return `
    <a class="wa-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer"
       title="Open WhatsApp chat with ${esc(number)}">
      ${WA_ICON}
      <span>${esc(number)}</span>
    </a>`;
}

/*
|------------------------------------------------------------------------------
| The Details panel
|------------------------------------------------------------------------------
|
| Two versions of the same panel. Reading is the default; an account manager or
| the owner gets an Edit button that swaps the five client-authored fields for
| inputs, so a wrong number or a missing company can be fixed without asking the
| client to log in and do it themselves.
|
| Name and email are never editable - they are the account's identity and have
| their own endpoints. Company is edited here but not shown in the read view:
| the header already names the client by it. Who manages the client is the
| Team panel below, not a field in here.
|
| canEditDetails is the server's answer, and only about the markup -
| api/admin-user-details.php checks the role again on the POST.
|
*/

let editingDetails = false;

function detailsPanel(data) {
  const u = data.user;
  const canEdit = !!data.canEditDetails;

  const website = String(u.website || "").trim();
  const websiteHref = webUrl(website);

  const head = `
    <div class="panel-head">
      <div class="head-with-action">
        <div>
          <h2>Details</h2>
          <p>${
            editingDetails
              ? "Editing the details the client filled in on their profile page."
              : "Filled in by the user on their profile page."
          }</p>
        </div>
        ${
          canEdit && !editingDetails
            ? `<button class="edit-toggle" type="button" onclick="startEditDetails()">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                 Edit details
               </button>`
            : ""
        }
      </div>
    </div>`;

  /* Who the account belongs to. Read-only in both versions of the panel: the
     client sets these at sign-up and the edit form does not save them. */
  const identity = `
    <div class="field"><h5>Name</h5><p dir="auto">${orDash(u.name)}</p></div>
    <div class="field">
      <h5>Email</h5>
      <p>${u.email ? `<a href="mailto:${esc(u.email)}" dir="ltr">${esc(u.email)}</a>` : orDash("")}</p>
    </div>`;

  if (!editingDetails) {
    return `
      <div class="panel">
        ${head}
        <div class="fields">
          ${identity}
          <div class="field"><h5>Phone</h5><p>${orDash(u.phone)}</p></div>
          <div class="field"><h5>WhatsApp</h5><p>${whatsappCell(u)}</p></div>
          <div class="field">
            <h5>Website</h5>
            <!-- Shown as typed, followed as an address: the label is the
                 client's own text, the href is that text made absolute. -->
            <p>${
              websiteHref
                ? `<a href="${esc(websiteHref)}" target="_blank" rel="noopener noreferrer">${esc(website)}</a>`
                : orDash(website)
            }</p>
          </div>
          <div class="field wide"><h5>About</h5><p dir="auto">${orDash(u.description)}</p></div>
          ${notesField(u, data.canManageNotes)}
        </div>
      </div>`;
  }

  return `
    <div class="panel">
      ${head}
      <div class="fields">
        ${identity}
        <div class="field">
          <h5><label for="edPhone">Phone</label></h5>
          <input type="tel" id="edPhone" value="${esc(u.phone || "")}" placeholder="+44 20 1234 5678">
        </div>
        <div class="field">
          <h5><label for="edWhatsApp">WhatsApp</label></h5>
          <input type="tel" id="edWhatsApp" value="${esc(u.whatsapp || "")}" placeholder="+44 7911 123456">
          <p class="hint">Needs the country code, like +44.</p>
        </div>
        <div class="field">
          <h5><label for="edCompany">Company</label></h5>
          <input type="text" id="edCompany" maxlength="150" dir="auto" value="${esc(u.company_name || "")}">
        </div>
        <div class="field">
          <h5><label for="edWebsite">Website</label></h5>
          <input type="text" id="edWebsite" value="${esc(website)}" placeholder="example.com">
          <p class="hint">https:// is added if you leave it off.</p>
        </div>
        <div class="field wide">
          <h5><label for="edAbout">About</label></h5>
          <textarea id="edAbout" dir="auto" placeholder="What this company does, in a couple of sentences.">${esc(u.description || "")}</textarea>
        </div>

        <div class="details-bar">
          <button class="details-save" type="button" onclick="saveDetails()">Save details</button>
          <button class="details-cancel" type="button" onclick="cancelEditDetails()">Cancel</button>
          <span class="details-status" id="detailsStatus"></span>
        </div>

        ${notesField(u, data.canManageNotes)}
      </div>
    </div>`;
}

function startEditDetails() {
  editingDetails = true;
  render(currentData);
  const first = document.getElementById("edPhone");
  if (first) first.focus();
}

function cancelEditDetails() {
  editingDetails = false;
  render(currentData);
}

/* The client's own five fields. The server checks each one and hands back what
   it stored, which is what gets painted - so the panel shows the saved value
   rather than the typed one, and a bare domain reappears with its scheme. */
async function saveDetails() {
  const status = document.getElementById("detailsStatus");
  const button = document.querySelector(".details-save");

  status.className = "details-status";
  status.innerText = "Saving...";
  button.disabled = true;

  const payload = {
    action: "save_details",
    id: userId,
    phone: document.getElementById("edPhone").value,
    whatsapp: document.getElementById("edWhatsApp").value,
    company_name: document.getElementById("edCompany").value,
    website: document.getElementById("edWebsite").value,
    description: document.getElementById("edAbout").value,
  };

  try {
    const res = await fetch("api/admin-user-details.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!data.success) {
      status.className = "details-status error";
      status.innerText = data.message || "Could not save.";
      button.disabled = false;
      return;
    }

    /* Merged rather than reloaded: the note the admin may have been typing in
       the same panel is not something to throw away over a details save.
       whatsapp_link is re-derived here for the same reason - it is what the
       icon is built from. */
    Object.assign(currentData.user, data.details);
    currentData.user.whatsapp_link = currentData.user.whatsapp
      ? "https://wa.me/" +
        String(currentData.user.whatsapp).replace(/[^0-9]/g, "")
      : "";

    editingDetails = false;
    render(currentData);
  } catch (error) {
    status.className = "details-status error";
    status.innerText = "Connection error. Please try again.";
    button.disabled = false;
  }
}

/*
|------------------------------------------------------------------------------
| The Team panel
|------------------------------------------------------------------------------
|
| Who works on this client, in three columns. Being in a column is what puts
| the client in that person's lists everywhere else in the admin.
|
|   owner            changes all three columns, choosing from anyone
|   account manager  changes Super Admins and Admins, from their own team
|   super admin      changes Admins, from their own team
|   admin            reads it
|
| "Their own team" is set by the owner under Settings. api/client-team.php
| holds the rules and sends back which columns and which people this admin may
| change - the page draws what it is told and the server checks it again on
| every add and remove.
|
| It loads after the rest of the profile, and keeps what it last loaded in
| teamState so a re-render of the page (saving Details, say) redraws it without
| asking again.
|
*/

const TEAM_COLUMNS = [
  {
    role: "account_manager",
    title: "Account Managers",
    one: "account manager",
  },
  { role: "super_admin", title: "Super Admins", one: "super admin" },
  { role: "seo_admin", title: "Admins", one: "admin" },
];

const TEAM_SUB = {
  owner: "Who works on this client. You can change every column.",
  account_manager:
    "Who works on this client. You can add super admins and admins from your team.",
  super_admin: "Who works on this client. You can add admins from your team.",
  seo_admin: "Who works on this client.",
};

// null until the first load; { error } when it could not be loaded.
let teamState = null;
let teamBusy = false;

function teamPanel() {
  return `
    <div class="panel" id="teamPanel">
      <div class="panel-head">
        <h2>Team</h2>
        <p>${esc(TEAM_SUB[adminUser.role] || TEAM_SUB.seo_admin)}</p>
      </div>
      <div id="teamBody">${teamBodyHtml()}</div>
    </div>`;
}

function teamBodyHtml() {
  if (!teamState) return `<div class="empty">Loading team...</div>`;
  if (teamState.error)
    return `<div class="empty">${esc(teamState.error)}</div>`;

  const removable = new Set((teamState.removable || []).map(Number));

  const columns = TEAM_COLUMNS.map((col) => {
    const members = (teamState.team && teamState.team[col.role]) || [];
    const editable = !!(teamState.editable && teamState.editable[col.role]);
    const candidates =
      (teamState.candidates && teamState.candidates[col.role]) || [];

    const chips = members.length
      ? `<div class="team-chips">${members
          .map((member) => {
            const canRemove = editable && removable.has(Number(member.id));

            return `
            <span class="team-chip${canRemove ? " can-remove" : ""}">
              <span dir="auto" title="${esc(member.name)}">${esc(member.name)}</span>
              ${
                canRemove
                  ? `<button type="button" aria-label="Remove ${esc(member.name)}"
                           onclick="removeTeamMember(${Number(member.id)})"
                           ${teamBusy ? "disabled" : ""}>&times;</button>`
                  : ""
              }
            </span>`;
          })
          .join("")}</div>`
      : `<span class="team-none">No ${esc(col.one)} yet</span>`;

    /* Only people who are not in the column already. A column this admin may
       change but with nobody left to offer says so rather than vanishing. */
    const add = !editable
      ? ""
      : candidates.length
        ? `<select class="team-add" aria-label="Add ${esc(col.one)}"
                 onchange="addTeamMember(this.value)" ${teamBusy ? "disabled" : ""}>
           <option value="">+ Add ${esc(col.one)}</option>
           ${candidates.map((c) => `<option value="${Number(c.id)}" dir="auto">${esc(c.name)}</option>`).join("")}
         </select>`
        : `<select class="team-add" disabled><option>No one left to add</option></select>`;

    return `
      <div class="team-col">
        <div class="team-col-head">${esc(col.title)}</div>
        <div class="team-col-body">${chips}${add}</div>
      </div>`;
  }).join("");

  return `
    <div class="team-grid">${columns}</div>
    <div class="team-status" id="teamStatus"></div>`;
}

function paintTeam(message, tone) {
  const body = document.getElementById("teamBody");
  if (!body) return;

  body.innerHTML = teamBodyHtml();

  const status = document.getElementById("teamStatus");
  if (status && message) {
    status.className = "team-status" + (tone ? " " + tone : "");
    status.textContent = message;
  }
}

async function loadTeam() {
  try {
    const res = await fetch(
      "api/client-team.php?user_id=" + encodeURIComponent(userId),
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );

    const data = await res.json();

    teamState = data.success
      ? data
      : { error: data.message || "Could not load the team." };
  } catch (error) {
    teamState = { error: "Connection error. The team could not be loaded." };
  }

  paintTeam();
}

async function saveTeam(action, adminId) {
  if (teamBusy || !adminId) return;

  teamBusy = true;
  paintTeam("Saving...");

  try {
    const res = await fetch("api/client-team.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        user_id: Number(userId),
        action,
        admin_id: Number(adminId),
      }),
    });

    const data = await res.json();

    teamBusy = false;

    if (!data.success) {
      paintTeam(data.message || "Could not save the team.", "error");
      return;
    }

    // The response is the whole panel again, as the server now has it.
    teamState = data;
    paintTeam(data.message, "ok");
  } catch (error) {
    teamBusy = false;
    paintTeam("Connection error. Please try again.", "error");
  }
}

function addTeamMember(adminId) {
  saveTeam("add", adminId);
}

function teamMemberName(adminId) {
  for (const col of TEAM_COLUMNS) {
    const match = (
      (teamState && teamState.team && teamState.team[col.role]) ||
      []
    ).find((member) => Number(member.id) === Number(adminId));
    if (match) return match.name;
  }
  return "This person";
}

async function removeTeamMember(adminId) {
  const ok = await askConfirm({
    title: "Remove from team",
    text:
      teamMemberName(adminId) +
      " will be taken off this client's team and " +
      "will no longer see the client in their lists.",
    action: "Remove",
    icon: "warn",
  });

  if (!ok) return;

  saveTeam("remove", adminId);
}

/* The last payload this page rendered from, so the panels can be redrawn when
   one of them changes without asking the server again. */
let currentData = null;
let currentUser = {};

/* An unsaved note, held across re-renders. null means "nothing in progress",
   which is not the same as "" - an admin who has deliberately cleared the box
   and not saved it yet should not get the stored note back. */
let noteDraft = null;

/* Every write to #pageBody goes through here, so the note survives whichever
   of the two paths in render() drew the page. */
function paint(html) {
  const live = document.getElementById("clientNote");
  if (live) noteDraft = live.value;

  document.getElementById("pageBody").innerHTML = html;

  const fresh = document.getElementById("clientNote");
  if (fresh && noteDraft !== null) fresh.value = noteDraft;
}

function render(data) {
  currentData = data;

  const u = data.user;
  currentUser = u;

  const approved = Number(u.approved) === 1;

  /* The header names the client by company, as every list in the admin does;
     the person behind the account is in Details. An account that has not given
     a company yet falls back to the person, so the header is never blank. */
  const displayName =
    String(u.company_name || "").trim() || u.name || "Unnamed client";

  const photo = u.profile_image
    ? `<div class="profile-photo" style="background-image:url('${esc(u.profile_image)}')"></div>`
    : `<div class="profile-photo">${esc(displayName.charAt(0).toUpperCase())}</div>`;

  const header = `
    <div class="panel">
      <div class="profile-head">
        ${photo}
        <div class="profile-id">
          <h2 dir="auto">${esc(displayName)}</h2>
          <p>Joined ${formatDate(u.created_at)}</p>
        </div>
        <span class="badge ${approved ? "approved" : "pending"}">${approved ? "Approved" : "Pending"}</span>
        ${decideButtons(approved)}
      </div>
    </div>`;

  const details = detailsPanel(data);

  const surveys = tablePanel(
    "Surveys assigned",
    "Surveys and checklists allocated to this user.",
    ["Title", "Status", "Created"],
    (data.surveys || []).map(
      (s) => `
      <tr>
        <td>${esc(s.title || "Untitled")}</td>
        <td>${orDash(s.status)}</td>
        <td>${formatDate(s.created_at)}</td>
      </tr>`,
    ),
    "No surveys assigned to this user.",
  );

  const responses = tablePanel(
    "Responses",
    "Surveys this user has submitted.",
    ["Survey", "Submitted", ""],
    (data.responses || []).map(
      (r) => `
      <tr>
        <td>${esc(r.survey_title || "Untitled")}</td>
        <td>${formatDate(r.submitted_at)}</td>
        <td><a href="response-details.html?id=${encodeURIComponent(r.id)}">View answers</a></td>
      </tr>`,
    ),
    "This user has not submitted any responses.",
  );

  // The calendar renders itself after this markup is in the DOM, see renderCalendar().
  const appointments = `
    <div class="panel">
      <div class="panel-head">
        <h2>Appointments ${(data.appointments || []).length ? `<span class="badge neutral">${(data.appointments || []).length}</span>` : ""}</h2>
        <p>Meetings and the content posts this client sees, on the content calendar. Pick a day to see what is on it.</p>
      </div>
      <div class="cal-head">
        <div class="cal-controls">
          <span class="cal-month" id="calendarMonthTitle">—</span>
          <button class="nav-arrow" type="button" id="prevMonthBtn" aria-label="Previous month">&lt;</button>
          <button class="nav-arrow" type="button" id="nextMonthBtn" aria-label="Next month">&gt;</button>
        </div>
        <button class="btn-today" type="button" id="todayBtn">Today</button>
      </div>
      <div class="calendar-grid" id="calendarGrid"></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2 id="dailyScheduleTitle">Daily Schedule</h2>
        <p>Meetings with this client, and posts that went live for them, on the selected day.</p>
      </div>
      <div class="schedule-list" id="dailySchedule"></div>
    </div>`;

  const files = tablePanel(
    "Files shared",
    "Source files this user can download.",
    ["File", "Size", "Uploaded"],
    (data.files || []).map(
      (f) => `
      <tr>
        <td>${esc(f.original_name || "Untitled")}</td>
        <td>${formatSize(f.file_size)}</td>
        <td>${formatDate(f.uploaded_at)}</td>
      </tr>`,
    ),
    "No files shared with this user.",
  );

  const content = tablePanel(
    "Content visible",
    "Published posts this user can see — public ones plus anything targeted at their client.",
    ["Title", "Type", "Created at"],
    (data.content || []).map(
      (c) => `
      <tr>
        <td>${esc(c.title || "Untitled")}</td>
        <td>${esc(c.platform || "")}${c.type_label ? " · " + esc(c.type_label) : ""}</td>
        <td>${formatDate(c.created_at)}</td>
      </tr>`,
    ),
    "No published content reaches this user yet.",
  );

  /* Nothing below Details applies to an account that has not been approved:
     a pending client has no surveys, no submissions, no meetings and no files,
     so the panels for them would all say so and bury the only panel worth
     reading. The note explains the gap rather than leaving it unexplained. */
  if (!approved) {
    paint(
      header +
        `<div class="pending-only">
           This registration has not been approved yet, so there is nothing
           assigned to it. ${
             isOwner
               ? "Approve it above and their surveys, meetings and files appear here."
               : "Once the owner approves it, their surveys, meetings and files appear here."
           }
         </div>` +
        details,
    );

    return;
  }

  // The calendar sits right under the Team, the people who run it.
  paint(
    header +
      details +
      teamPanel() +
      appointments +
      surveys +
      responses +
      files +
      content,
  );

  initCalendar(data.appointments || [], data.content || []);
}

function fail(message) {
  document.getElementById("pageBody").innerHTML =
    `<div class="panel"><div class="empty">${esc(message)}</div></div>`;
}

async function loadUser() {
  if (!userId) {
    fail("No user selected. Go back and pick a user from the list.");
    return;
  }

  try {
    const res = await fetch(
      "api/admin-user-details.php?id=" + encodeURIComponent(userId),
      {
        headers: { Authorization: "Bearer " + adminToken },
      },
    );

    if (res.status === 401) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_user");
      window.location.href = "admin-login.html";
      return;
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      fail(data.message || "Could not load this user.");
      return;
    }

    document.title = (data.user.name || "User") + " — Admin";

    // Straight from the database, so a draft from before is no longer in play.
    noteDraft = null;
    teamState = null;
    render(data);

    // Only an approved client has the Team panel to fill.
    if (Number(data.user.approved) === 1) {
      loadTeam();
    }
  } catch (error) {
    console.error(error);
    fail("Connection error.");
  }
}

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

loadUser();
