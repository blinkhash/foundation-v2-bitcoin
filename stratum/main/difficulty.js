const events = require('events');

////////////////////////////////////////////////////////////////////////////////

// Main Difficulty Function
const Difficulty = function(config) {

  const _this = this;
  this.config = config;
  this.clients = {};

  // Difficulty Variables
  this.maxSize = _this.config.retargetTime / _this.config.targetTime * 4;
  this.minTime = _this.config.targetTime * (1 + _this.config.variance);
  this.maxTime = _this.config.targetTime * (1 - _this.config.variance);

  // Difficulty Saved Values
  this.lastRetargetTime = null;
  this.lastSavedTime = null;

  // Check Difficulty for Updates
  this.checkDifficulty = function(client) {

    // Check that Client is Recorded
    if (!(Object.keys(_this.clients).includes(client.id))) return;

    // Calculate Average/Difference
    let output = null;
    const queue = _this.clients[client.id];
    const curAverage = queue.reduce((a, b) => a + b, 0) / queue.length;
    let curDifference = _this.config.targetTime / curAverage;

    // Shift Difficulty Down
    if (curAverage > _this.maxTime && client.difficulty > _this.config.minimum) {
      if (curDifference * client.difficulty < _this.config.minimum) {
        curDifference = _this.config.minimum / client.difficulty;
      }
      output = curDifference;

    // Shift Difficulty Up
    } else if (curAverage < _this.minTime && client.difficulty < _this.config.maximum) {
      if (curDifference * client.difficulty > _this.config.maximum) {
        curDifference = _this.config.maximum / client.difficulty;
      }
      output = curDifference;
    }

    // Return Updated Difference
    return output;
  };

  // Handle Individual Clients
  this.handleClient = function(client) {

    // Add Event Listeners to Client Instance
    client.on('client.submit', () => _this.handleDifficulty(client));
  };

  // Handle Difficulty Updates
  this.handleDifficulty = function(client) {

    // Update Current Time/Values
    const curTime = (Date.now() / 1000) | 0;
    if (!(Object.keys(_this.clients).includes(client.id))) _this.clients[client.id] = [];
    if (!_this.lastRetargetTime) {
      _this.lastRetargetTime = curTime - _this.config.retargetTime / 2;
      _this.lastSavedTime = curTime;
      return;
    }

    // Append New Value to Queue
    const queue = _this.clients[client.id];
    if (queue.length >= _this.maxSize) queue.shift();
    queue.push(curTime - _this.lastSavedTime);
    _this.clients[client.id] = queue;
    _this.lastSavedTime = curTime;

    // Calculate Difference Between Desired vs. Average Time
    if (curTime - _this.lastRetargetTime < _this.config.retargetTime) return;
    const updatedDifficulty = this.checkDifficulty(client);

    // Difficulty Will Be Updated
    if (updatedDifficulty !== null) {
      const newDifference = parseFloat((client.difficulty * updatedDifficulty).toFixed(8));
      _this.emit('client.difficulty.new', client, newDifference);
    }

    // Update Retarget Time
    _this.lastRetargetTime = curTime;
  };
};

module.exports = Difficulty;
Difficulty.prototype.__proto__ = events.EventEmitter.prototype;
