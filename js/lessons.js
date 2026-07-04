/* Docker Dojo course content.
 * Each step's `check(cmd, engine)` decides when the learner has completed it.
 * `cmd` is the raw command they typed; `engine` is the live DockerEngine so
 * checks can also inspect resulting state (containers, images, shell).
 */
(function (global) {
  "use strict";
  const rx = (re) => (cmd) => re.test(cmd.trim());

  const COURSE = {
    title: "Docker Dojo",
    modules: [
      {
        id: "m1",
        title: "Docker Fundamentals",
        lessons: [
          {
            id: "l1",
            title: "Your First Container",
            subtitle: "Verify Docker and run the classic hello-world image.",
            intro:
              "A <b>container</b> is a lightweight, isolated process created from an <b>image</b> — a read-only template. " +
              "Let's confirm Docker is installed and run your very first container.",
            concepts: [
              ["Image", "A packaged, read-only template (app + dependencies)."],
              ["Container", "A running (or stopped) instance of an image."],
            ],
            steps: [
              { instruction: "Check that the Docker client and engine are available.", cmd: "docker version", hint: "Type: docker version", check: rx(/^docker\s+version$/) },
              { instruction: "Run the <code>hello-world</code> image. Docker will pull it, then run it once.", cmd: "docker run hello-world", hint: "Type: docker run hello-world", check: rx(/^docker\s+run\s+hello-world$/) },
              { instruction: "The container ran and exited. List <em>all</em> containers (including stopped ones) to see it.", cmd: "docker ps -a", hint: "Running containers hide when stopped — add -a to see all: docker ps -a", check: rx(/^docker\s+ps\s+(-a|--all)$/) },
            ],
          },
          {
            id: "l2",
            title: "Images & the Registry",
            subtitle: "Pull an image from Docker Hub and inspect your local cache.",
            intro:
              "Images live in a <b>registry</b> (Docker Hub by default). <code>docker pull</code> downloads one to your machine; " +
              "<code>docker images</code> lists what you already have locally.",
            concepts: [
              ["Registry", "A server that stores images (Docker Hub, GHCR, ECR…)."],
              ["Tag", "A version label, e.g. nginx:latest or python:3.12."],
            ],
            steps: [
              { instruction: "Download the <code>nginx</code> web-server image.", cmd: "docker pull nginx", hint: "Type: docker pull nginx", check: rx(/^docker\s+pull\s+nginx(:\S+)?$/) },
              { instruction: "List the images now stored locally.", cmd: "docker images", hint: "Type: docker images", check: rx(/^docker\s+images$/) },
              { instruction: "Pull the tiny <code>alpine</code> Linux image (only ~7 MB).", cmd: "docker pull alpine", hint: "Type: docker pull alpine", check: rx(/^docker\s+pull\s+alpine(:\S+)?$/) },
            ],
          },
          {
            id: "l3",
            title: "Run, List, Stop, Remove",
            subtitle: "The container lifecycle in four commands.",
            intro:
              "Real workloads run in the background. <code>-d</code> detaches, <code>--name</code> gives a friendly name. " +
              "You then <b>stop</b> and <b>remove</b> containers you no longer need.",
            concepts: [
              ["-d", "Detached: run in the background."],
              ["--name", "Assign a stable name instead of a random one."],
            ],
            steps: [
              { instruction: "Start nginx in the background, named <code>web</code>.", cmd: "docker run -d --name web nginx", hint: "Combine flags: docker run -d --name web nginx", check: (c, e) => /docker\s+run\b/.test(c) && !!e.findContainer("web") && e.findContainer("web").status === "running" },
              { instruction: "Confirm it's running.", cmd: "docker ps", hint: "Type: docker ps", check: rx(/^docker\s+ps$/) },
              { instruction: "Stop the <code>web</code> container.", cmd: "docker stop web", hint: "Type: docker stop web", check: (c, e) => { const w = e.findContainer("web"); return /docker\s+stop\b/.test(c) && w && w.status === "exited"; } },
              { instruction: "Remove it for good.", cmd: "docker rm web", hint: "Type: docker rm web", check: (c, e) => /docker\s+rm\b/.test(c) && !e.findContainer("web") },
            ],
          },
        ],
      },
      {
        id: "m2",
        title: "Working Inside Containers",
        lessons: [
          {
            id: "l4",
            title: "Interactive Shells",
            subtitle: "Drop into a live shell inside a container.",
            intro:
              "The <code>-it</code> flags attach an interactive terminal. Run a shell inside <b>ubuntu</b>, poke around, then " +
              "<code>exit</code> to return to your host. Notice how the prompt changes to <code>root@&lt;id&gt;</code>.",
            concepts: [
              ["-it", "Interactive + TTY: keep a terminal open."],
              ["exit", "Leaves the container shell; the container stops."],
            ],
            steps: [
              { instruction: "Open a bash shell inside a new ubuntu container.", cmd: "docker run -it ubuntu bash", hint: "Type: docker run -it ubuntu bash", check: (c, e) => /docker\s+run\b.*\bubuntu\b/.test(c) && e.shellStack.length > 0 },
              { instruction: "You're inside! Check which user you are.", cmd: "whoami", hint: "Type: whoami  (you should be root)", check: (c, e) => c.trim() === "whoami" && e.shellStack.length > 0 },
              { instruction: "See which Linux distribution this is.", cmd: "cat /etc/os-release", hint: "Type: cat /etc/os-release", check: (c, e) => /cat\s+\/etc\/os-release/.test(c) && e.shellStack.length > 0 },
              { instruction: "Leave the container and return to your host prompt.", cmd: "exit", hint: "Type: exit", check: (c, e) => e.shellStack.length === 0 && /exit/.test(c) },
            ],
          },
          {
            id: "l5",
            title: "Exec Into Running Containers",
            subtitle: "Run commands in a container that's already up.",
            intro:
              "<code>docker exec</code> runs a command inside an <em>already-running</em> container — perfect for debugging a " +
              "live service without restarting it.",
            concepts: [
              ["exec", "Run a new process in a running container."],
              ["logs", "Show what a container has printed to stdout."],
            ],
            steps: [
              { instruction: "Start nginx in the background named <code>site</code>.", cmd: "docker run -d --name site nginx", hint: "Type: docker run -d --name site nginx", check: (c, e) => /docker\s+run\b/.test(c) && e.findContainer("site") && e.findContainer("site").status === "running" },
              { instruction: "Exec an interactive shell into it.", cmd: "docker exec -it site bash", hint: "Type: docker exec -it site bash", check: (c, e) => /docker\s+exec\b/.test(c) && e.shellStack.length > 0 },
              { instruction: "Print the hostname inside the container.", cmd: "hostname", hint: "Type: hostname", check: (c, e) => c.trim() === "hostname" && e.shellStack.length > 0 },
              { instruction: "Leave the container shell (the container keeps running).", cmd: "exit", hint: "Type: exit", check: (c, e) => /^exit$/.test(c.trim()) && e.shellStack.length === 0 },
              { instruction: "Read the running container's logs from the host.", cmd: "docker logs site", hint: "Type: docker logs site", check: (c, e) => /docker\s+logs\s+site/.test(c) && e.shellStack.length === 0 },
            ],
          },
          {
            id: "l6",
            title: "Publishing Ports",
            subtitle: "Make a container reachable from your machine.",
            intro:
              "Containers are network-isolated. To reach nginx's port 80 from your host, <b>publish</b> it with " +
              "<code>-p HOST:CONTAINER</code>. Then <code>docker ps</code> shows the mapping.",
            concepts: [
              ["-p 8080:80", "Map host port 8080 → container port 80."],
              ["PORTS column", "docker ps shows active mappings."],
            ],
            steps: [
              { instruction: "Run nginx detached, mapping host <code>8080</code> → container <code>80</code>, named <code>proxy</code>.", cmd: "docker run -d -p 8080:80 --name proxy nginx", hint: "Type: docker run -d -p 8080:80 --name proxy nginx", check: (c, e) => { const p = e.findContainer("proxy"); return /-p\s+8080:80/.test(c) && p && p.status === "running"; } },
              { instruction: "Check the PORTS column to confirm the mapping.", cmd: "docker ps", hint: "Type: docker ps and look at PORTS", check: rx(/^docker\s+ps$/) },
              { instruction: "Clean up: stop and remove the proxy in one go.", cmd: "docker rm -f proxy", hint: "Force-remove a running container: docker rm -f proxy", check: (c, e) => /docker\s+rm\b/.test(c) && !e.findContainer("proxy") },
            ],
          },
        ],
      },
      {
        id: "m3",
        title: "Building Your Own Images",
        lessons: [
          {
            id: "l7",
            title: "Build From a Dockerfile",
            subtitle: "Turn source code into your own image.",
            intro:
              "A <b>Dockerfile</b> is a recipe. We've put one in your working directory:" +
              "<pre class='code'>FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD [\"node\", \"server.js\"]</pre>" +
              "Build it into an image, then run it.",
            setup: (e) => { e.hasDockerfile = ["FROM node:20-alpine", "WORKDIR /app", "COPY . .", "RUN npm install", 'CMD ["node", "server.js"]']; },
            concepts: [
              ["-t myapp", "Tag (name) the resulting image."],
              [".", "Build context: the current directory."],
            ],
            steps: [
              { instruction: "View the Dockerfile.", cmd: "cat Dockerfile", hint: "Type: cat Dockerfile", check: rx(/^cat\s+Dockerfile$/) },
              { instruction: "Build an image tagged <code>myapp</code> from the current directory.", cmd: "docker build -t myapp .", hint: "Type: docker build -t myapp .", check: (c, e) => /docker\s+build\b/.test(c) && !!e.images["myapp"] },
              { instruction: "Confirm your new image exists.", cmd: "docker images", hint: "Type: docker images", check: rx(/^docker\s+images$/) },
              { instruction: "Run a container from your own image, detached.", cmd: "docker run -d myapp", hint: "Type: docker run -d myapp", check: (c, e) => /docker\s+run\b.*\bmyapp\b/.test(c) },
            ],
          },
        ],
      },

      {
        id: "m4",
        title: "Inspecting & Debugging",
        lessons: [
          {
            id: "l8",
            title: "Inspect & Metadata",
            subtitle: "Read a container's full configuration and processes.",
            intro:
              "<code>docker inspect</code> returns a container's complete JSON config — image, state, env, mounts, network. " +
              "Use <code>-f</code> with a Go template to pull out one field, and <code>docker top</code> to see its processes.",
            concepts: [
              ["inspect", "Low-level JSON metadata for any Docker object."],
              ["-f '{{.State.Status}}'", "Extract a single field via a Go template."],
            ],
            steps: [
              { instruction: "Start nginx in the background named <code>api</code>.", cmd: "docker run -d --name api nginx", hint: "docker run -d --name api nginx", check: (c, e) => { const x = e.findContainer("api"); return /docker\s+run\b/.test(c) && x && x.status === "running"; } },
              { instruction: "Inspect its full JSON metadata.", cmd: "docker inspect api", hint: "docker inspect api", check: rx(/^docker\s+inspect\s+api$/) },
              { instruction: "Extract just the running state with a format template.", cmd: "docker inspect -f '{{.State.Status}}' api", hint: "docker inspect -f '{{.State.Status}}' api", check: (c) => /docker\s+inspect\s+-f/.test(c) && /State\.Status/.test(c) },
              { instruction: "List the processes running inside the container.", cmd: "docker top api", hint: "docker top api", check: rx(/^docker\s+top\s+api$/) },
            ],
          },
          {
            id: "l9",
            title: "Live Diagnostics",
            subtitle: "Watch resource usage, filesystem changes, and copy files out.",
            intro:
              "When something misbehaves, reach for <code>docker stats</code> (live CPU/memory), <code>docker diff</code> " +
              "(filesystem changes vs the image), and <code>docker cp</code> (copy files in or out of a container).",
            concepts: [
              ["stats", "Live CPU / memory / network per container."],
              ["diff", "Files Added, Changed, or Deleted vs the image."],
            ],
            steps: [
              { instruction: "Run nginx detached, named <code>mon</code>.", cmd: "docker run -d --name mon nginx", hint: "docker run -d --name mon nginx", check: (c, e) => e.findContainer("mon") && e.findContainer("mon").status === "running" },
              { instruction: "Show live resource usage for all running containers.", cmd: "docker stats", hint: "docker stats", check: rx(/^docker\s+stats(\s+--no-stream)?$/) },
              { instruction: "See what files changed in the container since it started.", cmd: "docker diff mon", hint: "docker diff mon", check: rx(/^docker\s+diff\s+mon$/) },
              { instruction: "Copy nginx's config file out to your host.", cmd: "docker cp mon:/etc/nginx/nginx.conf ./nginx.conf", hint: "docker cp mon:/etc/nginx/nginx.conf ./nginx.conf", check: (c) => /^docker\s+cp\s+mon:/.test(c.trim()) },
            ],
          },
        ],
      },

      {
        id: "m5",
        title: "Data, Volumes & Config",
        lessons: [
          {
            id: "l10",
            title: "Persist Data with Volumes",
            subtitle: "Keep data alive beyond a container's lifetime.",
            intro:
              "Container filesystems are ephemeral — delete the container and its data is gone. A <b>named volume</b> " +
              "stores data outside the container. Mount it with <code>-v name:/path</code>.",
            concepts: [
              ["volume create", "Make a managed, persistent storage volume."],
              ["-v data:/var/lib", "Mount volume 'data' at a path in the container."],
            ],
            steps: [
              { instruction: "Create a named volume called <code>appdata</code>.", cmd: "docker volume create appdata", hint: "docker volume create appdata", check: (c, e) => /volume\s+create/.test(c) && !!e.findVolume("appdata") },
              { instruction: "List your volumes.", cmd: "docker volume ls", hint: "docker volume ls", check: rx(/^docker\s+volume\s+ls$/) },
              { instruction: "Run redis with the volume mounted at <code>/data</code>, named <code>cache</code>.", cmd: "docker run -d --name cache -v appdata:/data redis", hint: "docker run -d --name cache -v appdata:/data redis", check: (c, e) => { const x = e.findContainer("cache"); return x && x.mounts && x.mounts.some((m) => m.indexOf("appdata") === 0); } },
              { instruction: "Inspect the volume to see where Docker stores it.", cmd: "docker volume inspect appdata", hint: "docker volume inspect appdata", check: rx(/^docker\s+volume\s+inspect\s+appdata$/) },
            ],
          },
          {
            id: "l11",
            title: "Environment Variables",
            subtitle: "Configure containers at runtime with -e.",
            intro:
              "Most images are configured through <b>environment variables</b>. Pass them with <code>-e KEY=value</code> " +
              "(repeatable). Then verify them via <code>docker inspect</code>.",
            concepts: [
              ["-e KEY=value", "Set an environment variable in the container."],
              ["12-factor", "Config via env keeps images reusable across environments."],
            ],
            steps: [
              { instruction: "Start postgres named <code>pg</code>, setting a password and DB name.", cmd: "docker run -d --name pg -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app postgres", hint: "docker run -d --name pg -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app postgres", check: (c, e) => { const x = e.findContainer("pg"); return x && x.env && x.env.length >= 2; } },
              { instruction: "Inspect the container and find your variables under Config.Env.", cmd: "docker inspect pg", hint: "docker inspect pg", check: rx(/^docker\s+inspect\s+pg$/) },
              { instruction: "Stop the database.", cmd: "docker stop pg", hint: "docker stop pg", check: (c, e) => e.findContainer("pg") && e.findContainer("pg").status === "exited" },
              { instruction: "Remove it.", cmd: "docker rm pg", hint: "docker rm pg", check: (c, e) => !e.findContainer("pg") },
            ],
          },
        ],
      },

      {
        id: "m6",
        title: "Container Networking",
        lessons: [
          {
            id: "l12",
            title: "Custom Bridge Networks",
            subtitle: "Let containers talk to each other by name.",
            intro:
              "Containers on a <b>user-defined bridge network</b> can reach each other using their container names as " +
              "hostnames. Create a network, attach containers with <code>--network</code>, and inspect it.",
            concepts: [
              ["network create", "Make an isolated virtual network."],
              ["--network appnet", "Attach a container to that network at run time."],
            ],
            steps: [
              { instruction: "Create a bridge network named <code>appnet</code>.", cmd: "docker network create appnet", hint: "docker network create appnet", check: (c, e) => /network\s+create/.test(c) && !!e.findNetwork("appnet") },
              { instruction: "List all networks (note the default bridge, host, none).", cmd: "docker network ls", hint: "docker network ls", check: rx(/^docker\s+network\s+ls$/) },
              { instruction: "Run nginx named <code>web</code> attached to <code>appnet</code>.", cmd: "docker run -d --name web --network appnet nginx", hint: "docker run -d --name web --network appnet nginx", check: (c, e) => { const x = e.findContainer("web"); return x && x.network === "appnet"; } },
              { instruction: "Inspect the network to see connected settings.", cmd: "docker network inspect appnet", hint: "docker network inspect appnet", check: rx(/^docker\s+network\s+inspect\s+appnet$/) },
            ],
          },
        ],
      },

      {
        id: "m7",
        title: "Lifecycle & Cleanup",
        lessons: [
          {
            id: "l13",
            title: "Pause, Restart & Kill",
            subtitle: "Control a container's process lifecycle.",
            intro:
              "Beyond stop/start you can <code>pause</code> (freeze processes), <code>unpause</code>, <code>restart</code>, " +
              "and <code>kill</code> (send SIGKILL immediately). Watch the STATUS column change as you go.",
            concepts: [
              ["pause / unpause", "Freeze / resume all processes (SIGSTOP)."],
              ["kill", "Force-stop immediately, no graceful shutdown."],
            ],
            steps: [
              { instruction: "Run nginx detached, named <code>svc</code>.", cmd: "docker run -d --name svc nginx", hint: "docker run -d --name svc nginx", check: (c, e) => e.findContainer("svc") && e.findContainer("svc").status === "running" },
              { instruction: "Pause it (freeze its processes).", cmd: "docker pause svc", hint: "docker pause svc", check: (c, e) => e.findContainer("svc") && e.findContainer("svc").status === "paused" },
              { instruction: "Unpause it.", cmd: "docker unpause svc", hint: "docker unpause svc", check: (c, e) => e.findContainer("svc") && e.findContainer("svc").status === "running" },
              { instruction: "Restart it (stop then start in one command).", cmd: "docker restart svc", hint: "docker restart svc", check: (c, e) => /docker\s+restart\s+svc/.test(c) && e.findContainer("svc").status === "running" },
              { instruction: "Force-kill it immediately.", cmd: "docker kill svc", hint: "docker kill svc", check: (c, e) => e.findContainer("svc") && e.findContainer("svc").status === "exited" },
            ],
          },
          {
            id: "l14",
            title: "Housekeeping & Prune",
            subtitle: "Reclaim disk space from stopped containers and unused data.",
            intro:
              "Stopped containers and dangling images pile up. <code>docker system df</code> shows disk usage; " +
              "<code>docker system prune</code> removes everything unused. Use with care on real machines!",
            concepts: [
              ["system df", "Disk usage: images, containers, volumes, cache."],
              ["system prune", "Delete stopped containers + unused networks/images."],
            ],
            steps: [
              { instruction: "Create a throwaway container that exits immediately, named <code>scratch</code>.", cmd: "docker run --name scratch hello-world", hint: "docker run --name scratch hello-world", check: (c, e) => { const x = e.findContainer("scratch"); return x && x.status === "exited"; } },
              { instruction: "List all containers — including the stopped one.", cmd: "docker ps -a", hint: "docker ps -a", check: rx(/^docker\s+ps\s+(-a|--all)$/) },
              { instruction: "Check how much disk Docker is using.", cmd: "docker system df", hint: "docker system df", check: rx(/^docker\s+system\s+df$/) },
              { instruction: "Prune stopped containers to reclaim space.", cmd: "docker system prune -f", hint: "docker system prune -f", check: (c, e) => /system\s+prune/.test(c) && !e.findContainer("scratch") },
            ],
          },
        ],
      },

      {
        id: "m8",
        title: "Compose & Image Authoring",
        lessons: [
          {
            id: "l15",
            title: "Multi-Container Apps with Compose",
            subtitle: "Define and run a whole stack from one file.",
            intro:
              "<b>Docker Compose</b> describes a multi-service app in one YAML file. We've placed a <code>compose.yaml</code> " +
              "(nginx web + postgres db) in your directory. Bring the whole stack up and down with single commands." +
              "<pre class='code'>services:\n  web:\n    image: nginx\n    ports: [\"8080:80\"]\n  db:\n    image: postgres\n    environment:\n      POSTGRES_PASSWORD: secret</pre>",
            setup: (e) => {
              e.hasCompose = ["services:", "  web:", "    image: nginx", '    ports: ["8080:80"]', "  db:", "    image: postgres", "    environment:", "      POSTGRES_PASSWORD: secret"];
            },
            concepts: [
              ["compose up -d", "Create networks + start all services detached."],
              ["compose down", "Stop and remove the whole stack."],
            ],
            steps: [
              { instruction: "View the compose file.", cmd: "cat compose.yaml", hint: "cat compose.yaml", check: rx(/^cat\s+compose\.yaml$/) },
              { instruction: "Bring the entire stack up in the background.", cmd: "docker compose up -d", hint: "docker compose up -d", check: (c, e) => /compose\s+up/.test(c) && !!e.findContainer("app-web-1") },
              { instruction: "List the services Compose is managing.", cmd: "docker compose ps", hint: "docker compose ps", check: rx(/^docker\s+compose\s+ps$/) },
              { instruction: "Tear the whole stack down.", cmd: "docker compose down", hint: "docker compose down", check: (c, e) => /compose\s+down/.test(c) && !e.containers.some((x) => x.name.indexOf("app-") === 0) },
            ],
          },
          {
            id: "l16",
            title: "Tag, History & Commit",
            subtitle: "Version images and turn containers back into images.",
            intro:
              "One image can carry many <b>tags</b> (versions). <code>docker history</code> shows the layers that built it, " +
              "and <code>docker commit</code> snapshots a running container into a brand-new image.",
            setup: (e) => { e.hasDockerfile = ["FROM node:20-alpine", "WORKDIR /app", "COPY . .", "CMD [\"node\", \"server.js\"]"]; },
            concepts: [
              ["tag", "Add another name/version to an existing image."],
              ["commit", "Create an image from a container's current state."],
            ],
            steps: [
              { instruction: "Build an image tagged <code>web:1.0</code> from the Dockerfile.", cmd: "docker build -t web:1.0 .", hint: "docker build -t web:1.0 .", check: (c, e) => /docker\s+build\b/.test(c) && !!e.images["web"] },
              { instruction: "Add a second tag <code>web:latest</code> pointing at the same image.", cmd: "docker tag web:1.0 web:latest", hint: "docker tag web:1.0 web:latest", check: rx(/^docker\s+tag\s+web:1\.0\s+web:latest$/) },
              { instruction: "Inspect the layer history of the image.", cmd: "docker history web", hint: "docker history web", check: rx(/^docker\s+history\s+web$/) },
              { instruction: "List images to confirm both tags exist.", cmd: "docker images", hint: "docker images", check: rx(/^docker\s+images$/) },
            ],
          },
        ],
      },

      {
        id: "m9",
        title: "CLI Power Moves",
        lessons: [
          {
            id: "l17",
            title: "Filters, Formats & Quiet Mode",
            subtitle: "Bend docker ps to scripting-friendly output.",
            intro:
              "For automation you rarely want the full table. <code>-q</code> prints only IDs, <code>--filter</code> narrows " +
              "the list (e.g. <code>status=exited</code>), and <code>--format</code> with a Go template picks exact columns. " +
              "These compose beautifully with shell pipes like <code>docker rm $(docker ps -aq)</code>.",
            concepts: [
              ["-q", "Quiet: output only container IDs."],
              ["--filter status=exited", "Show only containers in a given state."],
              ["--format '{{.Names}}'", "Render just the fields you want."],
            ],
            steps: [
              { instruction: "Start a running nginx named <code>live</code>.", cmd: "docker run -d --name live nginx", hint: "docker run -d --name live nginx", check: (c, e) => e.findContainer("live") && e.findContainer("live").status === "running" },
              { instruction: "Create a container that runs and exits, named <code>gone</code>.", cmd: "docker run --name gone hello-world", hint: "docker run --name gone hello-world", check: (c, e) => e.findContainer("gone") && e.findContainer("gone").status === "exited" },
              { instruction: "List only the <em>exited</em> containers with a filter.", cmd: "docker ps --filter status=exited", hint: "docker ps --filter status=exited", check: (c) => /docker\s+ps\s+--filter\s+status=exited/.test(c) },
              { instruction: "Print just the IDs of running containers (quiet mode).", cmd: "docker ps -q", hint: "docker ps -q", check: rx(/^docker\s+ps\s+-q$/) },
              { instruction: "Format the output to show only names.", cmd: "docker ps --format '{{.Names}}'", hint: "docker ps --format '{{.Names}}'", check: (c) => /docker\s+ps\s+--format/.test(c) && /Names/.test(c) },
            ],
          },
          {
            id: "l18",
            title: "Explore & Connect from Inside",
            subtitle: "Install tools and reach another container by name.",
            intro:
              "Two containers on the same network can reach each other by name. Start a web server, then jump into a tiny " +
              "Alpine container, install <code>curl</code>, and fetch the web server — all from inside the container shell.",
            concepts: [
              ["apk add curl", "Install a package inside Alpine at runtime."],
              ["curl web", "Reach another container using its name as hostname."],
            ],
            steps: [
              { instruction: "Start nginx named <code>web</code>.", cmd: "docker run -d --name web nginx", hint: "docker run -d --name web nginx", check: (c, e) => e.findContainer("web") && e.findContainer("web").status === "running" },
              { instruction: "Open an interactive shell in a fresh Alpine container.", cmd: "docker run -it alpine sh", hint: "docker run -it alpine sh", check: (c, e) => /docker\s+run\b.*\balpine\b/.test(c) && e.shellStack.length > 0 },
              { instruction: "Inside Alpine, install the <code>curl</code> package.", cmd: "apk add curl", hint: "apk add curl", check: (c, e) => /apk\s+add\s+curl/.test(c) && e.shellStack.length > 0 },
              { instruction: "Fetch the nginx welcome page from the <code>web</code> container by name.", cmd: "curl web", hint: "curl web", check: (c, e) => /^curl\s+web/.test(c.trim()) && e.shellStack.length > 0 },
              { instruction: "Leave the Alpine shell.", cmd: "exit", hint: "exit", check: (c, e) => /^exit$/.test(c.trim()) && e.shellStack.length === 0 },
            ],
          },
        ],
      },

      {
        id: "m10",
        title: "Challenges",
        lessons: [
          {
            id: "l19",
            title: "🎯 Challenge: Publish a Gateway",
            subtitle: "No step-by-step — reach the goal your way.",
            intro:
              "<b>Goal:</b> Run an <code>nginx</code> container in the background, named <code>gateway</code>, that publishes " +
              "host port <code>80</code> to container port <code>80</code>. This step checks the <em>end state</em>, not the exact " +
              "keystrokes — so any command that gets you there counts.",
            concepts: [["Success = state", "Challenges verify the resulting containers, not your typing."]],
            steps: [
              { instruction: "Make it so: a running nginx named <code>gateway</code> with host:container port <code>80:80</code> published.", cmd: "docker run -d -p 80:80 --name gateway nginx", hint: "docker run -d -p 80:80 --name gateway nginx", check: (c, e) => { const x = e.findContainer("gateway"); return x && x.image === "nginx" && x.status === "running" && /->80\/tcp/.test(x.ports || ""); } },
            ],
          },
          {
            id: "l20",
            title: "🎯 Challenge: Persistent Database",
            subtitle: "Stand up a database with durable storage.",
            intro:
              "<b>Goal:</b> Create a named volume <code>pgdata</code>, then run a <code>postgres</code> container named " +
              "<code>db</code> that (a) mounts <code>pgdata</code> at <code>/var/lib/postgresql/data</code> and (b) sets " +
              "<code>POSTGRES_PASSWORD</code>. Both parts are checked.",
            concepts: [["Compose the flags", "-v for the volume, -e for the password, -d --name for the rest."]],
            steps: [
              { instruction: "Create the <code>pgdata</code> volume.", cmd: "docker volume create pgdata", hint: "docker volume create pgdata", check: (c, e) => !!e.findVolume("pgdata") },
              { instruction: "Run <code>postgres</code> as <code>db</code>, mounting pgdata at /var/lib/postgresql/data and setting a password.", cmd: "docker run -d --name db -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres", hint: "docker run -d --name db -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres", check: (c, e) => { const x = e.findContainer("db"); return x && x.image === "postgres" && x.status === "running" && (x.mounts || []).some((m) => m.indexOf("pgdata") === 0) && (x.env || []).length >= 1; } },
            ],
          },
          {
            id: "l21",
            title: "🎯 Challenge: Clean Slate",
            subtitle: "Reclaim everything left behind.",
            intro:
              "<b>Goal:</b> You've left a mess. Create a throwaway container and an orphan volume, then prune both so no " +
              "stopped containers and no volumes remain. The final two steps verify the system is clean.",
            concepts: [["prune", "system prune clears stopped containers; volume prune clears unused volumes."]],
            steps: [
              { instruction: "Create a throwaway (exited) container named <code>junk</code>.", cmd: "docker run --name junk hello-world", hint: "docker run --name junk hello-world", check: (c, e) => e.findContainer("junk") && e.findContainer("junk").status === "exited" },
              { instruction: "Create an unused volume named <code>orphan</code>.", cmd: "docker volume create orphan", hint: "docker volume create orphan", check: (c, e) => !!e.findVolume("orphan") },
              { instruction: "Prune stopped containers so <code>junk</code> is gone.", cmd: "docker system prune -f", hint: "docker system prune -f", check: (c, e) => /system\s+prune/.test(c) && !e.findContainer("junk") },
              { instruction: "Prune volumes so none remain.", cmd: "docker volume prune -f", hint: "docker volume prune -f", check: (c, e) => /volume\s+prune/.test(c) && e.volumes.length === 0 },
            ],
          },
        ],
      },
    ],
  };

  // flat list of lessons in order, tagged with their module
  COURSE.flatLessons = [];
  COURSE.modules.forEach((m) => m.lessons.forEach((l) => COURSE.flatLessons.push(Object.assign({ moduleTitle: m.title, moduleId: m.id }, l))));
  COURSE.totalSteps = COURSE.flatLessons.reduce((n, l) => n + l.steps.length, 0);

  global.COURSE = COURSE;
})(window);
