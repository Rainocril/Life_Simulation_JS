// TensorFlowRLAgentOptimized.js
import { Profiler } from '../Profiler.js';

export class TensorFlowRLAgent {
    constructor(basicInputSize, visionInputSize, outputSize) {
        this.basicInputSize = basicInputSize;
        this.visionInputSize = visionInputSize;
        this.outputSize = outputSize;
        this.cachedResult = new Array(outputSize);
        
        // Гиперпараметры
        this.discountFactor = 0.95;
        this.learningRate = 0.001;
        this.epsilon = 0.3;
        this.epsilonDecay = 0.995;
        this.minEpsilon = 0.05;
        this.batchSize = 32;
        this.memorySize = 2000;
        
        // Пул переиспользуемых тензоров
        this.tensorPool = {
            basic: null,
            vision: null,
            prediction: null
        };
        
        // Кэш предсказаний
        this.predictionCache = new Map();
        this.cacheMaxSize = 500;
        this.cacheHits = 0;
        this.cacheMisses = 0;
        
        // Очередь для батчинга
        this.predictionQueue = [];
        this.isProcessingQueue = false;
        
        this.memory = [];
        
        // Создаем модели
        this.model = this.buildModel();
        this.targetModel = this.buildModel();
        this.updateTargetModel();
        
        this.totalReward = 0;
        this.trainingSteps = 0;
        
        // Статистика
        this.predictCalls = 0;
        this.lastLogTime = Date.now();
    }
    
    buildModel() {
        Profiler.start('buildModel');
        const basicInput = tf.input({ shape: [this.basicInputSize], name: 'basic' });
        const visionInput = tf.input({ shape: [this.visionInputSize], name: 'vision' });
        
        // Максимально упрощенная архитектура
        let basicStream = basicInput;
        basicStream = tf.layers.dense({ units: 8, activation: 'relu' }).apply(basicStream);
        
        let visionStream = visionInput;
        visionStream = tf.layers.dense({ units: 16, activation: 'relu' }).apply(visionStream);
        
        const concatenated = tf.layers.concatenate().apply([basicStream, visionStream]);
        
        let fusion = concatenated;
        fusion = tf.layers.dense({ units: 16, activation: 'relu' }).apply(fusion);
        
        const output = tf.layers.dense({ units: this.outputSize, activation: 'linear' }).apply(fusion);
        
        const model = tf.model({ inputs: [basicInput, visionInput], outputs: output });
        
        model.compile({
            optimizer: tf.train.adam(this.learningRate),
            loss: 'meanSquaredError'
        });
        Profiler.end('buildModel');
        return model;
    }
    
    updateTargetModel() {
        Profiler.start('updateTargetModel');
        const weights = this.model.getWeights();
        this.targetModel.setWeights(weights);
        Profiler.end('updateTargetModel');
    }
    
    // ОПТИМИЗАЦИЯ 1: Кэширование предсказаний
    getStateKey(basicState, visionState) {
        // Простой хэш для кэша
        Profiler.start('getStateKey');
        let hash = 0;
        for (let i = 0; i < 4; i++) hash = (hash * 31 + (basicState[i] * 1000) | 0) % 1000000;
        for (let i = 0; i < 10; i++) hash = (hash * 31 + (visionState[i] * 1000) | 0) % 1000000;
        Profiler.end('getStateKey');
        return hash;
    }
    
