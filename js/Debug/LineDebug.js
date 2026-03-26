// LineDebug.js
import { ctx, offsetX, offsetY } from "../index.js";
import { HexGeometryCache } from "../WorldGeometry.js";

export function drawLOSDebugLine(startHex, endHex) {
    if (!startHex || !endHex) return;
    
    const startCenter = HexGeometryCache.getHexCenter(startHex.x, startHex.y);
    const endCenter = HexGeometryCache.getHexCenter(endHex.x, endHex.y);
    
    // Получаем все гексагоны, которые пересекает линия (с учётом толщины луча)
    const intersectedHexes = getHexesOnLineWithThickness(startHex, endHex);
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // Рисуем основную линию
    ctx.beginPath();
    ctx.moveTo(startCenter.x, startCenter.y);
    ctx.lineTo(endCenter.x, endCenter.y);
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = HexGeometryCache.getRadius() / 5;
    ctx.setLineDash([HexGeometryCache.getRadius() / 2, HexGeometryCache.getRadius() / 5]);
    ctx.stroke();
    
    // Рисуем "толстую" линию для визуализации области проверки
    drawThickLine(startCenter, endCenter, HexGeometryCache.getRadius() / 3, 'rgba(255, 100, 255, 0.2)');
    
    // Рисуем все пересекающиеся гексагоны
    intersectedHexes.forEach(hex => {
        const center = HexGeometryCache.getHexCenter(hex.x, hex.y);
        
        // Заливка гексагона
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
        ctx.fill(HexGeometryCache.getPath());
        ctx.strokeStyle = '#FF6600';
        ctx.lineWidth = HexGeometryCache.getRadius() / 8;
        ctx.stroke(HexGeometryCache.getPath());
        ctx.restore();
        
        // Подпись координат
        ctx.fillStyle = '#FF6600';
        ctx.font = 'bold 10px monospace';
        ctx.shadowBlur = 2;
        ctx.shadowColor = 'black';
        ctx.fillText(`[${hex.x},${hex.y}]`, center.x + 5, center.y - 5);
    });
    
    // Рисуем точки на начальном и конечном гексагонах
    ctx.beginPath();
    ctx.arc(startCenter.x, startCenter.y, HexGeometryCache.getRadius() * 8/10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = HexGeometryCache.getRadius() / 5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(endCenter.x, endCenter.y, HexGeometryCache.getRadius()* 8/10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
    ctx.fill();
    ctx.stroke();
    
    // Подписи координат
    ctx.fillStyle = '#FF00FF';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`[${startHex.x},${startHex.y}]`, startCenter.x + 15, startCenter.y - 5);
    ctx.fillText(`[${endHex.x},${endHex.y}]`, endCenter.x + 15, endCenter.y - 5);
    
    // Статистика
    const distance = Math.sqrt(
        Math.pow(endCenter.x - startCenter.x, 2) + 
        Math.pow(endCenter.y - startCenter.y, 2)
    );
    
    const midX = (startCenter.x + endCenter.x) / 2;
    const midY = (startCenter.y + endCenter.y) / 2;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`Dist: ${Math.round(distance)}px`, midX + 10, midY);
    ctx.fillText(`Hexes: ${intersectedHexes.length}`, midX + 10, midY + 20);
    
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Логирование
    console.group(`Line from [${startHex.x},${startHex.y}] to [${endHex.x},${endHex.y}]`);
    console.log(`Intersected hexes (${intersectedHexes.length}): ${intersectedHexes.map(h => `[${h.x},${h.y}]`).join(', ')}`);
    console.groupEnd();
}

/**
 * Рисует "толстую" линию для визуализации области проверки
 */
