// LineOfSight.js
import { HexGeometryCache } from './WorldGeometry.js';
import { getHexAtPoint, bresenhamLine } from './Debug/LineDebug.js';

export class LineOfSight {
    /**
     * Проверяет видимость одного гекса
     */
    static hasLineOfSight(source, target, isObstacle, worldCols, worldRows) {
        if (source.x === target.x && source.y === target.y) return true;

        const sourceCenter = HexGeometryCache.getHexCenter(source.x, source.y);
        const targetCenter = HexGeometryCache.getHexCenter(target.x, target.y);
        
        const hexRadius = HexGeometryCache.getRadius();
        const rayCount = 2;  // 2 параллельных луча
        const rayThickness = hexRadius / 4;
        
        const dx = targetCenter.x - sourceCenter.x;
        const dy = targetCenter.y - sourceCenter.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return true;
        
        const perpX = -dy / length;
        const perpY = dx / length;
        
        const isBlocked = (x, y) => {
            if (x < 0 || y < 0 || x >= worldCols || y >= worldRows) return true;
            return isObstacle(x, y);
        };
        
        // Проверяем 2 луча
        for (let i = 0; i < rayCount; i++) {
            const offset = (i - 0.5) * (rayThickness / rayCount);
            
            const rayStart = {
                x: sourceCenter.x + perpX * offset,
                y: sourceCenter.y + perpY * offset
            };
            
            const rayEnd = {
                x: targetCenter.x + perpX * offset,
                y: targetCenter.y + perpY * offset
            };
            
            if (!this._rayHasObstacle(rayStart, rayEnd, source, target, isBlocked)) {
                return true;
            }
        }
        
        return false;
    }
    
    static _rayHasObstacle(rayStart, rayEnd, source, target, isBlocked) {
        const hexes = this._getHexesOnRay(rayStart, rayEnd, source, target);
        
        for (const hex of hexes) {
            if ((hex.x === source.x && hex.y === source.y) ||
                (hex.x === target.x && hex.y === target.y)) {
                continue;
            }
            
            if (isBlocked(hex.x, hex.y)) {
                return true;
            }
        }
        
        return false;
    }
    
    static _getHexesOnRay(rayStart, rayEnd, source, target) {
        const result = new Set();
        
        const points = bresenhamLine(
            Math.round(rayStart.x), Math.round(rayStart.y),
            Math.round(rayEnd.x), Math.round(rayEnd.y)
        );
        
        points.forEach(point => {
            const hex = getHexAtPoint(point.x, point.y);
            if (hex) result.add(`${hex.x},${hex.y}`);
        });
        
        // Добавляем стартовый и целевой
        result.add(`${source.x},${source.y}`);
        result.add(`${target.x},${target.y}`);
        
        return Array.from(result).map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
    }
    
    /**
     * Получить все видимые гексы из списка
     */
    static getVisibleHexes(source, hexesToCheck, isObstacle, worldCols, worldRows) {
        const visible = [];
        const checked = new Set();
        
        for (const hex of hexesToCheck) {
            const key = `${hex.x},${hex.y}`;
            
            // Пропускаем уже проверенные
            if (checked.has(key)) continue;
            
            // Пропускаем гексы за границей карты - они всегда невидимы
            if (hex.x < 0 || hex.y < 0 || hex.x >= worldCols || hex.y >= worldRows) {
                checked.add(key);
                continue;
            }
            
            checked.add(key);
            
            if (this.hasLineOfSight(source, hex, isObstacle, worldCols, worldRows)) {
                visible.push(hex);
            }
        }
        
        return visible;
    }
}

export default LineOfSight;