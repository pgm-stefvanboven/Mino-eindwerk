import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';

// Even de iconen importeren voor dit bestand
import { Ionicons } from '@expo/vector-icons'; // Jouw bestaande service bestand

// PAS DIT AAN NAAR JOUW PI IP ADRES
const CAMERA_URL = "http://10.20.195.75:5000/video_feed"; 

export default function RobotScreen() {
  
  // Functie om commando te sturen
  const move = async (dir: string) => {
    try {
        console.log("Rijden naar:", dir);
        // Hier roepen we je Pi service aan (zorg dat die functie bestaat!)
        // await Pi.move(dir); 
        // Voor nu even een fetch om te testen:
        await fetch(`http://10.42.0.1:8000/move/${dir}`);
    } catch (e) {
        console.log("Fout bij verbinden robot:", e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Camera & Besturing</Text>
      
      {/* 1. De Camera Stream */}
      <View style={styles.cameraBox}>
        <WebView 
            source={{ uri: CAMERA_URL }} 
            style={{ flex: 1 }}
            scrollEnabled={false}
            javaScriptEnabled={true}
        />
      </View>

      {/* 2. De Knoppen */}
      <View style={styles.controls}>
        {/* Vooruit */}
        <TouchableOpacity 
            style={styles.btn} 
            onPressIn={() => move('vooruit')} 
            onPressOut={() => move('stop')}
        >
           <Ionicons name="caret-up" size={40} color="white" />
        </TouchableOpacity>
        
        <View style={styles.row}>
            {/* Links */}
            <TouchableOpacity 
                style={styles.btn} 
                onPressIn={() => move('links')} 
                onPressOut={() => move('stop')}
            >
                <Ionicons name="caret-back" size={40} color="white" />
            </TouchableOpacity>

            {/* Rechts */}
            <TouchableOpacity 
                style={styles.btn} 
                onPressIn={() => move('rechts')} 
                onPressOut={() => move('stop')}
            >
                <Ionicons name="caret-forward" size={40} color="white" />
            </TouchableOpacity>
        </View>

        {/* Achteruit */}
        <TouchableOpacity 
            style={styles.btn} 
            onPressIn={() => move('achteruit')} 
            onPressOut={() => move('stop')}
        >
           <Ionicons name="caret-down" size={40} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1c1c1e', padding: 20, paddingTop: 60 },
  header: { color: 'white', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  cameraBox: { height: 250, backgroundColor: 'black', borderRadius: 16, overflow: 'hidden', marginBottom: 40, borderWidth: 2, borderColor: '#333' },
  controls: { alignItems: 'center' },
  row: { flexDirection: 'row', gap: 40, marginVertical: 15 },
  btn: { backgroundColor: '#3a3a3c', width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 4 },
});