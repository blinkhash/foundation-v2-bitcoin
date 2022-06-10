const Pool = require('./stratum/main/pool');

////////////////////////////////////////////////////////////////////////////////

exports.algorithms = require('./stratum/main/algorithms');
exports.builder = function(config, configMain, responseFn) {
  return new Pool(config, configMain, responseFn);
};
