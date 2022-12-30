const crypto = require('crypto');
const express = require('express');
const { createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('path');
const { Counter, Gauge, Summary, register, collectDefaultMetrics } = require('prom-client');
const proxyaddr = require('proxy-addr');
const serveStatic = require('serve-static');

const { DecwavPool } = require('./decwav-pool');
const { TTSRequest } = require('./ttsrequest');
const { TTSError } = require('./ttserror');
const { SimpleCache } = require('./simple-cache');

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
const ttsErrorCount = new Counter({
    name: 'aeiou_tts_error_count',
    help: 'Counter for TTS errors',
    labelNames: ['code']
});
const ttsPendingRequests = new Gauge({
    name: 'aeiou_tts_pending_requests',
    help: 'TTS concurrent pending requests gauge'
});
const ttsRequestLatency = new Summary({
    name: 'aeiou_tts_request_latency',
    help: 'TTS request latency histogram',
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
    // TODO: integrate a way to rotate the log automatically
    let requestLog = createWriteStream('ttsrequests.ndjson', { flags: 'a' });
    let failCache = new SimpleCache({
        maxAge: 24 * 3600 * 1000,
        maxElem: 1000
    });

    collectDefaultMetrics();

    app.use((req, res, next) => {
        allRequestsCount.inc(1);
        req.xForwardedFor = proxyaddr(req, config.web.trustedProxies);
        next();
    });

    app.use('/files', serveStatic(config.web.filesPath, { maxAge: Infinity }));

    app.get('/', (req, res) => {
        indexRequestsCount.inc(1);
        res.sendFile(INDEX_HTML);
    });

    app.get('/metrics', wrapAsync(async (req, res) => {
        try {
            let m = await register.metrics();
            res.type(register.contentType);
            res.end(m);
        } catch (error) {
            LOGGER.error('Error producing metrics: %s', error.stack);
            res.status(500).send('Error producing metrics');
        }
    }));

    app.get('/tts', wrapAsync(async (req, res) => {
        let timer = ttsRequestLatency.startTimer();
        let ctx = {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            forwardedIp: req.xForwardedFor,
            text: req.query.text,
            filename: null,
            decision: 'UNKNOWN'
        };
        res.on('finish', () => {
            ctx.endTimestamp = new Date().toISOString();
            ttsRequestsCount.labels(ctx.decision).inc(1);
            requestLog.write(JSON.stringify(ctx) + '\n');
            timer();
        });

        let text = req.query.text;
        if (typeof text !== 'string' || text.trim().length === 0) {
            ctx.decision = 'REJECT_INVALID';
            res.status(400)
                .send('Input text must be nonempty');
            return;
        } else if (text.length > config.maxTextLength) {
            ctx.decision = 'REJECT_INVALID';
            res.status(413)
                .send(
                    `Input text size ${text.length} exceeds the maximum of ` +
                    config.maxTextLength
                );
            return;
        }

        text = text.replace(/[\r\n]/g, ' ');

        let filename = md5(text) + '.wav';
        ctx.filename = filename;
        let tmpFilename = path.resolve(config.web.tmpPath, filename);
        let absFilename = path.resolve(config.web.filesPath, filename);
        let alreadyExists = await exists(absFilename);

        try {
            let cachedError = failCache.get(filename);
            if (cachedError !== null) {
                LOGGER.warn(
                    'Dropping request for %s due to cached failure %s',
                    filename,
                    cachedError.code
                );
                ctx.decision = 'REJECT_CACHED_FAILURE';
                res.status(500)
                    .send(cachedError.message);
            } else if (pendingRequests.has(filename)) {
                ctx.decision = 'ATTACH_TO_PENDING';
                LOGGER.debug(
                    'Attaching request to pendingRequests task for %s',
                    filename
                );
                await pendingRequests.get(filename);
                res.redirect(`/files/${filename}`);
            } else if (alreadyExists) {
                ctx.decision = 'REDIRECT';
                LOGGER.debug(
                    'File %s already exists; redirecting request',
                    filename
                );
                res.redirect(`/files/${filename}`);
            } else {
                ctx.decision = 'QUEUE_NEW';
                LOGGER.debug(
                    'Queueing a new task for %s',
                    filename
                );
                let ttsReq = new TTSRequest(
                    tmpFilename,
                    text
                );
                let promise = ttsReq.promise.then(async () => {
                    await fs.rename(tmpFilename, absFilename);
                });
                pendingRequests.set(filename, promise);
                ttsPendingRequests.set(pendingRequests.size);

                pool.queueRequest(ttsReq);
                await promise;
                ctx.decwavPid = ttsReq.pid;
                res.redirect(`/files/${filename}`);
            }
        } catch (error) {
            let message;
            let code;
            let status;
            if (error instanceof TTSError) {
                message = error.message;
                code = error.code;
                LOGGER.error('TTSError %s while rendering "%s"', code, text);

                switch (code) {
                    case 'DECWAV_EXITED':
                    case 'DECWAV_TIMEOUT':
                    case 'DECWAV_SEGFAULT':
                        LOGGER.warn('Adding %s to failure cache', filename);
                        failCache.put(filename, error);
                        status = 500;
                        break;
                    default:
                        status = 503;
                        break;
                }
            } else {
                LOGGER.error('Unexpected error: %s', error.stack);
                message = 'An internal error occurred.';
                code = 'UNKNOWN';
                status = 503;
            }

            ttsErrorCount.labels(code).inc(1);

            res.status(status)
                .send(message);
        } finally {
            if (ctx.decision === 'QUEUE_NEW') {
                pendingRequests.delete(filename);
                ttsPendingRequests.set(pendingRequests.size);
            }
        }
    }));

    app.listen(config.web.port, config.web.host);
    LOGGER.info(
        'Listening on %s:%s',
        config.web.host,
        config.web.port
    );
};

async function exists(filename) {
    try {
        await fs.access(filename, fs.constants.R_OK);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }

        throw error;
    }
}

function wrapAsync(afn) {
    return (req, res) => {
        afn(req, res).then(() => {}).catch(error => {
            LOGGER.error('Unexpected error in request handler: %s', error.stack);
            res.status(500).send('Internal error');
        });
    };
}
