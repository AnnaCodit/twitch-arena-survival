/**
 * Классы игровых сущностей "Twitch Pixel Arena"
 * Содержит классы Entity, Player, Enemy, Boss, Projectile и HealthPotion.
 */

// Базовый класс для всех подвижных объектов
class Entity {
    constructor(x, y, width, height, stats) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = width;
        this.height = height;

        // Характеристики
        this.name = stats.name || "";
        this.maxHp = stats.maxHp || 100;
        this.hp = this.maxHp;
        this.speed = stats.speed || 1.5;
        this.damage = stats.damage || 10;
        this.defense = stats.defense || 0;
        this.range = stats.range || 30;
        this.cooldown = stats.cooldown || 60;

        this.color = stats.color || "#ffffff";
        this.bloodColor = stats.bloodColor || "#c0392b"; // По дефолту красная кровь
        this.scale = stats.scale || 1.0;

        this.lastAttackFrame = 0;
        this.active = true;

        // Отбрасывание (Knockback)
        this.kbX = 0;
        this.kbY = 0;

        // Анимация
        this.pose = 'idle'; // idle, walk, attack
        this.animFrame = 0;
        this.animTimer = 0;
        this.direction = 1; // 1 = вправо, -1 = влево
    }

    // Получение урона с учетом защиты
    takeDamage(amount, attackerName, particleEngine, isCritOverride = false) {
        if (!this.active) return 0;

        const actualDamage = Math.max(1, Math.round(amount - this.defense));
        this.hp -= actualDamage;

        // Спавним частицы крови
        if (particleEngine) {
            particleEngine.spawnBlood(
                this.x + this.width / 2,
                this.y + this.height / 2,
                this.bloodColor,
                actualDamage > 25 ? 12 : 6,
                this.scale
            );

            // Всплывающий текст урона
            const isCrit = isCritOverride || (amount > this.damage * 1.4);
            particleEngine.spawnFloatingText(
                this.x + this.width / 2,
                this.y,
                actualDamage.toString(),
                isCrit ? "#e67e22" : "#e74c3c",
                isCrit
            );
        }

        if (this.hp <= 0) {
            const wasActive = this.active;
            this.hp = 0;
            this.active = false;

            if (wasActive && this.username) {
                if (window.game && typeof window.game.addBattleLog === 'function') {
                    window.game.addBattleLog('death', `☠️ ${this.username} погиб`);
                }
            }
        }

        return actualDamage;
    }

    // Лечение сущности
    heal(amount, particleEngine) {
        if (!this.active) return 0;

        const healAmount = Math.round(amount);
        const actualHeal = Math.min(this.maxHp - this.hp, healAmount);

        if (actualHeal <= 0) return 0;

        this.hp += actualHeal;

        if (particleEngine) {
            particleEngine.spawnSpark(
                this.x + this.width / 2,
                this.y + this.height / 2,
                "#2ecc71",
                5
            );
            particleEngine.spawnFloatingText(
                this.x + this.width / 2,
                this.y,
                `+${actualHeal}`,
                "#2ecc71"
            );
        }
        return actualHeal;
    }

    // Базовое обновление анимации
    updateAnimation() {
        this.animTimer++;
        if (this.animTimer >= 10) { // Смена кадра каждые 10 тиков
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 2;
        }
    }

    // Базовый метод отрисовки
    draw(ctx, spriteObj) {
        if (!this.active) return;

        let frameKey = 'idle';
        if (this.pose === 'walk') {
            frameKey = this.animFrame === 0 ? 'walk0' : 'walk1';
        } else if (this.pose === 'attack') {
            frameKey = this.animFrame === 0 ? 'attack0' : 'attack1';
        }

        const sprite = spriteObj[frameKey] || spriteObj.idle;

        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

        // Разворот в сторону движения
        if (this.direction === -1) {
            ctx.scale(-1, 1);
        }

        // Отрисовка
        const drawW = 32 * this.scale;
        const drawH = 32 * this.scale;
        ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Полоска здоровья
        this.drawHealthBar(ctx);
    }

    drawHealthBar(ctx) {
        if (this.hp === this.maxHp) return; // Не рисуем, если полное ХП

        const barW = this.width;
        const barH = 4;
        const barX = this.x;
        const barY = this.y - 8;

        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(barX, barY, barW, barH);

        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = this.bloodColor === "#2ecc71" ? "#2ecc71" : "#e74c3c"; // Зеленый для слаймов, иначе красный
        ctx.fillRect(barX, barY, barW * hpPercent, barH);
    }
}

// Класс Игрока (зритель Твича)
class Player extends Entity {
    constructor(x, y, username, classType, globalRelicMods) {
        // Подгружаем дефолты из конфига
        const baseStats = JSON.parse(JSON.stringify(CONFIG.CLASSES[classType]));
        super(x, y, 24, 24, baseStats);

        this.username = username;
        this.classType = classType;
        this.level = 1;
        this.xp = 0;
        this.xpNeeded = CONFIG.XP_BASE;
        this.currentTarget = null; // Текущая цель игрока для контроля лимита атакующих

        // Косметические ауры
        this.auras = {
            shield: false,    // Дает крутящийся щит (защита)
            glow: false,      // Подсвечивает меч (урон)
            wind: false,      // Воздушные потоки под ногами (скорость)
            legendary: false  // Золотая легендарная аура
        };

        // Статистика за игру
        this.kills = 0;
        this.damageDealt = 0;
        this.healingDone = 0;
        this.resurrectCount = 0;

        // Запрос смены класса на следующую волну
        this.pendingClassChange = null;
        this.classChangedThisWave = false;

        // Флаг убегания лучника/мага (для задержки выстрела после остановки)
        this.fledLastFrame = false;
        this.isFleeing = false; // Флаг панического бегства воина

        // Характеристики огненных луж мага
        this.puddleRadiusMul = 1.0;
        this.puddleDurationAdd = 0;

        // Перезарядка воскрешения целителя (20 секунд = 1200 кадров)
        this.lastResurrectFrame = -1200;

        // Применяем глобальные реликвии, которые уже открыты
        this.applyRelicModifiers(globalRelicMods);
    }

