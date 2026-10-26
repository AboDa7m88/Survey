// ✅ تعريفات مرة واحدة بس
let adminToken = localStorage.getItem("admin_token");
let adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

// ✅ حماية الصفحة
if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Clients Management is open to every admin, so the sidebar no longer hides it.
// Add Admin, Distribute Admins and Available Admins are all owner-only.
if (adminUser.role === "owner") {
  const addAdmin = document.getElementById("addAdminSection");
  const distributeAdmins = document.getElementById("distributeAdminsSection");
  const availableAdmins = document.getElementById("availableAdminsSection");

  if (addAdmin) addAdmin.style.display = "block";
  if (distributeAdmins) distributeAdmins.style.display = "block";
  if (availableAdmins) availableAdmins.style.display = "block";

  loadAdmins();
  loadDistribution();
} else {
  const addAdmin = document.getElementById("addAdminSection");
  const distributeAdmins = document.getElementById("distributeAdminsSection");
  const availableAdmins = document.getElementById("availableAdminsSection");

  if (addAdmin) addAdmin.style.display = "none";
  if (distributeAdmins) distributeAdmins.style.display = "none";
  if (availableAdmins) availableAdmins.style.display = "none";
}

// Website Logo and Login Page Slideshow are owner-only settings.
if (adminUser.role === "owner") {
  const logoSection = document.getElementById("logoSection");
  const slideshowSection = document.getElementById("slideshowSection");

  if (logoSection) logoSection.style.display = "block";
  if (slideshowSection) slideshowSection.style.display = "block";

  paintCurrentLogo();
  loadWebsiteUrl();
  loadSlides();
}

/* ── The website address ──────────────────────────────────────────────────
   Read back exactly as it was typed, so editing it starts from what is
   saved rather than from a normalised version of it. api/settings.php is
   what adds the scheme for the pages that follow the link. */
async function loadWebsiteUrl() {
  const field = document.getElementById("websiteUrl");
  if (!field) return;

  try {
    const res = await fetch("api/settings.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (data.success) field.value = data.websiteUrl || "";
  } catch (error) {
    // Leave the field empty: saving still works, it just does not start
    // from the stored value.
  }
}

async function saveWebsiteUrl() {
  const field = document.getElementById("websiteUrl");
  const status = document.getElementById("websiteStatus");

  status.className = "status";
  status.innerText = "Saving...";

  try {
    const res = await fetch("api/settings.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        action: "save_website",
        website_url: field.value.trim(),
      }),
    });

    const data = await res.json();

    status.className = data.success ? "status" : "status error";
    status.innerText =
      data.message || (data.success ? "Saved." : "Could not save.");
  } catch (error) {
    status.className = "status error";
    status.innerText = "Connection error. Please try again.";
  }
}

/* Cache-busts the preview of the logo in use. The onerror is reinstalled on
   every paint because the handler clears itself once it has swapped in the
   fallback - without that, the first upload after a miss would leave the
   placeholder showing instead of the new logo. */
function paintCurrentLogo() {
  const img = document.getElementById("currentLogo");
  if (!img) return;

  // No logo uploaded yet: show nothing rather than another company's.
  img.onerror = function () {
    this.hidden = true;
  };

  img.hidden = false;
  img.src = "logo.png?" + Date.now();
}

// ✅ تسجيل الخروج
function logoutAdmin() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  location.href = "admin-login.html";
}

// ✅ تغيير الباسورد
/* ── Files: reset by email ──────────────────────────────────────
   For the admin who cannot type the current password. There is no address
   field on purpose: the link goes to the one on their own admin row, so
   someone at a borrowed screen can send the mail but not receive it. */

async function sendSourcesReset() {
  const status = document.getElementById("sourcesResetStatus");

  status.innerText = "Sending...";

  try {
    const res = await fetch("api/sources-lock.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ action: "forgot" }),
    });

    const data = await res.json();
    status.innerText = data.message;
  } catch (err) {
    status.innerText = "Connection error.";
  }
}

/* Shows the admin which address the link would go to. */
(async function showSourcesEmail() {
  try {
    const res = await fetch("api/sources-lock.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (data.success && data.email) {
      document.getElementById("sourcesEmail").innerText = data.email;
    }
  } catch (err) {}
})();

