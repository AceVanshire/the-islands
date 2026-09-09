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

  const state = {
    running: false,
    paused: false,
    score: 0,
    target: "A",
    findsInRound: 0,
    findsNeeded: 4,
    spawnTimer: null,
    roundTimer: null,
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
    // Warm up voices on some mobile browsers after a user gesture.
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
      // Audio optional — fine if blocked.
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

  function clearLetters() {
    for (const el of [...state.activeLetters]) {
      el.remove();
    }
    state.activeLetters.clear();
    playfield.innerHTML = "";
  }

  function spawnLetter() {
    if (!state.running || state.paused) return;

    const fieldRect = playfield.getBoundingClientRect();
    if (fieldRect.width < 40 || fieldRect.height < 40) return;

    const letterSize = Math.min(
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--letter-size")) || 72,
      fieldRect.width * 0.22
    );

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

    const maxLeft = Math.max(0, fieldRect.width - letterSize);
    const left = Math.random() * maxLeft;
    btn.style.left = `${left}px`;

    const duration = randomInt(4200, 7000);
    btn.style.animationDuration = `${duration}ms`;

    const onEnd = () => {
      cleanup();
    };

    const cleanup = () => {
      btn.removeEventListener("animationend", onEnd);
      btn.removeEventListener("pointerdown", onPointerDown);
      state.activeLetters.delete(btn);
      btn.remove();
    };

    const onPointerDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleTap(btn, letter, event.clientX, event.clientY);
    };

    btn.addEventListener("animationend", onEnd);
    btn.addEventListener("pointerdown", onPointerDown, { passive: false });

    playfield.appendChild(btn);
    state.activeLetters.add(btn);
  }

  function handleTap(btn, letter, x, y) {
    if (!state.running || state.paused) return;
    if (btn.dataset.resolved) return;
    btn.dataset.resolved = "1";

    if (letter === state.target) {
      state.score += 1;
      state.findsInRound += 1;
      updateScore();
      celebrateSound();
      showBurst(x, y);
      btn.classList.add("correct");
      speak(randomItem(["Yes!", "Great job!", "You found it!", "Yay!"]), { rate: 1.05 });

      setTimeout(() => {
        btn.remove();
        state.activeLetters.delete(btn);
      }, 380);

      if (state.findsInRound >= state.findsNeeded) {
        showToast(`New letter!`);
        setTimeout(() => pickNewTarget(true), 500);
      }
    } else {
      missSound();
      btn.classList.add("wrong");
      btn.dataset.resolved = "";
      setTimeout(() => btn.classList.remove("wrong"), 360);
      // Soft nudge — speak the target again so she remembers what to look for.
      speak(`Try the letter ${state.target}`);
    }
  }

  function scheduleSpawns() {
    clearInterval(state.spawnTimer);
    const tick = () => {
      if (!state.running || state.paused) return;
      // Keep the sky from getting overcrowded on small screens.
      if (state.activeLetters.size < 8) {
        spawnLetter();
        if (Math.random() < 0.35 && state.activeLetters.size < 8) {
          setTimeout(() => {
            if (state.running && !state.paused) spawnLetter();
          }, 280);
        }
      }
    };
    tick();
    state.spawnTimer = setInterval(tick, 1100);
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
    scheduleSpawns();
  }

  function pauseGame() {
    if (!state.running || state.paused) return;
    state.paused = true;
    clearInterval(state.spawnTimer);
    for (const el of state.activeLetters) {
      el.style.animationPlayState = "paused";
    }
    show(pauseScreen);
  }

  function resumeGame() {
    if (!state.running || !state.paused) return;
    state.paused = false;
    hide(pauseScreen);
    for (const el of state.activeLetters) {
      el.style.animationPlayState = "running";
    }
    scheduleSpawns();
  }

  function goHome() {
    state.running = false;
    state.paused = false;
    clearInterval(state.spawnTimer);
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

  // Prevent scroll / pull-to-refresh while playing on mobile.
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
