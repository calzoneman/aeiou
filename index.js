var Webserver = require('./lib/webserver');
var config = require('./config.json');
var winston = require('winston');

let logger = new winston.Logger({
    level: !!process.env.DEBUG ? 'debug' : 'info',
    transports: [
        new (winston.transports.Console)({
            colorize: true
        }),
        new (winston.transports.File)({
            filename: 'aeiou.log',
            json: false
        })
    ]
});

process.on('uncaughtException', error => {
    logger.error(`Uncaught exception: ${error.stack}`);
});

new Webserver(config, logger);
