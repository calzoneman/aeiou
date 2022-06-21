2.2.2
=====

  * Added a new dectalk.dll patch for handling overflows in phoneme duration.

2.2.1
=====

  * Fixed a bug in the handling of decwav output.

2.2.0
=====

  * Made decwav print "Ready" on each loop after init.  Made aeiou wait for
    Ready after Success before assigning another request to the process.
  * Changed the queue depth metric to a gauge.
