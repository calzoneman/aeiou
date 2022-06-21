const { spawn } = require('child_process');
const { DecwavProc } = require('./decwav');
const { Gauge } = require('prom-client');
const {
    TTSError,
    QUEUE_FULL
} = require('./ttserror');
const LOGGER = require('@calzoneman/jsli')('DecwavPool');

const queueDepthSummary = new Gauge({
    name: 'aeiou_queue_depth',
    help: 'TTS queue depth gauge'
});

class DecwavPool {
    constructor(nproc, maxQueue, exec, args) {
        this.nproc = nproc;
        this.procs = new Set();
        this.exec = exec;
        this.args = args;
        this.queue = [];
        this.maxQueue = maxQueue;
        this.spawnChildrenTimer = null;
        this.spawnChildren();
    }

    queueRequest(request) {
        queueDepthSummary.set(this.queue.length);

        if (this.queue.length >= this.maxQueue) {
            LOGGER.warn('Rejecting request %s: task queue is full', request.filename);
            request.reject(new TTSError(QUEUE_FULL));
            return;
        }

        for (let decwav of this.procs) {
            if (decwav.isReady()) {
                decwav.submitRequest(request);
                return;
            }
        }

        this.queue.push(request);
    }

    spawnChildren() {
        while (this.procs.size < this.nproc) {
            this.spawnProc();
        }

        this.spawnChildrenTimer = null;
    }

    spawnProc() {
        LOGGER.debug(
            'Spawning %s with args %j',
            this.exec,
            this.args
        );
        let proc = spawn(this.exec, this.args);
        let decwav = new DecwavProc(proc);

        LOGGER.info('Spawned decwav process with pid %d', proc.pid);
        decwav.on('ready', () => this.onProcReady(decwav));
        decwav.on('exited', () => this.onProcExited(decwav));

        this.procs.add(decwav);
    }

    onProcReady(decwav) {
        queueDepthSummary.set(this.queue.length);
        if (this.queue.length > 0) {
            decwav.submitRequest(this.queue.shift());
        }
    }

    onProcExited(decwav) {
        LOGGER.info('Removing pid %d from the pool', decwav.proc.pid);
        this.procs.delete(decwav);

        if (this.spawnChildrenTimer === null) {
            this.spawnChildrenTimer = setTimeout(() => this.spawnChildren(), 5_000);
        }
    }
}

exports.DecwavPool = DecwavPool;
