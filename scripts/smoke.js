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
global.Sprites = {
    decorations: {},
    players: {},
    enemies: {},
    items: {},
    projectiles: {}
};

const Game = require('../src/game.js');

const game = new Game('game-canvas');
game.twitch.parseGameCommand('ParserUser', '!heal', '#ffffff');
assert.strictEqual(game.chatEventState.ignoredIntents, 1);

game.handleCommand('Alice', '!join', ['mage'], '#ffffff');
assert.strictEqual(game.lobbyUsers.get('Alice'), 'mage');

game.handleCommand('Alice', '!class', ['healer'], '#ffffff');
assert.strictEqual(game.lobbyUsers.get('Alice'), 'healer');

game.startMatch();
assert.strictEqual(game.gameState, 'playing');
assert.ok(game.teamProfile);
assert.strictEqual(game.teamProfile.hasHealer, true);
const firstWaveScale = game.waveDifficulty.playerCountScale;

game.handleCommand('LateBob', '!join', ['warrior'], '#ffffff');
game.update();
assert.ok(game.players.some(player => player.username === 'LateBob'));
assert.ok(game.waveDifficulty.playerCountScale > firstWaveScale);

for (let i = 0; i < 100; i++) {
    game.handleCommand(`Viewer${i}`, '!heal', [], '#ffffff');
}
for (let frame = 0; frame < 20; frame++) {
    game.update();
}
assert.strictEqual(game.chatEventState.triggeredCount, 1);
assert.strictEqual(game.chatEventState.lastEffect, 'heal');
assert.ok(game.chatEventState.cooldownFrames > 0);

const acceptedBeforeSpam = game.chatEventState.acceptedIntents;
for (let i = 0; i < 10; i++) {
    game.handleCommand('SpamUser', '!bomb', [], '#ffffff');
}
assert.strictEqual(game.chatEventState.acceptedIntents, acceptedBeforeSpam + 1);
game.frameCount = CONFIG.CHAT_EVENTS.USER_COOLDOWN_FRAMES + CONFIG.FPS;
game.updateChatEvents();
assert.strictEqual(game.chatEventState.userCooldowns.has('SpamUser'), false);

for (let i = 0; i < 100; i++) {
    game.handleCommand(`CooldownViewer${i}`, '!bomb', [], '#ffffff');
}
for (let frame = 0; frame < 20; frame++) {
    game.update();
}
assert.strictEqual(game.chatEventState.triggeredCount, 1);
assert.ok(game.chatEventState.charge > 0);

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
const protectedPlayer = game.players[0];
const lastStandFrames = protectedPlayer.damageReductionFrames;
const lastStandMul = protectedPlayer.damageTakenMul;
game.applyChatRally();
assert.strictEqual(protectedPlayer.damageReductionFrames, lastStandFrames);
assert.strictEqual(protectedPlayer.damageTakenMul, lastStandMul);
assert.ok(protectedPlayer.chatRallyDefenseFrames > 0);

game.players.forEach(player => {
    player.active = false;
    player.hp = 0;
});
game.update();
assert.strictEqual(game.gameState, 'gameover');
assert.strictEqual(game.gameOverReason, 'players');

game.returnToLobby();
game.startMatch();
const itemsBeforePity = game.items.length;
game.potionKillsSinceDrop = CONFIG.HEAL_POTION_PITY_KILLS;
game.tryDropPotion({ x: 100, y: 100, width: 20, height: 20, isBoss: false });
assert.strictEqual(game.items.length, itemsBeforePity + 1);
assert.strictEqual(game.potionKillsSinceDrop, 0);

game.potionKillsSinceDrop = CONFIG.HEAL_POTION_PITY_KILLS;
game.tryDropPotion({ x: 100, y: 100, width: 20, height: 20, isBoss: true });
assert.strictEqual(game.items.length, itemsBeforePity + 1);
assert.strictEqual(game.potionKillsSinceDrop, CONFIG.HEAL_POTION_PITY_KILLS);

console.log('Smoke checks passed');
