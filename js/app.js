/* Docker Dojo — UI controller: sidebar, lesson panel, simulated terminal,
 * step validation, and localStorage progress. */
(function () {
  "use strict";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  const STORE_KEY = "docker-dojo-progress-v1";
  const BADGE_KEY = "docker-dojo-badges-v1";
  const engine = new DockerEngine();

  const state = {
    mode: "lesson", // 'lesson' | 'sandbox'
    dashView: "state", // 'state' | 'topology'
    lessonIndex: 0,
    stepIndex: 0,
    history: [],
    histPos: -1,
    completed: loadProgress(), // { lessonId: [true, true, ...] per step }
    badges: loadBadges(),      // { badgeId: true }
  };

  const BADGES = [
    { id: "first-run", icon: "📦", label: "First Container", desc: "Run your first container", test: (c) => /^docker\s+run\b/.test(c) },
    { id: "shell-ninja", icon: "🥷", label: "Shell Ninja", desc: "Enter a container shell", test: (c) => /(run|exec)\b.*-it\b/.test(c) },
    { id: "port-master", icon: "🔌", label: "Port Master", desc: "Publish a port with -p", test: (c) => /\s-p\s+\d/.test(c) },
    { id: "builder", icon: "🏗️", label: "Image Builder", desc: "Build an image", test: (c) => /docker\s+build\b/.test(c) },
    { id: "networker", icon: "🕸️", label: "Networker", desc: "Create a network", test: (c) => /network\s+create/.test(c) },
    { id: "keeper", icon: "💾", label: "Data Keeper", desc: "Create a volume", test: (c) => /volume\s+create/.test(c) },
    { id: "inspector", icon: "🔍", label: "Inspector", desc: "Inspect an object", test: (c) => /docker\s+inspect\b/.test(c) },
    { id: "composer", icon: "🎼", label: "Composer", desc: "Bring up a Compose stack", test: (c) => /compose\s+up/.test(c) },
    { id: "janitor", icon: "🧹", label: "Janitor", desc: "Prune to reclaim space", test: (c) => /\bprune\b/.test(c) },
    { id: "pipe-wizard", icon: "🪄", label: "Pipe Wizard", desc: "Use a pipe or $( ) substitution", test: (c) => /\||\$\(/.test(c) },
  ];

  function loadProgress() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function saveProgress() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state.completed)); } catch (e) {} }
  function loadBadges() { try { return JSON.parse(localStorage.getItem(BADGE_KEY)) || {}; } catch (e) { return {}; } }
  function saveBadges() { try { localStorage.setItem(BADGE_KEY, JSON.stringify(state.badges)); } catch (e) {} }
  function lessonDone(l) { const p = state.completed[l.id]; return p && p.filter(Boolean).length >= l.steps.length; }
  function completedStepCount() { return Object.values(state.completed).reduce((n, arr) => n + (arr ? arr.filter(Boolean).length : 0), 0); }

  // -------------------------------------------------------------- sidebar ----
  function renderSidebar() {
    const nav = $("#nav");
    nav.innerHTML = "";

    const sand = el("button", "nav-lesson nav-sandbox" + (state.mode === "sandbox" ? " active" : ""));
    sand.appendChild(el("span", "nav-dot", "🧪"));
    sand.appendChild(el("span", "nav-label", "Sandbox (free play)"));
    sand.addEventListener("click", enterSandbox);
    nav.appendChild(sand);

    COURSE.modules.forEach((m) => {
      nav.appendChild(el("div", "nav-module", m.title));
      m.lessons.forEach((l) => {
        const flatIdx = COURSE.flatLessons.findIndex((x) => x.id === l.id);
        const done = lessonDone(l);
        const item = el("button", "nav-lesson" + (state.mode === "lesson" && flatIdx === state.lessonIndex ? " active" : "") + (done ? " done" : ""));
        const dot = el("span", "nav-dot", done ? "✓" : "");
        item.appendChild(dot);
        item.appendChild(el("span", "nav-label", l.title));
        item.addEventListener("click", () => selectLesson(flatIdx));
        nav.appendChild(item);
      });
    });
    updateProgressRing();
  }

  function updateProgressRing() {
    const pct = COURSE.totalSteps ? completedStepCount() / COURSE.totalSteps : 0;
    const ring = $("#ring-fg");
    const C = 2 * Math.PI * 16;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - pct);
    $("#ring-pct").textContent = Math.round(pct * 100) + "%";
    $("#progress-label").textContent = completedStepCount() + " / " + COURSE.totalSteps + " steps";
  }

  // -------------------------------------------------------------- lesson -----
  function selectLesson(idx) {
    state.mode = "lesson";
    state.lessonIndex = idx;
    state.stepIndex = firstIncompleteStep(COURSE.flatLessons[idx]);
    resetTerminal(true);
    renderSidebar();
    renderLesson();
    focusInput();
  }

  function firstIncompleteStep(l) {
    const p = state.completed[l.id] || [];
    for (let i = 0; i < l.steps.length; i++) if (!p[i]) return i;
    return l.steps.length - 1;
  }

  function renderLesson() {
    const l = COURSE.flatLessons[state.lessonIndex];
    const panel = $("#lesson");
    panel.innerHTML = "";

    panel.appendChild(el("div", "lesson-kicker", l.moduleTitle));
    panel.appendChild(el("h1", "lesson-title", l.title));
    panel.appendChild(el("p", "lesson-sub", l.subtitle));
    panel.appendChild(el("div", "lesson-intro", l.intro));

    if (l.concepts) {
      const grid = el("div", "concept-grid");
      l.concepts.forEach(([t, d]) => {
        const card = el("div", "concept");
        card.appendChild(el("code", "concept-term", t));
        card.appendChild(el("span", "concept-def", d));
        grid.appendChild(card);
      });
      panel.appendChild(grid);
    }

    panel.appendChild(el("div", "steps-head", "Steps"));
    const steps = el("ol", "steps");
    const progress = state.completed[l.id] || [];
    l.steps.forEach((s, i) => {
      const done = !!progress[i];
      const current = i === state.stepIndex && !done;
      const li = el("li", "step" + (done ? " done" : "") + (current ? " current" : ""));
      const mark = el("span", "step-mark", done ? "✓" : String(i + 1));
      li.appendChild(mark);
      const body = el("div", "step-body");
      body.appendChild(el("div", "step-text", s.instruction));
      const tools = el("div", "step-tools");
      const hintBtn = el("button", "hint-btn", "Show hint");
      const hint = el("div", "step-hint hidden", s.hint);
      hintBtn.addEventListener("click", () => { hint.classList.toggle("hidden"); hintBtn.textContent = hint.classList.contains("hidden") ? "Show hint" : "Hide hint"; });
      const runBtn = el("button", "run-btn", "Insert command");
      runBtn.addEventListener("click", () => { $("#cmd").value = s.cmd; focusInput(); });
      tools.appendChild(hintBtn);
      tools.appendChild(runBtn);
      body.appendChild(tools);
      body.appendChild(hint);
      li.appendChild(body);
      steps.appendChild(li);
    });
    panel.appendChild(steps);

    // completion banner + next button
    if (lessonDone(l)) {
      const banner = el("div", "complete-banner", "🎉 <b>Lesson complete!</b> Nicely done.");
      panel.appendChild(banner);
    }
    const navRow = el("div", "lesson-nav");
    const prev = el("button", "ghost-btn", "← Previous");
    prev.disabled = state.lessonIndex === 0;
    prev.addEventListener("click", () => selectLesson(state.lessonIndex - 1));
    const next = el("button", "primary-btn", state.lessonIndex === COURSE.flatLessons.length - 1 ? "Finish" : "Next lesson →");
    next.disabled = state.lessonIndex === COURSE.flatLessons.length - 1;
    next.addEventListener("click", () => selectLesson(state.lessonIndex + 1));
    navRow.appendChild(prev);
    navRow.appendChild(next);
    panel.appendChild(navRow);
  }

  // ------------------------------------------------------------ terminal -----
  function resetTerminal(runSetup) {
    engine.reset();
    const l = COURSE.flatLessons[state.lessonIndex];
    if (runSetup && l && typeof l.setup === "function") l.setup(engine);
    const out = $("#term-output");
    out.innerHTML = "";
    printLine("Docker Dojo terminal — this is a safe simulation. Type the commands from the steps on the left.", "banner");
    printLine('Tips: press Tab to autocomplete · ↑/↓ for history · type "help" to list commands.', "dim");
    updatePrompt();
    renderDashboard();
  }

  function updatePrompt() {
    const p = engine.getPrompt();
    $("#prompt").innerHTML =
      '<span class="p-user">' + p.user + "@" + p.host + "</span>" +
      '<span class="p-path">' + p.path + "</span>" +
      '<span class="p-sym">' + p.symbol + "</span>";
  }

  function printLine(text, cls) {
    const out = $("#term-output");
    (text.includes("\n") ? text.split("\n") : [text]).forEach((t) => {
      out.appendChild(el("div", "term-line " + (cls || ""), escapeHtml(t)));
    });
  }
  function printEcho(cmd) {
    const p = engine.getPrompt();
    const out = $("#term-output");
    const line = el("div", "term-line echo");
    line.innerHTML = '<span class="p-user">' + p.user + "@" + p.host + '</span><span class="p-path">' + p.path + '</span><span class="p-sym">' + p.symbol + "</span> " + escapeHtml(cmd);
    out.appendChild(line);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  function runCommand(raw) {
    printEcho(raw);
    if (raw.trim()) { state.history.push(raw); state.histPos = state.history.length; }
    const result = engine.execLine(raw);
    result.forEach((r) => {
      if (r.clear) { $("#term-output").innerHTML = ""; return; }
      printLine(r.text, r.cls);
    });
    updatePrompt();
    awardBadges(raw);
    if (state.mode === "lesson") checkStep(raw);
    renderDashboard();
    scrollTerm();
  }

  function checkStep(raw) {
    const l = COURSE.flatLessons[state.lessonIndex];
    const step = l.steps[state.stepIndex];
    if (!step) return;
    let ok = false;
    try { ok = step.check(raw, engine); } catch (e) { ok = false; }
    if (!ok) return;

    if (!state.completed[l.id]) state.completed[l.id] = [];
    state.completed[l.id][state.stepIndex] = true;
    saveProgress();
    flashStepDone();

    // advance to next incomplete step in this lesson
    const nextIdx = l.steps.findIndex((s, i) => !state.completed[l.id][i]);
    const wasLast = nextIdx === -1;
    state.stepIndex = wasLast ? l.steps.length - 1 : nextIdx;

    renderLesson();
    renderSidebar();
    if (wasLast) celebrate();
  }

  function flashStepDone() {
    printLine("✓ Step complete", "success");
  }
  function celebrate() {
    printLine("", "");
    printLine("🎉 Lesson complete — great work! Use “Next lesson” on the left to continue.", "celebrate");
    const host = $("#confetti");
    host.classList.remove("hidden");
    host.innerHTML = "";
    for (let i = 0; i < 40; i++) {
      const c = el("i", "confetti-bit");
      c.style.left = Math.random() * 100 + "%";
      c.style.animationDelay = Math.random() * 0.4 + "s";
      c.style.background = ["#2496ED", "#38bdf8", "#22d3ee", "#a78bfa", "#34d399"][i % 5];
      host.appendChild(c);
    }
    setTimeout(() => host.classList.add("hidden"), 2200);
  }

  function scrollTerm() { const t = $("#term-scroll"); t.scrollTop = t.scrollHeight; }
  function focusInput() { $("#cmd").focus(); }

  // ------------------------------------------------------------- events ------
  // ----------------------------------------------------------- dashboard -----
  function renderDashboard() {
    const body = $("#dash-body");
    if (!body) return;
    if (state.dashView === "topology") { body.innerHTML = renderTopology(); return; }
    const cs = engine.containers;
    const running = cs.filter((c) => c.status === "running").length;
    const paused = cs.filter((c) => c.status === "paused").length;
    const stopped = cs.filter((c) => c.status !== "running" && c.status !== "paused").length;
    const imgCount = Object.keys(engine.images).length;

    // stat tiles
    const stats = [
      ["Containers", cs.length, running + " up", "run"],
      ["Images", imgCount, "cached", "img"],
      ["Networks", engine.networks.length, (engine.networks.length - 3) + " custom", "net"],
      ["Volumes", engine.volumes.length, "named", "vol"],
    ];
    let html = '<div class="dash-stats">' + stats.map(([label, n, sub, k]) =>
      '<div class="stat s-' + k + '"><span class="stat-n">' + n + '</span><span class="stat-l">' + label + '</span><span class="stat-s">' + sub + "</span></div>"
    ).join("") + "</div>";

    // containers
    html += '<div class="dash-sec"><h5>Containers <small>' + running + " running · " + paused + " paused · " + stopped + " stopped" + (cs.length ? " · click a card to inspect" : "") + "</small></h5>";
    if (!cs.length) {
      html += '<div class="dash-empty">No containers yet — try <code>docker run -d --name web nginx</code></div>';
    } else {
      html += '<div class="cbox-grid">' + cs.map((c) => {
        const cls = c.status === "running" ? "run" : c.status === "paused" ? "pause" : "exit";
        const nm = escapeHtml(c.name);
        const ports = c.ports ? '<span class="cbox-tag port">' + escapeHtml(c.ports) + "</span>" : "";
        const net = c.network && c.network !== "bridge" ? '<span class="cbox-tag net">' + escapeHtml(c.network) + "</span>" : "";
        const mnt = (c.mounts && c.mounts.length) ? '<span class="cbox-tag vol">💾 ' + escapeHtml(c.mounts[0].split(":")[0]) + "</span>" : "";
        const isUp = c.status === "running";
        const actions = '<div class="cbox-actions">' +
          '<button class="cba" data-action="inspect" data-name="' + nm + '" title="docker inspect">🔍</button>' +
          '<button class="cba" data-action="logs" data-name="' + nm + '" title="docker logs">📄</button>' +
          '<button class="cba" data-action="toggle" data-name="' + nm + '" title="' + (isUp ? "docker stop" : "docker start") + '">' + (isUp ? "⏹" : "▶") + "</button>" +
          '<button class="cba danger" data-action="rm" data-name="' + nm + '" title="docker rm -f">🗑</button>' +
          "</div>";
        return '<div class="cbox ' + cls + '" data-name="' + nm + '" title="Click to inspect ' + nm + '"><div class="cbox-top"><i class="dot ' + cls + '"></i><b>' + nm + '</b><span class="cbox-id">' + c.id.slice(0, 12) + "</span></div>" +
          '<div class="cbox-img">' + escapeHtml(c.image) + '</div>' +
          '<div class="cbox-cmd">' + escapeHtml(c.cmd || "") + "</div>" +
          (ports || net || mnt ? '<div class="cbox-tags">' + ports + net + mnt + "</div>" : "") +
          actions + "</div>";
      }).join("") + "</div>";
    }
    html += "</div>";

    // networks + volumes + images chips
    const chipRow = (title, items, cls) => '<div class="dash-sec half"><h5>' + title + "</h5>" +
      (items.length ? '<div class="chips">' + items.map((x) => '<span class="chip ' + cls + '">' + escapeHtml(x) + "</span>").join("") + "</div>" : '<div class="dash-empty sm">none</div>') + "</div>";
    html += '<div class="dash-cols">';
    html += chipRow("Networks", engine.networks.map((n) => n.name + (n.builtin ? "" : " ✦")), "net");
    html += chipRow("Volumes", engine.volumes.map((v) => v.name), "vol");
    html += "</div>";
    html += '<div class="dash-sec"><h5>Images</h5><div class="chips">' + Object.keys(engine.images).map((n) => '<span class="chip img">' + escapeHtml(n) + ":" + engine.images[n].tag + "</span>").join("") + "</div></div>";

    body.innerHTML = html;
  }

  // -------------------------------------------------- live metrics (sim) -----
  const metrics = {}; // containerId -> { cpu, mem(MiB) } that drift over time
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  function metricFor(c) {
    if (!metrics[c.id]) metrics[c.id] = { cpu: 1.5 + Math.random() * 7, mem: 18 + Math.random() * 70 };
    return metrics[c.id];
  }
  function tickMetrics() {
    engine.containers.forEach((c) => {
      if (c.status !== "running") return;
      const m = metricFor(c);
      m.cpu = clampN(m.cpu + (Math.random() - 0.45) * 7, 0.3, 92);
      m.mem = clampN(m.mem + (Math.random() - 0.5) * 12, 8, 470);
    });
  }
  function applyMetricBars() {
    engine.containers.forEach((c) => {
      if (c.status !== "running") return;
      const m = metrics[c.id];
      if (!m) return;
      document.querySelectorAll('rect[data-metric][data-id="' + c.id + '"]').forEach((el) => {
        const barW = parseFloat(el.getAttribute("data-max")) || 0;
        const pct = el.getAttribute("data-metric") === "cpu" ? m.cpu : Math.min(m.mem / 480 * 100, 100);
        el.setAttribute("width", (pct / 100 * barW).toFixed(1));
      });
      document.querySelectorAll('text[data-val][data-id="' + c.id + '"]').forEach((el) => {
        el.textContent = el.getAttribute("data-val") === "cpu" ? Math.round(m.cpu) + "%" : Math.round(m.mem) + "M";
      });
    });
  }
  function startMetricsTicker() {
    setInterval(() => {
      if (state.dashView !== "topology") return;
      if (document.body.classList.contains("dash-collapsed")) return;
      if (document.hidden) return;
      tickMetrics();
      applyMetricBars();
    }, 950);
  }

  // ---------------------------------------------------- topology diagram -----
  function renderTopology() {
    const W = 760;
    const conts = engine.containers;
    const esc = escapeHtml;
    const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

    // which networks to show: any non-builtin, plus any that has containers
    const names = [];
    engine.networks.forEach((n) => { if (!n.builtin || conts.some((c) => (c.network || "bridge") === n.name)) names.push(n.name); });
    conts.forEach((c) => { const nn = c.network || "bridge"; if (names.indexOf(nn) < 0) names.push(nn); });
    if (!names.length) return '<div class="dash-empty">No active networks yet — run a container, or <code>docker network create appnet</code>.</div>';

    const N = names.length, netW = W / N, CAP = 6, rowGap = 84, baseY = 220;
    const driverOf = (nm) => { const n = engine.networks.find((x) => x.name === nm); return n ? n.driver : "bridge"; };
    const groups = names.map((nm, i) => ({ nm, i, hubX: netW * (i + 0.5), cs: conts.filter((c) => (c.network || "bridge") === nm) }));
    const maxC = Math.max(1, ...groups.map((g) => Math.min(g.cs.length, CAP)));
    const H = baseY + maxC * rowGap + 6;

    const hostX = W / 2, hostY = 36;
    const rrect = (x, y, w, h, cls) => '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - h / 2).toFixed(1) + '" width="' + w + '" height="' + h + '" rx="9" class="' + cls + '"/>';
    const txt = (x, y, s, cls, anchor) => '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || "start") + '" class="' + cls + '">' + s + "</text>";
    const parts = ['<svg class="topo" viewBox="0 0 ' + W + " " + H + '" width="100%" preserveAspectRatio="xMidYMin meet">'];

    // links: host -> each network hub (animated when the net has a running container)
    groups.forEach((g) => {
      const live = g.cs.some((c) => c.status === "running");
      const hx = g.hubX.toFixed(1);
      parts.push('<line x1="' + hostX + '" y1="58" x2="' + hx + '" y2="112" class="topo-link' + (live ? " flow" : "") + '"/>');
      if (live) parts.push('<circle r="2.6" class="topo-packet"><animateMotion dur="1.3s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" path="M ' + hostX + ' 58 L ' + hx + ' 112"/></circle>');
    });

    // per network: spine + hub + container nodes
    groups.forEach((g) => {
      const shown = g.cs.slice(0, CAP);
      const live = shown.some((c) => c.status === "running");
      if (shown.length) {
        const lastY = baseY + (shown.length - 1) * rowGap + 27;
        parts.push('<line x1="' + g.hubX.toFixed(1) + '" y1="151" x2="' + g.hubX.toFixed(1) + '" y2="' + lastY.toFixed(1) + '" class="topo-spine' + (live ? " flow" : "") + '"/>');
      }
      const nw = Math.min(netW - 20, 150);
      parts.push(rrect(g.hubX, 132, nw, 40, "topo-nnode"));
      parts.push(txt(g.hubX, 128, "🕸 " + esc(trunc(g.nm, 16)), "topo-nname", "middle"));
      parts.push(txt(g.hubX, 143, esc(driverOf(g.nm)) + (g.cs.length ? " · " + g.cs.length : ""), "topo-nsub", "middle"));

      shown.forEach((c, j) => {
        const cy = baseY + j * rowGap, cw = Math.min(netW - 22, 182), h = 64;
        const cls = c.status === "running" ? "run" : c.status === "paused" ? "pause" : "exit";
        const lx = g.hubX - cw / 2;
        parts.push('<g class="topo-cont" data-name="' + esc(c.name) + '" style="cursor:pointer">');
        parts.push(rrect(g.hubX, cy, cw, h, "topo-cnode " + cls));
        parts.push('<circle cx="' + (lx + 14).toFixed(1) + '" cy="' + (cy - 20).toFixed(1) + '" r="4.5" class="topo-dot ' + cls + '"/>');
        parts.push(txt(lx + 26, cy - 16, esc(trunc(c.name, 15)), "topo-cname"));
        parts.push(txt(lx + 14, cy - 2, esc(trunc(c.image, 18)), "topo-cimg"));
        if (c.status === "running") {
          const barStart = lx + 40, barW = Math.max(26, cw - 80), valX = barStart + barW + 4;
          const m = metricFor(c), memPct = Math.min(m.mem / 480 * 100, 100);
          const bar = (y, wpct, cls2, metric) =>
            '<rect x="' + barStart.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="5" rx="2.5" class="topo-mtrack"/>' +
            '<rect x="' + barStart.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (wpct / 100 * barW).toFixed(1) + '" height="5" rx="2.5" class="' + cls2 + '" data-metric="' + metric + '" data-id="' + c.id + '" data-max="' + barW.toFixed(1) + '"/>';
          parts.push(txt(lx + 14, cy + 12, "CPU", "topo-mlab"));
          parts.push(bar(cy + 7, m.cpu, "topo-mcpu", "cpu"));
          parts.push('<text x="' + valX.toFixed(1) + '" y="' + (cy + 12).toFixed(1) + '" class="topo-mval" data-val="cpu" data-id="' + c.id + '">' + Math.round(m.cpu) + "%</text>");
          parts.push(txt(lx + 14, cy + 25, "MEM", "topo-mlab"));
          parts.push(bar(cy + 20, memPct, "topo-mmem", "mem"));
          parts.push('<text x="' + valX.toFixed(1) + '" y="' + (cy + 25).toFixed(1) + '" class="topo-mval" data-val="mem" data-id="' + c.id + '">' + Math.round(m.mem) + "M</text>");
        } else if (c.ports) {
          parts.push(txt(lx + 14, cy + 16, "▸ " + esc(c.ports.replace("0.0.0.0:", "").replace("/tcp", "")), "topo-cport"));
        } else if (c.mounts && c.mounts.length) {
          parts.push(txt(lx + 14, cy + 16, "💾 " + esc(c.mounts[0].split(":")[0]), "topo-cvol"));
        }
        parts.push("</g>");
      });
      if (g.cs.length > CAP) parts.push(txt(g.hubX, baseY + CAP * rowGap - 14, "+" + (g.cs.length - CAP) + " more", "topo-more", "middle"));
    });

    // host node on top
    const running = conts.filter((c) => c.status === "running").length;
    parts.push(rrect(hostX, hostY, 168, 44, "topo-hnode"));
    parts.push(txt(hostX, hostY - 5, "🐳 Docker Host", "topo-hname", "middle"));
    parts.push(txt(hostX, hostY + 11, conts.length + " containers · " + running + " running", "topo-hsub", "middle"));
    parts.push("</svg>");
    return parts.join("");
  }

  // clicking a container card (or its action buttons) drives the terminal
  function dashCardClick(ev) {
    const btn = ev.target.closest(".cba");
    const card = ev.target.closest("[data-name]");
    if (!card) return;
    const name = (btn || card).getAttribute("data-name");
    if (!name) return;
    if (engine.shellStack.length) {
      printLine("↳ Exit the container shell first (type: exit) to use dashboard actions.", "dim");
      scrollTerm();
      return;
    }
    const action = btn ? btn.getAttribute("data-action") : "inspect";
    let cmd = "docker inspect " + name;
    if (action === "logs") cmd = "docker logs " + name;
    else if (action === "rm") cmd = "docker rm -f " + name;
    else if (action === "toggle") {
      const c = engine.findContainer(name);
      cmd = (c && c.status === "running") ? "docker stop " + name : "docker start " + name;
    }
    $("#cmd").value = "";
    runCommand(cmd);
    focusInput();
  }

  // ------------------------------------------------------------- badges ------
  function awardBadges(raw) {
    BADGES.forEach((b) => {
      if (state.badges[b.id]) return;
      let hit = false;
      try { hit = b.test(raw); } catch (e) { hit = false; }
      if (hit) { state.badges[b.id] = true; saveBadges(); toastBadge(b); updateBadgeCount(); }
    });
  }
  function badgeCount() { return BADGES.filter((b) => state.badges[b.id]).length; }
  function updateBadgeCount() { const n = $("#badge-count"); if (n) n.textContent = badgeCount() + "/" + BADGES.length; }
  function toastBadge(b) {
    const host = $("#toasts");
    const t = el("div", "toast", '<span class="toast-icon">' + b.icon + "</span><div><b>Badge unlocked · " + b.label + "</b><small>" + b.desc + "</small></div>");
    host.appendChild(t);
    setTimeout(() => t.classList.add("show"), 20);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200);
  }
  function openBadges() {
    const body = BADGES.map((b) => {
      const got = !!state.badges[b.id];
      return '<div class="badge-card ' + (got ? "earned" : "locked") + '"><span class="badge-icon">' + (got ? b.icon : "🔒") + '</span><b>' + b.label + "</b><small>" + b.desc + "</small></div>";
    }).join("");
    openOverlay("🏅 Achievements — " + badgeCount() + "/" + BADGES.length, '<div class="badge-grid">' + body + "</div>");
  }

  // ------------------------------------------------------------ overlay ------
  function openOverlay(title, html) {
    $("#overlay-title").innerHTML = title;
    $("#overlay-body").innerHTML = html;
    $("#overlay").classList.remove("hidden");
  }
  function closeOverlay() { $("#overlay").classList.add("hidden"); }

  const CHEATS = [
    ["Lifecycle", ["docker run -d --name web nginx", "docker ps  ·  docker ps -a  ·  docker ps -q", "docker stop|start|restart|pause|kill <c>", "docker rm <c>  ·  docker rm -f <c>"]],
    ["Images", ["docker pull nginx", "docker images  ·  docker rmi <img>", "docker build -t app .  ·  docker tag a b", "docker history <img>  ·  docker commit <c> img"]],
    ["Inside", ["docker run -it ubuntu bash", "docker exec -it web bash", "docker logs -f web  ·  docker top web", "docker cp web:/path ./  ·  docker stats"]],
    ["Networking", ["docker network create appnet", "docker run --network appnet ...", "docker network ls|inspect|rm"]],
    ["Storage", ["docker volume create data", "docker run -v data:/path ...", "docker volume ls|inspect|prune"]],
    ["Compose", ["docker compose up -d", "docker compose ps  ·  logs", "docker compose down"]],
    ["Power moves", ["docker ps --filter status=exited", "docker ps --format '{{.Names}}'", "docker rm $(docker ps -aq)", "docker ps -q | wc -l"]],
    ["System", ["docker inspect -f '{{.State.Status}}' web", "docker system df  ·  system prune -f", "docker info  ·  docker version"]],
  ];
  function openCheats() {
    const html = '<div class="cheat-grid">' + CHEATS.map(([h, items]) =>
      '<div class="cheat-col"><h4>' + h + "</h4>" + items.map((i) => '<code>' + i.replace(/</g, "&lt;") + "</code>").join("") + "</div>"
    ).join("") + "</div>";
    openOverlay("⌨️ Docker command cheat-sheet", html);
  }

  // ------------------------------------------------------------ sandbox ------
  function enterSandbox() {
    state.mode = "sandbox";
    engine.reset();
    engine.hasCompose = ["services:", "  web: { image: nginx, ports: [\"8080:80\"] }", "  db:  { image: redis }"];
    applyDockerfileText(DEFAULT_DOCKERFILE, true);
    resetTerminalForSandbox();
    renderSandbox();
    renderSidebar();
    focusInput();
  }
  function resetTerminalForSandbox() {
    const out = $("#term-output");
    out.innerHTML = "";
    printLine("🧪 Sandbox mode — no lessons, no rules. Every command persists until you reset.", "banner");
    printLine("A compose.yaml and an editable Dockerfile are already here. Tab completes, ↑/↓ = history.", "dim");
    updatePrompt();
    renderDashboard();
  }
  const DEFAULT_DOCKERFILE = "FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD [\"node\", \"server.js\"]";
  function applyDockerfileText(text, silent) {
    engine.hasDockerfile = text.split("\n").map((l) => l).filter((l) => l.trim().length);
    if (!silent) { printLine("✓ Dockerfile saved — try: docker build -t myapp .", "success"); scrollTerm(); }
  }
  function renderSandbox() {
    const panel = $("#lesson");
    panel.innerHTML = "";
    panel.appendChild(el("div", "lesson-kicker", "Free play"));
    panel.appendChild(el("h1", "lesson-title", "🧪 Sandbox"));
    panel.appendChild(el("p", "lesson-sub", "Experiment freely — state persists across commands. Try pipes, $( ), and multi-container networking."));
    panel.appendChild(el("div", "lesson-intro",
      "Ideas to try:<br>• <code>docker run -d -p 8080:80 --name web nginx</code> then <code>docker exec -it web bash</code><br>" +
      "• <code>docker rm -f $(docker ps -aq)</code> to nuke everything<br>• <code>docker compose up -d</code> then <code>docker compose ps</code><br>" +
      "• Edit the Dockerfile below, then <code>docker build -t myapp .</code> and <code>docker run -d myapp</code>."));

    const wrap = el("div", "editor-wrap");
    wrap.appendChild(el("div", "editor-head", "Dockerfile"));
    const ta = el("textarea", "editor");
    ta.id = "dockerfile-edit";
    ta.spellcheck = false;
    ta.value = engine.hasDockerfile ? engine.hasDockerfile.join("\n") : DEFAULT_DOCKERFILE;
    wrap.appendChild(ta);
    const applyBtn = el("button", "primary-btn", "Save Dockerfile");
    applyBtn.addEventListener("click", () => { applyDockerfileText(ta.value, false); focusInput(); });
    wrap.appendChild(applyBtn);
    panel.appendChild(wrap);

    const refBtn = el("button", "ghost-btn", "⌨️ Open command cheat-sheet");
    refBtn.style.marginTop = "16px";
    refBtn.addEventListener("click", openCheats);
    panel.appendChild(refBtn);
  }

  const DOCKER_SUBS = ["run", "create", "ps", "images", "pull", "push", "build", "exec", "logs", "inspect", "stop", "start", "restart", "pause", "unpause", "kill", "rm", "rmi", "rename", "top", "stats", "diff", "port", "cp", "commit", "tag", "history", "network", "volume", "compose", "system", "container", "image", "version", "info", "search", "attach", "wait", "update", "export", "import", "save", "load", "events", "context", "builder", "scout", "login"];
  const TOP_CMDS = ["docker", "clear", "help", "ls", "cat", "echo", "pwd", "whoami"];

  function completeInput(input) {
    const val = input.value;
    const parts = val.split(/\s+/);
    let pool = null, prefix = "";
    if (parts.length === 1) { pool = TOP_CMDS; prefix = parts[0]; }
    else if (parts[0] === "docker" && parts.length === 2) { pool = DOCKER_SUBS; prefix = parts[1]; }
    if (!pool) return;
    const matches = pool.filter((w) => w.startsWith(prefix));
    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      input.value = parts.join(" ") + " ";
    } else if (matches.length > 1) {
      printLine(matches.join("   "), "dim");
      scrollTerm();
      // complete to longest common prefix
      let lcp = matches[0];
      matches.forEach((m) => { while (!m.startsWith(lcp)) lcp = lcp.slice(0, -1); });
      parts[parts.length - 1] = lcp;
      input.value = parts.join(" ");
    }
  }

  function wireEvents() {
    const input = $("#cmd");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        completeInput(input);
        return;
      }
      if (e.key === "Enter") {
        const v = input.value;
        input.value = "";
        runCommand(v);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.history.length && state.histPos > 0) { state.histPos--; input.value = state.history[state.histPos]; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.histPos < state.history.length - 1) { state.histPos++; input.value = state.history[state.histPos]; }
        else { state.histPos = state.history.length; input.value = ""; }
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault(); $("#term-output").innerHTML = "";
      }
    });
    $("#term").addEventListener("click", (e) => { if (!window.getSelection().toString()) focusInput(); });
    $("#reset-term").addEventListener("click", () => { resetTerminal(true); scrollTerm(); focusInput(); });
    $("#reset-progress").addEventListener("click", () => {
      if (confirm("Reset all progress? This clears every completed step.")) {
        state.completed = {}; saveProgress(); selectLesson(0);
      }
    });
    $("#sidebar-toggle").addEventListener("click", () => document.body.classList.toggle("nav-collapsed"));
    $("#dash-body").addEventListener("click", dashCardClick);
    const setView = (v) => {
      state.dashView = v;
      $("#view-state").classList.toggle("active", v === "state");
      $("#view-topo").classList.toggle("active", v === "topology");
      if (document.body.classList.contains("dash-collapsed")) { document.body.classList.remove("dash-collapsed"); $("#dash-toggle").textContent = "▾"; }
      renderDashboard();
    };
    $("#view-state").addEventListener("click", () => setView("state"));
    $("#view-topo").addEventListener("click", () => setView("topology"));
    $("#dash-toggle").addEventListener("click", () => {
      document.body.classList.toggle("dash-collapsed");
      $("#dash-toggle").textContent = document.body.classList.contains("dash-collapsed") ? "▴" : "▾";
    });
    $("#cheats-btn").addEventListener("click", openCheats);
    $("#badges-btn").addEventListener("click", openBadges);
    $("#overlay-close").addEventListener("click", closeOverlay);
    $("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeOverlay(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlay(); });
  }

  // --------------------------------------------------------------- init ------
  function init() {
    renderSidebar();
    state.lessonIndex = 0;
    state.stepIndex = firstIncompleteStep(COURSE.flatLessons[0]);
    resetTerminal(true);
    renderLesson();
    wireEvents();
    updateBadgeCount();
    startMetricsTicker();
    focusInput();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
