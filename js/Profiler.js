// Profiler.js - добавить поддержку async
export class Profiler {
    static metrics = new Map();
    static activeAsync = new Map();
    
    static start(label) {
        if (!this.metrics.has(label)) {
            this.metrics.set(label, { total: 0, count: 0, max: 0 });
        }
        const startTime = performance.now();
        this.activeAsync.set(label, startTime);
        return startTime;
    }
    
    static end(label) {
        const startTime = this.activeAsync.get(label);
        if (startTime) {
            const duration = performance.now() - startTime;
            const metric = this.metrics.get(label);
            metric.total += duration;
            metric.count++;
            metric.max = Math.max(metric.max, duration);
            metric.last = duration;
            this.activeAsync.delete(label);
        }
    }
    
    static async measureAsync(label, fn) {
        this.start(label);
        try {
            return await fn();
        } finally {
            this.end(label);
        }
    }
    
    static log() {
        console.log('\n=== PERFORMANCE PROFILE ===');
        const sorted = Array.from(this.metrics.entries())
            .sort((a, b) => b[1].total - a[1].total);
        
        sorted.forEach(([label, data]) => {
            console.log(`${label}: avg=${(data.total/data.count).toFixed(2)}ms, ` +
                       `total=${data.total.toFixed(2)}ms, ` +
                       `calls=${data.count}, max=${data.max.toFixed(2)}ms`);
        });
    }
    
    static reset() {
        this.metrics.clear();
        this.activeAsync.clear();
    }
}