import Capacitor

// Capacitor only auto-discovers plugins listed in capacitor.config.json's
// packageClassList (community/npm plugins); a plugin bundled directly in
// the app target -- StoreKitPlugin.swift, AuthPlugin.swift -- has to be
// registered explicitly here. SceneDelegate instantiates this instead of
// the stock CAPBridgeViewController.
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StoreKitPlugin())
        bridge?.registerPluginInstance(AuthPlugin())

        // Kill iOS's rubber-band drag on the whole-page scroll view. isScrollEnabled
        // is deliberately left untouched -- it's shared by every route in this
        // single-page app, and Community/Profile/etc. still need it to scroll their
        // own content via the overflow-y-auto container in App.jsx. Only bounce is
        // disabled here; per-screen overflow (e.g. Discover) is handled in CSS.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
    }
}
