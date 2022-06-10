const MockDate = require('mockdate');
const Difficulty = require('../main/difficulty');
const events = require('events');

// Bad Settings
const difficulty = {
  'minimum': 8,
  'maximum': 512,
  'targetTime': 15,
  'retargetTime': 90,
  'variance': 0.3,
};

////////////////////////////////////////////////////////////////////////////////

describe('Test difficulty functionality', () => {

  let client;
  beforeEach(() => {
    client = new events.EventEmitter();
    client.id = 'test';
    client.difficulty = 32;
  });

  let difficultyCopy;
  beforeEach(() => {
    difficultyCopy = JSON.parse(JSON.stringify(difficulty));
  });

  test('Test client difficulty initialization [1]', () => {
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.handleClient(client);
    expect(client._eventsCount).toBe(1);
    expect(Object.keys(client._events)[0]).toBe('client.submit');
  });

  test('Test client difficulty initialization [2]', (done) => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.lastRetargetTime = 1634741500;
    difficulty.lastSavedTime = 1634741505;
    difficulty.handleClient(client);
    difficulty.on('client.difficulty.new', (client, current) => {
      expect(current).toBe(8);
      expect(difficulty.clients['test']).toStrictEqual([575]);
      done();
    });
    client.emit('client.submit');
  });

  test('Test client difficulty initialization [3]', (done) => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.clients['test'] = [];
    difficulty.lastRetargetTime = 1634741500;
    difficulty.lastSavedTime = 1634741505;
    difficulty.handleClient(client);
    difficulty.on('client.difficulty.new', (client, current) => {
      expect(current).toBe(8);
      expect(difficulty.clients['test'].length).toBe(1);
      done();
    });
    client.emit('client.submit');
  });

  test('Test client difficulty management [1]', () => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.clients['test'] = [];
    difficulty.handleDifficulty(client);
    expect(difficulty.lastRetargetTime).toBe(1634742035);
    expect(difficulty.lastSavedTime).toBe(1634742080);
  });

  test('Test client difficulty management [2]', () => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.checkDifficulty(client);
  });

  test('Test client difficulty management [3]', () => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.clients['test'] = [];
    difficulty.lastRetargetTime = 1634742070;
    difficulty.lastSavedTime = 1634742075;
    difficulty.handleDifficulty(client);
    expect(difficulty.lastRetargetTime).toBe(1634742070);
    expect(difficulty.lastSavedTime).toBe(1634742080);
  });

  test('Test client difficulty management [4]', () => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.clients['test'] = new Array(24).fill(0);
    difficulty.lastRetargetTime = 1634742070;
    difficulty.lastSavedTime = 1634742075;
    difficulty.handleDifficulty(client);
    expect(difficulty.lastRetargetTime).toBe(1634742070);
    expect(difficulty.lastSavedTime).toBe(1634742080);
    expect(difficulty.clients['test'].length).toBe(24);
    expect(difficulty.clients['test'].slice(-1)[0]).toBe(5);
  });

  test('Test client difficulty management [5]', (done) => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.clients['test'] = [];
    difficulty.lastRetargetTime = 1634741500;
    difficulty.lastSavedTime = 1634741505;
    difficulty.on('client.difficulty.new', (client, current) => {
      expect(current).toBe(8);
      expect(difficulty.clients['test'].length).toBe(1);
      done();
    });
    difficulty.handleDifficulty(client);
  });

  test('Test client difficulty management [6]', (done) => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    difficulty.clients['test'] = new Array(24).fill(0);
    difficulty.lastRetargetTime = 1634741500;
    difficulty.lastSavedTime = 1634742000;
    difficulty.on('client.difficulty.new', (client, current) => {
      expect(current).toBe(144);
      expect(difficulty.clients['test'].length).toBe(24);
      done();
    });
    difficulty.handleDifficulty(client);
  });

  test('Test client difficulty management [7]', (done) => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    client.difficulty = 510;
    difficulty.clients['test'] = [];
    difficulty.lastRetargetTime = 1634741500;
    difficulty.lastSavedTime = 1634741505;
    difficulty.on('client.difficulty.new', (client, current) => {
      expect(current).toBe(13.30434783);
      expect(difficulty.clients['test'].length).toBe(1);
      done();
    });
    difficulty.handleDifficulty(client);
  });

  test('Test client difficulty management [8]', (done) => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    client.difficulty = 510;
    difficulty.clients['test'] = new Array(24).fill(0);
    difficulty.lastRetargetTime = 1634741500;
    difficulty.lastSavedTime = 1634742000;
    difficulty.on('client.difficulty.new', (client, current) => {
      expect(current).toBe(512);
      expect(difficulty.clients['test'].length).toBe(24);
      done();
    });
    difficulty.handleDifficulty(client);
  });

  test('Test client difficulty management [9]', () => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    client.difficulty = 8;
    difficulty.clients['test'] = [];
    difficulty.lastRetargetTime = 1634741900;
    difficulty.lastSavedTime = 1634741980;
    difficulty.handleDifficulty(client);
    expect(difficulty.lastRetargetTime).toBe(1634742080);
    expect(difficulty.lastSavedTime).toBe(1634742080);
  });

  test('Test client difficulty management [10]', () => {
    MockDate.set(1634742080841);
    const difficulty = new Difficulty(difficultyCopy);
    client.difficulty = 512;
    difficulty.clients['test'] = new Array(24).fill(0);
    difficulty.lastRetargetTime = 1634741900;
    difficulty.lastSavedTime = 1634741980;
    difficulty.handleDifficulty(client);
    expect(difficulty.lastRetargetTime).toBe(1634742080);
    expect(difficulty.lastSavedTime).toBe(1634742080);
  });
});
