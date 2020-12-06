const { EventEmitter } = require('events');
const LOGGER = require('@calzoneman/jsli')('DecwavProc');

const ST_INIT = 0;
const ST_READY = 1;
const ST_RUNNING = 2;
const ST_EXITED = 3;
const ST_ERROR = 4;

class DecwavProc extends EventEmitter {
    constructor(proc) {
        super();

        this.id = Math.random().toString(32).substring(2);
        this.proc = proc;
        this.state = ST_INIT;
        this.activeRequest = null;

        proc.stdout.on('data', this.onData.bind(this));
        proc.on('close', this.onClose.bind(this));
        proc.on('error', this.onError.bind(this));
    }

    onData(data) {
        data = String(data);

        if (this.state === ST_INIT && /^Ready/.test(data)) {
            LOGGER.debug('%s: ready', this.id);
            this.state = ST_READY;
            this.emit('ready');
        } else if (this.state === ST_RUNNING) {
            if (/^Success/.test(data)) {
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
    }

    isReady() {
        return this.state === ST_READY;
    }
}

exports.DecwavProc = DecwavProc;