/* ── The logo upload box ──────────────────────────────────────────────────
   Same control as the slideshow dropzone below: click or drop, then a
   preview replaces the box. Dragging never touches the file input, so the
   chosen file is held here rather than read back off <input type="file">. */

const MAX_LOGO_MEDIA = 3 * 1024 * 1024;
const LOGO_EXTENSIONS = ["png", "jpg", "jpeg", "svg"];

let pendingLogoFile = null;

const logoDropzone = document.getElementById("logoDropzone");

if (logoDropzone) {
  document.getElementById("logoFile").addEventListener("change", (event) => {
    if (event.target.files[0]) handleLogoMedia(event.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((type) => {
    logoDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      logoDropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    logoDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      logoDropzone.classList.remove("dragging");
    });
  });

  logoDropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) handleLogoMedia(file);
  });
}

function handleLogoMedia(file) {
  const error = document.getElementById("logoMediaError");

  const fail = (message) => {
    error.innerText = message;
    error.classList.add("show");
  };

  // Matches the extension list in api/upload-logo.php.
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (!LOGO_EXTENSIONS.includes(ext)) {
    fail("Only PNG, JPG, JPEG or SVG logos are allowed.");
    return;
  }

  if (file.size > MAX_LOGO_MEDIA) {
    fail("That logo is over 3 MB. Pick a smaller one.");
    return;
  }

  const reader = new FileReader();

  reader.onerror = () => fail("That logo could not be read.");

  reader.onload = () => {
    error.classList.remove("show");
    pendingLogoFile = file;

    document.getElementById("logoThumb").style.backgroundImage =
      `url('${reader.result}')`;
    document.getElementById("logoPreview").classList.add("show");
    logoDropzone.style.display = "none";
  };

  reader.readAsDataURL(file);
}

function clearLogoMedia() {
  pendingLogoFile = null;

  document.getElementById("logoFile").value = "";
  document.getElementById("logoThumb").style.backgroundImage = "";
  document.getElementById("logoPreview").classList.remove("show");
  document.getElementById("logoMediaError").classList.remove("show");
  logoDropzone.style.display = "";
}

// ✅ رفع اللوجو
async function uploadLogo() {
  const status = document.getElementById("logoStatus");
  const file = pendingLogoFile;

  if (!file) {
    alert("Please select a logo file first.");
    return;
  }

  status.innerText = "Uploading...";

  const form = new FormData();
  form.append("logo", file);

  try {
    const res = await fetch("api/upload-logo.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + adminToken,
      },
      body: form,
    });

    const data = await res.json();
    status.innerText = data.message;

    if (data.success) {
      paintCurrentLogo();

      const bust = "logo.png?" + new Date().getTime();
      document.querySelectorAll(".side-logo img").forEach((img) => {
        img.src = bust;
      });
      clearLogoMedia();
    }
  } catch (err) {
    status.innerText = "An error occurred while uploading.";
  }
}

/* ── Login Page Slideshow ─────────────────────────────────────────────────
   Rows are the slides in display order. The five-slide cap is enforced by
   the server; disabling the button here is only so nobody uploads a file
   that is going to be refused. */

let allSlides = [];
const MAX_SLIDES = 5;
const MAX_SLIDE_MEDIA = 3 * 1024 * 1024;

// Kept in step with LOGIN_SLIDE_MIN_WIDTH/HEIGHT in api/db.php, which is what
// uploadSlideImage() enforces. Portrait, to match the column the slide fills.
const MIN_SLIDE_WIDTH = 600;
const MIN_SLIDE_HEIGHT = 800;

// Only guidance - nothing rejects an image for being under these. Portrait,
// because the login slideshow is a full-height half-width column and a 16:9
// image gets centre-cropped down to roughly half its width to cover it.
const REC_SLIDE_WIDTH = 1200;
const REC_SLIDE_HEIGHT = 1600;

