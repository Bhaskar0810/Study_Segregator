/**
 * graph.js - OSINT / Obsidian style interactive Force-Directed Knowledge Graph
 */
(function() {
    const { ipcRenderer } = require('electron');
    const fs = require('fs');
    const path = require('path');

    let canvas, ctx;
    let width = 0, height = 0;
    let nodes = [];
    let links = [];
    let animationId = null;

    // Camera / Pan & Zoom
    let transform = { x: 0, y: 0, scale: 1 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let draggedNode = null;
    let hoveredNode = null;

    // Tooltip DOM element
    let tooltipEl = null;

    function initGraphCanvas() {
        canvas = document.getElementById('graph-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        tooltipEl = document.getElementById('graph-tooltip');

        resize();
        window.addEventListener('resize', resize);
        setupInteraction();
    }

    function resize() {
        if (!canvas || !canvas.parentElement) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        width = canvas.width = rect.width;
        height = canvas.height = rect.height;
        if (transform.x === 0 && transform.y === 0) {
            transform.x = width / 2;
            transform.y = height / 2;
        }
    }

    // Build Graph Data from directory structure
    window.renderKnowledgeGraph = function(categoryName, categoryDirPath) {
        if (!canvas) initGraphCanvas();
        resize();

        nodes = [];
        links = [];

        if (!categoryName || !categoryDirPath || !fs.existsSync(categoryDirPath)) {
            return;
        }

        // Center Root Subject Node
        const rootNode = {
            id: 'root',
            name: categoryName,
            type: 'subject',
            fullPath: categoryDirPath,
            radius: 26,
            color: '#818cf8',
            glowColor: 'rgba(99, 102, 241, 0.4)',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            fixed: true
        };
        nodes.push(rootNode);

        // Recursive scanner to build tree nodes & edges
        function scanDir(dirPath, parentNode, depth = 1) {
            if (depth > 4) return; // safety limit
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                entries.forEach((ent, idx) => {
                    const full = path.join(dirPath, ent.name);
                    const isDir = ent.isDirectory();
                    let stat = null;
                    try { stat = fs.statSync(full); } catch(e) {}

                    const ext = isDir ? '' : path.extname(ent.name).toLowerCase();
                    const theme = getNodeTheme(isDir, ext);

                    // Spread initial positions around parent
                    const angle = (idx / Math.max(entries.length, 1)) * Math.PI * 2 + (Math.random() - 0.5);
                    const dist = isDir ? (80 + depth * 35) : (50 + Math.random() * 40);

                    const node = {
                        id: full,
                        name: ent.name,
                        type: isDir ? 'folder' : 'file',
                        fullPath: full,
                        ext: ext,
                        size: stat ? stat.size : 0,
                        mtime: stat ? stat.mtime : new Date(),
                        subItemCount: isDir ? (fs.readdirSync(full).length || 0) : 0,
                        radius: isDir ? 18 : 11,
                        color: theme.color,
                        glowColor: theme.glow,
                        x: parentNode.x + Math.cos(angle) * dist,
                        y: parentNode.y + Math.sin(angle) * dist,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2
                    };

                    nodes.push(node);
                    links.push({
                        source: parentNode,
                        target: node,
                        length: isDir ? 100 : 70,
                        strength: isDir ? 0.08 : 0.05
                    });

                    if (isDir) {
                        scanDir(full, node, depth + 1);
                    }
                });
            } catch (err) {
                console.error('Graph scan error:', err);
            }
        }

        scanDir(categoryDirPath, rootNode, 1);

        // Center view on root
        resetCamera();

        if (!animationId) {
            animate();
        }
    };

    function getNodeTheme(isDir, ext) {
        if (isDir) {
            return { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)' };
        }
        switch (ext) {
            case '.pdf':
                return { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.45)' };
            case '.doc':
            case '.docx':
            case '.txt':
                return { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.45)' };
            case '.ppt':
            case '.pptx':
                return { color: '#f97316', glow: 'rgba(249, 115, 22, 0.45)' };
            case '.py':
            case '.js':
            case '.java':
            case '.cpp':
            case '.c':
            case '.html':
            case '.css':
                return { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.45)' };
            case '.zip':
            case '.rar':
            case '.7z':
                return { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)' };
            case '.xls':
            case '.xlsx':
            case '.csv':
                return { color: '#10b981', glow: 'rgba(16, 185, 129, 0.45)' };
            case '.png':
            case '.jpg':
            case '.jpeg':
                return { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.45)' };
            default:
                return { color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.35)' };
        }
    }

    // Force-Directed Physics Simulation
    function updatePhysics() {
        const repulsionK = 2200;
        const damping = 0.86;
        const centerGravity = 0.005;

        // 1. Repulsion between all nodes (Coulomb)
        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < nodes.length; j++) {
                const b = nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distSq = dx * dx + dy * dy || 1;
                const dist = Math.sqrt(distSq);

                if (dist < 320) {
                    const force = repulsionK / distSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    if (!a.fixed && a !== draggedNode) {
                        a.vx -= fx;
                        a.vy -= fy;
                    }
                    if (!b.fixed && b !== draggedNode) {
                        b.vx += fx;
                        b.vy += fy;
                    }
                }
            }

            // Gravity towards center
            if (!a.fixed && a !== draggedNode) {
                a.vx -= a.x * centerGravity;
                a.vy -= a.y * centerGravity;
            }
        }

        // 2. Spring Attraction along Links (Hooke)
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const a = link.source;
            const b = link.target;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const displacement = dist - link.length;
            const force = displacement * link.strength;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (!a.fixed && a !== draggedNode) {
                a.vx += fx;
                a.vy += fy;
            }
            if (!b.fixed && b !== draggedNode) {
                b.vx -= fx;
                b.vy -= fy;
            }
        }

        // 3. Integrate Velocity & Apply Damping
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.fixed || n === draggedNode) continue;
            n.vx *= damping;
            n.vy *= damping;
            n.x += n.vx;
            n.y += n.vy;
        }
    }

    // Render Canvas
    function draw() {
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);

        // Draw Links / Glowing Edges
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const isHighlight = (hoveredNode && (link.source === hoveredNode || link.target === hoveredNode));

            ctx.beginPath();
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
            ctx.strokeStyle = isHighlight ? 'rgba(99, 102, 241, 0.85)' : 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = isHighlight ? 2 : 1;
            ctx.stroke();

            // Subtle animated data particle pulse along link
            if (isHighlight || i % 3 === 0) {
                const time = (Date.now() * 0.001 + i) % 1;
                const px = link.source.x + (link.target.x - link.source.x) * time;
                const py = link.source.y + (link.target.y - link.source.y) * time;
                ctx.beginPath();
                ctx.arc(px, py, isHighlight ? 2.5 : 1.5, 0, Math.PI * 2);
                ctx.fillStyle = isHighlight ? '#818cf8' : 'rgba(255, 255, 255, 0.4)';
                ctx.fill();
            }
        }

        // Draw Nodes
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const isHovered = (n === hoveredNode);

            // Outer Neon Glow Halo
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * (isHovered ? 1.7 : 1.3), 0, Math.PI * 2);
            ctx.fillStyle = n.glowColor;
            ctx.fill();

            // Core Solid Circle
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();

            // Border ring
            ctx.lineWidth = isHovered ? 2.5 : 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // Center Symbol / Icon
            ctx.fillStyle = '#ffffff';
            ctx.font = `${Math.round(n.radius * 0.9)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (n.type === 'subject') {
                ctx.fillText('⚡', n.x, n.y);
            } else if (n.type === 'folder') {
                ctx.fillText('📁', n.x, n.y);
            }

            // Node Label
            ctx.font = `${isHovered ? '600 12px' : '500 10.5px'} 'Plus Jakarta Sans', sans-serif`;
            ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(241, 245, 249, 0.85)';
            ctx.textAlign = 'center';
            ctx.fillText(n.name, n.x, n.y + n.radius + 13);
        }

        ctx.restore();
    }

    function animate() {
        updatePhysics();
        draw();
        animationId = requestAnimationFrame(animate);
    }

    // Coordinate Conversion
    function screenToWorld(sx, sy) {
        return {
            x: (sx - transform.x) / transform.scale,
            y: (sy - transform.y) / transform.scale
        };
    }

    function findNodeAt(x, y) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            const dx = n.x - x;
            const dy = n.y - y;
            if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
                return n;
            }
        }
        return null;
    }

    function setupInteraction() {
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const world = screenToWorld(mouseX, mouseY);
            const hit = findNodeAt(world.x, world.y);

            if (hit) {
                draggedNode = hit;
            } else {
                isPanning = true;
                panStart.x = mouseX - transform.x;
                panStart.y = mouseY - transform.y;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (draggedNode) {
                const world = screenToWorld(mouseX, mouseY);
                draggedNode.x = world.x;
                draggedNode.y = world.y;
                draggedNode.vx = 0;
                draggedNode.vy = 0;
            } else if (isPanning) {
                transform.x = mouseX - panStart.x;
                transform.y = mouseY - panStart.y;
            } else {
                // Hover Detection
                const world = screenToWorld(mouseX, mouseY);
                const hit = findNodeAt(world.x, world.y);
                if (hit !== hoveredNode) {
                    hoveredNode = hit;
                    updateTooltip(hit, e.clientX, e.clientY);
                } else if (hit) {
                    updateTooltipPosition(e.clientX, e.clientY);
                }
            }
        });

        window.addEventListener('mouseup', () => {
            draggedNode = null;
            isPanning = false;
        });

        // Zoom with mouse wheel
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldBefore = screenToWorld(mouseX, mouseY);
            transform.scale = Math.min(Math.max(0.25, transform.scale * zoomFactor), 3.5);
            transform.x = mouseX - worldBefore.x * transform.scale;
            transform.y = mouseY - worldBefore.y * transform.scale;
        }, { passive: false });

        // Double click to open file or navigate to folder
        canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            const hit = findNodeAt(world.x, world.y);

            if (hit) {
                if (hit.type === 'file') {
                    ipcRenderer.invoke('shell:openPath', hit.fullPath);
                } else if (hit.type === 'folder') {
                    if (window.onGraphNavigateFolder) {
                        window.onGraphNavigateFolder(hit.fullPath);
                    }
                }
            }
        });

        // Setup Zoom Controls
        const zoomInBtn = document.getElementById('graph-zoom-in');
        const zoomOutBtn = document.getElementById('graph-zoom-out');
        const resetBtn = document.getElementById('graph-reset-view');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                transform.scale = Math.min(3.5, transform.scale * 1.25);
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                transform.scale = Math.max(0.25, transform.scale * 0.8);
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', resetCamera);
        }
    }

    function resetCamera() {
        transform.scale = 1;
        transform.x = width / 2;
        transform.y = height / 2;
    }

    function updateTooltip(node, screenX, screenY) {
        if (!tooltipEl) return;
        if (!node) {
            tooltipEl.classList.add('hidden');
            return;
        }

        const icon = node.type === 'subject' ? '⚡' : (node.type === 'folder' ? '📁' : '📄');
        let metaHtml = '';
        if (node.type === 'folder' || node.type === 'subject') {
            metaHtml = `<span>${node.subItemCount} items</span>`;
        } else {
            metaHtml = `<span>${formatBytes(node.size)}</span> • <span>${node.ext.toUpperCase()}</span>`;
        }

        tooltipEl.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-icon">${icon}</span>
                <span class="tooltip-title">${escapeHtml(node.name)}</span>
            </div>
            <div class="tooltip-meta">${metaHtml}</div>
            <div class="tooltip-hint">Double click to ${node.type === 'file' ? 'open file' : 'open folder'}</div>
        `;

        updateTooltipPosition(screenX, screenY);
        tooltipEl.classList.remove('hidden');
    }

    function updateTooltipPosition(screenX, screenY) {
        if (!tooltipEl) return;
        tooltipEl.style.left = `${screenX + 16}px`;
        tooltipEl.style.top = `${screenY + 16}px`;
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
