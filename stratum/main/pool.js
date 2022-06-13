const Algorithms = require('./algorithms');
const Daemon = require('../../daemon/main/daemon');
const Difficulty = require('./difficulty');
const Manager = require('./manager');
const Network = require('./network');
const Text = require('../../locales/index');
const events = require('events');
const utils = require('./utils');

////////////////////////////////////////////////////////////////////////////////

// Main Pool Function
const Pool = function(config, configMain, responseFn) {

  const _this = this;
  this.config = config;
  this.configMain = configMain;
  this.text = Text[configMain.language];

  // Pool Variables [1]
  this.difficulty = {};
  this.statistics = {};
  this.settings = {};
  this.responseFn = responseFn;

  // Pool Variables [2]
  this.primary = {};
  this.auxiliary = {
    enabled: _this.config.auxiliary && _this.config.auxiliary.enabled,
  };

  // Emit Logging Events
  this.emitLog = function(level, limiting, text) {
    if (!limiting || !process.env.forkId || process.env.forkId === '0') {
      _this.emit('pool.log', level, text);
      if (level === 'error') _this.responseFn(text);
    }
  };

  // Handle Worker Authentication
  this.authorizeWorker = function(ip, port, addrPrimary, addrAuxiliary, password, callback) {
    _this.checkPrimaryWorker(ip, port, addrPrimary, () => {
      _this.checkAuxiliaryWorker(ip, port, addrAuxiliary, (authAuxiliary) => {
        _this.emitLog('log', false, _this.text.stratumWorkersText1(addrPrimary, ip, port));
        callback({ error: null, authorized: authAuxiliary, disconnect: false });
      }, callback);
    }, callback);
  };

  // Check Daemon for Valid Address
  this.checkWorker = function(daemon, address, callback) {
    daemon.sendCommands([['validateaddress', [address.split('.')[0]]]], false, (results) => {
      callback(results.filter((result) => !result.error && result.response.isvalid).length > 0);
    });
  };

  // Check Primary Worker for Valid Address
  this.checkPrimaryWorker = function(ip, port, address, callback, callbackMain) {
    _this.checkWorker(_this.primary.daemon, address, (authorized) => {
      if (authorized) callback(authorized);
      else {
        _this.emitLog('log', false, _this.text.stratumWorkersText2(address, ip, port));
        callbackMain({ error: null, authorized: authorized, disconnect: false });
      }
    });
  };

  // Check Auxiliary Worker for Valid Address
  this.checkAuxiliaryWorker = function(ip, port, address, callback, callbackMain) {
    if (_this.auxiliary.enabled && address) {
      _this.checkWorker(_this.auxiliary.daemon, address, (authorized) => {
        if (authorized) callback(authorized);
        else {
          _this.emitLog('log', false, _this.text.stratumWorkersText2(address, ip, port));
          callbackMain({ error: null, authorized: authorized, disconnect: false });
        }
      });
    } else if (_this.auxiliary.enabled) {
      _this.emitLog('log', false, _this.text.stratumWorkersText2('<unknown>', ip, port));
      callbackMain({ error: null, authorized: false, disconnect: false });
    } else {
      callback(true);
    }
  };

  // Check if Submitted Block was Accepted
  this.checkAccepted = function(daemon, hash, callback) {
    daemon.sendCommands([['getblock', [hash]]], false, (results) => {
      const blocks = results.filter((result) => {
        return result.response && result.response.hash === hash && result.response.confirmations >= 0;
      });
      const response = blocks.length >= 1 ? blocks[0].response.tx[0] : null;
      if (blocks.length < 1) _this.emitLog('error', false, _this.text.stratumBlocksText1());
      callback(blocks.length >= 1, response);
    });
  };

  // Check if Auxiliary Share is a Valid Block Candidate
  this.checkAuxiliary = function(shareData) {
    if (_this.auxiliary.enabled) {
      const shareMultiplier = Algorithms.sha256d.multiplier;
      const shareDiff = Algorithms.sha256d.diff / Number(_this.auxiliary.rpcData.target);
      shareData.blockDiffAuxiliary = shareDiff * shareMultiplier;
      return _this.auxiliary.rpcData.target >= shareData.headerDiff;
    }
    return false;
  };

  // Check Percentage of Blockchain Downloaded
  this.checkDownloaded = function(daemon) {
    daemon.sendCommands([['getblockchaininfo', []]], false, (results) => {
      const blocks = Math.max(0, results
        .flatMap((result) => result.response)
        .flatMap((response) => response.blocks));
      daemon.sendCommands([['getpeerinfo', []]], true, (result) => {
        const peers = result.response;
        const totalBlocks = Math.max(0, peers.flatMap((response) => response.startingheight));
        const percent = (blocks / totalBlocks * 100).toFixed(2);
        _this.emitLog('warning', true, _this.text.stratumDownloadedText1(percent, peers.length));
      });
    });
  };

  // Process Primary Block Candidate
  this.handlePrimary = function(shareData, blockValid, callback) {

    // Block is Not Valid
    if (!blockValid) {
      callback(false, shareData);
      return;
    }

    // Submit Valid Block Candidate
    _this.submitPrimary(shareData.hex, (error, response) => {
      if (error) _this.emitLog('error', false, response);
      else {
        _this.emitLog('special', false, _this.text.stratumBlocksText4(_this.config.primary.coin.name, shareData.height));
        _this.checkAccepted(_this.primary.daemon, shareData.hash, (accepted, transaction) => {
          shareData.transaction = transaction;
          callback(accepted, shareData);
        });
      }
    });
  };

  // Process Primary Block Template
  this.handlePrimaryTemplate = function(newBlock, callback) {

    // Build Daemon Commands
    const rules = ['segwit'];
    const capabilities = ['coinbasetxn', 'workid', 'coinbase/append'];
    const commands = [['getblocktemplate', [{ 'capabilities': capabilities, 'rules': rules }]]];

    // Handle Primary Block Template Updates
    _this.primary.daemon.sendCommands(commands, true, (result) => {
      if (result.error) {
        _this.emitLog('error', false, _this.text.stratumTemplateText1(result.instance.host, JSON.stringify(result.error)));
        callback(result.error);
      } else {
        if (_this.auxiliary.enabled) {
          result.response.auxData = _this.auxiliary.rpcData;
        }
        const newBlockFound = _this.manager.handleTemplate(result.response, newBlock);
        callback(null, result.response, newBlockFound);
      }
    });
  };

  // Submit Primary Block to Blockchain
  this.submitPrimary = function(hexData, callback) {

    // Build Daemon Commands
    const commands = [['submitblock', [hexData]]];

    // Submit Block to Daemon
    _this.primary.daemon.sendCommands(commands, false, (results) => {
      for (let i = 0; i < results.length; i += 1) {
        const result = results[i];
        if (result.error) {
          callback(true, _this.text.stratumBlocksText2(result.instance.host, JSON.stringify(result.error)));
          return;
        } else if (result.response === 'rejected') {
          callback(true, _this.text.stratumBlocksText3(result.instance.host));
          return;
        }
      }
      callback(false, null);
    });
  };

  // Process Auxiliary Block Candidate
  this.handleAuxiliary = function(shareData, blockValid, callback) {

    // Block is Not Valid
    if (!blockValid) {
      callback(false, shareData);
      return;
    }

    // Submit Valid Block Candidate
    const hexData = Buffer.from(shareData.hex, 'hex').slice(0, 80);
    _this.submitAuxiliary(shareData, hexData, (error, response) => {
      if (error) _this.emitLog('error', false, response);
      else {
        _this.emitLog('special', false, _this.text.stratumBlocksText7(_this.config.auxiliary.coin.name, _this.auxiliary.rpcData.height));
        _this.checkAccepted(_this.auxiliary.daemon, _this.auxiliary.rpcData.hash, (accepted, transaction) => {
          shareData.transaction = transaction;
          shareData.height = _this.auxiliary.rpcData.height;
          shareData.reward = _this.auxiliary.rpcData.coinbasevalue;
          callback(accepted, shareData);
        });
      }
    });
  };

  // Process Auxiliary Block Template
  this.handleAuxiliaryTemplate = function(callback) {

    // Build Daemon Commands
    const commands = [['getauxblock', []]];

    // Handle Auxiliary Block Template Updates
    if (_this.auxiliary.enabled) {
      _this.auxiliary.daemon.sendCommands(commands, true, (result) => {
        if (result.error) {
          _this.emitLog('error', false, _this.text.stratumTemplateText2(result.instance.host, JSON.stringify(result.error)));
          callback(result.error);
        } else {
          const hash = result.response.target || result.response._target || '';
          const target = utils.uint256BufferFromHash(hash, { endian: 'little', size: 32 });
          const update = _this.auxiliary.rpcData && _this.auxiliary.rpcData.hash != result.response.hash;
          _this.auxiliary.rpcData = JSON.parse(JSON.stringify(result.response));
          _this.auxiliary.rpcData.target = utils.bufferToBigInt(target);
          callback(null, result.response, update);
        }
      });
    } else {
      callback(null, null, false);
    }
  };

  // Submit Auxiliary Block to Blockchain
  this.submitAuxiliary = function(shareData, hexData, callback) {

    // Build Coinbase Proof from Current Job Data
    const coinbaseProof = Buffer.concat([
      utils.varIntBuffer(_this.manager.currentJob.steps.length),
      Buffer.concat(_this.manager.currentJob.steps),
      utils.packInt32LE(0)
    ]);

    // Build Daemon Commands
    const auxProof = Buffer.concat([utils.varIntBuffer(0), utils.packInt32LE(0)]);
    const auxPow = Buffer.concat([ shareData.coinbase, shareData.header, coinbaseProof, auxProof, hexData ]);
    const commands = [['getauxblock', [_this.auxiliary.rpcData.hash, auxPow.toString('hex')]]];

    // Submit Block to Daemon
    _this.auxiliary.daemon.sendCommands(commands, false, (results) => {
      for (let i = 0; i < results.length; i += 1) {
        const result = results[i];
        if (result.error) {
          callback(true, _this.text.stratumBlocksText5(result.instance.host, JSON.stringify(result.error)));
          return;
        } else if (result.response === 'rejected') {
          callback(true, _this.text.stratumBlocksText6(result.instance.host));
          return;
        }
      }
      callback(false, null);
    });
  };

  // Build Stratum Daemons
  this.setupDaemons = function(callback) {

    // Load Daemons from Configuration
    const primaryDaemons = _this.config.primary.daemons;
    const auxiliaryEnabled = _this.config.auxiliary && _this.config.auxiliary.enabled;
    const auxiliaryDaemons = auxiliaryEnabled ? _this.config.auxiliary.daemons : [];

    // Build Daemon Instances
    _this.primary.daemon = new Daemon(primaryDaemons);
    _this.auxiliary.daemon = new Daemon(auxiliaryDaemons);

    // Initialize Daemons and Load Settings
    _this.primary.daemon.checkInstances(() => {
      _this.auxiliary.daemon.checkInstances(() => callback());
    });
  };

  // Setup Pool Ports
  this.setupPorts = function() {

    // Initiailize Each Port w/ VarDiff
    _this.config.ports.forEach((port) => {
      const difficultyInstance = new Difficulty(port.difficulty);
      if (port.port in _this.difficulty) _this.difficulty[port.port].removeAllListeners();
      _this.difficulty[port.port] = difficultyInstance;
      _this.difficulty[port.port].on('client.difficulty.new', (client, newDiff) => {
        client.enqueueDifficulty(newDiff);
      });
    });
  };

  // Setup Pool Settings
  this.setupSettings = function(callback) {

    // Build Daemon Commands
    const commands = [
      ['validateaddress', [_this.config.primary.address]],
      ['getmininginfo', []],
      ['getblockchaininfo', []],
      ['getnetworkinfo', []]];

    // Build Statistics/Settings w/ Daemon Response
    _this.primary.daemon.sendCommands(commands, true, (result) => {

      // Daemon Returned an Error
      if (!Array.isArray(result) && result.error) {
        _this.emitLog('error', false, _this.text.stratumSettingsText1(JSON.stringify(result.error)));
        return;
      }

      // Process Response of Each RPC Request
      const resultData = {};
      for (let i = 0; i < result.length; i++) {
        const request = commands[i][0];
        resultData[request] = result[i].response || result[i].error;
        if (result[i].error || !result[i].response) {
          _this.emitLog('error', false, _this.text.stratumSettingsText2(request, JSON.stringify(result[i].error)));
          return;
        }
      }

      // Check if Given Coin Address is Valid
      if (!resultData.validateaddress.isvalid) {
        _this.emitLog('error', false, _this.text.stratumSettingsText3());
        return;
      }

      // Check Current PoW Difficulty
      let difficulty = resultData.getblockchaininfo.difficulty;
      if (typeof(difficulty) == 'object') difficulty = difficulty['proof-of-work'];

      // Initialize Statistics/Settings
      _this.settings.testnet = (resultData.getblockchaininfo.chain === 'test') ? true : false;
      _this.statistics.connections = resultData.getnetworkinfo.connections;
      _this.statistics.difficulty = difficulty * Algorithms.sha256d.multiplier;
      _this.config.settings.testnet = _this.settings.testnet;

      callback();
    });
  };

  // Setup Pool Recipients
  this.setupRecipients = function() {

    // No Recipients Configured
    if (_this.config.primary.recipients.length === 0) {
      _this.emitLog('warning', false, _this.text.stratumRecipientsText1());
    }

    // Calculate Sum of All Recipients
    _this.statistics.feePercentage = 0;
    _this.config.primary.recipients.forEach((recipient) => {
      _this.statistics.feePercentage += recipient.percentage;
    });
  };

  // Setup Pool Job Manager
  this.setupManager = function() {

    // Establish Job Manager Instance
    _this.manager = new Manager(_this.config, _this.configMain);
    _this.manager.on('manager.block.new', (template) => {
      if (_this.network) _this.network.broadcastMiningJobs(template, true);
    });

    // Handle Shares on Submission
    _this.manager.on('manager.share', (shareData, auxShareData, blockValid) => {

      // Calculate Status of Submitted Share
      let shareType = 'valid';
      if (shareData.error && shareData.error === 'job not found') {
        shareType = 'stale';
      } else if (shareData.error) {
        shareType = 'invalid';
      }

      // Process Auxiliary Submission
      const auxBlockValid = _this.checkAuxiliary(auxShareData);
      if (shareType === 'valid' && auxBlockValid) {
        _this.handleAuxiliary(auxShareData, true, (accepted, outputData) => {
          _this.emit('pool.share', outputData, shareType, accepted);
          _this.emitLog('special', false, _this.text.stratumManagerText2());
        });
      }

      // Process Share/Primary Submission
      _this.handlePrimary(shareData, blockValid, (accepted, outputData) => {
        _this.emit('pool.share', outputData, shareType, accepted);
        _this.handlePrimaryTemplate(auxBlockValid, (error, result, newBlock) => {
          if (newBlock && blockValid) {
            _this.emitLog('special', false, _this.text.stratumManagerText1());
          }
        });
      });
    });
  };

  // Setup Primary Blockchain Connection
  this.setupPrimaryBlockchain = function(callback) {

    // Build Daemon Commands
    const rules = ['segwit'];
    const capabilities = ['coinbasetxn', 'workid', 'coinbase/append'];
    const commands = [['getblocktemplate', [{ 'capabilities': capabilities, 'rules': rules }]]];

    // Check if Blockchain is Fully Synced
    _this.primary.daemon.sendCommands(commands, false, (results) => {
      if (results.every((r) => !r.error || r.error.code !== -10)) {
        callback();
      } else {
        setTimeout(() => _this.setupPrimaryBlockchain(callback), 30000);
        _this.checkDownloaded(_this.primary.daemon);
      }
    });
  };

  // Setup Auxiliary Blockchain Connection
  this.setupAuxiliaryBlockchain = function(callback) {

    // Build Daemon Commands
    const commands = [['getauxblock', []]];

    // Check if Blockchain is Fully Synced
    if (_this.auxiliary.enabled) {
      _this.auxiliary.daemon.sendCommands(commands, false, (results) => {
        if (results.every((r) => !r.error || r.error.code !== -10)) {
          callback();
        } else {
          setTimeout(() => _this.setupAuxiliaryBlockchain(callback), 30000);
          _this.checkDownloaded(_this.auxiliary.daemon);
        }
      });
    } else {
      callback();
    }
  };

  // Setup First Job on Startup
  this.setupFirstJob = function(callback) {

    // Request Primary/Auxiliary Templates
    _this.handleAuxiliaryTemplate((error) => {
      if (error) _this.emitLog('error', false, _this.text.stratumFirstJobText1());
      else {
        _this.handlePrimaryTemplate(false, (error) => {
          if (error) _this.emitLog('error', false, _this.text.stratumFirstJobText1());
          else {
            _this.config.ports.forEach((port) => {
              if (_this.statistics.difficulty < port.difficulty.initial) {
                _this.emitLog('warning', true, _this.text.stratumFirstJobText2(_this.statistics.difficulty, port.port, port.difficulty.initial));
              }
            });
          }
          callback();
        });
      }
    });
  };

  // Setup Pool Block Polling
  this.setupBlockPolling = function() {

    // Build Initial Variables
    let pollingFlag = false;
    const pollingInterval = _this.config.settings.blockRefreshInterval;

    // Handle Polling Interval
    setInterval(() => {
      if (pollingFlag === false) {
        pollingFlag = true;
        _this.handleAuxiliaryTemplate((auxError, auxResult, auxUpdate) => {
          _this.handlePrimaryTemplate(auxUpdate, (error, result, update) => {
            pollingFlag = false;
            if (update) _this.emitLog('log', true, _this.text.stratumPollingText1(_this.config.primary.coin.name, result.height));
            if (auxUpdate) _this.emitLog('log', true, _this.text.stratumPollingText2(_this.config.auxiliary.coin.name, auxResult.height));
          });
        });
      }
    }, pollingInterval);
  };

  // Setup Pool Clients
  this.setupClients = function(client) {

    // Setup VarDiff on New Client
    if (typeof(_this.difficulty[client.socket.localPort]) !== 'undefined') {
      _this.difficulty[client.socket.localPort].handleClient(client);
    }

    // Handle Client Difficulty Events
    client.on('client.difficulty.queued', (diff) => {
      _this.emitLog('log', false, _this.text.stratumClientText1(client.addrPrimary, diff));
    });
    client.on('client.difficulty.updated', (diff) => {
      _this.difficulty[client.socket.localPort].clients[client.id] = [];
      _this.emitLog('log', false, _this.text.stratumClientText2(client.addrPrimary, diff));
    });

    // Handle Client Socket Events
    client.on('client.socket.malformed', (message) => {
      _this.emitLog('warning', false, _this.text.stratumClientText3(client.sendLabel(), message));
    });
    client.on('client.socket.flooded', () => {
      _this.emitLog('warning', false, _this.text.stratumClientText4(client.sendLabel()));
    });
    client.on('client.socket.error', (e) => {
      _this.emitLog('warning', false, _this.text.stratumClientText5(client.sendLabel(), JSON.stringify(e)));
    });
    client.on('client.socket.timeout', (e) => {
      _this.emitLog('warning', false, _this.text.stratumClientText6(client.sendLabel(), JSON.stringify(e)));
    });
    client.on('client.socket.disconnect', () => {
      _this.emitLog('warning', false, _this.text.stratumClientText7(client.sendLabel()));
    });

    // Handle Client Mining Events
    client.on('client.mining.unknown', (message) => {
      _this.emitLog('warning', false, _this.text.stratumClientText11(client.sendLabel(), message.method));
    });

    // Handle Client Banning Events
    client.on('client.ban.kicked', (banTime) => {
      _this.emitLog('warning', false, _this.text.stratumClientText8(client.sendLabel(), banTime));
    });
    client.on('client.ban.forgave', () => {
      _this.emitLog('log', false, _this.text.stratumClientText9(client.sendLabel()));
    });
    client.on('client.ban.trigger', () => {
      _this.emitLog('warning', false, _this.text.stratumClientText10(client.sendLabel()));
    });

    // Handle Client Subscription Events
    client.on('client.subscription', (params, callback) => {
      const extraNonce = _this.manager.extraNonceCounter.next();
      callback(null, extraNonce, _this.manager.extraNonce2Size);

      // Send Correct Initial Difficulty to Miner
      const validPorts = _this.config.ports
        .filter((port) => port.port === client.socket.localPort)
        .filter((port) => typeof port.difficulty.initial !== 'undefined');
      if (validPorts.length >= 1) client.broadcastDifficulty(validPorts[0].difficulty.initial);
      else client.broadcastDifficulty(8);

      // Send Mining Job Parameters to Miner
      const jobParams = _this.manager.currentJob.handleParameters(true);
      client.broadcastMiningJob(jobParams);
    });

    // Handle Client Submission Events
    client.on('client.submit', (message, callback) => {

      // Build Share Submission Data
      const submission = {
        extraNonce1: client.extraNonce1,
        extraNonce2: message.params[2],
        nTime: message.params[3],
        nonce: message.params[4],
        versionBit: message.params[5],
        versionMask: client.versionMask,
        asicboost: client.asicboost,
      };

      // Submit Share to Job Manager
      const result = _this.manager.handleShare(
        message.params[1],
        client.previousDifficulty,
        client.difficulty,
        client.socket.remoteAddress,
        client.socket.localPort,
        client.addrPrimary,
        client.addrAuxiliary,
        submission,
      );

      // Return Job Manager Response
      callback(result.error, result.response ? true : null);
    });
  };

  // Setup Pool Stratum Server
  this.setupNetwork = function(callback) {

    // Establish Job Manager Instance
    _this.network = new Network(_this.config, _this.configMain, _this.authorizeWorker);
    _this.network.on('network.started', () => {
      _this.statistics.ports = _this.config.ports
        .filter((port) => port.enabled)
        .flatMap((port) => port.port);
      _this.network.broadcastMiningJobs(_this.manager.currentJob, true);
      callback();
    });

    // Handle Periods Without Found Blocks/Shares
    _this.network.on('network.timeout', () => {
      _this.handlePrimaryTemplate(false, (error, rpcData, newBlock) => {
        _this.emitLog('debug', true, _this.text.stratumNetworkText1(_this.config.settings.jobRebroadcastTimeout / 1000));
        if (error || newBlock) return;
        _this.manager.updateCurrentJob(rpcData);
      });
    });

    // Handle New Client Connections
    _this.network.on('client.connected', (client) => {
      _this.setupClients(client);
      _this.emit('client.socket.success');
    });
  };
};

module.exports = Pool;
Pool.prototype.__proto__ = events.EventEmitter.prototype;
