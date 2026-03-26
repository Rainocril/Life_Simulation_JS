// WorldEntity.js
import { tick } from "./index.js";
import { NeuralNetwork, DualStreamNeuralNetwork } from "./Neurals/Neural.js";
import { getOffsets, getHexNeighbors, getAllHexNeighbors } from "./HexUtils.js";
import {
    loadBestBrains,
    saveBrainWithBuffer,
    getCurrentPopulation
} from './Neurals/BrainStorage.js';
import { Profiler } from "./Profiler.js";
import { LineOfSight } from "./LineOfSight.js";

// Базовый класс для существ
export class WorldEntity {
    constructor(x, y, world) {
        this.x = x;
        this.y = y;
        this.world = world;
    }

    getHexDirections() {
        const parity = this.x % 2 === 0 ? 'even' : 'odd';
        
        return getOffsets()[parity]
    }

    getNetworkData(network) {
        if (!network) {
            console.warn('Invalid network structure:', network);
            return null;
        }

        try {
            if (network instanceof DualStreamNeuralNetwork) {
                return {
                    type: 'dualStream',
                    generation: network.generation || 0,
                    basicInputSize: network.basicInputSize,
                    visionInputSize: network.visionInputSize,
                    outputSize: network.outputSize,
                    totalReward: network.totalReward,
                    learningRate: network.learningRate,
                    networks: {
                        stateStream: this.getNetworkData(network.stateStream),
                        visionStream: this.getNetworkData(network.visionStream),
                        fusionNetwork: this.getNetworkData(network.fusionNetwork)
                    }
                };
            }
            
            if (network instanceof NeuralNetwork) {
                // ГАРАНТИРУЕМ корректную сериализацию весов и смещений
                const weights = network.weights.map(layer => {
                    if (!layer || !layer.length) return [];
                    return Array.from(layer).map(val => 
                        (val !== null && isFinite(val)) ? val : 0
                    );
                });
                
                const biases = network.biases.map(layer => {
                    if (!layer || !layer.length) return [];
                    return Array.from(layer).map(val => 
                        (val !== null && isFinite(val)) ? val : 0.1
                    );
                });
                
                return {
                    type: 'neural',
                    weights: weights,
                    biases: biases,
                    learningRate: network.learningRate,
                    discountFactor: network.discountFactor,
                    inputSize: network.inputSize,
                    hiddenSizes: network.hiddenSizes,
                    outputSize: network.outputSize
                };
            }
            
            console.warn('Unknown network type:', network?.constructor?.name);
            return null;
            
        } catch (e) {
            console.error('Error while getting network data:', e);
            return null;
        }
    }

