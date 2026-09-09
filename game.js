(() => {
  "use strict";

  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const EASY_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const COLORS = 6;

  const startScreen = document.getElementById("start-screen");
  const playScreen = document.getElementById("play-screen");
  const pauseScreen = document.getElementById("pause-screen");
  const playfield = document.getElementById("playfield");
  const scoreEl = document.getElementById("score");
  const targetEl = document.getElementById("target-letter");
  const startBtn = document.getElementById("start-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const homeBtn = document.getElementById("home-btn");
  const toastEl = document.getElementById("toast");
  const burstEl = document.getElementById("burst");

  /** @type {{
   *   running: boolean,
   *   paused: boolean,
   *   score: number,
   *   target: string,
   *   findsInRound: number,
   *   findsNeeded: number,
   *   spawnTimer: number | null,
   *   rafId: number | null,
   *   lastFrame: number,
   *   activeLetters: Set<{el: HTMLButtonElement, y: number, speed: number, size: number, letter: string}>,
   *   speechReady: boolean,
   * }} */
  const state = {
    running: false,
    paused: false,
    score: 0,
    target: "A",
    findsInRound: 0,
    findsNeeded: 4,
    spawnTimer: null,
    rafId: null,
    lastFrame: 0,
    activeLetters: new Set(),
    speechReady: false,
  };

  function show(el) {
    el.classList.remove("hidden");
  }

  function hide(el) {
    el.classList.add("hidden");
  }

  function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function unlockSpeech() {
    if (!("speechSynthesis" in window)) return;
    state.speechReady = true;
    window.speechSynthesis.getVoices();
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0;
    window.speechSynthesis.speak(warm);
  }

  function speak(text, opts = {}) {
    if (!("speechSynthesis" in window) || !state.speechReady) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts.rate ?? 0.9;
    utter.pitch = opts.pitch ?? 1.15;
    utter.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const kidVoice =
      voices.find((v) => /english/i.test(v.lang) && /female|samantha|karen|moira|zira/i.test(v.name)) ||
      voices.find((v) => /^en(-|_)/i.test(v.lang));
    if (kidVoice) utter.voice = kidVoice;
    window.speechSynthesis.speak(utter);
  }

  function speakLetter(letter) {
    speak(`Find the letter ${letter}`);
  }

  function playTone(freq, duration, type = "sine", volume = 0.12) {
    try {
      const ctx = playTone.ctx || (playTone.ctx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Audio optional.
    }
  }

  function celebrateSound() {
    playTone(523.25, 0.12, "triangle", 0.1);
    setTimeout(() => playTone(659.25, 0.12, "triangle", 0.1), 80);
    setTimeout(() => playTone(783.99, 0.18, "triangle", 0.12), 160);
  }

  function missSound() {
    playTone(220, 0.1, "sine", 0.06);
  }

  function showToast(message) {
    toastEl.textContent = message;
    show(toastEl);
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => hide(toastEl), 1400);
  }

  function showBurst(x, y) {
    burstEl.style.left = `${x}px`;
    burstEl.style.top = `${y}px`;
    show(burstEl);
    clearTimeout(showBurst.timer);
    showBurst.timer = setTimeout(() => hide(burstEl), 500);
  }

  function updateScore() {
    scoreEl.textContent = String(state.score);
  }

  function setTarget(letter) {
    state.target = letter;
    state.findsInRound = 0;
    targetEl.textContent = letter;
    targetEl.classList.remove("pulse");
    void targetEl.offsetWidth;
    targetEl.classList.add("pulse");
    speakLetter(letter);
  }

  function pickNewTarget(preferDifferent = true) {
    let next = randomItem(EASY_LETTERS);
    if (preferDifferent && EASY_LETTERS.length > 1) {
      while (next === state.target) {
        next = randomItem(EASY_LETTERS);
      }
    }
    setTarget(next);
  }

  function removeLetter(item) {
    item.el.removeEventListener("pointerdown", item.onPointerDown);
    item.el.removeEventListener("click", item.onClick);
    state.activeLetters.delete(item);
    item.el.remove();
  }

  function clearLetters() {
    for (const item of [...state.activeLetters]) {
      removeLetter(item);
    }
    state.activeLetters.clear();
    playfield.innerHTML = "";
  }

  function letterSizePx() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--letter-size").trim();
    const fieldWidth = playfield.getBoundingClientRect().width;
    if (raw.endsWith("px")) return Math.min(parseFloat(raw), fieldWidth * 0.22);
    // Fallback when clamp() resolves via computed style on a probe.
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:var(--letter-size);height:var(--letter-size)";
    document.body.appendChild(probe);
    const size = probe.getBoundingClientRect().width || 72;
    probe.remove();
    return Math.min(size, fieldWidth * 0.22);
  }

  function spawnLetter() {
    if (!state.running || state.paused) return;

    const fieldRect = playfield.getBoundingClientRect();
    if (fieldRect.width < 40 || fieldRect.height < 40) return;

    const size = letterSizePx();

    // Bias toward the target so toddlers succeed often (~40%).
    const isTarget = Math.random() < 0.4;
    let letter = state.target;
    if (!isTarget) {
      do {
        letter = randomItem(ALPHABET);
      } while (letter === state.target);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `falling-letter color-${randomInt(0, COLORS - 1)}${isTarget ? " is-target" : ""}`;
    btn.textContent = letter;
    btn.dataset.letter = letter;
    btn.setAttribute("aria-label", `Letter ${letter}`);
    btn.style.width = `${size}px`;
    btn.style.height = `${size}px`;
    btn.style.fontSize = `${size * 0.58}px`;

    const maxLeft = Math.max(0, fieldRect.width - size);
    const left = Math.random() * maxLeft;
    btn.style.left = `${left}px`;

    // Start just above the playfield so hit-testing matches the visible letter.
    const startY = -size - 8;
    btn.style.top = `${startY}px`;

    // ~4.2s–7s to cross the playfield.
    const travel = fieldRect.height + size + 24;
    const durationMs = randomInt(4200, 7000);
    const speed = travel / (durationMs / 1000); // px per second

    const item = {
      el: btn,
      y: startY,
      speed,
      size,
      letter,
      onPointerDown: null,
      onClick: null,
    };

    const handle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const x = event.clientX ?? (event.touches && event.touches[0] && event.touches[0].clientX) ?? 0;
      const y = event.clientY ?? (event.touches && event.touches[0] && event.touches[0].clientY) ?? 0;
      handleTap(item, letter, x, y);
    };

    item.onPointerDown = handle;
    item.onClick = handle;
    // pointerdown for touch; click as a reliable fallback for desktop automation/tools.
    btn.addEventListener("pointerdown", handle, { passive: false });
    btn.addEventListener("click", handle);

    playfield.appendChild(btn);
    state.activeLetters.add(item);
  }

  function handleTap(item, letter, x, y) {
    if (!state.running || state.paused) return;
    if (item.el.dataset.resolved === "1") return;

    if (letter === state.target) {
      item.el.dataset.resolved = "1";
      state.score += 1;
      state.findsInRound += 1;
      updateScore();
      celebrateSound();
      showBurst(x, y);
      item.el.classList.add("correct");
      speak(randomItem(["Yes!", "Great job!", "You found it!", "Yay!"]), { rate: 1.05 });

      setTimeout(() => {
        if (state.activeLetters.has(item)) removeLetter(item);
      }, 380);

      if (state.findsInRound >= state.findsNeeded) {
        showToast("New letter!");
        setTimeout(() => pickNewTarget(true), 500);
      }
    } else {
      missSound();
      item.el.classList.add("wrong");
      setTimeout(() => item.el.classList.remove("wrong"), 360);
      speak(`Try the letter ${state.target}`);
    }
  }

  function tick(now) {
    state.rafId = requestAnimationFrame(tick);
    if (!state.running || state.paused) {
      state.lastFrame = now;
      return;
    }

    const last = state.lastFrame || now;
    const dt = Math.min(0.05, (now - last) / 1000);
    state.lastFrame = now;

    const fieldHeight = playfield.getBoundingClientRect().height;

    for (const item of [...state.activeLetters]) {
      if (item.el.dataset.resolved === "1") continue;
      item.y += item.speed * dt;
      item.el.style.top = `${item.y}px`;
      if (item.y > fieldHeight + 8) {
        removeLetter(item);
      }
    }
  }

  function startLoop() {
    if (state.rafId != null) cancelAnimationFrame(state.rafId);
    state.lastFrame = performance.now();
    state.rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (state.rafId != null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function scheduleSpawns() {
    clearInterval(state.spawnTimer);
    const spawn = () => {
      if (!state.running || state.paused) return;
      if (state.activeLetters.size < 8) {
        spawnLetter();
        if (Math.random() < 0.35 && state.activeLetters.size < 8) {
          setTimeout(() => {
            if (state.running && !state.paused) spawnLetter();
          }, 280);
        }
      }
    };
    spawn();
    state.spawnTimer = setInterval(spawn, 1100);
  }

  function startGame() {
    unlockSpeech();
    state.running = true;
    state.paused = false;
    state.score = 0;
    updateScore();
    hide(startScreen);
    hide(pauseScreen);
    show(playScreen);
    clearLetters();
    pickNewTarget(false);
    startLoop();
    scheduleSpawns();
  }

  function pauseGame() {
    if (!state.running || state.paused) return;
    state.paused = true;
    clearInterval(state.spawnTimer);
    show(pauseScreen);
  }

  function resumeGame() {
    if (!state.running || !state.paused) return;
    state.paused = false;
    hide(pauseScreen);
    state.lastFrame = performance.now();
    scheduleSpawns();
  }

  function goHome() {
    state.running = false;
    state.paused = false;
    clearInterval(state.spawnTimer);
    stopLoop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    clearLetters();
    hide(playScreen);
    hide(pauseScreen);
    hide(toastEl);
    show(startScreen);
  }

  startBtn.addEventListener("click", startGame);
  pauseBtn.addEventListener("click", pauseGame);
  resumeBtn.addEventListener("click", resumeGame);
  homeBtn.addEventListener("click", goHome);
  targetEl.addEventListener("click", () => {
    if (!state.running) return;
    unlockSpeech();
    speakLetter(state.target);
    targetEl.classList.remove("pulse");
    void targetEl.offsetWidth;
    targetEl.classList.add("pulse");
  });

  document.addEventListener(
    "touchmove",
    (e) => {
      if (state.running && !state.paused) e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running && !state.paused) {
      pauseGame();
    }
  });

  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
})();
