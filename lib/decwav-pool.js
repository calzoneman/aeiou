const { spawn } = require('child_process');
const { DecwavProc } = require('./decwav');
const LOGGER = require('@calzoneman/jsli')('DecwavPool');

class DecwavPool {
    constructor(nproc, maxQueue, exec, args, env) {
        this.nproc = nproc;
        this.procs = new Set();
        this.exec = exec;
        this.args = args;
        this.env = env;
        this.queue = [];
        this.maxQueue = maxQueue;
        this.spawnChildren();
    }

    queueRequest(request) {
        if (this.queue.length >= this.maxQueue) {
            LOGGER.warn('Rejecting request %s: task queue is full', request.filename);
            request.reject(new Error('TTS queue is full'));
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
    }

    spawnProc() {
        let proc = spawn(this.exec, this.args, this.env);
        let decwav = new DecwavProc(proc);

        LOGGER.info('Spawned decwav process %s with pid %d', decwav.id, proc.pid);
        decwav.on('ready', () => this.onProcReady(decwav));
        decwav.on('exited', () => this.onProcExited(decwav));

        this.procs.add(decwav);
    }

    onProcReady(decwav) {
        if (this.queue.length > 0) {
            decwav.submitRequest(this.queue.shift());
        }
    }

    onProcExited(decwav) {
        LOGGER.info('Removing process %s (pid %d) from the pool', decwav.id, decwav.proc.pid);
        this.procs.delete(decwav);
        this.spawnChildren();
    }
}

exports.DecwavPool = DecwavPool;
