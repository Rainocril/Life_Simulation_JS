import { ctx, offsetX, offsetY} from "./index.js";
import { world } from "./WorldGenerator.js";
import { HexGeometryCache } from "./WorldGeometry.js";

let offscreenCanvas = document.createElement('canvas');
let offscreenCtx = offscreenCanvas.getContext('2d');

// Кэш для кругов и маленьких гексагонов
const circleCache = new Map();
const smallHexagonCache = new Map();

let colors = ['#1565C0', '#2196F3', '#FFEB3B', '#4CAF50', '#2E7D32', '#795548'];

function drawHexagon(x, y, type, context) {
    context.save();
    context.translate(x, y);
    context.fillStyle = colors[type];
    context.fill(HexGeometryCache.getPath());
    context.stroke(HexGeometryCache.getPath());
    context.restore();
}

function generateWorldImage(xGrid, yGrid, radius) {
    const hexWidth = radius * 2;
    const hexHeight = HexGeometryCache.getHeight();
    const canvasWidth = xGrid * hexWidth * 0.75 + hexWidth/2;
    const canvasHeight = yGrid * hexHeight + hexHeight/2;
    
    offscreenCanvas.width = canvasWidth;
    offscreenCanvas.height = canvasHeight;
    
    offscreenCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Локальная копия ссылки на мир для безопасности
    const currentWorld = world;
    
    let x = radius;
    let y = HexGeometryCache.getHeight() / 2;
    let offset;
    
    for (let X = 0; X < xGrid; X++) {
        if (X % 2 === 0) { offset = y; } else { offset = y * 2; }
        
        for (let Y = 0; Y < yGrid; Y++) {
            // Проверяем границы массива
            if (X < currentWorld.length && Y < currentWorld[0].length) {
                drawHexagon(x * X * 1.5 + x, y * Y * 2 + offset, currentWorld[X][Y].type, offscreenCtx);
            }
        }
    }
    
    const img = new Image();
    img.src = offscreenCanvas.toDataURL();
    return img;
}

let worldImageCache = null;
let lastWorldState = null;

export function drawHexagonGrid(xGrid, yGrid, radius) {
    let worldHash = '';
    for (let x = 0; x < Math.min(xGrid, world.length); x++) {
        for (let y = 0; y < Math.min(yGrid, world[0].length); y++) {
            worldHash += world[x][y].type;
        }
    }
    const worldState = `${xGrid}_${yGrid}_${radius}_${worldHash}`;
    
    if (worldState !== lastWorldState || !worldImageCache) {
        worldImageCache = generateWorldImage(xGrid, yGrid, radius);
        lastWorldState = worldState;
        console.log("World cache updated - content changed");
    }

    ctx.drawImage(worldImageCache, offsetX, offsetY);
}

export function drawCircle(x, y, hexRadius, color, size) {
    const cacheKey = `${color}_${size}`;
    const padding = 2;

    if (!circleCache.has(cacheKey)) {
        const diameter = size * 2 + padding * 2;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = diameter;
        tempCanvas.height = diameter;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.beginPath();
        tempCtx.arc(size + padding, size + padding, size, 0, Math.PI * 2);
        tempCtx.fillStyle = color;
        tempCtx.fill();
        tempCtx.closePath();
        
        circleCache.set(cacheKey, tempCanvas);
    }
    
    const center = HexGeometryCache.getHexCenter(x, y);
    const cachedCircle = circleCache.get(cacheKey);
    
    ctx.drawImage(
        cachedCircle,
        center.x - size - padding + offsetX,
        center.y - size - padding + offsetY
    );
}

export function drawSmallHexagon(x, y, hexRadius, color) {
    const smallRadius = hexRadius / 4;
    const cacheKey = `${color}_${smallRadius}`;
    const padding = 2;
    
    if (!smallHexagonCache.has(cacheKey)) {
        const diameter = smallRadius * 2 + padding * 2;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = diameter;
        tempCanvas.height = diameter;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i + Math.PI / 6;
            const vertexX = smallRadius + padding + smallRadius * Math.cos(angle);
            const vertexY = smallRadius + padding + smallRadius * Math.sin(angle);
            if (i === 0) tempCtx.moveTo(vertexX, vertexY);
            else tempCtx.lineTo(vertexX, vertexY);
        }
        tempCtx.closePath();
        tempCtx.fillStyle = color;
        tempCtx.fill();
        
        smallHexagonCache.set(cacheKey, tempCanvas);
    }
    
    const center = HexGeometryCache.getHexCenter(x, y);
    const cachedHexagon = smallHexagonCache.get(cacheKey);
    
    ctx.drawImage(
        cachedHexagon,
        center.x - smallRadius - padding + offsetX,
        center.y - smallRadius - padding + offsetY
    );
}

export function drawHexagonV(x, y, color, fill = false) {
    const center = HexGeometryCache.getHexCenter(x, y);
    
    ctx.save();
    ctx.translate(center.x + offsetX, center.y + offsetY);
    
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill(HexGeometryCache.getPath());
    } else {
        ctx.strokeStyle = color;
        ctx.stroke(HexGeometryCache.getPath());
    }
    
    ctx.restore();
}

