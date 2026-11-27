export function initLeaderMode(onMessageCallback, onStatusCallback = null) {

    let tabId = sessionStorage.getItem('tab_id');
    if (!tabId) {
        tabId = 'tab_' + crypto.randomUUID();
        sessionStorage.setItem('tab_id', tabId);
    }

    const channel = new BroadcastChannel('ws-leader-election-channel');

    let isLeader = false;
    let socket = null;

    if (typeof onStatusCallback === 'function') {
        onStatusCallback({ type: 'ROLE_CHANGE', role: 'FOLLOWER', isLeader: false });
    }

    channel.onmessage = (event) => {
        const msg = event.data;

        if (isLeader && msg.type === 'SEND_TO_SERVER') {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(msg.payload);
            }
        }

        if (!isLeader) {
            if (msg.type === 'SERVER_MESSAGE') {
                onMessageCallback(msg.payload);
            } else if (msg.type === 'STATUS_UPDATE') {
                if (typeof onStatusCallback === 'function') {
                    onStatusCallback(msg);
                }
            }
        }
    };


    navigator.locks.request('ws-leader-lock', () => {
        isLeader = true;
        console.log(`[LeaderElection] Tab ${tabId} became LEADER!`);

        if (typeof onStatusCallback === 'function') {
            onStatusCallback({ type: 'ROLE_CHANGE', role: 'LEADER', isLeader: true });
        }

        socket = new WebSocket(`ws://${location.host}`);

        socket.onopen = () => {
            const statusMsg = {
                type: 'STATUS_UPDATE',
                payload: { state: 'CONNECTED', activeTabs: 1, queuedMessages: 0 }
            };
            if (typeof onStatusCallback === 'function') onStatusCallback(statusMsg);
            channel.postMessage(statusMsg);
        };

        socket.onmessage = (event) => {
            onMessageCallback(event.data);
            channel.postMessage({ type: 'SERVER_MESSAGE', payload: event.data });
        };

        socket.onclose = () => {
            const statusMsg = {
                type: 'STATUS_UPDATE',
                payload: { state: 'DISCONNECTED', activeTabs: 0, queuedMessages: 0 }
            };
            if (typeof onStatusCallback === 'function') onStatusCallback(statusMsg);
            channel.postMessage(statusMsg);
        };

        return new Promise(() => { });
    });

    return {
        send: (text) => {
            if (isLeader) {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(text);
                }
            } else {
                channel.postMessage({
                    type: 'SEND_TO_SERVER',
                    payload: text
                });
            }
        }
    };
}