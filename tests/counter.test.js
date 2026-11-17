import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocketMultiplexer } from '../client/worker.js';

function createMockPort() {
    return {
        postMessage: vi.fn(),
    };
}

describe('WebSocketMultiplexer: Управління лічильником вкладок', () => {
    let multiplexer;

    beforeEach(() => {
        multiplexer = new WebSocketMultiplexer({ url: 'ws://localhost:3000' });
        vi.spyOn(multiplexer, 'connect').mockImplementation(() => {});
        vi.spyOn(multiplexer, 'disconnect').mockImplementation(() => {});
        vi.spyOn(multiplexer, 'watchTabLock').mockImplementation(() => {});
    });

    it('початковий стан: 0 активних вкладок і стан DISCONNECTED', () => {
        expect(multiplexer.getActiveTabsCount()).toBe(0);
        expect(multiplexer.state).toBe('DISCONNECTED');
    });

    it('реєстрація першої вкладки збільшує лічильник до 1 і викликає connect()', () => {
        const port1 = createMockPort();
        multiplexer.registerTab(port1, { tabId: 'tab-1' });

        expect(multiplexer.getActiveTabsCount()).toBe(1);
        expect(multiplexer.connect).toHaveBeenCalledTimes(1);
    });

    it('реєстрація другої та третьої вкладок збільшує лічильник, але сокет залишається спільним', () => {
        const port1 = createMockPort();
        const port2 = createMockPort();
        const port3 = createMockPort();

        multiplexer.registerTab(port1, { tabId: 'tab-1' });
        multiplexer.registerTab(port2, { tabId: 'tab-2' });
        multiplexer.registerTab(port3, { tabId: 'tab-3' });

        expect(multiplexer.getActiveTabsCount()).toBe(3);
    });

    it('відключення однієї вкладки зменшує лічильник, але не закриває сокет, якщо інші активні', () => {
        const port1 = createMockPort();
        const port2 = createMockPort();

        multiplexer.registerTab(port1, { tabId: 'tab-1' });
        multiplexer.registerTab(port2, { tabId: 'tab-2' });

        multiplexer.unregisterTab(port1, 'tab_closed');

        expect(multiplexer.getActiveTabsCount()).toBe(1);
        expect(multiplexer.disconnect).not.toHaveBeenCalled();
    });
});