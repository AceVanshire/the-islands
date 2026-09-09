# Letter Rain

A simple browser game for toddlers: letters fall from the sky, and kids tap the matching letter to earn stars.

Built for **ages ~2–5**. Works on iPhone, tablet, and laptop — just open it in a browser.

## How to play

1. Open `index.html` in a browser (or host the folder anywhere).
2. Tap **Play**.
3. A big letter appears at the top (for example **A**). The game also says it out loud.
4. Tap falling letters that match. Each correct tap earns a star.
5. After a few finds, a new letter is chosen.

Wrong taps are gentle — no lost points. Tap the big target letter anytime to hear it again.

## Tips for parents

- Use **full screen** or Add to Home Screen on iPhone/iPad for fewer distractions.
- Sound uses the device speaker; turn volume up so she can hear the letter names.
- On first play, tap **Play** once so the browser allows speech and sounds.

## Run locally

No install needed. From this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` on the same device, or use your computer’s local IP from a phone on the same Wi‑Fi.

## Files

- `index.html` — page structure
- `styles.css` — sky theme and touch-friendly layout
- `game.js` — falling letters, scoring, speech
