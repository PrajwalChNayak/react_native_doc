import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Route names and their params. Everything downstream — `navigation.navigate`,
 * `route.params`, the linking config, `useNavigation()` — is typed from these
 * two maps, so a typo in a route name or a missing param is a compile error
 * rather than a runtime crash.
 */
export type TabParamList = {
  Feed: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  /**
   * `NavigatorScreenParams` is what lets you type
   * `navigate('Tabs', { screen: 'Settings' })` correctly.
   */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  PostDetails: { postId: string };
  Profile: { userId: string; highlight?: string };
};

/**
 * Registering the root param list globally makes the untyped helpers
 * (`useNavigation()` with no generic, `createNavigationContainerRef()`) type
 * themselves. Without this they fall back to `ParamListBase` and every route
 * name is accepted.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
