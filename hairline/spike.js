/**
 * Spike: a desk receipt spike, six slips pushed down its needle at crooked
 * angles, the newest on top and lit. Each slip is on the needle once. The
 * pointer's height picks a slip; the slips above it slide up the needle,
 * staggered from the one picked, and the picked one takes the bright edge.
 * The slider is the gap they open, in world units.
 *
 * The pattern: scrub and pick. Tweens for which slip, a stagger by distance,
 * and a hit test on each slip's rest height, never on where it is drawn.
 */
const {
  Cam, circ, clamp, facing, fit, hull, open, poly, proj, prism, rad, ringAt, rrect, run, seg,
  tween, tset, tval, tdone, disposer, mk, pointer, put, register, solid,
} = HL;

const N = 6, W = 40, H = 66, PIN = 26, T = 1.1, STEP = 5.4, Z0 = 4, BR = 27, BH = 7;
const ANG = [-9, 12, -3, 17, -13, 5];
const TIP = Z0 + (N - 1) * STEP + 34 + 16;

/** A ring turned by deg about the origin and moved to (cx, cy); normals turn with it. */
function turn(ring, deg, cx, cy) {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return ring.map((q) => ({ u: cx + q.u * c - q.v * s, v: cy + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
}

/** Slip i: its outline and crease, pierced PIN from its head, and its printed rules, as local [u, v] segments. */
function slip(i) {
  const deg = ANG[i], c = Math.cos(rad(deg)), s = Math.sin(rad(deg)), off = H / 2 - PIN;
  const cx = -off * s, cy = off * c;
  const ring = turn(rrect(-W / 2, -H / 2, W / 2, H / 2, 2.4, 4), deg, cx, cy);
  const inner = turn(rrect(-W / 2 + 1.3, -H / 2 + 1.3, W / 2 - 1.3, H / 2 - 1.3, 1.4, 4), deg, cx, cy);
  const at = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
  const rules = [6, 12, 18, 24, 30].map((v) => [at(-W / 2 + 6, v - H / 2 + 14), at(W / 2 - (v === 18 ? 16 : 6), v - H / 2 + 14)]);
  const total = [at(W / 2 - 18, H / 2 - 8), at(W / 2 - 6, H / 2 - 8)];
  return { ring, inner, rules, total, cx, cy };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let gap = value;

  const slips = Array.from({ length: N }, (_, i) => slip(i));
  const C = Cam(45, 0.5, 2.3);
  const box = [[-BR, -BR, -BH], [BR, BR, -BH], [BR, -BR, -BH], [-BR, BR, -BH], [0, 0, TIP]];
  for (const sl of slips) for (const q of sl.ring) box.push([q.u, q.v, Z0], [q.u, q.v, Z0 + (N - 1) * STEP + 34]);
  fit(C, box, 200, 160);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // The base: a weighted disc. Then, bottom to top, a length of needle and the slip it enters.
  put(solid(g), prism(P, front, circ(BR, 28), circ(BR - 1.8, 28), -BH, 0));
  const needle = circ(1.25, 10), needleIn = circ(0.6, 10);
  const parts = slips.map((sl, i) => {
    const pin = solid(g), body = solid(g);
    const ruleEl = mk("path", { class: "nf lo" }, g), totalEl = mk("path", { class: "nf" }, g);
    return { ...sl, i, pin, body, ruleEl, totalEl, z: tween(Z0 + i * STEP), drawn: NaN };
  });
  const top = solid(g), tipRing = circ(0.15, 10);
  top.cr.remove();

  function drawSlip(p, z, below) {
    put(p.pin, prism(P, front, needle, needleIn, below, z));
    put(p.body, prism(P, front, p.ring, p.inner, z, z + T));
    // the printed rules and the total line lie on the slip's top face
    const zz = z + T, on = ([u, v]) => P(u, v, zz);
    p.ruleEl.setAttribute("d", p.rules.map(([a, b]) => seg(on(a), on(b))).join(""));
    p.totalEl.setAttribute("d", seg(on(p.total[0]), on(p.total[1])));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false, below = 0;
    for (const p of parts) {
      const z = tval(p.z, now);
      if (z !== p.drawn) { p.drawn = z; drawSlip(p, z, below); }
      below = z + T;
      if (!tdone(p.z, now)) moving = true;
    }
    const zt = parts[N - 1].drawn + T;
    top.sil.setAttribute("d", poly(hull(ringAt(P, needle, zt).concat(ringAt(P, tipRing, TIP)))));
    return moving;
  });
  bag.add(B.unregister);

  // Hit test on the rest pose: each slip's pierce point at its rest height, never where it is drawn.
  const restY = parts.map((p) => P(0, 0, Z0 + p.i * STEP + T)[1]), axisX = P(0, 0, 0)[0];
  function hit([sx, sy]) {
    if (Math.abs(sx - axisX) > 95 || sy < restY[N - 1] - 40 || sy > restY[0] + 40) return -1;
    let best = 0;
    restY.forEach((y, i) => { if (Math.abs(sy - y) < Math.abs(sy - restY[best])) best = i; });
    return best;
  }

  let act = -2;
  function setActive(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    parts.forEach((p) => {
      const lift = a >= 0 && p.i > a ? gap : 0;
      tset(p.z, Z0 + p.i * STEP + lift, now, Math.abs(p.i - from) * 45);
      p.body.sil.classList.toggle("hi", a < 0 ? p.i === N - 1 : p.i === a);
    });
    read.textContent = a < 0 ? "rest" : `slip ${N - a}`;
    B.wake();
  }

  setActive(-1, true);
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { gap = clamp(v, 0, 34); setActive(act, true); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "spike",
  means: "Six receipts on one spike, each on it once: point at a slip and the ones above slide up the needle.",
  rules: [1, 2, 6, 9],
  range: [12, 22, 34],
  tour: [[207, 204], [207, 182], [207, 160], null],
  mount,
});
