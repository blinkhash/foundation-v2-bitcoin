const Client = require('../main/client');
const config = require('../../configs/example');
const events = require('events');

////////////////////////////////////////////////////////////////////////////////

function mockSocket() {
  const socket = new events.EventEmitter();
  socket.remoteAddress = '127.0.0.1',
  socket.destroy = () => {
    socket.emit('log', 'destroyed');
  };
  socket.setEncoding = () => {};
  socket.setKeepAlive = () => {};
  socket.write = (data) => {
    socket.emit('log', data);
  };
  return socket;
}

////////////////////////////////////////////////////////////////////////////////

describe('Test client functionality', () => {

  let configCopy;
  beforeEach(() => {
    configCopy = JSON.parse(JSON.stringify(config));
  });

  test('Test initialization of stratum client', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(typeof client).toBe('object');
    expect(typeof client.handleAuthorize).toBe('function');
    expect(typeof client.handleSubmit).toBe('function');
  });

  test('Test client main setup', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.on('client.ban.check', () => done());
    client.setupClient();
  });

  test('Test client main events [1]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.on('client.socket.disconnect', () => done());
    client.socket.emit('close');
  });

  test('Test client main events [2]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.on('client.socket.error', (error) => {
      expect(error).toBe('test');
      done();
    });
    client.socket.emit('error', 'test');
  });

  test('Test client main events [3]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.socket.on('log', () => done());
    client.socket.emit('data', '{"method":"mining.extranonce.subscribe"}\n');
  });

  test('Test client main events [4]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('destroyed');
      done();
    });
    client.socket.emit('data', 'bad\n');
  });

  test('Test client main events [5]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.socket.on('log', () => done());
    client.socket.emit('data', '{"method":"mining.extranonce.subscribe"}\n{"method":"min');
  });

  test('Test client main events [6]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.socket.emit('data', '{"method":"mining.extrano');
  });

  test('Test client main events [7]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.setupClient();
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('destroyed');
      done();
    });
    client.socket.emit('data', 'test'.repeat(10000));
  });

  test('Test client socket writing', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', () => done());
    client.sendJson({ id: 'test' });
  });

  test('Test client label writing [1]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    const label = client.sendLabel();
    expect(label).toBe('(unauthorized) [127.0.0.1]');
  });

  test('Test client label writing [2]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.addrPrimary = 'test';
    const label = client.sendLabel();
    expect(label).toBe('test [127.0.0.1]');
  });

  test('Test client difficulty queueing [1]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.enqueueDifficulty(8);
    expect(client.pendingDifficulty).toBe(8);
  });

  test('Test client difficulty queueing [2]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.staticDifficulty = true;
    client.enqueueDifficulty(8);
    expect(client.pendingDifficulty).toBe(null);
  });

  test('Test client name validation [1]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validateName('test')).toStrictEqual(['test', null]);
  });

  test('Test client name validation [2]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validateName('')).toStrictEqual(['', null]);
  });

  test('Test client name validation [3]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validateName('example!@#$%^&')).toStrictEqual(['example', null]);
  });

  test('Test client name validation [4]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validateName('test,test')).toStrictEqual(['test', 'test']);
  });

  test('Test client flag validation [1]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validatePassword('d=100')).toStrictEqual({ difficulty: 100 });
  });

  test('Test client flag validation [2]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validatePassword('d=10.s0')).toStrictEqual({});
  });

  test('Test client flag validation [3]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    expect(client.validatePassword('')).toStrictEqual({});
  });

  test('Test client message validation [1]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":[[["mining.set_difficulty",0],["mining.notify",0]],"extraNonce1","extraNonce2Size"],"error":null}\n');
      done();
    });
    client.on('client.subscription', (params, callback) => callback(null, 'extraNonce1', 'extraNonce2Size'));
    client.validateMessages({ id: null, method: 'mining.subscribe' });
  });

  test('Test client message validation [2]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":null,"error":true}\n');
      done();
    });
    client.on('client.subscription', (params, callback) => callback(true, null, null));
    client.validateMessages({ id: null, method: 'mining.subscribe' });
  });

  test('Test client message validation [3]', (done) => {
    const socket = mockSocket();
    const output = { error: null, authorized: true, disconnect: false };
    const client = new Client(configCopy, socket, 0, (ip, port, addrPrimary, addrAuxiliary, password, callback) => callback(output));
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":true,"error":null}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.authorize', params: ['username', 'password'] });
  });

  test('Test client message validation [4]', (done) => {
    const socket = mockSocket();
    const output = { error: null, authorized: false, disconnect: true };
    const client = new Client(configCopy, socket, 0, (ip, port, addrPrimary, addrAuxiliary, password, callback) => callback(output));
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('destroyed');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.authorize', params: ['username', 'password'] });
  });

  test('Test client message validation [5]', (done) => {
    const socket = mockSocket();
    const output = { error: null, authorized: true, disconnect: false };
    const client = new Client(configCopy, socket, 0, (ip, port, addrPrimary, addrAuxiliary, password, callback) => callback(output));
    client.socket.on('log', (text) => {
      expect(client.pendingDifficulty).toBe(500);
      expect(client.staticDifficulty).toBe(true);
      expect(text).toStrictEqual('{"id":null,"result":true,"error":null}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.authorize', params: ['username', 'd=500'] });
  });

  test('Test client message validation [6]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":{"version-rolling":true,"version-rolling.mask":"1fffe000"},"error":null}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.configure' });
    expect(client.asicboost).toBe(true);
    expect(client.versionMask).toBe('1fffe000');
  });

  test('Test client message validation [7]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.validateMessages({ id: null, method: 'mining.multi_version', params: [1] });
    expect(client.asicboost).toBe(false);
    expect(client.versionMask).toBe('00000000');
  });

  test('Test client message validation [8]', () => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.validateMessages({ id: null, method: 'mining.multi_version', params: [4] });
    expect(client.asicboost).toBe(true);
    expect(client.versionMask).toBe('1fffe000');
  });

  test('Test client message validation [9]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":null,"error":[24,"unauthorized worker",null]}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.submit', params: ['worker', 'password'] });
    expect(client.shares.invalid).toBe(1);
  });

  test('Test client message validation [10]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.authorized = true;
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":null,"error":[25,"not subscribed",null]}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.submit', params: ['worker', 'password'] });
    expect(client.shares.invalid).toBe(1);
  });

  test('Test client message validation [11]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.authorized = true;
    client.extraNonce1 = 'test';
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":true,"error":null}\n');
      done();
    });
    client.on('client.submit', (params, callback) => callback(null, true));
    client.validateMessages({ id: null, method: 'mining.submit', params: ['worker', 'password'] });
    expect(client.addrPrimary).toBe('worker');
    expect(client.shares.valid).toBe(1);
  });

  test('Test client message validation [12]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.addrPrimary = 'worker';
    client.authorized = true;
    client.extraNonce1 = 'test';
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":true,"error":null}\n');
      done();
    });
    client.on('client.submit', (params, callback) => callback(null, true));
    client.validateMessages({ id: null, method: 'mining.submit', params: ['worker', 'password'] });
    expect(client.shares.valid).toBe(1);
  });

  test('Test client message validation [13]', (done) => {
    const socket = mockSocket();
    configCopy.banning.checkThreshold = 5;
    const client = new Client(configCopy, socket, 0, () => {});
    client.authorized = true;
    client.extraNonce1 = 'test';
    client.shares = { valid: 0, invalid: 20 };
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('destroyed');
      done();
    });
    client.on('client.submit', (params, callback) => callback(true, null));
    client.validateMessages({ id: null, method: 'mining.submit', params: ['worker', 'password'] });
  });

  test('Test client message validation [14]', (done) => {
    const socket = mockSocket();
    configCopy.banning.checkThreshold = 5;
    configCopy.banning.invalidPercent = 50;
    const client = new Client(configCopy, socket, 0, () => {});
    client.authorized = true;
    client.extraNonce1 = 'test';
    client.shares = { valid: 20, invalid: 0 };
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":true,"error":null}\n');
      done();
    });
    client.on('client.submit', (params, callback) => callback(null, true));
    client.validateMessages({ id: null, method: 'mining.submit', params: ['worker', 'password'] });
    expect(client.shares.valid).toBe(0);
  });

  test('Test client message validation [15]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":[],"error":[20,"Not supported.",null]}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.get_transactions' });
  });

  test('Test client message validation [16]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"result":false,"error":[20,"Not supported.",null]}\n');
      done();
    });
    client.validateMessages({ id: null, method: 'mining.extranonce.subscribe' });
  });

  test('Test client message validation [17]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.on('client.mining.unknown', () => done());
    client.validateMessages({ id: null, method: 'mining.unknown' });
  });

  test('Test client difficulty updates', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"method":"mining.set_difficulty","params":[8]}\n');
      done();
    });
    expect(client.broadcastDifficulty(0)).toBe(false);
    expect(client.broadcastDifficulty(8)).toBe(true);
  });

  test('Test client job updates [1]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"method":"mining.notify","params":[0,0,0,0]}\n');
      done();
    });
    client.broadcastMiningJob([0,0,0,0]);
  });

  test('Test client job updates [2]', (done) => {
    const socket = mockSocket();
    configCopy.settings.connectionTimeout = 10;
    const client = new Client(configCopy, socket, 0, () => {});
    client.activity = 0;
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('destroyed');
      done();
    });
    client.broadcastMiningJob([0,0,0,0]);
  });

  test('Test client job updates [3]', (done) => {
    const response = [];
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.pendingDifficulty = 8;
    client.socket.on('log', (text) => {
      response.push(text);
      if (response.length === 2) {
        expect(response[0]).toStrictEqual('{"id":null,"method":"mining.set_difficulty","params":[8]}\n');
        expect(response[1]).toStrictEqual('{"id":null,"method":"mining.notify","params":[0,0,0,0]}\n');
        done();
      }
    });
    client.broadcastMiningJob([0,0,0,0]);
  });

  test('Test client job updates [4]', (done) => {
    const socket = mockSocket();
    const client = new Client(configCopy, socket, 0, () => {});
    client.pendingDifficulty = 0;
    client.socket.on('log', (text) => {
      expect(text).toStrictEqual('{"id":null,"method":"mining.notify","params":[0,0,0,0]}\n');
      done();
    });
    client.broadcastMiningJob([0,0,0,0]);
  });
});
