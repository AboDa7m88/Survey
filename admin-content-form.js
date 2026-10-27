const adminToken = localStorage.getItem("admin_token");
const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

if (!adminToken || !adminUser.role) {
  window.location.href = "admin-login.html";
}

// Content is open to both `admin` and `super_admin`; only these two links narrow.
// Clients Management is open to every admin, so the sidebar no longer hides it.

(function () {
  const name = adminUser.name || "Admin";
  const label =
    {
      owner: "Owner",
      super_admin: "Super Admin",
      account_manager: "Account Manager",
      seo_admin: "Admin",
    }[adminUser.role] || "";
  const initial = name.charAt(0).toUpperCase();
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set("adminName", name);
  set("adminRole", label);
  set("adminAvatar", initial);
  set("acctRole", label);
})();

const editId = new URLSearchParams(location.search).get("id");

/* The owner, the account managers and the super admins create posts; an
   Admin opens one they are on to fill it in. api/admin-content.php refuses the
   create too - this only saves writing a whole post for nothing. */
const canCreate = ["owner", "account_manager", "super_admin"].includes(
  adminUser.role,
);

if (!editId && !canCreate) {
  window.location.replace("admin-content.html");
}

/* ── Content types ───────────────────────────────────────────────────────────
   Nine fixed types, one per icon in assets/icon - the icon's own file name is
   the type's title, so the two can never drift apart. Types are not created
   here any more: picking one opens its details, where the name is fixed by the
   icon and only the platform is the admin's to write. The platform is what the
   filter tabs on the Content pages group by, which is why it stays editable. */

// Icon file name = title. Keep this list in step with assets/icon.
const TYPE_TITLES = [
  "Articles",
  "Campaign",
  "Design",
  "Events",
  "Photos",
  "Reports",
  "Social Media",
  "Training",
  "Videos",
];

function typeIdFor(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// A tag glyph for the odd type that is not one of the nine - an older post
// keeps its own type when it is edited, and it has no icon file.
const FALLBACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.4"/></svg>';

function iconMarkup(icon) {
  if (!icon) return FALLBACK_ICON;
  // encodeURIComponent, because two of the file names have a space in them.
  return `<img src="assets/icon/${encodeURIComponent(icon)}.svg" alt="" width="60" height="60">`;
}

const types = TYPE_TITLES.map((title) => ({
  id: typeIdFor(title),
  label: title,
  // The platform starts as the type's own name and is edited on the form; the
  // category follows it, the way it always has on this page.
  platform: title,
  category: title,
  icon: title,
}));

let selectedType = null;
let orientation = "horizontal";

/* The post's images, cover first: { kind: "kept", path } for one already
   on the server, { kind: "new", file, url } for one picked here. Same cap as
   CONTENT_MAX_IMAGES in api/db.php. */
const MAX_IMAGES = 5;
let mediaItems = [];

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTypes() {
  const wrap = document.getElementById("typeChips");

  wrap.innerHTML = types
    .map(
      (type) => `
    <button class="chip ${type.id === selectedType ? "selected" : ""}" type="button"
            data-id="${esc(type.id)}" onclick="selectType('${esc(type.id)}')" title="${esc(type.label)}">
      ${iconMarkup(type.icon)}
      ${esc(type.label)}
    </button>
  `,
    )
    .join("");
}

/** The details a picked type opens: its fixed name, and its editable platform. */
function showTypeDetails() {
  const details = document.getElementById("typeDetails");
  const type = types.find((entry) => entry.id === selectedType);

  if (!type) {
    details.classList.remove("open");
    return;
  }

  document.getElementById("typeLabel").value = type.label;
  // Left blank on purpose: the platform is the admin's to write, and a
  // prefilled one would just get saved unread.
  document.getElementById("typePlatform").value = "";
  details.classList.add("open");
}

function selectType(id) {
  selectedType = id;
  renderTypes();
  showTypeDetails();
}

/** Reads the platform back, so a blank field still leaves a usable value. */
function currentPlatform() {
  const type = types.find((entry) => entry.id === selectedType);
  if (!type) return "";

  const typed = document.getElementById("typePlatform").value.trim();
  return typed || type.label;
}

/** Keeps a post's own type usable when it is not one of the nine. */
function mergeType(type) {
  if (!type || !type.id) return false;
  if (types.some((existing) => existing.id === type.id)) return false;

  types.push({
    id: type.id,
    label: type.label || type.id,
    platform: type.platform || "",
    category: type.category || "",
    icon: type.icon || "",
  });

  return true;
}

/* ── Collapsible panels ── */

function togglePanel(head) {
  const panel = head.closest(".panel");
  const collapsed = panel.classList.toggle("collapsed");
  head.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

/** Opens a panel so a validation message never points at hidden fields. */
function openPanel(id) {
  const panel = document.getElementById(id);
  if (!panel || !panel.classList.contains("collapsed")) return;

  panel.classList.remove("collapsed");
  panel.querySelector(".panel-head").setAttribute("aria-expanded", "true");
}

/* ── Orientation ── */

/* What the Content page actually renders the media at, per orientation:
   a horizontal post is a 2.4/1 banner capped at 672 x 280 CSS px, a vertical
   one a 9/16 panel 300 px wide. The recommended sizes are those ratios at
   roughly 2x, so the image stays sharp without paying for pixels the layout
   throws away. The grid thumbnail is a square centre-crop either way, so keep
   the subject away from the edges. */
const MEDIA_GUIDE = {
  horizontal: {
    size: "1440 × 600 px",
    ratio: "2.4:1",
    width: 1440,
    height: 600,
  },
  vertical: {
    size: "1080 × 1920 px",
    ratio: "9:16",
    width: 1080,
    height: 1920,
  },
};

function updateMediaHint() {
  const hint = document.getElementById("mediaHint");
  if (!hint) return;

  const guide = MEDIA_GUIDE[orientation] || MEDIA_GUIDE.horizontal;

  hint.innerText = `Up to ${MAX_IMAGES} images · ${guide.size} recommended (${guide.ratio}) · resized and compressed on save`;
}

function selectOrientation(value) {
  orientation = value;

  document.querySelectorAll("[data-orientation]").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.orientation === orientation);
  });

  // The media thumbnails follow the same aspect ratio the post will use.
  document.getElementById("mediaList").className = "media-list is-" + value;

  updateMediaHint();
}

