const Interface = require('./interface');
const events = require('events');

////////////////////////////////////////////////////////////////////////////////

// Main Daemon Function
const Daemon = function(daemons) {

  const _this = this;
  this.daemons = daemons;

  // Daemon Variables
  this.responses = {};
  this.interface = null;

  // Handle Setting Up Daemon Instances
  this.checkInstances = function(callback) {
    _this.interface = new Interface(daemons);
    _this.interface.once('online', () => callback(false, null));
    _this.interface.on('failed', (errors) => callback(true, JSON.stringify(errors)));
    _this.interface.checkInitialized(() => {});
  };

  // Handle Sending RPC Commands
  this.sendCommands = function(requests, streaming, callback) {
    _this.interface.sendCommands(requests, streaming, (result) => {
      callback(result);
    });
  };
};

module.exports = Daemon;
Daemon.prototype.__proto__ = events.EventEmitter.prototype;
