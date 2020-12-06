# decwav

`decwav` is a very simple application that reads filenames and text input from
standard input, and uses DECTalk to render a WAV file.  It is used in the parent
project (aeiou) as the backend for processing TTS requests.

## Building

`decwav` only works on Windows (due to its dependency on DECTalk), but does work
under Wine in Linux.  However, I've only tried compiling it on Windows.

You will need:

  * An installation of DECTalk (I'm using version 4.61)
  * Visual Studio/Visual C++ (I used 2012 since that's an old version I already
    had installed in my Windows VM)

To build:

  1. Install DECTalk
  2. Copy `C:\Program Files (x86)\DECtalk\Us\dectalk.lib` to `dectalk/` (next to
     `decwav.cpp`)
  3. Copy `C:\Program Files (x86)\DECtalk\include\TTSAPI.H` to `dectalk/` (next to `decwav.cpp`)
  4. Open the project in Visual Studio and build
