"""Original score and effects for the Fieldwork punch cut, composed and synthesised in code.

120 BPM, 4/4, 60 s, A minor (Am - F - C - G). Sections follow the cut:
  0.0-2.5   four words      a stab and an impact on each word, sub drone
  2.5-4.0   four tools      riser, busy hats, a quarter-beat stop before 4.0
  4.0       one record      the first drop: big impact
  4.0-8.0   the claim       kick and pumping bass enter
  8.0-20.0  log/approve/invoice  full groove: four-on-the-floor, clap on 2 and 4, arp, sidechained bass and pad
  20.0-24.0 the lock        stop at 19.75, then half-time under the three lock hits
  24.0-28.0 paid            groove returns, riser into 28
  28.0-34.0 the skyline     the biggest drop: lead line on top
  34.0-42.0 montage         full groove with a hit every bar
  42.0-48.0 devices         breakdown: pad and hats only
  48.0-52.0 the line        snare roll and riser, stop at 51.8
  52.0-60.0 end card        final hit, one ringing chord, filtered pulse fading out
Writes media/music.wav and media/sfx/*.wav (44.1 kHz). No samples, no library, no generation service.
"""
import numpy as np, wave, os

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
DUR = 60.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
here = os.path.dirname(os.path.abspath(__file__))

