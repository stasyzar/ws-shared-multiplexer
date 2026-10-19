export function initSharedMode(onMessageCallback){
    const worker = new SharedWorker('worker.js');

    let tabId = sessionStorage.getItem('tab_id');
    let connectedAt = sessionStorage.getItem('connectedAt');
    if (!tabId) {
        tabId = 'tab_' + crypto.randomUUID();
        connectedAt = Date.now();
        sessionStorage.setItem('tab_id', tabId);
        sessionStorage.setItem('connectedAt', connectedAt);
    };

    worker.port.postMessage({
        type: 'TAB_INIT',
        payload: { tabId, connectedAt }
    });

    worker.port.onmessage = (event) =>{
        const msg= event.data;

        if (msg.type === 'SERVER_MESSAGE') {
            onMessageCallback(msg.payload);
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
        }
    };
}