    // Применение модификаторов от реликвий
    applyRelicModifiers(mods) {
        if (!mods) return;

        const baseStats = CONFIG.CLASSES[this.classType];

        // Сбрасываем характеристики к базовым с учетом уровня
        const lvlBonus = this.level - 1;
        const growth = baseStats.growth;
        this.maxHp = baseStats.maxHp + (growth.maxHp || 0) * lvlBonus;
        this.damage = baseStats.damage + (growth.damage || 0) * lvlBonus;
        this.speed = baseStats.speed + (growth.speed || 0) * lvlBonus;
        this.defense = baseStats.defense + (growth.defense || 0) * lvlBonus;
        this.range = baseStats.range + (growth.range || 0) * lvlBonus;
        this.cooldown = baseStats.cooldown;

        // Применяем коэффициенты от реликвий
        // Модификаторы для конкретного класса
        if (mods[this.classType]) {
            for (let [stat, value] of Object.entries(mods[this.classType])) {
                if (stat === 'maxHp') this.maxHp = Math.round(this.maxHp * value);
                else if (stat === 'damage') this.damage = Math.round(this.damage * value);
                else if (stat === 'speed') this.speed = this.speed * value;
                else if (stat === 'cooldown') this.cooldown = Math.round(this.cooldown * value);
                else if (stat === 'defense') this.defense += value;
                else if (stat === 'range') this.range += value;
                else if (stat === 'puddleRadius') this.puddleRadiusMul = value;
                else if (stat === 'puddleDuration') this.puddleDurationAdd = value;
            }
        }

        // Модификаторы для всех классов
        if (mods['all']) {
            for (let [stat, value] of Object.entries(mods['all'])) {
                if (stat === 'maxHp') this.maxHp = Math.round(this.maxHp * value);
                else if (stat === 'damage') this.damage = Math.round(this.damage * value);
                else if (stat === 'speed') this.speed = this.speed * value;
            }
        }

        // Включаем визуал аур
        this.auras.shield = (this.defense > baseStats.defense + 1);
        this.auras.glow = (this.damage > baseStats.damage * 1.15);
        this.auras.wind = (this.speed > baseStats.speed * 1.1);

        // Проверяем глобальные механики (вампиризм, шипы)
        if (mods['mechanics']) {
            if (mods['mechanics'].lifesteal || mods['mechanics'].thorns || mods['mechanics'].berserk) {
                this.auras.legendary = true;
            }
        }

        // Корректируем текущее здоровье, чтобы оно не превышало максимальное
        if (this.hp > this.maxHp) this.hp = this.maxHp;
    }

    takeDamage(amount, attackerName, particleEngine) {
        if (this.classType === 'warrior') {
            // Способность блокирования урона в 20% случаев
            if (Math.random() < 0.20) {
                if (particleEngine) {
                    particleEngine.spawnFloatingText(
                        this.x + this.width / 2,
                        this.y,
                        "БЛОК!",
                        "#3498db",
                        true
                    );
                }
                return 0; // Заблокировали весь урон!
            }
        }
        return super.takeDamage(amount, attackerName, particleEngine);
    }

    // Получение опыта за убийства
    gainXp(amount, particleEngine, globalMods) {
        if (!this.active) return;

        let xpGained = amount;
        // Модификатор опыта от опасных реликвий
        if (globalMods && globalMods['xpMul']) {
            xpGained = Math.round(xpGained * globalMods['xpMul']);
        }

        this.xp += xpGained;

        if (this.xp >= this.xpNeeded) {
            this.xp -= this.xpNeeded;
            this.level++;
            this.xpNeeded = CONFIG.XP_BASE + this.level * CONFIG.XP_FACTOR;

            // Полное исцеление при уровне
            this.hp = this.maxHp;

            // Воспроизводим эффект уровня
            if (particleEngine) {
                particleEngine.spawnFloatingText(
                    this.x + this.width / 2,
                    this.y - 15,
                    `УРОВЕНЬ ${this.level}!`,
                    "#f1c40f",
                    true,
                    true
                );
                particleEngine.spawnSpark(this.x + this.width / 2, this.y + this.height / 2, "#f1c40f", 12);
            }

            // Пересчитываем характеристики с учетом нового уровня
            this.applyRelicModifiers(globalMods);
            this.hp = this.maxHp; // Снова выставляем максимум после перерасчета
        }
    }

