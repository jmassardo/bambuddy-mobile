import UIKit
import XCTest
@testable import Bambuddy

final class CameraURLProtocol: URLProtocol {
  struct Stub {
    let response: HTTPURLResponse
    let chunks: [Data]
    let delay: TimeInterval
    let redirectRequest: URLRequest?
    var holdOpen = false
  }

  static let lock = NSLock()
  static var handler: ((URLRequest) throws -> Stub)?
  static var activeRequests = 0
  static var maximumActiveRequests = 0
  static var heldProtocol: CameraURLProtocol?
  static var onHold: (() -> Void)?

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
        if stub.holdOpen {
          Self.lock.lock()
          Self.heldProtocol = self
          let onHold = Self.onHold
          Self.lock.unlock()
          onHold?()
          return
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
    heldProtocol = nil
    onHold = nil
    lock.unlock()
  }

  static func sendHeld(_ data: Data) {
    lock.lock()
    let protocolInstance = heldProtocol
    lock.unlock()
    guard let protocolInstance else { return }
    protocolInstance.client?.urlProtocol(protocolInstance, didLoad: data)
  }

  private static func finishRequest() {
    lock.lock()
    activeRequests = max(0, activeRequests - 1)
    lock.unlock()
  }
}

private final class ControlledClock {
  var now: TimeInterval

  init(now: TimeInterval) {
    self.now = now
  }
}

private final class ControlledScheduler {
  private let lock = NSLock()
  private var jobs: [(delay: TimeInterval, action: () -> Void)] = []

  func schedule(after delay: TimeInterval, action: @escaping () -> Void) {
    lock.lock()
    jobs.append((delay, action))
    lock.unlock()
  }

  var delays: [TimeInterval] {
    lock.lock()
    defer { lock.unlock() }
    return jobs.map(\.delay)
  }

  var count: Int {
    lock.lock()
    defer { lock.unlock() }
    return jobs.count
  }

  func runNext() {
    lock.lock()
    let action = jobs.isEmpty ? nil : jobs.removeFirst().action
    lock.unlock()
    action?()
  }
}

final class CameraChallengeSender: NSObject, URLAuthenticationChallengeSender {
  func use(_ credential: URLCredential, for challenge: URLAuthenticationChallenge) {}
  func continueWithoutCredential(for challenge: URLAuthenticationChallenge) {}
  func cancel(_ challenge: URLAuthenticationChallenge) {}
  func performDefaultHandling(for challenge: URLAuthenticationChallenge) {}
  func rejectProtectionSpaceAndContinue(with challenge: URLAuthenticationChallenge) {}
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

  func testURLErrorTaxonomyIsFixedForATSLocalNetworkTLSDNSTimeoutAndCancellation() {
    let cases: [(Int, CameraTransportError)] = [
      (NSURLErrorAppTransportSecurityRequiresSecureConnection, .atsBlocked),
      (NSURLErrorCannotConnectToHost, .localNetworkDeniedOrUnreachable),
      (NSURLErrorDataNotAllowed, .localNetworkDeniedOrUnreachable),
      (NSURLErrorSecureConnectionFailed, .tlsFailed),
      (NSURLErrorServerCertificateUntrusted, .tlsFailed),
      (NSURLErrorCannotFindHost, .dnsFailed),
      (NSURLErrorDNSLookupFailed, .dnsFailed),
      (NSURLErrorTimedOut, .timeout),
      (NSURLErrorCancelled, .cancelled),
    ]

    for (code, expected) in cases {
      XCTAssertEqual(
        MJPEGStreamTransport.transportError(
          for: NSError(domain: NSURLErrorDomain, code: code)
        ),
        expected
      )
    }
  }

