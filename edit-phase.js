const navItems = [
            { label: "Dashboard", icon: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>' },
            { label: "Forms", icon: '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2"/>' },
            { label: "Responses", icon: '<path d="M4 4h16v12H8l-4 4z" fill="none" stroke="currentColor" stroke-width="2"/>' },
            { label: "Sources & Files", icon: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />' },
            { label: "Calendar", icon: '<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2"/>' },
            { label: "Project Management", icon: '<path d="M3 8h18v12H3zM9 8V5h6v3" fill="none" stroke="currentColor" stroke-width="2"/>' },
        ];
        const currentPage = "Project Management";

        document.getElementById("nav").innerHTML = navItems.map(n => `
    <a href="#" class="${n.label === currentPage ? "active" : ""}">
      <svg viewBox="0 0 24 24" fill="currentColor">${n.icon}</svg>${n.label}
    </a>`).join("");

        const navLinks = document.querySelectorAll("#nav a");
        navLinks.forEach(link => {
            link.addEventListener("click", e => {
                e.preventDefault();
                navLinks.forEach(l => l.classList.remove("active"));
                link.classList.add("active");
                if (window.innerWidth <= 900) toggleMenu(false);
            });
        });

        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        const openBtn = document.getElementById("openMenu");
        const closeBtn = document.getElementById("closeMenu");

        function toggleMenu(show) {
            sidebar.classList.toggle("open", show);
            overlay.classList.toggle("active", show);
            document.body.style.overflow = show ? "hidden" : "";
            openBtn.setAttribute("aria-expanded", String(show));
        }

        openBtn.addEventListener("click", () => toggleMenu(true));
        closeBtn.addEventListener("click", () => toggleMenu(false));
        overlay.addEventListener("click", () => toggleMenu(false));

        const teammates = [
            { name: "Art Director", done: false },
            { name: "Content Creator", done: false },
            { name: "Graphic Designer", done: false },
            { name: "SEO Specialist", done: false },
        ];

        let assigned = [
            { id: 1, name: "Ami Mostafa", role: "Project manager", did: "Designed the home page layout and the main sections. Sent it for review.", status: "Done" },
            { id: 2, name: "Nour", role: "Designer", did: "Working on the mobile version. Half of it is done, the colours are still to do.", status: "In progress" },
        ];
        const statusColor = { Done: "green", "In progress": "orange" };

        function renderChecklist() {
            document.getElementById("checklist").innerHTML = teammates.map((t, i) => `
      <label class="check ${t.done ? "done" : ""}">
        <input type="checkbox" data-index="${i}" ${t.done ? "checked" : ""}>
        <span class="name">${t.name}</span>
        <span class="state">${t.done ? "DONE" : "NOT DONE"}</span>
      </label>`).join("");
        }

        document.getElementById("checklist").addEventListener("change", e => {
            if (!e.target.matches("input[type=checkbox]")) return;
            teammates[Number(e.target.dataset.index)].done = e.target.checked;
            renderChecklist();
        });

        function renderAssigned() {
            document.getElementById("assigned-body").innerHTML = assigned.map(a => `
      <tr>
        <td><div class="person">
          <span class="ini">${a.name.slice(0, 2).toUpperCase()}</span>
          <div><b>${a.name}</b><small>${a.role}</small></div>
        </div></td>
        <td><textarea data-id="${a.id}" aria-label="Details for ${a.name}">${a.did}</textarea></td>
        <td><span class="pill ${statusColor[a.status]}">${a.status}</span></td>
        <td><button class="icon-btn" data-delete="${a.id}" aria-label="Delete ${a.name}">🗑</button></td>
      </tr>`).join("");
        }

        const body = document.getElementById("assigned-body");

        body.addEventListener("input", e => {
            if (!e.target.matches("textarea")) return;
            assigned.find(a => a.id === Number(e.target.dataset.id)).did = e.target.value;
        });

        body.addEventListener("click", e => {
            const btn = e.target.closest("[data-delete]");
            if (!btn) return;
            assigned = assigned.filter(a => a.id !== Number(btn.dataset.delete));
            renderAssigned();
        });

        document.getElementById("add-btn").addEventListener("click", () => {
            assigned.push({ id: Date.now(), name: "New person", role: "Role", did: "", status: "In progress" });
            renderAssigned();
        });

        const notesEditor = document.getElementById("notes");
        const toolbar = document.getElementById("tools");
        const fileInput = document.getElementById("file-input");
        const addFileButton = document.getElementById("add-file-btn");

        let savedSelection = null;

        function saveSelection() {
            const selection = window.getSelection();
            if (
                selection &&
                selection.rangeCount > 0 &&
                notesEditor.contains(selection.anchorNode) &&
                notesEditor.contains(selection.focusNode)
            ) {
                savedSelection = selection.getRangeAt(0).cloneRange();
            }
        }

        function restoreSelection() {
            if (!savedSelection) return;
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }

        notesEditor.addEventListener("mouseup", saveSelection);
        notesEditor.addEventListener("keyup", saveSelection);
        notesEditor.addEventListener("input", () => {
            if (notesEditor.textContent.trim() === "" && !notesEditor.querySelector(".file-chip")) {
                notesEditor.innerHTML = "";
            }
            saveSelection();
        });

        toolbar.addEventListener("mousedown", e => {
            if (e.target.closest("button")) e.preventDefault();
        });

        toolbar.addEventListener("click", e => {
            const button = e.target.closest("button[data-cmd]");
            if (!button) return;

            notesEditor.focus();
            restoreSelection();

            const command = button.dataset.cmd;

            if (command === "createLink") {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed) {
                    alert("Select the text you want to link first.");
                    return;
                }
                const url = prompt("Enter the link URL:");
                if (url && url.trim()) document.execCommand("createLink", false, url.trim());
            } else {
                document.execCommand(command, false, null);
            }

            saveSelection();
        });

        addFileButton.addEventListener("mousedown", e => {
            e.preventDefault();
            saveSelection();
        });

        addFileButton.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", () => {
            const files = Array.from(fileInput.files || []);
            if (!files.length) return;

            notesEditor.focus();
            restoreSelection();

            files.forEach(file => {
                const chip = document.createElement("span");
                chip.className = "file-chip";
                chip.contentEditable = "false";
                chip.textContent = "📎 " + file.name;

                const selection = window.getSelection();

                if (selection && selection.rangeCount > 0 && notesEditor.contains(selection.getRangeAt(0).startContainer)) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(chip);
                    range.setStartAfter(chip);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                } else {
                    notesEditor.appendChild(chip);
                }

                notesEditor.appendChild(document.createTextNode(" "));
            });

            saveSelection();
            fileInput.value = "";
        });

        document.getElementById("save-btn").addEventListener("click", () => {
            const data = {
                title: document.getElementById("title").value,
                description: document.getElementById("desc").value,
                due: document.getElementById("due").value,
                role: document.getElementById("role").value,
                visibility: document.getElementById("visibility").value,
                priority: document.getElementById("priority").value,
                notes: notesEditor.innerHTML,
                teammates,
                assigned,
            };
            console.log("Saved:", data);
            alert("Changes saved");
        });

        document.getElementById("discard-btn").addEventListener("click", () => location.reload());

        renderChecklist();
        renderAssigned();
        lucide.createIcons();