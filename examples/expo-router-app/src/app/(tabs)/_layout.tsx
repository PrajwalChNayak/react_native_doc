import {Tabs} from 'expo-router';

/** Two tabs. The group name `(tabs)` never appears in a URL. */
export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{title: 'Posts'}} />
      <Tabs.Screen name="settings" options={{title: 'Settings'}} />
    </Tabs>
  );
}
