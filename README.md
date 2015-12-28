aeiou
=====

This is a node.js webserver that wraps a C# application that wraps an ancient
DLL from a text-to-speech application designed for Windows 95 that
coincidentally is also the engine used by Moonbase Alpha.  Somehow, it works.

I'm not distributing my TTS.exe (and the associated DLLs) due to licensing
concerns, but you can try it out at http://tts.cyzon.us/files/playground.html.
You can also make requests to `http://tts.cyzon.us/tts?text=<URL encoded text>`
(the server will respond with a redirect to a rendered WAV file).  Currently
I've configured the input size limit to be 1024 characters.

## How it Works

The text to speech engine is based on
[SharpTalk](https://github.com/whatsecretproject/SharpTalk/), a .NET wrapper for
the FonixTalk text to speech software.  I modified it to support the original
dectalk.dll again (somewhere in the repo history they switched from DECTalk to
its successor FonixTalk, but did not explain exactly why this decision was made)
and also added a binding to the native WAV output function in the DLL (rather
than the render to memory buffer and then write to file approach that SharpTalk
uses which caused problems for me).

This node.js wrapper provides a web interface and calls the text to speech
program to render out text to WAV files.  The filename is based on a hash of the
input string, so it can be cached and served cheaply rather than regenerating it
every time.  There is also a built in concurrency limit due to the fact that
DECTalk's DRM prevents running more than 7 copies at once.

I'm running this on a cheap Windows VM from [VirMach](http://virmach.com/) since
I was unable to get it running correctly under Wine.  If you like it, feel free
to toss a few mBTC to `1LPg2gJxGYZEjBizg9iGhu5sLSe2i2hjA7`.

## License

The node.js code in this repository is presented under the BSD 2-Clause
simplified license:

```
Copyright (c) 2015 Calvin Montgomery, All rights reserved.

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
