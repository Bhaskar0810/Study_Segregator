/**
 * stars.js - Ultra-vibrant 60fps Starry Sky Engine with Cosmic Nebulae & Constellations
 */
(function() {
    const canvas = document.getElementById('stars-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let stars = [];
    let shootingStars = [];
    let nebulaTime = 0;

    const STAR_COUNT = 240;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initStars();
    }

    function initStars() {
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            const isBright = Math.random() < 0.18; // 18% bright prominent stars
            const radius = isBright ? (Math.random() * 1.8 + 1.6) : (Math.random() * 1.2 + 0.6);
            
            // Palette: Diamond White, Electric Cyan, Nebula Violet, Celestial Gold
            const colorRoll = Math.random();
            let color = '#ffffff';
            let glow = 'rgba(255, 255, 255, 0.8)';
            if (colorRoll < 0.3) {
                color = '#7dd3fc';
                glow = 'rgba(125, 211, 252, 0.8)';
            } else if (colorRoll < 0.55) {
                color = '#c084fc';
                glow = 'rgba(192, 132, 252, 0.8)';
            } else if (colorRoll < 0.7) {
                color = '#fde047';
                glow = 'rgba(253, 224, 71, 0.8)';
            }

            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: radius,
                baseAlpha: isBright ? (Math.random() * 0.4 + 0.6) : (Math.random() * 0.4 + 0.3),
                twinkleSpeed: Math.random() * 0.03 + 0.01,
                twinklePhase: Math.random() * Math.PI * 2,
                vx: (Math.random() - 0.5) * 0.08,
                vy: (Math.random() - 0.5) * 0.08,
                isBright: isBright,
                color: color,
                glow: glow
            });
        }
    }

    function spawnShootingStar() {
        // One every 6-8 seconds on average
        if (shootingStars.length < 2 && Math.random() < 0.012) {
            shootingStars.push({
                x: Math.random() * width * 0.85,
                y: Math.random() * height * 0.5,
                len: Math.random() * 120 + 80,
                speed: Math.random() * 10 + 9,
                angle: Math.PI / 4 + (Math.random() - 0.5) * 0.25,
                opacity: 1,
                decay: Math.random() * 0.018 + 0.012,
                color: Math.random() > 0.5 ? '#93c5fd' : '#c084fc'
            });
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        nebulaTime += 0.002;

        // 1. Deep Space Cosmic Background
        const spaceGrad = ctx.createLinearGradient(0, 0, width, height);
        spaceGrad.addColorStop(0, '#060710');
        spaceGrad.addColorStop(0.5, '#090b16');
        spaceGrad.addColorStop(1, '#05060b');
        ctx.fillStyle = spaceGrad;
        ctx.fillRect(0, 0, width, height);

        // 2. Glowing Nebula Dust Clouds
        // Top Right Indigo Nebula
        const neb1 = ctx.createRadialGradient(
            width * 0.8 + Math.sin(nebulaTime) * 30, height * 0.25 + Math.cos(nebulaTime) * 20, 20,
            width * 0.8, height * 0.25, width * 0.5
        );
        neb1.addColorStop(0, 'rgba(99, 102, 241, 0.22)');
        neb1.addColorStop(0.4, 'rgba(99, 102, 241, 0.08)');
        neb1.addColorStop(1, 'transparent');
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, width, height);

        // Center-Left Purple Nebula
        const neb2 = ctx.createRadialGradient(
            width * 0.25 - Math.cos(nebulaTime) * 20, height * 0.65 + Math.sin(nebulaTime) * 25, 20,
            width * 0.25, height * 0.65, width * 0.45
        );
        neb2.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
        neb2.addColorStop(0.5, 'rgba(168, 85, 247, 0.06)');
        neb2.addColorStop(1, 'transparent');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, width, height);

        // Bottom-Right Cyan Dust
        const neb3 = ctx.createRadialGradient(
            width * 0.7, height * 0.85, 10,
            width * 0.7, height * 0.85, 380
        );
        neb3.addColorStop(0, 'rgba(6, 182, 212, 0.14)');
        neb3.addColorStop(0.6, 'rgba(6, 182, 212, 0.04)');
        neb3.addColorStop(1, 'transparent');
        ctx.fillStyle = neb3;
        ctx.fillRect(0, 0, width, height);

        // 3. Faint Constellation Lines (connects bright stars)
        for (let i = 0; i < stars.length; i++) {
            const a = stars[i];
            if (!a.isBright) continue;
            for (let j = i + 1; j < stars.length; j++) {
                const b = stars[j];
                if (!b.isBright) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 130 * 130) {
                    const alpha = (1 - Math.sqrt(distSq) / 130) * 0.16;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(165, 180, 252, ${alpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        // 4. Draw Stars
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            s.twinklePhase += s.twinkleSpeed;
            const alpha = Math.min(1, Math.max(0.2, s.baseAlpha + Math.sin(s.twinklePhase) * 0.35));

            s.x += s.vx;
            s.y += s.vy;
            if (s.x < 0) s.x = width;
            if (s.x > width) s.x = 0;
            if (s.y < 0) s.y = height;
            if (s.y > height) s.y = 0;

            // Halo glow for bright stars
            if (s.isBright) {
                const haloGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius * 4.5);
                haloGrad.addColorStop(0, s.glow.replace('0.8)', `${alpha * 0.7})`));
                haloGrad.addColorStop(0.4, s.glow.replace('0.8)', `${alpha * 0.25})`));
                haloGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = haloGrad;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.radius * 4.5, 0, Math.PI * 2);
                ctx.fill();

                // 4-point cross flare
                const flareLen = s.radius * 3.5;
                ctx.beginPath();
                ctx.moveTo(s.x - flareLen, s.y);
                ctx.lineTo(s.x + flareLen, s.y);
                ctx.moveTo(s.x, s.y - flareLen);
                ctx.lineTo(s.x, s.y + flareLen);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
                ctx.lineWidth = 0.9;
                ctx.stroke();
            }

            // Star Diamond Core
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 5. Shooting Stars / Comets
        spawnShootingStar();
        for (let i = shootingStars.length - 1; i >= 0; i--) {
            const ss = shootingStars[i];
            const endX = ss.x + Math.cos(ss.angle) * ss.len;
            const endY = ss.y + Math.sin(ss.angle) * ss.len;

            const cometGrad = ctx.createLinearGradient(ss.x, ss.y, endX, endY);
            cometGrad.addColorStop(0, `rgba(255, 255, 255, ${ss.opacity})`);
            cometGrad.addColorStop(0.2, ss.color.replace(')', `, ${ss.opacity * 0.9})`).replace('#93c5fd', 'rgba(147, 197, 253, 0.9)').replace('#c084fc', 'rgba(192, 132, 252, 0.9)'));
            cometGrad.addColorStop(1, 'transparent');

            ctx.beginPath();
            ctx.moveTo(ss.x, ss.y);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = cometGrad;
            ctx.lineWidth = 2.2;
            ctx.stroke();

            // Comet Head Bright Glow
            ctx.beginPath();
            ctx.arc(ss.x, ss.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${ss.opacity})`;
            ctx.shadowColor = '#93c5fd';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            ss.x += Math.cos(ss.angle) * ss.speed;
            ss.y += Math.sin(ss.angle) * ss.speed;
            ss.opacity -= ss.decay;

            if (ss.opacity <= 0 || ss.x > width || ss.y > height) {
                shootingStars.splice(i, 1);
            }
        }

        requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    resize();
    draw();
})();
