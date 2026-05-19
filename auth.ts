import * as AppleAuthentication from 'expo-apple-authentication';
import {
  createUserWithEmailAndPassword,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

// REGISTRO EMAIL
export const registerUser = async (
  email: string,
  password: string
) => {
  return await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
};

// LOGIN EMAIL
export const loginUser = async (
  email: string,
  password: string
) => {
  return await signInWithEmailAndPassword(
    auth,
    email,
    password
  );
};

// LOGIN CON APPLE
export async function loginWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple no ha devuelto token de identidad.');
  }

  const provider = new OAuthProvider('apple.com');

  const firebaseCredential = provider.credential({
    idToken: credential.identityToken,
  });

  return signInWithCredential(auth, firebaseCredential);
}

// LOGOUT
export const logoutUser = async () => {
  return await signOut(auth);
};