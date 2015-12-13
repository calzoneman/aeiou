var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;
var path = require('path');

var TTS_EXE = path.resolve(__dirname, '..', 'dectalk', 'TTS.exe');
var FILES_DIR = path.resolve(__dirname, '..', 'files');

function TTSTask(filename, text) {
    EventEmitter.call(this, []);
    this.filename = filename;
    this.text = text;
    this.finished = false;
}

TTSTask.prototype = Object.create(EventEmitter.prototype);

TTSTask.prototype.run = function () {
    try {
        this.childProcess = spawn(TTS_EXE, [
            path.join(FILES_DIR, this.filename),
            this.text
        ]);
    } catch (error) {
        this.finished = true;
        this.emit('finished', error);
        return;
    }

    this.childProcess.stdout.on('data', this.onChildStdout.bind(this));
    this.childProcess.on('exit', this.onChildExit.bind(this));
    this.timer = setTimeout(this.onTimeout.bind(this), 5000);
};

TTSTask.prototype.onChildStdout = function (data) {
    if (this.finished) {
        return;
    }

    data = data.toString();
    if (data.match(/Success/)) {
        this.emit('finished', null);
    } else {
        this.emit('finished', new Error('Failed for text (' + this.text + '): ' +
                data));
    }

    this.finished = true;
};

TTSTask.prototype.onChildExit = function (code) {
    clearTimeout(this.timer);
    if (!this.finished) {
        this.emit('finished', new Error('Child process exited with code ' + code));
        this.finished = true;
    }
};

TTSTask.prototype.onTimeout = function () {
    if (!this.finished) {
        this.emit('finished', new Error('Child process timed out'));
        this.finished = true;
        this.childProcess.kill();
    }
};

module.exports = TTSTask;
