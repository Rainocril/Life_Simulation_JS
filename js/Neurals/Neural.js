// Neural.js
const sharedGPU = typeof window !== 'undefined' && window.GPU ? new window.GPU.GPU() : null;

// БАЗОВЫЙ КЛАСС НЕЙРОСЕТИ
export class BaseNeuralNetwork {
    constructor(inputSize, hiddenSizes, outputSize) {
        this.inputSize = inputSize;
        this.hiddenSizes = Array.isArray(hiddenSizes) ? hiddenSizes : [hiddenSizes];
        this.outputSize = outputSize;
        
        // Гиперпараметры
        this.learningRate = 0.05; // Уменьшил с 0.1 до 0.05
        this.discountFactor = 0.9; // Уменьшил с 0.95
        
        // Структуры данных
        this.weights = [];
        this.biases = [];
        this.layerSizes = [inputSize, ...this.hiddenSizes, outputSize];
        this.totalReward = 0;
        
        // Параллельные настройки
        this.gpu = sharedGPU;
        this.gpuEnabled = false;
        
        this.initWeightsAndBiases();
        this.setupGPUKernels();
    }

    initWeightsAndBiases() {
        this.weights = [];
        this.biases = [];
        
        for (let i = 0; i < this.layerSizes.length - 1; i++) {
            const inputSize = this.layerSizes[i];
            const outputSize = this.layerSizes[i + 1];
            const totalWeights = outputSize * inputSize;
            
            // Улучшенная инициализация для больших входных размеров
            const scale = Math.sqrt(2.0 / inputSize);
            const weights = new Float32Array(totalWeights);
            const biases = new Float32Array(outputSize);
            
            for (let j = 0; j < totalWeights; j++) {
                weights[j] = (Math.random() * 2 - 1) * scale;
                // Гарантируем, что все веса инициализированы
                if (Math.abs(weights[j]) < 0.001) {
                    weights[j] = 0.001 * (Math.random() > 0.5 ? 1 : -1);
                }
            }
            
            for (let j = 0; j < outputSize; j++) {
                biases[j] = (Math.random() * 0.2) + 0.1;
            }
            
            this.weights.push(weights);
            this.biases.push(biases);
        }
    }

    setupGPUKernels() {
        if (!this.gpu) return;
        // ... остальной код без изменений ...
    }

    normalizeInput(input) {
        if (!Array.isArray(input)) {
            return new Float32Array(this.inputSize);
        }
        
        const normalized = new Float32Array(this.inputSize);
        const inputLength = Math.min(input.length, this.inputSize);
        
        for (let i = 0; i < inputLength; i++) {
            const val = input[i];
            normalized[i] = (typeof val === 'number' && !isNaN(val)) ? val : 0;
        }
        
        return normalized;
    }

    fastSoftmax(input) {
        if (!input || input.length === 0) return this.getFallbackOutput();
        
        const output = new Float32Array(input.length);
        let max = input[0];
        let sum = 0;
        
        for (let i = 1; i < input.length; i++) {
            if (input[i] > max) max = input[i];
        }
        
        for (let i = 0; i < input.length; i++) {
            output[i] = Math.exp(input[i] - max);
            sum += output[i];
        }
        
        if (sum > 1e-10) {
            const invSum = 1.0 / sum;
            for (let i = 0; i < input.length; i++) {
                output[i] *= invSum;
            }
        }
        
        return Array.from(output);
    }

    getFallbackOutput() {
        const result = new Array(this.outputSize);
        const value = 1 / this.outputSize;
        for (let i = 0; i < this.outputSize; i++) {
            result[i] = value;
        }
        return result;
    }

    optimizedSingleForward(input) {
        const normalizedInput = this.normalizeInput(input);
        let current = normalizedInput;
        
        for (let layer = 0; layer < this.weights.length; layer++) {
            const weights = this.weights[layer];
            const biases = this.biases[layer];
            const inputSize = this.layerSizes[layer];
            const outputSize = this.layerSizes[layer + 1];
            const output = new Float32Array(outputSize);
            
            for (let neuron = 0; neuron < outputSize; neuron++) {
                let sum = biases[neuron];
                const weightOffset = neuron * inputSize;
                
                for (let k = 0; k < inputSize; k++) {
                    sum += weights[weightOffset + k] * current[k];
                }
                
                output[neuron] = sum > 0 ? sum : 0.01 * sum; // Leaky ReLU
            }
            
            current = output;
        }
        
        const result = Array.from(this.fastSoftmax(current));
        return result;
    }

