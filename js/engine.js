/* Docker Dojo — a simulated Docker engine.
 * No real containers run. This maintains a small virtual state (images,
 * containers, an in-container shell stack) and produces faithful-looking
 * output so learners can practice real commands safely in the browser.
 */
(function (global) {
  "use strict";

  // ---- image registry -----------------------------------------------------
  const IMAGES = {
    "hello-world": { size: "13.3kB", cmd: "/hello", os: "n/a" },
    nginx: { size: "187MB", cmd: "nginx -g 'daemon off;'", os: "debian", expose: "80/tcp" },
    ubuntu: { size: "78.1MB", cmd: "/bin/bash", os: "ubuntu" },
    alpine: { size: "7.05MB", cmd: "/bin/sh", os: "alpine" },
    redis: { size: "138MB", cmd: "docker-entrypoint.s…", os: "debian", expose: "6379/tcp" },
    postgres: { size: "438MB", cmd: "docker-entrypoint.s…", os: "debian", expose: "5432/tcp" },
    mongo: { size: "756MB", cmd: "docker-entrypoint.s…", os: "ubuntu", expose: "27017/tcp" },
    mysql: { size: "621MB", cmd: "docker-entrypoint.s…", os: "debian", expose: "3306/tcp" },
    httpd: { size: "148MB", cmd: "httpd-foreground", os: "debian", expose: "80/tcp" },
    python: { size: "1.02GB", cmd: "python3", os: "debian" },
    node: { size: "1.1GB", cmd: "node", os: "debian" },
    busybox: { size: "4.26MB", cmd: "sh", os: "busybox" },
    myapp: { size: "129MB", cmd: "node server.js", os: "debian", built: true },
  };

  const ADJ = ["nifty", "elated", "jovial", "keen", "brave", "vivid", "gentle", "clever", "eager", "bold"];
  const SCI = ["turing", "hopper", "curie", "tesla", "bohr", "newton", "darwin", "lovelace", "einstein", "galileo"];

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function hex(n) { let s = ""; const h = "0123456789abcdef"; for (let i = 0; i < n; i++) s += h[Math.floor(Math.random() * 16)]; return s; }
  function randomName() { return rnd(ADJ) + "_" + rnd(SCI); }

  function tokenize(str) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(str)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
  }

  function splitImageTag(ref) {
    const i = ref.lastIndexOf(":");
    if (i > 0 && !ref.slice(i + 1).includes("/")) return [ref.slice(0, i), ref.slice(i + 1)];
    return [ref, "latest"];
  }

  // ---- output helpers ------------------------------------------------------
  function L(text, cls) { return { text: text ?? "", cls: cls || "" }; }
  function table(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || "").length)));
    const fmt = (cells) => cells.map((c, i) => (c || "").padEnd(i === cells.length - 1 ? 0 : widths[i])).join("   ").replace(/\s+$/, "");
    return [L(fmt(headers))].concat(rows.map((r) => L(fmt(r))));
  }

  // ---- engine --------------------------------------------------------------
  function Engine() { this.reset(); }

  Engine.prototype.reset = function () {
    this.images = { "hello-world": { tag: "latest", id: hex(12), size: IMAGES["hello-world"].size } };
    this.containers = [];
    this.shellStack = []; // container contexts we've "exec"'d into
    this.networks = [
      { name: "bridge", id: hex(12), driver: "bridge", scope: "local", builtin: true },
      { name: "host", id: hex(12), driver: "host", scope: "local", builtin: true },
      { name: "none", id: hex(12), driver: "null", scope: "local", builtin: true },
    ];
    this.volumes = [];
    this.now = Date.now();
    this.hasDockerfile = false; // set true by lessons that provide one
    this.hasCompose = false; // set true by lessons that provide a compose file
  };

  Engine.prototype.findImageName = function (ref) {
    const [name] = splitImageTag(ref);
    return this.images[name] ? name : null;
  };
  Engine.prototype.findNetwork = function (ref) { return this.networks.find((n) => n.name === ref || n.id.startsWith(ref)) || null; };
  Engine.prototype.findVolume = function (ref) { return this.volumes.find((v) => v.name === ref) || null; };

  Engine.prototype.getPrompt = function () {
    if (this.shellStack.length) {
      const c = this.shellStack[this.shellStack.length - 1];
      return { user: "root", host: c.id.slice(0, 12), path: c.cwd, symbol: "#" };
    }
    return { user: "learner", host: "docker-dojo", path: "~", symbol: "$" };
  };

  Engine.prototype.timeAgo = function () { return "Less than a second ago"; };

  Engine.prototype.findContainer = function (ref) {
    return this.containers.find((c) => c.name === ref || c.id.startsWith(ref)) || null;
  };

  // main entry: returns array of {text, cls}
  Engine.prototype.exec = function (raw) {
    const line = (raw || "").trim();
    if (this.shellStack.length) return this.innerExec(line);
    if (line === "") return [];
    const t = tokenize(line);

    switch (t[0]) {
      case "docker": return this.docker(t.slice(1), line);
      case "clear": case "cls": return [{ clear: true }];
      case "help": return this.dojoHelp();
      case "ls": return [L("Dockerfile  app  package.json  README.md")];
      case "pwd": return [L("/home/learner/project")];
      case "whoami": return [L("learner")];
      case "cat":
        if (t[1] === "Dockerfile" && this.hasDockerfile) return this.hasDockerfile.map((x) => L(x, "dim"));
        if ((t[1] === "compose.yaml" || t[1] === "docker-compose.yml") && Array.isArray(this.hasCompose)) return this.hasCompose.map((x) => L(x, "dim"));
        return [L("cat: " + (t[1] || "") + ": No such file or directory", "err")];
      case "echo": return [L(t.slice(1).join(" "))];
      default:
        return [L(t[0] + ": command not found", "err"), L('Type "help" to see what this dojo terminal supports.', "dim")];
    }
  };

  // ---- shell orchestration: substitution, chaining, pipes -----------------
  // app.js calls this instead of exec(); it returns the same {text,cls} array.
  Engine.prototype.execLine = function (raw) {
    const line = (raw || "").trim();
    if (line === "") return this.exec(line);
    let expanded = this.shellStack.length ? line : this.expandSubst(line);
    // split on top-level && or ; (naive but fine for the sim)
    const segments = expanded.split(/\s*(?:&&|;)\s*/).filter((s) => s.length);
    let out = [];
    for (const seg of segments) {
      if (!this.shellStack.length && seg.includes("|")) out = out.concat(this.execPipe(seg));
      else out = out.concat(this.exec(seg));
    }
    return out;
  };

  Engine.prototype.expandSubst = function (line) {
    let s = line, guard = 0;
    const re = /\$\(([^()]*)\)|`([^`]*)`/;
    let m;
    while ((m = re.exec(s)) && guard++ < 12) {
      const inner = m[1] != null ? m[1] : m[2];
      const res = this.exec(inner).filter((r) => r && r.text != null && !r.clear).map((r) => r.text).filter((t) => t !== "").join(" ");
      s = s.slice(0, m.index) + res + s.slice(m.index + m[0].length);
    }
    return s;
  };

  Engine.prototype.execPipe = function (seg) {
    const parts = seg.split("|").map((s) => s.trim());
    let lines = this.exec(parts[0]).filter((r) => r && r.text != null && !r.clear).map((r) => r.text);
    for (let i = 1; i < parts.length; i++) {
      const p = tokenize(parts[i]);
      switch (p[0]) {
        case "wc": lines = [String(lines.length)]; break;
        case "grep": { const pat = p[p.length - 1]; lines = lines.filter((l) => l.includes(pat)); break; }
        case "head": { const n = parseInt(p[p.indexOf("-n") + 1] || p[1] || "10", 10); lines = lines.slice(0, n); break; }
        case "tail": { const n = parseInt(p[p.indexOf("-n") + 1] || p[1] || "10", 10); lines = lines.slice(-n); break; }
        case "sort": lines = lines.slice().sort(); break;
        case "uniq": lines = lines.filter((l, idx) => l !== lines[idx - 1]); break;
        case "xargs": { const cmd = parts[i].replace(/^xargs\s+/, "") + " " + lines.join(" "); return this.exec(cmd); }
        case "cat": break;
        default: break;
      }
    }
    return lines.map((l) => L(l));
  };

  Engine.prototype.dojoHelp = function () {
    return [
      L("Docker Dojo — simulated terminal", "accent"),
      L("Containers: run create ps stop start restart pause unpause kill rm rename exec logs top stats diff port cp"),
      L("Images:     pull push search images build tag history commit rmi inspect"),
      L("Networking: network (ls/create/rm/inspect/connect/prune)"),
      L("Storage:    volume (ls/create/rm/inspect/prune)"),
      L("Compose:    compose (up/down/ps/logs/build)   System: system df, system prune, info, version"),
      L("Shell also: clear, ls, cat Dockerfile, echo, whoami. Follow the steps on the left.", "dim"),
    ];
  };

  // ---- docker <subcommand> -------------------------------------------------
  Engine.prototype.docker = function (a, line) {
    const sub = a[0];
    switch (sub) {
      case undefined:
      case "--help":
      case "help": return [
        L("Usage:  docker [OPTIONS] COMMAND"),
        L(""),
        L("Common Commands:"),
        L("  run     Create and run a new container from an image"),
        L("  ps      List containers"),
        L("  images  List images"),
        L("  pull    Download an image from a registry"),
        L("  exec    Execute a command in a running container"),
        L("  build   Build an image from a Dockerfile"),
      ];
      case "version": return this.version();
      case "info": return this.info();
      case "pull": return this.pull(a[1]);
      case "push": return this.push(a[1]);
      case "login": return [L("Authenticating with existing credentials...", "dim"), L("Login Succeeded", "success")];
      case "search": return this.search(a[1]);
      case "images": return this.imagesList();
      case "ps": return this.ps(false, a);
      case "run": case "create": return this.run(a.slice(1), sub === "create");
      case "stop": return this.stopStart(a.slice(1), false);
      case "start": return this.stopStart(a.slice(1), true);
      case "restart": return this.restart(a.slice(1));
      case "pause": return this.pauseUnpause(a.slice(1), true);
      case "unpause": return this.pauseUnpause(a.slice(1), false);
      case "kill": return this.kill(a.slice(1));
      case "rm": return this.rm(a.slice(1));
      case "rmi": return this.rmi(a.slice(1));
      case "rename": return this.rename(a.slice(1));
      case "exec": return this.dockerExec(a.slice(1));
      case "attach": return this.attach(a.slice(1).filter((x) => !x.startsWith("-"))[0]);
      case "wait": return this.wait(a.slice(1).filter((x) => !x.startsWith("-")));
      case "update": return this.update(a.slice(1));
      case "logs": return this.logs(a.filter((x) => !x.startsWith("-")).pop(), a.includes("-f") || a.includes("--follow"));
      case "export": return this.exportC(a.slice(1));
      case "import": return this.importC(a.slice(1));
      case "save": return [L("(streaming image archive)", "dim")];
      case "load": return [L("Loaded image: " + (Object.keys(this.images)[0] || "app") + ":latest", "success")];
      case "events": return this.events();
      case "context": return this.context(a.slice(1));
      case "builder": return a[1] === "prune" ? [L("Total reclaimed space: 120MB", "success")] : [L("Usage: docker builder prune")];
      case "scout": return this.scout(a.slice(1));
      case "build": return this.build(a.slice(1), line);
      case "inspect": return this.inspect(a.slice(1));
      case "top": return this.top(a.slice(1)[0]);
      case "stats": return this.stats(a);
      case "diff": return this.diff(a.slice(1).filter((x) => !x.startsWith("-"))[0]);
      case "port": return this.portCmd(a.slice(1)[0]);
      case "cp": return this.cp(a.slice(1));
      case "commit": return this.commit(a.slice(1));
      case "tag": return this.tag(a.slice(1));
      case "history": return this.history(a.slice(1).filter((x) => !x.startsWith("-"))[0]);
      case "network": return this.network(a.slice(1));
      case "volume": return this.volume(a.slice(1));
      case "compose": return this.compose(a.slice(1));
      case "system": return this.system(a.slice(1));
      case "container": return this.mgmt("container", a.slice(1), line);
      case "image": return this.mgmt("image", a.slice(1), line);
      case "prune": return this.system(["prune"].concat(a.slice(1)));
      default:
        return [L("docker: '" + sub + "' is not a docker command.", "err"), L("See 'docker --help'", "dim")];
    }
  };

  Engine.prototype.version = function () {
    return [
      L("Client:"),
      L(" Version:           26.1.4"),
      L(" API version:       1.45"),
      L(" Go version:        go1.21.11"),
      L("Server: Docker Engine - Community"),
      L(" Version:           26.1.4"),
      L(" API version:       1.45 (minimum version 1.24)"),
    ];
  };

  Engine.prototype.pullOutput = function (name, tag) {
    return [
      L("Using default tag: " + tag, tag === "latest" ? "" : "dim"),
      L(tag + ": Pulling from library/" + name),
      L(hex(12) + ": Pull complete"),
      L(hex(12) + ": Pull complete"),
      L("Digest: sha256:" + hex(24) + "…"),
      L("Status: Downloaded newer image for " + name + ":" + tag),
      L("docker.io/library/" + name + ":" + tag, "dim"),
    ];
  };

  Engine.prototype.ensureImage = function (name, tag) {
    if (this.images[name]) return [];
    if (!IMAGES[name]) return null; // unknown image
    const out = this.pullOutput(name, tag);
    this.images[name] = { tag: tag, id: hex(12), size: IMAGES[name].size };
    return out;
  };

  Engine.prototype.pull = function (ref) {
    if (!ref) return [L('"docker pull" requires exactly 1 argument.', "err")];
    const [name, tag] = splitImageTag(ref);
    if (!IMAGES[name]) return [L("Error response from daemon: pull access denied for " + name + ", repository does not exist", "err"), L("Try one of: nginx, ubuntu, alpine, redis, python, node, busybox, hello-world", "dim")];
    if (this.images[name]) return [L("latest: Pulling from library/" + name), L("Status: Image is up to date for " + name + ":" + tag), L("docker.io/library/" + name + ":" + tag, "dim")];
    const out = this.pullOutput(name, tag);
    this.images[name] = { tag: tag, id: hex(12), size: IMAGES[name].size };
    return out;
  };

  Engine.prototype.imagesList = function () {
    const rows = Object.keys(this.images).map((n) => [n, this.images[n].tag, this.images[n].id, "2 weeks ago", this.images[n].size]);
    if (!rows.length) return [L("REPOSITORY   TAG   IMAGE ID   CREATED   SIZE")];
    return table(["REPOSITORY", "TAG", "IMAGE ID", "CREATED", "SIZE"], rows);
  };

  Engine.prototype.ps = function (allHint, args) {
    args = args || [];
    // support grouped short flags like -aq  (=> -a -q)
    const shorts = args.filter((x) => /^-[a-z]+$/i.test(x)).join("");
    const all = allHint || /a/.test(shorts) || args.includes("--all");
    const quiet = /q/.test(shorts) || args.includes("--quiet");
    let list = this.containers.filter((c) => all || c.status === "running" || c.status === "paused");
    // --filter status=exited / name=web / ancestor=nginx
    const fi = args.findIndex((x) => x === "--filter");
    if (fi >= 0 && args[fi + 1]) {
      const [k, v] = args[fi + 1].split("=");
      if (k === "status") list = this.containers.filter((c) => c.status === v);
      else if (k === "name") list = list.filter((c) => c.name.includes(v));
      else if (k === "ancestor") list = list.filter((c) => c.image === v);
    }
    // -q / --quiet: just IDs
    if (quiet) return list.map((c) => L(c.id.slice(0, 12)));
    // --format '{{.Names}}'
    const foi = args.findIndex((x) => x === "--format");
    if (foi >= 0 && args[foi + 1]) {
      const f = args[foi + 1];
      return list.map((c) => {
        if (/Names/.test(f) && /Status/.test(f)) return L(c.name + "\t" + (c.status === "running" ? "Up" : c.status));
        if (/Names/.test(f)) return L(c.name);
        if (/Image/.test(f)) return L(c.image);
        return L(c.id.slice(0, 12));
      });
    }
    const statusText = (c) => c.status === "running" ? "Up 1 second"
      : c.status === "paused" ? "Up 1 second (Paused)"
      : c.status === "created" ? "Created"
      : "Exited (0) 1 second ago";
    const rows = list.map((c) => [
      c.id.slice(0, 12),
      c.image,
      '"' + (c.cmd.length > 20 ? c.cmd.slice(0, 19) + "…" : c.cmd) + '"',
      "Less than a second ago",
      statusText(c),
      c.ports || "",
      c.name,
    ]);
    return table(["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"], rows);
  };

  Engine.prototype.run = function (a, createOnly) {
    const opts = { detach: false, it: false, rm: false, name: null, ports: null, env: [], mounts: [], network: null, restart: null, workdir: null };
    let i = 0;
    for (; i < a.length; i++) {
      const tok = a[i];
      if (tok === "-d" || tok === "--detach") opts.detach = true;
      else if (tok === "-it" || tok === "-ti" || tok === "-i" || tok === "-t") opts.it = true;
      else if (tok === "--rm") opts.rm = true;
      else if (tok === "--name") opts.name = a[++i];
      else if (tok === "-p" || tok === "--publish") opts.ports = a[++i];
      else if (tok === "-e" || tok === "--env") opts.env.push(a[++i]);
      else if (tok === "-v" || tok === "--volume") opts.mounts.push(a[++i]);
      else if (tok === "--network" || tok === "--net") opts.network = a[++i];
      else if (tok === "--restart") opts.restart = a[++i];
      else if (tok === "-w" || tok === "--workdir") opts.workdir = a[++i];
      else if (tok.startsWith("--name=")) opts.name = tok.slice(7);
      else if (tok.startsWith("-")) { /* ignore other flags */ }
      else break;
    }
    const ref = a[i];
    if (!ref) return [L('"docker run" requires at least 1 argument.', "err")];
    const [name, tag] = splitImageTag(ref);
    const userCmd = a.slice(i + 1).join(" ");

    const pulled = this.ensureImage(name, tag);
    if (pulled === null) return [L("Unable to find image '" + ref + "' locally", "err"), L("Error response from daemon: pull access denied for " + name, "err")];
    let out = pulled.length ? [L("Unable to find image '" + name + ":" + tag + "' locally")].concat(pulled) : [];

    if (opts.name && this.findContainer(opts.name)) {
      return [L('docker: Error response from daemon: Conflict. The container name "/' + opts.name + '" is already in use.', "err"), L("You have to remove (or rename) that container to reuse that name.", "dim")];
    }

    const id = hex(64);
    const cname = opts.name || randomName();
    const meta = IMAGES[name] || this.images[name] || {};
    let ports = "";
    if (opts.ports) {
      const [h, c] = opts.ports.split(":");
      ports = "0.0.0.0:" + h + "->" + c + "/tcp";
    } else if (meta.expose && (opts.detach || name === "nginx")) ports = meta.expose;

    // named volumes referenced by -v are created on the fly
    opts.mounts.forEach((m) => {
      const src = m.split(":")[0];
      if (src && !src.startsWith("/") && !src.startsWith(".") && !this.findVolume(src)) {
        this.volumes.push({ name: src, driver: "local", id: hex(12) });
      }
    });
    if (opts.network && !this.findNetwork(opts.network)) {
      return [L("docker: Error response from daemon: network " + opts.network + " not found.", "err")];
    }
    const extra = { env: opts.env.slice(), mounts: opts.mounts.slice(), network: opts.network || "bridge", restart: opts.restart || "no", ip: "172.17.0." + (this.containers.length + 2) };

    // docker create: build but do not start
    if (createOnly) {
      this.containers.push(Object.assign({ id, name: cname, image: name, cmd: userCmd || meta.cmd || "sh", status: "created", ports }, extra));
      return out.concat([L(id)]);
    }

    // hello-world: prints message and exits
    if (name === "hello-world") {
      this.containers.push(Object.assign({ id, name: cname, image: name, cmd: meta.cmd, status: "exited", ports: "" }, extra));
      return out.concat([
        L(""),
        L("Hello from Docker!", "success"),
        L("This message shows that your installation appears to be working correctly."),
        L(""),
        L("To generate this message, Docker took the following steps:"),
        L(" 1. The Docker client contacted the Docker daemon."),
        L(" 2. The daemon pulled the \"hello-world\" image from Docker Hub."),
        L(" 3. The daemon created a new container from that image."),
        L(" 4. The daemon streamed that output to the Docker client."),
        L(""),
      ]);
    }

    // interactive shell: enter the container
    if (opts.it && /^(bash|sh|\/bin\/bash|\/bin\/sh)$/.test(userCmd)) {
      this.containers.push(Object.assign({ id, name: cname, image: name, cmd: userCmd, status: "running", ports }, extra));
      this.shellStack.push({ id, image: name, cwd: "/" });
      return out; // prompt switches to container shell
    }

    // detached (or default long-running server images)
    const longRunning = opts.detach || meta.expose;
    this.containers.push(Object.assign({ id, name: cname, image: name, cmd: userCmd || meta.cmd || "sh", status: longRunning ? "running" : "exited", ports }, extra));
    if (opts.detach) return out.concat([L(id)]);
    if (userCmd) return out.concat([L(userCmd.startsWith("echo") ? userCmd.replace(/^echo\s+/, "") : "")]);
    return out;
  };

  Engine.prototype.stopStart = function (a, start) {
    const refs = a.filter((x) => !x.startsWith("-"));
    if (!refs.length) return [L('"docker ' + (start ? "start" : "stop") + '" requires at least 1 argument.', "err")];
    return refs.map((ref) => {
      const c = this.findContainer(ref);
      if (!c) return L("Error response from daemon: No such container: " + ref, "err");
      c.status = start ? "running" : "exited";
      return L(ref);
    });
  };

  Engine.prototype.rm = function (a) {
    const force = a.includes("-f") || a.includes("--force");
    const refs = a.filter((x) => !x.startsWith("-"));
    if (!refs.length) return [L('"docker rm" requires at least 1 argument.', "err")];
    return refs.map((ref) => {
      const c = this.findContainer(ref);
      if (!c) return L("Error response from daemon: No such container: " + ref, "err");
      if (c.status === "running" && !force) return L("Error response from daemon: You cannot remove a running container " + c.id.slice(0, 12) + ". Stop the container before attempting removal or force remove", "err");
      this.containers = this.containers.filter((x) => x !== c);
      return L(ref);
    });
  };

  Engine.prototype.rmi = function (a) {
    const refs = a.filter((x) => !x.startsWith("-"));
    if (!refs.length) return [L('"docker rmi" requires at least 1 argument.', "err")];
    return refs.map((ref) => {
      const [name] = splitImageTag(ref);
      if (!this.images[name]) return L("Error response from daemon: No such image: " + ref, "err");
      const id = this.images[name].id;
      delete this.images[name];
      return L("Untagged: " + name + ":latest\nDeleted: sha256:" + id);
    });
  };

  Engine.prototype.dockerExec = function (a) {
    let i = 0, it = false;
    for (; i < a.length; i++) {
      if (a[i] === "-it" || a[i] === "-ti" || a[i] === "-i" || a[i] === "-t") it = true;
      else if (a[i].startsWith("-")) { /* skip */ }
      else break;
    }
    const ref = a[i];
    const cmd = a.slice(i + 1);
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    if (c.status !== "running") return [L("Error response from daemon: Container " + c.id.slice(0, 12) + " is not running", "err")];
    if (it && /^(bash|sh|\/bin\/bash|\/bin\/sh)$/.test(cmd[0] || "")) {
      this.shellStack.push({ id: c.id, image: c.image, cwd: "/" });
      return [];
    }
    // one-shot command inside the container
    return this.innerCommand(cmd, { id: c.id, image: c.image, cwd: "/" });
  };

  Engine.prototype.logs = function (ref, follow) {
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    let lines;
    if (c.image === "nginx" || c.image === "httpd") lines = [
      "/docker-entrypoint.sh: Configuration complete; ready for start up",
      '172.17.0.1 - - "GET / HTTP/1.1" 200 615 "-" "curl/8.4.0"',
      '172.17.0.1 - - "GET /health HTTP/1.1" 200 2 "-" "kube-probe/1.29"',
    ];
    else if (c.image === "postgres" || c.image === "mysql") lines = [
      "database system was shut down at 2025-01-01 00:00:00 UTC",
      "database system is ready to accept connections",
    ];
    else if (c.image === "redis") lines = ["Ready to accept connections tcp"];
    else lines = ["(no logs)"];
    const out = lines.map((t) => L(t, "dim"));
    if (follow) out.push(L("^C  (following stopped)", "dim"));
    return out;
  };

  Engine.prototype.attach = function (ref) {
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    if (c.status !== "running") return [L("You cannot attach to a stopped container, start it first", "err")];
    return [L("(attached to " + c.name + " — its stdout would stream here; Ctrl-P Ctrl-Q to detach)", "dim")];
  };

  Engine.prototype.wait = function (refs) {
    if (!refs.length) return [L('"docker wait" requires at least 1 argument.', "err")];
    return refs.map((r) => { const c = this.findContainer(r); if (!c) return L("Error response from daemon: No such container: " + r, "err"); c.status = "exited"; return L("0"); });
  };

  Engine.prototype.update = function (a) {
    const refs = a.filter((x) => !x.startsWith("-") && !/^\d/.test(x) && !x.includes("m") || this.findContainer(x));
    const c = a.map((x) => this.findContainer(x)).find(Boolean);
    if (!c) return [L("Error response from daemon: No such container", "err")];
    return [L(c.name)];
  };

  Engine.prototype.exportC = function (a) {
    const ref = a.filter((x) => !x.startsWith("-")).pop();
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    return [L("(container filesystem streamed as tar)", "dim")];
  };

  Engine.prototype.importC = function (a) {
    const name = a.filter((x) => !x.startsWith("-")).slice(1)[0] || "imported";
    const [n] = splitImageTag(name);
    this.images[n] = { tag: "latest", id: hex(12), size: "88MB" };
    return [L("sha256:" + hex(64))];
  };

  Engine.prototype.events = function () {
    return [
      L("2025-01-01T00:00:00 container create " + hex(12) + " (image=nginx)", "dim"),
      L("2025-01-01T00:00:01 container start " + hex(12) + " (image=nginx)", "dim"),
      L("2025-01-01T00:00:02 network connect " + hex(12) + " (container=web)", "dim"),
      L("^C", "dim"),
    ];
  };

  Engine.prototype.context = function (a) {
    if (a[0] === "ls" || a[0] === "list" || !a[0])
      return table(["NAME", "DESCRIPTION", "DOCKER ENDPOINT"], [["default *", "Current DOCKER_HOST based configuration", "unix:///var/run/docker.sock"], ["desktop-linux", "Docker Desktop", "unix:///.docker/run/docker.sock"]]);
    return [L("Usage: docker context ls")];
  };

  Engine.prototype.scout = function (a) {
    const ref = a.filter((x) => !x.startsWith("-")).pop();
    return [
      L("  Target   │  " + (ref || "image") + ":latest", "dim"),
      L("    digest │  " + hex(12), "dim"),
      L("  0C     2H     5M     8L", "accent"),
      L("  ✓ No critical vulnerabilities found", "success"),
    ];
  };

  Engine.prototype.build = function (a, line) {
    const ti = a.indexOf("-t") >= 0 ? a.indexOf("-t") : a.indexOf("--tag");
    const tagName = ti >= 0 ? a[ti + 1] : "";
    if (!this.hasDockerfile) return [L("ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory", "err")];
    const [name, tag] = splitImageTag(tagName || "myimage");
    const df = this.hasDockerfile;
    // parse instructions from the (possibly user-edited) Dockerfile
    const froms = df.filter((l) => /^\s*FROM\s+/i.test(l));
    if (!froms.length) return [L("ERROR: failed to solve: dockerfile requires at least one FROM", "err")];
    const base = froms[0].replace(/^\s*FROM\s+/i, "").trim();
    const cmdLine = (df.filter((l) => /^\s*CMD\s+/i.test(l)).pop() || 'CMD ["sh"]').replace(/^\s*CMD\s+/i, "").trim();
    let cmd = cmdLine;
    try { if (cmdLine.startsWith("[")) cmd = JSON.parse(cmdLine).join(" "); } catch (e) { /* keep raw */ }
    const instr = df.filter((l) => /^\s*(FROM|RUN|COPY|ADD|WORKDIR|ENV|EXPOSE|CMD|ENTRYPOINT|USER|ARG|LABEL)\s+/i.test(l));
    const out = [L("[+] Building 2.7s (" + (instr.length + 3) + "/" + (instr.length + 3) + ") FINISHED", "accent")];
    out.push(L(" => [internal] load build definition from Dockerfile", "dim"));
    out.push(L(" => => transferring dockerfile: " + (df.join("\n").length) + "B", "dim"));
    let step = 0;
    instr.forEach((l) => {
      const kw = l.trim().split(/\s+/)[0].toUpperCase();
      if (kw === "FROM") out.push(L(" => [internal] load metadata for " + base, "dim"));
      else { step++; out.push(L(" => [" + step + "/" + (instr.length - 1) + "] " + l.trim(), "dim")); }
    });
    const expose = df.find((l) => /^\s*EXPOSE\s+/i.test(l));
    this.images[name] = { tag: tag, id: hex(12), size: "142MB", cmd: cmd, expose: expose ? expose.replace(/^\s*EXPOSE\s+/i, "").trim() + "/tcp" : null };
    out.push(L(" => exporting to image", "dim"));
    out.push(L(" => => naming to docker.io/library/" + name + ":" + tag, "dim"));
    out.push(L("Successfully built and tagged " + name + ":" + tag, "success"));
    return out;
  };

  // ---- in-container shell --------------------------------------------------
  Engine.prototype.innerExec = function (line) {
    const t = tokenize(line);
    if (t[0] === "exit" || t[0] === "logout") {
      this.shellStack.pop();
      return [];
    }
    const ctx = this.shellStack[this.shellStack.length - 1];
    return this.innerCommand(t, ctx);
  };

  Engine.prototype.normPath = function (cwd, arg) {
    if (!arg || arg === "~") return "/root";
    let base = arg.startsWith("/") ? "" : cwd;
    const parts = (base + "/" + arg).split("/");
    const out = [];
    for (const p of parts) { if (p === "" || p === ".") continue; if (p === "..") out.pop(); else out.push(p); }
    return "/" + out.join("/");
  };

  Engine.prototype.innerCommand = function (t, ctx) {
    const image = ctx.image;
    const meta = IMAGES[image] || {};
    const container = this.findContainer(ctx.id) || {};
    const nginxBody = [
      "<!DOCTYPE html>", "<html><head><title>Welcome to nginx!</title></head>",
      "<body><h1>Welcome to nginx!</h1>", "<p>If you see this page, the nginx web server is working.</p></body></html>",
    ];
    switch (t[0]) {
      case undefined: return [];
      case "whoami": return [L("root")];
      case "id": return [L("uid=0(root) gid=0(root) groups=0(root)")];
      case "hostname": return [L(ctx.id ? ctx.id.slice(0, 12) : hex(12))];
      case "uname": return [L(t.includes("-a") ? "Linux " + ctx.id.slice(0, 12) + " 6.6.0-linuxkit #1 SMP x86_64 GNU/Linux" : "Linux")];
      case "pwd": return [L(ctx.cwd || "/")];
      case "cd": ctx.cwd = this.normPath(ctx.cwd || "/", t[1]); return [];
      case "clear": case "cls": return [{ clear: true }];
      case "echo": return [L(t.slice(1).join(" ").replace(/\$HOSTNAME/g, ctx.id.slice(0, 12)))];
      case "ls":
        if ((ctx.cwd || "/") === "/app") return [L(t.includes("-l") || t.includes("-la") ? "total 24\n-rw-r--r-- 1 root root  412 server.js\n-rw-r--r-- 1 root root  289 package.json\ndrwxr-xr-x 8 root root 4096 node_modules" : "node_modules  package.json  server.js")];
        return [L("bin   dev  etc   lib   media  opt   root  sbin  sys  tmp  usr  var")];
      case "env": case "printenv": {
        const base = ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOSTNAME=" + ctx.id.slice(0, 12), "HOME=/root"];
        return base.concat(container.env || []).map((x) => L(x));
      }
      case "ps": return table(["PID", "USER", "TIME", "COMMAND"], [["1", "root", "0:00", container.cmd || meta.cmd || "sh"], ["18", "root", "0:00", "ps"]]);
      case "cat":
        if (t[1] === "/etc/os-release") return this.osRelease(meta.os);
        if (t[1] === "/etc/hostname") return [L(ctx.id.slice(0, 12))];
        if (t[1] === "server.js" || t[1] === "/app/server.js") return ["const http=require('http');", "http.createServer((_,res)=>res.end('hi')).listen(3000);"].map((x) => L(x, "dim"));
        return [L("cat: " + (t[1] || "") + ": No such file or directory", "err")];
      case "touch": case "mkdir": case "rm": case "mv": case "cp": case "export": return [];
      case "curl": case "wget": {
        const target = (t.filter((x) => !x.startsWith("-"))[1] || "").replace(/^https?:\/\//, "").split(/[/:?]/)[0];
        if (!target) return [L("curl: try 'curl localhost'", "dim")];
        if (target === "localhost" || target === "127.0.0.1") return nginxBody.map((x) => L(x, "dim"));
        const peer = this.containers.find((x) => x.name === target && x.status === "running");
        if (peer) return nginxBody.map((x) => L(x, "dim"));
        return [L("curl: (6) Could not resolve host: " + target, "err")];
      }
      case "ping": {
        const target = t.filter((x) => !x.startsWith("-"))[1] || "";
        const peer = this.containers.find((x) => x.name === target && x.status === "running");
        const ip = peer ? peer.ip : "93.184.216.34";
        return [
          L("PING " + target + " (" + ip + "): 56 data bytes"),
          L("64 bytes from " + ip + ": icmp_seq=0 ttl=64 time=0.052 ms"),
          L("64 bytes from " + ip + ": icmp_seq=1 ttl=64 time=0.041 ms"),
          L("--- " + target + " ping statistics ---"),
          L("2 packets transmitted, 2 packets received, 0.0% packet loss"),
        ];
      }
      case "apk": return t[1] === "add" ? [L("(1/1) Installing " + (t[2] || "pkg") + " ...", "dim"), L("OK: packages installed", "dim")] : [L("apk: try 'apk add curl'", "dim")];
      case "apt-get": case "apt": return t[1] && /install/.test(t[1]) ? [L("Reading package lists... Done", "dim"), L("Setting up " + (t[2] || "pkg") + " ...", "dim")] : [L("Reading package lists... Done", "dim")];
      case "yum": case "dnf": return [L("Installed: " + (t[2] || "pkg"), "dim")];
      case "pip": case "pip3": return t[1] === "install" ? [L("Successfully installed " + (t[2] || "package"), "dim")] : [L("pip 24.0", "dim")];
      case "npm": return t[1] === "install" ? [L("added 42 packages in 1s", "dim")] : [L("10.5.0")];
      case "node": return [L("v20.11.1")];
      case "python3": case "python": return [L("Python 3.12.4")];
      case "redis-cli": return t[1] === "ping" ? [L("PONG", "success")] : [L("127.0.0.1:6379>", "dim")];
      case "psql": return [L("psql (16.2)\nType \"help\" for help.", "dim")];
      case "which": return [L("/usr/bin/" + (t[1] || ""))];
      case "sleep": return [];
      case "date": return [L("Wed Jan  1 00:00:00 UTC 2025")];
      case "help": return [L("busybox/coreutils: ls cd pwd cat echo env ps whoami curl ping apk apt pip npm ... type exit to leave")];
      default: return [L((meta.os === "alpine" || meta.os === "busybox" ? "sh: " : "bash: ") + t[0] + ": command not found", "err")];
    }
  };

  // ---- inspection & lifecycle (expanded command set) -----------------------
  Engine.prototype.info = function () {
    const running = this.containers.filter((c) => c.status === "running").length;
    return [
      L("Client: Docker Engine - Community"),
      L(" Version:    26.1.4"),
      L("Server:"),
      L(" Containers: " + this.containers.length),
      L("  Running: " + running + "  Paused: " + this.containers.filter((c) => c.status === "paused").length + "  Stopped: " + this.containers.filter((c) => c.status === "exited").length),
      L(" Images: " + Object.keys(this.images).length),
      L(" Server Version: 26.1.4"),
      L(" Storage Driver: overlay2"),
      L(" Operating System: Docker Desktop"),
    ];
  };

  Engine.prototype.push = function (ref) {
    if (!ref) return [L('"docker push" requires exactly 1 argument.', "err")];
    const [name, tag] = splitImageTag(ref);
    if (!this.images[name]) return [L("An image does not exist locally with the tag: " + name, "err")];
    return [
      L("The push refers to repository [docker.io/" + name + "]"),
      L(hex(12) + ": Pushed", "dim"),
      L(hex(12) + ": Pushed", "dim"),
      L(tag + ": digest: sha256:" + hex(24) + "… size: 1362"),
    ];
  };

  Engine.prototype.search = function (term) {
    if (!term) return [L('"docker search" requires exactly 1 argument.', "err")];
    const hits = Object.keys(IMAGES).filter((n) => n.includes(term)).slice(0, 5);
    const rows = hits.map((n) => [n, "Official " + n + " image", String(1000 + n.length * 137), n === term ? "[OK]" : ""]);
    if (!rows.length) rows.push([term, "Community image", "42", ""]);
    return table(["NAME", "DESCRIPTION", "STARS", "OFFICIAL"], rows);
  };

  Engine.prototype.restart = function (a) {
    const refs = a.filter((x) => !x.startsWith("-"));
    if (!refs.length) return [L('"docker restart" requires at least 1 argument.', "err")];
    return refs.map((ref) => { const c = this.findContainer(ref); if (!c) return L("Error response from daemon: No such container: " + ref, "err"); c.status = "running"; return L(ref); });
  };

  Engine.prototype.pauseUnpause = function (a, pause) {
    const refs = a.filter((x) => !x.startsWith("-"));
    if (!refs.length) return [L('"docker ' + (pause ? "pause" : "unpause") + '" requires at least 1 argument.', "err")];
    return refs.map((ref) => {
      const c = this.findContainer(ref);
      if (!c) return L("Error response from daemon: No such container: " + ref, "err");
      if (pause && c.status !== "running") return L("Error response from daemon: Container " + ref + " is not running", "err");
      c.status = pause ? "paused" : "running";
      return L(ref);
    });
  };

  Engine.prototype.kill = function (a) {
    const refs = a.filter((x) => !x.startsWith("-"));
    if (!refs.length) return [L('"docker kill" requires at least 1 argument.', "err")];
    return refs.map((ref) => { const c = this.findContainer(ref); if (!c) return L("Error response from daemon: No such container: " + ref, "err"); c.status = "exited"; return L(ref); });
  };

  Engine.prototype.rename = function (a) {
    if (a.length < 2) return [L('"docker rename" requires exactly 2 arguments.', "err")];
    const c = this.findContainer(a[0]);
    if (!c) return [L("Error response from daemon: No such container: " + a[0], "err")];
    if (this.findContainer(a[1])) return [L("Error response from daemon: name is already in use", "err")];
    c.name = a[1];
    return [];
  };

  Engine.prototype.inspect = function (a) {
    const ref = a.filter((x) => !x.startsWith("-")).pop();
    const fmtIdx = a.indexOf("-f") >= 0 ? a.indexOf("-f") : a.indexOf("--format");
    const format = fmtIdx >= 0 ? a[fmtIdx + 1] : null;
    const c = this.findContainer(ref);
    if (c) {
      if (format) {
        if (/State.*Status/i.test(format)) return [L(c.status)];
        if (/IPAddress/i.test(format)) return [L(c.ip || "172.17.0.2")];
        if (/Image/i.test(format)) return [L(c.image)];
        return [L(c.id)];
      }
      const json = {
        Id: c.id, Name: "/" + c.name,
        State: { Status: c.status, Running: c.status === "running", Paused: c.status === "paused" },
        Config: { Image: c.image, Cmd: c.cmd.split(" "), Env: c.env || [] },
        HostConfig: { RestartPolicy: { Name: c.restart || "no" }, Binds: c.mounts || [] },
        NetworkSettings: { IPAddress: c.ip || "172.17.0.2", Networks: { [c.network || "bridge"]: { IPAddress: c.ip } } },
      };
      return this.jsonLines(json);
    }
    const imgName = this.findImageName(ref);
    if (imgName) return this.jsonLines({ Id: "sha256:" + this.images[imgName].id, RepoTags: [imgName + ":" + this.images[imgName].tag], Size: this.images[imgName].size, Os: "linux", Architecture: "amd64" });
    const n = this.findNetwork(ref);
    if (n) return this.jsonLines({ Name: n.name, Id: n.id, Driver: n.driver, Scope: n.scope, Containers: {} });
    const v = this.findVolume(ref);
    if (v) return this.jsonLines({ Name: v.name, Driver: v.driver, Mountpoint: "/var/lib/docker/volumes/" + v.name + "/_data" });
    return [L("Error: No such object: " + (ref || ""), "err")];
  };

  Engine.prototype.jsonLines = function (obj) {
    return ("[\n" + JSON.stringify(obj, null, 4).split("\n").map((l) => "    " + l).join("\n") + "\n]").split("\n").map((t) => L(t, "dim"));
  };

  Engine.prototype.top = function (ref) {
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    if (c.status !== "running") return [L("Error response from daemon: Container " + ref + " is not running", "err")];
    return table(["UID", "PID", "PPID", "C", "STIME", "TTY", "TIME", "CMD"], [["root", "3841", "3820", "0", "12:03", "?", "00:00:00", c.cmd]]);
  };

  Engine.prototype.stats = function (a) {
    const running = this.containers.filter((c) => c.status === "running");
    const rows = running.map((c) => [c.id.slice(0, 12), c.name, (Math.random() * 5).toFixed(2) + "%", (Math.random() * 60 + 5).toFixed(1) + "MiB / 1.9GiB", (Math.random() * 3).toFixed(2) + "%", "1.2kB / 806B", "0B / 0B", "5"]);
    if (!rows.length) return [L("CONTAINER ID   NAME   CPU %   MEM USAGE / LIMIT   MEM %   NET I/O   BLOCK I/O   PIDS"), L("(no running containers)", "dim")];
    return table(["CONTAINER ID", "NAME", "CPU %", "MEM USAGE / LIMIT", "MEM %", "NET I/O", "BLOCK I/O", "PIDS"], rows);
  };

  Engine.prototype.diff = function (ref) {
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    return [L("C /var"), L("C /var/log"), L("A /var/log/app.log"), L("C /etc"), L("A /etc/app.conf")];
  };

  Engine.prototype.portCmd = function (ref) {
    const c = this.findContainer(ref);
    if (!c) return [L("Error response from daemon: No such container: " + (ref || ""), "err")];
    if (!c.ports) return [];
    const m = c.ports.match(/0\.0\.0\.0:(\d+)->(\d+)\/tcp/);
    return m ? [L(m[2] + "/tcp -> 0.0.0.0:" + m[1])] : [];
  };

  Engine.prototype.cp = function (a) {
    if (a.length < 2) return [L('"docker cp" requires 2 arguments.', "err")];
    const involves = a[0].includes(":") ? a[0] : a[1];
    const ref = involves.split(":")[0];
    if (!this.findContainer(ref)) return [L("Error response from daemon: No such container: " + ref, "err")];
    return [L("Successfully copied 4.1kB to " + a[1], "dim")];
  };

  Engine.prototype.commit = function (a) {
    const args = a.filter((x) => !x.startsWith("-"));
    const c = this.findContainer(args[0]);
    if (!c) return [L("Error response from daemon: No such container: " + (args[0] || ""), "err")];
    const [name] = splitImageTag(args[1] || "committed");
    const id = hex(12);
    this.images[name] = { tag: "latest", id, size: "142MB" };
    return [L("sha256:" + hex(64))];
  };

  Engine.prototype.tag = function (a) {
    if (a.length < 2) return [L('"docker tag" requires exactly 2 arguments.', "err")];
    const src = this.findImageName(a[0]);
    if (!src) return [L("Error response from daemon: No such image: " + a[0], "err")];
    const [name, tag] = splitImageTag(a[1]);
    this.images[name] = { tag: tag, id: this.images[src].id, size: this.images[src].size };
    return [];
  };

  Engine.prototype.history = function (ref) {
    const name = this.findImageName(ref);
    if (!name) return [L("Error: No such image: " + (ref || ""), "err")];
    return table(["IMAGE", "CREATED", "CREATED BY", "SIZE"], [
      [this.images[name].id, "2 weeks ago", "CMD [\"" + (IMAGES[name] ? IMAGES[name].cmd : "sh") + "\"]", "0B"],
      ["<missing>", "2 weeks ago", "COPY . . # buildkit", "4.2kB"],
      ["<missing>", "2 weeks ago", "RUN apt-get update", this.images[name].size],
    ]);
  };

  // ---- networks ------------------------------------------------------------
  Engine.prototype.network = function (a) {
    const sub = a[0];
    switch (sub) {
      case "ls": case "list":
        return table(["NETWORK ID", "NAME", "DRIVER", "SCOPE"], this.networks.map((n) => [n.id.slice(0, 12), n.name, n.driver, n.scope]));
      case "create": {
        const name = a.filter((x) => !x.startsWith("-")).slice(1)[0] || a[a.length - 1];
        if (this.findNetwork(name)) return [L("Error response from daemon: network with name " + name + " already exists", "err")];
        const id = hex(64);
        this.networks.push({ name, id, driver: "bridge", scope: "local" });
        return [L(id)];
      }
      case "rm": case "remove": {
        const name = a[1];
        const n = this.findNetwork(name);
        if (!n) return [L("Error: No such network: " + name, "err")];
        if (n.builtin) return [L("Error response from daemon: " + name + " is a pre-defined network and cannot be removed", "err")];
        this.networks = this.networks.filter((x) => x !== n);
        return [L(name)];
      }
      case "inspect": return this.inspect([a[1]]);
      case "connect": case "disconnect": return [];
      case "prune": {
        const removed = this.networks.filter((n) => !n.builtin);
        this.networks = this.networks.filter((n) => n.builtin);
        return [L("Deleted Networks:")].concat(removed.map((n) => L(n.name)));
      }
      default: return [L("Usage: docker network COMMAND (ls, create, rm, inspect, connect, prune)")];
    }
  };

  // ---- volumes -------------------------------------------------------------
  Engine.prototype.volume = function (a) {
    const sub = a[0];
    switch (sub) {
      case "ls": case "list":
        return table(["DRIVER", "VOLUME NAME"], this.volumes.map((v) => [v.driver, v.name]));
      case "create": {
        const name = a.filter((x) => !x.startsWith("-")).slice(1)[0] || ("vol_" + hex(6));
        if (this.findVolume(name)) return [L(name)];
        this.volumes.push({ name, driver: "local", id: hex(12) });
        return [L(name)];
      }
      case "rm": case "remove": {
        const name = a[1];
        if (!this.findVolume(name)) return [L("Error: No such volume: " + name, "err")];
        this.volumes = this.volumes.filter((v) => v.name !== name);
        return [L(name)];
      }
      case "inspect": return this.inspect([a[1]]);
      case "prune": {
        const removed = this.volumes.slice();
        this.volumes = [];
        return [L("Deleted Volumes:")].concat(removed.map((v) => L(v.name))).concat([L("Total reclaimed space: 0B", "dim")]);
      }
      default: return [L("Usage: docker volume COMMAND (ls, create, rm, inspect, prune)")];
    }
  };

  // ---- compose -------------------------------------------------------------
  Engine.prototype.compose = function (a) {
    const sub = a.find((x) => !x.startsWith("-")) || "";
    if (!this.hasCompose && sub !== "version") return [L("no configuration file provided: not found", "err"), L("(This lesson provides a compose.yaml — try the steps in order.)", "dim")];
    switch (sub) {
      case "up": {
        const services = [
          { name: "web", image: "nginx", ports: "0.0.0.0:8080->80/tcp" },
          { name: "db", image: "postgres", ports: "5432/tcp" },
        ];
        const out = [L("[+] Running 3/3", "accent"), L(" ✔ Network app_default    Created", "dim")];
        if (!this.findNetwork("app_default")) this.networks.push({ name: "app_default", id: hex(64), driver: "bridge", scope: "local" });
        services.forEach((s, i) => {
          const cname = "app-" + s.name + "-1";
          if (!this.findContainer(cname)) this.containers.push({ id: hex(64), name: cname, image: s.image, cmd: (IMAGES[s.image] || {}).cmd || "sh", status: "running", ports: a.includes("-d") ? s.ports : s.ports, network: "app_default", env: [], mounts: [] });
          out.push(L(" ✔ Container " + cname + "  Started", "dim"));
        });
        return out;
      }
      case "ps":
        return table(["NAME", "IMAGE", "STATUS", "PORTS"], this.containers.filter((c) => c.name.startsWith("app-")).map((c) => [c.name, c.image, "Up 1 second", c.ports || ""]));
      case "logs":
        return [L("app-web-1  | ready to handle connections", "dim"), L("app-db-1   | database system is ready to accept connections", "dim")];
      case "down": {
        const removed = this.containers.filter((c) => c.name.startsWith("app-"));
        this.containers = this.containers.filter((c) => !c.name.startsWith("app-"));
        this.networks = this.networks.filter((n) => n.name !== "app_default");
        return [L("[+] Running " + (removed.length + 1) + "/" + (removed.length + 1), "accent")].concat(removed.map((c) => L(" ✔ Container " + c.name + "  Removed", "dim"))).concat([L(" ✔ Network app_default    Removed", "dim")]);
      }
      case "build": return [L("[+] Building 2.1s (6/6) FINISHED", "accent"), L(" => naming to docker.io/library/app-web", "dim")];
      default: return [L("Usage: docker compose COMMAND (up, down, ps, logs, build)")];
    }
  };

  // ---- system --------------------------------------------------------------
  Engine.prototype.system = function (a) {
    const sub = a[0];
    if (sub === "df") {
      return table(["TYPE", "TOTAL", "ACTIVE", "SIZE", "RECLAIMABLE"], [
        ["Images", String(Object.keys(this.images).length), "1", "1.4GB", "800MB (57%)"],
        ["Containers", String(this.containers.length), String(this.containers.filter((c) => c.status === "running").length), "12MB", "8MB (66%)"],
        ["Local Volumes", String(this.volumes.length), "0", "0B", "0B"],
        ["Build Cache", "6", "0", "120MB", "120MB"],
      ]);
    }
    if (sub === "prune") {
      const stopped = this.containers.filter((c) => c.status !== "running" && c.status !== "paused");
      this.containers = this.containers.filter((c) => c.status === "running" || c.status === "paused");
      const vols = this.volumes.length;
      return [
        L("Deleted Containers:")
      ].concat(stopped.map((c) => L(c.id, "dim"))).concat([L("Total reclaimed space: 128.4MB", "success")]);
    }
    return [L("Usage: docker system COMMAND (df, prune)")];
  };

  // ---- management-command aliases (docker container / image ...) -----------
  Engine.prototype.mgmt = function (kind, a, line) {
    const sub = a[0];
    const rest = a.slice(1);
    if (kind === "container") {
      switch (sub) {
        case "ls": case "list": case "ps": return this.ps(a.includes("-a") || a.includes("--all"));
        case "run": return this.run(rest);
        case "rm": return this.rm(rest);
        case "stop": return this.stopStart(rest, false);
        case "start": return this.stopStart(rest, true);
        case "inspect": return this.inspect(rest);
        case "prune": return this.system(["prune"]);
        default: return [L("Usage: docker container COMMAND (ls, run, rm, stop, start, inspect, prune)")];
      }
    }
    // image
    switch (sub) {
      case "ls": case "list": return this.imagesList();
      case "rm": case "remove": return this.rmi(rest);
      case "pull": return this.pull(rest[0]);
      case "build": return this.build(rest, line);
      case "tag": return this.tag(rest);
      case "history": return this.history(rest.filter((x) => !x.startsWith("-"))[0]);
      case "inspect": return this.inspect(rest);
      case "prune": return [L("Total reclaimed space: 800MB", "success")];
      default: return [L("Usage: docker image COMMAND (ls, rm, pull, build, tag, history, prune)")];
    }
  };

  Engine.prototype.osRelease = function (os) {
    if (os === "alpine") return [L('NAME="Alpine Linux"'), L('VERSION_ID=3.20.1'), L('PRETTY_NAME="Alpine Linux v3.20"')];
    if (os === "ubuntu") return [L('NAME="Ubuntu"'), L('VERSION="22.04.4 LTS (Jammy Jellyfish)"'), L('PRETTY_NAME="Ubuntu 22.04.4 LTS"')];
    return [L('NAME="Debian GNU/Linux"'), L('VERSION="12 (bookworm)"'), L('PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"')];
  };

  global.DockerEngine = Engine;
})(window);
