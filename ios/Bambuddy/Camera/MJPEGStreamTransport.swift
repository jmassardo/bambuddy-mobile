import Foundation
import OSLog
import UIKit

enum CameraTransportError: String {
  case atsBlocked = "ats_blocked"
  case localNetworkDeniedOrUnreachable = "local_network_denied_or_unreachable"
  case tlsFailed = "tls_failed"
  case dnsFailed = "dns_failed"
  case timeout = "timeout"
  case cancelled = "cancelled"
  case redirectBlocked = "redirect_blocked"
  case redirectLimit = "redirect_limit"
  case http401 = "http_401"
  case http403 = "http_403"
  case http404 = "http_404"
  case http5xx = "http_5xx"
  case httpOther = "http_other"
  case mimeInvalid = "mime_invalid"
  case boundaryMissing = "boundary_missing"
  case frameTooLarge = "frame_too_large"
  case bufferLimit = "buffer_limit"
  case jpegInvalid = "jpeg_invalid"
  case decodeFailed = "decode_failed"
  case streamEnded = "stream_ended"
  case nativeUnavailable = "native_unavailable"
}

private final class MJPEGTransportGeneration {
  private let lock = NSLock()
  private var active = true

  func performIfActive(_ action: () -> Void) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard active else { return false }
    action()
    return true
  }

  func invalidate() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard active else { return false }
    active = false
    return true
  }

  var isActive: Bool {
    lock.lock()
    defer { lock.unlock() }
    return active
  }
}

final class MJPEGStreamTransport: NSObject {
  typealias EventHandler = ([String: Any]) -> Void
  typealias ImageHandler = (UIImage) -> Void
  typealias Clock = () -> TimeInterval
  typealias Scheduler = (TimeInterval, @escaping () -> Void) -> Void
  typealias DeliveryScheduler = (@escaping () -> Void) -> Void
  typealias FrameDecoder = (Data) -> UIImage?

  static let minimumDecodeInterval: TimeInterval = 0.2

  private enum RequestKind {
    case snapshotPreflight
    case stream
    case snapshotFallback

    var mode: String {
      switch self {
      case .snapshotPreflight: return "snapshot-preflight"
      case .stream: return "native-mjpeg"
      case .snapshotFallback: return "snapshot-fallback"
      }
    }
  }

  private final class TaskState {
    let kind: RequestKind
    var data = Data()
    var parser: MJPEGStreamParser?
    var bytesReceived = 0
    var signature: String = "empty"
    var signatureBuffer = Data()
    var responseAccepted = false
    var terminalError: CameraTransportError?

    init(kind: RequestKind) {
      self.kind = kind
    }
  }

  private enum IncomingFrameSlot {
    case compressed(id: UInt64, data: Data)
    case decoded(id: UInt64, image: UIImage)

