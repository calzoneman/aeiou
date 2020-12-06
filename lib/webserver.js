const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Counter, Summary, register, collectDefaultMetrics } = require('prom-client');
const proxyaddr = require('proxy-addr');
const serveStatic = require('serve-static');

const { DecwavPool } = require('./decwav-pool');
const { TTSRequest } = require('./ttsrequest');

const LOGGER = require('@calzoneman/jsli')('webserver');
const INDEX_HTML = path.resolve(__dirname, '..', 'index.html');

function md5(text) {
    var hash = crypto.createHash('md5');
    hash.update(text);
    return hash.digest('hex');
}

const allRequestsCount = new Counter({
    name: 'aeiou_all_requests_count',
    help: 'Counter for all HTTP requests'
});
const indexRequestsCount = new Counter({
    name: 'aeiou_index_requests_count',
    help: 'Counter for index.html HTTP requests'
});
const ttsRequestsCount = new Counter({
    name: 'aeiou_tts_requests_count',
    help: 'Counter for TTS HTTP requests',
    labelNames: ['decision']
});
const ttsPendingRequests = new Summary({
    name: 'aeiou_tts_pending_requests',
    help: 'TTS concurrent pending requests histogram',
    percentiles: [0.01, 0.1, 0.5, 0.9, 0.99, 1],
    maxAgeSeconds: 600,
    ageBuckets: 5
});

exports.start = function start(config) {
    let pendingRequests = new Map();
    let app = express();
    let pool = new DecwavPool(
        config.decwavPool.maxProcs,
        config.decwavPool.maxQueueDepth,
        config.decwavPool.exec,
        config.decwavPool.args,
        config.decwavPool.env
    );
    let requestLog = fs.createWriteStream('ttsrequests.ndjson', { flags: 'a' });

    collectDefaultMetrics();

    app.use((req, res, next) => {
        allRequestsCount.inc(1);
        proxyaddr(req, config.web.trustedProxies);
        next();
    });
    app.use('/files', serveStatic(config.web.filesPath, { maxAge: Infinity }));
    app.get('/', (req, res) => {
        indexRequestsCount.inc(1);
        res.sendFile(INDEX_HTML);
    });
    app.get('/metrics', (req, res) => {
        res.type(register.contentType);
        res.end(register.metrics());
    });
    app.get('/tts', (req, res) => {
        let ctx = {
            ip: req.ip,
            text: req.query.text,
            filename: null,
            decision: 'UNKNOWN'
        };
        res.on('finish', () => {
            ttsRequestsCount.labels(ctx.decision).inc(1);
            requestLog.write(JSON.stringify(ctx) + '\n');
        });

        let text = req.query.text;
        if (typeof text !== 'string' || text.trim().length === 0) {
            ctx.decision = 'REJECT_INVALID';
            return res.status(400)
                .send('Input text must be nonempty');
        } else if (text.length > config.maxTextLength) {
            ctx.decision = 'REJECT_INVALID';
            return res.status(413)
                .send(
                    `Input text size ${text.length} exceeds the maximum of ` +
                    config.maxTextLength
                );
        }

        text = text.replace(/[\r\n]/g, ' ');

        let filename = md5(text) + '.wav';
        ctx.filename = filename;
        let absFilename = path.resolve(config.web.filesPath, filename);

        function sendFail() {
            res.status(500).send('Unable to process input "' + text + '"');
        }

        function redirect() {
            res.redirect('/files/' + filename);
        }

        fs.exists(absFilename, exists => {
            if (exists) {
                ctx.decision = 'REDIRECT';
                LOGGER.debug(
                    'File %s already exists; redirecting request',
                    filename
                );
                return res.redirect(`/files/${filename}`);
            }

            if (pendingRequests.has(filename)) {
                ctx.decision = 'ATTACH_TO_PENDING';
                LOGGER.debug(
                    'Attaching request to pendingRequests task for %s',
                    filename
                );
                pendingRequests.get(filename).promise
                    .then(redirect)
                    .catch(sendFail);
            } else {
                ctx.decision = 'QUEUE_NEW';
                LOGGER.debug(
                    'Queueing a new task for %s',
                    filename
                );
                let ttsReq = new TTSRequest(
                    absFilename,
                    text
                );
                pendingRequests.set(filename, ttsReq);

                ttsReq.promise.then(() => {
                    pendingRequests.delete(filename);
                    redirect();
                }).catch(error => {
                    sendFail();
                });

                pool.queueRequest(ttsReq);
            }

            ttsPendingRequests.observe(pendingRequests.size);
        });
    });

    app.listen(config.web.port, config.web.host);
    LOGGER.info(
        'Listening on %s:%s',
        config.web.host,
        config.web.port
    );
};
