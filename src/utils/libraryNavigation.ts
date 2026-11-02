import { StackActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';

export function openLibrary(
  navigation: Pick<NavigationProp<ParamListBase>, 'dispatch'>,
  params: { folderId?: number; fileId?: number; projectId?: number },
) {
  navigation.dispatch(StackActions.popTo('Main', { screen: 'Files', params }));
}