  func testURLFailuresUseExactAllowedKeysAndNeverExposeRequestSecrets() {
    let cases: [(Int, String)] = [
      (NSURLErrorAppTransportSecurityRequiresSecureConnection, "ats_blocked"),
      (NSURLErrorCannotConnectToHost, "local_network_denied_or_unreachable"),
      (NSURLErrorSecureConnectionFailed, "tls_failed"),
      (NSURLErrorCannotFindHost, "dns_failed"),
      (NSURLErrorTimedOut, "timeout"),
    ]

    for (code, expected) in cases {
      CameraURLProtocol.reset()
      CameraURLProtocol.handler = { _ in
        throw NSError(domain: NSURLErrorDomain, code: code)
      }
      let failed = expectation(description: expected)
      let transport = makeTransport { event in
        guard event["errorCode"] as? String == expected else { return }
        self.assertExactKeys(
          event,
          [
            "type", "attemptId", "mode", "phase", "elapsedMs", "bytesReceived",
            "firstBytesSignature", "nsUrlErrorCode", "errorCode",
          ]
        )
        XCTAssertEqual(event["nsUrlErrorCode"] as? Int, code)
        self.assertRedacted(event)
        failed.fulfill()
      }

      transport.start()
      wait(for: [failed], timeout: 1)
      transport.cancel()
    }
  }

