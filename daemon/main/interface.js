const http = require('http');
const events = require('events');
const async = require('async');

////////////////////////////////////////////////////////////////////////////////

// Main Interface Function
const Interface = function(daemons) {

  const _this = this;
  this.instances = daemons;
  this.instances.forEach((daemon, idx) => daemon.index = idx);

  // Check if All Daemons are Online
  this.checkOnline = function(callback) {
    _this.sendCommands([['getpeerinfo', []]], false, (results) => {
      const online = results.every((result) => !result.error);
      if (!online) _this.emit('failed', results.filter((result) => result.error));
      callback(online);
    });
  };

  // Check if All Daemons are Initialized
  this.checkInitialized = function(callback) {
    _this.checkOnline((online) => {
      if (online) _this.emit('online');
      callback(online);
    });
  };

  // Handle HTTP Response
  this.handleResponse = function(response, instance, data, callback) {

    // Unauthorized Access
    if ([401, 403].includes(response.statusCode)) {
      callback({
        error: { code: -1, message: 'Unauthorized RPC access. Invalid RPC username or password' },
        response: null,
        instance: instance,
        data: data,
      });
    }

    // Parse and Return Data
    try {

      // Response Variables
      const output = [];
      const dataJson = JSON.parse(data);

      // Batch Command Passed
      if (Array.isArray(dataJson)) {
        dataJson.forEach((current) => {
          output.push({
            error: current.error,
            response: current.result,
            instance: instance,
            data: JSON.stringify(current),
          });
        });
        callback(output);

      // Single Command Passed
      } else {
        callback({
          error: dataJson.error,
          response: dataJson.result,
          instance: instance,
          data: data,
        });
      }

    // Data is Malformed
    } catch(e) {
      callback({
        error: { code: -1, message: 'Could not parse RPC data from daemon response' },
        response: null,
        instance: instance,
        data: data,
      });
    }
  };

  // Handle Sending HTTP Requests
  this.handleRequest = function(instance, data, callback) {

    // HTTP Options
    let responded = false;
    const options = {
      hostname: instance.host,
      port: instance.port,
      method: 'POST',
      timeout: 3000,
      headers: { 'Content-Length': data.length },
      auth: instance.username + ':' + instance.password,
    };

    // Build HTTP Request
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => _this.handleResponse(res, instance, data, (response) => {
        if (!responded) {
          responded = true;
          callback(response);
        }
      }));
    });

    // HTTP Error Handling
    req.on('error', (e) => {
      if (!responded) {
        responded = true;
        callback({
          error: { code: -1, message: e.message },
          response: null,
          instance: instance,
          data: null,
        });
      }
    });

    // Send HTTP Request to Daemon
    req.end(data);
  };

  // Handle Sending RPC Commands
  this.sendCommands = function(requests, streaming, callback) {

    // No Commands Passed
    if (requests.length < 1) {
      callback({
        error: { code: -1, message: 'No commands passed to daemon' },
        response: null,
        instance: null,
        data: null,
      });
      return;
    }

    // Build JSON Requests
    let requestsJson = [];
    requests.forEach((command, idx) => {
      requestsJson.push({
        method: command[0],
        params: command[1],
        id: Date.now() + Math.floor(Math.random() * 10) + idx
      });
    });

    // Response Variables
    let responded = false;
    const results = [];

    // Build Serialized Request
    if (requestsJson.length === 1) requestsJson = requestsJson[0];
    const serialized = JSON.stringify(requestsJson);

    // Send Requests to All Daemons Individually
    async.each(this.instances, (instance, eachCallback) => {
      _this.handleRequest(instance, serialized, (response) => {
        results.push(response);
        if (streaming && !responded && !response.error) {
          responded = true;
          callback(response);
          return;
        }
        eachCallback();
      });

    // Handle Daemon Responses
    }, () => {
      if (streaming && !responded) callback(results[0]);
      else callback(results);
    });
  };
};

module.exports = Interface;
Interface.prototype.__proto__ = events.EventEmitter.prototype;
