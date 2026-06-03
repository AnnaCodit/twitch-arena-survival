/**
 * Модуль интеграции с Twitch и симуляции чата "Twitch Pixel Arena"
 * Управляет прямым WebSocket IRC-подключением и имитирует чат-ботов.
 */

class TwitchConnection {
    constructor() {
        this.socket = null;
        this.channel = '';
        this.isConnected = false;
        this._manualDisconnect = false; // Флаг ручного отключения (не переподключаемся)
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 10;
        this._reconnectTimer = null;
        
        // Коллбэки для игры
        this.onCommandCallback = null; // (username, command, args, userColor)
        this.onLogCallback = null;     // (username, message, userColor, isSimulated)
        this.onStatusChangeCallback = null; // (statusText, isError)

        // Список готовых имен для симуляции ботов в оффлайне
        this.mockUsernames = [
            "GamerPro", "PixelLord", "Speedrunner99", "NoobSlayer", "CraftyCat",
            "MageMaster", "ShadowNinja", "LootGoblin", "DragonBorn", "RetroFan",
            "GlitchGuy", "CodeWizard", "FireBolt", "IronShield", "HealBot",
            "StreamEnjoyer", "ChatSpammer", "DungeonCrawler", "Valkyrie", "RogueOne",
            "BossBasher", "XP_Grinder", "LuckyStrike", "ManaPotion", "ArcheryKing"
        ];

        // Цвета для симулированных пользователей
        this.mockColors = [
            "#ff0000", "#0000ff", "#00ff00", "#b22222", "#ff7f50",
            "#9acd32", "#32cd32", "#00ff7f", "#3cb371", "#2e8b57",
            "#20b2aa", "#008b8b", "#00bfff", "#1e90ff", "#4169e1",
            "#6a5acd", "#7b68ee", "#9370db", "#8a2be2", "#ba55d3",
            "#d8bfd8", "#dda0dd", "#ee82ee", "#ff00ff", "#ff1493"
        ];
    }

    // Подключение к Twitch
    connect(channelName) {
        if (this.socket) {
            this.disconnect();
        }

        this._manualDisconnect = false;
        this.channel = channelName.trim().toLowerCase();
        if (!this.channel) {
            this.triggerStatus("Введите корректное имя канала", true);
            return;
        }

        this.triggerStatus("Подключение к чату Twitch...", false);

        try {
            this.socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

            this.socket.onopen = () => {
                this.isConnected = true;
                this._reconnectAttempts = 0; // Сброс счётчика при успешном подключении
                this.triggerStatus(`Подключено к #${this.channel}`, false);
                
                // Анонимная авторизация (только для чтения чата)
                this.socket.send("PASS oauth:anon");
                this.socket.send("NICK justinfan" + Math.floor(10000 + Math.random() * 90000));
                
                // Запрашиваем теги (чтобы получить цвет ника, бейджи и т.д.)
                this.socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
                this.socket.send("JOIN #" + this.channel);
            };

            this.socket.onmessage = (event) => {
                this.handleRawMessage(event.data);
            };

            this.socket.onerror = (error) => {
                console.error("Ошибка WebSocket Twitch:", error);
                this.triggerStatus("Ошибка подключения к Twitch", true);
            };

            this.socket.onclose = () => {
                this.isConnected = false;
                this.socket = null;

                // Если отключение было ручным — не переподключаемся
                if (this._manualDisconnect) {
                    this.triggerStatus("Отключено от чата Twitch", false);
                    return;
                }

                // Автоматическое переподключение с экспоненциальным бэкоффом
                if (this._reconnectAttempts < this._maxReconnectAttempts) {
                    this._reconnectAttempts++;
                    const delay = Math.min(30000, 2000 * Math.pow(2, this._reconnectAttempts - 1)); // 2с → 4с → 8с → ... → 30с макс
                    const delaySec = Math.round(delay / 1000);
                    this.triggerStatus(`Соединение потеряно. Переподключение через ${delaySec} сек (попытка ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`, true);
                    
                    this._reconnectTimer = setTimeout(() => {
                        if (!this._manualDisconnect && !this.isConnected) {
                            this.connect(this.channel);
                        }
                    }, delay);
                } else {
                    this.triggerStatus("Не удалось восстановить соединение с Twitch. Нажмите \"Подключить\" вручную.", true);
                }
            };

        } catch (e) {
            console.error("Ошибка при создании сокета:", e);
            this.triggerStatus("Не удалось запустить WebSocket", true);
        }
    }

    // Отключение (ручное)
    disconnect() {
        this._manualDisconnect = true;
        this._reconnectAttempts = 0;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.triggerStatus("Отключено", false);
    }

