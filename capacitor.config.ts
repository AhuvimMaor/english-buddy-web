import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.englishbuddy.app',
  appName: 'English Buddy',
  webDir: 'out',
  server: {
    url: 'https://english-buddy-web-production.up.railway.app',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    scheme: 'English Buddy',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
