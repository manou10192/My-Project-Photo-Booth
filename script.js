/* =======================================================================
       APPLICATION STATE & FILTER CONFIGURATION
       ======================================================================= */
const app = {
  stream: null,
  facingMode: "user", // 'user' (selfie) or 'environment' (rear)
  isMirrored: true,
  timerSec: 3,
  isBurstMode: true,
  isCapturing: false,
  currentFilter: "normal",
  layout: "4cut", // '4cut', '2x2', 'polaroid'
  frameColor: "#FFFFFF",
  frameColorName: "Snow White",
  roundCorners: true,
  filmGrain: true,
  caption: "AURA PHOTO STUDIO",
  dateText: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
  fontFamily: "sans",
  activeSticker: "🎀",
  stickers: [], // Array of { emoji, x, y, size, rotation }
  photos: [null, null, null, null], // captured shot data
  currentSlot: 0,
};

const FILTERS = [
  { id: "normal", name: "Original", css: "none" },
  {
    id: "glow",
    name: "Soft Glow",
    css: "brightness(110%) contrast(92%) saturate(125%)",
  },
  {
    id: "bw",
    name: "Noir B&W",
    css: "grayscale(100%) contrast(118%) brightness(104%)",
  },
  {
    id: "warm",
    name: "Warm 90s",
    css: "sepia(22%) contrast(112%) saturate(130%) hue-rotate(-8deg)",
  },
  {
    id: "sepia",
    name: "Vintage",
    css: "sepia(60%) saturate(135%) contrast(98%)",
  },
  {
    id: "cyber",
    name: "Cyber",
    css: "contrast(130%) saturate(160%) hue-rotate(185deg)",
  },
  {
    id: "y2k",
    name: "Y2K Pop",
    css: "contrast(115%) brightness(115%) saturate(145%) hue-rotate(15deg)",
  },
];

const STICKER_ICONS = [
  "🎀",
  "✨",
  "💖",
  "🍒",
  "🧸",
  "⭐",
  "🐰",
  "🦋",
  "💌",
  "🌸",
  "🍀",
  "🫧",
  "🐈",
  "🍰",
];

// DOM Elements
const video = document.getElementById("webcam-video");
const flash = document.getElementById("camera-flash");
const countdownWrap = document.getElementById("countdown-wrap");
const countdownNum = document.getElementById("countdown-num");
const boothCanvas = document.getElementById("booth-canvas");
const ctx = boothCanvas.getContext("2d");

// Controls
const mainShutterBtn = document.getElementById("main-shutter-btn");
const shutterBtnLabel = document.getElementById("shutter-btn-label");
const cameraSlotCounter = document.getElementById("camera-slot-counter");
const cameraSlotTotal = document.getElementById("camera-slot-total");
const cameraSlotPreviews = document.getElementById("camera-slot-previews");
const filterPillsRow = document.getElementById("filter-pills-row");
const stickerBank = document.getElementById("sticker-bank");
const appToast = document.getElementById("app-toast");
const toastText = document.getElementById("toast-text");

