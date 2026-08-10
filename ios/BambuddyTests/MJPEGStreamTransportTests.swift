import UIKit
import XCTest
@testable import Bambuddy

final class CameraURLProtocol: URLProtocol {
  struct Stub {
    let response: HTTPURLResponse
    let chunks: [Data]
    let delay: TimeInterval
    let redirectRequest: URLRequest?
  }

  static let lock = NSLock()
  static var handler: ((URLRequest) throws -> Stub)?
  static var activeRequests = 0
  static var maximumActiveRequests = 0

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.lock.lock()
    Self.activeRequests += 1
    Self.maximumActiveRequests = max(Self.maximumActiveRequests, Self.activeRequests)
    let handler = Self.handler
    Self.lock.unlock()

    do {
      guard let stub = try handler?(request) else {
        throw URLError(.resourceUnavailable)
      }
      if let redirectRequest = stub.redirectRequest {
        client?.urlProtocol(self, wasRedirectedTo: redirectRequest, redirectResponse: stub.response)
        Self.finishRequest()
        return
      }
      client?.urlProtocol(self, didReceive: stub.response, cacheStoragePolicy: .notAllowed)
      let send = {
        for chunk in stub.chunks {
          self.client?.urlProtocol(self, didLoad: chunk)
        }
        self.client?.urlProtocolDidFinishLoading(self)
        Self.finishRequest()
      }
      if stub.delay > 0 {
        DispatchQueue.global().asyncAfter(deadline: .now() + stub.delay, execute: send)
      } else {
        send()
      }
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
      Self.finishRequest()
    }
  }

  override func stopLoading() {
    Self.finishRequest()
  }

  static func reset() {
    lock.lock()
    handler = nil
    activeRequests = 0
    maximumActiveRequests = 0
    lock.unlock()
  }

  private static func finishRequest() {
    lock.lock()
    activeRequests = max(0, activeRequests - 1)
    lock.unlock()
  }
}

final class MJPEGStreamTransportTests: XCTestCase {
  private let snapshotURL = URL(string: "http://camera.test/snapshot?auth=private-value")!
  private let streamURL = URL(string: "http://camera.test/stream?auth=private-value&fps=5")!

  override func setUp() {
    super.setUp()
    CameraURLProtocol.reset()
  }

  override func tearDown() {
    CameraURLProtocol.reset()
    super.tearDown()
  }

  func testEphemeralConfigurationDisablesPersistentStores() {
    let configuration = MJPEGStreamTransport.makeEphemeralConfiguration()

    XCTAssertNil(configuration.httpCookieStorage)
    XCTAssertNil(configuration.urlCredentialStorage)
    XCTAssertNil(configuration.urlCache)
    XCTAssertFalse(configuration.httpShouldSetCookies)
    XCTAssertEqual(configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
  }

  func testStreamURLCapsFPSWithoutDroppingQueryItems() {
    let url = URL(string: "http://camera.test/stream?auth=opaque%2Bvalue&cache=123&fps=30")!

    let capped = MJPEGStreamTransport.cappedStreamURL(url)
    let items = URLComponents(url: capped, resolvingAgainstBaseURL: false)?.queryItems

    XCTAssertEqual(items?.first(where: { $0.name == "auth" })?.value, "opaque+value")
    XCTAssertEqual(items?.first(where: { $0.name == "cache" })?.value, "123")
    XCTAssertEqual(items?.first(where: { $0.name == "fps" })?.value, "5")
  }

  func testRedirectAllowlist() {
    XCTAssertTrue(MJPEGStreamTransport.isRedirectAllowed(
      from: URL(string: "http://camera.test/a")!,
      to: URL(string: "http://camera.test/b")!
    ))
    XCTAssertTrue(MJPEGStreamTransport.isRedirectAllowed(
      from: URL(string: "http://camera.test/a")!,
      to: URL(string: "https://camera.test/b")!
    ))
    XCTAssertFalse(MJPEGStreamTransport.isRedirectAllowed(
      from: URL(string: "https://camera.test/a")!,
      to: URL(string: "http://camera.test/b")!
    ))
    XCTAssertFalse(MJPEGStreamTransport.isRedirectAllowed(
      from: URL(string: "http://camera.test/a")!,
      to: URL(string: "http://other.test/b")!
    ))
  }

  func testCustomProtocolSameOriginRedirectAndCrossHostRejection() {
    let jpeg = makeJPEG()
    let followed = expectation(description: "same-origin redirect followed")
    CameraURLProtocol.handler = { request in
      if request.url?.path == "/snapshot" {
        return self.redirectStub(
          from: request.url!,
          to: URL(string: "http://camera.test/redirected-snapshot")!
        )
      }
      if request.url?.path == "/redirected-snapshot" {
        followed.fulfill()
        return self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [jpeg])
      }
      return self.stub(
        url: request.url!,
        status: 200,
        mime: "multipart/x-mixed-replace; boundary=cam",
        chunks: [self.multipart(jpeg: jpeg, boundary: "cam")]
      )
    }
    var allowedTransport: MJPEGStreamTransport? = makeTransport { _ in }
    allowedTransport?.start()
    wait(for: [followed], timeout: 1)
    allowedTransport?.cancel()
    allowedTransport = nil

    CameraURLProtocol.reset()
    CameraURLProtocol.handler = { request in
      self.redirectStub(
        from: request.url!,
        to: URL(string: "http://other.test/snapshot")!
      )
    }
    let blocked = expectation(description: "cross-host redirect blocked")
    let blockedTransport = makeTransport { event in
      if event["errorCode"] as? String == "redirect_blocked" {
        XCTAssertEqual(event["phase"] as? String, "redirect")
        XCTAssertEqual(event["redirectCount"] as? Int, 1)
        blocked.fulfill()
      }
    }
    blockedTransport.start()
    wait(for: [blocked], timeout: 1)
    blockedTransport.cancel()
  }

