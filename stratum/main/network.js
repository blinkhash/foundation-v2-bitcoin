const Client = require('./client');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const events = require('events');
const uuid = require('uuid');

////////////////////////////////////////////////////////////////////////////////

// Main Network Function
const Network = function(config, configMain, authorizeFn) {

  const _this = this;
  this.config = config;
  this.configMain = configMain;

  // Network Variables
  this.bannedIPs = {};
  this.clients = {};
  this.servers = {};
  this.timeoutInterval = null;

  // Check Banned Clients for a Match
  this.checkBan = function(client) {
    if (client.socket.remoteAddress in _this.bannedIPs) {

      // Calculate Time Left on Ban
      const bannedTime = _this.bannedIPs[client.socket.remoteAddress];
      const bannedTimeAgo = Date.now() - bannedTime;
      const bannedTimeLeft = _this.config.settings.banning.banLength - bannedTimeAgo;

      // Kick or Forgive Client if Served Time
      if (bannedTimeLeft > 0) {
        client.socket.destroy();
        client.emit('client.ban.kicked', bannedTimeLeft / 1000 | 0);
      } else {
        delete _this.bannedIPs[client.socket.remoteAddress];
        client.emit('client.ban.forgave');
      }
    }
  };

  // Handle Broadcasting New Jobs to Clients
  this.broadcastMiningJobs = function(template, cleanJobs) {

    // Send New Jobs to Clients
    Object.keys(_this.clients).forEach((id) => {
      const client = _this.clients[id];
      const parameters = template.handleParameters(cleanJobs);
      client.broadcastMiningJob(parameters);
    });

    // Handle Resetting Broadcast Timeout
    if (_this.timeoutInterval) clearTimeout(_this.timeoutInterval);
    _this.timeoutInterval = setTimeout(() => {
      _this.emit('network.timeout');
    }, _this.config.settings.timeout.rebroadcast);
  };

  // Manage New Client Connections
  this.handleClient = function (socket) {

    // Establish New Stratum Client
    socket.setKeepAlive(true);
    const subscriptionId = uuid.v4();
    const client = new Client(_this.config, socket, subscriptionId, authorizeFn);
    _this.clients[subscriptionId] = client;
    _this.emit('client.connected', client);

    // Manage Client Behaviors
    client.on('client.ban.check', () => _this.checkBan(client));
    client.on('client.ban.trigger', () => {
      _this.bannedIPs[client.socket.remoteAddress] = Date.now();
      _this.emit('client.banned', client);
    });
    client.on('client.socket.disconnect', () => {
      delete _this.clients[subscriptionId];
      _this.emit('client.disconnected', client);
    });

    // Handle Client Setup
    client.setupClient();
    return subscriptionId;
  };

  // Setup Stratum Network Functionality
  this.setupNetwork = function() {

    // Interval to Clear Old Bans from BannedIPs
    setInterval(() => {
      Object.keys(_this.bannedIPs).forEach((ip) => {
        const banTime = _this.bannedIPs[ip];
        if (Date.now() - banTime > _this.config.settings.banning.banLength) {
          delete _this.bannedIPs[ip];
        }
      });
    }, _this.config.settings.banning.purgeInterval);

    // Filter Ports for Activity
    const stratumPorts = _this.config.ports.filter((port) => port.enabled);

    // Start Individual Stratum Servers
    let serversStarted = 0;
    stratumPorts.forEach((port) => {
      const currentPort = port.port;

      // Define Stratum Options
      const options = {
        ...(port.tls && { key: fs.readFileSync(path.join('./certificates', _this.configMain.tls.key)) }),
        ...(port.tls && { cert: fs.readFileSync(path.join('./certificates', _this.configMain.tls.cert)) }),
        allowHalfOpen: false,
      };

      // Setup Stratum Server
      const callback = (socket) => _this.handleClient(socket);
      const server = (port.tls) ? tls.createServer(options, callback) : net.createServer(options, callback);

      // Setup Server to Listen on Port
      server.listen(parseInt(currentPort), () => {
        serversStarted += 1;
        if (serversStarted == stratumPorts.length) {
          _this.emit('network.started');
        }
      });

      // Add New Server to Tracked Server
      _this.servers[currentPort] = server;
    });
  }();

  // Stop Stratum Network Functionality
  this.stopNetwork = function() {

    // Filter Ports for Activity
    const stratumPorts = _this.config.ports.filter((port) => port.enabled);

    // Stop Individual Stratum Servers
    stratumPorts.forEach((port) => {
      const currentPort = port.port;
      const server = _this.servers[currentPort];
      server.close();
    });

    // Emit Final Stopped Event
    _this.emit('network.stopped');
  };
};

module.exports = Network;
Network.prototype.__proto__ = events.EventEmitter.prototype;
