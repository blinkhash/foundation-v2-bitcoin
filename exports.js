const Pool = require('./stratum/main/pool');

////////////////////////////////////////////////////////////////////////////////

exports.algorithms = require('./stratum/main/algorithms');
exports.builder = function(config, configMain, callback) {
  return new Pool(config, configMain, callback);
};
