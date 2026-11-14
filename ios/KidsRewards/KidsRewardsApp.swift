import SwiftUI
import WebKit

// Full-screen shell around the production site, like the Android TWA in ../android.
// Screens and data all come from the server; rebuild only if the address, icon or name changes.
let homeURL = URL(string: "https://ahmeds-macbook-pro.tail712747.ts.net/")!
let homeHost = homeURL.host!

@main
struct KidsRewardsApp: App {
    var body: some Scene {
        WindowGroup {
            WebShell()
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Color(red: 0.06, green: 0.09, blue: 0.16))
        }
    }
}

struct WebShell: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()   // keeps the login (localStorage) between launches
        config.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.isOpaque = false
        web.backgroundColor = .clear
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.reload(_:)), for: .valueChanged)
        web.scrollView.refreshControl = refresh
        context.coordinator.web = web
        web.load(URLRequest(url: homeURL))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var web: WKWebView?

        @objc func reload(_ sender: UIRefreshControl) {
            web?.reload()
            sender.endRefreshing()
        }

        // Links to other sites open in Safari; the app itself stays on the production host.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = action.request.url, let host = url.host, host != homeHost,
               ["http", "https"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        // target=_blank links
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url { UIApplication.shared.open(url) }
            return nil
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showOffline(webView)
        }

        private func showOffline(_ webView: WKWebView) {
            let html = """
            <meta name=viewport content="width=device-width,initial-scale=1">
            <body style="font-family:-apple-system;background:#0f172a;color:#e2e8f0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:90vh;text-align:center">
            <h2>Can't reach Kids Rewards</h2><p>Check the internet connection, or that the home Mac is on.</p>
            <a href="\(homeURL.absoluteString)" style="color:#60a5fa;font-size:1.2em">Try again</a></body>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}
