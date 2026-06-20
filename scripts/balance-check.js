const assert = require('assert');

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return function seededRandom() {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

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

function runOne(classes, seed, targetWave = 10, options = {}) {
    const previousRandom = Math.random;
    Math.random = createSeededRandom(seed);

    try {
        const game = new Game('game-canvas');

        classes.forEach((classType, index) => {
            game.handleCommand(`P${index + 1}`, '!join', [classType], '#ffffff');
        });
        game.startMatch();

        const maxFrames = 60 * (options.maxSeconds || 1000);
        let lateJoined = false;
        let lastChatBurstFrame = -Infinity;
        for (let frame = 0; frame < maxFrames; frame++) {
            if (game.gameState === 'voting') {
                game.votingEndTime = Date.now() - 1;
            }

            if (
                options.lateJoin &&
                !lateJoined &&
                game.wave >= options.lateJoin.wave &&
                game.gameState === 'playing'
            ) {
                game.handleCommand(options.lateJoin.username, '!join', [options.lateJoin.classType], '#ffffff');
                lateJoined = true;
            }

            if (
                options.chatAssist &&
                game.gameState === 'playing' &&
                game.wave >= (options.chatAssist.fromWave || 1) &&
                frame - lastChatBurstFrame >= (options.chatAssist.everyFrames || 1800)
            ) {
                const commands = options.chatAssist.commands || ['!heal', '!bomb', '!slow', '!rally'];
                for (let i = 0; i < (options.chatAssist.viewers || 80); i++) {
                    const command = commands[i % commands.length];
                    game.handleCommand(`Chat${frame}_${i}`, command, [], '#ffffff');
                }
                lastChatBurstFrame = frame;
            }

            game.update();

            if (game.wave >= targetWave && game.gameState !== 'gameover') {
                break;
            }

            if (game.gameState === 'gameover') {
                break;
            }
        }

        return {
            seed,
            wave: game.wave,
            state: game.gameState,
            time: Math.round(game.timeElapsed),
            kills: game.enemiesKilled,
            activeEnemies: game.enemies
                .map(enemy => `${enemy.enemyType}@${Math.round(enemy.x)},${Math.round(enemy.y)}:${Math.round(enemy.hp)}/${enemy.maxHp}`)
                .join(',') || '-',
            alivePlayers: game.players
                .filter(player => player.active)
                .map(player => `${player.classType}@${Math.round(player.x)},${Math.round(player.y)}:${Math.round(player.hp)}/${player.maxHp}`)
                .join(',') || '-',
            lastStandUses: game.lastStandRevivesUsed,
            totalPlayers: game.players.length,
            lateJoined,
            chatEvents: game.chatEventState.triggeredCount
        };
    } finally {
        Math.random = previousRandom;
    }
}

function runScenario(name, classes, seeds, targetWave = 10, options = {}) {
    const runs = seeds.map(seed => runOne(classes, seed, targetWave, options));
    const avgWave = runs.reduce((sum, run) => sum + run.wave, 0) / runs.length;
    const minWave = Math.min(...runs.map(run => run.wave));
    const reachedTarget = runs.filter(run => run.wave >= targetWave && run.state !== 'gameover').length;
    const gameovers = runs.filter(run => run.state === 'gameover').length;
    const earlyWipes = runs.filter(run => run.state === 'gameover' && run.wave <= 2).length;

    console.log(
        `${name}: minWave=${minWave}, avgWave=${avgWave.toFixed(1)}, ` +
        `reachedWave${targetWave}=${reachedTarget}/${runs.length}, ` +
        `gameover=${gameovers}/${runs.length}, earlyWipe=${earlyWipes}/${runs.length}`
    );
    if (process.env.BALANCE_DETAIL === '1') {
        runs
            .filter(run => run.wave < targetWave || run.state === 'gameover')
            .forEach(run => {
                console.log(
                    `  seed ${run.seed}: wave=${run.wave}, state=${run.state}, ` +
                    `time=${run.time}s, kills=${run.kills}, totalPlayers=${run.totalPlayers}, chatEvents=${run.chatEvents}, enemies=${run.activeEnemies}, ` +
                    `players=${run.alivePlayers}, lastStand=${run.lastStandUses}`
                );
            });
    }

    return { name, runs, avgWave, minWave, reachedTarget };
}

const seeds = [101, 202, 303, 404, 505, 606];
const bossSeeds = [701, 874, 1047, 1220, 1393, 1566];

const balanced = runScenario(
    'balanced',
    ['warrior', 'archer', 'mage', 'healer'],
    bossSeeds,
    11
);
const squishy = runScenario(
    'squishy',
    ['archer', 'mage', 'mage', 'archer'],
    seeds,
    5
);
const noTank = runScenario(
    'noTank',
    ['archer', 'mage', 'healer', 'mage'],
    seeds,
    5
);
const noHealer = runScenario(
    'noHealer',
    ['warrior', 'archer', 'mage', 'archer'],
    bossSeeds,
    10
);
const doubleHealer = runScenario(
    'doubleHealer',
    ['warrior', 'archer', 'healer', 'healer'],
    bossSeeds,
    11
);
const allWarrior = runScenario(
    'allWarrior',
    ['warrior', 'warrior', 'warrior', 'warrior'],
    bossSeeds,
    10
);
const lateJoin = runScenario(
    'lateJoin',
    ['warrior', 'healer'],
    seeds,
    7,
    { lateJoin: { wave: 3, username: 'LateMage', classType: 'mage' } }
);
const chatAssist = runScenario(
    'chatAssist',
    ['warrior', 'archer', 'mage', 'healer'],
    bossSeeds,
    11,
    { chatAssist: { fromWave: 3, everyFrames: 1800, viewers: 80 } }
);

assert.ok(
    balanced.minWave >= 10,
    `balanced should consistently reach the first boss, got min wave ${balanced.minWave}`
);
assert.ok(
    balanced.reachedTarget > 0 && balanced.reachedTarget < balanced.runs.length,
    `balanced should have a real but non-guaranteed boss clear rate, got ${balanced.reachedTarget}/${balanced.runs.length}`
);
assert.ok(
    squishy.runs.every(run => run.wave > 2),
    'squishy should not be a stable wave-1/2 wipe pattern'
);
assert.ok(
    noTank.runs.every(run => run.wave > 2),
    'noTank should not be a stable wave-1/2 wipe pattern'
);
assert.ok(
    noHealer.minWave >= 7,
    `noHealer should be harder but viable past early game, got min wave ${noHealer.minWave}`
);
assert.ok(
    doubleHealer.reachedTarget < doubleHealer.runs.length,
    `doubleHealer should not be an automatic first-boss clear, got ${doubleHealer.reachedTarget}/${doubleHealer.runs.length}`
);
assert.ok(
    allWarrior.minWave >= 6,
    `allWarrior should be viable but imperfect, got min wave ${allWarrior.minWave}`
);
assert.ok(
    lateJoin.runs.every(run => run.lateJoined && run.totalPlayers === 3 && run.wave >= 7),
    'late join should be accepted and remain stable through future spawns'
);
assert.ok(
    chatAssist.runs.every(run => run.chatEvents > 0),
    'chat assist scenario should trigger aggregated chat events'
);
assert.ok(
    chatAssist.reachedTarget < chatAssist.runs.length,
    `chat assist should help but not guarantee first-boss clears, got ${chatAssist.reachedTarget}/${chatAssist.runs.length}`
);

console.log('Balance checks passed');