    predict(input) {
        try {
            if (!input) return this.getFallbackOutput();

            let result;
            if (Array.isArray(input[0])) {
                // Пакетная обработка
                result = [];
                for (let i = 0; i < input.length; i++) {
                    result.push(this.optimizedSingleForward(input[i]));
                }
            } else {
                result = this.optimizedSingleForward(input);
            }
            
            return Array.isArray(result) ? result : Array.from(result || []);
            
        } catch (e) {
            return this.getFallbackOutput();
        }
    }

    // Прямой проход с возвратом активаций
    forwardWithActivations(input) {
        const activations = [];
        const normalizedInput = this.normalizeInput(input);
        let current = normalizedInput;
        
        activations.push([...current]); // Входной слой
        
        for (let layer = 0; layer < this.weights.length; layer++) {
            const weights = this.weights[layer];
            const biases = this.biases[layer];
            const inputSize = this.layerSizes[layer];
            const outputSize = this.layerSizes[layer + 1];
            const output = new Float32Array(outputSize);
            
            for (let neuron = 0; neuron < outputSize; neuron++) {
                let sum = biases[neuron];
                const weightOffset = neuron * inputSize;
                
                for (let k = 0; k < inputSize; k++) {
                    sum += weights[weightOffset + k] * current[k];
                }
                
                output[neuron] = sum > 0 ? sum : 0.01 * sum; // Leaky ReLU
            }
            
            current = output;
            activations.push([...current]);
        }
        
        return {
            output: Array.from(this.fastSoftmax(current)),
            activations: activations
        };
    }

    // Вычисление градиентов
    calculateGradients(activations, input, outputError) {
        const gradients = {
            weights: [],
            biases: []
        };
        
        let currentError = [...outputError];
        
        // Обратный проход через все слои
        for (let layer = this.weights.length - 1; layer >= 0; layer--) {
            const layerSize = this.layerSizes[layer];
            const nextLayerSize = this.layerSizes[layer + 1];
            
            const weightGradients = new Float32Array(this.weights[layer].length);
            const biasGradients = new Float32Array(this.biases[layer].length);
            
            for (let neuron = 0; neuron < nextLayerSize; neuron++) {
                // Производная ReLU (Leaky для стабильности)
                const derivative = activations[layer + 1][neuron] > 0 ? 1 : 0.01;
                const delta = currentError[neuron] * derivative;
                
                // Градиенты смещений
                biasGradients[neuron] = delta;
                
                // Градиенты весов
                const weightOffset = neuron * layerSize;
                for (let i = 0; i < layerSize; i++) {
                    const inputVal = layer === 0 ? (input[i] || 0) : activations[layer][i];
                    weightGradients[weightOffset + i] = delta * inputVal;
                }
            }
            
            gradients.weights.unshift(weightGradients);
            gradients.biases.unshift(biasGradients);
            
            // Вычисляем ошибку для предыдущего слоя
            if (layer > 0) {
                const prevError = new Array(layerSize).fill(0);
                for (let i = 0; i < layerSize; i++) {
                    for (let neuron = 0; neuron < nextLayerSize; neuron++) {
                        const derivative = activations[layer][i] > 0 ? 1 : 0.01;
                        prevError[i] += currentError[neuron] * this.weights[layer][neuron * layerSize + i] * derivative;
                    }
                }
                currentError = prevError;
            }
        }
        
        return gradients;
    }

    // Применение градиентов
    applyGradients(gradients, learningRate) {
        const clipValue = 0.5; // Жесткое ограничение градиентов
        const l2Lambda = 0.001; // L2 регуляризация
        
        for (let layer = 0; layer < this.weights.length; layer++) {
            // Обновляем веса с clipping
            for (let i = 0; i < this.weights[layer].length; i++) {
                let grad = gradients.weights[layer][i];
                // Gradient clipping
                if (grad > clipValue) grad = clipValue;
                if (grad < -clipValue) grad = -clipValue;
                
                // L2 регуляризация
                const l2Grad = this.weights[layer][i] * l2Lambda;
                this.weights[layer][i] += learningRate * (grad - l2Grad);
                
                // Защита от обнуления
                if (Math.abs(this.weights[layer][i]) < 0.0001) {
                    this.weights[layer][i] = 0.0001 * (Math.random() > 0.5 ? 1 : -1);
                }
            }
            
            // Обновляем смещения с clipping
            for (let i = 0; i < this.biases[layer].length; i++) {
                let grad = gradients.biases[layer][i];
                // Gradient clipping
                if (grad > clipValue) grad = clipValue;
                if (grad < -clipValue) grad = -clipValue;
                
                const l2Grad = this.weights[layer][i] * l2Lambda;
                this.biases[layer][i] += learningRate * (grad - l2Grad);
            }
        }
    }

