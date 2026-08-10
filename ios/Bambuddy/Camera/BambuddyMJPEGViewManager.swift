import React

@objc(IOSMJPEGStreamView)
final class BambuddyMJPEGViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    BambuddyMJPEGView()
  }
}
