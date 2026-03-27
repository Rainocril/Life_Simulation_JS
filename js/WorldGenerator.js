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

    // ДЕФОЛТНЫЕ ПАРАМЕТРЫ ШУМА
    static DEFAULT_PARAMS = {
        terrain: {
            smoothness: 6,
            frequencyMultiplier: 4,
            amplitudeDecay: 0.5,
        },
        river: {
            hasRiver: true,
            width: 0.25,
            curveScale: 1.5,
            curveIntensity: 0.05,
            noiseInfluence: 0.3,
            offset: 0.5,
            direction: 'horizontal'
        },
        biomes: {
            sandThreshold: 0.0,
            grassTransition: 0.0,
            forestTransition: 0.15,
            mountainTransition: 0.45,
            forestBaseChance: 0.9,
            forestNoiseInfluence: 3,
            forestNoiseScale: 3,
            mountainMinFactor: 0.15,
        }
    };

    // Конфигурационные параметры (для обратной совместимости)
    static CONFIG = {
        terrain: {
            baseSmoothness: 6,
            smoothnessVariation: 3,
            frequencyMultiplier: 4,
            amplitudeDecay: 0.5,
        },
        river: {
            minWidth: 0.2,
            maxWidth: 0.3,
            curveScale: 1.5,
            curveIntensity: 0.05,
            minOffset: 0.3,
            maxOffset: 0.7,
            noiseInfluence: 0.3,
        },
        biomes: {
            sandThreshold: 0.0,
            sandThresholdVariation: 0.0,
            grassTransition: 0.0,
            forestTransition: 0.15,
            mountainTransition: 0.45,
            forestBaseChance: 0.9,
            forestNoiseInfluence: 3,
            forestNoiseScale: 3,
            mountainMinFactor: 0.15,
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
        
        const riverWidth = config.river.minWidth + Math.random() * (config.river.maxWidth - config.river.minWidth);
        const riverCurveScale = config.river.curveScale + Math.random();
        const riverDirection = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        const riverOffset = config.river.minOffset + Math.random() * (config.river.maxOffset - config.river.minOffset);

        for (let x = 0; x < cols; x++) {
            world[x] = new Array(rows);
            const nx = x / cols;

            for (let y = 0; y < rows; y++) {
                const ny = y / rows;

                let elevation = 0;
                let totalAmplitude = 0;
                
                for (let i = 0, amplitude = 1, frequency = 1; i < smoothness; i++) {
                    elevation += getCachedNoise(nx, ny, frequency * config.terrain.frequencyMultiplier) * amplitude;
                    totalAmplitude += amplitude;
                    amplitude *= config.terrain.amplitudeDecay;
                    frequency *= 2;
                }
                elevation = (elevation / totalAmplitude + 1) / 2;

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

                let tileType;
                if (hasRiver && riverValue < 0) {
                    const depthFactor = Math.min(1, Math.abs(riverValue) / (riverWidth * 0.3));
                    tileType = depthFactor > 0.7 ? 
                             WorldGenerator.TILE_TYPES.DEEP_WATER : 
                             WorldGenerator.TILE_TYPES.WATER;
                } else {
                    const sandThreshold = config.biomes.sandThreshold + Math.random() * config.biomes.sandThresholdVariation;
                    const grassThreshold = sandThreshold + config.biomes.grassTransition;
                    const forestThreshold = grassThreshold + config.biomes.forestTransition;
                    const mountainThreshold = forestThreshold + config.biomes.mountainTransition;

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
                        
                        if (forestChance > 0.5) {
                            const mixFactor = (forestChance - 0.5) * 2;
                            tileType = mixFactor > 0.8 ? WorldGenerator.TILE_TYPES.FOREST : 
                                     mixFactor > 0.3 ? this.mixBiomes(WorldGenerator.TILE_TYPES.FOREST, 
                                                                     WorldGenerator.TILE_TYPES.GRASS, 
                                                                     (mixFactor - 0.3) / 0.5) : 
                                     WorldGenerator.TILE_TYPES.GRASS;
                        } else if (grassFactor > 0.6) {
                            tileType = WorldGenerator.TILE_TYPES.GRASS;
                        } else if (sandFactor > 0.5) {
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

    static mixBiomes(biome1, biome2, factor) {
        return factor > 0.5 ? biome1 : biome2;
    }

    static generateWithParams(cols, rows, params) {
        const { terrain, river: riverParams, biomes: biomesParams, global } = params;
        const noise = new SimplexNoise(global.seed);
        const cache = new Map();

        const getCachedNoise = (x, y, freq, scale = 1) => {
            const key = `${x}:${y}:${freq}:${scale}`;
            if (!cache.has(key)) {
                cache.set(key, noise.noise2D(x * freq * scale, y * freq * scale));
            }
            return cache.get(key);
        };
        
        // Улучшенный шум Вороного с цветовыми зонами
        const voronoi = (x, y, pointsCount = 16) => {
            let minDist = Infinity;
            let secondMinDist = Infinity;
            let closestPointIdx = 0;
            
            // Генерируем случайные точки на основе сида
            for (let i = 0; i < pointsCount; i++) {
                // Используем сид для детерминированности
                const angle = (i * 137.5 + global.seed.length * 10) * 0.1;
                const radius = 0.35 + 0.25 * Math.sin(i * 2.1);
                const px = 0.5 + Math.cos(angle + x * 0.5) * radius;
                const py = 0.5 + Math.sin(angle + y * 0.5) * radius;
                
                const dx = x - px;
                const dy = y - py;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < minDist) {
                    secondMinDist = minDist;
                    minDist = dist;
                    closestPointIdx = i;
                } else if (dist < secondMinDist) {
                    secondMinDist = dist;
                }
            }
            
            // Возвращаем индекс зоны (0-15) и нормализованное расстояние
            const zoneId = closestPointIdx % 6; // 6 основных зон биомов
            const f2 = secondMinDist - minDist;
            const edgeValue = Math.min(1, Math.max(0, (f2 - 0.05) * 3));
            
            return {
                zone: zoneId / 6, // 0-1 для зоны
                zoneId: zoneId,
                edgeValue: edgeValue,
                distance: minDist
            };
        };
        
        const world = new Array(cols);
        
        // 1. БАЗОВЫЙ РЕЛЬЕФ (высота) с уклоном для стока воды
        const heightMap = new Array(cols);
        for (let x = 0; x < cols; x++) {
            heightMap[x] = new Array(rows);
            world[x] = new Array(rows);
            const nx = x / cols;
            
            for (let y = 0; y < rows; y++) {
                const ny = y / rows;
                
                let elevation = 0;
                let totalAmplitude = 0;
                const smoothness = Math.floor(terrain.smoothness);
                
                for (let i = 0, amplitude = 1, frequency = 1; i < smoothness; i++) {
                    elevation += getCachedNoise(nx, ny, frequency * terrain.frequencyMultiplier) * amplitude;
                    totalAmplitude += amplitude;
                    amplitude *= terrain.amplitudeDecay;
                    frequency *= 2;
                }
                elevation = (elevation / totalAmplitude + 1) / 2;
                
                // Добавляем уклон от гор к равнинам для естественного стока
                // Горы выше -> уклон больше
                const mountainSlope = Math.max(0, (elevation - 0.5) * 0.6);
                
                // Уклон в зависимости от направления реки
                let slopeDirection = 0;
                if (riverParams.direction === 'horizontal') {
                    slopeDirection = nx * 0.2; // лево-право
                } else {
                    slopeDirection = ny * 0.2; // верх-низ
                }
                
                elevation = elevation * (1 - mountainSlope) + slopeDirection * mountainSlope;
                
                heightMap[x][y] = elevation;
            }
        }
        
        // 2. ЗОНЫ БИОМОВ (Вороной для чётких зон)
        const biomeZoneMap = new Array(cols);
        for (let x = 0; x < cols; x++) {
            biomeZoneMap[x] = new Array(rows);
            const nx = x / cols;
            
            for (let y = 0; y < rows; y++) {
                const ny = y / rows;
                
                // Вороной для зон
                const vor = voronoi(nx, ny, 12);
                
                // Шум влажности
                let moisture = 0;
                let totalAmp = 0;
                for (let i = 0, amp = 1, freq = 0.8; i < 4; i++) {
                    moisture += getCachedNoise(nx, ny, freq, 2.2) * amp;
                    totalAmp += amp;
                    amp *= 0.5;
                    freq *= 2;
                }
                moisture = (moisture / totalAmp + 1) / 2;
                
                biomeZoneMap[x][y] = {
                    zone: vor.zone,
                    zoneId: vor.zoneId,
                    edgeValue: vor.edgeValue,
                    moisture: moisture,
                    voronoiValue: vor.distance
                };
            }
        }
        
        // 3. РЕКА С ИСТОКАМИ (только в горах и на возвышенностях)
        const riverDistanceMap = new Array(cols);
        const riverSourceMap = new Array(cols);
        
        for (let x = 0; x < cols; x++) {
            riverDistanceMap[x] = new Array(rows);
            riverSourceMap[x] = new Array(rows);
            const nx = x / cols;
            
            for (let y = 0; y < rows; y++) {
                const ny = y / rows;
                const height = heightMap[x][y];
                
                // Река появляется только если высота достаточно высока (истоки в горах)
                // И не на слишком крутых склонах
                const isSourceArea = height > 0.55 && height < 0.85;
                
                const riverNoise = getCachedNoise(nx, ny, riverParams.curveScale) * riverParams.noiseInfluence;
                
                let distanceToRiver;
                let isSource = false;
                
                if (riverParams.direction === 'horizontal') {
                    // Линия реки с извилистостью
                    const centerLine = riverParams.offset + 
                                    Math.sin(nx * Math.PI * 2 * riverParams.curveScale) * riverParams.curveIntensity +
                                    riverNoise;
                    distanceToRiver = Math.abs(ny - centerLine);
                    
                    // Истоки в верхней части (левой) - высокая высота
                    if (isSourceArea && nx < 0.3 && distanceToRiver < riverParams.width) {
                        isSource = true;
                    }
                } else {
                    const centerLine = riverParams.offset + 
                                    Math.sin(ny * Math.PI * 2 * riverParams.curveScale) * riverParams.curveIntensity +
                                    riverNoise;
                    distanceToRiver = Math.abs(nx - centerLine);
                    
                    // Истоки в верхней части - высокая высота
                    if (isSourceArea && ny < 0.3 && distanceToRiver < riverParams.width) {
                        isSource = true;
                    }
                }
                
                riverDistanceMap[x][y] = distanceToRiver;
                riverSourceMap[x][y] = isSource;
            }
        }
        
        // 4. ФИНАЛЬНОЕ ОПРЕДЕЛЕНИЕ ТИПОВ
        const riverHalfWidth = riverParams.width / 2;
        
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                const height = heightMap[x][y];
                const zone = biomeZoneMap[x][y];
                const moisture = zone.moisture;
                const zoneId = zone.zoneId;
                const edgeValue = zone.edgeValue;
                const distToRiver = riverDistanceMap[x][y];
                const isSource = riverSourceMap[x][y];
                
                const isRiver = riverParams.hasRiver && distToRiver < riverHalfWidth;
                const isNearRiver = riverParams.hasRiver && distToRiver < riverParams.width;
                
                let finalElevation = height;
                let tileType;
                let isRiverTile = false;
                let voronoiZoneColor = zoneId; // Для отладки
                
                // ---- ВОДА ----
                if (isRiver) {
                    isRiverTile = true;
                    
                    // Эрозия русла: V-образная форма
                    const depthFactor = 1 - (distToRiver / riverHalfWidth);
                    let erosionDepth;
                    
                    if (isSource) {
                        // Исток - мелкий ручей
                        erosionDepth = 0.15 * Math.pow(depthFactor, 1.2);
                        finalElevation = Math.max(0.08, height - erosionDepth);
                    } else {
                        // Основное русло - глубже
                        erosionDepth = 0.35 * Math.pow(depthFactor, 1.3);
                        finalElevation = Math.max(0.05, height - erosionDepth);
                    }
                    
                    // Глубина определяет тип воды
                    if (finalElevation < 0.1) {
                        tileType = WorldGenerator.TILE_TYPES.DEEP_WATER;
                    } else if (finalElevation < 0.2) {
                        tileType = WorldGenerator.TILE_TYPES.WATER;
                    } else {
                        tileType = WorldGenerator.TILE_TYPES.WATER;
                    }
                }
                // ---- ГОРЫ (на основе высоты) ----
                else if (height > biomesParams.mountainTransition) {
                    tileType = WorldGenerator.TILE_TYPES.MOUNTAIN;
                    finalElevation = height * (1 + (height - biomesParams.mountainTransition) * 0.6);
                }
                // ---- НИЗМЕННОСТИ (биомы по зонам Вороного) ----
                else {
                    // Раскрашиваем зоны Вороного для наглядности
                    // 6 разных биомов по зонам
                    switch(zoneId % 6) {
                        case 0: // Зона 0: Лес
                            if (moisture > 0.4 || height > 0.3) {
                                tileType = WorldGenerator.TILE_TYPES.FOREST;
                            } else {
                                tileType = WorldGenerator.TILE_TYPES.GRASS;
                            }
                            break;
                        case 1: // Зона 1: Трава/Поле
                            tileType = WorldGenerator.TILE_TYPES.GRASS;
                            break;
                        case 2: // Зона 2: Пустыня/Песок
                            if (moisture > 0.5 || height > 0.25) {
                                tileType = WorldGenerator.TILE_TYPES.GRASS;
                            } else {
                                tileType = WorldGenerator.TILE_TYPES.SAND;
                            }
                            break;
                        case 3: // Зона 3: Лес (влажный)
                            if (moisture > 0.3) {
                                tileType = WorldGenerator.TILE_TYPES.FOREST;
                            } else {
                                tileType = WorldGenerator.TILE_TYPES.GRASS;
                            }
                            break;
                        case 4: // Зона 4: Саванна/Смешанная
                            if (height > 0.3) {
                                tileType = WorldGenerator.TILE_TYPES.FOREST;
                            } else if (moisture > 0.5) {
                                tileType = WorldGenerator.TILE_TYPES.GRASS;
                            } else {
                                tileType = WorldGenerator.TILE_TYPES.SAND;
                            }
                            break;
                        case 5: // Зона 5: Пойма/Болото
                            if (isNearRiver && height < 0.35) {
                                tileType = WorldGenerator.TILE_TYPES.GRASS;
                            } else if (moisture > 0.6) {
                                tileType = WorldGenerator.TILE_TYPES.FOREST;
                            } else {
                                tileType = WorldGenerator.TILE_TYPES.GRASS;
                            }
                            break;
                        default:
                            tileType = WorldGenerator.TILE_TYPES.GRASS;
                    }
                    
                    // Коррекция по влажности
                    if (moisture > 0.7 && tileType !== WorldGenerator.TILE_TYPES.SAND) {
                        tileType = WorldGenerator.TILE_TYPES.FOREST;
                    }
                    if (moisture < 0.25 && tileType === WorldGenerator.TILE_TYPES.GRASS) {
                        tileType = WorldGenerator.TILE_TYPES.SAND;
                    }
                    
                    finalElevation = height;
                    
                    // У реки немного понижаем высоту
                    if (isNearRiver && !isRiver) {
                        const bankFactor = 1 - ((distToRiver - riverHalfWidth) / (riverParams.width - riverHalfWidth));
                        finalElevation = height - 0.05 * bankFactor;
                    }
                }
                
                // Ограничиваем высоту
                finalElevation = Math.max(0.05, Math.min(1.2, finalElevation));
                
                world[x][y] = {
                    type: tileType.id,
                    elevation: finalElevation,
                    baseElevation: height,
                    biomeZone: zone.zone,
                    zoneId: zone.zoneId,
                    moisture: moisture,
                    voronoiEdge: edgeValue,
                    x: x,
                    y: y,
                    isRiver: isRiverTile,
                    isRiverSource: isSource,
                    distanceToRiver: distToRiver
                };
            }
        }
        
        // 5. СГЛАЖИВАНИЕ ГРАНИЦ МЕЖДУ ЗОНАМИ
        this.smoothBiomeBoundariesVoronoi(world, cols, rows);
        
        initWorldSize(cols, rows);
        return world;
    }

    // Сглаживание границ между зонами Вороного
    static smoothBiomeBoundariesVoronoi(world, cols, rows) {
        for (let pass = 0; pass < 2; pass++) {
            const newWorld = JSON.parse(JSON.stringify(world));
            
            for (let x = 1; x < cols - 1; x++) {
                for (let y = 1; y < rows - 1; y++) {
                    if (world[x][y].isRiver) continue;
                    
                    // Проверяем, находимся ли на границе зоны
                    const isOnEdge = world[x][y].voronoiEdge > 0.3;
                    
                    if (isOnEdge) {
                        // Собираем типы соседей
                        const neighborTypes = [];
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = x + dx;
                                const ny = y + dy;
                                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !world[nx][ny].isRiver) {
                                    neighborTypes.push(world[nx][ny].type);
                                }
                            }
                        }
                        
                        if (neighborTypes.length > 0) {
                            // Находим наиболее частый тип среди соседей
                            const typeCount = {};
                            neighborTypes.forEach(t => typeCount[t] = (typeCount[t] || 0) + 1);
                            let maxCount = 0;
                            let dominantType = world[x][y].type;
                            for (const [type, count] of Object.entries(typeCount)) {
                                if (count > maxCount) {
                                    maxCount = count;
                                    dominantType = parseInt(type);
                                }
                            }
                            
                            // Плавно смешиваем на границе
                            const mixFactor = Math.min(0.7, world[x][y].voronoiEdge);
                            if (dominantType !== world[x][y].type && maxCount >= 4) {
                                newWorld[x][y].type = dominantType;
                            }
                        }
                    }
                }
            }
            
            for (let x = 0; x < cols; x++) {
                for (let y = 0; y < rows; y++) {
                    world[x][y].type = newWorld[x][y].type;
                }
            }
        }
    }

    // Лёгкое сглаживание (не размывает сильно)
    static smoothBiomeBoundariesLight(world, cols, rows) {
        for (let pass = 0; pass < 1; pass++) {
            const newWorld = JSON.parse(JSON.stringify(world));
            
            for (let x = 1; x < cols - 1; x++) {
                for (let y = 1; y < rows - 1; y++) {
                    if (world[x][y].isRiver) continue;
                    
                    const neighbors = [];
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                                neighbors.push(world[nx][ny]);
                            }
                        }
                    }
                    
                    // Считаем типы соседей
                    const typeCount = {};
                    neighbors.forEach(n => {
                        if (!n.isRiver) {
                            typeCount[n.type] = (typeCount[n.type] || 0) + 1;
                        }
                    });
                    
                    const currentType = world[x][y].type;
                    const maxCount = Math.max(...Object.values(typeCount));
                    const dominantType = parseInt(Object.keys(typeCount).find(k => typeCount[k] === maxCount));
                    
                    // Только если более 5 соседей другого типа, меняем
                    if (maxCount >= 6 && dominantType !== currentType && !world[x][y].isRiver) {
                        newWorld[x][y].type = dominantType;
                    }
                }
            }
            
            for (let x = 0; x < cols; x++) {
                for (let y = 0; y < rows; y++) {
                    world[x][y].type = newWorld[x][y].type;
                }
            }
        }
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

export function ReGenerateWithParams(cols, rows, params) {
    world = WorldGenerator.generateWithParams(cols, rows, params);
}