    async train(state, actionIndex, reward, nextState = null) {
        try {
            if (!state) return 0;
            
            const safeReward = isNaN(reward) ? 0 : Math.max(-1, Math.min(1, reward));
            const safeActionIndex = Math.max(0, Math.min(this.outputSize-1, actionIndex));
            
            // Получаем текущие Q-значения
            const currentOutput = await this.predict(state);
            let targetQ = safeReward;
            
            // Double Q-learning для стабильности
            if (nextState) {
                const nextOutput = await this.predict(nextState);
                // Используем текущую сеть для выбора и оценки
                const bestNextAction = nextOutput.indexOf(Math.max(...nextOutput));
                targetQ += this.discountFactor * nextOutput[bestNextAction];
            }
            
            // Мягкое ограничение targetQ
            targetQ = Math.max(-5, Math.min(5, targetQ));
            
            // Обновляем веса через backwardPass
            this.backwardPass(state, targetQ, safeActionIndex, currentOutput);
            
            const error = targetQ - currentOutput[safeActionIndex];
            this.totalReward += safeReward;
            
            return Math.abs(error);
            
        } catch (e) {
            console.error('Training failed:', e);
            return 0;
        }
    }

    backwardPass(input, target, actionIndex, currentOutput) {
        const learningRate = this.learningRate;
        
        // Прямой проход для получения активаций
        const forwardResult = this.forwardWithActivations(input);
        const activations = forwardResult.activations;
        
        // Ошибка выходного слоя
        const outputError = new Array(this.outputSize).fill(0);
        const qError = target - currentOutput[actionIndex];
        outputError[actionIndex] = qError * currentOutput[actionIndex] * (1 - currentOutput[actionIndex]);
        
        // Вычисляем градиенты
        const gradients = this.calculateGradients(activations, input, outputError);
        
        // Применяем градиенты
        this.applyGradients(gradients, learningRate);
    }

    mutate(rate = 0.1, scale = 0.3) {
        for (let i = 0; i < this.weights.length; i++) {
            this.mutateArray(this.weights[i], rate, scale);
            this.mutateArray(this.biases[i], rate, scale * 0.1);
        }
    }

    mutateArray(array, rate, scale) {
        for (let j = 0; j < array.length; j++) {
            if (Math.random() < rate) {
                const mutation = (Math.random() * 2 - 1) * scale;
                array[j] += mutation;
                
                // Защита от обнуления
                if (Math.abs(array[j]) < 0.001) {
                    array[j] = 0.001 * (Math.random() > 0.5 ? 1 : -1);
                }
                
                // Ограничение весов
                if (array[j] > 5) array[j] = 5;
                if (array[j] < -5) array[j] = -5;
            }
        }
    }

    clone() {
        const clone = new this.constructor(this.inputSize, this.hiddenSizes, this.outputSize);
        
        for (let i = 0; i < this.weights.length; i++) {
            clone.weights[i] = new Float32Array(this.weights[i]);
            clone.biases[i] = new Float32Array(this.biases[i]);
        }
        
        clone.totalReward = this.totalReward;
        clone.learningRate = this.learningRate;
        clone.gpuEnabled = this.gpuEnabled;
        
        return clone;
    }
}

// ОДНОПОТОЧНАЯ НЕЙРОСЕТЬ
export class OptimizedNeuralNetwork extends BaseNeuralNetwork {
    // Наследует все методы базового класса
}

// КЛАСС ДВУХПОТОЧНОЙ СЕТИ СО СКВОЗНЫМ ОБУЧЕНИЕМ
export class OptimizedDualStreamNeuralNetwork {
    constructor(basicInputSize, visionInputSize, outputSize) {
        this.basicInputSize = basicInputSize;
        this.visionInputSize = visionInputSize;
        this.outputSize = outputSize;

        const stateOutput = 8;
        const visionOutput = 8;
        
        this.stateStream = new OptimizedNeuralNetwork(basicInputSize, [4], stateOutput);
        this.visionStream = new OptimizedNeuralNetwork(visionInputSize, [4], visionOutput);
        this.fusionNetwork = new OptimizedNeuralNetwork(stateOutput + visionOutput, [16, 8], outputSize);
        
        this.totalReward = 0;
        this.discountFactor = 0.90;
        this.learningRate = 0.01;
        this.parallelEnabled = typeof Promise !== 'undefined';
    }
    
