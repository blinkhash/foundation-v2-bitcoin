const Text = require('../../locales/index');
const fs = require('fs');
const path = require('path');

////////////////////////////////////////////////////////////////////////////////

// Main Loader Function
const Loader = function(logger, configMain) {

  const _this = this;
  this.logger = logger;
  this.configMain = configMain;
  this.text = Text[configMain.language];

  // Check Configuration Daemons
  this.checkPoolDaemons = function(config) {
    if (!Array.isArray(config.primary.daemons) || config.primary.daemons.length < 1) {
      const lines = [_this.text.loaderDaemonsText1()];
      _this.logger.error('Loader', config.name, lines);
      return false;
    }
    if (config.auxiliary && config.auxiliary.enabled) {
      if (!Array.isArray(config.auxiliary.daemons) || config.auxiliary.daemons.length < 1) {
        const lines = [_this.text.loaderDaemonsText2()];
        _this.logger.error('Loader', config.name, lines);
        return false;
      }
    }
    return true;
  };

  // Check Configuration Ports
  this.checkPoolPorts = function(config) {
    const ports = new Set();
    const currentPorts = config.ports.flatMap((val) => val.port);
    for (let i = 0; i < currentPorts.length; i++) {
      const currentPort = currentPorts[i];
      if (ports.has(currentPort)) {
        const lines = [_this.text.loaderPortsText1(currentPort)];
        _this.logger.error('Loader', config.name, lines);
        return false;
      }
      ports.add(currentPort);
    }
    return true;
  };

  // Check Configuration Recipients
  this.checkPoolRecipients = function(config) {
    const recipients = config.primary.recipients;
    if (recipients && recipients.length >= 1) {
      const percentage = recipients.reduce((p_sum, a) => p_sum + a.percentage, 0);
      if (percentage >= 1) {
        const lines = [_this.text.loaderRecipientsText1()];
        _this.logger.error('Loader', config.name, lines);
        return false;
      }
      if (percentage >= 0.4) {
        const lines = [_this.text.loaderRecipientsText2()];
        _this.logger.warning('Loader', config.name, lines);
      }
    }
    return true;
  };

  // Load and Validate Configuration Files
  /* istanbul ignore next */
  this.handleConfigs = function() {
    let config = null;
    const normalizedPath = path.join(__dirname, '../../configs/');
    if (fs.existsSync(normalizedPath + 'bitcoin.js')) {
      config = require(normalizedPath + 'bitcoin.js');

      // Validate Individual Configuration Files
      if (!config.enabled) return;
      if (!_this.checkPoolDaemons(config)) return;
      if (!_this.checkPoolPorts(config)) return;
      if (!_this.checkPoolRecipients(config)) return;

    // No Configuration Created
    } else {
      throw new Error('Unable to find bitcoin.js file. Read the installation/setup instructions');
    }

    // Return Validated Configuration
    return config;
  };
};

module.exports = Loader;
