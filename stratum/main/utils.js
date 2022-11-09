const bchaddr = require('bchaddrjs');
const bech32 = require('bech32');
const bs58check = require('bs58check');
const crypto = require('crypto');
const merkleTree = require('merkle-lib');
const merkleProof = require('merkle-lib/proof');
const net = require('net');

////////////////////////////////////////////////////////////////////////////////

// Convert Address to Script
exports.addressToScript = function(addr, network) {
  if ((network || {}).coin === 'bch' && bchaddr.isCashAddress(addr)) {
    const processed = bchaddr.toLegacyAddress(addr);
    return exports.decodeAddress(processed, network || {});
  } else if (typeof (network || {}).coin !== 'undefined') {
    return exports.decodeAddress(addr, network || {});
  } else {
    const processed = exports.decodeBase58Address(addr).hash;
    return exports.encodeAddress(processed, 'pubkey');
  }
};

// Convert Bits into Target BigInt
exports.bigIntFromBitsBuffer = function(bitsBuff) {
  const numBytes = bitsBuff.readUInt8(0);
  const bigBits = exports.bufferToBigInt(bitsBuff.slice(1));
  return bigBits * (BigInt(2) ** (BigInt(8) * BigInt(numBytes - 3)));
};

// Convert Bits into Target BigInt
exports.bigIntFromBitsHex = function(bitsString) {
  const bitsBuff = Buffer.from(bitsString, 'hex');
  return exports.bigIntFromBitsBuffer(bitsBuff);
};

// Convert Buffer to BigInt
exports.bufferToBigInt = function(buffer, start = 0, end = buffer.length) {
  const hexStr = buffer.slice(start, end).toString('hex');
  return BigInt(`0x${hexStr}`);
};

