import socket

HOST = "10.20.195.75"    # IP van jouw Raspberry Pi
PORT = 6000              # poort van jouw med_server.py

def send(cmd):
    print("Sending:", cmd)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((HOST, PORT))
        s.sendall(cmd.encode("utf-8"))

send("test_forward")