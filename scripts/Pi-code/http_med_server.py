from flask import Flask, jsonify, Response, request
from flask_cors import CORS
import socket
import time
import struct
import threading
import datetime
import subprocess

from Led import Led
from audio_player import speak, set_buzzer_fallback
from ADC import Adc

app = Flask(__name__)
CORS(app)

# --- CONFIGURATIE ---
ROBOT_IP = "127.0.0.1"
CMD_PORT = 5000
VIDEO_PORT = 8000

# DEMO: Hoe lang wachten we voor we opa herinneren?
GRACE_PERIOD_SECONDS = 15

print(f"Verbinden met robot op {ROBOT_IP}...")

adc = Adc()

# --- STATUS VARIABELEN ---
RESTOCK_STATE = {
    "active": False,
    "deadline": None
}

LAST_BATTERY_PERCENTAGE = 100

# --- LED INITIALISATIE ---
try:
    led = Led()
    print("LED Systeem actief.")
except Exception as e:
    print(f"Kon LED niet starten: {e}")
    led = None


# --- SOCKET COMMANDS ---
def send_cmd(command: str) -> bool:
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(2)
        client.connect((ROBOT_IP, CMD_PORT))
        client.sendall((command + "\n").encode("utf-8"))
        client.close()
        return True

    except Exception as e:
        print(f"Fout bij sturen commando '{command}': {e}")
        return False


# --- BUZZER FALLBACK ---
def buzzer_fallback():
    """
    Wordt gebruikt indien audio faalt.
    """
    try:
        send_cmd("CMD_BUZZER#1")
        time.sleep(0.3)
        send_cmd("CMD_BUZZER#0")

    except Exception as e:
        print(f"Buzzer fallback fout: {e}")


# Registreer fallback in audio systeem
set_buzzer_fallback(buzzer_fallback)


# --- VIDEO STREAM HELPERS ---
def recvall(sock: socket.socket, n: int) -> bytes:
    data = b""

    while len(data) < n:
        chunk = sock.recv(n - len(data))

        if not chunk:
            return b""

        data += chunk

    return data


def proxy_video_stream():
    while True:
        s = None

        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(10)
            s.connect((ROBOT_IP, VIDEO_PORT))

            while True:
                header = recvall(s, 4)

                if not header:
                    raise ConnectionError("Geen header")

                length = struct.unpack("<I", header)[0]
                img_data = recvall(s, length)

                if not img_data:
                    raise ConnectionError("Geen data")

                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: "
                    + str(len(img_data)).encode()
                    + b"\r\n\r\n"
                    + img_data
                    + b"\r\n"
                )

        except Exception as e:
            print(f"Video stream fout: {e}")
            time.sleep(0.5)

        finally:
            try:
                if s:
                    s.close()
            except:
                pass


# --- ACHTERGROND MONITOR ---
def monitor_loop():
    print("--- MONITOR ACTIEF: Wacht op triggers ---")

    while True:
        now = datetime.datetime.now()

        # HERINNERING BIJBESTELLEN
        if RESTOCK_STATE["active"] and RESTOCK_STATE["deadline"]:

            if now > RESTOCK_STATE["deadline"]:

                print("HERINNERING: Opa is vergeten te bestellen! Mino wordt Goud.")

                # AUDIO HERINNERING
                speak("Medication-reminder.mp3")

                # LED EFFECT
                if led and led.Ledsupported:

                    # Fade in goud/geel
                    for i in range(0, 150, 5):
                        led.strip.set_all_led_color(i, int(i * 0.6), 0)
                        time.sleep(0.05)

                    time.sleep(1)

                    # Fade out
                    for i in range(150, 0, -5):
                        led.strip.set_all_led_color(i, int(i * 0.6), 0)
                        time.sleep(0.05)

                else:
                    time.sleep(2)

        else:
            time.sleep(1)


# Start achtergrond monitor
threading.Thread(target=monitor_loop, daemon=True).start()

# =========================================================
# API ENDPOINTS
# =========================================================

@app.post("/api/volume")
def set_volume():
    data = request.json
    volume = data.get('volume', 50) 
    
    try:
        # Past het volume aan via ALSA
        subprocess.run(['amixer', '-c', '2', 'sset', 'PCM', f'{volume}%'], check=True)
        return jsonify({"status": "success", "volume": volume})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.post("/start_reminder")
def start_reminder():

    print("EERSTE HERINNERING")

    threading.Thread(
        target=speak,
        args=("Medication-time.mp3",),
        daemon=True,
    ).start()

    if led and led.Ledsupported:

        for i in range(3):
            led.strip.set_all_led_color(0, 80, 255)   # blauw
            time.sleep(0.4)

            led.strip.set_all_led_color(0, 0, 0)
            time.sleep(0.4)

    return jsonify({"status": "ok"})