    // Обновление состояния и поиск цели
    update(enemies, players, frameCount, projectiles, particleEngine, globalMods) {
        if (!this.active) {
            this.currentTarget = null;
            return;
        }

        if (this.currentTarget && !this.currentTarget.active) {
            this.currentTarget = null;
        }

        // Спавним искры ауры, если они есть
        if (frameCount % 12 === 0 && particleEngine) {
            if (this.auras.legendary) this.spawnAuraEffect(particleEngine, "#f1c40f");
            else if (this.auras.glow) this.spawnAuraEffect(particleEngine, "#e74c3c");
            else if (this.auras.shield) this.spawnAuraEffect(particleEngine, "#3498db");
            else if (this.auras.wind) this.spawnAuraEffect(particleEngine, "#2ecc71");
        }

        let target = null;
        let shouldFleeFromEnemy = false;
        let fleeDx = 0;
        let fleeDy = 0;
        let fleeDist = Infinity;

        // Ищем ближайшего врага для проверки опасной близости
        const closestEnemy = this.findClosestEntity(enemies);
        if (closestEnemy) {
            fleeDx = (closestEnemy.x + closestEnemy.width / 2) - (this.x + this.width / 2);
            fleeDy = (closestEnemy.y + closestEnemy.height / 2) - (this.y + this.height / 2);
            fleeDist = Math.sqrt(fleeDx * fleeDx + fleeDy * fleeDy);

            if (this.classType === 'healer' && fleeDist < 45) {
                shouldFleeFromEnemy = true;
            }
            if (this.classType === 'warrior' && (this.hp / this.maxHp < 0.20)) {
                shouldFleeFromEnemy = true;
            }
        }

        if (shouldFleeFromEnemy) {
            if (fleeDist > 0.001) {
                const fleeSpeed = this.classType === 'warrior' ? this.speed * 1.4 : this.speed;
                this.vx = -(fleeDx / fleeDist) * fleeSpeed;
                this.vy = -(fleeDy / fleeDist) * fleeSpeed;
                this.pose = 'walk';
                this.direction = fleeDx >= 0 ? -1 : 1;

                if (this.classType === 'warrior') {
                    if (!this.isFleeing) {
                        this.isFleeing = true;
                        if (particleEngine) {
                            particleEngine.spawnFloatingText(
                                this.x + this.width / 2,
                                this.y - 10,
                                "БЕЖИМ!",
                                "#e74c3c",
                                true
                            );
                        }
                    }
                    if (frameCount % 15 === 0 && particleEngine) {
                        particleEngine.spawnSpark(
                            this.x + this.width / 2,
                            this.y,
                            "#3498db",
                            2
                        );
                    }
                }
            } else {
                this.vx = 0;
                this.vy = 0;
                this.pose = 'idle';
            }
            this.currentTarget = null;
        } else {
            if (this.classType === 'warrior') {
                this.isFleeing = false;
            }
            // Обычное поведение поиска цели и движения
            if (this.classType === 'healer') {
                // Проверяем перезарядку воскрешения (раз в 20 секунд = 1200 кадров)
                const canResurrect = (frameCount - this.lastResurrectFrame >= 1200);
                let deadAlly = null;

                if (canResurrect) {
                    // Ищем ближайшего мертвого союзника
                    let minDeadDist = Infinity;
                    players.forEach(p => {
                        if (!p.active && p !== this) {
                            const adx = p.x - this.x;
                            const ady = p.y - this.y;
                            const adist = adx * adx + ady * ady;
                            if (adist < minDeadDist) {
                                minDeadDist = adist;
                                deadAlly = p;
                            }
                        }
                    });
                }

                if (deadAlly) {
                    target = deadAlly;
                } else {
                    // Хилер ищет союзника или самого себя с НАИБОЛЬШЕЙ нехваткой здоровья (в процентах)
                    let lowestHpRatio = 1.0;
                    let targetAlly = null;

                    players.forEach(p => {
                        if (p.active) {
                            const ratio = p.hp / p.maxHp;
                            if (ratio < lowestHpRatio) {
                                lowestHpRatio = ratio;
                                targetAlly = p;
                            }
                        }
                    });

                    // Если союзники ранены, целимся в них. Если нет — ищем ближайшего другого игрока (союзника), чтобы следовать за ним
                    if (targetAlly && lowestHpRatio < 0.95) {
                        target = targetAlly;
                    } else {
                        // Ищем ближайшего другого живого игрока (союзника)
                        let closestAlly = null;
                        let minAllyDist = Infinity;
                        players.forEach(p => {
                            if (p.active && p !== this) {
                                const adx = p.x - this.x;
                                const ady = p.y - this.y;
                                const adist = adx * adx + ady * ady;
                                if (adist < minAllyDist) {
                                    minAllyDist = adist;
                                    closestAlly = p;
                                }
                            }
                        });
                        target = closestAlly;
                    }
                }
            } else {
                // Боевые классы ищут ближайшего врага
                if (this.classType === 'warrior') {
                    // Воин ищет ближайшего врага, которого атакуют меньше 5 других воинов (кроме боссов)
                    let closest = null;
                    let minDist = Infinity;
                    enemies.forEach(e => {
                        if (e.active) {
                            const isBoss = e.isBoss;
                            let canTarget = true;
                            if (!isBoss) {
                                const warriorCount = players.filter(p =>
                                    p !== this &&
                                    p.active &&
                                    p.classType === 'warrior' &&
                                    p.currentTarget === e
                                ).length;
                                if (warriorCount >= 5) {
                                    canTarget = false;
                                }
                            }
                            if (canTarget) {
                                const dx = e.x - this.x;
                                const dy = e.y - this.y;
                                const dist = dx * dx + dy * dy;
                                if (dist < minDist) {
                                    minDist = dist;
                                    closest = e;
                                }
                            }
                        }
                    });
                    target = closest;

                    // Резервный выбор: если все цели заняты воинами, выбираем ближайшего врага, чтобы не стоять без дела
                    if (!target && enemies.some(e => e.active)) {
                        target = this.findClosestEntity(enemies);
                    }
                } else {
                    target = this.findClosestEntity(enemies);
                }
            }

            if (target) {
                this.currentTarget = target;
                const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
                const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);

                this.direction = dx >= 0 ? 1 : -1;

                if (this.classType === 'healer' && target instanceof Player) {
                    const isDead = !target.active;

                    // ИИ Хилера: идет к раненому союзнику (или его могиле), если тот далеко
                    if (dist > this.range * 0.8) {
                        this.vx = (dx / dist) * this.speed;
                        this.vy = (dy / dist) * this.speed;
                        this.pose = 'walk';
                    } else {
                        this.vx = 0;
                        this.vy = 0;
                        this.pose = 'idle';
                    }

                    if (isDead) {
                        // Если союзник мертв и мы подошли вплотную - воскрешаем!
                        if (dist <= this.range * 0.8 && frameCount - this.lastResurrectFrame >= 1200) {
                            this.lastResurrectFrame = frameCount;
                            this.pose = 'attack';
                            this.animTimer = 0;

                            // Воскрешаем с 50% здоровья
                            target.active = true;
                            target.hp = Math.round(target.maxHp * 0.5);
                            this.resurrectCount = (this.resurrectCount || 0) + 1;

                            if (window.game && typeof window.game.addBattleLog === 'function') {
                                window.game.addBattleLog('resurrect', `💚 ${this.username} воскресил ${target.username}`);
                            }

                            if (particleEngine) {
                                particleEngine.spawnSpark(
                                    target.x + target.width / 2,
                                    target.y + target.height / 2,
                                    "#f1c40f", // Золотая искра воскрешения
                                    25
                                );
                                particleEngine.spawnFloatingText(
                                    target.x + target.width / 2,
                                    target.y,
                                    "ВОСКРЕШЕН!",
                                    "#f1c40f",
                                    true
                                );
                            }
                        }
                    } else {
                        // Хилер кастует лечащую сферу, только если цель действительно ранена (HP < 95%)
                        if (target.hp / target.maxHp < 0.95 && frameCount - this.lastAttackFrame >= this.cooldown) {
                            this.lastAttackFrame = frameCount;
                            this.pose = 'attack';
                            this.animTimer = 0; // Сброс таймера анимации для удара

                            const healAmount = (target === this) ? this.damage * 0.5 : this.damage;
                            projectiles.push(new Projectile(
                                this.x + this.width / 2,
                                this.y + this.height / 2,
                                target,
                                this,
                                'healball',
                                healAmount, // В случае хилера — это объем лечения
                                5.0
                            ));
                        }
                    }
                } else {
                    // ИИ бойцов: идет к врагу
                    if ((this.classType === 'archer' || this.classType === 'mage') && dist < 35) {
                        // Лучник и Маг убегают, только если враг подошел вплотную (<35px)
                        this.vx = -(dx / dist) * this.speed;
                        this.vy = -(dy / dist) * this.speed;
                        this.pose = 'walk';
                        this.fledLastFrame = true; // Запоминаем, что убегали
                        // На бегу лучник и маг НЕ стреляют
                    } else {
                        // Если лучник/маг только что убегал и остановился, даем задержку в 1 секунду (60 кадров) на натягивание тетивы/каст
                        if ((this.classType === 'archer' || this.classType === 'mage') && this.fledLastFrame) {
                            this.lastAttackFrame = frameCount - this.cooldown + 60;
                            this.fledLastFrame = false;
                        }

                        if (dist > this.range * 0.9) {
                            this.vx = (dx / dist) * this.speed;
                            this.vy = (dy / dist) * this.speed;
                            this.pose = 'walk';
                        } else {
                            // Враг в радиусе атаки и на безопасном расстоянии
                            this.vx = 0;
                            this.vy = 0;
                            this.pose = 'idle';

                            // Атакуем
                            if (frameCount - this.lastAttackFrame >= this.cooldown) {
                                this.lastAttackFrame = frameCount;
                                this.pose = 'attack';
                                this.animTimer = 0;
                                this.performAttack(target, enemies, projectiles, particleEngine, globalMods);
                            }
                        }
                    }
                }
            } else {
                // Если нет целей, стоим на месте
                this.currentTarget = null;
                this.vx = 0;
                this.vy = 0;
                this.pose = 'idle';
            }
        }

