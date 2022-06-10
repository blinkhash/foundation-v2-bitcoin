const Algorithms = require('./algorithms');
const Template = require('./template');
const events = require('events');
const fastRoot = require('merkle-lib/fastRoot');
const utils = require('./utils');

////////////////////////////////////////////////////////////////////////////////

// Main Manager Function
const Manager = function(config, configMain) {

  const _this = this;
  this.config = config;
  this.configMain = configMain;

  // Job Variables
  this.validJobs = {};
  this.jobCounter = utils.jobCounter();
  this.currentJob = null;

  // ExtraNonce Variables
  this.extraNonceCounter = utils.extraNonceCounter(4);
  this.extraNoncePlaceholder = Buffer.from('f000000ff111111f', 'hex');
  this.extraNonce2Size = _this.extraNoncePlaceholder.length - _this.extraNonceCounter.size;

  // Check if New Block is Processed
  this.handleTemplate = function(rpcData, newBlock) {

    // If Current Job !== Previous Job
    let isNewBlock = _this.currentJob === null;
    if (!isNewBlock && rpcData.height >= _this.currentJob.rpcData.height &&
        ((_this.currentJob.rpcData.previousblockhash !== rpcData.previousblockhash) ||
        (_this.currentJob.rpcData.bits !== rpcData.bits))) {
      isNewBlock = true;
    }

    // Build New Block Template
    if (!isNewBlock && !newBlock) return false;
    const tmpTemplate = new Template(
      _this.jobCounter.next(),
      _this.config,
      Object.assign({}, rpcData),
      _this.extraNoncePlaceholder);

    // Update Current Template
    _this.validJobs = {};
    _this.currentJob = tmpTemplate;
    _this.emit('manager.block.new', tmpTemplate);
    _this.validJobs[tmpTemplate.jobId] = tmpTemplate;
    return true;
  };

  // Process Submitted Share
  this.handleShare = function(
    jobId, previousDifficulty, difficulty, ipAddress, port, addrPrimary,
    addrAuxiliary, submission) {

    // Main Submission Variables
    const identifier = _this.configMain.identifier || '';
    const submitTime = Date.now() / 1000 | 0;
    const job = _this.validJobs[jobId];
    const nTimeInt = parseInt(submission.nTime, 16);

    // Establish Hashing Algorithms
    const headerDigest = Algorithms.sha256d.hash();
    const coinbaseDigest = Algorithms.sha256d.hash();
    const blockDigest = Algorithms.sha256d.hash();

    // Share is Invalid
    const shareError = function(error) {
      _this.emit('manager.share', {
        job: jobId,
        ip: ipAddress,
        port: port,
        addrPrimary: addrPrimary,
        addrAuxiliary: addrAuxiliary,
        difficulty: difficulty,
        identifier: identifier,
        error: error[1],
      }, false);
      return { error: error, response: null };
    };

    // Edge Cases to Check if Share is Invalid
    if (typeof job === 'undefined' || job.jobId != jobId) {
      return shareError([21, 'job not found']);
    }
    if (submission.extraNonce2.length / 2 !== _this.extraNonce2Size) {
      return shareError([20, 'incorrect size of extranonce2']);
    }
    if (submission.nTime.length !== 8) {
      return shareError([20, 'incorrect size of ntime']);
    }
    if (nTimeInt < job.rpcData.curtime || nTimeInt > submitTime + 7200) {
      return shareError([20, 'ntime out of range']);
    }
    if (submission.nonce.length !== 8) {
      return shareError([20, 'incorrect size of nonce']);
    }
    if (!addrPrimary) {
      return shareError([20, 'worker address isn\'t set properly']);
    }
    if (!job.handleSubmissions([submission.extraNonce1, submission.extraNonce2, submission.nTime, submission.nonce])) {
      return shareError([22, 'duplicate share']);
    }

    // Check for AsicBoost Support
    let version = job.rpcData.version;
    if (submission.asicboost && submission.versionBit !== undefined) {
      const vBit = parseInt('0x' + submission.versionBit);
      const vMask = parseInt('0x' + submission.versionMask);
      if ((vBit & ~vMask) !== 0) {
        return shareError([20, 'invalid version bit']);
      }
      version = (version & ~vMask) | (vBit & vMask);
    }

    // Establish Share Information
    let blockValid = false;
    const extraNonce1Buffer = Buffer.from(submission.extraNonce1, 'hex');
    const extraNonce2Buffer = Buffer.from(submission.extraNonce2, 'hex');

    // Generate Coinbase Buffer
    const coinbaseBuffer = job.handleCoinbase(extraNonce1Buffer, extraNonce2Buffer);
    const coinbaseHash = coinbaseDigest(coinbaseBuffer);
    const hashes = utils.convertHashToBuffer(job.rpcData.transactions);
    const transactions = [coinbaseHash].concat(hashes);
    const merkleRoot = fastRoot(transactions, utils.sha256d);

    // Start Generating Block Hash
    const headerBuffer = job.handleHeader(version, merkleRoot, submission.nTime, submission.nonce);
    const headerHash = headerDigest(headerBuffer, nTimeInt);
    const headerBigInt = utils.bufferToBigInt(utils.reverseBuffer(headerHash));

    // Calculate Share Difficulty
    const shareMultiplier = Algorithms.sha256d.multiplier;
    const shareDiff = Algorithms.sha256d.diff / Number(headerBigInt) * shareMultiplier;
    const blockDiffAdjusted = job.difficulty * Algorithms.sha256d.multiplier;
    const blockHash = utils.reverseBuffer(blockDigest(headerBuffer, submission.nTime)).toString('hex');
    const blockHex = job.handleBlocks(headerBuffer, coinbaseBuffer).toString('hex');

    // Check if Share is Valid Block Candidate
    if (job.target >= headerBigInt) {
      blockValid = true;
    } else {
      if (shareDiff / difficulty < 0.99) {
        if (previousDifficulty && shareDiff >= previousDifficulty) {
          difficulty = previousDifficulty;
        } else {
          return shareError([23, 'low difficulty share of ' + shareDiff]);
        }
      }
    }

    // Build Primary Share Object Data
    const shareData = {
      job: jobId,
      ip: ipAddress,
      port: port,
      addrPrimary: addrPrimary,
      addrAuxiliary: addrAuxiliary,
      blockDiffPrimary : blockDiffAdjusted,
      blockType: blockValid ? 'primary' : 'share',
      coinbase: coinbaseBuffer,
      difficulty: difficulty,
      hash: blockHash,
      hex: blockHex,
      header: headerHash,
      headerDiff: headerBigInt,
      height: job.rpcData.height,
      identifier: identifier,
      reward: job.rpcData.coinbasevalue,
      shareDiff: shareDiff.toFixed(8),
    };

    const auxShareData = {
      job: jobId,
      ip: ipAddress,
      port: port,
      addrPrimary: addrPrimary,
      addrAuxiliary: addrAuxiliary,
      blockDiffPrimary : blockDiffAdjusted,
      blockType: 'auxiliary',
      coinbase: coinbaseBuffer,
      difficulty: difficulty,
      hash: blockHash,
      hex: blockHex,
      header: headerHash,
      headerDiff: headerBigInt,
      identifier: identifier,
      shareDiff: shareDiff.toFixed(8),
    };

    _this.emit('manager.share', shareData, auxShareData, blockValid);
    return { error: null, hash: blockHash, hex: blockHex, response: true };
  };
};

module.exports = Manager;
Manager.prototype.__proto__ = events.EventEmitter.prototype;
