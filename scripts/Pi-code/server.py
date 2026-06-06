#!/usr/bin/python3
# -*- coding: utf-8 -*-
import io
import socket
import struct
import time
import threading
from threading import Condition
from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutput
from picamera2.encoders import Quality

# Hardware Imports
print("--- HARDWARE LADEN ---")
try: 
    from Motor import Motor
    print("Motor library gevonden.")
except ImportError: 
    Motor = None
    print("LET OP: Motor library NIET gevonden!")

try: from servo import Servo
except: Servo = None
try: from Led import Led
except: Led = None
try: from Buzzer import Buzzer
except: Buzzer = None
try: from ADC import Adc
except: Adc = None
try: from Light import Light
except: Light = None
try: from Ultrasonic import Ultrasonic
except: Ultrasonic = None
try: from Line_Tracking import Line_Tracking
except: Line_Tracking = None

from Command import COMMAND as cmd

class StreamingOutput(io.BufferedIOBase):
    def __init__(self):
        self.frame = None
        self.condition = Condition()

    def write(self, buf):
        with self.condition:
            self.frame = buf
            self.condition.notify_all()

class Server:
    def __init__(self):
        self.cam_tilt = 90
        self.cam_pan = 90
        self.PWM = None
        self.servo = None
        self.led = self.buzzer = self.adc = self.light = self.infrared = self.ultrasonic = None

        # --- MOTOR INIT (MET DEBUGGING) ---
        print("Motor driver initialiseren...")
        try:
            if Motor: 
                self.PWM = Motor()
                print(">>> Motor driver SUCCESVOL gestart!")
            else:
                print(">>> FOUT: Motor class is niet geladen.")
        except Exception as e:
            print(f">>> CRITISCHE FOUT bij starten Motor: {e}")
            self.PWM = None

        # --- SERVO INIT ---
        try:
            if Servo:
                self.servo = Servo()
                self.move_camera_servo('0', 90)
                time.sleep(0.5)
                self.move_camera_servo('1', 90)
                print("Servo's gestart.")
        except Exception as e:
            print(f"Servo fout: {e}")

        # Overige hardware
        try:
            if Led: self.led = Led()
            if Buzzer: self.buzzer = Buzzer()
            if Adc: self.adc = Adc()
        except: pass

        self.Mode = "one"
        self.server_socket1 = None
        self.server_socket = None
        self.connection1 = None
        self.connection = None

    def StartTcpServer(self):
        HOST = "0.0.0.0"
        self.server_socket1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket1.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket1.bind((HOST, 5000))
        self.server_socket1.listen(5)

        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((HOST, 8000))
        self.server_socket.listen(5)
        print("Server luistert op 5000 (Commando) en 8000 (Video)")

    def StopTcpServer(self):
        try:
            if self.connection: self.connection.close()
            if self.connection1: self.connection1.close()
            if self.server_socket: self.server_socket.close()
            if self.server_socket1: self.server_socket1.close()
        except: pass

    def sendvideo(self):
        while True:
            print("Wachten op video verbinding...")
            try:
                self.connection, self.client_address = self.server_socket.accept()
                self.connection = self.connection.makefile('wb')
                print(f"Video verbonden met {self.client_address}")
            except:
                time.sleep(0.5); continue

            camera = None
            try:
                camera = Picamera2()
                # JOUW GOEDE CAMERA CONFIGURATIE
                config = camera.create_video_configuration(
                    main={"size": (1296, 972), "format": "RGB888"},
                    controls={"AwbEnable": True, "AeEnable": True, "Sharpness": 4.0, "Contrast": 1.2}
                )
                camera.configure(config)
                
                output = StreamingOutput()
                encoder = JpegEncoder(q=40)
                camera.start_recording(encoder, FileOutput(output), quality=Quality.HIGH)

                while True:
                    with output.condition:
                        if output.condition.wait(timeout=2):
                            frame = output.frame
                        else: continue
                    if frame is None: continue
                    try:
                        lenFrame = len(frame)
                        lengthBin = struct.pack('<I', lenFrame)
                        self.connection.write(lengthBin)
                        self.connection.write(frame)
                    except:
                        print("Video verbinding verbroken.")
                        break
            except Exception as e:
                print(f"Camera fout: {e}")
            finally:
                try:
                    if camera: camera.stop_recording(); camera.close()
                    if self.connection: self.connection.close()
                except: pass

    def readdata(self):
        while True:
            try:
                conn, addr = self.server_socket1.accept()
                self.connection1 = conn
                print(f"Commando verbonden met {addr}")
            except:
                time.sleep(0.2); continue
            
            restCmd = ""
            while True:
                try:
                    data = conn.recv(1024).decode("utf-8", errors="ignore")
                except: break
                if not data: break
                
                AllData = restCmd + data
                cmdArray = AllData.split("\n")
                if cmdArray[-1] != "": restCmd = cmdArray[-1]; cmdArray = cmdArray[:-1]
                else: restCmd = ""

                for line in cmdArray:
                    if line.strip(): 
                        # HIER PRINTEN WE HET COMMANDO
                        print(f"Ontvangen commando: {line.strip()}")
                        self._handle_one_command(line.strip())
            
            try: conn.close()
            except: pass

    def move_camera_servo(self, channel, angle):
        if not self.servo: return
        if angle < 0: angle = 0
        if angle > 180: angle = 180
        try: self.servo.setServoPwm(str(channel), angle)
        except: pass

    def _handle_one_command(self, oneCmd):
        parts = oneCmd.split("#")
        if not parts: return

        # CAMERA
        if "CMD_CAMERA" in parts:
            # ... (Camera code zoals eerder, die werkt)
            pass 

        # BUZZER
        if "CMD_BUZZER" in parts and self.buzzer:
            try: self.buzzer.run(parts[1])
            except: pass

        # SLOT SERVO
        if "CMD_LOCK" in parts:

            print("CMD_LOCK ONTVANGEN")

            if self.servo:
                try:
                    angle = int(parts[1])

                    print(f"Servo4 naar {angle} graden")

                    self.servo.setServoPwm('4', angle)

                except Exception as e:
                    print(f"Servo4 fout: {e}")

        # --- MOTOR LOGICA MET DEBUGGING ---
        if "CMD_MOTOR" in parts:
            print(f"DEBUG: Motor commando herkend. PWM status: {self.PWM}")
            if self.PWM:
                try: 
                    # Zet waarden om naar int
                    val1 = int(float(parts[1]))
                    val2 = int(float(parts[2]))
                    val3 = int(float(parts[3]))
                    val4 = int(float(parts[4]))
                    print(f"DEBUG: Motoren aansturen: {val1}, {val2}, {val3}, {val4}")
                    self.PWM.setMotorModel(val1, val2, val3, val4)
                except Exception as e:
                    print(f"FOUT bij aansturen motor: {e}")
            else:
                print("FOUT: Kan motor niet aansturen want self.PWM is leeg!")

    def Power(self):
        while True:
            try:
                if self.adc and self.connection1:
                    ADC_Power = self.adc.recvADC(2) * 5
                    msg = cmd.CMD_POWER + "#" + str(round(ADC_Power, 2)) + "\n"
                    self.connection1.send(msg.encode("utf-8"))
            except: pass
            time.sleep(3)

if __name__ == "__main__":
    s = Server()
    s.StartTcpServer()
    threading.Thread(target=s.readdata, daemon=True).start()
    threading.Thread(target=s.sendvideo, daemon=True).start()
    threading.Thread(target=s.Power, daemon=True).start()
    while True: time.sleep(1)
