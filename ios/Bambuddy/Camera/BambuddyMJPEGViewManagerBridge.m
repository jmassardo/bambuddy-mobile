#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(IOSMJPEGStreamView, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(streamUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(snapshotUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(attemptId, NSString)
RCT_EXPORT_VIEW_PROPERTY(snapshotFallbackIntervalMs, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(firstFrameTimeoutMs, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onCameraEvent, RCTBubblingEventBlock)

@end
