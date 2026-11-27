import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocketMultiplexer } from '../client/worker.js';

function createMockSocket() {
    return {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
    };
}

describe('WebSocketMultiplexer: Черга повідомлень (Message Queue)', () => {
    let multiplexer;

    beforeEach(() => {
        multiplexer = new WebSocketMultiplexer({ url: 'ws://localhost:3000' });
        vi.spyOn(multiplexer, 'connect').mockImplementation(() => {});
        vi.spyOn(multiplexer, 'disconnect').mockImplementation(() => {});
        vi.spyOn(multiplexer, 'watchTabLock').mockImplementation(() => {});
    });

    it('коли сокет не підключений, повідомлення накопичуються в messageQueue', () => {
        multiplexer.state = 'DISCONNECTED';
        multiplexer.socket = null;

        multiplexer.send('Повідомлення 1');
        multiplexer.send('Повідомлення 2');
        multiplexer.send('Повідомлення 3');

        expect(multiplexer.messageQueue.length).toBe(3);
        expect(multiplexer.messageQueue).toEqual([
            'Повідомлення 1',
            'Повідомлення 2',
            'Повідомлення 3'
        ]);
    });

    it('коли сокет підключений (OPEN), повідомлення відправляються одразу без черги', () => {
        const mockSocket = createMockSocket();
        multiplexer.socket = mockSocket;
        multiplexer.state = 'CONNECTED';

        multiplexer.send('Пряме повідомлення');

        expect(mockSocket.send).toHaveBeenCalledTimes(1);
        expect(mockSocket.send).toHaveBeenCalledWith('Пряме повідомлення');
        expect(multiplexer.messageQueue.length).toBe(0);
    });

    it('flushQueue() відправляє всі накопичені повідомлення за принципом FIFO і очищає чергу', () => {
        const mockSocket = createMockSocket();
        multiplexer.socket = mockSocket;
        multiplexer.state = 'CONNECTED';

        multiplexer.messageQueue = ['Перше', 'Друге', 'Третє'];

        multiplexer.flushQueue();

        expect(mockSocket.send).toHaveBeenCalledTimes(3);

        expect(mockSocket.send).toHaveBeenNthCalledWith(1, 'Перше');
        expect(mockSocket.send).toHaveBeenNthCalledWith(2, 'Друге');
        expect(mockSocket.send).toHaveBeenNthCalledWith(3, 'Третє');

        expect(multiplexer.messageQueue.length).toBe(0);
    });
});