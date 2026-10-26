export function initSharedMode(onMessageCallback, onStatusCallback = null) {
    const worker = new SharedWorker('worker.js');

    let tabId = sessionStorage.getItem('tab_id');
    let connectedAt = sessionStorage.getItem('connectedAt');
    if (!tabId) {
        tabId = 'tab_' + crypto.randomUUID();
        connectedAt = Date.now();
        sessionStorage.setItem('tab_id', tabId);
        sessionStorage.setItem('connectedAt', connectedAt);
    };

    const register = () => {
        worker.port.postMessage({
            type: 'TAB_INIT',
            payload: { tabId, connectedAt }
        });
    };
    register();

    worker.port.onmessage = (event) => {
        const msg = event.data;

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

    worker.port.start();

    window.addEventListener('beforeunload', () => {
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
            worker.port.postMessage({ type: 'TAB_DISCONNECTED' });
        },

        simulateReconnect: () => {
            register();
        }
    };
}