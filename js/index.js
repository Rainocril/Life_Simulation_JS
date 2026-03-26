import { drawHexagonGrid, drawCircle, drawSmallHexagon, drawVisionRange, drawHexagonV, drawAllVisionHexes, drawDistanceDebug} from "./HexGrid.js";
import { ReGenerate, world } from "./WorldGenerator.js";
import { HexGeometryCache } from "./WorldGeometry.js";
import { WorldSimulation } from './simulation.js';
import { getHexNeighbors } from './HexUtils.js';
import { Profiler } from './Profiler.js';

import { FoxInfoDisplay } from "./Entity/FoxInfoDisplay.js";
import { BrainShowLog } from "./Neurals/BrainStorage.js";

import { drawDebugGrid, drawClickDebug, toggleDebugGrid, isDebugGridEnabled, getRectangleAtPoint, isHexCenter } from "./Debug/DebugGrid.js";
import { drawLOSDebugLine, drawLineIntersectionDebug, drawLineWithObstacles } from './Debug/LineDebug.js';
let lastClickX = null;
let lastClickY = null;

window.foxInfoDisplay = new FoxInfoDisplay('foxInfoCanvas');

const canvas = document.getElementById('hexCanvas');
export let ctx = canvas.getContext('2d');

export let showLog = false;
BrainShowLog(showLog);

export let tick = 0;
let totalTick = 0;
let speed = 10;

// Функция проверки препятствий
const isObstacle = (x, y) => {

    if (x < 0 || y < 0 || x >= world.length || y >= world[0].length) {
        return true;
    }
    // горы (type === 5)
    return world[x][y].type === 5;
};

async function simulationLoop() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    resizeCanvas();

    Profiler.start('drawHexagonGrid');
    drawHexagonGrid(world.length, world[0].length, HexRadius);
    Profiler.end('drawHexagonGrid');

    Profiler.start('drawSelectedHexes');
    drawSelectedHexes();
    Profiler.end('drawSelectedHexes');

    if (GridType === 1) {
        drawDebugGrid(HexRadius, world.length, world[0].length);
        drawClickDebug(lastClickX, lastClickY, HexRadius, selectedHex, neighborHexes);
    }
    // Отрисовка линии для выбранных гексагонов в режиме дебага
    if (GridType === 2) {
        drawDebugGrid(HexRadius, world.length, world[0].length);
        if (firstSelectedHex && secondSelectedHex) {
            drawLOSDebugLine(firstSelectedHex, secondSelectedHex);
            drawLineIntersectionDebug(firstSelectedHex, secondSelectedHex);
            drawLineWithObstacles(firstSelectedHex, secondSelectedHex, isObstacle, world.length, world[0].length);
        }
    }
    
    Profiler.start('Allsimulation');
    if (simulation) {
        if (!isPause) {
            if (tick % speed == 0) {
                if (isTesting) {
                    Profiler.start('testSimulation');
                    await simulation.testUpdate();
                    Profiler.end('testSimulation');
                }
                else simulation.update();
                if (tick % (speed*100) == 0) {
                    //console.log(`Fish: ${simulation.entities.fish.length}, Rabbits: ${simulation.entities.rabbits.length}, Foxes: ${simulation.entities.foxes.length}`);
                    //console.log(simulation.entities.foxes[0]);
                }
            }
            tick++;
        }

        Profiler.start('drawEntities');
        drawEntities();
        Profiler.end('drawEntities');
        Profiler.start('drawDisplay');
        if (window.foxInfoDisplay) {
            window.foxInfoDisplay.draw();
        }
        Profiler.end('drawDisplay');
    }
    Profiler.end('Allsimulation');

    if (simulation && totalTick % 1000 === 0) {
        Profiler.log();
        Profiler.reset();
    }
    //totalTick++;
    requestAnimationFrame(simulationLoop);
}

let xGrid = 0, temp_xGrid;
let yGrid = 0, temp_yGrid;
let test_coef = 1, temp_test_coef = 1;

export let offsetX, offsetY;

let HexRadius = 0;

function resizeCanvas(zoom = false) {
    if (canvas.width === window.innerWidth &&
    canvas.height === window.innerHeight && temp_test_coef === test_coef &&
    !zoom) return;
      
    temp_test_coef = test_coef;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    HexRadius = canvas.width / zoomDivider;

    // Унифицированный расчет размеров сетки
    HexGeometryCache.init(HexRadius);
    const hexHeight = HexGeometryCache.getHeight();
    
    GridCount();

    // Пересчитываем offset
    const worldWidth = (temp_xGrid - 1) * (HexRadius * 1.5) + HexRadius * 2;
    const worldHeight = temp_yGrid * hexHeight + hexHeight / 2;
    offsetX = (canvas.width - worldWidth) / 2;
    offsetY = (canvas.height - worldHeight) / 2;
}

