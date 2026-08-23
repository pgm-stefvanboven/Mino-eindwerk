from flask import Flask, jsonify, Response, request
from flask_cors import CORS
import socket
import time
import struct
import threading
import datetime
import subprocess
from supabase import create_client
import requests

from Led import Led
from audio_player import speak, set_buzzer_fallback
from ADC import Adc

app = Flask(__name__)
CORS(app)

# --- CONFIGURATIE ---
ROBOT_IP = "127.0.0.1"
CMD_PORT = 5000
VIDEO_PORT = 8000

SUPABASE_URL = "https://euechlwdifknegdoxxfg.supabase.co"
SUPABASE_KEY = "sb_publishable_z1dskcmLu-LaAeZJiJXxuQ_QHyonFPX"

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY,
)

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
BATTERY_WARNING_GIVEN = False

# Tracker voor getrapte zorgscenario's
DEMO_SIMULATED_MISSES = 0
CRITICAL_STOCK_NOTIFIED = set()

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


# --- PUSH & DATABASE HELPERS ---
def get_caregiver_token():
    response = (
        supabase
        .table("shared_settings")
        .select("caregiver_push_token")
        .eq("id", 1)
        .single()
        .execute()
    )

    if response.data:
        return response.data.get("caregiver_push_token")

    return None


def send_push_notification(title, body, notification_type=None):
    token = get_caregiver_token()

    if not token:
        print("Geen push token gevonden.")
        return False

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": {
            "url": "/robot",
            "type": notification_type,
        }
    }

    try:
        response = requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=10,
        )

        print("Push response:", response.json())
        return True

    except Exception as e:
        print("Push notificatie mislukt:", e)
        return False


def save_notification(title, body, notification_type="emergency"):
    response = (
        supabase
        .table("notifications")
        .insert({
            "title": title,
            "body": body,
            "type": notification_type,
        })
        .execute()
    )

    return response


def trigger_escalation_protocol():
    """Autonoom Noodprotocol: activeert audio, rood LED-licht, ontgrendelt camera en stuurt push."""
    print("🚨 NOODPROTOCOL: Escalatiedrempel bereikt (2 gemiste momenten).")
    
    play_with_led("Emergency.mp3", 255, 0, 0)
    
    title = "⚠️ Meerdere medicatiemomenten gemist"
    body = "Mino heeft 2 innames niet geregistreerd. Cameratoegang is tijdelijk ontgrendeld ter controle."
    save_notification(title, body, "emergency")
    send_push_notification(title, body, "emergency")
    
    save_notification("Camera actief", "Mantelzorger werd verwittigd wegens herhaaldelijk gemiste medicatie.", "privacy")
    
    supabase.table("shared_settings").update({"emergency_camera_unlocked": True}).eq("id", 1).execute()