@app.post("/second_reminder")
def second_reminder():

    print("TWEEDE HERINNERING")

    threading.Thread(
        target=speak,
        args=("Medication-reminder.mp3",),
        daemon=True,
    ).start()

    if led and led.Ledsupported:

        for i in range(3):
            led.strip.set_all_led_color(255, 120, 0)   # oranje
            time.sleep(0.4)

            led.strip.set_all_led_color(0, 0, 0)
            time.sleep(0.4)

    return jsonify({"status": "ok"})

@app.post("/care_emergency")
def care_emergency():

    print("NOODSITUATIE")

    # Spreek boodschap
    threading.Thread(
    target=speak,
    args=("Emergency.mp3",),
    daemon=True,
).start()
    # Alarm leds
    if led and led.Ledsupported:
        for _ in range(6):
            led.strip.set_all_led_color(255, 0, 0)
            time.sleep(0.25)

            led.strip.set_all_led_color(0, 0, 0)
            time.sleep(0.25)

    return jsonify({
        "status": "ok"
    })

@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "robot_ip": ROBOT_IP
    })

@app.get("/battery")
def battery():

    global LAST_BATTERY_PERCENTAGE

    raw = round(adc.recvADC(2), 2)

    percentage = round(
        ((raw - 1.10) / (1.42 - 1.10)) * 100
    )

    percentage = max(0, min(100, percentage))

    # batterij mag enkel dalen
    if percentage < LAST_BATTERY_PERCENTAGE:
        LAST_BATTERY_PERCENTAGE = percentage

    return jsonify({
        "raw": raw,
        "percentage": LAST_BATTERY_PERCENTAGE
    })

@app.get("/video_feed")
def video_feed():
    return Response(
        proxy_video_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store",
            "Pragma": "no-cache"
        }
    )


@app.get("/medicijnen")
def get_meds():

    return jsonify([
        {
            "id": 1,
            "time": "08:00",
            "name": "Paracetamol",
            "taken": False
        },
        {
            "id": 2,
            "time": "12:00",
            "name": "Bloeddrukpil",
            "taken": False
        },
    ])

@app.post("/lock_open")
def lock_open():
    send_cmd("CMD_LOCK#110")
    return jsonify({"status": "open"})

@app.post("/lock_close")
def lock_close():
    send_cmd("CMD_LOCK#20")
    return jsonify({"status": "closed"})
# =========================================================
# MEDICATIE BEVESTIGING
# =========================================================

@app.post("/medicijnen/<int:id>/bevestig")
def confirm_med(id):

    print(f"Medicatie bevestigd: {id}")

    # SLOT DICHT
    send_cmd("CMD_LOCK#20")

    # AUDIO FEEDBACK
    speak("Medication-done.mp3")

    return jsonify({
        "status": "success"
    })


# =========================================================
# START TIMER
# =========================================================

@app.post("/start_restock_timer")
def start_restock_timer():

    print("TIMER START: Opa moet binnenkort bestellen.")

    RESTOCK_STATE["active"] = True

    RESTOCK_STATE["deadline"] = (
        datetime.datetime.now() +
        datetime.timedelta(seconds=GRACE_PERIOD_SECONDS)
    )

    # AUDIO
    speak("Medication-time.mp3")

    return jsonify({
        "status": "started"
    })


# =========================================================
# CAREGIVER NOTIFICATIE
# =========================================================

@app.post("/notify_caregiver")
def notify_caregiver():

    print("BESTELD: Opa heeft het gemeld.")

    # STOP TIMER
    RESTOCK_STATE["active"] = False
    RESTOCK_STATE["deadline"] = None

    # AUDIO
    speak("Message-sent.mp3")

    # LED FEEDBACK
    if led and led.Ledsupported:

        # Oranje = bericht maken
        led.strip.set_all_led_color(255, 100, 0)
        time.sleep(0.8)

        # Blauw knipperen = verzenden
        for _ in range(3):

            led.strip.set_all_led_color(0, 0, 0)
            time.sleep(0.15)

            led.strip.set_all_led_color(0, 0, 255)
            time.sleep(0.15)

        # Groen = succes
        led.strip.set_all_led_color(0, 255, 0)
        time.sleep(0.5)

        # LEDs uit
        time.sleep(1)
        led.strip.set_all_led_color(0, 0, 0)

    return jsonify({
        "status": "sent",
        "message": "Robot interaction complete"
    })


# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":

    print("HTTP Medicatie Bridge draait op poort 5001...")

    try:
        app.run(
            host="0.0.0.0",
            port=5001,
            debug=False,
            threaded=True,
            use_reloader=False
        )

    except KeyboardInterrupt:

        if led:
            led.strip.set_all_led_color(0, 0, 0)
