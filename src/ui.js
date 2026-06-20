/**
 * Интерфейсный менеджер "Twitch Pixel Arena"
 * Связывает DOM-элементы с игровым циклом, управляет экранами,
 * обработкой кнопок симулятора и формированием финальной статистики.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Создаем экземпляр игры
    const game = new Game('game-canvas');
    window.game = game; // Для доступа в консоли

    // Настройка логов сражения
    game.onBattleLog = (type, message) => {
        const logContent = document.getElementById('battle-log-content');
        if (!logContent) return;
        
        const logDiv = document.createElement('div');
        logDiv.className = `battle-log-item ${type}`;
        logDiv.textContent = message;
        logContent.appendChild(logDiv);
        
        // Автопрокрутка вниз
        logContent.scrollTop = logContent.scrollHeight;
        
        // Лимит в 20 записей
        while (logContent.childNodes.length > 20) {
            logContent.removeChild(logContent.firstChild);
        }
    };

    game.onClearBattleLogs = () => {
        const logContent = document.getElementById('battle-log-content');
        if (logContent) {
            logContent.innerHTML = '';
        }
    };

    // Кэш DOM-элементов
    const screens = {
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-container'),
        gameover: document.getElementById('gameover-screen')
    };

    // Лобби
    const channelInput = document.getElementById('twitch-channel');
    const connectBtn = document.getElementById('btn-connect');
    const connectionStatus = document.getElementById('connection-status');
    const lobbyList = document.getElementById('lobby-players-list');
    const lobbyCount = document.getElementById('lobby-players-count');
    const btnSimulateJoin = document.getElementById('btn-sim-join');
    const btnStartGame = document.getElementById('btn-start-game');

    // Восстанавливаем сохраненное имя канала из localStorage
    const savedChannel = localStorage.getItem('twitch_channel_name');
    if (savedChannel) {
        channelInput.value = savedChannel;
    }

    // Игра
    const waveDisplay = document.getElementById('overlay-wave');
    const waveProgressDisplay = document.getElementById('overlay-wave-progress');
    const aliveDisplay = document.getElementById('overlay-alive');
    const chatPowerDisplay = document.getElementById('overlay-chat-power');
    const scoreDisplay = document.getElementById('overlay-score');
    
    // Симулятор чата
    const chatSimulator = document.getElementById('chat-simulator');
    const toggleChatBtn = document.getElementById('btn-toggle-chat');
    const chatLog = document.getElementById('chat-log');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('btn-chat-send');
    const btnSim10Join = document.getElementById('btn-sim-10-join');
    const btnSimVotes = document.getElementById('btn-sim-votes');
    const btnAutoChat = document.getElementById('btn-auto-chat');
    const debugPanel = document.getElementById('debug-panel');
    const btnDebugClose = document.getElementById('btn-debug-close');
    const debugHpMul = document.getElementById('debug-hp-mul');
    const debugDamageMul = document.getElementById('debug-damage-mul');
    const debugSpawnMul = document.getElementById('debug-spawn-mul');
    const debugPotionMul = document.getElementById('debug-potion-mul');

    // Результаты игры (Game Over)
    const statWave = document.getElementById('stat-wave');
    const statTime = document.getElementById('stat-time');
    const statScore = document.getElementById('stat-score');
    const statHealerHeal = document.getElementById('stat-healer-heal');
    const statHealerRes = document.getElementById('stat-healer-res');
    const statTableBody = document.getElementById('stats-table-body');
    const btnRestart = document.getElementById('btn-restart');
    const gameoverTitle = document.getElementById('gameover-title');
    const gameoverSubtitle = document.getElementById('gameover-subtitle');

    // Переменные автосимулятора чата
    let autoChatInterval = null;
    let isAutoChatActive = false;
    let isGameOverScreenShown = false;

    // Инициализация графики
    Sprites.init();

    // -------------------------------------------------------------
    // 1. ИГРОВОЙ ЦИКЛ (Game Loop)
    // -------------------------------------------------------------
    function loop() {
        if (game.gameState === 'playing' || game.gameState === 'voting') {
            isGameOverScreenShown = false; // Reset when playing/voting starts
            game.update();
            game.draw();
            
            // Обновляем игровые оверлеи
            const hudState = game.getHudState();
            waveDisplay.textContent = hudState.waveLabel;
            waveProgressDisplay.textContent = hudState.progressLabel;
            
            // Количество врагов или таймер голосования
            if (hudState.progressAccent === 'combat') {
                waveProgressDisplay.style.borderColor = 'var(--color-primary)';
                waveProgressDisplay.style.textShadow = '0 0 5px var(--color-primary-glow)';
            } else if (hudState.progressAccent === 'voting') {
                waveProgressDisplay.style.borderColor = '#e67e22';
                waveProgressDisplay.style.textShadow = '0 0 5px rgba(230, 126, 34, 0.4)';
            }

            aliveDisplay.textContent = hudState.aliveLabel;
            chatPowerDisplay.textContent = `${hudState.chatLabel} ${hudState.chatEffectLabel}`;
            chatPowerDisplay.classList.toggle('cooldown', Boolean(hudState.chatCoolingDown));
            scoreDisplay.textContent = hudState.scoreLabel;

            // Скрываем/показываем оверлеи в зависимости от режима OBS
            if (document.body.classList.contains('obs-mode')) {
                setDebugPanelVisible(false);
                // В OBS режиме скрываем все лишнее, кроме канваса
            }
        } else if (game.gameState === 'gameover') {
            if (!isGameOverScreenShown) {
                isGameOverScreenShown = true;
                // Переключаемся на экран конца игры
                showScreen('gameover');
                const result = game.getResultState();
                gameoverTitle.textContent = result.title;
                gameoverSubtitle.textContent = result.subtitle;
                
                // Заполняем статистику
                statWave.textContent = result.wave.toString();
                statTime.textContent = result.time;
                statScore.textContent = result.score.toString();
                statHealerHeal.textContent = result.healerHealing.toString();
                statHealerRes.textContent = result.healerResurrects.toString();

                // Генерируем таблицу игроков
                statTableBody.innerHTML = '';
                result.players.forEach(p => {
                    const tr = document.createElement('tr');
                    const usernameTd = document.createElement('td');
                    usernameTd.style.color = p.color;
                    usernameTd.style.fontWeight = 'bold';
                    usernameTd.textContent = p.username;

                    const classTd = document.createElement('td');
                    classTd.textContent = CONFIG.CLASSES[p.classType].name;

                    const levelTd = document.createElement('td');
                    levelTd.textContent = p.level.toString();

                    const killsTd = document.createElement('td');
                    killsTd.className = 'stat-kills';
                    killsTd.textContent = p.kills.toString();

                    const damageTd = document.createElement('td');
                    damageTd.textContent = Math.round(p.damageDealt).toString();

                    const healingTd = document.createElement('td');
                    healingTd.textContent = Math.round(p.healingDone).toString();

                    tr.appendChild(usernameTd);
                    tr.appendChild(classTd);
                    tr.appendChild(levelTd);
                    tr.appendChild(killsTd);
                    tr.appendChild(damageTd);
                    tr.appendChild(healingTd);
                    statTableBody.appendChild(tr);
                });
            }
        }

        requestAnimationFrame(loop);
    }

    // Запускаем игровой цикл на постоянной основе
    requestAnimationFrame(loop);


    // -------------------------------------------------------------
    // 2. УПРАВЛЕНИЕ ЭКРАНАМИ
    // -------------------------------------------------------------
    function showScreen(screenKey) {
        Object.keys(screens).forEach(key => {
            if (key === screenKey) {
                screens[key].style.display = 'flex';
                screens[key].classList.remove('hidden');
            } else {
                screens[key].style.display = 'none';
                screens[key].classList.add('hidden');
            }
        });

        if (screenKey !== 'game') {
            setDebugPanelVisible(false);
        }
    }

    // По умолчанию показываем лобби
    showScreen('lobby');


    // -------------------------------------------------------------
    // 3. ЛОББИ И ПОДКЛЮЧЕНИЕ К TWITCH
    // -------------------------------------------------------------
    
    // Подключение к каналу
    connectBtn.addEventListener('click', () => {
        const channelName = channelInput.value.trim();
        if (!channelName) return;

        if (game.twitch.isConnected) {
            game.twitch.disconnect();
            connectBtn.textContent = 'Подключить';
            connectBtn.classList.remove('btn-danger');
        } else {
            // Сохраняем имя канала в localStorage
            localStorage.setItem('twitch_channel_name', channelName);
            game.twitch.connect(channelName);
        }
    });

    // Обработка статуса сокета
    game.twitch.onStatusChangeCallback = (text, isError) => {
        connectionStatus.textContent = text;
        if (isError) {
            connectionStatus.style.color = '#e74c3c';
        } else {
            connectionStatus.style.color = game.twitch.isConnected ? '#2ecc71' : '#ffffff';
            if (game.twitch.isConnected) {
                connectBtn.textContent = 'Отключить';
                connectBtn.classList.add('btn-danger');
            } else {
                connectBtn.textContent = 'Подключить';
                connectBtn.classList.remove('btn-danger');
            }
        }
    };

    // Слушатель лобби (зрители присоединяются)
    // Периодическое обновление списка лобби на экране
    setInterval(() => {
        if (game.gameState !== 'lobby') return;

        lobbyCount.textContent = game.lobbyUsers.size.toString();
        
        let warriors = 0;
        let archers = 0;
        let mages = 0;
        let healers = 0;
        
        lobbyList.innerHTML = '';
        game.lobbyUsers.forEach((classType, username) => {
            if (classType === 'warrior') warriors++;
            else if (classType === 'archer') archers++;
            else if (classType === 'mage') mages++;
            else if (classType === 'healer') healers++;

            const span = document.createElement('span');
            span.className = 'lobby-player-tag';
            span.style.borderColor = game.twitch.getUsernameColor(username);
            span.style.color = '#ffffff';
            span.textContent = `${username} (${CONFIG.CLASSES[classType].name})`;
            lobbyList.appendChild(span);
        });

        document.getElementById('lobby-warriors-count').textContent = warriors.toString();
        document.getElementById('lobby-archers-count').textContent = archers.toString();
        document.getElementById('lobby-mages-count').textContent = mages.toString();
        document.getElementById('lobby-healers-count').textContent = healers.toString();
    }, 300);

    // Кнопка симуляции 1 игрока в лобби
    btnSimulateJoin.addEventListener('click', () => {
        game.twitch.simulateUserMessage(null, "!join");
    });

    // Начать игру
    btnStartGame.addEventListener('click', () => {
        showScreen('game');
        game.startMatch();
    });


    // -------------------------------------------------------------
    // 4. ИГРОВОЙ ЭКРАН И СИМУЛЯТОР ЧАТА
    // -------------------------------------------------------------

    // Сворачивание / разворачивание панели чата
    toggleChatBtn.addEventListener('click', () => {
        chatSimulator.classList.toggle('collapsed');
        toggleChatBtn.textContent = chatSimulator.classList.contains('collapsed') ? '[]' : '_';
    });

    // Вывод сообщений чата в окно лога
    game.twitch.onLogCallback = (username, message, color, isSimulated) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        if (isSimulated) msgDiv.classList.add('simulated');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-author';
        nameSpan.style.color = color;
        nameSpan.textContent = username;

        const textSpan = document.createElement('span');
        textSpan.className = 'chat-text';
        textSpan.textContent = `: ${message}`;

        msgDiv.appendChild(nameSpan);
        msgDiv.appendChild(textSpan);
        chatLog.appendChild(msgDiv);

        // Прокрутка вниз
        chatLog.scrollTop = chatLog.scrollHeight;

        // Лимит сообщений в логе для производительности (макс 50)
        while (chatLog.childNodes.length > 50) {
            chatLog.removeChild(chatLog.firstChild);
        }
    };

    // Отправка кастомного сообщения из панели
    function sendManualChatMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        game.twitch.simulateUserMessage("Стример", text);
        chatInput.value = '';
    }

    chatSendBtn.addEventListener('click', sendManualChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendManualChatMessage();
        }
    });

    // Кнопка "+10 Игроков" во время игры
    btnSim10Join.addEventListener('click', () => {
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                game.twitch.simulateUserMessage(null, "!join");
            }, i * 100);
        }
    });

    // Кнопка "Симулировать голоса"
    btnSimVotes.addEventListener('click', () => {
        if (game.gameState === 'voting') {
            game.twitch.simulateMassVotes(15);
        } else {
            game.twitch.onLogCallback("Система", "Голосование не активно!", "#f1c40f", true);
        }
    });

    // Переключатель авто-активности чата
    btnAutoChat.addEventListener('click', () => {
        isAutoChatActive = !isAutoChatActive;
        
        if (isAutoChatActive) {
            btnAutoChat.textContent = "Авто-чат: ВКЛ";
            btnAutoChat.classList.add('active');
            
            autoChatInterval = setInterval(() => {
                // Каждые 1-2 секунды шлем рандомный месседж
                game.twitch.simulateUserMessage();
            }, 1200);
        } else {
            btnAutoChat.textContent = "Авто-чат: ВЫКЛ";
            btnAutoChat.classList.remove('active');
            clearInterval(autoChatInterval);
        }
    });

    function setDebugPanelVisible(isVisible) {
        if (!debugPanel) return;
        if (document.body.classList.contains('obs-mode')) {
            debugPanel.classList.add('hidden');
            return;
        }
        debugPanel.classList.toggle('hidden', !isVisible);
    }

    function logDebugResult(label, success) {
        const color = success ? '#2ecc71' : '#f1c40f';
        const status = success ? 'OK' : 'SKIPPED';
        game.twitch.onLogCallback('DEBUG', `${label}: ${status}`, color, true);
    }

    function runDebugAction(label, action) {
        logDebugResult(label, Boolean(action()));
    }

    function bindDebugButton(id, label, action) {
        const button = document.getElementById(id);
        if (!button) return;
        button.addEventListener('click', () => runDebugAction(label, action));
    }

    function syncDebugBalanceInputs() {
        if (!game.debugBalanceOverrides) return;
        debugHpMul.value = game.debugBalanceOverrides.enemyHpMul;
        debugDamageMul.value = game.debugBalanceOverrides.enemyDamageMul;
        debugSpawnMul.value = game.debugBalanceOverrides.spawnDelayMul;
        debugPotionMul.value = game.debugBalanceOverrides.potionDropMul;
    }

    if (btnDebugClose) {
        btnDebugClose.addEventListener('click', () => setDebugPanelVisible(false));
    }

    bindDebugButton('debug-chat-heal-25', '+25 HEAL', () => game.debugAddChatIntents('heal', 25));
    bindDebugButton('debug-chat-bomb-25', '+25 BOMB', () => game.debugAddChatIntents('bomb', 25));
    bindDebugButton('debug-fill-heal', 'Fill HEAL', () => game.debugFillChatPower('heal'));
    bindDebugButton('debug-fill-bomb', 'Fill BOMB', () => game.debugFillChatPower('bomb'));
    bindDebugButton('debug-trigger-heal', 'Trigger HEAL', () => game.debugTriggerChatEvent('heal'));
    bindDebugButton('debug-trigger-bomb', 'Trigger BOMB', () => game.debugTriggerChatEvent('bomb'));
    bindDebugButton('debug-reset-chat', 'Reset Chat Power', () => game.debugResetChatPower());
    bindDebugButton('debug-heal-team', 'Full heal team', () => game.debugHealTeam());
    bindDebugButton('debug-damage-team', 'Damage team', () => game.debugDamageTeam(0.25));
    bindDebugButton('debug-kill-team', 'Kill team', () => game.debugKillTeam());
    bindDebugButton('debug-revive-team', 'Revive team', () => game.debugReviveTeam(0.35));
    bindDebugButton('debug-last-stand', 'Force Last Stand', () => game.debugForceLastStand());
    bindDebugButton('debug-spawn-enemy', 'Spawn enemy', () => game.debugSpawnEnemies('slime', 1));
    bindDebugButton('debug-spawn-10', 'Spawn 10 enemies', () => game.debugSpawnEnemies('slime', 10));
    bindDebugButton('debug-spawn-boss', 'Spawn boss', () => game.debugSpawnBoss());
    bindDebugButton('debug-clear-enemies', 'Clear enemies', () => game.debugClearEnemies());
    bindDebugButton('debug-next-wave', 'Next wave', () => game.debugStartNextWave());
    bindDebugButton('debug-start-vote', 'Start voting', () => game.debugStartRelicVoting());
    bindDebugButton('debug-pick-relic-1', 'Pick relic 1', () => game.debugEndVotingWithOption(1));
    bindDebugButton('debug-pick-relic-2', 'Pick relic 2', () => game.debugEndVotingWithOption(2));
    bindDebugButton('debug-pick-relic-3', 'Pick relic 3', () => game.debugEndVotingWithOption(3));
    bindDebugButton('debug-pick-relic-4', 'Pick relic 4', () => game.debugEndVotingWithOption(4));
    bindDebugButton('debug-pity', 'Potion pity ready', () => game.debugSetPotionPity());
    bindDebugButton('debug-drop-potion', 'Drop potion', () => game.debugForcePotionDrop());
    bindDebugButton('debug-apply-balance', 'Apply balance overrides', () => {
        return game.debugSetBalanceOverride('enemyHpMul', debugHpMul.value) &&
            game.debugSetBalanceOverride('enemyDamageMul', debugDamageMul.value) &&
            game.debugSetBalanceOverride('spawnDelayMul', debugSpawnMul.value) &&
            game.debugSetBalanceOverride('potionDropMul', debugPotionMul.value);
    });
    bindDebugButton('debug-reset-balance', 'Reset balance overrides', () => {
        const success = game.debugResetBalanceOverrides();
        syncDebugBalanceInputs();
        return success;
    });
    syncDebugBalanceInputs();


    // -------------------------------------------------------------
    // 5. ЭКРАН КОНЦА ИГРЫ (Game Over)
    // -------------------------------------------------------------
    btnRestart.addEventListener('click', () => {
        isGameOverScreenShown = false;
        showScreen('lobby');
        game.returnToLobby();
    });

    // Горячие клавиши для OBS / Оверлей режима
    document.addEventListener('keydown', (e) => {
        const targetTag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (targetTag === 'input' || targetTag === 'textarea') return;
        // Клавиша O (английская) переключает OBS режим
        if (e.key.toLowerCase() === 'o') {
            document.body.classList.toggle('obs-mode');
            if (document.body.classList.contains('obs-mode')) {
                setDebugPanelVisible(false);
            }
            if (document.body.classList.contains('obs-mode')) {
                console.log("OBS Режим активирован: Управление скрыто, фон прозрачный.");
            } else {
                console.log("OBS Режим деактивирован.");
            }
        } else if (e.key.toLowerCase() === 'd') {
            if (game.gameState !== 'playing' && game.gameState !== 'voting') return;
            const isVisible = debugPanel && !debugPanel.classList.contains('hidden');
            setDebugPanelVisible(!isVisible);
        }
    });

    // Автоматическое подключение при загрузке, если канал сохранен в localStorage
    if (savedChannel) {
        game.twitch.connect(savedChannel);
    }
});
