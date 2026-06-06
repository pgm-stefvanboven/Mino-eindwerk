import time
from gpiozero import Buzzer
from Command import COMMAND as cmd
try:
    buzzer = Buzzer(17)
    print("Buzzer succesvol verbonden op GPIO 17")
except Exception as e:
    print(f"FOUT: Kan Buzzer niet starten: {e}")
    buzzer = None  # We gaan door zonder buzzer
class Buzzer:
    def run(self,command):
        if command!="0":
            buzzer.on()
        else:
            buzzer.off()
if __name__=='__main__':
    B=Buzzer()
    B.run('1')
    time.sleep(3)
    B.run('0')




