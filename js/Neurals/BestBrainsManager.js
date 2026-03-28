// BestBrainsManager.js
export class BestBrainsManager {
    constructor(maxSize = 10) {
        this.bestBrains = new Map();
        this.maxSize = maxSize;
        // Не кэшируем модели, чтобы избежать disposed ошибок
    }
    
    async trySaveBrain(agent, species, fitness, entityId) {
        if (!this.bestBrains.has(species)) {
            this.bestBrains.set(species, []);
        }
        
        const brains = this.bestBrains.get(species);
        
        if (brains.length === 0) {
            await this.saveBrain(agent, species, fitness, entityId);
            return true;
        }
        
        brains.sort((a, b) => b.fitness - a.fitness);
        const worstFitness = brains[brains.length - 1].fitness;
        
        if (fitness > worstFitness || brains.length < this.maxSize) {
            if (brains.length >= this.maxSize) {
                const worst = brains.pop();
                await this.deleteBrain(worst);
            }
            
            await this.saveBrain(agent, species, fitness, entityId);
            return true;
        }
        
        console.log(`📉 Brain not saved: fitness ${fitness.toFixed(3)} < ${worstFitness.toFixed(3)}`);
        return false;
    }
    
    async saveBrain(agent, species, fitness, entityId) {
        const modelPath = `best_${species}_${Date.now()}`;
        
        // Сохраняем модель через агента
        await agent.saveModel(modelPath);
        
        const brainData = {
            modelPath,
            fitness,
            entityId,
            timestamp: Date.now(),
            species
        };
        
        this.bestBrains.get(species).push(brainData);
        
        const brains = this.bestBrains.get(species);
        brains.sort((a, b) => b.fitness - a.fitness);
        
        if (brains.length > this.maxSize) {
            const removed = brains.pop();
            await this.deleteBrain(removed);
        }
        
        console.log(`🏆 Saved brain with fitness ${fitness.toFixed(3)} for ${species}`);
    }
    
    async deleteBrain(brainData) {
        try {
            await tf.io.removeModel(`localstorage://${brainData.modelPath}`);
            console.log(`🗑️ Deleted old brain with fitness ${brainData.fitness.toFixed(3)}`);
        } catch (e) {
            console.error('Failed to delete brain:', e);
        }
    }
    
    /**
     * Загружает модель и возвращает её веса (не саму модель)
     * Это предотвращает проблемы с disposed
     */
    async loadBestBrainWeights(species) {
        const brains = this.bestBrains.get(species) || [];
        
        if (brains.length === 0) {
            console.log(`No brains for ${species}`);
            return null;
        }
        
        const best = brains[0];
        
        try {
            // Загружаем модель
            const model = await tf.loadLayersModel(`localstorage://${best.modelPath}`);
            
            // Получаем веса
            const weights = model.getWeights();
            
            // Копируем веса (чтобы можно было уничтожить модель)
            const weightCopies = weights.map(w => w.clone());
            
            // Уничтожаем загруженную модель
            model.dispose();
            
            console.log(`🏆 Loaded best brain weights for ${species} (fitness: ${best.fitness.toFixed(3)})`);
            return weightCopies;
        } catch (e) {
            console.error('Failed to load best brain:', e);
            return null;
        }
    }
    
    getStats(species) {
        const brains = this.bestBrains.get(species) || [];
        
        if (brains.length === 0) return null;
        
        return {
            count: brains.length,
            bestFitness: brains[0].fitness,
            worstFitness: brains[brains.length - 1].fitness,
            avgFitness: brains.reduce((sum, b) => sum + b.fitness, 0) / brains.length,
            brains: brains.map(b => ({
                fitness: b.fitness,
                entityId: b.entityId,
                age: b.timestamp
            }))
        };
    }
    
    async compareWithBest(species, currentFitness) {
        const brains = this.bestBrains.get(species) || [];
        
        if (brains.length === 0) {
            return { isBetter: true, diff: Infinity };
        }
        
        const bestFitness = brains[0].fitness;
        const diff = currentFitness - bestFitness;
        
        return {
            isBetter: diff > 0,
            diff: diff,
            bestFitness: bestFitness,
            currentFitness: currentFitness,
            rank: brains.filter(b => b.fitness > currentFitness).length + 1
        };
    }
}

export const bestBrainsManager = new BestBrainsManager(10);