document
  .querySelectorAll(".yr")
  .forEach((el) => (el.textContent = new Date().getFullYear()));

async function loginAdmin() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const status = document.getElementById("status");

  status.innerText = "Please wait...";

  try {
    const res = await fetch("api/admin-login.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      status.innerText = data.message;
      return;
    }

    localStorage.setItem("admin_token", data.token);
    localStorage.setItem("admin_user", JSON.stringify(data.admin));
    window.location.href = afterLogin("admin.html");
  } catch (error) {
    status.innerText = "Connection error";
  }
}

/* Where to go once signed in. Normally the admin home; when an AI
   assistant's connect flow sent the person here (oauth-consent.html), back
   to that approval page. Only that exact shape is honoured, so ?next= can
   never be used to bounce someone to another site. */
function afterLogin(fallback) {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^oauth-consent\.html\?request=[A-Za-z0-9_-]{43}$/.test(next)
    ? next
    : fallback;
}

function togglePassword() {
  const input = document.getElementById("password");

  if (input.type === "password") {
    input.type = "text";
  } else {
    input.type = "password";
  }
}

/* ── Local preview bypass ──────────────────────────────────────────────────
   Writes the session the admin pages look for and walks straight in. The
   button is only revealed on localhost, so a deployed copy never shows it;
   delete this block and the button above to drop it. */

function onLocalhost() {
  return ["localhost", "127.0.0.1", "::1", ""].includes(location.hostname);
}

function devBypass() {
  localStorage.setItem("admin_token", "preview");
  localStorage.setItem(
    "admin_user",
    JSON.stringify({ name: "Sarah Miller", role: "owner" }),
  );
  window.location.href = "admin-calendar.html";
}

if (onLocalhost()) {
  document.getElementById("devBypass").hidden = false;
}