async function loadSlides() {
  const list = document.getElementById("slidesList");

  if (!list) return;

  try {
    const res = await fetch("api/admin-login-slides.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      allSlides = [];
      list.innerHTML = `
                <div class="no-admins">
                    ${escapeHtml(data.message || "Failed to load slides.")}
                </div>
            `;
      updateSlideControls();
      return;
    }

    allSlides = data.slides || [];
    renderSlidesList();
  } catch (err) {
    console.error("Load slides error:", err);

    allSlides = [];
    list.innerHTML = `
            <div class="no-admins">
                Network or server error.
            </div>
        `;
    updateSlideControls();
  }
}

function renderSlidesList() {
  const list = document.getElementById("slidesList");

  if (!list) return;

  if (!allSlides.length) {
    list.innerHTML = `
            <div class="no-admins">
                No slides yet. The login page shows the centred sign-in form.
            </div>
        `;
  } else {
    list.innerHTML = allSlides
      .map(
        (slide, index) => `
            <div class="admin-row" id="slide-row-${slide.id}">

                <div class="slide-thumb-wrap">
                    <img class="slide-thumb" src="${escapeHtml(slide.image_path)}" alt="">

                    <button type="button" class="slide-change"
                            title="Change image" aria-label="Change image"
                            onclick="document.getElementById('slide-file-${slide.id}').click()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                    </button>

                    <input type="file" id="slide-file-${slide.id}" hidden
                           accept="image/jpeg,image/png,image/webp,image/gif"
                           onchange="replaceSlideImage(${slide.id}, this)">
                </div>

                <div class="admin-info" style="flex:1;">
                    <input type="text" id="slide-title-${slide.id}" maxlength="120"
                           placeholder="Title"
                           value="${escapeHtml(slide.title || "")}"
                           style="margin-bottom:8px;">
                    <input type="text" id="slide-subtitle-${slide.id}" maxlength="255"
                           placeholder="Subtitle"
                           value="${escapeHtml(slide.subtitle || "")}"
                           style="margin-bottom:0;">
                </div>

                <div class="slide-actions">
                    <button type="button" class="slide-move" title="Move up" aria-label="Move up"
                            onclick="moveSlide(${index}, -1)" ${index === 0 ? "disabled" : ""}>↑</button>

                    <button type="button" class="slide-move" title="Move down" aria-label="Move down"
                            onclick="moveSlide(${index}, 1)" ${index === allSlides.length - 1 ? "disabled" : ""}>↓</button>

                    <button type="button" class="slide-move slide-save"
                            onclick="saveSlideText(${slide.id})">Save text</button>

                    <button type="button" class="remove-admin-btn"
                            onclick="deleteSlide(${slide.id})">Remove</button>
                </div>

            </div>
        `,
      )
      .join("");
  }

  updateSlideControls();
}

function updateSlideControls() {
  const hint = document.getElementById("slideHint");
  const file = document.getElementById("slideFile");
  const dropzone = document.getElementById("slideDropzone");
  const addBtn = document.getElementById("addSlideBtn");
  const openBtn = document.getElementById("openAddSlideBtn");
  const count = document.getElementById("slideCount");

  const full = allSlides.length >= MAX_SLIDES;

  if (file) file.disabled = full;
  if (addBtn) addBtn.disabled = full;

  // The dialog is the only way in now, so the cap has to be visible on the
  // button that opens it - not just on the controls inside.
  if (openBtn) openBtn.disabled = full;

  // The input is hidden now, so disabling it alone would still leave the
  // dropzone looking clickable.
  if (dropzone) dropzone.classList.toggle("is-disabled", full);

  if (count) {
    count.innerText = full
      ? `Maximum of ${MAX_SLIDES} slides reached. Remove one to add another.`
      : `${allSlides.length} of ${MAX_SLIDES} slides.`;
  }

  if (hint) {
    hint.innerText = full
      ? `Maximum of ${MAX_SLIDES} slides reached. Remove one to add another.`
      : "JPG, PNG, WEBP or GIF. Max 3 MB. The login panel is a tall " +
        "half-screen column, so portrait images fill it best — " +
        `${REC_SLIDE_WIDTH} × ${REC_SLIDE_HEIGHT} px recommended, ` +
        `${MIN_SLIDE_WIDTH} × ${MIN_SLIDE_HEIGHT} px minimum.`;
  }
}

