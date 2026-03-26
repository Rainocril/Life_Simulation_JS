// EntitySerializer.js

export class EntitySerializer {
    // Сериализация сущности для воркера (только данные, без методов)
    static serializeEntityForWorker(entity) {
        return {
            id: entity.id,
            type: entity.type,
            x: entity.x,
            y: entity.y,
            health: entity.health,
            energy: entity.energy,
            hunger: entity.hunger,
            thirst: entity.thirst,
            age: entity.age,
            generation: entity.generation,
            totalReward: entity.totalReward,
            tempReward: entity.tempReward,
            reproductionCooldown: entity.reproductionCooldown,
            lastAction: entity.lastAction,
            lastActionId: entity.lastActionId,
            visitedCells: entity.visitedCells ? Array.from(entity.visitedCells) : [],
            visionRange: entity.visionRange || 4,
            
            // Параметры
            basicInputSize: entity.basicInputSize,
            visionInputSize: entity.visionInputSize,
            totalActions: entity.totalActions,
            hexCount: entity.hexCount,
            
            // Только простые данные, без методов и классов
            lastState: entity.lastState ? {
                basic: entity.lastState.basic ? [...entity.lastState.basic] : [],
                vision: entity.lastState.vision ? [...entity.lastState.vision] : []
            } : null,
            
            // Сериализуем веса нейросети как простые массивы
            brainWeights: this.serializeBrainWeights(entity.brain),
            
            trainingMetrics: entity.trainingMetrics ? {
                tdErrors: [...(entity.trainingMetrics.tdErrors || [])],
                qValues: [...(entity.trainingMetrics.qValues || [])],
                explorationRate: entity.trainingMetrics.explorationRate,
                successRate: entity.trainingMetrics.successRate,
                learningProgress: entity.trainingMetrics.learningProgress,
                policyMaturity: entity.trainingMetrics.policyMaturity
            } : null
        };
    }

    // Сериализация только весов нейросети (без методов)
    static serializeBrainWeights(brain) {
        if (!brain) return null;
        
        try {
            if (brain.constructor.name === 'DualStreamNeuralNetwork') {
                return {
                    type: 'dualStream',
                    basicInputSize: brain.basicInputSize,
                    visionInputSize: brain.visionInputSize,
                    outputSize: brain.outputSize,
                    generation: brain.generation || 0,
                    totalReward: brain.totalReward || 0,
                    learningRate: brain.learningRate || 0.1,
                    discountFactor: brain.discountFactor || 0.95,
                    stateStreamWeights: this.serializeNetworkWeights(brain.stateStream),
                    visionStreamWeights: this.serializeNetworkWeights(brain.visionStream),
                    fusionNetworkWeights: this.serializeNetworkWeights(brain.fusionNetwork)
                };
            } else if (brain.constructor.name === 'NeuralNetwork') {
                return {
                    type: 'neural',
                    inputSize: brain.inputSize,
                    hiddenSizes: brain.hiddenSizes,
                    outputSize: brain.outputSize,
                    weights: brain.weights.map(layer => Array.from(layer)),
                    biases: brain.biases.map(layer => Array.from(layer)),
                    learningRate: brain.learningRate,
                    discountFactor: brain.discountFactor
                };
            }
        } catch (e) {
            console.error('Error serializing brain weights:', e);
        }
        
        return null;
    }

    // Сериализация весов отдельной сети
    static serializeNetworkWeights(network) {
        if (!network) return null;
        
        return {
            inputSize: network.inputSize,
            hiddenSizes: network.hiddenSizes,
            outputSize: network.outputSize,
            weights: network.weights ? network.weights.map(layer => Array.from(layer)) : [],
            biases: network.biases ? network.biases.map(layer => Array.from(layer)) : [],
            learningRate: network.learningRate,
            discountFactor: network.discountFactor
        };
    }

