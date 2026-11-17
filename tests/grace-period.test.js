import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketMultiplexer } from '../client/worker.js';

function createMockPort() {
    return {
        postMessage: vi.fn(),
    };
}

describe('WebSocketMultiplexer: Механізм Grace Period', () => {
    let multiplexer;

    beforeEach(() => {
        vi.useFakeTimers();

        multiplexer = new WebSocketMultiplexer({ url: 'ws://localhost:3000', gracePeriodMs: 3000 });
        vi.spyOn(multiplexer, 'connect').mockImplementation(() => { });
        vi.spyOn(multiplexer, 'disconnect').mockImplementation(() => { });
        vi.spyOn(multiplexer, 'watchTabLock').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('коли кількість вкладок стає 0, запускається Grace Period, а сокет ще не закривається', () => {
        const port = createMockPort();
        multiplexer.registerTab(port, { tabId: 'tab-1' });
        multiplexer.state = 'CONNECTED';

        multiplexer.unregisterTab(port, 'tab_closed');

        expect(multiplexer.getActiveTabsCount()).toBe(0);
        expect(multiplexer.graceTimer).not.toBeNull();
        expect(multiplexer.disconnect).not.toHaveBeenCalled();
    });

    it('після закінчення 3000 мс Grace Period викликає disconnect()', () => {
        const port = createMockPort();
        multiplexer.registerTab(port, { tabId: 'tab-1' });
        multiplexer.state = 'CONNECTED';
        multiplexer.unregisterTab(port, 'tab_closed');

        vi.advanceTimersByTime(3000);

        expect(multiplexer.disconnect).toHaveBeenCalledTimes(1);
        expect(multiplexer.graceTimer).toBeNull();
    });

    it('якщо вкладка підключається до закінчення 3000 мс, Grace Period скасовується', () => {
        const port1 = createMockPort();
        multiplexer.registerTab(port1, { tabId: 'tab-1' });
        multiplexer.state = 'CONNECTED';
        multiplexer.unregisterTab(port1, 'tab_closed');

        vi.advanceTimersByTime(1500);

        const port2 = createMockPort();
        multiplexer.registerTab(port2, { tabId: 'tab-2' });

        expect(multiplexer.graceTimer).toBeNull();

        vi.advanceTimersByTime(3000);

        expect(multiplexer.disconnect).not.toHaveBeenCalled();
    });
});