def save(path, x):
    x = np.clip(x, -1, 1)
    if x.ndim == 1: x = np.stack([x, x], 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

def lp(x, cutoff):
    """One-pole low-pass, in blocks: inside a block it is a convolution with the decaying kernel."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x); acc = 0.0; step = 4096
    powers = a ** np.arange(1, step + 1)
    for s in range(0, len(x), step):
        seg = x[s:s + step] * (1 - a); m = len(seg)
        y[s:s + m] = np.convolve(seg, a ** np.arange(m))[:m] + acc * powers[:m]
        acc = y[s + m - 1]
    return y
def hp(x, cutoff): return x - lp(x, cutoff)
def note(m): return 440.0 * 2 ** ((m - 69) / 12)
def place(buf, start, sig, gain=1.0):
    i = int(round(start * SR))
    if i < 0: sig = sig[-i:]; i = 0
    if i >= len(buf): return
    j = min(len(buf), i + len(sig)); buf[i:j] += sig[:j - i] * gain
def tt(dur): return np.arange(int(SR * dur)) / SR
def saw(f, t): return 2 * ((f * t) % 1) - 1

# ------------------------------------------------------------------ instruments
def kick(punch=1.0):
    t = tt(.5); f = 45 + 140 * np.exp(-t / .028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / .19)
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / .0035) * .5
    return np.tanh((body + click) * 1.6 * punch) * .95
def clap():
    t = tt(.3); x = hp(lp(rng.standard_normal(len(t)), 6000), 900)
    e = np.exp(-t / .07)
    for d in (.0, .011, .022): e += np.where((t > d) & (t < d + .006), 1.0, 0) * .6
    return np.tanh(x * e * 1.2) * .6
def snare():
    t = tt(.22); tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / .05)
    nz = hp(rng.standard_normal(len(t)), 1200) * np.exp(-t / .08)
    return (tone * .5 + nz * .7) * .7
def hat(open_=False):
    t = tt(.3 if open_ else .07); x = hp(rng.standard_normal(len(t)), 7500)
    return x * np.exp(-t / (.09 if open_ else .015)) * .32
def bass(m, dur):
    t = tt(dur); f = note(m)
    x = .6 * saw(f, t) + .5 * np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f / 2 * t)
    return np.tanh(lp(x, 520) * 1.8) * np.minimum(1, t / .004) * np.exp(-t / (dur * 1.2)) * .5
def stab(chord, dur=.32, bright=4200):
    t = tt(dur); x = np.zeros(len(t))
    for m in chord:
        for det in (-.12, .12): x += saw(note(m) * 2 ** (det / 12), t)
    return lp(x / (len(chord) * 2), bright) * np.exp(-t / .12) * .45
def pluck(m, dur=.25, bright=3200):
    t = tt(dur); f = note(m)
    x = saw(f, t) * .6 + np.sin(2 * np.pi * 2 * f * t) * .3
    return lp(x, bright) * np.exp(-t / .09) * .26
def pad(chord, dur, bright=1600):
    t = tt(dur); x = np.zeros(len(t))
    for m in chord:
        for det in (-.1, 0, .1): x += saw(note(m) * 2 ** (det / 12), t) * .5 + np.sin(2 * np.pi * note(m) * t)
    x /= len(chord) * 4.5
    return lp(x, bright) * np.clip(t / .3, 0, 1) * np.clip((dur - t) / .3, 0, 1) * .5
def lead(m, dur):
    t = tt(dur); f = note(m)
    vib = 1 + .004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / .2, 0, 1)
    x = saw(f * vib, t) * .6 + saw(f * 1.006 * vib, t) * .4
    return lp(x, 3800) * np.clip(t / .01, 0, 1) * np.exp(-t / (dur * 1.6)) * .28
def riser(dur):
    t = tt(dur); x = rng.standard_normal(len(t))
    out = np.zeros(len(t)); seg = int(SR * .05)
    for s in range(0, len(t), seg):           # sweep the noise upward by raising the cutoff
        c = 400 + 9000 * (s / len(t)) ** 2
        out[s:s + seg] = hp(x[s:s + seg], c * .3)[:len(out[s:s + seg])]
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / dur) ** 2) / SR) * .25
    return (out * .5 + tone) * (t / dur) ** 2.2 * .6
def impact(size=1.0):
    t = tt(2.2); f = 38 + 70 * np.exp(-t / .06)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .55)
    crack = hp(rng.standard_normal(len(t)), 1800) * np.exp(-t / .03) * .6
    tail = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t / .9) * .12
    return np.tanh((boom + crack + tail) * 1.3) * .9 * size

# ------------------------------------------------------------------ arrangement
music = np.zeros(N); drums = np.zeros(N); kicks = []
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOT = [33, 29, 36, 31]
ARP = [[69, 72, 76, 81], [65, 69, 72, 77], [64, 67, 72, 76], [62, 67, 71, 74]]
LEAD = [76, 74, 72, 74, 76, 79, 77, 76, 74, 72, 71, 72, 74, 76, 72, 69]

def chord_at(t): return int(t // BAR) % 4
def groove(a, b, *, clap_on=True, arp=True, half=False, hats=True, bassline=True, padb=1600):
    t = a
    while t < b - 1e-6:
        beat = round((t % BAR) / BEAT); ci = chord_at(t)
        if not half or beat in (0, 2): place(drums, t, kick()); kicks.append(t)
        if clap_on and beat in (1, 3): place(drums, t, clap(), .9)
        if hats:
            place(drums, t + BEAT / 2, hat(open_=(beat == 3)), 1.0)
            place(drums, t + BEAT / 4, hat(), .45); place(drums, t + 3 * BEAT / 4, hat(), .45)
        if bassline:
            for k in range(2):
                place(music, t + k * BEAT / 2, bass(ROOT[ci] + (12 if (beat == 3 and k) else 0), BEAT / 2 * .95), 1.0)
        if arp:
            for k in range(2):
                place(music, t + k * BEAT / 2, pluck(ARP[ci][(beat * 2 + k) % 4]), 1.0)
        if beat == 0: place(music, t, pad(CH[ci], BAR, padb), 1.0)
        t += BEAT

# 0-2.5: the four words: stab + impact on each, a sub drone underneath
for i, w in enumerate((0.0, 0.5, 1.0, 1.5, 2.0)):
    place(music, w, stab([57 + (i % 2) * 5, 64, 69], .4), 1.1); place(drums, w, impact(.55), 1.0); place(drums, w, kick(1.2)); kicks.append(w)
t = tt(2.5); place(music, 0, np.sin(2 * np.pi * 55 * t) * .25 * np.clip(t / .2, 0, 1))
# 2.5-3.9: riser and busy hats; stop 3.9-4.0
place(music, 2.5, riser(1.4), 1.0)
for k in range(int(1.4 / (BEAT / 4))): place(drums, 2.5 + k * BEAT / 4, hat(), .6 + .4 * (k % 2))
# 4.0: one record
place(drums, 4.0, impact(1.0), .85)
groove(4.0, 8.0, clap_on=False, arp=False, padb=1200)
# 8-19.75: full groove, riser bars into each fly-in not needed: the groove carries it
groove(8.0, 19.75)
# 20-24: the lock: half time, no hats (the lock hits sit on top)
groove(20.0, 24.0, half=True, hats=False, arp=False, padb=900)
# 24-28: groove back, riser into the skyline, stop 27.85
groove(24.0, 27.85)
place(music, 26.0, riser(1.85), 1.0)
# 28-34: the biggest drop, with the lead
place(drums, 28.0, impact(1.0), 1.15)
groove(28.0, 34.0, padb=2400)
for k, m in enumerate(LEAD[:12]): place(music, 28.0 + k * BEAT, lead(m, BEAT * .95), 1.0)
# 34-42: montage, a hit on every bar
groove(34.0, 42.0, padb=2200)
for b in range(4): place(drums, 34.0 + b * BAR, impact(.45), 1.0)
for k, m in enumerate(LEAD): place(music, 34.0 + k * BEAT, lead(m, BEAT * .9), .8)
# 42-48: breakdown: pad and hats, no kick
for b in range(3): place(music, 42.0 + b * BAR, pad(CH[(b + 1) % 4], BAR, 1300), 1.2)
for k in range(12): place(drums, 42.0 + k * BEAT + BEAT / 2, hat(), .6)
# 48-51.8: snare roll accelerating, riser; stop at 51.8
for k in range(16):
    tk = 48.0 + 3.8 * (1 - (1 - k / 16) ** 1.6); place(drums, tk, snare(), .3 + .35 * k / 16)
place(music, 48.0, riser(3.8), .75)
for b in range(2): place(music, 48.0 + b * BAR, pad(CH[b % 4], BAR, 1800), 1.0)
# 52: the end card: final hit, one ringing chord, a filtered pulse fading out
place(drums, 52.0, impact(1.0), .85); place(drums, 52.0, kick(1.1), .8); kicks.append(52.0)
place(music, 52.0, pad([57, 60, 64, 69, 72], 7.5, 2200), 1.15)
place(music, 52.0, stab([57, 64, 69, 72], .6), .8)
for k in range(28): place(music, 52.0 + k * BEAT / 2, pluck(ARP[0][k % 4], .2, 1200), .55 * (1 - k / 28))

# sidechain: the music ducks under every kick, the pump of the groove
duck = np.ones(N)
for k in kicks:
    i = int(k * SR); n = int(.24 * SR); j = min(N, i + n)
    duck[i:j] = np.minimum(duck[i:j], 1 - .62 * np.exp(-np.arange(j - i) / (SR * .07)))
mix = music * duck + drums
# the stops: true silence for a moment before each big hit (30 ms fades so nothing clicks or overshoots)
for a0, b0 in ((3.9, 4.0), (19.75, 20.0), (27.85, 28.0), (51.8, 52.0)):
    i, j, f = int(a0 * SR), int(b0 * SR), int(.03 * SR)
    mix[i:i + f] *= np.linspace(1, 0, f); mix[i + f:j] = 0
fade = np.ones(N); k = int(SR * 2.5); fade[-k:] = np.linspace(1, 0, k) ** 1.6
mix *= fade
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.6) * .9          # light saturation glues it
# a look-ahead peak limiter: holds every hit 6 dB under the top, so the master's linear loudness gain
# cannot push the kicks and impacts past the true-peak ceiling (fast attack over 3 ms, 90 ms release)
def limit(x, ceiling):
    look = int(SR * .003); rel = np.exp(-1 / (SR * .09))
    a = np.abs(x)
    peak = np.maximum.reduce([np.roll(a, -k) for k in range(0, look, 8)])   # what is coming in the next 3 ms
    want = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    g = np.empty_like(want); cur = 1.0
    for i in range(len(want)):                 # instant attack, smooth release
        w = want[i]; cur = w if w < cur else w + (cur - w) * rel; g[i] = cur
    return x * g
mix = limit(mix, .9 * 10 ** (-6 / 20)) / (10 ** (-6 / 20))
right = np.concatenate([np.zeros(int(SR * .008)), mix[:-int(SR * .008)]])
save(os.path.join(here, 'media', 'music.wav'), np.stack([mix, .82 * mix + .18 * right], 1))

# ------------------------------------------------------------------ effects kit
def sfx_tick():
    t = tt(.06); return np.sin(2 * np.pi * 2600 * t) * np.exp(-t / .01) * .6
def sfx_thud():                                  # a stamp landing
    t = tt(.5); body = np.sin(2 * np.pi * (70 + 80 * np.exp(-t / .03)) * t) * np.exp(-t / .12)
    slap = hp(rng.standard_normal(len(t)), 900) * np.exp(-t / .02) * .7
    return np.tanh((body + slap) * 1.5)
def sfx_lock():
    t = tt(.6); body = np.sin(2 * np.pi * 110 * t) * np.exp(-t / .08) * .8
    latch = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / .006) * .7
    ring = np.sin(2 * np.pi * 1320 * t) * np.exp(-t / .12) * .25 + np.sin(2 * np.pi * 1980 * t) * np.exp(-t / .08) * .12
    return np.tanh((body + latch + ring) * 1.4)
def sfx_swish():                                 # a screen flying in
    t = tt(.45); x = rng.standard_normal(len(t)); out = np.zeros(len(t)); seg = int(SR * .03)
    for s in range(0, len(t), seg):
        c = 600 + 5000 * np.sin(np.pi * s / len(t)); out[s:s + seg] = hp(lp(x[s:s + seg], c * 1.6), c * .4)[:len(out[s:s + seg])]
    return out * np.sin(np.pi * t / .45) ** 2 * .9
def sfx_chime():
    t = tt(2.4); x = np.zeros(len(t))
    for f, d, g in ((note(81), 0, .5), (note(88), .1, .45), (note(93), .2, .3)):
        i = int(d * SR); s = t[: len(t) - i]
        x[i:] += np.sin(2 * np.pi * f * s) * np.exp(-s / .8) * g
    return x
os.makedirs(os.path.join(here, 'media', 'sfx'), exist_ok=True)
for name, sig in (('tick', sfx_tick()), ('thud', sfx_thud()), ('lock', sfx_lock()), ('swish', sfx_swish()), ('chime', sfx_chime())):
    save(os.path.join(here, 'media', 'sfx', name + '.wav'), sig / np.max(np.abs(sig)) * .9)
for old in ('click.wav',):
    p = os.path.join(here, 'media', 'sfx', old)
    if os.path.exists(p): os.remove(p)
print('music', DUR, 's; sfx: tick, thud, lock, swish, chime')
