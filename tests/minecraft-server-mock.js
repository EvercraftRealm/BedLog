const properties = new Map();
const counters = { gets: 0, sets: 0, waits: 0 };

export const world = {
  getDynamicProperty(key) {
    counters.gets += 1;
    return properties.get(key);
  },
  setDynamicProperty(key, value) {
    counters.sets += 1;
    if (value === undefined) properties.delete(key);
    else properties.set(key, value);
  }
};

export const system = {
  async waitTicks() {
    counters.waits += 1;
  }
};

export function resetMock() {
  properties.clear();
  counters.gets = 0;
  counters.sets = 0;
  counters.waits = 0;
}

export function resetCounters() {
  counters.gets = 0;
  counters.sets = 0;
  counters.waits = 0;
}

export function mockStats() {
  return {
    ...counters,
    keys: [...properties.keys()],
    properties: new Map(properties)
  };
}

