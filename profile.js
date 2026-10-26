let token = localStorage.getItem("portal_token");
if (!token) {
  window.location.href = "login.html";
}

const photoPreview = document.getElementById("photoPreview");
const imageInput = document.getElementById("profileImageInput");
const resetPhotoBtn = document.getElementById("resetPhotoBtn");
const status = document.getElementById("status");

// The saved image, so "Undo" can drop a pick that has not been saved yet.
let savedImage = "";
let savedInitial = "U";

function paintPhoto(el, image, name) {
  const letter = (name || "User").charAt(0).toUpperCase();
  if (image) {
    el.innerText = "";
    el.style.backgroundImage = `url('${image}')`;
  } else {
    el.innerText = letter;
    el.style.backgroundImage = "";
  }
}

function fill(user) {
  savedImage = user.profile_image || "";
  savedInitial = (user.name || "User").charAt(0).toUpperCase();

  document.getElementById("fName").value = user.name || "";
  document.getElementById("fEmail").value = user.email || "";
  document.getElementById("fPhone").value = user.phone || "";
  document.getElementById("fWhatsApp").value = user.whatsapp || "";
  document.getElementById("fCompany").value = user.company_name || "";
  document.getElementById("fWebsite").value = user.website || "";
  document.getElementById("fDescription").value = user.description || "";

  document.getElementById("sideName").innerText = user.name || "User";
  paintPhoto(document.getElementById("sideAvatar"), savedImage, user.name);
  paintPhoto(photoPreview, savedImage, user.name);
}

function setStatus(message, kind) {
  status.innerText = message;
  status.className = "status" + (kind ? " " + kind : "");
}

imageInput.addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  photoPreview.innerText = "";
  photoPreview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
  resetPhotoBtn.hidden = false;
});

function resetPhoto() {
  imageInput.value = "";
  resetPhotoBtn.hidden = true;
  paintPhoto(photoPreview, savedImage, savedInitial);
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

async function loadProfile() {
  // Show what we already have so the form is never blank while the request runs.
  try {
    fill(JSON.parse(localStorage.getItem("portal_user") || "{}"));
  } catch (e) {}

  try {
    const res = await fetch("api/check-auth.php", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem("portal_user", JSON.stringify(data.user));
      fill(data.user);
    }
  } catch (e) {
    setStatus(
      "Could not refresh your profile — showing the last saved copy.",
      "err",
    );
  }
}

document
  .getElementById("profileForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const saveBtn = document.getElementById("saveBtn");
    const name = document.getElementById("fName").value.trim();
    if (!name) {
      setStatus("Name is required", "err");
      return;
    }

    /* Same test api/update-profile.php applies, run first so a missing
         country code is pointed out without a round trip. Spacing is thrown
         away; "00" counts as the plus written the other way round. */
    const whatsappField = document.getElementById("fWhatsApp");
    const whatsapp = whatsappField.value.trim();
    const cleaned = whatsapp.replace(/[\s\-().]/g, "").replace(/^00/, "+");

    if (whatsapp && !/^\+[1-9][0-9]{7,14}$/.test(cleaned)) {
      setStatus(
        "Start your WhatsApp number with its country code, like +44 7911 123456",
        "err",
      );
      whatsappField.focus();
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", document.getElementById("fPhone").value.trim());
    formData.append("whatsapp", whatsapp);
    formData.append(
      "company_name",
      document.getElementById("fCompany").value.trim(),
    );
    formData.append(
      "website",
      document.getElementById("fWebsite").value.trim(),
    );
    formData.append(
      "description",
      document.getElementById("fDescription").value.trim(),
    );

    const file = imageInput.files[0];
    if (file) formData.append("profile_image", file);

    saveBtn.disabled = true;
    setStatus("Saving...");

    try {
      const res = await fetch("api/update-profile.php", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem("portal_user", JSON.stringify(data.user));
        imageInput.value = "";
        resetPhotoBtn.hidden = true;
        fill(data.user);
        setStatus(data.message, "ok");
      } else {
        setStatus(data.message || "Could not save your changes", "err");
      }
    } catch (error) {
      setStatus("Connection error", "err");
    } finally {
      saveBtn.disabled = false;
    }
  });

loadProfile();