    getAllHexesInVisionRange() {
        if (this.cachedAllHexes && 
            this.cachedAllHexes.x === this.x && 
            this.cachedAllHexes.y === this.y) {
            return this.cachedAllHexes.hexes;
        }
        
        const allHexes = [];
        const queue = [{ x: this.x, y: this.y, distance: 0 }];
        const visited = new Set([`${this.x},${this.y}`]);
        
        while (queue.length > 0) {
            const { x, y, distance } = queue.shift();
            
            // ✅ Только координаты, без данных!
            allHexes.push({ x, y });
            
            if (distance >= this.visionRange) continue;
            
            for (const neighbor of getAllHexNeighbors(x, y)) {
                const key = `${neighbor.x},${neighbor.y}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ x: neighbor.x, y: neighbor.y, distance: distance + 1 });
                }
            }
        }
        
        // Сортируем для стабильного порядка
        const sortedHexes = allHexes.sort((a, b) => {
            const getVirtualY = (x, y) => x % 2 === 0 ? y * 2 : y * 2 + 1;
            const virtualYA = getVirtualY(a.x, a.y);
            const virtualYB = getVirtualY(b.x, b.y);
            
            if (virtualYA !== virtualYB) return virtualYA - virtualYB;
            return a.x - b.x;
        });
        
        // Кэшируем результат
        this.cachedAllHexes = {
            x: this.x,
            y: this.y,
            hexes: sortedHexes
        };
        
        return sortedHexes;
    }

    getDistanceToHex(hex) {
        if (!hex || hex.x === undefined || hex.y === undefined) {
            return this.visionRange + 1;
        }
        
        if (hex.x === this.x && hex.y === this.y) {
            return 0;
        }
        
        const dx = hex.x - this.x;
        const dy = hex.y - this.y;
        
        if (this.x % 2 === 0) {
            return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
        } else {
            return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx - dy));
        }
    }
}
export class Entity extends WorldEntity {
    constructor(x, y, world) {
        super(x, y, world);
        this.energy = 100;
        this.health = 100;
        this.age = 0;
        this.visionRange = 3;
    }

    executeAction(action) {
        const actionHandlers = {
            move: () => this.moveTo(this.x + action.dx, this.y + action.dy),
            rest: () => this.rest(),
            reproduce: () => this.reproduce(),
            eat: () => this.eat(),
            drink: () => this.drink()
        };

        const handler = actionHandlers[action.type];
        if (!handler) {
            console.warn(`Unknown action type: ${action.type}`);
            return -10;
        }

        try {
            return handler();
        } catch (e) {
            console.error(`Error executing ${action.type}:`, e);
            return -10;
        }
    }

    static getSafeArray = (array, expectedSize, fallbackValue = 0) => {
        if (!Array.isArray(array) || array.length !== expectedSize) {
            console.warn(`Invalid array: expected ${expectedSize}, got ${array?.length}`);
            return new Array(expectedSize).fill(fallbackValue);
        }
        return [...array];
    };

    getValidatedState() {
        let basicState, visionInput;
        
        try {
            // Используем методы конкретного существа
            basicState = Entity.getSafeArray(this.getState(), this.basicInputSize);
            visionInput = Entity.getSafeArray(this.getVisionInput(), this.visionInputSize);
        } catch (e) {
            console.error('Error getting state:', e);
            basicState = new Array(this.basicInputSize).fill(0);
            visionInput = new Array(this.visionInputSize).fill(0);
        }
        
        return {
            basic: basicState,
            vision: visionInput
        };
    }

    move(directionIndex = null) {
        
        const directions = this.getHexDirections();
        const [dX, dY] = directionIndex !== null 
            ? directions[directionIndex % directions.length]
            : directions[Math.floor(Math.random() * directions.length)];

        const newX = this.x + dX;
        const newY = this.y + dY;

        if (this.canMoveTo(newX, newY)) {
            this.x = newX;
            this.y = newY;
            this.energy -= 1;
            return true;
        }
        return false;
    }

    canMoveTo(x, y, checkWater = false, checkLand = false) {
        const validPosition = x >= 0 && y >= 0 &&
                            x < this.world.cols && y < this.world.rows &&
                            !this.world.isMountain(x, y);
        
        if (!validPosition) return false;
        
        if (checkWater) return this.world.isWater(x, y);
        if (checkLand) return !this.world.isWater(x, y);
        
        return true;
    }

    update() {
        this.age++;
        this.energy -= 0.5;
        if (this.energy <= 0) this.health -= 10;
    }

    getVisibleHexes() {
        // Кэшируем по позиции
        const positionKey = `${this.x},${this.y}`;
        
        if (this.cachedVisibleHexes && 
            this.cachedVisibleHexes.key === positionKey) {
            return this.cachedVisibleHexes.hexes;
        }
        
        // Получаем ВСЕ гексы в радиусе (уже отсортированные)
        const allHexes = this.getAllHexesInVisionRange();
        
        // Используем LOS.js для определения видимости
        const isObstacle = (x, y) => {
            if (x < 0 || y < 0 || x >= this.world.cols || y >= this.world.rows) {
                return true;
            }
            return this.world.isMountain(x, y); // Только горы блокируют обзор
        };
        
        const visibleHexes = LineOfSight.getVisibleHexes(
            { x: this.x, y: this.y },
            allHexes,
            isObstacle,
            this.world.cols,
            this.world.rows
        );
        
        // Кэшируем результат
        this.cachedVisibleHexes = {
            key: positionKey,
            hexes: visibleHexes
        };
        
        return visibleHexes;
    }

    getCachedVisibleHexes() {
        return this.cachedVisibleHexes?.hexes || [];
    }

    getAllHexesCache() {
        return this.cachedAllHexes.hexes;
    }

    getMountainCache() {
        return this.cachedMountainHexesInVisionRange;
    }

    learn(batchSize = 16) {
        if (this.memory.length < batchSize) return;

        // 1. Формируем батч для обучения (приоритет важным воспоминаниям)
        const trainingBatch = this.createPrioritizedBatch(batchSize);
        
        if (trainingBatch.length === 0) return;

        let totalTdError = 0;
        let trainingCount = 0;

        // 2. ОБУЧАЕМ и собираем метрики
        trainingBatch.forEach(({ state, actionIndex, reward, nextState }) => {
            try {
                const basicState = state.slice(0, this.basicInputSize);
                const visionInput = state.slice(this.basicInputSize);
                
                let nextBasicState = [];
                let nextVisionInput = [];
                
                if (nextState && nextState.length > 0) {
                    nextBasicState = nextState.slice(0, this.basicInputSize);
                    nextVisionInput = nextState.slice(this.basicInputSize);
                }
                
                // Обучаем и получаем TD ошибку
                const tdError = this.brain.train(
                    { basic: basicState, vision: visionInput }, 
                    actionIndex, 
                    reward, 
                    nextState ? { basic: nextBasicState, vision: nextVisionInput } : null
                );
                
                if (tdError && typeof tdError === 'number') {
                    totalTdError += tdError;
                    trainingCount++;
                }
                
            } catch (e) {
                console.error('Training step failed:', e);
            }
        });

        // 3. ОБНОВЛЯЕМ МЕТРИКИ ОБУЧЕНИЯ
        if (trainingCount > 0) {
            const avgTdError = totalTdError / trainingCount;
            
            // Сохраняем TD ошибку для отслеживания прогресса
            this.trainingMetrics.tdErrors.push(avgTdError);
            if (this.trainingMetrics.tdErrors.length > 50) {
                this.trainingMetrics.tdErrors.shift(); // держим только последние 50
            }
            
            // Обновляем exploration rate на основе успешности
            this.updateExplorationRate();
            
            /*/ Логируем прогресс каждые 50 тиков
            if (this.age % 50 === 0) {
                const metrics = this.getTrainingMetrics();
                console.log(
                    `🧠 Fox ${this.id} Learn Progress:\n` +
                    `   TD Error: ${avgTdError.toFixed(3)} (avg: ${metrics.avgTdError.toFixed(3)})\n` +
                    `   Q Stability: ${metrics.qValueStability.toFixed(3)}\n` +
                    `   Efficiency: ${metrics.explorationEfficiency.toFixed(3)}\n` +
                    `   Progress: ${(metrics.learningProgress * 100).toFixed(1)}%`
                );
            }*/
        }
    }

    createPrioritizedBatch(batchSize) {
        if (this.memory.length < batchSize) {
            return [...this.memory];
        }

        const batch = [];
        
        // 1. Обязательно последние 25% (самые актуальные)
        const recentCount = Math.floor(batchSize * 0.25);
        for (let i = 1; i <= recentCount; i++) {
            if (this.memory[this.memory.length - i]) {
                batch.push(this.memory[this.memory.length - i]);
            }
        }
        
        // 2. Важные воспоминания (50%) - с высокой наградой/штрафом
        const importantMemories = [];
        const remainingForImportant = Math.floor(batchSize * 0.5);
        
        // Находим порог для "важных" воспоминаний
        const rewardThreshold = this.memory
            .slice(0, -recentCount)
            .map(m => Math.abs(m.reward))
            .sort((a, b) => b - a)[Math.floor(remainingForImportant * 0.3)] || 0;
        
        for (let i = 0; i < this.memory.length - recentCount && importantMemories.length < remainingForImportant; i++) {
            if (Math.abs(this.memory[i].reward) >= rewardThreshold) {
                importantMemories.push(this.memory[i]);
            }
        }
        
        // 3. Случайные воспоминания (25%) - для разнообразия
        const randomMemories = [];
        const remainingSlots = batchSize - batch.length - importantMemories.length;
        
        for (let i = 0; i < remainingSlots; i++) {
            const randomIndex = Math.floor(Math.random() * (this.memory.length - recentCount));
            const memory = this.memory[randomIndex];
            if (!batch.includes(memory) && !importantMemories.includes(memory)) {
                randomMemories.push(memory);
            }
        }
        
        return [...batch, ...importantMemories, ...randomMemories];
    }

    updateExplorationRate() {
        // !!!
        return;
        const metrics = this.getTrainingMetrics();
        
        // Уменьшаем exploration rate если обучение успешно
        if (metrics.learningProgress > 0.1 && metrics.explorationEfficiency > 0.4) {
            this.trainingMetrics.explorationRate = Math.max(0.05, this.trainingMetrics.explorationRate * 0.98);
        }
        
        // Увеличиваем если застряли
        if (metrics.learningProgress < -0.1 || metrics.explorationEfficiency < 0.2) {
            this.trainingMetrics.explorationRate = Math.min(0.6, this.trainingMetrics.explorationRate * 1.05);
        }
    }

    getTrainingMetrics() {
        const recentMemories = this.memory.slice(-20);
        
        if (recentMemories.length === 0) {
            return {
                avgTdError: 1.0,
                qValueStability: 0,
                explorationEfficiency: 0,
                learningProgress: 0,
                policyMaturity: 0
            };
        }

        // Расчет TD ошибок
        const tdErrors = recentMemories.map(exp => {
            try {
                const currentQ = this.predictQValue(exp.state, exp.actionIndex);
                const targetQ = exp.reward + this.brain.discountFactor * this.predictMaxQ(exp.nextState);
                return Math.abs(targetQ - currentQ);
            } catch (e) {
                return 1.0;
            }
        });
        
        const avgTdError = tdErrors.reduce((a, b) => a + b, 0) / tdErrors.length;

        // Стабильность Q-значений
        const recentQValues = recentMemories.map(exp => 
            this.predictMaxQ(exp.state)
        );
        const qVariance = this.calculateVariance(recentQValues);
        const qValueStability = 1 / (1 + qVariance);

        // Эффективность исследования
        const successfulActions = recentMemories.filter(exp => exp.reward > 0).length;
        const explorationEfficiency = successfulActions / recentMemories.length;

        // Прогресс обучения (снижение ошибки)
        const learningProgress = this.calculateLearningProgress();

        // Зрелость политики (уверенность предсказаний)
        const policyMaturity = this.calculatePolicyMaturity();

        return {
            avgTdError,
            qValueStability: Math.min(1, qValueStability),
            explorationEfficiency,
            learningProgress: Math.max(-1, Math.min(1, learningProgress)),
            policyMaturity: Math.min(1, policyMaturity),
            compositeScore: this.calculateCompositeScore(avgTdError, qValueStability, explorationEfficiency)
        };
    }

    predictQValue(state, actionIndex) {
        // !!!
        return;
        try {
            const basicState = state.slice(0, this.basicInputSize);
            const visionInput = state.slice(this.basicInputSize);
            const output = this.brain.predictSync(basicState, visionInput);
            return output[actionIndex] || 0;
        } catch (e) {
            return 0;
        }
    }

    predictMaxQ(state) {
        // !!!
        return;
        try {
            const basicState = state.slice(0, this.basicInputSize);
            const visionInput = state.slice(this.basicInputSize);
            const output = this.brain.predictSync(basicState, visionInput);
            return Math.max(...output);
        } catch (e) {
            return 0;
        }
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    }

    calculateLearningProgress() {
        if (this.trainingMetrics.tdErrors.length < 10) return 0;
        
        const recentErrors = this.trainingMetrics.tdErrors.slice(-5);
        const olderErrors = this.trainingMetrics.tdErrors.slice(-10, -5);
        
        if (olderErrors.length === 0) return 0;
        
        const recentAvg = recentErrors.reduce((a, b) => a + b, 0) / recentErrors.length;
        const olderAvg = olderErrors.reduce((a, b) => a + b, 0) / olderErrors.length;
        
        return (olderAvg - recentAvg) / olderAvg; // положительное = улучшение
    }

    calculatePolicyMaturity() {
        const recentMemories = this.memory.slice(-15);
        if (recentMemories.length === 0) return 0;
        
        const confidences = recentMemories.map(exp => {
            try {
                const output = this.predictMaxQ(exp.state);
                return output;
            } catch (e) {
                return 0;
            }
        });
        
        return confidences.reduce((a, b) => a + b, 0) / confidences.length;
    }

    calculateCompositeScore(tdError, stability, efficiency) {
        // Весовые коэффициенты
        const tdWeight = 0.4;    // 40% - качество обучения
        const stabilityWeight = 0.3; // 30% - стабильность
        const efficiencyWeight = 0.2; // 20% - эффективность
        const ageWeight = 0.1;   // 10% - долгожительство
        
        const tdScore = 1 / (1 + tdError); // Ошибка -> оценка (чем меньше ошибка, тем лучше)
        const ageScore = Math.min(1, this.age / 1000);
        
        return (tdScore * tdWeight) + 
            (stability * stabilityWeight) + 
            (efficiency * efficiencyWeight) + 
            (ageScore * ageWeight);
    }

    calculateBrainQuality(metrics) {
        const tdError = metrics.avgTdError || 1.0;
        const stability = metrics.qValueStability || 0;
        const successRate = metrics.successRate || 0;
        
        // Нормализуем TD error - чем меньше, тем лучше (максимум 2000)
        const normalizedTd = Math.max(0, 1 - (tdError / 2000));
        
        // Композитный score
        const compositeScore = 
            (normalizedTd * 0.4) + 
            (stability * 0.3) + 
            (successRate * 0.2) +
            (this.age / 1000 * 0.1);
        
        return {
            compositeScore,
            normalizedTd,
            stability,
            successRate
        };
    }

    validateBrainDimensions(brain) {
        if (!brain) return false;
        
        if (brain instanceof DualStreamNeuralNetwork) {
            return brain.basicInputSize === this.basicInputSize && 
                brain.visionInputSize === this.visionInputSize &&
                brain.outputSize === this.totalActions;
        }
        
        return false;
    }

    static createBrainFromData(brainData) {
        if (!brainData) return null;
        
        try {
            if (brainData.type === 'dualStream') {
                const brain = new DualStreamNeuralNetwork(
                    brainData.basicInputSize,
                    brainData.visionInputSize,
                    brainData.outputSize
                );
                
                // Сохраняем поколение
                brain.generation = brainData.generation || 0;
                
                // Загружаем все компоненты
                if (brainData.networks?.stateStream) {
                    brain.stateStream = Entity.loadSingleNetwork(brainData.networks.stateStream);
                }
                if (brainData.networks?.visionStream) {
                    brain.visionStream = Entity.loadSingleNetwork(brainData.networks.visionStream);
                }
                if (brainData.networks?.fusionNetwork) {
                    brain.fusionNetwork = Entity.loadSingleNetwork(brainData.networks.fusionNetwork);
                }
                
                brain.totalReward = brainData.totalReward || 0;
                brain.learningRate = brainData.learningRate || 0.1;

                return brain;
            } else {
                // Для обратной совместимости
                const brain = new DualStreamNeuralNetwork(
                    brainData.basicInputSize || this.basicInputSize,
                    brainData.visionInputSize || this.visionInputSize,
                    brainData.outputSize || this.totalActions
                );
                
                brain.generation = brainData.generation || 0;
                
                if (brainData.networks?.main) {
                    brain.fusionNetwork = Entity.loadSingleNetwork(brainData.networks.main);
                }
                
                brain.totalReward = brainData.totalReward || 0;
                return brain;
            }
        } catch (e) {
            console.error('Failed to create brain from data:', e);
            return null;
        }
    }

    static loadSingleNetwork(networkData) {
        if (!networkData || networkData.type !== 'neural') {
            console.warn('Invalid network data structure:', networkData);
            return null;
        }

        try {
            const network = new NeuralNetwork(
                networkData.inputSize,
                networkData.hiddenSizes,
                networkData.outputSize
            );
            
            // ГАРАНТИРУЕМ корректную загрузку весов
            if (networkData.weights && Array.isArray(networkData.weights)) {
                network.weights = networkData.weights.map(layerData => {
                    if (!layerData || !Array.isArray(layerData)) {
                        // Создаем новые веса если данные повреждены
                        const layerSize = network.layerSizes[network.weights.length];
                        const nextLayerSize = network.layerSizes[network.weights.length + 1];
                        return new Float32Array(layerSize * nextLayerSize).fill(0.1);
                    }
                    
                    // Фильтруем null и невалидные значения
                    const cleanLayer = layerData.map(val => 
                        (val !== null && isFinite(val)) ? val : 0.1 * (Math.random() - 0.5)
                    );
                    return new Float32Array(cleanLayer);
                });
            }
            
            // ГАРАНТИРУЕМ корректную загрузку смещений
            if (networkData.biases && Array.isArray(networkData.biases)) {
                network.biases = networkData.biases.map(layerData => {
                    if (!layerData || !Array.isArray(layerData)) {
                        const layerSize = network.layerSizes[network.biases.length + 1];
                        return new Float32Array(layerSize).fill(0.1);
                    }
                    
                    const cleanLayer = layerData.map(val => 
                        (val !== null && isFinite(val)) ? val : 0.1
                    );
                    return new Float32Array(cleanLayer);
                });
            }
            
            network.learningRate = networkData.learningRate || 0.1;
            network.discountFactor = networkData.discountFactor || 0.95;
            
            return network;
        } catch (e) {
            console.error('Failed to load single network:', e);
            // Возвращаем новую сеть вместо null (Рандомная)
            return new NeuralNetwork(
                networkData?.inputSize || 10,
                networkData?.hiddenSizes || [8],
                networkData?.outputSize || 6
            );
        }
    }

    loadBrain() {
        const savedBrains = loadBestBrains(this.type);
        
        if (savedBrains && savedBrains.length > 0) {
            const selectedBrainData = savedBrains[0];
            
            try {
                const brain = Entity.createBrainFromData(selectedBrainData);
                if (brain && this.validateBrainDimensions(brain)) {
                    const newGeneration = (selectedBrainData.generation || 0) + 1;
                    this.generation = newGeneration;
                    //console.log(`🔄 ${this.type} ${this.id} loaded brain generation ${selectedBrainData.generation || 0} -> ${newGeneration}`);
                    return brain;
                }
            } catch (e) {
                console.error('Failed to create brain from saved data:', e);
            }
        }
        
        // Создаем новый с правильными размерами
        //console.log(`🔄 ${this.type} ${this.id} created with new brain (no saved brains available)`);
        return new DualStreamNeuralNetwork(this.basicInputSize, this.visionInputSize, this.totalActions);
    }

    saveBrain() {
        try {
            if (!this.brain) {
                console.warn('No brain to save');
                return;
            }

            const metrics = this.getTrainingMetrics();
            let brainData;

            if (this.brain instanceof DualStreamNeuralNetwork) {
                brainData = this.getNetworkData(this.brain);
            } else {
                brainData = {
                    type: 'dualStream',
                    generation: this.generation,
                    basicInputSize: this.basicInputSize,
                    visionInputSize: this.visionInputSize,
                    outputSize: this.totalActions,
                    totalReward: this.totalReward,
                    networks: {
                        stateStream: this.getNetworkData(this.brain.stateStream),
                        visionStream: this.getNetworkData(this.brain.visionStream),
                        fusionNetwork: this.getNetworkData(this.brain.fusionNetwork)
                    }
                };
            }

            if (!brainData) {
                console.error('Failed to collect brain data');
                return;
            }

            // ГАРАНТИРУЕМ что поколение сохраняется
            brainData.generation = this.generation || 0;
            
            brainData.trainingMetrics = metrics;
            brainData.compositeScore = metrics.compositeScore;
            brainData.brainQuality = this.calculateBrainQuality(metrics);

            brainData.entityInfo = {
                id: this.id,
                totalReward: this.totalReward,
                age: this.age,
                health: this.health,
                energy: this.energy,
                hunger: this.hunger,
                thirst: this.thirst
            };

            // ИСПОЛЬЗУЕМ НОВУЮ СИСТЕМУ С БУФЕРОМ
            const currentPopulation = getCurrentPopulation(this.type, this.world);
            saveBrainWithBuffer(brainData, this.type, currentPopulation);

        } catch (e) {
            console.error('Failed to save brain:', e);
        }
    }

    cloneBrain() {
        if (!this.brain) throw new Error("No brain to clone");
        
        if (this.brain instanceof DualStreamNeuralNetwork) {
            return this.brain.clone();
        } else {
            // Для обратной совместимости
            const clone = new DualStreamNeuralNetwork(this.basicInputSize, this.visionInputSize, this.totalActions);
            clone.totalReward = this.totalReward;
            return clone;
        }
    }

    decideAction(lastState) {
        try {
            const basicState = lastState.basic;
            const visionInput = lastState.vision;
            
            
            const expectedVisionSize = this.visionInputSize;
            if (!visionInput || visionInput.length !== expectedVisionSize) {
                console.error(`Invalid vision input: expected ${expectedVisionSize}, got ${visionInput?.length}`);
                return this.getFallbackAction();
            }
            
            /* !!!
            let output;
            if (this.brain.predictDual) {
                // Используем СИНХРОННУЮ версию для двухпоточного predict
                output = this.brain.predictSync(basicState, visionInput);
            } else if (this.brain.predictSingle) {
                // Старый predict для обратной совместимости
                const combinedInput = [...basicState, ...visionInput];
                output = this.brain.predictSingleSync(combinedInput);
            } else {
                // Запасной вариант
                output = new Array(10).fill(0.1);
            }
            */

            //const explorationRate = Math.max(0.01, 0.4 - this.age / 800);
            //!!!
            const explorationRate = 2;

            // Исследование
            if (Math.random() < explorationRate) {
                return this.getRandomAction();
            }

            /*/ Или softmax с температурой
            const temperature = 1.5; // Увеличивает разнообразие
            const tempered = prediction.map(p => Math.exp(p / temperature));
            const sum = tempered.reduce((a, b) => a + b, 0);
            const probabilities = tempered.map(p => p / sum);
            
            // Исследование
            // Выбор действия на основе вероятностей
            let random = Math.random();
            for (let i = 0; i < probabilities.length; i++) {
                random -= probabilities[i];
                if (random <= 0) return this.getActionByIndex(i);
            }*/

            // Эксплуатация
            const actionIndex = output.indexOf(Math.max(...output));
            this.lastActionId = actionIndex;
            return this.getActionByIndex(actionIndex);
            
        } catch (e) {
            console.error('Decision failed:', e);
            return this.getFallbackAction();
        }
    }
    
}

export class Algae extends WorldEntity {
    constructor(x, y, world) {
        super(x, y, world);
        this.growth = 0;  // Начинаем с 0
        this.health = 100;
        this.growthRate = 0.05;  // Водоросли растут быстрее
    }

    update() {
        // Растём только если живы
        if (this.health > 0) {
            this.growth = Math.min(1, this.growth + this.growthRate);
            
            // Размножение при максимальном росте
            if (this.growth >= 1 && Math.random() < 0.1) {
                this.spread();
                this.growth = 0;  // Сбрасываем рост после размножения
            }
        }
    }

    spread() {
        const dirs = this.getHexDirections();
        if (dirs.length === 0) return;

        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        const x = Math.min(this.world.cols - 1, Math.max(0, this.x + dx));
        const y = Math.min(this.world.rows - 1, Math.max(0, this.y + dy));

        if (this.world.isWater(x, y) &&
            this.world.entities &&
            Array.isArray(this.world.entities.algae) &&
            !this.world.entities.algae.some(a => a.x === x && a.y === y)) {
            this.world.entities.algae.push(new Algae(x, y, this.world));
        }
    }

    // Метод для поедания
    getEaten() {
        if (this.growth < 1) {
            // Не полностью выросло - теряем здоровье
            this.health -= 50;
            const nutrition = this.growth * 15;  // Питательность пропорциональна росту
            this.growth = 0;
            
            // Умираем если здоровье <= 0
            if (this.health <= 0) {
                return { nutrition, shouldRemove: true };
            }
            return { nutrition, shouldRemove: false };
        } else {
            // Полностью выросло - даём полную питательность
            const nutrition = 15;
            this.growth = 0;
            return { nutrition, shouldRemove: false };
        }
    }
}

export class Grass extends WorldEntity {
    constructor(x, y, world) {
        super(x, y, world);
        this.growth = 0;  // Начинаем с 0
        this.health = 100;
        this.growthRate = 0.03;  // Скорость роста травы
    }

    update() {
        // Растём только если живы
        if (this.health > 0) {
            this.growth = Math.min(1, this.growth + this.growthRate);
            
            // Размножение при максимальном росте
            if (this.growth >= 1 && Math.random() < 0.1) {
                this.spread();
                this.growth = 0;  // Сбрасываем рост после размножения
            }
        }
    }

    spread() {
        const dirs = this.getHexDirections();
        if (dirs.length === 0) return;

        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        const x = Math.min(this.world.cols - 1, Math.max(0, this.x + dx));
        const y = Math.min(this.world.rows - 1, Math.max(0, this.y + dy));

        if (!this.world.isWater(x, y) && !this.world.isMountain(x, y) &&
            this.world.entities &&
            Array.isArray(this.world.entities.grass) &&
            !this.world.entities.grass.some(g => g.x === x && g.y === y)) {
            this.world.entities.grass.push(new Grass(x, y, this.world));
        }
    }

    // Метод для поедания
    getEaten() {
        if (this.growth < 1) {
            // Не полностью выросло - теряем здоровье
            this.health -= 50;
            const nutrition = this.growth * 20;  // Питательность пропорциональна росту
            this.growth = 0;
            
            // Умираем если здоровье <= 0
            if (this.health <= 0) {
                return { nutrition, shouldRemove: true };
            }
            return { nutrition, shouldRemove: false };
        } else {
            // Полностью выросло - даём полную питательность
            const nutrition = 20;
            this.growth = 0;
            return { nutrition, shouldRemove: false };
        }
    }
}