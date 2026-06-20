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
assert.strictEqual(game.getChatEventType('!slow'), null);
assert.strictEqual(game.getChatEventType('!rally'), null);

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

game.debugResetChatPower();
assert.strictEqual(game.chatEventState.charge, 0);
assert.strictEqual(game.chatEventState.cooldownFrames, 0);
assert.strictEqual(game.debugFillChatPower('bomb'), true);
assert.strictEqual(game.chatEventState.charge, CONFIG.CHAT_EVENTS.CHARGE_MAX);
assert.strictEqual(game.debugTriggerChatEvent('bomb'), true);
assert.strictEqual(game.chatEventState.lastEffect, 'bomb');
assert.ok(game.chatEventState.cooldownFrames > 0);
game.debugResetChatPower();
assert.strictEqual(game.chatEventState.lastEffect, null);

game.startRelicVoting();
game.handleCommand('Alice', '4', [], '#ffffff');
assert.strictEqual(game.relicVotes[4], 1);
const fourthRelic = game.relicsToVote[3];
assert.strictEqual(game.debugEndVotingWithOption(4), true);
assert.ok(game.activeRelics.includes(fourthRelic));

const mage = new Player(100, 100, 'MageSmoke', 'mage', {});
assert.strictEqual(mage.maxShield, CONFIG.CLASSES.mage.shield);
assert.strictEqual(mage.shield, mage.maxShield);
mage.takeDamage(10, 'Smoke', null);
assert.strictEqual(mage.hp, mage.maxHp);
assert.strictEqual(mage.shield, mage.maxShield - 10);
mage.takeDamage(30, 'Smoke', null);
assert.strictEqual(mage.shield, 0);
assert.ok(mage.hp < mage.maxHp);
mage.restoreRoundShield();
assert.strictEqual(mage.shield, mage.maxShield);

const projectileTarget = new Enemy(150, 100, 'slime', 1, 1, {});
const mageProjectiles = [];
mage.performAttack(projectileTarget, [projectileTarget], mageProjectiles, null, {});
mage.performAttack(projectileTarget, [projectileTarget], mageProjectiles, null, {});
assert.deepStrictEqual(mageProjectiles.map(projectile => projectile.type), ['fireball', 'frostball']);

const fireTarget = new Enemy(200, 100, 'slime', 1, 1, {});
const firePuddles = [];
new Projectile(200, 100, fireTarget, mage, 'fireball', mage.damage, 4.2).hitEnemy(fireTarget, [fireTarget], null, {}, null, firePuddles);
assert.ok(fireTarget.hp < fireTarget.maxHp);
assert.strictEqual(firePuddles.length, 1);

const overlapA = new Enemy(300, 100, 'slime', 1, 1, {});
const overlapB = new Enemy(300, 100, 'slime', 1, 1, {});
const overlapPuddles = [];
const overlapProjectile = new Projectile(300, 100, overlapA, mage, 'fireball', mage.damage, 4.2);
overlapProjectile.update([overlapA, overlapB], [], null, {}, null, overlapPuddles);
const damagedOverlapTargets = [overlapA, overlapB].filter(enemy => enemy.hp < enemy.maxHp).length;
assert.strictEqual(damagedOverlapTargets, 1);
assert.strictEqual(overlapPuddles.length, 1);

const frostTarget = new Enemy(250, 100, 'slime', 1, 1, {});
new Projectile(250, 100, frostTarget, mage, 'frostball', mage.damage, 4.2).hitEnemy(frostTarget, [frostTarget], null, {}, null, []);
assert.strictEqual(frostTarget.frozenFrames, CONFIG.MAGE_FROST_FREEZE_FRAMES);
assert.ok(frostTarget.getCurrentSpeed() < frostTarget.speed);

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
assert.strictEqual(game.debugSetBalanceOverride('enemyHpMul', 1.5), true);
assert.strictEqual(game.debugBalanceOverrides.enemyHpMul, 1.5);
assert.strictEqual(game.debugResetBalanceOverrides(), true);
assert.strictEqual(game.debugBalanceOverrides.enemyHpMul, 1.0);
const totalBeforeDebugSpawn = game.waveEnemiesSpawned;
assert.strictEqual(game.debugSpawnEnemies('slime', 2), true);
assert.ok(game.enemies.length >= 2);
assert.strictEqual(game.waveEnemiesSpawned, totalBeforeDebugSpawn);
assert.strictEqual(game.debugClearEnemies(), true);
assert.strictEqual(game.enemies.length, 0);

const waveMage = new Player(100, 100, 'WaveMageSmoke', 'mage', {});
game.players = [waveMage];
waveMage.takeDamage(12, 'Smoke', null);
assert.ok(waveMage.shield < waveMage.maxShield);
assert.strictEqual(game.debugStartNextWave(), true);
assert.strictEqual(waveMage.shield, waveMage.maxShield);

game.players.forEach(player => {
    player.active = false;
    player.hp = 0;
});
game.lastStandRevivesUsed = CONFIG.LAST_STAND_REVIVES_PER_WAVE;
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
