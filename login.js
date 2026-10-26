const API_BASE = "api";

document
  .querySelectorAll(".yr")
  .forEach((el) => (el.textContent = new Date().getFullYear()));

function showLogin() {
  document.querySelector(".login-card").style.display = "block";
  document.querySelector(".register-card").style.display = "none";

  document.getElementById("loginStatus").innerText = "";
  document.getElementById("registerStatus").innerText = "";
}

function showRegister() {
  document.querySelector(".register-card").style.display = "block";
  document.querySelector(".login-card").style.display = "none";

  document.getElementById("loginStatus").innerText = "";
  document.getElementById("registerStatus").innerText = "";
}

function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

/* ── Slideshow ────────────────────────────────────────────────────────
       Admins upload these in Settings. Nothing here ever blocks the form:
       no slides, a failed fetch or a dead DB all leave the page exactly as
       it is served, and the two-column layout only appears once a real
       image has decoded. */

const SLIDE_INTERVAL_MS = 6000;

let slideIndex = 0;
let slideTimer = null;

const reducedMotion =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function loadLoginSlides() {
  try {
    const res = await fetch(`${API_BASE}/login-slides.php`, {
      cache: "no-store",
    });

    const data = await res.json();
    const slides = (data && data.slides) || [];

    if (!slides.length) return;

    await renderLoginSlides(slides);
  } catch (error) {
    // Decoration. Never worth a console error on a sign-in page.
    return;
  }
}

async function renderLoginSlides(slides) {
  const panel = document.getElementById("authSlideshow");
  const stack = document.getElementById("slideStack");
  const dots = document.getElementById("slideDots");

  if (!panel || !stack || !dots) return;

  stack.innerHTML = "";
  dots.innerHTML = "";
  slideIndex = 0;

  slides.forEach((slide, index) => {
    const figure = document.createElement("figure");
    figure.className = "slide" + (index === 0 ? " active" : "");

    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    // Wired before src: a cached 404 can fire before the next line runs.
    img.onerror = () => dropSlide(figure);
    img.src = slide.image_path;

    figure.appendChild(img);

    const title = (slide.title || "").trim();
    const subtitle = (slide.subtitle || "").trim();

    if (title || subtitle) {
      const caption = document.createElement("figcaption");

      if (title) {
        const heading = document.createElement("h2");
        heading.textContent = title;
        caption.appendChild(heading);
      }

      if (subtitle) {
        const line = document.createElement("p");
        line.textContent = subtitle;
        caption.appendChild(line);
      }

      figure.appendChild(caption);
    }

    stack.appendChild(figure);

    if (slides.length > 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = index === 0 ? "active" : "";
      dot.setAttribute("aria-label", `Show slide ${index + 1}`);
      dot.onclick = () => {
        goToSlide(index);
        // A manual jump earns a full interval before the timer moves on.
        if (slideTimer) startSlideshow();
      };
      dots.appendChild(dot);
    }
  });

  const firstImg = stack.querySelector("img");

  if (!firstImg) return;

  // Reveal only once there is something to look at, so the form never
  // slides sideways over an empty navy rectangle.
  if (firstImg.decode) {
    await firstImg.decode().catch(() => {});
  }

  if (!stack.querySelector(".slide")) return;

  panel.hidden = false;
  panel.setAttribute("aria-hidden", "true");
  document.body.classList.add("has-slides");

  startSlideshow();
}

function goToSlide(index) {
  const figures = document.querySelectorAll("#slideStack .slide");
  const dots = document.querySelectorAll("#slideDots button");

  if (!figures.length) return;

  slideIndex = (index + figures.length) % figures.length;

  figures.forEach((figure, i) =>
    figure.classList.toggle("active", i === slideIndex),
  );

  dots.forEach((dot, i) => dot.classList.toggle("active", i === slideIndex));
}

function startSlideshow() {
  stopSlideshow();

  const count = document.querySelectorAll("#slideStack .slide").length;

  if (reducedMotion || count < 2) return;

  slideTimer = setInterval(() => goToSlide(slideIndex + 1), SLIDE_INTERVAL_MS);
}

function stopSlideshow() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

