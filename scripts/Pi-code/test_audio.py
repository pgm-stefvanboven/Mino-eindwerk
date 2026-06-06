import pygame
import time

pygame.mixer.init()

pygame.mixer.music.load(
    "/home/pi/Code/Pi5/Server-pi5/Audio/Medication-time.mp3"
)

pygame.mixer.music.play()

while pygame.mixer.music.get_busy():
    time.sleep(0.1)
