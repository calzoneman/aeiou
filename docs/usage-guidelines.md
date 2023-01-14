Public API Usage guidelines
===========================

This section applies to those who are using my hosted endpoint for this
software.

  * If you expect your application to make more than **15 requests per minute**
    to the endpoint, please [contact me] in advance.
  * If you intend to speak the same messages to a large group of clients (for
    example, in a game lobby or chatroom), please make a single request from
    your application, and then distribute the returned audio to those other
    clients yourself.  Applications causing excessive bandwidth usage due to
    having many clients download the same rendered files may be blocked or rate
    limited.
  * If you are calling the endpoint from a script that will be distributed among
    potentially many users (for example, embedded in a website, or in a source
    engine clientside Lua script), please contact me in advance.
  * Use a descriptive User-Agent (not just the default one for the HTTP library
    you are using) so that requests from your application can be distinguished
    from other users.  If possible, provide contact information (such as a
    GitHub username or email address) in the User-Agent.
  * Rate limit your requests.  Applications or IP addresses sending excessive
    traffic may be blocked from accessing the service.
  * If you get an error (see below for error responses), please indicate this to
    the user of your application so that they don't think it got lost and keep
    spamming the same request.
  * Do not use the service for illegal or harmful purposes, including but not
    limited to:
    - Speaking ransom letters, threats of terror or violence, harassment, etc.
    - Distributing personal information without consent.
    - Distributing child sexual abuse material, or distributing content of a
      sexual nature to minors.
  * Report bugs on GitHub, [contact me] via email, or join [`#aeiou`] on
    EsperNet to discuss usage of the API.
  * If you make a mistake and get blocked, feel free to reach out to discuss how
    to fix your application.  My goal is not to ban people from the API, just to
    protect the shared resources of this free service.

[contact me]: mailto:cyzon@cyzon.us
[`#aeiou`]: https://webchat.esper.net/?channels=aeiou

### Disclaimer

  * Requests are logged for administrative purposes, and rendered audio files
    are retained for an undisclosed amount of time for caching purposes.  Do not
    use the service for text that you would be uncomfortable speaking in public.
  * The service is provided as-is, with no guarantees about uptime or quality of
    service.  I make a best effort to keep it available and working.  You may
    reach out to report and ask for assistance with problems involving the
    service, but do not expect a quick response at all times.
  * Applications appearing to abuse the service may be banned.  If you would
    like the opportunity to be contacted to resolve the problem, please either
    reach out to me in advance or make it clear in your User-Agent who to
    contact.
  * Malicious and/or accidental inputs can cause DECtalk to produce audio that
    is unusual or unpleasant.  It is conceivable that the playback of these
    sounds could be, in certain circumstances, damaging to human hearing or to
    audio equipment.  The caller of the API assumes the risk of encountering
    such inputs.
  * The service does not perform any filtering of input messages, and due to the
    flexibility of the DECtalk command system, doing so would be impractical.
    Produced audio may include offensive or disturbing speech, if such phrases
    were included in the input.  Calling applicatinos may wish to apply their
    own filters for text coming from untrusted users before calling the TTS
    endpoint.

API Usage
=========

To use the API, make a `GET` request to `/tts` and set the `text` query
parameter to the (URL-encoded) string that you wish to be played.  For example:

    GET /tts?text=john+madden

The API will then return, on success, a 302 redirect to a WAV file:

    HTTP/2 302
    location: /files/fe7d956123d58c2b44c2c52aeb1f6e45.wav

You may then download this WAV file to hear the rendered audio.  Note that many
HTTP clients may handle the 302 automatically, in which case you don't need to
worry about it.  Generated WAV files are only kept temporarily.

### Error Responses

  * `400 Bad Request`: returned if the input string is invalid or empty.  Do not
    retry.
  * `413 Payload Too Large`: returned if the input string exceeds the maximum
    length per request (default: 1024 characters).  Do not retry.
  * `429 Too Many Requests`: returned if you exceed the rate limit.  Wait before
    retrying.
  * `500 Internal Server Error`: returned in case of an internal failure
    handling the request that is not expected to be temporary (e.g., there are
    certain inputs that can crash DECtalk no matter how many times you try).  Do
    not retry -- the API detects repeated failures and blocks them so trying
    again is pointless.
  * `503 Service Unavailable`: returned in case of an internal failure that is
    expected to be temporary.  You can try again, but please wait a bit first.

### Caching

  * You may choose to implement your own caching of the input text to the
    rendered audio files, for example, if you expect your application to
    frequently re-request the same text.
  * You MUST NOT cache the WAV file URLs redirected to by the TTS endpoint.
    Rendered files are only retained for a limited, unspecified time and are
    deleted regularly.  Treat them as a single-use time-limited URL, which you
    may use to download the audio immediately, but not to bookmark and come back
    to later.

### About the TTS engine

  * Text is rendered by DECtalk v4.61.
  * DECtalk **only supports US-ASCII**.  **Do not put Unicode into the API, you
    will just get back long garbage audio files.**
  * Phonemes are turned on by default (`[:phone on]` is executed before every
    input).
  * The DECtalk state is reset between requests; commands which change voice
    parameters will only affect that request.
