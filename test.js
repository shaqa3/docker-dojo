/* Docker Dojo test harness — run with:  node test.js
 * Loads the browser modules under a minimal window shim and verifies that
 * every lesson step's validator passes when its intended command is run
 * through the simulated engine. Exits non-zero on any failure (CI-friendly).
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = global;
eval(fs.readFileSync(path.join(__dirname, "js/lessons.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "js/engine.js"), "utf8"));

const COURSE = global.COURSE;
const Engine = global.DockerEngine;

let fails = 0, total = 0;
for (const lesson of COURSE.flatLessons) {
  const engine = new Engine();
  if (typeof lesson.setup === "function") lesson.setup(engine);
  for (let i = 0; i < lesson.steps.length; i++) {
    const step = lesson.steps[i];
    engine.execLine(step.cmd); // run the intended command; mutates engine state
    let ok = false, err = "";
    try { ok = step.check(step.cmd, engine); } catch (e) { ok = false; err = e.message; }
    total++;
    if (!ok) { fails++; console.log(`  ✗ [${lesson.id} step ${i + 1}] ${step.cmd}${err ? "  (" + err + ")" : ""}`); }
  }
}

const pass = total - fails;
console.log(`\n${pass}/${total} step validators passed · ${COURSE.flatLessons.length} lessons · ${COURSE.modules.length} modules`);
if (fails) { console.log("FAILED"); process.exit(1); }
console.log("OK");
