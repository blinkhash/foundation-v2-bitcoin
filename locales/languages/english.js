// Builder Text
exports.builderWorkersText1 = (forkId) => `Fork ${ forkId } died, starting replacement worker ...`;
exports.builderWorkersText2 = () => 'No valid pool configs exist or are enabled. Check your configuration files';
exports.builderWorkersText3 = (numConfigs, numForks) => `Started ${ numConfigs } pool(s) on ${ numForks } thread(s)`;

// Starting Text
exports.startingMessageText1 = (pool) => `Initializing server (${ pool }) ...`;
exports.startingMessageText2 = (coins) => `Connected coins: ${ coins }`;
exports.startingMessageText3 = (network) => `Active network: ${ network }`;
exports.startingMessageText4 = (ports) => `Active stratum ports: ${ ports }`;
exports.startingMessageText5 = (fee) => `Active recipient fee: ${ fee }%`;
exports.startingMessageText6 = (height) => `Current block height: ${ height }`;
exports.startingMessageText7 = (difficulty) => `Current block difficulty: ${ difficulty }`;
exports.startingMessageText8 = (difficulty) => `Current network difficulty: ${ difficulty }`;
exports.startingMessageText9 = (peers) => `Current peer count: ${ peers }`;
exports.startingMessageText10 = () => 'Server initialized successfully ...';

// Loader Text
exports.loaderAlgorithmsText1 = (algorithm) => `The requested mining algorithm ("${ algorithm }") is unsupported. Check your configuration files`;
exports.loaderAlgorithmsText2 = (algorithm) => `The requested block algorithm ("${ algorithm }") is unsupported. Check your configuration files`;
exports.loaderAlgorithmsText3 = (algorithm) => `The requested coinbase algorithm ("${ algorithm }") is unsupported. Check your configuration files`;
exports.loaderDaemonsText1 = () => 'There are no primary daemons configured, so the pool cannot be started. Check your configuration files';
exports.loaderDaemonsText2 = () => 'There are no auxiliary daemons configured, so the pool cannot be started. Check your configuration files';
exports.loaderNamesText1 = () => 'There is no pool name passed in. Check your configuration files';
exports.loaderNamesText2 = () => 'Pool names are only allowed to be a single word. Check your configuration files';
exports.loaderNamesText3 = () => 'Two or more pool names are overlapping. Check your configuration files';
exports.loaderPortsText1 = (currentPort) => `Two or more ports are overlapping on ${ currentPort }. Check your configuration files`;
exports.loaderRecipientsText1 = () => 'The recipient percentage is greater than 100%. Check your configuration files';
exports.loaderRecipientsText2 = () => 'The recipient percentage is greater than 40%. Are you sure that you configured it properly?';

// Stratum Text
exports.stratumBlocksText1 = () => 'The block was rejected by the network';
exports.stratumBlocksText2 = (host, error) => `RPC error with primary daemon instance (${ host }) when submitting block: ${ error }`;
exports.stratumBlocksText3 = (host) => `Primary daemon instance (${ host }) rejected a supposedly valid block`;
exports.stratumBlocksText4 = (coin, height) => `Submitted a primary block (${ coin }:${ height }) successfully to ${ coin }'s daemon instance(s)`;
exports.stratumBlocksText5 = (host, error) => `RPC error with auxiliary daemon instance (${ host }) when submitting block: ${ error }`;
exports.stratumBlocksText6 = (host) => `Auxiliary daemon instance (${ host }) rejected a supposedly valid block`;
exports.stratumBlocksText7 = (coin, height) => `Submitted an auxiliary block (${ coin }:${ height }) successfully to ${ coin }'s daemon instance(s)`;
exports.stratumClientText1 = (address, difficulty) => `Difficulty update queued for worker: ${ address } (${ difficulty })`;
exports.stratumClientText2 = (address, difficulty) => `Difficulty updated successfully for worker: ${ address } (${ difficulty })`;
exports.stratumClientText3 = (client, message) => `A client (${ client }) sent a malformed message to the server: ${ message }`;
exports.stratumClientText4 = (client) => `Socket flooding was detected from a client (${ client })`;
exports.stratumClientText5 = (client, error) => `A socket error was detected from a client (${ client }): ${ error }`;
exports.stratumClientText6 = (client, error) => `A client (${ client }) was timed out from the server: ${ error }`;
exports.stratumClientText7 = (client) => `A client (${ client }) disconnected from the server`;
exports.stratumClientText8 = (client, time) => `Rejected incoming connection (${ client }). The client is banned for ${ time } seconds`;
exports.stratumClientText9 = (client) => `Forgave banned client (${ client }). They can now reconnect to the pool`;
exports.stratumClientText10 = (client) => `Because of malicious behavior, a client (${ client }) has been banned`;
exports.stratumClientText11 = (client, message) => `A client (${ client }) sent an unknown stratum method to the server: ${ message }`;
exports.stratumDownloadedText1 = (percent, peers) => `Downloaded ${ percent }% of blockchain from ${ peers } peers`;
exports.stratumFirstJobText1 = () => 'RPC error with primary daemon instance when creating the first job';
exports.stratumFirstJobText2 = (difficulty, port, initial) => `Network difficulty (${ difficulty }) is lower than the difficulty on port ${ port } (${ initial })`;
exports.stratumManagerText1 = () => 'Block notification via RPC after primary block submission';
exports.stratumManagerText2 = () => 'Block notification via RPC after auxiliary block submission';
exports.stratumNetworkText1 = (time) => `No new blocks for ${ time } seconds. Updating transactions and rebroadcasting work`;
exports.stratumPollingText1 = (coin, height) => `Requested template from primary chain (${ coin }:${ height }) via RPC polling`;
exports.stratumPollingText2 = (coin, height) => `Requested template from auxiliary chain (${ coin }:${ height }) via RPC polling`;
exports.stratumRecipientsText1 = () => 'No recipients have been added, which means that no fees will be taken';
exports.stratumSharesText1 = (difficulty, actual, address, ip) => `A share was accepted at difficulty ${ difficulty }/${ actual || 0 } by ${ address } [${ ip }]`;
exports.stratumSharesText2 = (error, address, ip) => `A share was rejected (${ error }) from ${ address } [${ ip }]`;
exports.stratumSettingsText1 = (error) => `Could not start pool, error with RPC response: ${ error }`;
exports.stratumSettingsText2 = (request, error) => `Could not start pool, error with RPC command response: ${ request } - ${ error }`;
exports.stratumSettingsText3 = () => 'The daemon reports that the given address is not valid';
exports.stratumSettingsText4 = () => 'The daemon could not determine the coin\'s method of block submission';
exports.stratumTemplateText1 = (host, error) => `RPC error with primary daemon instance (${ host }) when requesting a primary template update: ${ error }`;
exports.stratumTemplateText2 = (host, error) => `RPC error with auxiliary daemon instance (${ host }) when requesting an auxiliary template update: ${ error }`;
exports.stratumWorkersText1 = (address, ip, port) => `Authorized worker: ${ address } (${ ip }:${ port })`;
exports.stratumWorkersText2 = (address, ip, port) => `Unauthorized worker: ${ address } (${ ip }:${ port })`;
