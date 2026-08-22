import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit
import GoogleSignIn

// Native social sign-in for iOS, replacing browser-based Supabase OAuth
// (which redirected through window.location.origin -- unusable inside a
// Capacitor WKWebView, and Apple could redirect to localhost). Both flows
// authenticate on-device with the platform SDK, then hand the provider's
// identity token back to JS so useAuth.js can call
// supabase.auth.signInWithIdToken() directly -- no browser round-trip, no
// localhost callback.
@objc(AuthPlugin)
public class AuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithGoogle", returnType: CAPPluginReturnPromise)
    ]

    // Held for the lifetime of a single in-flight Apple request so
    // ASAuthorizationController's delegate isn't deallocated before it calls
    // back (ASAuthorizationController keeps only a weak/unretained ref).
    private var appleDelegate: AppleSignInDelegate?

    @objc func signInWithApple(_ call: CAPPluginCall) {
        // Raw nonce goes back to JS for supabase.auth.signInWithIdToken();
        // only its SHA-256 is sent to Apple, per Sign in with Apple's replay
        // protection contract.
        let rawNonce = AuthPlugin.randomNonceString()

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = AuthPlugin.sha256(rawNonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        let delegate = AppleSignInDelegate(rawNonce: rawNonce) { [weak self] result in
            self?.appleDelegate = nil
            switch result {
            case .success(let payload):
                call.resolve(payload)
            case .cancelled:
                // Not a real failure -- the user backed out of the sheet.
                // useAuth.js checks this code to skip showing a login error.
                call.reject("Apple sign-in was cancelled", "CANCELED")
            case .failure(let message):
                call.reject(message, "APPLE_SIGNIN_FAILED")
            }
        }
        appleDelegate = delegate
        controller.delegate = delegate
        controller.presentationContextProvider = delegate

        // Capacitor plugin methods run off the main thread by default;
        // performRequests() drives UI presentation and must be dispatched
        // back to it (same reasoning as the DispatchQueue.main.async wrapper
        // around GIDSignIn.sharedInstance.signIn below).
        DispatchQueue.main.async {
            controller.performRequests()
        }
    }

    @objc func signInWithGoogle(_ call: CAPPluginCall) {
        guard let presentingViewController = bridge?.viewController else {
            call.reject("No presenting view controller available")
            return
        }

        // Same raw/hashed nonce contract as Apple above: Google only ever
        // sees the SHA-256 digest (replay protection), while the raw nonce
        // goes back to JS so supabase.auth.signInWithIdToken() can verify it
        // against the digest embedded in the ID token it receives.
        let rawNonce = AuthPlugin.randomNonceString()
        let hashedNonce = AuthPlugin.sha256(rawNonce)

        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController, nonce: hashedNonce) { signInResult, error in
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == kGIDSignInErrorDomain, nsError.code == GIDSignInError.canceled.rawValue {
                        call.reject("Google sign-in was cancelled", "CANCELED")
                    } else {
                        call.reject(error.localizedDescription, "GOOGLE_SIGNIN_FAILED")
                    }
                    return
                }
                guard let user = signInResult?.user, let idToken = user.idToken?.tokenString else {
                    call.reject("Google sign-in returned no ID token", "GOOGLE_SIGNIN_FAILED")
                    return
                }
                call.resolve([
                    "idToken": idToken,
                    "accessToken": user.accessToken.tokenString,
                    "nonce": rawNonce
                ])
            }
        }
    }

    private static func randomNonceString(length: Int = 32) -> String {
        var randomBytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        precondition(status == errSecSuccess, "Unable to generate secure nonce: \(status)")
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(randomBytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).compactMap { String(format: "%02x", $0) }.joined()
    }
}

private enum AppleSignInResult {
    case success([String: Any])
    case cancelled
    case failure(String)
}

private class AppleSignInDelegate: NSObject, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    private let rawNonce: String
    private let completion: (AppleSignInResult) -> Void

    init(rawNonce: String, completion: @escaping (AppleSignInResult) -> Void) {
        self.rawNonce = rawNonce
        self.completion = completion
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? UIWindow()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            completion(.failure("Apple did not return an identity token"))
            return
        }

        // givenName/familyName/email are only ever present on the user's
        // FIRST authorization for this app -- Apple omits them on every
        // subsequent sign-in, so useAuth.js persists them into Supabase
        // user metadata right after this succeeds.
        var payload: [String: Any] = [
            "identityToken": identityToken,
            "nonce": rawNonce
        ]
        if let given = credential.fullName?.givenName { payload["givenName"] = given }
        if let family = credential.fullName?.familyName { payload["familyName"] = family }
        if let email = credential.email { payload["email"] = email }

        completion(.success(payload))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            completion(.cancelled)
        } else {
            completion(.failure(error.localizedDescription))
        }
    }
}
