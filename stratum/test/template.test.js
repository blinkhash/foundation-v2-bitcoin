const Algorithms = require('../main/algorithms');
const Template = require('../main/template');
const config = require('../../configs/example');
const testdata = require('../../daemon/test/daemon.mock');
const utils = require('../main/utils');

config.primary.address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
config.primary.recipients = [];

const jobId = 1;
const extraNonce = Buffer.from('f000000ff111111f', 'hex');

////////////////////////////////////////////////////////////////////////////////

describe('Test template functionality', () => {

  let configCopy, rpcDataCopy;
  beforeEach(() => {
    configCopy = JSON.parse(JSON.stringify(config));
    rpcDataCopy = JSON.parse(JSON.stringify(testdata.getBlockTemplate()));
  });

  test('Test current bigint implementation [1]', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    expect(Number(template.target).toFixed(9)).toBe('1.1042625655198232e+71');
  });

  test('Test current bigint implementation [2]', () => {
    rpcDataCopy.target = null;
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    expect(Number(template.target).toFixed(9)).toBe('1.1042625655198232e+71');
  });

  test('Test if target is not defined', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    delete rpcDataCopy.target;
    expect(Number(template.target).toFixed(9)).toBe('1.1042625655198232e+71');
    expect(template.difficulty.toFixed(9)).toBe('0.000244141');
  });

  test('Test template difficulty calculation', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    expect(template.difficulty.toFixed(9)).toBe('0.000244141');
  });

  test('Test generation transaction handling', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    expect(template.generation.length).toBe(2);
    expect(template.generation[0].slice(0, -5)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(template.generation[1]).toStrictEqual(Buffer.from('000000000200f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test coinbase serialization [1]', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    const extraNonce1 = Buffer.from('01', 'hex');
    const extraNonce2 = Buffer.from('00', 'hex');
    const coinbase = template.handleCoinbase(extraNonce1, extraNonce2);
    expect(coinbase.slice(0, 44)).toStrictEqual(Buffer.from('04000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0f5104', 'hex'));
    expect(coinbase.slice(49, 51)).toStrictEqual(Buffer.from('0100', 'hex'));
    expect(coinbase.slice(51)).toStrictEqual(Buffer.from('000000000200f2052a01000000160014e8df018c7e326cc253faac7e46cdc51e68542c420000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf900000000', 'hex'));
  });

  test('Test coinbase serialization [2]', () => {
    const coinbaseBuffer = Buffer.from('01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff020101ffffffff0100f2052a010000001976a914614ca2f0f4baccdd63f45a0e0e0ff7ffb88041fb88ac00000000', 'hex');
    const hashDigest = Algorithms.sha256d.hash();
    const coinbaseHash = hashDigest(coinbaseBuffer);
    expect(coinbaseHash).toStrictEqual(Buffer.from('afd031100bff85a9ac01f1718be0b3d6c20228592f0242ea1e4d91a519b53031', 'hex'));
  });

  test('Test header serialization [1]', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    const merkleRoot = '3130b519a5914d1eea42022f592802c2d6b3e08b71f101aca985ff0b1031d0af';
    const time = '6036c54f'.toString('hex');
    const nonce = 'fe1a0000'.toString('hex');
    const headerBuffer = template.handleHeader(template.rpcData.version, merkleRoot, time, nonce);
    expect(headerBuffer).toStrictEqual(Buffer.from('00000020e22777bc309503ee6be3c65f370ba629b6497dbe8b804cbd8365ef83fbae199700060003000008000701000100010000000908050000000001000301000000004fc53660f0ff0f1e00001afe', 'hex'));
  });

  test('Test header serialization [2]', () => {
    const headerBuffer = Buffer.from('00000020e22777bc309503ee6be3c65f370ba629b6497dbe8b804cbd8365ef83fbae1997afd031100bff85a9ac01f1718be0b3d6c20228592f0242ea1e4d91a519b530314fc53660f0ff0f1e00001afe', 'hex');
    const hashDigest = Algorithms.sha256d.hash();
    const headerHash = hashDigest(headerBuffer, 1614202191);
    expect(headerHash).toStrictEqual(Buffer.from('6927c80704a1616664c5c91157d895587ac0381976010411cbec9aade2f75a1d', 'hex'));
  });

  test('Test block serialization [1]', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    const headerBuffer = Buffer.from('00000020e22777bc309503ee6be3c65f370ba629b6497dbe8b804cbd8365ef83fbae1997afd031100bff85a9ac01f1718be0b3d6c20228592f0242ea1e4d91a519b530314fc53660f0ff0f1e00001afe', 'hex');
    const coinbase = Buffer.from('01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff020101ffffffff0100f2052a010000001976a914614ca2f0f4baccdd63f45a0e0e0ff7ffb88041fb88ac00000000', 'hex');
    const templateHex = template.handleBlocks(headerBuffer, coinbase, null, null);
    expect(templateHex).toStrictEqual(Buffer.from('00000020e22777bc309503ee6be3c65f370ba629b6497dbe8b804cbd8365ef83fbae1997afd031100bff85a9ac01f1718be0b3d6c20228592f0242ea1e4d91a519b530314fc53660f0ff0f1e00001afe0201000000010000000000000000000000000000000000000000000000000000000000000000ffffffff020101ffffffff0100f2052a010000001976a914614ca2f0f4baccdd63f45a0e0e0ff7ffb88041fb88ac000000000100000001cba672d0bfdbcc441d171ef0723a191bf050932c6f8adc8a05b0cac2d1eb022f010000006c493046022100a23472410d8fd7eabf5c739bdbee5b6151ff31e10d5cb2b52abeebd5e9c06977022100c2cdde5c632eaaa1029dff2640158aaf9aab73fa021ed4a48b52b33ba416351801210212ee0e9c79a72d88db7af3fed18ae2b7ca48eaed995d9293ae0f94967a70cdf6ffffffff02905f0100000000001976a91482db4e03886ee1225fefaac3ee4f6738eb50df9188ac00f8a093000000001976a914c94f5142dd7e35f5645735788d0fe1343baf146288ac00000000', 'hex'));
  });

  test('Test block serialization [2]', () => {
    const headerBuffer = Buffer.from('00000020e22777bc309503ee6be3c65f370ba629b6497dbe8b804cbd8365ef83fbae1997afd031100bff85a9ac01f1718be0b3d6c20228592f0242ea1e4d91a519b530314fc53660f0ff0f1e00001afe', 'hex');
    const hashDigest = Algorithms.sha256d.hash();
    const blockHash = hashDigest(headerBuffer, 1614202191);
    expect(blockHash).toStrictEqual(Buffer.from('6927c80704a1616664c5c91157d895587ac0381976010411cbec9aade2f75a1d', 'hex'));
  });

  test('Test template submission', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    const extraNonce1 = Buffer.from('01', 'hex');
    const extraNonce2 = Buffer.from('00', 'hex');
    const time = '6036c54f'.toString('hex');
    const nonce = 'fe1a0000'.toString('hex');
    const templateSubmitted1 = template.handleSubmissions([extraNonce1, extraNonce2, time, nonce]);
    const templateSubmitted2 = template.handleSubmissions([extraNonce1, extraNonce2, time, nonce]);
    expect(templateSubmitted1).toBe(true);
    expect(templateSubmitted2).toBe(false);
  });

  test('Test current job parameters [1]', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    const jobParams = [
      template.jobId,
      template.previous,
      template.generation[0].toString('hex'),
      template.generation[1].toString('hex'),
      utils.getMerkleSteps(template.rpcData.transactions).map((step) => step.toString('hex')),
      utils.packInt32BE(template.rpcData.version).toString('hex'),
      template.rpcData.bits,
      utils.packInt32BE(template.rpcData.curtime).toString('hex'),
      true
    ];
    const currentParams = template.handleParameters(true);
    expect(currentParams).toStrictEqual(jobParams);
  });

  test('Test current job parameters [2]', () => {
    const template = new Template(jobId.toString(16), configCopy, rpcDataCopy, extraNonce);
    const jobParams = [
      template.jobId,
      template.previous,
      template.generation[0].toString('hex'),
      template.generation[1].toString('hex'),
      utils.getMerkleSteps(template.rpcData.transactions).map((step) => step.toString('hex')),
      utils.packInt32BE(template.rpcData.version).toString('hex'),
      template.rpcData.bits,
      utils.packInt32BE(template.rpcData.curtime).toString('hex'),
      true
    ];
    template.jobParams = jobParams;
    const currentParams = template.handleParameters(true);
    expect(currentParams).toStrictEqual(jobParams);
  });
});