/* ── Opening and closing the Add dialog ────────────────────────────────────
   Every field in it belongs to one upload, so it opens empty rather than
   holding whatever was typed and abandoned last time. */

function openAddSlide() {
  if (allSlides.length >= MAX_SLIDES) return;

  clearSlideMedia();
  document.getElementById("slideTitle").value = "";
  document.getElementById("slideSubtitle").value = "";
  document.getElementById("slideAddStatus").innerText = "";

  document.getElementById("slideModal").classList.add("show");
  document.getElementById("slideDropzone").focus();
}

function closeAddSlide() {
  document.getElementById("slideModal").classList.remove("show");
}

// Escape closes it, the same as the × in the header.
document.addEventListener("keydown", function (event) {
  if (event.key !== "Escape") return;

  const modal = document.getElementById("slideModal");
  if (modal && modal.classList.contains("show")) closeAddSlide();
});

/* ── The Add-a-slide dropzone ─────────────────────────────────────────────
   Same control as the Media Assets box on admin-content-form.html: a click
   or drop target that swaps itself for a preview once a file is picked.
   Dragging never touches the file input, so the chosen file is held here
   rather than read back off <input type="file"> at upload time. */

let pendingSlideFile = null;

const slideDropzone = document.getElementById("slideDropzone");

if (slideDropzone) {
  document.getElementById("slideFile").addEventListener("change", (event) => {
    if (event.target.files[0]) handleSlideMedia(event.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((type) => {
    slideDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      slideDropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    slideDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      slideDropzone.classList.remove("dragging");
    });
  });

  slideDropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) handleSlideMedia(file);
  });
}

/* Reads the file once and hands back both the data URL for the preview and
   the decoded size, so the dimension check does not cost a second read. */
function readSlideImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("unreadable"));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error("undecodable"));
      image.onload = () =>
        resolve({
          url: reader.result,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

async function handleSlideMedia(file) {
  const error = document.getElementById("slideMediaError");

  const fail = (message) => {
    error.innerText = message;
    error.classList.add("show");
  };

  if (!file.type.startsWith("image/")) {
    fail("Only image files are allowed.");
    return;
  }

  if (file.size > MAX_SLIDE_MEDIA) {
    fail("That image is over 3 MB. Pick a smaller one.");
    return;
  }

  let image;

  try {
    image = await readSlideImage(file);
  } catch (err) {
    fail("That image could not be read.");
    return;
  }

  // The slideshow fills half a desktop screen, so anything small is going
  // to be stretched. The server enforces the same floor.
  if (image.width < MIN_SLIDE_WIDTH || image.height < MIN_SLIDE_HEIGHT) {
    fail(
      `That image is ${image.width} × ${image.height} px. ` +
        `The minimum is ${MIN_SLIDE_WIDTH} × ${MIN_SLIDE_HEIGHT} px.`,
    );
    return;
  }

  error.classList.remove("show");
  pendingSlideFile = file;

  document.getElementById("slideThumb").style.backgroundImage =
    `url('${image.url}')`;
  document.getElementById("slidePreview").classList.add("show");
  slideDropzone.style.display = "none";
}

function clearSlideMedia() {
  pendingSlideFile = null;

  document.getElementById("slideFile").value = "";
  document.getElementById("slideThumb").style.backgroundImage = "";
  document.getElementById("slidePreview").classList.remove("show");
  document.getElementById("slideMediaError").classList.remove("show");
  slideDropzone.style.display = "";
}

/* ── Change the image on a slide already saved ─────────────────────────────
   The pencil over a thumbnail. Only the file changes - title, subtitle and
   position stay exactly where they were. */

async function replaceSlideImage(id, input) {
  const file = input.files[0];

  if (!file) return;

  const status = document.getElementById("slideStatus");

  // Clearing it now means picking the same file twice in a row still fires
  // a change event, and a failed swap leaves nothing stale behind.
  input.value = "";

  if (file.size > MAX_SLIDE_MEDIA) {
    status.innerText = "That image is over 3 MB. Pick a smaller one.";
    return;
  }

  // Same floor as the Add box above, so a swap cannot slip a small image
  // past the check the new-slide path applies.
  try {
    const image = await readSlideImage(file);

    if (image.width < MIN_SLIDE_WIDTH || image.height < MIN_SLIDE_HEIGHT) {
      status.innerText =
        `That image is ${image.width} × ${image.height} px. ` +
        `The minimum is ${MIN_SLIDE_WIDTH} × ${MIN_SLIDE_HEIGHT} px.`;
      return;
    }
  } catch (err) {
    status.innerText = "That image could not be read.";
    return;
  }

  status.innerText = "Replacing image...";

  const form = new FormData();
  form.append("action", "replace");
  form.append("id", id);
  form.append("slide", file);

  try {
    const res = await fetch("api/admin-login-slides.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + adminToken,
      },
      body: form,
    });

    const data = await res.json();
    status.innerText = data.message;

    await loadSlides();
  } catch (err) {
    status.innerText = "Network or server error.";
  }
}