function drawThickLine(start, end, thickness, color) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const perpX = -Math.sin(angle) * thickness;
    const perpY = Math.cos(angle) * thickness;
    
    ctx.beginPath();
    ctx.moveTo(start.x + perpX, start.y + perpY);
    ctx.lineTo(end.x + perpX, end.y + perpY);
    ctx.lineTo(end.x - perpX, end.y - perpY);
    ctx.lineTo(start.x - perpX, start.y - perpY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

/**
 * Получает все гексагоны, которые пересекает линия с учётом толщины
 * Использует метод параллельных лучей (как в Fox.js)
 */
function getHexesOnLineWithThickness(startHex, endHex) {
    const hexRadius = HexGeometryCache.getRadius();
    const startCenter = HexGeometryCache.getHexCenter(startHex.x, startHex.y);
    const endCenter = HexGeometryCache.getHexCenter(endHex.x, endHex.y);
    
    // Количество параллельных лучей
    const rayCount = 5;
    // Толщина луча (в пикселях)
    const rayThickness = hexRadius / 4;
    
    const intersectedHexes = new Set(); // Используем Set для уникальности
    
    // Вычисляем вектор направления
    const dx = endCenter.x - startCenter.x;
    const dy = endCenter.y - startCenter.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
        intersectedHexes.add(`${startHex.x},${startHex.y}`);
        return Array.from(intersectedHexes).map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
    }
    
    // Нормализованный перпендикулярный вектор
    const perpX = -dy / length;
    const perpY = dx / length;
    
    // Создаём несколько параллельных лучей
    for (let i = 0; i < rayCount; i++) {
        // Смещение от центральной линии
        const offset = (i - (rayCount - 1) / 2) * (rayThickness / rayCount);
        
        const offsetStart = {
            x: startCenter.x + perpX * offset,
            y: startCenter.y + perpY * offset
        };
        
        const offsetEnd = {
            x: endCenter.x + perpX * offset,
            y: endCenter.y + perpY * offset
        };
        
        // Получаем гексагоны для этого луча
        const rayHexes = getHexesOnRay(offsetStart, offsetEnd, startHex, endHex);
        rayHexes.forEach(hex => {
            intersectedHexes.add(`${hex.x},${hex.y}`);
        });
    }
    
    // Конвертируем Set в массив объектов
    return Array.from(intersectedHexes).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    });
}

/**
 * Получает гексагоны для одного луча с использованием алгоритма Брезенхема
 * с дополнительной проверкой соседей для захвата касательных гексагонов
 */
function getHexesOnRay(startPoint, endPoint, startHex, endHex) {
    const hexRadius = HexGeometryCache.getRadius();
    const result = new Set();
    
    // Получаем все точки на линии (пиксели)
    const points = bresenhamLine(
        Math.round(startPoint.x), Math.round(startPoint.y),
        Math.round(endPoint.x), Math.round(endPoint.y)
    );
    
    // Для каждой точки находим гексагон
    points.forEach(point => {
        const hex = getHexAtPoint(point.x, point.y);
        if (hex) {
            result.add(`${hex.x},${hex.y}`);
        }
    });
    
    // Дополнительная проверка: если луч проходит точно между двумя гексагонами,
    // нужно добавить оба. Проверяем соседей для каждой точки.
    const additionalHexes = new Set();
    
    points.forEach(point => {
        const hex = getHexAtPoint(point.x, point.y);
        if (hex) {
            // Проверяем, не находится ли точка близко к границе
            const center = HexGeometryCache.getHexCenter(hex.x, hex.y);
            const distanceToCenter = Math.sqrt(
                Math.pow(point.x - center.x, 2) + 
                Math.pow(point.y - center.y, 2)
            );
            
            // Если точка близко к границе (в пределах 30% радиуса), проверяем соседей
            if (distanceToCenter > hexRadius * 0.7) {
                const neighbors = getNeighborHexes(hex.x, hex.y);
                neighbors.forEach(neighbor => {
                    const neighborCenter = HexGeometryCache.getHexCenter(neighbor.x, neighbor.y);
                    const distanceToNeighbor = Math.sqrt(
                        Math.pow(point.x - neighborCenter.x, 2) + 
                        Math.pow(point.y - neighborCenter.y, 2)
                    );
                    
                    if (distanceToNeighbor < hexRadius * 0.8) {
                        additionalHexes.add(`${neighbor.x},${neighbor.y}`);
                    }
                });
            }
        }
    });
    
    // Добавляем дополнительные гексагоны
    additionalHexes.forEach(key => result.add(key));
    
    // Всегда добавляем начальный и конечный гексагоны
    result.add(`${startHex.x},${startHex.y}`);
    result.add(`${endHex.x},${endHex.y}`);
    
    // Конвертируем Set в массив объектов
    return Array.from(result).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    });
}

