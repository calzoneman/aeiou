const ERRORS = {
    DECWAV_EXITED: 'Internal error: the TTS engine exited unexpectedly.',
    DECWAV_TIMEOUT: 'The TTS engine timed out while processing your request.  You may have entered an unusual input that took too long to speak.',
    DECWAV_ERROR: 'Internal error: the TTS engine failed.',
    DECWAV_PROC_ERROR: 'Internal error: the TTS engine could not be executed.',
    DECWAV_NOT_READY: 'Internal error: request submitted but process is not ready.'
};

class TTSError extends Error {
    constructor(code, ...params) {
        super(ERRORS[code], ...params);

        Error.captureStackTrace(this, TTSError);
    }
}

exports.TTSError = TTSError;
for (let key in ERRORS) {
    exports[key] = {
        code: key,
        message: ERRORS[key]
    };
}