        // Применяем скорость движения и отбрасывание
        this.x += this.vx + this.kbX;
        this.y += this.vy + this.kbY;

        // Затухание отбрасывания
        this.kbX *= 0.82;
        this.kbY *= 0.82;
        if (Math.abs(this.kbX) < 0.1) this.kbX = 0;
        if (Math.abs(this.kbY) < 0.1) this.kbY = 0;

        // Ограничение границами арены
        this.x = Math.max(50, Math.min(CONFIG.ARENA_WIDTH - 50 - this.width, this.x));
        this.y = Math.max(80, Math.min(CONFIG.ARENA_HEIGHT - 60 - this.height, this.y));

        this.updateAnimation();
    }

    // Выполнение атаки (поведение зависит от класса)
    performAttack(target, enemies, projectiles, particleEngine, globalMods) {
        // Урон с учетом реликвии берсерка
        let finalDamage = this.damage;
        if (globalMods && globalMods['mechanics'] && globalMods['mechanics'].berserk) {
            const lostHpPercent = (this.maxHp - this.hp) / this.maxHp;
            finalDamage = Math.round(finalDamage * (1 + lostHpPercent)); // До +100% урона при смерти
        }

        if (this.classType === 'warrior') {
            // Воин машет мечом (АОЕ ближнего боя по конусу/полукругу перед собой)
            const weaponX = this.x + this.width / 2 + this.direction * 15;
            const weaponY = this.y + this.height / 2;

            // Проверяем всех врагов в небольшом радиусе перед воином
            enemies.forEach(e => {
                if (e.active) {
                    const edx = (e.x + e.width / 2) - weaponX;
                    const edy = (e.y + e.height / 2) - weaponY;
                    const edist = Math.sqrt(edx * edx + edy * edy);

                    // Урон по площади (радиус 60 пикселей перед собой)
                    if (edist <= 60 && (this.direction === 1 ? edx >= -10 : edx <= 10)) {
                        const actualDmg = e.takeDamage(finalDamage * (0.8 + Math.random() * 0.4), this.username, particleEngine);
                        this.damageDealt += actualDmg;

                        // Если убили — зачисляем фраг и даем опыт
                        if (!e.active) {
                            this.kills++;
                            this.gainXp(e.xpValue, particleEngine, globalMods);
                        }

                        // Вампиризм (легендарная реликвия)
                        if (globalMods && globalMods['mechanics'] && globalMods['mechanics'].lifesteal) {
                            this.heal(actualDmg * globalMods['mechanics'].lifesteal, particleEngine);
                        }
                    }
                }
            });

            // Искры удара меча
            if (particleEngine) {
                particleEngine.spawnSpark(weaponX, weaponY, "#ecf0f1", 4);
            }

        } else if (this.classType === 'archer') {
            // Лучник выпускает стрелу с 10% шансом крита (критический урон +100%)
            let damage = finalDamage;
            let isCrit = false;
            if (Math.random() < 0.10) {
                isCrit = true;
                damage *= 2.0; // критический урон +100% (то есть удваивается)
            }
            const proj = new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                target,
                this,
                'arrow',
                damage,
                7.5
            );
            proj.isCrit = isCrit;
            projectiles.push(proj);
        } else if (this.classType === 'mage') {
            // Маг пускает огненный шар
            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                target,
                this,
                'fireball',
                finalDamage,
                4.2
            ));
        }
    }

    spawnAuraEffect(particleEngine, color) {
        particleEngine.spawnAuraParticle(this.x + this.width / 2, this.y + this.height / 2, color);
    }

    findClosestEntity(list) {
        let closest = null;
        let minDist = Infinity;
        list.forEach(item => {
            if (item.active) {
                const dx = item.x - this.x;
                const dy = item.y - this.y;
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                    minDist = dist;
                    closest = item;
                }
            }
        });
        return closest;
    }

    draw(ctx, spriteObj) {
        if (!this.active) return;
        super.draw(ctx, spriteObj);

        // Никнейм зрителя над головой
        ctx.fillStyle = this.color;
        ctx.font = 'bold 9px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, this.x + this.width / 2, this.y - 18);

        // Уровень персонажа рядом с полоской здоровья
        ctx.fillStyle = "#f1c40f";
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(`L${this.level}`, this.x + this.width / 2, this.y - 28);

        // Индикатор паники/убегания для воина
        if (this.classType === 'warrior' && this.isFleeing) {
            ctx.fillStyle = "#e74c3c";
            ctx.font = 'bold 7px "Press Start 2P", monospace';
            ctx.fillText("БЕЖИТ!", this.x + this.width / 2, this.y - 38);
        }

        // Отрисовка щита ауры вокруг персонажа (синие вращающиеся пиксели)
        if (this.auras.shield) {
            const time = Date.now() * 0.003;
            const shieldRadius = 18;
            const shieldX = this.x + this.width / 2 + Math.cos(time) * shieldRadius;
            const shieldY = this.y + this.height / 2 + Math.sin(time) * shieldRadius;
            ctx.fillStyle = "#3498db";
            ctx.fillRect(shieldX - 2, shieldY - 2, 4, 4);

            const shieldX2 = this.x + this.width / 2 + Math.cos(time + Math.PI) * shieldRadius;
            const shieldY2 = this.y + this.height / 2 + Math.sin(time + Math.PI) * shieldRadius;
            ctx.fillRect(shieldX2 - 2, shieldY2 - 2, 4, 4);
        }
    }
}

