// Canvas rendering, the falling/stacking simulation, and DOM wiring.
// All the analysis logic this depends on lives in ./analyze.js.

import { analyze, colorForScore, SAMPLE_TEXT } from "./analyze.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const statusEl = document.getElementById("status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let dpr = Math.max(1, window.devicePixelRatio || 1);
let W = 0, H = 0;
const WALL_MARGIN = 14;
const FLOOR_MARGIN = 16;
const GRAVITY = 1500;

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.max(1, window.devicePixelRatio || 1);
  W = rect.width; H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const b of settled) b.x = Math.min(Math.max(b.x, WALL_MARGIN), Math.max(WALL_MARGIN, W - WALL_MARGIN - b.w));
  render();
}

let settled = [];   // {x,y,w,h,fontSize,color,text,angle,count,score,champion}
let falling = [];   // {x,y,vx,vy,w,h,fontSize,color,text,phase,count,score,champion}
let queue = [];
let spawnAcc = 0;
const SPAWN_INTERVAL = 0.085;
let dragging = null;
let dragOffset = { x: 0, y: 0 };
let pointerDownInfo = null;
let hovered = null;
let rafId = null;

function measure(text, fontSize) {
  ctx.font = `600 ${fontSize}px "Noto Sans SC", system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  return { w: w + fontSize * 0.6, h: fontSize * 1.4 };
}

// Bucketed skyline, laid out for a whole batch up front: every item gets
// a non-overlapping (x, targetY) slot before any of them start falling.
// Doing this live per-spawn (querying `settled`) let several words that
// are simultaneously mid-air — none of them landed yet — all aim at the
// same "currently lowest" column, so they piled on top of each other and
// hid one another. Precomputing the whole batch avoids that race.
const BUCKET = 8;

function packLayout(specs) {
  const usableW = Math.max(1, W - WALL_MARGIN * 2);
  const n = Math.max(1, Math.ceil(usableW / BUCKET));
  const floorY = H - FLOOR_MARGIN;
  const hm = new Float64Array(n).fill(floorY);
  const out = [];
  for (const spec of specs) {
    const spanBuckets = Math.max(1, Math.min(n, Math.ceil(spec.w / BUCKET)));
    const maxStart = Math.max(0, n - spanBuckets);
    let bestLanding = -Infinity;
    let candidates = [];
    for (let start = 0; start <= maxStart; start++) {
      let landing = Infinity;
      for (let i = start; i < start + spanBuckets; i++) landing = Math.min(landing, hm[i]);
      if (landing > bestLanding + 0.01) { bestLanding = landing; candidates = [start]; }
      else if (Math.abs(landing - bestLanding) <= 0.01) candidates.push(start);
    }
    const startB = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 0;
    const x = Math.min(Math.max(WALL_MARGIN + startB * BUCKET, WALL_MARGIN), Math.max(WALL_MARGIN, W - WALL_MARGIN - spec.w));
    const targetY = Math.max(bestLanding - spec.h, 2);
    const s2 = Math.max(0, Math.floor((x - WALL_MARGIN) / BUCKET));
    const e2 = Math.min(n - 1, Math.ceil((x + spec.w - WALL_MARGIN) / BUCKET));
    for (let i = s2; i <= e2; i++) hm[i] = Math.min(hm[i], targetY);
    out.push({ ...spec, targetX: x, targetY });
  }
  return out;
}

function stackTopFor(x, w) {
  let top = H - FLOOR_MARGIN;
  for (const s of settled) {
    if (x < s.x + s.w && x + w > s.x) {
      top = Math.min(top, s.y);
    }
  }
  return top;
}

function startDrop(items) {
  // items already sorted heaviest-first by analyze(): laying them out in
  // that order means heavy words claim the bottom, light ones end up on top.
  stopLoop();
  queue = packLayout(items.map((item) => {
    const fontSize = Math.max(12, Math.min(44, item.mass));
    const { w, h } = measure(item.word, fontSize);
    return { w, h, fontSize, color: colorForScore(item.score), text: item.word, count: item.count, score: item.score, champion: !!item.champion };
  }));
  spawnAcc = 0;
  if (reducedMotion) {
    for (const b of queue) {
      settled.push({ x: b.targetX, y: b.targetY, w: b.w, h: b.h, fontSize: b.fontSize, color: b.color, text: b.text, count: b.count, score: b.score, champion: b.champion, angle: (Math.random() - 0.5) * 0.12 });
    }
    queue = [];
    render();
    return;
  }
  loop();
}

function scatter() {
  if (!settled.length) return;
  stopLoop();
  const laid = packLayout(settled.slice().sort((a, b) => b.fontSize - a.fontSize));
  settled = [];
  for (const b of laid) {
    falling.push({
      x: b.targetX, y: Math.min(b.y, H - FLOOR_MARGIN - b.h),
      w: b.w, h: b.h, fontSize: b.fontSize, color: b.color,
      text: b.text, count: b.count, score: b.score, champion: b.champion,
      vx: (Math.random() - 0.5) * 60,
      vy: -(250 + Math.random() * 300),
      phase: Math.random() * Math.PI * 2, angle: 0,
      targetX: b.targetX, targetY: b.targetY
    });
  }
  if (reducedMotion) {
    for (const b of falling) {
      settled.push({ x: b.targetX, y: b.targetY, w: b.w, h: b.h, fontSize: b.fontSize, color: b.color, text: b.text, count: b.count, score: b.score, champion: b.champion, angle: (Math.random() - 0.5) * 0.12 });
    }
    falling = [];
    render();
    return;
  }
  loop();
}

function tidy() {
  if (!settled.length) return;
  stopLoop();
  falling = []; queue = [];
  const laid = packLayout(settled.slice().sort((a, b) => b.fontSize - a.fontSize));
  settled = laid.map((b) => ({
    x: b.targetX, y: b.targetY, w: b.w, h: b.h, fontSize: b.fontSize, color: b.color,
    text: b.text, count: b.count, score: b.score, champion: b.champion,
    angle: (Math.random() - 0.5) * 0.12
  }));
  render();
}

function clearAll() {
  stopLoop();
  settled = []; falling = []; queue = [];
  render();
  updateStatus(0, 0, null);
}

let lastT = null;
function loop(ts) {
  if (lastT === null) lastT = ts ?? performance.now();
  const now = ts ?? performance.now();
  const dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;

  spawnAcc += dt;
  while (queue.length && spawnAcc >= SPAWN_INTERVAL) {
    spawnAcc -= SPAWN_INTERVAL;
    const spec = queue.shift();
    falling.push({
      x: spec.targetX, y: -spec.h - Math.random() * 60,
      vx: (Math.random() - 0.5) * 8, vy: 0,
      w: spec.w, h: spec.h, fontSize: spec.fontSize, color: spec.color,
      text: spec.text, count: spec.count, score: spec.score, champion: spec.champion,
      phase: Math.random() * Math.PI * 2, angle: 0,
      targetX: spec.targetX, targetY: spec.targetY
    });
  }

  for (let i = falling.length - 1; i >= 0; i--) {
    const b = falling[i];
    b.vy += GRAVITY * dt;
    b.vx *= 0.985;
    b.phase += dt * 3.2;
    const wobble = Math.sin(b.phase) * 6;
    b.x += (b.vx * dt) + wobble * dt;
    b.y += b.vy * dt;

    if (b.x < WALL_MARGIN) { b.x = WALL_MARGIN; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x + b.w > W - WALL_MARGIN) { b.x = W - WALL_MARGIN - b.w; b.vx = -Math.abs(b.vx) * 0.5; }

    // each falling word already knows exactly where it's going to rest
    // (assigned up front by packLayout), so landing is just "did it get there".
    if (b.y >= b.targetY) {
      settled.push({
        x: b.targetX, y: b.targetY, w: b.w, h: b.h, fontSize: b.fontSize, color: b.color,
        text: b.text, count: b.count, score: b.score, champion: b.champion,
        angle: (Math.random() - 0.5) * 0.12
      });
      falling.splice(i, 1);
    }
  }

  render();

  if (falling.length || queue.length) {
    rafId = requestAnimationFrame(loop);
  } else {
    rafId = null;
    lastT = null;
  }
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  lastT = null;
}

function drawBody(b) {
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate(b.angle || 0);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  roundRect(-b.w / 2 + 2, -b.h / 2 + 3, b.w, b.h, 8);
  ctx.fill();
  ctx.fillStyle = b.color;
  roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 8);
  ctx.fill();
  ctx.fillStyle = "#14181B";
  ctx.font = `600 ${b.fontSize}px "Noto Sans SC", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.text, 0, b.h * 0.02);

  if (b.champion) {
    const r = Math.max(7, b.fontSize * 0.24);
    ctx.translate(b.w / 2 - r * 0.7, -b.h / 2 + r * 0.7);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "#F4E3B2";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#5A4300";
    ctx.font = `${r * 1.3}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", 0, r * 0.05);
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Painted explicitly (rather than left transparent over the CSS jar
// background) so a canvas.toBlob() export is a self-contained image.
let JAR_BG = getComputedStyle(document.documentElement).getPropertyValue("--jar-bg").trim() || "#171C20";

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = JAR_BG;
  ctx.fillRect(0, 0, W, H);
  const groundGrad = ctx.createLinearGradient(0, H - 60, 0, H);
  groundGrad.addColorStop(0, "rgba(0,0,0,0)");
  groundGrad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, H - 60, W, 60);
  ctx.strokeStyle = "rgba(237,232,225,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - FLOOR_MARGIN + 0.5);
  ctx.lineTo(W, H - FLOOR_MARGIN + 0.5);
  ctx.stroke();

  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.fillStyle = "rgba(237,232,225,0.3)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("字重 · zizhong", W - 14, H - 8);

  for (const b of settled) if (b !== dragging) drawBody(b);
  for (const b of falling) drawBody(b);
  if (dragging) drawBody(dragging);
}

function updateStatus(unique, truncated, championWord) {
  if (!unique) { statusEl.textContent = ""; return; }
  const base = truncated > 0
    ? `共 ${unique} 个不同词 · 已显示前 ${unique - truncated} 个`
    : `共 ${unique} 个不同词`;
  statusEl.textContent = championWord ? `${base} · 镇瓶之词："${championWord}"` : base;
}

// ---------- pointer interaction ----------

function bodyAt(x, y, list) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function showTooltip(b, x, y) {
  const label = b.score > 0
    ? `<b>积极 +${b.score}</b>`
    : b.score < 0
      ? `<span class="neg">消极 ${b.score}</span>`
      : `<span class="neu">中性</span>`;
  const crown = b.champion ? "👑 镇瓶之词<br>" : "";
  tooltip.innerHTML = `${crown}“${b.text}” · 出现 ${b.count} 次<br>${label}`;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
  tooltip.classList.add("visible");
}
function hideTooltip() { tooltip.classList.remove("visible"); }

canvas.addEventListener("pointerdown", (evt) => {
  const p = canvasPoint(evt);
  const b = bodyAt(p.x, p.y, settled);
  pointerDownInfo = { x: p.x, y: p.y, moved: false, body: b };
  if (b) {
    settled = settled.filter((s) => s !== b);
    dragging = b;
    dragOffset = { x: p.x - b.x, y: p.y - b.y };
    canvas.setPointerCapture(evt.pointerId);
    hideTooltip();
  }
});

canvas.addEventListener("pointermove", (evt) => {
  const p = canvasPoint(evt);
  if (dragging) {
    if (pointerDownInfo) {
      const dx = p.x - pointerDownInfo.x, dy = p.y - pointerDownInfo.y;
      if (Math.hypot(dx, dy) > 4) pointerDownInfo.moved = true;
    }
    dragging.x = Math.min(Math.max(p.x - dragOffset.x, WALL_MARGIN), Math.max(WALL_MARGIN, W - WALL_MARGIN - dragging.w));
    dragging.y = Math.max(p.y - dragOffset.y, -dragging.h);
    dragging.angle = 0;
    render();
    return;
  }
  const b = bodyAt(p.x, p.y, settled);
  if (b) {
    hovered = b;
    canvas.style.cursor = "grab";
    showTooltip(b, p.x, p.y);
  } else if (hovered) {
    hovered = null;
    canvas.style.cursor = "default";
    hideTooltip();
  }
});

function endDrag(evt) {
  if (!dragging) { pointerDownInfo = null; return; }
  const moved = pointerDownInfo?.moved;
  const b = dragging;
  dragging = null;
  if (!moved) {
    // treat as a click: settle back exactly, show tooltip
    const top = stackTopFor(b.x, b.w);
    b.y = Math.min(b.y, top - b.h);
    settled.push(b);
    const p = canvasPoint(evt);
    showTooltip(b, p.x, p.y);
  } else {
    // a single manually-dropped word: safe to target live against the
    // current pile (no batch race, since nothing else is spawning here)
    const targetX = Math.min(Math.max(b.x, WALL_MARGIN), Math.max(WALL_MARGIN, W - WALL_MARGIN - b.w));
    const targetY = stackTopFor(targetX, b.w) - b.h;
    falling.push({ ...b, x: targetX, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, targetX, targetY });
    if (!rafId) loop();
  }
  pointerDownInfo = null;
  render();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => { if (!dragging) hideTooltip(); });

// ---------- wiring ----------

const input = document.getElementById("input");
const consoleEl = document.querySelector(".console");
const a11ySummary = document.getElementById("a11y-summary");

function growInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 280) + "px";
}
input.addEventListener("input", growInput);

function flashEmpty() {
  statusEl.textContent = "先粘贴点文字进来吧";
  consoleEl.classList.remove("shake");
  void consoleEl.offsetWidth; // restart the animation on repeated clicks
  consoleEl.classList.add("shake");
  setTimeout(() => consoleEl.classList.remove("shake"), 450);
  input.focus();
}

function updateA11ySummary(words) {
  if (!words.length) { a11ySummary.textContent = ""; return; }
  const top = words.slice(0, 15).map((w) =>
    `${w.word}（${w.count} 次，${w.score > 0 ? "积极" : w.score < 0 ? "消极" : "中性"}）`
  ).join("、");
  a11ySummary.textContent = `按重量从高到低：${top}`;
}

function doDrop() {
  const { words, totalUnique, truncated } = analyze(input.value);
  if (!words.length) { flashEmpty(); return; }
  settled = []; falling = []; queue = [];
  startDrop(words);
  updateStatus(totalUnique, truncated, words[0].word);
  updateA11ySummary(words);
}

// ---------- share link ----------

function getSharedText() {
  const m = location.hash.match(/t=([^&]*)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return null; }
}
function buildShareUrl(text) {
  return location.href.split("#")[0] + "#t=" + encodeURIComponent(text);
}

document.getElementById("btn-drop").addEventListener("click", doDrop);
document.getElementById("btn-tidy").addEventListener("click", tidy);
document.getElementById("btn-scatter").addEventListener("click", scatter);
document.getElementById("btn-clear").addEventListener("click", () => { clearAll(); });
document.getElementById("btn-sample").addEventListener("click", () => { input.value = SAMPLE_TEXT; growInput(); });

// In the Claude artifact preview, the `downloads` capability hands the
// file to the viewer's own save prompt. On plain web hosting (e.g. this
// GitHub Pages copy) `window.claude` doesn't exist, so fall back to a
// normal browser download link.
async function saveDownload(filename, blob) {
  if (window.claude && typeof window.claude.use === "function") {
    try {
      const downloads = await window.claude.use("downloads");
      if (downloads) { await downloads.save({ filename, data: blob }); return; }
    } catch (e) {
      return; // viewer declined, or saves unavailable here — no auto-retry
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

document.getElementById("btn-save").addEventListener("click", () => {
  canvas.toBlob((blob) => { if (blob) saveDownload("zizhong.png", blob); });
});

const shareBtn = document.getElementById("btn-share");
shareBtn.addEventListener("click", async () => {
  const text = input.value.trim();
  if (!text) { flashEmpty(); return; }
  const url = buildShareUrl(text);
  const original = shareBtn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = "已复制链接 ✓";
  } catch (e) {
    shareBtn.textContent = "复制失败，请手动复制地址栏";
  }
  setTimeout(() => { shareBtn.textContent = original; }, 1800);
});

window.addEventListener("resize", resize);
resize();
growInput();

const sharedText = getSharedText();
if (sharedText) { input.value = sharedText; growInput(); }

function afterFontsReady() {
  resize();
  if (sharedText) doDrop();
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(afterFontsReady);
} else {
  afterFontsReady();
}
