// FoxInfoDisplay.js

export class FoxInfoDisplay {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id ${canvasId} not found`);
            throw new Error(`Canvas with id ${canvasId} not found`);
        }
        this.ctx = this.canvas.getContext('2d');
        this.foxes = new Map();
        this.maxDisplayed = 10;
        this.rowHeight = 12;
        this.padding = 10;
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.canvas.style.zIndex = '1000';
        this.canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth * 0.2;
        this.canvas.height = window.innerHeight * 0.7;
    }
    
    addFox(fox) {
        this.foxes.set(fox.id, fox);
    }
    
    removeFox(fox) {
        if (!this.foxes.has(fox.id)) return;
        this.foxes.delete(fox.id);
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const sortedFoxes = Array.from(this.foxes.values())
            .sort((a, b) => b.totalReward - a.totalReward)
            .slice(0, this.maxDisplayed);
        
        this.ctx.font = '1.15vw Arial';
        this.ctx.textBaseline = 'top';
        
        sortedFoxes.forEach((fox, index) => {
            const y = index * (this.rowHeight * 5) + this.padding; // Увеличили отступ между лисами
            
            // ID и общая награда
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(`${fox.id} gen-${fox.generation}: ${fox.totalReward.toFixed(1)}`, this.padding, y);
            
            // Полоски состояния
            this.drawStatusBar(y + 15, fox.health / 100, '#f44336', 'HP');
            this.drawStatusBar(y + 25, fox.energy / 100, '#ff9800', 'NRG');
            this.drawStatusBar(y + 35, fox.hunger / 100, '#4caf50', 'HGR');
            this.drawStatusBar(y + 45, fox.thirst / 100, '#2196f3', 'TST');
            
            // Разделительная линия
            this.ctx.strokeStyle = '#ddd';
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y + 55);
            this.ctx.lineTo(this.canvas.width - this.padding, y + 55);
            this.ctx.stroke();
        });
    }
    
    drawStatusBar(y, value, color, label) {
        const width = 150;
        const height = 8;
        
        // Фон
        this.ctx.fillStyle = '#ddd';
        this.ctx.fillRect(this.padding, y, width, height);
        
        // Значение
        this.ctx.fillStyle = color;
        this.ctx.fillRect(this.padding, y, width * Math.max(0, Math.min(1, value)), height);
        
        // Текст
        this.ctx.fillStyle = '#000';
        this.ctx.fillText(label, this.padding + width + 5, y - 2);
    }
}

// Инициализация дисплея
window.foxInfoDisplay = new FoxInfoDisplay('foxInfoCanvas');