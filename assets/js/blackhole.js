/* ==========================================================================
   Intro: a ray-traced Schwarzschild black hole with a thin accretion disk.

   Units: Schwarzschild radius r_s = 1 (so M = 1/2).
   Photon paths are integrated with the Binet-equivalent force law
       d²x/dλ² = -(3/2) h² x / r⁵,   h = |x × dx/dλ| (conserved)
   which reproduces null geodesics exactly in Schwarzschild spacetime: the
   photon sphere sits at 1.5 r_s and the shadow at ≈2.6 r_s.

   The disk spans the ISCO (3 r_s) to 13 r_s with a Novikov–Thorne-like
   temperature profile, Keplerian Doppler beaming and gravitational redshift.
   Rays that cross the disk plane more than once give the lensed image of
   the far side wrapping over (and under) the shadow.
   ========================================================================== */
(function () {
    'use strict';

    const VERT = `
        attribute vec2 a_pos;
        void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;

    const FRAG = `
        precision highp float;

        uniform vec2  u_res;
        uniform float u_time;
        uniform vec3  u_camPos;
        uniform mat3  u_camRot;
        uniform float u_focal;
        uniform float u_exposure;
        uniform float u_shift;

        const float R_IN  = 3.0;   // innermost stable circular orbit
        const float R_OUT = 13.0;
        const int   STEPS = 280;

        // ---------------------------------------------------------- noise
        float hash13(vec3 p) {
            p = fract(p * 0.1031);
            p += dot(p, p.zyx + 31.32);
            return fract((p.x + p.y) * p.z);
        }
        float hash12(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                    mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                    mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
                f.z);
        }
        float fbm(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise3(p);
                p = p * 2.03 + 17.1;
                a *= 0.5;
            }
            return v;
        }

        // ---------------------------------------------------------- sky
        // Procedural stars on a cube map. Each star's direction is rebuilt in 3D and its
        // profile is measured in angle, so stars stay round across the whole sky.
        vec3 faceDir(float axis, float sgn, vec2 uv) {
            if (axis < 0.5) return normalize(vec3(sgn, uv.x, uv.y));
            if (axis < 1.5) return normalize(vec3(uv.x, sgn, uv.y));
            return normalize(vec3(uv.x, uv.y, sgn));
        }

        vec3 starLayer(vec3 d, float density, float sigma, float seed, float fill) {
            vec3 a = abs(d);
            vec2 uv;
            float axis;
            float sgn;
            if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; axis = 0.0; sgn = sign(d.x); }
            else if (a.y > a.z)         { uv = d.xz / a.y; axis = 1.0; sgn = sign(d.y); }
            else                        { uv = d.xy / a.z; axis = 2.0; sgn = sign(d.z); }
            float face = axis * 2.0 + (sgn > 0.0 ? 0.0 : 1.0) + seed;

            vec2 cell = floor(uv * density);
            float h = hash12(cell + face * 97.0);
            if (h > fill) return vec3(0.0);

            vec2 pos = vec2(hash12(cell + 11.3 + face), hash12(cell + 47.9 + face)) * 0.7 + 0.15;
            vec3 s = faceDir(axis, sgn, (cell + pos) / density);
            float ang = length(d - s);
            float core = exp(-ang * ang / (sigma * sigma));
            float mag = pow(hash12(cell + 3.1 + face), 7.0);
            float tw = 0.85 + 0.15 * sin(u_time * (1.0 + h * 90.0) + h * 400.0);
            vec3 tint = mix(vec3(1.0, 0.86, 0.66), vec3(0.80, 0.87, 1.0), hash12(cell + 71.0));
            return tint * core * (0.12 + 2.6 * mag) * tw;
        }

        vec3 sky(vec3 d) {
            vec3 col = vec3(0.0);
            col += starLayer(d, 60.0, 0.0013, 0.0, 0.07);
            col += starLayer(d, 150.0, 0.0009, 13.0, 0.06) * 0.6;

            // Faint galactic band and deep-navy nebulosity
            float band = exp(-pow(dot(d, normalize(vec3(0.25, 1.0, -0.35))) * 3.2, 2.0));
            float neb = fbm(d * 3.0 + 4.0);
            col += vec3(0.03, 0.05, 0.11) * band * (0.25 + neb) * 0.45;
            col += vec3(0.06, 0.045, 0.03) * band * pow(neb, 3.0) * 0.45;
            return col;
        }

        // ---------------------------------------------------------- disk
        // Warm palette that runs ember → amber → gold → cream → cool white
        vec3 diskColor(float t) {
            vec3 c = mix(vec3(0.28, 0.07, 0.02), vec3(0.85, 0.36, 0.09), smoothstep(0.00, 0.40, t));
            c = mix(c, vec3(0.96, 0.66, 0.30), smoothstep(0.35, 0.75, t));
            c = mix(c, vec3(1.00, 0.86, 0.62), smoothstep(0.70, 1.10, t));
            c = mix(c, vec3(1.00, 0.95, 0.88), smoothstep(1.10, 1.60, t));
            return c;
        }

        // Emission and opacity where a ray crosses the disk plane (y = 0)
        vec4 diskSample(vec3 hit, vec3 rayDir) {
            float r = length(hit.xz);
            if (r < R_IN || r > R_OUT) return vec4(0.0);

            // Novikov–Thorne-like temperature profile, normalised to ≈1 at its peak
            float T = pow(R_IN / r, 0.75) * pow(max(1.0 - sqrt(R_IN / r), 0.0), 0.25) / 0.488;

            // Keplerian orbital speed seen by a static observer: v = sqrt(M / (r - 2M))
            float beta = sqrt(0.5 / (r - 1.0));
            vec3 vdir = normalize(vec3(-hit.z, 0.0, hit.x));
            float gamma = 1.0 / sqrt(1.0 - beta * beta);
            float cosT = dot(vdir, -rayDir);
            float doppler = 1.0 / (gamma * (1.0 - beta * cosT));
            float g = doppler * sqrt(1.0 - 1.0 / r); // with gravitational redshift

            // Differentially rotating turbulence (Ω = sqrt(M / r³))
            float omega = sqrt(0.5 / (r * r * r));
            float ang = -omega * u_time * 2.2;
            vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * hit.xz;
            float n = fbm(vec3(q * 0.9, r * 0.35));
            float streak = fbm(vec3(q * 2.6, r * 1.7 + 3.0));
            float detail = 0.45 + 0.75 * n * (0.6 + 0.8 * streak);

            float edge = smoothstep(R_IN, R_IN + 0.35, r) * (1.0 - smoothstep(R_OUT - 4.5, R_OUT, r));
            float Tobs = T * g;
            float intensity = pow(g, 3.0) * pow(T, 2.4) * detail * edge;

            vec3 col = diskColor(Tobs) * intensity * 1.35;
            float alpha = clamp(edge * (0.55 + 0.45 * n) * (0.35 + 0.65 * T), 0.0, 0.97);
            return vec4(col, alpha);
        }

        vec3 aces(vec3 x) {
            return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
            uv.y -= u_shift;
            vec3 dir = normalize(u_camRot * vec3(uv, -u_focal));

            vec3 p = u_camPos;
            vec3 v = dir;
            vec3 hv = cross(p, v);
            float h2 = dot(hv, hv);

            vec3 col = vec3(0.0);
            float trans = 1.0;
            float minR = 1e3;
            bool captured = false;

            float r = length(p);
            vec3 acc = -1.5 * h2 * p / pow(r, 5.0);

            for (int i = 0; i < STEPS; i++) {
                r = length(p);
                minR = min(minR, r);
                if (r < 1.0) { captured = true; break; }
                if (r > 60.0 && dot(p, v) > 0.0) break;
                if (trans < 0.01) break;

                float dt = clamp(0.065 * r, 0.025, 2.0);
                vec3 prev = p;

                // Velocity-Verlet
                p += v * dt + 0.5 * acc * dt * dt;
                float rn = length(p);
                vec3 accN = -1.5 * h2 * p / (rn * rn * rn * rn * rn);
                v += 0.5 * (acc + accN) * dt;
                acc = accN;

                // Disk-plane crossing
                if (prev.y * p.y < 0.0) {
                    float t = prev.y / (prev.y - p.y);
                    vec3 hit = mix(prev, p, t);
                    vec4 d = diskSample(hit, normalize(v));
                    col += trans * d.rgb * d.a;
                    trans *= 1.0 - d.a;
                }
            }

            if (!captured && trans > 0.01) {
                col += trans * sky(normalize(v));
            }

            // Faint halo around the photon ring
            float ring = exp(-pow((minR - 1.5) * 3.2, 2.0));
            col += vec3(1.0, 0.82, 0.55) * ring * 0.05 * (captured ? 0.0 : 1.0);

            col = aces(col * u_exposure);
            col = pow(col, vec3(1.0 / 2.2));

            // Vignette into the site's navy
            float vig = smoothstep(1.25, 0.25, length(uv * vec2(0.85, 1.0)));
            col = mix(vec3(0.012, 0.035, 0.078), col, 0.25 + 0.75 * vig);
            gl_FragColor = vec4(col, 1.0);
        }
    `;

    function compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn(gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function lookRotation(pos, roll) {
        // Columns: right, up, back (camera looks down -back toward the origin)
        const back = normalize(pos);
        let right = normalize(cross([0, 1, 0], back));
        let up = cross(back, right);
        const c = Math.cos(roll);
        const s = Math.sin(roll);
        const r2 = [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s];
        const u2 = [up[0] * c - right[0] * s, up[1] * c - right[1] * s, up[2] * c - right[2] * s];
        return new Float32Array([...r2, ...u2, ...back]);
    }
    function normalize(a) {
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / l, a[1] / l, a[2] / l];
    }
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /**
     * Mounts the black hole into `canvas`.
     * Returns { dive(onDone), destroy() } or null if WebGL is unavailable.
     */
    window.mountBlackHole = function (canvas) {
        const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
        if (!gl) return null;

        const vs = compile(gl, gl.VERTEX_SHADER, VERT);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return null;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        gl.useProgram(prog);

        // One oversized triangle covering the viewport
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const U = name => gl.getUniformLocation(prog, name);
        const uRes = U('u_res');
        const uTime = U('u_time');
        const uCamPos = U('u_camPos');
        const uCamRot = U('u_camRot');
        const uFocal = U('u_focal');
        const uExposure = U('u_exposure');
        const uShift = U('u_shift');

        // Render below native resolution and let the browser upscale; adapt to frame time
        let renderScale = 1;
        let cssW = 0;
        let cssH = 0;
        function resize() {
            cssW = window.innerWidth;
            cssH = window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const budget = Math.sqrt(900000 / Math.max(1, cssW * cssH * dpr * dpr));
            const scale = Math.min(1, budget) * dpr * renderScale;
            canvas.width = Math.max(1, Math.round(cssW * scale));
            canvas.height = Math.max(1, Math.round(cssH * scale));
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(uRes, canvas.width, canvas.height);
        }
        resize();
        window.addEventListener('resize', resize);

        // Camera state
        const mouse = { x: 0, y: 0 };
        const smooth = { x: 0, y: 0 };
        function onMove(e) {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
        }
        window.addEventListener('pointermove', onMove, { passive: true });

        let diving = false;
        let diveStart = 0;
        let onDiveDone = null;
        let raf = 0;
        let alive = true;
        let last = performance.now();
        let slowFrames = 0;
        const start = performance.now();

        function render(now) {
            if (!alive) return;
            raf = requestAnimationFrame(render);

            const dtMs = now - last;
            last = now;
            // Drop resolution if the GPU is struggling (a few bad frames in a row)
            if (dtMs > 30 && renderScale > 0.45) {
                if (++slowFrames > 12) {
                    renderScale *= 0.85;
                    slowFrames = 0;
                    resize();
                }
            } else {
                slowFrames = Math.max(0, slowFrames - 1);
            }

            smooth.x += (mouse.x - smooth.x) * 0.04;
            smooth.y += (mouse.y - smooth.y) * 0.04;

            const aspect = cssW / Math.max(1, cssH);
            let dist = 27 * Math.max(1, 1.25 / aspect);
            let shift = aspect < 1 ? 0.04 : 0.075;
            let incl = 1.43 + smooth.y * 0.09;  // angle from the disk's axis (≈82°)
            let az = smooth.x * 0.55 + (now - start) * 0.000012;
            let exposure = 1.0;
            let roll = -0.07 + smooth.x * 0.03;

            if (diving) {
                const t = Math.min(1, (now - diveStart) / 3600);
                const e = easeInOutCubic(t);
                dist = dist + (0.9 - dist) * e;
                incl = incl + (1.52 - incl) * e;
                roll = roll + e * 0.6;
                exposure = 1.0 + e * 0.8;
                shift *= 1 - e;
                if (t >= 1 && onDiveDone) {
                    const cb = onDiveDone;
                    onDiveDone = null;
                    cb();
                }
            }

            const pos = [
                dist * Math.sin(incl) * Math.sin(az),
                dist * Math.cos(incl),
                dist * Math.sin(incl) * Math.cos(az)
            ];
            gl.uniform3fv(uCamPos, pos);
            gl.uniformMatrix3fv(uCamRot, false, lookRotation(pos, roll));
            gl.uniform1f(uFocal, 1.25);
            gl.uniform1f(uExposure, exposure * 0.8);
            gl.uniform1f(uShift, shift);
            gl.uniform1f(uTime, (now - start) / 1000);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        raf = requestAnimationFrame(render);

        return {
            dive(cb) {
                if (diving) return;
                diving = true;
                diveStart = performance.now();
                onDiveDone = cb;
            },
            destroy() {
                alive = false;
                cancelAnimationFrame(raf);
                window.removeEventListener('resize', resize);
                window.removeEventListener('pointermove', onMove);
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
            }
        };
    };
})();
