// ControlPanel.js
export class ControlPanel {
    constructor(onRegenerateCallback) {
        this.container = null;
        this.isVisible = false;
        this.onRegenerateCallback = onRegenerateCallback;
        this.isAutoApply = true; // Автоматическое применение при изменении
        
        // Параметры генерации (копия дефолтных)
        this.params = {
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
            },
            global: {
                seed: Math.random().toString(36).substring(2, 15),
                randomSeed: true
            }
        };
        
        this.createPanel();
    }
    
    createPanel() {
        this.container = document.createElement('div');
        this.container.id = 'controlPanel';
        this.container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 20px;
            transform: translateY(-50%);
            width: 340px;
            max-height: 90vh;
            background: rgba(0, 0, 0, 0.95);
            border-radius: 12px;
            padding: 20px;
            color: white;
            font-family: monospace;
            z-index: 10000;
            backdrop-filter: blur(10px);
            border: 2px solid #ff9800;
            overflow-y: auto;
            display: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;
        
        // Заголовок
        const title = document.createElement('h3');
        title.textContent = '🎮 Debug: Параметры шума';
        title.style.cssText = `
            margin: 0 0 15px 0;
            color: #ff9800;
            text-align: center;
            border-bottom: 2px solid #ff9800;
            padding-bottom: 10px;
        `;
        this.container.appendChild(title);
        
        // Статус симуляции
        this.simStatus = document.createElement('div');
        this.simStatus.style.cssText = `
            background: #ff4444;
            color: white;
            text-align: center;
            padding: 5px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 12px;
        `;
        this.simStatus.textContent = '⚠️ СИМУЛЯЦИЯ ОСТАНОВЛЕНА';
        this.container.appendChild(this.simStatus);
        
        // Кнопка рандомного сида
        const seedRow = this.createControlRow('🎲 Seed');
        const seedInput = document.createElement('input');
        seedInput.type = 'text';
        seedInput.value = this.params.global.seed;
        seedInput.style.cssText = `
            background: #333;
            color: #fff;
            border: 1px solid #ff9800;
            border-radius: 4px;
            padding: 5px 10px;
            font-family: monospace;
            flex: 1;
            font-size: 11px;
        `;
        seedInput.onchange = () => {
            this.params.global.seed = seedInput.value;
            this.params.global.randomSeed = false;
            this.applyChanges();
        };
        
        const randomSeedBtn = document.createElement('button');
        randomSeedBtn.textContent = '🎲';
        randomSeedBtn.style.cssText = `
            background: #ff9800;
            border: none;
            border-radius: 4px;
            padding: 5px 10px;
            margin-left: 5px;
            cursor: pointer;
            font-size: 16px;
        `;
        randomSeedBtn.onclick = () => {
            this.params.global.randomSeed = true;
            this.params.global.seed = Math.random().toString(36).substring(2, 15);
            seedInput.value = this.params.global.seed;
            this.applyChanges();
        };
        
        seedRow.appendChild(seedInput);
        seedRow.appendChild(randomSeedBtn);
        this.container.appendChild(seedRow);
        
        // Кнопка сброса параметров
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄 Сбросить все параметры';
        resetBtn.style.cssText = `
            width: 100%;
            background: #555;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px;
            margin-bottom: 15px;
            font-size: 12px;
            cursor: pointer;
        `;
        resetBtn.onclick = () => this.resetToDefault();
        this.container.appendChild(resetBtn);
        
        // Секции параметров
        this.addSection('🏔️ Рельеф');
        this.addSlider('Сглаживание (октавы)', 'terrain.smoothness', 1, 12, 1, (v) => v);
        this.addSlider('Частота шума', 'terrain.frequencyMultiplier', 1, 8, 0.5, (v) => v.toFixed(1));
        this.addSlider('Затухание амплитуды', 'terrain.amplitudeDecay', 0.3, 0.8, 0.01, (v) => v.toFixed(2));
        
        this.addSection('🌊 Река');
        this.addToggle('Включить реку', 'river.hasRiver');
        this.addSlider('Ширина реки', 'river.width', 0.1, 0.5, 0.01, (v) => v.toFixed(2));
        this.addSlider('Извилистость', 'river.curveScale', 0.5, 3, 0.1, (v) => v.toFixed(1));
        this.addSlider('Интенсивность изгибов', 'river.curveIntensity', 0, 0.15, 0.005, (v) => v.toFixed(3));
        this.addSlider('Влияние шума', 'river.noiseInfluence', 0, 0.8, 0.02, (v) => v.toFixed(2));
        this.addSlider('Смещение от края', 'river.offset', 0.2, 0.8, 0.02, (v) => v.toFixed(2));
        
        const directionRow = this.createControlRow('Направление');
        const dirSelect = document.createElement('select');
        dirSelect.style.cssText = `
            background: #333;
            color: #fff;
            border: 1px solid #ff9800;
            border-radius: 4px;
            padding: 5px;
            flex: 1;
        `;
        dirSelect.innerHTML = `
            <option value="horizontal">↔️ Горизонтальная</option>
            <option value="vertical">↕️ Вертикальная</option>
        `;
        dirSelect.value = this.params.river.direction;
        dirSelect.onchange = () => {
            this.params.river.direction = dirSelect.value;
            this.applyChanges();
        };
        directionRow.appendChild(dirSelect);
        this.container.appendChild(directionRow);
        
        this.addSection('🌍 Биомы (высота)');
        this.addSlider('Песок (порог)', 'biomes.sandThreshold', 0, 0.2, 0.01, (v) => v.toFixed(2));
        this.addSlider('Трава (переход)', 'biomes.grassTransition', 0, 0.2, 0.01, (v) => v.toFixed(2));
        this.addSlider('Лес (переход)', 'biomes.forestTransition', 0.05, 0.35, 0.01, (v) => v.toFixed(2));
        this.addSlider('Горы (переход)', 'biomes.mountainTransition', 0.3, 0.7, 0.01, (v) => v.toFixed(2));
        this.addSlider('Шанс леса', 'biomes.forestBaseChance', 0.5, 1, 0.01, (v) => v.toFixed(2));
        this.addSlider('Влияние шума на лес', 'biomes.forestNoiseInfluence', 1, 5, 0.2, (v) => v.toFixed(1));
        this.addSlider('Масштаб шума леса', 'biomes.forestNoiseScale', 1, 8, 0.5, (v) => v.toFixed(1));
        this.addSlider('Мин. фактор гор', 'biomes.mountainMinFactor', 0.05, 0.35, 0.01, (v) => v.toFixed(2));
        
        // Информация
        this.infoText = document.createElement('div');
        this.infoText.style.cssText = `
            margin-top: 15px;
            padding: 10px;
            background: #222;
            border-radius: 6px;
            font-size: 10px;
            color: #888;
            text-align: center;
        `;
        this.infoText.textContent = '⚡ Параметры меняются в реальном времени';
        this.container.appendChild(this.infoText);
        
        document.body.appendChild(this.container);
    }
    
    addSection(title) {
        const section = document.createElement('div');
        section.style.cssText = `
            margin-top: 15px;
            margin-bottom: 10px;
            font-weight: bold;
            color: #ff9800;
            border-left: 3px solid #ff9800;
            padding-left: 10px;
            font-size: 14px;
        `;
        section.textContent = title;
        this.container.appendChild(section);
    }
    
    createControlRow(label) {
        const row = document.createElement('div');
        row.style.cssText = `
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        `;
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        labelSpan.style.fontSize = '11px';
        labelSpan.style.minWidth = '140px';
        row.appendChild(labelSpan);
        
        return row;
    }
    
    addSlider(label, paramPath, min, max, step, formatter) {
        const row = this.createControlRow(label);
        const valueSpan = document.createElement('span');
        valueSpan.style.minWidth = '45px';
        valueSpan.style.textAlign = 'right';
        valueSpan.style.fontSize = '10px';
        valueSpan.style.color = '#ff9800';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.style.flex = '1';
        
        const keys = paramPath.split('.');
        let current = this.params;
        for (let key of keys) {
            current = current[key];
        }
        slider.value = current;
        valueSpan.textContent = formatter(current);
        
        slider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            valueSpan.textContent = formatter(val);
            
            let target = this.params;
            for (let i = 0; i < keys.length - 1; i++) {
                target = target[keys[i]];
            }
            target[keys[keys.length - 1]] = val;
            
            // Автоматическое применение при изменении
            if (this.isAutoApply) {
                this.applyChanges();
            }
        };
        
        row.appendChild(slider);
        row.appendChild(valueSpan);
        this.container.appendChild(row);
    }
    
    addToggle(label, paramPath) {
        const row = this.createControlRow(label);
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.style.cssText = `
            width: 18px;
            height: 18px;
            cursor: pointer;
        `;
        
        const keys = paramPath.split('.');
        let current = this.params;
        for (let key of keys) {
            current = current[key];
        }
        toggle.checked = current;
        
        toggle.onchange = (e) => {
            let target = this.params;
            for (let i = 0; i < keys.length - 1; i++) {
                target = target[keys[i]];
            }
            target[keys[keys.length - 1]] = e.target.checked;
            
            if (this.isAutoApply) {
                this.applyChanges();
            }
        };
        
        row.appendChild(toggle);
        this.container.appendChild(row);
    }
    
    resetToDefault() {
        this.params = {
            terrain: { smoothness: 6, frequencyMultiplier: 4, amplitudeDecay: 0.5 },
            river: { hasRiver: true, width: 0.25, curveScale: 1.5, curveIntensity: 0.05, noiseInfluence: 0.3, offset: 0.5, direction: 'horizontal' },
            biomes: { sandThreshold: 0.0, grassTransition: 0.0, forestTransition: 0.15, mountainTransition: 0.45, forestBaseChance: 0.9, forestNoiseInfluence: 3, forestNoiseScale: 3, mountainMinFactor: 0.15 },
            global: { seed: Math.random().toString(36).substring(2, 15), randomSeed: true }
        };
        
        // Обновляем UI (проще пересоздать)
        this.container.remove();
        this.createPanel();
        this.applyChanges();
        if (this.isVisible) this.show();
    }
    
    applyChanges() {
        if (this.onRegenerateCallback) {
            if (this.params.global.randomSeed) {
                this.params.global.seed = Math.random().toString(36).substring(2, 15);
            }
            this.onRegenerateCallback(this.params);
            this.updateInfo();
        }
    }
    
    updateInfo() {
        const seed = this.params.global.seed.substring(0, 20);
        this.infoText.textContent = `Seed: ${seed}${this.params.global.randomSeed ? ' 🎲' : ''}`;
    }
    
    show() {
        this.isVisible = true;
        this.container.style.display = 'block';
        this.updateInfo();
    }
    
    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
    }
    
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    setSimulationStatus(running) {
        if (this.simStatus) {
            if (running) {
                this.simStatus.style.background = '#4caf50';
                this.simStatus.textContent = '✅ СИМУЛЯЦИЯ ЗАПУЩЕНА';
            } else {
                this.simStatus.style.background = '#ff4444';
                this.simStatus.textContent = '⚠️ СИМУЛЯЦИЯ ОСТАНОВЛЕНА';
            }
        }
    }
}