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
        const wasInactive = this.ports.has(port) && !this.ports.get(port).active;
        this.ports.set(port, { tabId, connectedAt, active: true });

        if (this.graceTimer) {
            this.broadcastToTabs({ type: 'GRACE_STATUS', status: 'canceled' });
            clearTimeout(this.graceTimer);
            this.graceTimer = null;
            console.log('[Multiplexer] Tab reconnected in time. Grace Period canceled.');
        } else if (wasInactive) {
            this.broadcastToTabs({ type: 'GRACE_STATUS', status: 'reconnected' });
            console.log('[Multiplexer] Tab reconnected after grace period expired.');
        }

        console.log(`[Multiplexer] Tab registered. Active tabs: ${this.getActiveTabsCount()}`);
        this.broadcastStatus();
        this.connect();
    };

    unregisterTab(port, reason = 'tab_closed') {
        if (!this.ports.has(port)) return;

        const info = this.ports.get(port);
        if (!info.active) return;
        info.active = false;
        if (reason === 'port_error') {
            this.ports.delete(port);
        }
        console.log(`[Multiplexer] Tab ${info.tabId} disconnected (${reason}). Remaining tabs: ${this.getActiveTabsCount()}`);
        this.broadcastStatus();
        if (this.getActiveTabsCount() === 0) {
            this.scheduleGracefulShutdown();
        }
    };

    scheduleGracefulShutdown() {
        if (this.state === ConnectionStates.DISCONNECTED) {
            return;
        }
        console.log(`[Multiplexer] 0 active tabs. Starting Grace Period (${this.gracePeriodMs}ms)...`);
        this.broadcastToTabs({ type: 'GRACE_STATUS', status: 'started', timeoutMs: 3000 });
        this.graceTimer = setTimeout(() => {
            this.broadcastToTabs({ type: 'GRACE_STATUS', status: 'expired' });
            console.log('[Multiplexer] Grace Period expired. Closing WebSocket.');
            this.disconnect();
            this.graceTimer = null;
        }, this.gracePeriodMs);
    };

    connect() {
        if (this.isPaused || this.getActiveTabsCount() === 0 || this.state === ConnectionStates.CONNECTED || this.state === ConnectionStates.CONNECTING) return;

        this.state = ConnectionStates.CONNECTING;
        this.broadcastStatus();
        console.log('[Multiplexer] Connecting physical WebSocket...');

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                this.state = ConnectionStates.CONNECTED;
                this.reconnectAttempts = 0;
                console.log('[Multiplexer] Physical WebSocket connected to server.');
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
                console.error('[Multiplexer] WebSocket error:', err);
            };

            this.socket.onclose = (event) => {
                console.log(`[Multiplexer] WebSocket closed by server (code: ${event.code})`);
                this.socket = null;
                this.state = ConnectionStates.DISCONNECTED;
                this.broadcastStatus();
                if (this.getActiveTabsCount() > 0 && !this.isPaused) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            this.state = ConnectionStates.DISCONNECTED;
            if (this.getActiveTabsCount() > 0 && !this.isPaused) {
                this.scheduleReconnect();
            }
        }
    };

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onmessage = null;
            this.socket.close();
            this.socket = null;
        }

        this.state = ConnectionStates.DISCONNECTED;
        this.broadcastStatus();
    };

    scheduleReconnect() {
        if (this.isPaused || this.getActiveTabsCount() === 0) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[Multiplexer] Max reconnect attempts reached.');
            return;
        }

        this.reconnectAttempts++;
        this.state = ConnectionStates.RECONNECTING;
        this.broadcastStatus();

        console.log(`[Multiplexer] Reconnecting in ${this.reconnectIntervalMs}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
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
                this.broadcastToTabs({ type: 'PAUSE_STATUS', isPaused: true });
                console.log('[Multiplexer] Offline simulation enabled. Socket paused.');
                break;
            case 'RESUME_SOCKET':
                this.isPaused = false;
                this.broadcastToTabs({ type: 'PAUSE_STATUS', isPaused: false });
                console.log('[Multiplexer] Offline simulation disabled. Resuming socket...');
                this.connect();
                break;
        }
    };

    send(payload) {
        if (this.state == ConnectionStates.CONNECTED && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(payload);
        }
        else {
            console.log('[Multiplexer] Socket not ready. Message enqueued.');
            this.messageQueue.push(payload);
            this.broadcastStatus();

            if (this.state === ConnectionStates.DISCONNECTED && !this.isPaused && this.getActiveTabsCount() > 0) {
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
                activeTabs: this.getActiveTabsCount(),
                queuedMessages: this.messageQueue.length
            }
        });
    };

    getActiveTabsCount() {
        let count = 0;
        for (const info of this.ports.values()) {
            if (info.active) count++;
        }
        return count;
    }
};

const multiplexer = new WebSocketMultiplexer();
self.onconnect = (event) => {
    const port = event.ports[0];
    port.onmessage = (event) => multiplexer.handleTabMessage(port, event.data);
    port.start();
};

