import time
from PCA9685 import PCA9685

print("--- SERVO SCANNER START ---")
print("We testen alle kanalen (0 t/m 15) één voor één.")
print("LET OP: Zorg dat de batterij-schakelaar AAN staat!")

try:
    # Start driver
    pwm = PCA9685(0x40, debug=False)
    pwm.setPWMFreq(50)
except Exception as e:
    print(f"FOUT: Kan driver niet starten. I2C probleem? {e}")
    exit()

# We testen elk kanaal van 0 tot 15
for channel in range(16):
    print(f"Testen Kanaal {channel}...", end="", flush=True)
    
    # Beweeg heen en weer
    # 0 graden
    pwm.setPWM(channel, 0, 150) 
    time.sleep(0.5)
    
    # 180 graden
    pwm.setPWM(channel, 0, 500)
    time.sleep(0.5)
    
    # Midden
    pwm.setPWM(channel, 0, 300)
    print(" Klaar.")
    time.sleep(0.2)

print("\n--- SCAN COMPLEET ---")
print("Heb je een beweging gezien? Onthoud welk nummer het was!")