async function uploadSlide() {
  /* Two status lines now. Progress and anything that went wrong belong in
       the dialog, where the fields that caused it still are; the result of a
       finished upload belongs in the panel, because the dialog closes. */
  const status = document.getElementById("slideAddStatus");
  const panelStatus = document.getElementById("slideStatus");
  const addBtn = document.getElementById("addSlideBtn");

  // Held by handleSlideMedia() - a dropped file never reaches the input.
  const file = pendingSlideFile;

  if (!file) {
    status.innerText = "Choose an image first.";
    return;
  }

  status.innerText = "Uploading...";
  if (addBtn) addBtn.disabled = true;

  const form = new FormData();
  form.append("slide", file);
  form.append("title", document.getElementById("slideTitle").value);
  form.append("subtitle", document.getElementById("slideSubtitle").value);

  try {
    const res = await fetch("api/admin-login-slides.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + adminToken,
      },
      body: form,
    });

    const data = await res.json();

    if (data.success) {
      clearSlideMedia();
      document.getElementById("slideTitle").value = "";
      document.getElementById("slideSubtitle").value = "";

      closeAddSlide();
      panelStatus.innerText = data.message;
    } else {
      status.innerText = data.message;
    }

    // Re-enables or re-disables the buttons off the new count, so a failed
    // upload leaves Add usable and a fifth slide leaves it disabled.
    await loadSlides();
  } catch (err) {
    status.innerText = "An error occurred while uploading.";
    if (addBtn) addBtn.disabled = false;
  }
}

async function saveSlideText(id) {
  const status = document.getElementById("slideStatus");

  status.innerText = "Saving...";

  try {
    const res = await fetch("api/admin-login-slides.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        action: "update",
        id: id,
        title: document.getElementById("slide-title-" + id).value,
        subtitle: document.getElementById("slide-subtitle-" + id).value,
      }),
    });

    const data = await res.json();
    status.innerText = data.message;

    if (data.success) {
      const slide = allSlides.find((item) => item.id === id);

      if (slide) {
        slide.title = document.getElementById("slide-title-" + id).value.trim();
        slide.subtitle = document
          .getElementById("slide-subtitle-" + id)
          .value.trim();
      }
    } else {
      loadSlides();
    }
  } catch (err) {
    status.innerText = "Network or server error.";
  }
}

async function deleteSlide(id) {
  const ok = await askConfirm({
    title: "Remove slide",
    text: "This slide will be removed from the login page.",
    action: "Remove slide",
    word: "DELETE",
  });
  if (!ok) return;

  const status = document.getElementById("slideStatus");

  status.innerText = "Removing...";

  try {
    const res = await fetch("api/admin-login-slides.php?id=" + id, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();
    status.innerText = data.message;

    await loadSlides();
  } catch (err) {
    status.innerText = "Network or server error.";
  }
}

function moveSlide(index, delta) {
  const target = index + delta;

  if (target < 0 || target >= allSlides.length) return;

  // Swap and repaint first - the arrows should feel instant - then persist.
  const moved = allSlides[index];
  allSlides[index] = allSlides[target];
  allSlides[target] = moved;

  renderSlidesList();
  saveSlideOrder();
}

async function saveSlideOrder() {
  const status = document.getElementById("slideStatus");
  const buttons = document.querySelectorAll("#slidesList .slide-move");

  buttons.forEach((button) => (button.disabled = true));
  status.innerText = "Saving order...";

  try {
    const res = await fetch("api/admin-login-slides.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        action: "reorder",
        order: allSlides.map((slide) => slide.id),
      }),
    });

    const data = await res.json();
    status.innerText = data.message;

    if (!data.success) {
      // Another tab changed the list. Take the server's version.
      alert(data.message || "Could not save the slide order.");
      await loadSlides();
      return;
    }

    renderSlidesList();
  } catch (err) {
    status.innerText = "Network or server error.";
    alert("Could not save the slide order.");
    await loadSlides();
  }
}

