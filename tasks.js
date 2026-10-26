    /* ---------- Data ---------- */
        const navItems = [
            { label: "Dashboard", icon: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>', active: true },
            { label: "Forms", icon: '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2"/>' },
            { label: "Responses", icon: '<path d="M4 4h16v12H8l-4 4z" fill="none" stroke="currentColor" stroke-width="2"/>' },
            { label: "Sources & Files", icon: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />' },
            { label: "Calendar", icon: '<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2"/>' },
            { label: "Project Management", icon: '<path d="M3 8h18v12H3zM9 8V5h6v3" fill="none" stroke="currentColor" stroke-width="2"/>' },
        ];

        const tasks = [
            { id: 1, title: "Slide deck draft", project: "Client presentation", due: "Oct 20", phase: "Phase name", status: "To do", isNew: true },
            { id: 2, title: "Slide deck draft", project: "Client presentation", due: "Oct 20", phase: "Phase name", status: "To do", isNew: false },
            { id: 3, title: "Home page design", project: "Website Redesign", due: "Oct 28", phase: "Phase name", status: "In progress", isNew: false },
            { id: 4, title: "Wireframes", project: "Website Redesign", due: "Oct 20", phase: "Phase name", status: "Done", isNew: false },
        ];

        const statusOptions = ["To do", "In progress", "Done"];
        const filters = ["All", "To do", "In progress", "Done"];
        let activeFilter = "All";

        const groups = {
            new: { label: "New", color: "var(--red)" },
            week: { label: "Due this week", color: "var(--week)" },
            done: { label: "Done", color: "var(--green)" },
        };

        /* ---------- Sidebar Navigation ---------- */
        document.getElementById("nav").innerHTML = navItems.map(n => `
            <a href="#" class="${n.active ? "active" : ""}">
                <svg viewBox="0 0 24 24" fill="currentColor">${n.icon}</svg>
                <span>${n.label}</span>
            </a>
        `).join("");

        /* ---------- Donut & Legend ---------- */
        const overview = { done: 3, progress: 5, new: 4 };
        const total = overview.done + overview.progress + overview.new;
        const donut = document.getElementById("donut");
        donut.style.setProperty("--done", (overview.done / total) * 100);
        donut.style.setProperty("--prog", (overview.progress / total) * 100);
        document.getElementById("total").textContent = total;
        document.getElementById("legend").innerHTML = [
            ["Done", overview.done, "var(--green)"],
            ["In progress", overview.progress, "var(--orange)"],
            ["New", overview.new, "var(--blue)"],
        ].map(([l, n, c]) => `<li><span class="dot" style="background:${c}"></span>${l}<em>${n}</em></li>`).join("");

        /* ---------- Tasks & Filters ---------- */
        function groupOf(t) {
            if (t.status === "Done") return "done";
            return t.isNew ? "new" : "week";
        }

        function renderChips() {
            document.getElementById("chips").innerHTML = filters.map(f => {
                const count = f === "All" ? tasks.length : tasks.filter(t => t.status === f).length;
                return `<button class="chip ${f === activeFilter ? "active" : ""}" data-filter="${f}">${f} (${count})</button>`;
            }).join("");
        }

        function renderTasks() {
            const visible = tasks.filter(t => activeFilter === "All" || t.status === activeFilter);
            const list = document.getElementById("task-list");

            if (!visible.length) {
                list.innerHTML = `<p class="empty">No tasks with this status yet.</p>`;
                return;
            }

            list.innerHTML = Object.keys(groups).map(key => {
                const items = visible.filter(t => groupOf(t) === key);
                if (!items.length) return "";
                const g = groups[key];
                return `
                <div class="group-title">
                    <i style="background:${g.color}"></i>${g.label} <span>(${items.length})</span>
                </div>
                ${items.map(t => `
                    <article class="task" style="--c:${g.color}">
                        <div class="task-main">
                            <h4>${t.title}</h4>
                            <span class="pill">${t.project}</span>
                        </div>
                        <div class="field"><small>Due</small><b>${t.due}</b></div>
                        <div class="field"><small>Phase</small><span>${t.phase}</span></div>
                        <div class="field">
                            <small>Status</small>
                            <select data-id="${t.id}" aria-label="Status for ${t.title}">
                                ${statusOptions.map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}
                            </select>
                        </div>
                    </article>
                `).join("")}`;
            }).join("");
        }

        function render() {
            renderChips();
            renderTasks();
        }

        /* ---------- Mobile Menu Toggle Logic ---------- */
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        const openBtn = document.getElementById("openMenu");
        const closeBtn = document.getElementById("closeMenu");

        function toggleMenu(show) {
            sidebar.classList.toggle("open", show);
            overlay.classList.toggle("active", show);
            document.body.style.overflow = show ? "hidden" : "";
        }

        openBtn.addEventListener("click", () => toggleMenu(true));
        closeBtn.addEventListener("click", () => toggleMenu(false));
        overlay.addEventListener("click", () => toggleMenu(false));

        /* ---------- Event Handlers ---------- */
        document.getElementById("chips").addEventListener("click", e => {
            const btn = e.target.closest(".chip");
            if (!btn) return;
            activeFilter = btn.dataset.filter;
            render();
        });

        document.getElementById("task-list").addEventListener("change", e => {
            if (!e.target.matches("select")) return;
            const task = tasks.find(t => t.id === Number(e.target.dataset.id));
            if (task) {
                task.status = e.target.value;
                task.isNew = false;
                render();
            }
        });
        const navLinks = document.querySelectorAll("#nav a");

        navLinks.forEach(link => {
            link.addEventListener("click", e => {
                e.preventDefault();
                navLinks.forEach(l => l.classList.remove("active"));
                link.classList.add("active");
            });
        });
        render();