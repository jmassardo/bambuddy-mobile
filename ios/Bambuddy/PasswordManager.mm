#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

static NSString *const LoginActionType = @"org.appextension.find-login-action";

@interface BambuddyPasswordManager : NSObject <RCTBridgeModule>
@end

@implementation BambuddyPasswordManager {
  BOOL _requestPending;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(findLogin:(NSString *)serverUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURLComponents *url = [NSURLComponents componentsWithString:serverUrl];
  if ((![[url.scheme lowercaseString] isEqualToString:@"https"] &&
       ![[url.scheme lowercaseString] isEqualToString:@"http"]) ||
      url.host.length == 0 || url.user.length || url.password.length ||
      url.query.length || url.fragment.length) {
    reject(@"E_INVALID_URL", @"A server URL without embedded credentials is required.", nil);
    return;
  }
  UIViewController *presenter = RCTPresentedViewController();
  if (_requestPending || !presenter || presenter.isBeingDismissed) {
    reject(@"E_PASSWORD_MANAGER_BUSY", @"The password manager cannot be presented now.", nil);
    return;
  }

  // Bitwarden's action-extension protocol supplies website identity explicitly,
  // unlike native text-field hints, which cannot associate a runtime domain.
  NSExtensionItem *request = [NSExtensionItem new];
  request.attachments = @[
    [[NSItemProvider alloc] initWithItem:@{@"url_string": serverUrl}
                        typeIdentifier:LoginActionType]
  ];
  UIActivityViewController *activity =
      [[UIActivityViewController alloc] initWithActivityItems:@[request]
                                     applicationActivities:nil];
  activity.excludedActivityTypes = @[
    UIActivityTypeCopyToPasteboard, UIActivityTypeMail, UIActivityTypeMessage,
    UIActivityTypeAirDrop, UIActivityTypePrint, UIActivityTypeSaveToCameraRoll
  ];
  activity.popoverPresentationController.sourceView = presenter.view;
  activity.popoverPresentationController.sourceRect = CGRectMake(
      CGRectGetMidX(presenter.view.bounds), CGRectGetMidY(presenter.view.bounds), 1, 1);
  _requestPending = YES;
  activity.completionWithItemsHandler =
      ^(UIActivityType type, BOOL completed, NSArray *items, NSError *error) {
    if (error || !completed) {
      self->_requestPending = NO;
      if (error) {
        reject(@"E_PASSWORD_MANAGER", @"The password manager could not return a login.", nil);
      } else {
        resolve(nil);
      }
      return;
    }
    for (id item in items) {
      if (![item isKindOfClass:[NSExtensionItem class]]) {
        continue;
      }
      for (NSItemProvider *provider in ((NSExtensionItem *)item).attachments) {
        if (![provider hasItemConformingToTypeIdentifier:LoginActionType]) {
          continue;
        }
        [provider loadItemForTypeIdentifier:LoginActionType options:nil
                        completionHandler:^(id<NSSecureCoding> value, NSError *loadError) {
          dispatch_async(dispatch_get_main_queue(), ^{
            self->_requestPending = NO;
            if (loadError || ![(id)value isKindOfClass:[NSDictionary class]]) {
              reject(@"E_PASSWORD_MANAGER", @"The password manager returned an invalid login.", nil);
              return;
            }
            NSDictionary *login = (NSDictionary *)value;
            if (![login[@"username"] isKindOfClass:[NSString class]] ||
                ![login[@"password"] isKindOfClass:[NSString class]]) {
              reject(@"E_PASSWORD_MANAGER", @"The password manager returned an invalid login.", nil);
              return;
            }
            resolve(@{@"username": login[@"username"], @"password": login[@"password"]});
          });
        }];
        return;
      }
    }
    self->_requestPending = NO;
    reject(@"E_PASSWORD_MANAGER", @"The password manager did not return a login.", nil);
  };
  [presenter presentViewController:activity animated:YES completion:nil];
}

@end
