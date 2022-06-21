aeiou
=====

`aeiou` is a web-based API for text-to-speech using the DECTalk engine.  You may
recognize this particular speech-synthesis engine from various videogames and
YouTube videos.

In order to install it, you need Windows (or Wine on Linux) and a copy of
DECTalk (I'm using version 4.61).

Please [contact me](mailto:cyzon@cyzon.us) if you would like to try out the copy
I am hosting.

## Installation under Docker

You will need:

  * Docker
  * The DECtalk 4.61 release, which you can find
    [here](http://theflameofhope.co/dectalkreader1/)
  * Visual Studio, or some way of compiling Windows C++ projects

For this guide, I assume your local user account has uid=1000, if it does not,
you will need to adjust the uid in the Dockerfile to match.

### Step 1: Build the docker image

    docker build -t aeiou:latest .

### Step 2: Install DECtalk into a new wineprefix

The provided Docker image runs DECtalk in Wine, which requires DECtalk to be
installed into a 32-bit wineprefix.  The easiest way to do this is to reuse the
Docker image, overriding the startup command and bind-mounting the relevant
files as well as your local X11 socket (for the GUI windows to appear).

Assuming you want to create a new wineprefix under `./wineprefix`, and
you have extracted DECtalkMain.zip to `/tmp/dectalk`:

    mkdir $PWD/wineprefix
    docker run --init --rm -it -v $PWD/wineprefix:/wineprefix -v /tmp/dectalk:/dectalk -v /tmp/.X11-unix:/tmp/.X11-unix --name aeiou aeiou:latest /bin/sh

Once you are at the command prompt inside the Docker container, run:

    cd /dectalk
    wine Setup.exe

...and then follow the installation wizard.

  * You may get a prompt asking you to install Mono libraries.  You can cancel
    this; aeiou doesn't need it.
  * Make sure the `Windows SDK` box is ticked.  You can leave the Windows CE and
    SAPI ones unticked.
  * When prompted, set the language to English US.
  * If you get an error message about an RPC call failing, try running the
    installer again.  In my experience, it usually works the second time (I
    don't know why).
  * Once the installation completes, it will attempt to launch the demonstration
    program which may show an error about a missing wave device.  You can ignore
    this; aeiou writes output into wav files and doesn't require a local
    playback device to be present.

### Step 3: Build decwav, and patch dectalk.dll

Decwav is a small Windows program that aeiou's frontend calls to process TTS
requests and write out WAV files.  To build it, see
[decwav/README.md](./decwav/README.md).

You will also need to patch dectalk.dll to work around a couple of issues with
wine.  To do so:

    cp ./wineprefix/drive_c/Program\ Files/DECtalk/Us/dectalk.dll ./patched-dectalk.dll
    ./decwav/patchdll.js ./patched-dectalk.dll

You should see this output:

    Patching 0x30ac8
    Patching 0x30ae8
    Patching 0x2e0ee
    Patching 0x25ed0
    Patching 0x264d0

Note: if you don't have node.js installed on your local machine, you can do
something similar to Step 2 and reuse the Docker image to run the patching
commands.

### Step 4: Run

Now you can run the image.  Make sure you bind-mount both decwav.exe and your
patched dectalk.dll, as well as the wineprefix you created above:

    docker run --init --rm -it -p 8080:8080 -v $PWD/decwav.exe:/var/lib/aeiou/aeiou/decwav.exe -v $PWD/patched-dectalk.dll:/var/lib/aeiou/aeiou/dectalk.dll -v $PWD/wineprefix:/wineprefix --name aeiou aeiou:latest

You may also choose to override certain environment variables if desired:


  * `AEIOU_MAX_LENGTH=1024` maximum number of characters per request
  * `AEIOU_MAX_PROCS=3` number of decwav processes in the rendering pool (each
    process can handle one request at a time)
  * `AEIOU_MAX_QUEUE_DEPTH=30` maximum number of pending requests waiting for a
    decwav process to become available

Additionally, you may want to bind-mount `/logs` and `/files` to have easy
access to the log files and to be able to clean up the output files occasionally
(aeiou does not automatically expire rendered files, but you may want to run a
cron script to remove files older than a few days for disk savings).

### Troubleshooting

  * Error at decwav.cpp:25 after call to TextToSpeechStartup: 4
    - The most likely cause is that you have not patched dectalk.dll (please
      check Step 3 again), or you have not bind-mounted your dectalk.dll to the
      correct location (please check Step 4 again).
  * Error at decwav.cpp:25 after call to TextToSpeechStartup: 11
    - The most likely cause is that your DECtalk installation is incomplete.
      Try running the DECtalk installer again (see Step 2).
  * pid X: timeout waiting for TTS
    - aeiou waits at most 5 seconds for a single text to speech request to be
      rendered.  This error occurs when a single request takes longer than 5
      seconds, so aeiou is canceling the request by killing the process.  The
      most common cause is excessively long output -- while aeiou does enforce a
      character limit, certain characters can cause the TTS engine to speak very
      long output.  For example, large blocks of Unicode characters can cause
      the engine to read out garbage like "A circumflex A circumflex question
      mark ...".
    - Note that the 5 second timeout here refers to *how long it takes to create
      the file*, not necessarily how long the output speech is.

## License

The code in this repository is presented under the BSD 2-Clause
simplified license:

```
Copyright (c) 2015-2022 Calvin Montgomery, All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list
of conditions and the following disclaimer. Redistributions in binary form must
reproduce the above copyright notice, this list of conditions and the following
disclaimer in the documentation and/or other materials provided with the
distribution. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY
OF SUCH DAMAGE.
```
