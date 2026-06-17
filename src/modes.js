/**
 * Runtime contract for game modes.
 * Modes keep mode-specific rules while Game remains the shared arena/runtime.
 */

class GameMode {
    constructor(id, name, context) {
        this.id = id;
        this.name = name;
        this.context = context;
    }

    enter(context = this.context, options = {}) {
        this.context = context;
    }

    exit() {}

    update(dt) {
        this.context.updateCore(dt);
    }

    draw(ctx) {
        this.context.drawCore(ctx);
    }

    handleCommand(command) {
        this.context.handleCoreCommand(command.username, command.command, command.args, command.color);
    }

    getHudState() {
        return this.context.getDefaultHudState();
    }

    getResultState() {
        return this.context.getDefaultResultState();
    }
}

class SurvivalMode extends GameMode {
    constructor(context) {
        super('survival', 'Survival', context);
    }

    enter(context = this.context, options = {}) {
        super.enter(context, options);
        this.context.startCoreMatch({
            modeId: this.id,
            modeName: this.name
        });
    }
}

class DefenseObjective extends Entity {
    constructor(x, y) {
        super(x, y, 44, 52, {
            name: 'Кристалл',
            maxHp: 900,
            speed: 0,
            damage: 0,
            defense: 4,
            range: 0,
            cooldown: 0,
            color: '#00f0ff',
            bloodColor: '#00f0ff',
            scale: 1.0
        });
        this.isDefenseObjective = true;
    }

    draw(ctx) {
        if (!this.active) return;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const pulse = Math.sin(Date.now() * 0.006) * 0.12 + 1;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);

        ctx.fillStyle = 'rgba(0, 240, 255, 0.16)';
        ctx.beginPath();
        ctx.ellipse(0, 20, 38, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#07151f';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(18, -5);
        ctx.lineTo(10, 30);
        ctx.lineTo(-10, 30);
        ctx.lineTo(-18, -5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#9ffcff';
        ctx.fillRect(-5, -18, 10, 34);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(-2, -24, 4, 12);

        ctx.restore();

        this.drawHealthBar(ctx);
    }
}

class DefenseMode extends GameMode {
    constructor(context) {
        super('defense', 'Defense', context);
    }

    enter(context = this.context, options = {}) {
        super.enter(context, options);
        this.context.startCoreMatch({
            modeId: this.id,
            modeName: this.name,
            createDefenseObjective: true
        });
    }

    getHudState() {
        const state = this.context.getDefaultHudState();
        const objective = this.context.defenseObjective;
        if (objective) {
            const hp = Math.max(0, Math.ceil(objective.hp));
            state.objectiveLabel = `КРИСТАЛЛ: ${hp} / ${objective.maxHp}`;
            state.objectiveWarning = objective.hp / objective.maxHp <= 0.3;
        }
        return state;
    }

    getResultState() {
        const state = this.context.getDefaultResultState();
        if (this.context.gameOverReason === 'objective') {
            state.title = 'КРИСТАЛЛ РАЗРУШЕН';
            state.subtitle = 'Монстры прорвались к цели защиты';
        }
        return state;
    }
}

class ModeManager {
    constructor(context) {
        this.context = context;
        this.modes = new Map();
        this.activeMode = null;
    }

    register(mode) {
        this.modes.set(mode.id, mode);
    }

    switchTo(modeId, options = {}) {
        const nextMode = this.modes.get(modeId) || this.modes.get('survival');
        if (!nextMode) {
            throw new Error(`Unknown game mode: ${modeId}`);
        }

        if (this.activeMode && this.activeMode !== nextMode) {
            this.activeMode.exit();
        }

        this.activeMode = nextMode;
        this.activeMode.enter(this.context, options);
    }

    exitActive() {
        if (this.activeMode) {
            this.activeMode.exit();
        }
        this.activeMode = null;
    }

    update(dt) {
        if (this.activeMode) {
            this.activeMode.update(dt);
        }
    }

    draw(ctx) {
        if (this.activeMode) {
            this.activeMode.draw(ctx);
        }
    }

    handleCommand(command) {
        if (this.activeMode) {
            this.activeMode.handleCommand(command);
        } else {
            this.context.handleCoreCommand(command.username, command.command, command.args, command.color);
        }
    }

    getHudState() {
        return this.activeMode ? this.activeMode.getHudState() : this.context.getDefaultHudState();
    }

    getResultState() {
        return this.activeMode ? this.activeMode.getResultState() : this.context.getDefaultResultState();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameMode, SurvivalMode, DefenseMode, DefenseObjective, ModeManager };
} else {
    window.GameMode = GameMode;
    window.SurvivalMode = SurvivalMode;
    window.DefenseMode = DefenseMode;
    window.DefenseObjective = DefenseObjective;
    window.ModeManager = ModeManager;
}