async function addUser() {
  try {
    const res = await fetch("api/add-user.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        role: document.getElementById("role").value,
      }),
    });

    // 👇 مهم جدا
    const text = await res.text();
    console.log("RAW RESPONSE:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      alert("Email already exists, try another one ❌");
      return;
    }

    alert(data.message || "Done");
  } catch (err) {
    console.error(err);
    alert("Network or server error ❌");
  }
}
let allAdmins = [];

// Eight rows to a page; the rest live behind the pager under the list.
const ADMINS_PAGE_SIZE = 8;
let adminsPage = 1;

function hideAdminsPager() {
  const pager = document.getElementById("adminsPager");
  if (pager) pager.hidden = true;
}

async function loadAdmins() {
  const list = document.getElementById("adminsList");

  if (!list) return;

  list.innerHTML = `
        <div class="no-admins">
            Loading admins...
        </div>
    `;

  try {
    const res = await fetch("api/get-admins.php", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      allAdmins = [];
      hideAdminsPager();

      list.innerHTML = `
                <div class="no-admins">
                    ${escapeHtml(data.message || "Failed to load admins.")}
                </div>
            `;
      return;
    }

    allAdmins = data.admins || [];

    // Keep the page we were on - removing an admin should not send us back
    // to page 1. renderAdmins() clamps it if the page no longer exists.
    renderAdmins();
  } catch (err) {
    console.error("Load admins error:", err);

    allAdmins = [];
    hideAdminsPager();

    list.innerHTML = `
            <div class="no-admins">
                Network or server error.
            </div>
        `;
  }
}

/* The role cell.

   For the owner it is a dropdown - promoting and demoting between Admin,
   Super Admin and Account Manager happens here, and api/admin-role.php writes
   it to the admins table, which is what every other page and endpoint reads.
   For anyone else, and for the owner's own row, it stays a plain label. */

const ASSIGNABLE_ROLES = ["seo_admin", "super_admin", "account_manager"];

function adminRoleControl(admin) {
  const isOwnerRow = admin.role === "owner";
  const canEdit = adminUser.role === "owner" && !isOwnerRow;

  if (!canEdit) {
    return `<span class="admin-role">${adminRoleLabel(admin.role)}</span>`;
  }

  return `
        <select class="admin-role-select" data-current="${escapeHtml(admin.role)}"
                onchange="changeAdminRole(${admin.id}, this)">
            ${ASSIGNABLE_ROLES.map(
              (role) => `
                <option value="${role}" ${role === admin.role ? "selected" : ""}>
                    ${adminRoleLabel(role)}
                </option>
            `,
            ).join("")}
        </select>
    `;
}

async function changeAdminRole(adminId, select) {
  const newRole = select.value;
  const previous = select.dataset.current;

  if (newRole === previous) return;

  const label = adminRoleLabel(newRole);

  const ok = await askConfirm({
    title: "Change role",
    text: `This person becomes ${label}. They will be signed out and pick up the new role next time they log in.`,
    action: "Change role",
    icon: "warn",
  });

  if (!ok) {
    select.value = previous;
    return;
  }

  select.disabled = true;

  try {
    const res = await fetch("api/admin-role.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ admin_id: adminId, role: newRole }),
    });

    const data = await res.json();

    if (!data.success) {
      alert(data.message);
      select.value = previous;
      select.disabled = false;
      return;
    }

    select.dataset.current = newRole;
    select.disabled = false;

    // The dropdown above depends on who holds which role, so both lists
    // are rebuilt rather than only the row that changed.
    loadAdmins();
    loadDistribution();
  } catch (error) {
    alert("Connection error.");
    select.value = previous;
    select.disabled = false;
  }
}