# --- ACHTERGROND MONITOR ---
def monitor_loop():
    global BATTERY_WARNING_GIVEN, LAST_BATTERY_PERCENTAGE, CRITICAL_STOCK_NOTIFIED
    print("--- MONITOR ACTIEF: Wacht op triggers ---")

    last_stock_check = datetime.datetime.min

    while True:
        now = datetime.datetime.now()
        
        # 1. BATTERY WARNING
        if LAST_BATTERY_PERCENTAGE <= 15 and not BATTERY_WARNING_GIVEN:
            print("Batterij is laag, speel melding af.")
            speak("Battery.mp3")

            title = "Batterij bijna leeg"
            body = f"De batterij van Mino staat op {LAST_BATTERY_PERCENTAGE}% en moet opgeladen worden."
            save_notification(title, body, "battery")
            send_push_notification(title, body, "battery")

            BATTERY_WARNING_GIVEN = True
        elif LAST_BATTERY_PERCENTAGE > 20:
            BATTERY_WARNING_GIVEN = False

        # 2. AUTONOOM VANGNET / VOORRAAD ESCALATIE (Elk uur controleren)
        if (now - last_stock_check).total_seconds() > 3600:
            last_stock_check = now
            try:
                meds_res = supabase.table("medications").select("*").lt("stock", 10).eq("isOrdered", False).execute()
                schedule_res = supabase.table("daily_schedule").select("*").execute()

                if meds_res.data and schedule_res.data:
                    schedule_items = schedule_res.data
                    for med in meds_res.data:
                        med_id = str(med.get("id"))
                        stock = med.get("stock", 0)

                        daily_needed = sum(
                            int(''.join(filter(str.isdigit, str(item.get("amount", "1")))) or 1)
                            for item in schedule_items if str(item.get("medId")) == med_id
                        ) or 1

                        days_left = stock // daily_needed

                        if days_left <= 2 and med_id not in CRITICAL_STOCK_NOTIFIED:
                            print(f"[VANGNET ESCALATIE] Voorraad van {med['name']} is kritiek ({days_left} dagen over).")
                            
                            speak("Inventory.mp3")
                            if led and led.Ledsupported:
                                for _ in range(3):
                                    led.strip.set_all_led_color(255, 100, 0)
                                    time.sleep(0.3)
                                    led.strip.set_all_led_color(0, 0, 0)
                                    time.sleep(0.2)

                            title = f"⚠️ Vangnet: {med['name']} bijna op"
                            body = f"Mino meldt: er is nog voorraad voor ca. {days_left} dag(en). Patiënt heeft nog niet gereageerd."
                            save_notification(title, body, "stock")
                            send_push_notification(title, body, "stock")

                            CRITICAL_STOCK_NOTIFIED.add(med_id)
                        elif stock >= 10 and med_id in CRITICAL_STOCK_NOTIFIED:
                            CRITICAL_STOCK_NOTIFIED.remove(med_id)

            except Exception as err:
                print(f"Fout bij automatische voorraadcontrole: {err}")

        # 3. REMINDER: REORDER (Bestaande demo timer)
        if RESTOCK_STATE["active"] and RESTOCK_STATE["deadline"]:
            if now > RESTOCK_STATE["deadline"]:
                print("HERINNERING: Opa is vergeten te bestellen! Mino wordt Goud.")
                speak("Medication-reminder.mp3")

                if led and led.Ledsupported:
                    for i in range(0, 150, 5):
                        led.strip.set_all_led_color(i, int(i * 0.6), 0)
                        time.sleep(0.05)
                    time.sleep(1)
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
        subprocess.run(['amixer', '-c', '2', 'sset', 'PCM', f'{volume}%'], check=True)
        return jsonify({"status": "success", "volume": volume})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def _play_led_worker(audio_file, r, g, b):
    """Interne worker die audio en LEDs afhandelt zonder de server-thread te blokkeren"""
    audio = threading.Thread(
        target=speak,
        args=(audio_file,),
    )
    audio.start()

    if led and led.Ledsupported:
        while audio.is_alive():
            led.strip.set_all_led_color(r, g, b)
            time.sleep(0.35)

            led.strip.set_all_led_color(0, 0, 0)
            time.sleep(0.25)

        led.strip.set_all_led_color(0, 0, 0)

    audio.join()


def play_with_led(audio_file, r, g, b):
    """Start de LED + Audio animatie direct in een aparte achtergrond-thread"""
    threading.Thread(target=_play_led_worker, args=(audio_file, r, g, b), daemon=True).start()


@app.post("/start_demo_scenario")
def start_demo_scenario():
    """Simuleert het getrapte zorgscenario voor presentaties"""
    global DEMO_SIMULATED_MISSES
    DEMO_SIMULATED_MISSES += 1

    if DEMO_SIMULATED_MISSES == 1:
        print("🎬 PRESENTATIE: 1e inname gemist. Zachte herinnering.")
        play_with_led("Medication-reminder.mp3", 255, 120, 0)
        return jsonify({
            "stage": "warning", 
            "missed_count": 1,
            "message": "1e moment gemist: lokaal gesignaleerd, mantelzorger niet gestoord."
        })
    else:
        print("🎬 PRESENTATIE: 2e inname gemist. Drempel bereikt -> Noodscenario.")
        DEMO_SIMULATED_MISSES = 0
        trigger_escalation_protocol()
        return jsonify({
            "stage": "emergency", 
            "missed_count": 2,
            "message": "Escalatiedrempel bereikt: mantelzorger verwittigd en camera geopend."
        })


@app.post("/start_reminder")
def start_reminder():
    print("EERSTE HERINNERING")
    play_with_led("Medication-time.mp3", 0, 80, 255)
    return jsonify({"status": "ok"})


@app.post("/second_reminder")
def second_reminder():
    print("TWEEDE HERINNERING")
    play_with_led("Medication-reminder.mp3", 255, 120, 0)
    return jsonify({"status": "ok"})


@app.post("/care_emergency")
def care_emergency():
    print("NOODSITUATIE")
    trigger_escalation_protocol()
    return jsonify({"status": "ok"})


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
    percentage = round(((raw - 1.10) / (1.42 - 1.10)) * 100)
    percentage = max(0, min(100, percentage))

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
    success = send_cmd("CMD_LOCK#110")
    if not success:
        print("Technisch probleem: motor reageert niet.")
        speak("Technical-problem.mp3")
        return jsonify({"status": "error"}), 500
        
    return jsonify({"status": "open"})


@app.post("/lock_close")
def lock_close():
    success = send_cmd("CMD_LOCK#20")
    if not success:
        print("Technisch probleem: motor reageert niet.")
        speak("Technical-problem.mp3")
        return jsonify({"status": "error"}), 500

    return jsonify({"status": "closed"})


