const Stratum = require('./stratum');
const Text = require('../../locales/index');

////////////////////////////////////////////////////////////////////////////////

// Main Workers Function
const Workers = function (logger) {

  const _this = this;
  this.logger = logger;
  this.config = JSON.parse(process.env.config);
  this.configMain = JSON.parse(process.env.configMain);
  this.stratum = null;
  this.text = Text[_this.configMain.language];

  // Build Promise from Input Configuration
  this.handlePromises = function() {
    return new Promise((resolve, reject) => {
      const stratum = new Stratum(_this.logger, _this.config, _this.configMain);
      stratum.setupStratum((text) => {
        if (text) reject(_this.text.startingErrorText1());
        else resolve(stratum);
      });
    });
  };

  // Start Worker Capabilities
  this.setupWorkers = function(callback) {
    _this.handlePromises(_this.config).then((stratum) => {
      _this.stratum = stratum;
      callback();
    }).catch((error) => {
      _this.logger['error']('Pool', _this.config.name, [error]);
    });
  };
};

module.exports = Workers;