    // Парсинг сырых сообщений IRC Twitch
    handleRawMessage(rawLine) {
        const lines = rawLine.split("\r\n");
        
        for (let line of lines) {
            if (!line) continue;

            // Обработка пинга (Твич требует PONG в ответ для поддержания сессии)
            if (line.startsWith("PING")) {
                this.socket.send("PONG :tmi.twitch.tv");
                continue;
            }

            // Регулярное выражение для парсинга сообщения с тегами
            // Пример: @color=#1E90FF;display-name=User;... :user!user@user.tmi.twitch.tv PRIVMSG #channel :text
            const match = line.match(/^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.+)$/);
            
            if (match) {
                const tagsStr = match[1] || "";
                const username = match[2];
                const messageText = match[3].trim();
                
                // Извлекаем цвет из тегов
                let userColor = null;
                const tags = {};
                tagsStr.split(";").forEach(tag => {
                    const parts = tag.split("=");
                    if (parts.length === 2) {
                        tags[parts[0]] = parts[1];
                    }
                });

                userColor = tags['color'] ? tags['color'] : this.getUsernameColor(username);
                const displayName = tags['display-name'] ? tags['display-name'] : username;

                // Передаем сообщение в лог UI
                if (this.onLogCallback) {
                    this.onLogCallback(displayName, messageText, userColor, false);
                }

                // Обрабатываем как потенциальную игровую команду
                this.parseGameCommand(displayName, messageText, userColor);
            }
        }
    }

    // Парсинг игровой команды
    parseGameCommand(username, text, color) {
        let command = "";
        let args = [];

        const trimmedText = text.trim();
        // Поддержка просто цифр 1, 2, 3 для голосования (без восклицательного знака)
        if (trimmedText === "1" || trimmedText === "2" || trimmedText === "3" || 
            trimmedText === "!1" || trimmedText === "!2" || trimmedText === "!3") {
            // Нормализуем команду: убираем восклицательный знак, если он был, оставляем чистую цифру
            command = trimmedText.replace("!", "");
        } else if (trimmedText.startsWith("!")) {
            const parts = trimmedText.split(" ");
            command = parts[0].toLowerCase();
            args = parts.slice(1);
        } else {
            return; // Не является командой
        }

        if (this.onCommandCallback) {
            this.onCommandCallback(username, command, args, color);
        }
    }

    // Генерация красивого пастельного цвета по имени (если у пользователя нет цвета в Твиче)
    getUsernameColor(username) {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % this.mockColors.length;
        return this.mockColors[index];
    }

    // Симуляция отправки сообщения от бота (оффлайн режим)
    simulateUserMessage(forcedUser = null, forcedText = null) {
        const username = forcedUser || this.mockUsernames[Math.floor(Math.random() * this.mockUsernames.length)];
        const color = this.getUsernameColor(username);
        
        let text = forcedText;
        if (!text) {
            // Если текст не задан, выбираем случайный
            const randomType = Math.random();
            if (randomType < 0.3) {
                const classes = ["воин", "маг", "лучник", "целитель", "клирик", "warrior", "mage", "archer", "healer", "cleric"];
                text = `!join ${classes[Math.floor(Math.random() * classes.length)]}`;
            } else if (randomType < 0.6) {
                const classes = ["воин", "маг", "лучник", "целитель", "warrior", "mage", "archer", "healer"];
                text = `!class ${classes[Math.floor(Math.random() * classes.length)]}`;
            } else if (randomType < 0.8) {
                text = Math.floor(1 + Math.random() * 3).toString(); // Просто цифра 1, 2 или 3
            } else {
                const messages = [
                    "Всем привет!", "Давайте поднажмем!", "Сложная волна",
                    "Где хил?!", "Маги имба", "Хилер тащит!", "Опять сдох :(",
                    "Давай реликвию на ХП!", "Легендарку ловите", "Ура, прошли!"
                ];
                text = messages[Math.floor(Math.random() * messages.length)];
            }
        }

        // Логируем в UI
        if (this.onLogCallback) {
            this.onLogCallback(username, text, color, true);
        }

        // Обрабатываем команду
        this.parseGameCommand(username, text, color);
    }

    // Симуляция голосования чата (например, 15 голосов раскидать случайно)
    simulateMassVotes(amount = 15) {
        for (let i = 0; i < amount; i++) {
            const username = this.mockUsernames[Math.floor(Math.random() * this.mockUsernames.length)];
            const color = this.getUsernameColor(username);
            const voteOption = Math.floor(1 + Math.random() * 4);
            
            // Задержка имитации
            setTimeout(() => {
                const text = voteOption.toString(); // Голосуем чистой цифрой
                if (this.onLogCallback) {
                    this.onLogCallback(username, text, color, true);
                }
                this.parseGameCommand(username, text, color);
            }, i * 150);
        }
    }

    // Вызов смены статуса подключения
    triggerStatus(text, isError) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback(text, isError);
        }
    }
}

// Экспортируем, если мы в Node, или вешаем на window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TwitchConnection;
} else {
    window.TwitchConnection = TwitchConnection;
}
