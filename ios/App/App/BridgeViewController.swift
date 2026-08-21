import Capacitor

// Capacitor only auto-discovers plugins listed in capacitor.config.json's
// packageClassList (community/npm plugins); a plugin bundled directly in
// the app target -- StoreKitPlugin.swift -- has to be registered explicitly
// here. SceneDelegate instantiates this instead of the stock
// CAPBridgeViewController.
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StoreKitPlugin())
    }
}
