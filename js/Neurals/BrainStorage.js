// Буфер для скрещивания мозгов в реальном времени
let generationBuffer = {
    foxes: null,
    rabbits: null, 
    fish: null
};

// Хранилище лучших мозгов
let animalBrainsStorage = {
    foxes: [],
    rabbits: [],
    fish: []
};

let showLog = false;

// Функция для загрузки из localStorage
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('animalBrainsStorage');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.foxes) animalBrainsStorage.foxes = parsed.foxes;
            if (parsed.rabbits) animalBrainsStorage.rabbits = parsed.rabbits;
            if (parsed.fish) animalBrainsStorage.fish = parsed.fish;
            if (showLog) console.log('🧠 Loaded brains from localStorage');
        }
    } catch (e) {
        if (showLog) console.error('Failed to load from localStorage:', e);
    }
}

// Функция для сохранения в localStorage
function saveToLocalStorage() {
    try {
        localStorage.setItem('animalBrainsStorage', JSON.stringify(animalBrainsStorage));
        if (showLog) console.log('🧠 Saved brains to localStorage');
    } catch (e) {
        if (showLog) console.error('Failed to save to localStorage:', e);
    }
}

// Загружаем при инициализации
loadFromLocalStorage();

// Функция для получения текущей популяции
export function getCurrentPopulation(animalType, world) {
    if (!world || !world.entities) return 0;
    return world.entities[animalType]?.length || 0;
}

// Функция для скрещивания двух мозгов
export function crossoverBrains(brainA, brainB, mixRatio = 0.5) {
    if (!brainA) return brainB;
    if (!brainB) return brainA;
    
    try {
        const result = JSON.parse(JSON.stringify(brainA));
        
        // Скрещиваем dual stream сети
        if (result.type === 'dualStream' && brainB.type === 'dualStream') {
            if (result.networks && brainB.networks) {
                // State stream
                if (result.networks.stateStream && brainB.networks.stateStream) {
                    crossoverNetworkLayers(result.networks.stateStream, brainB.networks.stateStream, mixRatio);
                }
                // Vision stream
                if (result.networks.visionStream && brainB.networks.visionStream) {
                    crossoverNetworkLayers(result.networks.visionStream, brainB.networks.visionStream, mixRatio);
                }
                // Fusion network  
                if (result.networks.fusionNetwork && brainB.networks.fusionNetwork) {
                    crossoverNetworkLayers(result.networks.fusionNetwork, brainB.networks.fusionNetwork, mixRatio);
                }
            }
        } else {
            // Простые нейросети
            crossoverNetworkLayers(result, brainB, mixRatio);
        }
        
        // Усредняем метрики
        if (result.trainingMetrics && brainB.trainingMetrics) {
            result.trainingMetrics.avgTdError = (result.trainingMetrics.avgTdError + brainB.trainingMetrics.avgTdError) / 2;
            result.trainingMetrics.qValueStability = (result.trainingMetrics.qValueStability + brainB.trainingMetrics.qValueStability) / 2;
            result.trainingMetrics.compositeScore = (result.trainingMetrics.compositeScore + brainB.trainingMetrics.compositeScore) / 2;
        }
        
        // Усредняем награды
        result.totalReward = (result.totalReward + brainB.totalReward) / 2;
        
        return result;
        
    } catch (e) {
        console.error('Crossover failed:', e);
        return brainA;
    }
}

function crossoverNetworkLayers(networkA, networkB, mixRatio) {
    if (!networkA || !networkB) return;
    
    // Скрещиваем веса
    if (networkA.weights && networkB.weights && 
        networkA.weights.length === networkB.weights.length) {
        for (let i = 0; i < networkA.weights.length; i++) {
            if (networkB.weights[i] && networkA.weights[i].length === networkB.weights[i].length) {
                for (let j = 0; j < networkA.weights[i].length; j++) {
                    networkA.weights[i][j] = networkA.weights[i][j] * (1 - mixRatio) + 
                                            networkB.weights[i][j] * mixRatio;
                }
            }
        }
    }
    
    // Скрещиваем смещения
    if (networkA.biases && networkB.biases &&
        networkA.biases.length === networkB.biases.length) {
        for (let i = 0; i < networkA.biases.length; i++) {
            if (networkB.biases[i] && networkA.biases[i].length === networkB.biases[i].length) {
                for (let j = 0; j < networkA.biases[i].length; j++) {
                    networkA.biases[i][j] = networkA.biases[i][j] * (1 - mixRatio) + 
                                           networkB.biases[i][j] * mixRatio;
                }
            }
        }
    }
}