let audioCtx = null;
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function soundBeep(freq = 880, dur = 0.08) {
  try {
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

function soundShutter() {
  try {
    initAudioContext();
    const bufferSize = audioCtx.sampleRate * 0.12;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1300;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.11);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
  } catch (e) {}
}

async function startCamera() {
  document.getElementById("camera-blocked-fallback").classList.add("hidden");
  if (app.stream) {
    app.stream.getTracks().forEach((t) => t.stop());
  }

  const constraints = {
    audio: false,
    video: {
      facingMode: app.facingMode,
      width: { ideal: 1280 },
      height: { ideal: 960 },
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    app.stream = stream;
    video.srcObject = stream;
    showToast("Camera active 📸");
  } catch (err) {
    console.warn("Webcam permission unfulfilled:", err);
    document
      .getElementById("camera-blocked-fallback")
      .classList.remove("hidden");
  }
}

function toggleCameraFlip() {
  app.facingMode = app.facingMode === "user" ? "environment" : "user";
  app.isMirrored = app.facingMode === "user";
  video.style.transform = app.isMirrored ? "scaleX(-1)" : "scaleX(1)";
  startCamera();
}

function toggleMirror() {
  app.isMirrored = !app.isMirrored;
  video.style.transform = app.isMirrored ? "scaleX(-1)" : "scaleX(1)";
  showToast(app.isMirrored ? "Mirror ON" : "Mirror OFF");
}

async function triggerCaptureSequence() {
  if (app.isCapturing) return;

  const targetSlots = app.layout === "polaroid" ? 1 : 4;

  // If full, reset to start fresh photoshoot
  if (app.photos.filter(Boolean).length >= targetSlots) {
    app.photos = [null, null, null, null];
    app.currentSlot = 0;
    refreshSlotThumbnails();
  }

  app.isCapturing = true;
  mainShutterBtn.disabled = true;
  mainShutterBtn.classList.add("opacity-75");

  if (app.isBurstMode) {
    for (let i = app.currentSlot; i < targetSlots; i++) {
      app.currentSlot = i;
      refreshSlotThumbnails();
      await runCountdown(app.timerSec);
      await snapFrame();
      if (i < targetSlots - 1) {
        await new Promise((r) => setTimeout(r, 650));
      }
    }
  } else {
    await runCountdown(app.timerSec);
    await snapFrame();
    app.currentSlot = Math.min(app.currentSlot + 1, targetSlots - 1);
    refreshSlotThumbnails();
  }

  app.isCapturing = false;
  mainShutterBtn.disabled = false;
  mainShutterBtn.classList.remove("opacity-75");
  shutterBtnLabel.textContent = "Capture Shot";
  showToast("Photoshoot done! Now style your strip ✨");
}

function runCountdown(sec) {
  return new Promise((resolve) => {
    countdownWrap.classList.remove("hidden");
    let left = sec;
    countdownNum.textContent = left;
    soundBeep(840, 0.08);

    const iv = setInterval(() => {
      left--;
      if (left > 0) {
        countdownNum.textContent = left;
        soundBeep(840, 0.08);
      } else {
        clearInterval(iv);
        countdownWrap.classList.add("hidden");
        soundBeep(1250, 0.14);
        resolve();
      }
    }, 1000);
  });
}

function snapFrame() {
  return new Promise((resolve) => {
    // Flash animation
    flash.style.opacity = "0.9";
    setTimeout(() => {
      flash.style.opacity = "0";
    }, 220);
    soundShutter();

    // Create temporary canvas
    const offCanvas = document.createElement("canvas");
    const vw = video.videoWidth || 800;
    const vh = video.videoHeight || 600;
    offCanvas.width = vw;
    offCanvas.height = vh;
    const offCtx = offCanvas.getContext("2d");

    if (app.stream && video.readyState >= 2) {
      offCtx.save();
      if (app.isMirrored) {
        offCtx.translate(vw, 0);
        offCtx.scale(-1, 1);
      }
      const fObj = FILTERS.find((f) => f.id === app.currentFilter);
      offCtx.filter = fObj ? fObj.css : "none";
      offCtx.drawImage(video, 0, 0, vw, vh);
      offCtx.restore();
    } else {
      renderCuteModelArt(offCtx, vw, vh, app.currentSlot);
    }

    app.photos[app.currentSlot] = {
      dataUrl: offCanvas.toDataURL("image/jpeg", 0.94),
    };

    refreshSlotThumbnails();
    renderCanvas();
    resolve();
  });
}

// Procedural cute aesthetic pastel models if camera not available
function renderCuteModelArt(c, w, h, idx) {
  const colors = [
    ["#FFD1DC", "#FFE6EB", "🌸"],
    ["#BAE6FD", "#E0F2FE", "✨"],
    ["#FED7AA", "#FFEDD5", "🧸"],
    ["#DDD6FE", "#EDE9FE", "🎀"],
  ];
  const [c1, c2, emoji] = colors[idx % colors.length];

  const gr = c.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  c.fillStyle = gr;
  c.fillRect(0, 0, w, h);

  // Cute character outline
  c.fillStyle = "#3F3D56";
  c.beginPath();
  c.ellipse(w / 2, h * 0.95, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = "#FFE0BD";
  c.beginPath();
  c.ellipse(w / 2, h * 0.52, w * 0.18, h * 0.22, 0, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = "#2F2E41";
  c.beginPath();
  c.arc(w / 2, h * 0.44, w * 0.2, Math.PI, Math.PI * 2);
  c.fill();

  // Blush
  c.fillStyle = "rgba(255, 99, 132, 0.4)";
  c.beginPath();
  c.arc(w * 0.42, h * 0.56, w * 0.04, 0, Math.PI * 2);
  c.arc(w * 0.58, h * 0.56, w * 0.04, 0, Math.PI * 2);
  c.fill();

  c.font = `${Math.floor(w * 0.14)}px sans-serif`;
  c.textAlign = "center";
  c.fillText(emoji, w * 0.72, h * 0.35);
}

function populateSamplePhotos() {
  for (let i = 0; i < 4; i++) {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 480;
    renderCuteModelArt(c.getContext("2d"), 640, 480, i);
    app.photos[i] = { dataUrl: c.toDataURL("image/jpeg", 0.92) };
  }
  app.currentSlot = 3;
  refreshSlotThumbnails();
  renderCanvas();
  showToast("Loaded aesthetic demo shots! 💖");
}

function refreshSlotThumbnails() {
  cameraSlotPreviews.innerHTML = "";
  const needed = app.layout === "polaroid" ? 1 : 4;
  cameraSlotTotal.textContent = needed;
  cameraSlotCounter.textContent = Math.min(app.currentSlot + 1, needed);

  for (let i = 0; i < 4; i++) {
    const box = document.createElement("div");
    box.className = `aspect-square rounded-2xl border-2 overflow-hidden flex items-center justify-center relative bg-stone-100 transition ${
      i === app.currentSlot
        ? "border-rose-500 ring-2 ring-rose-200"
        : "border-stone-200"
    } ${i >= needed ? "opacity-30 pointer-events-none" : ""}`;

    if (app.photos[i]) {
      const img = document.createElement("img");
      img.src = app.photos[i].dataUrl;
      img.className = "w-full h-full object-cover";
      box.appendChild(img);

      // Clear slot cross
      const x = document.createElement("button");
      x.innerHTML = "✕";
      x.className =
        "absolute top-1 right-1 bg-black/60 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center hover:bg-rose-500";
      x.onclick = (e) => {
        e.stopPropagation();
        app.photos[i] = null;
        app.currentSlot = i;
        refreshSlotThumbnails();
        renderCanvas();
      };
      box.appendChild(x);
    } else {
      box.innerHTML = `<span class="text-stone-400 font-extrabold text-xs">#${i + 1}</span>`;
    }

    box.onclick = () => {
      if (i < needed) {
        app.currentSlot = i;
        refreshSlotThumbnails();
      }
    };

    cameraSlotPreviews.appendChild(box);
  }
}

function buildFilterRow() {
  filterPillsRow.innerHTML = "";
  FILTERS.forEach((f) => {
    const b = document.createElement("button");
    b.className = `px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 transition ${
      app.currentFilter === f.id
        ? "bg-stone-900 text-white border-stone-900 shadow-xs"
        : "bg-white text-stone-700 border-stone-200"
    }`;
    b.textContent = f.name;
    b.onclick = () => {
      app.currentFilter = f.id;
      video.className = `w-full h-full object-cover transition-transform duration-200 filter-${f.id} ${app.isMirrored ? "-scale-x-100" : ""}`;
      buildFilterRow();
    };
    filterPillsRow.appendChild(b);
  });
}

function buildStickersTray() {
  stickerBank.innerHTML = "";
  STICKER_ICONS.forEach((stk) => {
    const btn = document.createElement("button");
    btn.className =
      "text-xl p-1.5 rounded-xl hover:bg-white active:scale-90 transition text-center";
    btn.textContent = stk;
    btn.onclick = () => {
      app.activeSticker = stk;
      document.getElementById("active-sticker-preview").textContent =
        `Selected: ${stk}`;
      showToast(`Selected ${stk}! Tap canvas to paste.`);
    };
    stickerBank.appendChild(btn);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderCanvas() {
  let cw, ch;
  if (app.layout === "4cut") {
    cw = 420;
    ch = 1360;
  } else if (app.layout === "2x2") {
    cw = 700;
    ch = 880;
  } else {
    // Polaroid
    cw = 500;
    ch = 640;
  }

  boothCanvas.width = cw;
  boothCanvas.height = ch;

  // 1. Frame Background
  ctx.fillStyle = app.frameColor;
  ctx.fillRect(0, 0, cw, ch);

  // Subtle border for clean definition
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, cw - 2, ch - 2);

  // Check contrast for text
  const isDark = isDarkHex(app.frameColor);
  const textPrimary = isDark ? "#F5F5F7" : "#1C1917";
  const textSecondary = isDark ? "#A1A1AA" : "#78716C";

  // 2. Photo slot positions
  const pad = 24;
  const r = app.roundCorners ? 12 : 0;
  const slots = [];

  if (app.layout === "4cut") {
    const bottomMargin = 120;
    const gap = 16;
    const totalPhotoHeight = ch - pad * 2 - bottomMargin - gap * 3;
    const slotH = totalPhotoHeight / 4;
    const slotW = cw - pad * 2;

    for (let i = 0; i < 4; i++) {
      slots.push({ x: pad, y: pad + i * (slotH + gap), w: slotW, h: slotH });
    }
  } else if (app.layout === "2x2") {
    const bottomMargin = 100;
    const gap = 16;
    const slotW = (cw - pad * 2 - gap) / 2;
    const slotH = (ch - pad * 2 - bottomMargin - gap) / 2;

    slots.push({ x: pad, y: pad, w: slotW, h: slotH });
    slots.push({ x: pad + slotW + gap, y: pad, w: slotW, h: slotH });
    slots.push({ x: pad, y: pad + slotH + gap, w: slotW, h: slotH });
    slots.push({
      x: pad + slotW + gap,
      y: pad + slotH + gap,
      w: slotW,
      h: slotH,
    });
  } else {
    // Polaroid
    const bottomMargin = 130;
    slots.push({
      x: pad + 8,
      y: pad + 8,
      w: cw - (pad + 8) * 2,
      h: ch - (pad + 8) * 2 - bottomMargin,
    });
  }

  // 3. Draw Photos
  slots.forEach((slot, i) => {
    ctx.save();
    if (r > 0) {
      roundRect(ctx, slot.x, slot.y, slot.w, slot.h, r);
      ctx.clip();
    }

    const photoObj = app.photos[i];
    if (photoObj && photoObj.dataUrl) {
      const img = new Image();
      img.src = photoObj.dataUrl;
      if (img.complete) {
        drawImageCover(ctx, img, slot.x, slot.y, slot.w, slot.h);
      } else {
        img.onload = () => {
          drawImageCover(ctx, img, slot.x, slot.y, slot.w, slot.h);
          drawCanvasOverlayElements(textPrimary, textSecondary, cw, ch);
        };
      }
    } else {
      ctx.fillStyle = isDark ? "#27272A" : "#F4F4F5";
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);

      ctx.fillStyle = isDark ? "#52525B" : "#A1A1AA";
      ctx.font = '700 13px "Space Grotesk", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`SLOT 0${i + 1}`, slot.x + slot.w / 2, slot.y + slot.h / 2);
    }

    // Film grain
    if (app.filmGrain) {
      applyNoise(ctx, slot.x, slot.y, slot.w, slot.h);
    }

    ctx.restore();
  });

  // 4. Draw Typography & Stickers
  drawCanvasOverlayElements(textPrimary, textSecondary, cw, ch);
}

function drawImageCover(c, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  let sx, sy, sw, sh;
  if (imgRatio > targetRatio) {
    sh = img.height;
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  c.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function applyNoise(c, x, y, w, h) {
  c.save();
  c.fillStyle = "rgba(255, 255, 255, 0.04)";
  const dots = (w * h) / 110;
  for (let i = 0; i < dots; i++) {
    c.fillRect(x + Math.random() * w, y + Math.random() * h, 1, 1);
  }
  c.restore();
}

function drawCanvasOverlayElements(tColor, sColor, cw, ch) {
  // Bottom Caption
  ctx.save();
  ctx.textAlign = "center";

  let fName = '"Plus Jakarta Sans", sans-serif';
  if (app.fontFamily === "mono") fName = '"Space Grotesk", monospace';
  if (app.fontFamily === "hand") fName = '"Caveat", cursive';

  ctx.fillStyle = tColor;
  ctx.font = `800 ${app.fontFamily === "hand" ? "26px" : "15px"} ${fName}`;
  const titleY = ch - 52;
  ctx.fillText(app.caption.toUpperCase(), cw / 2, titleY);

  ctx.fillStyle = sColor;
  ctx.font = '600 11px "Space Grotesk", monospace';
  ctx.fillText(`• ${app.dateText} • AURA BOOTH •`, cw / 2, titleY + 22);
  ctx.restore();

  // Render Stamped Stickers
  app.stickers.forEach((s) => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((s.rot * Math.PI) / 180);
    ctx.font = `${s.size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  });
}

function isDarkHex(hex) {
  if (!hex.startsWith("#")) return false;
  const c = hex.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 130;
}

boothCanvas.addEventListener("click", (e) => {
  const r = boothCanvas.getBoundingClientRect();
  const sx = boothCanvas.width / r.width;
  const sy = boothCanvas.height / r.height;

  const clickX = (e.clientX - r.left) * sx;
  const clickY = (e.clientY - r.top) * sy;
  const randomTilt = (Math.random() - 0.5) * 28;

  app.stickers.push({
    emoji: app.activeSticker,
    x: clickX,
    y: clickY,
    size: 40,
    rot: randomTilt,
  });

  soundBeep(980, 0.04);
  renderCanvas();
  showToast(`Stamped ${app.activeSticker}!`);
});

document.getElementById("clear-all-stickers").addEventListener("click", () => {
  app.stickers = [];
  renderCanvas();
  showToast("Stickers cleared");
});

function switchTab(targetId) {
  document
    .querySelectorAll(".step-view")
    .forEach((v) => v.classList.add("hidden"));
  const activeView = document.getElementById(targetId);
  if (activeView) activeView.classList.remove("hidden");

  // Update Nav buttons
  document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
    if (btn.dataset.target === targetId) {
      btn.classList.add("text-rose-600");
      btn.classList.remove("text-stone-400");
    } else {
      btn.classList.remove("text-rose-600");
      btn.classList.add("text-stone-400");
    }
  });

  // Update Header Pills
  const indexMap = { "view-camera": 1, "view-style": 2, "view-export": 3 };
  const currentIdx = indexMap[targetId] || 1;
  ["step-btn-1", "step-btn-2", "step-btn-3"].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (idx + 1 === currentIdx) {
      el.className =
        "step-nav-btn px-2.5 py-1 rounded-full bg-white text-stone-900 shadow-sm font-bold transition";
    } else {
      el.className =
        "step-nav-btn px-2.5 py-1 rounded-full text-stone-500 hover:text-stone-900 transition";
    }
  });

  if (targetId === "view-style" || targetId === "view-export") {
    renderCanvas();
  }
}

document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.target));
});
document
  .getElementById("step-btn-1")
  .addEventListener("click", () => switchTab("view-camera"));
document
  .getElementById("step-btn-2")
  .addEventListener("click", () => switchTab("view-style"));
document
  .getElementById("step-btn-3")
  .addEventListener("click", () => switchTab("view-export"));
document
  .getElementById("quick-to-style-btn")
  .addEventListener("click", () => switchTab("view-style"));
document
  .getElementById("restart-flow-btn")
  .addEventListener("click", () => switchTab("view-camera"));

document.getElementById("export-pdf-action").addEventListener("click", () => {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("PDF tool loading, try again in a moment", true);
    return;
  }
  showToast("Generating printable PDF strip...");

  try {
    const { jsPDF } = window.jspdf;
    let pdfW, pdfH;

    if (app.layout === "4cut") {
      // Standard 2x6 inch strip (51mm x 153mm)
      pdfW = 51;
      pdfH = 153;
    } else if (app.layout === "2x2") {
      // 4x5 inch mini card (100mm x 125mm)
      pdfW = 100;
      pdfH = 125;
    } else {
      // Polaroid size (88mm x 107mm)
      pdfW = 88;
      pdfH = 107;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [pdfW, pdfH],
    });

    const imgData = boothCanvas.toDataURL("image/jpeg", 0.98);
    doc.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);

    const clean =
      app.caption.toLowerCase().replace(/[^a-z0-9]/g, "_") || "aurabooth";
    doc.save(`${clean}_strip.pdf`);
    showToast("PDF strip downloaded! 🖨️");
  } catch (err) {
    console.error("PDF error:", err);
    showToast("Failed to generate PDF. Use PNG instead.", true);
  }
});

document.getElementById("export-png-action").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `aurabooth_${Date.now()}.png`;
  a.href = boothCanvas.toDataURL("image/png");
  a.click();
  showToast("Image saved to photos! 🖼️");
});

// Native Web Share API
document
  .getElementById("mobile-share-action")
  .addEventListener("click", async () => {
    if (navigator.share) {
      try {
        boothCanvas.toBlob(async (blob) => {
          const file = new File([blob], "aurabooth.png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "My Aura Photo Booth Strip",
              text: "Made with AuraBooth Korean 4-Cut Studio! 📸✨",
            });
          } else {
            await navigator.share({
              title: "AuraBooth",
              text: "Take cute Korean 4-cut photobooth strips on mobile!",
              url: window.location.href,
            });
          }
        });
      } catch (e) {
        console.warn(e);
      }
    } else {
      // Fallback copy link
      const dummy = document.createElement("input");
      dummy.value = window.location.href;
      document.body.appendChild(dummy);
      dummy.select();
      document.execCommand("copy");
      document.body.removeChild(dummy);
      showToast("Page link copied to clipboard! 📋");
    }
  });

mainShutterBtn.addEventListener("click", triggerCaptureSequence);
document
  .getElementById("camera-flip-btn")
  .addEventListener("click", toggleCameraFlip);
document
  .getElementById("camera-mirror-btn")
  .addEventListener("click", toggleMirror);
document.getElementById("camera-grid-btn").addEventListener("click", () => {
  document.getElementById("viewfinder-grid").classList.toggle("hidden");
});

document.getElementById("reset-shots-btn").addEventListener("click", () => {
  app.photos = [null, null, null, null];
  app.currentSlot = 0;
  refreshSlotThumbnails();
  renderCanvas();
  showToast("Photos cleared");
});

// Timer selector buttons
document.querySelectorAll(".timer-tag").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".timer-tag").forEach((b) => {
      b.classList.remove("bg-stone-900", "text-white", "shadow-xs");
      b.classList.add("text-stone-500");
    });
    btn.classList.add("bg-stone-900", "text-white", "shadow-xs");
    btn.classList.remove("text-stone-500");
    app.timerSec = parseInt(btn.dataset.time, 10);
  });
});

document.getElementById("burst-toggle").addEventListener("change", (e) => {
  app.isBurstMode = e.target.checked;
});

// Layout switcher
document.querySelectorAll(".layout-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".layout-toggle").forEach((b) => {
      b.classList.remove("bg-white", "text-stone-900", "shadow-xs");
      b.classList.add("text-stone-500");
    });
    btn.classList.add("bg-white", "text-stone-900", "shadow-xs");
    btn.classList.remove("text-stone-500");

    app.layout = btn.dataset.layout;
    app.currentSlot = 0;
    refreshSlotThumbnails();
    renderCanvas();
  });
});

// Frame colors
document.querySelectorAll(".frame-color-dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    document
      .querySelectorAll(".frame-color-dot")
      .forEach((d) => d.classList.remove("ring-2", "ring-rose-400"));
    dot.classList.add("ring-2", "ring-rose-400");
    app.frameColor = dot.dataset.hex;
    app.frameColorName = dot.dataset.cname;
    document.getElementById("label-color-name").textContent =
      app.frameColorName;
    renderCanvas();
  });
});

document
  .getElementById("frame-custom-picker")
  .addEventListener("input", (e) => {
    document
      .querySelectorAll(".frame-color-dot")
      .forEach((d) => d.classList.remove("ring-2", "ring-rose-400"));
    app.frameColor = e.target.value;
    app.frameColorName = "Custom Tint";
    document.getElementById("label-color-name").textContent =
      app.frameColorName;
    renderCanvas();
  });

// Checkboxes
document.getElementById("chk-round-corners").addEventListener("change", (e) => {
  app.roundCorners = e.target.checked;
  renderCanvas();
});
document.getElementById("chk-film-grain").addEventListener("change", (e) => {
  app.filmGrain = e.target.checked;
  renderCanvas();
});

// Inputs
document.getElementById("caption-input").addEventListener("input", (e) => {
  app.caption = e.target.value || "PHOTO BOOTH";
  renderCanvas();
});
const dateInput = document.getElementById("date-input");
dateInput.value = app.dateText;
dateInput.addEventListener("input", (e) => {
  app.dateText = e.target.value;
  renderCanvas();
});
document.getElementById("font-choice").addEventListener("change", (e) => {
  app.fontFamily = e.target.value;
  renderCanvas();
});

// Fallbacks
document
  .getElementById("fallback-retry-cam")
  .addEventListener("click", startCamera);
document
  .getElementById("fallback-sample-btn")
  .addEventListener("click", populateSamplePhotos);
document
  .getElementById("sample-demo-btn")
  .addEventListener("click", populateSamplePhotos);

// Toast helper
let tTimer = null;
function showToast(msg, isError = false) {
  toastText.textContent = msg;
  if (isError) {
    appToast.classList.add("border-rose-500", "text-rose-200");
  } else {
    appToast.classList.remove("border-rose-500", "text-rose-200");
  }
  appToast.classList.remove("translate-y-10", "opacity-0");
  appToast.classList.add("translate-y-0", "opacity-100");

  clearTimeout(tTimer);
  tTimer = setTimeout(() => {
    appToast.classList.add("translate-y-10", "opacity-0");
    appToast.classList.remove("translate-y-0", "opacity-100");
  }, 2400);
}

window.addEventListener("load", () => {
  lucide.createIcons();
  buildFilterRow();
  buildStickersTray();
  refreshSlotThumbnails();
  startCamera();
  renderCanvas();

  // If camera unavailable or running in restrictive iFrames, auto-seed preview shots
  setTimeout(() => {
    if (!app.stream && !app.photos[0]) {
      populateSamplePhotos();
    }
  }, 1400);
});
