// DebugGrid.js
import { ctx, offsetX, offsetY } from "../index.js";
import { HexGeometryCache } from "../WorldGeometry.js";

let debugGridEnabled = false;

/**
 * Отрисовывает сетку реальных центров и краёв гексагонов
 * @param {number} hexRadius - радиус гексагона
 * @param {number} cols - количество столбцов
 * @param {number} rows - количество строк
 */
export function drawDebugGrid(hexRadius, cols, rows) {
    if (!debugGridEnabled) return;
    
    const hexHeight = HexGeometryCache.getHeight();
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    ctx.strokeStyle = '#FF6600';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // Вертикальные линии
    for (let x = 0; x <= cols; x++) {
        const rightEdgeX = x * (hexRadius * 1.5) + hexRadius;
        ctx.beginPath();
        ctx.moveTo(rightEdgeX, 0);
        ctx.lineTo(rightEdgeX, rows * hexHeight + hexHeight);
        ctx.stroke();
        
        ctx.fillStyle = '#FFAA66';
        ctx.font = '12px monospace';
        ctx.fillText(`${x}`, rightEdgeX + 2, 30);
    }
    
    // Горизонтальные линии - каждая линия имеет свой индекс
    // Всего линий: (rows * 2 + 1)
    for (let lineIndex = 0; lineIndex <= rows * 2; lineIndex++) {
        let y;
        if (lineIndex % 2 === 0) {
            // Чётные линии - это y * hexHeight + hexHeight/2
            y = (lineIndex / 2) * hexHeight + hexHeight / 2;
        } else {
            // Нечётные линии - это y * hexHeight + hexHeight
            y = Math.floor(lineIndex / 2) * hexHeight + hexHeight;
        }
        
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cols * (hexRadius * 1.5), y);
        ctx.stroke();
        
        ctx.fillStyle = lineIndex % 2 === 0 ? '#FF6600' : '#FFAA66';
        ctx.fillText(`${Math.floor(lineIndex / 2)}${lineIndex % 2 === 0 ? '.0' : '.5'}`, 5, y + 4);
    }
    
    ctx.setLineDash([]);
    ctx.restore();
}

export function getRectangleAtPoint(clickX, clickY, hexRadius) {
    const hexHeight = HexGeometryCache.getHeight();

    const xIndex = Math.floor((clickX - hexRadius) / (hexRadius * 1.5));
    
    let lineIndex = Math.floor(clickY / (hexHeight / 2));

    let topY, bottomY;
    
    if (lineIndex % 2 === 0) {
        // Чётная линия - это y.0
        const yVal = lineIndex / 2;
        topY = yVal * hexHeight + hexHeight / 2;
        bottomY = yVal * hexHeight + hexHeight;
    } else {
        // Нечётная линия - это y.5
        const yVal = Math.floor(lineIndex / 2);
        topY = yVal * hexHeight + hexHeight;
        bottomY = (yVal + 1) * hexHeight + hexHeight / 2;
    }
    
    // Проверяем, действительно ли точка между этими линиями
    if (clickY < topY) {
        // Точка выше, берём предыдущий прямоугольник
        lineIndex--;
        if (lineIndex % 2 === 0) {
            const yVal = lineIndex / 2;
            topY = yVal * hexHeight + hexHeight / 2;
            bottomY = yVal * hexHeight + hexHeight;
        } else {
            const yVal = Math.floor(lineIndex / 2);
            topY = yVal * hexHeight + hexHeight;
            bottomY = (yVal + 1) * hexHeight + hexHeight / 2;
        }
    } else if (clickY > bottomY) {
        // Точка ниже, берём следующий прямоугольник
        lineIndex++;
        if (lineIndex % 2 === 0) {
            const yVal = lineIndex / 2;
            topY = yVal * hexHeight + hexHeight / 2;
            bottomY = yVal * hexHeight + hexHeight;
        } else {
            const yVal = Math.floor(lineIndex / 2);
            topY = yVal * hexHeight + hexHeight;
            bottomY = (yVal + 1) * hexHeight + hexHeight / 2;
        }
    }
    
    // Левая и правая границы прямоугольника
    const rectLeft = xIndex * (hexRadius * 1.5) + hexRadius;
    const rectRight = (xIndex + 1) * (hexRadius * 1.5) + hexRadius;
    
    // Формируем индекс прямоугольника
    let yIndex, lineType;
    if (lineIndex % 2 === 0) {
        // lineIndex чётный - это верхняя линия, значит прямоугольник между этой линией и следующей (нечётной)
        yIndex = lineIndex / 2;
        lineType = 0; // верхний
    } else {
        // lineIndex нечётный - это нижняя линия, значит прямоугольник между этой линией и следующей (чётной)
        yIndex = Math.floor(lineIndex / 2);
        lineType = 5; // нижний
    }
    
    return {
        xIndex: xIndex,
        yIndex: yIndex,
        lineType: lineType,
        rectLeft: rectLeft,
        rectRight: rectRight,
        rectTop: topY,
        rectBottom: bottomY
    };
}   

/**
 * Отрисовывает точку клика и показывает 4 угла маленького прямоугольника
 */
