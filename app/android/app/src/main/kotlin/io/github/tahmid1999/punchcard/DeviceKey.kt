package io.github.tahmid1999.punchcard

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class KeyError(val code: String, message: String) : Exception(message)

// The phone's half of the proof. The private key is made inside the Keystore and
// never leaves it; every single signature needs a fingerprint first. That proves
// a finger enrolled on this phone touched the sensor, not whose finger it was.
//
// Each pairing gets its own alias, so pairing again makes the new key next to the
// old one and the old one is only dropped once the server has taken the new one.
object DeviceKey {
    private fun store() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun exists(alias: String): Boolean = store().containsAlias(alias)

    fun delete(alias: String) = store().deleteEntry(alias)

    // Key generation only says "invalid parameters" when something is missing,
    // so the phone is checked first to tell the employee what to fix.
    private fun ready(context: Context) {
        if (!context.getSystemService(KeyguardManager::class.java).isDeviceSecure) {
            throw KeyError("NO_LOCK", "Set a screen lock (PIN, pattern or password) in Settings first.")
        }
        when (BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                throw KeyError("NO_FINGERPRINT", "Add a fingerprint in Settings first.")
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE, BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                throw KeyError("NO_SENSOR", "This phone has no fingerprint sensor it can use.")
        }
    }

    // Returns the public key as SPKI DER in base64, which is what the API stores.
    fun create(context: Context, alias: String): Map<String, Any> {
        ready(context)
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            // A new fingerprint added later (someone else's) kills the key, and the
            // phone has to be paired again by the admin.
            .setInvalidatedByBiometricEnrollment(true)
            .apply {
                if (Build.VERSION.SDK_INT >= 30) {
                    setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    // -1 means auth for every use, not a time window after unlock.
                    @Suppress("DEPRECATION")
                    setUserAuthenticationValidityDurationSeconds(-1)
                }
            }
            .build()

        val pair = try {
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
                .apply { initialize(spec) }
                .generateKeyPair()
        } catch (e: java.security.InvalidAlgorithmParameterException) {
            throw KeyError("KEYGEN", "Could not make the key: ${e.message}")
        }

        return mapOf(
            "publicKey" to Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP),
            "hardware" to insideHardware(pair.private),
        )
    }

    private fun insideHardware(key: PrivateKey): Boolean {
        val info = KeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
            .getKeySpec(key, KeyInfo::class.java)
        return if (Build.VERSION.SDK_INT >= 31) {
            info.securityLevel != KeyProperties.SECURITY_LEVEL_SOFTWARE
        } else {
            @Suppress("DEPRECATION")
            info.isInsideSecureHardware
        }
    }

    fun sign(
        activity: FragmentActivity,
        alias: String,
        message: String,
        title: String,
        subtitle: String,
        done: (Result<String>) -> Unit,
    ) {
        val key = store().getKey(alias, null) as PrivateKey?
        if (key == null) {
            done(Result.failure(KeyError("NO_KEY", "This phone is not paired.")))
            return
        }
        val signature = Signature.getInstance("SHA256withECDSA")
        try {
            signature.initSign(key)
        } catch (e: KeyPermanentlyInvalidatedException) {
            done(Result.failure(KeyError("KEY_INVALIDATED", "Fingerprints changed since pairing. Ask the admin to pair this phone again.")))
            return
        }

        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    // The Signature only works now, unlocked by this one authentication.
                    val sig = result.cryptoObject!!.signature!!
                    sig.update(message.toByteArray(Charsets.UTF_8))
                    done(Result.success(Base64.encodeToString(sig.sign(), Base64.NO_WRAP)))
                }

                override fun onAuthenticationError(code: Int, text: CharSequence) {
                    val cancelled = code == BiometricPrompt.ERROR_USER_CANCELED ||
                        code == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        code == BiometricPrompt.ERROR_CANCELED
                    done(Result.failure(KeyError(if (cancelled) "CANCELLED" else "BIOMETRIC", text.toString())))
                }

                // A finger that did not match. The prompt stays up and says so itself.
                override fun onAuthenticationFailed() {}
            },
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .setNegativeButtonText("Cancel")
                .build(),
            BiometricPrompt.CryptoObject(signature),
        )
    }
}
