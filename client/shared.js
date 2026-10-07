export function initSharedMode(onMessageCallback){
    const worker = new SharedWorker('worker.js');

    worker.port.onmessage = (event) =>{
        const msg= event.data;

        if(msg.type = 'SERVER_MESSAGE'){
            onMessageCallback(msg.payload);
        }
    };

    worker.port.start();

    return {
        send: (text) => {
            worker.port.postMessage({
                type: 'SEND_TO_SERVER',
                payload: text
            });
        }
    };
}