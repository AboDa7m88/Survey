document
  .querySelectorAll(".yr")
  .forEach((el) => (el.textContent = new Date().getFullYear()));

const form = document.getElementById("resetForm");
const sendBtn = document.getElementById("sendBtn");
const status = document.getElementById("status");

function setStatus(message, kind) {
  status.innerText = message;
  status.className = "status" + (kind ? " " + kind : "");
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  if (!email) {
    setStatus("Email is required", "err");
    return;
  }

  sendBtn.disabled = true;
  setStatus("Sending...");

  try {
    const res = await fetch("api/forgot-password.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setStatus(data.message, data.success ? "ok" : "err");
  } catch (error) {
    setStatus("Connection error", "err");
  } finally {
    sendBtn.disabled = false;
  }
});