// Check if Host/Port is Active
exports.checkConnection = function(host, port, timeout) {
  return new Promise((resolve, reject) => {
    timeout = timeout || 10000;
    const timer = setTimeout(() => {
      reject('timeout');
      /* eslint-disable-next-line no-use-before-define */
      socket.end();
    }, timeout);
    const socket = net.createConnection(port, host, () => {
      clearTimeout(timer);
      resolve();
      socket.end();
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
};

// Convert Transaction Hashes to Buffers
exports.convertHashToBuffer = function(txs) {
  const txHashes = txs.map((tx) => {
    if (tx.txid !== undefined) return exports.uint256BufferFromHash(tx.txid);
    return exports.uint256BufferFromHash(tx.hash);
  });
  return txHashes;
};

// Determine Type + Decode Any Address
exports.decodeAddress = function(address, network) {

  // Try to Decode Base58 Address
  try {
    const decoded = exports.decodeBase58Address(address);
    if (decoded) {
      if (decoded.version === (network.pubKeyHash || 0x00)) return exports.encodeAddress(decoded.hash, 'pubkey');
      if (decoded.version === (network.scriptHash || 0x05)) {
        return exports.encodeAddress(decoded.hash, 'script');
      }
    }
  /* eslint-disable-next-line no-empty */
  } catch(e) {}

  // Try to Decode Bech32 Address
  try {
    const decoded = exports.decodeBech32Address(address);
    if (decoded.prefix !== (network.bech32 || 'bc')) throw new Error(`The address (${ address }) given has an invalid prefix`);
    if (decoded) {
      if (decoded.data.length === 20) return exports.encodeAddress(decoded.data, 'witnesspubkey');
      if (decoded.data.length === 32) return exports.encodeAddress(decoded.data, 'witnessscript');
    }
  /* eslint-disable-next-line no-empty */
  } catch(e) {}

  // Invalid Address Specified
  throw new Error(`The address (${ address }) given has no matching address script`);
};

// Decode Any Base58 Address
exports.decodeBase58Address = function(address) {
  const payload = bs58check.decode(address);
  if (payload.length < 21) throw new Error(`The address (${ address }) given is too short`);
  if (payload.length > 22) throw new Error(`The address (${ address }) given is too long`);
  const version = payload.length === 22 ? payload.readUInt16BE(0) : payload[0];
  const hash = payload.slice(payload.length === 22 ? 2 : 1);
  return { version: version, hash: hash };
};

// Decode Any Bech32 Address
exports.decodeBech32Address = function (address) {
  const payload = bech32.decode(address);
  const data = bech32.fromWords(payload.words.slice(1));
  return { version: payload.words[0], prefix: payload.prefix, data: Buffer.from(data) };
};

// Encode Input Buffer Data
exports.encodeAddress = function(address, type) {
  switch(type) {
  case 'pubkey':
    return exports.encodeChunks([
      exports.getBitcoinOPCodes('OP_DUP'),
      exports.getBitcoinOPCodes('OP_HASH160'), address,
      exports.getBitcoinOPCodes('OP_EQUALVERIFY'),
      exports.getBitcoinOPCodes('OP_CHECKSIG'),
    ]);
  case 'script':
    return exports.encodeChunks([
      exports.getBitcoinOPCodes('OP_HASH160'), address,
      exports.getBitcoinOPCodes('OP_EQUAL'),
    ]);
  case 'witnesspubkey':
    return exports.encodeChunks([
      exports.getBitcoinOPCodes('OP_0'), address,
    ]);
  case 'witnessscript':
    return exports.encodeChunks([
      exports.getBitcoinOPCodes('OP_0'), address,
    ]);
  }
};

// Encode Input Buffer Data
exports.encodeBuffer = function(buffer, number, offset) {
  const size = exports.getEncodingLength(number);
  if (size === 1) {
    buffer.writeUInt8(number, offset);
  } else if (size === 2) {
    buffer.writeUInt8(exports.getBitcoinOPCodes('OP_PUSHDATA1'), offset);
    buffer.writeUInt8(number, offset + 1);
  } else if (size === 3) {
    buffer.writeUInt8(exports.getBitcoinOPCodes('OP_PUSHDATA2'), offset);
    buffer.writeUInt16LE(number, offset + 1);
  } else {
    buffer.writeUInt8(exports.getBitcoinOPCodes('OP_PUSHDATA4'), offset);
    buffer.writeUInt32LE(number, offset + 1);
  }
  return size;
};

// Encode Input Address Chunks
exports.encodeChunks = function(chunks) {

  // Reduce Chunk Data to Buffer
  const bufferSize = chunks.reduce((accum, chunk) => {
    if (Buffer.isBuffer(chunk)) {
      if (chunk.length === 1 && exports.getMinimalOPCodes(chunk) !== undefined) {
        return accum + 1;
      }
      return accum + exports.getEncodingLength(chunk.length) + chunk.length;
    }
    return accum + 1;
  }, 0.0);

  let offset = 0;
  const buffer = Buffer.allocUnsafe(bufferSize);

  // Encode + Write Individual Chunks to Buffer
  chunks.forEach((chunk) => {
    if (Buffer.isBuffer(chunk)) {
      const opcode = exports.getMinimalOPCodes(chunk);
      if (opcode !== undefined) {
        buffer.writeUInt8(opcode, offset);
        offset += 1;
        return;
      }
      offset += exports.encodeBuffer(buffer, chunk.length, offset);
      chunk.copy(buffer, offset);
      offset += chunk.length;
    } else {
      buffer.writeUInt8(chunk, offset);
      offset += 1;
    }
  });

  if (offset !== buffer.length) throw new Error('The pool could not decode the chunks of the given address');
  return buffer;
};

// Generate Unique ExtraNonce for each Subscriber
/* istanbul ignore next */
exports.extraNonceCounter = function(size) {
  return {
    size: size,
    next: function() {
      return(crypto.randomBytes(this.size).toString('hex'));
    }
  };
};

// Calculate Merkle Hash Position
// https://github.com/p2pool/p2pool/blob/53c438bbada06b9d4a9a465bc13f7694a7a322b7/p2pool/bitcoin/data.py#L218
// https://stackoverflow.com/questions/8569113/why-1103515245-is-used-in-rand
exports.getAuxMerklePosition = function(chain_id, size) {
  return (1103515245 * chain_id + 1103515245 * 12345 + 12345) % size;
};

// Calculate PushData OPCodes
exports.getBitcoinOPCodes = function(type) {
  switch(type) {
  case 'OP_0':
    return 0;
  case 'OP_PUSHDATA1':
    return 76;
  case 'OP_PUSHDATA2':
    return 77;
  case 'OP_PUSHDATA4':
    return 78;
  case 'OP_1NEGATE':
    return 79;
  case 'OP_RESERVED':
    return 80;
  case 'OP_DUP':
    return 118;
  case 'OP_EQUAL':
    return 135;
  case 'OP_EQUALVERIFY':
    return 136;
  case 'OP_HASH160':
    return 169;
  case 'OP_CHECKSIG':
    return 172;
  default:
    return 0;
  }
};

// Calculate Encoding Length
exports.getEncodingLength = function(data) {
  return data < exports.getBitcoinOPCodes('OP_PUSHDATA1') ? 1
    : data <= 0xff ? 2
      : data <= 0xffff ? 3
        : 5;
};

// Calculate Merkle Steps for Transactions
exports.getMerkleSteps = function(transactions) {
  const hashes = exports.convertHashToBuffer(transactions);
  const merkleData = [Buffer.from([], 'hex')].concat(hashes);
  const merkleTreeFull = merkleTree(merkleData, exports.sha256d);
  return merkleProof(merkleTreeFull, merkleData[0]).slice(1, -1).filter((node) => node !== null);
};

// Calculate Minimal OPCodes for Buffer
exports.getMinimalOPCodes = function(buffer) {
  if (buffer.length === 0) return exports.getBitcoinOPCodes('OP_0');
  if (buffer.length !== 1) return;
  if (buffer[0] >= 1 && buffer[0] <= 16) {
    return exports.getBitcoinOPCodes('OP_RESERVED') + buffer[0];
  }
  if (buffer[0] === 0x81) return exports.getBitcoinOPCodes('OP_1NEGATE');
};

// Calculate Equihash Solution Length
exports.getSolutionLength = function(nParam, kParam) {
  switch(`${nParam}_${kParam}`) {
  case '125_4':
    return 106;
  case '144_5':
    return 202;
  case '192_7':
    return 806;
  case '200_9':
    return 2694;
  }
};

// Calculate Equihash Solution Slice
exports.getSolutionSlice = function(nParam, kParam) {
  switch(`${nParam}_${kParam}`) {
  case '125_4':
    return 2;
  case '144_5':
    return 2;
  case '192_7':
    return 6;
  case '200_9':
    return 6;
  }
};

// Check if Input is Hex String
exports.isHexString = function(s) {
  const check = String(s).toLowerCase();
  if(check.length % 2) {
    return false;
  }
  for (let i = 0; i < check.length; i = i + 2) {
    const c = check[i] + check[i+1];
    if (!exports.isHex(c))
      return false;
  }
  return true;
};

// Check if Input is Hex
exports.isHex = function(c) {
  const a = parseInt(c,16);
  let b = a.toString(16).toLowerCase();
  if(b.length % 2) {
    b = '0' + b;
  }
  if (b !== c) {
    return false;
  }
  return true;
};

// Generate Unique Job for each Template
/* istanbul ignore next */
exports.jobCounter = function() {
  return {
    counter: 0,
    next: function() {
      this.counter += 1;
      if (this.counter % 0xffff === 0) {
        this.counter = 1;
      }
      return this.cur();
    },
    cur: function() {
      return this.counter.toString(16);
    }
  };
};

// Alloc/Write UInt16LE
exports.packUInt16LE = function(num) {
  const buff = Buffer.alloc(2);
  buff.writeUInt16LE(num, 0);
  return buff;
};

// Alloc/Write UInt16LE
exports.packUInt16BE = function(num) {
  const buff = Buffer.alloc(2);
  buff.writeUInt16BE(num, 0);
  return buff;
};

// Alloc/Write UInt32LE
exports.packUInt32LE = function(num) {
  const buff = Buffer.alloc(4);
  buff.writeUInt32LE(num, 0);
  return buff;
};

// Alloc/Write UInt32BE
exports.packUInt32BE = function(num) {
  const buff = Buffer.alloc(4);
  buff.writeUInt32BE(num, 0);
  return buff;
};

// Alloc/Write Int64LE
exports.packUInt64LE = function(num) {
  const buff = Buffer.alloc(8);
  buff.writeUInt32LE(num % Math.pow(2, 32), 0);
  buff.writeUInt32LE(Math.floor(num / Math.pow(2, 32)), 4);
  return buff;
};

// Alloc/Write Int64LE
exports.packUInt64BE = function(num) {
  const buff = Buffer.alloc(8);
  buff.writeUInt32BE(Math.floor(num / Math.pow(2, 32)), 0);
  buff.writeUInt32BE(num % Math.pow(2, 32), 4);
  return buff;
};

// Alloc/Write Int32LE
exports.packInt32LE = function(num) {
  const buff = Buffer.alloc(4);
  buff.writeInt32LE(num, 0);
  return buff;
};

// Alloc/Write Int32BE
exports.packInt32BE = function(num) {
  const buff = Buffer.alloc(4);
  buff.writeInt32BE(num, 0);
  return buff;
};

// Convert PubKey to Script
exports.pubkeyToScript = function(key){
  if (key.length !== 66) throw new Error(`The pubkey (${ key }) is invalid`);
  const pubKey = Buffer.concat([Buffer.from([0x21]), Buffer.alloc(33), Buffer.from([0xac])]);
  const bufferKey = Buffer.from(key, 'hex');
  bufferKey.copy(pubKey, 1);
  return pubKey;
};

// Range Function
exports.range = function(start, stop, step) {
  if (typeof step === 'undefined') {
    step = 1;
  }
  if (typeof stop === 'undefined') {
    stop = start;
    start = 0;
  }
  if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
    return [];
  }
  const result = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
    result.push(i);
  }
  return result;
};

// Reverse Input Buffer
exports.reverseBuffer = function(buff) {
  const reversed = Buffer.alloc(buff.length);
  for (let i = buff.length - 1; i >= 0; i--) {
    reversed[buff.length - i - 1] = buff[i];
  }
  return reversed;
};

// Reverse Byte Order of Input Buffer
exports.reverseByteOrder = function(buff) {
  for (let i = 0; i < 8; i += 1) {
    buff.writeUInt32LE(buff.readUInt32BE(i * 4), i * 4);
  }
  return exports.reverseBuffer(buff);
};

// Reverse Input Buffer + Hex String
exports.reverseHex = function(hex) {
  return exports.reverseBuffer(Buffer.from(hex, 'hex')).toString('hex');
};

// Round to # of Digits Given
exports.roundTo = function(n, digits) {
  if (!digits) {
    digits = 0;
  }
  const multiplicator = Math.pow(10, digits);
  n = parseFloat((n * multiplicator).toFixed(11));
  const test = Math.round(n) / multiplicator;
  return +(test.toFixed(digits));
};

// Serialize Height/Date Input
/* istanbul ignore next */
exports.serializeNumber = function(n) {
  if (n >= 1 && n <= 16) {
    return Buffer.from([0x50 + n]);
  }
  let l = 1;
  const buff = Buffer.alloc(9);
  while (n > 0x7f) {
    buff.writeUInt8(n & 0xff, l++);
    n >>= 8;
  }
  buff.writeUInt8(l, 0);
  buff.writeUInt8(n, l++);
  return buff.slice(0, l);
};

// Serialize Strings used for Signature
/* istanbul ignore next */
exports.serializeString = function(s) {
  if (s.length < 253) {
    return Buffer.concat([
      Buffer.from([s.length]),
      Buffer.from(s)
    ]);
  } else if (s.length < 0x10000) {
    return Buffer.concat([
      Buffer.from([253]),
      exports.packUInt16LE(s.length),
      Buffer.from(s)
    ]);
  } else if (s.length < 0x100000000) {
    return Buffer.concat([
      Buffer.from([254]),
      exports.packUInt32LE(s.length),
      Buffer.from(s)
    ]);
  } else {
    return Buffer.concat([
      Buffer.from([255]),
      exports.packUInt16LE(s.length),
      Buffer.from(s)
    ]);
  }
};

// Hash Input w/ Sha256
exports.sha256 = function(buffer) {
  const hash1 = crypto.createHash('sha256');
  hash1.update(buffer);
  return hash1.digest();
};

// Hash Input w/ Sha256d
exports.sha256d = function(buffer) {
  return exports.sha256(exports.sha256(buffer));
};

// Generate Reverse Buffer from Input Hash
exports.uint256BufferFromHash = function(hex) {
  let fromHex = Buffer.from(hex, 'hex');
  if (fromHex.length != 32) {
    const empty = Buffer.alloc(32);
    empty.fill(0);
    fromHex.copy(empty);
    fromHex = empty;
  }
  return exports.reverseBuffer(fromHex);
};

// Generate VarInt Buffer
exports.varIntBuffer = function(n) {
  if (n < 0xfd) {
    return Buffer.from([n]);
  } else if (n <= 0xffff) {
    const buff = Buffer.alloc(3);
    buff[0] = 0xfd;
    exports.packUInt16LE(n).copy(buff, 1);
    return buff;
  } else if (n <= 0xffffffff) {
    const buff = Buffer.alloc(5);
    buff[0] = 0xfe;
    exports.packUInt32LE(n).copy(buff, 1);
    return buff;
  } else {
    const buff = Buffer.alloc(9);
    buff[0] = 0xff;
    exports.packUInt64LE(n).copy(buff, 1);
    return buff;
  }
};

// Generate VarString Buffer
exports.varStringBuffer = function(string) {
  const strBuff = Buffer.from(string);
  return Buffer.concat([exports.varIntBuffer(strBuff.length), strBuff]);
};
