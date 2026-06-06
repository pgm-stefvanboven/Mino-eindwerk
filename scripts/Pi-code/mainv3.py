import io
import os
import socket
import struct
import time
import picamera2
import sys
import signal
import threading
import logging

from server import Server
from Buzzer import *

# 配置日志
logging.basicConfig(
    filename='/var/log/car_server.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)


class ServerController:
    def __init__(self):
        self.TCP_Server = Server()
        self.is_running = False
        self.threads = []
        self.stop_event = threading.Event()

        # Buzzer apart init (je had dit al; laten staan)
        try:
            self.buzzer = Buzzer()
            logging.info("Buzzer initialized successfully")
        except Exception as e:
            logging.error(f"Failed to initialize buzzer: {e}")
            raise

    def beep(self):
        try:
            logging.info("Playing startup sound")
            self.buzzer.run('1')
            time.sleep(0.5)
            self.buzzer.run('0')
            logging.info("Startup sound completed")
        except Exception as e:
            logging.error(f"Buzzer error: {e}")

    # ---- Helpers om Server API verschillen op te vangen ----
    def _server_start_listen(self):
        """
        Ondersteunt zowel nieuwe server.py (start_tcp_server)
        als oude server.py (StartTcpServer).
        """
        if hasattr(self.TCP_Server, "start_tcp_server"):
            self.TCP_Server.start_tcp_server()
        elif hasattr(self.TCP_Server, "StartTcpServer"):
            self.TCP_Server.StartTcpServer()
        else:
            raise RuntimeError("Server heeft geen start_tcp_server() of StartTcpServer()")

    def _server_stop(self):
        """
        Ondersteunt zowel StopTcpServer() als een fallback close.
        """
        if hasattr(self.TCP_Server, "StopTcpServer"):
            try:
                self.TCP_Server.StopTcpServer()
            except Exception:
                pass
            return

        # Fallback: probeer sockets te sluiten als ze bestaan
        for attr in ("server_socket_cmd", "server_socket_video", "server_socket1", "server_socket"):
            s = getattr(self.TCP_Server, attr, None)
            try:
                if s:
                    s.close()
            except Exception:
                pass

    # -------------------------------------------------------

    def start_server(self):
        if self.is_running:
            logging.info("Server is already running")
            return

        logging.info("Starting server...")
        try:
            # Beep in aparte thread (zoals jij had)
            beep_thread = threading.Thread(target=self.beep, daemon=True)
            beep_thread.start()

            # Start luister-sockets
            self._server_start_listen()

            # Start worker threads (BELANGRIJK: target functies zijn zelf blocking loops)
            self.threads = []

            if hasattr(self.TCP_Server, "readdata"):
                self.threads.append(threading.Thread(
                    target=self.run_thread_once,
                    args=(self.TCP_Server.readdata, "ReadData"),
                    daemon=True
                ))

            if hasattr(self.TCP_Server, "sendvideo"):
                self.threads.append(threading.Thread(
                    target=self.run_thread_once,
                    args=(self.TCP_Server.sendvideo, "SendVideo"),
                    daemon=True
                ))

            # Power thread is optioneel; enkel starten als aanwezig
            if hasattr(self.TCP_Server, "Power"):
                self.threads.append(threading.Thread(
                    target=self.run_thread_once,
                    args=(self.TCP_Server.Power, "Power"),
                    daemon=True
                ))

            for t in self.threads:
                t.start()

            self.is_running = True
            logging.info("Server started successfully")

            # Wacht max 2s op beep
            beep_thread.join(timeout=2)
            if beep_thread.is_alive():
                logging.warning("Beep thread did not complete in time")

        except Exception as e:
            logging.error(f"Failed to start server: {e}")
            self.stop_server()
            raise

    def run_thread_once(self, target, name):
        """
        Doel: target() 1x runnen.
        target() is typisch een blocking loop (sendvideo/readdata).
        Als die crasht, loggen we en kunnen we eventueel herstarten
        zolang stop_event niet gezet is.
        """
        while not self.stop_event.is_set():
            try:
                target()
                # Als target ooit "netjes" terugkeert: niet blijven spinnen.
                logging.info(f"{name} returned normally; stopping thread.")
                return
            except Exception as e:
                logging.error(f"Error in {name} thread: {e}")
                # Kleine backoff om niet te spammen
                time.sleep(0.5)
                # Herstart enkel als we niet stoppen
                continue

    def stop_server(self):
        if not self.is_running:
            logging.info("Server is not running")
            return

        logging.info("Stopping server...")
        self.stop_event.set()

        # Sockets sluiten zodat blocking accept/recv kan breken
        self._server_stop()

        # Threads kort laten joinen
        for t in self.threads:
            try:
                t.join(timeout=3)
            except Exception:
                pass

        self.is_running = False
        logging.info("Server stopped")

    def run(self):
        self.start_server()  # 自动开启 TCP 服务器
        try:
            while not self.stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            logging.info("Program interrupted by user")
        finally:
            self.stop_server()


def cleanup():
    logging.info("Cleaning up resources...")
    try:
        # Probeer eerst netjes de camera te stoppen
        if hasattr(picamera2.Picamera2, 'global_cleanup'):
            picamera2.Picamera2.global_cleanup()
    except Exception as e:
        logging.error(f"Error during Picamera2 cleanup: {e}")


def handle_stop(signum, frame):
    logging.info("Stop signal received")
    controller.stop_event.set()


def handle_restart(signum, frame):
    logging.info("Restart signal received")
    controller.stop_server()
    # reset stop_event zodat start_server terug kan draaien
    controller.stop_event.clear()
    controller.start_server()


if __name__ == '__main__':
    controller = ServerController()

    def shutdown(signum, frame):
        logging.info("Shutdown signal received")
        controller.stop_event.set()

    # Signalen koppelen
    signal.signal(signal.SIGINT, shutdown)    # CTRL+C
    signal.signal(signal.SIGTERM, shutdown)   # Kill command
    signal.signal(signal.SIGUSR1, handle_stop)
    signal.signal(signal.SIGUSR2, handle_restart)

    try:
        controller.run()
    except Exception as e:
        logging.error(f"Main loop error: {e}")
    finally:
        controller.stop_server()
        cleanup()

        logging.info("All finished. Exiting.")
        try:
            sys.stdout.flush()
        except Exception:
            pass
        os._exit(0)
