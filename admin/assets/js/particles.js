// particles.js - 独立的粒子世界地图模块
// 在 index.html 的 </body> 前添加: <script type="module" src="particles.js"></script>

import { state } from "./state.js";
import { clampOffsetX, clampOffsetY } from "./uni-canvas.js";

(function() {
    'use strict';
    
    // 创建粒子 canvas 并插入到最底层
    const particleCanvas = document.createElement('canvas');
    particleCanvas.id = 'particleCanvas';
    particleCanvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        background: #1E1C16;
        pointer-events: none;
        transform-origin: 0 0;
    `;
    document.body.insertBefore(particleCanvas, document.body.firstChild);
    
    const ctx = particleCanvas.getContext('2d');
    
    let particles = [];
    let cachedGeoJSON = null;
    let particlesInitialized = false;
    
    // 鼠标交互状态（全局监听）
    let mouse = { 
        x: null, 
        y: null, 
        radius1: 5,
        radius2: 50,
        radius3: 250
    };

    let currentParticleScale = 1;
    let currentParticleOffsetX = 0;
    let currentParticleOffsetY = 0;
    
    // ============ Canvas 设置 ============
    function resizeCanvas() {
        particleCanvas.width = window.innerWidth;
        particleCanvas.height = window.innerHeight;
        if (particleCanvas.width > 0 && particleCanvas.height > 0 && !particlesInitialized) {
            initParticles();
        }
    }
    
    // ============ 粒子类 ============
    class Particle {
        constructor(x, y, opacity) {
            this.baseX = x;
            this.baseY = y;
            this.x = x;
            this.y = y;
            this.size = Math.random() * 1.0 + 0.5;
            this.density = (Math.random() * 3) + 1;
            this.vx = 0;
            this.vy = 0;
            this.friction = 0.80;
            this.ease = 0.01;
            this.opacity = opacity;
            this.driftAngle = Math.random() * Math.PI * 2;
            this.driftSpeed = Math.random() * 0.3 + 0.1;
            this.driftRadius = Math.random() * 2 + 1;
            this.time = Math.random() * 100;
        }
        
        draw() {
            // 使用沙丘主题色 #665539，降低不透明度以融入背景
            ctx.fillStyle = `rgba(102, 85, 57, ${this.opacity * 0.6})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        }
        
        update() {
            this.time += 0.02;
            
            // 空闲漂浮动画
            const idleDriftX = Math.cos(this.time * this.driftSpeed + this.driftAngle) * this.driftRadius;
            const idleDriftY = Math.sin(this.time * this.driftSpeed + this.driftAngle) * this.driftRadius;
            
            if (mouse.x !== null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                let force = 0;
                
                const r1 = mouse.radius1;
                const r2 = mouse.radius2;
                const r3 = mouse.radius3;

                // 0..1：中心强，边缘弱，并在 r3 处平滑到 0
                const t = 1 - smoothstep(r3 * 0.75, r3, distance); // 0.75 这段就是“羽化宽度”，越小越软

                if (t > 0) {
                const gradient1 = Math.exp(-Math.pow(distance / r1, 2) * 2.5) * 4.0;
                const gradient2 = Math.exp(-Math.pow(distance / r2, 2) * 1.8) * 2.0;
                const gradient3 = Math.exp(-Math.pow(distance / r3, 2) * 1.2) * 0.8;

                force = (gradient1 + gradient2 + gradient3) * t; // 关键：整体乘羽化系数
                force *= 0.4;

                const turbulence = Math.sin(this.time * 0.3 + distance * 0.05) * 0.3;
                force *= (0.7 + turbulence);

                // swirl 也做羽化，避免在 r2 上出现一圈硬边
                const swirlT = 1 - smoothstep(r2 * 0.6, r2, distance);
                if (swirlT > 0) {
                    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
                    const swirl = Math.sin(distance * 0.02 + this.time * 0.5) * 0.2;
                    this.vx += Math.cos(perpAngle) * force * swirl * swirlT;
                    this.vy += Math.sin(perpAngle) * force * swirl * swirlT;
                }
                }

                if (force > 0) {
                const angle = Math.atan2(dy, dx);
                this.vx -= Math.cos(angle) * force * this.density;
                this.vy -= Math.sin(angle) * force * this.density;
                }
                                
                
            }
            
            const targetX = this.baseX + idleDriftX;
            const targetY = this.baseY + idleDriftY;
            const dxToBase = targetX - this.x;
            const dyToBase = targetY - this.y;
            
            this.vx += dxToBase * this.ease;
            this.vy += dyToBase * this.ease;
            
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.x += this.vx;
            this.y += this.vy;
            
            this.draw();
        }
    }
    
    // ============ 加载世界地图数据 ============
    async function loadWorldMap() {
        if (cachedGeoJSON) return cachedGeoJSON;
        
        try {
            const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json');
            const topology = await response.json();
            
            const land = topology.objects.land;
            const transform = topology.transform;
            
            const arcs = topology.arcs.map(arc => {
                let x = 0, y = 0;
                return arc.map(([dx, dy]) => {
                    x += dx;
                    y += dy;
                    return [
                        x * transform.scale[0] + transform.translate[0],
                        y * transform.scale[1] + transform.translate[1]
                    ];
                });
            });
            
            const polygons = [];
            land.geometries.forEach(geom => {
                if (geom.type === 'Polygon') {
                    polygons.push(geom.arcs.map(arcIndexes => 
                        arcIndexes.map(i => i < 0 ? arcs[~i].slice().reverse() : arcs[i]).flat()
                    ));
                } else if (geom.type === 'MultiPolygon') {
                    geom.arcs.forEach(polygon => {
                        polygons.push(polygon.map(arcIndexes =>
                            arcIndexes.map(i => i < 0 ? arcs[~i].slice().reverse() : arcs[i]).flat()
                        ));
                    });
                }
            });
            
            cachedGeoJSON = polygons;
            return polygons;
        } catch (error) {
            console.error('Failed to load world map:', error);
            return null;
        }
    }
    
    // ============ 地图投影 ============
    function project(lon, lat, width, height) {
        const minLat = -60;
        const maxLat = 80;
        const latRange = maxLat - minLat;
        
        const x = (lon + 180) * (width / 360);
        const y = (maxLat - lat) * (height / latRange);
        return [x, y];
    }
    
    // ============ 绘制地图到临时 Canvas ============
    function drawWorldMapFromGeoJSON(tempCtx, polygons, width, height) {
        tempCtx.clearRect(0, 0, width, height);
        tempCtx.fillStyle = 'white';
        
        polygons.forEach(polygon => {
            polygon.forEach(ring => {
                tempCtx.beginPath();
                ring.forEach(([lon, lat], i) => {
                    const [x, y] = project(lon, lat, width, height);
                    if (i === 0) {
                        tempCtx.moveTo(x, y);
                    } else {
                        tempCtx.lineTo(x, y);
                    }
                });
                tempCtx.closePath();
                tempCtx.fill();
            });
        });
    }
    
    // ============ 计算边缘距离 ============
    function getEdgeDistance(pixels, width, height, x, y, checkRadius) {
        const centerIndex = (y * width + x) * 4;
        const centerAlpha = pixels[centerIndex + 3];
        
        if (centerAlpha < 128) return 0;
        
        let minDistance = checkRadius;
        
        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
            for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const checkX = x + dx;
                const checkY = y + dy;
                
                if (checkX < 0 || checkX >= width || checkY < 0 || checkY >= height) {
                    continue;
                }
                
                const checkIndex = (checkY * width + checkX) * 4;
                const checkAlpha = pixels[checkIndex + 3];
                
                if (checkAlpha < 128) {
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    minDistance = Math.min(minDistance, distance);
                }
            }
        }
        
        return minDistance;
    }
    
    // ============ 初始化粒子 ============
    async function initParticles() {
        particles = [];
        
        if (particleCanvas.width === 0 || particleCanvas.height === 0) {
            return;
        }
        
        try {
            const polygons = await loadWorldMap();
            
            if (!polygons) {
                console.error('Failed to load map data');
                return;
            }
            
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = particleCanvas.width;
            tempCanvas.height = particleCanvas.height;
            
            drawWorldMapFromGeoJSON(tempCtx, polygons, tempCanvas.width, tempCanvas.height);
            
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const pixels = imageData.data;
            
            const coreGap = 8;
            const maxEdgeGap = 20;
            const fadeWidth = 75;
            
            for (let y = 0; y < tempCanvas.height; y += coreGap) {
                for (let x = 0; x < tempCanvas.width; x += coreGap) {
                    const index = (y * tempCanvas.width + x) * 4;
                    const alpha = pixels[index + 3];
                    
                    if (alpha > 128) {
                        const edgeDistance = getEdgeDistance(pixels, tempCanvas.width, tempCanvas.height, x, y, fadeWidth);
                        
                        const distanceRatio = Math.min(edgeDistance / fadeWidth, 1);
                        const dynamicGap = coreGap + (maxEdgeGap - coreGap) * (1 - distanceRatio);
                        
                        const skipProbability = 1 - (coreGap / dynamicGap);
                        
                        if (Math.random() > skipProbability) {
                            const opacity = alpha / 255;
                            particles.push(new Particle(x, y, opacity));
                        }
                    }
                }
            }
            
            particlesInitialized = true;
            console.log(`✓ Particle world map initialized: ${particles.length} particles`);
        } catch (error) {
            console.error('Error initializing particles:', error);
        }
    }
    
    // ============ 动画循环 ============
    let lastTime = 0;
    const fps = 60;
    const frameInterval = 1000 / fps;
    
    function syncParticleTransform() {
        const worldScale = state.currentScale;
        const particleScale = 1 + (worldScale - 1) * 0.15;
        const offsetX = clampOffsetX(state.panX);
        const offsetY = clampOffsetY(state.panY);

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const worldX = (centerX - offsetX) / worldScale;
        const worldY = (centerY - offsetY) / worldScale;
        const particleOffsetX = centerX - worldX * particleScale;
        const particleOffsetY = centerY - worldY * particleScale;

        currentParticleScale = particleScale;
        currentParticleOffsetX = particleOffsetX;
        currentParticleOffsetY = particleOffsetY;

        particleCanvas.style.transform = `translate(${particleOffsetX}px, ${particleOffsetY}px) scale(${particleScale})`;
    }

    function animate(currentTime) {
        const deltaTime = currentTime - lastTime;

        if (deltaTime >= frameInterval) {
            syncParticleTransform();
            // 清空画布，使用沙丘背景色
            ctx.fillStyle = '#1E1C16';
            ctx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
            
            if (particlesInitialized) {
                for (let i = 0; i < particles.length; i++) {
                    particles[i].update();
                }
            }
            
            lastTime = currentTime - (deltaTime % frameInterval);
        }
        
        requestAnimationFrame(animate);
    }
    
    // ============ 全局鼠标事件监听 ============
    document.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX - currentParticleOffsetX) / currentParticleScale;
        mouse.y = (e.clientY - currentParticleOffsetY) / currentParticleScale;
    });
    
    document.addEventListener('mouseleave', () => {
        mouse.x = null;
        mouse.y = null;
    });
    
    // 触摸支持
    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        mouse.x = (touch.clientX - currentParticleOffsetX) / currentParticleScale;
        mouse.y = (touch.clientY - currentParticleOffsetY) / currentParticleScale;
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        mouse.x = null;
        mouse.y = null;
    });
    
    // ============ 初始化 ============
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    requestAnimationFrame(animate);
    
    console.log('✓ Particle world map module loaded');
})();


function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
