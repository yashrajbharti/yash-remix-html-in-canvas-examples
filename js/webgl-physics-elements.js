const PAGE_WIDTH = 5.0; // In WebGL units
const PAGE_HEIGHT = 8.0;

export function setupPhysicsRendering(canvas, containerId) {
    const gl = canvas.getContext('webgl2', { 
        antialias: true,
        alpha: true,
        premultipliedAlpha: false
    });
    if (!gl) return;

    // --- SHADERS ---
    const vsSource = `#version 300 es
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec2 aTexCoord;
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform mat4 uModel;
    out vec2 vTexCoord;
    void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        vTexCoord = aTexCoord;
    }`;

    const fsSource = `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    uniform sampler2D uTex;
    uniform float uHueOffset;
    out vec4 fragColor;
    
    vec3 hueRotate(vec3 color, float hueAdjust) {
        const vec3 k = vec3(0.57735, 0.57735, 0.57735);
        float cosAngle = cos(hueAdjust);
        return color * cosAngle + cross(k, color) * sin(hueAdjust) + k * dot(k, color) * (1.0 - cosAngle);
    }

    void main() {
        vec4 color = texture(uTex, vTexCoord);
        if (color.a < 0.1) discard;
        color.rgb = hueRotate(color.rgb, uHueOffset);
        fragColor = color;
    }`;

    const createShader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);

    const uProj = gl.getUniformLocation(program, 'uProjection');
    const uView = gl.getUniformLocation(program, 'uView');
    const uModel = gl.getUniformLocation(program, 'uModel');
    const uHue = gl.getUniformLocation(program, 'uHueOffset');

    // --- GEOMETRY (A simple unit plane) ---
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    // --- PHYSICS MANAGER ---
class PhysicsElement {
    constructor(domElement) {
        this.domEl = domElement;
        
        // Use a random hue offset for the WebGL shader instead of CSS filter
        this.hueOffset = Math.random() * Math.PI * 2;

        this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        this.active = false;
        this.domEl.style.visibility = 'hidden';
        this.domEl.style.pointerEvents = 'none';

        this.x = 0;
        this.y = 20;
        this.z = 0;

        this.vx = 0;
        this.vy = 0;

        this.rot = [0, 0, 0];
        this.rotV = [0, 0, 0];

        this.updateSize();

        // --- Drag Interaction ---
        this.isDragging = false;
        let lastMouse = null;
        let originalInvMass = this.invMass;

        this.domEl.addEventListener('mousedown', (e) => {
            if (!this.active) return;
            this.isDragging = true;
            lastMouse = { x: e.clientX, y: e.clientY };
            originalInvMass = this.invMass;
            this.invMass = 0; // Infinite mass while dragging so it pushes others purely kinematically
            this.vx = 0;
            this.vy = 0;
            this.rotV = [0, 0, 0];
        });

        this.domEl.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - lastMouse.x;
            const dy = e.clientY - lastMouse.y;
            
            // Map Screen Pixels to WebGL Coordinates approximately (Z=0)
            const scale = 12.5 / window.innerHeight;
            const glDx = dx * scale;
            const glDy = -dy * scale; // Invert Y
            
            this.x += glDx;
            this.y += glDy;
            
            // Generate momentary throw velocity for realistic release momentum
            this.vx = glDx / 0.016; // approx 60fps delta
            this.vy = glDy / 0.016;
            
            lastMouse = { x: e.clientX, y: e.clientY };
        });

        const releaseDrag = (e) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.invMass = originalInvMass;
        };

        this.domEl.addEventListener('mouseup', releaseDrag);
        this.domEl.addEventListener('mouseleave', releaseDrag);
    }

    updateSize() {
        this.width = this.domEl.offsetWidth / 80;
        this.height = this.domEl.offsetHeight / 80;

        // 🔥 increased radius multiplier from 0.98 to 1.1 (0.55 half) to compensate for rectangle corners overlapping
        this.radius = Math.min(this.width, this.height) * 0.55;

        this.mass = this.width * this.height;
        this.invMass = 1 / this.mass;
    }

    reset() {
        this.updateSize();

        this.active = true;
        this.domEl.style.visibility = 'visible';

        this.x = (Math.random() - 0.5) * 5;
        this.y = 12;

        this.vx = (Math.random() - 0.5) * 2;
        this.vy = 0;

        this.rot = [0, 0, (Math.random() - 0.5)];
        this.rotV = [0, 0, (Math.random() - 0.5) * 2];
    }

    update(dt) {
        if (!this.active) return;

        if (this.isDragging) {
            // Apply heavy rotational drag while dragging
            this.rotV[2] *= 0.9;
            this.rot[2] += this.rotV[2] * dt;
            
            if (gl.texElementImage2D) {
                try {
                    gl.bindTexture(gl.TEXTURE_2D, this.tex);
                    gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.domEl);
                } catch {}
            }
            return;
        }

        const gravity = -25;
        this.vy += gravity * dt;

        const drag = 0.999;
        const angularDrag = 0.98; // Ensures they stop spinning eventually
        this.vx *= drag;
        this.vy *= drag;
        this.rotV[2] *= angularDrag;

        // Righting torque: encourages landing on the flat/width edges (nearest multiple of PI)
        const targetAngle = Math.round(this.rot[2] / Math.PI) * Math.PI;
        const angleDiff = targetAngle - this.rot[2];
        this.rotV[2] += angleDiff * 8.0 * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        const floor = -5;

        // ✅ stable floor collision
        if (this.y - this.radius < floor) {
            this.y = floor + this.radius;

            if (this.vy < 0) {
                this.vy *= -0.4;
            }

            this.vx *= 0.98;
            this.rotV[2] *= 0.8;
        }

        const wall = 6.5;
        if (Math.abs(this.x) + this.radius > wall) {
            this.x = Math.sign(this.x) * (wall - this.radius);
            this.vx *= -0.6;
        }

        // ✅ sleep logic
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
        if (Math.abs(this.vy) < 0.01 && Math.abs(this.y - (floor + this.radius)) < 0.01) {
            this.vy = 0;
        }

        // ✅ kill unwanted spin at rest
        if (Math.abs(this.vy) < 0.05 && Math.abs(this.y - (floor + this.radius)) < 0.01) {
            this.rotV[2] *= 0.7;
            if (Math.abs(this.rotV[2]) < 0.01) this.rotV[2] = 0;
        }

        this.rot[2] += this.rotV[2] * dt;

        if (gl.texElementImage2D) {
            try {
                gl.bindTexture(gl.TEXTURE_2D, this.tex);
                gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.domEl);
            } catch {}
        }
    }

    getMatrix() {
        const m = mat4.create();
        mat4.translate(m, m, [this.x, this.y, this.z]);
        mat4.rotateZ(m, m, this.rot[2]);
        mat4.scale(m, m, [this.width, this.height, 1]);
        return m;
    }
}

