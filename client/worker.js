const connectedPorts = new Set();

let socket = null;

function initWebSocket(){
    if(socket) return;

    socket = new WebSocket(`ws://${location.host}`);

    socket.onopen = () => {
        console.log('[Worker] Фізичний WebSocket відкрито до сервера!');
    };

    socket.onmessage = (event) => {
        console.log('[Worker] Отримано від сервера, ретранслюємо у вкладки:', event.data);

        connectedPorts.forEach((port) => {
            port.postMessage({
                type: 'SERVER_MESSAGE',
                payload: event.data
            });
        });
    };

    socket.onclose = () => {
        console.log('[Worker] WebSocket закрито сервером');
    socket = null;
    };
}

self.onconnect = (event) => {
    const port = event.ports[0];
    connectedPorts.add(port);

    console.log(`[Worker] Нова вкладка підключилася. Всього вкладок: ${connectedPorts.size}`);

    initWebSocket();

    port.onmessage = (event) => {
        const msg = event.data;

        if(msg.type === 'SEND_TO_SERVER'){
            if(socket && socket.readyState == WebSocket.OPEN){
                socket.send(msg.payload);
            }
        }
    };
    port.start();
};