/* ── Caption editor ─────────────────────────────────────────────────────────
   Alignment lives here rather than in a language field: an Arabic post is
   right-aligned with the toolbar, the same way any other paragraph is.       */

const caption = document.getElementById("caption");
const MAX_CAPTION = Number(caption.dataset.max);

function runCommand(command) {
  caption.focus();

  // Alignment has to come out as inline text-align, since that is the one bit
  // of styling the sanitiser on the reading pages keeps. It is turned on only
  // for the align commands: left on, bold and italic would produce styled
  // spans instead of <b> and <i>, which the sanitiser strips.
  const aligning = command.indexOf("justify") === 0;

  if (aligning)
    try {
      document.execCommand("styleWithCSS", false, true);
    } catch (e) {}

  document.execCommand(command, false, null);

  if (aligning)
    try {
      document.execCommand("styleWithCSS", false, false);
    } catch (e) {}

  updateCounter();
}

function insertLink() {
  const url = prompt("Link URL");
  if (!url) return;

  if (/^\s*(javascript|data|vbscript):/i.test(url)) {
    setStatus("That link type is not allowed.", "error");
    return;
  }

  caption.focus();
  document.execCommand("createLink", false, url);
  updateCounter();
}

const EMOJI = [
  "😀",
  "😍",
  "🎉",
  "🔥",
  "✨",
  "👏",
  "💡",
  "📈",
  "🚀",
  "✅",
  "❤️",
  "👀",
  "💬",
  "📣",
  "🙌",
  "⭐",
];

document.getElementById("emojiPop").innerHTML = EMOJI.map(
  (char) =>
    `<button type="button" onmousedown="event.preventDefault()" onclick="insertEmoji('${char}')">${char}</button>`,
).join("");

function toggleEmoji() {
  document.getElementById("emojiPop").classList.toggle("open");
}

function insertEmoji(char) {
  caption.focus();
  document.execCommand("insertText", false, char);
  document.getElementById("emojiPop").classList.remove("open");
  updateCounter();
}

document.addEventListener("click", (event) => {
  if (!document.getElementById("editorToolbar").contains(event.target)) {
    document.getElementById("emojiPop").classList.remove("open");
  }
});

// Stop typing at the cap rather than letting the counter run red forever.
caption.addEventListener("beforeinput", (event) => {
  const inserting =
    !event.inputType.startsWith("delete") && event.inputType !== "historyUndo";
  if (inserting && caption.innerText.length >= MAX_CAPTION) {
    event.preventDefault();
  }
});

caption.addEventListener("input", updateCounter);

function updateCounter() {
  const used = caption.innerText.replace(/\n$/, "").length;
  const counter = document.getElementById("captionCounter");
  counter.innerText = `${used} / ${MAX_CAPTION} characters`;
  counter.classList.toggle("over", used >= MAX_CAPTION);
}

/* ── Media ── */

// What the server accepts per image (api/admin-content.php).
const MAX_MEDIA = 3 * 1024 * 1024;

// What can be picked. Images are shrunk before upload (optimiseImage), so a
// phone photo well over 3 MB still lands under it - only a GIF, which is
// sent untouched, has to be under 3 MB already.
const MAX_ORIGINAL = 20 * 1024 * 1024;

const dropzone = document.getElementById("dropzone");

document.getElementById("mediaInput").addEventListener("change", (event) => {
  handleMedia(event.target.files);
  // Cleared so picking the same file again after removing it still fires.
  event.target.value = "";
});

["dragenter", "dragover"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", (event) => {
  handleMedia(event.dataTransfer.files);
});

/* Adds what fits. A file that is not an image or is too large is skipped
   with a reason, and so is anything past the fifth - the ones that do fit
   still go in, so one bad file does not cost the rest. */
