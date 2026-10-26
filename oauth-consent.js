const requestId = new URLSearchParams(location.search).get("request") || "";
const here = "oauth-consent.html?request=" + encodeURIComponent(requestId);
const statusEl = document.getElementById("status");

function show(id) {
  ["signIn", "consent", "message"].forEach(
    (s) => (document.getElementById(s).hidden = s !== id),
  );
}

function message(title, text) {
  document.getElementById("messageTitle").textContent = title;
  document.getElementById("messageText").textContent = text;
  show("message");
}

// "preview" is the localhost demo login - never a real session.
function realToken(key) {
  const t = localStorage.getItem(key);
  return t && t !== "preview" ? t : null;
}

const staffToken = realToken("admin_token");
const clientToken = realToken("portal_token");
const token = staffToken || clientToken;

document.getElementById("staffLogin").href =
  "admin-login.html?next=" + encodeURIComponent(here);
document.getElementById("clientLogin").href =
  "login.html?next=" + encodeURIComponent(here);

async function api(method, body) {
  const res = await fetch(
    "api/oauth/consent.php" +
      (method === "GET" ? "?request=" + encodeURIComponent(requestId) : ""),
    {
      method,
      headers: {
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function decide(decision) {
  document.getElementById("allowBtn").disabled = true;
  document.getElementById("denyBtn").disabled = true;
  statusEl.classList.remove("error");
  statusEl.textContent =
    decision === "approve" ? "Connecting..." : "Cancelling...";

  try {
    const { data } = await api("POST", { request: requestId, decision });
    if (data.success && data.redirect) {
      window.location.replace(data.redirect);
      return;
    }
    message(
      "Couldn't finish",
      data.message || "Please start connecting again from your AI assistant.",
    );
    statusEl.textContent = "";
  } catch (e) {
    statusEl.classList.add("error");
    statusEl.textContent = "Connection error - please try again.";
    document.getElementById("allowBtn").disabled = false;
    document.getElementById("denyBtn").disabled = false;
  }
}

async function load() {
  if (!/^[A-Za-z0-9_-]{43}$/.test(requestId)) {
    message(
      "This link isn't valid",
      "Start connecting again from your AI assistant.",
    );
    return;
  }
  if (!token) {
    show("signIn");
    return;
  }

  statusEl.textContent = "Loading...";
  let result;
  try {
    result = await api("GET");
  } catch (e) {
    statusEl.classList.add("error");
    statusEl.textContent = "Connection error - please reload.";
    return;
  }
  statusEl.textContent = "";

  const { status, data } = result;
  if (status === 401) {
    // The stored session is stale - sign in again and come straight back.
    show("signIn");
    return;
  }
  if (!data.success) {
    message(
      "This request has ended",
      data.message || "Start connecting again from your AI assistant.",
    );
    return;
  }

  document.getElementById("appName").textContent = data.client_name;
  document.getElementById("whoName").textContent =
    data.principal.name || data.principal.email;
  document.getElementById("whoRole").textContent =
    (data.principal.kind === "admin"
      ? "Staff - " + data.principal.role.replace(/_/g, " ")
      : "Client") + (data.principal.email ? " - " + data.principal.email : "");
  document.getElementById("redirectHost").textContent = data.redirect_host;
  // Switching means signing this session out first - login.html sends anyone
  // who still has a token straight back, which would land on the same person.
  const switchLink = document.getElementById("switchAccount");
  switchLink.href = "#";
  switchLink.onclick = (e) => {
    e.preventDefault();
    const key = data.principal.kind === "admin" ? "admin" : "portal";
    localStorage.removeItem(key + "_token");
    localStorage.removeItem(key + "_user");
    location.reload();
  };

  const list = document.getElementById("scopeList");
  list.innerHTML = "";
  data.scopes.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.description;
    li.title = s.scope;
    list.appendChild(li);
  });
  document.getElementById("scopeBlock").hidden = !data.scopes.length;

  const allow = document.getElementById("allowBtn");
  if (!data.can_approve) {
    const reason = document.getElementById("reason");
    reason.textContent = data.reason;
    reason.hidden = false;
    allow.hidden = true;
  }

  allow.onclick = () => decide("approve");
  document.getElementById("denyBtn").onclick = () => decide("deny");
  show("consent");
}

load();
