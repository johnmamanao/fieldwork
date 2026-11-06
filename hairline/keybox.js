/**
 * Keybox: a wall board with six pegs and a key on each, one key per role,
 * each cut with its own teeth. At rest the keys hang at uneven leans and the
 * owner's is lit. The key under the pointer swings out toward you on its peg;
 * its neighbours sway after it, less the further away, staggered from it. The
 * slider is the swing, in degrees.
 *
 * The pattern: one of many. Tweens for which key, a stagger by distance, a
 * clamped falloff, and a hit test on the keys' rest centres along the row.
 */
const {
  Cam, clamp, facing, fillet, fit, poly, proj, prism, rad, rings, seg,
  tween, tset, tval, tdone, disposer, mk, pointer, put, register, solid,
} = HL;

const ROLES = ["owner", "admin", "pm", "finance", "staff", "viewer"];
const BITS = [[3, 1.4, 2.6, 1, 2.2], [1.6, 2.8, 1.2, 3, 1.8], [2.4, 1, 3.2, 2, 1.2], [1.2, 3, 2, 1.4, 2.8], [2.8, 2.2, 1, 2.6, 1.6], [1, 1.6, 2.4, 3, 2]];
const LEAN = [8, 2, 13, 5, 10, 3];
const N = 6, SP = 24, M = 16, W = M * 2 + (N - 1) * SP, BH = 64, HZ = 52, KY = 4, TK = 1.4, HOLE = 6;
const FALL = [1, 0.4, 0.14, 0];

/** Key i's outline in its own plane: u across, w down from the top of the bow; the hole's centre is (0, HOLE). */
function outline(i) {
  const b = BITS[i], L = 33 + (i % 3) * 1.5, h = 1.8, pts = [];
  pts.push([-h, L - 1.5], [0, L + 0.6], [h, L - 0.6]);
  b.forEach((d, k) => {
    const w = L - 4 - k * 3.8;
    pts.push([h + d, w + 1], [h + d, w - 0.9], [h, w - 1.9]);
  });
  pts.push([3.4, 12.4]);
  // the bow: an arc over the top, from the right of the collar round to the left
  for (let s = 0; s <= 14; s++) {
    const t = rad(-50 + (s / 14) * 280);
    pts.push([6.2 * Math.cos(t), HOLE - 6.2 * Math.sin(t)]);
  }
  pts.push([-3.4, 12.4], [-h, 13.4]);
  return fillet(pts, pts.map(() => 0.55), 2);
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let swing = value;

  const C = Cam(45, 0.5, 1.74);
  const reach = 36 * Math.sin(rad(80)), drop = 36 * Math.cos(rad(80));
  fit(C, [[-3, -8, -4], [W + 3, 9, -4], [W + 3, -8, -4], [-3, -8, BH + 3.5], [W + 3, -8, BH + 3.5], [0, KY + reach, HZ - drop], [W, KY + reach, HZ - drop]], 200, 164);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // Back to front: the shelf, the board, then each key with the peg through it, then the cap.
  const [sr, si] = rings(-3, -8, W + 3, 9, 3, 1.2);
  put(solid(g), prism(P, front, sr, si, -4, 0));
  const [br, bi] = rings(0, -5, W, 0, 2.4, 1);
  put(solid(g), prism(P, front, br, bi, 0, BH));

  const keys = [];
  for (let i = 0; i < N; i++) {
    const hx = M + i * SP, shape = outline(i);
    const grp = mk("g", {}, g);
    const back = mk("path", { class: "lo" }, grp), face = mk("path", { class: "sil" }, grp), hole = mk("path", { class: "nf" }, grp);
    const [pr, pi] = rings(hx - 1.3, -1, hx + 1.3, KY + 3.2, 1.3, 0.5);
    put(solid(grp), prism(P, front, pr, pi, HZ - 1.3, HZ + 1.3));
    keys.push({ i, hx, shape, back, face, hole, a: tween(LEAN[i]), drawn: NaN });
  }
  const [cr, ci] = rings(-3, -8, W + 3, 5.5, 3, 1.2);
  put(solid(g), prism(P, front, cr, ci, BH, BH + 3.5));

  /** A point of key k's plane, swung th degrees out about its peg; `off` moves it back through the key's thickness. */
  function at(k, u, w, th, off) {
    const s = Math.sin(rad(th)), c = Math.cos(rad(th)), d = w - HOLE;
    return P(k.hx + u, KY + d * s - off * c, HZ - d * c - off * s);
  }
  function draw(k, th) {
    if (th === k.drawn) return;
    k.drawn = th;
    k.back.setAttribute("d", poly(k.shape.map(([u, w]) => at(k, u, w, th, TK))));
    k.face.setAttribute("d", poly(k.shape.map(([u, w]) => at(k, u, w, th, 0))));
    const ring = [];
    for (let s = 0; s < 12; s++) ring.push(at(k, 2.4 * Math.cos(rad(s * 30)), HOLE + 2.4 * Math.sin(rad(s * 30)), th, 0));
    k.hole.setAttribute("d", poly(ring) + seg(at(k, -1.2, 16, th, 0), at(k, -1.2, 28, th, 0)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const k of keys) { draw(k, tval(k.a, now)); if (!tdone(k.a, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);

  // Hit test on the rest pose: the key whose resting centre is nearest the pointer along the row.
  const cx = keys.map((k) => at(k, 0, 18, LEAN[k.i], 0)[0]);
  const yTop = P(0, KY, HZ + 8)[1] - 30, yBot = P(W, KY, HZ - 32)[1] + 30;
  function hit([sx, sy]) {
    if (sy < yTop || sy > yBot || sx < cx[0] - SP || sx > cx[N - 1] + SP) return -1;
    let best = 0;
    cx.forEach((x, i) => { if (Math.abs(sx - x) < Math.abs(sx - cx[best])) best = i; });
    return best;
  }

  let act = -2, pinned = -1;
  function setActive(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    keys.forEach((k) => {
      const f = a < 0 ? 0 : FALL[clamp(Math.abs(k.i - a), 0, 3)];
      tset(k.a, LEAN[k.i] + (clamp(swing, 0, 80) - LEAN[k.i]) * f, now, Math.abs(k.i - from) * 45);
      k.face.classList.toggle("hi", a < 0 ? k.i === 0 : k.i === a);
    });
    read.textContent = a < 0 ? "rest" : ROLES[a];
    B.wake();
  }

  setActive(-1, true);
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(pinned) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { swing = v; setActive(act, true); },
    /** Holds key i out (or none with -1) from the page, the way a pointer would. */
    pick: (i) => { pinned = i; setActive(i); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "keybox",
  means: "One key per role on a wall board, each cut differently: point at a key and it swings out on its peg.",
  rules: [1, 2, 3, 4],
  range: [38, 58, 78],
  tour: [[139, 117], [198, 146], [227, 161], null],
  mount,
});
