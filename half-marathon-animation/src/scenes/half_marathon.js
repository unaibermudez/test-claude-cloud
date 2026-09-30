// half_marathon.js: "Clawd runs a half marathon", a 64-second explainer of the 6-week half marathon plan.
// The shot list, reads and timings are in STORYBOARD.md.
(() => {
  // ---------- colours: one per kind of training, used everywhere ----------
  const K = { rest: PAL.sky, easy: PAL.sap, str: PAL.violet, qual: PAL.clay, long: PAL.ochre };
  const GRASS = '#B9CF8E', GRASS_DK = '#8FB06A', ROAD = '#E9D9B8', GOLD = '#F2C53D';

  // ---------- small helpers ----------
  const lbl = (txt, x, y, size, col, pop = 1, o = {}) => { if (pop > 0) letter(txt, x, y, size, col, { pop: Math.min(pop, 1), ...o }); };
  // distance run by time t, integrating a speed curve given as keyframes [[t, px/s], ...] (pure function of t)
  function dist(t, keys, t0 = keys[0][0]) {
    let s = 0; const dt = 1 / 60;
    for (let a = t0; a < t; a += dt) s += kf(Math.min(a + dt / 2, t), keys, x => x) * Math.min(dt, t - a);
    return s;
  }
  // A running pose, side view. spd: .5 easy, 1 tempo, 1.5 fast. ph = stride phase.
  function runPose(ph, spd) {
    const s = Math.sin(ph * TAU);
    return { view: 'side', walk: ph, dy: -Math.abs(Math.sin(ph * TAU)) * (.35 + .45 * spd), rot: .03 + .09 * spd,
             aL: .15 + (.45 + .35 * spd) * s, sq: .05 * Math.abs(Math.cos(ph * TAU)) };
  }
  // mood + run, with the mood's own bounce toned down so the stride leads
  const onRun = (mood, pose, o = {}) => ({ ...mood, ...pose, dy: (mood.dy || 0) * .25 + pose.dy, sq: (mood.sq || 0) * .6 + pose.sq, rot: pose.rot + (mood.rot || 0) * .3, ...o });

  function ground(y, col = GRASS, key = 'ground', x0 = -500) {
    boilSeed(key);
    paint(rectPts(x0, y, W + 1000, H - y + 600, 3), { wash: col, ink: null });
    for (let i = 0; i < 3; i++) inkLine([[x0 + i * 1000, y + 2 * Math.sin(i)], [x0 + i * 1000 + 500, y - 3], [x0 + (i + 1) * 1000, y + 1]], 1, PAL.ink, 'ink', .5);
  }
  // Scrolling countryside: far hills (slow), trees and bushes on the horizon line, and road dashes (full speed).
  function countryside(s, G, t, o = {}) {
    const hk = .25, sh = s * hk;
    for (let i = Math.floor((sh - 700) / 560); i <= Math.floor((sh + W + 700) / 560); i++) {
      boilSeed('hill' + i);
      paint(ellPts(i * 560 - sh, G + 20, 330 + 140 * hash(i), 150 + 110 * hash(i + 7), 26, 3), { wash: o.far || mixCol(PAL.sap, PAL.paper, .45), ink: PAL.ink, sw: .6 });
    }
    ground(G, o.grass || GRASS);
    const tk = .6, st = s * tk;
    for (let i = Math.floor((st - 400) / 430); i <= Math.floor((st + W + 400) / 430); i++) {
      boilSeed('tree' + i);
      const x = i * 430 - st + 120 * hash(i + 11), h = 90 + 70 * hash(i + 3);
      if (hash(i + 5) < .55) {
        paint(rectPts(x - 9, G - h + 10, 18, h), { wash: '#8A6A4A', ink: PAL.ink, sw: .6 });
        paint(ellPts(x, G - h - 20, 55 + 20 * hash(i), 60 + 18 * hash(i + 1), 18, 3), { wash: o.tree || GRASS_DK, ink: PAL.ink, sw: .7 });
      } else paint(ellPts(x, G + 4, 60, 34, 16, 3), { wash: o.tree || GRASS_DK, ink: PAL.ink, sw: .6 });
    }
    // the road
    boilSeed('road');
    paint(rectPts(-500, G + 70, W + 1000, 130, 2), { wash: o.road || ROAD, ink: null });
    for (let i = Math.floor((s - 300) / 260); i <= Math.floor((s + W + 300) / 260); i++) {
      boilSeed('dash' + i);
      paint(rrPts(i * 260 - s, G + 128, 110, 14, 7, 1), { wash: PAL.cream, ink: null });
    }
  }
  // speed lines streaming off behind a runner at (x, y), strength k
  function speedLines(x, y, u, k, key = 'speed') {
    if (k <= .02) return;
    boilSeed(key);
    for (let i = 0; i < 6; i++) {
      const yy = y - u * (1 + 6.5 * hash(i + 40)), len = u * (4 + 5 * hash(i + 50)) * k, x0 = x - u * (5 + 2 * hash(i + 60)) - frac(T * 3 + hash(i)) * u * 2;
      inkLine([[x0, yy], [x0 - len, yy + jit(2)]], .7, mixCol(PAL.ink, PAL.paper, .35), 'inkfine', 0);
    }
  }
  // dust puffs kicked up at the feet
  function dust(x, y, u, t, k, key = 'dust') {
    if (k <= .02) return;
    boilSeed(key);
    for (let i = 0; i < 3; i++) {
      const a = frac(t * 2.2 + i / 3), px = x - u * (3 + 7 * a), py = y - u * (.3 + 1.2 * a);
      paint(ellPts(px, py, u * (.5 + 1.1 * a), u * (.35 + .7 * a), 12, 1), { wash: PAL.cream, washOp: 220 * (1 - a) * k, ink: null });
    }
  }
  // The finish arch. tape: 0 intact, then 0..1 as it breaks and flutters apart.
  function arch(x, G, sc, tape = 0, key = 'arch') {
    boilSeed(key);
    const w = 520 * sc, h = 460 * sc, pw = 42 * sc, sw = clamp(sc * 1.1, .4, 1.2);
    for (const s of [-1, 1]) paint(rectPts(x + s * w / 2 - pw / 2, G - h, pw, h, 1), { wash: PAL.clay, ink: PAL.ink, sw });
    paint(rrPts(x - w / 2 - 30 * sc, G - h - 70 * sc, w + 60 * sc, 120 * sc, 16 * sc, 1), { wash: PAL.cream, ink: PAL.ink, sw });
    for (const s of [-1, 1]) paint(starPts(x + s * (w / 2 - 10 * sc), G - h - 110 * sc, 30 * sc, .45, 5), { wash: GOLD, ink: PAL.ink, sw: sw * .7 });
    lbl('21.1 km', x, G - h - 10 * sc, 76 * sc, PAL.clayDk);
    const ty = G - 170 * sc;
    if (tape <= 0) inkLine([[x - w / 2, ty], [x, ty + 8 * sc], [x + w / 2, ty]], 2.2 * sc, '#D8394E', 'marker', .5);
    else for (const s of [-1, 1]) {
      const k = easeOut(tape), fl = Math.sin(tape * 18 + s) * 30 * sc * (1 - tape * .5);
      inkLine([[x + s * w / 2, ty], [x + s * lerp(w * .25, w * .45, k), ty + lerp(10, 120, k) * sc], [x + s * lerp(w * .1, w * .38, k) + fl, ty + lerp(20, 230, k) * sc]], 2.2 * sc, '#D8394E', 'marker', .6);
    }
  }
  // a gel packet, drawn around (0, 0)
  function gel(u, sw, k = 1) {
    if (k <= .02) return;
    paint(rrPts(-.55 * u * k, -.8 * u * k, 1.1 * u * k, 1.6 * u * k, .2 * u * k), { wash: PAL.rose, ink: PAL.ink, sw: sw * .6 });
    paint(rectPts(-.45 * u * k, -.2 * u * k, .9 * u * k, .45 * u * k), { wash: PAL.cream, ink: null });
  }
  // a dumbbell held at an arm tip (the handle runs across the arm)
  const dumbbell = (u, sw) => {
    paint(rectPts(-.12 * u, -1.3 * u, .24 * u, 2.6 * u), { wash: PAL.ink, ink: null });
    for (const s of [-1, 1]) paint(rrPts(-.55 * u, s * 1.2 * u - .45 * u, 1.1 * u, .9 * u, .2 * u, .5), { wash: PAL.violet, ink: PAL.ink, sw: sw * .7 });
  };

  // ======================================================================================================
  // A (0–6): the goal. A long road, a sign that says 6 weeks, the arch far away; nervous → sweatband → off.
  // ======================================================================================================
  function shotGoal(t, lt, dur) {
    const cx = kf(lt, [[0, 700], [1.2, 700], [2.0, 1440], [2.7, 1450], [3.3, 760], [4.6, 780], [6, 1500]]);
    const cy = kf(lt, [[0, 640], [1.2, 640], [2.0, 500], [2.7, 495], [3.3, 650]]);
    const z = kf(lt, [[0, 1.1], [1.2, 1.12], [2.0, 2.3], [2.7, 2.4], [3.3, 1.15], [4.6, 1.2]]);
    camBegin(cx + 10 * Math.sin(lt * .7), cy, z);
    const HZ = 560;
    boilSeed('sky'); paint(ellPts(1450, 250, 700, 220, 26, 8), { wash: mixCol(PAL.sky, PAL.paper, .55), ink: null });
    for (let i = 0; i < 5; i++) { boilSeed('fhill' + i); paint(ellPts(-200 + i * 560, HZ + 30, 420, 130 + 50 * hash(i), 24, 3), { wash: mixCol(PAL.teal, PAL.paper, .5 + .1 * hash(i + 2)), ink: PAL.ink, sw: .6 }); }
    ground(HZ, GRASS);
    // the road: wide at our feet, winding to a point at the horizon
    boilSeed('road');
    const C = [[140, 1180], [560, 930], [1000, 770], [1200, 660], [1380, 600], [1500, 568]], Wd = [520, 360, 200, 110, 50, 24];
    const Lp = [], Rp = []; C.forEach(([x, y], i) => { Lp.push([x - Wd[i] / 2, y]); Rp.push([x + Wd[i] / 2, y]); });
    paint(through(Lp).concat(through(Rp).reverse()), { wash: ROAD, ink: PAL.ink, sw: .8 });
    arch(1500, 574, .3, 0, 'archfar');
    // the sign: "6 weeks"
    boilSeed('sign');
    paint(rectPts(292, 700, 16, 190, 1), { wash: '#8A6A4A', ink: PAL.ink, sw: .8 });
    paint([[180, 640], [400, 640], [440, 680], [400, 720], [180, 720]], { wash: PAL.cream, ink: PAL.ink, sw: 1 });
    lbl('6 weeks', 300, 682, 42, PAL.clayDk, seg(lt, .5, .9));

    // Clawd
    const u = 24, x0 = 560, G = 900;
    const mood = emotions(lt, [[0, 'neutral'], [1.15, 'thinking', { lookX: .9, lookY: -.4, emote: null }], [2.8, 'nervous'], [3.9, 'determined']]);
    const rx = lt < 4.6 ? x0 : x0 + 520 * (lt - 4.6) + 160 * (lt - 4.6) ** 2;
    let cl;
    if (lt < 4.4) cl = { ...mood };
    else if (lt < 4.6) cl = { ...mood, ...turn(lt, 4.4, 4.6, 0, .25) };
    else cl = onRun(mood, runPose((rx - x0) / (4 * u) * .5 + .2, .8 + .4 * seg(lt, 4.6, 5.4)));
    // the sweatband flies in on an arc and lands on the head
    const land = 3.85;
    if (lt >= land) cl.hat = 'sweatband';
    clawd(rx, G, u, cl);
    if (lt > 3.35 && lt < land) {
      const k = easeOut(seg(lt, 3.35, land)), p = arcPt([180, 420], [x0, G - 8 * u - 10], 160, k);
      boilSeed('band'); push(); translate(p[0], p[1]); rotate((1 - k) * 5);
      paint(rectPts(-5 * u, -.5 * u, 10 * u, .95 * u), { wash: PAL.cream, ink: PAL.ink, sw: .9 });
      for (let i = 0; i < 4; i++) inkLine([[-4 * u + i * 2.6 * u, -.4 * u], [-3.6 * u + i * 2.6 * u, .3 * u]], .6, '#D8394E', 'inkfine', 0);
      pop();
    }
    if (lt > land) { const a = lt - land; for (let i = 0; i < 5; i++) { const q = seg(a, i * .03, .45 + i * .03); if (q > 0 && q < 1) { boilSeed('pop' + i); const ang = -Math.PI / 2 + (i - 2) * .45; paint(starPts(x0 + Math.cos(ang) * 150 * q, G - 8 * u + Math.sin(ang) * 110 * q, 16 * backOut(q) * (1 - q * .6), .3, 4), { wash: GOLD, ink: null }); } } }
    speedLines(rx, G, u, seg(lt, 4.9, 5.5), 'spA');
    const eye = toScreen(x0, G - 5 * u);
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt < .7) iris(...eye, lerp(0, 1600, easeIn(lt / .7)));
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, [PAL.ochre, GOLD]);
  }

  // ======================================================================================================
  // B (6–16): a training week, one pad per day. Clawd hops pad to pad and acts each day.
  // ======================================================================================================
  const DAYS = [['M', K.rest], ['T', K.easy], ['W', K.str], ['T', K.qual], ['F', K.rest], ['S', K.easy], ['S', K.long]];
  const B0 = .55, DAY = 1.35, PAD0 = 420, PADW = 620, HOP = .36;
  const padX = i => PAD0 + i * PADW;
  function shotWeek(t, lt, dur) {
    const G = 800, u = 22;
    const di = clamp(Math.floor((lt - B0) / DAY), 0, 6), tb = B0 + di * DAY;   // day index and its start
    // Clawd's x: on the pad, hopping between pads in the HOP before each day starts; Sunday: runs off along the road
    const tSun = B0 + 6 * DAY;
    let x, hopping = false, hk = 0;
    const nextTb = B0 + (di + 1) * DAY;
    if (lt < B0) x = lerp(padX(0) - 700, padX(0), easeOut(lt / B0));
    else if (di < 6 && lt > nextTb - HOP) { hopping = true; hk = seg(lt, nextTb - HOP, nextTb); x = lerp(padX(di), padX(di + 1), ease(hk)); }
    else if (di === 6 && lt > tSun + .25) x = padX(6) + 330 * (lt - tSun - .25) + 90 * (lt - tSun - .25) ** 2;
    else x = padX(di);
    const camX = kf(lt, [[0, padX(0) + 120]]) + (x - padX(0));
    const tiltUp = seg(lt, dur - .55, dur);   // the camera tilts up into the sky at the end: C tilts down out of it
    camBegin(camX + 60, 600 - 900 * easeIn(tiltUp), 1.3);
    boilSeed('skyB'); paint(ellPts(camX + 500, 180, 800, 200, 24, 6), { wash: mixCol(PAL.sky, PAL.paper, .6), ink: null });
    for (let i = -1; i < 12; i++) { boilSeed('bh' + i); paint(ellPts(i * 480, G - 40, 320, 150 + 60 * hash(i + 4), 22, 3), { wash: mixCol(PAL.sap, PAL.paper, .5), ink: PAL.ink, sw: .6 }); }
    ground(G - 60, GRASS, 'groundB', camX - 1300);
    // the Sunday road runs off to the right
    boilSeed('sunroad');
    paint(rectPts(padX(6) - 60, G - 34, 5200, 70, 2), { wash: mixCol(K.long, PAL.cream, .45), ink: PAL.ink, sw: .8 });
    // the day pads, with a flag each
    DAYS.forEach(([d, col], i) => {
      boilSeed('pad' + i);
      const act = lt >= B0 + i * DAY - HOP * .5 ? 1 : 0;
      paint(ellPts(padX(i), G, 210, 46, 26, 2), { wash: col, ink: PAL.ink, sw: 1 });
      paint(rectPts(padX(i) - 200, G - 330, 10, 320), { wash: '#8A6A4A', ink: PAL.ink, sw: .7 });
      const wv = 6 * Math.sin(lt * 5 + i);
      paint([[padX(i) - 190, G - 330], [padX(i) - 40, G - 290 + wv], [padX(i) - 190, G - 240]], { wash: mixCol(col, PAL.cream, .15), ink: PAL.ink, sw: .9 });
      lbl(d, padX(i) - 140, G - 288, 56, PAL.ink, act ? 1 : .001 + seg(lt, B0 + i * DAY - HOP - .2, B0 + i * DAY - HOP), {});
    });

    // Clawd, per day
    const ad = lt - tb;   // time into the day
    const moods = emotions(lt, [[0, 'happy'], [B0, 'sleepy'], [B0 + DAY, 'happy', { emote: 'music' }], [B0 + 2 * DAY, 'determined'],
      [B0 + 3 * DAY, 'determined', { emote: 'sweat' }], [B0 + 4 * DAY, 'relieved'], [B0 + 5 * DAY, 'happy', { emote: 'music' }], [B0 + 6 * DAY, 'happy', { emote: 'spark' }]], { take: .6 });
    let cl, spd = 0;
    if (lt < B0) cl = onRun(moods, runPose(x / (4 * u) * .5, .7));
    else if (hopping) { const j = jump(lt, nextTb - HOP + .06, nextTb - .02, 3.2); cl = { ...moods, view: 'side', dy: j.dy, sq: j.sq, aL: 1.2, smear: .25 * Math.sin(hk * Math.PI) }; }
    else switch (di) {
      case 0: cl = { ...moods, noLegs: true, dy: 1.9, rot: -.08 + .03 * Math.sin(lt * 2), aL: -.4, aR: -.4, hat: 'beanie' }; break;
      case 1: case 5: spd = .45; cl = onRun(moods, runPose(ad * 1.7, .45)); break;
      case 2: { const rep = Math.sin(ad * TAU * 1.6); cl = { ...moods, aL: .1 + 1.1 * Math.max(0, rep), aR: .1 + 1.1 * Math.max(0, -rep), armL: dumbbell, armR: dumbbell, sq: .06 * Math.abs(rep) }; break; }
      case 3: spd = 1.6; cl = onRun(moods, runPose(ad * 3.4, 1.6)); break;
      case 4: { const sw = Math.sin(ad * TAU * .8); cl = { ...moods, aL: 1.5, aR: 1.5, rot: .16 * sw, sq: -.08 - .04 * Math.abs(sw) }; break; }
      case 6: spd = .9; cl = onRun(moods, runPose(ad * 2.4, .9)); break;
    }
    if (di !== 0 || hopping || lt < B0) cl.hat = 'sweatband';
    clawd(x, G, u, cl);
    if (!hopping && lt > B0) { speedLines(x, G, u, di === 3 ? 1 : di === 6 ? seg(ad, .6, 1.2) * .6 : 0, 'spB'); dust(x, G, u, lt, di === 3 ? 1 : 0, 'duB'); }
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt < .3) brushWipe(.5 + lt / .6, [PAL.ochre, GOLD]);
  }

  // ======================================================================================================
  // C (16–28): six weeks as six lanes. A Clawd runs each week's long run; the lane paints in behind it.
  // ======================================================================================================
  const WEEKS = [[10, K.easy], [12, K.easy], [14, K.qual], [16, K.qual], [12, K.rest], [21.1, GOLD]];
  const LX0 = 420, PXKM = 58, laneY = k => 270 + k * 128;
  const C0 = .75, GAP = .35, dLane = km => .7 + km * .045;
  const laneT = []; { let a = C0; for (const [km] of WEEKS) { laneT.push(a); a += dLane(km) + GAP; } }
  const LANE_MOOD = ['happy', 'happy', 'determined', 'nervous', 'relieved', 'starstruck'];
  function shotWeeks(t, lt, dur) {
    const pushIn = seg(lt, dur - 1.6, dur - .2);
    const tilt = 1 - easeOut(seg(lt, 0, .6));
    const endX = LX0 + 21.1 * PXKM;
    camBegin(lerp(990, endX + 60, ease(pushIn)), lerp(560, laneY(5) - 60, ease(pushIn)) - 900 * tilt, lerp(1, 1.9, ease(pushIn)));
    // phase bands behind the lane pairs
    const PH = [['BASE', K.easy], ['STRENGTH', K.qual], ['TAPER', PAL.teal]];
    PH.forEach(([name, col], p) => {
      boilSeed('band' + p);
      const y0 = laneY(p * 2) - 70, show = seg(lt, laneT[p * 2] - .3, laneT[p * 2]);
      paint(rrPts(110, y0, 1750, 256, 30, 2), { wash: mixCol(col, PAL.paper, .8), washOp: 255 * show, ink: null });
      lbl(name, 150, y0 + 128, name.length > 5 ? 34 : 40, mixCol(col, PAL.ink, .45), seg(lt, laneT[p * 2 + 1] + dLane(WEEKS[p * 2 + 1][0]), laneT[p * 2 + 1] + dLane(WEEKS[p * 2 + 1][0]) + .3), { rot: -Math.PI / 2 });
    });
    WEEKS.forEach(([km, col], k) => {
      const y = laneY(k), t0 = laneT[k], d = dLane(km), p = ease(seg(lt, t0, t0 + d)), xe = LX0 + km * PXKM, x = lerp(LX0, xe, p);
      boilSeed('lane' + k);
      paint(rrPts(LX0 - 20, y - 20, xe - LX0 + 40, 40, 20), { wash: mixCol(col, PAL.paper, .75), ink: null });   // the whole lane, faint
      lbl('week ' + (k + 1), LX0 - 40, y - 4, 40, PAL.ink, seg(lt, t0 - .4, t0 - .1), { align: 'right' });
      if (p > .01) paint(rrPts(LX0 - 20, y - 22, x - LX0 + 40, 44, 20, 1), { wash: col, ink: PAL.ink, sw: .7 });   // painted in behind the runner
      if (lt > t0 - .4) {
        const u = 11.5, moving = lt < t0 + d, age = lt - t0 - d;
        const mood = emotions(lt, [[0, 'neutral'], [t0 + d, LANE_MOOD[k]]], { take: .8 });
        const cl = moving ? onRun(mood, runPose(lt * (2.4 + km * .05), .9 + km * .02))
          : { ...mood, ...turn(lt, t0 + d, t0 + d + .15, .25, 0) };
        if (k === 3 && !moving) cl.emote = 'sweat';
        if (k === 5 && !moving) cl.hat = 'crown';
        clawd(x, y - 22, u, { ...cl, hat: cl.hat || 'sweatband', boilKey: 'w' + k, noShadow: true });
        if (!moving) lbl(km + ' km', xe - 62, y + 2, 38, PAL.cream, age * 3.5, { align: 'right' });
      }
    });
    // the finish flag at the end of week 6
    if (lt > laneT[5] + dLane(21.1) - .1) {
      const k = backOut(seg(lt, laneT[5] + dLane(21.1) - .1, laneT[5] + dLane(21.1) + .3)), fx = endX + 110, fy = laneY(5) - 22;
      boilSeed('flag');
      paint(rectPts(fx - 3, fy - 120 * k, 6, 120 * k), { wash: PAL.ink, ink: null });
      const wv = Math.sin(lt * 9) * 6;
      paint([[fx, fy - 120 * k], [fx + 70 * k, fy - 108 * k + wv], [fx, fy - 84 * k]], { wash: '#D8394E', ink: PAL.ink, sw: .6 });
    }
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, [K.easy, PAL.teal]);
  }

  // ======================================================================================================
  // D (28–36): effort by feel. The needle moves easy → tempo → fast → easy, Clawd acts each, "80%" lands.
  // ======================================================================================================
  const D_SPEED = [[0, 260], [2.6, 260], [2.9, 520], [4.5, 520], [4.8, 880], [6.2, 880], [6.6, 260], [8, 260]];
  const DIAL = [1420, 470, 250];
  function dial(ang, lt, show80) {
    const [cx, cy, r] = DIAL;
    const wedge = (a0, a1, rr) => { const P = [[cx, cy]]; for (let i = 0; i <= 12; i++) { const a = lerp(a0, a1, i / 12); P.push([cx + Math.cos(a) * rr, cy - Math.sin(a) * rr]); } return P; };
    boilSeed('dialback'); paint(ellPts(cx, cy, r + 40, r + 40, 40, 2), { wash: PAL.cream, ink: PAL.ink, sw: 1.2 });
    const Z = [[Math.PI, Math.PI * .6, K.easy, '3-4'], [Math.PI * .6, Math.PI * .3, K.long, '6-7'], [Math.PI * .3, 0, K.qual, '8']];
    Z.forEach(([a0, a1, col, n], i) => {
      boilSeed('zone' + i); paint(wedge(a0, a1, r), { wash: col, ink: PAL.ink, sw: .8 });
      const am = (a0 + a1) / 2; lbl(n, cx + Math.cos(am) * r * .7, cy - Math.sin(am) * r * .7, 44, PAL.cream, 1, { stroke: PAL.ink });
    });
    boilSeed('dialhole'); paint(ellPts(cx, cy + 4, r * .32, r * .32, 26, 1), { wash: PAL.cream, ink: PAL.ink, sw: .8 });
    boilSeed('needle');
    const tip = [cx + Math.cos(ang) * r * .93, cy - Math.sin(ang) * r * .93];
    paint(ribbon([[cx, cy], tip], 26, 4), { wash: PAL.ink, ink: null });
    paint(ellPts(cx, cy, 24, 24, 16), { wash: PAL.clayDk, ink: PAL.ink, sw: .8 });
    if (show80 > 0) lbl('80%', cx - r * .95, cy - r * 1.12, 120, mixCol(K.easy, PAL.ink, .35), show80, { rot: -.08, stroke: PAL.cream });
    lbl('effort', cx, cy + 90, 40, PAL.ink);
  }
  function shotEffort(t, lt, dur) {
    const pushIn = easeIn(seg(lt, dur - .55, dur));
    const [dx, dy] = DIAL;
    camBegin(lerp(960 + 14 * Math.sin(lt * .6), dx, pushIn), lerp(540, dy, pushIn), lerp(1, 3.4, pushIn));
    const G = 780, s = dist(lt, D_SPEED), spd = kf(lt, D_SPEED, x => x);
    countryside(s, G, t);
    const u = 30, x = 560, sk = (spd - 260) / 620;   // sk 0 easy .. 1 fast
    const mood = emotions(lt, [[0, 'happy', { emote: 'music' }], [2.75, 'determined', { emote: 'sweat' }], [4.65, 'furious'], [6.45, 'relieved'], [7.2, 'happy', { emote: 'music' }]], { take: .7 });
    if (mood.lid) mood.lid = 0;   // furious here means steam and red cheeks, not the lunchbox mouth (side view)
    const ph = s / (4 * u) * .42;
    clawd(x, G + 100, u, onRun(mood, runPose(ph, .45 + 1.1 * sk), { hat: 'sweatband' }));
    speedLines(x, G + 100, u, clamp((sk - .4) * 1.8), 'spD');
    dust(x, G + 100, u, lt, clamp(sk * 1.3 - .2), 'duD');
    const ang = kf(lt, [[0, Math.PI * .85], [2.6, Math.PI * .8], [2.95, Math.PI * .45], [4.5, Math.PI * .42], [4.85, Math.PI * .14], [6.2, Math.PI * .12], [6.65, Math.PI * .82]], backOut)
      + .02 * Math.sin(lt * 23) * sk;
    dial(ang, lt, seg(lt, 6.9, 7.2));
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt < .3) brushWipe(.5 + lt / .6, [K.easy, PAL.teal]);
  }

  // ======================================================================================================
  // E1 (36–40.5): the plate. Match cut from the dial: the camera pulls back from the plate's centre.
  // ======================================================================================================
  const PLATE = [960, 842, 250, 88];
  function shotPlate(t, lt, dur) {
    const pull = easeOut(seg(lt, 0, .9));
    camBegin(lerp(PLATE[0], 1000, pull), lerp(PLATE[1], 650, pull), lerp(3.4, 1.3, pull));
    // kitchen: a wall, a window, a table
    boilSeed('wall'); paint(rectPts(-400, -300, W + 800, 1100), { wash: mixCol(PAL.ochre, PAL.paper, .78), ink: null });
    boilSeed('window'); paint(rrPts(260, 170, 360, 300, 20, 2), { wash: mixCol(PAL.sky, PAL.paper, .3), ink: PAL.ink, sw: 1 });
    inkLine([[440, 170], [440, 470]], 1, PAL.ink); inkLine([[260, 320], [620, 320]], 1, PAL.ink);
    const u = 30, cx = 960, cg = 800;
    const tEat = 1.0, tDrink = 2.6, tHop = 3.8;
    const bites = [0, 1, 2, 3].map(i => tEat + .15 + i * .38);   // a bite lands every 0.38 s
    const eaten = bites.reduce((a, b) => a + seg(lt, b, b + .1), 0) / 4;
    const mood = emotions(lt, [[0, 'hopeful', { lookY: .9 }], [tEat, 'happy'], [tDrink, 'relieved'], [tDrink + .8, 'happy', { emote: 'spark' }]], { take: .6 });
    // chomping: the lid opens as each forkful arrives and snaps shut on the bite
    let lid = 0; for (const b of bites) { if (lt > b - .22 && lt < b + .08) lid = Math.max(lid, lt < b ? .4 * ease(seg(lt, b - .22, b - .05)) : .4 * (1 - seg(lt, b, b + .08))); }
    // drinking: lean to the straw
    const lean = seg(lt, tDrink, tDrink + .25) * (1 - seg(lt, tDrink + .9, tDrink + 1.1));
    let cl = { ...mood, lid, rot: (mood.rot || 0) + .1 * lean, dx: .5 * lean, mouth: lean > .5 ? 'o' : mood.mouth, hat: 'sweatband' };
    let x = cx;
    if (lt > tHop) { const j = jump(lt, tHop + .12, tHop + .55, 3.5); cl = { ...cl, ...turn(lt, tHop - .05, tHop + .1, 0, .25), lid: 0, dy: j.dy, sq: j.sq }; x = cx + 900 * easeIn(seg(lt, tHop + .12, dur + .1)); }
    clawd(x, cg, u, cl);
    // the table
    boilSeed('table'); paint(rectPts(-400, 726, W + 800, 700, 2), { wash: '#C99A6B', ink: null });
    for (let i = 0; i < 3; i++) inkLine([[-400 + i * 900, 728], [50 + i * 900, 724], [500 + i * 900, 729]], 1.1, PAL.ink);
    // the plate: pasta (the biggest pile), an egg, greens
    const [px, py, prx, pry] = PLATE;
    boilSeed('plate'); paint(ellPts(px, py, prx, pry, 36, 1), { wash: PAL.cream, ink: PAL.ink, sw: 1 });
    paint(ellPts(px, py, prx * .78, pry * .72, 30, 1), { wash: mixCol(PAL.cream, PAL.sky, .12), ink: PAL.ink, sw: .5 });
    const pk = 1 - clamp(eaten * 1.15);
    if (pk > .02) {
      boilSeed('pasta');
      paint(ellPts(px - 55, py - 18, 120 * pk, 60 * pk, 22, 3), { wash: '#F3C85C', ink: PAL.ink, sw: .8 });
      for (let i = 0; i < 4; i++) inkLine([[px - 140 * pk + 30 * i * pk, py - 20 - 10 * i * pk], [px - 80 * pk + 40 * i * pk, py - 40 * pk], [px - 20 + 20 * i * pk, py - 10]], .6, PAL.ochre, 'inkfine', .7);
    }
    const ek = 1 - seg(eaten, .55, 1);
    if (ek > .02) { boilSeed('egg'); paint(ellPts(px + 95, py - 12, 60 * ek, 36 * ek, 20, 1), { wash: PAL.cream, ink: PAL.ink, sw: .7 }); paint(ellPts(px + 95, py - 14, 20 * ek, 16 * ek, 12), { wash: PAL.ochre, ink: null }); }
    boilSeed('greens'); for (let i = 0; i < 3; i++) paint(ellPts(px + 30 + i * 36, py + 36, 26, 16, 10, 1, .5 * i), { wash: K.easy, ink: PAL.ink, sw: .5 });
    // forkfuls flying up to the mouth
    for (const b of bites) if (lt > b - .3 && lt < b) { boilSeed('fork' + b); const p = arcPt([px - 50, py - 30], [cx, cg - 4.3 * u], 80, ease(seg(lt, b - .3, b))); paint(ellPts(p[0], p[1], 22, 14, 12, 1), { wash: '#F3C85C', ink: PAL.ink, sw: .6 }); }
    // water glass with a straw to the mouth; the water drains while Clawd drinks
    const gx = 1240, gy = 660, lvl = 1 - seg(lt, tDrink + .2, tDrink + 1.0) * .8;
    boilSeed('glass');
    paint([[gx - 45, gy - 70], [gx + 45, gy - 70], [gx + 36, gy + 60], [gx - 36, gy + 60]], { wash: mixCol(PAL.sky, PAL.cream, .7), washOp: 200, ink: PAL.ink, sw: .9 });
    const wy = gy + 60 - 120 * lvl;
    paint([[gx - 36 - 9 * (1 - (wy - gy + 70) / 130), wy], [gx + 36 + 9 * (1 - (wy - gy + 70) / 130), wy], [gx + 36, gy + 60], [gx - 36, gy + 60]], { wash: PAL.sky, ink: null });
    const mouth = [cx + 20 + 15 * lean, cg - 4.3 * u + 10];
    inkLine([[gx - 10, gy + 30], [gx - 10, gy - 110], [lerp(gx - 60, mouth[0] + 90, lean), lerp(gy - 150, mouth[1], lean)]], 2.2, '#D8394E', 'marker', .1);
    camEnd();
  }

  // ======================================================================================================
  // E2 (40.5–45): fuel on the run. A volunteer holds out a gel; Clawd grabs it, eats it, powers up.
  // ======================================================================================================
  const E_SPEED = [[0, 520], [.5, 430], [1.8, 400], [2.9, 400], [3.3, 760], [4.5, 760]];
  function shotGel(t, lt, dur) {
    camBegin(960 + 12 * Math.sin(lt * .8), 540, 1.03);
    const G = 740, s = dist(lt, E_SPEED), u = 28, x = kf(lt, [[0, 380], [.6, 620]], easeOut);
    countryside(s, G, t, { road: mixCol(ROAD, PAL.ochre, .15) });
    const tGrab = 1.85, tabX = 640 + dist(tGrab, E_SPEED) - s + 170;   // the table passes Clawd right at the grab
    // aid table with cups, and a volunteer behind it holding out a gel
    const vx = tabX + 40, vy = G + 60;
    const offer = seg(lt, .7, 1.1) * (1 - seg(lt, tGrab + .15, tGrab + .5));
    clawd(vx, vy, 20, { ...feel('happy', t), col: PAL.teal, dk: mixCol(PAL.teal, PAL.ink, .35), lt: mixCol(PAL.teal, PAL.cream, .4), hat: 'hard', aL: -.2 + 1.2 * offer, aR: .2,
      armL: lt < tGrab ? (uu, sw) => gel(uu, sw, 1.8) : null, boilKey: 'vol' });
    boilSeed('aid');
    paint(rectPts(tabX - 190, G + 30, 380, 26, 1), { wash: '#C99A6B', ink: PAL.ink, sw: .9 });
    for (const lx of [-170, 150]) paint(rectPts(tabX + lx, G + 56, 16, 150), { wash: '#8A6A4A', ink: PAL.ink, sw: .6 });
    for (let i = 0; i < 4; i++) paint([[tabX - 150 + i * 40, G - 10], [tabX - 122 + i * 40, G - 10], [tabX - 126 + i * 40, G + 30], [tabX - 146 + i * 40, G + 30]], { wash: PAL.cream, ink: PAL.ink, sw: .6 });
    const spd = kf(lt, E_SPEED, x => x), sk = clamp((spd - 400) / 360);
    const mood = emotions(lt, [[0, 'happy'], [1.0, 'hopeful', { lookX: .8, lookY: -.4 }], [tGrab + .7, 'excited']], { take: .7 });
    const eat = seg(lt, tGrab + .25, tGrab + .8);
    const run = runPose(s / (4 * u) * .45, .6 + .9 * sk);
    const reach = lt > tGrab - .3 && lt < tGrab + .9 ? Math.sin(seg(lt, tGrab - .3, tGrab + .9) * Math.PI) : 0;
    const powered = seg(lt, tGrab + .7, tGrab + 1.0);
    clawd(x, G + 100, u, onRun(mood, run, { aL: lerp(run.aL, 1.2, reach), hat: 'sweatband', tint: 'gold', tintK: .6 * powered * (1 - seg(lt, 3.8, 4.4)),
      armL: lt >= tGrab && eat < 1 ? (uu, sw) => gel(uu, sw, 1.6 * (1 - eat)) : null, boilKey: 'runner' }));
    if (powered > 0) { const a = lt - tGrab - .7; for (let i = 0; i < 6; i++) { const q = seg(a, i * .03, .5 + i * .03); if (q > 0 && q < 1) { boilSeed('pw' + i); const ang = i / 6 * TAU; paint(starPts(x + Math.cos(ang) * 200 * q, G + 100 - 4 * u + Math.sin(ang) * 160 * q, 20 * backOut(q) * (1 - q * .6), .3, 4), { wash: GOLD, ink: null }); } } }
    speedLines(x, G + 100, u, sk, 'spE');
    dust(x, G + 100, u, lt, sk, 'duE');
    const eye = toScreen(x, G + 100 - 4 * u);
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt > dur - .6) iris(...eye, lt < dur - .45 ? lerp(1600, 260, ease(seg(lt, dur - .6, dur - .45))) : lerp(260, 0, easeIn(seg(lt, dur - .3, dur - .05))));
  }

  // ======================================================================================================
  // F (45–52): recovery. Night, sleep, the clock spins through 7–9 h; dawn; Clawd wakes and stretches.
  // ======================================================================================================
  function shotSleep(t, lt, dur) {
    const tSpin = .8, tDawn = 3.2, tWake = 4.0, tUp = 4.8;
    camBegin(960 + 10 * Math.sin(lt * .5), 540, kf(lt, [[0, 1.08], [tWake, 1.02], [dur, 1.06]]));
    const dawn = ease(seg(lt, tDawn, tDawn + .8));
    boilSeed('room'); paint(rectPts(-400, -300, W + 800, 1700), { wash: mixCol('#2E3566', mixCol(PAL.ochre, PAL.paper, .6), dawn), ink: null });
    boilSeed('floor'); paint(rectPts(-400, 930, W + 800, 500, 2), { wash: mixCol('#5A4A6E', '#C99A6B', dawn), ink: null });
    for (let i = 0; i < 3; i++) inkLine([[-400 + i * 900, 931], [50 + i * 900, 928], [500 + i * 900, 932]], 1, PAL.ink);
    // the window: moon, then sunrise
    boilSeed('win'); paint(rrPts(1180, 150, 420, 330, 20, 2), { wash: mixCol(PAL.night, '#FFD38A', dawn), ink: PAL.ink, sw: 1 });
    if (dawn < 1) { boilSeed('moon'); paint(ellPts(1300, 250, 40, 40, 20), { wash: PAL.cream, washOp: 255 * (1 - dawn), ink: null }); for (let i = 0; i < 5; i++) { boilSeed('st' + i); paint(starPts(1230 + hash(i) * 340, 180 + hash(i + 9) * 250, 7 * (.6 + .4 * Math.sin(lt * 3 + i)), .35, 4), { wash: PAL.cream, washOp: 255 * (1 - dawn), ink: null }); } }
    if (dawn > 0) { boilSeed('sun'); paint(ellPts(1390, 480 - 150 * dawn, 70, 70, 24), { wash: GOLD, ink: PAL.ink, sw: .7 }); }
    boilSeed('winframe'); paint(rectPts(1180, 460, 420, 26, 1), { wash: '#C99A6B', ink: PAL.ink, sw: .8 });
    inkLine([[1390, 150], [1390, 470]], 1, PAL.ink);
    // the clock: the hands spin through the night
    const [kx, ky, kr] = [640, 260, 110];
    boilSeed('clock'); paint(ellPts(kx, ky, kr, kr, 30, 1), { wash: PAL.cream, ink: PAL.ink, sw: 1.2 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; inkLine([[kx + Math.cos(a) * kr * .8, ky + Math.sin(a) * kr * .8], [kx + Math.cos(a) * kr * .92, ky + Math.sin(a) * kr * .92]], .8, PAL.ink, 'inkfine', 0); }
    const spin = ease(seg(lt, tSpin, tDawn)), hr = (10 + 8 * spin) / 12 * TAU - Math.PI / 2, mn = (8 * spin) * TAU - Math.PI / 2;
    boilSeed('hands');
    paint(ribbon([[kx, ky], [kx + Math.cos(hr) * kr * .52, ky + Math.sin(hr) * kr * .52]], 16, 6), { wash: PAL.ink, ink: null });
    paint(ribbon([[kx, ky], [kx + Math.cos(mn) * kr * .8, ky + Math.sin(mn) * kr * .8]], 10, 4), { wash: PAL.clayDk, ink: null });
    paint(ellPts(kx, ky, 10, 10, 12), { wash: PAL.ink, ink: null });
    lbl('7-9 h', kx + kr + 40, ky + 10, 80, dawn > .5 ? PAL.ink : PAL.cream, seg(lt, tSpin + .6, tSpin + 1), { align: 'left' });
    // the bed, Clawd, the blanket
    const bx = 930, by = 820;
    boilSeed('bed'); paint(rrPts(bx - 420, by - 60, 840, 170, 24, 2), { wash: '#8A6A4A', ink: PAL.ink, sw: 1 });
    paint(rrPts(bx - 440, by - 250, 50, 380, 18, 1), { wash: '#8A6A4A', ink: PAL.ink, sw: 1 });
    paint(ellPts(bx - 280, by - 90, 110, 50, 20, 2), { wash: PAL.cream, ink: PAL.ink, sw: .8 });
    const u = 26, fx = bx + 720, fy = 975;
    const mood = emotions(lt, [[0, 'sleepy'], [tWake, 'surprised'], [tWake + .45, 'happy'], [tUp + .6, 'relieved']], { take: .8 });
    const stretch = seg(lt, tUp + .75, tUp + 1.1);
    const sw = Math.sin((lt - tUp - .75) * TAU * .9) * stretch;
    if (lt < tUp) clawd(bx - 170, by - 10, u, { ...mood, noLegs: true, rot: -.25 + .25 * seg(lt, tWake, tWake + .4) });
    else {   // hop out of bed onto the floor, then a big stretch
      const k = seg(lt, tUp, tUp + .55), j = jump(lt, tUp + .08, tUp + .55, 0), p = arcPt([bx - 170, by - 10], [fx, fy], 260, ease(k));
      clawd(p[0], p[1], u, { ...mood, ...(k < 1 ? { view: 'side' } : {}), sq: (mood.sq || 0) + j.sq - .1 * stretch, aL: lerp(mood.aL ?? .2, 1.5, stretch), aR: lerp(mood.aR ?? .2, 1.5, stretch), rot: .14 * sw });
    }
    const bk = 1 - seg(lt, tUp, tUp + .35);
    boilSeed('blanket'); paint(rrPts(bx - 300 + 140 * (1 - bk), by - 100 + 60 * (1 - bk), 690 - 140 * (1 - bk), 180 - 60 * (1 - bk), 30, 3), { wash: K.rest, ink: PAL.ink, sw: 1 });
    for (let i = 0; i < 3; i++) inkLine([[bx - 200 + i * 180 + 140 * (1 - bk), by - 80 + 60 * (1 - bk)], [bx - 150 + i * 180 + 140 * (1 - bk), by + 60]], .6, mixCol(K.rest, PAL.ink, .4), 'inkfine', .4);
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt < .5) flash(1 - easeOut(lt / .5), PAL.ink);   // out of the iris's black
    if (lt > dur - .5) flash(easeIn(seg(lt, dur - .5, dur)), '#FFE3A1');
  }

  // ======================================================================================================
  // G (52–64): race day. Others sprint off; Clawd starts easy, holds steady, surges from 16 km and breaks the tape.
  // ======================================================================================================
  const G_SPEED = [[0, 0], [1.6, 0], [1.9, 380], [6.2, 380], [6.5, 780], [9.0, 780], [9.6, 0], [12, 0]];
  const T_TAPE = 9.0;
  function shotRace(t, lt, dur) {
    camBegin(960 + 12 * Math.sin(lt * .5), 540, kf(lt, [[0, 1.02], [9.2, 1.02], [10.4, 1.25], [12, 1.3]]));
    const G = 740, s = dist(lt, G_SPEED), u = 26, x = 700, sAt = tt => dist(tt, G_SPEED);
    boilSeed('dawnsky'); paint(ellPts(960, 120, 1400, 330, 30, 8), { wash: mixCol('#FFD38A', PAL.paper, .45), ink: null });
    countryside(s, G, t, { far: mixCol(PAL.ochre, PAL.paper, .5), tree: mixCol(GRASS_DK, PAL.ochre, .3) });
    // start line, km posts, and the finish arch
    boilSeed('startline'); if (s < 1400) paint(rectPts(x + 90 - s, G + 70, 26, 130), { wash: PAL.cream, ink: PAL.ink, sw: .6 });
    [['10', 5.0], ['16', 6.2]].forEach(([n, tt], i) => {
      const px = x + 80 + sAt(tt) - s;
      if (px < -200 || px > W + 200) return;
      boilSeed('post' + i);
      paint(rectPts(px - 8, G - 150, 16, 220), { wash: PAL.cream, ink: PAL.ink, sw: .7 });
      paint(rrPts(px - 60, G - 210, 120, 70, 12), { wash: n === '16' ? PAL.clay : PAL.cream, ink: PAL.ink, sw: .8 });
      lbl(n, px, G - 175, 44, n === '16' ? PAL.cream : PAL.ink);
    });
    const archX = x + 150 + sAt(T_TAPE) - s;
    // the other two runners: they dash off, then fade and get passed
    const R = [{ col: PAL.teal, hat: 'band', off: [[0, -250], [1.6, -250], [4.0, 1500], [5.6, 1400], [7.3, 300], [8.3, -800]], seed: 1 },
               { col: PAL.violet, hat: 'headphones', off: [[0, 240], [1.6, 240], [3.7, 1350], [5.8, 1150], [7.0, 520], [8.0, -800]], seed: 2 }];
    R.forEach((r, i) => {
      const o = kf(lt, r.off), rx = x + o;
      if (rx < -300 || rx > W + 300) return;
      const tired = seg(lt, 4.6, 5.2), before = lt < 1.6;
      const mood = before ? feel('excited', t) : tired > 0 ? feel('sad', t, { emote: 'sweat' }) : feel('determined', t);
      const pace = before ? 0 : lt < 4.3 ? 1.5 : .6;
      const pose = before ? { ...mood, view: 'q' } : onRun(mood, runPose(lt * (1.4 + 2 * pace) + r.seed * .37, pace));
      clawd(rx, G + 40 + i * 30, u * .85, { ...pose, col: r.col, dk: mixCol(r.col, PAL.ink, .35), lt: mixCol(r.col, PAL.cream, .4), hat: r.hat, boilKey: 'other' + i });
      if (!before && lt < 4.3) speedLines(rx, G + 40 + i * 30, u, 1, 'spO' + i);
    });
    // Clawd
    const spd = kf(lt, G_SPEED, x => x), sk = clamp((spd - 380) / 400);
    const mood = emotions(lt, [[0, 'determined'], [1.5, 'surprised'], [2.0, 'happy', { emote: 'music' }], [6.2, 'determined'], [T_TAPE + .1, 'excited'], [T_TAPE + 1.2, 'starstruck']], { take: .7 });
    let cl;
    if (lt < 1.6) cl = { ...mood, ...turn(lt, 1.4, 1.6, 0, .25), dy: (mood.dy || 0) + (lt > 1.4 ? -.6 : 0) };
    else if (lt < T_TAPE + .7) cl = onRun(mood, runPose(s / (4 * u) * .45, .45 + 1.1 * sk));
    else cl = { ...mood, ...turn(lt, T_TAPE + .7, T_TAPE + .9, .25, 0) };
    const medal = seg(lt, T_TAPE + 1.3, T_TAPE + 1.75);
    cl.draw = medal > 0 ? (uu, sw) => {
      const dy = -(1 - easeOut(medal)) * 6 * uu, bob = spring(lt, T_TAPE + 1.75, 5, 16) * .3 * uu;
      inkLine([[-2.2 * uu, -8 * uu + dy], [0, -3.4 * uu + dy + bob], [2.2 * uu, -8 * uu + dy]], sw * 1.4, '#D8394E', 'marker', .3);
      paint(ellPts(0, -2.8 * uu + dy + bob, .95 * uu, .95 * uu, 20), { wash: GOLD, ink: PAL.ink, sw: sw * .7 });
      paint(starPts(0, -2.8 * uu + dy + bob, .5 * uu, .45, 5), { wash: PAL.cream, ink: null });
    } : null;
    clawd(x, G + 100, u, { ...cl, hat: 'sweatband', boilKey: 'hero' });
    speedLines(x, G + 100, u, sk, 'spG');
    dust(x, G + 100, u, lt, sk, 'duG');
    // the gun
    if (lt > 1.55 && lt < 2.1) { boilSeed('gun'); const q = seg(lt, 1.55, 2.1); paint(starPts(x + 260, G - 250, 90 * backOut(q) * (1 - q * .5), .35, 8), { wash: GOLD, washOp: 255 * (1 - q), ink: null }); }
    if (archX > -400 && archX < W + 400) arch(archX, G + 100, 1.05, lt > T_TAPE ? seg(lt, T_TAPE, T_TAPE + 1.2) : 0);
    // confetti at the finish
    if (lt > T_TAPE) { const a = lt - T_TAPE; for (let i = 0; i < 18; i++) { boilSeed('conf' + i); const q = seg(a, 0, 2.4), ang = -Math.PI / 2 + (hash(i) - .5) * 2.4, v = 500 + 400 * hash(i + 3);
      const px = x + 40 + Math.cos(ang) * v * q, py = G - 150 + Math.sin(ang) * v * q + 900 * q * q;
      paint(rectPts(px, py, 18, 10, 1), { wash: [GOLD, PAL.rose, PAL.teal, K.easy][i % 4], ink: null }); } }
    const eye = toScreen(x, G + 100 - 4 * u);
    camEnd();
    flushLetters(); boilSeed('transition');
    if (lt < .6) flash(1 - easeOut(lt / .6), '#FFE3A1');
    if (lt > 10.6) { const r = lt < 11.1 ? lerp(1700, 330, ease(seg(lt, 10.6, 11.1))) : lt < dur - .35 ? lerp(330, 310, seg(lt, 11.1, dur - .35)) : lerp(310, 0, easeIn(seg(lt, dur - .35, dur - .05))); iris(...eye, r); }
  }

  shots([[0, shotGoal], [6, shotWeek], [16, shotWeeks], [28, shotEffort], [36, shotPlate], [40.5, shotGel], [45, shotSleep], [52, shotRace]]);
})();
