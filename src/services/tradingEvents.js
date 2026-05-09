import EventEmitter from 'node:events';

class TradingEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  emitChange(payload = {}) {
    this.emit('changed', {
      ...payload,
      emittedAt: new Date().toISOString(),
    });
  }
}

export const tradingEvents = new TradingEvents();
