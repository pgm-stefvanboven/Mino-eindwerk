import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useRole } from '../context/RoleContext';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const { setRole } = useRole();

  const handleSelectRole = (selectedRole: 'patient' | 'mantelzorger') => {
    // 1. Save the role in our context
    setRole(selectedRole);
    // 2. Navigate to the tabs. We use 'replace' instead of 'push', 
    // so that the user cannot go back to this screen with the 'back' button.
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welkom bij Mino</Text>
        <Text style={styles.subtitle}>Wie gebruikt deze app momenteel?</Text>

        <TouchableOpacity 
          style={[styles.button, styles.patientButton]} 
          onPress={() => handleSelectRole('patient')}
        >
          <Text style={styles.buttonText}>Ik ben de Gebruiker</Text>
          <Text style={styles.subText}>(Persoon met dementie)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.mantelzorgerButton]} 
          onPress={() => handleSelectRole('mantelzorger')}
        >
          <Text style={styles.buttonText}>Ik ben de Mantelzorger</Text>
          <Text style={styles.subText}>(Beheer & Overzicht)</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a1a1aa',
    textAlign: 'center',
    marginBottom: 48,
  },
  button: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  patientButton: {
    backgroundColor: '#3b82f6', // Blue for the patient (calming)
  },
  mantelzorgerButton: {
    backgroundColor: '#10b981', // Green for the caregiver (campaign/overview)
  },
  buttonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
});