    // ОСНОВНОЙ ПАРАЛЛЕЛЬНЫЙ ПРЕДИКТОР
    async predict(basicInput, visionInput) {
        try {
            const safeBasicInput = this.createSafeInput(basicInput, this.basicInputSize);
            const safeVisionInput = this.createSafeInput(visionInput, this.visionInputSize);

            let stateFeatures, visionContext;
            
            if (this.parallelEnabled) {
                [stateFeatures, visionContext] = await Promise.all([
                    this.predictWithTimeout(this.stateStream, safeBasicInput),
                    this.predictWithTimeout(this.visionStream, safeVisionInput)
                ]);
            } else {
                stateFeatures = this.stateStream.predict(safeBasicInput);
                visionContext = this.visionStream.predict(safeVisionInput);
            }
            
            const stateArray = Array.isArray(stateFeatures) ? stateFeatures : Array.from(stateFeatures || []);
            const visionArray = Array.isArray(visionContext) ? visionContext : Array.from(visionContext || []);
            
            const combined = stateArray.concat(visionArray);
            const result = this.fusionNetwork.predict(combined);
            
            return result;
            
        } catch (e) {
            return this.getFallbackOutput();
        }
    }
    
    // СИНХРОННАЯ ВЕРСИЯ
    predictSync(basicInput, visionInput) {
        try {
            const safeBasicInput = this.createSafeInput(basicInput, this.basicInputSize);
            const safeVisionInput = this.createSafeInput(visionInput, this.visionInputSize);

            const stateFeatures = this.stateStream.predict(safeBasicInput);
            const visionContext = this.visionStream.predict(safeVisionInput);
            
            const stateArray = Array.isArray(stateFeatures) ? stateFeatures : Array.from(stateFeatures || []);
            const visionArray = Array.isArray(visionContext) ? visionContext : Array.from(visionContext || []);
            
            const combined = stateArray.concat(visionArray);
            const result = this.fusionNetwork.predict(combined);
            
            return result;
            
        } catch (e) {
            return this.getFallbackOutput();
        }
    }
    
    // СКВОЗНОЕ ОБУЧЕНИЕ ВСЕЙ СЕТИ
    async train(state, actionIndex, reward, nextState = null) {
        try {
            if (!state) return 0;
            
            const safeReward = isNaN(reward) || !isFinite(reward) ? 0 : Math.max(-1, Math.min(1, reward));
            const safeActionIndex = (actionIndex >= 0 && actionIndex < this.outputSize) ? actionIndex : 0;
            
            let safeBasicState, safeVisionState;
            
            if (typeof state === 'object') {
                safeBasicState = this.createSafeInput(state.basic, this.basicInputSize);
                safeVisionState = this.createSafeInput(state.vision, this.visionInputSize);
            } else {
                return 0;
            }
            
            // Получаем текущее предсказание
            const currentOutput = await this.predict(safeBasicState, safeVisionState);
            
            let targetQ = safeReward;
            
            // Double Q-learning с next state
            if (nextState) {
                let safeNextBasicState = null;
                let safeNextVisionState = null;
                
                if (typeof nextState === 'object') {
                    safeNextBasicState = this.createSafeInput(nextState.basic, this.basicInputSize);
                    safeNextVisionState = this.createSafeInput(nextState.vision, this.visionInputSize);
                }
                
                if (safeNextBasicState && safeNextVisionState) {
                    const nextOutput = await this.predict(safeNextBasicState, safeNextVisionState);
                    // Double Q-learning для стабильности
                    const bestNextAction = nextOutput.indexOf(Math.max(...nextOutput));
                    targetQ += this.discountFactor * nextOutput[bestNextAction];
                }
            }
            
            // Мягкое ограничение targetQ
            targetQ = Math.max(-5, Math.min(5, targetQ));
            
            // СКВОЗНОЙ ОБРАТНЫЙ ПРОХОД с исправленными градиентами
            const error = await this.unifiedBackwardPass(
                safeBasicState, 
                safeVisionState, 
                safeActionIndex, 
                targetQ, 
                currentOutput
            );
            
            this.totalReward += safeReward;
            return Math.abs(error);
            
        } catch (e) {
            console.error('Dual stream training failed:', e);
            return 0;
        }
    }
    
