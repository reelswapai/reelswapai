import * as AppleAuthentication from 'expo-apple-authentication';
import React from 'react';
import {
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { loginUser, loginWithApple, registerUser } from '../auth';

type Props = {
  email: string;
  password: string;
  isLogin: boolean;
  styles: any;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setIsLogin: (value: boolean) => void;
};

export default function AuthScreen({
  email,
  password,
  isLogin,
  styles,
  setEmail,
  setPassword,
  setIsLogin,
}: Props) {
  async function handleAuth() {
    try {
      if (!email || !password) {
        Alert.alert('Faltan datos', 'Introduce email y contraseña.');
        return;
      }

      if (isLogin) {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
    } catch (error: any) {
      console.log('Error auth email:', error);
      Alert.alert('Error', error?.message || 'Error autenticando.');
    }
  }

  async function handleAppleLogin() {
    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();

      if (!isAvailable) {
        Alert.alert(
          'No disponible',
          'Iniciar sesión con Apple solo está disponible en dispositivos Apple compatibles.'
        );
        return;
      }

      await loginWithApple();
    } catch (error: any) {
      console.log('Error login Apple:', error);

      if (error?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }

      Alert.alert(
        'Error',
        error?.message || 'No se ha podido iniciar sesión con Apple.'
      );
    }
  }

  return (
    <View style={styles.authContainer}>
      <View style={styles.authHero}>
        <Text style={styles.badge}>AI FACE SWAP</Text>

        <Text style={styles.authTitle}>ReelSwap AI</Text>

        <Text style={styles.authSubtitle}>
          Crea face swaps con IA en fotos y vídeos de forma rápida y sencilla.
        </Text>
      </View>

      <View style={styles.authCard}>
        <Text style={styles.cardTitle}>
          {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
        </Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          placeholder="Contraseña"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />

        <TouchableOpacity style={styles.generateButton} onPress={handleAuth}>
          <Text style={styles.generateButtonText}>
            {isLogin ? 'Entrar' : 'Crear cuenta'}
          </Text>
        </TouchableOpacity>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={16}
          style={styles.appleButton}
          onPress={handleAppleLogin}
        />

        <TouchableOpacity
          onPress={() => setIsLogin(!isLogin)}
          style={{ marginTop: 16 }}
        >
          <Text style={styles.switchAuthText}>
            {isLogin
              ? '¿No tienes cuenta? Crear cuenta'
              : '¿Ya tienes cuenta? Iniciar sesión'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.authLegalText}>
          Al continuar aceptas usar ReelSwapAI de forma responsable, solo con imágenes propias o con permiso explícito.
        </Text>
      </View>
    </View>
  );
}