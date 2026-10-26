const ConnectionStates = {
    CONNECTING: 'CONNECTING',
    DISCONNECTED: 'DISCONNECTED',
    CONNECTED: 'CONNECTED',
    RECONNECTING: 'RECONNECTING'
};

class WebSocketMultiplexer {
    constructor(config = {}) {
        this.url = config.url || `ws://${location.host}`;
        this.gracePeriodMs = config.gracePeriodMs ?? 3000;
        this.reconnectIntervalMs = config.reconnectIntervalMs ?? 2000;

        this.socket = null;
        this.state = ConnectionStates.DISCONNECTED;
        this.ports = new Map();
        this.messageQueue = [];

        this.graceTimer = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;

        this.isPaused = false;
    }

    registerTab(port, { tabId, connectedAt } = {}) {
        if (this.graceTimer) {
            clearTimeout(this.graceTimer);
            this.graceTimer = null;
            console.log('[Multiplexer] Нова вкладка відкрилась вчасно: Grace Period скасовано.');
        }

        this.ports.set(port, { tabId, connectedAt });

        console.log(`[Multiplexer] Вкладку зареєстровано. Всього активних вкладок: ${this.ports.size}`);

        this.broadcastStatus();
        this.connect();
    };

    unregisterTab(port, reason = 'tab_closed') {
        if (!this.ports.has(port)) return;

        const info = this.ports.get(port);
        this.ports.delete(port);
        console.log(`[Multiplexer] Вкладка ${info.tabId} від'єдналася (${reason}). Залишилося: ${this.ports.size}`);
        this.broadcastStatus();
        if (this.ports.size === 0) {
            this.scheduleGracefulShutdown();
        }
    };

    scheduleGracefulShutdown() {
        console.log(`[Multiplexer] Вкладок 0. Запуск Grace Period (${this.gracePeriodMs}мс)...`);
        this.graceTimer = setTimeout(() => {
            console.log('[Multiplexer] Grace Period вичерпано. Закриваємо WebSocket для економії ресурсів.');
            this.disconnect();
            this.graceTimer = null;
        }, this.gracePeriodMs);
    };

    connect() {
        if (this.state === ConnectionStates.CONNECTED || this.state === ConnectionStates.CONNECTING) return;

        this.state = ConnectionStates.CONNECTING;
        this.broadcastStatus();
        console.log('[Multiplexer] Відкриття фізичного WebSocket...');

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                this.state = ConnectionStates.CONNECTED;
                this.reconnectAttempts = 0;
                console.log('[Multiplexer] Фізичний WebSocket підключено до сервера!');
                this.broadcastStatus();
                this.flushQueue();
            };

            this.socket.onmessage = (event) => {
                this.broadcastToTabs({
                    type: 'SERVER_MESSAGE',
                    payload: event.data
                });
            };

            this.socket.onerror = (err) => {
                console.error('[Multiplexer] Помилка WebSocket:', err);
            };

            this.socket.onclose = (event) => {
                console.log(`[Multiplexer] WebSocket закрито сервером (код: ${event.code})`);
                this.socket = null;
                this.state = ConnectionStates.DISCONNECTED;
                this.broadcastStatus();
                if (this.ports.size > 0) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            this.state = ConnectionStates.DISCONNECTED;
            this.scheduleReconnect();
        }
    };

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }

        this.state = ConnectionStates.DISCONNECTED;
        this.broadcastStatus();
    };

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[Multiplexer] Вичерпано ліміт спроб перепідключення.');
            return;
        }

        this.reconnectAttempts++;
        this.state = ConnectionStates.RECONNECTING;
        this.broadcastStatus();

        console.log(`[Multiplexer] Спроба відновлення зв'язку через ${this.reconnectIntervalMs}мс (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectIntervalMs);
    };

    handleTabMessage(port, msg) {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
            case 'TAB_DISCONNECTED':
                this.unregisterTab(port, 'tab_closed_event');
                break;
            case 'SEND_TO_SERVER':
                this.send(msg.payload);
                break;
            case 'TAB_INIT':
                this.registerTab(port, msg.payload);
                break;
            case 'PAUSE_SOCKET':
                this.isPaused = true;
                this.disconnect();
                console.log('[Multiplexer] Штучний офлайн увімкнено. Сокет зупинено.');
                break;
            case 'RESUME_SOCKET':
                this.isPaused = false;
                console.log('[Multiplexer] Штучний офлайн вимкнено. Відновлення зв\'язку...');
                this.connect();
                break;
        }
    };

    send(payload) {
        if (this.state == ConnectionStates.CONNECTED && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(payload);
        }
        else {
            console.log('[Multiplexer] Сокет ще не готовий. Повідомлення збережено в чергу.');
            this.messageQueue.push(payload);
            this.broadcastStatus();

            if (this.state === ConnectionStates.DISCONNECTED && !this.isPaused) {
                this.connect();
            }
        }
    };

    flushQueue() {
        while (this.messageQueue.length > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
            const data = this.messageQueue.shift();
            this.socket.send(data);
        }
        this.broadcastStatus();
    };

    broadcastToTabs(data) {
        for (const port of this.ports.keys()) {
            try {
                port.postMessage(data);
            } catch (err) {
                this.unregisterTab(port, 'port_error');
            }
        }
    };

    broadcastStatus() {
        this.broadcastToTabs({
            type: 'STATUS_UPDATE',
            payload: {
                state: this.state,
                activeTabs: this.ports.size,
                queuedMessages: this.messageQueue.length
            }
        });
    };
};

const multiplexer = new WebSocketMultiplexer();
self.onconnect = (event) => {
    const port = event.ports[0];
    port.onmessage = (event) => multiplexer.handleTabMessage(port, event.data);
    port.start();
};

