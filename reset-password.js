document
  .querySelectorAll(".yr")
  .forEach((el) => (el.textContent = new Date().getFullYear()));

const token = new URLSearchParams(location.search).get("token");
const form = document.getElementById("resetForm");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");

function setStatus(message, kind) {
  status.innerText = message;
  status.className = "status" + (kind ? " " + kind : "");
}

function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

// Without a token the form can only ever fail, so say so up front.
if (!token) {
  form.style.display = "none";
  document.getElementById("lede").innerText =
    "This reset link is missing its token. Request a new link to continue.";
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;

  if (password.length < 8) {
    setStatus("Password must be at least 8 characters", "err");
    return;
  }

  if (password !== confirm) {
    setStatus("Passwords do not match", "err");
    return;
  }

  saveBtn.disabled = true;
  setStatus("Saving...");

  try {
    const res = await fetch("api/reset-password.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, password }),
    });

    const data = await res.json();

    if (!data.success) {
      setStatus(data.message, "err");
      saveBtn.disabled = false;
      return;
    }

    // Leave the button disabled: the redirect follows.
    setStatus(data.message + " Redirecting to login...", "ok");
    setTimeout(function () {
      window.location.href =
        data.type === "admin" ? "admin-login.html" : "login.html";
    }, 1500);
  } catch (error) {
    setStatus("Connection error", "err");
    saveBtn.disabled = false;
  }
});
