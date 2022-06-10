const Transactions = require('../main/transactions');
const config = require('../../configs/example');
const testdata = require('../../daemon/test/daemon.mock');

config.primary.address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
config.primary.recipients = [];

const auxiliaryConfig = {
  'enabled': false,
  'coin': {
    'header': 'fabe6d6d',
  }
};

const auxiliaryData = {
  'chainid': 1,
  'hash': '17a35a38e70cd01488e0d5ece6ded04a9bc8125865471d36b9d5c47a08a5907c',
};

const extraNonce = Buffer.from('f000000ff111111f', 'hex');

////////////////////////////////////////////////////////////////////////////////

describe('Test transactions functionality', () => {

  let configCopy, rpcDataCopy;
  beforeEach(() => {
    configCopy = JSON.parse(JSON.stringify(config));
    rpcDataCopy = JSON.parse(JSON.stringify(testdata.getBlockTemplate()));
  });

  test('Test main transaction builder [1]', () => {
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('000000000200f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test main transaction builder [2]', () => {
    rpcDataCopy.coinbasetxn = {};
    rpcDataCopy.coinbasetxn.data = '0500008085202';
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('05000080010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('000000000200f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test main transaction builder [3]', () => {
    configCopy.primary.recipients.push({ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', percentage: 0.05 });
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('0000000003803f1f1b01000000160014e8df018c7e326cc253faac7e46cdc51e68542c4280b2e60e00000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test main transaction builder [4]', () => {
    configCopy.primary.recipients.push({ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', percentage: 0.05 });
    configCopy.primary.recipients.push({ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', percentage: 0.05 });
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('0000000004008d380c01000000160014e8df018c7e326cc253faac7e46cdc51e68542c4280b2e60e00000000160014e8df018c7e326cc253faac7e46cdc51e68542c4280b2e60e00000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test main transaction builder [5]', () => {
    rpcDataCopy.coinbaseaux.flags = 'test';
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('000000000200f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });
  //
  test('Test main transaction builder [6]', () => {
    delete rpcDataCopy.default_witness_commitment;
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('000000000100f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c4200000000', 'hex'));
  });

  test('Test main transaction builder [7]', () => {
    rpcDataCopy.auxData = auxiliaryData;
    configCopy.auxiliary = auxiliaryConfig;
    configCopy.auxiliary.enabled = true;
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, 44)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff3b5104', 'hex'));
    expect(transaction[0].slice(49, 53)).toStrictEqual(Buffer.from('fabe6d6d', 'hex'));
    expect(transaction[0].slice(53)).toStrictEqual(Buffer.from('17a35a38e70cd01488e0d5ece6ded04a9bc8125865471d36b9d5c47a08a5907c0100000000000000', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('000000000200f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test main transaction builder [8]', () => {
    configCopy.settings.testnet = true;
    configCopy.primary.address = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
    const transaction = new Transactions(configCopy).handleGeneration(rpcDataCopy, extraNonce);
    expect(transaction[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(transaction[1]).toStrictEqual(Buffer.from('000000000200f2052a01000000160014751e76e8199196d454941c45d1b3a323f1433bd60000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });
});
