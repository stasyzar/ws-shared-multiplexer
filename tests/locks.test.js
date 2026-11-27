import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketMultiplexer } from '../client/worker.js';

function createMockPort() {
    return {
        postMessage: vi.fn(),
    };
}

describe('WebSocketMultiplexer: Web Locks API та Multicasting', () => {
    let multiplexer;

    beforeEach(() => {
        multiplexer = new WebSocketMultiplexer({ url: 'ws://localhost:3000' });
        vi.spyOn(multiplexer, 'connect').mockImplementation(() => {});
        vi.spyOn(multiplexer, 'disconnect').mockImplementation(() => {});
    });

    afterEach(() => {
        if (multiplexer.broadcastChannel) {
            multiplexer.broadcastChannel.close();
        }
    });

    it('звільнення замка вкладкою автоматично відєднує її у воркері', async () => {
        const port = createMockPort();
        let releaseTabLock;

        const unregisterSpy = vi.spyOn(multiplexer, 'unregisterTab');

        navigator.locks.request('tab-lock-tab-1', () => {
            return new Promise((resolve) => {
                releaseTabLock = resolve;
            });
        });

        multiplexer.registerTab(port, { tabId: 'tab-1' });
        expect(multiplexer.getActiveTabsCount()).toBe(1);

        releaseTabLock();

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(unregisterSpy).toHaveBeenCalledWith(port, 'lock_released');
        expect(multiplexer.getActiveTabsCount()).toBe(0);
    });

    it('broadcastToTabs надсилає повідомлення одночасно і в порти, і в BroadcastChannel', async () => {
        const port = createMockPort();
        multiplexer.registerTab(port, { tabId: 'tab-1' });

        const listenerChannel = new BroadcastChannel('ws-multiplexer-channel');
        const broadcastMessages = [];
        listenerChannel.onmessage = (event) => {
            broadcastMessages.push(event.data);
        };

        const testPayload = { type: 'SERVER_MESSAGE', payload: 'Hello All' };
        multiplexer.broadcastToTabs(testPayload);

        expect(port.postMessage).toHaveBeenCalledWith(testPayload);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(broadcastMessages.length).toBe(1);
        expect(broadcastMessages[0]).toEqual(testPayload);

        listenerChannel.close();
    });
});