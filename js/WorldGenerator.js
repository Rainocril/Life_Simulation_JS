import { initWorldSize } from "./HexUtils.js";

export class WorldGenerator {
    static TILE_TYPES = {
        DEEP_WATER: { id: 0, color: '#1565C0' },
        WATER: { id: 1, color: '#2196F3' },
        SAND: { id: 2, color: '#FFEB3B' },
        GRASS: { id: 3, color: '#4CAF50' },
        FOREST: { id: 4, color: '#2E7D32' },
        MOUNTAIN: { id: 5, color: '#795548' }
    };

    // Конфигурационные параметры
    static CONFIG = {
        // Параметры рельефа
        terrain: {
            baseSmoothness: 6,          // Базовое количество октав шума
            smoothnessVariation: 3,      // Вариация количества октав
            frequencyMultiplier: 4,    // Множитель частоты шума
            amplitudeDecay: 0.5,         // Затухание амплитуды для каждой октавы
        },
        
        // Параметры реки
        river: {
            minWidth: 0.2,               // Минимальная ширина реки
            maxWidth: 0.3,               // Максимальная ширина реки
            curveScale: 1.5,            // Масштаб извилистости реки
            curveIntensity: 0.05,        // Интенсивность изгибов реки
            minOffset: 0.3,              // Минимальное смещение от края
            maxOffset: 0.7,              // Максимальное смещение от края
            noiseInfluence: 0.3,         // Влияние шума на форму реки
        },
        
        // Параметры биомов
        biomes: {
            sandThreshold: 0.0,        // Базовый порог песка
            sandThresholdVariation: 0.0,// Вариация порога песка
            grassTransition: 0.0,        // Переход от песка к траве
            forestTransition: 0.15,     // Переход от травы к лесу
            mountainTransition: 0.45,    // Переход от леса к горам
            forestBaseChance: 0.9,       // Базовый шанс леса
            forestNoiseInfluence: 3,   // Влияние шума на лес
            forestNoiseScale: 3,        // Масштаб шума для леса
            mountainMinFactor: 0.15,      // Минимальный фактор для гор
        }
    };

