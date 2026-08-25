# Mino – Slimme zorg, gerust gevoel

## Projecttitel
**Mino – Slimme zorg, gerust gevoel**

## Student
**Stef Van Boven**

## Opleiding
Bachelor Grafische en Digitale Media – Interactive Media Development (IMD)  
Academiejaar 2025–2026  
Afstudeerproject  
Arteveldehogeschool Gent  

---

## 1. Projectomschrijving

**Mino** is een interactief, fysiek en digitaal zorgondersteunend ecosysteem dat focust op medicatiebegeleiding, dagstructuur en gemoedsrust voor zowel de zorgbehoevende (patiënt) als de mantelzorger.

Het project combineert een mobiele applicatie met een fysieke zorgrobot (Raspberry Pi 5) en een gesynchroniseerde cloud-backend. Mino doorbreekt passieve meldingen door fysieke interactie, hardware-feedback en getrapte zorgscenario's te combineren.

De kernfilosofie rust op de centrale interactieflow:  
**Ondersteuning → Fysieke Handeling → Verificatie → Geruststelling**.

---

## 2. Belangrijkste Functies & Ecosysteem

### 📱 Mobiele Applicatie (Expo / React Native / TypeScript)
* **Dubbele Rolcontext (Patiënt & Mantelzorger):** Interface en actiemogelijkheden passen dynamisch aan op basis van de actieve rol.
* **Tijdlijn & Dynamische Dagplanning:** Live weergave van innamemomenten met real-time countdown, statustrackers (`Aankomend`, `Neem in`, `Inhalen`, `Gemist`, `Genomen`) en Supabase-synchronisatie.
* **Fysieke Barcodeverificatie via Camera:** De patiënt kan een inname pas voltooien na het fysiek scannen van de unieke barcode aan de binnenzijde van het medicatieklepje van Mino.
* **Geïntegreerd Voorraadbeheer:** Automatische berekening van de resterende voorraaddagen op basis van het dagelijkse innameschema, met ingebouwde bestelherinneringen en alerts voor lage voorraad (< 10 stuks).
* **Mantelzorg-Beveiliging (Schedule Lock):** Mogelijkheid voor de mantelzorger om het innameschema op afstand te vergrendelen tegen ongewenste wijzigingen door de patiënt.
* **Expo Push Notificaties:** Real-time pushmeldingen naar de smartphone van de mantelzorger bij schemawijzigingen, kritieke voorraad of noodsituaties.

### 🤖 Fysieke Robot & Backend Bridge (Raspberry Pi / Python Flask)
* **Gemotoriseerd Medicatiecompartiment:** Automatische ontgrendeling van het klepje via een PWM-servomotor (`CMD_LOCK`) tijdens innamemomenten en automatische sluiting na verificatie.
* **Interactieve WS2812B LED Feedback:** Visuele statusindicatoren via animaties (blauw bij innametijd, oranje bij herinnering, groen bij succesvolle scan, rood bij noodalarm).
* **Spraak- & Audiobegeleiding:** Native tekst-naar-spraak en MP3-audio-instructies via een hardware speaker (`speak`), met automatische buzzer-fallback bij audiofouten.
* **Getrapt Zorg- en Escalatiescenario:**
  1. **Eerste Herinnering:** Subtiel audio- en LED-signaal op het exacte innamemoment.
  2. **Tweede Herinnering & Inhaalvenster:** Oranje waarschuwingsfase met audioherinnering en mogelijkheid tot inhalen.
  3. **Escalatie / Noodprotocol:** Bij herhaaldelijk gemiste momenten worden de camerabeelden vrijgegeven, ontvangt de mantelzorger een pushnotificatie en activeert het lokale alarm op de robot.
* **Privacy-First Live Videostreaming:** Low-latency MJPEG videostreaming via socket proxy (`/video_feed`), uitsluitend toegankelijk wanneer de privacy-instellingen of noodprotocollen dit vrijgeven.
* **Batterij- & Hardwaremonitoring:** Real-time batterijmeting via ADC (analoog-naar-digitaal converter) met automatische waarschuwingen bij lage accustatus (≤ 15%).

---

## 3. Technische Architectuur & Stack

* **Frontend:** React Native (Expo Router, TypeScript, React Native Reanimated)
* **Hardware & Controller:** Raspberry Pi 5 (Python 3, Flask, Sockets, RPi.GPIO / rpi_ws281x, ADC)
* **Backend & Database:** Supabase (PostgreSQL, Realtime Subscriptions, Database Channels)
* **Notificaties:** Expo Push Service API & Webhooks
* **Communicatieprotocol:** REST API + Persistent TCP Sockets tussen Flask HTTP Bridge en Robot Core Engine

---

## 4. Inhoud van deze ZIP

Deze ZIP bevat alle nodige documentatie en media om het eindwerk correct te **begrijpen en beoordelen**:

* Dit `README.md`-bestand
* Link naar de GitHub-repository met de volledige broncode
* Screenshots en demonstratievideo's ter illustratie van de werking, interface en hardware-interacties

---

## 5. Repository (Broncode)

**Mobile App & Backend:**  
[GitHub Repository Mino](https://github.com/pgm-stefvanboven/Mino-eindwerk)

---

## 6. Prototype Context & Beperkingen

Dit project werd ontwikkeld en gevalideerd als een **functioneel afstudeerprototype**:
* De volledige interactie komt tot uiting in de wisselwerking tussen de mobiele app en de fysieke robot.
* Er is geen publieke authenticatielaag voorzien; het project draait binnen een gesloten testopstelling op een lokaal netwerk met Supabase-koppeling.
* Het project toont de haalbaarheid en interactiekwaliteit van technologie binnen de thuis- en mantelzorg aan.

---

## 7. Contact

Student: **Stef Van Boven** [(Github)](https://github.com/pgm-stefvanboven)

Opleiding: Bachelor Grafische en Digitale Media – IMD  
Instelling: Arteveldehogeschool Gent  

---
*Dank u voor het bekijken en beoordelen van dit eindwerk.*