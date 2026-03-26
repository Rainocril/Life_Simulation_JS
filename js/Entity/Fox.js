import { Profiler } from '../Profiler.js';

import { Entity } from "../WorldEntity.js";
import { HexGeometryCache } from '../WorldGeometry.js';
import { getHexNeighbors} from "../HexUtils.js";
import { LineOfSight } from "../LineOfSight.js";

import { NeuralNetwork, DualStreamNeuralNetwork } from "../Neurals/Neural.js";

let foxCounter = 0;

export class Fox extends Entity {
    constructor(x, y, world) {
        Profiler.start('fox_constructor');
        super(x, y, world);
        this.id = `fox-${foxCounter++}`;
        this.type = "foxes";
        this.health = 100;
        this.energy = 100;
        this.hunger = 100;
        this.thirst = 100;
        this.age = 0;
        this.visionRange = 4;
        this.lastAction = null;
        this.lastActionId = null;
        this.isDead = false;

        this.generation = 0; // Поколение


        this.visitedCells = new Set([`${x},${y}`]);

        // Нейросеть
        this.memory = [];
        this.memorySize = 200;
        this.learningInterval = 5;
        this.reproductionCooldown = 0;
        this.totalReward = 0;
        this.tempReward = 0;

        // Входные данные нейронки
        this.hexCount = 1 + 3 * this.visionRange * (this.visionRange + 1);
        this.basicInputSize = 9;
        this.visionInputSize = this.hexCount * 3; // 183
        this.totalActions = 10;

        // Кэш зрения
        this.cachedAllHexesInVisionRange = [];  // Все гексагоны в радиусе видимости.
        this.cachedMountainHexesInVisionRange = []; // Все горы в радиусе видимости.
        this.cachedVisibleHexes = [];

        // Кэш состояния
        Profiler.start('fox_getValidatedState');
        this.lastState = this.getValidatedState();
        Profiler.end('fox_getValidatedState');

        // МЕТРИКИ ОБУЧЕНИЯ
        this.trainingMetrics = {
            tdErrors: [],           // TD ошибки
            qValues: [],           // Q-значения
            explorationRate: 0.4,  // Текущая exploration rate
            successRate: 0,        // Процент успешных действий
            learningProgress: 0,   // Прогресс обучения
            policyMaturity: 0      // Зрелость политики
        };

        //console.log(`Fox: basic=${basicInputSize}, vision=${visionInputSize}, total=${basicInputSize + visionInputSize}`);
        
        Profiler.start('fox_loadBrain');
        this.brain = this.loadBrain();
        Profiler.end('fox_loadBrain');

        this.resourceMemory = [];
        this.memoryDecay = 0.99;

        this.logFoxInfo();
        Profiler.end('fox_constructor');
    }

