/* ── Auth Guard ── */
let token = localStorage.getItem("portal_token");
if (!token) {
  window.location.href = "login.html";
}

/* ── Load User Info ── */
(function loadUser() {
  const user = JSON.parse(localStorage.getItem("portal_user") || "{}");
  const name = user.name || "User";

  document.getElementById("sideName").innerText = name;
  setAvatarImage(user);
})();

function setAvatarImage(user) {
  const image = user.profile_image;
  const name = user.name || "User";
  const letter = name.charAt(0).toUpperCase();

  const avatars = [document.getElementById("sideAvatar")];

  avatars.forEach((avatar) => {
    if (!avatar) return;
    if (image) {
      avatar.innerText = "";
      avatar.style.backgroundImage = `url('${image}')`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    } else {
      avatar.innerText = letter;
      avatar.style.backgroundImage = "";
    }
  });
}

/* ── FAQ Accordion ── */
function toggleFaq(id) {
  const item = document.getElementById(id);
  item.classList.toggle("open");
}

/* ── Settings Modal ── */

/* ── Logout ── */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}