// Класс Врага (монстры)
class Enemy extends Entity {
    constructor(x, y, enemyType, waveNumber, lobbySize = 1) {
        const baseStats = JSON.parse(JSON.stringify(CONFIG.ENEMIES[enemyType]));

        // Масштабируем статы монстров от номера волны
        const waveMultiplier = 1.0 + (waveNumber - 1) * 0.15; // +15% ХП/урона за волну (сложность увеличена)
        // Увеличиваем сложность пропорционально количеству игроков в лобби (только здоровье)
        const playerMultiplier = lobbySize;
        baseStats.maxHp = Math.round(baseStats.maxHp * waveMultiplier * playerMultiplier);
        baseStats.damage = Math.round(baseStats.damage * waveMultiplier);

        super(x, y, 22 * (baseStats.scale || 1), 22 * (baseStats.scale || 1), baseStats);

        this.enemyType = enemyType;
        this.xpValue = baseStats.xpValue;
        this.scoreValue = baseStats.scoreValue;
        this.isBoss = baseStats.isBoss || false;
    }

    // Поиск ближайшего живого игрока
    update(players, frameCount, particleEngine, gameCameraShake, projectiles) {
        if (!this.active) return;

        // Логика разбега и отбрасывания для Быка (bull)
        if (this.enemyType === 'bull') {
            if (this.isCharging) {
                this.vx = this.chargeVx;
                this.vy = this.chargeVy;
                this.pose = 'attack';
                this.chargeTimer--;

                // Проверяем столкновение с игроками во время разбега
                players.forEach(p => {
                    if (p.active) {
                        const dx = (p.x + p.width / 2) - (this.x + this.width / 2);
                        const dy = (p.y + p.height / 2) - (this.y + this.height / 2);
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Если врезались
                        if (dist < (this.width + p.width) / 2 + 5) {
                            // Раскидываем ВСЕХ игроков в радиусе 160 пикселей
                            players.forEach(p2 => {
                                if (p2.active) {
                                    const p2dx = (p2.x + p2.width / 2) - (this.x + this.width / 2);
                                    const p2dy = (p2.y + p2.height / 2) - (this.y + this.height / 2);
                                    const p2dist = Math.sqrt(p2dx * p2dx + p2dy * p2dy) || 1;

                                    if (p2dist < 160) {
                                        const force = 18 * (1 - p2dist / 160);
                                        p2.kbX = (p2dx / p2dist) * force;
                                        p2.kbY = (p2dy / p2dist) * force;

                                        if (particleEngine) {
                                            particleEngine.spawnSpark(p2.x + p2.width / 2, p2.y + p2.height / 2, "#3498db", 3);
                                        }
                                    }
                                }
                            });

                            if (gameCameraShake) gameCameraShake(15);
                            if (particleEngine) {
                                particleEngine.spawnFloatingText(this.x + this.width / 2, this.y - 10, "БАМС!", "#e74c3c", true);
                            }

                            // Конец заряда
                            this.isCharging = false;
                            this.lastAttackFrame = frameCount;
                            this.vx = 0;
                            this.vy = 0;
                        }
                    }
                });

                // Прекращение заряда по истечении времени
                if (this.chargeTimer <= 0) {
                    this.isCharging = false;
                    this.lastAttackFrame = frameCount;
                }

                // Двигаемся и выходим из обычного ИИ
                this.x += this.vx + this.kbX;
                this.y += this.vy + this.kbY;

                this.kbX *= 0.82;
                this.kbY *= 0.82;
                if (Math.abs(this.kbX) < 0.1) this.kbX = 0;
                if (Math.abs(this.kbY) < 0.1) this.kbY = 0;

                this.x = Math.max(30, Math.min(CONFIG.ARENA_WIDTH - 30 - this.width, this.x));
                this.y = Math.max(60, Math.min(CONFIG.ARENA_HEIGHT - 40 - this.height, this.y));

                this.updateAnimation();
                return;
            }
        }

        let target = null;
        let minDist = Infinity;

        players.forEach(p => {
            if (p.active) {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                    minDist = dist;
                    target = p;
                }
            }
        });