  func testSnapshotPreflightThenMultipartFirstFrameHasSanitizedPayload() {
    let jpeg = makeJPEG()
    CameraURLProtocol.handler = { [snapshotURL, streamURL] request in
      if request.url?.path == snapshotURL.path {
        return self.stub(url: request.url!, status: 200, mime: "image/jpeg; charset=binary", chunks: [jpeg])
      }
      XCTAssertEqual(request.url?.path, streamURL.path)
      let body = self.multipart(jpeg: jpeg, boundary: "cam")
      return self.stub(
        url: request.url!,
        status: 200,
        mime: "multipart/x-mixed-replace; boundary=\"cam\"",
        chunks: body.map { Data([$0]) }
      )
    }
    let firstFrame = expectation(description: "first frame")
    var captured: [String: Any]?
    let transport = makeTransport { event in
      if event["type"] as? String == "first-frame",
         event["mode"] as? String == "native-mjpeg" {
        captured = event
        firstFrame.fulfill()
      }
    }

    transport.start()
    wait(for: [firstFrame], timeout: 2)
    transport.cancel()

    XCTAssertEqual(captured?["attemptId"] as? String, "attempt-safe")
    XCTAssertEqual(captured?["mode"] as? String, "native-mjpeg")
    XCTAssertEqual(captured?["phase"] as? String, "decode")
    XCTAssertEqual(captured?["firstBytesSignature"] as? String, "multipart-boundary")
    XCTAssertNotNil(captured?["bytesReceived"])
    XCTAssertNotNil(captured?["width"])
    XCTAssertNil(captured?["url"])
    XCTAssertNil(captured?["token"])
    XCTAssertFalse(String(describing: captured).contains("private-value"))
  }

  func testHTTPStatusTaxonomy() {
    for (status, expected) in [
      (401, "http_401"),
      (403, "http_403"),
      (404, "http_404"),
      (503, "http_5xx"),
      (418, "http_other"),
    ] {
      CameraURLProtocol.reset()
      CameraURLProtocol.handler = { request in
        self.stub(url: request.url!, status: status, mime: "text/plain", chunks: [])
      }
      let failed = expectation(description: "status \(status)")
      let transport = makeTransport { event in
        if event["errorCode"] as? String == expected {
          XCTAssertEqual(event["httpStatus"] as? Int, status)
          XCTAssertEqual(event["mode"] as? String, "snapshot-preflight")
          XCTAssertNil(event["url"])
          failed.fulfill()
        }
      }
      transport.start()
      wait(for: [failed], timeout: 1)
      transport.cancel()
    }
  }

  func testStreamAuthenticationFailureDoesNotEnterFallback() {
    let jpeg = makeJPEG()
    CameraURLProtocol.handler = { request in
      if request.url?.path == self.snapshotURL.path {
        return self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [jpeg])
      }
      return self.stub(url: request.url!, status: 401, mime: "application/json", chunks: [])
    }
    let unauthorized = expectation(description: "stream unauthorized")
    let fallback = expectation(description: "fallback must not start")
    fallback.isInverted = true
    let transport = makeTransport(fallbackMs: 20) { event in
      if event["errorCode"] as? String == "http_401",
         event["mode"] as? String == "native-mjpeg" {
        unauthorized.fulfill()
      }
      if event["mode"] as? String == "snapshot-fallback" {
        fallback.fulfill()
      }
    }

