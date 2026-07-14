import sys
import time

print("--- DIAGNOSE START ---")

# 1. Test of de file servo.py gevonden kan worden
try:
    from servo import Servo
    print("[OK] servo.py gevonden en geïmporteerd.")
except Exception as e:
    print(f"[FOUT] Kan servo.py niet importeren: {e}")
    sys.exit()

# 2. Test of we de klasse kunnen starten (Dit checkt de I2C verbinding)
try:
    print("Poging om Servo te verbinden met I2C...")
    myservo = Servo()
    print("[OK] Servo klasse gestart! I2C verbinding werkt.")
except Exception as e:
    print(f"[FOUT] Kan Servo hardware niet starten: {e}")
    print("TIP: Heb je I2C aangezet in raspi-config?")
    print("TIP: Heb je 'sudo apt install python3-smbus' gedaan?")
    sys.exit()

# 3. Test beweging
try:
    print("Probeer servo op kanaal '0' naar 90 graden te draaien...")
    myservo.setServoPwm('0', 90)
    time.sleep(1)
    print("Probeer servo op kanaal '1' naar 90 graden te draaien...")
    myservo.setServoPwm('1', 90)
    print("[OK] Commando's verzonden.")
except Exception as e:
    print(f"[FOUT] Fout bij bewegen: {e}")

print("--- DIAGNOSE KLAAR ---")
