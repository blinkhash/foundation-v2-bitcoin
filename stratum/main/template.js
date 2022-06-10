const Algorithms = require('./algorithms');
const Transactions = require('./transactions');
const utils = require('./utils');

////////////////////////////////////////////////////////////////////////////////

// Main Template Function
const Template = function(jobId, config, rpcData, placeholder) {

  const _this = this;
  this.jobId = jobId;
  this.config = config;
  this.rpcData = rpcData;
  this.submissions = [];

  // Template Variables
  this.target = _this.rpcData.target ? BigInt(`0x${ _this.rpcData.target }`) : utils.bigIntFromBitsHex(_this.rpcData.bits);
  this.difficulty = parseFloat((Algorithms.sha256d.diff / Number(_this.target)).toFixed(9));
  this.previous = utils.reverseByteOrder(Buffer.from(_this.rpcData.previousblockhash, 'hex')).toString('hex');
  this.generation = new Transactions(config).handleGeneration(rpcData, placeholder);
  this.steps = utils.getMerkleSteps(_this.rpcData.transactions);

  // Manage Serializing Block Headers
  this.handleHeader = function(version, merkleRoot, nTime, nonce) {

    // Initialize Header/Pointer
    let position = 0;
    let header = Buffer.alloc(80);

    // Append Data to Buffer
    header.write(nonce, position, 4, 'hex');
    header.write(_this.rpcData.bits, position += 4, 4, 'hex');
    header.write(nTime, position += 4, 4, 'hex');
    header.write(utils.reverseBuffer(merkleRoot).toString('hex'), position += 4, 32, 'hex');
    header.write(_this.rpcData.previousblockhash, position += 32, 32, 'hex');
    header.writeUInt32BE(version, position += 32);
    header = utils.reverseBuffer(header);
    return header;
  };

  // Manage Serializing Block Coinbase
  this.handleCoinbase = function(extraNonce1, extraNonce2) {
    return Buffer.concat([
      _this.generation[0],
      extraNonce1,
      extraNonce2,
      _this.generation[1],
    ]);
  };

  // Manage Serializing Block Objects
  this.handleBlocks = function(header, coinbase) {
    return Buffer.concat([
      header,
      utils.varIntBuffer(_this.rpcData.transactions.length + 1),
      coinbase,
      Buffer.concat(_this.rpcData.transactions.map((tx) => Buffer.from(tx.data, 'hex'))),
    ]);
  };

  // Manage Job Parameters for Clients
  this.handleParameters = function(cleanJobs) {
    return [
      _this.jobId,
      _this.previous,
      _this.generation[0].toString('hex'),
      _this.generation[1].toString('hex'),
      _this.steps.map((step) => step.toString('hex')),
      utils.packInt32BE(_this.rpcData.version).toString('hex'),
      _this.rpcData.bits,
      utils.packUInt32BE(_this.rpcData.curtime).toString('hex'),
      cleanJobs
    ];
  };

  // Check Previous Submissions for Duplicates
  this.handleSubmissions = function(header) {
    const submission = header.join('').toLowerCase();
    if (_this.submissions.indexOf(submission) === -1) {
      _this.submissions.push(submission);
      return true;
    }
    return false;
  };
};

module.exports = Template;