function handleMedia(fileList) {
  const error = document.getElementById("mediaError");
  const problems = [];

  [...(fileList || [])].forEach((file) => {
    if (!file.type.startsWith("image/")) {
      problems.push(`${file.name} is not an image.`);
      return;
    }

    if (file.type === "image/gif" && file.size > MAX_MEDIA) {
      problems.push(
        `${file.name} is over 3 MB. GIFs are uploaded as they are, so pick a smaller one.`,
      );
      return;
    }

    if (file.size > MAX_ORIGINAL) {
      problems.push(`${file.name} is over 20 MB. Pick a smaller one.`);
      return;
    }

    if (mediaItems.length >= MAX_IMAGES) {
      problems.push(
        `A post can have up to ${MAX_IMAGES} images, so ${file.name} was left out.`,
      );
      return;
    }

    mediaItems.push({ kind: "new", file, url: URL.createObjectURL(file) });
  });

  error.innerText = problems.join(" ");
  error.classList.toggle("show", problems.length > 0);

  renderMedia();
}

function mediaSrc(item) {
  return item.kind === "new" ? item.url : item.path;
}

function renderMedia() {
  const list = document.getElementById("mediaList");

  list.innerHTML = mediaItems
    .map(
      (item, index) => `
    <div class="media-preview">
      <div class="thumb" style="background-image:url('${esc(mediaSrc(item))}')"></div>
      ${index === 0 ? `<span class="cover-tag">Cover</span>` : ""}
      <button class="remove" type="button" onclick="removeMediaAt(${index})"
              title="Remove image" aria-label="Remove image ${index + 1}">&times;</button>
    </div>
  `,
    )
    .join("");

  // Full means full: the dropzone goes until an image is taken off.
  dropzone.style.display = mediaItems.length >= MAX_IMAGES ? "none" : "";

  document.getElementById("mediaCount").innerText = mediaItems.length
    ? `${mediaItems.length} / ${MAX_IMAGES} images`
    : "";
}

function removeMediaAt(index) {
  const [item] = mediaItems.splice(index, 1);
  if (item && item.kind === "new") URL.revokeObjectURL(item.url);

  document.getElementById("mediaError").classList.remove("show");
  renderMedia();
}

/* ── Image compression ──────────────────────────────────────────────────────
   Every new image is resized and re-encoded in the browser before it is sent.
   It is scaled down until it just covers the box the Content page shows it in
   (MEDIA_GUIDE, already ~2x the CSS size), so the cover crop and the full-size
   view stay sharp - never scaled up. Then it is saved as WebP at 80%, or JPEG
   where the browser cannot write WebP (older Safari hands back a PNG instead).
   A GIF is left alone: re-encoding it would drop the animation.

   It runs on save, not on pick, because the box depends on the orientation,
   which can still change after the images are in. */

const IMAGE_QUALITY = 0.8;

async function decodeImage(file) {
  if (window.createImageBitmap) {
    try {
      // from-image applies a phone photo's EXIF rotation.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      // Fall through to an <img>, which some browsers decode more formats with.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read " + file.name));
    };
    img.src = url;
  });
}

function canvasBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY));
}

