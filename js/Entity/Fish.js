// Fish.js
import { Entity } from "../WorldEntity.js";
import { HexGeometryCache } from '../WorldGeometry.js';
import { NeuralNetwork, DualStreamNeuralNetwork } from "../Neurals/Neural.js";
import { 
    loadBestBrains,
} from '../Neurals/BrainStorage.js';

let fishCounter = 0;

export class Fish extends Entity {
    constructor(x, y, world) {
        super(x, y, world);
        this.id = `fish-${fishCounter++}`;
        this.type = "fish";
        this.health = 100;
        this.energy = 100;
        this.hunger = 100;
        this.age = 0;
        this.visionRange = 2;
        this.lastAction = null;
        this.isDead = false;

        this.visitedCells = new Set([`${x},${y}`]);
        this.memory = [];
        this.memorySize = 100;
        this.learningInterval = 5;
        this.reproductionCooldown = 0;
        this.totalReward = 0;

        this.hexCount = 1 + 3 * this.visionRange * (this.visionRange + 1);
        this.basicInputSize = 7;
        this.visionInputSize = this.hexCount * 4;
        this.totalActions = 8;

        this.cachedAllHexesInVisionRange = []; 
        this.cachedVisibleHexes = [];

        // МЕТРИКИ ОБУЧЕНИЯ
        this.trainingMetrics = {
            tdErrors: [],           // TD ошибки
            qValues: [],           // Q-значения
            explorationRate: 0.4,  // Текущая exploration rate
            successRate: 0,        // Процент успешных действий
            learningProgress: 0,   // Прогресс обучения
            policyMaturity: 0      // Зрелость политики
        };

        this.bestTdError = Infinity;
        this.bestBrainScore = -Infinity;
        
        this.brain = this.loadBrain();

        this.resourceMemory = [];
        this.memoryDecay = 0.99;

        this.logFishInfo();
    }

    static loadBestBrain() {
        const brains = loadBestBrains('fish');
        return brains.length > 0 ? this.createBrainFromData(brains[0]) : null;
    }

    getState() {
        const entities = this.world.getEntitiesAt(this.x, this.y) || { algae: [], fish: [], foxes: [], rabbits };
        
        return [
            this.health / 100,  // Здоровье
            this.energy / 100,  // Энергия
            (100 - this.hunger) / 100,  // Голод
            this.age / 1000,    // Возраст
            entities.algae.length > 0 ? 1 : 0,  // Наличие водорослей
            entities.fish.length > 0 ? 1 : 0, // Друзья
            entities.foxes.length > 0 || entities.rabbits.length > 0 ? 1 : 0  // Опасность
        ];
    }

    getVisionInput() {
        const ALL_HEXES_IN_RANGE = this.getAllHexesInVisionRange();
        const input = new Float32Array(this.visionInputSize);
        
        const visibleHexes = this.getVisibleHexes();
        const visibleHexSet = new Set(visibleHexes.map(h => `${h.x},${h.y}`));
        
        let hexIndex = 0;
        
        for (const hex of ALL_HEXES_IN_RANGE.slice(0, this.hexCount)) {
            const baseIdx = hexIndex * 4;
            const isVisible = visibleHexSet.has(`${hex.x},${hex.y}`);
            
            if (isVisible) {
                const entities = hex.entities || { algae: [] };
                input[baseIdx] = hex.isWater ? 1 : 0;
                input[baseIdx + 1] = entities.algae.length > 0 ? 1 : 0;
                input[baseIdx + 2] = entities.fish.length > 0 ? 1 : 0;
                input[baseIdx + 3] = entities.foxes.length > 0 || entities.rabbits.length > 0 ? 1 : 0;
            } else {
                input[baseIdx] = 0;
                input[baseIdx + 1] = 0;
                input[baseIdx + 2] = 0;
                input[baseIdx + 3] = 0;
            }
            
            hexIndex++;
        }
        
        for (let i = hexIndex; i < this.hexCount; i++) {
            const baseIdx = i * 4;
            input[baseIdx] = 0;
            input[baseIdx + 1] = 0;
            input[baseIdx + 2] = 0;
            input[baseIdx + 3] = 0;
        }
        
        return Array.from(input);
    }

