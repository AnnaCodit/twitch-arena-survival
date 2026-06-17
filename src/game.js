/**
 * Ядро игрового процесса "Twitch Pixel Arena"
 * Управляет игровым циклом, Y-сортировкой объектов, фазой голосования,
 * коллизиями, спавном врагов и применением реликвий.
 */

class Game {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Размеры виртуальной арены
        this.width = CONFIG.ARENA_WIDTH;
        this.height = CONFIG.ARENA_HEIGHT;

        // Инициализация модулей
        this.particles = new ParticleEngine(this.width, this.height);
        this.twitch = new TwitchConnection();
        this.modeId = 'survival';
        this.modeName = 'Survival';
        this.gameOverReason = 'players';
        this.defenseObjective = null;

        // Списки объектов
        this.players = [];
        this.enemies = [];
        this.projectiles = [];
        this.items = [];
        this.decorations = [];
        this.firePuddles = [];

        // Лобби ожидания перед стартом
        this.lobbyUsers = new Map(); // username -> classType
        this.pendingSpawnUsers = new Map(); // Пользователи, написавшие !join во время игры (войдут в следующей волне)

        // Состояние игры
        this.gameState = 'lobby'; // 'lobby', 'playing', 'voting', 'gameover'
        this.wave = 0;
        this.waveEnemiesSpawned = 0;
        this.waveEnemiesTotal = 0;
        this.waveSpawnTimer = 0;
        this.waveInProgress = false;

        // Таймеры и счетчики
        this.frameCount = 0;
        this.timeElapsed = 0; // Время игры в секундах
        this.score = 0;
        this.enemiesKilled = 0;
        this.potionKillsSinceDrop = 0;
        this.lastStandRevivesUsed = 0;

        // Эффект тряски экрана
        this.cameraShake = 0;

        // Голосование за реликвии
        this.votingTimer = 0; // Кадры до окончания голосования
        this.relicsToVote = []; // Четыре текущие реликвии для выбора
        this.relicVotes = { 1: 0, 2: 0, 3: 0, 4: 0 }; // Подсчет голосов
        this.votedUsers = new Set(); // Список зрителей, которые уже проголосовали

        // Накопленные модификаторы от реликвий
        this.activeRelics = [];
        this.relicModifiers = {
            warrior: {},
            archer: {},
            mage: {},
            healer: {},
            all: {},
            mechanics: {
                lifesteal: 0,
                thorns: 0,
                berserk: false,
                arrowBounces: 0
            },
            xpMul: 1.0
        };

        // Привязываем события Twitch
        this.twitch.onCommandCallback = this.handleCommand.bind(this);
        this.modeManager = new ModeManager(this);
        this.modeManager.register(new SurvivalMode(this));
        this.modeManager.register(new DefenseMode(this));