function resolveCollisions(elements) {
    const restitution = 0.4;
    const friction = 0.2;

    for (let iter = 0; iter < 12; iter++) {
        for (let i = 0; i < elements.length; i++) {
            for (let j = i + 1; j < elements.length; j++) {

                const a = elements[i];
                const b = elements[j];

                const dx = b.x - a.x;
                const dy = b.y - a.y;

                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = a.radius + b.radius;

                if (dist < minDist && dist > 0.0001) {

                    const nx = dx / dist;
                    const ny = dy / dist;

                    const overlap = minDist - dist;

                    // 🔥 REAL FIX: slop + bias + mass correction
                    const percent = 1.0; // Pushes 100% out of intersection
                    const slop = 0.005; // tighter tolerance

                    const correctionMag = Math.max(overlap - slop, 0) * percent;

                    let correctionX = correctionMag * nx;
                    let correctionY = correctionMag * ny;

                    // clamp (prevents explosions)
                    const maxCorrection = 0.6; // increased cap allowing faster overlap resolution
                    correctionX = Math.max(-maxCorrection, Math.min(maxCorrection, correctionX));
                    correctionY = Math.max(-maxCorrection, Math.min(maxCorrection, correctionY));

                    const invMassSum = a.invMass + b.invMass;
                    if (invMassSum === 0) continue; // Prevent explosion if both are being dragged

                    a.x -= correctionX * (a.invMass / invMassSum);
                    a.y -= correctionY * (a.invMass / invMassSum);

                    b.x += correctionX * (b.invMass / invMassSum);
                    b.y += correctionY * (b.invMass / invMassSum);

                    // relative velocity
                    const rvx = b.vx - a.vx;
                    const rvy = b.vy - a.vy;

                    const velAlongNormal = rvx * nx + rvy * ny;

                    if (velAlongNormal > 0) continue;

                    // impulse
                    const jImpulse = -(1 + restitution) * velAlongNormal / invMassSum;

                    const impulseX = jImpulse * nx;
                    const impulseY = jImpulse * ny;

                    a.vx -= impulseX * a.invMass;
                    a.vy -= impulseY * a.invMass;

                    b.vx += impulseX * b.invMass;
                    b.vy += impulseY * b.invMass;

                    // friction
                    const tx = -ny;
                    const ty = nx;

                    const velTangent = rvx * tx + rvy * ty;
                    const jt = -velTangent / invMassSum * friction;

                    a.vx -= jt * tx * a.invMass;
                    a.vy -= jt * ty * a.invMass;

                    b.vx += jt * tx * b.invMass;
                    b.vy += jt * ty * b.invMass;

                    // 🔥 controlled spin only when meaningful
                    const spinThreshold = 0.5;
                    if (Math.abs(velTangent) > spinThreshold) {
                        const spin = velTangent * 0.05;
                        a.rotV[2] -= spin;
                        b.rotV[2] += spin;
                    }

                    // 🔥 resting stabilization
                    if (Math.abs(velAlongNormal) < 0.2) {
                        a.vy = 0;
                        b.vy = 0;
                    }
                }
            }
        }
    }
}
    const elements = Array.from(canvas.children).filter(el => el.classList.contains('physics-item')).map(el => new PhysicsElement(el));

    const projection = mat4.create();
    const view = mat4.create();
    mat4.lookAt(view, [0, 0, 15], [0, 0, 0], [0, 1, 0]);

    let lastTime = 0;
    function render(time) {
        const dt = Math.min(0.05, (time - lastTime) / 1000); // Cap delta time
        lastTime = time;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        
        // ALPHA BLENDING: Fixes black box around transparent edges/shadows
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        gl.useProgram(program);

        mat4.perspective(projection, 45 * Math.PI / 180, canvas.width / canvas.height, 0.1, 1000);
        gl.uniformMatrix4fv(uProj, false, projection);
        gl.uniformMatrix4fv(uView, false, view);

        const toCSSViewport = new DOMMatrix()
            .translate(canvas.width / 2, canvas.height / 2)
            .scale(canvas.width / 2, -canvas.height / 2, 1);

        for (const p of elements) {
            p.update(dt);
        }
        
        // Resolve inter-element collisions
        resolveCollisions(elements);

        for (const p of elements) {
            const model = p.getMatrix();
            gl.uniformMatrix4fv(uModel, false, model);
            gl.uniform1f(uHue, p.hueOffset);
            
            gl.bindTexture(gl.TEXTURE_2D, p.tex);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // SYNC INTERACTIVITY
            if (canvas.getElementTransform) {
                try {
                    // toGLModel maps DOM [0, width] to GL [-0.5, 0.5]
                    const w = p.domEl.offsetWidth;
                    const h = p.domEl.offsetHeight;
                    const toGLModel = new DOMMatrix()
                        .scale(1/80, -1/80, 1) // Match new scale divisor of 80
                        .translate(-w/2, -h/2);

                    const mvp = mat4.create();
                    mat4.multiply(mvp, projection, view);
                    mat4.multiply(mvp, mvp, model);

                    const finalT = toCSSViewport.multiply(new DOMMatrix(Array.from(mvp))).multiply(toGLModel);
                    const syncT = canvas.getElementTransform(p.domEl, finalT);
                    if (syncT) p.domEl.style.transform = syncT.toString();
                    
                    // Ensure they are visible and hitting properly
                    p.domEl.style.visibility = 'visible';
                    p.domEl.style.pointerEvents = 'auto';
                    p.domEl.style.zIndex = Math.round(p.z * 100) + 1000;
                } catch (e) {
                    // Fail silently: wait for paint record to become available
                }
            }
        }

        requestAnimationFrame(render);
    }

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    });
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(render);

    let spawnTimeouts = [];
    const pEngine = {
        spawn: () => {
            spawnTimeouts.forEach(clearTimeout);
            spawnTimeouts = [];
            
            elements.forEach(e => {
                e.active = false;
                e.domEl.style.visibility = 'hidden';
                e.domEl.style.pointerEvents = 'none';
            });

            elements.forEach((e, i) => {
                spawnTimeouts.push(setTimeout(() => e.reset(), i * 1500)); // 1500ms gap for smooth reading
            });
        },
        add: (domEl) => {
            const pe = new PhysicsElement(domEl);
            elements.push(pe);
            pe.reset();
        }
    };
    
    // Automatically trigger the story sequence 500ms after load
    setTimeout(() => {
        pEngine.spawn();
    }, 500);

    return pEngine;
}