export function drawVisionRange(entity, hexRadius, showDebug = false) {
    // Получаем кэшированные видимые гексы из entity
    const visibleHexes = entity.getCachedVisibleHexes();
    // Получаем ВСЕ гексы в радиусе видимости для отладки
    const allHexes = entity.getAllHexesCache ? entity.getAllHexesCache() : [];
    
    const colorMap = {
        Fish: [100, 150, 255],
        Rabbit: [255, 255, 255],
        Fox: [255, 150, 50]
    };
    
    const baseColor = colorMap[entity.constructor.name] || [200, 200, 200];
    const color = `rgba(${baseColor.join(',')},0.5)`;
    
    // Отрисовываем видимые гексы
    visibleHexes.forEach(hex => {
        drawHexagonV(hex.x, hex.y, color, true);
    });
    
    // Если включен режим отладки - отрисовываем линии ко ВСЕМ гексам
    if (showDebug) {
        const entityCenter = HexGeometryCache.getHexCenter(entity.x, entity.y);
        
        // Создаем Set для быстрой проверки видимости
        const visibleHexSet = new Set(visibleHexes.map(h => `${h.x},${h.y}`));
        
        // Отрисовываем линии ко ВСЕМ гексам в радиусе видимости
        allHexes.forEach(hex => {
            const hexCenter = HexGeometryCache.getHexCenter(hex.x, hex.y);
            const isVisible = visibleHexSet.has(`${hex.x},${hex.y}`);
            
            if (hex.x === entity.x && hex.y === entity.y) {
                // Центральный гекс - синяя точка
                ctx.beginPath();
                ctx.arc(entityCenter.x + offsetX, entityCenter.y + offsetY, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#0000FF';
                ctx.fill();
            } else {
                // Линии к гексам - зеленые для видимых, красные для невидимых
                ctx.beginPath();
                ctx.moveTo(entityCenter.x + offsetX, entityCenter.y + offsetY);
                ctx.lineTo(hexCenter.x + offsetX, hexCenter.y + offsetY);
                ctx.strokeStyle = isVisible ? '#00FF00' : '#FF0000';
                ctx.lineWidth = isVisible ? 2 : 1;
                ctx.stroke();
                
                // Точки на гексах - зеленые для видимых, красные для невидимых
                ctx.beginPath();
                ctx.arc(hexCenter.x + offsetX, hexCenter.y + offsetY, 3, 0, Math.PI * 2);
                ctx.fillStyle = isVisible ? '#00FF00' : '#FF0000';
                ctx.fill();
            }
        });
        
        // Подпись координат entity
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.fillText(`(${entity.x},${entity.y})`, entityCenter.x + offsetX + 8, entityCenter.y + offsetY - 8);
        
        // Статистика видимости
        ctx.fillText(`Visible: ${visibleHexes.length}/${allHexes.length}`, 
                    entityCenter.x + offsetX + 8, entityCenter.y + offsetY + 8);
    }
}

export function drawAllVisionHexes(entity, hexRadius, SortTest) {
    const allHexes = entity.getAllHexesCache();
    
    // Отрисовываем с градиентом
    for (let i = 0; i < allHexes.length; i++) {
        const hex = allHexes[i];
        
        // Градиент от красного к желтому
        const progress = i+10;
        const red = 255;
        const green = progress;
        let blue;
        if (i < SortTest) blue = 0
        else blue = 255;
        const alpha = 1;
        
        const color = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        
        drawHexagonV(hex.x, hex.y, color, true);
    }
}

export function drawDistanceDebug(entity, hexRadius) {
    // Получаем УЖЕ отсортированный массив
    const allHexes = entity.getAllHexesCache();
    const distancesMap = entity.getDistancesToMultipleHexes(allHexes);
    
    // Отрисовываем гексы с прозрачностью и цифрами
    allHexes.forEach(hex => {
        const distance = distancesMap.get(hex) || entity.visionRange + 1;
        
        // Прозрачность зависит от дистанции (ближе = ярче)
        const alpha = 1 / entity.visionRange;
        const color = `rgba(255, 0, 0, ${alpha})`;
        
        // Рисуем гекс
        drawHexagonV(hex.x, hex.y, color, true);
        
        // Рисуем цифру дистанции
        drawDistanceText(hex.x, hex.y, hexRadius, distance);
    });
}

function drawDistanceText(x, y, hexRadius, distance) {
    const center = HexGeometryCache.getHexCenter(x, y);
    
    ctx.save();
    ctx.translate(center.x + offsetX, center.y + offsetY);
    
    // Настройки текста
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = `${Math.max(10, hexRadius / 3)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Рисуем обводку и текст
    ctx.strokeText(distance.toString(), 0, 0);
    ctx.fillText(distance.toString(), 0, 0);
    
    ctx.restore();
}