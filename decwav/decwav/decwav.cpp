#include <iostream>
#include <string>
#include <process.h>
#include <windows.h>

#include "TTSAPI.H"

#define MMSUCCEEDED(x) ((x) == MMSYSERR_NOERROR)
#define MMFAILED(x) (!MMSUCCEEDED(x))
#define CONTINUE TRUE
#define ABORT FALSE

/*
	If decwav crashes without successfully calling TextToSpeechShutdown(), then the
	license file will be stuck with an inaccurate count of running processes.
	Just reset it to 0 here, we already enforce process count limits in aeiou
*/
BOOL ResetLicenseCounter() {
	HANDLE h = CreateFileMappingA(
		INVALID_HANDLE_VALUE,
		0,
		PAGE_READWRITE,
		0,
		10,
		"DECtalkDllLicensememfilemap"
	);
	if (h == NULL) {
		std::cout << "ERROR: CreateFileMappingA returned code " << GetLastError() << std::endl;
		return FALSE;
	}

	LPVOID mem = MapViewOfFile(h, FILE_MAP_WRITE, 0, 0, 0);
	if (mem == NULL) {
		std::cout << "ERROR: MapViewOfFile returned code " << GetLastError() << std::endl;
		return FALSE;
	}

	*((unsigned char *)mem) = 0;
	UnmapViewOfFile(mem);

	return TRUE;
}

/*
  TextToSpeechShutdown() attempts to send an exit message, however, one of DT's background
  threads is buggy (and who can blame them?  Having GetMessageA() return a three-state BOOL
  is a fascinating design decision) and ends up busy-looping under Wine.

  Avoid this by stealing the handle to the background thread, replacing it with a dummy
  (so that DECTalk still has something to close), and terminating the runaway thread ourselves.
*/

unsigned int __stdcall fakethread(void *) { return 0; }

MMRESULT KillTTS(LPTTS_HANDLE_T handle) {
	intptr_t ptr = *(intptr_t *)handle;
	HANDLE real = *((HANDLE *)(ptr + 0x20));

	HANDLE fake = (HANDLE)_beginthreadex(NULL, 0, fakethread, NULL, 0, NULL);
	*((HANDLE *)(ptr + 0x20)) = fake;

	MMRESULT res = TextToSpeechShutdown(handle);
	if (res != MMSYSERR_NOERROR) {
		/* If shutdown fails, just crash and let the process exit clean it up. */
		return res;
	}

	TerminateThread(real, 0);
	CloseHandle(real);

	return MMSYSERR_NOERROR;
}

BOOL DoTTS(std::string& filename, std::string& text) {
	LPTTS_HANDLE_T handle = NULL;
	MMRESULT res;

	res = TextToSpeechStartup(
		/* HWND */ NULL,
		&handle,
		WAVE_MAPPER,
		DO_NOT_USE_AUDIO_DEVICE
	);
	if (MMFAILED(res)) {
		std::cout << "ERROR: TextToSpeechStartup returned code " << res << std::endl;
		return ABORT;
	}
	if (MMFAILED(res = TextToSpeechOpenWaveOutFile(handle, (char *) filename.c_str(), WAVE_FORMAT_1M16)))
		std::cout << "ERROR: TextToSpeechOpenWaveOutFile returned code " << res << std::endl;
	if (MMSUCCEEDED(res) && MMFAILED(res = TextToSpeechSpeak(handle, (char *) text.c_str(), TTS_FORCE)))
		std::cout << "ERROR: TextToSpeechSpeak returned code " << res << std::endl;
	if (MMSUCCEEDED(res) && MMFAILED(res = TextToSpeechSync(handle)))
		std::cout << "ERROR: TextToSpeechSync returned code " << res << std::endl;
	if (MMSUCCEEDED(res) && MMFAILED(res = TextToSpeechCloseWaveOutFile(handle)))
		std::cout << "ERROR: TextToSpeechCloseWaveOutFile returned code " << res << std::endl;

	int succeeded = MMSUCCEEDED(res);

	if (MMFAILED(res = KillTTS(handle))) {
		std::cout << "ERROR: TextToSpeechShutdown returned code " << res << std::endl;
		return ABORT;
	} else {
		if (succeeded)
			std::cout << "Success" << std::endl;
		return CONTINUE;
	}
}

int main(void) {
	if (!ResetLicenseCounter()) {
		return 1;
	}

	std::cout << "Ready" << std::endl;

	while (1) {
		std::string filename;
		std::string text;

		std::getline(std::cin, filename);
		std::getline(std::cin, text);

		if (std::cin.fail() || std::cin.eof())
			break;

		if (!DoTTS(filename, text))
			return 1;
	}

	return 0;
}