    var id: UInt64 {
      switch self {
      case let .compressed(id, _), let .decoded(id, _): return id
      }
    }
  }

  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "Bambuddy",
    category: "CameraTransport"
  )
  private static let metricsLock = NSLock()
  private static var counters: [String: Int] = [:]
  private static var histograms: [String: (count: Int, total: Int)] = [:]

  private let streamURL: URL
  private let snapshotURL: URL
  private let attemptID: String
  private let fallbackInterval: TimeInterval
  private let firstFrameTimeout: TimeInterval
  private let eventHandler: EventHandler
  private let imageHandler: ImageHandler
  private let clock: Clock
  private let scheduler: Scheduler
  private let deliveryScheduler: DeliveryScheduler
  private let frameDecoder: FrameDecoder
  private let generation = MJPEGTransportGeneration()
  private let startedAt = Date()
  private let delegateQueue: OperationQueue
  private var session: URLSession!
  private var states: [Int: TaskState] = [:]
  private var currentTask: URLSessionDataTask?
  private var timeoutWorkItem: DispatchWorkItem?
  private var fallbackWorkItem: DispatchWorkItem?
  private var snapshotPreflightSucceeded = false
  private var receivedStreamFrame = false
  private var stopped = false
  private var fallbackMode = false
  private var pendingFallbackReason: String?
  private var redirectCounts: [Int: Int] = [:]
  private var frameDecodeWorkItem: DispatchWorkItem?
  private var lastDecodeAttemptTime: TimeInterval?
  private var frameDecodeScheduled = false
  private let incomingFrameLock = NSLock()
  private var incomingFrameSlot: IncomingFrameSlot?
  private var nextIncomingFrameID: UInt64 = 0
  private var maximumIncomingFrameCount = 0
  private var offeredIncomingFrameCount = 0
  private var imageDeliveryScheduled = false

  init(
    streamURL: URL,
    snapshotURL: URL,
    attemptID: String,
    snapshotFallbackIntervalMs: Double,
    firstFrameTimeoutMs: Double,
    configuration: URLSessionConfiguration? = nil,
    clock: @escaping Clock = { ProcessInfo.processInfo.systemUptime },
    scheduler: @escaping Scheduler = { delay, action in
      DispatchQueue.global(qos: .userInitiated).asyncAfter(
        deadline: .now() + delay,
        execute: action
      )
    },
    deliveryScheduler: @escaping DeliveryScheduler = { action in
      DispatchQueue.main.async(execute: action)
    },
    frameDecoder: @escaping FrameDecoder = { UIImage(data: $0) },
    eventHandler: @escaping EventHandler,
    imageHandler: @escaping ImageHandler
  ) {
    self.streamURL = Self.cappedStreamURL(streamURL)
    self.snapshotURL = snapshotURL
    self.attemptID = attemptID
    fallbackInterval = max(snapshotFallbackIntervalMs, 1) / 1_000
    firstFrameTimeout = max(firstFrameTimeoutMs, 1) / 1_000
    self.clock = clock
    self.scheduler = scheduler
    self.deliveryScheduler = deliveryScheduler
    self.frameDecoder = frameDecoder
    self.eventHandler = eventHandler
    self.imageHandler = imageHandler
    delegateQueue = OperationQueue()
    delegateQueue.maxConcurrentOperationCount = 1
    delegateQueue.name = "Bambuddy.CameraTransport"
    super.init()

    let sessionConfiguration = configuration ?? Self.makeEphemeralConfiguration()
    session = URLSession(configuration: sessionConfiguration, delegate: self, delegateQueue: delegateQueue)
  }

  static func makeEphemeralConfiguration() -> URLSessionConfiguration {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    return configuration
  }

  static func cappedStreamURL(_ url: URL) -> URL {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return url
    }
    var items = components.queryItems ?? []
    if let index = items.firstIndex(where: { $0.name.caseInsensitiveCompare("fps") == .orderedSame }) {
      let requested = Int(items[index].value ?? "") ?? 5
      if requested > 5 || requested < 1 {
        items[index].value = "5"
      }
    } else {
      items.append(URLQueryItem(name: "fps", value: "5"))
    }
    components.queryItems = items
    return components.url ?? url
  }

  func start() {
    delegateQueue.addOperation { [weak self] in
      guard let self, self.generation.isActive, !self.stopped, self.currentTask == nil else { return }
      Self.logger.notice("camera.transport.started")
      Self.incrementCounter("camera_stream_attempt_total{snapshot-preflight}")
      self.startRequest(url: self.snapshotURL, kind: .snapshotPreflight)
    }
  }

  func cancel() {
    guard generation.invalidate() else { return }
    clearIncomingFrame()
    delegateQueue.addOperation { [weak self] in
      self?.stop(emitCancellation: true)
    }
  }

  var retainedIncomingFrameCountForTesting: Int {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    return incomingFrameSlot == nil ? 0 : 1
  }

  var maximumRetainedIncomingFrameCountForTesting: Int {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    return maximumIncomingFrameCount
  }

  var offeredIncomingFrameCountForTesting: Int {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    return offeredIncomingFrameCount
  }

  private func startRequest(url: URL, kind: RequestKind) {
    guard !stopped else { return }
    var request = URLRequest(url: url)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = kind == .stream ? max(firstFrameTimeout + 5, 30) : 15
    let task = session.dataTask(with: request)
    states[task.taskIdentifier] = TaskState(kind: kind)
    redirectCounts[task.taskIdentifier] = 0
    currentTask = task
    emit(type: "response", mode: kind.mode, phase: "request")
    task.resume()
  }

  private func startStream() {
    guard !stopped else { return }
    Self.logger.notice("camera.transport.mode_changed")
    emit(type: "mode-changed", mode: RequestKind.stream.mode, phase: "request")
    Self.incrementCounter("camera_stream_attempt_total{native-mjpeg}")
    startRequest(url: streamURL, kind: .stream)
    let workItem = DispatchWorkItem { [weak self] in
      guard let self, !self.stopped, !self.receivedStreamFrame,
            self.states[self.currentTask?.taskIdentifier ?? -1]?.kind == .stream else { return }
      self.emitFailure(.timeout, mode: RequestKind.stream.mode, phase: "timeout")
      self.states[self.currentTask?.taskIdentifier ?? -1]?.terminalError = .timeout
      self.currentTask?.cancel()
    }
    timeoutWorkItem = workItem
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + firstFrameTimeout) { [weak self] in
      self?.delegateQueue.addOperation { workItem.perform() }
    }
  }

  private func enterFallback(reason: String) {
    guard snapshotPreflightSucceeded, !stopped else { return }
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    if states[currentTask?.taskIdentifier ?? -1]?.kind == .stream {
      pendingFallbackReason = reason
      currentTask?.cancel()
      return
    }
    pendingFallbackReason = nil
    if !fallbackMode {
      fallbackMode = true
      Self.logger.notice("camera.transport.mode_changed")
      Self.incrementCounter("camera_stream_fallback_total{\(reason)}")
      emit(type: "mode-changed", mode: RequestKind.snapshotFallback.mode, phase: "request")
    }
    scheduleFallback(after: 0)
  }

  private func scheduleFallback(after delay: TimeInterval? = nil) {
    fallbackWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self, !self.stopped, self.currentTask == nil else { return }
      Self.incrementCounter("camera_stream_attempt_total{snapshot-fallback}")
      self.startRequest(url: self.snapshotURL, kind: .snapshotFallback)
    }
    fallbackWorkItem = workItem
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + (delay ?? fallbackInterval)) {
      self.delegateQueue.addOperation { workItem.perform() }
    }
  }

  private func stop(emitCancellation: Bool) {
    guard !stopped else { return }
    let mode = states[currentTask?.taskIdentifier ?? -1]?.kind.mode ?? RequestKind.stream.mode
    stopped = true
    timeoutWorkItem?.cancel()
    fallbackWorkItem?.cancel()
    frameDecodeWorkItem?.cancel()
    frameDecodeWorkItem = nil
    frameDecodeScheduled = false
    clearIncomingFrame()
    currentTask?.cancel()
    currentTask = nil
    states.removeAll()
    session.invalidateAndCancel()
    if emitCancellation {
      Self.logger.notice("camera.transport.cancelled")
      emitFailure(.cancelled, mode: mode, phase: "request")
    }
  }

  private func emit(
    type: String,
    mode: String,
    phase: String,
    httpStatus: Int? = nil,
    mimeType: String? = nil,
    redirectCount: Int? = nil,
    bytesReceived: Int? = nil,
    signature: String? = nil,
    nsUrlErrorCode: Int? = nil,
    error: CameraTransportError? = nil,
    image: UIImage? = nil
  ) {
    var payload: [String: Any] = [
      "type": type,
      "attemptId": attemptID,
      "mode": mode,
      "phase": phase,
      "elapsedMs": Int(Date().timeIntervalSince(startedAt) * 1_000),
    ]
    if let httpStatus { payload["httpStatus"] = httpStatus }
    if let mimeType { payload["mimeType"] = mimeType }
    if let redirectCount { payload["redirectCount"] = redirectCount }
    if let bytesReceived { payload["bytesReceived"] = bytesReceived }
    if let signature { payload["firstBytesSignature"] = signature }
    if let nsUrlErrorCode { payload["nsUrlErrorCode"] = nsUrlErrorCode }
    if let error { payload["errorCode"] = error.rawValue }
    if let image {
      payload["width"] = Int(image.size.width * image.scale)
      payload["height"] = Int(image.size.height * image.scale)
    }
    DispatchQueue.main.async { [eventHandler] in eventHandler(payload) }
  }

  private func emitFailure(
    _ error: CameraTransportError,
    mode: String,
    phase: String,
    status: Int? = nil,
    mimeType: String? = nil,
    redirectCount: Int? = nil,
    bytesReceived: Int? = nil,
    signature: String? = nil,
    nsUrlErrorCode: Int? = nil
  ) {
    Self.logger.error("camera.transport.failed")
    Self.incrementCounter("camera_stream_failure_total{\(mode),\(error.rawValue)}")
    emit(
      type: "failure",
      mode: mode,
      phase: phase,
      httpStatus: status,
      mimeType: mimeType,
      redirectCount: redirectCount,
      bytesReceived: bytesReceived,
      signature: signature,
      nsUrlErrorCode: nsUrlErrorCode,
      error: error
    )
  }

  private static func incrementCounter(_ name: String) {
    metricsLock.lock()
    counters[name, default: 0] += 1
    metricsLock.unlock()
    logger.notice("\(name)")
  }

  private static func recordFirstFrame(_ milliseconds: Int, mode: String) {
    let name = "camera_stream_first_frame_ms{\(mode)}"
    metricsLock.lock()
    let current = histograms[name] ?? (count: 0, total: 0)
    histograms[name] = (count: current.count + 1, total: current.total + milliseconds)
    metricsLock.unlock()
    logger.notice("\(name)")
  }

  private static func signature(for data: Data) -> String {
    guard !data.isEmpty else { return "empty" }
    if data.count >= 2, data[0] == 0xff, data[1] == 0xd8 { return "jpeg-soi" }
    let prefix = String(data: data.prefix(32), encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased() ?? ""
    if prefix.hasPrefix("--") { return "multipart-boundary" }
    if prefix.hasPrefix("<!doctype html") || prefix.hasPrefix("<html") { return "html" }
    if prefix.hasPrefix("{") || prefix.hasPrefix("[") { return "json" }
    return "other"
  }

  private static func isCompleteJPEG(_ data: Data) -> Bool {
    data.count >= 4
      && data[data.startIndex] == 0xff
      && data[data.index(after: data.startIndex)] == 0xd8
      && data[data.index(data.endIndex, offsetBy: -2)] == 0xff
      && data[data.index(before: data.endIndex)] == 0xd9
  }

  private static func boundary(from contentType: String) -> String? {
    let parts = contentType.split(separator: ";", omittingEmptySubsequences: false)
    guard parts.first?.trimmingCharacters(in: .whitespacesAndNewlines)
      .caseInsensitiveCompare("multipart/x-mixed-replace") == .orderedSame else {
      return nil
    }
    for parameter in parts.dropFirst() {
      let pair = parameter.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      guard pair.count == 2,
            pair[0].trimmingCharacters(in: .whitespacesAndNewlines)
              .caseInsensitiveCompare("boundary") == .orderedSame else {
        continue
      }
      var value = pair[1].trimmingCharacters(in: .whitespacesAndNewlines)
      if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
        value.removeFirst()
        value.removeLast()
      }
      if value.hasPrefix("--") { value.removeFirst(2) }
      return value.isEmpty ? nil : value
    }
    return nil
  }

  private static func httpError(for status: Int) -> CameraTransportError? {
    switch status {
    case 200: return nil
    case 401: return .http401
    case 403: return .http403
    case 404: return .http404
    case 500...599: return .http5xx
    default: return .httpOther
    }
  }

  static func transportError(for error: NSError) -> CameraTransportError {
    switch error.code {
    case NSURLErrorAppTransportSecurityRequiresSecureConnection:
      return .atsBlocked
    case NSURLErrorNotConnectedToInternet, NSURLErrorCannotConnectToHost,
         NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed:
      return .localNetworkDeniedOrUnreachable
    case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateHasBadDate,
         NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasUnknownRoot,
         NSURLErrorServerCertificateNotYetValid, NSURLErrorClientCertificateRejected,
         NSURLErrorClientCertificateRequired:
      return .tlsFailed
    case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
      return .dnsFailed
    case NSURLErrorTimedOut:
      return .timeout
    case NSURLErrorCancelled:
      return .cancelled
    default:
      return .localNetworkDeniedOrUnreachable
    }
  }

  private static func canUseSnapshotFallback(after error: CameraTransportError) -> Bool {
    switch error {
    case .timeout, .mimeInvalid, .boundaryMissing, .frameTooLarge, .bufferLimit,
         .jpegInvalid, .decodeFailed, .streamEnded:
      return true
    case .atsBlocked, .localNetworkDeniedOrUnreachable, .tlsFailed, .dnsFailed,
         .cancelled, .redirectBlocked, .redirectLimit, .http401, .http403,
         .http404, .http5xx, .httpOther, .nativeUnavailable:
      return false
    }
  }

  static func isRedirectAllowed(from source: URL, to destination: URL) -> Bool {
    guard let sourceHost = source.host?.lowercased(),
          let destinationHost = destination.host?.lowercased(),
          sourceHost == destinationHost else {
      return false
    }
    let sourceScheme = source.scheme?.lowercased()
    let destinationScheme = destination.scheme?.lowercased()
    if sourceScheme == destinationScheme {
      return effectivePort(for: source) == effectivePort(for: destination)
    }
    return sourceScheme == "http" && destinationScheme == "https"
  }

  private static func effectivePort(for url: URL) -> Int? {
    if let port = url.port { return port }
    switch url.scheme?.lowercased() {
    case "http": return 80
    case "https": return 443
    default: return nil
    }
  }

  private func finishSnapshot(task: URLSessionTask, state: TaskState) {
    currentTask = nil
    guard Self.isCompleteJPEG(state.data) else {
      emitFailure(
        .jpegInvalid,
        mode: state.kind.mode,
        phase: "parse",
        bytesReceived: state.bytesReceived,
        signature: state.signature
      )
      if state.kind == .snapshotFallback { scheduleFallback() }
      return
    }
    if state.kind == .snapshotFallback, retainedIncomingFrameCountForTesting > 0 {
      scheduleFallback()
      return
    }
    guard let image = decodeSnapshotFrame(state.data) else {
      emitFailure(
        .decodeFailed,
        mode: state.kind.mode,
        phase: "decode",
        bytesReceived: state.bytesReceived,
        signature: state.signature
      )
      if state.kind == .snapshotFallback { scheduleFallback() }
      return
    }
    if state.kind == .snapshotPreflight {
      snapshotPreflightSucceeded = true
      Self.logger.notice("camera.transport.first_frame")
      let elapsed = Int(Date().timeIntervalSince(startedAt) * 1_000)
      Self.recordFirstFrame(elapsed, mode: state.kind.mode)
      emit(
        type: "first-frame",
        mode: state.kind.mode,
        phase: "decode",
        bytesReceived: state.bytesReceived,
        signature: state.signature,
        image: image
      )
      startStream()
    } else {
      Self.logger.notice("camera.transport.first_frame")
      Self.recordFirstFrame(Int(Date().timeIntervalSince(startedAt) * 1_000), mode: state.kind.mode)
      emit(
        type: "first-frame",
        mode: state.kind.mode,
        phase: "decode",
        bytesReceived: state.bytesReceived,
        signature: state.signature,
        image: image
      )
      scheduleFallback()
    }
  }

  private func receiveStreamFrame(_ frame: Data, state: TaskState, dataTask: URLSessionDataTask) {
    guard generation.isActive, reserveIncomingFrame(frame) else { return }
    let now = clock()
    let delay = lastDecodeAttemptTime.map {
      max(0, Self.minimumDecodeInterval - (now - $0))
    } ?? 0
    if delay > 0 {
      schedulePendingDecode(after: delay, state: state, dataTask: dataTask)
    } else {
      decodePendingStreamFrame(state: state, dataTask: dataTask)
    }
  }

  private func schedulePendingDecode(
    after delay: TimeInterval,
    state: TaskState,
    dataTask: URLSessionDataTask
  ) {
    guard !frameDecodeScheduled else { return }
    frameDecodeWorkItem?.cancel()
    frameDecodeScheduled = true
    let workItem = DispatchWorkItem { [weak self, weak dataTask] in
      guard let self, let dataTask, !self.stopped else { return }
      self.frameDecodeWorkItem = nil
      self.frameDecodeScheduled = false
      let remaining = self.lastDecodeAttemptTime.map {
        Self.minimumDecodeInterval - (self.clock() - $0)
      } ?? 0
      if remaining > 0 {
        self.schedulePendingDecode(after: remaining, state: state, dataTask: dataTask)
      } else {
        self.decodePendingStreamFrame(state: state, dataTask: dataTask)
      }
    }
    frameDecodeWorkItem = workItem
    scheduler(delay) { [weak self] in
      self?.delegateQueue.addOperation { workItem.perform() }
    }
  }

  private func decodePendingStreamFrame(
    state: TaskState,
    dataTask: URLSessionDataTask
  ) {
    guard generation.isActive, let (frameID, frame) = compressedIncomingFrame() else { return }
    lastDecodeAttemptTime = clock()
    var decodedImage: UIImage?
    let decoded = generation.performIfActive {
      decodedImage = frameDecoder(frame)
    }
    guard decoded, let image = decodedImage else {
      if generation.isActive {
        clearIncomingFrame(id: frameID)
      }
      guard generation.isActive else { return }
      state.terminalError = .decodeFailed
      emitFailure(
        .decodeFailed,
        mode: state.kind.mode,
        phase: "decode",
        bytesReceived: state.bytesReceived,
        signature: state.signature
      )
      dataTask.cancel()
      return
    }
    guard transitionIncomingFrameToDecoded(image, id: frameID) else { return }
    scheduleImageDelivery()
    if !receivedStreamFrame {
      receivedStreamFrame = true
      timeoutWorkItem?.cancel()
      Self.logger.notice("camera.transport.first_frame")
      let elapsed = Int(Date().timeIntervalSince(startedAt) * 1_000)
      Self.recordFirstFrame(elapsed, mode: state.kind.mode)
      emit(
        type: "first-frame",
        mode: state.kind.mode,
        phase: "decode",
        bytesReceived: state.bytesReceived,
        signature: state.signature,
        image: image
      )
    }
  }

  private func decodeSnapshotFrame(_ data: Data) -> UIImage? {
    guard generation.isActive, reserveIncomingFrame(data),
          let (frameID, frame) = compressedIncomingFrame() else {
      return nil
    }
    lastDecodeAttemptTime = clock()
    var decodedImage: UIImage?
    let decoded = generation.performIfActive {
      decodedImage = frameDecoder(frame)
    }
    guard decoded, let image = decodedImage,
          transitionIncomingFrameToDecoded(image, id: frameID) else {
      clearIncomingFrame(id: frameID)
      return nil
    }
    scheduleImageDelivery()
    return image
  }

  private func reserveIncomingFrame(_ data: Data) -> Bool {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    offeredIncomingFrameCount += 1
    guard incomingFrameSlot == nil else { return false }
    nextIncomingFrameID &+= 1
    incomingFrameSlot = .compressed(id: nextIncomingFrameID, data: data)
    maximumIncomingFrameCount = max(maximumIncomingFrameCount, 1)
    return true
  }

  private func compressedIncomingFrame() -> (UInt64, Data)? {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    guard case let .compressed(id, data) = incomingFrameSlot else { return nil }
    return (id, data)
  }

  private func transitionIncomingFrameToDecoded(_ image: UIImage, id: UInt64) -> Bool {
    guard generation.isActive else { return false }
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    guard incomingFrameSlot?.id == id else { return false }
    incomingFrameSlot = .decoded(id: id, image: image)
    return true
  }

  private func scheduleImageDelivery() {
    incomingFrameLock.lock()
    guard !imageDeliveryScheduled else {
      incomingFrameLock.unlock()
      return
    }
    imageDeliveryScheduled = true
    incomingFrameLock.unlock()

    deliveryScheduler { [weak self] in
      guard let self else { return }
      _ = self.generation.performIfActive {
        self.incomingFrameLock.lock()
        defer { self.incomingFrameLock.unlock() }
        guard case let .decoded(_, image) = self.incomingFrameSlot else {
          self.imageDeliveryScheduled = false
          return
        }
        self.imageHandler(image)
        self.incomingFrameSlot = nil
        self.imageDeliveryScheduled = false
      }
    }
  }

  private func clearIncomingFrame(id: UInt64? = nil) {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    if let id, incomingFrameSlot?.id != id { return }
    incomingFrameSlot = nil
    imageDeliveryScheduled = false
  }

  private func clearCompressedIncomingFrame() {
    incomingFrameLock.lock()
    defer { incomingFrameLock.unlock() }
    guard case .compressed = incomingFrameSlot else { return }
    incomingFrameSlot = nil
  }
}

