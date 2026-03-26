// Rabbit.js
import { Entity } from "../WorldEntity.js";
import { NeuralNetwork, DualStreamNeuralNetwork } from "../Neurals/Neural.js";
import {
    loadBestBrains,
} from '../Neurals/BrainStorage.js';

let rabbitCounter = 0;

export class Rabbit extends Entity {
    constructor(x, y, world) {
        super(x, y, world);
        this.id = `rabbit-${rabbitCounter++}`;
        this.type = "rabbits";
        this.health = 100;
        this.energy = 100;
        this.hunger = 100;
        this.thirst = 100;
        this.age = 0;
        this.visionRange = 3; // У кроликов меньше радиус обзора
        this.lastAction = null;
        this.isDead = false;

        this.visitedCells = new Set([`${x},${y}`]);
        this.foxMemory = []; // Память о местоположении лис
        this.memory = [];
        this.memorySize = 150;
        this.learningInterval = 5;
        this.reproductionCooldown = 0;
        this.totalReward = 0;

        this.hexCount = 1 + 3 * this.visionRange * (this.visionRange + 1);
        this.basicInputSize = 9;
        this.visionInputSize = this.hexCount * 4;
        this.totalActions = 10;

        this.cachedAllHexesInVisionRange = [];
        this.cachedMountainHexesInVisionRange = []; 
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
        this.fearLevel = 0; // Уровень страха (влияет на поведение)

        this.logRabbitInfo();
    }

    static loadBestBrain() {
        const brains = loadBestBrains('rabbits');
        return brains.length > 0 ? this.createBrainFromData(brains[0]) : null;
    }

    // Состояние кролика (адаптировано под его нужды)
    getState() {
        const entities = this.world.getEntitiesAt(this.x, this.y) || { grass: [], foxes: [] };
    
        // Определяем тип текущей клетки
        let hexType = 1.0; // По умолчанию - земля/трава
        if (this.world.isDeepWater(this.x, this.y)) {
            hexType = 0.2;
        } else if (this.world.isShallowWater(this.x, this.y)) {
            hexType = 0.4;
        } else if (this.world.isMountain(this.x, this.y)) {
            hexType = 0.6;
        } else if (this.world.isForest(this.x, this.y)) {
            hexType = 0.8;
        }

        return [
            this.health / 100,
            this.energy / 100,
            (100 - this.hunger) / 100,
            (100 - this.thirst) / 100,
            this.age / 1000,
            hexType,
            this.fearLevel, // Не помню, как работает
            entities.grass.length > 0 ? 1 : 0,
            entities.foxes.length > 0 ? 1 : 0,
        ];
    }

    // Визуальный ввод (аналогично Fox, но с акцентом на траву и лис)
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
                const entities = hex.entities || { grass: [], foxes: [] };

                let hexType = 1.0; // По умолчанию - земля/трава
                if (hex.isDeepWater) hexType = 0.2;
                else if (hex.isShallowWater) hexType = 0.4;
                else if (hex.isMountain) hexType = 0.6;
                else if (hex.isForest) hexType = 0.8;

                input[baseIdx] = hexType;
                input[baseIdx + 1] = hex.isForest ? 1 : 0;
                input[baseIdx + 2] = entities.grass.length > 0 ? 1 : 0; // Еда (трава)
                input[baseIdx + 3] = entities.foxes.length > 0 ? 1 : 0; // Опасность (лисы)
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

