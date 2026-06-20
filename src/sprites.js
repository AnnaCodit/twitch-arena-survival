/**
 * Процедурный генератор пиксель-арта "Twitch Pixel Arena"
 * Генерирует оффскрин-холсты (offscreen canvas) для всех сущностей
 * и кэширует их для быстрой отрисовки без размытия.
 */

const Sprites = {
    // Хранилища для холстов спрайтов
    players: {},
    enemies: {},
    projectiles: {},
    items: {},
    decorations: {},

    // Инициализация и генерация всех спрайтов
    init() {
        const classes = ['warrior', 'archer', 'mage', 'healer'];
        classes.forEach(cls => {
            this.players[cls] = {
                idle: this.createCharacter('player', cls, 'idle', 0),
                walk0: this.createCharacter('player', cls, 'walk', 0),
                walk1: this.createCharacter('player', cls, 'walk', 1),
                attack0: this.createCharacter('player', cls, 'attack', 0),
                attack1: this.createCharacter('player', cls, 'attack', 1)
            };
        });

        const enemyTypes = ['slime', 'goblin', 'goblin_stone', 'skeleton', 'orc', 'boss', 'bull'];
        enemyTypes.forEach(type => {
            this.enemies[type] = {
                idle: this.createCharacter('enemy', type, 'idle', 0),
                walk0: this.createCharacter('enemy', type, 'walk', 0),
                walk1: this.createCharacter('enemy', type, 'walk', 1),
                attack0: this.createCharacter('enemy', type, 'attack', 0),
                attack1: this.createCharacter('enemy', type, 'attack', 1)
            };
        });

        // Снаряды
        this.projectiles['arrow'] = this.createArrow();
        this.projectiles['fireball'] = this.createMagicOrb("#e74c3c", "#f39c12");
        this.projectiles['frostball'] = this.createMagicOrb("#5dade2", "#ecf9ff");
        this.projectiles['healball'] = this.createMagicOrb("#2ecc71", "#ecf0f1");
        this.projectiles['stone'] = this.createStone();

        // Предметы и лут
        this.items['potion'] = this.createPotion();
        this.items['tombstone'] = this.createTombstone();

        // Декорации
        this.decorations['tree'] = this.createTree();
        this.decorations['bush'] = this.createBush();
        this.decorations['rock'] = this.createRock();
    },

    // Вспомогательный метод создания пустого пикселизированного холста
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Отключаем сглаживание для четкого пиксель-арта
        ctx.imageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.msImageSmoothingEnabled = false;
        return { canvas, ctx };
    },

    // Генератор персонажей (Игроки и Враги)
    createCharacter(group, subType, pose, frame) {
        // Базовый размер 32x32
        const { canvas, ctx } = this.createCanvas(32, 32);

        // Цвета
        const skinColor = "#fcd5b5";
        const eyeColor = "#2c3e50";
        let pantsColor = "#34495e";
        let bodyColor = "#7f8c8d";
        let headColor = "#95a5a6";
        let weaponColor = "#bdc3c7";
        let detailColor = "#c0392b";

        if (group === 'player') {
            switch(subType) {
                case 'warrior':
                    bodyColor = "#7f8c8d"; // Стальные латы
                    headColor = "#95a5a6"; // Железный шлем
                    detailColor = "#e74c3c"; // Красный плюмаж
                    pantsColor = "#2c3e50";
                    break;
                case 'archer':
                    bodyColor = "#27ae60"; // Зеленая куртка
                    headColor = "#2ecc71"; // Зеленый капюшон
                    detailColor = "#d35400"; // Рыжие волосы/детали
                    pantsColor = "#7f8c8d";
                    weaponColor = "#8e44ad"; // Фиолетовый лук
                    break;
                case 'mage':
                    bodyColor = "#2c3e50"; // Темно-синяя мантия
                    headColor = "#9b59b6"; // Фиолетовая шляпа
                    detailColor = "#f1c40f"; // Золотая пряжка
                    pantsColor = "#34495e";
                    weaponColor = "#f1c40f"; // Золотой посох
                    break;
                case 'healer':
                    bodyColor = "#ecf0f1"; // Белая мантия
                    headColor = "#f1c40f"; // Золотой нимб / волосы
                    detailColor = "#2ecc71"; // Зеленый крест
                    pantsColor = "#7f8c8d";
                    weaponColor = "#f1c40f";
                    break;
            }
        } else { // Враги
            switch(subType) {
                case 'slime':
                    this.drawSlime(ctx, pose, frame, "#2ecc71");
                    return canvas;
                case 'goblin':
                    bodyColor = "#d35400"; // Кожаный жилет
                    headColor = "#27ae60"; // Зеленая кожа головы
                    pantsColor = "#7f8c8d";
                    weaponColor = "#7f8c8d";
                    detailColor = "#c0392b";
                    break;
                case 'goblin_stone':
                    bodyColor = "#d35400"; // Кожаный жилет
                    headColor = "#27ae60"; // Зеленая кожа головы
                    pantsColor = "#7f8c8d";
                    weaponColor = "#95a5a6"; // Камень в руке
                    detailColor = "#c0392b";
                    break;
                case 'skeleton':
                    bodyColor = "#ecf0f1"; // Кости
                    headColor = "#ecf0f1"; // Череп
                    pantsColor = "#bdc3c7";
                    weaponColor = "#7f8c8d";
                    detailColor = "#e74c3c"; // Красные глаза
                    break;
                case 'bull':
                    bodyColor = "#8b4513"; // Коричневая шкура (бык)
                    headColor = "#5c2d16"; // Темная голова
                    pantsColor = "#331a0e";
                    weaponColor = "#d35400";
                    detailColor = "#ffffff"; // Белые рога
                    break;
                case 'orc':
                    bodyColor = "#7f8c8d";
                    headColor = "#16a085"; // Зеленый орк
                    pantsColor = "#2c3e50";
                    weaponColor = "#34495e"; // Темный топор
                    detailColor = "#d35400";
                    break;
                case 'boss':
                    bodyColor = "#c0392b"; // Темно-красный демон
                    headColor = "#962d22";
                    pantsColor = "#2c3e50";
                    weaponColor = "#e67e22"; // Огненный меч
                    detailColor = "#f1c40f"; // Рога / Глаза
                    break;
            }
        }

        // Рисуем тень под ногами
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(8, 27, 16, 3);

        // Расчет смещения при ходьбе (боббинг вверх-вниз)
        let bobY = 0;
        if (pose === 'walk' && frame === 1) {
            bobY = -2;
        }

        // 1. Ноги
        ctx.fillStyle = pantsColor;
        if (pose === 'walk') {
            if (frame === 0) {
                // Ноги расставлены
                ctx.fillRect(9, 23 + bobY, 4, 5);
                ctx.fillRect(19, 23 + bobY, 4, 5);
            } else {
                // Одна нога согнута
                ctx.fillRect(10, 23 + bobY, 4, 5);
                ctx.fillRect(18, 23 + bobY, 4, 3);
            }
        } else {
            // Стоит ровно
            ctx.fillRect(10, 23, 4, 5);
            ctx.fillRect(18, 23, 4, 5);
        }

        // 2. Тело (Торс/Броня)
        ctx.fillStyle = bodyColor;
        ctx.fillRect(8, 14 + bobY, 16, 10);
        // Детали на груди (например, ремень или крест)
        ctx.fillStyle = detailColor;
        if (subType === 'healer') {
            // Зеленый крест
            ctx.fillRect(15, 16 + bobY, 2, 6);
            ctx.fillRect(13, 18 + bobY, 6, 2);
        } else {
            // Диагональная перевязь
            ctx.fillRect(9, 15 + bobY, 2, 2);
            ctx.fillRect(12, 17 + bobY, 2, 2);
            ctx.fillRect(15, 19 + bobY, 2, 2);
            ctx.fillRect(18, 21 + bobY, 2, 2);
        }

        // 3. Голова / Лицо / Шлем
        let headY = 6 + bobY;
        ctx.fillStyle = headColor;
        ctx.fillRect(10, headY, 12, 9); // Голова

        // Лицо (если видна кожа)
        if (subType === 'archer' || subType === 'healer' || subType === 'goblin' || subType === 'goblin_stone' || subType === 'orc') {
            ctx.fillStyle = subType === 'healer' ? skinColor : headColor;
            ctx.fillRect(11, headY + 3, 10, 5);
            
            // Глаза
            ctx.fillStyle = eyeColor;
            ctx.fillRect(13, headY + 4, 2, 2);
            ctx.fillRect(17, headY + 4, 2, 2);
        } else if (subType === 'skeleton') {
            // Череп с красными глазницами
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(12, headY + 4, 2, 2);
            ctx.fillRect(18, headY + 4, 2, 2);
            ctx.fillStyle = detailColor; // Красные зрачки
            ctx.fillRect(12, headY + 4, 1, 1);
            ctx.fillRect(18, headY + 4, 1, 1);
        } else if (subType === 'warrior') {
            // Шлем с забралом
            ctx.fillStyle = "#34495e";
            ctx.fillRect(10, headY + 4, 12, 2); // Прорезь для глаз
            ctx.fillStyle = detailColor; // Плюмаж сверху
            ctx.fillRect(15, headY - 3, 2, 3);
            ctx.fillRect(13, headY - 3, 3, 1);
        } else if (subType === 'mage') {
            // Шляпа волшебника
            ctx.fillStyle = headColor; // Фиолетовая шляпа
            ctx.fillRect(6, headY, 20, 2); // Поля шляпы
            ctx.fillRect(10, headY - 4, 12, 4); // Купол
            ctx.fillRect(12, headY - 7, 8, 3);
            ctx.fillRect(14, headY - 10, 4, 3); // Загнутый кончик
            
            // Золотая лента
            ctx.fillStyle = detailColor;
            ctx.fillRect(10, headY - 1, 12, 1);
            
            // Лицо под шляпой
            ctx.fillStyle = skinColor;
            ctx.fillRect(11, headY + 2, 10, 4);
            ctx.fillStyle = eyeColor;
            ctx.fillRect(13, headY + 3, 2, 2);
            ctx.fillRect(17, headY + 3, 2, 2);
        } else if (subType === 'boss') {
            // Рога и огненные глаза
            ctx.fillStyle = detailColor; // Золотые рога
            ctx.fillRect(8, headY - 4, 2, 5);
            ctx.fillRect(22, headY - 4, 2, 5);
            ctx.fillRect(10, headY - 4, 2, 2);
            ctx.fillRect(20, headY - 4, 2, 2);
            
            // Глаза
            ctx.fillStyle = "#e67e22";
            ctx.fillRect(12, headY + 4, 2, 2);
            ctx.fillRect(18, headY + 4, 2, 2);
        }

        // 4. Оружие и руки
        ctx.fillStyle = weaponColor;
        let isAttacking = pose === 'attack';
        let attackProgress = frame === 1 ? 6 : 0; // Насколько выдвинуто оружие вперед

        if (subType === 'warrior') {
            // Меч и щит
            if (isAttacking) {
                // Выпад мечом вправо
                ctx.fillStyle = "#7f8c8d"; // Рукоять
                ctx.fillRect(22 + attackProgress, 14 + bobY, 3, 2);
                ctx.fillStyle = weaponColor; // Лезвие
                ctx.fillRect(25 + attackProgress, 13 + bobY, 6, 3);
                // Гарда
                ctx.fillStyle = "#d35400";
                ctx.fillRect(24 + attackProgress, 11 + bobY, 1, 6);
            } else {
                // Меч поднят вверх/вбок
                ctx.fillStyle = "#7f8c8d";
                ctx.fillRect(22, 16 + bobY, 2, 2);
                ctx.fillStyle = weaponColor;
                ctx.fillRect(23, 7 + bobY, 3, 9);
                // Щит в другой руке
                ctx.fillStyle = "#d35400"; // Окантовка
                ctx.fillRect(4, 13 + bobY, 5, 8);
                ctx.fillStyle = "#7f8c8d"; // Металл щита
                ctx.fillRect(5, 14 + bobY, 3, 6);
            }
        } else if (subType === 'archer') {
            // Лук
            ctx.fillStyle = "#8e44ad"; // Фиолетовый лук
            ctx.fillRect(20 + attackProgress, 12 + bobY, 2, 10);
            ctx.fillRect(22 + attackProgress, 10 + bobY, 2, 2);
            ctx.fillRect(22 + attackProgress, 22 + bobY, 2, 2);
            // Натянутая тетива
            ctx.fillStyle = "#ecf0f1";
            ctx.fillRect(18 + attackProgress, 12 + bobY, 1, 10);
            if (isAttacking && frame === 1) {
                // Стрела на тетиве
                ctx.fillStyle = "#7f8c8d";
                ctx.fillRect(14, 16 + bobY, 8, 2);
            }
        } else if (subType === 'mage' || subType === 'healer') {
            // Посох мага/хилера
            let staffColor = subType === 'healer' ? "#f1c40f" : "#8e44ad";
            let crystalColor = subType === 'healer' ? "#2ecc71" : "#9b59b6";
            
            ctx.fillStyle = staffColor;
            ctx.fillRect(21 + (isAttacking ? 3 : 0), 8 + bobY, 2, 14); // Древко
            // Навершие посоха
            ctx.fillStyle = crystalColor;
            ctx.fillRect(20 + (isAttacking ? 3 : 0), 5 + bobY, 4, 3);
        } else if (subType === 'goblin') {
            // Маленький кинжал
            ctx.fillStyle = "#7f8c8d";
            ctx.fillRect(22 + (isAttacking ? attackProgress : 0), 17 + bobY, 4, 2);
        } else if (subType === 'goblin_stone') {
            // Камень в руке перед броском
            ctx.fillStyle = "#95a5a6";
            ctx.fillRect(21 + (isAttacking ? attackProgress : 0), 15 + bobY, 4, 4);
        } else if (subType === 'orc') {
            // Двуручный топор
            ctx.fillStyle = "#7f8c8d"; // Топорище
            ctx.fillRect(20 + (isAttacking ? attackProgress : 0), 10 + bobY, 2, 14);
            ctx.fillStyle = "#34495e"; // Железка топора
            ctx.fillRect(18 + (isAttacking ? attackProgress : 0), 7 + bobY, 6, 4);
            ctx.fillRect(17 + (isAttacking ? attackProgress : 0), 6 + bobY, 8, 1);
        } else if (subType === 'skeleton') {
            // Ржавый меч
            ctx.fillStyle = "#d35400"; // Ржавчина
            ctx.fillRect(21 + (isAttacking ? attackProgress : 0), 12 + bobY, 2, 10);
            ctx.fillStyle = "#7f8c8d";
            ctx.fillRect(20 + (isAttacking ? attackProgress : 0), 20 + bobY, 4, 1);
        } else if (subType === 'boss') {
            // Огромный огненный двуручник
            ctx.fillStyle = "#d35400"; // Рукоять
            ctx.fillRect(23 + (isAttacking ? attackProgress : 0), 18 + bobY, 2, 6);
            ctx.fillStyle = "#e67e22"; // Огненное лезвие
            ctx.fillRect(22 + (isAttacking ? attackProgress : 0), 4 + bobY, 4, 14);
            // Яркое ядро меча
            ctx.fillStyle = "#f1c40f";
            ctx.fillRect(23 + (isAttacking ? attackProgress : 0), 6 + bobY, 2, 10);
        } else if (subType === 'bull') {
            // Рисуем рога на голове быка
            ctx.fillStyle = detailColor;
            // Левый рог
            ctx.fillRect(8, headY - 2, 2, 4);
            ctx.fillRect(6, headY - 4, 2, 2);
            // Правый рог
            ctx.fillRect(22, headY - 2, 2, 4);
            ctx.fillRect(24, headY - 4, 2, 2);
        }

        return canvas;
    },

    // Отрисовка Слизня (особая форма)
    drawSlime(ctx, pose, frame, slimeColor) {
        // Тень
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(8, 27, 16, 3);

        let squishY = 0;
        let squishX = 0;

        if (pose === 'walk') {
            if (frame === 0) {
                squishY = 3;  // Сплющен
                squishX = -2;
            } else {
                squishY = -2; // Вытянут
                squishX = 2;
            }
        }

        ctx.fillStyle = slimeColor;
        // Тело слизня
        ctx.fillRect(8 - squishX/2, 16 + squishY, 16 + squishX, 12 - squishY);
        ctx.fillRect(10 - squishX/2, 14 + squishY, 12 + squishX, 2);
        
        // Блик
        ctx.fillStyle = "#ecf0f1";
        ctx.fillRect(10, 16 + squishY, 3, 3);

        // Глазки
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(12, 20 + squishY, 2, 3);
        ctx.fillRect(18, 20 + squishY, 2, 3);
    },

    // Рисуем Стрелу
    createArrow() {
        const { canvas, ctx } = this.createCanvas(16, 8);
        
        ctx.fillStyle = "#8e44ad"; // Фиолетовое оперение
        ctx.fillRect(0, 2, 2, 4);
        ctx.fillRect(1, 1, 1, 6);

        ctx.fillStyle = "#d35400"; // Древко
        ctx.fillRect(2, 3, 10, 2);

        ctx.fillStyle = "#bdc3c7"; // Наконечник
        ctx.fillRect(12, 3, 4, 2);
        ctx.fillRect(12, 2, 2, 4);
        ctx.fillRect(12, 1, 1, 6);

        return canvas;
    },

    // Волшебные сферы
    createMagicOrb(colorOuter, colorInner) {
        const { canvas, ctx } = this.createCanvas(16, 16);
        
        // Размытое свечение снаружи
        ctx.fillStyle = colorOuter;
        ctx.fillRect(4, 2, 8, 12);
        ctx.fillRect(2, 4, 12, 8);
        
        // Яркое ядро
        ctx.fillStyle = colorInner;
        ctx.fillRect(6, 4, 4, 8);
        ctx.fillRect(4, 6, 8, 4);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(6, 6, 4, 4);

        return canvas;
    },

    // Рисуем Камень
    createStone() {
        const { canvas, ctx } = this.createCanvas(12, 12);
        
        ctx.fillStyle = "#7f8c8d"; // Контур/Тень
        ctx.fillRect(4, 2, 4, 8);
        ctx.fillRect(2, 4, 8, 4);
        ctx.fillRect(3, 3, 6, 6);
        
        ctx.fillStyle = "#95a5a6"; // Светло-серый
        ctx.fillRect(5, 3, 2, 6);
        ctx.fillRect(3, 5, 6, 2);
        ctx.fillRect(4, 4, 4, 4);

        ctx.fillStyle = "#bdc3c7"; // Блик
        ctx.fillRect(4, 4, 2, 2);

        return canvas;
    },

    // Зелье здоровья
    createPotion() {
        const { canvas, ctx } = this.createCanvas(16, 16);

        // Горлышко
        ctx.fillStyle = "#7f8c8d";
        ctx.fillRect(7, 2, 2, 3);
        ctx.fillStyle = "#bdc3c7";
        ctx.fillRect(6, 1, 4, 1); // Пробка

        // Колба
        ctx.fillStyle = "#7f8c8d"; // Стекло (контур)
        ctx.fillRect(5, 5, 6, 1);
        ctx.fillRect(4, 6, 8, 9);
        
        // Красное зелье внутри
        ctx.fillStyle = "#e74c3c";
        ctx.fillRect(5, 8, 6, 6);
        ctx.fillRect(6, 7, 4, 1);
        
        // Блик стекла
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(5, 6, 1, 1);
        ctx.fillRect(5, 9, 1, 3);

        return canvas;
    },

    // Могильная плита
    createTombstone() {
        const { canvas, ctx } = this.createCanvas(32, 32);

        // Основание плиты
        ctx.fillStyle = "#7f8c8d";
        ctx.fillRect(4, 26, 24, 4);
        ctx.fillRect(6, 24, 20, 2);

        // Сама плита
        ctx.fillStyle = "#95a5a6";
        ctx.fillRect(8, 6, 16, 18);
        ctx.fillRect(10, 4, 12, 2);

        // Околки/Выщербины
        ctx.fillStyle = "#7f8c8d";
        ctx.fillRect(8, 6, 2, 3);
        ctx.fillRect(22, 10, 2, 2);

        // Надпись RIP (Крест)
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(15, 9, 2, 9);
        ctx.fillRect(12, 12, 8, 2);

        return canvas;
    },

    // Декорация: Дерево
    createTree() {
        const { canvas, ctx } = this.createCanvas(64, 64);

        // Ствол дерева
        ctx.fillStyle = "#784212"; // Темно-коричневый
        ctx.fillRect(28, 40, 8, 24);
        ctx.fillRect(26, 48, 12, 4);
        ctx.fillRect(24, 60, 16, 4); // Корни

        // Крона дерева (листва)
        ctx.fillStyle = "#1b4f72"; // Темная подложка листвы
        ctx.beginPath();
        ctx.arc(32, 28, 26, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#196f3d"; // Основной зеленый
        ctx.beginPath();
        ctx.arc(32, 24, 24, 0, Math.PI * 2);
        ctx.arc(20, 28, 16, 0, Math.PI * 2);
        ctx.arc(44, 28, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#229954"; // Светло-зеленый блик
        ctx.beginPath();
        ctx.arc(28, 18, 18, 0, Math.PI * 2);
        ctx.arc(40, 20, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#52be80"; // Самые яркие листья
        ctx.beginPath();
        ctx.arc(30, 14, 10, 0, Math.PI * 2);
        ctx.fill();

        return canvas;
    },

    // Декорация: Куст
    createBush() {
        const { canvas, ctx } = this.createCanvas(32, 32);

        ctx.fillStyle = "#1b4f72"; // Темное основание
        ctx.beginPath();
        ctx.arc(16, 18, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#196f3d"; // Зелень
        ctx.beginPath();
        ctx.arc(16, 16, 12, 0, Math.PI * 2);
        ctx.arc(8, 18, 8, 0, Math.PI * 2);
        ctx.arc(24, 18, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#2ecc71"; // Яркая листва
        ctx.beginPath();
        ctx.arc(14, 12, 8, 0, Math.PI * 2);
        ctx.arc(20, 14, 6, 0, Math.PI * 2);
        ctx.fill();

        // Небольшие красные ягоды
        ctx.fillStyle = "#e74c3c";
        ctx.fillRect(8, 15, 2, 2);
        ctx.fillRect(22, 13, 2, 2);
        ctx.fillRect(15, 20, 2, 2);
        ctx.fillRect(17, 8, 2, 2);

        return canvas;
    },

    // Декорация: Камень
    createRock() {
        const { canvas, ctx } = this.createCanvas(32, 32);

        // Тень камня
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(2, 24, 28, 6);

        // Нижняя часть
        ctx.fillStyle = "#7f8c8d";
        ctx.fillRect(4, 14, 24, 12);
        ctx.fillRect(6, 10, 20, 4);
        ctx.fillRect(10, 8, 12, 2);

        // Освещенные грани (сверху/слева)
        ctx.fillStyle = "#95a5a6";
        ctx.fillRect(6, 10, 10, 6);
        ctx.fillRect(10, 8, 6, 2);
        ctx.fillRect(4, 14, 4, 6);

        // Блик
        ctx.fillStyle = "#bdc3c7";
        ctx.fillRect(10, 10, 4, 2);

        // Трещина на камне
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(16, 12, 2, 6);
        ctx.fillRect(18, 18, 2, 4);

        return canvas;
    }
};

// Экспортируем, если мы в Node, или вешаем на window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Sprites;
} else {
    window.Sprites = Sprites;
}