extension MJPEGStreamTransport: URLSessionDataDelegate, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let source = response.url,
          let destination = request.url,
          let state = states[task.taskIdentifier] else {
      completionHandler(nil)
      return
    }
    let count = (redirectCounts[task.taskIdentifier] ?? 0) + 1
    redirectCounts[task.taskIdentifier] = count
    emit(
      type: "response",
      mode: state.kind.mode,
      phase: "redirect",
      httpStatus: response.statusCode,
      redirectCount: count
    )
    guard count <= 3 else {
      state.terminalError = .redirectLimit
      emitFailure(.redirectLimit, mode: state.kind.mode, phase: "redirect", redirectCount: count)
      completionHandler(nil)
      task.cancel()
      return
    }
    guard Self.isRedirectAllowed(from: source, to: destination) else {
      state.terminalError = .redirectBlocked
      emitFailure(.redirectBlocked, mode: state.kind.mode, phase: "redirect", redirectCount: count)
      completionHandler(nil)
      task.cancel()
      return
    }
    completionHandler(request)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      completionHandler(.performDefaultHandling, nil)
    } else {
      completionHandler(.rejectProtectionSpace, nil)
    }
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let state = states[dataTask.taskIdentifier],
          let response = response as? HTTPURLResponse else {
      completionHandler(.cancel)
      return
    }
    let contentType = response.value(forHTTPHeaderField: "Content-Type") ?? response.mimeType
    let mimeType = response.mimeType?.lowercased()
    let redirectCount = redirectCounts[dataTask.taskIdentifier] ?? 0
    Self.logger.notice("camera.transport.response")
    emit(
      type: "response",
      mode: state.kind.mode,
      phase: "response",
      httpStatus: response.statusCode,
      mimeType: mimeType,
      redirectCount: redirectCount
    )
    if let error = Self.httpError(for: response.statusCode) {
      state.terminalError = error
      emitFailure(
        error,
        mode: state.kind.mode,
        phase: "response",
        status: response.statusCode,
        mimeType: mimeType,
        redirectCount: redirectCount
      )
      completionHandler(.cancel)
      return
    }

    switch state.kind {
    case .snapshotPreflight, .snapshotFallback:
      guard response.mimeType?.caseInsensitiveCompare("image/jpeg") == .orderedSame else {
        state.terminalError = .mimeInvalid
        emitFailure(
          .mimeInvalid,
          mode: state.kind.mode,
          phase: "response",
          status: response.statusCode,
          mimeType: mimeType,
          redirectCount: redirectCount
        )
        completionHandler(.cancel)
        return
      }
    case .stream:
      guard let contentType,
            contentType.split(separator: ";", maxSplits: 1).first?
              .trimmingCharacters(in: .whitespacesAndNewlines)
              .caseInsensitiveCompare("multipart/x-mixed-replace") == .orderedSame else {
        state.terminalError = .mimeInvalid
        emitFailure(
          .mimeInvalid,
          mode: state.kind.mode,
          phase: "response",
          status: response.statusCode,
          mimeType: mimeType,
          redirectCount: redirectCount
        )
        completionHandler(.cancel)
        return
      }
      guard let boundary = Self.boundary(from: contentType),
            let parser = try? MJPEGStreamParser(boundary: boundary) else {
        state.terminalError = .boundaryMissing
        emitFailure(
          .boundaryMissing,
          mode: state.kind.mode,
          phase: "parse",
          status: response.statusCode,
          mimeType: mimeType,
          redirectCount: redirectCount
        )
        completionHandler(.cancel)
        return
      }
      state.parser = parser
    }
    state.responseAccepted = true
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let state = states[dataTask.taskIdentifier], state.responseAccepted else { return }
    state.bytesReceived += data.count
    if state.signatureBuffer.count < 32 {
      state.signatureBuffer.append(data.prefix(32 - state.signatureBuffer.count))
      state.signature = Self.signature(for: state.signatureBuffer)
    }

    switch state.kind {
    case .snapshotPreflight, .snapshotFallback:
      guard state.data.count + data.count <= MJPEGStreamParser.maximumFrameBytes else {
        state.terminalError = .frameTooLarge
        emitFailure(
          .frameTooLarge,
          mode: state.kind.mode,
          phase: "parse",
          bytesReceived: state.bytesReceived,
          signature: state.signature
        )
        dataTask.cancel()
        return
      }
      state.data.append(data)

    case .stream:
      do {
        try state.parser?.append(data) { frame in
          self.receiveStreamFrame(frame, state: state, dataTask: dataTask)
        }
      } catch let parserError as MJPEGStreamParserError {
        let error: CameraTransportError
        switch parserError {
        case .boundaryMissing: error = .boundaryMissing
        case .frameTooLarge: error = .frameTooLarge
        case .bufferLimit, .headerTooLarge: error = .bufferLimit
        case .jpegInvalid: error = .jpegInvalid
        }
        state.terminalError = error
        emitFailure(
          error,
          mode: state.kind.mode,
          phase: "parse",
          bytesReceived: state.bytesReceived,
          signature: state.signature
        )
        dataTask.cancel()
      } catch {
        state.terminalError = .jpegInvalid
        emitFailure(
          .jpegInvalid,
          mode: state.kind.mode,
          phase: "parse",
          bytesReceived: state.bytesReceived,
          signature: state.signature
        )
        dataTask.cancel()
      }
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let state = states.removeValue(forKey: task.taskIdentifier) else { return }
    if state.kind == .stream {
      frameDecodeWorkItem?.cancel()
      frameDecodeWorkItem = nil
      frameDecodeScheduled = false
      clearCompressedIncomingFrame()
    }
    redirectCounts.removeValue(forKey: task.taskIdentifier)
    if currentTask?.taskIdentifier == task.taskIdentifier {
      currentTask = nil
    }
    if stopped { return }

    if let error = error as NSError? {
      let classifiedError = state.terminalError ?? Self.transportError(for: error)
      if error.code != NSURLErrorCancelled {
        emitFailure(
          classifiedError,
          mode: state.kind.mode,
          phase: "request",
          bytesReceived: state.bytesReceived,
          signature: state.signature,
          nsUrlErrorCode: error.code
        )
      }
      if state.kind == .stream,
         snapshotPreflightSucceeded,
         Self.canUseSnapshotFallback(after: classifiedError) {
        enterFallback(reason: classifiedError.rawValue)
      } else if state.kind == .snapshotFallback {
        scheduleFallback()
      }
      return
    }

    switch state.kind {
    case .snapshotPreflight, .snapshotFallback:
      guard state.responseAccepted else { return }
      finishSnapshot(task: task, state: state)
    case .stream:
      let reason: CameraTransportError
      if let terminalError = state.terminalError {
        reason = terminalError
      } else {
        reason = .streamEnded
        emitFailure(
          .streamEnded,
          mode: state.kind.mode,
          phase: "parse",
          bytesReceived: state.bytesReceived,
          signature: state.signature
        )
      }
      if snapshotPreflightSucceeded, Self.canUseSnapshotFallback(after: reason) {
        enterFallback(reason: pendingFallbackReason ?? reason.rawValue)
      }
    }
  }
}
