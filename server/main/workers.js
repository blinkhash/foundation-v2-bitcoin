const Stratum = require('./stratum');

////////////////////////////////////////////////////////////////////////////////

// Main Workers Function
const Workers = function (logger) {

  const _this = this;
  this.logger = logger;
  this.config = JSON.parse(process.env.config);
  this.configMain = JSON.parse(process.env.configMain);
  this.stratum = null;

  // Build Promise from Input Configuration
  this.createPromises = function() {
    return new Promise((resolve) => {
      const stratum = new Stratum(logger, _this.config, _this.configMain);
      stratum.setupStratum(() => resolve(stratum));
    });
  };

  // Start Worker Capabilities
  this.setupWorkers = function(callback) {
    _this.createPromises(_this.config).then((stratum) => {
      _this.stratum = stratum;
      callback();
    });
  };
};

module.exports = Workers;