// ОСНОВНАЯ ФУНКЦИЯ ДЛЯ СОХРАНЕНИЯ С БУФЕРОМ
export function saveBrainWithBuffer(brainData, animalType, currentPopulation) {
    if (!animalBrainsStorage[animalType]) {
        animalBrainsStorage[animalType] = [];
    }
    
    if (showLog) console.log(`🧠 Saving ${animalType} brain, population: ${currentPopulation}`);
    
    // Если популяция > 1 - буферизуем/скрещиваем
    if (currentPopulation > 1) {
        if (!generationBuffer[animalType]) {
            // Первый мозг в буфере
            generationBuffer[animalType] = {
                brainData: brainData,
                populationCount: currentPopulation,
                lastUpdate: Date.now()
            };
            if (showLog) console.log(`🧠 First brain buffered for ${animalType}`);
        } else {
            // Скрещиваем с существующим буфером (70% буфера + 30% нового)
            generationBuffer[animalType].brainData = crossoverBrains(
                generationBuffer[animalType].brainData,
                brainData,
                0.3
            );
            generationBuffer[animalType].populationCount = currentPopulation;
            generationBuffer[animalType].lastUpdate = Date.now();
            
            if (showLog) console.log(`🧠 Brain crossed with buffer for ${animalType}`);
        }
    } 
    // ИСПРАВЛЕНИЕ: Если популяция = 1 (последняя лиса умирает) - финализируем
    else if (currentPopulation === 1 && generationBuffer[animalType]) {
        // Финальное скрещивание (50/50)
        const finalBrain = crossoverBrains(
            generationBuffer[animalType].brainData,
            brainData,
            0.5
        );
        
        // Сохраняем финальный мозг
        saveFinalBrain(finalBrain, animalType);
        
        // Очищаем буфер
        generationBuffer[animalType] = null;
        
        if (showLog) console.log(`🧠 FINAL brain saved for ${animalType} generation (last ${animalType} died)`);
    }
    // Если нет буфера (первая смерть при population=1) - просто сохраняем
    else if (currentPopulation === 1) {
        saveFinalBrain(brainData, animalType);
        if (showLog) console.log(`🧠 Single brain saved for ${animalType} (only one ${animalType})`);
    }
    // Если популяция = 0 (резервный случай) - тоже сохраняем
    else if (currentPopulation === 0 && generationBuffer[animalType]) {
        const finalBrain = crossoverBrains(
            generationBuffer[animalType].brainData,
            brainData,
            0.5
        );
        saveFinalBrain(finalBrain, animalType);
        generationBuffer[animalType] = null;
        if (showLog) console.log(`🧠 FINAL brain saved for ${animalType} (population=0 case)`);
    }
}

function saveFinalBrain(brainData, animalType) {
    const storage = animalBrainsStorage[animalType];
    
    if (showLog) console.log(`🧠 FINAL SAVE: Saving ${animalType} brain to localStorage`);
    if (showLog) console.log(`🧠 Brain data:`, brainData);
    
    if (storage.length === 0) {
        storage.push(brainData);
        if (showLog) console.log(`🧠 New ${animalType} brain saved to storage`);
    } else {
        storage[0] = brainData;
        if (showLog) console.log(`🧠 Updated ${animalType} brain: ${currentScore.toFixed(3)} -> ${newScore.toFixed(3)}`);
    }
    
    saveToLocalStorage();
    
    // Дополнительная проверка
    if (showLog) console.log(`🧠 VERIFY: Storage now has ${animalBrainsStorage[animalType].length} brains`);
}

// ОБНОВЛЯЕМ ФУНКЦИЮ loadBestBrains
export function loadBestBrains(animalType, count = 1) {
    if (showLog) console.log(`🧠 LOAD: Loading best brains for ${animalType}`);
    if (showLog) console.log(`🧠 Storage state:`, animalBrainsStorage[animalType]);
    
    if (!animalBrainsStorage[animalType] || animalBrainsStorage[animalType].length === 0) {
        if (showLog) console.log(`🧠 No saved brains found for ${animalType}`);
        return [];
    }
    
    if (showLog) console.log(`🧠 Found ${animalBrainsStorage[animalType].length} saved brains for ${animalType}`);
    return [animalBrainsStorage[animalType][0]];
}

// Функция для очистки хранилища (для отладки)
export function clearBrainStorage() {
    animalBrainsStorage = { foxes: [], rabbits: [], fish: [] };
    generationBuffer = { foxes: null, rabbits: null, fish: null };
    localStorage.removeItem('animalBrainsStorage');
    if (showLog) console.log('🧠 Brain storage cleared');
}

export function BrainShowLog(bool) {
    showLog = bool;
}