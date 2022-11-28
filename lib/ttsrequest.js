class TTSRequest {
    constructor(filename, text) {
        this.filename = filename;
        this.text = text;
        this.pid = null;
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

exports.TTSRequest = TTSRequest;