function renderAdmins() {
  const list = document.getElementById("adminsList");

  if (!list) return;

  if (!allAdmins.length) {
    hideAdminsPager();

    list.innerHTML = `
            <div class="no-admins">
                No admins available.
            </div>
        `;
    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(allAdmins.length / ADMINS_PAGE_SIZE),
  );

  if (adminsPage > totalPages) adminsPage = totalPages;

  const start = (adminsPage - 1) * ADMINS_PAGE_SIZE;
  const pageAdmins = allAdmins.slice(start, start + ADMINS_PAGE_SIZE);

  list.innerHTML = pageAdmins
    .map((admin) => {
      const isActive = Number(admin.active) === 1;

      return `
        <div class="admin-row" id="admin-row-${admin.id}">

            <div class="admin-info">
                <strong>${escapeHtml(admin.name)}</strong>
                <span>${escapeHtml(admin.email)}</span>
                ${adminRoleControl(admin)}
                <span class="admin-status ${isActive ? "is-active" : "is-inactive"}">
                    ${isActive ? "Active" : "Inactive"}
                </span>
            </div>

            ${
              isActive
                ? `<button
                    type="button"
                    class="deactivate-admin-btn"
                    onclick="setAdminActive(${admin.id}, '${escapeHtml(admin.name)}', false)"
                  >
                    Deactivate
                  </button>`
                : `<button
                    type="button"
                    class="activate-admin-btn"
                    onclick="setAdminActive(${admin.id}, '${escapeHtml(admin.name)}', true)"
                  >
                    Activate
                  </button>`
            }

        </div>
        `;
    })
    .join("");

  renderAdminsPager(allAdmins.length, totalPages, start, pageAdmins.length);
}

function renderAdminsPager(total, totalPages, start, shown) {
  const pager = document.getElementById("adminsPager");

  if (!pager) return;

  if (total <= ADMINS_PAGE_SIZE) {
    pager.hidden = true;
    return;
  }

  pager.hidden = false;

  document.getElementById("adminsPagerInfo").innerText =
    `Showing ${start + 1}–${start + shown} of ${total}`;

  const pages = Array.from(
    { length: totalPages },
    (unused, index) => index + 1,
  );

  document.getElementById("adminsPagerPages").innerHTML = `
        <button type="button" onclick="goToAdminsPage(${adminsPage - 1})" ${adminsPage === 1 ? "disabled" : ""}>Prev</button>
        ${pages
          .map(
            (page) => `
            <button type="button" class="${page === adminsPage ? "current" : ""}"
                    onclick="goToAdminsPage(${page})">${page}</button>
        `,
          )
          .join("")}
        <button type="button" onclick="goToAdminsPage(${adminsPage + 1})" ${adminsPage === totalPages ? "disabled" : ""}>Next</button>
    `;
}

function goToAdminsPage(page) {
  adminsPage = page;
  renderAdmins();

  document
    .getElementById("adminsList")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}
async function setAdminActive(id, name, makeActive) {
  const confirmed = await askConfirm({
    title: makeActive ? "Reactivate admin" : "Deactivate admin",
    text: makeActive
      ? `"${name}" will be able to log in again.`
      : `"${name}" won't be able to log in, but nothing about their account is deleted.`,
    action: makeActive ? "Reactivate" : "Deactivate",
    icon: "warn",
  });

  if (!confirmed) return;

  try {
    const res = await fetch("api/settings.php", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },

      body: JSON.stringify({
        action: "toggle_admin_status",
        id: id,
        active: makeActive ? 1 : 0,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.message || "Failed to update admin status.");
      return;
    }

    alert(
      data.message || (makeActive ? "Admin activated." : "Admin deactivated."),
    );

    // Reload list
    loadAdmins();
  } catch (err) {
    console.error("Toggle admin status error:", err);

    alert("Network or server error ❌");
  }
}
// ---- Distribute Admins panel: owner -> super_admin/account_manager ----
// Same pattern as the Owner Assignments panel on clients-management.html,
// just handing off Admin accounts instead of clients.
let distributeManagers = [];
let distributePool = [];
let distributeAssignments = {};