async function optimiseImage(file, box) {
  if (file.type === "image/gif") return file;

  const source = await decodeImage(file);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;

  const scale = Math.min(
    1,
    Math.max(box.width / sourceWidth, box.height / sourceHeight),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();

  let blob = await canvasBlob(canvas, "image/webp");

  if (!blob || blob.type !== "image/webp") {
    // JPEG has no transparency, so a transparent PNG gets white behind it
    // rather than black.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    blob = await canvasBlob(canvas, "image/jpeg");
  }

  if (!blob) return file;

  // An already-small, already-compressed file can come out bigger.
  if (scale === 1 && blob.size >= file.size) return file;

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") + "." + extension;

  return new File([blob], name, { type: blob.type });
}

/* The files to send, compressed for the current orientation. The result is
   kept on the item, so a save that fails and is tried again does not redo
   the work. An image the browser cannot decode goes as it is, and the
   server's own type check has the last word on it. */
async function prepareUploads() {
  const box = MEDIA_GUIDE[orientation] || MEDIA_GUIDE.horizontal;
  const fresh = mediaItems.filter((item) => item.kind === "new");

  if (
    fresh.some((item) => !item.ready || item.ready.orientation !== orientation)
  ) {
    setStatus("Optimising images...", "");
  }

  const files = [];

  for (const item of fresh) {
    if (!item.ready || item.ready.orientation !== orientation) {
      let file;

      try {
        file = await optimiseImage(item.file, box);
      } catch (error) {
        file = item.file;
      }

      item.ready = { orientation, file };
    }

    if (item.ready.file.size > MAX_MEDIA) {
      throw new Error(
        `${item.file.name} is still over 3 MB after compressing. Pick a smaller one.`,
      );
    }

    files.push(item.ready.file);
  }

  return files;
}

/* ── Scheduling ─────────────────────────────────────────────────────────────
   Only the account manager and the owner decide when a post goes out. For any
   other admin the panel is not drawn at all and the post is saved as a draft,
   which is why the switch is cleared rather than trusted: a value restored
   from a draft or an edited post must not survive into the payload.

   api/admin-content.php pins the status to draft for those roles too - this
   only keeps the form honest about what the button is going to do. */

const canPublish =
  adminUser.role === "account_manager" || adminUser.role === "owner";

function syncPublishNow() {
  const toggle = document.getElementById("publishNow");
  if (!canPublish) toggle.checked = false;

  const on = toggle.checked;
  const date = document.getElementById("postDate");
  const time = document.getElementById("postTime");

  date.disabled = on;
  time.disabled = on;

  if (on) {
    date.value = "";
    time.value = "";
  }

  updateSubmitLabel();
}

/* What saving will make of the post. Anyone else's save leaves the status
   alone - api/admin-content.php keeps the stored schedule for them - so the
   "draft" sent then is not acted on. For the owner and the account managers,
   a post with no date and no Publish immediately is a draft: the task stage,
   before there is anything to schedule. */
function postStatus() {
  if (!canPublish) return "draft";
  if (document.getElementById("publishNow").checked) return "published";

  const dated =
    document.getElementById("postDate").value ||
    document.getElementById("postTime").value;

  return dated ? "scheduled" : "draft";
}

function updateSubmitLabel() {
  const status = postStatus();

  document.getElementById("submitLabel").innerText = editId
    ? "Update Content"
    : status === "published"
      ? "Publish Content"
      : status === "scheduled"
        ? "Schedule Content"
        : "Save as Draft";
}

["postDate", "postTime"].forEach((id) =>
  document.getElementById(id).addEventListener("input", updateSubmitLabel),
);

/* ── Save ── */

function setStatus(message, kind) {
  const status = document.getElementById("formStatus");
  status.innerText = message;
  status.className = "status-text " + (kind || "");
}

/* Compressing the images takes a moment before the upload starts, so the
   button is held down for the whole save - a second click would send the
   post twice. A save that succeeds leaves the page, so it stays disabled. */
let saving = false;

async function save() {
  if (saving) return;

  const button = document.getElementById("submitBtn");
  saving = true;
  button.disabled = true;

  try {
    await saveContent();
  } finally {
    if (!leavingIntentionally) {
      saving = false;
      button.disabled = false;
    }
  }
}

async function saveContent() {
  const title = document.getElementById("title").value.trim();
  const client = document.getElementById("client").value.trim();
  const link = document.getElementById("link").value.trim();
  const publishNow = document.getElementById("publishNow").checked;
  const postDate = document.getElementById("postDate").value;
  const postTime = document.getElementById("postTime").value;
  const captionHtml = caption.innerHTML.trim();
  const captionText = caption.innerText.trim();

  // A post starts as a task: the title is the one thing it must have. The
  // rest is filled in later, often by someone else.
  if (!title) {
    openPanel("panelDetails");
    setStatus("Add a campaign title.", "error");
    return;
  }

  // Only the roles that can choose a time have a time to get wrong. Neither
  // set means the post is saved as a draft to schedule later.
  if (canPublish && !publishNow && Boolean(postDate) !== Boolean(postTime)) {
    setStatus(
      "Set both a post date and a time, or leave both empty to save a draft.",
      "error",
    );
    return;
  }

  const status = postStatus();

  // A post with no client reaches every client, so nothing goes out
  // without one. A draft can wait for it.
  if (status !== "draft" && !client) {
    openPanel("panelDetails");
    setStatus("Pick a client before scheduling or publishing.", "error");
    return;
  }

  const type = types.find((entry) => entry.id === selectedType);
  const platform = currentPlatform();

  const form = new FormData();
  if (editId) form.append("id", editId);

  form.append("title", title);
  form.append("client", client);
  form.append("link", link);
  form.append("caption", captionText ? captionHtml : "");
  // The type can be left for whoever fills the post in.
  form.append("content_type", type ? type.id : "");
  form.append("type_label", type ? type.label : "");
  // The platform doubles as the category, which is what the Content pages
  // group their filter tabs by.
  form.append("platform", platform);
  form.append("category", platform);
  form.append("orientation", orientation);
  form.append("post_date", postDate);
  form.append("post_time", postTime);
  form.append("publish_now", publishNow ? "1" : "0");
  form.append("status", status);
  // priority_sent tells the API this save carries both fields; a save
  // from anywhere else leaves them as they are.
  form.append("priority", document.getElementById("priority").value);
  form.append("priority_sent", "1");
  form.append("notes", document.getElementById("notes").value.trim());

  // Only when the field is offered: a save without the list leaves the
  // post's team as it was. member_ids_sent says the list is complete even
  // when nobody is ticked.
  if (!document.getElementById("teammatesRow").hidden) {
    form.append("member_ids_sent", "1");
    selectedTeammateIds().forEach((id) => form.append("member_ids[]", id));
  }

  let uploads;

  try {
    uploads = await prepareUploads();
  } catch (error) {
    setStatus(error.message, "error");
    return;
  }

  // The images kept from the server, then the new ones; the API saves them
  // in that order and the first is the cover. keep_media_sent tells it the
  // list is complete even when it keeps none.
  form.append("keep_media_sent", "1");
  mediaItems.forEach((item) => {
    if (item.kind === "kept") form.append("keep_media[]", item.path);
  });
  uploads.forEach((file) => form.append("media[]", file));

  try {
    setStatus(editId ? "Updating content..." : "Saving content...", "");

    const response = await fetch("api/admin-content.php", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + adminToken,
      },
      body: form,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setStatus(data.message || "Something went wrong.", "error");
      return;
    }

    setStatus(data.message || "Saved successfully.", "ok");

    // The work is on the server now, so the recovery copy must not come back.
    clearDraft();
    leavingIntentionally = true;

    setTimeout(() => {
      window.location.href = "admin-content.html";
    }, 700);
  } catch (error) {
    console.error(error);
    setStatus("Connection error.", "error");
  }
}

