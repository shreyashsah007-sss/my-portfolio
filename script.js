/* ═══════════════════════════════════════════════════════════════
   Shreyash Sah — Portfolio engine
   Vanilla ES2020. No dependencies. Modules kept as IIFE namespaces.

   1. utils            6. reveal engine
   2. theme            7. tilt + magnetic
   3. cursor           8. counters
   4. hero 3D physics  9. filters, form, misc
   5. scroll engine
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  // Motion is force-enabled site-wide (the OS reduced-motion preference is
  // intentionally ignored). Kept as a single switch for future tuning.
  const REDUCED = false;
  const COARSE  = matchMedia('(pointer: coarse)').matches;

  /* ═══ 1. UTILS ═══ */
  const Util = {
    raf: [],
    loop(fn) { this.raf.push(fn); },
    start() {
      const tick = () => { this.raf.forEach(fn => fn()); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    },
    onIdle(fn) { 'requestIdleCallback' in window ? requestIdleCallback(fn) : setTimeout(fn, 200); },
  };
  /* ═══ 2. THEME ═══ */
  const Theme = (() => {
    const root = document.documentElement;
    const btn  = $('#themeToggle');
    const meta = $('meta[name="theme-color"]');

    const paint = () => {
      const dark = root.dataset.theme === 'dark';
      if (btn) btn.setAttribute('aria-pressed', String(dark));
      if (meta) meta.setAttribute('content', dark ? '#0a0b10' : '#f6f7fb');
    };

    paint();

    let transitioning = false;

    btn?.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      const apply = () => {
        root.dataset.theme = next;
        try { localStorage.setItem('ss-theme', next); } catch (e) { /* private mode */ }
        paint();
      };

      // A second view transition started while one is in flight rejects with an
      // AbortError, so skip the API until the previous one settles.
      if (document.startViewTransition && !REDUCED && !transitioning) {
        transitioning = true;
        const vt = document.startViewTransition(apply);
        vt.ready.catch(() => {});
        const settle = () => { transitioning = false; };
        vt.finished.then(settle, settle);
      } else {
        apply();
      }
    });

    // follow OS only while the user hasn't chosen explicitly
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
      let stored = null;
      try { stored = localStorage.getItem('ss-theme'); } catch (err) { /* noop */ }
      if (stored) return;
      root.dataset.theme = e.matches ? 'light' : 'dark';
      paint();
    });
  })();

  /* ═══ 3. CUSTOM CURSOR ═══ */
  const Cursor = (() => {
    const el = $('#cursor');
    if (!el || COARSE || REDUCED) return;
    const ring = $('.cursor__ring', el);
    const dot  = $('.cursor__dot', el);
    const aura = $('#cursorAura');
    const glow = $('#cursorGlow');
    document.documentElement.classList.add('has-cursor');

    let tx = innerWidth / 2, ty = innerHeight / 2;
    let rx = tx, ry = ty;          // ring  (1 frame of trail)
    let ax = tx, ay = ty;          // aura  (soft trailing glow)
    let lx = rx, ly = ry;          // previous ring position, for velocity

    const hoverIn  = () => { el.classList.add('is-hover');  aura?.classList.add('is-hover');  glow?.classList.add('is-hover'); };
    const hoverOut = () => { el.classList.remove('is-hover'); aura?.classList.remove('is-hover'); glow?.classList.remove('is-hover'); };

    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      // commit the precise dot inside the input event itself — waiting for the
      // next rAF would add up to a full frame of visible input lag
      if (dot) dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      glow?.classList.add('is-ready');
    }, { passive: true });
    addEventListener('pointerdown', () => el.classList.add('is-down'));
    addEventListener('pointerup',   () => el.classList.remove('is-down'));
    document.addEventListener('mouseleave', () => { el.classList.add('is-hidden'); aura?.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', () => { el.classList.remove('is-hidden'); aura?.classList.remove('is-hidden'); });

    // comet trail — each dot chases the one before it
    const TRAIL = 6;
    const trail = [];
    for (let i = 0; i < TRAIL; i++) {
      const d = document.createElement('i');
      d.className = 'cursor__trail';
      d.style.setProperty('--i', i);
      el.appendChild(d);
      trail.push({ el: d, x: tx, y: ty });
    }

    // interactive surfaces swell the cursor and shift the backdrop hue
    $$('[data-cursor="hover"], a, button, .card').forEach(n => {
      n.addEventListener('pointerenter', hoverIn);
      n.addEventListener('pointerleave', hoverOut);
    });
    // text fields switch the cursor to an I-beam
    $$('input, textarea').forEach(n => {
      n.addEventListener('pointerenter', () => { el.classList.add('is-text'); glow?.classList.add('is-hover'); });
      n.addEventListener('pointerleave', () => { el.classList.remove('is-text'); glow?.classList.remove('is-hover'); });
    });

    // frame-rate independent damping (exponential) so the feel is identical
    // on 60Hz, 120Hz and high-refresh displays
    let prev = performance.now();
    Util.loop(() => {
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      // Stiffness is tuned so nothing reads as input lag: the dot is pinned
      // 1:1 to the pointer, the ring closes ~95% of the gap within a couple
      // of frames, and only the soft aura is allowed to drift behind.
      const kRing  = 1 - Math.exp(-60 * dt);
      const kTrail = 1 - Math.exp(-34 * dt);
      const kAura  = 1 - Math.exp(-14 * dt);

      rx = lerp(rx, tx, kRing);
      ry = lerp(ry, ty, kRing);
      ax = lerp(ax, tx, kAura);
      ay = lerp(ay, ty, kAura);

      // stretch the ring a touch with speed so fast moves feel alive
      const speed = Math.hypot(rx - lx, ry - ly);
      lx = rx; ly = ry;
      const stretch = 1 + Math.min(speed * 0.006, 0.14);

      ring.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0) scale(${stretch.toFixed(3)})`;
      if (dot)  dot.style.transform  = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      if (aura) aura.style.transform = `translate3d(${ax.toFixed(2)}px, ${ay.toFixed(2)}px, 0)`;
      if (glow) {
        glow.style.setProperty('--gx', `${rx.toFixed(1)}px`);
        glow.style.setProperty('--gy', `${ry.toFixed(1)}px`);
      }

      let px = rx, py = ry;
      for (const t of trail) {
        t.x = lerp(t.x, px, kTrail);
        t.y = lerp(t.y, py, kTrail);
        t.el.style.transform = `translate3d(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px, 0)`;
        px = t.x; py = t.y;
      }
    });
  })();

  /* ═══ 4. HERO — CURSOR-TRACKING 3D ═══
     Delta is measured against the viewport centre, then mapped to
     rotation and perspective depth. Damping is delta-time based, so
     the card glides identically on any refresh rate.            */
  const Hero3D = (() => {
    const stage  = $('#heroStage');
    const card   = $('#card3d');
    if (!stage || !card) return;

    const out = {
      xy:  $('#readXY'),
      rx:  $('#readRotX'),
      ry:  $('#readRotY'),
      dz:  $('#readDepth'),
    };

    // targets (from pointer) and current (interpolated) state
    const T = { x: 0, y: 0, s: 1 };
    const C = { x: 0, y: 0, s: 1 };

    const cfg = { rotMax: 13, tiltFar: 26 };

    // cache the card box; re-measure on layout changes instead of on every
    // pointermove (which would force a synchronous reflow per event)
    let rect = card.getBoundingClientRect();
    const measure = () => { rect = card.getBoundingClientRect(); };
    addEventListener('resize', measure, { passive: true });
    addEventListener('scroll', measure, { passive: true });

    function onMove(e) {
      // delta relative to viewport centre, normalised to -1 … 1
      T.x = (e.clientX / innerWidth  - 0.5) * 2;
      T.y = (e.clientY / innerHeight - 0.5) * 2;

      // local pointer coords for the light sweep
      if (rect.width && rect.height) {
        card.style.setProperty('--px', `${((e.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty('--py', `${((e.clientY - rect.top)  / rect.height) * 100}%`);
      }

      // scale up slightly while the pointer is over the stage
      T.s = 1.028;
    }

    function onLeave() { T.x = 0; T.y = 0; T.s = 1; }

    if (!COARSE) {
      addEventListener('pointermove', onMove, { passive: true });
      stage.addEventListener('pointerleave', onLeave);
      document.addEventListener('mouseleave', onLeave);
    }

    // depth layers — data-depth drives parallax strength, data-z the resting Z
    const layers = $$('[data-depth]', card).map(n => ({
      el: n,
      k: parseFloat(n.dataset.depth),
      z: parseFloat(n.dataset.z || '0'),
    }));

    // frame-rate independent damping so the tilt feels the same at any refresh rate
    let prev = performance.now();
    let lastRead = '';
    Util.loop(() => {
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      const kTilt = 1 - Math.exp(-9 * dt);
      const kZoom = 1 - Math.exp(-7 * dt);

      C.x = lerp(C.x, T.x, kTilt);
      C.y = lerp(C.y, T.y, kTilt);
      C.s = lerp(C.s, T.s, kZoom);

      const rx =  clamp(-C.y * cfg.rotMax, -cfg.rotMax, cfg.rotMax);
      const ry =  clamp( C.x * cfg.rotMax, -cfg.rotMax, cfg.rotMax);
      const depth = C.s;                       // ~1.0 … 1.028
      const dz = (depth - 1) / 0.028;          // 0 … 1 depth scalar

      // main transform — matches the tutorial technique
      card.style.transform =
        `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) ` +
        `scale3d(${depth.toFixed(4)}, ${depth.toFixed(4)}, ${depth.toFixed(4)})`;

      // parallax layers translate along their own depth coefficient
      layers.forEach(({ el, k, z }) => {
        el.style.transform =
          `translate3d(${(-C.x * cfg.tiltFar * k * 10).toFixed(2)}px, ` +
          `${(-C.y * cfg.tiltFar * k * 10).toFixed(2)}px, ` +
          `${(z + dz * 90 * k).toFixed(2)}px)`;
      });

      // live readouts — only touch the DOM when the text actually changes
      const read = `${C.x.toFixed(2)}${C.y.toFixed(2)}${rx.toFixed(1)}${ry.toFixed(1)}${dz.toFixed(2)}`;
      if (read !== lastRead) {
        lastRead = read;
        if (out.xy) out.xy.textContent = `${C.x.toFixed(2)}, ${C.y.toFixed(2)}`;
        if (out.rx) out.rx.textContent = `${rx.toFixed(1)}°`;
        if (out.ry) out.ry.textContent = `${ry.toFixed(1)}°`;
        if (out.dz) out.dz.textContent = dz.toFixed(2);
      }
    });

    // idle float when nobody is moving the mouse
    if (!REDUCED) {
      const float = $('.card-3d__float--a', card);
      float?.addEventListener('animationend', () => {}, { once: true });
    }
  })();

  /* ═══ 4B. CHARACTER LOOP — canvas frame animation ═══
     Pre-extracted WebP frames drawn on a canvas as a seamless
     ping-pong idle loop. No <video>, no seeking, no play().      */
  const CharLoop = (() => {
    const canvas = $('#charCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const COUNT = 120;          // must match tools/extract_frames.py
    const FPS   = 24;           // playback rate of the source frames
    const DIR   = 'public/frames/';

    const IMGS = [];
    let lastIdx = -1;

    for (let i = 0; i < COUNT; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `${DIR}frame_${String(i).padStart(3, '0')}.webp`;
      IMGS.push(img);
    }

    // soft cursor parallax inside the frame
    const P = { x: 0, y: 0 }, PC = { x: 0, y: 0 };
    if (!COARSE) {
      addEventListener('pointermove', e => {
        P.x = (e.clientX / innerWidth  - 0.5) * 2;
        P.y = (e.clientY / innerHeight - 0.5) * 2;
      }, { passive: true });
      document.addEventListener('mouseleave', () => { P.x = 0; P.y = 0; });
    }

    /* ── gaze: eyes that track the pointer ──────────────────────────
       The source clip is a fixed idle loop, so the eyes are painted over
       each frame. Geometry is URL-tunable so it can be dialled in without
       touching any code:
         ?eyes=0              turn the overlay off
         ?ecx=212&ecy=143     eye-line centre, in 420x420 frame space
         ?esep=46             distance between the two eyes
         ?erx=14&ery=9        eye half-width / half-height
         ?eiris=0.46          how far the iris may travel, as a fraction
         ?eop=0.92            overlay opacity
         ?eyedebug=1          outline the sockets for alignment           */
    const qp   = new URLSearchParams(location.search);
    const qnum = (k, d) => { const v = parseFloat(qp.get(k)); return Number.isFinite(v) ? v : d; };
    const EYE = {
      on:    qp.get('eyes') !== '0',
      cx:    qnum('ecx', 212),
      cy:    qnum('ecy', 143),
      sep:   qnum('esep', 46),
      rx:    qnum('erx', 14),
      ry:    qnum('ery', 9),
      iris:  qnum('eiris', 0.46),
      op:    qnum('eop', 0.92),
      debug: qp.get('eyedebug') === '1',
    };

    function drawEyes(gx, gy) {
      const half = EYE.sep / 2;
      const ir   = Math.min(EYE.rx, EYE.ry) * 0.94;

      for (const s of [-1, 1]) {
        const ex = EYE.cx + s * half;
        const ey = EYE.cy;
        const ix = ex + gx * EYE.rx * EYE.iris;
        const iy = ey + gy * EYE.ry * EYE.iris;

        ctx.save();
        ctx.globalAlpha = EYE.op;

        // socket — grounds the eye and covers the render's own eye beneath it
        ctx.beginPath();
        ctx.ellipse(ex, ey, EYE.rx, EYE.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(22, 15, 13, 0.93)';
        ctx.fill();

        // clip to the opening so nothing spills onto the cheek
        ctx.beginPath();
        ctx.ellipse(ex, ey, EYE.rx * 0.95, EYE.ry * 0.95, 0, 0, Math.PI * 2);
        ctx.clip();

        // iris
        const grd = ctx.createRadialGradient(ix, iy, ir * 0.12, ix, iy, ir);
        grd.addColorStop(0,    'rgba(64, 42, 32, 1)');
        grd.addColorStop(0.55, 'rgba(28, 17, 14, 1)');
        grd.addColorStop(1,    'rgba(8, 5, 5, 1)');
        ctx.fillStyle = grd;
        ctx.fillRect(ex - EYE.rx, ey - EYE.ry, EYE.rx * 2, EYE.ry * 2);

        // catchlight — the thing that makes a CG eye read as alive
        ctx.beginPath();
        ctx.ellipse(ix - ir * 0.32, iy - ir * 0.36, ir * 0.25, ir * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 252, 246, 0.92)';
        ctx.fill();

        ctx.restore();

        if (EYE.debug) {
          ctx.save();
          ctx.strokeStyle = 'rgba(110, 168, 255, 0.95)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(ex, ey, EYE.rx, EYE.ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    const t0 = performance.now();
    let prev = t0;
    const G = { x: 0, y: 0 };
    Util.loop(() => {
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const t = (now - t0) / 1000;

      // delta-time damping so the in-frame parallax tracks smoothly
      const k = 1 - Math.exp(-8 * dt);
      PC.x = lerp(PC.x, P.x, k);
      PC.y = lerp(PC.y, P.y, k);
      canvas.style.setProperty('--cx', `${(PC.x * -8).toFixed(2)}px`);
      canvas.style.setProperty('--cy', `${(PC.y * -8).toFixed(2)}px`);

      // the gaze is quicker than the body parallax so the eyes feel locked on
      const kg = 1 - Math.exp(-16 * dt);
      G.x = lerp(G.x, P.x, kg);
      G.y = lerp(G.y, P.y, kg);

      const cycle = COUNT / FPS;                  // seconds, one direction
      const phase = (t % (cycle * 2)) / cycle;    // 0 … 1 … 0
      const fwd   = phase <= 1 ? phase : 2 - phase;
      const idx   = Math.min(COUNT - 1, Math.floor(fwd * (COUNT - 1)));

      // with eyes on we repaint every frame, since the gaze moves even
      // while the source frame is held
      if (idx === lastIdx && !EYE.on) return;
      const img = IMGS[idx];
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        lastIdx = idx;
      }
      if (EYE.on) drawEyes(G.x, G.y);
    });
  })();

  /* ═══ 5. SCROLL ENGINE ═══ */
  const Scroll = (() => {
    const nav       = $('#nav');
    const progress  = $('#scrollProgress');
    const toTop     = $('#toTop');
    const sections  = $$('main section[id]');
    const navLinks  = $$('[data-nav]');
    let lastY = -1;

    function onScroll() {
      const y = scrollY;
      if (y === lastY) return;
      lastY = y;

      nav?.classList.toggle('is-stuck', y > 24);

      if (progress) {
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
      }

      toTop?.classList.toggle('is-visible', y > 620);

      // active section
      const probe = y + innerHeight * 0.32;
      let current = sections[0]?.id;
      for (const s of sections) if (s.offsetTop <= probe) current = s.id;
      navLinks.forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${current}`));
    }

    // coalesce to one read per frame — scroll fires far faster than paint and
    // each pass reads offsetTop for every section (a forced layout)
    let ticking = false;
    const queue = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; onScroll(); });
    };

    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue, { passive: true });
    onScroll();

    toTop?.addEventListener('click', () =>
      scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' })
    );

    // mobile menu
    const burger = $('#burger');
    const links  = $('#navLinks');
    const setMenu = open => {
      burger?.classList.toggle('is-open', open);
      links?.classList.toggle('is-open', open);
      burger?.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('is-locked', open);
    };
    burger?.addEventListener('click', () => setMenu(!links.classList.contains('is-open')));
    links?.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  })();

  /* ═══ 6. REVEAL ENGINE ═══ */
  const Reveal = (() => {
    const items = $$('[data-reveal], .bar, [data-split]');
    if (REDUCED) {
      items.forEach(n => n.classList.add('is-in'));
      $$('.bar').forEach(n => n.classList.add('is-revealed'));
      return;
    }

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        if (entry.target.classList.contains('bar')) entry.target.classList.add('is-revealed');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    items.forEach(n => io.observe(n));
  })();

  /* ═══ 7. TILT + MAGNETIC ═══ */
  const Micro = (() => {
    if (REDUCED || COARSE) return;

    // 3D card tilt on pointer
    $$('[data-tilt]').forEach(el => {
      let rAF = null;
      el.addEventListener('pointermove', e => {
        if (rAF) cancelAnimationFrame(rAF);
        rAF = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width  - 0.5;
          const py = (e.clientY - r.top)  / r.height - 0.5;
          el.style.transform =
            `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateZ(0)`;
        });
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    // magnetic buttons
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.3}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  })();

  /* ═══ 8. COUNTERS ═══ */
  (() => {
    const nums = $$('[data-count]');
    if (!nums.length) return;

    const run = el => {
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      if (REDUCED) { el.textContent = target + suffix; return; }
      const dur = 1400;
      const t0 = performance.now();
      const step = now => {
        const p = clamp((now - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);       // easeOutCubic
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => { if (e.isIntersecting) { run(e.target); obs.unobserve(e.target); } });
    }, { threshold: 0.5 });
    nums.forEach(n => io.observe(n));
  })();

  /* ═══ 9. FILTERS, FORM, MISC ═══ */
  (() => {
    // project filters
    const filters = $$('.filter');
    const cards   = $$('#projectGrid .card');
    filters.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.filter;
        filters.forEach(b => b.classList.toggle('is-active', b === btn));
        cards.forEach(c => {
          const show = cat === 'all' || c.dataset.cat === cat;
          c.classList.toggle('is-hidden', !show);
          if (show) {
            c.style.animation = 'none';
            void c.offsetWidth;                       // restart
            c.style.animation = '';
          }
        });
      });
    });

    // contact form — client-side validation then hand off to mailto
    const form   = $('#contactForm');
    const status = $('#formStatus');
    if (form) {
      const fields = {
        name:    v => v.trim().length > 1,
        email:   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
        message: v => v.trim().length > 9,
      };

      const setErr = (name, bad) => {
        const input = $(`#${name}`);
        input?.closest('.field')?.classList.toggle('has-error', bad);
      };

      Object.keys(fields).forEach(name => {
        const input = $(`#${name}`);
        input?.addEventListener('input', () => {
          if (input.closest('.field')?.classList.contains('has-error')) {
            setErr(name, !fields[name](input.value));
          }
        });
      });

      form.addEventListener('submit', e => {
        e.preventDefault();
        let ok = true;
        let firstBad = null;

        for (const [name, test] of Object.entries(fields)) {
          const input = $(`#${name}`);
          const bad = !test(input.value);
          setErr(name, bad);
          if (bad) { ok = false; firstBad ??= input; }
        }

        if (!ok) {
          status.textContent = 'Please fix the highlighted fields.';
          status.classList.add('is-error');
          firstBad?.focus();
          return;
        }

        status.classList.remove('is-error');
        status.textContent = 'Opening your email client…';

        const d = new FormData(form);
        const subject = d.get('subject')?.trim() || 'Portfolio enquiry';
        const body = `${d.get('message').trim()}\n\n— ${d.get('name').trim()} (${d.get('email').trim()})`;
        location.href =
          `mailto:shreyashsah007@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        Confetti();

        setTimeout(() => {
          status.textContent = 'Sent — I usually reply within a day. Thanks for reaching out!';
          form.reset();
        }, 900);
      });
    }

    // footer year
    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  })();

  /* ═══ 10. INTRO CURTAIN ═══ */
  const Intro = (() => {
    const curtain = $('#curtain');
    if (!curtain) return;
    const pct = $('#curtainPct');
    const started = performance.now();
    const MIN = REDUCED ? 0 : 1500;

    curtain.classList.add('is-loading');

    if (pct && !REDUCED) {
      const tick = now => {
        const p = clamp((now - started) / MIN, 0, 1);
        pct.textContent = String(Math.round(p * 100));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else if (pct) {
      pct.textContent = '100';
    }

    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      const wait = Math.max(0, MIN - (performance.now() - started));
      setTimeout(() => {
        curtain.classList.add('is-done');
        document.documentElement.classList.add('is-ready');
        setTimeout(() => curtain.remove(), 1500);
      }, wait);
    };

    if (document.readyState === 'complete') setTimeout(finish, 500);
    else addEventListener('load', () => setTimeout(finish, 500), { once: true });

    setTimeout(finish, 2800);   // hard safety net (e.g. a font request stalls)
  })();

  /* ═══ 11. ROLE ROTATOR (typewriter) ═══ */
  (() => {
    const el = $('#rotator');
    if (!el) return;
    const words = (el.dataset.words || '').split(',').map(s => s.trim()).filter(Boolean);
    if (words.length < 2) return;
    if (REDUCED) { el.textContent = words[0]; return; }

    let wi = 0, ci = 0, deleting = false;
    const step = () => {
      const w = words[wi];
      if (!deleting) {
        el.textContent = w.slice(0, ++ci);
        if (ci === w.length) { deleting = true; return setTimeout(step, 1600); }
        return setTimeout(step, 52 + Math.random() * 48);
      }
      el.textContent = w.slice(0, --ci);
      if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; return setTimeout(step, 320); }
      return setTimeout(step, 26);
    };
    setTimeout(step, 900);
  })();

  /* ═══ 12. HERO EMBERS ═══ */
  (() => {
    const box = $('#embers');
    if (!box || REDUCED) return;
    const n = innerWidth < 700 ? 14 : 26;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      const size = 2 + Math.random() * 3;
      s.style.left = `${Math.random() * 100}%`;
      s.style.width = s.style.height = `${size.toFixed(1)}px`;
      s.style.animationDuration = `${(7 + Math.random() * 9).toFixed(1)}s`;
      s.style.animationDelay = `${(-Math.random() * 12).toFixed(1)}s`;
      s.style.setProperty('--dx', `${(Math.random() * 130 - 65).toFixed(0)}px`);
      s.style.background = i % 5 === 0 ? 'var(--accent-3)' : i % 3 === 0 ? 'var(--accent-2)' : 'var(--accent)';
      frag.appendChild(s);
    }
    box.appendChild(frag);
  })();

  /* ═══ 13. SPLIT-WORD HEADINGS ═══ */
  (() => {
    if (REDUCED) return;
    const headings = $$('[data-split]');
    headings.forEach(head => {
      let i = 0;
      const walk = node => {
        [...node.childNodes].forEach(child => {
          if (child.nodeType === 3) {                       // text node -> words
            const parts = child.textContent.split(/(\s+)/);
            const frag = document.createDocumentFragment();
            parts.forEach(p => {
              if (!p.trim()) { frag.appendChild(document.createTextNode(p)); return; }
              const span = document.createElement('span');
              span.className = 'split-w';
              span.style.setProperty('--i', i++);
              span.textContent = p;
              frag.appendChild(span);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1) {
            if (child.classList.contains('grad-text')) {     // keep gradient whole
              child.classList.add('split-w');
              child.style.setProperty('--i', i++);
            } else {
              walk(child);
            }
          }
        });
      };
      walk(head);
    });
  })();

  /* ═══ 14. TIMELINE DRAW ═══ */
  (() => {
    const wrap = $('.timeline-wrap');
    const fill = $('#tlFill');
    if (!wrap || !fill) return;
    const update = () => {
      const r = wrap.getBoundingClientRect();
      const start = innerHeight * 0.85;
      const total = r.height + start - innerHeight * 0.25;
      const p = clamp((start - r.top) / total, 0, 1);
      fill.style.setProperty('--tl', p.toFixed(4));
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  })();

  /* ═══ 15. RIPPLE ═══ */
  (() => {
    if (REDUCED) return;
    const SEL = '.btn, .filter, .link-card, .to-top, .theme-toggle, .hero__socials a';
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest(SEL);
      if (!t) return;
      const r = t.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.width = s.style.height = `${size}px`;
      s.style.left = `${e.clientX - r.left}px`;
      s.style.top = `${e.clientY - r.top}px`;
      t.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }, { passive: true });
  })();

  /* ═══ 16. CONFETTI ═══ */
  const Confetti = (() => {
    if (REDUCED) return () => {};
    let box = null;
    const COLORS = ['#6ea8ff', '#b98cff', '#4ade9b', '#ffb86b', '#ff7a9c'];
    return () => {
      if (!box) { box = document.createElement('div'); box.className = 'confetti'; document.body.appendChild(box); }
      for (let i = 0; i < 80; i++) {
        const p = document.createElement('b');
        p.style.left = `${Math.random() * 100}vw`;
        p.style.background = COLORS[i % COLORS.length];
        p.style.setProperty('--dx', `${(Math.random() * 220 - 110).toFixed(0)}px`);
        p.style.setProperty('--rot', `${(Math.random() * 900 + 360).toFixed(0)}deg`);
        p.style.setProperty('--dur', `${(1.8 + Math.random() * 1.7).toFixed(2)}s`);
        p.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
        box.appendChild(p);
        setTimeout(() => p.remove(), 4400);
      }
    };
  })();

  /* ═══ 17. SCROLL PARALLAX ═══ */
  (() => {
    if (REDUCED) return;
    const backdrop = $('.backdrop');
    const copy = $('.hero__copy');
    const visual = $('.hero__visual');
    let target = scrollY, cur = target;
    addEventListener('scroll', () => { target = scrollY; }, { passive: true });
    Util.loop(() => {
      cur = lerp(cur, target, 0.12);
      const par = Math.min(cur * 0.14, innerHeight * 0.35);
      backdrop?.style.setProperty('--par', par.toFixed(1));
      const hp = clamp(cur / innerHeight, 0, 1);
      copy?.style.setProperty('--heroShift', (hp * 90).toFixed(1));
      copy?.style.setProperty('--heroFade', (1 - hp * 0.92).toFixed(3));
      visual?.style.setProperty('--heroShift', (hp * 90).toFixed(1));
    });
  })();

  /* ═══ 18. SCROLL FX ═══
     One rAF loop drives every scroll-linked effect. Geometry is read
     first, styles are written second, so we never thrash layout. */
  (() => {
    const rail     = $('#rail');
    const railFill = rail ? $('.rail__fill', rail) : null;
    const sections = $$('main section[id]');
    const navLinks = $$('[data-nav]');

    // The rail is navigation, so build it for everyone.
    let dots = [];
    if (rail) {
      sections.forEach(s => {
        const a = document.createElement('a');
        a.href = `#${s.id}`;
        const label = navLinks.find(n => n.getAttribute('href') === `#${s.id}`);
        a.dataset.label = label ? label.textContent.trim() : s.id;
        a.innerHTML = '<i></i>';
        rail.appendChild(a);
      });
      dots = $$('a', rail);
    }

    const syncRail = (y, vh, max) => {
      const gp = max > 0 ? clamp(y / max, 0, 1) : 0;
      railFill?.style.setProperty('--rail', gp.toFixed(4));
      const probe = y + vh * 0.4;
      let current = sections[0]?.id;
      for (const s of sections) if (s.offsetTop <= probe) current = s.id;
      dots.forEach(d => d.classList.toggle('is-active', d.getAttribute('href') === `#${current}`));
    };

    if (REDUCED) {
      const onScroll = () =>
        syncRail(scrollY, innerHeight, document.documentElement.scrollHeight - innerHeight);
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll, { passive: true });
      onScroll();
      return;
    }

    const backdrop = $('.backdrop');
    const heroVis  = $('#heroVisual');
    const lead     = $('.about__copy .lead');
    const cards    = $$('.grid--cards .card');
    const steps    = $$('.tl');
    const skewEls  = $$('[data-skew]');

    // split the lead paragraph so it can light up word-by-word on scroll
    if (lead) {
      const words = [];
      const walk = node => {
        [...node.childNodes].forEach(child => {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach(part => {
              if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
              const w = document.createElement('span');
              w.className = 'scrub-w';
              w.textContent = part;
              frag.appendChild(w);
              words.push(w);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1) {
            walk(child);
          }
        });
      };
      walk(lead);
      words.forEach((w, i) => w.style.setProperty('--wi', i));
      lead.style.setProperty('--n', Math.max(words.length, 1));
    }

    let prevY = scrollY;
    let skew  = 0;
    let lastRunY = -1;
    let lastRunVh = -1;

    Util.loop(() => {
      const y  = scrollY;
      const vh = innerHeight;

      // Nothing in this module is time-based — every value is a pure function
      // of the scroll offset. Running the read/write cycle while the page is
      // still forces a synchronous reflow on *every* animation frame, which
      // starves the cursor + hero loops. Bail out when nothing moved.
      if (y === lastRunY && vh === lastRunVh) return;
      lastRunY = y;
      lastRunVh = vh;

      // ── read phase ──
      const max = document.documentElement.scrollHeight - vh;
      const cardGeom = cards.map(c => {
        const r = c.getBoundingClientRect();
        return (r.bottom < -140 || r.top > vh + 140) ? null : r.top + r.height / 2;
      });
      const leadRect = lead ? lead.getBoundingClientRect() : null;
      const stepMids = steps.map(t => {
        const r = t.getBoundingClientRect();
        return r.top + r.height / 2;
      });

      // ── write phase ──
      const dy = y - prevY;
      prevY = y;
      skew = lerp(skew, clamp(dy * 0.085, -3.2, 3.2), 0.12);
      if (Math.abs(skew) < 0.015) skew = 0;
      const skewVal = `${skew.toFixed(3)}deg`;
      skewEls.forEach(el => el.style.setProperty('--skew', skewVal));

      syncRail(y, vh, max);

      // palette drift as you scroll — driven as opacity weights on the three
      // pre-blurred aurora blobs, because hue-rotating a blurred layer forces
      // a full re-raster of it on every frame
      backdrop?.style.setProperty('--tint', clamp(y / (max || 1), 0, 1).toFixed(4));

      if (heroVis) {
        const hp = clamp(y / vh, 0, 1);
        heroVis.style.setProperty('--heroScale', (1 - hp * 0.14).toFixed(4));
      }

      if (cardGeom.length) {
        const mid = vh / 2;
        cardGeom.forEach((m, i) => {
          if (m == null) return;
          const rel  = clamp((m - mid) / mid, -1, 1);
          const near = 1 - Math.abs(rel);
          const el   = cards[i];
          el.style.setProperty('--deck-scale', (0.95 + near * 0.05).toFixed(4));
          el.style.setProperty('--deck-rot', `${((1 - near) * (i % 2 ? 1.6 : -1.6)).toFixed(3)}deg`);
          el.style.setProperty('--deck-lift', `${((1 - near) * -16).toFixed(2)}px`);
        });
      }

      if (leadRect) {
        const total = leadRect.height + vh * 0.45;
        const p = clamp((vh * 0.86 - leadRect.top) / total, 0, 1);
        lead.style.setProperty('--wp', p.toFixed(4));
      }

      if (stepMids.length) {
        const lo = vh * 0.34, hi = vh * 0.66;
        stepMids.forEach((m, i) => {
          steps[i].classList.toggle('is-active', m >= lo && m <= hi);
        });
      }
    });
  })();

  /* ═══ BOOT ═══ */
  Util.start();
  document.addEventListener('DOMContentLoaded', () => {
    // hero copy reveals on load
    requestAnimationFrame(() => {
      $$('.hero [data-reveal]').forEach(n => n.classList.add('is-in'));
    });
  });
})();
