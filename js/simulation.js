import { Profiler } from './Profiler.js';

import { Algae, Grass } from "./WorldEntity.js";
import { Fox } from "./Entity/Fox.js";
import { Rabbit } from "./Entity/Rabbit.js";
import { Fish } from "./Entity/Fish.js";


export class WorldSimulation {
    constructor(worldMap) {
        if (!worldMap) throw new Error('World map is required');
        this.map = worldMap;
        this.cols = worldMap.length;
        this.rows = worldMap[0].length;
        this.entities = {
            algae: [],
            grass: [],
            fish: [],
            rabbits: [],
            foxes: []
        };
        this.time = 0;
        this.ready = false;
        this.isSimulationRunning = false;

        this.spatialMap = new Map(); // key: "x,y" → { rabbits: [], fish: [], foxes: [] }


        // Worker (многоядерность процессора)
        this.workers = [];
        this.WORKER_COUNT = navigator.hardwareConcurrency || 4; // Используем все ядра
        
        // Создаём пул воркеров
        for (let i = 0; i < this.WORKER_COUNT; i++) {
            const worker = new Worker('fox-worker.js');
            this.workers.push(worker);
        }
        
        this.pendingWorkers = 0;
        this.results = [];
        //console.log(this.WORKER_COUNT)
    }

    async init() {
        await this.spawnInitialEntities();
        this.ready = true;
    }

    async reset() {
        this.entities = { algae: [], grass: [], fish: [], rabbits: [], foxes: [] };
        this.time = 0;
        this.ready = false;
        this.isSimulationRunning = false;
        
        // Очищаем информационный дисплей
        if (window.foxInfoDisplay) {
            window.foxInfoDisplay.foxes.clear();
            window.foxInfoDisplay.draw();
        }
    }

