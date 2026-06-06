from flask import Flask, jsonify
from flask_cors import CORS
import socket

app = Flask(__name__)
CORS(app)

# Instellingen: Verbinden met mainv3.py (Poort 5000)
ROBOT_HOST = '127.0.0.1'
ROBOT_PORT = 5000

def send_cmd(cmd):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((ROBOT_HOST, ROBOT_PORT))
            s.sendall(cmd.encode())
            print(f"Verzonden: {cmd.strip()}")
    except Exception as e:
        print(f"Fout bij sturen naar robot: {e}")

@app.route("/move/<direction>")
def move(direction):
    print(f"MOVE REQUEST: {direction}")
    speed = 1500

    # Standaard commando's
    cmds = {
        "vooruit":   f"CMD_MOTOR#{speed}#{speed}#{speed}#{speed}\n",
        "achteruit": f"CMD_MOTOR#-{speed}#-{speed}#-{speed}#-{speed}\n",
        "links":     f"CMD_MOTOR#-{speed}#-{speed}#{speed}#{speed}\n",
        "rechts":    f"CMD_MOTOR#{speed}#{speed}#-{speed}#-{speed}\n",
        "stop":      "CMD_MOTOR#0#0#0#0\n",

        # Camera Tilt
        "cam_up":    "CMD_CAMERA#UP\n",
        "cam_down":  "CMD_CAMERA#DOWN\n",

        # Camera Pan (NIEUW!)
        "cam_left":  "CMD_CAMERA#LEFT\n",
        "cam_right": "CMD_CAMERA#RIGHT\n",

        # Stop
        "cam_stop":  "CMD_CAMERA#STOP\n"
    }

    # HIER IS DE NIEUWE MAGIE VOOR JE DEMO:
    if direction == "reminder_start":
        cmd_str = "CMD_REMINDER#START\n"
    elif direction == "reminder_stop":
        cmd_str = "CMD_REMINDER#STOP\n"
    else:
        # Pak het standaard commando uit de lijst
        cmd_str = cmds.get(direction, "CMD_MOTOR#0#0#0#0\n")

    send_cmd(cmd_str)
    return jsonify({"status": "sent", "cmd": cmd_str})

if __name__ == '__main__':
    print("Besturings-server draait op poort 5002...")
    app.run(host='0.0.0.0', port=5002, threaded=True, debug=False)
