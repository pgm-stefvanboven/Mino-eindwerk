import time
from PCA9685 import PCA9685

class Servo:
    def __init__(self):
        # Start de driver
        self.pwm = PCA9685(0x40, debug=False)
        self.pwm.setPWMFreq(50) # 50Hz frequentie

    def setServoPwm(self, channel, angle, error=0):
        """
        Stuurt de servo aan.
        Vertaalt '0' naar '8' en '1' naar '9' (bevestigd door video).
        """
        try:
            channel_str = str(channel)
            angle = int(angle)
            
            # Begrens hoek
            if angle < 0: angle = 0
            if angle > 180: angle = 180

            # --- KANAAL MAPPING (BEVESTIGD) ---
            chip_channel = 0
            
            # Als de server '0' vraagt (Pan), stuur naar 8
            if channel_str == '0':
                chip_channel = 8
            # Als de server '1' vraagt (Tilt), stuur naar 9
            elif channel_str == '1':
                chip_channel = 9
            else:
                # Fallback voor andere kanalen
                if channel_str.isdigit():
                    chip_channel = int(channel_str)
                    # Sommige logica telt er 8 bij op, maar laten we veilig zijn:
                    if chip_channel < 8: chip_channel += 8

            # Berekening voor 0-180 graden
            # Puls range 102-510 is standaard voor SG90
            pulse = int(102 + (angle / 180) * (510 - 102))
            
            # Stuur naar het JUISTE kanaal op de chip
            self.pwm.setPWM(chip_channel, 0, pulse)
            
        except Exception as e:
            print(f"Servo Error: {e}")

if __name__ == '__main__':
    print("Test Servo 0->8 en Servo 1->9...")
    s = Servo()
    while True:
        print("Midden (90)")
        s.setServoPwm('0', 90)
        s.setServoPwm('1', 90)
        time.sleep(1)
        print("Bewegen...")
        s.setServoPwm('0', 0)   # Dit stuurt nu kanaal 8 aan
        s.setServoPwm('1', 180) # Dit stuurt nu kanaal 9 aan
        time.sleep(1)
