# Half marathon in 6 weeks: the animation

A 64-second hand-painted animation of the "Half Marathon 6-Week Plan" slide deck. Clawd trains through the plan:
the weekly rhythm, the long run growing week by week, pacing by effort, food and fuel, sleep, and race day.

It's built on [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) (p5.js + p5.brush, from the
[PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) project), following its `ANIMATION_GUIDE.md`. That means the
storyboard came first, then the shots were built one at a time and checked on contact sheets.

- [STORYBOARD.md](STORYBOARD.md): the shot list, the reads and their timings
- [src/scenes/half_marathon.js](src/scenes/half_marathon.js): the whole video (eight shots)
- [half_marathon.mp4](half_marathon.mp4): the rendered video

## Changes from the kit

- `PROJECT.lite` in `src/config.js`: this was rendered without a GPU, so `paint()` turns watercolour fills into flat washes. Set it to `false` on a machine with a GPU for the full watercolour look.
- `render.mjs --recycle=N`: in software WebGL a page slows down sharply after a dozen frames, so each worker reopens its page every N frames.
- The Permanent Marker font is bundled in `assets/` instead of being loaded from Google Fonts.
- The guide's "no text" rule is relaxed on purpose, because this video explains a plan. It uses only short painted labels: day initials, week numbers, distances, "80%", "7-9 h" and the "21.1 km" banner.

## Render it

You need Node.js, Chrome or Chromium, and ffmpeg.

```bash
npm install
node render.mjs --soft-gl --frames --fps=12 --workers=3 --recycle=10   # drop --soft-gl and --recycle with a GPU
node render.mjs --encode --fps=12 --out=half_marathon.mp4
```