    // Сериализация состояния мира (только необходимые данные)
    static serializeWorldStateForWorker(world) {
        return {
            cols: world.cols,
            rows: world.rows,
            // Карта только с типами клеток (числа)
            map: world.map.map(row => row.map(cell => cell.type)),
            // Только позиции существ для проверки коллизий
            entities: {
                rabbits: world.entities.rabbits.map(r => ({ x: r.x, y: r.y, id: r.id })),
                fish: world.entities.fish.map(f => ({ x: f.x, y: f.y, id: f.id })),
                foxes: world.entities.foxes.map(f => ({ x: f.x, y: f.y, id: f.id })),
                algae: world.entities.algae.map(a => ({ x: a.x, y: a.y, growth: a.growth })),
                grass: world.entities.grass.map(g => ({ x: g.x, y: g.y, growth: g.growth }))
            },
            time: world.time
        };
    }

    // Применение обновлений от воркера
    static applyWorkerUpdates(world, originalEntities, updatedEntitiesData) {
        const updatesMap = new Map();
        updatedEntitiesData.forEach(update => {
            updatesMap.set(update.id, update);
        });
        
        originalEntities.forEach(entity => {
            const update = updatesMap.get(entity.id);
            if (update) {
                // Обновляем только простые поля
                entity.x = update.x;
                entity.y = update.y;
                entity.health = update.health;
                entity.energy = update.energy;
                entity.hunger = update.hunger;
                entity.thirst = update.thirst;
                entity.age = update.age;
                entity.totalReward = update.totalReward;
                entity.tempReward = update.tempReward;
                entity.reproductionCooldown = update.reproductionCooldown;
                entity.lastAction = update.lastAction;
                entity.lastActionId = update.lastActionId;
                entity.visitedCells = new Set(update.visitedCells);
                
                // Обновляем состояние
                if (update.lastState) {
                    entity.lastState = {
                        basic: update.lastState.basic,
                        vision: update.lastState.vision
                    };
                }
                
                // Обновляем веса нейросети
                if (update.brainWeights) {
                    this.applyBrainWeights(entity.brain, update.brainWeights);
                }
                
                // Проверяем, не умерла ли сущность
                if (update.isDead) {
                    entity.isDead = true;
                    if (typeof entity.die === 'function') {
                        entity.die();
                    }
                    
                    // Удаляем из мира
                    const index = world.entities[entity.type].indexOf(entity);
                    if (index !== -1) {
                        world.entities[entity.type].splice(index, 1);
                    }
                }
            }
        });
    }

    // Применение весов к нейросети
    static applyBrainWeights(brain, weightsData) {
        if (!brain || !weightsData) return;
        
        try {
            if (weightsData.type === 'dualStream' && brain.constructor.name === 'DualStreamNeuralNetwork') {
                if (brain.stateStream && weightsData.stateStreamWeights) {
                    this.applyNetworkWeights(brain.stateStream, weightsData.stateStreamWeights);
                }
                if (brain.visionStream && weightsData.visionStreamWeights) {
                    this.applyNetworkWeights(brain.visionStream, weightsData.visionStreamWeights);
                }
                if (brain.fusionNetwork && weightsData.fusionNetworkWeights) {
                    this.applyNetworkWeights(brain.fusionNetwork, weightsData.fusionNetworkWeights);
                }
                brain.generation = weightsData.generation;
                brain.totalReward = weightsData.totalReward;
            } else if (weightsData.type === 'neural' && brain.constructor.name === 'NeuralNetwork') {
                this.applyNetworkWeights(brain, weightsData);
            }
        } catch (e) {
            console.error('Error applying brain weights:', e);
        }
    }

    // Применение весов к отдельной сети
    static applyNetworkWeights(network, weightsData) {
        if (!network || !weightsData) return;
        
        try {
            if (weightsData.weights && network.weights) {
                network.weights = weightsData.weights.map(layer => new Float32Array(layer));
            }
            if (weightsData.biases && network.biases) {
                network.biases = weightsData.biases.map(layer => new Float32Array(layer));
            }
            if (weightsData.learningRate) {
                network.learningRate = weightsData.learningRate;
            }
            if (weightsData.discountFactor) {
                network.discountFactor = weightsData.discountFactor;
            }
        } catch (e) {
            console.error('Error applying network weights:', e);
        }
    }

    // Разбиение массива на чанки
    static splitIntoChunks(array, chunkCount) {
        const chunks = [];
        const chunkSize = Math.ceil(array.length / chunkCount);
        
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        
        return chunks;
    }
}