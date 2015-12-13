var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var path = require('path');
var serveStatic = require('serve-static');
var TaskQueue = require('./taskqueue');
var TTSTask = require('./ttstask');
var winston = require('winston');

var FILES_DIR = path.resolve(__dirname, '..', 'files');

function md5(text) {
    var hash = crypto.createHash('md5');
    hash.update(text);
    return hash.digest('hex');
}

function Webserver(config) {
    this.config = config;
    this.pending = {};
    this.taskQueue = new TaskQueue(config.maxConcurrency);
    this.init();
}

Webserver.prototype = {
    init: function () {
        this.initLogger();
        this.app = express();
        this.app.use('/files', serveStatic(FILES_DIR, {
            maxAge: Infinity
        }));
        this.app.get('/tts', this.onTTSRequest.bind(this));
        this.app.listen(this.config.port, this.config.host);
        this.logger.info('Listening on [' + this.config.host + ':' +
                this.config.port + ']');
    },

    initLogger: function () {
        this.logger = new winston.Logger({
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
    },

    onTTSRequest: function (req, res) {
        var text = req.query.text;
        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).send('Parameter "text" is required to be nonempty');
        } else if (text.length > this.config.maxTextLength) {
            return res.status(413).send('Input text size ' + text.length + ' exceeds ' +
                    'the maximum of ' + this.config.maxTextLength + ' characters.');
        }

        var filename = md5(text) + '.wav';

        function sendFail() {
            res.status(500).send('Unable to process input "' + text + '"');
        }

        function redirect() {
            res.redirect('/files/' + filename);
        }

        fs.exists(path.join(FILES_DIR, filename), function (exists) {
            if (exists) {
                this.logger.info('File already exists, redirecting to /files/' +
                        filename);
                return res.redirect('/files/' + filename);
            }

            if (this.pending.hasOwnProperty(filename)) {
                this.logger.info('Adding a new listener to pending task for ' + filename);
                this.pending[filename].on('finished', function (error) {
                    if (error) {
                        sendFail();
                    } else {
                        redirect();
                    }
                });
            } else {
                this.logger.info('Queueing a new task for ' + filename);
                this.pending[filename] = new TTSTask(filename, text);
                this.pending[filename].on('finished', function (error) {
                    delete this.pending[filename];
                    if (error) {
                        this.logger.error(filename + ': ' + error.message);
                        sendFail();
                    } else {
                        this.logger.info('Saved ' + filename);
                        redirect();
                    }
                }.bind(this));
                this.taskQueue.queueTask(this.pending[filename]);
            }
        }.bind(this));
    }
};

module.exports = Webserver;