function GridCount() {
    const hexHeight = HexRadius * Math.sqrt(3);
    xGrid = Math.floor(canvas.width / (HexRadius * 1.5) / test_coef);
    yGrid = Math.floor(canvas.height / hexHeight / test_coef);

    temp_xGrid = xGrid;
    temp_yGrid = yGrid;
}

let simulation = null;
let showVisionRanges = false;
let isPause = false;
let isTesting = false;
export let SortTest =0;

let VisionType = 0;
let GridType = 0;

document.addEventListener('keydown', function(event) {
    //console.log(event.code)
    if (event.code === 'Space') {
        ReGenerate(xGrid, yGrid);
        temp_xGrid = xGrid;
        temp_yGrid = yGrid;
        if(simulation) {
            simulation.isSimulationRunning = false;
            simulation = null; 
            tick = 0;
            
            if (window.foxInfoDisplay) {
                window.foxInfoDisplay.foxes.clear();
            }
        }
    }
    if (event.code === 'KeyP') {
        isPause = !isPause;
        console.log("Paused...")
    }
    if (event.code === 'KeyE') {
        isPause = false;
        isTesting = !isTesting;

        if (simulation) {
            simulation.isSimulationRunning = false;
            simulation = null; 
            tick = 0;
            
            if (window.foxInfoDisplay) {
                window.foxInfoDisplay.foxes.clear();
            }
        }

        if (isTesting) {
            test_coef = 2.5; 
        }
        else {
            test_coef = 1;
        }
        GridCount();
        temp_xGrid = xGrid;
        temp_yGrid = yGrid;
        ReGenerate(xGrid, yGrid);
        console.log('Testing...')

    }
    if (event.code === 'ArrowRight') {
        if (isPause) {
            tick += speed;
            if (isTesting) simulation.testUpdate();
            else simulation.update();
        }
    }
    if (event.code ==='Enter') {
        isPause = false;
        if (simulation == null) {
            simulation = new WorldSimulation(world);
            simulation.isSimulationRunning = true;
            if (!isTesting) simulation.init();
        }
        else {
            simulation.isSimulationRunning = false;
            simulation = null; 
            tick = 0;
            
            if (window.foxInfoDisplay) {
                window.foxInfoDisplay.foxes.clear();
                window.foxInfoDisplay.draw();
            }
        }
        console.log('Enter')
    }
    if (event.code === 'KeyV') {
        if (VisionType != 4) { VisionType += 1; }
        else { VisionType = 0; }
        
        if (VisionType != 0) { showVisionRanges = true; }
        else { showVisionRanges = false; }

        if (showVisionRanges) {
            for (let key in VisionTypes) {
                VisionTypes[key] = true;
            }
        }
        console.log(`Vision ranges ${showVisionRanges ? 'ON' : 'OFF'}`);
    }
    if (['1', '2', '3'].includes(event.key) && showVisionRanges) {
        for (let key in VisionTypes) {
            VisionTypes[key] = false;
        }
        switch(event.key) {
            case '1' : {VisionTypes.fish = true; break; }
            case '2' : {VisionTypes.rabbit = true; break; }
            case '3' : {VisionTypes.fox = true; break; }
        }
        console.log(VisionTypes)
    };
    if (event.code === 'ArrowUp') {
        SortTest += 1;
        console.log(SortTest)
    }
    if (event.code === 'ArrowDown') {
        if (SortTest > 0) SortTest-= 1;
        console.log(SortTest)
    }

    if (event.code === 'Backquote') {
        isGridDebug = !isGridDebug;
        showLog = !showLog;
        BrainShowLog(showLog);
        if (showLog) console.log('| Show LOG |');
        else console.log('| Hide LOG |');
    }

    if (event.code === 'KeyD') {
        GridType++;
        console.log(GridType)
        switch(GridType) {
            case 1: {
                const enabled = toggleDebugGrid();
                console.log(`Debug mode: ${enabled ? 'ON' : 'OFF'}`);
                break;
            };
            case 2: {
                console.log('=== DEBUG SELECTION MODE ===');
                console.log('Click on two hexagons to draw line between them');
                console.log('Line will show LOS check for ray tracing debugging');
                firstSelectedHex = null;
                secondSelectedHex = null;
                break;
            }
            default : {GridType = 0; toggleDebugGrid(); break;}
        }
    }
});

