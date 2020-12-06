#include <iostream>
#include <string>
#include <windows.h>

#include "TTSAPI.H"

#define MMSUCCEEDED(x) ((x) == MMSYSERR_NOERROR)
#define MMFAILED(x) (!MMSUCCEEDED(x))

int main(void) {
	LPTTS_HANDLE_T handle = NULL;
	MMRESULT res;
	int ret = 0;

	res = TextToSpeechStartup(
		/* HWND */ NULL,
		&handle,
		WAVE_MAPPER,
		DO_NOT_USE_AUDIO_DEVICE
	);
	if (MMFAILED(res)) {
		std::cout << "ERROR: TextToSpeechStartup returned code " << res << std::endl;
		std::cout << "Failed to initialize TTS; exiting" << std::endl;
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

		if (MMFAILED(res = TextToSpeechOpenWaveOutFile(handle, (char *) filename.c_str(), WAVE_FORMAT_1M16))) {
			std::cout << "ERROR: TextToSpeechOpenWaveOutFile returned code " << res << std::endl;
			continue;
		}
		if (MMSUCCEEDED(res) && MMFAILED(res = TextToSpeechSpeak(handle, (char *) text.c_str(), TTS_FORCE))) {
			std::cout << "ERROR: TextToSpeechSpeak returned code " << res << std::endl;
		}
		if (MMSUCCEEDED(res) && MMFAILED(res = TextToSpeechSync(handle))) {
			std::cout << "ERROR: TextToSpeechSync returned code " << res << std::endl;
		}
		
		int succeeded = MMSUCCEEDED(res);
		if (MMFAILED(res = TextToSpeechCloseWaveOutFile(handle))) {
			std::cout << "ERROR: TextToSpeechCloseWaveOutFile returned code " << res << std::endl;
			std::cout << "TTS state is unknown; exiting" << std::endl;
			ret = 1;
			break;
		} else if (succeeded) {
			std::cout << "Success" << std::endl;
		}
	}

	if (MMFAILED(res = TextToSpeechShutdown(handle))) {
		std::cout << "ERROR: TextToSpeechShutdown returned code " << res << std::endl;
		ret = 1;
	}

	return ret;
}