// The token from the emailed link is the only credential here - this page is
// reached without being signed in.
const resetToken = new URLSearchParams(location.search).get("token") || "";

const statusEl = document.getElementById("status");

if (!resetToken) {
  document.getElementById("form").style.display = "none";
  statusEl.innerText =
    "This link is missing its token. Request a new one from Settings.";
}

async function submitReset() {
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const button = document.getElementById("submitBtn");

  statusEl.className = "status";

  if (password.length < 8) {
    statusEl.innerText = "Password must be at least 8 characters.";
    return;
  }

  if (password !== confirm) {
    statusEl.innerText = "The two passwords do not match.";
    return;
  }

  button.disabled = true;
  statusEl.innerText = "Saving...";

  try {
    const res = await fetch("api/sources-lock.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reset",
        token: resetToken,
        password,
        confirm,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      statusEl.innerText = data.message;
      button.disabled = false;
      return;
    }

    // The old unlock token is dead server-side; drop the local copy too so
    // the page asks for the new password rather than failing on the first call.
    sessionStorage.removeItem("sources_token");

    document.getElementById("form").style.display = "none";
    statusEl.className = "status ok";
    statusEl.innerText = data.message + " Taking you there...";

    setTimeout(() => {
      location.href = "sources-files.html";
    }, 1600);
  } catch (err) {
    statusEl.innerText = "Connection error.";
    button.disabled = false;
  }
}
