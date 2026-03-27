const offsets = {
    even: [[1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1]],
    odd:  [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1]]
};

let cols = null;
let rows = null;

export function getOffsets() {
    return offsets;
}

export function initWorldSize(Wcols, Wrows) {
    cols = Wcols; rows = Wrows;
}

export function getHexNeighbors(x, y) {
    const parity = x % 2 === 0 ? 'even' : 'odd';
    
    return offsets[parity]
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter(n => n.x >= 0 && n.y >= 0 && n.x < cols && n.y < rows);
}

export function getAllHexNeighbors(x, y) {
    const parity = x % 2 === 0 ? 'even' : 'odd';

    return offsets[parity].map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}