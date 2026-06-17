const assert = require('assert');

function createFakeContext() {
    return {
        imageSmoothingEnabled: false,
        mozImageSmoothingEnabled: false,
        webkitImageSmoothingEnabled: false,
        msImageSmoothingEnabled: false,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        font: '',
        textAlign: 'left',
        shadowBlur: 0,
        shadowColor: '#000000',
        globalAlpha: 1,
        save() {},
        restore() {},
        translate() {},
        scale() {},
        rotate() {},
        beginPath() {},
        closePath() {},
        fill() {},
        stroke() {},
        arc() {},
        ellipse() {},
        fillRect() {},
        strokeRect() {},
        clearRect() {},
        drawImage() {},
        fillText() {},
        measureText(text) {
            return { width: String(text).length * 8 };
        }
    };
}

function createFakeCanvas() {
    return {
        width: 1200,
        height: 800,
        getContext() {
            return createFakeContext();
        }
    };
}

global.window = global;
global.document = {
    body: {
        classList: {
            contains() {
                return false;
            }
        }
    },
    getElementById() {
        return createFakeCanvas();
    },
    createElement(tagName) {
        if (tagName === 'canvas') {
            return createFakeCanvas();
        }
        return {};
    }
};

global.CONFIG = require('../src/config.js');
global.ParticleEngine = require('../src/particles.js');
global.TwitchConnection = require('../src/twitch.js');
Object.assign(global, require('../src/entities.js'));
Object.assign(global, require('../src/modes.js'));
global.Sprites = {
    decorations: {},
    players: {},
    enemies: {},
    items: {},
    projectiles: {}
};

const Game = require('../src/game.js');

const game = new Game('game-canvas');

let fallbackWarning = '';
const originalWarn = console.warn;
console.warn = (message) => {
    fallbackWarning = String(message);
};
game.startMatch('missing-mode');
console.warn = originalWarn;
assert.strictEqual(game.modeId, 'survival');
assert.ok(fallbackWarning.includes('falling back to "survival"'));

game.returnToLobby();
game.handleCommand('Alice', '!join', ['mage'], '#ffffff');
assert.strictEqual(game.lobbyUsers.get('Alice'), 'mage');

game.handleCommand('Alice', '!class', ['healer'], '#ffffff');
assert.strictEqual(game.lobbyUsers.get('Alice'), 'healer');

game.startMatch('survival');
assert.strictEqual(game.modeId, 'survival');
assert.strictEqual(game.gameState, 'playing');

game.startRelicVoting();
game.handleCommand('Alice', '4', [], '#ffffff');
assert.strictEqual(game.relicVotes[4], 1);

game.gameState = 'playing';
game.lastStandRevivesUsed = 0;
game.players.forEach(player => {
    player.active = false;
    player.hp = 0;
});
game.update();
assert.strictEqual(game.gameState, 'playing');
assert.strictEqual(game.lastStandRevivesUsed, 1);
assert.ok(game.players.every(player => player.active && player.hp > 0));

game.players.forEach(player => {
    player.active = false;
    player.hp = 0;
});
game.update();
assert.strictEqual(game.gameState, 'gameover');
assert.strictEqual(game.gameOverReason, 'players');

game.returnToLobby();
game.startMatch('survival');
const itemsBeforePity = game.items.length;
game.potionKillsSinceDrop = CONFIG.HEAL_POTION_PITY_KILLS;
game.tryDropPotion({ x: 100, y: 100, width: 20, height: 20, isBoss: false });
assert.strictEqual(game.items.length, itemsBeforePity + 1);
assert.strictEqual(game.potionKillsSinceDrop, 0);

game.potionKillsSinceDrop = CONFIG.HEAL_POTION_PITY_KILLS;
game.tryDropPotion({ x: 100, y: 100, width: 20, height: 20, isBoss: true });
assert.strictEqual(game.items.length, itemsBeforePity + 1);
assert.strictEqual(game.potionKillsSinceDrop, CONFIG.HEAL_POTION_PITY_KILLS);

game.returnToLobby();
game.handleCommand('Bob', '!join', ['warrior'], '#ffffff');
game.startMatch('defense');
assert.strictEqual(game.modeId, 'defense');
assert.ok(game.defenseObjective);
assert.ok(game.getHudState().objectiveLabel.includes('КРИСТАЛЛ'));

game.players = [];
game.enemies = [
    new Enemy(game.defenseObjective.x - 40, game.defenseObjective.y, 'goblin', 1, 1)
];
game.relicModifiers.mechanics.thorns = 1.0;
const crystalAttackerHp = game.enemies[0].hp;
for (let i = 0; i < 180; i++) {
    game.update();
}
assert.ok(['playing', 'voting'].includes(game.gameState));
assert.ok(game.defenseObjective.hp < game.defenseObjective.maxHp);
assert.strictEqual(game.enemies[0].hp, crystalAttackerHp);

game.defenseObjective.takeDamage(9999, 'Smoke', game.particles);
game.gameState = 'playing';
game.update();
assert.strictEqual(game.gameState, 'gameover');
assert.strictEqual(game.gameOverReason, 'objective');

console.log('Smoke checks passed');
