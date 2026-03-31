    (function() {
        const canvas = document.getElementById('starfield-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let stars = [];
        const STAR_COUNT = 280;
        const SPEED = 0.4;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function initStars() {
            stars = [];
            for (let i = 0; i < STAR_COUNT; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: Math.random() * 1.8 + 0.3,
                    speed: Math.random() * SPEED + 0.1,
                    opacity: Math.random() * 0.7 + 0.2,
                    twinkleSpeed: Math.random() * 0.02 + 0.005,
                    twinklePhase: Math.random() * Math.PI * 2
                });
            }
        }

        let frame = 0;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            frame++;

            for (const s of stars) {
                // Slow drift upward (hyperspace feel)
                s.y -= s.speed;
                if (s.y < -5) {
                    s.y = canvas.height + 5;
                    s.x = Math.random() * canvas.width;
                }

                // Twinkle
                const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinklePhase) * 0.3 + 0.7;
                const alpha = s.opacity * twinkle;
                
                // Red-tinted stars (some white, some reddish)
                const r = 255;
                const g = 200 + Math.floor(Math.random() * 55);
                const b = 200 + Math.floor(Math.random() * 55);
                
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
                ctx.fill();

                // Glow for larger stars
                if (s.size > 1.2) {
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, s.size * 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(180,0,0,${alpha * 0.15})`;
                    ctx.fill();
                }
            }

            requestAnimationFrame(draw);
        }

        resize();
        initStars();
        draw();
        window.addEventListener('resize', () => { resize(); initStars(); });
    })();
