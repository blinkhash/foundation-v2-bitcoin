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
const Pool = function(config, configMain, callback) {

  const _this = this;
  this.config = config;
  this.configMain = configMain;
  this.text = Text[configMain.language];

  // Pool Variables [1]
  this.difficulty = {};
  this.statistics = {};
  this.settings = {};
  this.callback = callback;

  // Pool Variables [2]
  this.primary = {
    payments: { enabled: _this.config.primary.payments &&
      _this.config.primary.payments.enabled }};
  this.auxiliary = {
    enabled: _this.config.auxiliary && _this.config.auxiliary.enabled,
    payments: { enabled: _this.config.auxiliary && _this.config.auxiliary.enabled &&
      _this.config.auxiliary.payments && _this.config.auxiliary.payments.enabled }};

  // Emit Logging Events
  this.emitLog = function(level, limiting, text) {
    if (!limiting || !process.env.forkId || process.env.forkId === '0') {
      _this.emit('pool.log', level, text);
      if (level === 'error') _this.callback(text);
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
  this.checkAuxiliary = function(shareData, auxShareData) {
    if (_this.auxiliary.enabled) {
      const shareMultiplier = Algorithms.sha256d.multiplier;
      const shareDiff = Algorithms.sha256d.diff / Number(_this.auxiliary.rpcData.target);
      shareData.blockDiffAuxiliary = shareDiff * shareMultiplier;
      auxShareData.blockDiffAuxiliary = shareDiff * shareMultiplier;
      return _this.auxiliary.rpcData.target >= auxShareData.headerDiff;
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
        const peersBlocks = peers.flatMap((response) => response.startingheight);
        const totalBlocks = peersBlocks.reduce((max, cur) => max >= cur ? max : cur);
        const percent = (blocks / totalBlocks * 100).toFixed(2);
        _this.emitLog('warning', true, _this.text.stratumDownloadedText1(percent, peers.length));
      });
    });
  };

  // Check Current Network Statistics
  this.checkNetwork = function(daemon, type, callback) {
    daemon.sendCommands([['getmininginfo', []]], true, (result) => {
      const response = result.response || {};
      callback({
        difficulty: response.difficulty || 0,
        hashrate: response.networkhashps || 0,
        height: response.blocks || 0,
        networkType: type,
      });
    });
  };

  // Handle Validating Worker Shares
  this.handleValidation = function(block, workers) {

    // Specify Block Features
    let totalWork = 0;
    const transactionFee = _this.config.primary.payments ?
      _this.config.primary.payments.transactionFee : 0;
    const maxTime = Math.max(...workers.flatMap((worker) => worker.times));
    const reward = block.reward - transactionFee;

    // Calculate Worker Percentage
    const validated = {};
    workers.forEach((worker) => {

      // Validate Shares for Workers w/ 51% Time
      let shares = worker.work;
      const timePeriod = utils.roundTo(worker.times / maxTime, 2);
      if (timePeriod < 0.51) {
        const lost = shares * (1 - timePeriod);
        shares = utils.roundTo(Math.max(shares - lost, 0), 2);
      }

      // Add Validated Shares to Records
      totalWork += shares;
      if (worker.miner in validated) validated[worker.miner] += shares;
      else validated[worker.miner] = shares;
    });

    // Determine Worker Rewards
    const updates = {};
    Object.keys(validated).forEach((address) => {
      const percentage = validated[address] / totalWork;
      const minerReward = utils.roundTo(reward * percentage, 8);
      if (address in updates) updates[address] += minerReward;
      else updates[address] = minerReward;
    });

    // Return Worker Rewards
    return updates;
  };

  // Process Primary Block Candidate
  this.handlePrimary = function(shareData, blockValid, callback) {

    // Block is Not Valid
    if (!blockValid) {
      callback(null, shareData);
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

  // Check for New Primary Block Template
  this.checkPrimaryTemplate = function(auxUpdate, callback) {

    // Build Daemon Commands
    const commands = [['getblockchaininfo', []]];

    // Check Saved Blockchain Data
    _this.primary.daemon.sendCommands(commands, true, (result) => {
      if (result.error) {
        _this.emitLog('error', false, _this.text.stratumTemplateText1(result.instance.host, JSON.stringify(result.error)));
        callback(result.error);
      } else if (!_this.primary.height || !_this.primary.previousblockhash) {
        _this.primary.height = result.response.blocks;
        _this.primary.previousblockhash = result.response.bestblockhash;
        callback(null, true);
      } else if ((_this.primary.height !== result.response.blocks) || (_this.primary.previousblockhash !== result.response.bestblockhash)) {
        _this.primary.height = result.response.blocks;
        _this.primary.previousblockhash = result.response.bestblockhash;
        callback(null, true);
      } else if (auxUpdate) {
        callback(null, true);
      } else {
        callback(null, false);
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
        if (_this.auxiliary.enabled) result.response.auxData = _this.auxiliary.rpcData;
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
      const rejected = results.filter((result) => result.response === 'rejected');
      const accepted = results.filter((result) => !result.error && result.response !== 'rejected');
      if (rejected.length >= 1) {
        callback('bad-primary-rejected', _this.text.stratumBlocksText3(rejected[0].instance.host));
      } else if (accepted.length < 1) {
        callback('bad-primary-orphan', _this.text.stratumBlocksText2(results[0].instance.host, JSON.stringify(results[0].error)));
      }
      callback(null, null);
    });
  };

  // Process Worker Payments for Primary Blocks
  this.handlePrimaryRounds = function(blocks, callback) {

    // Get Hashes for Each Transaction
    const commands = blocks.map((block) => ['gettransaction', [block.transaction]]);

    // Derive Details for Every Transaction
    _this.primary.daemon.sendCommands(commands, true, (result) => {
      if (result.error) {
        _this.emitLog('error', false, _this.text.stratumPaymentsText1(JSON.stringify(result.error)));
        callback(result.error, null);
        return;
      }

      // Handle Individual Transactions
      if (!Array.isArray(result)) result = [result];
      result.forEach((tx, idx) => {
        const block = blocks[idx] || {};

        // Check Daemon Edge Cases
        if (tx.error && tx.error.code === -5) {
          _this.emitLog('warning', false, _this.text.stratumPaymentsText2(block.transaction));
          block.category = 'orphan';
          return;
        } else if (tx.error || !tx.response) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText3(block.transaction));
          return;
        } else if (!tx.response.details || (tx.response.details && tx.response.details.length === 0)) {
          _this.emitLog('warning', false, _this.text.stratumPaymentsText4(block.transaction));
          block.category = 'orphan';
          return;
        }

        // Filter Transactions by Address
        const transactions = tx.response.details.filter((tx) => {
          let txAddress = tx.address;
          if (txAddress.indexOf(':') > -1) txAddress = txAddress.split(':')[1];
          return txAddress === _this.config.primary.address;
        });

        // Find Generation Transaction
        let generationTx = null;
        if (transactions.length >= 1) {
          generationTx = transactions[0];
        } else if (tx.response.details.length > 1){
          generationTx = tx.response.details.sort((a, b) => a.vout - b.vout)[0];
        } else if (tx.response.details.length === 1) {
          generationTx = tx.response.details[0];
        }

        // Update Block Details
        block.category = generationTx.category;
        block.confirmations = parseInt(tx.response.confirmations);
        if (['immature', 'generate'].includes(block.category)) {
          block.reward = utils.roundTo(parseFloat(generationTx.amount), 8);
        }
      });

      // Return Updated Block Data
      callback(null, blocks);
    });
  };

  // Process Upcoming Primary Payments
  this.handlePrimaryWorkers = function(blocks, workers, callback) {

    // Determine Block Handling Procedures
    const updates = {};
    blocks.forEach((block, idx) => {
      const current = workers[idx] || [];
      if (block.type !== 'primary') return;

      // Establish Separate Behavior
      let immature, generate;
      switch (block.category) {

      // Orphan Behavior
      case 'orphan':
        break;

      // Immature Behavior
      case 'immature':
        immature = _this.handleValidation(block, current);
        Object.keys(immature).forEach((address) => {
          if (address in updates) updates[address].immature += immature[address];
          else updates[address] = { immature: immature[address], generate: 0 };
        });
        break;

      // Generate Behavior
      case 'generate':
        generate = _this.handleValidation(block, current);
        Object.keys(generate).forEach((address) => {
          if (address in updates) updates[address].generate += generate[address];
          else updates[address] = { immature: 0, generate: generate[address] };
        });
        break;

      // Default Behavior
      default:
        break;
      }
    });

    // Return Updated Worker Data
    callback(updates);
  };

  // Validate Primary Balance and Checks
  this.handlePrimaryBalances = function(payments, callback) {

    // Calculate Total Payment to Each Miner
    const amounts = {};
    Object.keys(payments).forEach((address) => {
      amounts[address] = utils.roundTo(payments[address], 8);
    });

    // Build Daemon Commands
    const total = Object.values(amounts).reduce((sum, cur) => sum + cur, 0);
    const minConfirmations = _this.config.primary.payments ?
      _this.config.primary.payments.minConfirmations : 0;
    const commands = [['listunspent', [minConfirmations, 99999999]]];

    // Get Current Balance of Daemon
    if (_this.primary.payments.enabled) {
      _this.primary.payments.daemon.sendCommands(commands, true, (result) => {
        if (result.error) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText5(JSON.stringify(result.error)));
          callback(result.error, null);
          return;
        }

        // Calculate Total Balance from Response
        let balance = 0;
        if (result.response != null && result.response.length >= 1) {
          result.response.forEach((transaction) => {
            if (transaction.address && transaction.address !== null) {
              balance += parseFloat(transaction.amount || 0);
            }
          });
        }

        // Check if Balance >= Amounts
        if (balance < total) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText6(balance, total));
          callback('bad-insufficient-funds', null);
        } else callback(null, balance);
      });
    } else callback(null, 0);
  };

  // Send Primary Payments to Miners
  this.handlePrimaryPayments = function(payments, callback) {

    // Calculate Total Payment to Each Miner
    const amounts = {};
    Object.keys(payments).forEach((address) => {
      amounts[address] = utils.roundTo(payments[address], 8);
    });

    // Validate Amounts >= Minimum
    const balances = {};
    Object.keys(amounts).forEach((address) => {
      if (amounts[address] < _this.config.primary.payments.minPayment ||
        !_this.primary.payments.enabled) {
        balances[address] = amounts[address];
        delete amounts[address];
      }
    });

    // Build Daemon Commands
    const total = Object.values(amounts).reduce((sum, cur) => sum + cur, 0);
    const commands = [['sendmany', ['', amounts]]];

    // Send Primary Payments using Sendmany
    if (_this.primary.payments.enabled && total > 0) {
      _this.primary.payments.daemon.sendCommands(commands, true, (result) => {
        if (result.error) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText7(JSON.stringify(result.error)));
          callback(result.error, {}, {}, null);
          return;
        }

        // Return Transaction through Callback
        if (result.response) {
          const count = Object.keys(amounts).length;
          const symbol = _this.config.primary.coin.symbol;
          _this.emitLog('special', false, _this.text.stratumPaymentsText8(total, symbol, count, result.response));
          callback(null, amounts, balances, result.response);
        } else {
          _this.emitLog('error', false, _this.text.stratumPaymentsText9());
          callback('bad-transaction-undefined', {}, {}, null);
        }
      });
    } else callback(null, amounts, balances, null);
  };

  // Process Auxiliary Block Candidate
  this.handleAuxiliary = function(shareData, blockValid, callback) {

    // Block is Not Valid
    if (!blockValid) {
      callback(null, shareData);
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
          callback(accepted, shareData);
        });
      }
    });
  };

  // Check for New Auxiliary Block Template
  this.checkAuxiliaryTemplate = function(callback) {

    // Build Daemon Commands
    const commands = [['getblockchaininfo', []]];

    // Check Saved Blockchain Data
    if (_this.auxiliary.enabled) {
      _this.auxiliary.daemon.sendCommands(commands, true, (result) => {
        if (result.error) {
          _this.emitLog('error', false, _this.text.stratumTemplateText2(result.instance.host, JSON.stringify(result.error)));
          callback(result.error);
        } else if (!_this.auxiliary.height || !_this.auxiliary.previousblockhash) {
          _this.auxiliary.height = result.response.blocks;
          _this.auxiliary.previousblockhash = result.response.bestblockhash;
          callback(null, true);
        } else if ((_this.auxiliary.height !== result.response.blocks) || (_this.auxiliary.previousblockhash !== result.response.bestblockhash)) {
          _this.auxiliary.height = result.response.blocks;
          _this.auxiliary.previousblockhash = result.response.bestblockhash;
          callback(null, true);
        } else {
          callback(null, false);
        }
      });
    } else {
      callback(null, false);
    }
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
      const rejected = results.filter((result) => result.response === 'rejected');
      const accepted = results.filter((result) => !result.error && result.response !== 'rejected');
      if (rejected.length >= 1) {
        callback('bad-auxiliary-rejected', _this.text.stratumBlocksText6(rejected[0].instance.host));
      } else if (accepted.length < 1) {
        callback('bad-auxiliary-orphan', _this.text.stratumBlocksText5(results[0].instance.host, JSON.stringify(results[0].error)));
      }
      callback(null, null);
    });
  };

  // Process Submitted Auxiliary Blocks
  this.handleAuxiliaryRounds = function(blocks, callback) {

    // Get Hashes for Each Transaction
    const commands = blocks.map((block) => ['gettransaction', [block.transaction]]);

    // Derive Details for Every Transaction
    _this.auxiliary.daemon.sendCommands(commands, true, (result) => {
      if (result.error) {
        _this.emitLog('error', false, _this.text.stratumPaymentsText1(JSON.stringify(result.error)));
        callback(result.error, null);
        return;
      }

      // Handle Individual Transactions
      if (!Array.isArray(result)) result = [result];
      result.forEach((tx, idx) => {
        const block = blocks[idx] || {};

        // Check Daemon Edge Cases
        if (tx.error && tx.error.code === -5) {
          _this.emitLog('warning', false, _this.text.stratumPaymentsText2(block.transaction));
          block.category = 'orphan';
          return;
        } else if (tx.error || !tx.response) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText3(block.transaction));
          return;
        } else if (!tx.response.details || (tx.response.details && tx.response.details.length === 0)) {
          _this.emitLog('warning', false, _this.text.stratumPaymentsText4(block.transaction));
          block.category = 'orphan';
          return;
        }

        // Find Generation Transaction
        let generationTx = null;
        if (tx.response.details.length >= 1) {
          generationTx = tx.response.details[0];
        } else if (tx.response.details.length > 1){
          generationTx = tx.response.details.sort((a, b) => a.vout - b.vout)[0];
        } else if (tx.response.details.length === 1) {
          generationTx = tx.response.details[0];
        }

        // Update Block Details
        block.category = generationTx.category;
        block.confirmations = parseInt(tx.response.confirmations);
        if (['immature', 'generate'].includes(block.category)) {
          block.reward = utils.roundTo(parseFloat(generationTx.amount), 8);
        }
      });

      // Return Updated Block Data
      callback(null, blocks);
    });
  };

  // Process Upcoming Auxiliary Payments
  this.handleAuxiliaryWorkers = function(blocks, workers, callback) {

    // Determine Block Handling Procedures
    const updates = {};
    blocks.forEach((block, idx) => {
      const current = workers[idx] || [];
      if (block.type !== 'auxiliary') return;

      // Establish Separate Behavior
      let immature, generate;
      switch (block.category) {

      // Orphan Behavior
      case 'orphan':
        break;

      // Immature Behavior
      case 'immature':
        immature = _this.handleValidation(block, current);
        Object.keys(immature).forEach((address) => {
          if (address in updates) updates[address].immature += immature[address];
          else updates[address] = { immature: immature[address], generate: 0 };
        });
        break;

      // Generate Behavior
      case 'generate':
        generate = _this.handleValidation(block, current);
        Object.keys(generate).forEach((address) => {
          if (address in updates) updates[address].generate += generate[address];
          else updates[address] = { immature: 0, generate: generate[address] };
        });
        break;

      // Default Behavior
      default:
        break;
      }
    });

    // Return Updated Worker Data
    callback(updates);
  };

  // Validate Auxiliary Balance and Checks
  this.handleAuxiliaryBalances = function(payments, callback) {

    // Calculate Total Payment to Each Miner
    const amounts = {};
    Object.keys(payments).forEach((address) => {
      amounts[address] = utils.roundTo(payments[address], 8);
    });

    // Build Daemon Commands
    const total = Object.values(amounts).reduce((sum, cur) => sum + cur, 0);
    const minConfirmations = _this.config.auxiliary.payments ?
      _this.config.auxiliary.payments.minConfirmations : 0;
    const commands = [['listunspent', [minConfirmations, 99999999]]];

    // Get Current Balance of Daemon
    if (_this.auxiliary.payments.enabled) {
      _this.auxiliary.payments.daemon.sendCommands(commands, true, (result) => {
        if (result.error) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText5(JSON.stringify(result.error)));
          callback(result.error, null);
          return;
        }

        // Calculate Total Balance from Response
        let balance = 0;
        if (result.response != null && result.response.length >= 1) {
          result.response.forEach((transaction) => {
            if (transaction.address && transaction.address !== null) {
              balance += parseFloat(transaction.amount || 0);
            }
          });
        }

        // Check if Balance >= Amounts
        if (balance < total) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText6(balance, total));
          callback('bad-insufficient-funds', null);
        } else callback(null, balance);
      });
    } else callback(null, 0);
  };

  // Send Auxiliary Payments to Miners
  this.handleAuxiliaryPayments = function(payments, callback) {

    // Calculate Total Payment to Each Miner
    const amounts = {};
    Object.keys(payments).forEach((address) => {
      amounts[address] = utils.roundTo(payments[address], 8);
    });

    // Validate Amounts >= Minimum
    const balances = {};
    Object.keys(amounts).forEach((address) => {
      if (amounts[address] < _this.config.auxiliary.payments.minPayment ||
        !_this.auxiliary.payments.enabled) {
        balances[address] = amounts[address];
        delete amounts[address];
      }
    });

    // Build Daemon Commands
    const total = Object.values(amounts).reduce((sum, cur) => sum + cur, 0);
    const commands = [['sendmany', ['', amounts]]];

    // Send Aauxiliary Payments using Sendmany
    if (_this.auxiliary.payments.enabled && total > 0) {
      _this.auxiliary.payments.daemon.sendCommands(commands, true, (result) => {
        if (result.error) {
          _this.emitLog('error', false, _this.text.stratumPaymentsText7(JSON.stringify(result.error)));
          callback(result.error, {}, {}, null);
          return;
        }

        // Return Transaction through Callback
        if (result.response) {
          const count = Object.keys(amounts).length;
          const symbol = _this.config.auxiliary.coin.symbol;
          _this.emitLog('special', false, _this.text.stratumPaymentsText8(total, symbol, count, result.response));
          callback(null, amounts, balances, result.response);
        } else {
          _this.emitLog('error', false, _this.text.stratumPaymentsText9());
          callback('bad-transaction-undefined', {}, {}, null);
        }
      });
    } else callback(null, amounts, balances, null);
  };

  // Build Primary Stratum Daemons
  this.setupPrimaryDaemons = function(callback) {

    // Load Daemons from Configuration
    const primaryDaemons = _this.config.primary.daemons;
    const primaryPaymentDaemon = _this.primary.payments.enabled ?
      [_this.config.primary.payments.daemon] : [];

    // Build Daemon Instances
    _this.primary.daemon = new Daemon(primaryDaemons);
    _this.primary.payments.daemon = new Daemon(primaryPaymentDaemon);

    // Initialize Primary Daemons and Load Settings
    _this.primary.daemon.checkInstances((error) => {
      if (error) _this.emitLog('error', false, _this.text.loaderDaemonsText1());
      else if (_this.primary.payments.enabled) {
        _this.primary.payments.daemon.checkInstances((error) => {
          if (error) _this.emitLog('error', false, _this.text.loaderDaemonsText2());
          else callback();
        });
      } else callback();
    });
  };

  // Build Auxiliary Stratum Daemons
  this.setupAuxiliaryDaemons = function(callback) {

    // Load Daemons from Configuration
    const auxiliaryDaemons = _this.auxiliary.enabled ? _this.config.auxiliary.daemons : [];
    const auxiliaryPaymentDaemon = _this.auxiliary.payments.enabled ?
      [_this.config.auxiliary.payments.daemon] : [];

    // Build Daemon Instances
    _this.auxiliary.daemon = new Daemon(auxiliaryDaemons);
    _this.auxiliary.payments.daemon = new Daemon(auxiliaryPaymentDaemon);

    // Initialize Auxiliary Daemons and Load Settings
    if (_this.auxiliary.enabled) {
      _this.auxiliary.daemon.checkInstances((error) => {
        if (error) _this.emitLog('error', false, _this.text.loaderDaemonsText3());
        else if (_this.auxiliary.payments.enabled) {
          _this.auxiliary.payments.daemon.checkInstances((error) => {
            if (error) _this.emitLog('error', false, _this.text.loaderDaemonsText4());
            else callback();
          });
        } else callback();
      });
    } else callback();
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

      // Handle Callback
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

    // Handle Shares on Submission
    _this.manager.on('manager.share', (shareData, auxShareData, blockValid) => {

      const shareValid = typeof shareData.error === 'undefined';
      const auxBlockValid = _this.checkAuxiliary(shareData, auxShareData);
      if (_this.auxiliary.enabled && _this.auxiliary.rpcData && auxShareData) {
        auxShareData.height = _this.auxiliary.rpcData.height;
        auxShareData.reward = _this.auxiliary.rpcData.coinbasevalue;
      }

      // Process Share/Primary Submission
      _this.handlePrimary(shareData, blockValid, (accepted, outputData) => {
        _this.emit('pool.share', outputData, shareValid, accepted);
        _this.handlePrimaryTemplate(auxBlockValid, (error, result, newBlock) => {
          if (accepted && newBlock && blockValid) {
            _this.emitLog('special', false, _this.text.stratumManagerText1());
          }
        });
      });

      // Process Auxiliary Submission
      if (!shareData.error && auxBlockValid) {
        _this.handleAuxiliary(auxShareData, true, (accepted, outputData) => {
          _this.emit('pool.share', outputData, shareValid, accepted);
          if (accepted && auxBlockValid) {
            _this.emitLog('special', false, _this.text.stratumManagerText2());
          }
        });
      }
    });

    // Handle New Block Templates
    _this.manager.on('manager.block.new', (template) => {

      // Process Primary Network Data
      _this.checkNetwork(_this.primary.daemon, 'primary', (networkData) => {
        _this.emit('pool.network', networkData);
      });

      // Process Auxiliary Network Data
      if (_this.auxiliary.enabled) {
        _this.checkNetwork(_this.auxiliary.daemon, 'auxiliary', (auxNetworkData) => {
          _this.emit('pool.network', auxNetworkData);
        });
      }

      // Broadcast New Mining Jobs to Clients
      if (_this.network) _this.network.broadcastMiningJobs(template, true);
    });

    // Handle Updated Block Templates
    _this.manager.on('manager.block.updated', (template) => {

      // Broadcast New Mining Jobs to Clients
      if (_this.network) _this.network.broadcastMiningJobs(template, false);
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
    const pollingInterval = _this.config.settings.interval.blocks;

    // Handle Polling Interval
    setInterval(() => {
      if (pollingFlag === false) {
        pollingFlag = true;
        _this.checkAuxiliaryTemplate((auxError) => {
          if (!auxError) {
            _this.handleAuxiliaryTemplate((auxError, auxResult, auxUpdate) => {
              _this.checkPrimaryTemplate(auxUpdate, (error, update) => {
                if (auxUpdate) _this.emitLog('log', true, _this.text.stratumPollingText2(_this.config.auxiliary.coin.name, auxResult.height));
                if (!error && update) {
                  _this.handlePrimaryTemplate(auxUpdate, (error, result, update) => {
                    pollingFlag = false;
                    if (update) _this.emitLog('log', true, _this.text.stratumPollingText1(_this.config.primary.coin.name, result.height));
                  });
                } else {
                  pollingFlag = false;
                }
              });
            });
          }
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
      const result = _this.manager.handleShare(message.params[1], client, submission);
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
        _this.emitLog('debug', true, _this.text.stratumNetworkText1(_this.config.settings.timeout.rebroadcast / 1000));
        if (error || newBlock) return;
        _this.manager.handleUpdates(rpcData);
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