    getState() {
        const entities = this.world.getEntitiesAt(this.x, this.y) || { rabbits: [], fish: [] };
        
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
            this.health / 100,  // Здоровье
            this.energy / 100,  // Энергия
            (100 - this.hunger) / 100,  // Голод
            (100 - this.thirst) / 100,  // Жажда
            this.age / 1000,    // Возраст
            hexType,     // Тип текущей клетки
            entities.rabbits.length > 0 ? 1 : 0,
            entities.fish.length > 0 ? 1 : 0,
            entities.foxes ? (entities.foxes.length > 0 ? 1 : 0) : 0
        ];
    }

    getVisionInput() {
        // Получаем ВСЕ гексы (отсортированные, кэшированные)
        const allHexes = this.getAllHexesInVisionRange();
        
        // Получаем ВИДИМЫЕ гексы (кэшированные по позиции)
        const visibleHexes = this.getVisibleHexes();
        const visibleSet = new Set(visibleHexes.map(h => `${h.x},${h.y}`));
        
        // Создаем выходной массив
        const input = new Float32Array(this.visionInputSize);
        
        // Заполняем данные для каждого гекса
        for (let i = 0; i < allHexes.length && i < this.hexCount; i++) {
            const hex = allHexes[i];
            const baseIdx = i * 3;
            const isVisible = visibleSet.has(`${hex.x},${hex.y}`);
            
            if (isVisible && hex.exists) {
                // Видимый и существующий гекс - реальные данные
                let hexType = 1.0; // По умолчанию - земля/трава
                if (hex.isDeepWater) hexType = 0.2;
                else if (hex.isShallowWater) hexType = 0.4;
                else if (hex.isMountain) hexType = 0.6;
                else if (hex.isForest) hexType = 0.8;
                
                input[baseIdx] = hexType;
                input[baseIdx + 1] = (hex.entities?.rabbits?.length > 0 || 
                                    hex.entities?.fish?.length > 0) ? 1 : 0;
                input[baseIdx + 2] = (hex.entities?.foxes?.length > 0) ? 1 : 0;
            } else {
                // Невидимый или несуществующий гекс - нули
                input[baseIdx] = 0;
                input[baseIdx + 1] = 0;
                input[baseIdx + 2] = 0;
            }
        }
        
        // Заполняем оставшиеся слоты (если гексов меньше 61)
        for (let i = allHexes.length; i < this.hexCount; i++) {
            const baseIdx = i * 3;
            input[baseIdx] = 0;
            input[baseIdx + 1] = 0;
            input[baseIdx + 2] = 0;
        }
        
        return Array.from(input); // Возвращаем обычный массив для совместимости
    }

    remember(state, actionIndex, reward, nextState = null, actionType) {
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
            //console.log('Combined state size:', combinedState.length, 'Next state size:', combinedNextState.length);

            // Усиленные штрафы за повторение ошибок
            if (reward < -300 && this.lastAction === actionType) {
                reward *= 1.5; // дополнительный штраф за упрямство
            }

            // Штраф за бездействие при критических состояниях
            if (this.health < 20 && this.hunger < 10 && this.thirst < 10 && actionIndex === 6) { // отдых когда почти умер
                reward -= 200;
            }

            // Улучшенная система наград
            if (actionIndex === 9 && this.thirst < 50) reward += 100 * (1 - this.thirst/100);
            if (actionIndex === 8 && this.hunger < 50) reward += 150 * (1 - this.hunger/100);

            // Штрафы за критические состояния
            if (this.thirst < 20) reward -= 10 * (20 - this.thirst);
            if (this.hunger < 20) reward -= 8 * (20 - this.hunger);
            if (this.health < 30) reward -= 15 * (30 - this.health);

            if (this.health > 80) reward += 200;
            if (this.energy > 70) reward += 150;

            const visionInput = state?.vision || safeVisionState;
        
            // Анализируем видимые гексы на наличие ресурсов
            let foodSeen = false;
            let waterSeen = false;
            
            // Анализ visionInput (244 параметра = 61 гекс * 4 параметра)
            for (let i = 0; i < 61; i++) {
                const baseIdx = i * 3;
                
                const hexType = visionInput[baseIdx];
                const hasFood = visionInput[baseIdx + 1] > 0.5;
                const hasFoxes = visionInput[baseIdx + 2] > 0.5; // Пока пусть будет
                
                // Определяем воду по типу клетки   
                const isWater = hexType === 0.2 || hexType === 0.4;
                
                if (hasFood && this.hunger < 50) {
                    reward += 50;
                    foodSeen = true;
                }
                
                if (isWater && this.thirst < 50) {
                    reward += 30;
                    waterSeen = true;
                }
            }
        
            // Большие бонусы за непосредственное обнаружение нужных ресурсов
            if (foodSeen && this.hunger < 30) {
                reward += 60 * (1 - this.hunger/100);  // Уменьшил награду за еду
            }

            if (waterSeen && this.thirst < 30) {
                reward += 100 * (1 - this.thirst/100); // Увеличил награду за воду
            }

            // ИСПРАВЛЕНИЕ: сохраняем РЕАЛЬНЫЕ данные вместо нулевых массивов
            this.memory.push({ 
                state: combinedState, // РЕАЛЬНЫЕ данные
                actionIndex: actionIndex || 6, 
                reward: reward || 0, 
                nextState: combinedNextState // РЕАЛЬНЫЕ данные
            });

            this.totalReward += reward;
            this.tempReward += reward;

            if (this.memory.length > this.memorySize) {
                this.memory.shift();
            }
            
            //console.log('Memory updated, total memories:', this.memory.length);
            
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
            // Движение
            const [dx, dy] = directions[actionIndex];
            return {
                type: "move",
                dx: dx,
                dy: dy,
                actionIndex: actionIndex
            };
        } else {
            // Действия
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
        // Жажда теперь приоритетнее голода
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

    // Остальные методы остаются без изменений...
    moveTo(newX, newY) {
        const validDirections = this.getHexDirections();
        const dx = newX - this.x;
        const dy = newY - this.y;
        
        const isValidMove = validDirections.some(([dirX, dirY]) => dirX === dx && dirY === dy);
        
        if (!isValidMove) {
            this.lastAction = "move";
            return -500;
        }

        let reward = 0;
        if (this.canMoveTo(newX, newY)) {
            if (!this.visitedCells.has(`${newX},${newY}`)) {
                reward += 100;
                this.visitedCells.add(`${newX},${newY}`);
            }
            reward += 100;
            const oldX = this.x; const oldY = this.y;
            this.x = newX;
            this.y = newY;
            
            // РАЗНАЯ трата энергии в зависимости от типа воды
            if (this.world.isWater(newX, newY)) {
                if (this.world.isDeepWater(newX, newY)) {
                    this.energy -= 4; // Больше энергии тратится на глубокой воде
                } else {
                    this.energy -= 3; // Меньше энергии на мелководье
                }
            } else {
                this.energy -= 2; // Наземное перемещение
            }

            this.world.updateSpatialEntity(this, oldX, oldY);
            return reward;
        }
        
        this.lastAction = "move";
        return -500;
    }

    rest() {
        let reward = 0;
        if (this.health < 100) reward += 1;
        this.health = Math.min(100, this.health + 0.5);

        // РАЗНОЕ восстановление энергии в зависимости от типа воды
        if (this.world.isWater(this.x, this.y)) {
            if (this.world.isDeepWater(this.x, this.y)) {
                // На глубокой воде энергия тратится даже при отдыхе
                this.energy -= 3;
                reward -= 2;
            } else {
                // На мелководье энергия не тратится при отдыхе
                if (this.energy < 100) this.energy += 1;
                reward += 0.5;
            }
        } else {
            // На суше нормальное восстановление
            if (this.energy > 94) reward -= 1;
            if (this.energy < 20) reward += 1;
            this.energy += 6;
        }
        return reward;
    }

    eat() {
        const entities = this.world.getEntitiesAt(this.x, this.y);
        if (entities.rabbits.length > 0 || entities.fish.length > 0) {
            this.resourceMemory.push({
                x: this.x,
                y: this.y,
                type: "food",
                timestamp: 1.0
            });
        }

        if (entities.rabbits.length > 0) {
            const rabbit = entities.rabbits[0];
            rabbit.health = 0;
            this.hunger = Math.min(100, this.hunger + 30);
            return 800;
        } 
        else if (entities.fish.length > 0 && this.world.isWater(this.x, this.y)) {
            const fish = entities.fish[0];
            fish.health = 0;
            this.hunger = Math.min(100, this.hunger + 10);
            return 400;
        }
        if (this.lastAction === "eat") return -1000; 
        return -800 ;
    }

    drink() {
        if (this.world.isWater(this.x, this.y)) {
            this.resourceMemory.push({
                x: this.x,
                y: this.y,
                type: "water",
                timestamp: 1.0
            });
            this.thirst = Math.min(100, this.thirst + 40);
            this.energy -= 6;
            return 500;
        }
        if (this.lastAction === "drink") return -1000; 
        return -600;
    }

    reproduce() {
        const canReproduce = 
            this.reproductionCooldown <= 0 &&
            this.energy > 50 &&
            this.hunger > 50 &&
            this.thirst > 50;

        if (!canReproduce) {
            if (this.lastAction === "reproduce") return -500; 
            else return -1000;
        }

        const directions = this.getHexDirections();
        const availableSpots = directions.filter(([dx, dy]) => {
            const newX = this.x + dx;
            const newY = this.y + dy;
            return this.canMoveTo(newX, newY) && 
                !this.world.entities.foxes.some(f => f.x === newX && f.y === newY);
        });

        if (availableSpots.length === 0) { 
            return -500;
        }

        const childrenCount = Math.min(availableSpots.length, 3);
        const parentPortion = 1 / (childrenCount + 1);

        availableSpots.slice(0, childrenCount).forEach(([dx, dy]) => {
            const newX = this.x + dx;
            const newY = this.y + dy;
            
            const fox = new Fox(newX, newY, this.world);
            try {
                fox.brain = this.cloneBrain();
                fox.brain.mutate(0.2);
            } catch (e) {
                console.error('Clone Error');
                fox.brain = new DualStreamNeuralNetwork(this.basicInputSize, this.visionInputSize, this.totalActions);
            }
            
            fox.hunger = this.hunger * parentPortion;
            fox.thirst = this.thirst * parentPortion;
            
            this.world.entities.foxes.push(fox);
        });

        this.hunger *= parentPortion;
        this.thirst *= parentPortion;
        this.energy -= 40;
        this.reproductionCooldown = 50;

        return 500 + (childrenCount * 10);
    }

    die() {
        Profiler.start('fox_die');
        Profiler.start('fox_saveBrain');
        this.saveBrain();
        Profiler.end('fox_saveBrain');

        try {
            const foxes = this.world.entities.foxes;
            const index = foxes.indexOf(this);  
            this.logFoxDeath();

            if (index !== -1) {
                foxes.splice(index, 1);
                this.world.updateSpatialEntity(this, this.x, this.y);
            } else {
                //console.log(`Fox ${this.id} not found in world entities`);
            }
        } catch (e) {
        }
        Profiler.end('fox_die');
    }

    async update() {
        // Принятие и выполнение действия
        Profiler.start('fox_decideAction');
        const action = this.decideAction(this.lastState);
        Profiler.end('fox_decideAction');

        Profiler.start('fox_executeAction');
        const actionReward = this.executeAction(action);
        Profiler.end('fox_executeAction');

        // Ежешажное обновление состояния
        let reward = 10;
        this.age++;
        this.hunger = Math.max(0, this.hunger - 0.8);    // Увеличить потребление
        this.thirst = Math.max(0, this.thirst - 1.2);    // Увеличить потребление

        // Увеличить потери здоровья при критических состояниях
        if (this.hunger <= 0) this.health -= 2.0;        
        if (this.thirst <= 0) this.health -= 3.0;  

        if (this.age % 360 === 0) {
            reward += 100 + (this.age / 360) * 20; // Максимум ~300 очков
        }

        if (this.reproductionCooldown > 0) this.reproductionCooldown--;

        if (this.health <= 0 || this.age / 360 > 10 || 
            (this.world.isDeepWater(this.x, this.y) && 
            this.energy <= 6)) {
            reward -= 10000;
            this.isDead = true;
        }
        
        reward += actionReward;
        Profiler.start('fox_normalizeStats');
        this.normalizeStats();
        Profiler.end('fox_normalizeStats');
        this.tempReward = reward;
        const firstReward = reward;
        
        // Получение состояния ПОСЛЕ действия
        Profiler.start('fox_getValidatedState');
        const nextState = this.getValidatedState();
        Profiler.end('fox_getValidatedState');
        
        // Передаем гарантированно валидные состояния
        Profiler.start('fox_remember');
        this.remember(this.lastState, action.actionIndex ?? 6, reward, nextState, action.type);
        Profiler.end('fox_remember');

        this.lastState = nextState
        
        if (this.age % 10 === 0) {
            //console.log(`Fox ${this.id}: age=${this.age}, totalReward=${this.totalReward},\n [Action / lastAction] = ${action.actionIndex} / ${this.lastActionId},\n [FirstReward / reward] = ${firstReward} / ${this.tempReward}`);
        }
        
        // !!! if (this.age % this.learningInterval === 0 || this.isDead) this.learn();

        this.resourceMemory.forEach(memory => {
            memory.timestamp *= this.memoryDecay;
        });
        this.resourceMemory = this.resourceMemory.filter(m => m.timestamp > 0.1);
    
        this.lastAction = action.type;

        if(this.isDead) return this.die();
    }

    normalizeStats() {
        this.energy = Math.max(0, Math.min(100, this.energy));
        this.health = Math.max(0, Math.min(100, this.health));
        this.hunger = Math.max(0, Math.min(100, this.hunger));
        this.thirst = Math.max(0, Math.min(100, this.thirst));
    }

    logFoxInfo() {
        if (!window.foxInfoDisplay) return;
        window.foxInfoDisplay.addFox(this);
    }

    logFoxDeath() {
        if (!window.foxInfoDisplay) return;
        window.foxInfoDisplay.removeFox(this);
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

    calculateVisibleHexes() {
        const allHexes = this.cachedAllHexesInVisionRange;
        
        const isObstacle = (x, y) => {
            if (x < 0 || y < 0 || x >= this.world.cols || y >= this.world.rows) {
                return true;
            }
            return this.world.isMountain(x, y);
        };
        
        return LineOfSight.getVisibleHexes(
            { x: this.x, y: this.y },
            allHexes,
            isObstacle,
            this.world.cols,
            this.world.rows
        );
    }
}