const Manager = require('../main/manager');
const config = require('../../configs/example');
const configMain = require('../../configs/main');
const events = require('events');
const testdata = require('../../daemon/test/daemon.mock');

config.primary.address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
config.primary.recipients = [];

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
  client.id = 'test';
  client.addrPrimary = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
  client.addrAuxiliary = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
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

describe('Test manager functionality', () => {

  let configCopy, configMainCopy, rpcDataCopy;
  beforeEach(() => {
    configCopy = JSON.parse(JSON.stringify(config));
    configMainCopy = JSON.parse(JSON.stringify(configMain));
    rpcDataCopy = JSON.parse(JSON.stringify(testdata.getBlockTemplate()));
  });

  test('Test initial manager calculations', () => {
    const manager = new Manager(configCopy, configMainCopy);
    expect(manager.extraNonceCounter.size).toBe(4);
    expect(manager.extraNonceCounter.next().length).toBe(8);
    expect(manager.extraNoncePlaceholder).toStrictEqual(Buffer.from('f000000ff111111f', 'hex'));
    expect(manager.extraNonce2Size).toBe(4);
  });

  test('Test template updates given updated blockTemplate', () => {
    const manager = new Manager(configCopy, configMainCopy);
    const response1 = manager.handleTemplate(rpcDataCopy);
    expect(response1).toBe(true);
  });

  test('Test template updates given new blockTemplate [1]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    const response1 = manager.handleTemplate(rpcDataCopy, false);
    const response2 = manager.handleTemplate(rpcDataCopy, false);
    expect(response1).toBe(true);
    expect(response2).toBe(false);
  });

  test('Test template updates given new blockTemplate [2]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    const response1 = manager.handleTemplate(rpcDataCopy, false);
    rpcDataCopy.previousblockhash = '8719aefb83ef6583bd4c808bbe7d49b629a60b375fc6e36bee039530bc7727e2';
    const response2 = manager.handleTemplate(rpcDataCopy, false);
    expect(response1).toBe(true);
    expect(response2).toBe(true);
  });

  test('Test template updates given new blockTemplate [3]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    const response1 = manager.handleTemplate(rpcDataCopy, false);
    rpcDataCopy.previousblockhash = '8719aefb83ef6583bd4c808bbe7d49b629a60b375fc6e36bee039530bc7727e2';
    rpcDataCopy.height = 0;
    const response2 = manager.handleTemplate(rpcDataCopy, false);
    expect(response1).toBe(true);
    expect(response2).toBe(false);
  });

  test('Test share submission process [1]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: 0,
      extraNonce2: '00'.toString('hex'),
      nTime: 0,
      nonce: 0,
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(20);
    expect(response.error[1]).toBe('incorrect size of extranonce2');
  });

  test('Test share submission process [2]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: 0,
      extraNonce2: '00000000'.toString('hex'),
      nTime: 0,
      nonce: 0,
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    const response = manager.handleShare(0, client, submission);
    expect(response.error[0]).toBe(21);
    expect(response.error[1]).toBe('job not found');
  });

  test('Test share submission process [3]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: 0,
      extraNonce2: '00000000'.toString('hex'),
      nTime: '00'.toString('hex'),
      nonce: 0,
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(20);
    expect(response.error[1]).toBe('incorrect size of ntime');
  });

  test('Test share submission process [4]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: 0,
      extraNonce2: '00000000'.toString('hex'),
      nTime: '7036c54f'.toString('hex'),
      nonce: 0,
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(20);
    expect(response.error[1]).toBe('ntime out of range');
  });

  test('Test share submission process [5]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: 0,
      extraNonce2: '00000000'.toString('hex'),
      nTime: '6036c54f'.toString('hex'),
      nonce: '00'.toString('hex'),
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(20);
    expect(response.error[1]).toBe('incorrect size of nonce');
  });

  test('Test share submission process [6]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: '00000001'.toString('hex'),
      extraNonce2: '00000000'.toString('hex'),
      nTime: '6036c54f'.toString('hex'),
      nonce: 'fe1a0000'.toString('hex'),
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    client.addrPrimary = null;
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(20);
    expect(response.error[1]).toBe('worker address isn\'t set properly');
  });

  test('Test share submission process [7]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: '00000001'.toString('hex'),
      extraNonce2: '00000000'.toString('hex'),
      nTime: '6036c54f'.toString('hex'),
      nonce: 'fe1a0000'.toString('hex'),
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    manager.handleShare(1, client, submission);
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(22);
    expect(response.error[1]).toBe('duplicate share');
  });

  test('Test share submission process [8]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: '00000001'.toString('hex'),
      extraNonce2: '00000000'.toString('hex'),
      nTime: '6036c54f'.toString('hex'),
      nonce: 'fe1a0000'.toString('hex'),
      versionBit: '20000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(20);
    expect(response.error[1]).toBe('invalid version bit');
  });

  test('Test share submission process [9]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: '00000001'.toString('hex'),
      extraNonce2: '00000000'.toString('hex'),
      nTime: '6036c54f'.toString('hex'),
      nonce: 'fe1a0000'.toString('hex'),
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: true,
    };
    const client = mockClient();
    client.previousDifficulty = 1;
    client.difficulty = 1;
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(23);
    expect(response.error[1].slice(0, 23)).toBe('low difficulty share of');
  });

  test('Test share submission process [10]', () => {
    const manager = new Manager(configCopy, configMainCopy);
    manager.handleTemplate(rpcDataCopy, false);
    const submission = {
      extraNonce1: '00000001'.toString('hex'),
      extraNonce2: '00000000'.toString('hex'),
      nTime: '6036c54f'.toString('hex'),
      nonce: 'fe1a0000'.toString('hex'),
      versionBit: '00000000',
      versionMask: '1fffe000',
      asicboost: false,
    };
    const client = mockClient();
    client.previousDifficulty = 1;
    client.difficulty = 1;
    const response = manager.handleShare(1, client, submission);
    expect(response.error[0]).toBe(23);
    expect(response.error[1].slice(0, 23)).toBe('low difficulty share of');
  });
});
