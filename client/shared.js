export function initSharedMode(onMessageCallback, onStatusCallback = null, strategy = 'ports') {
    const worker = new SharedWorker('worker.js');

    let releaseTabLock = null;
    let tabId = sessionStorage.getItem('tab_id');
    let connectedAt = sessionStorage.getItem('connectedAt');
    if (!tabId) {
        tabId = 'tab_' + crypto.randomUUID();
        connectedAt = Date.now();
        sessionStorage.setItem('tab_id', tabId);
        sessionStorage.setItem('connectedAt', connectedAt);
    };

    const acquireTabLock = () => {
        if (!navigator.locks) {
            console.warn('[Tab] Web Locks API is not supported in this browser.');
            return;
        }
        if (releaseTabLock) {
            releaseTabLock();
            releaseTabLock = null;
        }

        navigator.locks.request(`tab-lock-${tabId}`, () => {
            console.log(`[Tab] Lock tab-lock-${tabId} successfully acquired.`);

            return new Promise((resolve) => {
                releaseTabLock = resolve;
            })
        })
    }

    const register = () => {
        acquireTabLock();
        worker.port.postMessage({
            type: 'TAB_INIT',
            payload: { tabId, connectedAt }
        });
    };
    register();

    const handleIncomingMessage = (msg) => {
        switch (msg.type) {
            case 'SERVER_MESSAGE':
                onMessageCallback(msg.payload);
                break;
            case 'STATUS_UPDATE':
            case 'GRACE_STATUS':
            case 'PAUSE_STATUS':
                if (typeof onStatusCallback === 'function') {
                    onStatusCallback(msg);
                }
                break;
        }
    };

    if (strategy === 'broadcast') {
        const channel = new BroadcastChannel('ws-multiplexer-channel');
        channel.onmessage = (event) => handleIncomingMessage(event.data);
    } else {
        worker.port.onmessage = (event) => handleIncomingMessage(event.data);
    }

    worker.port.start();

    window.addEventListener('beforeunload', () => {
        if (releaseTabLock) {
            releaseTabLock();
            releaseTabLock = null;
        }
        worker.port.postMessage({ type: 'TAB_DISCONNECTED' });
    });

    return {
        send: (text) => {
            worker.port.postMessage({
                type: 'SEND_TO_SERVER',
                payload: text
            });
        },

        pause: () => {
            worker.port.postMessage({ type: 'PAUSE_SOCKET' });
        },

        resume: () => {
            worker.port.postMessage({ type: 'RESUME_SOCKET' });
        },

        addTestMessagesToQueue: (count = 3) => {
            for (let i = 1; i <= count; i++) {
                worker.port.postMessage({
                    type: 'SEND_TO_SERVER',
                    payload: `[Queue #${i}] created at ${new Date().toLocaleTimeString()}`
                });
            }
        },

        simulateDisconnect: () => {
            if (releaseTabLock) {
                releaseTabLock();
                releaseTabLock = null;
            }
            worker.port.postMessage({ type: 'TAB_DISCONNECTED' });
        },

        simulateReconnect: () => {
            register();
        }
    };
}