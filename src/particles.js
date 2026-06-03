/**
 * Система частиц "Twitch Pixel Arena"
 * Управляет динамическими брызгами крови, следами магии, 
 * всплывающим текстом (урон/лечение) и запеканием пятен крови на полу.
 */

class ParticleEngine {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        // Массивы активных динамических объектов
        this.particles = [];
        this.floatingTexts = [];

        // Холст для запекания крови на земле (высокая производительность)
        this.bloodCanvas = document.createElement('canvas');
        this.bloodCanvas.width = width;
        this.bloodCanvas.height = height;
        this.bloodCtx = this.bloodCanvas.getContext('2d');
        this.bloodCtx.imageSmoothingEnabled = false;

        // Таймер для плавного испарения крови (чтобы сцена не забивалась в ноль)
        this.bloodFadeTimer = 0;
    }

    // Очистка всех частиц и крови (например, при перезапуске)
    clear() {
        this.particles = [];
        this.floatingTexts = [];
        this.bloodCtx.clearRect(0, 0, this.width, this.height);
    }

    // Создание брызг крови
    spawnBlood(x, y, color, amount = 10, sizeMultiplier = 1) {
        for (let i = 0; i < amount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3.5;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (Math.random() * 1.5), // Небольшой импульс вверх
                color: color,
                size: (1 + Math.random() * 3) * sizeMultiplier,
                life: 30 + Math.random() * 30, // Кадры жизни
                maxLife: 60,
                type: 'blood',
                gravity: 0.15,
                friction: 0.96
            });
        }
    }

    // Создание вспышки магии / следа снаряда
    spawnSpark(x, y, color, amount = 3) {
        for (let i = 0; i < amount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: color,
                size: 2 + Math.random() * 2,
                life: 15 + Math.random() * 15,
                maxLife: 30,
                type: 'spark',
                gravity: 0,
                friction: 0.95
            });
        }
    }

    // Создание ауры вокруг игрока
    spawnAuraParticle(x, y, color) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 12 + Math.random() * 8;

        this.particles.push({
            x: x + Math.cos(angle) * radius,
            y: y + Math.sin(angle) * radius + 5,
            vx: 0,
            vy: -0.3 - Math.random() * 0.4, // Плывет медленно вверх
            color: color,
            size: 1.5 + Math.random() * 1.5,
            life: 20 + Math.random() * 20,
            maxLife: 40,
            type: 'aura',
            gravity: 0,
            friction: 1
        });
    }

    // Добавление всплывающего текста
    spawnFloatingText(x, y, text, color, isCrit = false, isLvlUp = false) {
        this.floatingTexts.push({
            x: x,
            y: y - 10,
            text: text,
            color: color,
            vx: (Math.random() - 0.5) * 1.0,
            vy: isLvlUp ? -1.5 : -2.5, // Уровень плывет медленнее
            life: isLvlUp ? 120 : (isCrit ? 65 : 45), // Время жизни
            maxLife: isLvlUp ? 120 : (isCrit ? 65 : 45),
            isCrit: isCrit,
            isLvlUp: isLvlUp
        });
    }

    // Обновление физики всех частиц
    update() {
        // 1. Обновление динамических частиц
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.vx *= p.friction;
            p.vy *= p.friction;
            p.vy += p.gravity;

            p.x += p.vx;
            p.y += p.vy;
            p.life--;

            // Если частица крови падает на землю (считаем, что гравитация ее "прибила")
            if (p.type === 'blood' && p.life <= p.maxLife - 15 && Math.random() < 0.15) {
                // Рисуем пятно крови на фоновом холсте
                this.bloodCtx.fillStyle = p.color;
                const spotSize = p.size * (1 + Math.random() * 0.8);
                this.bloodCtx.fillRect(p.x - spotSize / 2, p.y - spotSize / 2, spotSize, spotSize);

                // Иногда спавним мелкие брызги рядом для реалистичности
                if (Math.random() < 0.3) {
                    this.bloodCtx.fillRect(
                        p.x + (Math.random() - 0.5) * 6 - 0.5,
                        p.y + (Math.random() - 0.5) * 6 - 0.5,
                        Math.max(1, spotSize * 0.5),
                        Math.max(1, spotSize * 0.5)
                    );
                }

                // Удаляем упавшую частицу, так как она запеклась на холсте
                this.particles.splice(i, 1);
                continue;
            }

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // 2. Обновление всплывающего текста
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.x += t.vx;
            t.y += t.vy;
            t.vy *= 0.96; // Замедление подъема
            t.life--;

            if (t.life <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }

        // 3. Медленное испарение крови на поле (каждые 5 секунд немного осветляем)
        this.bloodFadeTimer++;
        if (this.bloodFadeTimer >= 300) {
            this.bloodFadeTimer = 0;
            // Рисуем полупрозрачный слой ластика/травы поверх холста крови, чтобы пятна тускнели
            this.bloodCtx.globalCompositeOperation = 'destination-out';
            this.bloodCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            this.bloodCtx.fillRect(0, 0, this.width, this.height);
            this.bloodCtx.globalCompositeOperation = 'source-over';
        }
    }

    // Отрисовка динамических частиц и текста
    draw(ctx) {
        // Отрисовка частиц
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.fillStyle = p.color;

            if (p.type === 'aura') {
                // Ауры рисуем кружками или размытыми точками
                ctx.globalAlpha = p.life / p.maxLife;
                ctx.fillRect(p.x, p.y, p.size, p.size);
                ctx.globalAlpha = 1.0;
            } else if (p.type === 'spark') {
                ctx.globalAlpha = p.life / p.maxLife;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
                ctx.globalAlpha = 1.0;
            } else {
                // Обычные летящие частицы крови
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }

        // Отрисовка всплывающего текста
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < this.floatingTexts.length; i++) {
            const t = this.floatingTexts[i];
            const opacity = Math.min(1.0, (t.life / 20));
            ctx.globalAlpha = opacity;

            if (t.isLvlUp) {
                // Огромный текст ЛЕЙВЛ АП
                ctx.font = 'bold 16px "Press Start 2P", monospace';
                // Обводка
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.strokeText(t.text, t.x, t.y);
                ctx.fillStyle = t.color;
                ctx.fillText(t.text, t.x, t.y);
            } else if (t.isCrit) {
                // Большой критический урон
                ctx.font = '900 18px "Press Start 2P", "Outfit", sans-serif';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.strokeText(t.text, t.x, t.y);
                ctx.fillStyle = t.color;
                ctx.fillText(t.text, t.x, t.y);
            } else {
                // Обычные цифры
                ctx.font = 'bold 12px "Press Start 2P", "Outfit", sans-serif';
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = 2.5;
                ctx.strokeText(t.text, t.x, t.y);
                ctx.fillStyle = t.color;
                ctx.fillText(t.text, t.x, t.y);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    // Отрисовка запеченной крови на земле
    drawBloodFloor(ctx) {
        ctx.drawImage(this.bloodCanvas, 0, 0);
    }
}

// Экспортируем, если мы в Node, или вешаем на window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParticleEngine;
} else {
    window.ParticleEngine = ParticleEngine;
}
