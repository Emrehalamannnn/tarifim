import Foundation
import Capacitor
import StoreKit

// Native StoreKit 2 bridge for the Tarifim Premium auto-renewable
// subscriptions (com.tarifim.app.premium.monthly and
// com.tarifim.app.premium.yearly, same subscription group). Only exposes verified
// transaction data to JS -- signedTransactionJWS is Apple's signed receipt
// for that transaction, which the backend (supabase/functions/_shared/
// apple-subscription.ts) independently re-verifies against the App Store
// Server API before ever granting an entitlement. The client-side
// VerificationResult check below only guards against tampering in transit
// on-device; it is never treated as sufficient authorization by itself.
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise)
    ]

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self), !productIds.isEmpty else {
            call.reject("productIds is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: productIds)
                call.resolve(["products": products.map(self.productDict)])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        guard let tokenString = call.getString("appAccountToken"), let token = UUID(uuidString: tokenString) else {
            call.reject("appAccountToken must be a valid UUID")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Unknown product: \(productId)")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(token)])
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Transaction could not be verified", "UNVERIFIED")
                        return
                    }
                    let payload = self.transactionDict(transaction, verification: verification)
                    await transaction.finish()
                    call.resolve(payload)
                case .userCancelled:
                    call.reject("Purchase cancelled", "USER_CANCELLED")
                case .pending:
                    call.resolve(["pending": true])
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            var entitlements: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    entitlements.append(self.transactionDict(transaction, verification: result))
                }
            }
            call.resolve(["entitlements": entitlements])
        }
    }

    // AppStore.sync() is only ever invoked from here, and this method is
    // only ever called in direct response to the user tapping "Satın
    // Alımları Geri Yükle" in PremiumPaywall -- never automatically on
    // launch -- per Apple's guidance to reserve the account-picker prompt
    // it can trigger for an explicit user action.
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var entitlements: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result {
                        entitlements.append(self.transactionDict(transaction, verification: result))
                    }
                }
                call.resolve(["entitlements": entitlements])
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    private func productDict(_ product: Product) -> [String: Any] {
        [
            "id": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "price": NSDecimalNumber(decimal: product.price).doubleValue,
            "subscriptionPeriod": periodDict(product.subscription?.subscriptionPeriod) as Any,
            "introductoryOffer": introOfferDict(product.subscription?.introductoryOffer) as Any
        ]
    }

    private func transactionDict(_ transaction: Transaction, verification: VerificationResult<Transaction>) -> [String: Any] {
        var environment = "Production"
        if #available(iOS 16.0, *) {
            environment = transaction.environment.rawValue
        }
        return [
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "expirationDate": transaction.expirationDate.map { ISO8601DateFormatter().string(from: $0) } as Any,
            "environment": environment,
            "signedTransactionJWS": verification.jwsRepresentation
        ]
    }

    private func periodDict(_ period: Product.SubscriptionPeriod?) -> [String: Any]? {
        guard let period else { return nil }
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "unknown"
        }
        return ["unit": unit, "value": period.value]
    }

    private func introOfferDict(_ offer: Product.SubscriptionOffer?) -> [String: Any]? {
        guard let offer else { return nil }
        let paymentMode: String
        switch offer.paymentMode {
        case .freeTrial: paymentMode = "freeTrial"
        case .payAsYouGo: paymentMode = "payAsYouGo"
        case .payUpFront: paymentMode = "payUpFront"
        default: paymentMode = "unknown"
        }
        return [
            "displayPrice": offer.displayPrice,
            "period": periodDict(offer.period) as Any,
            "periodCount": offer.periodCount,
            "paymentMode": paymentMode
        ]
    }
}
