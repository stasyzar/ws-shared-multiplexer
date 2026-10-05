import http from 'http';
import express from 'express';
import path from 'path';
import {WebSocketServer} from 'ws';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({server});

app.use(express.static(path.join(__dirname, '../client')));

wss.on('connection', (socket) => {
    console.log(`[+] Клієнт підключився! Всього відкритих сокетів: ${wss.clients.size}`);

    socket.on('message', (data) => {
        console.log(`[Отримано повідомлення]: ${data}`);

        wss.clients.forEach((client)=>{
            if(client.readyState === socket.OPEN){
                client.send(`Сервер підтвердив: ${data}`);
            }
        });
    });

    socket.on('close', ()=>{
        console.log(`[-] Клієнт відключився. Всього відкритих сокетів: ${wss.clients.size}`);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Сервер успішно запущено на http://localhost:${PORT}`);
});