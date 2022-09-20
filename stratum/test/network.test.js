const MockDate = require('mockdate');
const Network = require('../main/network');
const Template = require('../main/template');
const config = require('../../configs/example');
const configMain = require('../../configs/main');
const events = require('events');
const testdata = require('../../daemon/test/daemon.mock');

config.primary.address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
config.primary.recipients = [];

const jobId = 1;
const extraNonce = Buffer.from('f000000ff111111f', 'hex');

////////////////////////////////////////////////////////////////////////////////

function mockSocket() {
  const socket = new events.EventEmitter();
  socket.remoteAddress = '127.0.0.1',
  socket.destroy = () => {};
  socket.setEncoding = () => {};
  socket.setKeepAlive = () => {};
  socket.write = (data) => {
    socket.emit('log', data);
  };
  return socket;
}

function mockClient() {
  const socket = mockSocket();
  const client = new events.EventEmitter();
  client.previousDifficulty = 0;
  client.difficulty = 1,
  client.extraNonce1 = 0,
  client.socket = socket;
  client.socket.localPort = 3002;
  client.sendLabel = () => {
    return 'client [example]';
  };
  client.broadcastMiningJob = () => {};
  client.broadcastDifficulty = () => {};
  return client;
}

////////////////////////////////////////////////////////////////////////////////

describe('Test network functionality', () => {

  let configCopy, configMainCopy, rpcDataCopy;
  beforeEach(() => {
    configCopy = JSON.parse(JSON.stringify(config));
    configMainCopy = JSON.parse(JSON.stringify(configMain));
    rpcDataCopy = JSON.parse(JSON.stringify(testdata.getBlockTemplate()));
  });

  test('Test initialization of stratum network', (done) => {
    const network = new Network(configCopy, configMainCopy, () => {});
    expect(typeof network).toBe('object');
    network.on('network.stopped', () => done());
    network.stopNetwork();
  });

  test('Test network banning capabilities [1]', (done) => {
    const network = new Network(configCopy, configMainCopy, () => {});
    const client = mockClient();
    client.on('client.ban.kicked', (timeLeft) => {
      network.on('network.stopped', () => done());
      expect(timeLeft >= 0).toBeTruthy();
      network.stopNetwork();
    });
    network.bannedIPs[client.socket.remoteAddress] = Date.now();
    network.checkBan(client);
  });

  test('Test network banning capabilities [2]', (done) => {
    configCopy.settings.banning.banLength = -1;
    const network = new Network(configCopy, configMainCopy, () => {});
    const client = mockClient();
    client.on('client.ban.forgave', () => {
      network.on('network.stopped', () => done());
      network.stopNetwork();
    });
    network.bannedIPs[client.socket.remoteAddress] = Date.now();
    network.checkBan(client);
  });

  test('Test network job broadcasting', (done) => {
    configCopy.settings.timeout.connection = -1;
    const network = new Network(configCopy, configMainCopy, () => {});
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce, null);
    const socket = mockSocket();
    network.handleClient(socket);
    const client = network.clients[Object.keys(network.clients)[0]];
    client.on('client.socket.timeout', (timeout) => {
      network.on('network.stopped', () => done());
      expect(timeout).toBe('The last submitted share was 0 seconds ago');
      network.stopNetwork();
    });
    network.broadcastMiningJobs(template, true);
  });

  test('Test network client behavior [1]', (done) => {
    MockDate.set(1634742080841);
    const network = new Network(configCopy, configMainCopy, () => {});
    const socket = mockSocket();
    network.handleClient(socket);
    const client = network.clients[Object.keys(network.clients)[0]];
    network.on('client.banned', () => {
      network.on('network.stopped', () => done());
      expect(Object.keys(network.bannedIPs).length).toBe(1);
      expect(network.bannedIPs['127.0.0.1']).toBe(1634742080841);
      network.stopNetwork();
    });
    client.emit('client.ban.trigger');
  });

  test('Test network client behavior [2]', (done) => {
    MockDate.set(1634742080841);
    const network = new Network(configCopy, configMainCopy, () => {});
    const socket = mockSocket();
    network.handleClient(socket);
    const client = network.clients[Object.keys(network.clients)[0]];
    network.on('client.disconnected', () => {
      network.on('network.stopped', () => done());
      expect(Object.keys(network.clients).length).toBe(0);
      network.stopNetwork();
    });
    expect(Object.keys(network.clients).length).toBe(1);
    client.emit('client.socket.disconnect');
  });
});
