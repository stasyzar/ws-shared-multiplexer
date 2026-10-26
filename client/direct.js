export function initDirectMode(onMessageCallback) {
    const socket = new WebSocket(`ws://${location.host}`);

    socket.onmessage = (event) => {
        onMessageCallback(event.data);
    }

    return {
        send: (text) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(text);
            }
        }
    };
}