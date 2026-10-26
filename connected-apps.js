function realToken(key) {
  const t = localStorage.getItem(key);
  return t && t !== "preview" ? t : null;
}
const staffToken = realToken("admin_token");
const clientToken = realToken("portal_token");
const token = staffToken || clientToken;
const staffUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!token) {
  window.location.href = "login.html";
}

document.getElementById("backLink").href = staffToken
  ? "admin.html"
  : "dashboard.html";

function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function when(v) {
  if (!v) return "never";
  const d = new Date(String(v).replace(" ", "T"));
  return isNaN(d) ? v : d.toLocaleString();
}

async function call(url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = staffToken ? "admin-login.html" : "login.html";
    throw new Error("signed out");
  }
  return res.json();
}

async function loadApps() {
  const status = document.getElementById("appsStatus");
  try {
    const data = await call("api/oauth/grants.php");
    const list = document.getElementById("apps");
    list.innerHTML = (data.grants || [])
      .map(
        (g) => `
      <div class="app">
        <div>
          <b>${esc(g.client_name)}</b>
          <div class="meta">Connected ${esc(when(g.created_at))} &middot; last used ${esc(when(g.last_used_at))}</div>
        </div>
        <button class="danger" data-id="${g.id}" data-name="${esc(g.client_name)}">Disconnect</button>
        <ul class="scopes">${g.scopes.map((s) => `<li title="${esc(s.scope)}">${esc(s.description)}</li>`).join("")}</ul>
      </div>`,
      )
      .join("");
    document.getElementById("noApps").hidden = (data.grants || []).length > 0;
    list
      .querySelectorAll("button[data-id]")
      .forEach(
        (b) => (b.onclick = () => disconnect(b.dataset.id, b.dataset.name)),
      );
  } catch (e) {
    status.className = "status error";
    status.textContent = "Couldn't load your connected apps.";
  }
}

async function disconnect(id, name) {
  if (!confirm(`Disconnect ${name}? It will lose access to your account.`))
    return;
  const status = document.getElementById("appsStatus");
  status.className = "status";
  status.textContent = "Disconnecting...";
  try {
    const data = await call("api/oauth/grants.php", {
      action: "revoke",
      id: Number(id),
    });
    status.className = data.success ? "status" : "status error";
    status.textContent = data.message;
    loadApps();
  } catch (e) {
    status.className = "status error";
    status.textContent = "Connection error - please try again.";
  }
}

async function loadOwner() {
  if (!staffToken || staffUser.role !== "owner") return;
  let data;
  try {
    data = await call("api/oauth/admin.php");
  } catch (e) {
    return;
  }
  if (!data.success) return;

  document.getElementById("ownerControls").hidden = false;
  document.getElementById("activityCard").hidden = false;

  const box = document.getElementById("clientsEnabled");
  box.checked = !!data.clients_enabled;
  box.onchange = async () => {
    const status = document.getElementById("ownerStatus");
    if (
      !box.checked &&
      !confirm(
        "Turn client access off? Every AI assistant a client has connected will be disconnected.",
      )
    ) {
      box.checked = true;
      return;
    }
    status.className = "status";
    status.textContent = "Saving...";
    try {
      const res = await call("api/oauth/admin.php", {
        clients_enabled: box.checked,
      });
      status.className = res.success ? "status" : "status error";
      status.textContent = res.message;
      if (!res.success) box.checked = !box.checked;
    } catch (e) {
      status.className = "status error";
      status.textContent = "Connection error - please try again.";
      box.checked = !box.checked;
    }
  };

  const rows = data.activity || [];
  document.getElementById("activity").innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${esc(when(r.at))}</td>
      <td>${esc(r.person)}${r.kind === "user" ? ' <span class="meta">(client)</span>' : ""}</td>
      <td>${esc(r.app)}</td>
      <td>${esc(r.tool || r.endpoint)}</td>
      <td class="${r.status < 400 ? "ok" : "bad"}">${r.status < 400 ? "OK" : "Refused (" + r.status + ")"}</td>
    </tr>`,
    )
    .join("");
  document.getElementById("noActivity").hidden = rows.length > 0;
}

loadApps();
loadOwner();