function dropSlide(figure) {
  const stack = document.getElementById("slideStack");
  const dots = document.getElementById("slideDots");

  if (!stack || !figure.parentNode) return;

  const index = Array.prototype.indexOf.call(stack.children, figure);
  const dot = dots ? dots.children[index] : null;

  figure.remove();
  if (dot) dot.remove();

  const remaining = stack.children.length;

  if (!remaining) {
    // Every image is gone. Re-centre the form rather than leave a
    // navy column with nothing in it.
    stopSlideshow();

    const panel = document.getElementById("authSlideshow");
    if (panel) panel.hidden = true;

    document.body.classList.remove("has-slides");
    if (dots) dots.innerHTML = "";
    return;
  }

  if (remaining === 1 && dots) dots.innerHTML = "";

  goToSlide(slideIndex >= remaining ? 0 : slideIndex);
  startSlideshow();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopSlideshow();
  } else if (
    document.body.classList.contains("has-slides") &&
    !document.body.classList.contains("auth-open")
  ) {
    startSlideshow();
  }
});

/* Both classes are inert above 900px, so a phone rotated into the
       desktop layout needs no clean-up. */

function openMobileAuth() {
  document.body.classList.add("auth-open");
  // The button says Login, so it opens on the Log In card whichever
  // card the page happened to start on.
  showLogin();
  window.scrollTo(0, 0);
  stopSlideshow();
}

function closeMobileAuth() {
  document.body.classList.remove("auth-open");
  startSlideshow();
}

async function loginUser() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const status = document.getElementById("loginStatus");

  status.classList.remove("error");

  if (!email || !password) {
    status.classList.add("error");
    status.innerText = "Please enter email and password.";
    return;
  }

  status.innerText = "Please wait...";

  try {
    const res = await fetch(`${API_BASE}/login.php`, {
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

    status.innerText = data.message;

    if (!data.success) {
      status.classList.add("error");
      return;
    }

    localStorage.setItem("portal_token", data.token);
    localStorage.setItem("portal_user", JSON.stringify(data.user));

    window.location.href = afterLogin("dashboard.html");
  } catch (error) {
    status.classList.add("error");
    status.innerText = "Connection error.";
  }
}

async function registerUser() {
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const company = document.getElementById("companyName").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  const terms = document.getElementById("termsCheck").checked;
  const status = document.getElementById("registerStatus");

  status.classList.remove("error");

  if (!name || !email || !company || !password) {
    status.classList.add("error");
    // The company is what admins see for this client on every list, so
    // it gets named rather than folded into the generic message.
    status.innerText =
      company || !name || !email || !password
        ? "Please fill all required fields."
        : "Company name is required.";
    if (!company) document.getElementById("companyName").focus();
    return;
  }

  if (!terms) {
    status.classList.add("error");
    status.innerText = "Please accept terms and privacy policy.";
    return;
  }

  status.innerText = "Please wait...";

  try {
    const res = await fetch(`${API_BASE}/register.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        company,
        password,
      }),
    });

    const data = await res.json();

    status.innerText = data.message;

    if (!data.success) {
      status.classList.add("error");
      return;
    }

    alert("Account created. Please wait for admin approval.");
    showLogin();
    document.getElementById("registerName").value = "";
    document.getElementById("registerEmail").value = "";
    document.getElementById("companyName").value = "";
    document.getElementById("registerPassword").value = "";
    document.getElementById("termsCheck").checked = false;
  } catch (error) {
    status.classList.add("error");
    status.innerText = "Connection error.";
  }
}

/* ── Local preview bypass ────────────────────────────────────────────
       Writes the session the portal pages look for and walks straight in.
       The button is only revealed on localhost, so a deployed copy never
       shows it; delete this block and the button above to drop it. */

function onLocalhost() {
  return ["localhost", "127.0.0.1", "::1", ""].includes(location.hostname);
}

function devBypass() {
  localStorage.setItem("portal_token", "preview");
  localStorage.setItem(
    "portal_user",
    JSON.stringify({ name: "Jane Cooper", company_name: "Acme Media" }),
  );

  // The dashboard is the calendar, the one client page with a preview fixture.
  // The others call their APIs, get refused, and bounce back here.
  window.location.href = "dashboard.html";
}

showRegister();

if (onLocalhost()) {
  document.getElementById("devBypass").hidden = false;

  // showRegister() above opens on the Register card, which would leave
  // the bypass button off screen. Only shifts the default on localhost.
  showLogin();
}

/* Where to go once signed in. Normally the dashboard; when an AI
       assistant's connect flow sent the person here (oauth-consent.html),
       back to that approval page. Only that exact shape is honoured, so
       ?next= can never be used to bounce someone to another site. */
function afterLogin(fallback) {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^oauth-consent\.html\?request=[A-Za-z0-9_-]{43}$/.test(next)
    ? next
    : fallback;
}

const token = localStorage.getItem("portal_token");

if (token) {
  window.location.href = afterLogin("dashboard.html");
} else {
  // No point fetching images for a session that is already leaving.
  loadLoginSlides();
}
