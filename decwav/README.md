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
  3. Copy `C:\Program Files (x86)\DECtalk\include\TTSAPI.H` to `dectalk/` (next
     to `decwav.cpp`)
  4. Open the project in Visual Studio and build

I am not very familiar with Windows programming, so feel free to send a pull
request if you know a better way to compile it.

## Patching dectalk.dll

As described in the [aeiou README](../README.md), if you are running decwav
under wine (such as in the Docker installation instructions), then you will want
to patch dectalk.dll.  Refer to Step 3 under the installation steps for
instructions on how to patch the DLL, and then place it next to decwav.exe so
that Windows will load the patched DLL before the installed one.
