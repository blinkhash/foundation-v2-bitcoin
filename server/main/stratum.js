const Pool = require('../../stratum/main/pool');
const Text = require('../../locales/index');

////////////////////////////////////////////////////////////////////////////////

// Main Stratum Function
const Stratum = function (logger, config, configMain) {

  const _this = this;
  this.logger = logger;
  this.config = config;
  this.configMain = configMain;
  this.text = Text[configMain.language];

  // Stratum Variables
  process.setMaxListeners(0);
  this.forkId = process.env.forkId;

  // Build Stratum from Configuration
  this.handleStratum = function() {

    // Build Stratum Server
    _this.stratum = new Pool(_this.config, _this.configMain, () => {});

    // Handle Stratum Main Events
    _this.stratum.on('pool.started', () => {});
    _this.stratum.on('pool.log', (severity, text) => {
      _this.logger[severity]('Pool', _this.config.name, [text]);
    });

    // Handle Stratum Share Events
    _this.stratum.on('pool.share', (shareData, shareValid) => {

      // Processed Share was Accepted
      if (shareValid) {
        const address = shareData.addrPrimary.split('.')[0];
        const text = _this.text.stratumSharesText1(shareData.difficulty, shareData.shareDiff, address, shareData.ip);
        _this.logger['log']('Pool', _this.config.name, [text]);

      // Processed Share was Rejected
      } else {
        const address = shareData.addrPrimary.split('.')[0];
        const text = _this.text.stratumSharesText2(shareData.error, address, shareData.ip);
        _this.logger['error']('Pool', _this.config.name, [text]);
      }
    });
  };

  // Output Stratum Data on Startup
  this.outputStratum = function() {

    // Build Connected Coins
    const coins = [_this.config.primary.coin.name];
    if (_this.config.auxiliary && _this.config.auxiliary.enabled) {
      coins.push(_this.config.auxiliary.coin.name);
    }

    // Build Pool Starting Message
    const output = [
      _this.text.startingMessageText1(`Pool-${ _this.config.primary.coin.name }`),
      _this.text.startingMessageText2(`[${ coins.join(', ') }]`),
      _this.text.startingMessageText3(_this.config.settings.testnet ? 'Testnet' : 'Mainnet'),
      _this.text.startingMessageText4(_this.stratum.statistics.ports.join(', ')),
      _this.text.startingMessageText5(_this.stratum.statistics.feePercentage * 100),
      _this.text.startingMessageText6(_this.stratum.manager.currentJob.rpcData.height),
      _this.text.startingMessageText7(_this.stratum.statistics.difficulty),
      _this.text.startingMessageText8(_this.stratum.statistics.connections),
      _this.text.startingMessageText9()];

    // Send Starting Message to Logger
    if (_this.forkId === '0') {
      _this.logger['log']('Pool', null, output, true);
    }
  };

  // Setup Pool Stratum Capabilities
  /* eslint-disable */
  this.setupStratum = function(callback) {

    // Build Daemon/Stratum Functionality
    _this.handleStratum();
    _this.stratum.setupDaemons(() => {
    _this.stratum.setupPorts();
    _this.stratum.setupSettings(() => {
    _this.stratum.setupRecipients();
    _this.stratum.setupManager();
    _this.stratum.setupPrimaryBlockchain(() => {
    _this.stratum.setupAuxiliaryBlockchain(() => {
    _this.stratum.setupFirstJob(() => {
    _this.stratum.setupBlockPolling();
    _this.stratum.setupNetwork(() => {
      _this.outputStratum()
      callback()
    })

    // Too Much Indentation
    })})})})});
  }
};

module.exports = Stratum;