    async spawnInitialEntities() {
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                if (this.isWater(x, y) && Math.random() < 0.1) {
                    this.entities.algae.push(new Algae(x, y, this));
                } else if (!this.isWater(x, y) && !this.isMountain(x, y) && Math.random() < 0.2) {
                    this.entities.grass.push(new Grass(x, y, this));
                }
            }
        }

        //await Promise.all(Array(20).fill().map(() => this.spawnFish()));
        //await Promise.all(Array(10).fill().map(() => this.spawnRabbit()));
        await Promise.all(Array(10).fill().map(() => this.spawnFox()));

        console.log(`Spawning at ${this.cols}x${this.rows} world`);
    }

    spawnFish() {
        const [x, y] = this.findWaterTile();
        if (x !== -1) {
            const fish = new Fish(x, y, this);
            this.entities.fish.push(fish);
            this.updateSpatialEntity(fish);
        }
        
    }

    spawnRabbit() {
        for (let attempts = 0; attempts < 100; attempts++) {
            const [x, y] = this.findLandTile();
            if (x === -1) return;
            
            if (this.isWater(x, y)) continue;
            
            const occupied = this.entities.rabbits.some(r => r.x === x && r.y === y);
            if (!occupied) {
                const rabbit = new Rabbit(x, y, this);
                this.entities.rabbits.push(rabbit);
                this.updateSpatialEntity(rabbit);
                return;
            }
        }
    }

    spawnFox() {
        for (let attempts = 0; attempts < 100; attempts++) {
            const [x, y] = this.findLandTile();
            if (x === -1) return;
            if (this.isWater(x, y)) continue;
            
            const occupied = this.entities.foxes.some(f => f.x === x && f.y === y);
            if (!occupied) {
                const fox = new Fox(x, y, this);
                this.entities.foxes.push(fox);
                this.updateSpatialEntity(fox);
                return;
            }
        }
    }

    async update() {
        if (!this.ready) return;

        this.time++;

        /*if (this.entities.fish.length === 0 && this.time % 10 === 0) {
            console.log("Respawn fish.")
            for(let i = 0; i < 10; i++) this.spawnFish();
        }

        if (this.entities.rabbits.length === 0 && this.time % 10 === 0) {
            console.log("Respawn rabbits.")
            for(let i = 0; i < 5; i++) this.spawnRabbit();
        }*/

        if (this.entities.foxes.length === 0 && this.time % 10 === 0) {
            console.log("Respawn foxes.")
            for(let i = 0; i < 5; i++) this.spawnFox();
        }

        // Обновляем сущности группами
        // Хищники
        Profiler.start('updateFoxes');
        const foxes = this.entities.foxes;
        for (let i = foxes.length - 1; i >= 0; i--) {
            const fox = foxes[i];
            Profiler.start('updateOneFox')
            try {
                await fox.update();
            } catch (e) {
                console.error(`Fox update error:`, e);
                foxes.splice(i, 1);
            }
            Profiler.end('updateOneFox')
        }
        Profiler.end('updateFoxes');

        // Травоядные
        /*const rabbits = this.entities.rabbits;
        for (let i = rabbits.length - 1; i >= 0; i--) {
            const rabbit = rabbits[i];
            try {
                await rabbit.update();
            } catch (e) {
                console.error(`Rabbit update error:`, e);
                rabbits.splice(i, 1);
            }
        }
        
        //Рыбки
        const fish = this.entities.fish;
        for (let i = fish.length - 1; i >= 0; i--) {
            const oneFish = fish[i];
            try {
                await oneFish.update();
            } catch (e) {
                console.error(`Fish update error:`, e);
                fish.splice(i, 1);
            }
        }*/

        this.updateEntityGroup(this.entities.algae);
        this.updateEntityGroup(this.entities.grass);
        
    }

    updateEntityGroup(entities) {
        for (let i = entities.length - 1; i >= 0; i--) {
            const e = entities[i];
            if (!e || e.x == null || e.y == null || 
                e.x < 0 || e.y < 0 || e.x >= this.cols || e.y >= this.rows) {
                entities.splice(i, 1);
                continue;
            }
            
            e.update();
            
            if (e.health <= 0) {
                if (typeof e.die === 'function') e.die();
                entities.splice(i, 1);
            }
        }
    }

    findWaterTile() {
        const waterTiles = [];
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                if (this.isWater(x, y)) waterTiles.push([x, y]);
            }
        }
        return waterTiles.length > 0 ? 
            waterTiles[Math.floor(Math.random() * waterTiles.length)] : 
            [-1, -1];
    }

    findLandTile() {
        const landTiles = [];
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                if (!this.isWater(x, y) && !this.isMountain(x, y)) landTiles.push([x, y]);
            }
        }
        return landTiles.length > 0 ? 
            landTiles[Math.floor(Math.random() * landTiles.length)] : 
            [-1, -1];
    }

    isWater(x, y) {
        return this.map[x] && this.map[x][y] && [0, 1].includes(this.map[x][y].type);
    }

    isDeepWater(x, y) {
        return this.map[x] && this.map[x][y] && this.map[x][y].type === 0;
    }

    isShallowWater(x, y) {
        return this.map[x] && this.map[x][y] && this.map[x][y].type === 1;
    }

    isMountain(x, y) {
        return this.map[x] && this.map[x][y] && this.map[x][y].type === 5;
    }

    getEntitiesAt(x, y) {
        const cell = this.spatialMap.get(`${x},${y}`);
        if (!cell) {
            return { fish: [], rabbits: [], foxes: [] };
        }
        // Возвращаем копии для безопасности
        return {
            fish: [...cell.fish],
            rabbits: [...cell.rabbits],
            foxes: [...cell.foxes]
        };
    }

    //быстрый метод (без копий)
    getEntitiesAtFast(x, y) {
        return this.spatialMap.get(`${x},${y}`) || { fish: [], rabbits: [], foxes: [] };
    }

    isGrass(x, y) {
        return this.map[x] && this.map[x][y] && this.map[x][y].type === 3;
    }

    isSand(x, y) {
        return this.map[x] && this.map[x][y] && this.map[x][y].type === 2;
    }

    isForest(x, y) {
        return this.map[x] && this.map[x][y] && this.entities.grass.some(g => g.x === x && g.y === y && g.size > 0.7);
    }

    getEntityType(entity) {
        if (entity instanceof Fish) return 'fish';
        if (entity instanceof Rabbit) return 'rabbits';
        if (entity instanceof Fox) return 'foxes';
        return null;
    }

    updateSpatialEntity(entity, oldX = null, oldY = null) {
        const type = this.getEntityType(entity);
        if (!type) return;
        
        // Удаляем со старой позиции
        if (oldX !== null && oldY !== null) {
            const oldKey = `${oldX},${oldY}`;
            if (this.spatialMap.has(oldKey)) {
                const cell = this.spatialMap.get(oldKey);
                const index = cell[type].indexOf(entity);
                if (index !== -1) cell[type].splice(index, 1);
                
                if (cell.fish.length === 0 && cell.rabbits.length === 0 && cell.foxes.length === 0) {
                    this.spatialMap.delete(oldKey);
                }
            }
        }
        
        // Добавляем на новую позицию
        const newKey = `${entity.x},${entity.y}`;
        if (!this.spatialMap.has(newKey)) {
            this.spatialMap.set(newKey, { fish: [], rabbits: [], foxes: [] });
        }
        this.spatialMap.get(newKey)[type].push(entity);
    }

    addToSpatialGrid(entity) {
        const key = `${entity.x},${entity.y}`;
        if (!this.spatialGrid[key]) this.spatialGrid[key] = [];
        this.spatialGrid[key].push(entity);
    }

    async testUpdate() {
        this.time++;
        Profiler.start('spawnFoxes')
        if (this.entities.foxes.length === 0 && this.time % 10 === 0) {
            console.log("Respawn foxes.");
            for(let i = 0; i < 50; i++) this.spawnFox();
        }
        Profiler.end('spawnFoxes')

        Profiler.start('updateFoxes')
        // ПОСЛЕДОВАТЕЛЬНОЕ обновление лис
        const foxes = this.entities.foxes;
        const startSequential = performance.now();

        for (let i = foxes.length - 1; i >= 0; i--) {
            Profiler.start('updateOneFox')
            const fox = foxes[i];
            try {
                await fox.update();
            } catch (e) {
                console.error(`Fox update error:`, e);
                foxes.splice(i, 1);
            }
            Profiler.end('updateOneFox')
        }

        const sequentialTime = performance.now() - startSequential;
        console.log(`🦊 SEQUENTIAL: ${foxes.length} foxes updated in ${sequentialTime.toFixed(2)}ms`);
        Profiler.end('updateFoxes')

        //await new Promise(resolve => setTimeout(resolve, 100)); // Даём время на "остывание"
        //await this.testUpdateParallel(foxes);

        Profiler.start('grass')
        this.updateEntityGroup(this.entities.algae);
        this.updateEntityGroup(this.entities.grass);
        Profiler.end('grass')
    }

    getPopulationCount(animalType) {
        return this.entities[animalType]?.length || 0;
    }

    checkPopulationStatus() {
        // Для лис - финализируем буфер если популяция упала до 0
        const foxPopulation = this.getPopulationCount('foxes');
        if (foxPopulation === 0 && generationBuffer.foxes) {
            console.log('🧠 Finalizing fox brain buffer - population extinct');
            // Можно вызвать финализацию здесь, если нужно
        }
    }

    async testUpdateParallel(type) {
        // ПАРАЛЛЕЛЬНОЕ обновление лис
        const startParallel = performance.now();

        const updatePromises = [];
        for (let i = 0; i < type.length; i++) {
            const fox = type[i];
            updatePromises.push(
                fox.update().catch(e => {
                    console.error(`Fox update error:`, e);
                    // Удаляем лису, если обновление упало
                    const index = this.entities.type.indexOf(fox);
                    if (index !== -1) this.entities.type.splice(index, 1);
                })
            );
        }

        await Promise.all(updatePromises);
        const parallelTime = performance.now() - startParallel;
        console.log(`🦊 PARALLEL: ${type.length} foxes updated in ${parallelTime.toFixed(2)}ms`);

        // Обновляем растения (они не async, можно оставить как есть)
        this.updateEntityGroup(this.entities.algae);
        this.updateEntityGroup(this.entities.grass);
    }
}

