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
try: from Motor import Motor
except: pass
try: from servo import Servo
except: pass
try: from Led import Led
except: pass
try: from Buzzer import Buzzer
except: pass
try: from ADC import Adc
except: pass
try: from Light import Light
except: pass
try: from Ultrasonic import Ultrasonic
except: pass
try: from Line_Tracking import Line_Tracking
except: pass
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
        # --- CAMERA POSITIES ---
        self.cam_tilt = 90  # Omhoog/Omlaag (Servo 1)
        self.cam_pan = 90   # Links/Rechts (Servo 0)

        # Hardware Init
        self.PWM = None
        self.servo = None
        self.led = self.buzzer = self.adc = self.light = self.infrared = self.ultrasonic = None

        try:
            if Motor: self.PWM = Motor()
        except: pass

        # --- SERVO INIT ---
        try:
            if Servo:
                self.servo = Servo()
                print("Servo's initialiseren...")
                self.move_camera_servo('0', 90) # Pan
                time.sleep(0.5)
                self.move_camera_servo('1', 90) # Tilt
                print("Servo's (0 & 1) gestart.")
        except Exception as e:
            print(f"FOUT: Kan Servo niet starten: {e}")
            self.servo = None

        # Overige hardware
        try:
            if Led: self.led = Led()
            if Ultrasonic: self.ultrasonic = Ultrasonic()
            if Buzzer: self.buzzer = Buzzer()
            if Adc: self.adc = Adc()
            if Light: self.light = Light()
            if Line_Tracking: self.infrared = Line_Tracking()
        except: pass

        self.Mode = "one"
        self.server_socket1 = None
        self.server_socket = None
        self.connection1 = None
        self.connection = None

        # Camera initialisatie doen we pas in sendvideo om crashes te voorkomen

    def StartTcpServer(self):
        HOST = "0.0.0.0" # BELANGRIJK: Luister op alles
        self.server_socket1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket1.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket1.bind((HOST, 5000))
        self.server_socket1.listen(5)

        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((HOST, 8000))
        self.server_socket.listen(5)
        print("Server luistert op 5000/8000")

    def StopTcpServer(self):
        try:
            if self.connection: self.connection.close()
            if self.connection1: self.connection1.close()
            if self.server_socket: self.server_socket.close()
            if self.server_socket1: self.server_socket1.close()
        except: pass

    # --- HIER ZIT DE FIX VOOR HET BEELD (Jouw code had hier de oude 640x360 resolutie) ---
    def sendvideo(self):
        while True:
            print("Wachten op video verbinding...")
            try:
                self.connection, self.client_address = self.server_socket.accept()
                self.connection = self.connection.makefile('wb')
                print(f"Video verbonden met {self.client_address}")
            except:
                time.sleep(0.5)
                continue

            camera = None
            try:
                camera = Picamera2()
                # 1296x972 = UITGEZOOMD BEELD (Hele sensor)
                # Sharpness 4.0 = SCHERP BEELD
                config = camera.create_video_configuration(
                    main={"size": (1296, 972), "format": "RGB888"},
                    controls={"AwbEnable": True, "AeEnable": True, "Sharpness": 4.0, "Contrast": 1.2}
                )
                camera.configure(config)
                
                output = StreamingOutput()
                encoder = JpegEncoder(q=40) # Compressie voor snelheid
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
                    if camera: 
                        camera.stop_recording()
                        camera.close()
                    if self.connection: self.connection.close()
                except: pass

    def readdata(self):
        while True:
            try:
                conn, addr = self.server_socket1.accept()
                self.connection1 = conn
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
                    if line.strip(): self._handle_one_command(line.strip())
            
            try: conn.close()
            except: pass

    def move_camera_servo(self, channel, angle):
        if not self.servo: return
        if angle < 0: angle = 0
        if angle > 180: angle = 180
        try:
            self.servo.setServoPwm(str(channel), angle)
        except Exception as e:
            print(f"Servo Error: {e}")

    def _handle_one_command(self, oneCmd):
        parts = oneCmd.split("#")
        if not parts: return

        # --- CAMERA LOGICA ---
        if "CMD_CAMERA" in parts and len(parts) > 1:
            action = parts[1]
            step = 10 

            if action == "UP":
                self.cam_tilt -= step 
                self.move_camera_servo('1', self.cam_tilt)
            elif action == "DOWN":
                self.cam_tilt += step
                self.move_camera_servo('1', self.cam_tilt)
            elif action == "LEFT":
                self.cam_pan += step
                self.move_camera_servo('0', self.cam_pan)
            elif action == "RIGHT":
                self.cam_pan -= step
                self.move_camera_servo('0', self.cam_pan)
            return

        if "CMD_BUZZER" in parts and self.buzzer:
            try: self.buzzer.run(parts[1])
            except: pass

        if "CMD_MOTOR" in parts and self.PWM:
            try: self.PWM.setMotorModel(int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4]))
            except: pass

    def Power(self):
        while True:
            try:
                if self.adc and self.connection1:
                    ADC_Power = self.adc.recvADC(2) * 5
                    msg = cmd.CMD_POWER + "#" + str(round(ADC_Power, 2)) + "\n"
                    try: self.connection1.send(msg.encode("utf-8"))
                    except: pass
            except: pass
            time.sleep(3)

if __name__ == "__main__":
    pass
