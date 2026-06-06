from picamera2 import Picamera2
import time
import cv2

picam2 = Picamera2()
config = picam2.create_video_configuration(main={"size": (1296, 972), "format": "RGB888"})
picam2.configure(config)
picam2.start()
print("Camera gestart met resolutie:", config['main']['size'])

time.sleep(2)  # Wacht 2 seconden om de camera te laten stabiliseren

# Capture een frame
frame = picam2.capture_array("main")
print("Frame shape:", frame.shape)

# Sla het frame op als een afbeelding
cv2.imwrite("/tmp/test_frame.jpg", cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
print("Testframe opgeslagen als /tmp/test_frame.jpg")

picam2.stop()