    transport.start()
    wait(for: [unauthorized, fallback], timeout: 0.3)
    transport.cancel()
  }

  func testInvalidSnapshotMIMEAndMissingStreamBoundary() {
    CameraURLProtocol.handler = { request in
      self.stub(url: request.url!, status: 200, mime: "text/html", chunks: [Data("<html>".utf8)])
    }
    let invalidMIME = expectation(description: "invalid MIME")
    var firstTransport: MJPEGStreamTransport? = makeTransport { event in
      if event["errorCode"] as? String == "mime_invalid" {
        invalidMIME.fulfill()
      }
    }
    firstTransport?.start()
    wait(for: [invalidMIME], timeout: 1)
    firstTransport?.cancel()
    firstTransport = nil

    let jpeg = makeJPEG()
    CameraURLProtocol.reset()
    CameraURLProtocol.handler = { request in
      if request.url?.path == self.snapshotURL.path {
        return self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [jpeg])
      }
      return self.stub(url: request.url!, status: 200, mime: "multipart/x-mixed-replace", chunks: [])
    }
    let missingBoundary = expectation(description: "missing boundary")
    let secondTransport = makeTransport { event in
      if event["errorCode"] as? String == "boundary_missing" {
        missingBoundary.fulfill()
      }
    }
    secondTransport.start()
    wait(for: [missingBoundary], timeout: 1)
    secondTransport.cancel()
  }

  func testMalformedStreamFallsBackWithoutOverlappingSnapshots() {
    let jpeg = makeJPEG()
    let fallbackFrames = expectation(description: "fallback frames")
    fallbackFrames.expectedFulfillmentCount = 2
    CameraURLProtocol.handler = { request in
      if request.url?.path == self.streamURL.path {
        let invalid = Data("--cam\r\nContent-Type: image/jpeg\r\nContent-Length: 4\r\n\r\nnope\r\n".utf8)
        return self.stub(
          url: request.url!,
          status: 200,
          mime: "multipart/x-mixed-replace; boundary=cam",
          chunks: [invalid]
        )
      }
      return self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [jpeg], delay: 0.03)
    }
    let transport = makeTransport(fallbackMs: 20) { event in
      if event["type"] as? String == "first-frame",
         event["mode"] as? String == "snapshot-fallback" {
        fallbackFrames.fulfill()
      }
    }

    transport.start()
    wait(for: [fallbackFrames], timeout: 2)
    transport.cancel()

    XCTAssertEqual(CameraURLProtocol.maximumActiveRequests, 1)
  }

  func testCancellationEmitsOnlySanitizedCancellation() {
    CameraURLProtocol.handler = { request in
      self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [], delay: 1)
    }
    let cancelled = expectation(description: "cancelled")
    let transport = makeTransport { event in
      if event["errorCode"] as? String == "cancelled" {
        XCTAssertEqual(event["type"] as? String, "failure")
        XCTAssertNil(event["url"])
        XCTAssertNil(event["headers"])
        XCTAssertNil(event["body"])
        cancelled.fulfill()
      }
    }

    transport.start()
    transport.cancel()
    wait(for: [cancelled], timeout: 1)
  }

  private func makeTransport(
    fallbackMs: Double = 2_000,
    eventHandler: @escaping MJPEGStreamTransport.EventHandler
  ) -> MJPEGStreamTransport {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [CameraURLProtocol.self]
    return MJPEGStreamTransport(
      streamURL: streamURL,
      snapshotURL: snapshotURL,
      attemptID: "attempt-safe",
      snapshotFallbackIntervalMs: fallbackMs,
      firstFrameTimeoutMs: 500,
      configuration: configuration,
      eventHandler: eventHandler,
      imageHandler: { _ in }
    )
  }

  private func stub(
    url: URL,
    status: Int,
    mime: String,
    chunks: [Data],
    delay: TimeInterval = 0
  ) -> CameraURLProtocol.Stub {
    CameraURLProtocol.Stub(
      response: HTTPURLResponse(
        url: url,
        statusCode: status,
        httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": mime]
      )!,
      chunks: chunks,
      delay: delay,
      redirectRequest: nil
    )
  }

  private func redirectStub(from: URL, to: URL) -> CameraURLProtocol.Stub {
    CameraURLProtocol.Stub(
      response: HTTPURLResponse(
        url: from,
        statusCode: 302,
        httpVersion: "HTTP/1.1",
        headerFields: ["Location": "/redacted"]
      )!,
      chunks: [],
      delay: 0,
      redirectRequest: URLRequest(url: to)
    )
  }

  private func multipart(jpeg: Data, boundary: String) -> Data {
    var result = Data("--\(boundary)\r\nContent-Type: image/jpeg\r\nContent-Length: \(jpeg.count)\r\n\r\n".utf8)
    result.append(jpeg)
    result.append(Data("\r\n--\(boundary)--\r\n".utf8))
    return result
  }

  private func makeJPEG() -> Data {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2))
    let image = renderer.image { context in
      UIColor.green.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    }
    return image.jpegData(compressionQuality: 0.8)!
  }
}