    predict(basicState, visionState) {
        // Статистика
        Profiler.start('predict');
        this.predictCalls++;
        const now = Date.now();
        if (now - this.lastLogTime > 1000) {
            console.log(`Predict calls/sec: ${this.predictCalls}, Cache hits: ${this.cacheHits}, misses: ${this.cacheMisses}`);
            this.predictCalls = 0;
            this.lastLogTime = now;
        }
        
        // 1. Проверяем кэш
        const cacheKey = this.getStateKey(basicState, visionState);
        if (this.predictionCache.has(cacheKey)) {
            this.cacheHits++;
            Profiler.end('predict');
            return this.predictionCache.get(cacheKey);
        }
        
        this.cacheMisses++;
        
        try {
            // 2. Используем переиспользуемые тензоры
            if (!this.tensorPool.basic) {
                this.tensorPool.basic = tf.tensor2d([basicState], [1, this.basicInputSize]);
                this.tensorPool.vision = tf.tensor2d([visionState], [1, this.visionInputSize]);
            } else {
                // Переиспользуем существующие тензоры (обновляем данные)
                this.tensorPool.basic.dispose();
                this.tensorPool.vision.dispose();
                this.tensorPool.basic = tf.tensor2d([basicState], [1, this.basicInputSize]);
                this.tensorPool.vision = tf.tensor2d([visionState], [1, this.visionInputSize]);
            }
            
            const prediction = this.model.predict([this.tensorPool.basic, this.tensorPool.vision]);
            const qValues = prediction.dataSync();
            for (let i = 0; i < this.outputSize; i++) {
                this.cachedResult[i] = qValues[i];
            }
            const result = this.cachedResult;
            
            // Очищаем prediction (тензоры basic/vision оставляем для переиспользования)
            prediction.dispose();
            
            // Сохраняем в кэш
            if (this.predictionCache.size > this.cacheMaxSize) {
                const firstKey = this.predictionCache.keys().next().value;
                this.predictionCache.delete(firstKey);
            }
            this.predictionCache.set(cacheKey, result);
            Profiler.end('predict');
            return result;
            
        } catch (error) {
            console.error('Prediction error:', error);
            Profiler.end('predict');
            return new Array(this.outputSize).fill(0);
        }
    }
    
    // ОПТИМИЗАЦИЯ 2: Асинхронное предсказание с батчингом
    async predictAsync(basicState, visionState) {
        return new Promise((resolve) => {
            this.predictionQueue.push({
                basicState: [...basicState],
                visionState: [...visionState],
                resolve
            });
            
            if (!this.isProcessingQueue) {
                this.processQueue();
            }
        });
    }
    
    async processQueue() {
        Profiler.start('processQueue');
        if (this.isProcessingQueue) return;
        if (this.predictionQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        // Ждём накопления запросов
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const batch = this.predictionQueue.splice(0, 32); // Максимум 32 запроса за раз
        
        try {
            // ОДИН forward pass для всех запросов в батче
            const basicStates = batch.map(req => req.basicState);
            const visionStates = batch.map(req => req.visionState);
            
            const basicTensor = tf.tensor2d(basicStates, [batch.length, this.basicInputSize]);
            const visionTensor = tf.tensor2d(visionStates, [batch.length, this.visionInputSize]);
            
            const predictions = this.model.predict([basicTensor, visionTensor]);
            const qValuesArray = await predictions.data();
            
            // Раздаём результаты
            for (let i = 0; i < batch.length; i++) {
                const startIdx = i * this.outputSize;
                const qValues = Array.from(qValuesArray.slice(startIdx, startIdx + this.outputSize));
                batch[i].resolve(qValues);
            }
            
            // Очистка
            basicTensor.dispose();
            visionTensor.dispose();
            predictions.dispose();
            
        } catch (error) {
            console.error('Batch prediction error:', error);
            batch.forEach(req => req.resolve(new Array(this.outputSize).fill(0)));
        }
        
        this.isProcessingQueue = false;
        
        // Обрабатываем следующие запросы
        if (this.predictionQueue.length > 0) {
            this.processQueue();
        }
        Profiler.end('processQueue');
    }
    
    decideAction(basicState, visionState) {
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.outputSize);
        }
        
