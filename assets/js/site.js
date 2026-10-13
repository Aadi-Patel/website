/* ==========================================================================
   Shared page behaviour: mobile nav, starfield, custom cursor, logo tilt,
   reveal-on-scroll.
   ========================================================================== */
(function () {
    'use strict';

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Shared pointer state (read by the starfield and the cursor)
    const pointer = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        down: false,
        active: false
    };
    let activeHoverTarget = null;

    /* ---------------------------------------------------------------- nav */
    function initNav() {
        const toggle = document.querySelector('.nav-toggle');
        const nav = document.getElementById('site-nav');
        if (!toggle || !nav) return;

        toggle.addEventListener('click', () => {
            const open = nav.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(open));
        });
        nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
            nav.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        }));
    }

    /* ------------------------------------------------------------- reveal */
    function initReveal() {
        const items = document.querySelectorAll('.reveal');
        if (!items.length) return;
        if (reducedMotion || !('IntersectionObserver' in window)) {
            items.forEach(el => el.classList.add('is-visible'));
            return;
        }
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        items.forEach(el => io.observe(el));
    }

    /* ------------------------------------------------------------ pointer */
    function initPointer() {
        window.addEventListener('pointermove', e => {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            pointer.active = true;
        }, { passive: true });

        window.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'mouse') return;
            pointer.down = true;
            if (!activeHoverTarget && cursorRing) cursorRing.classList.add('gravity-active');
        });
        const release = () => {
            pointer.down = false;
            if (cursorRing) cursorRing.classList.remove('gravity-active');
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        document.addEventListener('mouseleave', () => { pointer.active = false; });
    }

    /* ------------------------------------------------------------- cursor */
    let cursorDot = null;
    let cursorRing = null;
    const dotPos = { x: pointer.x, y: pointer.y };
    const ringPos = { x: pointer.x, y: pointer.y };

    function initCursor() {
        if (!finePointer || reducedMotion) return;

        cursorDot = document.createElement('div');
        cursorDot.className = 'cursor-dot';
        cursorDot.setAttribute('aria-hidden', 'true');
        cursorRing = document.createElement('div');
        cursorRing.className = 'cursor-ring';
        cursorRing.setAttribute('aria-hidden', 'true');
        document.body.append(cursorDot, cursorRing);
        document.documentElement.classList.add('has-cursor');

        // Event delegation so elements added later (e.g. home revealed after the intro) also work
        document.addEventListener('pointerover', e => {
            const target = e.target.closest('a, button');
            if (target === activeHoverTarget) return;
            activeHoverTarget = target;
            cursorRing.classList.toggle('magnetic-hover', !!target);
        });
    }

    function updateCursor() {
        if (!cursorDot) return;
        let tx = pointer.x;
        let ty = pointer.y;

        // Magnetic snap to buttons and links (not to the tilting logos)
        if (activeHoverTarget && activeHoverTarget.isConnected && !activeHoverTarget.classList.contains('tilt-logo')) {
            const r = activeHoverTarget.getBoundingClientRect();
            if (r.width < 320) {
                tx = r.left + r.width / 2;
                ty = r.top + r.height / 2;
            }
        }
        dotPos.x += (tx - dotPos.x) * 0.3;
        dotPos.y += (ty - dotPos.y) * 0.3;
        ringPos.x += (dotPos.x - ringPos.x) * 0.15;
        ringPos.y += (dotPos.y - ringPos.y) * 0.15;
        cursorDot.style.transform = `translate3d(${dotPos.x}px, ${dotPos.y}px, 0) translate(-50%, -50%)`;
        cursorRing.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%)`;
    }

    /* ---------------------------------------------------------- starfield */
    let canvas = null;
    let ctx = null;
    let stars = [];
    let cw = 0;
    let ch = 0;

    function initStarfield() {
        canvas = document.getElementById('bg-particles');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        resizeStarfield();
        window.addEventListener('resize', resizeStarfield);
    }

    function resizeStarfield() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cw = window.innerWidth;
        ch = window.innerHeight;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Density scales with area so phones aren't crowded
        const count = Math.round(Math.min(150, Math.max(60, (cw * ch) / 11000)));
        stars = [];
        for (let i = 0; i < count; i++) {
            const node = Math.random() > 0.5; // slow "constellation" nodes
            stars.push({
                x: Math.random() * cw,
                y: Math.random() * ch,
                bvx: node ? (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * 0.3,
                bvy: node ? (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * 0.3,
                vx: 0,
                vy: 0,
                r: node ? Math.random() * 0.9 + 0.9 : Math.random() * 1.2 + 0.4,
                a: node ? 0.55 : Math.random() * 0.35 + 0.15,
                node
            });
        }
        if (reducedMotion) drawStars();
    }

    function stepStars() {
        const px = cursorDot ? dotPos.x : pointer.x;
        const py = cursorDot ? dotPos.y : pointer.y;
        const attract = pointer.down && !activeHoverTarget;

        for (const p of stars) {
            const dx = p.x - px;
            const dy = p.y - py;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            if (attract) {
                // Hold the mouse: stars fall into orbit around the cursor
                if (dist < 480 && dist > 5) {
                    const f = (480 - dist) / 480;
                    p.vx += (-dx / dist) * f * 1.4 + (-dy / dist) * f * 3.2;
                    p.vy += (-dy / dist) * f * 1.4 + (dx / dist) * f * 3.2;
                    p.vx *= 0.88;
                    p.vy *= 0.88;
                }
            } else {
                if (pointer.active && dist < 150) {
                    const f = (150 - dist) / 150;
                    p.vx += (dx / dist) * f * 0.45;
                    p.vy += (dy / dist) * f * 0.45;
                }
                p.vx += (p.bvx - p.vx) * 0.05;
                p.vy += (p.bvy - p.vy) * 0.05;
            }

            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x += cw;
            if (p.x > cw) p.x -= cw;
            if (p.y < 0) p.y += ch;
            if (p.y > ch) p.y -= ch;
        }
    }

    function drawStars() {
        ctx.clearRect(0, 0, cw, ch);

        ctx.lineWidth = 0.5;
        for (let i = 0; i < stars.length; i++) {
            const a = stars[i];
            if (!a.node) continue;
            for (let j = i + 1; j < stars.length; j++) {
                const b = stars[j];
                if (!b.node) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < 14400) {
                    const o = 1 - Math.sqrt(d2) / 120;
                    ctx.strokeStyle = `rgba(229, 212, 181, ${o * 0.28})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        for (const p of stars) {
            ctx.fillStyle = `rgba(229, 212, 181, ${p.a})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* --------------------------------------------------------------- tilt */
    function initTilt() {
        if (!finePointer || reducedMotion) return;
        document.querySelectorAll('.tilt-logo').forEach(wrapper => {
            const img = wrapper.querySelector('img');
            const shine = wrapper.querySelector('.tilt-shine');

            // Mask the shine with the logo so the highlight follows its shape
            if (shine && img) {
                const mask = `url('${img.getAttribute('src')}')`;
                shine.style.webkitMaskImage = mask;
                shine.style.maskImage = mask;
                shine.style.webkitMaskSize = shine.style.maskSize = 'contain';
                shine.style.webkitMaskRepeat = shine.style.maskRepeat = 'no-repeat';
                shine.style.webkitMaskPosition = shine.style.maskPosition = 'center';
            }

            wrapper.addEventListener('mousemove', e => {
                const r = wrapper.getBoundingClientRect();
                const x = e.clientX - r.left;
                const y = e.clientY - r.top;
                const nx = (x - r.width / 2) / (r.width / 2);
                const ny = (y - r.height / 2) / (r.height / 2);
                wrapper.style.transform = `perspective(400px) scale(1.08) rotateX(${-ny * 28}deg) rotateY(${nx * 28}deg)`;
                if (img) img.style.filter = `drop-shadow(${-nx * 10}px ${-ny * 10}px 12px rgba(229,212,181,0.3))`;
                if (shine) shine.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(229,212,181,0.65) 0%, transparent 60%)`;
            });
            wrapper.addEventListener('mouseleave', () => {
                wrapper.style.transform = '';
                if (img) img.style.filter = '';
                if (shine) shine.style.background = '';
            });
        });
    }

    /* --------------------------------------------------------------- loop */
    let running = true;
    function frame() {
        if (!running) return;
        updateCursor();
        if (canvas && !reducedMotion) {
            stepStars();
            drawStars();
        }
        requestAnimationFrame(frame);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            running = false;
        } else if (!running) {
            running = true;
            requestAnimationFrame(frame);
        }
    });

    /* --------------------------------------------------------------- boot */
    function boot() {
        initNav();
        initReveal();
        initPointer();
        initCursor();
        initStarfield();
        initTilt();
        document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
        requestAnimationFrame(frame);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
