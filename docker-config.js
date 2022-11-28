exports.web = {
    host: '0.0.0.0',
    port: 8080,
    filesPath: '/files/rendered',
    tmpPath: '/files/tmp',
    trustedProxies: ['loopback', '192.168.0.0/16', '172.16.0.0/12']
};

exports.decwavPool = {
    maxProcs: parseInt(process.env.AEIOU_MAX_PROCS, 10),
    maxQueueDepth: parseInt(process.env.AEIOU_MAX_QUEUE_DEPTH, 10),
    exec: 'xvfb-run',
    args: ['wine', 'decwav.exe']
};

exports.maxTextLength = parseInt(process.env.AEIOU_MAX_LENGTH, 10);