        // Используем кэшированное синхронное предсказание
        const qValues = this.predict(basicState, visionState);
        return qValues.indexOf(Math.max(...qValues));
    }
    
    // Асинхронная версия для решений (не блокирует)
    async decideActionAsync(basicState, visionState) {
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.outputSize);
        }
        
        const qValues = await this.predictAsync(basicState, visionState);
        return qValues.indexOf(Math.max(...qValues));
    }
    
    remember(state, action, reward, nextState, done = false) {
        Profiler.start('remember');
        if (!state || !nextState) return;
        
        // Оптимизация: не копируем массивы, если не нужно
        const basicState = Array.isArray(state.basic) && state.basic.length === this.basicInputSize 
            ? state.basic : new Array(this.basicInputSize).fill(0);
            
        const visionState = Array.isArray(state.vision) && state.vision.length === this.visionInputSize
            ? state.vision : new Array(this.visionInputSize).fill(0);
            
        const nextBasicState = Array.isArray(nextState.basic) && nextState.basic.length === this.basicInputSize
            ? nextState.basic : new Array(this.basicInputSize).fill(0);
            
        const nextVisionState = Array.isArray(nextState.vision) && nextState.vision.length === this.visionInputSize
            ? nextState.vision : new Array(this.visionInputSize).fill(0);
        
        this.memory.push({
            basicState,
            visionState,
            action,
            reward,
            nextBasicState,
            nextVisionState,
            done
        });
        
        this.totalReward += reward;
        
        if (this.memory.length > this.memorySize) {
            this.memory.shift();
        }
        Profiler.end('remember');
    }
    
    async train(batchSize = null) {
        Profiler.end('train');
        const size = batchSize || this.batchSize;
        if (this.memory.length < size) return;
        
        try {
            const batch = this.getRandomBatch(size);
            
            const basicStates = batch.map(e => e.basicState);
            const visionStates = batch.map(e => e.visionState);
            const actions = batch.map(e => e.action);
            const rewards = batch.map(e => e.reward);
            const nextBasicStates = batch.map(e => e.nextBasicState);
            const nextVisionStates = batch.map(e => e.nextVisionState);
            const dones = batch.map(e => e.done);
            
            // Создаём тензоры для всего батча
            Profiler.start('createTensors');
            const basicTensor = tf.tensor2d(basicStates, [size, this.basicInputSize]);
            const visionTensor = tf.tensor2d(visionStates, [size, this.visionInputSize]);
            const nextBasicTensor = tf.tensor2d(nextBasicStates, [size, this.basicInputSize]);
            const nextVisionTensor = tf.tensor2d(nextVisionStates, [size, this.visionInputSize]);
            Profiler.end('createTensors');
            const currentQValues = this.model.predict([basicTensor, visionTensor]);
            const nextQValues = this.targetModel.predict([nextBasicTensor, nextVisionTensor]);
            
            const [currentQData, nextQData] = await Promise.all([
                currentQValues.data(),
                nextQValues.data()
            ]);
            
            const targetQData = new Float32Array(currentQData.length);
            
            for (let i = 0; i < size; i++) {
                const baseIdx = i * this.outputSize;
                for (let j = 0; j < this.outputSize; j++) {
                    targetQData[baseIdx + j] = currentQData[baseIdx + j];
                }
                
                let maxNextQ = 0;
                if (!dones[i]) {
                    maxNextQ = Math.max(...Array.from(nextQData.slice(baseIdx, baseIdx + this.outputSize)));
                }
                
                targetQData[baseIdx + actions[i]] = rewards[i] + this.discountFactor * maxNextQ;
            }
            
            const targetTensor = tf.tensor2d(targetQData, [size, this.outputSize]);
            
            await this.model.fit(
                [basicTensor, visionTensor],
                targetTensor,
                { batchSize: size, epochs: 1, verbose: false }
            );
            
            // Очистка
            basicTensor.dispose();
            visionTensor.dispose();
            nextBasicTensor.dispose();
            nextVisionTensor.dispose();
            currentQValues.dispose();
            nextQValues.dispose();
            targetTensor.dispose();
            
            this.trainingSteps++;
            
            if (this.trainingSteps % 10 === 0) {
                this.updateTargetModel();
            }
            
            this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
            
            // Очищаем кэш после обучения
            this.predictionCache.clear();
            
        } catch (error) {
            console.error('Training error:', error);
        }
        Profiler.end('train');
    }
    
    trainSync(batchSize = null) {
        this.train(batchSize).catch(console.error);
    }
    
    getRandomBatch(batchSize) {
        const indices = new Set();
        while (indices.size < batchSize) {
            indices.add(Math.floor(Math.random() * this.memory.length));
        }
        return Array.from(indices).map(i => this.memory[i]);
    }
    
    getCacheStats() {
        const total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) + '%' : '0%',
            cacheSize: this.predictionCache.size,
            queueLength: this.predictionQueue.length
        };
    }
    
    dispose() {
        Profiler.start('dispose');
        if (this.tensorPool.basic) this.tensorPool.basic.dispose();
        if (this.tensorPool.vision) this.tensorPool.vision.dispose();
        if (this.tensorPool.prediction) this.tensorPool.prediction.dispose();
        
        if (this.model && !this.model.disposed) {
            this.model.dispose();
        }
        if (this.targetModel && !this.targetModel.disposed) {
            this.targetModel.dispose();
        }
        
        this.memory = [];
        this.predictionCache.clear();
        this.predictionQueue = [];
        Profiler.end('dispose');
    }
}