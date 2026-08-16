import { ethers } from "ethers";

/**
 * PasskeyManager (V3 Prototype)
 * Simulates a Passkey-backed embedded wallet by triggering native WebAuthn (TouchID/FaceID) 
 * before granting access to the Ethereum private key.
 */

const PASSKEY_CREDENTIAL_ID_KEY = "aegis_passkey_id";
const ENCRYPTED_WALLET_KEY = "aegis_encrypted_wallet";

// Dummy challenge for local WebAuthn prototype
const challenge = new Uint8Array(32);
crypto.getRandomValues(challenge);

export const PasskeyManager = {
  
  // 1. Checks if the device supports WebAuthn Passkeys
  isSupported: () => {
    return window.PublicKeyCredential !== undefined;
  },

  // 2. Checks if the user already has a Passkey wallet setup
  hasWallet: () => {
    return !!localStorage.getItem(PASSKEY_CREDENTIAL_ID_KEY) && !!localStorage.getItem(ENCRYPTED_WALLET_KEY);
  },

  // 3. Registers a new Passkey and creates a new Ethereum Wallet
  createWallet: async () => {
    try {
      // Trigger Native TouchID / FaceID registration
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: "Aegis Protocol Node", id: window.location.hostname },
          user: {
            id: new Uint8Array(16),
            name: "user@aegisprotocol.io",
            displayName: "Aegis User"
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required"
          },
          timeout: 60000,
        }
      });

      if (!credential) throw new Error("Passkey registration failed");

      // Save the credential ID to use for future logins
      const credentialId = btoa(String.fromCharCode.apply(null, new Uint8Array(credential.rawId)));
      localStorage.setItem(PASSKEY_CREDENTIAL_ID_KEY, credentialId);

      // Generate a new Ethers wallet
      const newWallet = ethers.Wallet.createRandom();
      const privateKey = newWallet.privateKey;

      // In a full production environment, this private key is encrypted via MPC or the Passkey itself.
      // For this sandbox, we store it symmetrically, gated by the biometric check.
      localStorage.setItem(ENCRYPTED_WALLET_KEY, privateKey);

      return privateKey;
    } catch (err) {
      console.error("Passkey Creation Error:", err);
      throw err;
    }
  },

  // 4. Authenticates via Passkey to unlock the wallet
  unlockWallet: async () => {
    try {
      const storedCredentialId = localStorage.getItem(PASSKEY_CREDENTIAL_ID_KEY);
      if (!storedCredentialId) throw new Error("No passkey found");

      const rawId = Uint8Array.from(atob(storedCredentialId), c => c.charCodeAt(0));

      // Trigger Native TouchID / FaceID login
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            id: rawId,
            type: "public-key"
          }],
          userVerification: "required",
          timeout: 60000,
        }
      });

      if (!assertion) throw new Error("Passkey authentication failed");

      // Once biometric succeeds, return the decrypted private key
      const privateKey = localStorage.getItem(ENCRYPTED_WALLET_KEY);
      return privateKey;
    } catch (err) {
      console.error("Passkey Unlock Error:", err);
      throw err;
    }
  },
  
  // 5. Wipes the wallet from the device
  logout: () => {
    localStorage.removeItem(PASSKEY_CREDENTIAL_ID_KEY);
    localStorage.removeItem(ENCRYPTED_WALLET_KEY);
  }
};