    remember(state, actionIndex, reward, nextState = null) {
        try {
            // Сохраняем РЕАЛЬНЫЕ состояния вместо нулевых массивов
            let safeBasicState = [];
            let safeVisionState = [];
            
            if (state && typeof state === 'object') {
                // Используем реальные данные из state
                safeBasicState = Array.isArray(state.basic) ? [...state.basic] : new Array(this.basicInputSize).fill(0);
                safeVisionState = Array.isArray(state.vision) ? [...state.vision] : new Array(this.visionInputSize).fill(0);
            } else {
                // Если state невалиден, получаем текущее состояние
                const currentState = this.getValidatedState();
                safeBasicState = [...currentState.basic];
                safeVisionState = [...currentState.vision];
                console.warn('Invalid state in remember, using current state');
            }
            
            const combinedState = [...safeBasicState, ...safeVisionState];
            
            // Аналогично для nextState
            let safeNextBasicState = [];
            let safeNextVisionState = [];
            
            if (nextState && typeof nextState === 'object') {
                // Используем реальные данные из nextState
                safeNextBasicState = Array.isArray(nextState.basic) ? [...nextState.basic] : new Array(this.basicInputSize).fill(0);
                safeNextVisionState = Array.isArray(nextState.vision) ? [...nextState.vision] : new Array(this.visionInputSize).fill(0);
            } else {
                // Если nextState невалиден, используем текущее состояние
                const currentState = this.getValidatedState();
                safeNextBasicState = [...currentState.basic];
                safeNextVisionState = [...currentState.vision];
            }
            
            const combinedNextState = [...safeNextBasicState, ...safeNextVisionState];

            if (actionIndex === 6 && this.hunger < 50) {
                reward += 300 * (1 - this.hunger/100);
            }

            if (this.hunger < 20) reward -= 5 * (20 - this.hunger);
            if (this.health < 30) reward -= 8 * (30 - this.health);

            if (actionIndex < 6) {
                const directions = this.getHexDirections();
                if (directions[actionIndex]) {
                    const [dx, dy] = directions[actionIndex];
                    const newPos = `${this.x + dx},${this.y + dy}`;
                    if (!this.visitedCells.has(newPos)) {
                        reward += 150;
                        this.visitedCells.add(newPos);
                    }
                }
            }

            const visionInput = state.vision || safeVisionState;
            let algaeSeen = false;
            
            for (let i = 0; i < this.hexCount; i++) {
                const baseIdx = i * 4;
                const hasAlgae = visionInput[baseIdx + 1] > 0.5;

                if (hasAlgae && this.hunger < 50) {
                    reward += 30;
                    algaeSeen = true;
                }
            }

            if (algaeSeen && this.hunger < 30) {
                reward += 40 * (1 - this.hunger/100);
            }

            this.memory.push({ 
                state: combinedState, // РЕАЛЬНЫЕ данные
                actionIndex: actionIndex || 6, 
                reward: reward || 0, 
                nextState: combinedNextState // РЕАЛЬНЫЕ данные
            });

            this.totalReward += reward;

            if (this.memory.length > this.memorySize) {
                this.memory.shift();
            }
            
        } catch (e) {
            console.error('Error in remember method:', e);
            // Аварийная запись в память с РЕАЛЬНЫМИ данными
            const currentState = this.getValidatedState();
            const combinedState = [...currentState.basic, ...currentState.vision];
            
            this.memory.push({ 
                state: combinedState, // РЕАЛЬНЫЕ данные
                actionIndex: actionIndex || 6, 
                reward: reward || 0, 
                nextState: combinedState // РЕАЛЬНЫЕ данные
            });
            this.totalReward += (reward || 0);
            
            if (this.memory.length > this.memorySize) {
                this.memory.shift();
            }
        }
    }


    getActionByIndex(actionIndex) {
        const directions = this.getHexDirections();
        
        if (actionIndex < 6 && directions[actionIndex]) {
            const [dx, dy] = directions[actionIndex];
            return {
                type: "move",
                dx: dx,
                dy: dy,
                actionIndex: actionIndex
            };
        } else {
            switch(actionIndex) {
                case 6: return { type: "eat", actionIndex: 6 };
                case 7: return { type: "reproduce", actionIndex: 7 };
                default: return { type: "rest", actionIndex: 6 };
            }
        }
    }

    getRandomAction() {
        const directions = this.getHexDirections();
        const randomDir = directions[Math.floor(Math.random() * directions.length)];
        const randomAction = Math.floor(Math.random() * 8);
        
        return this.getActionByIndex(randomAction);
    }

