const fs = require('fs');
const { setLogBackend, Logger, LogLevel } = require('@calzoneman/jsli');
const { version } = require('./package.json');

let level = process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO;
let logfile = fs.createWriteStream('aeiou.log', { flags: 'a' });

class FileLogger extends Logger {
    constructor(name, level) {
        super(name, level);
    }

    emitMessage(level, message) {
        let formatted = `[${level.name}] ${this.loggerName}: ${message}`;
        logfile.write(formatted + '\n');
        console.log(formatted);
    }
}

setLogBackend((loggerName, level) => {
    return new FileLogger(loggerName, level);
});

const LOGGER = require('@calzoneman/jsli')('main');
LOGGER.info('Starting aeiou version %s', version);

process.on('uncaughtException', error => {
    LOGGER.fatal(`Uncaught exception: ${error.stack}`);
    process.exit(1);
});

const config = require('./config');
require('./lib/webserver').start(config);