    async unifiedBackwardPass(basicInput, visionInput, actionIndex, targetQ, currentOutput) {
        const learningRate = this.learningRate * 0.5; // Уменьшаем learning rate
        
        try {
            // 1. Прямой проход через все сети
            const stateOutput = this.stateStream.predict(basicInput);
            const visionOutput = this.visionStream.predict(visionInput);
            const combinedInput = [...stateOutput, ...visionOutput];
            const fusionOutput = this.fusionNetwork.predict(combinedInput);
            
            // 2. Вычисляем ошибку (упрощенная версия)
            const error = targetQ - currentOutput[actionIndex];
            
            // 3. Ограничиваем ошибку
            const clippedError = Math.max(-1, Math.min(1, error));
            
            // 4. Обучаем каждую сеть отдельно (вместо сложного сквозного прохода)
            await this.trainSeparateNetworks(
                basicInput, visionInput, actionIndex, clippedError, learningRate
            );
            
            return clippedError;
            
        } catch (e) {
            console.error('Unified backward pass failed:', e);
            return 0;
        }
    }

    async trainSeparateNetworks(basicInput, visionInput, actionIndex, error, learningRate) {
        // Обучаем fusion network
        const fusionInput = [
            ...this.stateStream.predict(basicInput),
            ...this.visionStream.predict(visionInput)
        ];
        
        // Простой backward pass для fusion network
        const fusionForward = this.fusionNetwork.forwardWithActivations(fusionInput);
        const outputError = new Array(this.outputSize).fill(0);
        outputError[actionIndex] = error;
        
        const fusionGradients = this.fusionNetwork.calculateGradients(
            fusionForward.activations, fusionInput, outputError
        );
        
        // Применяем градиенты с уменьшенным learning rate
        this.fusionNetwork.applyGradients(fusionGradients, learningRate);
        
        // Обучаем state stream с меньшим learning rate
        const stateForward = this.stateStream.forwardWithActivations(basicInput);
        const stateGradients = this.stateStream.calculateGradients(
            stateForward.activations, basicInput, new Array(this.stateStream.outputSize).fill(error * 0.1)
        );
        this.stateStream.applyGradients(stateGradients, learningRate * 0.01);
        
        // Обучаем vision stream с меньшим learning rate
        const visionForward = this.visionStream.forwardWithActivations(visionInput);
        const visionGradients = this.visionStream.calculateGradients(
            visionForward.activations, visionInput, new Array(this.visionStream.outputSize).fill(error * 0.1)
        );
        this.visionStream.applyGradients(visionGradients, learningRate * 0.01);
    }
    
    // Вспомогательные методы
    createSafeInput(input, expectedSize) {
        if (!input) {
            return new Array(expectedSize).fill(0);
        }
        
        let result;
        if (Array.isArray(input) && input.length === expectedSize) {
            result = input;
        } else if (Array.isArray(input)) {
            result = new Array(expectedSize);
            const copyLength = Math.min(input.length, expectedSize);
            
            for (let i = 0; i < copyLength; i++) {
                const val = input[i];
                result[i] = (typeof val === 'number' && !isNaN(val)) ? val : 0;
            }
            
            for (let i = copyLength; i < expectedSize; i++) {
                result[i] = 0;
            }
        } else {
            result = new Array(expectedSize).fill(0);
        }
        
        return result;
    }
    
    async predictWithTimeout(network, input, timeoutMs = 50) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Prediction timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            
            try {
                const result = network.predict(input);
                clearTimeout(timeoutId);
                resolve(result);
            } catch (e) {
                clearTimeout(timeoutId);
                reject(e);
            }
        });
    }
    
    getFallbackOutput() {
        const result = new Array(this.outputSize);
        const value = 1 / this.outputSize;
        for (let i = 0; i < this.outputSize; i++) {
            result[i] = value;
        }
        return result;
    }
    
    mutate(rate = 0.1, scale = 0.3) {
        this.stateStream.mutate(rate, scale);
        this.visionStream.mutate(rate, scale);
        this.fusionNetwork.mutate(rate, scale);
    }
    
    clone() {
        const clone = new OptimizedDualStreamNeuralNetwork(
            this.basicInputSize, 
            this.visionInputSize, 
            this.outputSize
        );
        
        clone.stateStream = this.stateStream.clone();
        clone.visionStream = this.visionStream.clone();
        clone.fusionNetwork = this.fusionNetwork.clone();
        clone.totalReward = this.totalReward;
        
        return clone;
    }
}

export const NeuralNetwork = OptimizedNeuralNetwork;
export const DualStreamNeuralNetwork = OptimizedDualStreamNeuralNetwork;