import os
import time
import pygame

# --- AUDIO CONFIG ---
os.environ["SDL_AUDIODRIVER"] = "alsa"
os.environ["AUDIODEV"] = "plughw:2,0"

AUDIO_PATH = "/home/pi/Code/Pi5/Server-pi5/Audio"

# pygame initialiseren
pygame.mixer.init()

# Deze functie wordt later gezet vanuit http_med_server.py
fallback_buzzer_function = None


def set_buzzer_fallback(func):
    global fallback_buzzer_function
    fallback_buzzer_function = func


def speak(filename):
    """
    Probeert audio af te spelen.
    Indien audio faalt -> buzzer fallback.
    """

    try:
        full_path = f"{AUDIO_PATH}/{filename}"

        if not os.path.exists(full_path):
            raise FileNotFoundError(full_path)

        pygame.mixer.music.load(full_path)
        pygame.mixer.music.play()

        while pygame.mixer.music.get_busy():
            time.sleep(0.1)

    except Exception as e:
        print(f"[AUDIO ERROR] {e}")

        # FALLBACK = BUZZER
        if fallback_buzzer_function:
            print("[FALLBACK] Activeer buzzer.")
            fallback_buzzer_function()