    getFallbackAction() {
        if (this.hunger < 30) {
            return { type: "eat", actionIndex: 6 };
        } else if (this.energy < 30) {
            return { type: "rest", actionIndex: 6 };
        } else {
            return this.getRandomAction();
        }
    }

    rest() {
        let reward = 0;
        if (this.health < 100) reward += 1;
        this.health = Math.min(100, this.health + 0.2);

        if (this.energy > 90) reward -= 1;
        if (this.energy < 20) reward += 1;
        this.energy += 3;

        return reward;
    }

    moveTo(newX, newY) {
        const validDirections = this.getHexDirections();
        const dx = newX - this.x;
        const dy = newY - this.y;
        
        const isValidMove = validDirections.some(([dirX, dirY]) => dirX === dx && dirY === dy);
        
        if (!isValidMove) {
            this.lastAction = "move";
            return -300; // БЫЛО: this.rest() - 200
        }

        let reward = 0;
        if (this.canMoveTo(newX, newY)) {
            if (!this.visitedCells.has(`${newX},${newY}`)) {
                reward += 150; // УМЕНЬШИЛ: было 300
                this.visitedCells.add(`${newX},${newY}`);
            }
            reward += 30; // УМЕНЬШИЛ: было 50
            this.x = newX;
            this.y = newY;
            this.energy -= 1;
            return reward;
        }
        
        this.lastAction = "move";
        return -300; // БЫЛО: this.rest() - 200
    }

    eat() {
        const entities = this.world.getEntitiesAt(this.x, this.y);
        
        if (entities.algae.length > 0) {
            const algae = entities.algae[0];
            const result = algae.getEaten();
            
            // Запоминаем ресурс
            this.resourceMemory.push({
                x: this.x,
                y: this.y,
                type: "algae",
                timestamp: 1.0
            });

            // Удаляем водоросли если они умерли
            if (result.shouldRemove) {
                const index = this.world.entities.algae.indexOf(algae);
                if (index !== -1) this.world.entities.algae.splice(index, 1);
            }
            
            this.hunger = Math.min(100, this.hunger + result.nutrition);
            return 300 + (result.nutrition * 10);  // Награда зависит от питательности
        }
        return -400;
    }

    reproduce() {
        const canReproduce = 
            this.reproductionCooldown <= 0 &&
            this.energy > 30 &&
            this.hunger > 30;

        if (!canReproduce) {
            // ШТРАФ за невозможное размножение
            return -600; // БЫЛО: до -1000
        }

        const directions = this.getHexDirections();
        
        const fishOnCurrentCell = this.world.entities.fish.filter(f => 
            f.x === this.x && f.y === this.y
        ).length;

        let availableSpots = [];
        
        if (fishOnCurrentCell < 6) {
            availableSpots.push([0, 0]);
        }

        directions.forEach(([dx, dy]) => {
            const newX = this.x + dx;
            const newY = this.y + dy;
            
            if (this.canMoveTo(newX, newY)) {
                const fishOnNeighborCell = this.world.entities.fish.filter(f => 
                    f.x === newX && f.y === newY
                ).length;
                
                if (fishOnNeighborCell < 6) {
                    availableSpots.push([dx, dy]);
                }
            }
        });

        if (availableSpots.length === 0) {
            return -400;
        }

        const childrenCount = Math.min(availableSpots.length, 6);
        const parentPortion = 1 / (childrenCount + 1);

        availableSpots.slice(0, childrenCount).forEach(([dx, dy]) => {
            const newX = this.x + dx;
            const newY = this.y + dy;
            
            const fish = new Fish(newX, newY, this.world);
            try {
                fish.brain = this.cloneBrain();
                fish.brain.mutate(0.3);
            } catch (e) {
                fish.brain = new DualStreamNeuralNetwork(this.basicInputSize, this.hexCount, this.totalActions);
            }
            
            fish.hunger = this.hunger * parentPortion;
            
            this.world.entities.fish.push(fish);
        });

        this.hunger *= parentPortion;
        this.energy -= 20;
        this.reproductionCooldown = 20;

        return 300 + (childrenCount * 5);
    }
    
    die() {
        this.saveBrain();

        try {
            const fish = this.world.entities.fish;
            const index = fish.indexOf(this);  
            this.logFishDeath();

            if (index !== -1) {
                fish.splice(index, 1);
            }
        } catch (e) {
        }
    }

