const assert = require('assert');
const http = require('http');
const https = require('https');

function getBaseURL() {
    const endpoint = process.env.AEIOU_TEST_ENDPOINT;

    if (!endpoint) {
        throw new Error('$AEIOU_TEST_ENDPOINT is unset');
    }

    return new URL(endpoint);
}

async function callTTS(text) {
    let url = getBaseURL();
    url.pathname = '/tts';
    url.searchParams.set('text', text);

    const get = /^https/.test(url.protocol) ? https.get : http.get;

    return new Promise((resolve, reject) => {
        const req = get(url);
        req.on('error', error => {
            reject(error);
        });
        req.on('response', res => {
            resolve({
                statusCode: res.statusCode,
                headers: res.headers
            });
            req.abort();
        });
    });
}

async function getMetrics() {
    let url = getBaseURL();
    url.pathname = '/metrics';

    const get = /^https/.test(url.protocol) ? https.get : http.get;

    return new Promise((resolve, reject) => {
        const req = get(url);
        req.on('error', error => {
            reject(error);
        });
        req.on('response', res => {
            if (res.statusCode !== 200) {
                req.abort();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let buf = '';
            res.on('data', data => buf += data);
            res.on('end', () => {
                resolve(buf);
            });
        });
    });
}

function randomID() {
    return Math.random().toString(31).substring(2);
}

function getMetricCount(metrics, pattern) {
    const line = metrics.split('\n').filter(
        it => !it.startsWith('#') && pattern.test(it)
    )[0];

    if (line === undefined) return 0; // if not found, assume 0

    const n = parseInt(line.split(' ').splice(-1)[0], 10);
    if (isNaN(n)) throw new Error(`Couldn't parse number for ${pattern}`);

    return n;
}

function diffMetrics(before, after, pattern) {
    const beforeNum = getMetricCount(before, pattern);
    const afterNum = getMetricCount(after, pattern);

    return afterNum - beforeNum;
}

describe('aeiou API', () => {
    it('renders a new file', async () => {
        const res = await callTTS(randomID());
        assert.strictEqual(res.statusCode, 302);
        assert.match(res.headers['location'], /\/files\/[0-9a-f]+\.wav/);
    });

    it('redirects to a cached file', async () => {
        const start = await getMetrics();
        const text = randomID();

        const res1 = await callTTS(text);
        const before = await getMetrics();

        const res2 = await callTTS(text);
        const after = await getMetrics();

        assert.strictEqual(res1.headers['location'], res2.headers['location']);

        // First request renders the file
        assert.strictEqual(
            diffMetrics(start, before, /aeiou_rendered_files_count/),
            1
        );
        assert.strictEqual(
            diffMetrics(start, before, /aeiou_tts_requests_count\{decision="QUEUE_NEW"\}/),
            1
        );

        // Second request returns cached copy
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_rendered_files_count/),
            0
        );
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_tts_requests_count\{decision="QUEUE_NEW"\}/),
            0
        );
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_tts_requests_count\{decision="REDIRECT"\}/),
            1
        );
    });

    it('attaches to an in-flight request', async () => {
        const before = await getMetrics();
        const text = randomID();

        const p1 = callTTS(text);
        const p2 = callTTS(text);

        const [res1, res2] = await Promise.all([p1, p2]);
        const after = await getMetrics();

        assert.strictEqual(res1.headers['location'], res2.headers['location']);

        // File is rendered once
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_rendered_files_count/),
            1
        );
        // Only one request is a QUEUE_NEW
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_tts_requests_count\{decision="QUEUE_NEW"\}/),
            1
        );
        // The other is an ATTACH_TO_PENDING
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_tts_requests_count\{decision="ATTACH_TO_PENDING"\}/),
            1
        );
    });

    it('rejects the empty string as invalid', async () => {
        const res = await callTTS('');
        assert.strictEqual(res.statusCode, 400);
    });

    // XXX: assumes default config for length limit
    it('rejects a string too long as invalid', async () => {
        let longString = '';
        for (let i = 0; i < 1024+1; i++) {
            longString += 'a';
        }

        const res = await callTTS(longString);
        assert.strictEqual(res.statusCode, 413);
    });

    it('caches and immediately rejects repeated requests for timeouts/crashes', async function() {
        // Crashes dectalk, not sure quite why, but works as a crash test case
        // for now.
        let badString = 'EST CST MST PST EST CST MST PST EST CST MST PST EST ' +
                        'CST MST PST EST CST MST PST EST CST MST PST EST CST ' +
                        'MST PST EST CST MST PST EST CST MST PST EST CST MST ' +
                        'PST EST CST MST PST EST CST MST PST EST CST MST PST ' +
                        'EST CST MST PST EST CST MST PST EST CST' + randomID();

        const before = await getMetrics();
        const res1 = await callTTS(badString);
        assert.strictEqual(res1.statusCode, 500);

        const res2 = await callTTS(badString);
        const after = await getMetrics();
        assert.strictEqual(res2.statusCode, 500);

        // Only one request is a QUEUE_NEW
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_tts_requests_count\{decision="QUEUE_NEW"\}/),
            1
        );
        // The other is a REJECT_CACHED_FAILURE
        assert.strictEqual(
            diffMetrics(before, after, /aeiou_tts_requests_count\{decision="REJECT_CACHED_FAILURE"\}/),
            1
        );
    });
});
