import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class NoiseVisualizer3D {
    constructor(containerId, width = 300, height = 300) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            this.createContainer(containerId, width, height);
        }
        
        this.width = width;
        this.height = height;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.pointsMesh = null;
        this.world = null;
        this.cols = 0;
        this.rows = 0;
        this.visualizationMode = 'biomes'; // 'biomes', 'voronoi', 'elevation', 'moisture'
        
        this.init();
    }
    
    createContainer(id, width, height) {
        const container = document.createElement('div');
        container.id = id;
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.zIndex = '1000';
        container.style.backgroundColor = 'rgba(0,0,0,0.8)';
        container.style.borderRadius = '8px';
        container.style.overflow = 'hidden';
        container.style.border = '1px solid #444';
        container.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
        
        // Добавляем заголовок
        this.title = document.createElement('div');
        this.title.textContent = '🌄 Режим: Биомы';
        this.title.style.position = 'absolute';
        this.title.style.top = '5px';
        this.title.style.left = '10px';
        this.title.style.color = 'white';
        this.title.style.fontSize = '12px';
        this.title.style.fontFamily = 'monospace';
        this.title.style.zIndex = '1001';
        this.title.style.backgroundColor = 'rgba(0,0,0,0.5)';
        this.title.style.padding = '2px 8px';
        this.title.style.borderRadius = '4px';
        container.appendChild(this.title);
        
        // Кнопки управления режимом
        const controlsDiv = document.createElement('div');
        controlsDiv.style.position = 'absolute';
        controlsDiv.style.bottom = '5px';
        controlsDiv.style.right = '5px';
        controlsDiv.style.display = 'flex';
        controlsDiv.style.gap = '5px';
        controlsDiv.style.zIndex = '1001';
        
        const modes = ['biomes', 'voronoi', 'elevation', 'moisture'];
        const modeNames = { biomes: '🌍', voronoi: '🎨', elevation: '⛰️', moisture: '💧' };
        
        modes.forEach(mode => {
            const btn = document.createElement('button');
            btn.textContent = modeNames[mode];
            btn.style.backgroundColor = this.visualizationMode === mode ? '#ff9800' : '#333';
            btn.style.border = 'none';
            btn.style.color = 'white';
            btn.style.width = '32px';
            btn.style.height = '32px';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '16px';
            btn.title = mode === 'biomes' ? 'Биомы' : mode === 'voronoi' ? 'Зоны Вороного' : mode === 'elevation' ? 'Высота' : 'Влажность';
            btn.onclick = () => {
                this.visualizationMode = mode;
                this.updateVisualization();
                controlsDiv.querySelectorAll('button').forEach((b, i) => {
                    b.style.backgroundColor = modes[i] === mode ? '#ff9800' : '#333';
                });
                this.updateTitle(mode);
            };
            controlsDiv.appendChild(btn);
        });
        
        container.appendChild(controlsDiv);
        document.body.appendChild(container);
        this.container = container;
    }
    
    updateTitle(mode) {
        const titles = {
            biomes: '🌍 Режим: Биомы (по типу)',
            voronoi: '🎨 Режим: Зоны Вороного (6 цветов)',
            elevation: '⛰️ Режим: Высота',
            moisture: '💧 Режим: Влажность'
        };
        this.title.textContent = titles[mode];
    }
    
    init() {
        // Canvas для Three.js
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        
        // Сцена
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a2a);
        this.scene.fog = new THREE.FogExp2(0x0a0a2a, 0.008);
        
        // Камера
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        
        // Рендерер
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: false });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Контролы
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.2;
        this.controls.enableZoom = true;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 1.5;
        
        // Освещение
        const ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7);
        this.scene.add(directionalLight);
        
        const backLight = new THREE.DirectionalLight(0x8866ff, 0.4);
        backLight.position.set(-3, 5, -5);
        this.scene.add(backLight);
        
        const fillLight = new THREE.PointLight(0x4466cc, 0.3);
        fillLight.position.set(0, 5, 0);
        this.scene.add(fillLight);
        
        // Анимация
        this.animate();
    }
    
    updateWorld(world, cols, rows, options = {}) {
        this.world = world;
        this.cols = cols;
        this.rows = rows;
        this.options = options;
        
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.pointsMesh) this.scene.remove(this.pointsMesh);
        
        this.updateVisualization();
        
        this.addHelpers();
        
        const centerX = (cols - 1) / 2;
        const centerZ = (rows - 1) / 2;
        const maxDim = Math.max(cols, rows);
        const distance = maxDim * 0.9;
        
        this.camera.position.set(centerX + distance * 0.6, distance * 0.8, centerZ + distance);
        this.controls.target.set(centerX, 0, centerZ);
        this.controls.update();
    }
    
    addHelpers() {
        if (this.gridHelper) this.scene.remove(this.gridHelper);
        if (this.axesHelper) this.scene.remove(this.axesHelper);
        
        const centerX = (this.cols - 1) / 2;
        const centerZ = (this.rows - 1) / 2;
        const maxDim = Math.max(this.cols, this.rows);
        
        this.gridHelper = new THREE.GridHelper(maxDim * 1.5, 20, 0x88aaff, 0x335588);
        this.gridHelper.position.set(centerX, -2, centerZ);
        this.scene.add(this.gridHelper);
        
        this.axesHelper = new THREE.AxesHelper(maxDim * 0.8);
        this.axesHelper.position.set(centerX, 0, centerZ);
        this.axesHelper.material.transparent = true;
        this.axesHelper.material.opacity = 0.25;
        this.scene.add(this.axesHelper);
    }
    
    updateVisualization() {
        if (!this.world) return;
        
        switch (this.visualizationMode) {
            case 'biomes':
                this.createBiomesMesh();
                break;
            case 'voronoi':
                this.createVoronoiMesh();
                break;
            case 'elevation':
                this.createElevationMesh();
                break;
            case 'moisture':
                this.createMoistureMesh();
                break;
        }
    }
    
    // Режим: Биомы (по типу тайла)
    createBiomesMesh() {
        const cols = this.cols;
        const rows = this.rows;
        const world = this.world;
        
        const vertices = [];
        const indices = [];
        const colors = [];
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const tile = world[i][j];
                const height = tile.elevation * 8;
                vertices.push(i, height, j);
                
                let color;
                if (tile.type === 0) { // DEEP_WATER
                    color = new THREE.Color(0x0a3366);
                } else if (tile.type === 1) { // WATER
                    color = new THREE.Color(0x3a86ff);
                } else if (tile.type === 2) { // SAND
                    color = new THREE.Color(0xFFEB3B);
                } else if (tile.type === 3) { // GRASS
                    color = new THREE.Color(0x4CAF50);
                } else if (tile.type === 4) { // FOREST
                    color = new THREE.Color(0x2E7D32);
                } else if (tile.type === 5) { // MOUNTAIN
                    color = new THREE.Color(0x8B5A2B);
                } else {
                    color = new THREE.Color(0xAAAAAA);
                }
                
                colors.push(color.r, color.g, color.b);
            }
        }
        
        this.buildMesh(vertices, indices, colors);
    }
    
    // Режим: Зоны Вороного (яркие цвета для каждой зоны)
    createVoronoiMesh() {
        const cols = this.cols;
        const rows = this.rows;
        const world = this.world;
        
        const vertices = [];
        const indices = [];
        const colors = [];
        
        // Яркие цвета для 6 зон Вороного
        const voronoiColors = [
            new THREE.Color(0xFF3333), // Красный
            new THREE.Color(0x33FF33), // Зелёный
            new THREE.Color(0x33AAFF), // Синий
            new THREE.Color(0xFF33FF), // Розовый
            new THREE.Color(0xFFAA33), // Оранжевый
            new THREE.Color(0x33FFAA)  // Бирюзовый
        ];
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const tile = world[i][j];
                const height = tile.elevation * 8;
                vertices.push(i, height, j);
                
                // Используем zoneId для цвета
                const zoneId = tile.zoneId || 0;
                let color = voronoiColors[zoneId % 6];
                
                // Реки подсвечиваем синим
                if (tile.isRiver) {
                    color = new THREE.Color(0x00AAFF);
                }
                
                colors.push(color.r, color.g, color.b);
            }
        }
        
        this.buildMesh(vertices, indices, colors);
    }
    
    // Режим: Высота (градиент)
    createElevationMesh() {
        const cols = this.cols;
        const rows = this.rows;
        const world = this.world;
        
        const vertices = [];
        const indices = [];
        const colors = [];
        
        let minElev = Infinity;
        let maxElev = -Infinity;
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const elev = world[i][j].elevation;
                if (elev < minElev) minElev = elev;
                if (elev > maxElev) maxElev = elev;
            }
        }
        const range = maxElev - minElev;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const tile = world[i][j];
                const height = tile.elevation * 8;
                vertices.push(i, height, j);
                
                const t = (tile.elevation - minElev) / range;
                // Градиент: синий (вода) -> зелёный -> коричневый -> белый
                let color;
                if (t < 0.2) {
                    color = new THREE.Color(0x1565C0);
                } else if (t < 0.4) {
                    color = new THREE.Color(0x4CAF50);
                } else if (t < 0.7) {
                    color = new THREE.Color(0x8D6E63);
                } else {
                    color = new THREE.Color(0xFFFFFF);
                }
                
                colors.push(color.r, color.g, color.b);
            }
        }
        
        this.buildMesh(vertices, indices, colors);
    }
    
    // Режим: Влажность (градиент от сухого к влажному)
    createMoistureMesh() {
        const cols = this.cols;
        const rows = this.rows;
        const world = this.world;
        
        const vertices = [];
        const indices = [];
        const colors = [];
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const tile = world[i][j];
                const height = tile.elevation * 8;
                vertices.push(i, height, j);
                
                const moisture = tile.moisture || 0.5;
                // Сухо -> коричневый/жёлтый, Влажно -> зелёный, Очень влажно -> синий
                let color;
                if (moisture < 0.3) {
                    color = new THREE.Color(0xCD853F); // коричневый
                } else if (moisture < 0.6) {
                    const t = (moisture - 0.3) / 0.3;
                    color = new THREE.Color(0xCD853F).lerp(new THREE.Color(0x4CAF50), t);
                } else {
                    const t = (moisture - 0.6) / 0.4;
                    color = new THREE.Color(0x4CAF50).lerp(new THREE.Color(0x3a86ff), t);
                }
                
                colors.push(color.r, color.g, color.b);
            }
        }
        
        this.buildMesh(vertices, indices, colors);
    }
    
    buildMesh(vertices, indices, colors) {
        // Создаём индексы для сетки
        const cols = this.cols;
        const rows = this.rows;
        
        for (let i = 0; i < cols - 1; i++) {
            for (let j = 0; j < rows - 1; j++) {
                const idx = i * rows + j;
                const idxRight = (i + 1) * rows + j;
                const idxTop = i * rows + (j + 1);
                const idxTopRight = (i + 1) * rows + (j + 1);
                
                indices.push(idx, idxRight, idxTop);
                indices.push(idxRight, idxTopRight, idxTop);
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(indices);
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: false,
            roughness: 0.4,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        
        if (this.mesh) this.scene.remove(this.mesh);
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        
        // В других режимах скрываем точки
        if (this.pointsMesh) this.pointsMesh.visible = false;
    }
    
    createPointCloud() {
        const cols = this.cols;
        const rows = this.rows;
        const world = this.world;
        
        const points = [];
        const colors = [];
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const elev = world[i][j].elevation;
                const height = elev * 8;
                
                points.push(i, height, j);
                
                const r = Math.min(1, elev * 1.5);
                const g = Math.min(1, elev * 0.8);
                const b = Math.max(0, 1 - elev);
                colors.push(r, g, b);
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        
        const material = new THREE.PointsMaterial({ size: 0.15, vertexColors: true });
        
        if (this.pointsMesh) this.scene.remove(this.pointsMesh);
        this.pointsMesh = new THREE.Points(geometry, material);
        this.scene.add(this.pointsMesh);
        
        if (this.mesh) this.mesh.visible = false;
    }
    
    createWireframe() {
        const cols = this.cols;
        const rows = this.rows;
        const world = this.world;
        
        const vertices = [];
        const indices = [];
        const colors = [];
        
        let minElev = Infinity;
        let maxElev = -Infinity;
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const elev = world[i][j].elevation;
                if (elev < minElev) minElev = elev;
                if (elev > maxElev) maxElev = elev;
            }
        }
        const range = maxElev - minElev;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const elev = world[i][j].elevation;
                const height = elev * 8;
                vertices.push(i, height, j);
                
                const t = (elev - minElev) / range;
                const r = Math.min(1, t * 1.5);
                const g = Math.min(1, t * 0.8);
                const b = Math.max(0, 1 - t);
                colors.push(r, g, b);
            }
        }
        
        for (let i = 0; i < cols - 1; i++) {
            for (let j = 0; j < rows - 1; j++) {
                const idx = i * rows + j;
                const idxRight = (i + 1) * rows + j;
                const idxTop = i * rows + (j + 1);
                const idxTopRight = (i + 1) * rows + (j + 1);
                
                indices.push(idx, idxRight, idxTop);
                indices.push(idxRight, idxTopRight, idxTop);
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(indices);
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        
        const material = new THREE.MeshBasicMaterial({ 
            vertexColors: true, 
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });
        
        if (this.mesh) this.scene.remove(this.mesh);
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        
        if (this.pointsMesh) this.pointsMesh.visible = false;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) {
            this.controls.update();
        }
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    toggle() {
        if (this.container) {
            if (this.container.style.display === 'none') {
                this.show();
            } else {
                this.hide();
            }
        }
    }
}