    async update() {
        // Получение состояния ДО действия
        const prevState = this.getValidatedState();
        
        // Принятие и выполнение действия
        const action = this.decideAction();
        const actionReward = this.executeAction(action);

        let reward = 10;
        this.age++;
        this.hunger = Math.max(0, this.hunger - 0.3);

        if (this.hunger <= 0) this.health -= 1.0;

        if (this.age % 360 === 0) {
            reward += 150 + (this.age / 360) * 50; // Награда растет со временем
        }

        if (this.reproductionCooldown > 0) this.reproductionCooldown--;

        if (this.health <= 0 || this.age / 360 > 5 || !this.world.isWater(this.x, this.y)) {
            reward -= 10000;
            this.isDead = true;
        }
        
        reward += actionReward;
        this.normalizeStats();
        
        // Получение состояния ПОСЛЕ действия
        const nextState = this.getValidatedState();
          
        this.remember(prevState, action.actionIndex ?? 6, reward, nextState, action.type);
        
        // !!! if (this.age % this.learningInterval === 0 || this.isDead) this.learn();

        this.resourceMemory.forEach(memory => {
            memory.timestamp *= this.memoryDecay;
        });
        this.resourceMemory = this.resourceMemory.filter(m => m.timestamp > 0.1);

        this.updateFishInfo();
    
        this.lastAction = action.type;
        if(this.isDead) return this.die();
    }

    normalizeStats() {
        this.energy = Math.max(0, Math.min(100, this.energy));
        this.health = Math.max(0, Math.min(100, this.health));
        this.hunger = Math.max(0, Math.min(100, this.hunger));
    }

    logFishInfo() {
        if (!window.fishInfoDisplay) return;
        window.fishInfoDisplay.addFish(this);
    }

    logFishDeath() {
        if (!window.fishInfoDisplay) return;
        window.fishInfoDisplay.removeFish(this);
    }

    updateFishInfo() {
        if (!window.fishInfoDisplay) return;
        window.fishInfoDisplay.updateFish(this);
    }

    canMoveTo(x, y) {
        return super.canMoveTo(x, y) && this.world.isWater(x, y);
    }

    getVisibleHexes() {
        const visible = super.getVisibleHexes();
        return visible.filter(hex => hex.isWater);
    }

    isHexVisible(hexData) {
        if (!hexData) return false;
        
        if (!hexData.isWater) {
            // Проверяем, граничит ли эта суша с водой
            const waterNeighbors = this.getHexNeighbors(hex.x, hex.y).filter(neighbor => 
                this.world.isWater(neighbor.x, neighbor.y)
            );
            return waterNeighbors.length > 0; // Видна только суша, граничащая с водой
        }
        
        return this.hasLineOfSight(hexData);
    }

    static createOptimizedBrain() {
        const savedBrains = this.loadBrains();
        if (!savedBrains || savedBrains.length === 0) {
            return null;
        }
        
        const bestBrain = savedBrains[0];
        return this.createBrainFromData(bestBrain);
    }

