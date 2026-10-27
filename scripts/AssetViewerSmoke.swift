import AppKit
import WebKit

struct PreviewCase: Decodable {
    let name: String
    let html: String
    let check: String
}

final class Smoke: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let cases: [PreviewCase]
    var index = 0
    var checking = false
    var failures = 0
    var timer: Timer?
    var web: WKWebView!
    var window: NSWindow!

    init(cases: [PreviewCase]) { self.cases = cases }

    func run() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "preview")
        config.userContentController.addUserScript(WKUserScript(
            source: "window.ReactNativeWebView={postMessage:s=>window.webkit.messageHandlers.preview.postMessage(s)};console.error=(...args)=>window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug',message:args.join(' ')}));console.warn=console.error;console.log=console.error;window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);window.cancelAnimationFrame=id=>clearTimeout(id);",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700), configuration: config)
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: -2000, y: -2000, width: 900, height: 700), styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = web
        window.orderFront(nil)
        next()
    }

    func next() {
        timer?.invalidate()
        guard index < cases.count else { exit(failures == 0 ? 0 : 1) }
        checking = false
        let test = cases[index]
        print("RUN \(test.name)")
        fflush(stdout)
        timer = Timer.scheduledTimer(withTimeInterval: 100, repeats: false) { _ in
            self.web.evaluateJavaScript("document.getElementById('status').textContent") { value, _ in
                self.finish(false, "viewer timed out: \(String(describing: value))")
            }
        }
        web.loadHTMLString(test.html, baseURL: URL(string: "https://localhost/"))
    }

    func finish(_ success: Bool, _ detail: String) {
        if !success { failures += 1 }
        print("\(success ? "PASS" : "FAIL") \(cases[index].name): \(detail)")
        fflush(stdout)
        index += 1
        next()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else { return }
        if type == "error" {
            if !checking { finish(false, object["message"] as? String ?? "render error") }
            return
        }
        if type == "debug" { print("DEBUG \(String(describing: object["message"]))"); fflush(stdout); return }
        guard type == "ready", !checking else { return }
        checking = true
        web.callAsyncJavaScript(cases[index].check, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): self.finish(true, String(describing: value))
            case .failure(let error): self.finish(false, "\(error.localizedDescription) \((error as NSError).userInfo)")
            }
        }
    }
}

let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let tests = try JSONDecoder().decode([PreviewCase].self, from: data)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let smoke = Smoke(cases: tests)
smoke.run()
app.run()