        this.init();
    }

    // Первичная инициализация арены (генерация элементов окружения)
    init() {
        // Очистка
        this.decorations = [];
        
        // Генерация случайных декораций на поляне (кусты, деревья, камни)
        const totalTrees = 8 + Math.floor(Math.random() * 5);
        const totalBushes = 15 + Math.floor(Math.random() * 8);
        const totalRocks = 10 + Math.floor(Math.random() * 5);

        // Расставляем деревья по краям и немного в центре
        for (let i = 0; i < totalTrees; i++) {
            const x = 50 + Math.random() * (this.width - 150);
            const y = 80 + Math.random() * (this.height - 200);
            this.decorations.push({ x, y, width: 64, height: 64, type: 'tree' });
        }

        // Кусты
        for (let i = 0; i < totalBushes; i++) {
            const x = 40 + Math.random() * (this.width - 80);
            const y = 60 + Math.random() * (this.height - 120);
            this.decorations.push({ x, y, width: 32, height: 32, type: 'bush' });
        }

        // Камни
        for (let i = 0; i < totalRocks; i++) {
            const x = 40 + Math.random() * (this.width - 80);
            const y = 70 + Math.random() * (this.height - 130);
            this.decorations.push({ x, y, width: 32, height: 32, type: 'rock' });
        }
    }

    // Запуск матча из Лобби
    startMatch(modeId = 'survival') {
        this.modeManager.switchTo(modeId);
    }

    startCoreMatch(options = {}) {
        this.modeId = options.modeId || 'survival';
        this.modeName = options.modeName || 'Survival';
        this.gameOverReason = 'players';
        this.defenseObjective = null;
        this.players = [];
        this.enemies = [];
        this.projectiles = [];
        this.items = [];
        this.activeRelics = [];
        this.firePuddles = [];
        
        // Сброс модификаторов
        this.relicModifiers = {
            warrior: {}, archer: {}, mage: {}, healer: {}, all: {},
            mechanics: { lifesteal: 0, thorns: 0, berserk: false, arrowBounces: 0 },
            xpMul: 1.0
        };

        this.particles.clear();
        this.wave = 0;
        this.score = 0;
        this.enemiesKilled = 0;
        this.potionKillsSinceDrop = 0;
        this.lastStandRevivesUsed = 0;
        this.timeElapsed = 0;
        this.frameCount = 0;
        this.pendingSpawnUsers.clear();

        // Добавляем всех игроков из лобби в игру
        if (this.lobbyUsers.size === 0) {
            // Если никто не зашел, создаем 4 дефолтных ботов для красоты
            this.twitch.simulateUserMessage("Воин_Бот", "!join warrior");
            this.twitch.simulateUserMessage("Лучник_Бот", "!join archer");
            this.twitch.simulateUserMessage("Маг_Бот", "!join mage");
            this.twitch.simulateUserMessage("Хилер_Бот", "!join healer");
        }

        this.lobbyUsers.forEach((classType, username) => {
            const spawnX = this.width / 2 + (Math.random() - 0.5) * 200;
            const spawnY = this.height / 2 + (Math.random() - 0.5) * 150;
            const color = this.twitch.getUsernameColor(username);
            this.players.push(new Player(spawnX, spawnY, username, classType, this.relicModifiers));
        });

        this.lobbyUsers.clear(); // Очищаем список ожидания лобби
        this.gameState = 'playing';
        if (options.createDefenseObjective) {
            this.createDefenseObjective();
        }
        this.startNextWave();
    }

    // Перезапуск всей игры (возврат в главное меню)
    returnToLobby() {
        this.modeManager.exitActive();
        this.returnToLobbyCore();
    }

    returnToLobbyCore() {
        this.gameState = 'lobby';
        this.lobbyUsers.clear();
        this.pendingSpawnUsers.clear();
        this.players = [];
        this.enemies = [];
        this.projectiles = [];
        this.items = [];
        this.activeRelics = [];
        this.firePuddles = [];
        this.defenseObjective = null;
        this.gameOverReason = 'players';
        this.potionKillsSinceDrop = 0;
        this.lastStandRevivesUsed = 0;
        this.particles.clear();
        this.clearBattleLogs();
        this.init();
    }

    addBattleLog(type, message) {
        if (this.onBattleLog) {
            this.onBattleLog(type, message);
        }
    }

    createDefenseObjective() {
        this.defenseObjective = new DefenseObjective(
            this.width / 2 - 22,
            this.height / 2 - 26
        );
    }

    getEnemyTargets() {
        const targets = this.players.filter(p => p.active);
        if (this.defenseObjective && this.defenseObjective.active) {
            targets.push(this.defenseObjective);
        }
        return targets;
    }

    isDefenseObjectiveDestroyed() {
        return Boolean(this.defenseObjective && !this.defenseObjective.active);
    }

    clearBattleLogs() {
        if (this.onClearBattleLogs) {
            this.onClearBattleLogs();
        }
    }

    // Подготовка и запуск следующей волны
    startNextWave() {
        this.clearBattleLogs();
        this.wave++;
        this.waveEnemiesSpawned = 0;
        this.waveSpawnTimer = 0;
        this.waveInProgress = true;
        this.lastStandRevivesUsed = 0;

        // Возрождаем ВСЕХ погибших игроков, лечим живых и расставляем всех случайным образом по карте
        this.players.forEach(p => {
            // Если игрок мертв — возрождаем
            if (!p.active) {
                p.active = true;
            }
            p.hp = p.maxHp;
            p.x = 60 + Math.random() * (this.width - 150);
            p.y = 90 + Math.random() * (this.height - 180);

            // Применяем отложенную смену класса
            if (p.pendingClassChange) {
                p.classType = p.pendingClassChange;
                p.pendingClassChange = null;
                // Обновляем базовые статы
                p.applyRelicModifiers(this.relicModifiers);
                p.hp = p.maxHp;
            }
            p.classChangedThisWave = false;
        });

        // Добавляем новых зрителей, которые написали !join во время волны
        this.pendingSpawnUsers.forEach((classType, username) => {
            // Проверяем, нет ли его уже в живых
            if (!this.players.some(p => p.username === username)) {
                const spawnX = 60 + Math.random() * (this.width - 150);
                const spawnY = 90 + Math.random() * (this.height - 180);
                this.players.push(new Player(spawnX, spawnY, username, classType, this.relicModifiers));
            }
        });
        this.pendingSpawnUsers.clear();

        // Рассчитываем количество врагов в этой волне
        this.waveEnemiesTotal = CONFIG.WAVES.baseCount + (this.wave - 1) * CONFIG.WAVES.countPerWave;
        // Коэффициент увеличения монстров от размера лобби живых (пропорционально)
        const activePlayers = this.players.filter(p => p.active).length;
        this.waveEnemiesTotal = Math.round(this.waveEnemiesTotal * activePlayers);

        // Выводим сообщение о старте волны
        this.particles.spawnFloatingText(
            this.width / 2,
            this.height / 2 - 50,
            `ВОЛНА ${this.wave}`,
            "#e67e22",
            true,
            true
        );
    }

    // Запуск голосования за реликвии между волнами
    startRelicVoting() {
        this.gameState = 'voting';
        this.votingEndTime = Date.now() + 30000; // 30 секунд (реального времени)
        this.relicVotes = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.votedUsers.clear();

        // Выбираем 4 случайные реликвии с учетом их редкости
        this.relicsToVote = this.getRandomRelics(4);
    }

    // Случайный выбор реликвий с весами редкости
    getRandomRelics(count) {
        const selected = [];
        const available = [...CONFIG.RELICS];

        for (let i = 0; i < count; i++) {
            if (available.length === 0) break;

            // Считаем сумму весов
            let totalWeight = 0;
            available.forEach(r => {
                totalWeight += CONFIG.RARITIES[r.rarity].weight;
            });

            let rnd = Math.random() * totalWeight;
            let chosenIndex = 0;

            for (let j = 0; j < available.length; j++) {
                const weight = CONFIG.RARITIES[available[j].rarity].weight;
                if (rnd < weight) {
                    chosenIndex = j;
                    break;
                }
                rnd -= weight;
            }

            selected.push(available[chosenIndex]);
            available.splice(chosenIndex, 1); // Удаляем, чтобы не повторялись
        }

        return selected;
    }

    // Применение выбранной реликвии
    applyRelic(relic) {
        this.activeRelics.push(relic);
        const eff = relic.effect;

        // Запекаем изменения в relicModifiers
        if (eff.type === 'class_buff') {
            if (!this.relicModifiers[eff.class]) this.relicModifiers[eff.class] = {};
            
            const current = this.relicModifiers[eff.class][eff.stat] || (eff.mul ? 1.0 : 0);
            if (eff.mul) {
                this.relicModifiers[eff.class][eff.stat] = current * eff.mul;
            } else if (eff.add) {
                this.relicModifiers[eff.class][eff.stat] = current + eff.add;
            }
        } 
        else if (eff.type === 'all_players_buff') {
            const current = this.relicModifiers.all[eff.stat] || 1.0;
            this.relicModifiers.all[eff.stat] = current * eff.mul;
        } 
        else if (eff.type === 'enemy_debuff') {
            // Напрямую запишем дебафф врагов (будем умножать при спавне врага)
            if (!this.relicModifiers.enemies) this.relicModifiers.enemies = {};
            const current = this.relicModifiers.enemies[eff.stat] || 1.0;
            this.relicModifiers.enemies[eff.stat] = current * eff.mul;
        } 
        else if (eff.type === 'risk_buff') {
            // Рискованный бафф (урон врагов / опыт игроков)
            if (!this.relicModifiers.enemies) this.relicModifiers.enemies = {};
            this.relicModifiers.enemies.damage = (this.relicModifiers.enemies.damage || 1.0) * eff.enemyDmgMul;
            this.relicModifiers.xpMul = (this.relicModifiers.xpMul || 1.0) * eff.playerXpMul;
        } 
        else if (eff.type === 'global_mechanic') {
            this.relicModifiers.mechanics[eff.mechanic] = eff.value;
        }

        // Обновляем параметры у всех живых игроков
        this.players.forEach(p => {
            p.applyRelicModifiers(this.relicModifiers);
        });

        // Создаем всплывающий лог
        this.particles.spawnFloatingText(
            this.width / 2,
            this.height / 2 - 100,
            `Применено: ${relic.name}`,
            "#f1c40f",
            true
        );
    }

    // Игровой тик: физика, ИИ, спавн
    update(dt) {
        this.modeManager.update(dt);
    }

    updateCore(dt) {
        this.frameCount++;

        // Обновление тряски экрана
        if (this.cameraShake > 0) {
            this.cameraShake *= 0.9;
            if (this.cameraShake < 0.2) this.cameraShake = 0;
        }

        if (this.gameState === 'playing') {
            this.timeElapsed += 1 / 60;

            // Спавним игроков, присоединившихся во время боя (прямо в бой!)
            if (this.pendingSpawnUsers.size > 0) {
                this.pendingSpawnUsers.forEach((classType, username) => {
                    if (!this.players.some(p => p.username === username)) {
                        const spawnX = 60 + Math.random() * (this.width - 150);
                        const spawnY = 90 + Math.random() * (this.height - 180);
                        this.players.push(new Player(spawnX, spawnY, username, classType, this.relicModifiers));
                        
                        this.particles.spawnSpark(spawnX, spawnY, "#3498db", 15);
                        this.particles.spawnFloatingText(spawnX, spawnY - 20, `${username} вошел в бой!`, "#3498db", true);
                    }
                });
                this.pendingSpawnUsers.clear();
            }

            // 1. Постепенный спавн врагов в раунде
            if (this.waveInProgress && this.waveEnemiesSpawned < this.waveEnemiesTotal) {
                this.waveSpawnTimer++;
                if (this.waveSpawnTimer >= CONFIG.WAVES.spawnDelay) {
                    this.waveSpawnTimer = 0;
                    this.spawnEnemy();
                }
            }

            // 2. Логика разталкивания (Separation) — не дает сущностям слипаться в одну точку
            this.handleSeparation();

            // 3. Обновление игроков
            const alivePlayers = this.players.filter(p => p.active);
            
            if (this.players.length > 0 && alivePlayers.length === 0) {
                if (!this.triggerLastStand()) {
                    this.gameOverReason = 'players';
                    this.gameState = 'gameover';
                    return;
                }
            }

            if (this.isDefenseObjectiveDestroyed()) {
                this.gameOverReason = 'objective';
                this.gameState = 'gameover';
                return;
            }

            this.players.forEach(p => {
                p.update(this.enemies, this.players, this.frameCount, this.projectiles, this.particles, this.relicModifiers);
            });

            // 4. Обновление врагов
            const enemyTargets = this.getEnemyTargets();
            this.enemies.forEach(e => {
                e.update(enemyTargets, this.frameCount, this.particles, (amt) => this.shake(amt), this.projectiles);
                
                // Проверяем шипы (возврат урона)
                if (
                    e.active &&
                    this.relicModifiers.mechanics.thorns > 0 &&
                    e.lastAttackFrame === this.frameCount &&
                    e.lastAttackedTarget instanceof Player
                ) {
                    // Враг только что ударил игрока, вернем ему часть урона
                    const thornsDmg = e.damage * this.relicModifiers.mechanics.thorns;
                    e.takeDamage(thornsDmg, "Шипы", this.particles);
                    // Примечание: подсчёт enemiesKilled и score происходит в блоке очистки мертвых врагов ниже
                }
            });

            // Удаляем мертвых врагов (сохраняя статистику)
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                if (!e.active) {
                    this.enemiesKilled++;
                    this.score += e.scoreValue;
                    this.tryDropPotion(e);
                    this.enemies.splice(i, 1);
                }
            }

            // 5. Обновление снарядов
            // 5. Обновление снарядов
            const projectileTargets = this.getEnemyTargets();
            this.projectiles.forEach(pr => {
                pr.update(this.enemies, projectileTargets, this.particles, this.relicModifiers, (amt) => this.shake(amt), this.firePuddles);
            });
            this.projectiles = this.projectiles.filter(pr => pr.active);

            // 5.5 Обновление огненных луж
            this.firePuddles.forEach(fp => {
                fp.update(this.enemies, this.frameCount, this.particles, this.relicModifiers);
            });
            this.firePuddles = this.firePuddles.filter(fp => fp.active);

            // 6. Обновление лута (зелий здоровья)
            this.items.forEach(it => {
                it.update(this.players, this.particles);
            });
            this.items = this.items.filter(it => it.active);

            // 7. Проверка завершения волны
            // Если все враги волны заспавнились и убиты — волна пройдена!
            if (this.waveEnemiesSpawned >= this.waveEnemiesTotal && this.enemies.length === 0) {
                this.waveInProgress = false;
                this.startRelicVoting();
            }

        } else if (this.gameState === 'voting') {
            // Логика фазы голосования за реликвии
            // Заставляем игроков слегка покачиваться на месте
            this.players.forEach(p => {
                p.vx = 0;
                p.vy = 0;
                p.pose = 'idle';
                p.updateAnimation();
            });

            // Конец голосования (по реальному времени)
            const timeRemaining = (this.votingEndTime - Date.now()) / 1000;
            if (timeRemaining <= 0) {
                // Подсчитываем победителя
                let winningOption = 1;
                const totalVotes = Object.values(this.relicVotes).reduce((sum, v) => sum + v, 0);

                if (totalVotes === 0) {
                    // Если никто не проголосовал, берем случайную карту
                    winningOption = Math.floor(Math.random() * 4) + 1;
                } else {
                    let maxVotes = this.relicVotes[1];
                    let winners = [1];

                    for (let o = 2; o <= 4; o++) {
                        if (this.relicVotes[o] > maxVotes) {
                            maxVotes = this.relicVotes[o];
                            winners = [o];
                        } else if (this.relicVotes[o] === maxVotes) {
                            winners.push(o);
                        }
                    }
                    // Если есть ничья (равное кол-во голосов), выбираем случайно среди лидеров
                    winningOption = winners[Math.floor(Math.random() * winners.length)];
                }

                const chosenRelic = this.relicsToVote[winningOption - 1];
                this.applyRelic(chosenRelic);

                // Запуск следующей волны
                this.gameState = 'playing';
                this.startNextWave();
            }
        }

        // Обновляем систему частиц
        this.particles.update();
    }

    tryDropPotion(enemy) {
        if (!enemy || enemy.isBoss) return;

        const pityReady = this.potionKillsSinceDrop >= CONFIG.HEAL_POTION_PITY_KILLS;
        const shouldDrop = pityReady || Math.random() <= CONFIG.HEAL_POTION_DROP_CHANCE;

        if (!shouldDrop) {
            this.potionKillsSinceDrop++;
            return;
        }

        this.potionKillsSinceDrop = 0;

        const x = enemy.x + enemy.width / 2 - 7;
        const y = enemy.y + enemy.height / 2 - 7;
        this.items.push(new HealthPotion(x, y));
    }

    triggerLastStand() {
        if (this.lastStandRevivesUsed >= CONFIG.LAST_STAND_REVIVES_PER_WAVE) {
            return false;
        }

        this.lastStandRevivesUsed++;
        this.projectiles = this.projectiles.filter(pr => !pr.isEnemy);
        this.cameraShake = Math.max(this.cameraShake, 12);

        this.players.forEach((p, index) => {
            p.active = true;
            p.hp = Math.max(1, Math.round(p.maxHp * CONFIG.LAST_STAND_HP_RATIO));
            p.damageReductionFrames = CONFIG.LAST_STAND_PROTECTION_FRAMES;
            p.damageTakenMul = CONFIG.LAST_STAND_DAMAGE_TAKEN_MUL;
            p.kbX = 0;
            p.kbY = 0;
            p.vx = 0;
            p.vy = 0;

            const angle = (Math.PI * 2 * index) / Math.max(1, this.players.length);
            p.x = this.width / 2 + Math.cos(angle) * 90;
            p.y = this.height / 2 + Math.sin(angle) * 70;

            this.particles.spawnSpark(p.x + p.width / 2, p.y + p.height / 2, "#f1c40f", 18);
            this.particles.spawnFloatingText(
                p.x + p.width / 2,
                p.y - 10,
                `+${p.hp} HP`,
                "#2ecc71",
                true
            );
        });

        this.particles.spawnFloatingText(
            this.width / 2,
            this.height / 2 - 95,
            "ПОСЛЕДНИЙ ШАНС!",
            "#f1c40f",
            true,
            true
        );
        this.addBattleLog('resurrect', 'ПОСЛЕДНИЙ ШАНС! Команда возвращается в бой.');

        return true;
    }

    // Спавн одного врага
    spawnEnemy() {
        this.waveEnemiesSpawned++;

        // Выбираем случайную сторону спавна вне экрана (сверху, снизу, слева, справа)
        const side = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;
        const padding = 40;

        switch (side) {
            case 0: // Сверху
                x = Math.random() * this.width;
                y = -padding;
                break;
            case 1: // Снизу
                x = Math.random() * this.width;
                y = this.height + padding;
                break;
            case 2: // Слева
                x = -padding;
                y = Math.random() * this.height;
                break;
            case 3: // Справа
                x = this.width + padding;
                y = Math.random() * this.height;
                break;
        }

        // Каждую 10-ю волну спавним ТОЛЬКО Босса (или Босса и свиту)
        const isBossWave = (this.wave % CONFIG.WAVES.bossInterval === 0);
        
        let type = 'slime';

        if (isBossWave && this.waveEnemiesSpawned === 1) {
            // Спавним рейд-босса
            const boss = new Boss(this.width/2 - 32, -64, this.wave, this.players.filter(p => p.active).length);
            // Применяем модификаторы скорости врагов от реликвий
            if (this.relicModifiers.enemies && this.relicModifiers.enemies.speed) {
                boss.speed *= this.relicModifiers.enemies.speed;
            }
            this.enemies.push(boss);
            return;
        }

        // Для обычных волн/свиты выбираем монстра по формуле от сложности
        const rnd = Math.random();
        
        if (this.wave < 3) {
            type = 'slime'; // Начальные волны: только слизни
        } else if (this.wave < 6) {
            if (rnd < 0.40) type = 'slime';
            else if (rnd < 0.70) type = 'goblin';
            else if (rnd < 0.90) type = 'goblin_stone';
            else type = 'bull';
        } else if (this.wave < 10) {
            if (rnd < 0.20) type = 'slime';
            else if (rnd < 0.45) type = 'goblin';
            else if (rnd < 0.65) type = 'goblin_stone';
            else if (rnd < 0.85) type = 'skeleton';
            else type = 'bull';
        } else {
            // После 10 волны доступны все
            if (rnd < 0.10) type = 'slime';
            else if (rnd < 0.25) type = 'goblin';
            else if (rnd < 0.40) type = 'goblin_stone';
            else if (rnd < 0.60) type = 'skeleton';
            else if (rnd < 0.80) type = 'bull';
            else type = 'orc';
        }

        const activePlayersCount = this.players.filter(p => p.active).length;
        const enemy = new Enemy(x, y, type, this.wave, activePlayersCount);
        
        // Применяем реликвии-дебаффы к монстрам
        if (this.relicModifiers.enemies) {
            if (this.relicModifiers.enemies.speed) {
                enemy.speed *= this.relicModifiers.enemies.speed;
            }
            if (this.relicModifiers.enemies.damage) {
                enemy.damage = Math.round(enemy.damage * this.relicModifiers.enemies.damage);
            }
        }

        this.enemies.push(enemy);
    }

    // Механика расталкивания существ
    handleSeparation() {
        const entities = [...this.players.filter(p => p.active), ...this.enemies.filter(e => e.active)];
        
        for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
                const e1 = entities[i];
                const e2 = entities[j];

                const dx = (e2.x + e2.width/2) - (e1.x + e1.width/2);
                const dy = (e2.y + e2.height/2) - (e1.y + e1.height/2);
                const dist = Math.sqrt(dx*dx + dy*dy);
                const minDist = (e1.width + e2.width) / 2 * 0.75; // Допускаем небольшое наложение

                if (dist < minDist && dist > 0) {
                    const overlap = minDist - dist;
                    const pushX = (dx / dist) * overlap * 0.18;
                    const pushY = (dy / dist) * overlap * 0.18;

                    // Воин тяжелее разталкивается/сдвигает других (или босс)
                    let w1 = e1.isBoss ? 4 : (e1.classType === 'warrior' ? 1.5 : 1.0);
                    let w2 = e2.isBoss ? 4 : (e2.classType === 'warrior' ? 1.5 : 1.0);
                    const totalW = w1 + w2;

                    e1.x -= pushX * (w2 / totalW);
                    e1.y -= pushY * (w2 / totalW);
                    e2.x += pushX * (w1 / totalW);
                    e2.y += pushY * (w1 / totalW);
                }
            }
        }
    }

    // Тряска экрана
    shake(amount) {
        this.cameraShake = Math.max(this.cameraShake, amount);
    }

    // Рендеринг всей игры
    draw() {
        this.modeManager.draw(this.ctx);
    }

    drawCore(ctx = this.ctx) {
        this.ctx = ctx;
        this.ctx.save();

        // 1. Применяем эффект тряски камеры
        if (this.cameraShake > 0) {
            const dx = (Math.random() - 0.5) * this.cameraShake;
            const dy = (Math.random() - 0.5) * this.cameraShake;
            this.ctx.translate(dx, dy);
        }

        const isObsTransparent = typeof document !== 'undefined' &&
            document.body &&
            document.body.classList.contains('obs-mode');

        this.ctx.clearRect(0, 0, this.width, this.height);

        if (!isObsTransparent) {
            // 2. Рисуем фон (зеленая трава)
            this.ctx.fillStyle = "#3b7a57"; // Глубокий лесной зеленый
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Рисуем текстуру земли (травинки)
            this.ctx.fillStyle = "#2d5e41";
            for (let x = 40; x < this.width; x += 160) {
                for (let y = 30; y < this.height; y += 120) {
                    // Маленькие травинки
                    this.ctx.fillRect(x + (y % 17), y + (x % 13), 2, 6);
                    this.ctx.fillRect(x + (y % 17) - 3, y + (x % 13) + 2, 2, 4);
                }
            }
        }

        // 3. Отрисовка запеченной крови на полу
        this.particles.drawBloodFloor(this.ctx);

        // Отрисовка огненных луж
        this.firePuddles.forEach(fp => fp.draw(this.ctx));

        // 4. Сбор и Y-сортировка всех объектов для 2.5D эффекта глубины
        const sortedObjects = [];

        // Декорации
        this.decorations.forEach(d => sortedObjects.push({
            y: d.y + d.height - 5, // Точка сортировки по основанию
            draw: (ctx) => {
                const img = Sprites.decorations[d.type];
                ctx.drawImage(img, d.x, d.y, d.width, d.height);
            }
        }));

        if (this.defenseObjective && this.defenseObjective.active) {
            sortedObjects.push({
                y: this.defenseObjective.y + this.defenseObjective.height,
                draw: (ctx) => this.defenseObjective.draw(ctx)
            });
        }

        // Игроки (включая могильные плиты для мертвых!)
        this.players.forEach(p => {
            if (p.active) {
                sortedObjects.push({
                    y: p.y + p.height,
                    draw: (ctx) => p.draw(ctx, Sprites.players[p.classType])
                });
            } else {
                // Если мертв — рисуем могилу
                sortedObjects.push({
                    y: p.y + p.height,
                    draw: (ctx) => {
                        ctx.drawImage(Sprites.items['tombstone'], p.x - 4, p.y - 8, 32, 32);
                        // Никнейм над могилой (серым)
                        ctx.fillStyle = "#95a5a6";
                        ctx.font = 'bold 8px "Press Start 2P", monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText(p.username, p.x + p.width/2, p.y - 12);
                    }
                });
            }
        });

        // Враги
        this.enemies.forEach(e => {
            if (e.active) {
                sortedObjects.push({
                    y: e.y + e.height,
                    draw: (ctx) => e.draw(ctx, Sprites.enemies[e.enemyType])
                });
            }
        });

        // Лут (зелья)
        this.items.forEach(it => {
            if (it.active) {
                sortedObjects.push({
                    y: it.y + it.height,
                    draw: (ctx) => it.draw(ctx)
                });
            }
        });

        // Сортировка по возрастанию Y
        sortedObjects.sort((a, b) => a.y - b.y);

        // Рисуем отсортированные объекты
        sortedObjects.forEach(obj => obj.draw(this.ctx));

        // 5. Рисуем летящие снаряды (над объектами)
        this.projectiles.forEach(pr => pr.draw(this.ctx));

        // 6. Рисуем динамические частицы и тексты
        this.particles.draw(this.ctx);

        this.ctx.restore();

        // 7. Отрисовка интерфейса голосования
        if (this.gameState === 'voting') {
            this.drawVotingUI();
        }
    }

    // Отрисовка UI голосования поверх холста
    drawVotingUI() {
        const timeRemaining = Math.max(0, Math.ceil((this.votingEndTime - Date.now()) / 1000));
        
        // Затемнение фона
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Таймер сверху
        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = '24px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`ГОЛОСОВАНИЕ: ${timeRemaining} сек`, this.width / 2, 100);
        this.ctx.font = '10px "Press Start 2P", monospace';
        this.ctx.fillStyle = "#bdc3c7";
        this.ctx.fillText("Голосуйте в чате: просто отправьте 1, 2, 3 или 4", this.width / 2, 130);

        // 4 карточки улучшений
        const cardW = 240;
        const cardH = 380;
        const gap = 30;
        const startX = (this.width - (4 * cardW + 3 * gap)) / 2;
        const cardY = 160;

        // Всего голосов для расчета процентов
        let totalVotes = 0;
        for (let num in this.relicVotes) {
            totalVotes += this.relicVotes[num];
        }

        const maxVotesAcrossOptions = Math.max(...Object.values(this.relicVotes));

        for (let i = 0; i < 4; i++) {
            const relic = this.relicsToVote[i];
            if (!relic) continue;

            const cardX = startX + i * (cardW + gap);
            const num = i + 1;
            const votes = this.relicVotes[num];
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const rColor = CONFIG.RARITIES[relic.rarity].color;

            // Фон карточки (Стеклянная рамка с редким свечением)
            this.ctx.fillStyle = "rgba(44, 62, 80, 0.9)";
            this.ctx.strokeStyle = rColor;
            this.ctx.lineWidth = 4;
            
            // Если лидер — подсвечиваем ярче
            const isLeader = votes > 0 && votes === maxVotesAcrossOptions;
            if (isLeader) {
                this.ctx.lineWidth = 6;
                this.ctx.shadowColor = rColor;
                this.ctx.shadowBlur = 15;
            }

            this.ctx.fillRect(cardX, cardY, cardW, cardH);
            this.ctx.strokeRect(cardX, cardY, cardW, cardH);
            
            // Сброс тени
            this.ctx.shadowBlur = 0;

            // Номер выбора в кружке
            this.ctx.fillStyle = rColor;
            this.ctx.beginPath();
            this.ctx.arc(cardX + cardW/2, cardY - 10, 20, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = "#000000";
            this.ctx.font = 'bold 16px "Press Start 2P", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(num.toString(), cardX + cardW/2, cardY - 3);

            // Название реликвии
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = 'bold 11px "Press Start 2P", monospace';
            this.wrapText(relic.name, cardX + cardW/2, cardY + 50, cardW - 20, 16);

            // Редкость
            this.ctx.fillStyle = rColor;
            this.ctx.font = 'bold 8px "Press Start 2P", monospace';
            this.ctx.fillText(CONFIG.RARITIES[relic.rarity].name.toUpperCase(), cardX + cardW/2, cardY + 110);

            // Описание (крупный читаемый шрифт)
            this.ctx.fillStyle = "#ecf0f1";
            this.ctx.font = '16px "Press Start 2P", monospace';
            this.wrapText(relic.desc, cardX + cardW/2, cardY + 150, cardW - 30, 22);

            // Шкала голосов
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            this.ctx.fillRect(cardX + 20, cardY + cardH - 80, cardW - 40, 25);
            
            this.ctx.fillStyle = rColor;
            this.ctx.fillRect(cardX + 20, cardY + cardH - 80, (cardW - 40) * (pct / 100), 25);

            // Текст голосов
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = 'bold 9px "Press Start 2P", monospace';
            this.ctx.fillText(`${votes} голосов (${pct}%)`, cardX + cardW/2, cardY + cardH - 63);
        }

        // Рисуем блок статистики классов под карточками
        const classCounts = { warrior: 0, archer: 0, mage: 0, healer: 0 };
        this.players.forEach(p => {
            if (classCounts[p.classType] !== undefined) {
                classCounts[p.classType]++;
            }
        });

        const statsY = 565;
        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = 'bold 11px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("КЛАССЫ В БОЮ:", this.width / 2, statsY);

        const classes = [
            { key: 'warrior', label: 'Воины', color: '#e74c3c' },
            { key: 'archer', label: 'Лучники', color: '#2ecc71' },
            { key: 'mage', label: 'Маги', color: '#9b59b6' },
            { key: 'healer', label: 'Целители', color: '#f1c40f' }
        ];

        const statsW = 145;
        const statsGap = 15;
        const totalStatsW = classes.length * statsW + (classes.length - 1) * statsGap;
        const startStatsX = (this.width - totalStatsW) / 2;

        classes.forEach((c, idx) => {
            const blockX = startStatsX + idx * (statsW + statsGap);
            const blockY = statsY + 12;
            const blockW = statsW;
            const blockH = 30;

            // Стеклянная рамочка класса
            this.ctx.fillStyle = "rgba(44, 62, 80, 0.7)";
            this.ctx.strokeStyle = c.color;
            this.ctx.lineWidth = 2;
            this.ctx.fillRect(blockX, blockY, blockW, blockH);
            this.ctx.strokeRect(blockX, blockY, blockW, blockH);

            // Текст названия класса
            this.ctx.fillStyle = c.color;
            this.ctx.font = 'bold 8px "Press Start 2P", monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(c.label.toUpperCase(), blockX + 8, blockY + 18);
            
            // Количество
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = 'bold 12px "Press Start 2P", monospace';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(classCounts[c.key].toString(), blockX + blockW - 8, blockY + 20);
        });
    }

    // Вспомогательный метод автопереноса текста
    wrapText(text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        this.ctx.textAlign = 'center';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                this.ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        this.ctx.fillText(line, x, currentY);
    }

    getHudState() {
        return this.modeManager.getHudState();
    }

    getDefaultHudState() {
        const isVoting = this.gameState === 'voting';
        const remainingEnemies = Math.max(0, (this.waveEnemiesTotal - this.waveEnemiesSpawned) + this.enemies.length);
        const aliveCount = this.players.filter(p => p.active).length;
        const timeRemaining = Math.max(0, Math.ceil(((this.votingEndTime || Date.now()) - Date.now()) / 1000));

        return {
            modeId: this.modeId,
            modeName: this.modeName,
            waveLabel: `ВОЛНА: ${this.wave}`,
            progressLabel: isVoting ? `ВЫБОР: ${timeRemaining} сек` : `ВРАГОВ: ${remainingEnemies}`,
            progressAccent: isVoting ? 'voting' : 'combat',
            aliveLabel: `В ЖИВЫХ: ${aliveCount} / ${this.players.length}`,
            scoreLabel: `СЧЕТ: ${this.score}`,
            objectiveLabel: null,
            objectiveWarning: false
        };
    }

    getResultState() {
        return this.modeManager.getResultState();
    }

    getDefaultResultState() {
        const min = Math.floor(this.timeElapsed / 60);
        const sec = Math.floor(this.timeElapsed % 60);
        const healers = this.players.filter(p => p.classType === 'healer');

        return {
            title: 'ВСЕ ПОГИБЛИ',
            subtitle: 'Ваша команда пала под натиском монстров',
            wave: this.wave,
            time: `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`,
            score: this.score,
            healerHealing: Math.round(healers.reduce((sum, h) => sum + (h.healingDone || 0), 0)),
            healerResurrects: healers.reduce((sum, h) => sum + (h.resurrectCount || 0), 0),
            players: [...this.players].sort((a, b) => b.kills - a.kills)
        };
    }

    handleCommand(username, command, args, color) {
        this.modeManager.handleCommand({ username, command, args, color });
    }

    // Обработка входящих команд
    handleCoreCommand(username, command, args, color) {
        // Очищаем имя от спецсимволов IRC
        const cleanUser = username.replace(/[^a-zA-Z0-9_А-Яа-я]/g, '');

        if (command === '!join' || command === '!войти' || command === '!играть') {
            // Разрешенные классы
            let classType = 'warrior';
            if (args[0]) {
                const arg = args[0].toLowerCase();
                if (arg === 'mage' || arg === 'маг') classType = 'mage';
                else if (arg === 'archer' || arg === 'лучник') classType = 'archer';
                else if (arg === 'healer' || arg === 'целитель' || arg === 'хилер' || arg === 'cleric' || arg === 'клирик') classType = 'healer';
            } else {
                // Если класс не указан, выбираем случайный
                const classes = ['warrior', 'mage', 'archer', 'healer'];
                classType = classes[Math.floor(Math.random() * classes.length)];
            }

            if (this.gameState === 'lobby') {
                this.lobbyUsers.set(cleanUser, classType);
            } else {
                // Если игра уже активна, добавляем в очередь спавна на следующую волну
                this.pendingSpawnUsers.set(cleanUser, classType);
            }
        } 
        else if (command === '!class' || command === '!класс') {
            if (!args[0]) return;
            const arg = args[0].toLowerCase();
            let newClass = 'warrior';
            if (arg === 'mage' || arg === 'маг') newClass = 'mage';
            else if (arg === 'archer' || arg === 'лучник') newClass = 'archer';
            else if (arg === 'healer' || arg === 'целитель' || arg === 'хилер' || arg === 'cleric' || arg === 'клирик') newClass = 'healer';

            if (this.gameState === 'lobby') {
                if (this.lobbyUsers.has(cleanUser)) {
                    this.lobbyUsers.set(cleanUser, newClass);
                }
            } else {
                // Во время игры
                const player = this.players.find(p => p.username === cleanUser);
                if (player) {
                    // Разрешено менять класс ОДИН РАЗ за волну
                    if (!player.classChangedThisWave) {
                        player.pendingClassChange = newClass;
                        player.classChangedThisWave = true;
                        
                        // Лог уведомления
                        this.particles.spawnFloatingText(
                            player.x + player.width/2,
                            player.y,
                            `Смена: ${CONFIG.CLASSES[newClass].name}`,
                            "#3498db"
                        );
                    } else {
                        // Уже менял в этой волне
                        this.particles.spawnFloatingText(
                            player.x + player.width/2,
                            player.y,
                            `Лимит смены!`,
                            "#e74c3c"
                        );
                    }
                }
            }
        } 
        else if (command === '1' || command === '2' || command === '3' || command === '4') {
            if (this.gameState !== 'voting') return;

            // Голосовать можно один раз
            if (this.votedUsers.has(cleanUser)) return;

            const option = parseInt(command);
            if (option >= 1 && option <= 4) {
                this.relicVotes[option]++;
                this.votedUsers.add(cleanUser);
            }
        }
    }
}

// Экспортируем
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
} else {
    window.Game = Game;
}
