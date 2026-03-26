// BrainManager.js

import { exportBrains, importBrains } from './BrainStorage.js';

export class BrainManager {
    constructor() {
        this.setupUI();
    }
    
    setupUI() {
        // Кнопка экспорта
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export Brains';
        exportBtn.onclick = exportBrains;
        
        // Кнопка импорта
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import Brains';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = (e) => {
            if (e.target.files.length) {
                importBrains(e.target.files[0])
                    .then(() => alert('Brains imported successfully!'))
                    .catch(err => alert('Import failed: ' + err.message));
            }
        };
        importBtn.onclick = () => fileInput.click();
        
        // Добавляем элементы на страницу
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '10px';
        container.style.right = '10px';
        container.style.zIndex = '1000';
        container.appendChild(exportBtn);
        container.appendChild(importBtn);
        document.body.appendChild(container);
    }
}

// Инициализация при загрузке
new BrainManager();