        if (target) {
            const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
            const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            this.direction = dx >= 0 ? 1 : -1;

            // Если это Бык и кулдаун разбега готов — активируем разбег!
            if (this.enemyType === 'bull' && frameCount - this.lastAttackFrame >= this.cooldown) {
                this.isCharging = true;
                this.chargeTimer = 45;
                this.chargeVx = (dx / dist) * this.speed * 4.5;
                this.chargeVy = (dy / dist) * this.speed * 4.5;
                if (particleEngine) {
                    particleEngine.spawnFloatingText(this.x + this.width / 2, this.y, "РАЗБЕГ!", "#e67e22", true);
                }
                return;
            }

            if (dist > this.range * 0.9) {
                // Бежим к цели
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
                this.pose = 'walk';
            } else {
                // Атакуем вплотную или с дистанции
                this.vx = 0;
                this.vy = 0;
                this.pose = 'idle';

                if (frameCount - this.lastAttackFrame >= this.cooldown) {
                    this.lastAttackFrame = frameCount;
                    this.pose = 'attack';
                    this.animTimer = 0;

                    if (this.enemyType === 'goblin_stone' && projectiles) {
                        // Метаем камень
                        projectiles.push(new Projectile(
                            this.x + this.width / 2,
                            this.y + this.height / 2,
                            target,
                            this,
                            'stone',
                            this.damage * (0.8 + Math.random() * 0.4),
                            4.5,
                            true // isEnemy = true
                        ));
                    } else {
                        // Наносим урон в ближнем бою
                        const actualDmg = target.takeDamage(this.damage * (0.8 + Math.random() * 0.4), this.name, particleEngine);

                        // Эффект шипов (легендарная реликвия игроков)
                        if (actualDmg > 0 && target.active && target.auras.legendary) {
                            // Ищем модификатор шипов
                            // Передадим проверку реликвий через игровой цикл, либо прочитаем из флагов ауры
                            // Мы реализуем возврат урона напрямую в game.js для чистоты, либо прямо здесь, если знаем про реликвию
                        }
                    }
                }
            }
        } else {
            this.vx = 0;
            this.vy = 0;
            this.pose = 'idle';
        }

        // Применяем скорость движения и отбрасывание
        this.x += this.vx + this.kbX;
        this.y += this.vy + this.kbY;

        // Затухание отбрасывания
        this.kbX *= 0.82;
        this.kbY *= 0.82;
        if (Math.abs(this.kbX) < 0.1) this.kbX = 0;
        if (Math.abs(this.kbY) < 0.1) this.kbY = 0;

        // Не даем врагам выходить за пределы арены
        this.x = Math.max(30, Math.min(CONFIG.ARENA_WIDTH - 30 - this.width, this.x));
        this.y = Math.max(60, Math.min(CONFIG.ARENA_HEIGHT - 40 - this.height, this.y));

        this.updateAnimation();
    }
}

// Класс Рейд-Босса (наследник врага)
class Boss extends Enemy {
    constructor(x, y, waveNumber, alivePlayerCount) {
        super(x, y, 'boss', waveNumber, alivePlayerCount);

        // Масштабируем здоровье босса от количества игроков, чтобы рейд имел смысл!
        const playerScale = 1.0 + (alivePlayerCount - 1) * 0.45; // +45% здоровья босса за каждого игрока
        this.maxHp = Math.round(this.maxHp * playerScale);
        this.hp = this.maxHp;

        this.lastStompFrame = 0;
        this.stompCooldown = 360; // Каждые 6 секунд делает мощный топот
    }

    update(players, frameCount, particleEngine, gameCameraShake, projectiles) {
        if (!this.active) return;

        super.update(players, frameCount, particleEngine, gameCameraShake, projectiles);

        // Особое умение: Землетрясение / Топот Босса (Boss Stomp)
        if (frameCount - this.lastStompFrame >= this.stompCooldown) {
            this.lastStompFrame = frameCount;

            // Тряска камеры
            if (gameCameraShake) gameCameraShake(20);

            // Визуальный круг взрыва топота
            if (particleEngine) {
                particleEngine.spawnSpark(this.x + this.width / 2, this.y + this.height / 2, "#d35400", 30);
                particleEngine.spawnFloatingText(this.x + this.width / 2, this.y, "ЗЕМЛЕТРЯСЕНИЕ!", "#e74c3c", true);
            }

            // Наносим урон ВСЕМ игрокам в радиусе 160 пикселей
            players.forEach(p => {
                if (p.active) {
                    const dx = (p.x + p.width / 2) - (this.x + this.width / 2);
                    const dy = (p.y + p.height / 2) - (this.y + this.height / 2);
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= 160) {
                        // Топот наносит 60% от базового урона босса, игнорируя половину брони
                        p.takeDamage(this.damage * 0.6, this.name, particleEngine);
                    }
                }
            });
        }
    }
}

