export class HexGeometryCache {
    static #vertices = null;      // относительные вершины (как #Path2D)
    static #radius = null;
    static #hexHeight = null;
    static #path = null;

    static init(hexRadius){
        if (this.radius === hexRadius && this.#vertices) return;
        this.#radius = hexRadius;
        this.#hexHeight = hexRadius * Math.sqrt(3);
        this.#vertices = [];
        this.#path = new Path2D();
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI / 6 * i;
            const x = hexRadius * Math.cos(angle);
            const y = hexRadius * Math.sin(angle);
            this.#vertices.push({ x, y });
            if (i === 0) this.#path.moveTo(x, y);
            else this.#path.lineTo(x, y);
        }
        this.#path.closePath();
    }

    static getAbsoluteVertices(centerX, centerY) {
        // Простое копирование с трансляцией
        return this.#vertices.map(v => ({
            x: centerX + v.x,
            y: centerY + v.y
        }));
    }

    static getHeight() {
        return this.#hexHeight;
    }

    static getRadius() {
        return this.#radius;
    }

    static getPath() {
        return this.#path;
    }

    static getHexCenter(x, y) {
        return {
            x: x * (this.#radius * 1.5) + this.#radius,
            y: y * this.#hexHeight + (x % 2 === 0 ? this.#hexHeight / 2 : this.#hexHeight)
        };
    }
}