# =========================================================
# MEDICATIE BEVESTIGING
# =========================================================

@app.post("/medicijnen/<int:id>/bevestig")
def confirm_med(id):
    print(f"Medicatie bevestigd: {id}")

    success = send_cmd("CMD_LOCK#20")
    if not success:
        print("Technisch probleem: motor reageert niet.")
        speak("Technical-problem.mp3")
        return jsonify({"status": "error"}), 500

    speak("Medication-done.mp3")

    return jsonify({"status": "success"})


# =========================================================
# SCAN MEDICATION AUDIO FEEDBACK & HARDWARE VERIFICATIE
# =========================================================

@app.post("/audio/scan_medication")
def audio_scan_medication():
    """Instructie: 'Scan de barcode om te bevestigen dat je de medicatie hebt ingenomen'"""
    print("Audio: Scan medicijn instructie")
    play_with_led("Scan_confirm_medication.mp3", 0, 150, 255)
    return jsonify({"status": "ok"})


@app.post("/audio/scan_done")
def audio_scan_done():
    """
    Fysieke verificatie: doosje/klepje is gescand bij Mino.
    1. Speelt succesgeluid: 'Goed gescand, je hebt de medicatie voor dit uur ingenomen'.
    2. Wacht 6 seconden zodat de patiënt het klepje rustig kan sluiten.
    3. Sluit het fysieke slot (CMD_LOCK#20).
    4. Registreert inname in Supabase.
    """
    print("✅ Barcode geverifieerd aan de robot!")
    
    # 1. Speel nieuwe audio met groen LED-licht
    play_with_led("Scan_confirm_medication_done.mp3", 0, 255, 0)

    # 2. Vertraagde sluiting na 6 seconden
    def delayed_lock():
        print("Sluit compartiment na inname-tijd...")
        send_cmd("CMD_LOCK#20")

    threading.Timer(6.0, delayed_lock).start()

    # 3. Registreer de inname in Supabase
    try:
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        schedule_res = supabase.table("daily_schedule").select("*").execute()
        if schedule_res.data:
            current_task = schedule_res.data[0]
            task_id = current_task.get("id")
            
            supabase.table("medication_logs").upsert(
                {
                    "task_id": task_id,
                    "date": today_str,
                    "taken": True,
                    "taken_at": datetime.datetime.now().isoformat()
                },
                on_conflict="task_id, date"
            ).execute()
            print(f"Log weggeschreven voor taak {task_id}")
    except Exception as e:
        print(f"Fout bij wegschrijven scanverificatie in Supabase: {e}")

    return jsonify({"status": "verified", "message": "Inname fysiek geverifieerd"})


@app.post("/audio/scan_wrong")
def audio_scan_wrong():
    print("Audio: Verkeerde scan")
    speak("Scan-wrong.mp3")
    return jsonify({"status": "ok"})


@app.post("/audio/scan_reminder")
def audio_scan_reminder():
    print("Audio: Herinnering om te scannen")
    play_with_led("Scan-reminder.mp3", 0, 150, 255)
    return jsonify({"status": "ok"})


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

    speak("Medication-time.mp3")

    return jsonify({"status": "started"})


# =========================================================
# CAREGIVER NOTIFICATIE
# =========================================================

@app.post("/notify_caregiver")
def notify_caregiver():
    print("BESTELD: Opa heeft het gemeld.")

    RESTOCK_STATE["active"] = False
    RESTOCK_STATE["deadline"] = None

    speak("Message-sent.mp3")

    if led and led.Ledsupported:
        led.strip.set_all_led_color(255, 100, 0)
        time.sleep(0.8)

        for _ in range(3):
            led.strip.set_all_led_color(0, 0, 0)
            time.sleep(0.15)
            led.strip.set_all_led_color(0, 0, 255)
            time.sleep(0.15)

        led.strip.set_all_led_color(0, 255, 0)
        time.sleep(0.5)

        time.sleep(1)
        led.strip.set_all_led_color(0, 0, 0)

    return jsonify({
        "status": "sent",
        "message": "Robot interaction complete"
    })


# =========================================================
# CAMERA PRIVACY NOTIFICATION
# =========================================================

@app.post("/camera_active_warning")
def camera_warning():
    print("Camera actief waarschuwing afspelen.")
    speak("Camera.mp3")
    return jsonify({"status": "ok"})


# =========================================================
# INVENTORY NOTIFICATION
# =========================================================

@app.route("/inventory_warning", methods=["GET", "POST"])
def inventory_warning():
    print("Voorraad bijna op waarschuwing afspelen.")
    speak("Inventory.mp3")
    return jsonify({"status": "ok"})


# =========================================================
# MAIN
# =========================================================

print("Push token:", get_caregiver_token())

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