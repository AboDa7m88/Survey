let adminToken = localStorage.getItem("admin_token");
let adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Clients Management is open to every admin, so the sidebar no longer hides it.

let folders = [];
let currentFolderId = null;
let users = [];

function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
}

async function loadFolders() {
  const box = document.getElementById("foldersBox");

  try {
    const res = await fetch("api/source-folders.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
        "X-Sources-Token": sourcesToken,
      },
    });

    const data = await res.json();

    if (!data.success) {
      box.innerHTML = data.message || "Failed to load folders.";
      return;
    }

    folders = data.folders || [];

    if (!folders.length) {
      box.innerHTML = `<div class="small">No folders yet.</div>`;
      return;
    }

    box.innerHTML = folders
      .map(
        (folder) => `
      <div class="folder" id="folder-${folder.id}" onclick="openFolder(${folder.id})">
        <strong>${folder.title}</strong>
        <div class="small">${folder.created_at}</div>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    box.innerHTML = "Connection error.";
  }
}

async function createFolder() {
  const titleInput = document.getElementById("folderTitle");
  const status = document.getElementById("folderStatus");
  const title = titleInput.value.trim();

  if (!title) {
    status.innerText = "Please enter folder title.";
    return;
  }

  status.innerText = "Creating...";

  try {
    const res = await fetch("api/source-folders.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
        "X-Sources-Token": sourcesToken,
      },
      body: JSON.stringify({ title }),
    });

    const data = await res.json();
    status.innerText = data.message;

    if (data.success) {
      titleInput.value = "";
      loadFolders();
    }
  } catch (error) {
    status.innerText = "Connection error.";
  }
}

async function openFolder(folderId) {
  currentFolderId = folderId;

  document.querySelectorAll(".folder").forEach((el) => {
    el.classList.remove("active");
  });

  const folderEl = document.getElementById("folder-" + folderId);
  if (folderEl) {
    folderEl.classList.add("active");
  }

  const folder = folders.find((f) => Number(f.id) === Number(folderId));
  document.getElementById("currentFolderTitle").innerText = folder
    ? folder.title
    : "Files";
  document.getElementById("filesPanel").style.display = "block";

  await loadFiles();
}

async function loadFiles() {
  const box = document.getElementById("filesBox");

  if (!currentFolderId) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = "Loading files...";

  try {
    const res = await fetch(
      "api/source-files.php?folder_id=" + currentFolderId,
      {
        headers: {
          Authorization: "Bearer " + adminToken,
          "X-Sources-Token": sourcesToken,
        },
      },
    );

    const data = await res.json();

    if (!data.success) {
      box.innerHTML = data.message || "Failed to load files.";
      return;
    }

    const files = data.files || [];
    files.forEach((file) => {
      fileNames[file.id] = file.original_name;
    });

    if (!files.length) {
      box.innerHTML = `<div class="small">No files uploaded yet.</div>`;
      return;
    }

    box.innerHTML = files
      .map(
        (file) => `
      <div class="file">
        <div>
    <strong>${file.original_name}</strong>

    <div class="small">
        ${(Number(file.file_size || 0) / 1024).toFixed(1)}
        KB · ${file.uploaded_at}
    </div>

    ${
      file.assigned_user_name
        ? `
        <div class="assigned-badge">
    🟢 Assigned to ${file.assigned_user_name}
    <br>
    <span class="assigned-email">
        ${file.assigned_user_email}
    </span>
</div>
        `
        : `
        <div class="local-badge">
            ⚪ Not Assigned
        </div>
        `
    }
</div>

        <div class="actions">
          <button class="btn download" onclick="downloadFile(${file.id})">Download</button>
          <button class="btn delete" onclick="deleteFile(${file.id})">Delete</button>
        </div>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    box.innerHTML = "Connection error.";
  }
}

async function uploadFiles() {
  const input = document.getElementById("fileInput");
  const status = document.getElementById("uploadStatus");

  if (!currentFolderId) {
    status.innerText = "Please select folder first.";
    return;
  }

  if (!input.files.length) {
    status.innerText = "Please choose files.";
    return;
  }

  const formData = new FormData();
  formData.append("folder_id", currentFolderId);
  const selectedUser = document.getElementById("selectedUser").value;

  if (selectedUser) {
    formData.append("user_id", selectedUser);
  }

  Array.from(input.files).forEach((file) => {
    formData.append("files[]", file);
  });

  status.innerText = "Uploading...";

  try {
    const res = await fetch("api/source-files.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + adminToken,
        "X-Sources-Token": sourcesToken,
      },
      body: formData,
    });

    const data = await res.json();
    status.innerText = data.message;

    if (data.success) {
      input.value = "";
      loadFiles();
    }
  } catch (error) {
    status.innerText = "Connection error.";
  }
}

function downloadFile(fileId) {
  window.location.href =
    "api/download-source-file.php?id=" +
    fileId +
    "&token=" +
    encodeURIComponent(adminToken);
}

// Names of the files on screen, so the delete dialog can say which one.
const fileNames = {};