let VisionTypes = {
    fish : true,
    rabbit : true,
    fox : true
}

function drawEntities() {
    // Сначала рисуем зоны видимости
    if (showVisionRanges) {
        if (VisionTypes.fish) {
            simulation.entities.fish.forEach(fish => {
                SelectDebug(fish)
            });
        }
        if (VisionTypes.rabbit) {
            simulation.entities.rabbits.forEach(rabbit => {
                SelectDebug(rabbit)
            });
        }
        if (VisionTypes.fox) {
            simulation.entities.foxes.forEach(fox => {
                SelectDebug(fox)
            });
        }
    }

    // Отрисовка водорослей (синие маленькие гексагоны)
    simulation.entities.algae.forEach(algae => {
        drawSmallHexagon(algae.x, algae.y, HexRadius, '#81c0abff');
    });

    // Отрисовка травы (зелёные маленькие гексагоны)
    simulation.entities.grass.forEach(grass => {
        drawSmallHexagon(grass.x, grass.y, HexRadius, '#f1fb33ff');
    });

    // Отрисовка рыб (синие кружки)
    simulation.entities.fish.forEach(fish => {
        drawCircle(fish.x, fish.y, HexRadius, '#565a5eff', HexRadius / 3);
    });

    // Отрисовка зайцев (белые кружки)
    simulation.entities.rabbits.forEach(rabbit => {
        drawCircle(rabbit.x, rabbit.y, HexRadius, '#FFFFFF', HexRadius / 2);
    });

    // Отрисовка лис (оранжевые кружки)
    simulation.entities.foxes.forEach(fox => {
        drawCircle(fox.x, fox.y, HexRadius, '#FF9800', HexRadius / 1.5);
    });
}


let firstSelectedHex = null;     // Первый выбранный гексагон
let secondSelectedHex = null;    // Второй выбранный гексагон
canvas.addEventListener('click', handleHexClick);

export let selectedHex = null;
export let neighborHexes = [];

let isGridDebug = false;
function handleHexClick(event) {
    if (!isGridDebug) { return; };

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left - offsetX;
    const mouseY = event.clientY - rect.top - offsetY;
    
    // Сохраняем для отладки
    lastClickX = mouseX;
    lastClickY = mouseY;

    SelectHex(mouseX, mouseY);
    if (GridType === 2) {
        if (!firstSelectedHex) {
            firstSelectedHex = selectedHex;
        }
        else if (!secondSelectedHex) {
            secondSelectedHex = selectedHex;
        }
        else {
            firstSelectedHex = selectedHex;
            secondSelectedHex = null;
        }
    }

}