export function drawClickDebug(clickX, clickY, hexRadius, selectedHex, neighborHexes) {
    if (!debugGridEnabled || clickX === null || clickY === null) return;
    
    const hexHeight = HexGeometryCache.getHeight();
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // Получаем прямоугольник, в котором находится точка
    const rect = getRectangleAtPoint(clickX, clickY, hexRadius);
    
    // 4 угла прямоугольника
    const corners = [
        { x: rect.rectLeft, y: rect.rectTop, label: "северо-запад" },
        { x: rect.rectRight, y: rect.rectTop, label: "северо-восток" },
        { x: rect.rectLeft, y: rect.rectBottom, label: "юго-запад" },
        { x: rect.rectRight, y: rect.rectBottom, label: "юго-восток" }
    ];
    
    // Определяем, какие углы являются центрами гексагонов
    const areHexCenters = [
        isHexCenter(rect.xIndex, rect.yIndex, rect.lineType, 0),
        isHexCenter(rect.xIndex, rect.yIndex, rect.lineType, 1),
        isHexCenter(rect.xIndex, rect.yIndex, rect.lineType, 2),
        isHexCenter(rect.xIndex, rect.yIndex, rect.lineType, 3)
    ];
    
    // Рисуем прямоугольник
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.strokeRect(
        rect.rectLeft, 
        rect.rectTop, 
        rect.rectRight - rect.rectLeft, 
        rect.rectBottom - rect.rectTop
    );
    
    // Заливка прямоугольника полупрозрачным зелёным
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(
        rect.rectLeft, 
        rect.rectTop, 
        rect.rectRight - rect.rectLeft, 
        rect.rectBottom - rect.rectTop
    );
    
    // Рисуем 4 угла
    corners.forEach((corner, index) => {
        const isCenter = areHexCenters[index];
        
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
        
        if (isCenter) {
            ctx.fillStyle = '#33AAFF';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.fillStyle = '#888888';
            ctx.fill();
            ctx.strokeStyle = '#CCCCCC';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    });
    
    // Информация о прямоугольнике
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Прямоугольник [${rect.xIndex}, ${rect.yIndex}.${rect.lineType}]`, rect.rectLeft + 10, rect.rectTop - 10);
    
    // Рисуем точку клика
    ctx.beginPath();
    ctx.arc(clickX, clickY, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Координаты точки
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`(${Math.floor(clickX)}, ${Math.floor(clickY)})`, clickX + 12, clickY - 8);
    ctx.shadowBlur = 0;
    
    // Если есть выбранный гекс, показываем его
    if (selectedHex) {
        const selectedX = selectedHex.x * (hexRadius * 1.5) + hexRadius;
        const selectedY = selectedHex.y * hexHeight + (selectedHex.x % 2 === 0 ? hexHeight / 2 : hexHeight);
        
        ctx.beginPath();
        ctx.arc(selectedX, selectedY, 15, 0, Math.PI * 2);
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#FF00FF';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`SELECTED: [${selectedHex.x},${selectedHex.y}]`, selectedX + 18, selectedY - 5);
    }
    
    ctx.restore();
}

/**
 * Определяет, является ли угол прямоугольника центром гексагона
 * @param {number} xIndex - индекс по X
 * @param {number} yIndex - индекс по Y
 * @param {number} lineType - тип линии (0 - верхний прямоугольник, 5 - нижний)
 * @param {number} cornerIndex - индекс угла (0=северо-запад, 1=северо-восток, 2=юго-запад, 3=юго-восток)
 * @returns {boolean} - true если угол является центром гексагона
 */
export function isHexCenter(xIndex, yIndex, lineType, cornerIndex) {
    // В гексагональной сетке с шахматным расположением:
    // - Для чётных столбцов (xIndex чётный) центры находятся в определённых углах
    // - Для нечётных столбцов - в других
    
    const isEvenColumn = (xIndex % 2 === 0);
    
    // Верхние прямоугольники (lineType === 0)
    if (lineType === 0) {
        if (isEvenColumn) {
            // Чётный столбец: северо-запад и юго-восток являются центрами
            return (cornerIndex === 0 || cornerIndex === 3);
        } else {
            // Нечётный столбец: северо-восток и юго-запад являются центрами
            return (cornerIndex === 1 || cornerIndex === 2);
        }
    } 
    // Нижние прямоугольники (lineType === 5)
    else {
        if (isEvenColumn) {
            // Чётный столбец: северо-восток и юго-запад являются центрами
            return (cornerIndex === 1 || cornerIndex === 2);
        } else {
            // Нечётный столбец: северо-запад и юго-восток являются центрами
            return (cornerIndex === 0 || cornerIndex === 3);
        }
    }
}

/**
 * Включает/выключает отладочную сетку
 */
export function toggleDebugGrid() {
    debugGridEnabled = !debugGridEnabled;
    console.log(`Debug grid ${debugGridEnabled ? 'enabled' : 'disabled'}`);
    if (debugGridEnabled) {
        console.log('=== DEBUG MODE ===');
        console.log('Orange grid = all horizontal and vertical lines');
        console.log('Horizontal lines: y.0 (even) and y.5 (odd)');
        console.log('Green rectangle = the small rectangle where mouse is');
        console.log('Orange dots = 4 corners (hex centers) of that rectangle');
        console.log('Red dot = click position');
        console.log('Pink = currently selected hex (original algorithm)');
        console.log('==================');
    }
    return debugGridEnabled;
}

export function isDebugGridEnabled() {
    return debugGridEnabled;
}