  func testRapidTransportFramesUseOneSlotAndHardDecodeCadence() {
    let jpeg = makeJPEG()
    let streamHeld = expectation(description: "stream held for controlled input")
    CameraURLProtocol.onHold = { streamHeld.fulfill() }
    CameraURLProtocol.handler = { request in
      if request.url?.path == self.snapshotURL.path {
        return self.stub(
          url: request.url!,
          status: 200,
          mime: "image/jpeg",
          chunks: [jpeg]
        )
      }
      var held = self.stub(
        url: request.url!,
        status: 200,
        mime: "multipart/x-mixed-replace; boundary=cam",
        chunks: []
      )
      held.holdOpen = true
      return held
    }

    let clock = ControlledClock(now: 10)
    let cadenceScheduler = ControlledScheduler()
    let deliveryScheduler = ControlledScheduler()
    let streamDecoded = expectation(description: "first stream frame decoded")
    let cadenceDecoded = expectation(description: "cadenced stream frame decoded")
    let countLock = NSLock()
    var decodeTimes: [TimeInterval] = []
    var deliveries = 0
    let transport = makeTransport(
      clock: { clock.now },
      scheduler: cadenceScheduler.schedule,
      deliveryScheduler: { deliveryScheduler.schedule(after: 0, action: $0) },
      frameDecoder: { data in
        countLock.lock()
        decodeTimes.append(clock.now)
        let count = decodeTimes.count
        countLock.unlock()
        if count == 2 { streamDecoded.fulfill() }
        if count == 3 { cadenceDecoded.fulfill() }
        return UIImage(data: data)
      },
      imageHandler: { _ in deliveries += 1 }
    ) { _ in }

    transport.start()
    wait(for: [streamHeld], timeout: 1)
    XCTAssertEqual(deliveryScheduler.count, 1)
    deliveryScheduler.runNext()
    XCTAssertEqual(deliveries, 1)

    XCTAssertTrue(
      sendHeldFrames(
        jpeg: jpeg,
        boundary: "cam",
        count: 20,
        transport: transport,
        startingOfferCount: 1
      )
    )
    XCTAssertEqual(transport.retainedIncomingFrameCountForTesting, 1)
    XCTAssertEqual(transport.maximumRetainedIncomingFrameCountForTesting, 1)
    XCTAssertEqual(deliveryScheduler.count, 0)
    XCTAssertEqual(decodeTimes, [10])
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })
    XCTAssertEqual(cadenceScheduler.delays.first!, 0.2, accuracy: 0.000_001)

    clock.now = 10.201
    cadenceScheduler.runNext()
    wait(for: [streamDecoded], timeout: 1)
    XCTAssertEqual(decodeTimes, [10, 10.201])
    XCTAssertEqual(deliveryScheduler.count, 1)
    deliveryScheduler.runNext()
    XCTAssertEqual(deliveries, 2)

    clock.now = 10.25
    XCTAssertTrue(
      sendHeldFrames(
        jpeg: jpeg,
        boundary: "cam",
        count: 10,
        transport: transport,
        startingOfferCount: 21
      )
    )
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })
    XCTAssertEqual(cadenceScheduler.delays.first!, 0.151, accuracy: 0.000_001)

    clock.now = 10.39
    cadenceScheduler.runNext()
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })
    XCTAssertEqual(decodeTimes.count, 2)
    XCTAssertEqual(cadenceScheduler.delays.first!, 0.011, accuracy: 0.000_001)

    clock.now = 10.402
    cadenceScheduler.runNext()
    wait(for: [cadenceDecoded], timeout: 1)
    XCTAssertEqual(decodeTimes, [10, 10.201, 10.402])
    XCTAssertGreaterThanOrEqual(decodeTimes[1] - decodeTimes[0], 0.2)
    XCTAssertGreaterThanOrEqual(decodeTimes[2] - decodeTimes[1], 0.2)
    XCTAssertEqual(transport.maximumRetainedIncomingFrameCountForTesting, 1)
    transport.cancel()
  }

  func testSnapshotFallbackSharesTransportWideDecodeCadence() {
    let jpeg = makeJPEG()
    CameraURLProtocol.handler = { request in
      if request.url?.path == self.streamURL.path {
        return self.stub(
          url: request.url!,
          status: 200,
          mime: "multipart/x-mixed-replace; boundary=cam",
          chunks: []
        )
      }
      return self.stub(
        url: request.url!,
        status: 200,
        mime: "image/jpeg",
        chunks: [jpeg]
      )
    }

    let clock = ControlledClock(now: 40)
    let cadenceScheduler = ControlledScheduler()
    let deliveryScheduler = ControlledScheduler()
    let fallbackResponse = expectation(description: "fallback snapshot response")
    fallbackResponse.assertForOverFulfill = false
    let fallbackFrame = expectation(description: "cadenced fallback frame")
    let decodeLock = NSLock()
    var decodeTimes: [TimeInterval] = []
    let transport = makeTransport(
      fallbackMs: 20,
      clock: { clock.now },
      scheduler: cadenceScheduler.schedule,
      deliveryScheduler: { deliveryScheduler.schedule(after: 0, action: $0) },
      frameDecoder: { data in
        decodeLock.lock()
        decodeTimes.append(clock.now)
        decodeLock.unlock()
        return UIImage(data: data)
      }
    ) { event in
      if event["type"] as? String == "response",
         event["mode"] as? String == "snapshot-fallback",
         event["phase"] as? String == "response" {
        fallbackResponse.fulfill()
      }
      if event["type"] as? String == "first-frame",
         event["mode"] as? String == "snapshot-fallback" {
        fallbackFrame.fulfill()
      }
    }

    transport.start()
    XCTAssertTrue(waitUntil { deliveryScheduler.count == 1 })
    deliveryScheduler.runNext()
    wait(for: [fallbackResponse], timeout: 1)
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })

    decodeLock.lock()
    XCTAssertEqual(decodeTimes, [40])
    decodeLock.unlock()
    XCTAssertEqual(cadenceScheduler.delays.first!, 0.2, accuracy: 0.000_001)

    clock.now = 40.1
    cadenceScheduler.runNext()
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })
    XCTAssertEqual(cadenceScheduler.delays.first!, 0.1, accuracy: 0.000_001)

    clock.now = 40.201
    cadenceScheduler.runNext()
    wait(for: [fallbackFrame], timeout: 1)

    decodeLock.lock()
    XCTAssertEqual(decodeTimes, [40, 40.201])
    XCTAssertGreaterThanOrEqual(decodeTimes[1] - decodeTimes[0], 0.2)
    decodeLock.unlock()
    transport.cancel()
  }

  func testCustomProtocolSameOriginRedirectAndCrossHostRejection() {
    let jpeg = makeJPEG()
    let followed = expectation(description: "same-origin redirect followed")
    let followedLock = NSLock()
    var observedRedirect = false
    CameraURLProtocol.handler = { request in
      if request.url?.path == "/snapshot" {
        return self.redirectStub(
          from: request.url!,
          to: URL(string: "http://camera.test/redirected-snapshot")!
        )
      }
      if request.url?.path == "/redirected-snapshot" {
        followedLock.lock()
        if !observedRedirect {
          observedRedirect = true
          followed.fulfill()
        }
        followedLock.unlock()
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
        self.assertExactKeys(
          event,
          ["type", "attemptId", "mode", "phase", "elapsedMs", "redirectCount", "errorCode"]
        )
        XCTAssertEqual(event["phase"] as? String, "redirect")
        XCTAssertEqual(event["redirectCount"] as? Int, 1)
        self.assertRedacted(event)
        blocked.fulfill()
      }
    }
    blockedTransport.start()
    wait(for: [blocked], timeout: 1)
    blockedTransport.cancel()
  }

  func testRedirectLimitRejectsFourthRedirectWithExactSanitizedPayload() {
    CameraURLProtocol.handler = { request in
      let index = Int(request.url?.lastPathComponent ?? "") ?? 0
      return self.redirectStub(
        from: request.url!,
        to: URL(string: "http://camera.test/\(index + 1)")!
      )
    }
    let limited = expectation(description: "fourth redirect rejected")
    let transport = makeTransport(
      snapshotURL: URL(string: "http://camera.test/0?auth=private-value")!
    ) { event in
      guard event["errorCode"] as? String == "redirect_limit" else { return }
      self.assertExactKeys(
        event,
        ["type", "attemptId", "mode", "phase", "elapsedMs", "redirectCount", "errorCode"]
      )
      XCTAssertEqual(event["redirectCount"] as? Int, 4)
      self.assertRedacted(event)
      limited.fulfill()
    }

    transport.start()
    wait(for: [limited], timeout: 1)
    transport.cancel()
  }

  func testCredentialChallengeIsRejectedWithoutCredential() {
    let transport = makeTransport { _ in }
    let protectionSpace = URLProtectionSpace(
      host: "camera.test",
      port: 80,
      protocol: "http",
      realm: "camera",
      authenticationMethod: NSURLAuthenticationMethodHTTPBasic
    )
    let challenge = URLAuthenticationChallenge(
      protectionSpace: protectionSpace,
      proposedCredential: nil,
      previousFailureCount: 0,
      failureResponse: nil,
      error: nil,
      sender: CameraChallengeSender()
    )
    let task = URLSession.shared.dataTask(with: snapshotURL)
    var disposition: URLSession.AuthChallengeDisposition?
    var credential: URLCredential?

    transport.urlSession(URLSession.shared, task: task, didReceive: challenge) {
      disposition = $0
      credential = $1
    }

    XCTAssertEqual(disposition, .rejectProtectionSpace)
    XCTAssertNil(credential)
  }

  func testSnapshotPreflightThenMultipartFirstFrameHasSanitizedPayload() {
    let jpeg = makeJPEG()
    CameraURLProtocol.handler = { [snapshotURL, streamURL] request in
      if request.url?.path == snapshotURL.path {
        return self.stub(url: request.url!, status: 200, mime: "image/jpeg; charset=binary", chunks: [jpeg])
      }
      XCTAssertEqual(request.url?.path, streamURL.path)
      let body = self.multipart(jpeg: jpeg, boundary: "cam")
      var held = self.stub(
        url: request.url!,
        status: 200,
        mime: "multipart/x-mixed-replace; boundary=\"cam\"",
        chunks: body.map { Data([$0]) }
      )
      held.holdOpen = true
      return held
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
          self.assertExactKeys(
            event,
            [
              "type", "attemptId", "mode", "phase", "elapsedMs", "httpStatus",
              "mimeType", "redirectCount", "errorCode",
            ]
          )
          XCTAssertEqual(event["httpStatus"] as? Int, status)
          XCTAssertEqual(event["mode"] as? String, "snapshot-preflight")
          self.assertRedacted(event)
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
        self.assertExactKeys(
          event,
          [
            "type", "attemptId", "mode", "phase", "elapsedMs", "httpStatus",
            "mimeType", "redirectCount", "errorCode",
          ]
        )
        self.assertRedacted(event)
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
        self.assertExactKeys(
          event,
          [
            "type", "attemptId", "mode", "phase", "elapsedMs", "httpStatus",
            "mimeType", "redirectCount", "errorCode",
          ]
        )
        self.assertRedacted(event)
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

  func testStreamEndedEmitsSanitizedFailureAndEntersFallback() {
    let jpeg = makeJPEG()
    CameraURLProtocol.handler = { request in
      if request.url?.path == self.streamURL.path {
        return self.stub(
          url: request.url!,
          status: 200,
          mime: "multipart/x-mixed-replace; boundary=cam",
          chunks: []
        )
      }
      return self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [jpeg])
    }
    let ended = expectation(description: "stream ended")
    let fallback = expectation(description: "stream ended fallback")
    let transport = makeTransport(fallbackMs: 20) { event in
      if event["errorCode"] as? String == "stream_ended" {
        self.assertExactKeys(
          event,
          [
            "type", "attemptId", "mode", "phase", "elapsedMs", "bytesReceived",
            "firstBytesSignature", "errorCode",
          ]
        )
        self.assertRedacted(event)
        ended.fulfill()
      }
      if event["type"] as? String == "first-frame",
         event["mode"] as? String == "snapshot-fallback" {
        fallback.fulfill()
      }
    }

    transport.start()
    wait(for: [ended, fallback], timeout: 1)
    transport.cancel()
  }

  func testCancellationEmitsOnlySanitizedCancellation() {
    CameraURLProtocol.handler = { request in
      self.stub(url: request.url!, status: 200, mime: "image/jpeg", chunks: [], delay: 1)
    }
    let cancelled = expectation(description: "cancelled")
    let transport = makeTransport { event in
      if event["errorCode"] as? String == "cancelled" {
        self.assertExactKeys(
          event,
          ["type", "attemptId", "mode", "phase", "elapsedMs", "errorCode"]
        )
        self.assertRedacted(event)
        cancelled.fulfill()
      }
    }

    transport.start()
    transport.cancel()
    wait(for: [cancelled], timeout: 1)
  }

  func testCancelledTransportCannotDeliverPendingImageAfterReplacement() {
    let jpeg = makeJPEG()
    let oldStreamHeld = expectation(description: "old stream held")
    CameraURLProtocol.onHold = { oldStreamHeld.fulfill() }
    CameraURLProtocol.handler = heldStreamHandler(jpeg: jpeg)
    let oldDeliveries = ControlledScheduler()
    var staleDeliveryCount = 0
    let oldTransport = makeTransport(
      deliveryScheduler: { oldDeliveries.schedule(after: 0, action: $0) },
      imageHandler: { _ in staleDeliveryCount += 1 }
    ) { _ in }

    oldTransport.start()
    wait(for: [oldStreamHeld], timeout: 1)
    oldDeliveries.runNext()
    XCTAssertEqual(staleDeliveryCount, 1)
    CameraURLProtocol.sendHeld(multipartFrames(jpeg: jpeg, boundary: "cam", count: 1))
    XCTAssertTrue(waitUntil { oldDeliveries.count == 1 })

    oldTransport.cancel()
    XCTAssertEqual(oldTransport.retainedIncomingFrameCountForTesting, 0)

    let replacementStreamHeld = expectation(description: "replacement stream held")
    CameraURLProtocol.onHold = { replacementStreamHeld.fulfill() }
    CameraURLProtocol.handler = heldStreamHandler(jpeg: jpeg)
    let replacementDeliveries = ControlledScheduler()
    var replacementDeliveryCount = 0
    let replacementTransport = makeTransport(
      deliveryScheduler: { replacementDeliveries.schedule(after: 0, action: $0) },
      imageHandler: { _ in replacementDeliveryCount += 1 }
    ) { _ in }
    replacementTransport.start()
    wait(for: [replacementStreamHeld], timeout: 1)
    replacementDeliveries.runNext()
    XCTAssertEqual(replacementDeliveryCount, 1)

    oldDeliveries.runNext()
    XCTAssertEqual(staleDeliveryCount, 1)
    XCTAssertEqual(replacementDeliveryCount, 1)
    replacementTransport.cancel()
  }

  func testCancellationInvalidatesPendingCadencedDecodeSynchronously() {
    let jpeg = makeJPEG()
    let streamHeld = expectation(description: "stream held")
    CameraURLProtocol.onHold = { streamHeld.fulfill() }
    CameraURLProtocol.handler = heldStreamHandler(jpeg: jpeg)
    let clock = ControlledClock(now: 20)
    let cadenceScheduler = ControlledScheduler()
    let deliveryScheduler = ControlledScheduler()
    let decodeLock = NSLock()
    var decodeCount = 0
    let transport = makeTransport(
      clock: { clock.now },
      scheduler: cadenceScheduler.schedule,
      deliveryScheduler: { deliveryScheduler.schedule(after: 0, action: $0) },
      frameDecoder: { data in
        decodeLock.lock()
        decodeCount += 1
        decodeLock.unlock()
        return UIImage(data: data)
      }
    ) { _ in }

    transport.start()
    wait(for: [streamHeld], timeout: 1)
    deliveryScheduler.runNext()
    CameraURLProtocol.sendHeld(multipartFrames(jpeg: jpeg, boundary: "cam", count: 1))
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })
    clock.now = 20.201
    cadenceScheduler.runNext()
    XCTAssertTrue(waitUntil {
      decodeLock.lock()
      defer { decodeLock.unlock() }
      return decodeCount == 2
    })
    deliveryScheduler.runNext()

    clock.now = 20.25
    CameraURLProtocol.sendHeld(multipartFrames(jpeg: jpeg, boundary: "cam", count: 1))
    XCTAssertTrue(waitUntil { cadenceScheduler.count == 1 })
    transport.cancel()
    XCTAssertEqual(transport.retainedIncomingFrameCountForTesting, 0)
    cadenceScheduler.runNext()
    RunLoop.current.run(until: Date().addingTimeInterval(0.02))

    decodeLock.lock()
    let finalDecodeCount = decodeCount
    decodeLock.unlock()
    XCTAssertEqual(finalDecodeCount, 2)
    XCTAssertEqual(deliveryScheduler.count, 0)
  }

  private func makeTransport(
    fallbackMs: Double = 2_000,
    snapshotURL: URL? = nil,
    clock: @escaping MJPEGStreamTransport.Clock = { ProcessInfo.processInfo.systemUptime },
    scheduler: @escaping MJPEGStreamTransport.Scheduler = { delay, action in
      DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: action)
    },
    deliveryScheduler: @escaping MJPEGStreamTransport.DeliveryScheduler = { action in
      DispatchQueue.main.async(execute: action)
    },
    frameDecoder: @escaping MJPEGStreamTransport.FrameDecoder = { UIImage(data: $0) },
    imageHandler: @escaping MJPEGStreamTransport.ImageHandler = { _ in },
    eventHandler: @escaping MJPEGStreamTransport.EventHandler
  ) -> MJPEGStreamTransport {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [CameraURLProtocol.self]
    return MJPEGStreamTransport(
      streamURL: streamURL,
      snapshotURL: snapshotURL ?? self.snapshotURL,
      attemptID: "attempt-safe",
      snapshotFallbackIntervalMs: fallbackMs,
      firstFrameTimeoutMs: 500,
      configuration: configuration,
      clock: clock,
      scheduler: scheduler,
      deliveryScheduler: deliveryScheduler,
      frameDecoder: frameDecoder,
      eventHandler: { event in
        if event["type"] as? String == "failure" {
          self.assertAllowedFailurePayload(event)
        }
        eventHandler(event)
      },
      imageHandler: imageHandler
    )
  }

  private func heldStreamHandler(jpeg: Data) -> (URLRequest) throws -> CameraURLProtocol.Stub {
    { request in
      if request.url?.path == self.snapshotURL.path {
        return self.stub(
          url: request.url!,
          status: 200,
          mime: "image/jpeg",
          chunks: [jpeg]
        )
      }
      var held = self.stub(
        url: request.url!,
        status: 200,
        mime: "multipart/x-mixed-replace; boundary=cam",
        chunks: []
      )
      held.holdOpen = true
      return held
    }
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

  private func multipartFrames(jpeg: Data, boundary: String, count: Int) -> Data {
    var result = Data()
    for _ in 0..<count {
      result.append(
        Data(
          "--\(boundary)\r\nContent-Type: image/jpeg\r\nContent-Length: \(jpeg.count)\r\n\r\n"
            .utf8
        )
      )
      result.append(jpeg)
      result.append(Data("\r\n".utf8))
    }
    result.append(Data("--\(boundary)--\r\n".utf8))
    return result
  }

  private func sendHeldFrames(
    jpeg: Data,
    boundary: String,
    count: Int,
    transport: MJPEGStreamTransport,
    startingOfferCount: Int
  ) -> Bool {
    for index in 1...count {
      CameraURLProtocol.sendHeld(multipartFrames(jpeg: jpeg, boundary: boundary, count: 1))
      guard waitUntil(condition: {
        transport.offeredIncomingFrameCountForTesting == startingOfferCount + index
      }) else {
        return false
      }
    }
    return true
  }

  private func waitUntil(
    timeout: TimeInterval = 1,
    condition: () -> Bool
  ) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if condition() { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.005))
    }
    return condition()
  }

  private func makeJPEG() -> Data {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2))
    let image = renderer.image { context in
      UIColor.green.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    }
    return image.jpegData(compressionQuality: 0.8)!
  }

  private func assertExactKeys(
    _ event: [String: Any],
    _ expected: Set<String>,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    XCTAssertEqual(Set(event.keys), expected, file: file, line: line)
  }

  private func assertAllowedFailurePayload(
    _ event: [String: Any],
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let allowed = Set([
      "type", "attemptId", "mode", "phase", "httpStatus", "mimeType", "redirectCount",
      "bytesReceived", "firstBytesSignature", "nsUrlErrorCode", "errorCode", "width",
      "height", "elapsedMs",
    ])
    XCTAssertTrue(Set(event.keys).isSubset(of: allowed), file: file, line: line)
    XCTAssertNotNil(event["attemptId"], file: file, line: line)
    XCTAssertNotNil(event["mode"], file: file, line: line)
    XCTAssertNotNil(event["phase"], file: file, line: line)
    XCTAssertNotNil(event["errorCode"], file: file, line: line)
    XCTAssertNotNil(event["elapsedMs"], file: file, line: line)
    assertRedacted(event, file: file, line: line)
  }

  private func assertRedacted(
    _ event: [String: Any],
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    for forbiddenKey in ["url", "headers", "body", "location", "authorization", "token"] {
      XCTAssertNil(event[forbiddenKey], file: file, line: line)
    }
    let description = String(describing: event)
    for forbidden in ["private-value", "camera.test"] {
      XCTAssertFalse(description.lowercased().contains(forbidden), file: file, line: line)
    }
  }
}