    // Работа с гексагонами
    getDistanceToHex(hex) {
        if (!hex || hex.x === undefined || hex.y === undefined) {
            return this.visionRange + 1; // Вне зоны видимости
        }
        
        // Правильное расстояние для гексагональной сетки
        const dx = hex.x - this.x;
        const dy = hex.y - this.y;
        
        // Для offset coordinates (odd-q)
        if (this.x % 2 === 0) {
            return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
        } else {
            return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx - dy));
        }
    }

    findNearestResource(resourceType) {
        const visibleHexes = this.getVisibleHexes();
        let nearest = null;
        let minDistance = Infinity;

        visibleHexes.forEach(hex => {
            const entities = hex.entities || { rabbits: [], fish: [], foxes: [] };
            
            const hasResource = 
                (resourceType === 'food' && (entities.rabbits?.length > 0 || entities.fish?.length > 0)) ||
                (resourceType === 'water' && hex.isWater);

            if (hasResource) {
                const distance = this.getDistanceToHex(hex);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = {
                        distance,
                        directionX: hex.x - this.x,
                        directionY: hex.y - this.y
                    };
                }
            }
        });

        return nearest;
    }

    getHexData(x, y) {
        if (x < 0 || y < 0 || x >= this.world.cols || y >= this.world.rows) {
            return null;
        }
        
        // Используем существующий метод getVisibleHexes для проверки видимости
        const visibleHexes = this.getVisibleHexes();
        let hexData = visibleHexes.find(hex => hex.x === x && hex.y === y);
        
        if (!hexData) {
            // Если не найден в видимых, создаем базовые данные
            hexData = {
                x: x,
                y: y,
                isWater: this.world.isWater(x, y),
                isDeepWater: this.isDeepWater ? this.isDeepWater(x, y) : false,
                isShallowWater: this.isShallowWater ? this.isShallowWater(x, y) : false,
                isMountain: this.world.isMountain(x, y),
                isForest: this.world.isForest(x, y),
                entities: this.world.getEntitiesAt(x, y)
            };
        }
        
        return hexData;
    }

    calculateVisibleHexes() {
        const allHexes = this.cachedAllHexesInVisionRange;
        const visibleHexes = [];
        
        // Функция для получения центра гекса
        const getHexCenter = (x, y) => {
            const hexRadius = 20; // Примерный радиус, можно передавать как параметр
            const hexHeight = hexRadius * Math.sqrt(3);
            return {
                x: x * (hexRadius * 1.5) + hexRadius,
                y: y * hexHeight + (x % 2 === 0 ? hexHeight / 2 : hexHeight)
            };
        };
        
        // Функция для проверки пересечения двух отрезков
        const segmentsIntersect = (a1, a2, b1, b2) => {
            const ccw = (p1, p2, p3) => {
                return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
            };
            
            return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && 
                ccw(a1, a2, b1) !== ccw(a1, a2, b2);
        };
        
        // Функция для вычисления расстояния от точки до отрезка
        const pointToSegmentDistance = (point, segStart, segEnd) => {
            const A = point.x - segStart.x;
            const B = point.y - segStart.y;
            const C = segEnd.x - segStart.x;
            const D = segEnd.y - segStart.y;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            
            if (lenSq !== 0) {
                param = dot / lenSq;
            }

            let xx, yy;

            if (param < 0) {
                xx = segStart.x;
                yy = segStart.y;
            } else if (param > 1) {
                xx = segEnd.x;
                yy = segEnd.y;
            } else {
                xx = segStart.x + param * C;
                yy = segStart.y + param * D;
            }

            const dx = point.x - xx;
            const dy = point.y - yy;
            
            return Math.sqrt(dx * dx + dy * dy);
        };
        
        // Функция для получения вершин гексагона
        function getHexVertices(x, y, hexRadius) {
            const center = getHexCenter(x, y, hexRadius);
            return HexGeometryCache.getAbsoluteVertices(center.x, center.y);
        }
        
        // Функция для проверки пересечения линии с гексагоном
        function lineIntersectsHex(lineStart, lineEnd, hexX, hexY, hexRadius) {
            const vertices = getHexVertices(hexX, hexY, hexRadius);
            
            for (let i = 0; i < vertices.length; i++) {
                const v1 = vertices[i];
                const v2 = vertices[(i + 1) % vertices.length];
                if (segmentsIntersect(lineStart, lineEnd, v1, v2)) {
                    return {
                        intersects: true,
                        distance: pointToSegmentDistance(
                            getHexCenter(hexX, hexY, hexRadius), 
                            lineStart, 
                            lineEnd
                        )
                    };
                }
            }
            
            return { intersects: false, distance: Infinity };
        }
        
        // Функция для проверки видимости
        const hasLineOfSightToHex = (targetHex) => {
            const entityCenter = getHexCenter(this.x, this.y);
            const targetCenter = getHexCenter(targetHex.x, targetHex.y);
            
            // НЕСУЩЕСТВУЮЩИЕ гексы НИКОГДА не видимы
            if (!targetHex.exists) {
                return false;
            }

            // Если это сама сущность - всегда видима
            if (targetHex.x === this.x && targetHex.y === this.y) return true;
            
            // Получаем размеры мира
            const worldCols = this.world.cols;
            const worldRows = this.world.rows;
            
            // Толщина "виртуальной" линии
            const lineThickness = 2;
            const parallelLines = 2;
            
            let totalIntersections = 0;
            let significantIntersections = 0;
            
            // Вектор направления
            const dx = targetCenter.x - entityCenter.x;
            const dy = targetCenter.y - entityCenter.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            // Нормализованный перпендикулярный вектор
            const perpX = -dy / length;
            const perpY = dx / length;
            
            // Функция для проверки, является ли гекс препятствием
            const isObstacle = (x, y) => {
                // Проверяем границы мира
                if (x < 0 || y < 0 || x >= worldCols || y >= worldRows) {
                    return true;
                }
                // Проверяем горы
                return !this.world.isWater(x, y);
            };
            
            // Проверяем несколько параллельных линий
            for (let i = 0; i < parallelLines; i++) {
                const offset = (i - (parallelLines - 1) / 2) * (lineThickness / parallelLines);
                
                const offsetStart = {
                    x: entityCenter.x + perpX * offset,
                    y: entityCenter.y + perpY * offset
                };
                
                const offsetEnd = {
                    x: targetCenter.x + perpX * offset,
                    y: targetCenter.y + perpY * offset
                };
                
                let lineIntersections = 0;
                let lineSignificant = false;
                
                const checkedHexes = new Set();
                
                // Функция для проверки гекса как препятствия
                const checkHexAsObstacle = (hexX, hexY) => {
                    const key = `${hexX},${hexY}`;
                    if (checkedHexes.has(key)) return;
                    checkedHexes.add(key);
                    
                    // Пропускаем стартовую и целевую клетки
                    if ((hexX === this.x && hexY === this.y) || 
                        (hexX === targetHex.x && hexY === targetHex.y)) {
                        return;
                    }
                    
                    if (isObstacle(hexX, hexY)) {
                        const intersection = lineIntersectsHex(offsetStart, offsetEnd, hexX, hexY);
                        if (intersection.intersects) {
                            lineIntersections++;
                            if (intersection.distance / 20 < 0.8) { // hexRadius = 20
                                lineSignificant = true;
                            }
                        }
                    }
                };
                
                // Алгоритм Брезенхема для проверки всех гексов вдоль линии
                let x0 = this.x;
                let y0 = this.y;
                let x1 = targetHex.x;
                let y1 = targetHex.y;
                
                let dx = Math.abs(x1 - x0);
                let dy = Math.abs(y1 - y0);
                let sx = (x0 < x1) ? 1 : -1;
                let sy = (y0 < y1) ? 1 : -1;
                let err = dx - dy;
                
                while (true) {
                    // Проверяем текущий гекс и его соседей
                    for (let j = -1; j <= 1; j++) {
                        for (let k = -1; k <= 1; k++) {
                            checkHexAsObstacle(x0 + j, y0 + k);
                        }
                    }
                    
                    if (x0 === x1 && y0 === y1) break;
                    
                    let e2 = 2 * err;
                    if (e2 > -dy) {
                        err -= dy;
                        x0 += sx;
                    }
                    if (e2 < dx) {
                        err += dx;
                        y0 += sy;
                    }
                }
                
                if (lineIntersections > 0) {
                    totalIntersections++;
                }
                if (lineSignificant) {
                    significantIntersections++;
                }
                
                if (lineSignificant) {
                    return false;
                }
            }
            
            if (totalIntersections >= Math.ceil(parallelLines * 0.7)) {
                return false;
            }
            
            if (significantIntersections >= 2) {
                return false;
            }
            
            return true;
        };
        
        // Проверяем видимость для каждого гекса
        allHexes.forEach(hex => {
            if (hasLineOfSightToHex(hex)) {
                visibleHexes.push(hex);
            }
        });
        
        return visibleHexes;
    }

    getDistancesToMultipleHexes(targetHexes) {
        const distances = new Map();
        const queue = [{ x: this.x, y: this.y, distance: 0 }];
        const visited = new Set([`${this.x},${this.y}`]);
        
        // Добавляем стартовую точку
        distances.set(`${this.x},${this.y}`, 0);
        
        while (queue.length > 0) {
            const { x, y, distance } = queue.shift();
            
            // Получаем всех соседей
            const neighbors = getHexNeighbors(x, y);
            
            for (const neighbor of neighbors) {
                const key = `${neighbor.x},${neighbor.y}`;
                
                // Пропускаем непроходимые клетки
                if (!this.world.isWater(neighbor.x, neighbor.y)) {
                    continue;
                }
                
                if (!visited.has(key)) {
                    visited.add(key);
                    const newDistance = distance + 1;
                    distances.set(key, newDistance);
                    queue.push({ 
                        x: neighbor.x, 
                        y: neighbor.y, 
                        distance: newDistance 
                    });
                }
            }
        }
        
        // Возвращаем расстояния для запрошенных гексов
        const result = new Map();
        for (const hex of targetHexes) {
            const key = `${hex.x},${hex.y}`;
            result.set(hex, distances.get(key) || this.visionRange + 1);
        }
        
        return result;
    }
}