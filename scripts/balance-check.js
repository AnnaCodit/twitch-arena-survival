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
Object.assign(global, require('../src/modes.js'));
global.Sprites = {
    decorations: {},
    players: {},
    enemies: {},
    items: {},
    projectiles: {}
};

const Game = require('../src/game.js');

function runOne(classes, seed, targetWave = 5) {
    const previousRandom = Math.random;
    Math.random = createSeededRandom(seed);

    try {
        const game = new Game('game-canvas');

        classes.forEach((classType, index) => {
            game.handleCommand(`P${index + 1}`, '!join', [classType], '#ffffff');
        });
        game.startMatch('survival');

        const maxFrames = 60 * 420;
        for (let frame = 0; frame < maxFrames; frame++) {
            if (game.gameState === 'voting') {
                game.votingEndTime = Date.now() - 1;
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
            lastStandUses: game.lastStandRevivesUsed
        };
    } finally {
        Math.random = previousRandom;
    }
}

function runScenario(name, classes, seeds, targetWave = 5) {
    const runs = seeds.map(seed => runOne(classes, seed, targetWave));
    const avgWave = runs.reduce((sum, run) => sum + run.wave, 0) / runs.length;
    const minWave = Math.min(...runs.map(run => run.wave));
    const reachedTarget = runs.filter(run => run.wave >= targetWave && run.state !== 'gameover').length;

    console.log(
        `${name}: minWave=${minWave}, avgWave=${avgWave.toFixed(1)}, ` +
        `reachedWave${targetWave}=${reachedTarget}/${runs.length}`
    );
    if (process.env.BALANCE_DETAIL === '1') {
        runs
            .filter(run => run.wave < targetWave || run.state === 'gameover')
            .forEach(run => {
                console.log(
                    `  seed ${run.seed}: wave=${run.wave}, state=${run.state}, ` +
                    `time=${run.time}s, kills=${run.kills}, enemies=${run.activeEnemies}, ` +
                    `players=${run.alivePlayers}, lastStand=${run.lastStandUses}`
                );
            });
    }

    return { name, runs, avgWave, minWave, reachedTarget };
}

const seeds = [101, 202, 303, 404, 505, 606];

const balanced = runScenario(
    'balanced',
    ['warrior', 'archer', 'mage', 'healer'],
    seeds
);
const squishy = runScenario(
    'squishy',
    ['archer', 'mage', 'mage', 'archer'],
    seeds
);
const noHealer = runScenario(
    'noHealer',
    ['warrior', 'archer', 'mage', 'archer'],
    seeds
);

assert.ok(
    balanced.minWave >= 5,
    `balanced should consistently reach wave 5, got min wave ${balanced.minWave}`
);
assert.ok(
    squishy.avgWave >= 2,
    `squishy should not be a wave-1 wipe pattern, got avg wave ${squishy.avgWave.toFixed(1)}`
);
assert.ok(
    noHealer.avgWave >= 3,
    `noHealer should be hard but viable past early game, got avg wave ${noHealer.avgWave.toFixed(1)}`
);

console.log('Balance checks passed');