async function deleteFile(fileId) {
  const ok = await askConfirm({
    title: "Delete file",
    text:
      (fileNames[fileId] ? `“${fileNames[fileId]}”` : "This file") +
      " will be deleted, and anyone it is assigned to will lose it. This cannot be undone.",
    action: "Delete file",
    word: "DELETE",
  });
  if (!ok) return;

  try {
    const res = await fetch("api/source-files.php?id=" + fileId, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + adminToken,
        "X-Sources-Token": sourcesToken,
      },
    });

    const data = await res.json();
    alert(data.message);

    if (data.success) {
      loadFiles();
    }
  } catch (error) {
    alert("Connection error.");
  }
}
async function loadUsers() {
  const select = document.getElementById("selectedUser");

  try {
    const res = await fetch("api/admin-users.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
        "X-Sources-Token": sourcesToken,
      },
    });

    const data = await res.json();

    if (!data.success) return;

    users = data.users || [];

    users.forEach((user) => {
      if (Number(user.approved) !== 1) return;

      select.innerHTML += `
        <option value="${user.id}">
          ${user.name} (${user.email})
        </option>
      `;
    });
  } catch (err) {
    console.log(err);
  }
}
/* ── The Files password ─────────────────────────────────────────
   A second password on top of the admin sign-in, chosen by this admin the
   first time they open the page and private to them. It is held in
   sessionStorage, so closing the tab means being asked again next visit.

   The overlay is not the protection. api/source-folders.php and
   api/source-files.php both require the unlock token this returns, so the
   files stay unreachable whatever the browser is showing. */

let sourcesToken = sessionStorage.getItem("sources_token") || "";

function lockEl(id) {
  return document.getElementById(id);
}

function showLock(mode, email) {
  // "set" on first run, "unlock" every time after.
  const first = mode === "set";

  lockEl("lockTitle").innerText = first
    ? "Choose a password"
    : "Enter your password";

  lockEl("lockIntro").innerText = first
    ? "Files is protected by its own password, separate from your admin login. Choose one now — you will be asked for it each time you open this page."
    : "This page has its own password, separate from your admin login.";

  lockEl("lockConfirmRow").style.display = first ? "block" : "none";
  lockEl("lockForgot").style.display = first ? "none" : "block";
  lockEl("lockSubmit").innerText = first
    ? "Set password and continue"
    : "Unlock";
  lockEl("lockForm").dataset.mode = first ? "set_password" : "unlock";

  if (email) lockEl("lockEmail").innerText = email;

  lockEl("lockShield").style.display = "flex";
  lockEl("lockPassword").focus();
}

function hideLock() {
  lockEl("lockShield").style.display = "none";
}

async function submitLock() {
  const status = lockEl("lockStatus");
  const mode = lockEl("lockForm").dataset.mode;
  const password = lockEl("lockPassword").value;
  const confirm = lockEl("lockConfirm").value;

  if (!password) {
    status.innerText = "Enter your password.";
    return;
  }

  status.innerText = "Please wait...";

  try {
    const res = await fetch("api/sources-lock.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ action: mode, password, confirm }),
    });

    const data = await res.json();

    if (!data.success) {
      status.innerText = data.message;
      return;
    }

    sourcesToken = data.token || "";
    sessionStorage.setItem("sources_token", sourcesToken);

    lockEl("lockPassword").value = "";
    lockEl("lockConfirm").value = "";
    status.innerText = "";

    hideLock();
    startPage();
  } catch (err) {
    status.innerText = "Connection error.";
  }
}

function startPage() {
  loadUsers();
  loadFolders();
}

async function initSourcesLock() {
  try {
    // The unlock token has to go with the question, or the answer is always
    // "locked" and the fast path below can never be taken.
    const res = await fetch("api/sources-lock.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
        "X-Sources-Token": sourcesToken,
      },
    });

    const data = await res.json();

    if (!data.success) {
      lockEl("lockStatus").innerText =
        data.message || "Could not check the password.";
      showLock("unlock");
      return;
    }

    // Already unlocked in this tab: straight in, no second prompt.
    if (data.unlocked && sourcesToken) {
      hideLock();
      startPage();
      return;
    }

    showLock(data.has_password ? "unlock" : "set", data.email);
  } catch (err) {
    lockEl("lockStatus").innerText = "Connection error.";
    showLock("unlock");
  }
}

/* A token can expire while the tab sits open. The endpoints answer 423 for
   that, so any call can hand control back to the password box. */
function handleLocked() {
  sourcesToken = "";
  sessionStorage.removeItem("sources_token");
  showLock("unlock");
}

initSourcesLock();

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

/* No unlock token in this tab means the box is certainly needed, so it goes up
       with the page rather than waiting on the check in initSourcesLock() - other-
       wise the Files page flashes up looking open for as long as that round trip
       takes. initSourcesLock() still decides which mode it ends up in, and hides
       it again if this tab turns out to be unlocked already. */
if (!sessionStorage.getItem("sources_token")) {
  document.getElementById("lockShield").style.display = "flex";
}
