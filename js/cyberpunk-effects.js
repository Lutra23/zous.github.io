/*
 * LUTRA LABS - Cyberpunk Effects
 * 赛博朋克特效脚本
 */

(function() {
    'use strict';

    // ========== 粒子系统 ==========
    const ParticleSystem = {
        particles: [],
        particleCount: 50,

        createParticle() {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                width: 2px;
                height: 2px;
                background: #00f5ff;
                border-radius: 50%;
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 0 10px #00f5ff, 0 0 20px #00f5ff;
                opacity: ${Math.random() * 0.5 + 0.2};
            `;
            document.body.appendChild(particle);
            return {
                element: particle,
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5
            };
        },

        init() {
            for (let i = 0; i < this.particleCount; i++) {
                this.particles.push(this.createParticle());
            }
            this.animate();
        },

        animate() {
            this.particles.forEach(particle => {
                particle.x += particle.vx;
                particle.y += particle.vy;

                // 边界检测
                if (particle.x < 0) particle.x = window.innerWidth;
                if (particle.x > window.innerWidth) particle.x = 0;
                if (particle.y < 0) particle.y = window.innerHeight;
                if (particle.y > window.innerHeight) particle.y = 0;

                particle.element.style.left = particle.x + 'px';
                particle.element.style.top = particle.y + 'px';
            });
            requestAnimationFrame(() => this.animate());
        }
    };

    // ========== 鼠标跟随效果 ==========
    const MouseFollower = {
        cursor: null,
        trail: [],

        init() {
            // 创建主光标
            this.cursor = document.createElement('div');
            this.cursor.className = 'cyber-cursor';
            this.cursor.style.cssText = `
                position: fixed;
                width: 20px;
                height: 20px;
                border: 2px solid #00f5ff;
                border-radius: 50%;
                pointer-events: none;
                z-index: 10000;
                transition: transform 0.1s ease;
                box-shadow: 0 0 20px rgba(0, 245, 255, 0.5);
            `;
            document.body.appendChild(this.cursor);

            // 创建光标轨迹
            for (let i = 0; i < 5; i++) {
                const trailDot = document.createElement('div');
                trailDot.style.cssText = `
                    position: fixed;
                    width: ${15 - i * 2}px;
                    height: ${15 - i * 2}px;
                    background: rgba(255, 0, 255, ${0.5 - i * 0.1});
                    border-radius: 50%;
                    pointer-events: none;
                    z-index: 9999;
                    transition: opacity 0.3s;
                `;
                document.body.appendChild(trailDot);
                this.trail.push({ element: trailDot, x: 0, y: 0 });
            }

            this.bindEvents();
        },

        bindEvents() {
            let mouseX = 0, mouseY = 0;

            document.addEventListener('mousemove', (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;

                // 更新主光标
                this.cursor.style.left = mouseX - 10 + 'px';
                this.cursor.style.top = mouseY - 10 + 'px';

                // 更新轨迹
                this.trail.forEach((dot, index) => {
                    setTimeout(() => {
                        dot.element.style.left = dot.x - (7.5 - index) + 'px';
                        dot.element.style.top = dot.y - (7.5 - index) + 'px';
                    }, index * 20);
                    dot.x = mouseX;
                    dot.y = mouseY;
                });
            });

            // 悬停效果
            document.querySelectorAll('a, button, .Label').forEach(el => {
                el.addEventListener('mouseenter', () => {
                    this.cursor.style.transform = 'scale(1.5)';
                    this.cursor.style.borderColor = '#ff00ff';
                });
                el.addEventListener('mouseleave', () => {
                    this.cursor.style.transform = 'scale(1)';
                    this.cursor.style.borderColor = '#00f5ff';
                });
            });
        }
    };

    // ========== 文字故障效果 ==========
    const TextGlitch = {
        init() {
            const titles = document.querySelectorAll('h1, h2, h3, .post-title');

            titles.forEach(title => {
                title.addEventListener('mouseenter', () => {
                    this.glitch(title);
                });
            });
        },

        glitch(element) {
            const originalText = element.textContent;
            const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            let iterations = 0;

            const interval = setInterval(() => {
                element.textContent = originalText
                    .split('')
                    .map((char, index) => {
                        if (index < iterations) {
                            return originalText[index];
                        }
                        return chars[Math.floor(Math.random() * chars.length)];
                    })
                    .join('');

                if (iterations >= originalText.length) {
                    clearInterval(interval);
                    element.textContent = originalText;
                }

                iterations += 1 / 3;
            }, 30);
        }
    };

    // ========== 卡片倾斜效果 ==========
    const CardTilt = {
        init() {
            const cards = document.querySelectorAll('.post-item');

            cards.forEach(card => {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;

                    const rotateX = (y - centerY) / 10;
                    const rotateY = (centerX - x) / 10;

                    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
                });

                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
                });
            });
        }
    };

    // ========== 数字计数动画 ==========
    const CounterAnimation = {
        init() {
            const counters = document.querySelectorAll('[data-count]');

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.animate(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.5 });

            counters.forEach(counter => observer.observe(counter));
        },

        animate(element) {
            const target = parseInt(element.dataset.count);
            const duration = 2000;
            const start = performance.now();

            const update = (currentTime) => {
                const elapsed = currentTime - start;
                const progress = Math.min(elapsed / duration, 1);

                const easeOut = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(target * easeOut);

                element.textContent = current.toLocaleString();

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    element.textContent = target.toLocaleString();
                }
            };

            requestAnimationFrame(update);
        }
    };

    // ========== 滚动进度条 ==========
    const ScrollProgress = {
        init() {
            const progressBar = document.createElement('div');
            progressBar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                height: 3px;
                background: linear-gradient(90deg, #00f5ff, #ff00ff);
                z-index: 10001;
                transition: width 0.1s;
                box-shadow: 0 0 10px rgba(0, 245, 255, 0.5);
            `;
            document.body.appendChild(progressBar);

            window.addEventListener('scroll', () => {
                const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                const scrolled = (window.scrollY / windowHeight) * 100;
                progressBar.style.width = scrolled + '%';
            });
        }
    };

    // ========== 页面加载动画 ==========
    const PageLoader = {
        init() {
            const loader = document.createElement('div');
            loader.className = 'cyber-loader';
            loader.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #0a0e27, #1a1f3a);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 99999;
                transition: opacity 0.5s, visibility 0.5s;
            `;

            const loaderContent = document.createElement('div');
            loaderContent.innerHTML = `
                <div style="
                    text-align: center;
                    font-family: 'Orbitron', sans-serif;
                ">
                    <h2 style="
                        background: linear-gradient(90deg, #00f5ff, #ff00ff);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-size: 2rem;
                        margin-bottom: 20px;
                    ">LUTRA LABS</h2>
                    <div style="
                        width: 200px;
                        height: 3px;
                        background: rgba(0, 245, 255, 0.2);
                        border-radius: 3px;
                        overflow: hidden;
                    ">
                        <div style="
                            width: 100%;
                            height: 100%;
                            background: linear-gradient(90deg, #00f5ff, #ff00ff);
                            animation: loading 1.5s ease-in-out infinite;
                        "></div>
                    </div>
                    <style>
                        @keyframes loading {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(100%); }
                        }
                    </style>
                </div>
            `;

            loader.appendChild(loaderContent);
            document.body.appendChild(loader);

            window.addEventListener('load', () => {
                setTimeout(() => {
                    loader.style.opacity = '0';
                    loader.style.visibility = 'hidden';
                    setTimeout(() => loader.remove(), 500);
                }, 500);
            });
        }
    };

    // ========== 初始化所有效果 ==========
    document.addEventListener('DOMContentLoaded', () => {
        // 启动粒子系统
        ParticleSystem.init();

        // 启动鼠标跟随（仅在桌面端）
        if (window.innerWidth > 768) {
            MouseFollower.init();
        }

        // 启动文字故障效果
        TextGlitch.init();

        // 启动卡片倾斜效果
        CardTilt.init();

        // 启动数字计数动画
        CounterAnimation.init();

        // 启动滚动进度条
        ScrollProgress.init();

        // 启动页面加载动画
        PageLoader.init();

        console.log('%c⚡ LUTRA LABS - Cyberpunk Theme Loaded ⚡', 'color: #00f5ff; font-size: 16px; font-weight: bold; text-shadow: 0 0 10px #00f5ff;');
    });

})();
