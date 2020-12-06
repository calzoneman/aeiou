const { EventEmitter } = require('events');
const { Counter, Summary } = require('prom-client');
const LOGGER = require('@calzoneman/jsli')('DecwavProc');

const ST_INIT = 0;
const ST_READY = 1;
const ST_RUNNING = 2;
const ST_EXITED = 3;
const ST_ERROR = 4;

const renderedFilesCount = new Counter({
    name: 'aeiou_rendered_files_count',
    help: 'Counter for WAV files rendered'
});
const ttsErrorCount = new Counter({
    name: 'aeiou_tts_error_count',
    help: 'Counter for errored TTS requests'
});
const ttsTimeoutCount = new Counter({
    name: 'aeiou_tts_timeout_count',
    help: 'Counter for timed out TTS requests'
});
const ttsLatency = new Summary({
    name: 'aeiou_tts_latency',
    help: 'TTS latency histogram',
    percentiles: [0.01, 0.1, 0.5, 0.9, 0.99, 1],
    maxAgeSeconds: 600,
    ageBuckets: 5
});

class DecwavProc extends EventEmitter {
    constructor(proc) {
        super();

        this.id = Math.random().toString(32).substring(2);
        this.proc = proc;
        this.state = ST_INIT;
        this.activeRequest = null;
        this.timeout = null;
        this.timer = null;

        proc.stdout.on('data', this.onData.bind(this));
        proc.on('exit', this.onClose.bind(this));
        proc.on('error', this.onError.bind(this));
    }

    clearTimers() {
        clearTimeout(this.timeout);
        this.timeout = null;
        this.timer && this.timer();
        this.timer = null;
    }

    onData(data) {
        this.clearTimers();
        data = String(data);

        if (this.state === ST_INIT && /^Ready/.test(data)) {
            LOGGER.debug('%s: ready', this.id);
            this.state = ST_READY;
            this.emit('ready');
        } else if (this.state === ST_RUNNING) {
            if (/^Success/.test(data)) {
                renderedFilesCount.inc(1);
                LOGGER.debug(
                    '%s: success for %s',
                    this.id,
                    this.activeRequest.filename
                );
                this.activeRequest.resolve();
                this.activeRequest = null;
                this.state = ST_READY;
                this.emit('ready');
            } else {
                ttsErrorCount.inc(1);
                LOGGER.error('%s: error from TTS: %s', this.id, data.trim());
                this.activeRequest.reject(new Error('TTS process failed'));
                this.state = ST_READY;
                this.activeRequest = null;
                this.emit('ready');
            }
        } else {
            LOGGER.error(
                '%s: Unexpected data received: state %d data %s',
                 this.id,
                 this.state,
                 data.trim()
            );
            // Who knows what happened, kill it to be safe
            this.proc.kill('SIGKILL');
        }
    }

    onError(error) {
        this.clearTimers();
        LOGGER.error('%s: TTS process error: %s', this.id, error.stack);

        if (this.state === ST_RUNNING) {
            this.activeRequest.reject(new Error('TTS process errored'));
            this.activeRequest = null;
        }
        if (this.state !== ST_ERROR) {
            this.state = ST_ERROR;
            this.proc.kill('SIGKILL');
        }
    }

    onClose(code) {
        this.clearTimers();
        LOGGER.warn('%s: TTS process exited with code %d', this.id, code);

        if (this.state === ST_RUNNING) {
            this.activeRequest.reject(new Error('TTS process exited'));
            this.activeRequest = null;
        }
        if (this.state !== ST_EXITED) {
            this.state = ST_EXITED;
            this.emit('exited');
        }
    }

    submitRequest(request) {
        if (this.state !== ST_READY) {
            LOGGER.error(
                '%s: unexpected task submitted to TTS process in state %d',
                this.id,
                this.state
            );
            request.reject(new Error('TTS process not ready to accept requests'));
            return;
        }

        LOGGER.debug('%s: submitted %s', this.id, request.filename);
        this.activeRequest = request;
        this.state = ST_RUNNING;
        this.proc.stdin.write(request.filename + '\n');
        this.proc.stdin.write(request.text + '\n');
        this.timeout = setTimeout(() => {
            LOGGER.error('%s: timeout waiting for TTS', this.id);
            ttsTimeoutCount.inc();
            this.proc.kill('SIGKILL');
        }, 5_000);
        this.timer = ttsLatency.startTimer();
    }

    isReady() {
        return this.state === ST_READY;
    }
}

exports.DecwavProc = DecwavProc;
