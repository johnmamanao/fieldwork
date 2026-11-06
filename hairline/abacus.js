/**
 * Abacus: a week of hours on a counting frame. Seven rods, Monday at the back,
 * each holding that day's hours as beads. At rest the beads lie loose along
 * their rods, except Monday's, already pushed home against the right rail and
 * lit. The rod under the pointer slides its beads home, staggered from the
 * rail outward, and its neighbours follow part of the way. The slider is the
 * reach, in rods.
 *
 * The pattern: one of many, with a falloff. Tweens for which rod, a stagger
 * by distance, and a hit test on the rods' own plane, which never moves.
 */
const {
  Cam, clamp, facing, fit, hull, lerp, open, poly, proj, prism, ringAt, rings, rrect, run, seg, unproj,
  tween, tset, tval, tdone, disposer, mk, pointer, put, register, solid,
} = HL;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const HOURS = [8, 6, 7, 6, 5, 2, 0];
const N = 7, G = 14, XL = 0, XR = 120, BW = 6.2, BD = 11.6, ZR = 7, Z0 = 1.8, Z1 = 12.2;
const FX0 = -9, FX1 = XR + 9, FY0 = -10, FY1 = (N - 1) * G + 10, FH = 7.4, RAIL = 6;

/** Loose rest positions for rod j: beads spread with uneven gaps, no two touching. */
function loose(j, n) {
  const free = XR - XL - n * BW, w = [];
  for (let k = 0; k <= n; k++) w.push(1 + 0.85 * Math.sin(j * 2.3 + k * 1.9));
  const sum = w.reduce((a, b) => a + b, 0);
  const xs = [];
  let x = XL;
  for (let k = 0; k < n; k++) { x += (w[k] / sum) * free; xs.push(x); x += BW; }
  return xs;
}
/** Home positions: packed against the right rail, the last bead touching it. */
const home = (n) => Array.from({ length: n }, (_, k) => XR - (n - k) * BW);

/** The frame, which never moves: far half painted before the beads, near half after. */
function frame(P, front) {
  const outer = rrect(FX0, FY0, FX1, FY1, 7, 6), inner = rrect(FX0 + RAIL, FY0 + RAIL, FX1 - RAIL, FY1 - RAIL, 3, 6);
  const LR = (p) => (p[0][0] <= p[p.length - 1][0] ? p : p.slice().reverse());
  const far = [
    [poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, FH)))), "sil"],
    [poly(ringAt(P, inner, FH)), "nf"],
    [open(ringAt(P, run(inner, (q) => !front(q)), 1.2)), "nf lo"],
  ];
  const iF = LR(ringAt(P, run(inner, front), FH)), oT = LR(ringAt(P, run(outer, front), FH)), oB = LR(ringAt(P, run(outer, front), 0));
  const near = [
    [poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo"],
    [open(oT), "nf lo"],
    [open(iF), "nf"],
    [open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil"],
  ];
  return { far, near };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value;

  const C = Cam(45, 0.5, 1.86);
  fit(C, [[FX0, FY0, 0], [FX1, FY1, 0], [FX1, FY0, 0], [FX0, FY1, 0], [FX0, FY0, Z1], [FX1, FY0, Z1]], 200, 170);
  const P = proj(C), front = facing(C);
  const paths = frame(P, front);
  const g = mk("g", {}, svg);
  for (const [d, cls] of paths.far) mk("path", { d, class: cls }, g);

  // Rod by rod from the back, beads left to right: that is back to front for this frame.
  const rods = [];
  for (let j = 0; j < N; j++) {
    const y = j * G, n = HOURS[j];
    const rest = j === 0 ? home(n) : loose(j, n), packed = home(n);
    const line = mk("path", { d: seg(P(FX0 + RAIL - 1, y, ZR), P(FX1 - RAIL + 1, y, ZR)), class: "nf" }, g);
    const beads = rest.map((x) => ({ el: solid(g), tw: tween(x), drawn: NaN }));
    rods.push({ j, y, n, rest, packed, line, beads });
  }
  for (const [d, cls] of paths.near) mk("path", { d, class: cls }, g);

  function drawBead(rod, b, x) {
    if (x === b.drawn) return;
    b.drawn = x;
    const [ring, inner] = rings(x, rod.y - BD / 2, x + BW - 1, rod.y + BD / 2, 2.6, 0.9);
    put(b.el, prism(P, front, ring, inner, Z0, Z1));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const rod of rods) for (const b of rod.beads) {
      drawBead(rod, b, tval(b.tw, now));
      if (!tdone(b.tw, now)) moving = true;
    }
    return moving;
  });
  bag.add(B.unregister);

  // Rest: Monday is home and lit, the eye's starting point.
  let act = -2;
  function light(a) {
    const lit = a < 0 ? 0 : a;
    rods.forEach((rod) => {
      rod.line.classList.toggle("hi", rod.j === lit && rod.n > 0);
      rod.beads.forEach((b) => b.el.sil.classList.toggle("hi", rod.j === lit));
    });
  }
  /** How far rod j goes home when rod a is chosen: all the way for a, less for its neighbours, none past the reach. */
  const share = (j, a) => (a < 0 ? 0 : clamp(1 - Math.abs(j - a) / (reach + 1), 0, 1));

  function setActive(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    for (const rod of rods) {
      const f = share(rod.j, a), d0 = Math.abs(rod.j - from) * 45;
      rod.beads.forEach((b, k) => {
        // the bead nearest the rail moves first, so the row closes up from the right
        tset(b.tw, lerp(rod.rest[k], rod.packed[k], f), now, d0 + (rod.n - 1 - k) * 24);
      });
    }
    light(a);
    read.textContent = a < 0 ? "rest" : `${DAYS[a]} ${HOURS[a]}h`;
    B.wake();
  }

  /** The rod under the pointer, read on the rods' plane, which never moves; -1 off the frame. */
  function hit([sx, sy]) {
    const [x, y] = unproj(C, sx, sy, ZR);
    if (x < FX0 || x > FX1 || y < FY0 || y > FY1) return -1;
    return clamp(Math.round(y / G), 0, N - 1);
  }

  setActive(-1, true);
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { reach = v; setActive(act, true); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "abacus",
  means: "A week of hours as beads on seven rods: point at a day and its hours slide home against the rail.",
  rules: [1, 2, 3, 5],
  range: [0, 1, 2],
  tour: [[250, 149], [200, 161], [150, 173], null],
  mount,
});