    static generateWorld(cols, rows, options = {}) {
        const {
            hasRiver = true,
            smoothness = this.CONFIG.terrain.baseSmoothness + Math.floor(Math.random() * this.CONFIG.terrain.smoothnessVariation),
            seed = Math.random().toString(36).substring(2, 15)
        } = options;

        const noise = seed ? new SimplexNoise(seed) : new SimplexNoise();
        const cache = new Map();

        const getCachedNoise = (x, y, freq) => {
            const key = `${x}:${y}:${freq}`;
            if (!cache.has(key)) {
                cache.set(key, noise.noise2D(x * freq, y * freq));
            }
            return cache.get(key);
        };

        const world = new Array(cols);
        const config = this.CONFIG;
        
        // Параметры реки
        const riverWidth = config.river.minWidth + Math.random() * (config.river.maxWidth - config.river.minWidth);
        const riverCurveScale = config.river.curveScale + Math.random();
        const riverDirection = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        const riverOffset = config.river.minOffset + Math.random() * (config.river.maxOffset - config.river.minOffset);

        for (let x = 0; x < cols; x++) {
            world[x] = new Array(rows);
            const nx = x / cols;

            for (let y = 0; y < rows; y++) {
                const ny = y / rows;

                // Генерация рельефа с более плавными переходами
                let elevation = 0;
                let totalAmplitude = 0;
                
                for (let i = 0, amplitude = 1, frequency = 1; i < smoothness; i++) {
                    elevation += getCachedNoise(nx, ny, frequency * config.terrain.frequencyMultiplier) * amplitude;
                    totalAmplitude += amplitude;
                    amplitude *= config.terrain.amplitudeDecay;
                    frequency *= 2;
                }
                elevation = (elevation / totalAmplitude + 1) / 2;

                // Генерация реки
                let riverValue = 1;
                if (hasRiver) {
                    const riverNoise = getCachedNoise(nx, ny, riverCurveScale) * config.river.noiseInfluence;
                    let riverPos;
                    
                    if (riverDirection === 'horizontal') {
                        riverPos = ny + 
                                 Math.sin(nx * Math.PI * 3) * config.river.curveIntensity +
                                 riverNoise - riverOffset;
                    } else {
                        riverPos = nx + 
                                 Math.sin(ny * Math.PI * 3) * config.river.curveIntensity + 
                                 riverNoise - riverOffset;
                    }
                    
                    riverValue = Math.abs(riverPos) - riverWidth/2;
                }

                // Определение типа тайла с плавными переходами
                let tileType;
                if (hasRiver && riverValue < 0) {
                    const depthFactor = Math.min(1, Math.abs(riverValue) / (riverWidth * 0.3));
                    tileType = depthFactor > 0.7 ? 
                             WorldGenerator.TILE_TYPES.DEEP_WATER : 
                             WorldGenerator.TILE_TYPES.WATER;
                } else {
                    // Параметры биомов с плавными переходами
                    const sandThreshold = config.biomes.sandThreshold + Math.random() * config.biomes.sandThresholdVariation;
                    const grassThreshold = sandThreshold + config.biomes.grassTransition;
                    const forestThreshold = grassThreshold + config.biomes.forestTransition;
                    const mountainThreshold = forestThreshold + config.biomes.mountainTransition;

                    // Плавные переходы между биомами
                    const sandFactor = smoothstep(sandThreshold, sandThreshold + 0.05, elevation);
                    const grassFactor = smoothstep(grassThreshold, grassThreshold + 0.1, elevation);
                    const forestFactor = smoothstep(forestThreshold, forestThreshold + 0.15, elevation);
                    const mountainFactor = smoothstep(mountainThreshold, mountainThreshold + 0.1, elevation);

                    if (mountainFactor > config.biomes.mountainMinFactor) {
                        tileType = WorldGenerator.TILE_TYPES.MOUNTAIN;
                    } else {
                        const forestNoise = getCachedNoise(nx * config.biomes.forestNoiseScale, 
                                                         ny * config.biomes.forestNoiseScale, 1);
                        const forestChance = forestFactor * 
                                          (config.biomes.forestBaseChance + forestNoise * config.biomes.forestNoiseInfluence);
                        
                        // Плавное смешивание биомов
                        if (forestChance > 0.5) {
                            // Смешивание леса и травы
                            const mixFactor = (forestChance - 0.5) * 2;
                            tileType = mixFactor > 0.8 ? WorldGenerator.TILE_TYPES.FOREST : 
                                     mixFactor > 0.3 ? this.mixBiomes(WorldGenerator.TILE_TYPES.FOREST, 
                                                                     WorldGenerator.TILE_TYPES.GRASS, 
                                                                     (mixFactor - 0.3) / 0.5) : 
                                     WorldGenerator.TILE_TYPES.GRASS;
                        } else if (grassFactor > 0.6) {
                            tileType = WorldGenerator.TILE_TYPES.GRASS;
                        } else if (sandFactor > 0.5) {
                            // Смешивание песка и травы
                            const mixFactor = (sandFactor - 0.5) * 2;
                            tileType = mixFactor > 0.7 ? WorldGenerator.TILE_TYPES.SAND : 
                                     this.mixBiomes(WorldGenerator.TILE_TYPES.SAND, 
                                                  WorldGenerator.TILE_TYPES.GRASS, 
                                                  mixFactor / 0.7);
                        } else {
                            tileType = WorldGenerator.TILE_TYPES.GRASS;
                        }
                    }
                }

                world[x][y] = {
                    type: tileType.id,
                    elevation: elevation,
                    x: x,
                    y: y,
                    isRiver: hasRiver && riverValue < 0
                };
            }
        }
        
        initWorldSize(cols, rows);
        return world;
    }

    // Метод для плавного смешивания двух биомов
    static mixBiomes(biome1, biome2, factor) {
        // В реальной реализации нужно смешивать цвета или выбирать промежуточный тип
        return factor > 0.5 ? biome1 : biome2;
    }
}

function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

export let world = [];
 
export function ReGenerate(cols, rows) {
    world = WorldGenerator.generateWorld(cols, rows, {
        hasRiver: true
    });
}