    // Память и обучение (аналогично Fox, но с другими наградами)
    remember(state, actionIndex, reward, nextState = null) {
        try {
            let safeBasicState = [];
            let safeVisionState = [];
            
            if (state && typeof state === 'object') {
                safeBasicState = Array.isArray(state.basic) ? [...state.basic] : new Array(this.basicInputSize).fill(0);
                safeVisionState = Array.isArray(state.vision) ? [...state.vision] : new Array(this.visionInputSize).fill(0);
            } else {
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
            
            // Специфические для кролика награды
            if (actionIndex === 8 && this.hunger < 50) { // eat
                reward += 400 * (1 - this.hunger/100);
            }
            if (actionIndex === 9 && this.thirst < 50) { // drink
                reward += 300 * (1 - this.thirst/100);
            }

            // Штрафы за критические состояния
            if (this.thirst < 20) reward -= 8 * (20 - this.thirst);
            if (this.hunger < 20) reward -= 6 * (20 - this.hunger);
            if (this.health < 30) reward -= 10 * (30 - this.health);

            // Награда за избегание лис
            const nearestFox = this.findNearestFox();
            if (nearestFox && nearestFox.distance < 2) {
                reward -= 200 * (1 - nearestFox.distance/2);
                this.fearLevel = Math.min(1, this.fearLevel + 0.3);
            } else {
                this.fearLevel = Math.max(0, this.fearLevel - 0.1);
            }

            // Награда за исследование
            if (actionIndex < 6) {
                const directions = this.getHexDirections();
                if (directions[actionIndex]) {
                    const [dx, dy] = directions[actionIndex];
                    const newPos = `${this.x + dx},${this.y + dy}`;
                    if (!this.visitedCells.has(newPos)) {
                        reward += 200;
                        this.visitedCells.add(newPos);
                    }
                }
            }

            // Анализ visionInput на наличие ресурсов и угроз
            let grassSeen = false;
            let foxSeen = false;

            for (let i = 0; i < this.hexCount; i++) {
                const baseIdx = i * 4;
                const hasGrass = safeVisionState[baseIdx + 2] > 0.5;
                const hasFox = safeVisionState[baseIdx + 3] > 0.5;

                if (hasGrass && this.hunger < 50) {
                    reward += 30;
                    grassSeen = true;
                }
                
                if (hasFox) {
                    reward -= 50;
                    foxSeen = true;
                }
            }
            
            if (grassSeen && this.hunger < 30) {
                reward += 50 * (1 - this.hunger/100);
            }

            if (foxSeen) {
                reward -= 80;
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
                case 6: return { type: "rest", actionIndex: 6 };
                case 7: return { type: "reproduce", actionIndex: 7 };
                case 8: return { type: "eat", actionIndex: 8 };
                case 9: return { type: "drink", actionIndex: 9 };
                default: return { type: "rest", actionIndex: 6 };
            }
        }
    }

    getRandomAction() {
        const directions = this.getHexDirections();
        const randomDir = directions[Math.floor(Math.random() * directions.length)];
        const randomAction = Math.floor(Math.random() * 10);
        
        return this.getActionByIndex(randomAction);
    }

    getFallbackAction() {
        // Приоритеты кролика: безопасность > жажда > голод > энергия
        const nearestFox = this.findNearestFox();
        if (nearestFox && nearestFox.distance < 2) {
            // Бегство от лисы
            const directions = this.getHexDirections();
            const escapeDirection = this.findEscapeDirection(nearestFox);
            if (escapeDirection >= 0) {
                return this.getActionByIndex(escapeDirection);
            }
        }
        
        if (this.thirst < 30) {
            return { type: "drink", actionIndex: 9 };
        } else if (this.hunger < 30) {
            return { type: "eat", actionIndex: 8 };
        } else if (this.energy < 30) {
            return { type: "rest", actionIndex: 6 };
        } else {
            return this.getRandomAction();
        }
    }

    // Специфические методы для кролика
    findNearestFox() {
        const visibleHexes = this.getVisibleHexes();
        let nearest = null;
        let minDistance = Infinity;

        visibleHexes.forEach(hex => {
            const entities = hex.entities || { foxes: [] };
            
            if (entities.foxes?.length > 0) {
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

    findEscapeDirection(foxPosition) {
        const directions = this.getHexDirections();
        let bestDirection = -1;
        let maxDistance = -1;

        for (let i = 0; i < directions.length; i++) {
            const [dx, dy] = directions[i];
            const newX = this.x + dx;
            const newY = this.y + dy;
            
            if (this.canMoveTo(newX, newY)) {
                const distanceToFox = Math.sqrt(
                    Math.pow(newX - (this.x + foxPosition.directionX), 2) + 
                    Math.pow(newY - (this.y + foxPosition.directionY), 2)
                );
                
                if (distanceToFox > maxDistance) {
                    maxDistance = distanceToFox;
                    bestDirection = i;
                }
            }
        }

        return bestDirection;
    }

    rememberFoxLocation(x, y, distance) {
        this.foxMemory.push({
            x: x,
            y: y,
            distance: distance,
            timestamp: 1.0
        });
        
        if (this.foxMemory.length > 5) {
            this.foxMemory.shift();
        }
    }

    // Действия кролика

    rest() {
        let reward = 0;
        if (this.health < 100) reward += 1;
        this.health = Math.min(100, this.health + 0.3);

        if (this.energy > 90) reward -= 1;
        if (this.energy < 20) reward += 1;
        this.energy += 4;

        return reward;
    }

    moveTo(newX, newY) {
        const validDirections = this.getHexDirections();
        const dx = newX - this.x;
        const dy = newY - this.y;
        
        const isValidMove = validDirections.some(([dirX, dirY]) => dirX === dx && dirY === dy);
        
        if (!isValidMove) {
            this.lastAction = "move";
            return -400; // БЫЛО: this.rest() - 300
        }

        let reward = 0;
        if (this.canMoveTo(newX, newY)) {
            if (!this.visitedCells.has(`${newX},${newY}`)) {
                reward += 200; // УМЕНЬШИЛ: было 500
                this.visitedCells.add(`${newX},${newY}`);
            }
            reward += 50; // УМЕНЬШИЛ: было 80
            this.x = newX;
            this.y = newY;
            this.energy -= 1;
            return reward;
        }
        
        this.lastAction = "move";
        return -400; // БЫЛО: this.rest() - 300
    }

    eat() {
        const entities = this.world.getEntitiesAt(this.x, this.y);
        
        if (entities.grass.length > 0) {
            const grass = entities.grass[0];
            const result = grass.getEaten();
            
            // Запоминаем ресурс
            this.resourceMemory.push({
                x: this.x,
                y: this.y,
                type: "grass",
                timestamp: 1.0
            });

            // Удаляем траву если она умерла
            if (result.shouldRemove) {
                const index = this.world.entities.grass.indexOf(grass);
                if (index !== -1) this.world.entities.grass.splice(index, 1);
            }
            
            this.hunger = Math.min(100, this.hunger + result.nutrition);
            return 400 + (result.nutrition * 10);  // Награда зависит от питательности
        }
        return -600;
    }

    drink() {
        if (this.world.isWater(this.x, this.y)) {
            this.resourceMemory.push({
                x: this.x,
                y: this.y,
                type: "water",
                timestamp: 1.0
            });
            this.thirst = Math.min(100, this.thirst + 30);
            this.energy -= 3;
            return 400;
        }
        // СИЛЬНЫЙ ШТРАФ за попытку пить когда нет воды
        return -500; // БЫЛО: (this.rest() - 400) или (this.rest() - 800)
    }

    reproduce() {
        const canReproduce = 
            this.reproductionCooldown <= 0 &&
            this.energy > 40 &&
            this.hunger > 40 &&
            this.thirst > 40;

        if (!canReproduce) {
            // ШТРАФ за невозможное размножение
            return -800; // БЫЛО: до -3000
        }

        const directions = this.getHexDirections();
        const availableSpots = directions.filter(([dx, dy]) => {
            const newX = this.x + dx;
            const newY = this.y + dy;
            return this.canMoveTo(newX, newY) && 
                !this.world.entities.rabbits.some(r => r.x === newX && r.y === newY);
        });

        if (availableSpots.length === 0) {
            return -600; // БЫЛО: до -3000
        }

        const childrenCount = Math.min(availableSpots.length, 2);
        const parentPortion = 1 / (childrenCount + 1);

        availableSpots.slice(0, childrenCount).forEach(([dx, dy]) => {
            const newX = this.x + dx;
            const newY = this.y + dy;
            
            const rabbit = new Rabbit(newX, newY, this.world);
            try {
                rabbit.brain = this.cloneBrain();
                rabbit.brain.mutate(0.25);
            } catch (e) {
                rabbit.brain = new DualStreamNeuralNetwork(this.basicInputSize, this.hexCount, this.totalActions);
            }
            
            rabbit.hunger = this.hunger * parentPortion;
            rabbit.thirst = this.thirst * parentPortion;
            
            this.world.entities.rabbits.push(rabbit);
        });

        this.hunger *= parentPortion;
        this.thirst *= parentPortion;
        this.energy -= 30;
        this.reproductionCooldown = 30;

        return 400 + (childrenCount * 10);
    }

    die() {
        this.saveBrain();

        try {
            const rabbits = this.world.entities.rabbits;
            const index = rabbits.indexOf(this);  
            this.logRabbitDeath();

            if (index !== -1) {
                rabbits.splice(index, 1);
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
        this.hunger = Math.max(0, this.hunger - 0.5);
        this.thirst = Math.max(0, this.thirst - 0.8);

        if (this.hunger <= 0) this.health -= 1.5;        
        if (this.thirst <= 0) this.health -= 2.0;

        if (this.age % 360 === 0) {
            reward += 240 + (this.age / 360) * 50; // Награда растет со временем
        }

        if (this.reproductionCooldown > 0) this.reproductionCooldown--;

        if (this.health <= 0 || this.age / 360 > 8 || 
            (this.world.isWater(this.x, this.y) && this.energy <= 3)) {
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

        this.foxMemory.forEach(memory => {
            memory.timestamp *= 0.95;
        });
        this.foxMemory = this.foxMemory.filter(m => m.timestamp > 0.05);

        this.updateRabbitInfo();
    
        this.lastAction = action.type;
        if(this.isDead) return this.die();
    }

    normalizeStats() {
        this.energy = Math.max(0, Math.min(100, this.energy));
        this.health = Math.max(0, Math.min(100, this.health));
        this.hunger = Math.max(0, Math.min(100, this.hunger));
        this.thirst = Math.max(0, Math.min(100, this.thirst));
        this.fearLevel = Math.max(0, Math.min(1, this.fearLevel));
    }

    // Вспомогательные методы (аналогичны Fox)
    logRabbitInfo() {
        if (!window.rabbitInfoDisplay) return;
        window.rabbitInfoDisplay.addRabbit(this);
    }

    logRabbitDeath() {
        if (!window.rabbitInfoDisplay) return;
        window.rabbitInfoDisplay.removeRabbit(this);
    }

    updateRabbitInfo() {
        if (!window.rabbitInfoDisplay) return;
        window.rabbitInfoDisplay.updateRabbit(this);
    }

    static createOptimizedBrain() {
        const savedBrains = this.loadBrains();
        if (!savedBrains || savedBrains.length === 0) {
            return null;
        }
        
        // Используем самую успешную сохраненную сеть
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
        const getHexVertices = (x, y) => {
            const center = getHexCenter(x, y);
            const vertices = [];
            const hexRadius = 20;
            
            for (let i = 0; i < 6; i++) {
                const angle = 2 * Math.PI / 6 * i;
                const vertexX = center.x + hexRadius * Math.cos(angle);
                const vertexY = center.y + hexRadius * Math.sin(angle);
                vertices.push({ x: vertexX, y: vertexY });
            }
            
            return vertices;
        };
        
        // Функция для проверки пересечения линии с гексагоном
        const lineIntersectsHex = (start, end, hexX, hexY) => {
            const vertices = getHexVertices(hexX, hexY);
            const hexCenter = getHexCenter(hexX, hexY);
            
            let intersectionCount = 0;
            let minDistanceToCenter = Infinity;
            
            // Проверяем пересечение линии с каждой стороной гексагона
            for (let i = 0; i < 6; i++) {
                const v1 = vertices[i];
                const v2 = vertices[(i + 1) % 6];
                
                if (segmentsIntersect(start, end, v1, v2)) {
                    intersectionCount++;
                    
                    // Вычисляем расстояние от центра гексагона до линии
                    const distance = pointToSegmentDistance(hexCenter, start, end);
                    minDistanceToCenter = Math.min(minDistanceToCenter, distance);
                }
            }
            
            return {
                intersects: intersectionCount > 0,
                distance: minDistanceToCenter,
                intersectionCount: intersectionCount
            };
        };
        
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
                return this.world.isMountain(x, y);
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
            const neighbors = this.getHexNeighbors(x, y);
            
            for (const neighbor of neighbors) {
                const key = `${neighbor.x},${neighbor.y}`;
                
                // Пропускаем непроходимые клетки
                if (this.world.isMountain(neighbor.x, neighbor.y)) {
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