function SelectHex(x, y) {
    // Получаем прямоугольник, в котором находится точка клика
    const debugRect = getRectangleAtPoint(x, y, HexRadius);
    
    // 4 угла прямоугольника с их координатами
    const corners = [
        { x: debugRect.rectLeft, y: debugRect.rectTop, cornerIndex: 0 },      // северо-запад
        { x: debugRect.rectRight, y: debugRect.rectTop, cornerIndex: 1 },     // северо-восток
        { x: debugRect.rectLeft, y: debugRect.rectBottom, cornerIndex: 2 },   // юго-запад
        { x: debugRect.rectRight, y: debugRect.rectBottom, cornerIndex: 3 }   // юго-восток
    ];
    
    // Определяем, какие углы являются центрами гексагонов
    const cornersWithCenterInfo = corners.map(corner => ({
        ...corner,
        isHexCenter: isHexCenter(debugRect.xIndex, debugRect.yIndex, debugRect.lineType, corner.cornerIndex)
    }));
    
    // Находим все углы, которые являются центрами гексагонов
    const hexCenters = cornersWithCenterInfo.filter(c => c.isHexCenter);
    
    // Логирование при клике
    if (showLog) {
        console.group(`🔍 Click at (${x.toFixed(1)}, ${y.toFixed(1)}) - Rectangle [${debugRect.xIndex}, ${debugRect.yIndex}.${debugRect.lineType}]`);
    }

    const hexCandidates = [];
    
    hexCenters.forEach(center => {
        const hexX = Math.round((center.x - HexRadius) / (HexRadius * 1.5));
        
        let hexY;
        if (hexX % 2 === 0) {
            hexY = Math.round((center.y - HexGeometryCache.getHeight() / 2) / HexGeometryCache.getHeight());
        } else {
            hexY = Math.round((center.y - HexGeometryCache.getHeight()) / HexGeometryCache.getHeight());
        }
        
        const distance = Math.sqrt(
            Math.pow(x - center.x, 2) + 
            Math.pow(y - center.y, 2)
        );
        
        console.log(`  ${center.cornerIndex === 0 ? 'северо-запад' : center.cornerIndex === 1 ? 'северо-восток' : center.cornerIndex === 2 ? 'юго-запад' : 'юго-восток'} угол (${center.x.toFixed(1)}, ${center.y.toFixed(1)}) -> Гексагон [${hexX}, ${hexY}], расстояние: ${distance.toFixed(1)}px`);
        
        hexCandidates.push({ 
            x: hexX, 
            y: hexY, 
            distance, 
            centerX: center.x, 
            centerY: center.y,
            isValid: (hexX >= 0 && hexY >= 0 && hexX < world.length && hexY < world[0].length)
        });
    });
    
    // Находим ближайший гексагон (включая заграничные)
    let closestHex = null;
    if (hexCandidates.length > 0) {
        closestHex = hexCandidates.reduce((min, current) => 
            current.distance < min.distance ? current : min
        , hexCandidates[0]);
        
        console.log(`✅ Выбран гексагон [${closestHex.x}, ${closestHex.y}] (расстояние: ${closestHex.distance.toFixed(1)}px, валидный: ${closestHex.isValid})`);
    } else {
        console.log(`❌ Нет подходящих гексагонов`);
    }
    console.groupEnd();

    neighborHexes = [];
    if (closestHex) {
        selectedHex = { x: closestHex.x, y: closestHex.y };
        
        if(GridType !== 2) {
            neighborHexes = getHexNeighbors(closestHex.x, closestHex.y);

            if (isDebugGridEnabled()) {
                console.log(`   Соседи:`, neighborHexes.map(h => `[${h.x},${h.y}]`).join(', '));
            }
        }
    } else {
        selectedHex = null;
    }
}

function drawSelectedHexes() {
    if (selectedHex) {
        const isInWorld = selectedHex.x >= 0 && selectedHex.x < world.length && 
                          selectedHex.y >= 0 && selectedHex.y < world[0].length;
        
        if (isInWorld) {
            drawHexagonV(selectedHex.x, selectedHex.y, 'rgba(255, 0, 0, 0.5)', true);
        } else {
            // Отрисовываем пунктирный контур для гекса за границей
            drawHexagonV(selectedHex.x, selectedHex.y, 'rgba(255, 0, 0, 0.8)', false);
        }
        
        // соседи (только существующие)
        neighborHexes.forEach(hex => {
            if (hex.x >= 0 && hex.y >= 0 && hex.x < world.length && hex.y < world[0].length) {
                drawHexagonV(hex.x, hex.y, 'rgba(0, 255, 0, 0.3)', true);
            } else {
                // Соседи за границей
                drawHexagonV(hex.x, hex.y, 'rgba(0, 255, 0, 0.5)', false);
            }
        });
    }
}

function SelectDebug(entity) {
    switch (VisionType) {
        case 1: { drawVisionRange(entity, HexRadius, false); break; }
        case 2: { drawVisionRange(entity, HexRadius, true); break; }
        case 3: { drawAllVisionHexes(entity, HexRadius, SortTest); break; }
        case 4: { drawDistanceDebug(entity, HexRadius); break; }
        default: { break;}
    }
}


// Кнопки
// Управление масштабом карты
let zoomDivider = 50; // Переменная для деления (50, 75, 100)

function initZoomControls() {
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    
    zoomOutBtn.addEventListener('click', () => {
        if (zoomDivider === 50) return;
        if (zoomDivider === 75) zoomDivider = 50;
        if (zoomDivider === 100) zoomDivider = 75;
        console.log('Zoom divider:', zoomDivider);
        if (simulation) simulation = null;
        resizeCanvas(true);
        ReGenerate(xGrid, yGrid);
    });
    
    zoomInBtn.addEventListener('click', () => {
        if (zoomDivider === 100) return;
        if (zoomDivider === 75) zoomDivider = 100;
        if (zoomDivider === 50) zoomDivider = 75;
        console.log('Zoom divider:', zoomDivider);
        if (simulation) simulation = null;
        resizeCanvas(true);
        ReGenerate(xGrid, yGrid);
    });

}

resizeCanvas()
ReGenerate(xGrid, yGrid);
initZoomControls();
simulationLoop();