// Класс Снаряда (Стрелы, Огненные шары, Лечащие сферы)
class Projectile {
    constructor(startX, startY, target, owner, type, damage, speed, isEnemy = false) {
        this.x = startX;
        this.y = startY;
        this.target = target;
        this.owner = owner; // Кто выпустил
        this.type = type; // 'arrow', 'fireball', 'healball', 'stone'
        this.damage = damage;
        this.speed = speed;
        this.isEnemy = isEnemy; // Флаг: вражеский ли снаряд

        this.width = type === 'arrow' ? 12 : (type === 'stone' ? 10 : 8);
        this.height = type === 'arrow' ? 6 : (type === 'stone' ? 10 : 8);
        this.active = true;

        // Рассчитываем вектор полета
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.001) {
            this.vx = (dx / dist) * this.speed;
            this.vy = (dy / dist) * this.speed;
            this.lastAngle = Math.atan2(dy, dx);
        } else {
            this.vx = 0;
            this.vy = 0;
            this.lastAngle = 0;
        }
    }

    update(enemies, players, particleEngine, globalMods, shakeScreen, firePuddles) {
        if (!this.active) return;

        // Если снаряд летит в цель, корректируем направление (самонаводка)
        if (this.target && this.target.active) {
            const tx = this.target.x + this.target.width / 2;
            const ty = this.target.y + this.target.height / 2;
            const dx = tx - this.x;
            const dy = ty - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
                this.lastAngle = Math.atan2(dy, dx);
            } else {
                this.vx = 0;
                this.vy = 0;
            }
        } else {
            // Цель мертва, летит прямо по последней траектории
            this.vx = Math.cos(this.lastAngle) * this.speed;
            this.vy = Math.sin(this.lastAngle) * this.speed;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Спавним следы магии/пыли
        if (particleEngine && Math.random() < 0.3) {
            const traceColor = this.type === 'fireball' ? "#f39c12" : (this.type === 'healball' ? "#2ecc71" : "#bdc3c7");
            particleEngine.spawnSpark(this.x, this.y, traceColor, 1);
        }

        // Проверка коллизий
        if (this.type === 'healball') {
            // Сфера лечения ищет коллизию с союзным игроком
            players.forEach(p => {
                if (p.active && p === this.target && this.checkCollision(p)) {
                    this.active = false;
                    const healedAmt = p.heal(this.damage, particleEngine);
                    if (this.owner) {
                        this.owner.healingDone += healedAmt;
                        // Даем опыт целителю, если он лечил союзника (а не себя)
                        if (p !== this.owner && healedAmt > 0) {
                            const xpGained = Math.round(healedAmt * 0.5);
                            if (xpGained > 0) {
                                this.owner.gainXp(xpGained, particleEngine, globalMods);
                            }
                        }
                    }
                }
            });
        } else if (this.isEnemy) {
            // Вражеский снаряд ищет коллизии с игроками
            players.forEach(p => {
                if (p.active && this.checkCollision(p)) {
                    this.active = false;
                    p.takeDamage(this.damage, this.owner ? this.owner.name : "Вражеский снаряд", particleEngine);
                }
            });
        } else {
            // Боевой снаряд ищет коллизии с врагами
            enemies.forEach(e => {
                if (e.active && this.checkCollision(e)) {
                    this.hitEnemy(e, enemies, particleEngine, globalMods, shakeScreen, firePuddles);
                }
            });
        }

        // Удаление за границами
        if (this.x < -100 || this.x > CONFIG.ARENA_WIDTH + 100 || this.y < -100 || this.y > CONFIG.ARENA_HEIGHT + 100) {
            this.active = false;
        }
    }

    hitEnemy(enemy, enemies, particleEngine, globalMods, shakeScreen, firePuddles) {
        if (this.bounces === undefined) {
            this.bounces = 0;
            if (this.type === 'arrow' && globalMods && globalMods['mechanics'] && globalMods['mechanics'].arrowBounces) {
                this.bounces = globalMods['mechanics'].arrowBounces;
            }
        }

        if (this.type === 'fireball') {
            this.active = false;
            // Взрыв мага
            if (particleEngine) {
                particleEngine.spawnSpark(this.x, this.y, "#e67e22", 15);
                particleEngine.spawnSpark(this.x, this.y, "#f1c40f", 8);
            }

            // Спавним огненную лужу на земле
            if (firePuddles && this.owner) {
                const radius = 50 * (this.owner.puddleRadiusMul || 1.0);
                const duration = 120 + (this.owner.puddleDurationAdd || 0);
                const tickDamage = this.damage * 0.35; // Периодический урон за тик

                firePuddles.push(new FirePuddle(
                    this.x,
                    this.y,
                    radius,
                    duration,
                    tickDamage,
                    this.owner
                ));
            }
        } else {
            // Обычная стрела лучника (или камень гоблина)
            const isCrit = this.isCrit || false;
            const actualDmg = enemy.takeDamage(this.damage * (0.9 + Math.random() * 0.2), this.owner?.username || "Лучник", particleEngine, isCrit);

            if (this.owner) {
                this.owner.damageDealt += actualDmg;
                if (!enemy.active) {
                    this.owner.kills++;
                    this.owner.gainXp(enemy.xpValue, particleEngine, globalMods);
                }
            }

            // Вампиризм лучника
            if (this.owner && globalMods && globalMods['mechanics'] && globalMods['mechanics'].lifesteal) {
                this.owner.heal(actualDmg * globalMods['mechanics'].lifesteal, particleEngine);
            }

            // Логика рикошета стрел лучника
            if (this.type === 'arrow' && this.bounces > 0) {
                this.bounces--;
                // Ищем следующего ближайшего живого врага для отскока
                let nextTarget = null;
                let minAllyDist = Infinity;
                enemies.forEach(e => {
                    if (e.active && e !== enemy) {
                        const edx = e.x - this.x;
                        const edy = e.y - this.y;
                        const edist = edx * edx + edy * edy;
                        if (edist < minAllyDist && edist < 200 * 200) { // Ищем в радиусе 200px
                            minAllyDist = edist;
                            nextTarget = e;
                        }
                    }
                });

                if (nextTarget) {
                    this.target = nextTarget;
                    const tx = nextTarget.x + nextTarget.width / 2;
                    const ty = nextTarget.y + nextTarget.height / 2;
                    const dx = tx - this.x;
                    const dy = ty - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0.001) {
                        this.vx = (dx / dist) * this.speed;
                        this.vy = (dy / dist) * this.speed;
                        this.lastAngle = Math.atan2(dy, dx);
                    }
                    if (particleEngine) {
                        particleEngine.spawnSpark(this.x, this.y, "#2ecc71", 5);
                    }
                } else {
                    this.active = false;
                }
            } else {
                this.active = false;
            }
        }
    }

    checkCollision(rect) {
        return this.x < rect.x + rect.width &&
            this.x + this.width > rect.x &&
            this.y < rect.y + rect.height &&
            this.y + this.height > rect.y;
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.vx >= 0 ? this.lastAngle : this.lastAngle + Math.PI); // Для стрел разворачиваем спрайт

        const sprite = Sprites.projectiles[this.type];
        if (sprite) {
            ctx.drawImage(sprite, -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            // Резервный отрисовщик
            ctx.fillStyle = this.type === 'healball' ? "#2ecc71" : "#f1c40f";
            ctx.fillRect(-4, -4, 8, 8);
        }
        ctx.restore();
    }
}

