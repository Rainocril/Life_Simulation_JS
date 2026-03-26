// fox-worker.js

// Импортируем только необходимые функции (без классов)
importScripts('./EntitySerializer.js');

self.onmessage = async function(event) {
    const { type, data } = event.data;
    
    if (type === 'updateEntities') {
        try {
            const updatedEntities = [];
            
            // Обрабатываем каждую сущность
            for (const entityData of data.entities) {
                const updatedEntity = await processEntityUpdate(entityData, data.worldState);
                updatedEntities.push(updatedEntity);
            }
            
            self.postMessage({
                success: true,
                updatedEntities: updatedEntities
            });
            
        } catch (error) {
            self.postMessage({
                success: false,
                error: error.message
            });
        }
    }
};

async function processEntityUpdate(entityData, worldState) {
    // Создаём копию данных для обновления
    const entity = {
        ...entityData,
        visitedCells: new Set(entityData.visitedCells || []),
        lastState: entityData.lastState ? {
            basic: [...(entityData.lastState.basic || [])],
            vision: [...(entityData.lastState.vision || [])]
        } : null
    };
    
    // Выполняем упрощённое обновление
    await updateEntityLogic(entity, worldState);
    
    // Возвращаем обновлённые данные
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
        visitedCells: Array.from(entity.visitedCells),
        lastState: entity.lastState,
        brainWeights: entity.brainWeights,
        isDead: entity.isDead || false
    };
}

async function updateEntityLogic(entity, worldState) {
    // Упрощённая логика обновления
    // Здесь нужно реализовать основную логику обновления лисы
    // без использования классов и методов
    
    entity.age++;
    entity.hunger = Math.max(0, entity.hunger - 0.8);
    entity.thirst = Math.max(0, entity.thirst - 1.2);
    
    if (entity.hunger <= 0) entity.health -= 2.0;
    if (entity.thirst <= 0) entity.health -= 3.0;
    
    if (entity.reproductionCooldown > 0) entity.reproductionCooldown--;
    
    // Проверка на смерть
    if (entity.health <= 0 || entity.age / 360 > 10) {
        entity.isDead = true;
    }
    
    // Нормализация статов
    entity.energy = Math.max(0, Math.min(100, entity.energy));
    entity.health = Math.max(0, Math.min(100, entity.health));
    entity.hunger = Math.max(0, Math.min(100, entity.hunger));
    entity.thirst = Math.max(0, Math.min(100, entity.thirst));
    
    // Простое движение (пример)
    if (!entity.isDead && Math.random() < 0.3) {
        const directions = getHexDirections(entity.x);
        if (directions.length > 0) {
            const [dx, dy] = directions[Math.floor(Math.random() * directions.length)];
            const newX = entity.x + dx;
            const newY = entity.y + dy;
            
            if (canMoveTo(newX, newY, worldState)) {
                entity.x = newX;
                entity.y = newY;
                entity.energy -= 2;
            }
        }
    }
}

function getHexDirections(x) {
    const parity = x % 2 === 0 ? 'even' : 'odd';
    const offsets = {
        even: [[-1, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1]],
        odd: [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1]]
    };
    return offsets[parity] || offsets.even;
}

function canMoveTo(x, y, worldState) {
    // Проверка границ
    if (x < 0 || y < 0 || x >= worldState.cols || y >= worldState.rows) {
        return false;
    }
    
    // Проверка гор
    if (worldState.map[x] && worldState.map[x][y] === 5) {
        return false;
    }
    
    return true;
}