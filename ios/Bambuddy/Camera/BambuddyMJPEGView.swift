import React
import UIKit

final class BambuddyMJPEGView: UIView {
  @objc var streamUrl: NSString? { didSet { scheduleRestart() } }
  @objc var snapshotUrl: NSString? { didSet { scheduleRestart() } }
  @objc var attemptId: NSString? { didSet { scheduleRestart() } }
  @objc var snapshotFallbackIntervalMs: NSNumber = 2_000 { didSet { scheduleRestart() } }
  @objc var firstFrameTimeoutMs: NSNumber = 15_000 { didSet { scheduleRestart() } }
  @objc var paused: Bool = false { didSet { updatePlayback() } }
  @objc var onCameraEvent: RCTBubblingEventBlock?

  private let imageView = UIImageView()
  private var transport: MJPEGStreamTransport?
  private var restartScheduled = false
  private var applicationIsActive = true
  private var activeConfiguration: String?
  private var reportedInvalidAttempt: String?

  override init(frame: CGRect) {
    super.init(frame: frame)
    imageView.contentMode = .scaleAspectFit
    imageView.clipsToBounds = true
    imageView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(imageView)
    NSLayoutConstraint.activate([
      imageView.leadingAnchor.constraint(equalTo: leadingAnchor),
      imageView.trailingAnchor.constraint(equalTo: trailingAnchor),
      imageView.topAnchor.constraint(equalTo: topAnchor),
      imageView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    applicationIsActive = UIApplication.shared.applicationState == .active
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is unavailable")
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    transport?.cancel()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updatePlayback()
  }

  private func scheduleRestart() {
    guard !restartScheduled else { return }
    restartScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.restartScheduled = false
      self.updatePlayback()
    }
  }

  private func updatePlayback() {
    precondition(Thread.isMainThread)
    guard window != nil, applicationIsActive, !paused else {
      stopTransport()
      return
    }
    guard let streamString = streamUrl as String?,
          let snapshotString = snapshotUrl as String?,
          let attempt = attemptId as String?,
          !attempt.isEmpty else {
      stopTransport()
      return
    }
    guard
          let streamURL = URL(string: streamString),
          let snapshotURL = URL(string: snapshotString),
          let streamScheme = streamURL.scheme?.lowercased(),
          let snapshotScheme = snapshotURL.scheme?.lowercased(),
          ["http", "https"].contains(streamScheme),
          ["http", "https"].contains(snapshotScheme) else {
      stopTransport()
      if reportedInvalidAttempt != attempt {
        reportedInvalidAttempt = attempt
        onCameraEvent?([
          "type": "failure",
          "attemptId": attempt,
          "mode": "native-mjpeg",
          "phase": "request",
          "errorCode": CameraTransportError.nativeUnavailable.rawValue,
          "elapsedMs": 0,
        ])
      }
      return
    }
    reportedInvalidAttempt = nil

    let configuration = [
      streamString,
      snapshotString,
      attempt,
      snapshotFallbackIntervalMs.stringValue,
      firstFrameTimeoutMs.stringValue,
    ].joined(separator: "\u{1f}")
    guard activeConfiguration != configuration else { return }

    stopTransport()
    activeConfiguration = configuration
    let newTransport = MJPEGStreamTransport(
      streamURL: streamURL,
      snapshotURL: snapshotURL,
      attemptID: attempt,
      snapshotFallbackIntervalMs: snapshotFallbackIntervalMs.doubleValue,
      firstFrameTimeoutMs: firstFrameTimeoutMs.doubleValue,
      eventHandler: { [weak self] event in
        self?.onCameraEvent?(event)
      },
      imageHandler: { [weak self] image in
        self?.imageView.image = image
      }
    )
    transport = newTransport
    newTransport.start()
  }

  private func stopTransport() {
    activeConfiguration = nil
    transport?.cancel()
    transport = nil
  }

  @objc private func applicationDidBecomeActive() {
    applicationIsActive = true
    updatePlayback()
  }

  @objc private func applicationDidEnterBackground() {
    applicationIsActive = false
    stopTransport()
  }
}