/**
 * Получает соседние гексагоны (все 6 направлений)
 */
function getNeighborHexes(x, y) {
    const parity = x % 2 === 0 ? 'even' : 'odd';
    const offsets = {
        even: [[1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1]],
        odd:  [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1]]
    };
    
    return offsets[parity].map(([dx, dy]) => ({
        x: x + dx,
        y: y + dy
    }));
}

/**
 * Алгоритм Брезенхема для рисования линии
 */
export function bresenhamLine(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    let x = x0;
    let y = y0;
    
    while (true) {
        points.push({ x, y });
        if (x === x1 && y === y1) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
    
    return points;
}

/**
 * Находит гексагон по координатам точки (как в index.js)
 */
export function getHexAtPoint(worldX, worldY) {
    const hexRadius = HexGeometryCache.getRadius();
    const hexHeight = HexGeometryCache.getHeight();
    
    const xIndex = Math.floor((worldX - hexRadius) / (hexRadius * 1.5));
    
    let lineIndex = Math.floor(worldY / (hexHeight / 2));
    
    let topY, bottomY;
    
    if (lineIndex % 2 === 0) {
        const yVal = lineIndex / 2;
        topY = yVal * hexHeight + hexHeight / 2;
        bottomY = yVal * hexHeight + hexHeight;
    } else {
        const yVal = Math.floor(lineIndex / 2);
        topY = yVal * hexHeight + hexHeight;
        bottomY = (yVal + 1) * hexHeight + hexHeight / 2;
    }
    
    if (worldY < topY) {
        lineIndex--;
    } else if (worldY > bottomY) {
        lineIndex++;
    }
    
    let yIndex, lineType;
    if (lineIndex % 2 === 0) {
        yIndex = lineIndex / 2;
        lineType = 0;
    } else {
        yIndex = Math.floor(lineIndex / 2);
        lineType = 5;
    }
    
    const rectLeft = xIndex * (hexRadius * 1.5) + hexRadius;
    const rectRight = (xIndex + 1) * (hexRadius * 1.5) + hexRadius;
    let rectTop, rectBottom;
    
    if (lineType === 0) {
        rectTop = yIndex * hexHeight + hexHeight / 2;
        rectBottom = yIndex * hexHeight + hexHeight;
    } else {
        rectTop = yIndex * hexHeight + hexHeight;
        rectBottom = (yIndex + 1) * hexHeight + hexHeight / 2;
    }
    
    const corners = [
        { x: rectLeft, y: rectTop, cornerIndex: 0 },
        { x: rectRight, y: rectTop, cornerIndex: 1 },
        { x: rectLeft, y: rectBottom, cornerIndex: 2 },
        { x: rectRight, y: rectBottom, cornerIndex: 3 }
    ];
    
    const isEvenColumn = (xIndex % 2 === 0);
    const hexCenters = [];
    
    corners.forEach(corner => {
        let isHexCenter = false;
        
        if (lineType === 0) {
            if (isEvenColumn) {
                isHexCenter = (corner.cornerIndex === 0 || corner.cornerIndex === 3);
            } else {
                isHexCenter = (corner.cornerIndex === 1 || corner.cornerIndex === 2);
            }
        } else {
            if (isEvenColumn) {
                isHexCenter = (corner.cornerIndex === 1 || corner.cornerIndex === 2);
            } else {
                isHexCenter = (corner.cornerIndex === 0 || corner.cornerIndex === 3);
            }
        }
        
        if (isHexCenter) {
            hexCenters.push(corner);
        }
    });
    
    let closestHex = null;
    let minDistance = Infinity;
    
    hexCenters.forEach(center => {
        const distance = Math.sqrt(
            Math.pow(worldX - center.x, 2) + 
            Math.pow(worldY - center.y, 2)
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            
            const hexX = Math.round((center.x - hexRadius) / (hexRadius * 1.5));
            
            let hexY;
            if (hexX % 2 === 0) {
                hexY = Math.round((center.y - hexHeight / 2) / hexHeight);
            } else {
                hexY = Math.round((center.y - hexHeight) / hexHeight);
            }
            
            closestHex = { x: hexX, y: hexY };
        }
    });
    
    return closestHex;
}

/**
 * Визуализация отладки с показом всех параллельных лучей
 */
export function drawLineIntersectionDebug(startHex, endHex) {
    if (!startHex || !endHex) return;
    
    const hexRadius = HexGeometryCache.getRadius();
    const startCenter = HexGeometryCache.getHexCenter(startHex.x, startHex.y);
    const endCenter = HexGeometryCache.getHexCenter(endHex.x, endHex.y);
    
    const rayCount = 2;
    const rayThickness = hexRadius / 10;
    
    const dx = endCenter.x - startCenter.x;
    const dy = endCenter.y - startCenter.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / length;
    const perpY = dx / length;
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // Рисуем все параллельные лучи
    for (let i = 0; i < rayCount; i++) {
        const offset = (i - (rayCount - 1) / 2) * (rayThickness / rayCount);
        
        const offsetStart = {
            x: startCenter.x + perpX * offset,
            y: startCenter.y + perpY * offset
        };
        
        const offsetEnd = {
            x: endCenter.x + perpX * offset,
            y: endCenter.y + perpY * offset
        };
        
        ctx.beginPath();
        ctx.moveTo(offsetStart.x, offsetStart.y);
        ctx.lineTo(offsetEnd.x, offsetEnd.y);
        ctx.strokeStyle = `hsl(${i * 60}, 100%, 50%)`;
        ctx.lineWidth = hexRadius / 8;
        ctx.stroke();
        
        // Отмечаем точки на луче
        const points = bresenhamLine(
            Math.round(offsetStart.x), Math.round(offsetStart.y),
            Math.round(offsetEnd.x), Math.round(offsetEnd.y)
        );
        
        points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${i * 60}, 100%, 50%)`;
            ctx.fill();
        });
    }
    
    ctx.restore();
}


/**
 * Рисует линию с выделением препятствий
 * @param {Object} startHex - начальный гексагон
 * @param {Object} endHex - конечный гексагон  
 * @param {Function} isObstacle - функция проверки препятствий (x, y) => boolean
 * @param {number} worldCols - ширина мира
 * @param {number} worldRows - высота мира
 */
export function drawLineWithObstacles(startHex, endHex, isObstacle, worldCols, worldRows) {
    if (!startHex || !endHex) return;
    
    const startCenter = HexGeometryCache.getHexCenter(startHex.x, startHex.y);
    const endCenter = HexGeometryCache.getHexCenter(endHex.x, endHex.y);
    
    // Получаем все гексагоны, которые пересекает линия
    const allIntersectedHexes = getHexesOnLineWithThickness(startHex, endHex);
    
    // СОРТИРУЕМ гексы по расстоянию от старта (в пикселях)
    const sortedHexes = [...allIntersectedHexes].sort((a, b) => {
        const centerA = HexGeometryCache.getHexCenter(a.x, a.y);
        const centerB = HexGeometryCache.getHexCenter(b.x, b.y);
        const distA = Math.hypot(centerA.x - startCenter.x, centerA.y - startCenter.y);
        const distB = Math.hypot(centerB.x - startCenter.x, centerB.y - startCenter.y);
        return distA - distB;
    });
    
    // Находим первое препятствие на пути (включая границы мира)
    let firstObstacle = null;
    let obstacleIndex = -1;
    let obstacleCenter = null;
    
    // Собираем гексагоны ДО препятствия (видимые)
    const visibleHexes = [];
    
    for (let i = 0; i < sortedHexes.length; i++) {
        const hex = sortedHexes[i];
        
        // Пропускаем стартовую позицию для проверки препятствий
        if (hex.x === startHex.x && hex.y === startHex.y) {
            visibleHexes.push(hex);
            continue;
        }
        
        // Проверяем, является ли гекс препятствием
        const isBlocked = hex.x < 0 || hex.y < 0 || 
                          hex.x >= worldCols || hex.y >= worldRows || 
                          isObstacle(hex.x, hex.y);
        
        if (isBlocked) {
            // Нашли первое препятствие
            if (firstObstacle === null) {
                firstObstacle = hex;
                obstacleIndex = i;
                obstacleCenter = HexGeometryCache.getHexCenter(firstObstacle.x, firstObstacle.y);
            }
            // После нахождения препятствия, остальные гексы не добавляем в видимые
            break;
        } else {
            // Гекс проходимый - добавляем в видимые
            visibleHexes.push(hex);
        }
    }
    
    // Получаем центр последнего видимого гекса
    let lastVisibleHex = visibleHexes.length > 0 ? visibleHexes[visibleHexes.length - 1] : null;
    let lineEndPoint = lastVisibleHex 
        ? HexGeometryCache.getHexCenter(lastVisibleHex.x, lastVisibleHex.y)
        : startCenter;
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // Рисуем основную линию (до последнего видимого гекса) - сплошная
    ctx.beginPath();
    ctx.moveTo(startCenter.x, startCenter.y);
    ctx.lineTo(lineEndPoint.x, lineEndPoint.y);
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = HexGeometryCache.getRadius() / 5;
    ctx.setLineDash([]);
    ctx.stroke();
    
    // Если есть препятствие, рисуем пунктирную линию от препятствия до конца
    if (firstObstacle && obstacleCenter) {
        ctx.beginPath();
        ctx.moveTo(obstacleCenter.x, obstacleCenter.y);
        ctx.lineTo(endCenter.x, endCenter.y);
        ctx.strokeStyle = '#FF66CC';
        ctx.lineWidth = HexGeometryCache.getRadius() / 6;
        ctx.setLineDash([HexGeometryCache.getRadius() / 3, HexGeometryCache.getRadius() / 3]);
        ctx.stroke();
    }
    
    // Рисуем "толстую" линию для визуализации области проверки (только до препятствия)
    const endPointForThickLine = firstObstacle && obstacleCenter
        ? obstacleCenter
        : endCenter;
    drawThickLine(startCenter, endPointForThickLine, HexGeometryCache.getRadius() / 3, 'rgba(255, 100, 255, 0.2)');
    
    // Рисуем ВСЕ видимые гексагоны (зелёные)
    visibleHexes.forEach(hex => {
        const center = HexGeometryCache.getHexCenter(hex.x, hex.y);
        
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.fillStyle = 'rgba(100, 255, 100, 0.4)';
        ctx.fill(HexGeometryCache.getPath());
        ctx.strokeStyle = '#66FF66';
        ctx.lineWidth = HexGeometryCache.getRadius() / 8;
        ctx.stroke(HexGeometryCache.getPath());
        ctx.restore();
        
        // Подпись координат
        ctx.fillStyle = '#66FF66';
        ctx.font = 'bold 10px monospace';
        ctx.shadowBlur = 2;
        ctx.shadowColor = 'black';
        ctx.fillText(`[${hex.x},${hex.y}]`, center.x + 5, center.y - 5);
    });
    
    // Выделяем препятствие красным, если оно есть
    if (firstObstacle && obstacleCenter) {
        ctx.save();
        ctx.translate(obstacleCenter.x, obstacleCenter.y);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.fill(HexGeometryCache.getPath());
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = HexGeometryCache.getRadius() / 5;
        ctx.stroke(HexGeometryCache.getPath());
        ctx.restore();
        
        // Подпись препятствия
        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`🚫 [${firstObstacle.x},${firstObstacle.y}]`, obstacleCenter.x + 10, obstacleCenter.y - 10);
        
        // Также выделяем пунктиром все гексагоны после препятствия (невидимые)
        const invisibleHexes = sortedHexes.slice(obstacleIndex + 1);
        invisibleHexes.forEach(hex => {
            const center = HexGeometryCache.getHexCenter(hex.x, hex.y);
            
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.fillStyle = 'rgba(100, 100, 100, 0.2)';
            ctx.fill(HexGeometryCache.getPath());
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = HexGeometryCache.getRadius() / 10;
            ctx.setLineDash([HexGeometryCache.getRadius() / 6, HexGeometryCache.getRadius() / 6]);
            ctx.stroke(HexGeometryCache.getPath());
            ctx.setLineDash([]);
            ctx.restore();
            
            // Подпись координат (серым)
            ctx.fillStyle = '#888888';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`[${hex.x},${hex.y}]`, center.x + 5, center.y - 5);
        });
    } else {
        // Если нет препятствия, показываем все гексы зелёными
        const allButFirst = sortedHexes.slice(1);
        allButFirst.forEach(hex => {
            const center = HexGeometryCache.getHexCenter(hex.x, hex.y);
            
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.fillStyle = 'rgba(100, 255, 100, 0.4)';
            ctx.fill(HexGeometryCache.getPath());
            ctx.strokeStyle = '#66FF66';
            ctx.lineWidth = HexGeometryCache.getRadius() / 8;
            ctx.stroke(HexGeometryCache.getPath());
            ctx.restore();
            
            ctx.fillStyle = '#66FF66';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`[${hex.x},${hex.y}]`, center.x + 5, center.y - 5);
        });
    }
    
    // Рисуем точки на начальном и конечном гексагонах
    ctx.beginPath();
    ctx.arc(startCenter.x, startCenter.y, HexGeometryCache.getRadius() * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.8)';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(endCenter.x, endCenter.y, HexGeometryCache.getRadius() * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
    ctx.fill();
    ctx.stroke();
    
    // Подписи координат
    ctx.fillStyle = '#FF00FF';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`[${startHex.x},${startHex.y}]`, startCenter.x + 15, startCenter.y - 5);
    ctx.fillText(`[${endHex.x},${endHex.y}]`, endCenter.x + 15, endCenter.y - 5);
    
    // Статистика
    const distanceToObstacle = firstObstacle && obstacleCenter
        ? Math.sqrt(
            Math.pow(obstacleCenter.x - startCenter.x, 2) + 
            Math.pow(obstacleCenter.y - startCenter.y, 2)
          )
        : Math.sqrt(
            Math.pow(endCenter.x - startCenter.x, 2) + 
            Math.pow(endCenter.y - startCenter.y, 2)
          );
    
    const midX = (startCenter.x + (firstObstacle && obstacleCenter ? obstacleCenter.x : endCenter.x)) / 2;
    const midY = (startCenter.y + (firstObstacle && obstacleCenter ? obstacleCenter.y : endCenter.y)) / 2;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`Distance: ${Math.round(distanceToObstacle)}px`, midX + 10, midY);
    ctx.fillText(`Visible: ${visibleHexes.length}`, midX + 10, midY + 20);
    
    if (firstObstacle) {
        ctx.fillStyle = '#FF6666';
        ctx.fillText(`⚠️ Obstacle at [${firstObstacle.x},${firstObstacle.y}]`, midX + 10, midY + 40);
        ctx.fillText(`Invisible: ${sortedHexes.length - visibleHexes.length}`, midX + 10, midY + 60);
    }
    
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Логирование с отображением порядка сортировки
    console.group(`🔍 Line from [${startHex.x},${startHex.y}] to [${endHex.x},${endHex.y}]`);
    console.log(`Sorted hexes by distance from start:`);
    sortedHexes.forEach((hex, idx) => {
        const center = HexGeometryCache.getHexCenter(hex.x, hex.y);
        const dist = Math.hypot(center.x - startCenter.x, center.y - startCenter.y);
        console.log(`  ${idx}: [${hex.x},${hex.y}] - distance: ${Math.round(dist)}px`);
    });
    
    if (firstObstacle) {
        console.log(`⚠️ First obstacle at [${firstObstacle.x},${firstObstacle.y}] (index ${obstacleIndex})`);
        console.log(`✅ Visible hexes (${visibleHexes.length}): ${visibleHexes.map(h => `[${h.x},${h.y}]`).join(', ')}`);
        console.log(`❌ Invisible hexes (${sortedHexes.length - visibleHexes.length}): ${sortedHexes.slice(obstacleIndex + 1).map(h => `[${h.x},${h.y}]`).join(', ')}`);
    } else {
        console.log(`✅ No obstacles found, all ${sortedHexes.length} hexes are visible`);
        console.log(`Visible hexes: ${visibleHexes.map(h => `[${h.x},${h.y}]`).join(', ')}`);
    }
    console.groupEnd();
}