async function discard() {
  const ok = await askConfirm({
    title: "Discard post",
    text: "Nothing in this post will be saved, and the autosaved draft is thrown away too.",
    action: "Discard post",
  });

  if (!ok) return;

  // Discard means gone - do not let the autosaved copy restore it later,
  // and do not ask again on the way out.
  clearDraft();
  leavingIntentionally = true;
  window.location.href = "admin-content.html";
}

/* ── Edit mode ──────────────────────────────────────────────────────────────
   `?id=` puts the form in edit mode. There is nothing to prefill from until a
   backend exists; fetch the record here and set each control, remembering to
   push a saved custom type back into `types` before calling renderTypes().    */

async function prepareEditMode() {
  document.getElementById("pageHeading").innerText = "Edit Content";

  document.getElementById("submitLabel").innerText = "Update Content";

  try {
    setStatus("Loading content...", "");

    const response = await fetch(
      `api/admin-content.php?id=${encodeURIComponent(editId)}`,
      {
        headers: {
          Authorization: "Bearer " + adminToken,
        },
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      setStatus(data.message || "Could not load content.", "error");
      return;
    }

    const item = data.content;

    /*
    |--------------------------------------------------------------------------
    | Basic fields
    |--------------------------------------------------------------------------
    */

    document.getElementById("title").value = item.title || "";

    document.getElementById("link").value = item.link || "";

    // The options may still be in flight, and a post saved before this was a
    // dropdown can name a client no user carries any more - selectClient()
    // waits and re-adds the value rather than silently dropping it.
    await selectClient(item.client || "");

    document.getElementById("priority").value = [
      "low",
      "medium",
      "high",
    ].includes(item.priority)
      ? item.priority
      : "medium";

    document.getElementById("notes").value = item.notes || "";

    // Before selectTeammates(): its updateMemberSummary() renders the
    // checklist, which needs to know whose box is whose.
    viewerId = String(data.admin_id);
    setSavedAssignees(item.assignees || []);

    showTeammates(Boolean(data.can_assign));
    await selectTeammates(item.assignees || []);

    /*
    |--------------------------------------------------------------------------
    | Caption
    |--------------------------------------------------------------------------
    */

    document.getElementById("caption").innerHTML = item.caption || "";

    updateCounter();

    /*
    |--------------------------------------------------------------------------
    | Orientation
    |--------------------------------------------------------------------------
    */

    // Through selectOrientation() rather than inline: this block set the
    // variable and toggled "active", but the styled state is "selected", so
    // an edited post opened with neither button lit. It also syncs the
    // preview's aspect ratio and the recommended size in the dropzone.
    selectOrientation(
      item.orientation === "vertical" ? "vertical" : "horizontal",
    );

    /*
    |--------------------------------------------------------------------------
    | Content Type
    |--------------------------------------------------------------------------
    */

    if (item.content_type) {
      // A post written before this list settled on nine types keeps its own
      // type, so editing it does not silently re-file it under another one.
      mergeType({
        id: item.content_type,
        label: item.type_label || item.content_type,
        platform: item.platform || "",
        category: item.category || "",
      });

      selectType(item.content_type);

      // The saved platform is the post's, not the type's default.
      if (item.platform)
        document.getElementById("typePlatform").value = item.platform;
    }

    /*
    |--------------------------------------------------------------------------
    | Publish / Schedule
    |--------------------------------------------------------------------------
    */

    const publishNow = Number(item.publish_now) === 1;

    document.getElementById("publishNow").checked = publishNow;

    document.getElementById("postDate").value = item.post_date || "";

    // MySQL returns TIME as HH:MM:SS; input[type=time] wants HH:MM with the
    // default step, and browsers disagree on whether they normalise or reject
    // the seconds - a rejected value would blank a scheduled post's time.
    document.getElementById("postTime").value = (item.post_time || "").slice(
      0,
      5,
    );

    syncPublishNow();

    /*
    |--------------------------------------------------------------------------
    | Existing image
    |--------------------------------------------------------------------------
    */

    mediaItems = (
      item.images || (item.media_path ? [item.media_path] : [])
    ).map((path) => ({ kind: "kept", path }));

    renderMedia();

    setStatus("", "");
  } catch (error) {
    console.error(error);

    setStatus("Connection error.", "error");
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "admin-login.html";
}

/* ── Clients ────────────────────────────────────────────────────────────────
   The client list is the distinct set of company names on user accounts, so
   picking one targets that company's whole team. One has to be picked - a post
   with no client reaches nobody in particular, which is never what was meant. */

const clientsReady = loadClients();

async function loadClients() {
  const select = document.getElementById("client");

  try {
    const res = await fetch("api/admin-users.php", {
      headers: { Authorization: "Bearer " + adminToken },
    });

    const data = await res.json();
    if (!data.success || !data.users) return;

    const clients = [
      ...new Set(
        data.users.map((u) => (u.company_name || "").trim()).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    select.innerHTML =
      `<option value="">Select a client</option>` +
      clients
        .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
        .join("");
  } catch (err) {
    console.error("Could not load clients:", err);
  }
}

/** Selects a client, adding the option first if the list does not carry it. */
async function selectClient(value) {
  await clientsReady;

  const select = document.getElementById("client");

  if (value && !Array.from(select.options).some((o) => o.value === value)) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${esc(value)}">${esc(value)}</option>`,
    );
  }

  select.value = value;

  // Setting the value fires no change event; the team follows it here.
  teammatesReady = loadTeammates(value);
}

/* ── Teammates ───────────────────────────────────────────────────────────────
   The client's team - the account managers, Super Admins and Admins assigned
   to it - who work on the post with its author; with no client picked yet,
   anyone in those roles. The list follows the client field, keeping whoever
   is ticked. Whoever creates a post picks them; on an existing post only its
   author, the owner and the account managers may change them (can_assign) -
   for anyone else the field stays hidden and the save sends no list, so
   api/admin-content.php leaves the team as it was. Each person newly ticked
   gets a notification. */

const ROLE_LABELS = {
  account_manager: "Account Manager",
  super_admin: "Super Admin",
  seo_admin: "Admin",
};

let teammatesRequest = 0;
let memberSelectWired = false;
let teammatesReady = loadTeammates("");

document.getElementById("client").addEventListener("change", function () {
  teammatesReady = loadTeammates(this.value);
});

function showTeammates(on) {
  document.getElementById("teammatesRow").hidden = !on;
  renderChecklist();
}

function teammateOption(person) {
  return (
    '<label><input type="checkbox" name="member" value="' +
    Number(person.id) +
    '"><span>' +
    esc(person.name || person.email || "Unnamed") +
    '</span><span class="role">' +
    esc(ROLE_LABELS[person.role] || person.role || "") +
    "</span></label>"
  );
}

async function loadTeammates(client) {
  const list = document.getElementById("memberList");
  const request = ++teammatesRequest;

  // Whoever is ticked now stays on the list, even when the new client's
  // team does not carry them.
  const ticked = memberBoxes()
    .filter((box) => box.checked)
    .map((box) => {
      const label = box.closest("label");
      return {
        id: box.value,
        name: label.querySelector("span").textContent,
        role: label.querySelector(".role").textContent,
      };
    });

  try {
    const res = await fetch(
      "api/admin-content.php?candidates=1&client=" +
        encodeURIComponent(client || ""),
      { headers: { Authorization: "Bearer " + adminToken } },
    );

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // A later client pick has asked again; its answer wins.
    if (request !== teammatesRequest) return;

    // The author is on the post already.
    const people = (data.admins || []).filter(
      (person) => String(person.id) !== String(adminUser.id),
    );

    ticked.forEach((person) => {
      if (!people.some((p) => String(p.id) === person.id)) people.push(person);
    });

    list.innerHTML = people.length
      ? people.map(teammateOption).join("")
      : '<div class="none">' +
        (client
          ? "Nobody is assigned to this client yet."
          : "No Super Admins or Admins to add yet.") +
        "</div>";

    memberBoxes().forEach((box) => {
      box.checked = ticked.some((person) => person.id === box.value);
    });
  } catch (err) {
    if (request !== teammatesRequest) return;
    console.error("Could not load teammates:", err);
    if (!ticked.length) {
      list.innerHTML = '<div class="none">Could not load teammates.</div>';
    }
  }

  if (!memberSelectWired) {
    memberSelectWired = true;
    wireMemberSelect();
  } else {
    updateMemberSummary();
  }
}

function memberBoxes() {
  return Array.from(
    document.querySelectorAll('#memberList input[name="member"]'),
  );
}

function selectedTeammateIds() {
  return memberBoxes()
    .filter((box) => box.checked)
    .map((box) => box.value);
}

/** Ticks the given people - {id, name, role} rows or bare ids. A teammate
          no longer offered (deactivated since) is added back rather than
          silently dropped on the next save. */
async function selectTeammates(people) {
  await teammatesReady;

  const list = document.getElementById("memberList");
  const ids = (people || []).map((p) =>
    String(typeof p === "object" ? p.id : p),
  );

  (people || []).forEach((person) => {
    if (typeof person !== "object") return;
    if (memberBoxes().some((box) => box.value === String(person.id))) return;

    list.querySelector(".none")?.remove();
    list.insertAdjacentHTML("beforeend", teammateOption(person));
  });

  memberBoxes().forEach((box) => {
    box.checked = ids.includes(box.value);
  });

  updateMemberSummary();
}

function updateMemberSummary() {
  const summary = document.getElementById("memberSummary");
  const picked = memberBoxes()
    .filter((box) => box.checked)
    .map((box) => box.closest("label").querySelector("span").textContent);

  summary.classList.toggle("placeholder", !picked.length);

  // Two names fit on the trigger; past that a count reads better than an
  // ellipsis eating the third one.
  summary.textContent = !picked.length
    ? "Select teammates..."
    : picked.length <= 2
      ? picked.join(", ")
      : picked.length + " teammates selected";

  renderChecklist();
}

/* ── Teammate checklist ──────────────────────────────────────────────────────
   One "done" box per teammate. While a post is being created nobody is on it
   yet, so the rows follow the picker and every box is disabled. On a saved
   post the rows are the saved team (savedAssignees); only the viewer's own box
   is live, and ticking it saves at once through action=set_done - no Save
   needed. Someone ticked in the picker but not saved yet gets a disabled row
   until the post is saved. */

// The admin looking at the form, from the API in edit mode.
let viewerId = String(adminUser.id || "");

// id => {id, name, email, role, is_done, done_at} as the server has them.
let savedAssignees = new Map();

function setSavedAssignees(people) {
  savedAssignees = new Map(
    (people || []).map((person) => [String(person.id), person]),
  );
}

/** The rows to show: [{id, name, saved}] - see the note above. */
function checklistPeople() {
  const pickerShown = !document.getElementById("teammatesRow").hidden;

  if (editId && !pickerShown) {
    return Array.from(savedAssignees.values()).map((person) => ({
      id: String(person.id),
      name: person.name || person.email || "Unnamed",
      saved: person,
    }));
  }

  return memberBoxes()
    .filter((box) => box.checked)
    .map((box) => ({
      id: box.value,
      name: box.closest("label").querySelector("span").textContent,
      saved: editId ? savedAssignees.get(box.value) || null : null,
    }));
}

function renderChecklist() {
  const row = document.getElementById("checklistRow");
  const list = document.getElementById("teammateChecklist");
  const hint = document.getElementById("checklistHint");
  const people = checklistPeople();

  row.hidden = !people.length;
  if (!people.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = people
    .map((person) => {
      const mine = Boolean(person.saved) && person.id === viewerId;
      const done = Boolean(person.saved && person.saved.is_done);

      return (
        '<label class="' +
        (mine ? "mine" : "") +
        '">' +
        '<input type="checkbox" data-id="' +
        esc(person.id) +
        '"' +
        (done ? " checked" : "") +
        (mine ? "" : " disabled") +
        ' aria-label="' +
        esc(person.name) +
        ' done">' +
        '<span class="who">' +
        esc(person.name) +
        (mine ? ' <span class="you">(you)</span>' : "") +
        "</span>" +
        '<span class="state' +
        (done ? " done" : "") +
        '">' +
        (done ? "Done" : "Not done") +
        "</span></label>"
      );
    })
    .join("");

  list.querySelectorAll("label.mine input").forEach((box) => {
    box.addEventListener("change", () => setDone(box));
  });

  const unsaved = people.some((person) => !person.saved);
  const isMine = people.some(
    (person) => person.saved && person.id === viewerId,
  );

  hint.textContent = !editId
    ? "Teammates tick these once the task is saved."
    : isMine
      ? "Tick your box when your part is done. It saves straight away."
      : unsaved
        ? "Teammates tick these once the task is saved."
        : "Each teammate ticks their own box.";
}

async function setDone(box) {
  const state = box.closest("label").querySelector(".state");
  const done = box.checked;

  box.disabled = true;
  state.className = "state";
  state.textContent = "Saving...";

  const form = new FormData();
  form.append("action", "set_done");
  form.append("content_id", editId);
  form.append("done", done ? "1" : "0");

  try {
    const response = await fetch("api/admin-content.php", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      body: form,
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Could not save your box.");
    }

    setSavedAssignees(data.assignees || []);
    renderChecklist();
  } catch (error) {
    console.error(error);
    box.checked = !done;
    box.disabled = false;
    state.className = "state error";
    state.textContent = "Not saved - try again";
    state.title = error.message || "";
  }
}

function wireMemberSelect() {
  const box = document.getElementById("memberSelect");
  const trigger = document.getElementById("memberTrigger");

  trigger.addEventListener("click", function () {
    const open = box.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  box.addEventListener("change", updateMemberSummary);

  // Ticking a name should not close the panel - picking three people would
  // otherwise mean opening it three times.
  document.addEventListener("click", function (event) {
    if (!box.contains(event.target)) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") close();
  });

  function close() {
    box.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  updateMemberSummary();
}

/* ── Unsaved-work recovery ──────────────────────────────────────────────────
   Same shape as the survey draft in admin.html: a per-admin localStorage key,
   written on every input, restored on load, cleared once the post is saved.
   Only in create mode - editing an existing post never touches the draft.

   The chosen image is deliberately not stored. A File cannot be serialised,
   and stashing megabytes as base64 risks the storage quota, so the notice says to
   re-attach it.                                                              */

const DRAFT_KEY = `content_draft_${adminUser.id || "admin"}`;
const draftingEnabled = !editId;

let restoredDraft = false;

// Set before any navigation we trigger ourselves (save, discard, start fresh)
// so the leave guard does not fire on an intentional exit. The beforeunload
// handler is registered with addEventListener, so it cannot be unset by
// assigning to window.onbeforeunload.
let leavingIntentionally = false;

function currentDraft() {
  return {
    savedAt: Date.now(),
    title: document.getElementById("title").value,
    client: document.getElementById("client").value,
    link: document.getElementById("link").value,
    caption: caption.innerHTML,
    contentType: selectedType,
    platform: selectedType ? currentPlatform() : "",
    orientation,
    postDate: document.getElementById("postDate").value,
    postTime: document.getElementById("postTime").value,
    publishNow: document.getElementById("publishNow").checked,
    memberIds: selectedTeammateIds(),
    priority: document.getElementById("priority").value,
    notes: document.getElementById("notes").value,
  };
}

/* What counts as work worth restoring.
   Deliberately not the content type or the orientation: both are selections
   with a default, and a type is saved to the server the moment it is added, so
   on their own they would leave a draft behind that restores nothing visible -
   the form would just announce "Restored unsaved changes" over a blank page. */
function hasWork({
  title,
  client,
  link,
  caption: captionHtml,
  postDate,
  postTime,
  publishNow,
  priority,
  notes,
}) {
  const captionText = new DOMParser().parseFromString(
    captionHtml || "",
    "text/html",
  ).body.textContent;

  return Boolean(
    (title || "").trim() ||
    client ||
    (link || "").trim() ||
    (captionText || "").trim() ||
    postDate ||
    postTime ||
    publishNow ||
    // Medium is the default, so only a changed priority is work.
    (priority && priority !== "medium") ||
    (notes || "").trim(),
  );
}

function isDirty() {
  return (
    hasWork(currentDraft()) || mediaItems.some((item) => item.kind === "new")
  );
}

function saveDraft() {
  if (!draftingEnabled) return;

  try {
    // hasWork(), not isDirty(): an attached image is worth warning about on the
    // way out, but it cannot be written to localStorage. Saving on images
    // alone leaves a draft holding nothing but the content type and the
    // orientation - it restores nothing, so it must not be stored at all.
    if (hasWork(currentDraft())) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft()));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch (e) {
    // Quota or private mode - autosave is a convenience, never block the form.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
}

function describeAge(savedAt) {
  const mins = Math.round((Date.now() - savedAt) / 60000);
  if (!savedAt || mins < 1) return "a moment ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "earlier";
}

async function loadDraft() {
  if (!draftingEnabled) return;

  let draft;
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    draft = JSON.parse(saved);
  } catch (e) {
    return;
  }

  // JSON.parse happily returns null, a number or a string for a key that was
  // written by an older build or corrupted; destructuring any of those in
  // hasWork() throws and kills the rest of this function.
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    clearDraft();
    return;
  }

  // Drafts written by the earlier rule can hold nothing but a content type.
  // Restoring one shows the notice over an empty form, so drop it instead.
  if (!hasWork(draft)) {
    clearDraft();
    return;
  }

  document.getElementById("title").value = draft.title || "";
  document.getElementById("link").value = draft.link || "";

  caption.innerHTML = draft.caption || "";
  updateCounter();

  // Drafts written before the nine fixed types could carry a custom one.
  (draft.customTypes || []).forEach(mergeType);

  if (draft.contentType) {
    selectType(draft.contentType);
    if (draft.platform)
      document.getElementById("typePlatform").value = draft.platform;
  }

  selectOrientation(
    draft.orientation === "vertical" ? "vertical" : "horizontal",
  );

  document.getElementById("priority").value = [
    "low",
    "medium",
    "high",
  ].includes(draft.priority)
    ? draft.priority
    : "medium";
  document.getElementById("notes").value = draft.notes || "";

  document.getElementById("postDate").value = draft.postDate || "";
  document.getElementById("postTime").value = draft.postTime || "";
  document.getElementById("publishNow").checked = Boolean(draft.publishNow);
  syncPublishNow();

  await selectClient(draft.client || "");
  await selectTeammates(Array.isArray(draft.memberIds) ? draft.memberIds : []);

  // Last word on whether the notice is honest: read the form back. If nothing
  // the draft carried actually landed in a field - a client that no longer
  // exists, a value the widget rejected - there is nothing to announce.
  if (!hasWork(currentDraft())) {
    clearDraft();
    return;
  }

  restoredDraft = true;

  document.getElementById("restoreText").innerText =
    `Restored unsaved changes from ${describeAge(draft.savedAt)}. Re-attach any images you had.`;
  document.getElementById("restoreBar").hidden = false;
}

async function startFresh() {
  const ok = await askConfirm({
    title: "Start fresh",
    text: "The restored changes will be discarded and you start again with a blank post.",
    action: "Start fresh",
  });

  if (!ok) return;

  clearDraft();
  restoredDraft = false;
  leavingIntentionally = true;
  location.href = location.pathname;
}

// Autosave on any edit, including the contenteditable caption.
document.addEventListener("input", saveDraft);
document.addEventListener("change", saveDraft);

// Catch the mistake before it happens; the draft is the safety net behind it.
window.addEventListener("beforeunload", (event) => {
  if (leavingIntentionally || !draftingEnabled || !isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});

// A link click would otherwise fire the browser's own vague dialog; asking
// here lets us say what actually happens to the work.
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || leavingIntentionally || !draftingEnabled || !isDirty()) return;

  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || link.target === "_blank") return;

  // Opening the link in a new tab leaves this page where it is, so there is
  // nothing to ask - the draft is autosaved either way.
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0)
    return;

  // The dialog answers later, so hold the navigation and follow it on OK.
  event.preventDefault();

  askConfirm({
    title: "Leave this page?",
    text: "Your changes are saved as a draft and will be restored when you come back.",
    action: "Leave page",
    icon: "warn",
  }).then((ok) => {
    if (!ok) return;
    leavingIntentionally = true; // already confirmed; don't ask again on unload
    location.href = link.href;
  });
});

document.getElementById("panelScheduling").hidden = !canPublish;
syncPublishNow();

// A new post's author picks its team; an existing post waits for the
// server's can_assign in prepareEditMode().
showTeammates(!editId && canCreate);

renderTypes();
updateCounter();
updateMediaHint();

if (editId) {
  prepareEditMode();
} else {
  loadDraft();
}
