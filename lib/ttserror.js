const ERRORS = {
    DECWAV_EXITED: 'Internal error: the TTS engine exited unexpectedly.',
    DECWAV_TIMEOUT: 'The TTS engine timed out while processing your request.  You may have entered an unusual input that took too long to speak.',
    DECWAV_ERROR: 'Internal error: the TTS engine failed.',
    DECWAV_PROC_ERROR: 'Internal error: the TTS engine could not be executed.',
    DECWAV_NOT_READY: 'Internal error: request submitted but process is not ready.',
    DECWAV_SEGFAULT: 'Internal error: input caused DECtalk to crash.  Please do not try that again.',
    QUEUE_FULL: 'There are too many requests right now.  Please try again later.'
};

class TTSError extends Error {
    constructor(code, ...params) {
        super(ERRORS[code], ...params);

        this.code = code;
        Error.captureStackTrace(this, TTSError);
    }
}

exports.TTSError = TTSError;
for (let key in ERRORS) {
    exports[key] = key;
}
