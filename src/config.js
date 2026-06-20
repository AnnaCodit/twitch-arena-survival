/**
 * Конфигурация игры "Twitch Pixel Arena"
 * Содержит все настройки баланса, характеристик, волн и реликвий.
 */

const CONFIG = {
    // Размеры игрового поля (виртуальное разрешение)
    // Рендеринг будет масштабироваться под размер окна браузера
    ARENA_WIDTH: 1200,
    ARENA_HEIGHT: 800,

    // Частота кадров (целевая)
    FPS: 60,

    MAGE_FIRE_IMPACT_MUL: 0.45,
    MAGE_FROST_IMPACT_MUL: 0.35,
    MAGE_FROST_FREEZE_FRAMES: 75,
    MAGE_FROST_SPEED_MUL: 0.45,

    // Настройки баланса игроков по классам
    CLASSES: {
        warrior: {
            name: "Воин",
            maxHp: 120,
            speed: 1.8,
            damage: 12,
            range: 45,        // Ме melee-атака
            cooldown: 50,     // Кадры между атаками (~0.8 сек при 60 FPS)
            defense: 7,       // Снижение получаемого урона
            color: "#e74c3c", // Красный (акцент для воина)
            bulletType: null, // Атака в ближнем бою
            maxWarriorsPerTarget: 3, // Максимальное число воинов на одну цель
            growth: { maxHp: 15, damage: 1.5, defense: 1 } // Бонусы за каждый уровень
        },
        archer: {
            name: "Лучник",
            maxHp: 75,
            speed: 2.3,
            damage: 8.4,      // 70% от базового урона воина (12 * 0.7)
            range: 250,       // Дальний бой
            cooldown: 40,     // ~0.65 сек
            defense: 1,
            color: "#2ecc71", // Зеленый
            bulletType: "arrow",
            growth: { maxHp: 6, damage: 1.0, speed: 0.05 }
        },
        mage: {
            name: "Маг",
            maxHp: 70,
            shield: 18,
            speed: 1.6,
            damage: 20,
            range: 220,       // Дальний бой (АОЕ)
            cooldown: 90,     // ~1.5 сек
            defense: 0,
            color: "#9b59b6", // Фиолетовый
            bulletType: "fireball",
            growth: { maxHp: 5, shield: 2, damage: 2.5, range: 5 }
        },
        healer: {
            name: "Целитель",
            maxHp: 85,
            speed: 2.0,
            damage: 7,        // Лечение (отрицательный урон или специальная обработка)
            range: 100,
            cooldown: 60,     // ~1.0 сек
            defense: 2,
            color: "#f1c40f", // Желтый/Золотой
            bulletType: "healball",
            growth: { maxHp: 8, damage: 1.5, speed: 0.02 } // damage для хилера означает силу исцеления
        }
    },

    // Настройки врагов
    ENEMIES: {
        slime: {
            name: "Слизень",
            maxHp: 14,
            speed: 1.0,
            damage: 7,
            range: 25,
            cooldown: 60,
            color: "#2ecc71",
            bloodColor: "#8a0303", // Темно-красная кровь
            xpValue: 10,
            scoreValue: 10,
            scale: 0.8
        },
        goblin: {
            name: "Гоблин",
            maxHp: 21,
            speed: 2.0,
            damage: 10,
            range: 25,
            cooldown: 45,
            color: "#1abc9c",
            bloodColor: "#8a0303", // Темно-красная кровь
            xpValue: 15,
            scoreValue: 20,
            scale: 0.9
        },
        goblin_stone: {
            name: "Гоблин-метатель",
            maxHp: 17,
            speed: 1.5,
            damage: 8,
            range: 200,
            cooldown: 80,
            color: "#16a085",
            bloodColor: "#8a0303",
            xpValue: 20,
            scoreValue: 30,
            scale: 0.9,
            bulletType: "stone"
        },
        skeleton: {
            name: "Скелет",
            maxHp: 31,
            speed: 1.2,
            damage: 15,
            range: 30,
            cooldown: 70,
            color: "#ecf0f1",
            bloodColor: "#8a0303", // Темно-красная кровь
            xpValue: 25,
            scoreValue: 40,
            scale: 1.0
        },
        orc: {
            name: "Орк",
            maxHp: 77,
            speed: 0.8,
            damage: 24,
            range: 35,
            cooldown: 100,
            color: "#27ae60",
            bloodColor: "#7a0202", // Густая темно-красная кровь
            xpValue: 60,
            scoreValue: 100,
            scale: 1.3
        },
        boss: {
            name: "Рейд-Босс",
            maxHp: 1050, // Динамически масштабируется от количества игроков
            speed: 1.1,
            damage: 42,
            range: 60,
            cooldown: 120,
            color: "#e74c3c",
            bloodColor: "#630101", // Очень темная кровь босса
            xpValue: 500,
            scoreValue: 1000,
            scale: 2.2,
            isBoss: true
        },
        bull: {
            name: "Бычара",
            maxHp: 80,
            speed: 1.0,
            damage: 0, // Урона нет
            range: 40,
            cooldown: 180, // Разбег раз в 3 секунды
            color: "#e67e22",
            bloodColor: "#8a0303",
            xpValue: 30,
            scoreValue: 50,
            scale: 1.4
        }
    },

    // Опыт необходимый для уровня: base + level * factor
    XP_BASE: 50,
    XP_FACTOR: 35,

    // Шанс выпадения зелья здоровья при смерти врага (0.0 - 1.0)
    HEAL_POTION_DROP_CHANCE: 0.30,
    HEAL_POTION_VALUE: 35, // Сколько HP восстанавливает зелье
    HEAL_POTION_MAGNET_RANGE: 180, // Радиус притяжения зелья к игроку
    HEAL_POTION_SPEED: 5.0, // Скорость притягивания
    HEAL_POTION_PITY_KILLS: 8, // После N убийств без зелья следующий дроп гарантирован

    // Настройки волн
    WAVES: {
        spawnDelay: 55, // Задержка между спавном монстров (в кадрах)
        bossInterval: 10, // Каждую N волну спавнится Босс
        baseCount: 3, // Базовое количество врагов на 1 волне
        countPerWave: 2 // Сколько врагов добавляется с каждой новой волной
    },

    ENEMY_WAVE_DAMAGE_SCALE: 0.10,
    ENEMY_WAVE_HP_SCALE: 0.12,
    EARLY_WAVE_DAMAGE_MUL: 0.75, // Смягчение урона на волнах 1-3

    ADAPTIVE_DIFFICULTY: {
        // Сглаживает рост от размера команды: 4 игрока дают ~3.4x вместо жестких 4x.
        PLAYER_COUNT_EXPONENT: 0.88,
        BOSS_PLAYER_HP_SCALE: 0.18,
        BOSS_HP_MUL: 0.85,
        BOSS_WAVE_COUNT_MUL: 0.65,
        CLASS_WEIGHTS: {
            warrior: { frontline: 1.20, sustain: 0.15, rangedDps: 0.55, aoeDps: 0.00, squishiness: 0.15 },
            archer: { frontline: 0.05, sustain: 0.00, rangedDps: 1.00, aoeDps: 0.00, squishiness: 0.75 },
            mage: { frontline: 0.00, sustain: 0.00, rangedDps: 0.75, aoeDps: 1.10, squishiness: 0.95 },
            healer: { frontline: 0.15, sustain: 1.15, rangedDps: 0.20, aoeDps: 0.00, squishiness: 0.55 }
        },
        MIN_COUNT_MUL: 0.72,
        MAX_COUNT_MUL: 1.18,
        MIN_HP_MUL: 0.72,
        MAX_HP_MUL: 1.18,
        MIN_DAMAGE_MUL: 0.70,
        MAX_DAMAGE_MUL: 1.12,
        MIN_SPAWN_DELAY_MUL: 0.82,
        MAX_SPAWN_DELAY_MUL: 1.35,
        MIN_POTION_DROP_MUL: 0.90,
        MAX_POTION_DROP_MUL: 1.75,
        DIRECTOR_CHECK_FRAMES: 180,
        STRUGGLE_HP_RATIO: 0.38,
        STEAMROLL_HP_RATIO: 0.82
    },

    CHAT_EVENTS: {
        CHARGE_MAX: 100,
        CHARGE_PER_MESSAGE: 4,
        EFFECT_COOLDOWN_FRAMES: 1500,
        USER_COOLDOWN_FRAMES: 300,
        MAX_PROCESSED_PER_TICK: 12,
        MAX_PENDING_INTENTS: 160,
        EFFECTS: {
            heal: {
                label: 'HEAL',
                healRatio: 0.18,
                minHeal: 12
            },
            bomb: {
                label: 'BOMB',
                damage: 70,
                bossDamageMul: 0.18,
                maxTargets: 8
            }
        }
    },

    LAST_STAND_REVIVES_PER_WAVE: 1,
    LAST_STAND_HP_RATIO: 0.35,
    LAST_STAND_PROTECTION_FRAMES: 180,
    LAST_STAND_DAMAGE_TAKEN_MUL: 0.20,

    // Настройки реликвий и вероятностей их редкости
    RARITIES: {
        common: { name: "Обычная", color: "#95a5a6", weight: 60 },
        rare: { name: "Редкая", color: "#3498db", weight: 25 },
        epic: { name: "Эпическая", color: "#9b59b6", weight: 12 },
        legendary: { name: "Легендарная", color: "#f1c40f", weight: 3 }
    },

    // Список реликвий
    RELICS: [
        // Воины
        {
            id: "warrior_hp",
            name: "Стальное Сердце",
            desc: "Воины получают +25% к макс. здоровью",
            rarity: "common",
            effect: { type: "class_buff", class: "warrior", stat: "maxHp", mul: 1.25 }
        },
        {
            id: "warrior_dmg",
            name: "Тяжелое Лезвие",
            desc: "Воины наносят +20% урона",
            rarity: "common",
            effect: { type: "class_buff", class: "warrior", stat: "damage", mul: 1.20 }
        },
        {
            id: "warrior_armor",
            name: "Эгида Империи",
            desc: "Защита воинов увеличивается на +4",
            rarity: "rare",
            effect: { type: "class_buff", class: "warrior", stat: "defense", add: 4 }
        },

        // Лучники
        {
            id: "archer_dmg",
            name: "Бронебойные Стрелы",
            desc: "Лучники наносят +25% урона",
            rarity: "common",
            effect: { type: "class_buff", class: "archer", stat: "damage", mul: 1.25 }
        },
        {
            id: "archer_speed",
            name: "Быстрая Тетива",
            desc: "Скорость атаки лучников увеличивается на 20%",
            rarity: "rare",
            effect: { type: "class_buff", class: "archer", stat: "cooldown", mul: 0.80 }
        },
        {
            id: "archer_range",
            name: "Орлиный Глаз",
            desc: "Дальность стрельбы лучников увеличивается на +50",
            rarity: "common",
            effect: { type: "class_buff", class: "archer", stat: "range", add: 50 }
        },
        {
            id: "archer_bounce",
            name: "Рикошетные Стрелы",
            desc: "Стрелы лучников отскакивают от врагов на +1 раз",
            rarity: "rare",
            effect: { type: "global_mechanic", mechanic: "arrowBounces", value: 1 }
        },

        // Маги
        {
            id: "mage_dmg",
            name: "Руна Разрушения",
            desc: "+30% к урону огненных луж магов",
            rarity: "common",
            effect: { type: "class_buff", class: "mage", stat: "damage", mul: 1.30 }
        },
        {
            id: "mage_radius",
            name: "Сфера Расширения",
            desc: "+25% к радиусу огненных луж магов",
            rarity: "rare",
            effect: { type: "class_buff", class: "mage", stat: "puddleRadius", mul: 1.25 }
        },
        {
            id: "mage_duration",
            name: "Пламя Бездны",
            desc: "+1 сек к длительности горения луж магов",
            rarity: "common",
            effect: { type: "class_buff", class: "mage", stat: "puddleDuration", add: 60 }
        },

        // Целители
        {
            id: "healer_heal",
            name: "Свет Милосердия",
            desc: "Эффективность лечения увеличивается на +30%",
            rarity: "common",
            effect: { type: "class_buff", class: "healer", stat: "damage", mul: 1.30 }
        },
        {
            id: "healer_hp",
            name: "Благословение Жизни",
            desc: "Целители получают +25% к макс. здоровью",
            rarity: "common",
            effect: { type: "class_buff", class: "healer", stat: "maxHp", mul: 1.25 }
        },
        {
            id: "healer_speed",
            name: "Божественный Ритм",
            desc: "Целители лечат на 20% чаще",
            rarity: "rare",
            effect: { type: "class_buff", class: "healer", stat: "cooldown", mul: 0.80 }
        },

        // Общие баффы игроков
        {
            id: "all_hp",
            name: "Эликсир Здоровья",
            desc: "Все игроки получают +15% к макс. здоровью",
            rarity: "rare",
            effect: { type: "all_players_buff", stat: "maxHp", mul: 1.15 }
        },
        {
            id: "all_dmg",
            name: "Аура Ярости",
            desc: "Все игроки наносят +15% урона",
            rarity: "rare",
            effect: { type: "all_players_buff", stat: "damage", mul: 1.15 }
        },
        {
            id: "all_speed",
            name: "Ветер Перемен",
            desc: "Все игроки передвигаются на 15% быстрее",
            rarity: "epic",
            effect: { type: "all_players_buff", stat: "speed", mul: 1.15 }
        },

        // Дебаффы монстров / Рискованные реликвии
        {
            id: "enemy_slow",
            name: "Тяжелая Грязь",
            desc: "Монстры передвигаются на 20% медленнее",
            rarity: "rare",
            effect: { type: "enemy_debuff", stat: "speed", mul: 0.80 }
        },
        {
            id: "enemy_weak",
            name: "Болезнь Монстров",
            desc: "Урон монстров снижен на 15%",
            rarity: "rare",
            effect: { type: "enemy_debuff", stat: "damage", mul: 0.85 }
        },
        {
            id: "high_risk_gold",
            name: "Золотое Проклятие",
            desc: "Монстры наносят +25% урона, но игроки получают +50% опыта",
            rarity: "epic",
            effect: { type: "risk_buff", enemyDmgMul: 1.25, playerXpMul: 1.50 }
        },

        // Легендарные артефакты (очень редкие, меняют игру)
        {
            id: "legendary_vampirism",
            name: "Клык Вампира",
            desc: "Все атаки игроков восстанавливают 10% здоровья (Вампиризм)",
            rarity: "legendary",
            effect: { type: "global_mechanic", mechanic: "lifesteal", value: 0.10 }
        },
        {
            id: "legendary_thorns",
            name: "Шипастый Доспех",
            desc: "Игроки возвращают 30% полученного урона обратно монстрам",
            rarity: "legendary",
            effect: { type: "global_mechanic", mechanic: "thorns", value: 0.30 }
        },
        {
            id: "legendary_berserk",
            name: "Кровь Берсерка",
            desc: "Чем меньше здоровья у игрока, тем выше его урон (до +100% при 10% HP)",
            rarity: "legendary",
            effect: { type: "global_mechanic", mechanic: "berserk", value: true }
        }
    ]
};

// Экспортируем конфигурацию, если мы в Node (для тестирования), или просто вешаем на window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