async function loadDistribution() {
  const select = document.getElementById("distributeManagerSelect");
  if (!select) return;

  try {
    const res = await fetch("api/admin-manager-assignments.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();

    if (!data.success) {
      select.innerHTML = `<option value="">${escapeHtml(data.message || "Unable to load")}</option>`;
      return;
    }

    distributeManagers = data.targetAdmins || [];
    distributePool = data.admins || [];
    distributeAssignments = data.assignments || {};

    if (!distributeManagers.length) {
      select.innerHTML = `<option value="">No super admins or account managers found.</option>`;
      return;
    }

    select.innerHTML = `
            <option value="">Select Super Admin / Account Manager</option>
            ${distributeManagers
              .map(
                (mgr) => `
                <option value="${mgr.id}">${escapeHtml(mgr.name)} - ${escapeHtml(mgr.email)} (${adminRoleLabel(mgr.role)})</option>
            `,
              )
              .join("")}
        `;
  } catch (error) {
    select.innerHTML = `<option value="">Connection error</option>`;
  }
}

/* Who can be handed to whom.

   An account manager sits above the super admins, so their list is both:
   the super admins and the plain admins. A super admin only ever gets plain
   admins - they cannot be given another super admin, or each other.

   The super admins are already on the page inside distributeManagers (it is
   the same dropdown list), so no extra request is needed to build this. */

function distributeRoleOf(adminId) {
  const match = distributeManagers.find(
    (mgr) => String(mgr.id) === String(adminId),
  );
  return match ? match.role : "";
}

function distributePoolFor(managerId) {
  const role = distributeRoleOf(managerId);

  if (role !== "account_manager") {
    return distributePool;
  }

  // Super admins first, then the plain admins beneath them.
  const superAdmins = distributeManagers.filter(
    (mgr) => mgr.role === "super_admin" && String(mgr.id) !== String(managerId),
  );

  return superAdmins.concat(distributePool);
}

function renderDistribution() {
  const managerId = document.getElementById("distributeManagerSelect").value;
  const box = document.getElementById("distributeList");

  if (!managerId) {
    box.innerHTML = "";
    return;
  }

  const pool = distributePoolFor(managerId);

  if (!pool.length) {
    box.innerHTML = `<div class="empty">No accounts available to assign to this person.</div>`;
    return;
  }

  const assigned = distributeAssignments[managerId] || [];

  box.innerHTML = pool
    .map(
      (adm) => `
        <label style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            border:1px solid #eef1f5;
            border-radius:12px;
            padding:12px 16px;
            margin-bottom:10px;
            background:#fff;
        ">
            <div>
                <strong>${escapeHtml(adm.name)}</strong><br>
                <span style="color:#667085;font-size:12px;">${escapeHtml(adm.email)} &middot; ${escapeHtml(adminRoleLabel(adm.role))}</span>
            </div>

            <input
                type="checkbox"
                value="${escapeHtml(adm.id)}"
                ${assigned.includes(Number(adm.id)) ? "checked" : ""}
                style="width:18px;height:18px;"
            >
        </label>
    `,
    )
    .join("");
}

async function saveDistribution() {
  const managerId = document.getElementById("distributeManagerSelect").value;
  const status = document.getElementById("distributeStatus");

  if (!managerId) {
    status.innerText = "Please make a selection.";
    return;
  }

  const adminIds = Array.from(
    document.querySelectorAll("#distributeList input[type='checkbox']:checked"),
  ).map((input) => input.value);

  status.innerText = "Saving...";

  try {
    const res = await fetch("api/admin-manager-assignments.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({
        managerId,
        adminIds,
      }),
    });

    const data = await res.json();
    status.innerText = data.message;

    if (data.success) {
      distributeAssignments[managerId] = adminIds.map((id) => Number(id));
    }
  } catch (error) {
    status.innerText = "Connection error.";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
async function loadSettings() {
  try {
    const res = await fetch("api/settings.php", {
      headers: {
        Authorization: "Bearer " + adminToken,
      },
    });

    const response = await res.json();

    if (response.role === "super_admin") {
      document.getElementById("superAdminSection").style.display = "block";
    }
  } catch (err) {
    console.log("Error loading settings");
  }
}

window.onload = loadSettings;

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
