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
    console.log(`[+] Client connected! Total active sockets: ${wss.clients.size}`);

    socket.on('message', (data) => {
        console.log(`[Message received]: ${data}`);

        wss.clients.forEach((client) => {
            if (client.readyState === socket.OPEN) {
                client.send(`Server confirmed: ${data}`);
            }
        });
    });

    socket.on('close', () => {
        console.log(`[-] Client disconnected. Total active sockets: ${wss.clients.size}`);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});