const { EventEmitter } = require('events');
const { Counter, Summary } = require('prom-client');
const {
    TTSError,
    DECWAV_EXITED,
    DECWAV_TIMEOUT,
    DECWAV_ERROR,
    DECWAV_PROC_ERROR,
    DECWAV_NOT_READY,
    DECWAV_SEGFAULT
} = require('./ttserror');
const byline = require('byline');
const LOGGER = require('@calzoneman/jsli')('DecwavProc');

const ST_INIT = 0;
const ST_READY = 1;
const ST_RUNNING = 2;
const ST_EXITED = 3;
const ST_ERROR = 4;
const ST_SEGFAULT = 5;

const renderedFilesCount = new Counter({
    name: 'aeiou_rendered_files_count',
    help: 'Counter for WAV files rendered'
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

        this.proc = proc;
        this.activeRequest = null;
        this.timeout = null;
        this.timer = null;
        this.timedOut = false;
        this.state = null;
        this.initTimer = null;
        this.setState(ST_INIT);

        let stdout = byline(proc.stdout);

        stdout.on('data', this.onData.bind(this));
        proc.on('exit', this.onClose.bind(this));
        proc.on('error', this.onError.bind(this));
        // Avoid synchronous throw on EPIPE
        proc.stdin.on('error', this.onError.bind(this));
    }

    setState(nstate) {
        if (this.state === ST_INIT) {
            clearTimeout(this.initTimer);
            this.initTimer = null;
        }

        this.state = nstate;
        if (this.state === ST_INIT) {
            this.initTimer = setTimeout(() => {
                if (this.state === ST_INIT) {
                    LOGGER.warn(
                        'pid %d: still in init state after 10 seconds',
                        this.proc.pid
                    );
                    this.proc.kill('SIGKILL');
                }
            }, 10_000);
        } else if (this.state === ST_READY) {
            this.emit('ready');
        } else if (this.state === ST_EXITED) {
            this.emit('exited');
        }
    }

    clearTimers() {
        clearTimeout(this.timeout);
        this.timeout = null;
        if (this.timer) this.timer();
        this.timer = null;
    }

    onData(data) {
        this.clearTimers();
        data = String(data);

        if (this.state === ST_INIT && /^Ready/.test(data)) {
            LOGGER.debug('pid %d: ready', this.proc.pid);
            this.setState(ST_READY);
        } else if (this.state === ST_RUNNING && /^Success/.test(data)) {
            renderedFilesCount.inc(1);
            LOGGER.debug(
                '%d: success for %s',
                this.proc.pid,
                this.activeRequest.filename
            );
            this.activeRequest.resolve();
            this.activeRequest = null;
            this.setState(ST_INIT);
        } else if (/^Error/.test(data)) {
            LOGGER.error(
                'pid %d: error from TTS in state %d: %s',
                this.proc.pid,
                this.state,
                data.trim()
            );
            if (this.state === ST_RUNNING) {
                this.activeRequest.reject(new TTSError(DECWAV_ERROR));
                this.activeRequest = null;
            }

            // decwav should abort on error, but just in case
            this.proc.kill('SIGKILL');
            this.setState(ST_ERROR);
        } else if (!this.checkSegfault(data)) {
            LOGGER.warn(
                'pid %d: Unexpected data received: state %d data %s',
                 this.proc.pid,
                 this.state,
                 data.trim()
            );
            if (this.state !== ST_EXITED) {
                // If we got unexpected data we can't really predict what state
                // decwav is in, so kill it to be safe
                this.proc.kill('SIGKILL');
            }
        }
    }

    checkSegfault(data) {
        if (/Unhandled.*page fault/.test(data)) {
            LOGGER.error('pid %d segfaulted: %s', this.proc.pid, data);

            if (this.state === ST_RUNNING) {
                this.activeRequest.reject(new TTSError(DECWAV_SEGFAULT));
                this.activeRequest = null;
            }

            this.setState(ST_SEGFAULT);
            this.proc.kill('SIGKILL');
            return true;
        } else if (this.state === ST_SEGFAULT) {
            return true;
        } else {
            return false;
        }
    }

    onError(error) {
        this.clearTimers();
        LOGGER.error('%d: child process error: %s', this.proc.pid, error.stack);

        if (this.state === ST_RUNNING) {
            this.activeRequest.reject(new TTSError(DECWAV_PROC_ERROR));
            this.activeRequest = null;
        }
        if (this.state !== ST_ERROR) {
            this.state = ST_ERROR;
            this.proc.kill('SIGKILL');
        }
    }

    onClose(code, signal) {
        this.clearTimers();
        if (code === undefined || code === null) {
            LOGGER.warn(
                'pid %d: TTS process exited due to signal %s',
                this.proc.pid,
                signal
            );
        } else {
            LOGGER.warn(
                'pid %d: TTS process exited with code %d',
                this.proc.pid,
                code
            );
        }

        if (this.state === ST_RUNNING) {
            let ecode;
            if (this.timedOut) {
                ecode = DECWAV_TIMEOUT;
            } else {
                ecode = DECWAV_EXITED;
            }

            this.activeRequest.reject(new TTSError(ecode));
            this.activeRequest = null;
        }
        if (this.state !== ST_EXITED) {
            this.setState(ST_EXITED);
        }
    }

    submitRequest(request) {
        request.pid = this.proc.pid;

        if (this.state !== ST_READY) {
            LOGGER.error(
                'Unexpected task submitted to TTS process %d in state %d',
                this.proc.pid,
                this.state
            );
            request.reject(new TTSError(DECWAV_NOT_READY));
            return;
        }

        LOGGER.debug('pid %d: submitted %s', this.proc.pid, request.filename);
        this.activeRequest = request;
        this.setState(ST_RUNNING);
        this.proc.stdin.write(request.filename + '\n');
        this.proc.stdin.write(request.text + '\n');
        this.timeout = setTimeout(() => {
            this.timedOut = true;
            LOGGER.error('pid %d: timeout waiting for TTS', this.proc.pid);
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