// Зелье здоровья, выпадающее на арене
class HealthPotion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 14;
        this.height = 14;
        this.value = CONFIG.HEAL_POTION_VALUE;
        this.active = true;

        this.magnetTarget = null; // Игрок, который притягивает зелье
        this.bobY = 0;
        this.bobTimer = Math.random() * 100;
    }

    update(players, particleEngine) {
        if (!this.active) return;

        // Эффект покачивания на траве
        this.bobTimer += 0.05;
        this.bobY = Math.sin(this.bobTimer) * 2;

        if (this.magnetTarget) {
            // Если зелье примагничено, летит к игроку
            if (!this.magnetTarget.active) {
                this.magnetTarget = null; // Игрок погиб, сбрасываем
                return;
            }

            const dx = (this.magnetTarget.x + this.magnetTarget.width / 2) - this.x;
            const dy = (this.magnetTarget.y + this.magnetTarget.height / 2) - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 8) {
                // Выпиваем
                this.active = false;
                this.magnetTarget.heal(this.value, particleEngine);
            } else {
                // Приближаемся
                this.x += (dx / dist) * CONFIG.HEAL_POTION_SPEED;
                this.y += (dy / dist) * CONFIG.HEAL_POTION_SPEED;
            }
        } else {
            // Ищем ближайшего живого игрока в радиусе притяжения
            let closestPlayer = null;
            let minDist = CONFIG.HEAL_POTION_MAGNET_RANGE;

            players.forEach(p => {
                if (p.active) {
                    const dx = p.x + p.width / 2 - this.x;
                    const dy = p.y + p.height / 2 - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < minDist) {
                        minDist = dist;
                        closestPlayer = p;
                    }
                }
            });

            if (closestPlayer) {
                this.magnetTarget = closestPlayer;
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;

        // Рисуем тень под зельем
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.fillRect(this.x + 2, this.y + 11, 10, 2);

        const sprite = Sprites.items['potion'];
        if (sprite) {
            ctx.drawImage(sprite, this.x, this.y + this.bobY, this.width, this.height);
        } else {
            ctx.fillStyle = "#e74c3c";
            ctx.fillRect(this.x, this.y + this.bobY, this.width, this.height);
        }
    }
}

// Класс Огненной Лужи Мага
class FirePuddle {
    constructor(x, y, radius, duration, damagePerTick, owner) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = duration;
        this.maxDuration = duration;
        this.damage = damagePerTick;
        this.owner = owner;

        this.active = true;
        this.tickInterval = 15; // Урон каждые 15 кадров (~4 раза в секунду)
        this.lastTickFrame = 0;

        this.sparkTimer = 0;
    }

    update(enemies, frameCount, particleEngine, globalMods) {
        if (!this.active) return;

        this.duration--;

        // Каждые 15 кадров наносим урон врагам в области
        if (frameCount % this.tickInterval === 0) {
            enemies.forEach(e => {
                if (e.active) {
                    const dx = (e.x + e.width / 2) - this.x;
                    const dy = ((e.y + e.height / 2) - this.y) / 0.6; // Масштабируем вертикальную ось под эллипс
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Если враг в луже — наносим урон
                    if (dist <= this.radius) {
                        const actualDmg = e.takeDamage(this.damage * (0.8 + Math.random() * 0.4), this.owner?.username || "Маг", particleEngine);

                        if (this.owner) {
                            this.owner.damageDealt += actualDmg;
                            if (!e.active) {
                                this.owner.kills++;
                                this.owner.gainXp(e.xpValue, particleEngine, globalMods);
                            }
                        }

                        // Вампиризм в луже
                        if (this.owner && globalMods && globalMods['mechanics'] && globalMods['mechanics'].lifesteal) {
                            this.owner.heal(actualDmg * globalMods['mechanics'].lifesteal, particleEngine);
                        }
                    }
                }
            });
        }

        // Спавним огоньки в луже
        this.sparkTimer++;
        if (this.sparkTimer >= 4 && particleEngine) {
            this.sparkTimer = 0;
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * this.radius;
            const sparkX = this.x + Math.cos(angle) * r;
            const sparkY = this.y + Math.sin(angle) * r * 0.6; // Масштабируем вертикальную ось искр под эллипс
            particleEngine.spawnSpark(sparkX, sparkY, Math.random() < 0.5 ? "#e67e22" : "#f1c40f", 1);
        }

        if (this.duration <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        ctx.fillStyle = "rgba(230, 126, 34, 0.22)"; // Полупрозрачный оранжевый
        ctx.strokeStyle = "rgba(192, 57, 43, 0.5)"; // Красная кайма
        ctx.lineWidth = 2;

        // Плавное растворение в конце жизни лужи
        if (this.duration < 30) {
            ctx.globalAlpha = this.duration / 30;
        }

        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

// Экспортируем классы
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Entity, Player, Enemy, Boss, Projectile, HealthPotion, FirePuddle };
} else {
    window.Entity = Entity;
    window.Player = Player;
    window.Enemy = Enemy;
    window.Boss = Boss;
    window.Projectile = Projectile;
    window.HealthPotion = HealthPotion;
    window.FirePuddle = FirePuddle;
}
