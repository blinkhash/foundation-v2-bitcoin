const MockDate = require('mockdate');
const Daemon = require('../main/daemon');
const nock = require('nock');

const daemons = [{
  'host': '127.0.0.1',
  'port': '8332',
  'username': 'foundation',
  'password': 'foundation'
}];

const multiDaemons = [{
  'host': '127.0.0.1',
  'port': '8332',
  'username': 'foundation',
  'password': 'foundation'
}, {
  'host': '127.0.0.2',
  'port': '8332',
  'username': 'foundation',
  'password': 'foundation'
}];

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

////////////////////////////////////////////////////////////////////////////////

describe('Test daemon functionality', () => {

  let daemonsCopy, multiDaemonsCopy;
  beforeEach(() => {
    daemonsCopy = JSON.parse(JSON.stringify(daemons));
    multiDaemonsCopy = JSON.parse(JSON.stringify(multiDaemons));
  });

  beforeEach(() => nock.cleanAll());
  afterAll(() => nock.restore());
  beforeAll(() => {
    if (!nock.isActive()) nock.activate();
    nock.enableNetConnect();
  });

  test('Test daemon initialization [1]', (done) => {
    nock('http://127.0.0.1:8332')
      .post('/', (body) => body.method === 'getpeerinfo')
      .reply(200, JSON.stringify({
        error: null,
        result: null,
        instance: 'nocktest',
      }));
    const daemon = new Daemon(daemonsCopy);
    daemon.checkInstances((error, response) => {
      expect(error).toBe(false);
      expect(response).toBe(null);
      done();
    });
  });

  test('Test daemon initialization [2]', (done) => {
    nock('http://127.0.0.1:8332')
      .post('/', (body) => body.method === 'getpeerinfo')
      .reply(200, JSON.stringify({
        error: null,
        result: null,
        instance: 'nocktest',
      }));
    nock('http://127.0.0.2:8332')
      .post('/', (body) => body.method === 'getpeerinfo')
      .reply(200, JSON.stringify({
        error: null,
        result: null,
        instance: 'nocktest',
      }));
    const multiDaemon = new Daemon(multiDaemonsCopy);
    multiDaemon.checkInstances((error, response) => {
      expect(error).toBe(false);
      expect(response).toBe(null);
      done();
    });
  });

  test('Test daemon initialization [3]', (done) => {
    nock('http://127.0.0.1:8332')
      .post('/', (body) => body.method === 'getpeerinfo')
      .reply(401, JSON.stringify({
        error: null,
        result: null,
        instance: 'nocktest',
      }));
    const daemon = new Daemon(daemonsCopy);
    const expected = '[{"error":{"code":-1,"message":"Unauthorized RPC access. Invalid RPC username or password"},"response":null,"instance":{"host":"127.0.0.1","port":"8332","username":"foundation","password":"foundation","index":0},"data":"{\\"error\\":null,\\"result\\":null,\\"instance\\":\\"nocktest\\"}"}]';
    daemon.checkInstances((error, response) => {
      expect(error).toBe(true);
      expect(response).toBe(expected);
      done();
    });
  });

  test('Test daemon commands [1]', (done) => {
    MockDate.set(1634742080841);
    nock('http://127.0.0.1:8332')
      .post('/', (body) => body.method === 'getblocktemplate')
      .reply(200, JSON.stringify({
        error: null,
        result: null,
        instance: 'nocktest',
      }));
    const daemon = new Daemon(daemonsCopy);
    const requests = [['getblocktemplate', []]];
    const expected = [{'data': '{"error":null,"result":null,"instance":"nocktest"}', 'error': null, 'instance': { 'host': '127.0.0.1', 'port': '8332', 'username': 'foundation', 'password': 'foundation', 'index': 0 }, 'response': null}];
    daemon.checkInstances(() => {
      daemon.sendCommands(requests, false, (response) => {
        expect(response).toStrictEqual(expected);
        done();
      });
    });
  });

  test('Test daemon commands [2]', (done) => {
    MockDate.set(1634742080841);
    nock('http://127.0.0.1:8332')
      .post('/', (body) => body.method === 'getblocktemplate')
      .reply(200, JSON.stringify({
        error: null,
        result: null,
        instance: 'nocktest',
      }));
    const daemon = new Daemon(daemonsCopy);
    const requests = [['getblocktemplate', []]];
    const expected = [{'data': '{"error":null,"result":null,"instance":"nocktest"}', 'error': null, 'instance': { 'host': '127.0.0.1', 'port': '8332', 'username': 'foundation', 'password': 'foundation', 'index': 0 }, 'response': null}];
    daemon.checkInstances(() => {
      daemon.sendCommands(requests, false, (response) => {
        expect(response).toStrictEqual(expected);
        done();
      });
    });
  });

  test('Test daemon commands [3]', (done) => {
    const daemon = new Daemon([]);
    const requests = [['getblocktemplate', []]];
    daemon.checkInstances(() => {
      daemon.sendCommands(requests, false, (response) => {
        expect(response).toStrictEqual([]);
        done();
      });
    });
  });
});
